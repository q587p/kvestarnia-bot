import {
  getCombatSkillProfile,
  resolveActorCombatAction,
  type CombatActorStats,
  type CombatState,
  type CombatTurnSummary
} from "../combat";
import type { CharacterStats } from "../characters/starterStats";
import type { EquipmentEffectSummary } from "../progression/effectiveStats";
import type { RandomSource } from "../../shared/random";
import { INSTANT_DUEL_BALANCE_VERSION, prepareBalancedDuelists, type DuelistBalanceAudit } from "./duelBalance";
import type { DuelistSummary, DuelOutcomeSide } from "./duelResolver";

export const TURN_BASED_DUEL_RULES_VERSION = "turn-based-duel-v1";
export const TURN_BASED_DUEL_TURN_SECONDS = 23;
export const TURN_BASED_DUEL_MAX_TURNS = 93;

export type DuelMode = "quick" | "turn-based";
export type TurnBasedDuelStatus = "active" | "resolved" | "expired" | "forfeited";
export type TurnBasedDuelAction = "attack" | "skill" | "surrender";

export interface TurnBasedDuelParticipantSnapshot {
  characterId: string;
  displayName: string;
  title: string;
  raceId: string;
  raceName: string;
  classId: string;
  className: string;
  level: number;
  remortCount: number;
  stats: CharacterStats;
  equipmentEffects?: EquipmentEffectSummary;
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  combatStats: CombatActorStats;
  cooldowns?: CombatState["cooldowns"];
  balanceAudit: DuelistBalanceAudit;
}

export interface TurnBasedDuelActionSummary {
  actorCharacterId: string;
  defenderCharacterId: string;
  action: TurnBasedDuelAction | "timeout-attack";
  outcome: CombatTurnSummary["heroOutcome"] | "surrendered" | "draw";
  damage: number;
  manaSpent: number;
  critical: boolean;
  skillId?: string;
}

export interface TurnBasedDuelOutcome {
  outcome: DuelOutcomeSide;
  winnerCharacterId: string | null;
  loserCharacterId: string | null;
  reason: "defeat" | "surrender" | "max-turns" | "expired";
}

export interface TurnBasedDuelState {
  mode: "turn-based";
  status: TurnBasedDuelStatus;
  rulesVersion: string;
  balanceVersion: string;
  turn: number;
  actingCharacterId: string;
  participants: {
    challenger: TurnBasedDuelParticipantSnapshot;
    target: TurnBasedDuelParticipantSnapshot;
  };
  lastAction?: TurnBasedDuelActionSummary;
  outcome?: TurnBasedDuelOutcome;
}

export interface StartTurnBasedDuelInput {
  challenger: DuelistSummary;
  target: DuelistSummary;
  rng: RandomSource;
}

export function startTurnBasedDuel(input: StartTurnBasedDuelInput): TurnBasedDuelState {
  const prepared = prepareBalancedDuelists({
    challenger: input.challenger,
    target: input.target
  });
  const challengerInitiative = rollInitiative(prepared.challenger, input.rng);
  const targetInitiative = rollInitiative(prepared.target, input.rng);
  const actingCharacterId =
    challengerInitiative === targetInitiative
      ? input.rng.nextFloat() < 0.5
        ? input.challenger.id
        : input.target.id
      : challengerInitiative > targetInitiative
        ? input.challenger.id
        : input.target.id;

  return {
    mode: "turn-based",
    status: "active",
    rulesVersion: TURN_BASED_DUEL_RULES_VERSION,
    balanceVersion: INSTANT_DUEL_BALANCE_VERSION,
    turn: 1,
    actingCharacterId,
    participants: {
      challenger: buildParticipantSnapshot(prepared.challenger),
      target: buildParticipantSnapshot(prepared.target)
    }
  };
}

export type ResolveTurnBasedDuelActionResult =
  | { ok: true; state: TurnBasedDuelState; summary: TurnBasedDuelActionSummary }
  | { ok: false; reason: "inactive" | "wrong-actor" | "not-participant"; state: TurnBasedDuelState };

