import {
  resolveActorCombatAction,
  tickActorCooldowns,
  type ActorCombatActionSummary,
  type CombatActorResourceState,
  type CombatGearAbilityInput
} from "../combat/combatEngine";
import {
  cloneCombatCooldowns,
  type CombatActorStats,
  type CombatState,
  type MonsterCombatStats,
  type PlayerCombatActionType
} from "../combat/combatState";
import { isMeaningfulCombatParticipation } from "../combat/combatParticipation";
import { SeededRandomSource } from "../../shared/random";
import { DENSE_BANDAGE_ITEM_ID, FIELD_KIT_ITEM_ID } from "../itemCraft";

export const PARTY_BOSS_RULES_VERSION = "party-boss-proof-v1";
export const BIG_BARREL_BROTHER_RULES_VERSION = "big-barrel-brother-v1";
export const PARTY_BOSS_PROOF_BOSS_KEY = "party-boss-proof-one";
export const BIG_BARREL_BROTHER_BOSS_KEY = "big-barrel-brother";
export const BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY = "tavern.big-barrel-brother.loss-retry.cooldown";
export const BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_MS = 3 * 60_000;
export const PARTY_BOSS_TURN_MS = 23 * 1000;
const BIG_BARREL_BROTHER_AOE_INTERVAL_TURNS = 4;
const KHARAKTERNYK_WARD_BASE_MITIGATION_PERCENT = 25;
const KHARAKTERNYK_WARD_SUPPORT_MITIGATION_PERCENT = 10;
const KHARAKTERNYK_WARD_MAX_MITIGATION_PERCENT = 95;

export type PartyBossActionKey = Extract<PlayerCombatActionType, "attack" | "defend" | "skill" | "race" | "gear"> | "item";
export type PartyBossParticipantStatus = "active" | "knocked-out";
export type PartyBossStatus = "active" | "won" | "lost" | "cancelled";

export interface PartyBossParticipantState {
  characterId: string;
  name: string;
  remortCount: number;
  status: PartyBossParticipantStatus;
  combatStats: CombatActorStats;
  equipmentAbilityGrantIds?: string[];
  resources: CombatActorResourceState;
  combatItems?: CombatState["combatItems"];
  contribution: {
    submittedActions: number;
    timeoutActions: number;
    damageDealt: number;
    damageTaken: number;
    healingDone?: number;
    itemUses?: number;
  };
}

export interface PartyBossState {
  rulesVersion: typeof PARTY_BOSS_RULES_VERSION | typeof BIG_BARREL_BROTHER_RULES_VERSION;
  partySessionId: string;
  status: PartyBossStatus;
  turn: number;
  boss: MonsterCombatStats & { hp: number };
  participants: PartyBossParticipantState[];
  wardSign?: PartyBossWardSignState;
  roundLog: PartyBossRoundSummary[];
  startedAt: string;
  completedAt?: string;
}

export interface PartyBossWardSignState {
  kind: "kharakternyk";
  placerCharacterId: string;
  supportCount: number;
  supportCap?: number;
  mitigationPercent: number;
  status: "carried" | "broken";
  usesRemaining?: number;
  usesMax?: number;
  triggeredTurn?: number;
  preventedDamage?: number;
  affectedCharacterIds?: string[];
}

export interface PartyBossRoundActionInput {
  characterId: string;
  action: PartyBossActionKey;
  origin?: "manual" | "timeout";
  item?: PartyBossCombatItemInput;
  gearAbility?: CombatGearAbilityInput;
}

export interface PartyBossCombatItemInput {
  id: string;
  name: string;
  effect:
    | {
        kind: "heal-hp";
        amount: number;
      }
    | {
        kind: "heal-hp-to-min-percent";
        percent: number;
      };
}

export interface PartyBossRoundSummary {
  turn: number;
  actions: PartyBossParticipantActionSummary[];
  bossDamage: number;
  bossHpAfter: number;
  bossRetaliations: PartyBossRetaliationSummary[];
  wardSign?: PartyBossWardSignRoundSummary;
  participantsAfter?: PartyBossParticipantResourceSummary[];
  statusAfter: PartyBossStatus;
}

export interface PartyBossWardSignRoundSummary {
  kind: "kharakternyk";
  status: "triggered";
  supportCount: number;
  supportCap?: number;
  usesRemaining?: number;
  usesMax?: number;
  mitigationPercent: number;
  preventedDamage: number;
  affectedCharacterIds: string[];
}

