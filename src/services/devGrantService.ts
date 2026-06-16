import { items } from "../content";
import type { CharacterRecord } from "../db/repositories/characterRepository";
import type { DevGrantRepository } from "../db/repositories/devGrantRepository";
import type { ItemGrant, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import { enrichRewardItemGrants, type RewardItemGrant } from "./itemGrant";
import { CryptoRandomSource, type RandomSource } from "../shared/random";

export type DevGrantResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | {
      state: "updated";
      kind: "level" | "xp" | "gold";
      amount: number;
      character: CharacterRecord;
      levelChange?: RewardLevelChange;
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
    private readonly rng: RandomSource = new CryptoRandomSource()
  ) {}

  isEnabled(): boolean {
    return this.nodeEnv !== "production";
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