export function resolveTurnBasedDuelAction(input: {
  state: TurnBasedDuelState;
  actorCharacterId: string;
  action: TurnBasedDuelAction;
  rng: RandomSource;
}): ResolveTurnBasedDuelActionResult {
  const state = cloneTurnBasedDuelState(input.state);

  if (state.status !== "active") {
    return { ok: false, reason: "inactive", state };
  }

  if (!findParticipantSide(state, input.actorCharacterId)) {
    return { ok: false, reason: "not-participant", state };
  }

  if (state.actingCharacterId !== input.actorCharacterId) {
    return { ok: false, reason: "wrong-actor", state };
  }

  const actorSide = findParticipantSide(state, input.actorCharacterId);
  const defenderSide = actorSide === "challenger" ? "target" : "challenger";

  if (!actorSide) {
    return { ok: false, reason: "not-participant", state };
  }

  const actor = state.participants[actorSide];
  const defender = state.participants[defenderSide];

  if (input.action === "surrender") {
    const summary = {
      actorCharacterId: actor.characterId,
      defenderCharacterId: defender.characterId,
      action: "surrender" as const,
      outcome: "surrendered" as const,
      damage: 0,
      manaSpent: 0,
      critical: false
    };
    state.status = "forfeited";
    state.outcome = buildOutcome(state, defender.characterId, "surrender");
    state.lastAction = summary;
    return { ok: true, state, summary };
  }

  const resolved = resolveActorCombatAction({
    actorState: {
      hp: actor.hp,
      hpMax: actor.hpMax,
      mana: actor.mana,
      manaMax: actor.manaMax,
      cooldowns: actor.cooldowns
    },
    defenderState: {
      hp: defender.hp,
      hpMax: defender.hpMax,
      mana: defender.mana,
      manaMax: defender.manaMax,
      cooldowns: defender.cooldowns
    },
    actorStats: actor.combatStats,
    defenderStats: buildDefenderStats(defender),
    action: input.action,
    rng: input.rng
  });

  actor.hp = resolved.actorState.hp;
  actor.mana = resolved.actorState.mana;
  actor.cooldowns = resolved.actorState.cooldowns;
  defender.hp = resolved.defenderState.hp;
  defender.mana = resolved.defenderState.mana;
  defender.cooldowns = resolved.defenderState.cooldowns;

  const summary = {
    actorCharacterId: actor.characterId,
    defenderCharacterId: defender.characterId,
    action: input.action,
    outcome: resolved.summary.actorOutcome,
    damage: resolved.summary.actorDamage,
    manaSpent: resolved.summary.manaSpent,
    critical: resolved.summary.critical,
    ...(resolved.summary.skillId ? { skillId: resolved.summary.skillId } : {})
  };
  state.lastAction = summary;

  if (defender.hp <= 0) {
    state.status = "resolved";
    state.outcome = buildOutcome(state, actor.characterId, "defeat");
    return { ok: true, state, summary };
  }

  if (state.turn >= TURN_BASED_DUEL_MAX_TURNS) {
    state.status = "resolved";
    state.outcome = {
      outcome: "draw",
      winnerCharacterId: null,
      loserCharacterId: null,
      reason: "max-turns"
    };
    state.lastAction = { ...summary, outcome: "draw" };
    return { ok: true, state, summary: state.lastAction };
  }

  state.turn += 1;
  state.actingCharacterId = defender.characterId;

  return { ok: true, state, summary };
}

export function expireTurnBasedDuel(state: TurnBasedDuelState): TurnBasedDuelState {
  if (state.status !== "active") {
    return cloneTurnBasedDuelState(state);
  }

  const next = cloneTurnBasedDuelState(state);

  next.status = "expired";
  next.outcome = {
    outcome: "draw",
    winnerCharacterId: null,
    loserCharacterId: null,
    reason: "expired"
  };

  return next;
}