export interface PartyBossParticipantResourceSummary {
  characterId: string;
  status: PartyBossParticipantStatus;
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  cooldowns?: CombatActorResourceState["cooldowns"];
  combatItems?: CombatState["combatItems"];
}

export interface PartyBossParticipantActionSummary {
  characterId: string;
  action: PartyBossActionKey;
  origin: "manual" | "timeout";
  outcome: ActorCombatActionSummary["actorOutcome"] | "item-used";
  damage: number;
  manaSpent: number;
  skillId?: string;
  itemId?: string;
  itemName?: string;
  healing?: number;
  guard?: number;
  hpAfter?: number;
}

export interface PartyBossRetaliationSummary {
  characterId: string;
  damage: number;
  hpAfter: number;
  damageBeforeWard?: number;
  wardPreventedDamage?: number;
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
    reward?: PartyBossRewardSnapshot;
    attemptXp?: number;
  }>;
  bossHpAfter: number;
}

export interface PartyBossRewardSnapshot {
  xp: number;
  gold: number;
  itemGrants: Array<{
    itemId: string;
    name: string;
    quantity: number;
  }>;
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
    equipmentAbilityGrantIds?: string[];
  }>;
  wardSign?: {
    kind: "kharakternyk";
    placerCharacterId: string;
    supportCount: number;
    supportCap?: number;
  };
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
        ...(participant.equipmentAbilityGrantIds && participant.equipmentAbilityGrantIds.length > 0
          ? { equipmentAbilityGrantIds: [...participant.equipmentAbilityGrantIds] }
          : {}),
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
          damageTaken: 0,
          healingDone: 0,
          itemUses: 0
        }
      };
    }),
    ...(isBig && input.wardSign
        ? {
          wardSign: {
            kind: "kharakternyk",
            placerCharacterId: input.wardSign.placerCharacterId,
            supportCount: clamp(Math.floor(input.wardSign.supportCount), 0, 7),
            supportCap: Math.max(1, Math.floor(input.wardSign.supportCap ?? 7)),
            mitigationPercent: calculateKharakternykWardMitigation(input.wardSign.supportCount),
            usesRemaining: Math.max(1, clamp(Math.floor(input.wardSign.supportCount), 0, 7)),
            usesMax: Math.max(1, clamp(Math.floor(input.wardSign.supportCount), 0, 7)),
            status: "carried"
          }
        }
      : {}),
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
    if (action === "item" && committed?.item) {
      const beforeHp = participant.resources.hp;
      const tickedResources = tickActorCooldowns(participant.resources);
      tickPartyBossCombatItemCooldowns(participant);
      const healing = calculatePartyBossCombatItemHealing(tickedResources, committed.item.effect);
      participant.resources = {
        ...tickedResources,
        hp: Math.min(tickedResources.hpMax, tickedResources.hp + healing)
      };
      recordPartyBossCombatItemUse(participant, committed.item.id);

      if (origin === "manual") {
        participant.contribution.submittedActions += 1;
      } else {
        participant.contribution.timeoutActions += 1;
      }
      participant.contribution.healingDone = (participant.contribution.healingDone ?? 0) + healing;
      participant.contribution.itemUses = (participant.contribution.itemUses ?? 0) + 1;

      actionSummaries.push({
        characterId: participant.characterId,
        action,
        origin,
        outcome: "item-used",
        damage: 0,
        manaSpent: 0,
        itemId: committed.item.id,
        itemName: committed.item.name,
        healing: participant.resources.hp - beforeHp,
        hpAfter: participant.resources.hp
      });
      continue;
    }

    const combatAction: Extract<PlayerCombatActionType, "attack" | "defend" | "skill" | "race" | "gear"> =
      action === "item" ? "defend" : action;
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
      action: combatAction,
      ...(action === "gear" && committed?.gearAbility ? { skillProfile: committed.gearAbility.profile } : {}),
      fumbleSeed: `${input.seed}:${next.turn}:${participant.characterId}`,
      rng: new SeededRandomSource(`${input.seed}:${next.turn}:${participant.characterId}:${combatAction}`)
    });

    participant.resources = result.actorState;
    const support = action === "gear" && isCommittedPartyBossAbilityOutcome(result.summary.actorOutcome) && !result.summary.fumble
      ? applyPartyBossGearSupport(participant, committed?.gearAbility?.profile)
      : {};
    tickPartyBossCombatItemCooldowns(participant);
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
      action: combatAction,
      origin,
      outcome: result.summary.actorOutcome,
      damage: result.summary.actorDamage,
      manaSpent: result.summary.manaSpent,
      ...(result.summary.skillId ? { skillId: result.summary.skillId } : {}),
      ...support
    });
  }

  const retaliationResolution = next.boss.hp > 0 ? applyBossRetaliation(next) : { retaliations: [] };
  const bossRetaliations = retaliationResolution.retaliations;
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
    ...(retaliationResolution.wardSign ? { wardSign: retaliationResolution.wardSign } : {}),
    participantsAfter: next.participants.map((participant) => ({
      characterId: participant.characterId,
      status: participant.status,
      hp: participant.resources.hp,
      hpMax: participant.resources.hpMax,
      mana: participant.resources.mana,
      manaMax: participant.resources.manaMax,
      ...(participant.resources.cooldowns ? { cooldowns: cloneCombatCooldowns(participant.resources.cooldowns) } : {}),
      ...(participant.combatItems ? { combatItems: clonePartyBossCombatItemState(participant.combatItems) } : {})
    })),
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

