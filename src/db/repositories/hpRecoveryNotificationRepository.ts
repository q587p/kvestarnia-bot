import {
  matchesEquipmentAttunementRow,
  parseEquipmentAttunementPayload
} from "../../domain/equipment/equipmentAttunement";

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

export interface HpRecoverySnapshot {
  characterId: string;
  telegramUserId: bigint;
  lastActionAt: Date | null;
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
  attunementActions: Array<{ resultJson: unknown; createdAt: Date }>;
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
  claimStartedAt: Date;
}

export interface MarkHpRecoveryReadyInput extends RebaseHpRecoveryInput {
  readyAt: Date;
  effectiveHpMax: number;
}

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
  markReady(input: MarkHpRecoveryReadyInput): Promise<boolean>;
  claimReadyForSending(input: {
    characterId: string;
    generation: number;
    remortCount: number;
    expectedHpCurrent: number;
    expectedHpRegenAt: Date | null;
    expectedStateFingerprint: string;
    expectedEffectiveHpMax: number;
    readyAt: Date;
    now: Date;
  }): Promise<boolean>;
  markSent(characterId: string, generation: number, now: Date): Promise<boolean>;
  retrySending(characterId: string, generation: number, nextAttemptAt: Date, errorCode: string): Promise<boolean>;
  suppressSending(characterId: string, generation: number, now: Date, errorCode: string): Promise<boolean>;
  prepareDueForTelegramUser(telegramUserId: bigint, now: Date): Promise<boolean>;
}

export function buildHpRecoveryStateFingerprint(snapshot: HpRecoverySnapshot, now: Date): string {
  const pendingAttunements = snapshot.attunementActions.flatMap((action) => {
    const payload = parseEquipmentAttunementPayload(action.resultJson);
    if (!payload || Date.parse(payload.readyAt) <= now.getTime()) {
      return [];
    }
    const row = snapshot.equipment.find((candidate) => matchesEquipmentAttunementRow(payload, candidate));
    return row
      ? [[payload.slot, payload.itemId, payload.equipmentUpdatedAt, payload.readyAt]]
      : [];
  });

  return stableStringify({
    profile: [snapshot.pronoun, snapshot.path, snapshot.raceId, snapshot.classId],
    progression: [snapshot.level, snapshot.xp, snapshot.remortCount, snapshot.hpMax],
    statsJson: snapshot.statsJson,
    lastActionAt: snapshot.lastActionAt?.toISOString() ?? null,
    equipment: snapshot.equipment
      .map((row) => [row.slot, row.itemId, row.updatedAt.toISOString()])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    pendingAttunements: pendingAttunements.sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    recoveryDrink: snapshot.recoveryDrink
      ? {
          drinkKey: snapshot.recoveryDrink.drinkKey,
          phase: snapshot.recoveryDrink.phase,
          startedAt: snapshot.recoveryDrink.startedAt.toISOString(),
          expiresAt: snapshot.recoveryDrink.expiresAt.toISOString(),
          metadata: snapshot.recoveryDrink.metadata
        }
      : null
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