export function getTurnBasedDuelSkillLabel(participant: Pick<TurnBasedDuelParticipantSnapshot, "classId">): {
  skillId: string;
  manaCost: number;
} {
  const skill = getCombatSkillProfile(participant.classId);

  return {
    skillId: skill.id,
    manaCost: skill.manaCost
  };
}

function buildParticipantSnapshot(
  character: ReturnType<typeof prepareBalancedDuelists>["challenger"]
): TurnBasedDuelParticipantSnapshot {
  const equipment = character.equipmentEffects;

  return {
    characterId: character.id,
    displayName: character.name,
    title: character.title,
    raceId: character.raceId,
    raceName: character.raceName,
    classId: character.classId,
    className: character.className,
    level: character.level,
    remortCount: character.remortCount ?? 0,
    stats: { ...character.stats },
    ...(equipment ? { equipmentEffects: { ...equipment } } : {}),
    hp: character.hpCurrent,
    hpMax: character.hpMax,
    mana: character.manaCurrent,
    manaMax: character.manaMax,
    combatStats: {
      level: character.level,
      hpMax: character.hpMax,
      manaMax: character.manaMax,
      classId: character.classId,
      ...character.stats,
      armor: equipment?.armor ?? 0,
      resist: equipment?.resist ?? 0,
      weaponDamage: equipment?.weaponDamage ?? 0,
      spellPower: equipment?.spellPower ?? 0
    },
    balanceAudit: character.balanceAudit
  };
}

function buildDefenderStats(participant: TurnBasedDuelParticipantSnapshot) {
  return {
    monsterId: participant.characterId,
    name: participant.displayName,
    level: participant.level,
    hpMax: participant.hpMax,
    attack: Math.max(1, Math.floor(participant.combatStats.strength / 2) + participant.level),
    armor: participant.combatStats.armor ?? 0,
    resist: participant.combatStats.resist ?? 0,
    dexterity: participant.combatStats.dexterity,
    classId: participant.classId,
    className: participant.className,
    raceId: participant.raceId,
    raceName: participant.raceName,
    title: participant.title,
    spellPower: participant.combatStats.spellPower ?? 0,
    tags: []
  };
}

function rollInitiative(character: ReturnType<typeof prepareBalancedDuelists>["challenger"], rng: RandomSource): number {
  return character.stats.dexterity * 2 + character.stats.luck + rng.nextInt(1, 13);
}

function findParticipantSide(
  state: TurnBasedDuelState,
  characterId: string
): "challenger" | "target" | null {
  if (state.participants.challenger.characterId === characterId) {
    return "challenger";
  }

  if (state.participants.target.characterId === characterId) {
    return "target";
  }

  return null;
}

function buildOutcome(
  state: TurnBasedDuelState,
  winnerCharacterId: string,
  reason: TurnBasedDuelOutcome["reason"]
): TurnBasedDuelOutcome {
  const winnerSide = findParticipantSide(state, winnerCharacterId);
  const loser =
    winnerSide === "challenger" ? state.participants.target : state.participants.challenger;

  return {
    outcome: winnerSide === "challenger" ? "challenger" : "target",
    winnerCharacterId,
    loserCharacterId: loser.characterId,
    reason
  };
}

function cloneTurnBasedDuelState(state: TurnBasedDuelState): TurnBasedDuelState {
  return {
    ...state,
    participants: {
      challenger: cloneParticipant(state.participants.challenger),
      target: cloneParticipant(state.participants.target)
    },
    ...(state.lastAction ? { lastAction: { ...state.lastAction } } : {}),
    ...(state.outcome ? { outcome: { ...state.outcome } } : {})
  };
}

function cloneParticipant(
  participant: TurnBasedDuelParticipantSnapshot
): TurnBasedDuelParticipantSnapshot {
  return {
    ...participant,
    stats: { ...participant.stats },
    combatStats: { ...participant.combatStats },
    ...(participant.equipmentEffects
      ? { equipmentEffects: { ...participant.equipmentEffects } }
      : {}),
    ...(participant.cooldowns?.skill
      ? { cooldowns: { skill: { ...participant.cooldowns.skill } } }
      : {})
  };
}
