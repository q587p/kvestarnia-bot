import { items } from "../content";
import type { ItemContent } from "../content/schema";
import type { ItemUpgradeRepository } from "../db/repositories/itemUpgradeRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  calculateItemUpgradeChance,
  calculateItemUpgradeCosts,
  canAccessItemUpgrades,
  getDonorBonus,
  getItemDisplayNameWithUpgrade,
  getItemUpgradeRequiredLevel,
  getItemUpgradeLevelFromItemId,
  getItemUpgradeUnlockRewardXp,
  getItemUpgradePrimaryStat,
  getLuckFromStats,
  ITEM_UPGRADE_LOCATION_ID,
  isItemUpgradeable,
  isMageClassForItemSelfUpgrade,
  type ItemUpgradeMethod
} from "../domain/itemUpgrades";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import type { PublicActivityEventPublisher } from "./publicActivityEventPublisher";
import { ISKROKAMIN_ITEM_ID } from "./itemGrant";
import { FIELD_KIT_ITEM_ID } from "../domain/itemCraft";

export type ItemUpgradeListResult =
  | { state: "no-character" }
  | { state: "wrong-place"; character: CharacterSummary }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "unlock-required"; character: CharacterSummary; fieldKitQuantity: number; rewardXp: number }
  | {
      state: "ready";
      character: CharacterSummary;
      iskrokamin: number;
      canUseSelfTemper: boolean;
      items: ItemUpgradePresentedItem[];
    };

export interface ItemUpgradePresentedItem {
  itemId: string;
  name: string;
  baseName: string;
  quantity: number;
  enhancementLevel: number;
  equipped: boolean;
  targetLevel: number | null;
  primaryStat: string | null;
}

export interface ItemUpgradeDonorOption {
  itemId: string;
  name: string;
  kind: "same-template" | "same-slot";
  chanceBonus: number;
  iskrokaminDiscount: number;
}

export type ItemUpgradePreviewResult =
  | { state: "no-character" }
  | { state: "wrong-place"; character: CharacterSummary }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "unlock-required"; character: CharacterSummary; fieldKitQuantity: number; rewardXp: number }
  | { state: "not-owned" }
  | { state: "not-upgradeable" }
  | { state: "cap-reached"; item: ItemUpgradePresentedItem }
  | {
      state: "ready";
      character: CharacterSummary;
      item: ItemUpgradePresentedItem;
      method: ItemUpgradeMethod;
      costs: { gold: number; iskrokamin: number; mana: number };
      chance: {
        baseChance: number;
        luckBonus: number;
        pityBonus: number;
        donorBonus: number;
        finalChance: number;
        guaranteed: boolean;
      };
      donor: ItemUpgradeDonorOption | null;
      donorOptions: ItemUpgradeDonorOption[];
      pityFailures: number;
    };

export type ItemUpgradeAttemptServiceResult =
  Awaited<ReturnType<ItemUpgradeRepository["attemptForTelegramUser"]>> & {
    achievementUnlocks?: AchievementUnlock[];
  };

export type ItemUpgradeUnlockServiceResult = Awaited<ReturnType<ItemUpgradeRepository["unlockForTelegramUser"]>>;

export type ItemUpgradeQuestLookupResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "unlock-required"; character: CharacterSummary; fieldKitQuantity: number; rewardXp: number }
  | { state: "ready"; character: CharacterSummary };

export class ItemUpgradeService {
  constructor(
    private readonly repository: ItemUpgradeRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly achievements?: AchievementService,
    private readonly publicActivityEvents?: PublicActivityEventPublisher
  ) {}

  async listForTelegramUser(telegramUserId: bigint): Promise<ItemUpgradeListResult> {
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock());
    if (!snapshot) {
      return { state: "no-character" };
    }
    const gated = getListGate(snapshot);
    if (gated) {
      return gated;
    }

