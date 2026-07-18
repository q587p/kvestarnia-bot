import type { CombatActorStats } from "../combat/combatState";
import {
  buildBardPerformancePlan,
  type BardPerformanceGrade
} from "./bardPerformance";

export const BARD_SUPPORT_RULES_VERSION = "bard-support-v1";
export const BARD_INSPIRATION_STATUS_KEY = "class.bard.inspiration.recipient";
export const BARD_MUSIC_AVAILABILITY_KEY_PREFIX = "class.bard.music.location:";
export const BARD_INSPIRATION_DURATION_MINUTES = 13;
export const BARD_MUSIC_AVAILABILITY_MINUTES = 93;
export const BARD_INSPIRATION_COMBAT_PULSE_COST_MS = 60_000;
export const BARD_LAMENT_MIN_BOSS_RESPONSES = 8;
export const BARD_LAMENT_MAX_BOSS_RESPONSES = 13;

export type BardInspirationMutation = "granted" | "replaced" | "unchanged";

export interface BardInspirationPayloadV1 {
  kind: typeof BARD_SUPPORT_RULES_VERSION;
  version: 1;
  activationId: string;
  sourcePerformanceId: string;
  sourceCharacterId: string;
  sourceLocationId: string;
  recipientCharacterId: string;
  recipientRemortCount: number;
  grade: BardPerformanceGrade;
  accuracyBonusPp: number;
  startedAt: string;
  expiresAt: string;
  cursorAt: string;
}

export interface BardInspirationCombatStateV1 {
  version: 1;
  activationId: string;
  sourcePerformanceId: string;
  sourceLocationId: string;
  recipientCharacterId: string;
  recipientRemortCount: number;
  grade: BardPerformanceGrade;
  accuracyBonusPp: number;
  expiresAt: string;
  cursorAt: string;
  leaseStartedAt: string;
  outsideRemainderMs: number;
  pulseIds: string[];
}

export function getBardMusicAvailabilityKey(locationId: string): string {
  return `${BARD_MUSIC_AVAILABILITY_KEY_PREFIX}${locationId}`;
}

export function getBardInspirationAccuracyBonusPp(grade: BardPerformanceGrade): number {
  switch (grade) {
    case "rough":
      return 1;
    case "pleasant":
      return 2;
    case "memorable":
      return 3;
    case "legendary":
      return 5;
  }
}

export function getBardLamentDamageReduction(grade: BardPerformanceGrade): number {
  return getBardInspirationAccuracyBonusPp(grade);
}

export function buildBardLamentPlan(input: {
  charisma: number;
  luck: number;
  level: number;
  roll: number;
}): {
  grade: BardPerformanceGrade;
  power: number;
  damageReduction: number;
  bossResponses: number;
} {
  const performance = buildBardPerformancePlan(input);

  return {
    grade: performance.grade,
    power: performance.power,
    damageReduction: getBardLamentDamageReduction(performance.grade),
    bossResponses: Math.max(
      BARD_LAMENT_MIN_BOSS_RESPONSES,
      Math.min(BARD_LAMENT_MAX_BOSS_RESPONSES, Math.floor(input.level))
    )
  };
}

export function buildBardInspirationPayload(input: {
  activationId: string;
  sourcePerformanceId: string;
  sourceCharacterId: string;
  sourceLocationId: string;
  recipientCharacterId: string;
  recipientRemortCount: number;
  grade: BardPerformanceGrade;
  now: Date;
}): BardInspirationPayloadV1 {
  const startedAt = input.now.toISOString();

  return {
    kind: BARD_SUPPORT_RULES_VERSION,
    version: 1,
    activationId: input.activationId,
    sourcePerformanceId: input.sourcePerformanceId,
    sourceCharacterId: input.sourceCharacterId,
    sourceLocationId: input.sourceLocationId,
    recipientCharacterId: input.recipientCharacterId,
    recipientRemortCount: input.recipientRemortCount,
    grade: input.grade,
    accuracyBonusPp: getBardInspirationAccuracyBonusPp(input.grade),
    startedAt,
    expiresAt: new Date(
      input.now.getTime() + BARD_INSPIRATION_DURATION_MINUTES * 60_000
    ).toISOString(),
    cursorAt: startedAt
  };
}

