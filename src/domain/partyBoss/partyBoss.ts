import {
  resolveActorCombatAction,
  type ActorCombatActionSummary,
  type CombatActorResourceState
} from "../combat/combatEngine";
import type {
  CombatActorStats,
  MonsterCombatStats,
  PlayerCombatActionType
} from "../combat/combatState";
import { SeededRandomSource } from "../../shared/random";

export const PARTY_BOSS_RULES_VERSION = "party-boss-proof-v1";
export const PARTY_BOSS_MAX_TURNS = 5;
export const PARTY_BOSS_TURN_MS = 23 * 1000;

export type PartyBossActionKey = Extract<PlayerCombatActionType, "attack" | "defend" | "skill" | "race">;
export type PartyBossParticipantStatus = "active" | "knocked-out";
export type PartyBossStatus = "active" | "won" | "lost" | "cancelled";

export interface PartyBossParticipantState {
  characterId: string;
  name: string;
  remortCount: number;
  status: PartyBossParticipantStatus;
  combatStats: CombatActorStats;
  resources: CombatActorResourceState;
  contribution: {
    submittedActions: number;
    timeoutActions: number;
    damageDealt: number;
    damageTaken: number;
  };
}

export interface PartyBossState {
  rulesVersion: typeof PARTY_BOSS_RULES_VERSION;
  partySessionId: string;
  status: PartyBossStatus;
  turn: number;
  boss: MonsterCombatStats & { hp: number };
  participants: PartyBossParticipantState[];
  roundLog: PartyBossRoundSummary[];
  startedAt: string;
  completedAt?: string;
}

export interface PartyBossRoundActionInput {
  characterId: string;
  action: PartyBossActionKey;
  origin?: "manual" | "timeout";
}

export interface PartyBossRoundSummary {
  turn: number;
  actions: PartyBossParticipantActionSummary[];
  bossDamage: number;
  bossHpAfter: number;
  bossRetaliations: PartyBossRetaliationSummary[];
  statusAfter: PartyBossStatus;
}

export interface PartyBossParticipantActionSummary {
  characterId: string;
  action: PartyBossActionKey;
  origin: "manual" | "timeout";
  outcome: ActorCombatActionSummary["actorOutcome"];
  damage: number;
  manaSpent: number;
  skillId?: string;
}

export interface PartyBossRetaliationSummary {
  characterId: string;
  damage: number;
  hpAfter: number;
}

export interface PartyBossResult {
  status: Exclude<PartyBossStatus, "active">;
  completedAt: string;
  participants: Array<{
    characterId: string;
    status: PartyBossParticipantStatus;
    damageDealt: number;
    submittedActions: number;
    timeoutActions: number;
  }>;
  bossHpAfter: number;
}

export function createPartyBossState(input: {
  partySessionId: string;
  participants: Array<{
    characterId: string;
    name: string;
    remortCount: number;
    combatStats: CombatActorStats & { hpCurrent: number; manaCurrent: number };
  }>;
  now: Date;
}): PartyBossState {
  const level = Math.max(
    1,
    Math.round(input.participants.reduce((sum, participant) => sum + participant.combatStats.level, 0) / Math.max(1, input.participants.length))
  );
  const participantCount = Math.max(1, input.participants.length);
  const bossHpMax = 23 + level * 8 + participantCount * 13;

  return {
    rulesVersion: PARTY_BOSS_RULES_VERSION,
    partySessionId: input.partySessionId,
    status: "active",
    turn: 1,
    boss: {
      monsterId: "party-boss-proof-one",
      name: "Контрольний Бос Одинарного Зразка",
      level,
      hp: bossHpMax,
      hpMax: bossHpMax,
      attack: 4 + level + participantCount,
      armor: 2 + Math.floor(level / 3),
      resist: 1 + Math.floor(level / 4),
      dexterity: 5 + Math.floor(level / 2),
      tags: ["party-boss-proof"]
    },
    participants: input.participants.map((participant) => ({
      characterId: participant.characterId,
      name: participant.name,
      remortCount: participant.remortCount,
      status: "active",
      combatStats: participant.combatStats,
      resources: {
        hp: Math.max(0, Math.floor(participant.combatStats.hpCurrent)),
        hpMax: Math.max(1, Math.floor(participant.combatStats.hpMax)),
        mana: Math.max(0, Math.floor(participant.combatStats.manaCurrent)),
        manaMax: Math.max(0, Math.floor(participant.combatStats.manaMax))
      },
      contribution: {
        submittedActions: 0,
        timeoutActions: 0,
        damageDealt: 0,
        damageTaken: 0
      }
    })),
    roundLog: [],
    startedAt: input.now.toISOString()
  };
}