    return {
      state: "ready",
      character: summarizeCharacter(snapshot.character),
      iskrokamin: snapshot.items.find((item) => item.itemId === ISKROKAMIN_ITEM_ID)?.quantity ?? 0,
      canUseSelfTemper: isMageClassForItemSelfUpgrade(snapshot.character.classId),
      items: snapshot.items.flatMap((row) => {
        const content = findItem(row.itemId);
        if (!content || !isItemUpgradeable(content, getItemUpgradeLevelFromItemId(row.itemId))) {
          return [];
        }

        return [presentItem(content, row.itemId, row.quantity, row.equipped)];
      })
    };
  }

  async getUnlockQuestForTelegramUser(telegramUserId: bigint): Promise<ItemUpgradeQuestLookupResult> {
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock());
    if (!snapshot) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(snapshot.character);

    if (!canAccessItemUpgrades(snapshot.character)) {
      return {
        state: "level-locked",
        character,
        requiredLevel: getItemUpgradeRequiredLevel(snapshot.character)
      };
    }

    if (!snapshot.unlocked) {
      return {
        state: "unlock-required",
        character,
        fieldKitQuantity: snapshot.items.find((item) => item.itemId === FIELD_KIT_ITEM_ID)?.quantity ?? 0,
        rewardXp: getItemUpgradeUnlockRewardXp(snapshot.character)
      };
    }

    return { state: "ready", character };
  }

  async previewForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    method: ItemUpgradeMethod = "npc",
    donorItemId?: string | null
  ): Promise<ItemUpgradePreviewResult> {
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock());
    if (!snapshot) {
      return { state: "no-character" };
    }
    const gated = getListGate(snapshot);
    if (gated) {
      return gated;
    }

    const row = snapshot.items.find((item) => item.itemId === itemId);
    if (!row || row.quantity <= 0) {
      return { state: "not-owned" };
    }

    const item = findItem(itemId);
    const level = getItemUpgradeLevelFromItemId(itemId);
    if (!item || !isItemUpgradeable(item, level)) {
      return { state: "not-upgradeable" };
    }

    const presented = presentItem(item, row.itemId, row.quantity, row.equipped);
    if (presented.targetLevel === null) {
      return { state: "cap-reached", item: presented };
    }
    if (method === "self" && !isMageClassForItemSelfUpgrade(snapshot.character.classId)) {
      return { state: "not-upgradeable" };
    }

    const donorOptions = buildDonorOptions(snapshot.items, item, itemId);
    const donor = donorItemId
      ? donorOptions.find((option) => option.itemId === donorItemId) ?? null
      : null;
    const pityFailures = snapshot.pities.find((pity) =>
      pity.itemId === itemId && pity.targetLevel === presented.targetLevel
    )?.failureCount ?? 0;
    const costs = calculateItemUpgradeCosts({
      method,
      targetLevel: presented.targetLevel,
      donor
    });
    const chance = calculateItemUpgradeChance({
      method,
      targetLevel: presented.targetLevel,
      luck: getLuckFromStats(parseStats(snapshot.character.statsJson)),
      pityFailures,
      donor
    });

    return {
      state: "ready",
      character: summarizeCharacter(snapshot.character),
      item: presented,
      method,
      costs,
      chance,
      donor,
      donorOptions,
      pityFailures
    };
  }

  async attemptForTelegramUser(
    telegramUserId: bigint,
    input: {
      itemId: string;
      method?: ItemUpgradeMethod;
      donorItemId?: string | null;
      expectedFromLevel: number;
      expectedQuantity: number;
      expectedPityFailures: number;
    }
  ): Promise<ItemUpgradeAttemptServiceResult> {
    const now = this.clock();
    const result = await this.repository.attemptForTelegramUser(telegramUserId, {
      itemId: input.itemId,
      method: input.method ?? "npc",
      now,
      roll: this.rng.nextFloat(),
      donorItemId: input.donorItemId ?? null,
      expectedFromLevel: input.expectedFromLevel,
      expectedQuantity: input.expectedQuantity,
      expectedPityFailures: input.expectedPityFailures
    });

    if (result.state !== "attempted") {
      return result;
    }

    const sourceId = `${input.method ?? "npc"}:${result.character.id}:${input.itemId}:${result.fromLevel}->${result.targetLevel}`;
    if (result.success) {
      const upgradedItem = findItem(result.item.itemId);
      await this.publicActivityEvents?.recordItemUpgradeSucceededSafely({
        characterId: result.character.id,
        actorDisplayName: result.character.name,
        sourceId,
        itemId: result.item.itemId,
        itemName: upgradedItem
          ? getItemDisplayNameWithUpgrade(upgradedItem, getItemUpgradeLevelFromItemId(result.item.itemId))
          : result.item.itemId,
        targetLevel: result.targetLevel,
        occurredAt: now
      });
    }

    if (!this.achievements) {
      return result;
    }

    const unlocks = await this.achievements.trackEventSafely({
      type: result.success ? "item-upgrade.succeeded" : "item-upgrade.failed",
      characterId: result.character.id,
      occurredAt: now,
      sourceId
    });
    const extraUnlocks = result.success && result.targetLevel >= 5
      ? await this.achievements.trackEventSafely({
          type: "item-upgrade.level-5",
          characterId: result.character.id,
          occurredAt: now,
          sourceId
        })
      : [];

    return {
      ...result,
      achievementUnlocks: uniqueAchievementUnlocks([...unlocks, ...extraUnlocks])
    };
  }

  setPityForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    targetLevel: number,
    failureCount: number
  ) {
    return this.repository.setPityForTelegramUser(telegramUserId, itemId, targetLevel, failureCount, this.clock());
  }

  unlockForTelegramUser(telegramUserId: bigint): Promise<ItemUpgradeUnlockServiceResult> {
    return this.repository.unlockForTelegramUser(telegramUserId, this.clock());
  }
}

