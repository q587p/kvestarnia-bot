import { Prisma, type Character, type DailyAction, type PrismaClient } from "@prisma/client";
import { items } from "../../content";
import {
  calculateItemUpgradeChance,
  calculateItemUpgradeCosts,
  getBaseItemIdForUpgradeVariant,
  getDonorBonus,
  getItemUpgradeLevelFromItemId,
  getLuckFromStats,
  getNextItemUpgradeItemId,
  isItemUpgradeable,
  isMageClassForSparkTemper,
  makeItemUpgradeVariantId,
  MAX_ITEM_ENHANCEMENT_LEVEL,
  normalizeEnhancementLevel
} from "../../domain/itemUpgrades";
import { ISKROKAMIN_ITEM_ID } from "../../services/itemGrant";
import type { CharacterRecord } from "./characterRepository";
import type {
  ItemUpgradeAttemptInput,
  ItemUpgradeAttemptResult,
  ItemUpgradeInventoryRow,
  ItemUpgradeOrderCreateInput,
  ItemUpgradeOrderCreateResult,
  ItemUpgradeOrderRecord,
  ItemUpgradeOrderStatus,
  ItemUpgradeRepository,
  ItemUpgradeSnapshot
} from "./itemUpgradeRepository";

type TxClient = Prisma.TransactionClient;

const ORDER_KEY = "item-upgrade.order";
const PITY_LOCAL_DATE = "persistent";
const PITY_KEY_PREFIX = "item-upgrade.pity:";
const ORDER_KIND = "item-upgrade-order";
const PITY_KIND = "item-upgrade-pity";

interface StoredOrderJson {
  kind: typeof ORDER_KIND;
  token: string;
  itemId: string;
  donorItemId: string | null;
  fromLevel: number;
  targetLevel: number;
  method: "npc" | "self";
  status: ItemUpgradeOrderStatus;
  requiredFightCount: number;
  progressFightCount: number;
  cost: unknown;
  chance: unknown;
  result: unknown;
  expiresAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}

