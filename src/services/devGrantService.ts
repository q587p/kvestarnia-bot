import { items } from "../content";
import type { CharacterRecord } from "../db/repositories/characterRepository";
import type { DevGrantRepository } from "../db/repositories/devGrantRepository";
import type { ItemGrant, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import { enrichRewardItemGrants, type RewardItemGrant } from "./itemGrant";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { YEGER_RANGER_FREE_BANDAGE_KEY, YEGER_TRACKING_COOLDOWN_KEY } from "./yegerQuestService";

export type DevGrantResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | {
      state: "updated";
      kind: "level" | "xp" | "gold" | "heal" | "mana";
      amount: number;
      character: CharacterRecord;
      levelChange?: RewardLevelChange;
    }
  | {
      state: "updated";
      kind: "yeger-bandage-cooldown" | "yeger-tracking-cooldown";
      character: CharacterRecord;
      cleared: boolean;
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
    };

export class DevGrantService {
  constructor(
    private readonly grants: DevGrantRepository,
    private readonly nodeEnv: string,
    private readonly enabledFlag: boolean,
    private readonly rng: RandomSource = new CryptoRandomSource()
  ) {}

  isEnabled(): boolean {
    return this.nodeEnv !== "production" && this.enabledFlag;
  }

  async addLevel(telegramUserId: bigint, amount = 1): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.addLevelForTelegramUser(telegramUserId, amount);

    return result
      ? {
          state: "updated",
          kind: "level",
          amount,
          character: result.character,
          levelChange: result.levelChange
        }
      : { state: "no-character" };
  }

  async addXp(telegramUserId: bigint, amount = 1): Promise<DevGrantResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const result = await this.grants.addXpForTelegramUser(telegramUserId, amount);

    return result
      ? {
          state: "updated",
          kind: "xp",
          amount,
          character: result.character,
          levelChange: result.levelChange
        }
      : { state: "no-character" };
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
          character: result.character
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

    return result
      ? {
          state: "updated",
          kind: "items",
          amount,
          character: result.character,
          itemGrants: enrichRewardItemGrants(result.itemGrants)
        }
      : { state: "no-character" };
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
}