export function isBigBarrelEligible(level: number, remortCount = 0): boolean {
  const safeLevel = Math.max(1, Math.floor(level));
  const safeRemortCount = Math.max(0, Math.floor(remortCount));

  return safeRemortCount >= 1
    ? safeLevel >= 3
    : safeLevel >= 8;
}

export function calculateKharakternykWardMitigation(supportCount: number): number {
  return clamp(
    KHARAKTERNYK_WARD_BASE_MITIGATION_PERCENT +
      KHARAKTERNYK_WARD_SUPPORT_MITIGATION_PERCENT * Math.max(0, Math.floor(supportCount)),
    KHARAKTERNYK_WARD_BASE_MITIGATION_PERCENT,
    KHARAKTERNYK_WARD_MAX_MITIGATION_PERCENT
  );
}

export function calculatePartyBossCombatItemHealing(
  resources: Pick<CombatActorResourceState, "hp" | "hpMax">,
  effect: PartyBossCombatItemInput["effect"]
): number {
  switch (effect.kind) {
    case "heal-hp":
      return clamp(Math.floor(effect.amount), 0, Math.max(0, resources.hpMax - resources.hp));
    case "heal-hp-to-min-percent": {
      const percent = clamp(Math.floor(effect.percent), 1, 100);
      const targetHp = Math.min(resources.hpMax, Math.ceil(resources.hpMax * percent / 100));
      return Math.max(0, targetHp - resources.hp);
    }
  }
}

export function getPartyBossCombatItemAvailability(
  participant: Pick<PartyBossParticipantState, "combatItems">,
  itemId: string
): { available: true } | { available: false; reason: "item-on-cooldown" | "item-limit-reached" } {
  if (itemId === DENSE_BANDAGE_ITEM_ID) {
    const cooldown = participant.combatItems?.cooldowns?.[itemId]?.remainingTurns ?? 0;
    return cooldown > 0
      ? { available: false, reason: "item-on-cooldown" }
      : { available: true };
  }

  if (itemId === FIELD_KIT_ITEM_ID) {
    const uses = participant.combatItems?.uses?.[itemId]?.count ?? 0;
    return uses > 0
      ? { available: false, reason: "item-limit-reached" }
      : { available: true };
  }

  return { available: true };
}

export function buildBigBarrelLossXp(
  state: PartyBossState,
  participant: PartyBossState["participants"][number]
): number {
  if (!isMeaningfulBigBarrelParticipant(participant)) {
    return 0;
  }

  const raidLevel = clamp(state.boss.level, 8, 13);
  const actionBonus = participant.contribution.submittedActions > 0 ? 2 : 0;
  const contactBonus = participant.contribution.damageDealt > 0 || participant.contribution.damageTaken > 0 ? 2 : 0;

  return 5 + (raidLevel - 8) + actionBonus + contactBonus;
}

export function isMeaningfulBigBarrelParticipant(participant: PartyBossState["participants"][number]): boolean {
  return isMeaningfulCombatParticipation({
    manualActions: participant.contribution.submittedActions,
    timeoutActions: participant.contribution.timeoutActions,
    damageDealt: participant.contribution.damageDealt,
    damageTaken: participant.contribution.damageTaken,
    healingDone: participant.contribution.healingDone,
    itemUses: participant.contribution.itemUses
  });
}

