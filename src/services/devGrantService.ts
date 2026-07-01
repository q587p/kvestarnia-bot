import { items } from "../content";
import type { CharacterRecord } from "../db/repositories/characterRepository";
import type { DevGrantRepository } from "../db/repositories/devGrantRepository";
import type { ItemGrant, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import { BANDAGE_ITEM_ID, enrichRewardItemGrants, type RewardItemGrant } from "./itemGrant";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { AchievementService, type AchievementUnlock } from "./achievementService";
import { YEGER_RANGER_FREE_BANDAGE_KEY, YEGER_TRACKING_COOLDOWN_KEY } from "./yegerQuestService";
import {
  YEGER_BANDAGE_PURCHASE_CANCEL_KEY,
  YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
  YEGER_BANDAGE_PURCHASE_PREVIEW_KEY
} from "./dailyActionKeys";

export type DevGrantResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | {
      state: "updated";
      kind: "level" | "xp" | "gold" | "heal" | "mana";
      amount: number;
      character: CharacterRecord;
      combat?: {
        kind: "solo-combat" | "party-boss" | "turn-based-duel";
        hpCurrent: number;
        hpMax: number;
      };
      levelChange?: RewardLevelChange;
      achievementUnlocks?: AchievementUnlock[];
    }
  | {
      state: "updated";
      kind: "yeger-bandage-cooldown" | "yeger-tracking-cooldown";
      character: CharacterRecord;
      cleared: boolean;
    }
  | {
      state: "updated";
      kind: "yeger-bandage-day";
      character: CharacterRecord;
      deleted: number;
    };

export type DevGrantItemsResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | {
      state: "updated";
      kind: "items";
      amount: number;
      character: CharacterRecord;
      itemGrants: RewardItemGrant[];
      achievementUnlocks?: AchievementUnlock[];
    };

export class DevGrantService {
  constructor(
    private readonly grants: DevGrantRepository,
    private readonly nodeEnv: string,
    private readonly enabledFlag: boolean,
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly achievements?: AchievementService
  ) {}

  isEnabled(): boolean {
    return this.nodeEnv !== "production" && this.enabledFlag;
  }

  async addLevel(telegramUserId: bigint, amount = 1): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.addLevelForTelegramUser(telegramUserId, amount);

    if (!result) {
      return { state: "no-character" };
    }

    return {
      state: "updated",
      kind: "level",
      amount,
      character: result.character,
      levelChange: result.levelChange,
      achievementUnlocks: await this.trackGrantAchievements({
        characterId: result.character.id,
        sourceKind: "dev.add_level",
        levelChange: result.levelChange
      })
    };
  }

  async addXp(telegramUserId: bigint, amount = 1): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.addXpForTelegramUser(telegramUserId, amount);

    if (!result) {
      return { state: "no-character" };
    }

    return {
      state: "updated",
      kind: "xp",
      amount,
      character: result.character,
      levelChange: result.levelChange,
      achievementUnlocks: await this.trackGrantAchievements({
        characterId: result.character.id,
        sourceKind: "dev.add_xp",
        levelChange: result.levelChange
      })
    };
  }

  async addGold(telegramUserId: bigint, amount = 1): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.addGoldForTelegramUser(telegramUserId, amount);

    return result
      ? {
          state: "updated",
          kind: "gold",
          amount,
          character: result.character
        }
      : { state: "no-character" };
  }

  async heal(telegramUserId: bigint, amount?: number): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.healForTelegramUser(telegramUserId, amount);

    return result
      ? {
          state: "updated",
          kind: "heal",
          amount: amount ?? Math.max(0, result.character.hpMax - result.character.hpCurrent),
          character: result.character,
          ...(result.combat ? { combat: result.combat } : {})
        }
      : { state: "no-character" };
  }

  async restoreMana(telegramUserId: bigint, amount?: number): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.restoreManaForTelegramUser(telegramUserId, amount);

    return result
      ? {
          state: "updated",
          kind: "mana",
          amount: amount ?? Math.max(0, result.character.manaMax - result.character.manaCurrent),
          character: result.character
        }
      : { state: "no-character" };
  }

  async addRandomItems(telegramUserId: bigint, amount = 1): Promise<DevGrantItemsResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const itemGrants = this.pickRandomItemGrants(amount);
    const result = await this.grants.addItemsForTelegramUser(telegramUserId, itemGrants);

    if (!result) {
      return { state: "no-character" };
    }

    return {
      state: "updated",
      kind: "items",
      amount,
      character: result.character,
      itemGrants: enrichRewardItemGrants(result.itemGrants),
      achievementUnlocks: await this.trackGrantAchievements({
        characterId: result.character.id,
        sourceKind: "dev.add_random_item",
        itemGrants: result.itemGrants
      })
    };
  }

  async addBandages(telegramUserId: bigint, amount = 1): Promise<DevGrantItemsResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.addItemsForTelegramUser(telegramUserId, [{
      itemId: BANDAGE_ITEM_ID,
      quantity: amount
    }]);

    if (!result) {
      return { state: "no-character" };
    }

    return {
      state: "updated",
      kind: "items",
      amount,
      character: result.character,
      itemGrants: enrichRewardItemGrants(result.itemGrants),
      achievementUnlocks: await this.trackGrantAchievements({
        characterId: result.character.id,
        sourceKind: "dev.add_bandage",
        itemGrants: result.itemGrants
      })
    };
  }

  async resetYegerBandageCooldown(telegramUserId: bigint): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.clearCooldownForTelegramUser(
      telegramUserId,
      YEGER_RANGER_FREE_BANDAGE_KEY
    );

    return result
      ? {
          state: "updated",
          kind: "yeger-bandage-cooldown",
          character: result.character,
          cleared: result.cleared
        }
        : { state: "no-character" };
  }

  async resetYegerTrackingCooldown(telegramUserId: bigint): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.finishCooldownForTelegramUser(
      telegramUserId,
      YEGER_TRACKING_COOLDOWN_KEY,
      new Date()
    );

    return result
      ? {
          state: "updated",
          kind: "yeger-tracking-cooldown",
          character: result.character,
          cleared: result.cleared
        }
      : { state: "no-character" };
  }

  async resetYegerBandageDay(telegramUserId: bigint): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.deleteDailyActionsForTelegramUser(telegramUserId, [
      YEGER_BANDAGE_PURCHASE_PREVIEW_KEY,
      YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
      YEGER_BANDAGE_PURCHASE_CANCEL_KEY
    ]);

    return result
      ? {
          state: "updated",
          kind: "yeger-bandage-day",
          character: result.character,
          deleted: result.deleted
        }
      : { state: "no-character" };
  }

  private pickRandomItemGrants(amount: number): ItemGrant[] {
    if (items.length === 0) {
      return [];
    }

    const fallback = items[0];

    if (!fallback) {
      return [];
    }

    return Array.from({ length: amount }, () => {
      const item = items[this.rng.nextInt(0, items.length - 1)] ?? fallback;

      return {
        itemId: item.id,
        quantity: 1
      };
    });
  }

  private async trackGrantAchievements(input: {
    characterId: string;
    sourceKind: string;
    levelChange?: RewardLevelChange;
    itemGrants?: readonly ItemGrant[];
  }): Promise<AchievementUnlock[]> {
    if (!this.achievements) {
      return [];
    }

    const occurredAt = new Date();
    const unlocks: AchievementUnlock[] = [];

    if (input.levelChange) {
      unlocks.push(
        ...(await this.achievements.trackEventSafely({
          type: "level.reached",
          characterId: input.characterId,
          level: input.levelChange.newLevel,
          occurredAt,
          sourceId: `${input.sourceKind}:${input.characterId}:${input.levelChange.oldLevel}->${input.levelChange.newLevel}`
        }))
      );
    }

    if (input.itemGrants && input.itemGrants.length > 0) {
      unlocks.push(
        ...(await this.achievements.trackEventSafely({
          type: "item.received",
          characterId: input.characterId,
          itemIds: input.itemGrants.map((grant) => grant.itemId),
          occurredAt,
          sourceId: `${input.sourceKind}:${input.characterId}`
        }))
      );
    }

    const recalculated = await this.achievements.recalculateForCharacter(input.characterId, occurredAt);

    return uniqueAchievementUnlocks([...unlocks, ...recalculated.unlocks]);
  }
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