export class PrismaItemUpgradeRepository implements ItemUpgradeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<ItemUpgradeSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }

      const [itemRows, equipment, pities, orderRows] = await Promise.all([
        tx.characterItem.findMany({ where: { characterId: character.id }, orderBy: [{ createdAt: "asc" }] }),
        tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } }),
        tx.dailyAction.findMany({
          where: { characterId: character.id, key: { startsWith: PITY_KEY_PREFIX }, localDate: PITY_LOCAL_DATE }
        }),
        tx.dailyAction.findMany({
          where: { characterId: character.id, key: ORDER_KEY },
          orderBy: [{ createdAt: "desc" }]
        })
      ]);
      const equipped = new Set(equipment.map((row) => row.itemId));

      return {
        character: toCharacterRecord(character),
        items: itemRows.map((row) => toInventoryRow(row, equipped)),
        pities: pities.flatMap(mapPity),
        orders: orderRows
          .map(mapOrder)
          .filter((order): order is ItemUpgradeOrderRecord => order !== null)
          .filter((order) => isActiveOrder(order, now))
      };
    });
  }

  async createNpcOrderForTelegramUser(
    telegramUserId: bigint,
    input: ItemUpgradeOrderCreateInput
  ): Promise<ItemUpgradeOrderCreateResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const [base, equipment] = await Promise.all([
        tx.characterItem.findUnique({ where: { characterId_itemId: { characterId: character.id, itemId: input.itemId } } }),
        tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } })
      ]);
      if (!base) {
        return { state: "not-owned" };
      }

      const itemContent = findItem(input.itemId);
      const fromLevel = getItemUpgradeLevelFromItemId(input.itemId);
      if (!itemContent || !isItemUpgradeable(itemContent, fromLevel)) {
        return { state: "not-upgradeable" };
      }

      if (fromLevel >= MAX_ITEM_ENHANCEMENT_LEVEL) {
        return { state: "cap-reached", item: toInventoryRow(base, new Set(equipment.map((row) => row.itemId))) };
      }
      if (input.fromLevel !== fromLevel || input.targetLevel !== fromLevel + 1) {
        return { state: "not-upgradeable" };
      }

      if (input.donorItemId) {
        const donor = await tx.characterItem.findUnique({
          where: { characterId_itemId: { characterId: character.id, itemId: input.donorItemId } }
        });
        if (!donor || !isValidDonor(base, donor, input.itemId, input.donorItemId)) {
          return { state: "invalid-donor" };
        }
      }

      const activeOrders = await getActiveOrderRows(tx, character.id, input.now);
      for (const active of activeOrders.filter((order) => order.order.itemId === input.itemId)) {
        await updateOrderRow(tx, active.row, {
          ...active.order,
          status: "canceled",
          cancelledAt: input.now,
          updatedAt: input.now
        });
      }

      const order: StoredOrderJson = {
        kind: ORDER_KIND,
        token: input.token,
        itemId: input.itemId,
        donorItemId: input.donorItemId ?? null,
        fromLevel,
        targetLevel: input.targetLevel,
        method: "npc",
        status: input.requiredFightCount > 0 ? "pending" : "ready",
        requiredFightCount: input.requiredFightCount,
        progressFightCount: 0,
        cost: input.cost,
        chance: input.chance,
        result: null,
        expiresAt: input.expiresAt?.toISOString() ?? null,
        completedAt: null,
        cancelledAt: null,
        updatedAt: input.now.toISOString()
      };
      const row = await tx.dailyAction.create({
        data: {
          characterId: character.id,
          key: ORDER_KEY,
          localDate: input.token,
          rewardXp: 0,
          rewardGold: 0,
          spentGold: 0,
          resultJson: order as unknown as Prisma.InputJsonValue
        }
      });
      const mapped = mapOrder(row);
      if (!mapped) {
        throw new Error("Created item upgrade order could not be mapped.");
      }

      return {
        state: "created",
        order: mapped,
        character: toCharacterRecord(character),
        item: toInventoryRow(base, new Set(equipment.map((entry) => entry.itemId)))
      };
    });
  }

  async attemptForTelegramUser(
    telegramUserId: bigint,
    input: ItemUpgradeAttemptInput
  ): Promise<ItemUpgradeAttemptResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const tokenOrder = input.token ? await findOrderByToken(tx, character.id, input.token) : null;
      if (input.token && !tokenOrder) {
        return { state: "stale-order" };
      }

      const itemId = tokenOrder?.order.itemId ?? input.itemId;
      const [base, equipment] = await Promise.all([
        tx.characterItem.findUnique({ where: { characterId_itemId: { characterId: character.id, itemId } } }),
        tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } })
      ]);
      if (!base) {
        return { state: "not-owned" };
      }

      const equipped = new Set(equipment.map((row) => row.itemId));
      const itemContent = findItem(itemId);
      const fromLevel = getItemUpgradeLevelFromItemId(itemId);
      if (!itemContent || !isItemUpgradeable(itemContent, fromLevel)) {
        return { state: "not-upgradeable" };
      }

      if (fromLevel >= MAX_ITEM_ENHANCEMENT_LEVEL) {
        return { state: "cap-reached", item: toInventoryRow(base, equipped) };
      }
      if (input.expectedFromLevel !== undefined && input.expectedFromLevel !== fromLevel) {
        return { state: "stale-item-level", item: toInventoryRow(base, equipped) };
      }
      if (input.expectedQuantity !== undefined && input.expectedQuantity !== base.quantity) {
        return { state: "stale-item-level", item: toInventoryRow(base, equipped) };
      }

      const targetLevel = fromLevel + 1;
      const nextItemId = getNextItemUpgradeItemId(itemId);
      if (!nextItemId || !findItem(nextItemId)) {
        return { state: "not-upgradeable" };
      }

      let order: ItemUpgradeOrderRecord | null = null;
      let orderRow: DailyAction | null = null;
      if (input.method === "npc" && targetLevel >= 2) {
        const activeOrder = tokenOrder ?? (await findLatestActiveOrderForItem(tx, character.id, itemId, input.now));
        if (!activeOrder) {
          return { state: "stale-order" };
        }
        order = activeOrder.order;
        orderRow = activeOrder.row;
        if (order.fromLevel !== fromLevel || order.targetLevel !== targetLevel || order.method !== "npc") {
          return { state: "stale-order", order };
        }
        if (order.status !== "ready") {
          return { state: "order-not-ready", order };
        }
      }

      if (input.method === "self" && !isMageClassForSparkTemper(character.classId)) {
        return { state: "class-not-allowed" };
      }

      const donor = input.donorItemId
        ? await tx.characterItem.findUnique({
            where: { characterId_itemId: { characterId: character.id, itemId: input.donorItemId } }
          })
        : null;
      if (input.donorItemId && (!donor || !isValidDonor(base, donor, itemId, input.donorItemId))) {
        return { state: "invalid-donor" };
      }
      const donorContent = input.donorItemId ? findItem(input.donorItemId) : null;
      const donorBonus = donor && donorContent
        ? getDonorBonus({
            baseItem: itemContent,
            baseItemId: itemId,
            baseEnhancementLevel: fromLevel,
            donorItem: donorContent,
            donorItemId: input.donorItemId!,
            donorEnhancementLevel: getItemUpgradeLevelFromItemId(input.donorItemId!)
          })
        : null;
      if (input.donorItemId && !donorBonus) {
        return { state: "invalid-donor" };
      }

      const pityFailuresBefore = await getPityFailureCount(tx, character.id, itemId, targetLevel);
      if (input.expectedPityFailures !== undefined && input.expectedPityFailures !== pityFailuresBefore) {
        return { state: "stale-item-level", item: toInventoryRow(base, equipped) };
      }
      const chance = calculateItemUpgradeChance({
        method: input.method,
        targetLevel,
        luck: getLuckFromStats(parseStats(character.statsJson)),
        pityFailures: pityFailuresBefore,
        donor: donorBonus
      });
      const costs = calculateItemUpgradeCosts({ method: input.method, targetLevel, donor: donorBonus });
      const iskrokaminRow = await tx.characterItem.findUnique({
        where: { characterId_itemId: { characterId: character.id, itemId: ISKROKAMIN_ITEM_ID } }
      });
      const iskrokaminQuantity = iskrokaminRow?.quantity ?? 0;

      if (character.gold < costs.gold) {
        return { state: "not-enough-gold", required: costs.gold, available: character.gold };
      }
      if (character.manaCurrent < costs.mana) {
        return { state: "not-enough-mana", required: costs.mana, available: character.manaCurrent };
      }
      if (iskrokaminQuantity < costs.iskrokamin) {
        return { state: "not-enough-iskrokamin", required: costs.iskrokamin, available: iskrokaminQuantity };
      }

      const charged = await tx.character.updateMany({
        where: { id: character.id, gold: { gte: costs.gold }, manaCurrent: { gte: costs.mana } },
        data: {
          gold: { decrement: costs.gold },
          manaCurrent: { decrement: costs.mana },
          ...(costs.mana > 0 ? { manaRegenAt: input.now } : {})
        }
      });
      if (charged.count !== 1) {
        return { state: "stale-order", ...(order ? { order } : {}) };
      }

      const spentSpark = await tx.characterItem.updateMany({
        where: { characterId: character.id, itemId: ISKROKAMIN_ITEM_ID, quantity: { gte: costs.iskrokamin } },
        data: { quantity: { decrement: costs.iskrokamin } }
      });
      if (spentSpark.count !== 1) {
        throw new Error("Iskrokamin spend failed after precondition check.");
      }

      let donorConsumed = false;
      if (donor && input.donorItemId) {
        const spentDonor = await tx.characterItem.updateMany({
          where: {
            characterId: character.id,
            itemId: input.donorItemId,
            quantity: { gte: input.donorItemId === itemId ? 2 : 1 }
          },
          data: { quantity: { decrement: 1 } }
        });
        if (spentDonor.count !== 1) {
          throw new Error("Donor spend failed after precondition check.");
        }
        donorConsumed = true;
      }

      const success = chance.guaranteed || input.roll * 100 < chance.finalChance;
      const updatedItemId = success ? nextItemId : itemId;
      if (success) {
        await replaceOneItemId(tx, character.id, itemId, nextItemId);
        await clearPity(tx, character.id, itemId, targetLevel);
      } else {
        await setPity(tx, character.id, itemId, targetLevel, pityFailuresBefore + 1, input.now);
      }

      let updatedOrder = order;
      if (order && orderRow) {
        const updated = await updateOrderRow(tx, orderRow, {
          ...order,
          status: "attempted",
          completedAt: input.now,
          result: {
            success,
            fromLevel,
            targetLevel,
            finalChance: chance.finalChance,
            donorConsumed
          },
          updatedAt: input.now
        });
        updatedOrder = mapOrder(updated);
      }

      await tx.characterItem.deleteMany({
        where: { characterId: character.id, quantity: { lte: 0 } }
      });
      const [updatedCharacter, updatedItem, updatedPity] = await Promise.all([
        tx.character.findUniqueOrThrow({ where: { id: character.id }, include: characterInclude }),
        tx.characterItem.findUniqueOrThrow({
          where: { characterId_itemId: { characterId: character.id, itemId: updatedItemId } }
        }),
        getPityFailureCount(tx, character.id, itemId, targetLevel)
      ]);

      return {
        state: "attempted",
        success,
        character: toCharacterRecord(updatedCharacter),
        item: toInventoryRow(updatedItem, new Set([...equipped].map((entry) => entry === itemId ? updatedItemId : entry))),
        donorConsumed,
        fromLevel,
        targetLevel,
        finalChance: chance.finalChance,
        pityFailuresBefore,
        pityFailuresAfter: success ? 0 : updatedPity,
        pityGuaranteed: chance.guaranteed,
        spent: costs,
        order: updatedOrder
      };
    });
  }

  async incrementReadyFightOrders(characterId: string, now: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const activeOrders = await getActiveOrderRows(tx, characterId, now);
      let updatedCount = 0;

      for (const active of activeOrders.filter((order) => order.order.status === "pending")) {
        const nextProgress = Math.min(active.order.requiredFightCount, active.order.progressFightCount + 1);
        await updateOrderRow(tx, active.row, {
          ...active.order,
          progressFightCount: nextProgress,
          status: nextProgress >= active.order.requiredFightCount ? "ready" : "pending",
          updatedAt: now
        });
        updatedCount += 1;
      }

      return updatedCount;
    });
  }

  async setItemEnhancementForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    level: number
  ): Promise<{ character: CharacterRecord; item: ItemUpgradeInventoryRow } | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }
      const baseItemId = getBaseItemIdForUpgradeVariant(itemId);
      const targetItemId = makeItemUpgradeVariantId(baseItemId, level);
      const owned = await findOwnedVariantRow(tx, character.id, itemId);
      if (!owned || !findItem(targetItemId)) {
        return null;
      }

      await replaceOneItemId(tx, character.id, owned.itemId, targetItemId);
      await tx.characterItem.deleteMany({
        where: { characterId: character.id, quantity: { lte: 0 } }
      });
      const [item, equipment] = await Promise.all([
        tx.characterItem.findUniqueOrThrow({ where: { characterId_itemId: { characterId: character.id, itemId: targetItemId } } }),
        tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } })
      ]);

      return {
        character: toCharacterRecord(character),
        item: toInventoryRow(item, new Set(equipment.map((row) => row.itemId)))
      };
    });
  }

  async setPityForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    targetLevel: number,
    failureCount: number,
    now: Date
  ): Promise<{ character: CharacterRecord; failureCount: number } | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }
      const safeTarget = normalizeEnhancementLevel(targetLevel);
      const safeFailures = Math.max(0, Math.floor(failureCount));
      if (safeFailures === 0) {
        await clearPity(tx, character.id, itemId, safeTarget);
      } else {
        await setPity(tx, character.id, itemId, safeTarget, safeFailures, now);
      }

      return { character: toCharacterRecord(character), failureCount: safeFailures };
    });
  }

  async cancelOrdersForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<{ character: CharacterRecord; canceled: number } | null> {
    return this.updateOrdersForTelegramUser(telegramUserId, "canceled", now);
  }

  async completeOrdersForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<{ character: CharacterRecord; completed: number } | null> {
    const result = await this.updateOrdersForTelegramUser(telegramUserId, "ready", now);

    return result ? { character: result.character, completed: result.canceled } : null;
  }

  private async updateOrdersForTelegramUser(
    telegramUserId: bigint,
    status: "ready" | "canceled",
    now: Date
  ): Promise<{ character: CharacterRecord; canceled: number } | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }
      const activeOrders = await getActiveOrderRows(tx, character.id, now);

      for (const active of activeOrders) {
        await updateOrderRow(tx, active.row, {
          ...active.order,
          status,
          progressFightCount: status === "ready" ? 999 : active.order.progressFightCount,
          cancelledAt: status === "canceled" ? now : active.order.cancelledAt,
          updatedAt: now
        });
      }

      return { character: toCharacterRecord(character), canceled: activeOrders.length };
    });
  }
}

