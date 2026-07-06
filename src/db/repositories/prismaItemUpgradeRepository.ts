import { Prisma, type Character, type PrismaClient } from "@prisma/client";
import { items } from "../../content";
import {
  calculateItemUpgradeChance,
  calculateItemUpgradeCosts,
  getDonorBonus,
  getLuckFromStats,
  isItemUpgradeable,
  isMageClassForSparkTemper,
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

export class PrismaItemUpgradeRepository implements ItemUpgradeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<ItemUpgradeSnapshot | null> {
    void now;
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }

      const [itemsRows, equipment, pities, orders] = await Promise.all([
        tx.characterItem.findMany({ where: { characterId: character.id }, orderBy: [{ createdAt: "asc" }] }),
        tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } }),
        tx.itemUpgradePity.findMany({ where: { characterId: character.id } }),
        tx.itemUpgradeOrder.findMany({
          where: { characterId: character.id, status: { in: ["pending", "ready"] } },
          orderBy: [{ createdAt: "desc" }]
        })
      ]);
      const equipped = new Set(equipment.map((row) => row.itemId));

      return {
        character: toCharacterRecord(character),
        items: itemsRows.map((row) => toInventoryRow(row, equipped)),
        pities: pities.map((row) => ({
          itemId: row.itemId,
          targetLevel: row.targetLevel,
          failureCount: row.failureCount
        })),
        orders: orders.map(mapOrder)
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
      if (!itemContent || !isItemUpgradeable(itemContent, base.enhancementLevel)) {
        return { state: "not-upgradeable" };
      }

      const fromLevel = normalizeEnhancementLevel(base.enhancementLevel);
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

      await tx.itemUpgradeOrder.updateMany({
        where: {
          characterId: character.id,
          itemId: input.itemId,
          status: { in: ["pending", "ready"] }
        },
        data: {
          status: "canceled",
          cancelledAt: input.now,
          updatedAt: input.now
        }
      });

      const row = await tx.itemUpgradeOrder.create({
        data: {
          token: input.token,
          characterId: character.id,
          itemId: input.itemId,
          donorItemId: input.donorItemId ?? null,
          fromLevel,
          targetLevel: input.targetLevel,
          method: "npc",
          status: input.requiredFightCount > 0 ? "pending" : "ready",
          requiredFightCount: input.requiredFightCount,
          progressFightCount: 0,
          costJson: input.cost as Prisma.InputJsonValue,
          chanceJson: input.chance as Prisma.InputJsonValue,
          expiresAt: input.expiresAt ?? null,
          updatedAt: input.now
        }
      });

      return {
        state: "created",
        order: mapOrder(row),
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

      const tokenOrderRow = input.token
        ? await tx.itemUpgradeOrder.findUnique({ where: { token: input.token } })
        : null;
      if (input.token && (!tokenOrderRow || tokenOrderRow.characterId !== character.id)) {
        return { state: "stale-order", ...(tokenOrderRow ? { order: mapOrder(tokenOrderRow) } : {}) };
      }
      const itemId = tokenOrderRow?.itemId ?? input.itemId;

      const [base, equipment] = await Promise.all([
        tx.characterItem.findUnique({ where: { characterId_itemId: { characterId: character.id, itemId } } }),
        tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } })
      ]);
      if (!base) {
        return { state: "not-owned" };
      }

      const equipped = new Set(equipment.map((row) => row.itemId));
      const itemContent = findItem(itemId);
      if (!itemContent || !isItemUpgradeable(itemContent, base.enhancementLevel)) {
        return { state: "not-upgradeable" };
      }

      const fromLevel = normalizeEnhancementLevel(base.enhancementLevel);
      if (fromLevel >= MAX_ITEM_ENHANCEMENT_LEVEL) {
        return { state: "cap-reached", item: toInventoryRow(base, equipped) };
      }
      if (input.expectedFromLevel !== undefined && input.expectedFromLevel !== fromLevel) {
        return { state: "stale-item-level", item: toInventoryRow(base, equipped) };
      }

      const targetLevel = fromLevel + 1;
      let order: ItemUpgradeOrderRecord | null = null;
      if (input.method === "npc" && targetLevel >= 2) {
        const orderRow = input.token
          ? await tx.itemUpgradeOrder.findUnique({ where: { token: input.token } })
          : await tx.itemUpgradeOrder.findFirst({
            where: { characterId: character.id, itemId, status: { in: ["pending", "ready"] } },
              orderBy: [{ createdAt: "desc" }]
            });
        if (!orderRow || orderRow.characterId !== character.id || orderRow.itemId !== itemId) {
          return { state: "stale-order" };
        }
        order = mapOrder(orderRow);
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
            baseEnhancementLevel: base.enhancementLevel,
            donorItem: donorContent,
            donorItemId: input.donorItemId!,
            donorEnhancementLevel: donor.enhancementLevel
          })
        : null;
      if (input.donorItemId && !donorBonus) {
        return { state: "invalid-donor" };
      }

      const pity = await tx.itemUpgradePity.findUnique({
        where: {
          characterId_itemId_targetLevel: {
            characterId: character.id,
            itemId,
            targetLevel
          }
        }
      });
      const pityFailuresBefore = Math.max(0, pity?.failureCount ?? 0);
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
      if (success) {
        await tx.characterItem.update({
          where: { characterId_itemId: { characterId: character.id, itemId } },
          data: { enhancementLevel: targetLevel }
        });
        await tx.itemUpgradePity.deleteMany({
          where: { characterId: character.id, itemId, targetLevel }
        });
      } else {
        await tx.itemUpgradePity.upsert({
          where: {
            characterId_itemId_targetLevel: {
              characterId: character.id,
              itemId,
              targetLevel
            }
          },
          create: {
            characterId: character.id,
            itemId,
            targetLevel,
            failureCount: 1,
            lastFailureAt: input.now
          },
          update: {
            failureCount: { increment: 1 },
            lastFailureAt: input.now
          }
        });
      }

      let updatedOrder = order;
      if (order) {
        const row = await tx.itemUpgradeOrder.update({
          where: { id: order.id },
          data: {
            status: "attempted",
            completedAt: input.now,
            resultJson: {
              success,
              fromLevel,
              targetLevel,
              finalChance: chance.finalChance,
              donorConsumed
            },
            updatedAt: input.now
          }
        });
        updatedOrder = mapOrder(row);
      }

      await tx.characterItem.deleteMany({
        where: { characterId: character.id, quantity: { lte: 0 } }
      });
      const [updatedCharacter, updatedItem, updatedPity] = await Promise.all([
        tx.character.findUniqueOrThrow({ where: { id: character.id }, include: characterInclude }),
        tx.characterItem.findUniqueOrThrow({ where: { characterId_itemId: { characterId: character.id, itemId } } }),
        tx.itemUpgradePity.findUnique({
          where: {
            characterId_itemId_targetLevel: {
              characterId: character.id,
              itemId,
              targetLevel
            }
          }
        })
      ]);

      return {
        state: "attempted",
        success,
        character: toCharacterRecord(updatedCharacter),
        item: toInventoryRow(updatedItem, equipped),
        donorConsumed,
        fromLevel,
        targetLevel,
        finalChance: chance.finalChance,
        pityFailuresBefore,
        pityFailuresAfter: success ? 0 : updatedPity?.failureCount ?? pityFailuresBefore + 1,
        pityGuaranteed: chance.guaranteed,
        spent: costs,
        order: updatedOrder
      };
    });
  }

  async incrementReadyFightOrders(characterId: string, now: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const orders = await tx.itemUpgradeOrder.findMany({
        where: {
          characterId,
          status: "pending"
        },
        select: {
          id: true,
          requiredFightCount: true,
          progressFightCount: true
        }
      });
      let updatedCount = 0;

      for (const order of orders) {
        const nextProgress = Math.min(order.requiredFightCount, order.progressFightCount + 1);
        await tx.itemUpgradeOrder.update({
          where: { id: order.id },
          data: {
            progressFightCount: nextProgress,
            status: nextProgress >= order.requiredFightCount ? "ready" : "pending",
            updatedAt: now
          }
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
      const updated = await tx.characterItem.updateMany({
        where: { characterId: character.id, itemId },
        data: { enhancementLevel: normalizeEnhancementLevel(level) }
      });
      if (updated.count !== 1) {
        return null;
      }
      const [item, equipment] = await Promise.all([
        tx.characterItem.findUniqueOrThrow({ where: { characterId_itemId: { characterId: character.id, itemId } } }),
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
      const safeFailures = Math.max(0, Math.floor(failureCount));
      if (safeFailures === 0) {
        await tx.itemUpgradePity.deleteMany({ where: { characterId: character.id, itemId, targetLevel } });
      } else {
        await tx.itemUpgradePity.upsert({
          where: { characterId_itemId_targetLevel: { characterId: character.id, itemId, targetLevel } },
          create: {
            characterId: character.id,
            itemId,
            targetLevel,
            failureCount: safeFailures,
            lastFailureAt: now
          },
          update: {
            failureCount: safeFailures,
            lastFailureAt: now
          }
        });
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
      const updated = await tx.itemUpgradeOrder.updateMany({
        where: { characterId: character.id, status: { in: ["pending", "ready"] } },
        data: {
          status,
          ...(status === "ready" ? { progressFightCount: 999 } : { cancelledAt: now }),
          updatedAt: now
        }
      });

      return { character: toCharacterRecord(character), canceled: updated.count };
    });
  }
}

function isValidDonor(
  base: { itemId: string; quantity: number; enhancementLevel: number },
  donor: { itemId: string; quantity: number; enhancementLevel: number },
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
    baseEnhancementLevel: base.enhancementLevel,
    donorItem: donorContent,
    donorItemId,
    donorEnhancementLevel: donor.enhancementLevel
  }));
}

