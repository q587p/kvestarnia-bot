export const VARENYK_SATED_TECHNIQUE_ID = "technique.class.varenyk-mancer.sated-support";
export const VARENYK_SATED_STATUS_KEY = "class.varenyk-mancer.sated-support.recipient";
export const VARENYK_SATED_PREVIEW_KEY = "class.varenyk-mancer.sated-support.preview";
export const VARENYK_SATED_PAIR_WAIT_KEY_PREFIX = "class.varenyk-mancer.sated-support.pair:";
export const VARENYK_SATED_RULES_VERSION = "varenyk-sated-support-v1";
export const VARENYK_SATED_DURATION_MINUTES = 13;
export const VARENYK_SATED_RECIPIENT_WAIT_MINUTES = 93;
export const VARENYK_SATED_COMBAT_PULSE_DURATION_COST_MS = 60_000;
export const VARENYK_SATED_MANA_COSTS = [8, 12, 16, 20, 23] as const;

export function getVarenykSatedPairWaitKey(recipientCharacterId: string): string {
  return `${VARENYK_SATED_PAIR_WAIT_KEY_PREFIX}${recipientCharacterId}`;
}

export interface VarenykSatedPlan {
  rank: number;
  manaCost: number;
  immediateHp: number;
  immediateMana: 0;
}

export interface VarenykSatedReceiptV1 {
  version: 1;
  previewToken: string;
  actorTelegramUserId: string;
  targetTelegramUserId: string;
  actorName: string;
  targetName: string;
  immediateHpRestored: number;
  immediateManaRestored: number;
  actorManaAfter: number;
  targetHpAfter: number;
  targetManaAfter: number;
}

export interface VarenykSatedPayloadV1 {
  kind: typeof VARENYK_SATED_RULES_VERSION;
  version: 1;
  activationId: string;
  actorCharacterId: string;
  actorRemortCount: number;
  recipientCharacterId: string;
  recipientRemortCount: number;
  rank: number;
  manaCost: number;
  effectiveStats: {
    intelligence: number;
    charisma: number;
    level: number;
    equipmentItemIds: string[];
  };
  startedAt: string;
  expiresAt: string;
  availableAt: string;
  cursorAt: string;
  receipt: VarenykSatedReceiptV1;
}

export interface VarenykSatedCombatStateV1 {
  version: 1;
  activationId: string;
  recipientCharacterId: string;
  recipientRemortCount: number;
  rank: number;
  expiresAt: string;
  cursorAt: string;
  leaseStartedAt: string;
  outsideRemainderMs: number;
  pulseIds: string[];
}

export interface SatedResourceState {
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
}

export interface SatedRecoveryResult {
  resources: SatedResourceState;
  hpRestored: number;
  manaRestored: number;
}

export function getVarenykSatedRemainingCombatDurationMs(
  sated: Pick<VarenykSatedCombatStateV1, "expiresAt" | "cursorAt">
): number {
  return Math.max(0, Date.parse(sated.expiresAt) - Date.parse(sated.cursorAt));
}

export function getVarenykSatedRemainingCombatTurns(
  sated: Pick<VarenykSatedCombatStateV1, "expiresAt" | "cursorAt">
): number {
  return Math.max(0, Math.floor(
    getVarenykSatedRemainingCombatDurationMs(sated) / VARENYK_SATED_COMBAT_PULSE_DURATION_COST_MS
  ));
}

export interface VarenykSatedPeriodicRecovery {
  hp: number;
  mana: number;
}

export function getVarenykSatedPeriodicRecovery(rank: number): VarenykSatedPeriodicRecovery {
  const safeRank = clamp(safeInt(rank), 1, 5);
  return {
    hp: 1 + Math.floor(safeRank / 2),
    mana: 1 + Math.floor((safeRank - 1) / 2)
  };
}

export function buildVarenykSatedPlan(input: {
  effectiveIntelligence: number;
  effectiveCharisma: number;
  level: number;
}): VarenykSatedPlan {
  const intelligence = safeInt(input.effectiveIntelligence);
  const charisma = safeInt(input.effectiveCharisma);
  const level = Math.max(1, safeInt(input.level));
  const rank = clamp(
    1 + Math.floor(Math.max(0, intelligence - 8) / 3) +
      Math.floor(Math.max(0, charisma + level - 13) / 7),
    1,
    5
  );

  return {
    rank,
    manaCost: VARENYK_SATED_MANA_COSTS[rank - 1] ?? VARENYK_SATED_MANA_COSTS[4],
    immediateHp: 2 + rank,
    immediateMana: 0
  };
}

