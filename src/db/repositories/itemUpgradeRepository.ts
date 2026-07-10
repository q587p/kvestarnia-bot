import type { CharacterRecord } from "./characterRepository";
import type { DailyActionRecord, ItemGrant, RewardLevelChange } from "./dailyActionRepository";

export type ItemUpgradeMethod = "npc" | "self";

export interface ItemUpgradeInventoryRow {
  id: string;
  characterId: string;
  itemId: string;
  quantity: number;
  equipped: boolean;
  createdAt?: Date;
}

export interface ItemUpgradeSnapshot {
  character: CharacterRecord;
  items: ItemUpgradeInventoryRow[];
  pities: Array<{ itemId: string; targetLevel: number; failureCount: number }>;
  unlocked: boolean;
}

export interface ItemUpgradeQuestSnapshot {
  character: CharacterRecord;
  fieldKitQuantity: number;
  unlocked: boolean;
}

export interface ItemUpgradeAttemptInput {
  itemId: string;
  donorItemId?: string | null;
  method: ItemUpgradeMethod;
  now: Date;
  roll: number;
  attemptGuard?: string | null;
  expectedFromLevel: number;
  expectedQuantity: number;
  expectedPityFailures: number;
}

export type ItemUpgradeAttemptResult =
  | { state: "no-character" }
  | { state: "wrong-place"; character: CharacterRecord }
  | { state: "level-locked"; character: CharacterRecord; requiredLevel: number }
  | { state: "unlock-required"; character: CharacterRecord; fieldKitQuantity: number }
  | { state: "not-owned" }
  | { state: "not-upgradeable" }
  | { state: "cap-reached"; item: ItemUpgradeInventoryRow }
  | { state: "stale-snapshot"; item?: ItemUpgradeInventoryRow }
  | { state: "not-enough-gold"; required: number; available: number }
  | { state: "not-enough-iskrokamin"; required: number; available: number }
  | { state: "not-enough-mana"; required: number; available: number }
  | { state: "class-not-allowed" }
  | { state: "invalid-donor" }
  | {
      state: "attempted";
      success: boolean;
      character: CharacterRecord;
      item: ItemUpgradeInventoryRow;
      donorConsumed: boolean;
      fromLevel: number;
      targetLevel: number;
      finalChance: number;
      pityFailuresBefore: number;
      pityFailuresAfter: number;
      pityGuaranteed: boolean;
      spent: { gold: number; iskrokamin: number; mana: number };
    };

export type ItemUpgradeUnlockResult =
  | { state: "no-character" }
  | { state: "wrong-place"; character: CharacterRecord }
  | { state: "level-locked"; character: CharacterRecord; requiredLevel: number }
  | { state: "missing-field-kit"; character: CharacterRecord; fieldKitQuantity: number }
  | {
      state: "unlocked" | "already-unlocked";
      character: CharacterRecord;
      rewardXp: number;
      itemGrants: ItemGrant[];
      action: DailyActionRecord | null;
      levelChange: RewardLevelChange | null;
    };

export interface ItemUpgradeRepository {
  getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<ItemUpgradeSnapshot | null>;
  getQuestSnapshotForTelegramUser?(
    telegramUserId: bigint,
    now: Date
  ): Promise<ItemUpgradeQuestSnapshot | null>;
  attemptForTelegramUser(
    telegramUserId: bigint,
    input: ItemUpgradeAttemptInput
  ): Promise<ItemUpgradeAttemptResult>;
  setPityForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    targetLevel: number,
    failureCount: number,
    now: Date
  ): Promise<{ character: CharacterRecord; failureCount: number } | null>;
  unlockForTelegramUser(telegramUserId: bigint, now: Date): Promise<ItemUpgradeUnlockResult>;
}