async function replaceOneItemId(
  tx: TxClient,
  characterId: string,
  fromItemId: string,
  toItemId: string
): Promise<void> {
  const removed = await tx.characterItem.updateMany({
    where: { characterId, itemId: fromItemId, quantity: { gte: 1 } },
    data: { quantity: { decrement: 1 } }
  });
  if (removed.count !== 1) {
    throw new Error(`Item upgrade source row disappeared: ${fromItemId}`);
  }

  await tx.characterItem.upsert({
    where: { characterId_itemId: { characterId, itemId: toItemId } },
    create: { characterId, itemId: toItemId, quantity: 1 },
    update: { quantity: { increment: 1 } }
  });
  await tx.characterEquipment.updateMany({
    where: { characterId, itemId: fromItemId },
    data: { itemId: toItemId }
  });
}

async function findOwnedVariantRow(tx: TxClient, characterId: string, itemId: string) {
  const exact = await tx.characterItem.findUnique({
    where: { characterId_itemId: { characterId, itemId } }
  });
  if (exact) {
    return exact;
  }

  const baseItemId = getBaseItemIdForUpgradeVariant(itemId);
  const itemIds = [0, 1, 2, 3, 4, 5].map((level) => makeItemUpgradeVariantId(baseItemId, level));
  return tx.characterItem.findFirst({
    where: { characterId, itemId: { in: itemIds }, quantity: { gt: 0 } },
    orderBy: [{ createdAt: "asc" }]
  });
}

