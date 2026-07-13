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
}

export interface ClaimedHpRecoveryNotification extends HpRecoveryNotificationRecord {
  claim: "checking" | "ready" | "suppressed-stale-send";
}

export interface HpRecoveryEquipmentSnapshot {
  slot: string;
  itemId: string;
  updatedAt: Date;
}

export interface HpRecoverySnapshot {
  characterId: string;
  telegramUserId: bigint;
  pronoun: string;
  path: string;
  raceId: string;
  classId: string;
  level: number;
  xp: number;
  hpCurrent: number;
  hpMax: number;
  hpRegenAt: Date | null;
  statsJson: unknown;
  remortCount: number;
  activeCombatLease: { kind: string; referenceId: string } | null;
  equipment: HpRecoveryEquipmentSnapshot[];
  attunementPayloads: unknown[];
  recoveryDrink: {
    drinkKey: string;
    phase: string;
    startedAt: Date;
    expiresAt: Date;
    metadata: unknown;
  } | null;
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
}

export interface MarkHpRecoveryReadyInput extends RebaseHpRecoveryInput {
  readyAt: Date;
  effectiveHpMax: number;
}

export interface HpRecoveryNotificationRepository {
  claimDue(now: Date, options?: { limit?: number; checkingLeaseMs?: number; sendingLeaseMs?: number }): Promise<ClaimedHpRecoveryNotification[]>;
  loadSnapshots(characterIds: string[]): Promise<HpRecoverySnapshot[]>;
  rebase(input: RebaseHpRecoveryInput): Promise<boolean>;
  suppress(characterId: string, generation: number, now: Date, errorCode?: string): Promise<boolean>;
  markReady(input: MarkHpRecoveryReadyInput): Promise<boolean>;
  claimReadyForSending(input: {
    characterId: string;
    generation: number;
    remortCount: number;
    expectedHpCurrent: number;
    expectedHpRegenAt: Date | null;
    now: Date;
  }): Promise<boolean>;
  markSent(characterId: string, generation: number, now: Date): Promise<boolean>;
  retrySending(characterId: string, generation: number, nextAttemptAt: Date, errorCode: string): Promise<boolean>;
  suppressSending(characterId: string, generation: number, now: Date, errorCode: string): Promise<boolean>;
  prepareDueForTelegramUser(telegramUserId: bigint, now: Date): Promise<boolean>;
}