export function settleBardInspirationOutsideCombat(
  payload: BardInspirationPayloadV1,
  now: Date
): BardInspirationPayloadV1 {
  const expiresAt = Date.parse(payload.expiresAt);
  const cursorAt = Date.parse(payload.cursorAt);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(cursorAt) || now.getTime() <= cursorAt) {
    return cloneBardInspirationPayload(payload);
  }
  const through = Math.min(now.getTime(), expiresAt);
  const elapsedMinutes = Math.floor((through - cursorAt) / 60_000);
  const nextCursorAt = through === expiresAt
    ? expiresAt
    : cursorAt + elapsedMinutes * 60_000;

  return {
    ...cloneBardInspirationPayload(payload),
    cursorAt: new Date(nextCursorAt).toISOString()
  };
}

export function freezeBardInspirationForCombat(
  payload: BardInspirationPayloadV1,
  recipientCharacterId: string,
  recipientRemortCount: number,
  now: Date
): BardInspirationCombatStateV1 | null {
  const expiresAt = Date.parse(payload.expiresAt);
  const cursorAt = Date.parse(payload.cursorAt);
  if (
    payload.recipientCharacterId !== recipientCharacterId ||
    payload.recipientRemortCount !== recipientRemortCount ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(cursorAt) ||
    expiresAt <= now.getTime()
  ) {
    return null;
  }
  const remainingDurationMs = Math.max(0, expiresAt - cursorAt);

  return {
    version: 1,
    activationId: payload.activationId,
    sourcePerformanceId: payload.sourcePerformanceId,
    sourceLocationId: payload.sourceLocationId,
    recipientCharacterId,
    recipientRemortCount,
    grade: payload.grade,
    accuracyBonusPp: payload.accuracyBonusPp,
    expiresAt: new Date(now.getTime() + remainingDurationMs).toISOString(),
    cursorAt: now.toISOString(),
    leaseStartedAt: now.toISOString(),
    outsideRemainderMs: Math.max(0, Math.min(59_999, now.getTime() - cursorAt)),
    pulseIds: []
  };
}

export function getBardInspirationRemainingCombatDurationMs(
  inspiration: Pick<BardInspirationCombatStateV1, "expiresAt" | "cursorAt">
): number {
  return Math.max(0, Date.parse(inspiration.expiresAt) - Date.parse(inspiration.cursorAt));
}

export function getBardInspirationRemainingCombatTurns(
  inspiration: Pick<BardInspirationCombatStateV1, "expiresAt" | "cursorAt">
): number {
  return Math.max(0, Math.floor(
    getBardInspirationRemainingCombatDurationMs(inspiration) /
      BARD_INSPIRATION_COMBAT_PULSE_COST_MS
  ));
}

export function getBardInspirationCombatAccuracyBonusPp(
  inspiration: BardInspirationCombatStateV1 | null | undefined
): number {
  return inspiration && getBardInspirationRemainingCombatTurns(inspiration) > 0
    ? inspiration.accuracyBonusPp
    : 0;
}

export function withBardInspirationAccuracy(
  stats: CombatActorStats,
  inspiration: BardInspirationCombatStateV1 | null | undefined
): CombatActorStats {
  const accuracyBonusPp = getBardInspirationCombatAccuracyBonusPp(inspiration);

  return accuracyBonusPp > 0 ? { ...stats, accuracyBonusPp } : stats;
}

export function applyBardInspirationCombatPulse(input: {
  inspiration: BardInspirationCombatStateV1 | undefined;
  pulseId: string;
  now: Date;
}): { inspiration?: BardInspirationCombatStateV1; applied: boolean } {
  const inspiration = input.inspiration
    ? cloneBardInspirationCombatState(input.inspiration)
    : undefined;
  const remainingDurationMs = inspiration
    ? getBardInspirationRemainingCombatDurationMs(inspiration)
    : 0;
  if (
    !inspiration ||
    remainingDurationMs < BARD_INSPIRATION_COMBAT_PULSE_COST_MS ||
    inspiration.pulseIds.includes(input.pulseId)
  ) {
    return { ...(inspiration ? { inspiration } : {}), applied: false };
  }

  inspiration.expiresAt = new Date(
    input.now.getTime() + remainingDurationMs - BARD_INSPIRATION_COMBAT_PULSE_COST_MS
  ).toISOString();
  inspiration.cursorAt = input.now.toISOString();
  inspiration.pulseIds.push(input.pulseId);

  return { inspiration, applied: true };
}

