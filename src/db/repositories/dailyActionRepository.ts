import type { Prisma } from "@prisma/client";
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
  spentGold: number;
  resultJson: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface ItemGrant {
  itemId: string;
  quantity: number;
  maxOwnedQuantity?: number;
}

export interface ClaimDailyActionInput {
  key: string;
  localDate: string;
  rewardXp: number;
  rewardGold: number;
  spentGold?: number;
  resultJson?: unknown;
  itemGrants?: ItemGrant[];
}

export type ClaimDailyActionResult =
  | {
      state: "created";
      action: DailyActionRecord;
      character: CharacterRecord;
      levelChange: RewardLevelChange;
      itemGrants: ItemGrant[];
    }
  | {
      state: "existing";
      action: DailyActionRecord;
      character: CharacterRecord;
      levelChange: null;
      itemGrants: [];
    };

export interface DailyActionRepository {
  findForTelegramUser(
    telegramUserId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null>;

  claimForTelegramUser(
    telegramUserId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null>;

  deleteForTelegramUser?(
    telegramUserId: bigint,
    input: { key: string; localDate: string }
  ): Promise<"deleted" | "missing" | "no-character">;

  countForTelegramUser?(
    telegramUserId: bigint,
    input: { key: string; localDatePrefix: string }
  ): Promise<number | null>;
}
