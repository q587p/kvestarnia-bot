import {
  BIG_BARREL_BROTHER_RULES_VERSION,
  clonePartyBossState,
  PARTY_BOSS_RULES_VERSION,
  type PartyBossState,
  type PartyBossStatus
} from "./partyBoss";

export type PartyBossStateValidationCode =
  | "not-object"
  | "rules-version"
  | "party-session"
  | "status"
  | "turn"
  | "boss"
  | "participants"
  | "roster"
  | "round-log"
  | "timestamp"
  | "numeric"
  | "clone";

export class PartyBossStateValidationError extends Error {
  constructor(
    readonly code: PartyBossStateValidationCode,
    message: string
  ) {
    super(message);
    this.name = "PartyBossStateValidationError";
  }
}

export interface PartyBossStateContract {
  rulesVersion: string;
  partySessionId: string;
  status: PartyBossStatus;
  turn: number;
  bossKey: string;
  participantCharacterIds: readonly string[];
}

export function parsePartyBossStateStrict(
  value: unknown,
  contract: PartyBossStateContract
): PartyBossState {
  const state = record(value, "not-object", "PartyBoss state must be an object.");
  if (
    state.rulesVersion !== PARTY_BOSS_RULES_VERSION &&
    state.rulesVersion !== BIG_BARREL_BROTHER_RULES_VERSION
  ) {
    fail("rules-version", "PartyBoss state has an unsupported rules version.");
  }
  if (state.rulesVersion !== contract.rulesVersion) {
    fail("rules-version", "PartyBoss state rules do not match the session row.");
  }
  if (state.partySessionId !== contract.partySessionId) {
    fail("party-session", "PartyBoss state points at another party session.");
  }
  if (!isPartyBossStatus(state.status) || state.status !== contract.status) {
    fail("status", "PartyBoss state status does not match the session row.");
  }
  if (!isPositiveInteger(state.turn) || state.turn !== contract.turn) {
    fail("turn", "PartyBoss state turn does not match the session row.");
  }

  const boss = record(state.boss, "boss", "PartyBoss state has no valid boss snapshot.");
  if (boss.monsterId !== contract.bossKey || typeof boss.name !== "string" || !Array.isArray(boss.tags)) {
    fail("boss", "PartyBoss boss identity does not match the session row.");
  }
  for (const key of ["level", "hp", "hpMax", "attack", "armor", "resist"] as const) {
    requireFiniteNonNegative(boss[key], `boss.${key}`);
  }
  if ((boss.hpMax as number) <= 0 || (boss.level as number) <= 0 || (boss.hp as number) > (boss.hpMax as number)) {
    fail("numeric", "PartyBoss boss resources are outside valid bounds.");
  }

  if (!Array.isArray(state.participants) || state.participants.length === 0) {
    fail("participants", "PartyBoss state has no participant roster.");
  }
  const participantIds = new Set<string>();
  for (const [index, value] of state.participants.entries()) {
    const participant = record(value, "participants", `PartyBoss participant ${index} is invalid.`);
    if (typeof participant.characterId !== "string" || participant.characterId.length === 0) {
      fail("participants", `PartyBoss participant ${index} has no character id.`);
    }
    if (participantIds.has(participant.characterId)) {
      fail("roster", "PartyBoss state contains a duplicate participant.");
    }
    participantIds.add(participant.characterId);
    if (typeof participant.name !== "string" || !isParticipantStatus(participant.status)) {
      fail("participants", `PartyBoss participant ${participant.characterId} has an invalid identity.`);
    }
    requireFiniteNonNegative(participant.remortCount, `participants.${index}.remortCount`);
    const combatStats = record(
      participant.combatStats,
      "participants",
      `PartyBoss participant ${participant.characterId} has no combat stats.`
    );
    for (const key of ["level", "hpMax", "manaMax", "strength", "dexterity", "intelligence", "charisma", "luck"] as const) {
      requireFiniteNonNegative(combatStats[key], `participants.${index}.combatStats.${key}`);
    }
    const resources = record(
      participant.resources,
      "participants",
      `PartyBoss participant ${participant.characterId} has no resources.`
    );
    for (const key of ["hp", "hpMax", "mana", "manaMax"] as const) {
      requireFiniteNonNegative(resources[key], `participants.${index}.resources.${key}`);
    }
    if (
      (resources.hpMax as number) <= 0 ||
      (resources.manaMax as number) < 0 ||
      (resources.hp as number) > (resources.hpMax as number) ||
      (resources.mana as number) > (resources.manaMax as number)
    ) {
      fail("numeric", `PartyBoss participant ${participant.characterId} resources are outside valid bounds.`);
    }
    const contribution = record(
      participant.contribution,
      "participants",
      `PartyBoss participant ${participant.characterId} has no contribution snapshot.`
    );
    for (const key of ["submittedActions", "timeoutActions", "damageDealt", "damageTaken"] as const) {
      requireFiniteNonNegative(contribution[key], `participants.${index}.contribution.${key}`);
    }
    for (const key of ["healingDone", "itemUses"] as const) {
      if (contribution[key] !== undefined) {
        requireFiniteNonNegative(contribution[key], `participants.${index}.contribution.${key}`);
      }
    }
    if (participant.equipmentAbilityGrantIds !== undefined && !isStringArray(participant.equipmentAbilityGrantIds)) {
      fail("participants", `PartyBoss participant ${participant.characterId} has invalid equipment grants.`);
    }
  }

  const expectedIds = new Set(contract.participantCharacterIds);
  if (
    expectedIds.size !== contract.participantCharacterIds.length ||
    participantIds.size !== expectedIds.size ||
    [...participantIds].some((id) => !expectedIds.has(id))
  ) {
    fail("roster", "PartyBoss state roster does not match the party roster.");
  }

  if (!Array.isArray(state.roundLog)) {
    fail("round-log", "PartyBoss round log must be an array.");
  }
  for (const [index, value] of state.roundLog.entries()) {
    const round = record(value, "round-log", `PartyBoss round ${index} is invalid.`);
    if (!isPositiveInteger(round.turn) || !Array.isArray(round.actions) || !Array.isArray(round.bossRetaliations)) {
      fail("round-log", `PartyBoss round ${index} is incomplete.`);
    }
  }
  if (!isIsoDate(state.startedAt) || (state.completedAt !== undefined && !isIsoDate(state.completedAt))) {
    fail("timestamp", "PartyBoss state has an invalid lifecycle timestamp.");
  }
  assertFiniteNumbers(state, "state");

  try {
    return clonePartyBossState(state as unknown as PartyBossState);
  } catch (error) {
    throw new PartyBossStateValidationError(
      "clone",
      `PartyBoss state cannot be cloned safely: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function parsePartyBossStatusStrict(value: string): PartyBossStatus {
  if (!isPartyBossStatus(value)) {
    fail("status", `Unsupported PartyBoss session status: ${value}`);
  }
  return value;
}

function record(value: unknown, code: PartyBossStateValidationCode, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(code, message);
  }
  return value as Record<string, unknown>;
}

function requireFiniteNonNegative(value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("numeric", `PartyBoss numeric field ${path} is invalid.`);
  }
}

function assertFiniteNumbers(value: unknown, path: string): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    fail("numeric", `PartyBoss numeric field ${path} is not finite.`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteNumbers(entry, `${path}.${index}`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertFiniteNumbers(entry, `${path}.${key}`);
    }
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isPartyBossStatus(value: unknown): value is PartyBossStatus {
  return value === "active" || value === "won" || value === "lost" || value === "cancelled";
}

function isParticipantStatus(value: unknown): value is "active" | "knocked-out" {
  return value === "active" || value === "knocked-out";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function fail(code: PartyBossStateValidationCode, message: string): never {
  throw new PartyBossStateValidationError(code, message);
}