function isValidDonor(
  base: { itemId: string; quantity: number },
  donor: { itemId: string; quantity: number },
  baseItemId: string,
  donorItemId: string
): boolean {
  if (donorItemId === baseItemId && base.quantity < 2) {
    return false;
  }

  const baseContent = findItem(base.itemId);
  const donorContent = findItem(donor.itemId);
  if (!baseContent || !donorContent) {
    return false;
  }

  return Boolean(getDonorBonus({
    baseItem: baseContent,
    baseItemId,
    baseEnhancementLevel: getItemUpgradeLevelFromItemId(base.itemId),
    donorItem: donorContent,
    donorItemId,
    donorEnhancementLevel: getItemUpgradeLevelFromItemId(donor.itemId)
  }));
}

function findItem(itemId: string) {
  return items.find((item) => item.id === itemId) ?? null;
}

function toInventoryRow(
  row: { id: string; characterId: string; itemId: string; quantity: number },
  equippedItemIds: ReadonlySet<string>
): ItemUpgradeInventoryRow {
  return {
    id: row.id,
    characterId: row.characterId,
    itemId: row.itemId,
    quantity: row.quantity,
    enhancementLevel: getItemUpgradeLevelFromItemId(row.itemId),
    equipped: equippedItemIds.has(row.itemId)
  };
}

