import { Prisma, type Character, type DailyAction, type PrismaClient } from "@prisma/client";
import { items } from "../../content";
import {
  calculateItemUpgradeChance,
  calculateItemUpgradeCosts,
  getDonorBonus,
  getItemUpgradeLevelFromItemId,
  getLuckFromStats,
  getNextItemUpgradeItemId,
  isItemUpgradeable,
  isMageClassForItemSelfUpgrade,
  MAX_ITEM_UPGRADE_LEVEL,
  normalizeItemUpgradeLevel
} from "../../domain/itemUpgrades";
import { ISKROKAMIN_ITEM_ID } from "../../services/itemGrant";
import type { CharacterRecord } from "./characterRepository";
import type {
  ItemUpgradeAttemptInput,
  ItemUpgradeAttemptResult,
  ItemUpgradeInventoryRow,
  ItemUpgradeRepository,
  ItemUpgradeSnapshot
} from "./itemUpgradeRepository";

type TxClient = Prisma.TransactionClient;

const PITY_LOCAL_DATE = "persistent";
const PITY_KEY_PREFIX = "item-upgrade.pity:";
const PITY_KIND = "item-upgrade-pity";

export class PrismaItemUpgradeRepository implements ItemUpgradeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(telegramUserId: bigint): Promise<ItemUpgradeSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }

      const [itemRows, equipment, pities] = await Promise.all([
        tx.characterItem.findMany({ where: { characterId: character.id }, orderBy: [{ createdAt: "asc" }] }),
        tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } }),
        tx.dailyAction.findMany({
          where: { characterId: character.id, key: { startsWith: PITY_KEY_PREFIX }, localDate: PITY_LOCAL_DATE }
        })
      ]);
      const equipped = new Set(equipment.map((row) => row.itemId));

      return {
        character: toCharacterRecord(character),
        items: itemRows.map((row) => toInventoryRow(row, equipped)),
        pities: pities.flatMap(mapPity)
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

      const [base, equipment] = await Promise.all([
        tx.characterItem.findUnique({
          where: { characterId_itemId: { characterId: character.id, itemId: input.itemId } }
        }),
        tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } })
      ]);
      const equipped = new Set(equipment.map((row) => row.itemId));
      if (!base || base.quantity <= 0) {
        return { state: "not-owned" };
      }

      const itemContent = findItem(input.itemId);
      const fromLevel = getItemUpgradeLevelFromItemId(input.itemId);
      if (!itemContent || !isItemUpgradeable(itemContent, fromLevel)) {
        return { state: "not-upgradeable" };
      }

      if (fromLevel >= MAX_ITEM_UPGRADE_LEVEL) {
        return { state: "cap-reached", item: toInventoryRow(base, equipped) };
      }

      if (input.expectedFromLevel !== fromLevel || input.expectedQuantity !== base.quantity) {
        return { state: "stale-snapshot", item: toInventoryRow(base, equipped) };
      }

      const targetLevel = fromLevel + 1;
      const nextItemId = getNextItemUpgradeItemId(input.itemId);
      if (!nextItemId || !findItem(nextItemId)) {
        return { state: "not-upgradeable" };
      }

      if (input.method === "self" && !isMageClassForItemSelfUpgrade(character.classId)) {
        return { state: "class-not-allowed" };
      }

      const pityFailuresBefore = await getPityFailureCount(tx, character.id, input.itemId, targetLevel);
      if (input.expectedPityFailures !== pityFailuresBefore) {
        return { state: "stale-snapshot", item: toInventoryRow(base, equipped) };
      }

      const donor = input.donorItemId
        ? await tx.characterItem.findUnique({
            where: { characterId_itemId: { characterId: character.id, itemId: input.donorItemId } }
          })
        : null;
      if (input.donorItemId && (!donor || donor.quantity <= 0 || !isValidDonor(base, donor, input.itemId, input.donorItemId))) {
        return { state: "invalid-donor" };
      }
      const donorContent = input.donorItemId ? findItem(input.donorItemId) : null;
      const donorBonus = donor && donorContent
        ? getDonorBonus({
            baseItem: itemContent,
            baseItemId: input.itemId,
            donorItem: donorContent,
            donorItemId: input.donorItemId!
          })
        : null;
      if (input.donorItemId && !donorBonus) {
        return { state: "invalid-donor" };
      }

      const chance = calculateItemUpgradeChance({
        method: input.method,
        targetLevel,
        luck: getLuckFromStats(parseStats(character.statsJson)),
        pityFailures: pityFailuresBefore,
        donor: donorBonus
      });
      const spent = calculateItemUpgradeCosts({ method: input.method, targetLevel, donor: donorBonus });
      const iskrokaminRow = await tx.characterItem.findUnique({
        where: { characterId_itemId: { characterId: character.id, itemId: ISKROKAMIN_ITEM_ID } }
      });
      const iskrokaminQuantity = iskrokaminRow?.quantity ?? 0;

      if (character.gold < spent.gold) {
        return { state: "not-enough-gold", required: spent.gold, available: character.gold };
      }
      if (character.manaCurrent < spent.mana) {
        return { state: "not-enough-mana", required: spent.mana, available: character.manaCurrent };
      }
      if (iskrokaminQuantity < spent.iskrokamin) {
        return { state: "not-enough-iskrokamin", required: spent.iskrokamin, available: iskrokaminQuantity };
      }

      const charged = await tx.character.updateMany({
        where: { id: character.id, gold: { gte: spent.gold }, manaCurrent: { gte: spent.mana } },
        data: {
          gold: { decrement: spent.gold },
          manaCurrent: { decrement: spent.mana },
          ...(spent.mana > 0 ? { manaRegenAt: input.now } : {})
        }
      });
      if (charged.count !== 1) {
        return { state: "stale-snapshot", item: toInventoryRow(base, equipped) };
      }

      const spentSpark = await tx.characterItem.updateMany({
        where: { characterId: character.id, itemId: ISKROKAMIN_ITEM_ID, quantity: { gte: spent.iskrokamin } },
        data: { quantity: { decrement: spent.iskrokamin } }
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
            quantity: { gte: input.donorItemId === input.itemId ? 2 : 1 }
          },
          data: { quantity: { decrement: 1 } }
        });
        if (spentDonor.count !== 1) {
          throw new Error("Donor spend failed after precondition check.");
        }
        donorConsumed = true;
      }

      const success = chance.guaranteed || input.roll * 100 < chance.finalChance;
      const updatedItemId = success ? nextItemId : input.itemId;
      if (success) {
        await replaceOneItemId(tx, character.id, input.itemId, nextItemId);
        await clearPity(tx, character.id, input.itemId, targetLevel);
      } else {
        await setPity(tx, character.id, input.itemId, targetLevel, pityFailuresBefore + 1, input.now);
      }

      await tx.characterItem.deleteMany({ where: { characterId: character.id, quantity: { lte: 0 } } });
      const [updatedCharacter, updatedItem, updatedPity] = await Promise.all([
        tx.character.findUniqueOrThrow({ where: { id: character.id }, include: characterInclude }),
        tx.characterItem.findUniqueOrThrow({
          where: { characterId_itemId: { characterId: character.id, itemId: updatedItemId } }
        }),
        getPityFailureCount(tx, character.id, input.itemId, targetLevel)
      ]);

      return {
        state: "attempted",
        success,
        character: toCharacterRecord(updatedCharacter),
        item: toInventoryRow(updatedItem, new Set([...equipped].map((itemId) => itemId === input.itemId ? updatedItemId : itemId))),
        donorConsumed,
        fromLevel,
        targetLevel,
        finalChance: chance.finalChance,
        pityFailuresBefore,
        pityFailuresAfter: success ? 0 : updatedPity,
        pityGuaranteed: chance.guaranteed,
        spent
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
        await clearPity(tx, character.id, itemId, targetLevel);
      } else {
        await setPity(tx, character.id, itemId, targetLevel, safeFailures, now);
      }

      return { character: toCharacterRecord(character), failureCount: safeFailures };
    });
  }
}

async function replaceOneItemId(tx: TxClient, characterId: string, fromItemId: string, toItemId: string): Promise<void> {
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

  return Boolean(baseContent && donorContent && getDonorBonus({
    baseItem: baseContent,
    baseItemId,
    donorItem: donorContent,
    donorItemId
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

async function clearPity(tx: TxClient, characterId: string, itemId: string, targetLevel: number): Promise<void> {
  await tx.dailyAction.deleteMany({
    where: { characterId, key: pityKey(itemId, targetLevel), localDate: PITY_LOCAL_DATE }
  });
}

function pityKey(itemId: string, targetLevel: number): string {
  return `${PITY_KEY_PREFIX}${itemId}:${normalizeItemUpgradeLevel(targetLevel)}`;
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
        targetLevel: normalizeItemUpgradeLevel(row.resultJson.targetLevel),
        failureCount: Math.max(0, Math.floor(row.resultJson.failureCount))
      }]
    : [];
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
