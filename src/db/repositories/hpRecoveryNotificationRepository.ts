import type { CanonicalHpRecoverySnapshot } from "../../domain/resources/canonicalHpRecovery";
export { buildHpRecoveryStateFingerprint } from "../../domain/resources/canonicalHpRecovery";

export const HP_RECOVERY_NOTIFICATION_MAX_DELIVERY_ATTEMPTS = 13;

export type HpRecoveryNotificationStatus =
  | "waiting"
  | "checking"
  | "ready"
  | "sending"
  | "sent"
  | "suppressed";

export interface HpRecoveryNotificationRecord {
  characterId: string;
  generation: number;
  remortCount: number;
  sourceHpCurrent: number;
  sourceHpMax: number;
  sourceHpRegenAt: Date | null;
  sourceFingerprint: string | null;
  status: HpRecoveryNotificationStatus;
  nextAttemptAt: Date;
  processingStartedAt: Date | null;
  readyAt: Date | null;
  sentAt: Date | null;
  suppressedAt: Date | null;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ClaimedHpRecoveryNotification =
  | (HpRecoveryNotificationRecord & { claim: "checking"; claimStartedAt: Date })
  | (HpRecoveryNotificationRecord & { claim: "ready"; claimStartedAt: null })
  | (HpRecoveryNotificationRecord & { claim: "suppressed-stale-send"; claimStartedAt: null });

export interface HpRecoveryEquipmentSnapshot {
  slot: string;
  itemId: string;
  updatedAt: Date;
}

export interface HpRecoverySnapshot extends CanonicalHpRecoverySnapshot {
  equipment: HpRecoveryEquipmentSnapshot[];
}

export interface RebaseHpRecoveryInput {
  characterId: string;
  generation: number;
  remortCount: number;
  sourceHpCurrent: number;
  sourceHpMax: number;
  sourceHpRegenAt: Date | null;
  sourceFingerprint: string;
  nextAttemptAt: Date;
  claimStartedAt: Date;
}

export type FinalizeHpRecoveryCheckingResult =
  | { state: "ready"; notification: Extract<ClaimedHpRecoveryNotification, { claim: "ready" }> }
  | { state: "rebased" | "suppressed" | "lost" };

export type ClaimHpRecoveryReadyResult =
  | { state: "claimed"; telegramUserId: bigint; attemptCount: number }
  | { state: "deferred" | "suppressed" | "lost" };

export interface HpRecoveryNotificationRepository {
  claimDue(now: Date, options?: { limit?: number; checkingLeaseMs?: number; sendingLeaseMs?: number }): Promise<ClaimedHpRecoveryNotification[]>;
  loadSnapshots(characterIds: string[], now: Date): Promise<HpRecoverySnapshot[]>;
  rebase(input: RebaseHpRecoveryInput): Promise<boolean>;
  suppressChecking(input: {
    characterId: string;
    generation: number;
    remortCount: number;
    claimStartedAt: Date;
    now: Date;
    errorCode?: string;
  }): Promise<boolean>;
  suppressReady(characterId: string, generation: number, now: Date, errorCode?: string): Promise<boolean>;
  finalizeChecking(
    notification: Extract<ClaimedHpRecoveryNotification, { claim: "checking" }>,
    now: Date
  ): Promise<FinalizeHpRecoveryCheckingResult>;
  claimReadyForSending(
    notification: Extract<ClaimedHpRecoveryNotification, { claim: "ready" }>,
    now: Date
  ): Promise<ClaimHpRecoveryReadyResult>;
  markSent(characterId: string, generation: number, now: Date): Promise<boolean>;
  retrySending(characterId: string, generation: number, nextAttemptAt: Date, errorCode: string): Promise<boolean>;
  suppressSending(characterId: string, generation: number, now: Date, errorCode: string): Promise<boolean>;
  prepareDueForTelegramUser(telegramUserId: bigint, now: Date): Promise<boolean>;
}