async function getPityFailureCount(
  tx: TxClient,
  characterId: string,
  itemId: string,
  targetLevel: number
): Promise<number> {
  const row = await tx.dailyAction.findUnique({
    where: {
      characterId_key_localDate: {
        characterId,
        key: pityKey(itemId, targetLevel),
        localDate: PITY_LOCAL_DATE
      }
    }
  });

  return mapPity(row).at(0)?.failureCount ?? 0;
}

async function setPity(
  tx: TxClient,
  characterId: string,
  itemId: string,
  targetLevel: number,
  failureCount: number,
  now: Date
): Promise<void> {
  await tx.dailyAction.upsert({
    where: {
      characterId_key_localDate: {
        characterId,
        key: pityKey(itemId, targetLevel),
        localDate: PITY_LOCAL_DATE
      }
    },
    create: {
      characterId,
      key: pityKey(itemId, targetLevel),
      localDate: PITY_LOCAL_DATE,
      rewardXp: 0,
      rewardGold: 0,
      spentGold: 0,
      resultJson: {
        kind: PITY_KIND,
        itemId,
        targetLevel,
        failureCount,
        lastFailureAt: now.toISOString()
      }
    },
    update: {
      resultJson: {
        kind: PITY_KIND,
        itemId,
        targetLevel,
        failureCount,
        lastFailureAt: now.toISOString()
      }
    }
  });
}

