import type { ItemGrant } from "./dailyActionRepository";

export type HuntContractStatus = "posted" | "completed";

export interface HuntContractRecord {
  id: string;
  characterId: string;
  localPeriodId: string;
  monsterId: string;
  contractToken: string;
  status: HuntContractStatus;
  completedAction: string | null;
  rewardXp: number | null;
  rewardGold: number | null;
  rewardItems: ItemGrant[] | null;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface PostedHuntContractInput {
  localPeriodId: string;
  monsterId: string;
  contractToken: string;
}

export interface CompleteHuntContractInput {
  localPeriodId: string;
  action: string;
  rewardXp: number;
  rewardGold: number;
  itemGrants: ItemGrant[];
}

export interface HuntContractRepository {
  findByTelegramUserIdAndPeriod(
    telegramUserId: bigint,
    localPeriodId: string
  ): Promise<HuntContractRecord | null>;

  upsertPostedContractForTelegramUser(
    telegramUserId: bigint,
    input: PostedHuntContractInput
  ): Promise<HuntContractRecord | null>;

  markCompletedForTelegramUser(
    telegramUserId: bigint,
    input: CompleteHuntContractInput
  ): Promise<HuntContractRecord | null>;
}