export function clonePartyBossState(state: PartyBossState): PartyBossState {
  return {
    ...state,
    boss: { ...state.boss, tags: [...state.boss.tags] },
    ...(state.wardSign
      ? {
          wardSign: {
            ...state.wardSign,
            ...(state.wardSign.affectedCharacterIds
              ? { affectedCharacterIds: [...state.wardSign.affectedCharacterIds] }
              : {})
          }
        }
      : {}),
    participants: state.participants.map((participant) => ({
      ...participant,
      combatStats: { ...participant.combatStats },
      ...(participant.equipmentAbilityGrantIds ? { equipmentAbilityGrantIds: [...participant.equipmentAbilityGrantIds] } : {}),
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
      ...(participant.combatItems ? { combatItems: clonePartyBossCombatItemState(participant.combatItems) } : {}),
      contribution: { ...participant.contribution }
    })),
    roundLog: state.roundLog.map((round) => ({
      ...round,
      actions: round.actions.map((action) => ({ ...action })),
      bossRetaliations: round.bossRetaliations.map((retaliation) => ({ ...retaliation })),
      ...(round.wardSign
        ? { wardSign: { ...round.wardSign, affectedCharacterIds: [...round.wardSign.affectedCharacterIds] } }
        : {}),
      ...(round.participantsAfter
        ? {
            participantsAfter: round.participantsAfter.map((participant) => ({
              ...participant,
              ...(participant.cooldowns ? { cooldowns: cloneCombatCooldowns(participant.cooldowns) } : {}),
              ...(participant.combatItems ? { combatItems: clonePartyBossCombatItemState(participant.combatItems) } : {})
            }))
          }
        : {})
    }))
  };
}

function recordPartyBossCombatItemUse(participant: PartyBossParticipantState, itemId: string): void {
  if (itemId !== DENSE_BANDAGE_ITEM_ID && itemId !== FIELD_KIT_ITEM_ID) {
    return;
  }

  participant.combatItems = clonePartyBossCombatItemState(participant.combatItems ?? {});

  if (itemId === DENSE_BANDAGE_ITEM_ID) {
    participant.combatItems.cooldowns = {
      ...(participant.combatItems.cooldowns ?? {}),
      [itemId]: {
        itemId,
        remainingTurns: 5
      }
    };
    return;
  }

  participant.combatItems.uses = {
    ...(participant.combatItems.uses ?? {}),
    [itemId]: {
      itemId,
      count: (participant.combatItems.uses?.[itemId]?.count ?? 0) + 1
    }
  };
}

function tickPartyBossCombatItemCooldowns(participant: PartyBossParticipantState): void {
  const current = participant.combatItems?.cooldowns;
  if (!current) {
    return;
  }

  const cooldowns = Object.fromEntries(
    Object.entries(current)
      .map(([itemId, cooldown]) => [
        itemId,
        {
          itemId: cooldown.itemId,
          remainingTurns: Math.max(0, Math.floor(cooldown.remainingTurns) - 1)
        }
      ] as const)
      .filter(([, cooldown]) => cooldown.remainingTurns > 0)
  );
  const uses = participant.combatItems?.uses;

  if (Object.keys(cooldowns).length > 0 || uses) {
    participant.combatItems = {
      ...(Object.keys(cooldowns).length > 0 ? { cooldowns } : {}),
      ...(uses ? { uses: { ...uses } } : {})
    };
    return;
  }

  delete participant.combatItems;
}

function clonePartyBossCombatItemState(
  combatItems: NonNullable<PartyBossParticipantState["combatItems"]>
): NonNullable<PartyBossParticipantState["combatItems"]> {
  return {
    ...(combatItems.cooldowns
      ? {
          cooldowns: Object.fromEntries(
            Object.entries(combatItems.cooldowns).map(([itemId, cooldown]) => [
              itemId,
              { ...cooldown }
            ])
          )
        }
      : {}),
    ...(combatItems.uses
      ? {
          uses: Object.fromEntries(
            Object.entries(combatItems.uses).map(([itemId, use]) => [
              itemId,
              { ...use }
            ])
          )
        }
      : {})
  };
}

function cloneAbilityCooldowns(
  abilities: NonNullable<CombatActorResourceState["cooldowns"]>["abilities"]
) {
  return Object.fromEntries(
    Object.entries(abilities ?? {}).map(([key, value]) => [key, { ...value }])
  );
}