async function clearPity(
  tx: TxClient,
  characterId: string,
  itemId: string,
  targetLevel: number
): Promise<void> {
  await tx.dailyAction.deleteMany({
    where: { characterId, key: pityKey(itemId, targetLevel), localDate: PITY_LOCAL_DATE }
  });
}

function pityKey(itemId: string, targetLevel: number): string {
  return `${PITY_KEY_PREFIX}${itemId}:${normalizeEnhancementLevel(targetLevel)}`;
}

function mapPity(row: Pick<DailyAction, "key" | "resultJson"> | null): Array<{
  itemId: string;
  targetLevel: number;
  failureCount: number;
}> {
  if (!row || !row.key.startsWith(PITY_KEY_PREFIX) || !isRecord(row.resultJson)) {
    return [];
  }

  return row.resultJson.kind === PITY_KIND &&
    typeof row.resultJson.itemId === "string" &&
    typeof row.resultJson.targetLevel === "number" &&
    typeof row.resultJson.failureCount === "number"
    ? [{
        itemId: row.resultJson.itemId,
        targetLevel: normalizeEnhancementLevel(row.resultJson.targetLevel),
        failureCount: Math.max(0, Math.floor(row.resultJson.failureCount))
      }]
    : [];
}

async function findOrderByToken(
  tx: TxClient,
  characterId: string,
  token: string
): Promise<{ row: DailyAction; order: ItemUpgradeOrderRecord } | null> {
  const row = await tx.dailyAction.findUnique({
    where: { characterId_key_localDate: { characterId, key: ORDER_KEY, localDate: token } }
  });
  const order = mapOrder(row);

  return row && order ? { row, order } : null;
}

async function findLatestActiveOrderForItem(
  tx: TxClient,
  characterId: string,
  itemId: string,
  now: Date
): Promise<{ row: DailyAction; order: ItemUpgradeOrderRecord } | null> {
  return (await getActiveOrderRows(tx, characterId, now)).find((active) => active.order.itemId === itemId) ?? null;
}

async function getActiveOrderRows(
  tx: TxClient,
  characterId: string,
  now: Date
): Promise<Array<{ row: DailyAction; order: ItemUpgradeOrderRecord }>> {
  const rows = await tx.dailyAction.findMany({
    where: { characterId, key: ORDER_KEY },
    orderBy: [{ createdAt: "desc" }]
  });

  return rows.flatMap((row) => {
    const order = mapOrder(row);

    return order && isActiveOrder(order, now) ? [{ row, order }] : [];
  });
}

