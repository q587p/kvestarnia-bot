import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";

export interface LevelBarterSnapshot {
  character: CharacterRecord;
  items: CharacterItemRecord[];
  equippedItemIds: string[];
}

export interface LevelBarterExchangePlan {
  token: string;
  items: Array<{ itemId: string; quantity: number }>;
  goldSpent: number;
  levelBefore: number;
  levelAfter: number;
  xpBefore: number;
  xpAfter: number;
  xpCarry: number;
  itemTotalValue: number;
  selectedTotalValue: number;
  overpay: number;
}

export type LevelBarterPlanResult =
  | { state: "ready"; plan: LevelBarterExchangePlan }
  | { state: "battle-only-level"; level: number }
  | { state: "insufficient"; eligibleTotalValue: number; gold: number }
  | { state: "token-mismatch" };

export type LevelBarterConfirmRepositoryResult =
  | { state: "no-character" }
  | { state: "battle-only-level"; level: number }
  | { state: "insufficient"; eligibleTotalValue: number; gold: number }
  | { state: "stale-selection" }
  | { state: "exchanged"; character: CharacterRecord; plan: LevelBarterExchangePlan }
  | { state: "replayed"; character: CharacterRecord; plan: LevelBarterExchangePlan };

export interface LevelBarterRepository {
  getSnapshotForTelegramUser(telegramUserId: bigint): Promise<LevelBarterSnapshot | null>;
  confirmAutoExchangeForTelegramUser(
    telegramUserId: bigint,
    input: {
      expectedToken: string;
      now: Date;
      createPlan: (snapshot: LevelBarterSnapshot) => LevelBarterPlanResult;
    }
  ): Promise<LevelBarterConfirmRepositoryResult>;
}
