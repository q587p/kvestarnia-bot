import type { CharacterRecord } from "./characterRepository";

export interface RewardLevelChange {
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

export interface DailyActionRecord {
  id: string;
  characterId: string;
  key: string;
  localDate: string;
  rewardXp: number;
  rewardGold: number;
  createdAt: Date;
}

export interface ClaimDailyActionInput {
  key: string;
  localDate: string;
  rewardXp: number;
  rewardGold: number;
}

export type ClaimDailyActionResult =
  | {
      state: "created";
      action: DailyActionRecord;
      character: CharacterRecord;
      levelChange: RewardLevelChange;
    }
  | {
      state: "existing";
      action: DailyActionRecord;
      character: CharacterRecord;
      levelChange: null;
    };

export interface DailyActionRepository {
  claimForTelegramUser(
    telegramUserId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null>;
}
