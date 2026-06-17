export type BarrelRaidNotificationStatus = "pending" | "processing" | "sent" | "skipped";

export interface BarrelRaidNotificationRecord {
  id: string;
  characterId: string;
  telegramUserId: bigint;
  chatId: bigint;
  periodId: string;
  availableAt: Date;
  status: BarrelRaidNotificationStatus;
  processingStartedAt: Date | null;
  rewardClaimedAt: Date | null;
  sentAt: Date | null;
  skippedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BarrelRaidNotificationRepository {
  upsertPendingForTelegramUser(
    telegramUserId: bigint,
    input: {
      chatId: bigint;
      periodId: string;
      availableAt: Date;
      now: Date;
    }
  ): Promise<BarrelRaidNotificationRecord | null>;
  listResumable(input: {
    now: Date;
    processingStaleBefore: Date;
  }): Promise<BarrelRaidNotificationRecord[]>;
  claimForProcessing(
    id: string,
    input: {
      now: Date;
      processingStaleBefore: Date;
    }
  ): Promise<BarrelRaidNotificationRecord | null>;
  markRewardClaimed(id: string, now: Date): Promise<BarrelRaidNotificationRecord | null>;
  markSent(id: string, now: Date): Promise<BarrelRaidNotificationRecord | null>;
  markSkipped(id: string, now: Date, reason?: string): Promise<BarrelRaidNotificationRecord | null>;
  markPendingAfterFailure(
    id: string,
    now: Date,
    error: string
  ): Promise<BarrelRaidNotificationRecord | null>;
}
