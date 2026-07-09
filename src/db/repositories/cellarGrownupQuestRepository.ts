import type { CharacterRecord } from "./characterRepository";
import type { DailyActionRecord, ItemGrant, RewardLevelChange } from "./dailyActionRepository";

export interface CellarGrownupQuestRepositoryKeys {
  sealPurchaseKey: string;
  completionKey: string;
  onceLocalDate: string;
  roleplayCooldownKey: string;
  cheeseSealItemId: string;
  bottleItemId: string;
}

export interface CellarGrownupQuestSnapshot {
  character: CharacterRecord;
  completedAction: DailyActionRecord | null;
  roleplayCooldown: {
    availableAt: Date;
  } | null;
  cheeseSealQuantity: number;
  bottleQuantity: number;
}

export type BuyCellarCheeseSealResult =
  | { state: "no-character" }
  | { state: "already-completed"; snapshot: CellarGrownupQuestSnapshot }
  | { state: "already-owned"; snapshot: CellarGrownupQuestSnapshot }
  | { state: "insufficient"; snapshot: CellarGrownupQuestSnapshot; price: number }
  | { state: "purchased"; snapshot: CellarGrownupQuestSnapshot; price: number };

export type CellarGrownupFinalEnding = "turn-in" | "keep";

export type CompleteCellarGrownupQuestResult =
  | { state: "no-character" }
  | {
      state: "already-completed";
      snapshot: CellarGrownupQuestSnapshot;
      ending: CellarGrownupFinalEnding;
    }
  | { state: "missing-bottle"; snapshot: CellarGrownupQuestSnapshot }
  | {
      state: "completed";
      snapshot: CellarGrownupQuestSnapshot;
      ending: CellarGrownupFinalEnding;
      levelChange: RewardLevelChange;
      itemGrants: ItemGrant[];
    };

export interface CellarGrownupQuestRepository {
  getSnapshotForTelegramUser(
    telegramUserId: bigint,
    keys: CellarGrownupQuestRepositoryKeys
  ): Promise<CellarGrownupQuestSnapshot | null>;

  buyCheeseSealForTelegramUser(
    telegramUserId: bigint,
    input: {
      keys: CellarGrownupQuestRepositoryKeys;
      price: number;
      now: Date;
    }
  ): Promise<BuyCellarCheeseSealResult>;

  completeWithBottleForTelegramUser(
    telegramUserId: bigint,
    input: {
      keys: CellarGrownupQuestRepositoryKeys;
      ending: CellarGrownupFinalEnding;
      rewardXp: number;
      rewardGold: number;
      now: Date;
    }
  ): Promise<CompleteCellarGrownupQuestResult>;
}