export function applyBardInspirationPulseToSoloCombat(input: {
  state: import("../combat/combatState").CombatState;
  combatKind: "persistent-pve" | "training-doppelganger";
  sessionId: string;
  committedTurn: number;
  recipientCharacterId: string;
  now: Date;
}): boolean {
  const pulse = applyBardInspirationCombatPulse({
    inspiration: input.state.bardInspiration,
    pulseId: [
      input.state.bardInspiration?.activationId ?? "none",
      input.combatKind,
      input.sessionId,
      input.committedTurn,
      input.recipientCharacterId
    ].join(":"),
    now: input.now
  });
  if (pulse.inspiration) {
    input.state.bardInspiration = pulse.inspiration;
  }

  return pulse.applied;
}

export function applyBardInspirationPulsesToTurnBasedDuel(input: {
  state: import("../duels/turnBasedDuel").TurnBasedDuelState;
  sessionId: string;
  committedTurn: number;
  now: Date;
}): import("../duels/turnBasedDuel").TurnBasedDuelState {
  if (!input.state.lastRound || input.state.lastRound.turn !== input.committedTurn) {
    return input.state;
  }
  const participants = { ...input.state.participants };
  for (const action of input.state.lastRound.actions) {
    const side = participants.challenger.characterId === action.actorCharacterId
      ? "challenger"
      : "target";
    const participant = participants[side];
    const pulse = applyBardInspirationCombatPulse({
      inspiration: participant.bardInspiration,
      pulseId: [
        participant.bardInspiration?.activationId ?? "none",
        "turn-based-duel",
        input.sessionId,
        input.committedTurn,
        participant.characterId
      ].join(":"),
      now: input.now
    });
    if (pulse.inspiration) {
      participants[side] = { ...participant, bardInspiration: pulse.inspiration };
    }
  }

  return { ...input.state, participants };
}

export function isBardInspirationActive(
  payload: BardInspirationPayloadV1 | null,
  recipientCharacterId: string,
  recipientRemortCount: number,
  now: Date
): payload is BardInspirationPayloadV1 {
  return Boolean(
    payload &&
    payload.recipientCharacterId === recipientCharacterId &&
    payload.recipientRemortCount === recipientRemortCount &&
    Date.parse(payload.expiresAt) > now.getTime()
  );
}

export function parseBardInspirationPayload(value: unknown): BardInspirationPayloadV1 | null {
  if (
    !isRecord(value) ||
    value.kind !== BARD_SUPPORT_RULES_VERSION ||
    value.version !== 1 ||
    typeof value.activationId !== "string" ||
    typeof value.sourcePerformanceId !== "string" ||
    typeof value.sourceCharacterId !== "string" ||
    typeof value.sourceLocationId !== "string" ||
    typeof value.recipientCharacterId !== "string" ||
    !isNonNegativeInt(value.recipientRemortCount) ||
    !isBardPerformanceGrade(value.grade) ||
    ![1, 2, 3, 5].includes(Number(value.accuracyBonusPp)) ||
    !isIsoDate(value.startedAt) ||
    !isIsoDate(value.expiresAt) ||
    !isIsoDate(value.cursorAt)
  ) {
    return null;
  }

  return cloneBardInspirationPayload(value as unknown as BardInspirationPayloadV1);
}

export function parseBardInspirationCombatState(
  value: unknown
): BardInspirationCombatStateV1 | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.activationId !== "string" ||
    typeof value.sourcePerformanceId !== "string" ||
    typeof value.sourceLocationId !== "string" ||
    typeof value.recipientCharacterId !== "string" ||
    !isNonNegativeInt(value.recipientRemortCount) ||
    !isBardPerformanceGrade(value.grade) ||
    ![1, 2, 3, 5].includes(Number(value.accuracyBonusPp)) ||
    !isIsoDate(value.expiresAt) ||
    !isIsoDate(value.cursorAt) ||
    !isIsoDate(value.leaseStartedAt) ||
    !isNonNegativeInt(value.outsideRemainderMs) ||
    value.outsideRemainderMs >= 60_000 ||
    !Array.isArray(value.pulseIds) ||
    !value.pulseIds.every((entry) => typeof entry === "string")
  ) {
    return null;
  }

  return cloneBardInspirationCombatState(value as unknown as BardInspirationCombatStateV1);
}

export function cloneBardInspirationPayload(
  payload: BardInspirationPayloadV1
): BardInspirationPayloadV1 {
  return { ...payload };
}

export function cloneBardInspirationCombatState(
  state: BardInspirationCombatStateV1
): BardInspirationCombatStateV1 {
  return { ...state, pulseIds: [...state.pulseIds] };
}

function isBardPerformanceGrade(value: unknown): value is BardPerformanceGrade {
  return value === "rough" || value === "pleasant" || value === "memorable" || value === "legendary";
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