export function resolvePartyBossRound(input: {
  state: PartyBossState;
  actions: PartyBossRoundActionInput[];
  now: Date;
  seed: string;
}): { state: PartyBossState; round: PartyBossRoundSummary; result: PartyBossResult | null } {
  if (input.state.status !== "active") {
    const round = input.state.roundLog.at(-1) ?? {
      turn: input.state.turn,
      actions: [],
      bossDamage: 0,
      bossHpAfter: input.state.boss.hp,
      bossRetaliations: [],
      statusAfter: input.state.status
    };
    return { state: clonePartyBossState(input.state), round, result: buildResult(input.state, input.now) };
  }

  const next = clonePartyBossState(input.state);
  const submitted = new Map(input.actions.map((action) => [action.characterId, action]));
  const actionSummaries: PartyBossParticipantActionSummary[] = [];
  let bossDamage = 0;

  for (const participant of next.participants) {
    if (participant.status !== "active" || participant.resources.hp <= 0 || next.boss.hp <= 0) {
      continue;
    }

    const committed = submitted.get(participant.characterId);
    const action = committed?.action ?? "defend";
    const origin = committed?.origin ?? "timeout";
    const result = resolveActorCombatAction({
      actorState: participant.resources,
      defenderState: {
        hp: next.boss.hp,
        hpMax: next.boss.hpMax,
        mana: 0,
        manaMax: 0
      },
      actorStats: participant.combatStats,
      defenderStats: next.boss,
      action,
      fumbleSeed: `${input.seed}:${next.turn}:${participant.characterId}`,
      rng: new SeededRandomSource(`${input.seed}:${next.turn}:${participant.characterId}:${action}`)
    });

    participant.resources = result.actorState;
    next.boss.hp = Math.max(0, result.defenderState.hp);
    participant.contribution.damageDealt += result.summary.actorDamage;
    bossDamage += result.summary.actorDamage;
    if (origin === "manual") {
      participant.contribution.submittedActions += 1;
    } else {
      participant.contribution.timeoutActions += 1;
    }

    actionSummaries.push({
      characterId: participant.characterId,
      action,
      origin,
      outcome: result.summary.actorOutcome,
      damage: result.summary.actorDamage,
      manaSpent: result.summary.manaSpent,
      ...(result.summary.skillId ? { skillId: result.summary.skillId } : {})
    });
  }

  const bossRetaliations = next.boss.hp > 0 ? applyBossRetaliation(next) : [];
  const livingParticipants = next.participants.filter(
    (participant) => participant.status === "active" && participant.resources.hp > 0
  );
  const statusAfter: PartyBossStatus = next.boss.hp <= 0
    ? "won"
    : livingParticipants.length === 0 || next.turn >= PARTY_BOSS_MAX_TURNS
      ? "lost"
      : "active";
  const round: PartyBossRoundSummary = {
    turn: next.turn,
    actions: actionSummaries,
    bossDamage,
    bossHpAfter: next.boss.hp,
    bossRetaliations,
    statusAfter
  };

  next.roundLog = [...next.roundLog, round].slice(-13);
  next.status = statusAfter;
  if (statusAfter === "active") {
    next.turn += 1;
  } else {
    next.completedAt = input.now.toISOString();
  }

  return {
    state: next,
    round,
    result: statusAfter === "active" ? null : buildResult(next, input.now)
  };
}

export function buildResult(state: PartyBossState, now: Date): PartyBossResult | null {
  if (state.status === "active") {
    return null;
  }

  return {
    status: state.status,
    completedAt: state.completedAt ?? now.toISOString(),
    participants: state.participants.map((participant) => ({
      characterId: participant.characterId,
      status: participant.status,
      damageDealt: participant.contribution.damageDealt,
      submittedActions: participant.contribution.submittedActions,
      timeoutActions: participant.contribution.timeoutActions
    })),
    bossHpAfter: state.boss.hp
  };
}

export function clonePartyBossState(state: PartyBossState): PartyBossState {
  return {
    ...state,
    boss: { ...state.boss, tags: [...state.boss.tags] },
    participants: state.participants.map((participant) => ({
      ...participant,
      combatStats: { ...participant.combatStats },
      resources: {
        ...participant.resources,
        ...(participant.resources.cooldowns
          ? {
              cooldowns: {
                ...(participant.resources.cooldowns.abilities
                  ? {
                      abilities: cloneAbilityCooldowns(participant.resources.cooldowns.abilities)
                    }
                  : {}),
                ...(participant.resources.cooldowns.skill ? { skill: { ...participant.resources.cooldowns.skill } } : {})
              }
            }
          : {}),
        ...(participant.resources.guard ? { guard: { ...participant.resources.guard } } : {})
      },
      contribution: { ...participant.contribution }
    })),
    roundLog: state.roundLog.map((round) => ({
      ...round,
      actions: round.actions.map((action) => ({ ...action })),
      bossRetaliations: round.bossRetaliations.map((retaliation) => ({ ...retaliation }))
    }))
  };
}

function cloneAbilityCooldowns(
  abilities: NonNullable<CombatActorResourceState["cooldowns"]>["abilities"]
) {
  return Object.fromEntries(
    Object.entries(abilities ?? {}).map(([key, value]) => [key, { ...value }])
  );
}

function applyBossRetaliation(state: PartyBossState): PartyBossRetaliationSummary[] {
  const retaliations: PartyBossRetaliationSummary[] = [];

  for (const participant of state.participants) {
    if (participant.status !== "active" || participant.resources.hp <= 0) {
      continue;
    }

    const guardReduction = participant.resources.guard
      ? participant.resources.guard.consecutiveDefends >= 2 ? 0.5 : 0.65
      : 1;
    const rawDamage = Math.max(1, state.boss.attack - Math.floor((participant.combatStats.armor ?? 0) / 2));
    const damage = Math.max(1, Math.floor(rawDamage * guardReduction));
    participant.resources.hp = Math.max(0, participant.resources.hp - damage);
    participant.contribution.damageTaken += damage;

    if (participant.resources.hp <= 0) {
      participant.status = "knocked-out";
    }

    retaliations.push({
      characterId: participant.characterId,
      damage,
      hpAfter: participant.resources.hp
    });
  }

  return retaliations;
}