export function getAffordableVarenykSatedPlan(
  plannedRank: number,
  availableMana: number
): VarenykSatedPlan | null {
  const maxRank = clamp(safeInt(plannedRank), 1, 5);
  const mana = Math.max(0, safeInt(availableMana));
  for (let rank = maxRank; rank >= 1; rank -= 1) {
    const manaCost = VARENYK_SATED_MANA_COSTS[rank - 1]!;
    if (mana >= manaCost) {
      return { rank, manaCost, immediateHp: 2 + rank, immediateMana: 0 };
    }
  }
  return null;
}

export function applyVarenykSatedImmediateRecovery(
  resources: SatedResourceState,
  plan: Pick<VarenykSatedPlan, "immediateHp" | "immediateMana">
): SatedRecoveryResult {
  return applyRecovery(resources, plan.immediateHp, plan.immediateMana);
}

export function settleVarenykSatedOutsideCombat(input: {
  payload: VarenykSatedPayloadV1;
  resources: SatedResourceState;
  now: Date;
  combatBlocked: boolean;
}): SatedRecoveryResult & { payload: VarenykSatedPayloadV1; elapsedMinutes: number } {
  const expiresAt = parseDate(input.payload.expiresAt);
  const cursorAt = parseDate(input.payload.cursorAt);
  const through = new Date(Math.min(input.now.getTime(), expiresAt?.getTime() ?? input.now.getTime()));
  if (!expiresAt || !cursorAt || through <= cursorAt) {
    return {
      ...applyRecovery(input.resources, 0, 0),
      payload: cloneVarenykSatedPayload(input.payload),
      elapsedMinutes: 0
    };
  }

  const elapsedMinutes = Math.floor((through.getTime() - cursorAt.getTime()) / 60_000);
  const reachedExpiry = through.getTime() === expiresAt.getTime();
  const nextCursor = input.combatBlocked
    ? cursorAt
    : reachedExpiry
      ? expiresAt
      : new Date(cursorAt.getTime() + elapsedMinutes * 60_000);
  const periodicRecovery = getVarenykSatedPeriodicRecovery(input.payload.rank);
  const recovered = input.combatBlocked || elapsedMinutes <= 0
    ? applyRecovery(input.resources, 0, 0)
    : applyRecovery(
        input.resources,
        elapsedMinutes * periodicRecovery.hp,
        elapsedMinutes * periodicRecovery.mana
      );

  return {
    ...recovered,
    payload: {
      ...cloneVarenykSatedPayload(input.payload),
      cursorAt: nextCursor.toISOString()
    },
    elapsedMinutes
  };
}

export function freezeVarenykSatedForCombat(
  payload: VarenykSatedPayloadV1,
  recipientCharacterId: string,
  recipientRemortCount: number,
  now: Date
): VarenykSatedCombatStateV1 | null {
  const payloadExpiresAt = Date.parse(payload.expiresAt);
  const payloadCursorAt = Date.parse(payload.cursorAt);
  if (
    payload.recipientCharacterId !== recipientCharacterId ||
    payload.recipientRemortCount !== recipientRemortCount ||
    payloadExpiresAt <= now.getTime()
  ) {
    return null;
  }

  const remainingDurationMs = Math.max(0, payloadExpiresAt - payloadCursorAt);

  return {
    version: 1,
    activationId: payload.activationId,
    recipientCharacterId,
    recipientRemortCount,
    rank: clamp(safeInt(payload.rank), 1, 5),
    expiresAt: new Date(now.getTime() + remainingDurationMs).toISOString(),
    cursorAt: now.toISOString(),
    leaseStartedAt: now.toISOString(),
    outsideRemainderMs: Math.max(0, Math.min(59_999, now.getTime() - payloadCursorAt)),
    pulseIds: []
  };
}

export function applyVarenykSatedCombatPulse(input: {
  sated: VarenykSatedCombatStateV1 | undefined;
  resources: SatedResourceState;
  pulseId: string;
  now: Date;
}): SatedRecoveryResult & { sated?: VarenykSatedCombatStateV1; applied: boolean } {
  const sated = input.sated ? cloneVarenykSatedCombatState(input.sated) : undefined;
  const remainingDurationMs = sated
    ? getVarenykSatedRemainingCombatDurationMs(sated)
    : 0;
  if (
    !sated ||
    input.resources.hp <= 0 ||
    remainingDurationMs < VARENYK_SATED_COMBAT_PULSE_DURATION_COST_MS ||
    sated.pulseIds.includes(input.pulseId)
  ) {
    return {
      ...applyRecovery(input.resources, 0, 0),
      ...(sated ? { sated } : {}),
      applied: false
    };
  }

  const periodicRecovery = getVarenykSatedPeriodicRecovery(sated.rank);
  const recovered = applyRecovery(input.resources, periodicRecovery.hp, periodicRecovery.mana);
  const nextExpiresAt = new Date(
    input.now.getTime() + remainingDurationMs - VARENYK_SATED_COMBAT_PULSE_DURATION_COST_MS
  );
  sated.expiresAt = nextExpiresAt.toISOString();
  sated.cursorAt = input.now.toISOString();
  sated.pulseIds.push(input.pulseId);
  return { ...recovered, sated, applied: true };
}