function isActiveOrder(order: ItemUpgradeOrderRecord, now: Date): boolean {
  return (order.status === "pending" || order.status === "ready") &&
    (!order.expiresAt || order.expiresAt.getTime() > now.getTime());
}

async function updateOrderRow(
  tx: TxClient,
  row: DailyAction,
  order: ItemUpgradeOrderRecord & { updatedAt: Date }
): Promise<DailyAction> {
  const payload: StoredOrderJson = {
    kind: ORDER_KIND,
    token: order.token,
    itemId: order.itemId,
    donorItemId: order.donorItemId,
    fromLevel: order.fromLevel,
    targetLevel: order.targetLevel,
    method: order.method,
    status: order.status,
    requiredFightCount: order.requiredFightCount,
    progressFightCount: order.progressFightCount,
    cost: order.cost,
    chance: order.chance,
    result: order.result,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    updatedAt: order.updatedAt.toISOString()
  };

  return tx.dailyAction.update({
    where: { id: row.id },
    data: { resultJson: payload as unknown as Prisma.InputJsonValue }
  });
}

function mapOrder(row: Pick<DailyAction, "id" | "characterId" | "key" | "localDate" | "resultJson" | "createdAt"> | null): ItemUpgradeOrderRecord | null {
  if (!row || row.key !== ORDER_KEY || !isRecord(row.resultJson) || row.resultJson.kind !== ORDER_KIND) {
    return null;
  }

  const token = typeof row.resultJson.token === "string" ? row.resultJson.token : row.localDate;
  const itemId = typeof row.resultJson.itemId === "string" ? row.resultJson.itemId : "";
  const targetLevel = typeof row.resultJson.targetLevel === "number" ? row.resultJson.targetLevel : 0;
  if (!itemId || targetLevel <= 0) {
    return null;
  }

  const updatedAt = parseDate(row.resultJson.updatedAt) ?? row.createdAt;

  return {
    id: row.id,
    token,
    characterId: row.characterId,
    itemId,
    donorItemId: typeof row.resultJson.donorItemId === "string" ? row.resultJson.donorItemId : null,
    fromLevel: typeof row.resultJson.fromLevel === "number" ? row.resultJson.fromLevel : 0,
    targetLevel: normalizeEnhancementLevel(targetLevel),
    method: row.resultJson.method === "self" ? "self" : "npc",
    status: parseStatus(typeof row.resultJson.status === "string" ? row.resultJson.status : "pending"),
    requiredFightCount: numberOrZero(row.resultJson.requiredFightCount),
    progressFightCount: numberOrZero(row.resultJson.progressFightCount),
    cost: row.resultJson.cost,
    chance: row.resultJson.chance,
    result: row.resultJson.result,
    expiresAt: parseDate(row.resultJson.expiresAt),
    completedAt: parseDate(row.resultJson.completedAt),
    cancelledAt: parseDate(row.resultJson.cancelledAt),
    createdAt: row.createdAt,
    updatedAt
  };
}

function parseStatus(status: string): ItemUpgradeOrderStatus {
  return status === "pending" ||
    status === "ready" ||
    status === "attempted" ||
    status === "canceled" ||
    status === "expired"
    ? status
    : "pending";
}

const characterInclude = {
  user: {
    select: {
      lastSeenLocationId: true
    }
  }
} satisfies Prisma.CharacterInclude;

async function findCharacter(
  tx: TxClient,
  telegramUserId: bigint
): Promise<(Character & { user: { lastSeenLocationId: string | null } }) | null> {
  return tx.character.findFirst({
    where: { user: { telegramUserId } },
    include: characterInclude
  });
}

function toCharacterRecord(character: Character & { user: { lastSeenLocationId: string | null } }): CharacterRecord {
  const { user, ...record } = character;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId
  };
}

function parseStats(value: unknown) {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

  return {
    strength: numberOrZero(record.strength),
    dexterity: numberOrZero(record.dexterity),
    intelligence: numberOrZero(record.intelligence),
    charisma: numberOrZero(record.charisma),
    luck: numberOrZero(record.luck)
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