function getListGate(snapshot: Awaited<ReturnType<ItemUpgradeRepository["getSnapshotForTelegramUser"]>>): Extract<
  ItemUpgradeListResult,
  { state: "wrong-place" | "level-locked" | "unlock-required" }
> | null {
  if (!snapshot) {
    return null;
  }

  const character = summarizeCharacter(snapshot.character);

  if (snapshot.character.currentLocationId !== ITEM_UPGRADE_LOCATION_ID) {
    return { state: "wrong-place", character };
  }

  if (!canAccessItemUpgrades(snapshot.character)) {
    return {
      state: "level-locked",
      character,
      requiredLevel: getItemUpgradeRequiredLevel(snapshot.character)
    };
  }

  if (!snapshot.unlocked) {
    return {
      state: "unlock-required",
      character,
      fieldKitQuantity: snapshot.items.find((item) => item.itemId === FIELD_KIT_ITEM_ID)?.quantity ?? 0,
      rewardXp: getItemUpgradeUnlockRewardXp(snapshot.character)
    };
  }

  return null;
}

function buildDonorOptions(
  rows: readonly { itemId: string; quantity: number }[],
  item: ItemContent,
  itemId: string
): ItemUpgradeDonorOption[] {
  return rows.flatMap((row) => {
    if (row.itemId === itemId && row.quantity < 2) {
      return [];
    }

    const donorItem = findItem(row.itemId);
    const bonus = donorItem
      ? getDonorBonus({
          baseItem: item,
          baseItemId: itemId,
          donorItem,
          donorItemId: row.itemId
        })
      : null;

    return donorItem && bonus
      ? [{
          itemId: row.itemId,
          name: getItemDisplayNameWithUpgrade(donorItem, getItemUpgradeLevelFromItemId(row.itemId)),
          kind: bonus.kind,
          chanceBonus: bonus.chanceBonus,
          iskrokaminDiscount: bonus.iskrokaminDiscount
        }]
      : [];
  }).sort((left, right) =>
    right.chanceBonus - left.chanceBonus ||
    right.iskrokaminDiscount - left.iskrokaminDiscount ||
    left.name.localeCompare(right.name, "uk")
  );
}

function presentItem(
  content: ItemContent,
  itemId: string,
  quantity: number,
  equipped: boolean
): ItemUpgradePresentedItem {
  const level = getItemUpgradeLevelFromItemId(itemId);

  return {
    itemId,
    name: getItemDisplayNameWithUpgrade(content, level),
    baseName: content.name.replace(/ \+[1-5]$/, ""),
    quantity,
    enhancementLevel: level,
    equipped,
    targetLevel: level >= 5 ? null : level + 1,
    primaryStat: getItemUpgradePrimaryStat(content)
  };
}

function findItem(itemId: string): ItemContent | null {
  return items.find((item) => item.id === itemId) ?? null;
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

function uniqueAchievementUnlocks(unlocks: readonly AchievementUnlock[]): AchievementUnlock[] {
  const seen = new Set<string>();
  const unique: AchievementUnlock[] = [];

  for (const unlock of unlocks) {
    if (seen.has(unlock.id)) {
      continue;
    }
    seen.add(unlock.id);
    unique.push(unlock);
  }

  return unique;
}