export function applyVarenykSatedPulseToSoloCombat(input: {
  state: import("../combat/combatState").CombatState;
  combatKind: "persistent-pve" | "training-doppelganger";
  sessionId: string;
  committedTurn: number;
  recipientCharacterId: string;
  now: Date;
}): import("../combat/combatState").CombatState {
  const state = input.state;
  const pulse = applyVarenykSatedCombatPulse({
    sated: state.varenykSated,
    resources: {
      hp: state.hero.hp,
      hpMax: state.hero.hpMax,
      mana: state.hero.mana,
      manaMax: state.hero.manaMax
    },
    pulseId: [
      state.varenykSated?.activationId ?? "none",
      input.combatKind,
      input.sessionId,
      input.committedTurn,
      input.recipientCharacterId
    ].join(":"),
    now: input.now
  });
  if (!pulse.sated) {
    return state;
  }
  return {
    ...state,
    hero: pulse.applied
      ? { ...state.hero, hp: pulse.resources.hp, mana: pulse.resources.mana }
      : state.hero,
    varenykSated: pulse.sated,
    ...(pulse.applied && state.lastTurn && (pulse.hpRestored > 0 || pulse.manaRestored > 0)
      ? {
          lastTurn: {
            ...state.lastTurn,
            satedRecovery: { hpRestored: pulse.hpRestored, manaRestored: pulse.manaRestored }
          }
        }
      : {})
  };
}

export function applyVarenykSatedPulseAfterSoloEnemyResponse(input: {
  state: import("../combat/combatState").CombatState;
  combatKind: "persistent-pve" | "training-doppelganger";
  sessionId: string;
  committedTurn: number;
  recipientCharacterId: string;
  now: Date;
}): import("../combat/combatState").CombatTurnSummary["satedRecovery"] | undefined {
  const pulse = applyVarenykSatedCombatPulse({
    sated: input.state.varenykSated,
    resources: {
      hp: input.state.hero.hp,
      hpMax: input.state.hero.hpMax,
      mana: input.state.hero.mana,
      manaMax: input.state.hero.manaMax
    },
    pulseId: [
      input.state.varenykSated?.activationId ?? "none",
      input.combatKind,
      input.sessionId,
      input.committedTurn,
      input.recipientCharacterId
    ].join(":"),
    now: input.now
  });
  if (!pulse.sated) {
    return undefined;
  }
  input.state.varenykSated = pulse.sated;
  if (pulse.applied) {
    input.state.hero.hp = pulse.resources.hp;
    input.state.hero.mana = pulse.resources.mana;
  }
  return pulse.hpRestored > 0 || pulse.manaRestored > 0
    ? { hpRestored: pulse.hpRestored, manaRestored: pulse.manaRestored }
    : undefined;
}

export function applyVarenykSatedPulsesToTurnBasedDuel(input: {
  state: import("../duels/turnBasedDuel").TurnBasedDuelState;
  sessionId: string;
  committedTurn: number;
  now: Date;
}): import("../duels/turnBasedDuel").TurnBasedDuelState {
  if (!input.state.lastRound || input.state.lastRound.turn !== input.committedTurn) {
    return input.state;
  }
  const participants = { ...input.state.participants };
  const actions = input.state.lastRound.actions.map((action) => {
    const side = participants.challenger.characterId === action.actorCharacterId ? "challenger" : "target";
    const participant = participants[side];
    const pulse = applyVarenykSatedCombatPulse({
      sated: participant.varenykSated,
      resources: { hp: participant.hp, hpMax: participant.hpMax, mana: participant.mana, manaMax: participant.manaMax },
      pulseId: [
        participant.varenykSated?.activationId ?? "none",
        "turn-based-duel",
        input.sessionId,
        input.committedTurn,
        participant.characterId
      ].join(":"),
      now: input.now
    });
    if (!pulse.sated) return action;
    participants[side] = {
      ...participant,
      ...(pulse.applied ? { hp: pulse.resources.hp, mana: pulse.resources.mana } : {}),
      varenykSated: pulse.sated
    };
    return pulse.applied && (pulse.hpRestored > 0 || pulse.manaRestored > 0)
      ? { ...action, satedRecovery: { hpRestored: pulse.hpRestored, manaRestored: pulse.manaRestored } }
      : action;
  });
  return {
    ...input.state,
    participants,
    lastRound: { ...input.state.lastRound, actions },
    ...(input.state.lastAction
      ? { lastAction: actions.find((action) => action.actorCharacterId === input.state.lastAction?.actorCharacterId) ?? input.state.lastAction }
      : {})
  };
}

