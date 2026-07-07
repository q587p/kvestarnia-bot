import type { CharacterRecord } from "./characterRepository";

export type ItemUpgradeMethod = "npc" | "self";

export interface ItemUpgradeInventoryRow {
  id: string;
  characterId: string;
  itemId: string;
  quantity: number;
  equipped: boolean;
}

export interface ItemUpgradeSnapshot {
  character: CharacterRecord;
  items: ItemUpgradeInventoryRow[];
  pities: Array<{ itemId: string; targetLevel: number; failureCount: number }>;
}

export interface ItemUpgradeAttemptInput {
  itemId: string;
  donorItemId?: string | null;
  method: ItemUpgradeMethod;
  now: Date;
  roll: number;
  expectedFromLevel: number;
  expectedQuantity: number;
  expectedPityFailures: number;
}

export type ItemUpgradeAttemptResult =
  | { state: "no-character" }
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

export interface ItemUpgradeRepository {
  getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<ItemUpgradeSnapshot | null>;
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
}