function applyBossRetaliation(state: PartyBossState): {
  retaliations: PartyBossRetaliationSummary[];
  wardSign?: PartyBossWardSignRoundSummary;
} {
  const retaliations: PartyBossRetaliationSummary[] = [];
  const big = isBigBarrelBrotherState(state);
  const broadBigRetaliation = big && isBigBarrelBroadRetaliationTurn(state);
  const wardCanTrigger = broadBigRetaliation && state.wardSign?.status === "carried";
  const targetIds = big ? getPartyBossRetaliationPlan(state).characterIds : state.participants.map((participant) => participant.characterId);
  const targetIdSet = new Set(targetIds);
  const targets = state.participants.filter((participant) => targetIdSet.has(participant.characterId));
  let wardPreventedDamage = 0;
  const wardAffectedCharacterIds: string[] = [];

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
    const guardedDamage = Math.max(1, Math.floor((rawDamage + bigPressure) * guardReduction * focusMultiplier));
    const damageBeforeWard = Math.max(0, guardedDamage - Math.max(0, participant.resources.guard?.abilityDamageReduction ?? 0));
    const wardPrevented = wardCanTrigger
      ? Math.min(damageBeforeWard, Math.floor(damageBeforeWard * state.wardSign!.mitigationPercent / 100))
      : 0;
    const damage = Math.max(0, damageBeforeWard - wardPrevented);
    if (wardCanTrigger) {
      wardPreventedDamage += wardPrevented;
      wardAffectedCharacterIds.push(participant.characterId);
    }
    participant.resources.hp = Math.max(0, participant.resources.hp - damage);
    participant.contribution.damageTaken += damage;

    if (participant.resources.hp <= 0) {
      participant.status = "knocked-out";
    }

    retaliations.push({
      characterId: participant.characterId,
      damage,
      hpAfter: participant.resources.hp,
      ...(wardPrevented > 0 ? { damageBeforeWard, wardPreventedDamage: wardPrevented } : {})
    });
  }

  if (wardCanTrigger && state.wardSign && wardAffectedCharacterIds.length > 0) {
    const currentUsesRemaining = Math.max(1, Math.floor(state.wardSign.usesRemaining ?? Math.max(1, state.wardSign.supportCount)));
    const usesRemaining = Math.max(0, currentUsesRemaining - 1);
    const usesMax = Math.max(1, Math.floor(state.wardSign.usesMax ?? Math.max(1, state.wardSign.supportCount)));
    state.wardSign = {
      ...state.wardSign,
      status: usesRemaining > 0 ? "carried" : "broken",
      usesRemaining,
      usesMax,
      triggeredTurn: state.turn,
      preventedDamage: wardPreventedDamage,
      affectedCharacterIds: wardAffectedCharacterIds
    };
    return {
      retaliations,
      wardSign: {
        kind: "kharakternyk",
        status: "triggered",
        supportCount: state.wardSign.supportCount,
        supportCap: state.wardSign.supportCap ?? 7,
        usesRemaining,
        usesMax,
        mitigationPercent: state.wardSign.mitigationPercent,
        preventedDamage: wardPreventedDamage,
        affectedCharacterIds: wardAffectedCharacterIds
      }
    };
  }

  return { retaliations };
}

function applyPartyBossGearSupport(
  participant: PartyBossParticipantState,
  ability: CombatGearAbilityInput["profile"] | undefined
): { healing?: number; guard?: number; hpAfter?: number } {
  const healing = ability?.healAmount && ability.healAmount > 0
    ? applyPartyBossHealing(participant.resources, ability.healAmount)
    : 0;
  const guard = ability?.guardReduction && ability.guardReduction > 0
    ? Math.floor(ability.guardReduction)
    : 0;

  if (guard > 0) {
    participant.resources.guard = {
      consecutiveDefends: 1,
      abilityDamageReduction: Math.max(1, guard)
    };
  }

  return {
    ...(healing > 0 ? { healing, hpAfter: participant.resources.hp } : {}),
    ...(guard > 0 ? { guard } : {})
  };
}

function applyPartyBossHealing(
  resources: CombatActorResourceState,
  amount: number
): number {
  const before = resources.hp;
  resources.hp = Math.min(resources.hpMax, resources.hp + Math.max(0, Math.floor(amount)));

  return resources.hp - before;
}

function isCommittedPartyBossAbilityOutcome(outcome: ActorCombatActionSummary["actorOutcome"]): boolean {
  return outcome !== "not-enough-mana" && outcome !== "skill-on-cooldown";
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