function findItem(itemId: string) {
  return items.find((item) => item.id === itemId) ?? null;
}

function toInventoryRow(
  row: { id: string; characterId: string; itemId: string; quantity: number; enhancementLevel: number },
  equippedItemIds: ReadonlySet<string>
): ItemUpgradeInventoryRow {
  return {
    id: row.id,
    characterId: row.characterId,
    itemId: row.itemId,
    quantity: row.quantity,
    enhancementLevel: normalizeEnhancementLevel(row.enhancementLevel),
    equipped: equippedItemIds.has(row.itemId)
  };
}

function mapOrder(row: {
  id: string;
  token: string;
  characterId: string;
  itemId: string;
  donorItemId: string | null;
  fromLevel: number;
  targetLevel: number;
  method: string;
  status: string;
  requiredFightCount: number;
  progressFightCount: number;
  costJson: unknown;
  chanceJson: unknown;
  resultJson: unknown;
  expiresAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ItemUpgradeOrderRecord {
  return {
    id: row.id,
    token: row.token,
    characterId: row.characterId,
    itemId: row.itemId,
    donorItemId: row.donorItemId,
    fromLevel: row.fromLevel,
    targetLevel: row.targetLevel,
    method: row.method === "self" ? "self" : "npc",
    status: parseStatus(row.status),
    requiredFightCount: Math.max(0, row.requiredFightCount),
    progressFightCount: Math.max(0, row.progressFightCount),
    cost: row.costJson,
    chance: row.chanceJson,
    result: row.resultJson,
    expiresAt: row.expiresAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
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
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
