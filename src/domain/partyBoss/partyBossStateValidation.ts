import {
  BIG_BARREL_BROTHER_RULES_VERSION,
  clonePartyBossState,
  PARTY_BOSS_RULES_VERSION,
  type PartyBossResult,
  type PartyBossState,
  type PartyBossRoundSummary,
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
  participantCharacterIds?: readonly string[];
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
  requireString(state.leaderCharacterId, "leaderCharacterId", "party-session");
  if (!isPartyBossStatus(state.status) || state.status !== contract.status) {
    fail("status", "PartyBoss state status does not match the session row.");
  }
  if (!isPositiveInteger(state.turn) || state.turn !== contract.turn) {
    fail("turn", "PartyBoss state turn does not match the session row.");
  }

  const boss = record(state.boss, "boss", "PartyBoss state has no valid boss snapshot.");
  if (boss.monsterId !== contract.bossKey || typeof boss.name !== "string" || !isStringArray(boss.tags)) {
    fail("boss", "PartyBoss boss identity does not match the session row.");
  }
  for (const key of ["level", "hp", "hpMax", "attack", "armor", "resist", "dexterity"] as const) {
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
    for (const key of ["level", "hpMax", "manaMax", "strength", "dexterity", "intelligence", "charisma", "luck", "armor", "resist", "weaponDamage", "spellPower"] as const) {
      requireFiniteNonNegative(combatStats[key], `participants.${index}.combatStats.${key}`);
    }
    if (combatStats.accuracyBonusPp !== undefined) {
      requireFiniteNonNegative(combatStats.accuracyBonusPp, `participants.${index}.combatStats.accuracyBonusPp`);
    }
    for (const field of ["raceId", "classId"] as const) {
      if (combatStats[field] !== undefined) {
        requireString(combatStats[field], `participants.${index}.combatStats.${field}`);
      }
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
    if (
      resources.hpMax !== combatStats.hpMax ||
      resources.manaMax !== combatStats.manaMax ||
      (participant.status === "active" && (resources.hp as number) <= 0) ||
      (participant.status === "knocked-out" && (resources.hp as number) !== 0)
    ) {
      fail("numeric", `PartyBoss participant ${participant.characterId} combat snapshot is inconsistent.`);
    }
    validateResourceStatuses(resources, `participants.${index}.resources`);
    validateCombatItems(participant.combatItems, `participants.${index}.combatItems`);
    validateVarenykSated(participant.varenykSated, `participants.${index}.varenykSated`);
    validateBardInspiration(participant.bardInspiration, `participants.${index}.bardInspiration`);
    if (participant.bardMusicAvailableAt !== undefined && !isIsoDate(participant.bardMusicAvailableAt)) {
      fail("timestamp", `PartyBoss participant ${participant.characterId} has an invalid music timestamp.`);
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

  if (!participantIds.has(state.leaderCharacterId)) {
    fail("roster", "PartyBoss historical leader is not in the frozen roster.");
  }
  if (contract.participantCharacterIds) {
    const expectedIds = new Set(contract.participantCharacterIds);
    if (
      expectedIds.size !== contract.participantCharacterIds.length ||
      participantIds.size !== expectedIds.size ||
      [...participantIds].some((id) => !expectedIds.has(id))
    ) {
      fail("roster", "PartyBoss state roster does not match the party roster.");
    }
  }

  if (!Array.isArray(state.roundLog)) {
    fail("round-log", "PartyBoss round log must be an array.");
  }
  for (const [index, value] of state.roundLog.entries()) {
    const round = record(value, "round-log", `PartyBoss round ${index} is invalid.`);
    validateRoundSummary(round, `roundLog.${index}`);
  }
  validateTopLevelStatuses(state);
  if (!isIsoDate(state.startedAt) || (state.completedAt !== undefined && !isIsoDate(state.completedAt))) {
    fail("timestamp", "PartyBoss state has an invalid lifecycle timestamp.");
  }
  if (
    state.status === "active" && state.completedAt !== undefined ||
    state.status !== "active" && state.completedAt === undefined ||
    state.completedAt !== undefined && Date.parse(state.completedAt) < Date.parse(state.startedAt)
  ) {
    fail("timestamp", "PartyBoss lifecycle timestamps do not match its status.");
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

export function parsePartyBossRoundSummaryStrict(value: unknown): PartyBossRoundSummary {
  const round = record(value, "round-log", "PartyBoss historical round is invalid.");
  validateRoundSummary(round, "round");
  assertFiniteNumbers(round, "round");
  return JSON.parse(JSON.stringify(round)) as PartyBossRoundSummary;
}

export function parsePartyBossResultStrict(value: unknown, state: PartyBossState): PartyBossResult {
  const result = record(value, "not-object", "PartyBoss result must be an object.");
  if (state.status === "active" || !isPartyBossStatus(result.status) || result.status === "active") {
    fail("status", "PartyBoss terminal result has an invalid status.");
  }
  if (result.status !== state.status) {
    fail("status", "PartyBoss result status does not match the frozen state.");
  }
  if (!isIsoDate(result.completedAt)) {
    fail("timestamp", "PartyBoss result completion timestamp is invalid.");
  }
  requireFiniteNonNegative(result.bossHpAfter, "result.bossHpAfter");
  if (result.bossHpAfter !== state.boss.hp || !Array.isArray(result.participants)) {
    fail("participants", "PartyBoss result does not match the frozen state.");
  }

  const stateParticipants = new Map(state.participants.map((participant) => [participant.characterId, participant]));
  const resultParticipantIds = new Set<string>();
  for (const [index, raw] of result.participants.entries()) {
    const participant = record(raw, "participants", `PartyBoss result participant ${index} is invalid.`);
    requireString(participant.characterId, `result.participants.${index}.characterId`);
    const characterId = participant.characterId;
    if (resultParticipantIds.has(characterId) || !stateParticipants.has(characterId)) {
      fail("roster", "PartyBoss result roster does not match the frozen state.");
    }
    resultParticipantIds.add(characterId);
    if (!isParticipantStatus(participant.status) ||
      participant.status !== stateParticipants.get(characterId)?.status) {
      fail("participants", `PartyBoss result participant ${characterId} has an invalid status.`);
    }
    requireFiniteNonNegative(participant.damageDealt, `result.participants.${index}.damageDealt`);
    requireNonNegativeInteger(participant.submittedActions, `result.participants.${index}.submittedActions`);
    requireNonNegativeInteger(participant.timeoutActions, `result.participants.${index}.timeoutActions`);
    if (participant.attemptXp !== undefined) {
      requireFiniteNonNegative(participant.attemptXp, `result.participants.${index}.attemptXp`);
    }
    if (participant.reward !== undefined) {
      const reward = record(
        participant.reward,
        "participants",
        `PartyBoss result participant ${characterId} reward is invalid.`
      );
      requireFiniteNonNegative(reward.xp, `result.participants.${index}.reward.xp`);
      requireFiniteNonNegative(reward.gold, `result.participants.${index}.reward.gold`);
      if (!Array.isArray(reward.itemGrants)) {
        fail("participants", `PartyBoss result participant ${characterId} item grants are invalid.`);
      }
      reward.itemGrants.forEach((rawGrant, grantIndex) => {
        const grant = record(
          rawGrant,
          "participants",
          `PartyBoss result participant ${characterId} item grant ${grantIndex} is invalid.`
        );
        requireString(grant.itemId, `result.participants.${index}.reward.itemGrants.${grantIndex}.itemId`);
        requireString(grant.name, `result.participants.${index}.reward.itemGrants.${grantIndex}.name`);
        requireNonNegativeInteger(
          grant.quantity,
          `result.participants.${index}.reward.itemGrants.${grantIndex}.quantity`
        );
      });
    }
  }
  if (resultParticipantIds.size !== stateParticipants.size) {
    fail("roster", "PartyBoss result roster does not match the frozen state.");
  }

  assertFiniteNumbers(result, "result");
  return JSON.parse(JSON.stringify(result)) as PartyBossResult;
}

function requireString(value: unknown, path: string, code: PartyBossStateValidationCode = "participants"): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    fail(code, `PartyBoss string field ${path} is invalid.`);
  }
}

function validateResourceStatuses(resources: Record<string, unknown>, path: string): void {
  if (resources.guard !== undefined) {
    const guard = record(resources.guard, "participants", `${path}.guard is invalid.`);
    requireFiniteNonNegative(guard.consecutiveDefends, `${path}.guard.consecutiveDefends`);
    if (guard.abilityDamageReduction !== undefined) {
      requireFiniteNonNegative(guard.abilityDamageReduction, `${path}.guard.abilityDamageReduction`);
    }
  }
  if (resources.cooldowns !== undefined) {
    const cooldowns = record(resources.cooldowns, "participants", `${path}.cooldowns is invalid.`);
    if (cooldowns.skill !== undefined) {
      validateCooldown(cooldowns.skill, `${path}.cooldowns.skill`);
    }
    if (cooldowns.abilities !== undefined) {
      const abilities = record(cooldowns.abilities, "participants", `${path}.cooldowns.abilities is invalid.`);
      Object.entries(abilities).forEach(([key, value]) => {
        requireString(key, `${path}.cooldowns.abilities key`);
        validateCooldown(value, `${path}.cooldowns.abilities.${key}`);
      });
    }
  }
  if (resources.playerAbilityFumbles !== undefined) {
    const fumbles = record(resources.playerAbilityFumbles, "participants", `${path}.playerAbilityFumbles is invalid.`);
    if (fumbles.version !== 1) fail("participants", `${path}.playerAbilityFumbles version is invalid.`);
    const abilities = record(fumbles.abilities, "participants", `${path}.playerAbilityFumbles abilities are invalid.`);
    Object.entries(abilities).forEach(([key, value]) => {
      requireString(key, `${path}.playerAbilityFumbles ability key`);
      const entry = record(value, "participants", `${path}.playerAbilityFumbles.${key} is invalid.`);
      if (entry.version !== 1) fail("participants", `${path}.playerAbilityFumbles.${key} version is invalid.`);
      ["cycle", "usesInCycle", "triggerAt"].forEach((field) => requireFiniteNonNegative(entry[field], `${path}.playerAbilityFumbles.${key}.${field}`));
    });
  }
}

function validateCooldown(value: unknown, path: string): void {
  const cooldown = record(value, "participants", `${path} is invalid.`);
  requireString(cooldown.id, `${path}.id`);
  requireFiniteNonNegative(cooldown.remainingTurns, `${path}.remainingTurns`);
}

function validateCombatItems(value: unknown, path: string): void {
  if (value === undefined) return;
  const items = record(value, "participants", `${path} is invalid.`);
  for (const [collection, counter] of [["cooldowns", "remainingTurns"], ["uses", "count"]] as const) {
    if (items[collection] === undefined) continue;
    const rows = record(items[collection], "participants", `${path}.${collection} is invalid.`);
    Object.entries(rows).forEach(([key, raw]) => {
      requireString(key, `${path}.${collection} key`);
      const row = record(raw, "participants", `${path}.${collection}.${key} is invalid.`);
      requireString(row.itemId, `${path}.${collection}.${key}.itemId`);
      requireFiniteNonNegative(row[counter], `${path}.${collection}.${key}.${counter}`);
    });
  }
}

function validateVarenykSated(value: unknown, path: string): void {
  if (value === undefined || value === null) return;
  const status = record(value, "participants", `${path} is invalid.`);
  if (status.version !== 1) fail("participants", `${path}.version is invalid.`);
  ["activationId", "recipientCharacterId"].forEach((field) => requireString(status[field], `${path}.${field}`));
  ["recipientRemortCount", "rank", "outsideRemainderMs"].forEach((field) => requireFiniteNonNegative(status[field], `${path}.${field}`));
  ["expiresAt", "cursorAt", "leaseStartedAt"].forEach((field) => {
    if (!isIsoDate(status[field])) fail("timestamp", `${path}.${field} is invalid.`);
  });
  if (!isStringArray(status.pulseIds)) fail("participants", `${path}.pulseIds is invalid.`);
}

function validateBardInspiration(value: unknown, path: string): void {
  if (value === undefined || value === null) return;
  const status = record(value, "participants", `${path} is invalid.`);
  if (status.version !== 1) fail("participants", `${path}.version is invalid.`);
  ["activationId", "sourcePerformanceId", "sourceLocationId", "recipientCharacterId"].forEach((field) => requireString(status[field], `${path}.${field}`));
  ["recipientRemortCount", "accuracyBonusPp", "outsideRemainderMs"].forEach((field) => requireFiniteNonNegative(status[field], `${path}.${field}`));
  if (!["rough", "pleasant", "memorable", "legendary"].includes(status.grade as string)) fail("participants", `${path}.grade is invalid.`);
  ["expiresAt", "cursorAt", "leaseStartedAt"].forEach((field) => {
    if (!isIsoDate(status[field])) fail("timestamp", `${path}.${field} is invalid.`);
  });
  if (!isStringArray(status.pulseIds)) fail("participants", `${path}.pulseIds is invalid.`);
}

function validateRoundAction(value: unknown, path: string): void {
  const action = record(value, "round-log", `${path} is invalid.`);
  requireString(action.characterId, `${path}.characterId`, "round-log");
  if (!["attack", "defend", "skill", "race", "gear", "item", "taunt", "lament"].includes(action.action as string)) fail("round-log", `${path}.action is invalid.`);
  if (action.origin !== "manual" && action.origin !== "timeout") fail("round-log", `${path}.origin is invalid.`);
  if (![
    "hit",
    "critical-hit",
    "miss",
    "defended",
    "not-enough-mana",
    "skill-on-cooldown",
    "critical-fumble",
    "won",
    "item-used",
    "taunt-activated",
    "taunt-failed",
    "lament-activated"
  ].includes(action.outcome as string)) {
    fail("round-log", `${path}.outcome is invalid.`);
  }
  ["damage", "manaSpent"].forEach((field) => requireFiniteNonNegative(action[field], `${path}.${field}`));
  ["healing", "guard", "hpAfter"].forEach((field) => {
    if (action[field] !== undefined) requireFiniteNonNegative(action[field], `${path}.${field}`);
  });
  ["skillId", "itemId", "itemName"].forEach((field) => {
    if (action[field] !== undefined) requireString(action[field], `${path}.${field}`, "round-log");
  });
  if (action.supportTargets !== undefined) {
    if (!Array.isArray(action.supportTargets)) fail("round-log", `${path}.supportTargets is invalid.`);
    action.supportTargets.forEach((raw, index) => {
      const target = record(raw, "round-log", `${path}.supportTargets.${index} is invalid.`);
      requireString(target.characterId, `${path}.supportTargets.${index}.characterId`, "round-log");
      ["healing", "guard", "counterDamage"].forEach((field) => {
        if (target[field] !== undefined) requireFiniteNonNegative(target[field], `${path}.supportTargets.${index}.${field}`);
      });
    });
  }
  if (action.satedRecovery !== undefined) {
    const recovery = record(action.satedRecovery, "round-log", `${path}.satedRecovery is invalid.`);
    ["hpRestored", "manaRestored"].forEach((field) => requireFiniteNonNegative(recovery[field], `${path}.satedRecovery.${field}`));
  }
}

function validateRoundSummary(round: Record<string, unknown>, path: string): void {
  if (!isPositiveInteger(round.turn) || !Array.isArray(round.actions) || !Array.isArray(round.bossRetaliations)) {
    fail("round-log", `${path} is incomplete.`);
  }
  ["bossDamage", "bossHpAfter"].forEach((field) => requireFiniteNonNegative(round[field], `${path}.${field}`));
  if (!isPartyBossStatus(round.statusAfter)) fail("round-log", `${path}.statusAfter is invalid.`);
  round.actions.forEach((action, index) => validateRoundAction(action, `${path}.actions.${index}`));
  round.bossRetaliations.forEach((entry, index) => validateRetaliation(entry, `${path}.bossRetaliations.${index}`));
  if (round.participantsAfter !== undefined) {
    if (!Array.isArray(round.participantsAfter)) fail("round-log", `${path}.participantsAfter is invalid.`);
    round.participantsAfter.forEach((entry, index) => validateParticipantAfter(entry, `${path}.participantsAfter.${index}`));
  }
  if (round.wardSign !== undefined) {
    const ward = record(round.wardSign, "round-log", `${path}.wardSign is invalid.`);
    if (ward.kind !== "kharakternyk" || ward.status !== "triggered") fail("round-log", `${path}.wardSign identity is invalid.`);
    requireNonNegativeInteger(ward.supportCount, `${path}.wardSign.supportCount`);
    ["mitigationPercent", "preventedDamage"].forEach((field) => requireFiniteNonNegative(ward[field], `${path}.wardSign.${field}`));
    validateWardCounterBounds(ward, `${path}.wardSign`);
    if (!isStringArray(ward.affectedCharacterIds)) fail("round-log", `${path}.wardSign.affectedCharacterIds is invalid.`);
  }
  if (round.personalProtocol !== undefined) {
    const protocol = record(round.personalProtocol, "round-log", `${path}.personalProtocol is invalid.`);
    if (protocol.kind !== "bureaucramancer-personal-protocol-13b" || protocol.status !== "triggered") fail("round-log", `${path}.personalProtocol identity is invalid.`);
    ["characterId", "bossActionId"].forEach((field) => requireString(protocol[field], `${path}.personalProtocol.${field}`, "round-log"));
    ["preventedDamage", "triggeredTurn", "spentCount", "signatureCount"].forEach((field) => requireFiniteNonNegative(protocol[field], `${path}.personalProtocol.${field}`));
  }
  if (round.warriorTaunt !== undefined) {
    const taunt = record(round.warriorTaunt, "round-log", `${path}.warriorTaunt is invalid.`);
    ["activatedCharacterId", "redirectedCharacterId", "expiredCharacterId"].forEach((field) => {
      if (taunt[field] !== undefined) requireString(taunt[field], `${path}.warriorTaunt.${field}`, "round-log");
    });
    if (taunt.bossAttacksRemaining !== undefined) requireFiniteNonNegative(taunt.bossAttacksRemaining, `${path}.warriorTaunt.bossAttacksRemaining`);
    if (taunt.redirectedAttackKind !== undefined && taunt.redirectedAttackKind !== "focused" && taunt.redirectedAttackKind !== "broad") fail("round-log", `${path}.warriorTaunt.redirectedAttackKind is invalid.`);
  }
  if (round.bardMusic !== undefined) {
    const music = record(round.bardMusic, "round-log", `${path}.bardMusic is invalid.`);
    if (music.kind !== "lament") fail("round-log", `${path}.bardMusic.kind is invalid.`);
    ["activationId", "sourceCharacterId"].forEach((field) => requireString(music[field], `${path}.bardMusic.${field}`, "round-log"));
    ["damageReduction", "remainingBossResponses"].forEach((field) => requireFiniteNonNegative(music[field], `${path}.bardMusic.${field}`));
    ["activated", "expired"].forEach((field) => { if (typeof music[field] !== "boolean") fail("round-log", `${path}.bardMusic.${field} is invalid.`); });
  }
}

function validateRetaliation(value: unknown, path: string): void {
  const retaliation = record(value, "round-log", `${path} is invalid.`);
  requireString(retaliation.characterId, `${path}.characterId`, "round-log");
  ["damage", "hpAfter"].forEach((field) => requireFiniteNonNegative(retaliation[field], `${path}.${field}`));
  ["damageBeforeWard", "wardPreventedDamage", "damageBeforeProtocol", "protocolPreventedDamage", "damageBeforeLament", "lamentPreventedDamage", "counterDamage"].forEach((field) => {
    if (retaliation[field] !== undefined) requireFiniteNonNegative(retaliation[field], `${path}.${field}`);
  });
  if (retaliation.tauntRedirected !== undefined && typeof retaliation.tauntRedirected !== "boolean") fail("round-log", `${path}.tauntRedirected is invalid.`);
  if (retaliation.tauntOriginalKind !== undefined && retaliation.tauntOriginalKind !== "focused" && retaliation.tauntOriginalKind !== "broad") fail("round-log", `${path}.tauntOriginalKind is invalid.`);
}

function validateParticipantAfter(value: unknown, path: string): void {
  const participant = record(value, "round-log", `${path} is invalid.`);
  requireString(participant.characterId, `${path}.characterId`, "round-log");
  if (!isParticipantStatus(participant.status)) fail("round-log", `${path}.status is invalid.`);
  ["hp", "hpMax", "mana", "manaMax"].forEach((field) => requireFiniteNonNegative(participant[field], `${path}.${field}`));
  if (
    (participant.hpMax as number) <= 0 ||
    (participant.hp as number) > (participant.hpMax as number) ||
    (participant.mana as number) > (participant.manaMax as number) ||
    (participant.status === "active" && (participant.hp as number) <= 0) ||
    (participant.status === "knocked-out" && (participant.hp as number) !== 0)
  ) fail("numeric", `${path} resources are outside valid bounds.`);
  validateResourceStatuses(participant, path);
  validateCombatItems(participant.combatItems, `${path}.combatItems`);
  validateVarenykSated(participant.varenykSated, `${path}.varenykSated`);
  validateBardInspiration(participant.bardInspiration, `${path}.bardInspiration`);
}

function validateTopLevelStatuses(state: Record<string, unknown>): void {
  if (state.wardSign !== undefined) {
    const ward = record(state.wardSign, "participants", "PartyBoss ward sign is invalid.");
    if (ward.kind !== "kharakternyk" || (ward.status !== "carried" && ward.status !== "broken")) fail("participants", "PartyBoss ward sign status is invalid.");
    requireString(ward.placerCharacterId, "wardSign.placerCharacterId");
    requireNonNegativeInteger(ward.supportCount, "wardSign.supportCount");
    requireFiniteNonNegative(ward.mitigationPercent, "wardSign.mitigationPercent");
    validateWardCounterBounds(ward, "wardSign");
    ["triggeredTurn", "preventedDamage"].forEach((field) => {
      if (ward[field] !== undefined) requireFiniteNonNegative(ward[field], `wardSign.${field}`);
    });
    if (ward.affectedCharacterIds !== undefined && !isStringArray(ward.affectedCharacterIds)) fail("participants", "PartyBoss ward recipients are invalid.");
  }
  if (state.personalProtocol !== undefined) {
    const protocol = record(state.personalProtocol, "participants", "PartyBoss protocol is invalid.");
    if (protocol.kind !== "bureaucramancer-personal-protocol-13b") fail("participants", "PartyBoss protocol kind is invalid.");
    ["protocolId", "filerCharacterId"].forEach((field) => requireString(protocol[field], `personalProtocol.${field}`));
    if (!Array.isArray(protocol.signatures)) fail("participants", "PartyBoss protocol signatures are invalid.");
    protocol.signatures.forEach((raw, index) => {
      const signature = record(raw, "participants", `personalProtocol.signatures.${index} is invalid.`);
      requireString(signature.characterId, `personalProtocol.signatures.${index}.characterId`);
      if (signature.status !== "unspent" && signature.status !== "spent") fail("participants", `personalProtocol.signatures.${index}.status is invalid.`);
      if (signature.triggeredTurn !== undefined) requireFiniteNonNegative(signature.triggeredTurn, `personalProtocol.signatures.${index}.triggeredTurn`);
      if (signature.preventedDamage !== undefined) requireFiniteNonNegative(signature.preventedDamage, `personalProtocol.signatures.${index}.preventedDamage`);
      if (signature.bossActionId !== undefined) requireString(signature.bossActionId, `personalProtocol.signatures.${index}.bossActionId`);
    });
  }
  if (state.warriorTaunt !== undefined) {
    const taunt = record(state.warriorTaunt, "participants", "PartyBoss warrior taunt is invalid.");
    const cooldowns = record(taunt.cooldowns, "participants", "PartyBoss warrior taunt cooldowns are invalid.");
    Object.entries(cooldowns).forEach(([key, raw]) => {
      requireString(key, "warriorTaunt.cooldowns key");
      const cooldown = record(raw, "participants", `warriorTaunt.cooldowns.${key} is invalid.`);
      requireFiniteNonNegative(cooldown.availableTurn, `warriorTaunt.cooldowns.${key}.availableTurn`);
    });
    if (taunt.active !== undefined) {
      const active = record(taunt.active, "participants", "PartyBoss active taunt is invalid.");
      requireString(active.characterId, "warriorTaunt.active.characterId");
      ["activatedTurn", "bossAttacksRemaining"].forEach((field) => requireFiniteNonNegative(active[field], `warriorTaunt.active.${field}`));
    }
  }
  if (state.bardMusic !== undefined) {
    const music = record(state.bardMusic, "participants", "PartyBoss bard music is invalid.");
    if (music.kind === "inspiration") {
      if (!isStringArray(music.sourcePerformanceIds)) fail("participants", "PartyBoss inspiration sources are invalid.");
    } else if (music.kind === "lament") {
      ["activationId", "sourceCharacterId"].forEach((field) => requireString(music[field], `bardMusic.${field}`));
      ["damageReduction", "remainingBossResponses", "activatedTurn"].forEach((field) => requireFiniteNonNegative(music[field], `bardMusic.${field}`));
      if (!["rough", "pleasant", "memorable", "legendary"].includes(music.grade as string)) fail("participants", "PartyBoss lament grade is invalid.");
    } else if (music.kind !== "none") {
      fail("participants", "PartyBoss bard music kind is invalid.");
    }
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

function requireNonNegativeInteger(value: unknown, path: string): void {
  requireFiniteNonNegative(value, path);
  if (!Number.isInteger(value)) {
    fail("numeric", `PartyBoss numeric field ${path} must be an integer.`);
  }
}

function validateWardCounterBounds(ward: Record<string, unknown>, path: string): void {
  if (ward.supportCap !== undefined && !isPositiveInteger(ward.supportCap)) {
    fail("numeric", `PartyBoss numeric field ${path}.supportCap is invalid.`);
  }
  for (const field of ["usesRemaining", "usesMax"] as const) {
    if (ward[field] !== undefined) {
      requireNonNegativeInteger(ward[field], `${path}.${field}`);
    }
  }
  if (ward.usesMax !== undefined && (ward.usesMax as number) <= 0) {
    fail("numeric", `PartyBoss numeric field ${path}.usesMax is invalid.`);
  }
  if (
    ward.usesRemaining !== undefined &&
    ward.usesMax !== undefined &&
    (ward.usesRemaining as number) > (ward.usesMax as number)
  ) {
    fail("numeric", `PartyBoss Ward counters at ${path} are outside valid bounds.`);
  }
  if (
    ward.supportCap !== undefined &&
    typeof ward.supportCount === "number" &&
    ward.supportCount > ward.supportCap
  ) {
    fail("numeric", `PartyBoss Ward support at ${path} is outside valid bounds.`);
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