export function isVarenykSatedActive(
  payload: VarenykSatedPayloadV1 | null,
  recipientCharacterId: string,
  recipientRemortCount: number,
  now: Date
): payload is VarenykSatedPayloadV1 {
  return Boolean(
    payload &&
    payload.recipientCharacterId === recipientCharacterId &&
    payload.recipientRemortCount === recipientRemortCount &&
    Date.parse(payload.expiresAt) > now.getTime()
  );
}

export function parseVarenykSatedPayload(value: unknown): VarenykSatedPayloadV1 | null {
  if (!isRecord(value) || value.kind !== VARENYK_SATED_RULES_VERSION || value.version !== 1) {
    return null;
  }
  const effectiveStats = value.effectiveStats;
  const receipt = value.receipt;
  if (
    typeof value.activationId !== "string" ||
    typeof value.actorCharacterId !== "string" ||
    !isNonNegativeInt(value.actorRemortCount) ||
    typeof value.recipientCharacterId !== "string" ||
    !isNonNegativeInt(value.recipientRemortCount) ||
    !isPositiveInt(value.rank) ||
    !isPositiveInt(value.manaCost) ||
    !isIsoDate(value.startedAt) ||
    !isIsoDate(value.expiresAt) ||
    !isIsoDate(value.availableAt) ||
    !isIsoDate(value.cursorAt) ||
    !isRecord(effectiveStats) ||
    typeof effectiveStats.intelligence !== "number" ||
    typeof effectiveStats.charisma !== "number" ||
    typeof effectiveStats.level !== "number" ||
    !Array.isArray(effectiveStats.equipmentItemIds) ||
    !effectiveStats.equipmentItemIds.every((entry) => typeof entry === "string") ||
    !isRecord(receipt) ||
    receipt.version !== 1 ||
    typeof receipt.previewToken !== "string" ||
    typeof receipt.actorTelegramUserId !== "string" ||
    typeof receipt.targetTelegramUserId !== "string" ||
    typeof receipt.actorName !== "string" ||
    typeof receipt.targetName !== "string" ||
    typeof receipt.immediateHpRestored !== "number" ||
    typeof receipt.immediateManaRestored !== "number" ||
    typeof receipt.actorManaAfter !== "number" ||
    typeof receipt.targetHpAfter !== "number" ||
    typeof receipt.targetManaAfter !== "number"
  ) {
    return null;
  }

  return cloneVarenykSatedPayload(value as unknown as VarenykSatedPayloadV1);
}

export function parseVarenykSatedCombatState(value: unknown): VarenykSatedCombatStateV1 | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.activationId !== "string" ||
    typeof value.recipientCharacterId !== "string" ||
    !isNonNegativeInt(value.recipientRemortCount) ||
    !isPositiveInt(value.rank) ||
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
  return cloneVarenykSatedCombatState(value as unknown as VarenykSatedCombatStateV1);
}

export function cloneVarenykSatedPayload(payload: VarenykSatedPayloadV1): VarenykSatedPayloadV1 {
  return {
    ...payload,
    effectiveStats: {
      ...payload.effectiveStats,
      equipmentItemIds: [...payload.effectiveStats.equipmentItemIds]
    },
    receipt: { ...payload.receipt }
  };
}

export function cloneVarenykSatedCombatState(state: VarenykSatedCombatStateV1): VarenykSatedCombatStateV1 {
  return { ...state, pulseIds: [...state.pulseIds] };
}

function applyRecovery(resources: SatedResourceState, hp: number, mana: number): SatedRecoveryResult {
  const hpMax = Math.max(1, safeInt(resources.hpMax));
  const manaMax = Math.max(0, safeInt(resources.manaMax));
  const hpBefore = clamp(safeInt(resources.hp), 0, hpMax);
  const manaBefore = clamp(safeInt(resources.mana), 0, manaMax);
  const hpAfter = Math.min(hpMax, hpBefore + Math.max(0, safeInt(hp)));
  const manaAfter = Math.min(manaMax, manaBefore + Math.max(0, safeInt(mana)));

  return {
    resources: { hp: hpAfter, hpMax, mana: manaAfter, manaMax },
    hpRestored: hpAfter - hpBefore,
    manaRestored: manaAfter - manaBefore
  };
}

function parseDate(value: string): Date | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeInt(value: number): number {
  return Number.isFinite(value) ? Math.floor(value) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
