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
export const BIG_BARREL_BROTHER_RULES_VERSION = "big-barrel-brother-v1";
export const PARTY_BOSS_PROOF_BOSS_KEY = "party-boss-proof-one";
export const BIG_BARREL_BROTHER_BOSS_KEY = "big-barrel-brother";
export const PARTY_BOSS_TURN_MS = 23 * 1000;
const BIG_BARREL_BROTHER_AOE_INTERVAL_TURNS = 4;

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
  rulesVersion: typeof PARTY_BOSS_RULES_VERSION | typeof BIG_BARREL_BROTHER_RULES_VERSION;
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

export interface PartyBossRetaliationPlan {
  kind: "none" | "focused" | "broad";
  characterIds: string[];
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
  variant?: "proof" | "big-barrel";
  leaderCharacterId?: string;
  participants: Array<{
    characterId: string;
    name: string;
    remortCount: number;
    combatStats: CombatActorStats & { hpCurrent: number; manaCurrent: number };
  }>;
  now: Date;
}): PartyBossState {
  const levels = input.participants.map((participant) => participant.combatStats.level);
  const meanLevel = Math.round(levels.reduce((sum, level) => sum + level, 0) / Math.max(1, levels.length));
  const level = Math.max(
    1,
    meanLevel
  );
  const participantCount = Math.max(1, input.participants.length);
  const isBig = input.variant === "big-barrel";
  const leader = input.leaderCharacterId
    ? input.participants.find((participant) => participant.characterId === input.leaderCharacterId)
    : input.participants[0];
  const bossLevel = isBig ? clamp(Math.floor(leader?.combatStats.level ?? level), 1, 13) : level;
  const bossHpMax = isBig
    ? getBigBarrelBossHp(bossLevel, participantCount)
    : 23 + level * 8 + participantCount * 13;

  return {
    rulesVersion: isBig ? BIG_BARREL_BROTHER_RULES_VERSION : PARTY_BOSS_RULES_VERSION,
    partySessionId: input.partySessionId,
    status: "active",
    turn: 1,
    boss: {
      monsterId: isBig ? BIG_BARREL_BROTHER_BOSS_KEY : PARTY_BOSS_PROOF_BOSS_KEY,
      name: isBig ? "Старший Брат Бочки" : "Контрольний Бос Одинарного Зразка",
      level: bossLevel,
      hp: bossHpMax,
      hpMax: bossHpMax,
      attack: isBig ? 5 + bossLevel : 4 + level + participantCount,
      armor: isBig ? 2 + Math.floor(bossLevel / 4) : 2 + Math.floor(level / 3),
      resist: isBig ? 1 + Math.floor(bossLevel / 5) : 1 + Math.floor(level / 4),
      dexterity: 5 + Math.floor(bossLevel / 2),
      tags: isBig ? ["boss", "construct", "barrel", "surveillance"] : ["party-boss-proof"]
    },
    participants: input.participants.map((participant) => {
      const hpMax = Math.max(1, Math.floor(participant.combatStats.hpMax));
      const manaMax = Math.max(0, Math.floor(participant.combatStats.manaMax));

      return {
        characterId: participant.characterId,
        name: participant.name,
        remortCount: participant.remortCount,
        status: "active",
        combatStats: participant.combatStats,
        resources: {
          hp: clamp(Math.floor(participant.combatStats.hpCurrent), 0, hpMax),
          hpMax,
          mana: clamp(Math.floor(participant.combatStats.manaCurrent), 0, manaMax),
          manaMax
        },
        contribution: {
          submittedActions: 0,
          timeoutActions: 0,
          damageDealt: 0,
          damageTaken: 0
        }
      };
    }),
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

  const roundParticipants = next.participants.filter(
    (participant) => participant.status === "active" && participant.resources.hp > 0
  );

  for (const participant of roundParticipants) {
    if (participant.status !== "active" || participant.resources.hp <= 0) {
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
    : livingParticipants.length === 0
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

export function isBigBarrelBrotherState(state: PartyBossState): boolean {
  return state.rulesVersion === BIG_BARREL_BROTHER_RULES_VERSION ||
    state.boss.monsterId === BIG_BARREL_BROTHER_BOSS_KEY;
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
  const big = isBigBarrelBrotherState(state);
  const broadBigRetaliation = big && isBigBarrelBroadRetaliationTurn(state);
  const targetIds = big ? getPartyBossRetaliationPlan(state).characterIds : state.participants.map((participant) => participant.characterId);
  const targetIdSet = new Set(targetIds);
  const targets = state.participants.filter((participant) => targetIdSet.has(participant.characterId));

  for (const participant of targets) {
    if (participant.status !== "active" || participant.resources.hp <= 0) {
      continue;
    }

    const guardReduction = participant.resources.guard
      ? participant.resources.guard.consecutiveDefends >= 2 ? 0.5 : 0.65
      : 1;
    const rawDamage = Math.max(1, state.boss.attack - Math.floor((participant.combatStats.armor ?? 0) / 2));
    const bigPressure = big ? Math.min(3, Math.floor(Math.max(1, state.participants.length) / 3)) : 0;
    const focusMultiplier = big && !broadBigRetaliation ? 2.23 : 1;
    const damage = Math.max(1, Math.floor((rawDamage + bigPressure) * guardReduction * focusMultiplier));
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

export function getPartyBossRetaliationPlan(state: PartyBossState): PartyBossRetaliationPlan {
  if (!isBigBarrelBrotherState(state) || state.status !== "active") {
    return { kind: "none", characterIds: [] };
  }

  const living = state.participants.filter(
    (participant) => participant.status === "active" && participant.resources.hp > 0
  );

  if (living.length === 0) {
    return { kind: "none", characterIds: [] };
  }

  if (isBigBarrelBroadRetaliationTurn(state)) {
    return { kind: "broad", characterIds: living.map((participant) => participant.characterId) };
  }

  const focused = selectBigBarrelRetaliationTarget(state, living);
  return focused
    ? { kind: "focused", characterIds: [focused.characterId] }
    : { kind: "none", characterIds: [] };
}

function isBigBarrelBroadRetaliationTurn(state: PartyBossState): boolean {
  return state.turn % BIG_BARREL_BROTHER_AOE_INTERVAL_TURNS === 0;
}

function selectBigBarrelRetaliationTarget(
  state: PartyBossState,
  living: PartyBossParticipantState[]
): PartyBossParticipantState | null {
  const leader = living[0] ?? null;
  const previousRound = state.roundLog.at(-1);

  if (!previousRound) {
    return leader;
  }

  const positionByCharacterId = new Map(
    state.participants.map((participant, index) => [participant.characterId, index])
  );
  const bestPreviousDamage = previousRound.actions
    .filter((action) =>
      action.damage > 0 && living.some((participant) => participant.characterId === action.characterId)
    )
    .sort((left, right) =>
      right.damage - left.damage ||
      (positionByCharacterId.get(left.characterId) ?? 0) - (positionByCharacterId.get(right.characterId) ?? 0)
    )[0];

  return bestPreviousDamage
    ? living.find((participant) => participant.characterId === bestPreviousDamage.characterId) ?? leader
    : leader;
}

function getBigBarrelBossHp(bossLevel: number, participantCount: number): number {
  const count = clamp(Math.floor(participantCount), 1, 8);
  const baseHp = count === 1 ? 150 : 132;
  const levelDelta = Math.max(0, bossLevel - 8);

  return (
    baseHp +
    42 * Math.min(Math.max(count - 1, 0), 4) +
    200 * Math.max(count - 5, 0) +
    7 * levelDelta +
    11 * levelDelta * count
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
