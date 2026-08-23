import {
  resolveActorCombatAction,
  tickActorCooldowns,
  type ActorCombatActionSummary,
  type CombatActorResourceState,
  type CombatGearAbilityInput
} from "../combat/combatEngine";
import {
  getCombatClassAbilityProfile,
  getCombatRaceAbilityProfile,
  type CombatSkillProfile
} from "../combat/combatActions";
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
import {
  applyVarenykSatedCombatPulse,
  cloneVarenykSatedCombatState,
  type VarenykSatedCombatStateV1
} from "../noncombat/varenykSatedSupport";
import {
  applyBardInspirationCombatPulse,
  cloneBardInspirationCombatState,
  withBardInspirationAccuracy,
  type BardInspirationCombatStateV1
} from "../noncombat/bardSupport";
import type { BardPerformanceGrade } from "../noncombat/bardPerformance";
import type { ItemUseEffectContent } from "../../content/schema";
import { resolveCombatResponseItemDelta } from "../combat/responseItemEffect";

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
export const WARRIOR_RAID_TAUNT_ACTION_ID = "raid.class.warrior.taunt";
export const WARRIOR_RAID_TAUNT_DURATION_BOSS_ATTACKS = 3;
export const WARRIOR_RAID_TAUNT_COOLDOWN_TURNS = 5;

export type PartyBossActionKey = Extract<PlayerCombatActionType, "attack" | "defend" | "skill" | "race" | "gear"> | "item" | "taunt" | "lament";
export type PartyBossStandardActionKey = Exclude<PartyBossActionKey, "lament">;
export type PartyBossParticipantStatus = "active" | "knocked-out";
export type PartyBossStatus = "active" | "won" | "lost" | "cancelled";

export interface PartyBossStatisticsV1 {
  version: 1;
  damage: number;
  healing: number;
  guardPrevented: number;
  control: number | null;
  damageTaken: number;
  actions: number;
  specialActions: number;
  guardedTurns: number;
}

export interface PartyBossParticipantState {
  characterId: string;
  name: string;
  guildCrest?: string;
  remortCount: number;
  status: PartyBossParticipantStatus;
  combatStats: CombatActorStats;
  equipmentAbilityGrantIds?: string[];
  resources: CombatActorResourceState;
  varenykSated?: VarenykSatedCombatStateV1;
  bardInspiration?: BardInspirationCombatStateV1;
  bardMusicAvailableAt?: string;
  combatItems?: CombatState["combatItems"];
  contribution: {
    submittedActions: number;
    timeoutActions: number;
    damageDealt: number;
    damageTaken: number;
    healingDone?: number;
    itemUses?: number;
  };
  statistics?: PartyBossStatisticsV1;
}

export interface PartyBossState {
  rulesVersion: typeof PARTY_BOSS_RULES_VERSION | typeof BIG_BARREL_BROTHER_RULES_VERSION;
  partySessionId: string;
  leaderCharacterId: string;
  status: PartyBossStatus;
  turn: number;
  boss: MonsterCombatStats & { hp: number };
  participants: PartyBossParticipantState[];
  wardSign?: PartyBossWardSignState;
  personalProtocol?: PartyBossPersonalProtocolState;
  warriorTaunt?: PartyBossWarriorTauntState;
  bardMusic?: PartyBossBardMusicState;
  roundLog: PartyBossRoundSummary[];
  startedAt: string;
  completedAt?: string;
}

export type PartyBossBardMusicState =
  | { kind: "none" }
  | { kind: "inspiration"; sourcePerformanceIds: string[] }
  | {
      kind: "lament";
      activationId: string;
      sourceCharacterId: string;
      grade: BardPerformanceGrade;
      damageReduction: number;
      remainingBossResponses: number;
      activatedTurn: number;
    };

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

export interface PartyBossPersonalProtocolState {
  kind: "bureaucramancer-personal-protocol-13b";
  protocolId: string;
  filerCharacterId: string;
  signatures: PartyBossPersonalProtocolSignatureState[];
}

export interface PartyBossPersonalProtocolSignatureState {
  characterId: string;
  status: "unspent" | "spent";
  triggeredTurn?: number;
  bossActionId?: string;
  preventedDamage?: number;
}

export interface PartyBossWarriorTauntState {
  active?: {
    characterId: string;
    activatedTurn: number;
    bossAttacksRemaining: number;
  };
  cooldowns: Record<string, { availableTurn: number }>;
}

export interface PartyBossRoundActionInput {
  characterId: string;
  action: PartyBossActionKey;
  origin?: "manual" | "timeout";
  item?: PartyBossCombatItemInput;
  itemCommitAllowed?: boolean;
  gearAbility?: CombatGearAbilityInput;
}

export interface PartyBossCombatItemInput {
  id: string;
  name: string;
  effect: ItemUseEffectContent;
}

export interface PartyBossRoundSummary {
  turn: number;
  actions: PartyBossParticipantActionSummary[];
  bossDamage: number;
  bossHpAfter: number;
  bossRetaliations: PartyBossRetaliationSummary[];
  wardSign?: PartyBossWardSignRoundSummary;
  personalProtocol?: PartyBossPersonalProtocolRoundSummary;
  warriorTaunt?: PartyBossWarriorTauntRoundSummary;
  bardMusic?: PartyBossBardMusicRoundSummary;
  participantsAfter?: PartyBossParticipantResourceSummary[];
  statusAfter: PartyBossStatus;
}

export interface PartyBossBardMusicRoundSummary {
  kind: "lament";
  activationId: string;
  sourceCharacterId: string;
  damageReduction: number;
  activated: boolean;
  remainingBossResponses: number;
  expired: boolean;
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

export interface PartyBossPersonalProtocolRoundSummary {
  kind: "bureaucramancer-personal-protocol-13b";
  status: "triggered";
  characterId: string;
  preventedDamage: number;
  triggeredTurn: number;
  bossActionId: string;
  spentCount: number;
  signatureCount: number;
}

export interface PartyBossWarriorTauntRoundSummary {
  activatedCharacterId?: string;
  redirectedCharacterId?: string;
  redirectedAttackKind?: "focused" | "broad";
  expiredCharacterId?: string;
  bossAttacksRemaining?: number;
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
  varenykSated?: VarenykSatedCombatStateV1 | null;
  bardInspiration?: BardInspirationCombatStateV1 | null;
}

export interface PartyBossParticipantActionSummary {
  characterId: string;
  action: PartyBossActionKey;
  origin: "manual" | "timeout";
  outcome: ActorCombatActionSummary["actorOutcome"] | "item-used" | "item-not-used" | "taunt-activated" | "taunt-failed" | "lament-activated";
  damage: number;
  manaSpent: number;
  skillId?: string;
  itemId?: string;
  itemName?: string;
  itemUnavailableReason?: "not-usable" | "full-hp" | "full-mana" | "full-resources" | "effect-unavailable";
  healing?: number;
  manaRestored?: number;
  guard?: number;
  hpAfter?: number;
  supportTargets?: Array<{
    characterId: string;
    healing?: number;
    guard?: number;
    counterDamage?: number;
  }>;
  satedRecovery?: {
    hpRestored: number;
    manaRestored: number;
  };
}

export interface PartyBossRetaliationSummary {
  characterId: string;
  damage: number;
  hpAfter: number;
  damageBeforeWard?: number;
  wardPreventedDamage?: number;
  damageBeforeProtocol?: number;
  protocolPreventedDamage?: number;
  damageBeforeLament?: number;
  lamentPreventedDamage?: number;
  itemResponseItemId?: string;
  itemResponseKind?: "guard" | "evade";
  itemResponsePreventedDamage?: number;
  tauntRedirected?: boolean;
  tauntOriginalKind?: "focused" | "broad";
  counterDamage?: number;
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
    guildCrest?: string;
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
  personalProtocol?: {
    kind: "bureaucramancer-personal-protocol-13b";
    protocolId: string;
    filerCharacterId: string;
    signerCharacterIds: string[];
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
    leaderCharacterId: leader?.characterId ?? input.participants[0]!.characterId,
    status: "active",
    turn: 1,
    boss: {
      monsterId: isBig ? BIG_BARREL_BROTHER_BOSS_KEY : PARTY_BOSS_PROOF_BOSS_KEY,
      name: isBig ? "Старший Брат Бочки" : "Контрольний Бос Одинарного Зразка",
      level: bossLevel,
      hp: bossHpMax,
      hpMax: bossHpMax,
      attack: isBig ? 6 + bossLevel : 4 + level + participantCount,
      armor: isBig ? 2 + Math.floor(bossLevel / 4) : 2 + Math.floor(level / 3),
      resist: isBig ? 1 + Math.floor(bossLevel / 5) : 1 + Math.floor(level / 4),
      dexterity: 5 + Math.floor(bossLevel / 2),
      tags: isBig ? ["boss", "construct", "barrel", "surveillance"] : ["party-boss-proof"]
    },
    participants: input.participants.map((participant) => {
      const hpMax = Math.max(1, Math.floor(participant.combatStats.hpMax));
      const manaMax = Math.max(0, Math.floor(participant.combatStats.manaMax));
      const hp = clamp(Math.floor(participant.combatStats.hpCurrent), 0, hpMax);

      return {
        characterId: participant.characterId,
        name: participant.name,
        ...(participant.guildCrest ? { guildCrest: participant.guildCrest } : {}),
        remortCount: participant.remortCount,
        status: hp > 0 ? "active" : "knocked-out",
        combatStats: participant.combatStats,
        ...(participant.equipmentAbilityGrantIds && participant.equipmentAbilityGrantIds.length > 0
          ? { equipmentAbilityGrantIds: [...participant.equipmentAbilityGrantIds] }
          : {}),
        resources: {
          hp,
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
        },
        statistics: {
          version: 1,
          damage: 0,
          healing: 0,
          guardPrevented: 0,
          control: 0,
          damageTaken: 0,
          actions: 0,
          specialActions: 0,
          guardedTurns: 0
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
    ...(isBig && input.personalProtocol && input.personalProtocol.signerCharacterIds.length > 0
      ? {
          personalProtocol: {
            kind: "bureaucramancer-personal-protocol-13b",
            protocolId: input.personalProtocol.protocolId,
            filerCharacterId: input.personalProtocol.filerCharacterId,
            signatures: [...new Set(input.personalProtocol.signerCharacterIds)].map((characterId) => ({
              characterId,
              status: "unspent" as const
            }))
          }
        }
      : {}),
    ...(isBig ? { bardMusic: { kind: "none" as const } } : {}),
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
  const pendingSupports: Array<{
    participant: PartyBossParticipantState;
    profile: CombatSkillProfile | undefined;
    summary: PartyBossParticipantActionSummary;
  }> = [];
  let bossDamage = 0;
  const counterDamageByCharacterId = new Map<string, number>();
  const abilityGuardSourceByCharacterId = new Map<string, string>();
  const pendingItemResponses = new Map<string, {
    item: PartyBossCombatItemInput;
    effect: Extract<ItemUseEffectContent, { kind: "guard-response" | "evade-response" }>;
    participant: PartyBossParticipantState;
    summary: PartyBossParticipantActionSummary;
  }>();
  const expiredBeforeActions = expireUnableWarriorTaunt(next);
  const tauntRound: PartyBossWarriorTauntRoundSummary = {
    ...(expiredBeforeActions ? { expiredCharacterId: expiredBeforeActions } : {})
  };

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
    if (action === "taunt") {
      participant.resources = tickActorCooldowns(participant.resources);
      delete participant.resources.guard;
      tickPartyBossCombatItemCooldowns(participant);
      if (origin === "manual") {
        participant.contribution.submittedActions += 1;
      } else {
        participant.contribution.timeoutActions += 1;
      }
      actionSummaries.push({
        characterId: participant.characterId,
        action,
        origin,
        outcome: "taunt-failed",
        damage: 0,
        manaSpent: 0
      });
      continue;
    }
    if (action === "lament") {
      participant.resources = tickActorCooldowns(participant.resources);
      delete participant.resources.guard;
      tickPartyBossCombatItemCooldowns(participant);
      if (origin === "manual") {
        participant.contribution.submittedActions += 1;
      } else {
        participant.contribution.timeoutActions += 1;
      }
      actionSummaries.push({
        characterId: participant.characterId,
        action,
        origin,
        outcome: "lament-activated",
        damage: 0,
        manaSpent: 0
      });
      continue;
    }
    if (action === "item" && committed?.item) {
      const tickedResources = tickActorCooldowns(participant.resources);
      tickPartyBossCombatItemCooldowns(participant);
      const itemUnavailableReason = committed.itemCommitAllowed === false
        ? "not-usable"
        : getPartyBossCombatItemInapplicableReason(
            next,
            { ...participant, resources: tickedResources },
            committed.item.effect
          );
      if (itemUnavailableReason) {
        participant.resources = tickedResources;
        if (origin === "manual") {
          participant.contribution.submittedActions += 1;
        } else {
          participant.contribution.timeoutActions += 1;
        }
        actionSummaries.push({
          characterId: participant.characterId,
          action,
          origin,
          outcome: "item-not-used",
          damage: 0,
          manaSpent: 0,
          itemId: committed.item.id,
          itemName: committed.item.name,
          itemUnavailableReason,
          hpAfter: participant.resources.hp
        });
        continue;
      }
      const resolvedEffect = resolvePartyBossRandomEffect(
        committed.item.effect,
        participant.resources,
        new SeededRandomSource(`${input.seed}:${next.turn}:${participant.characterId}:${committed.item.id}`)
      );
      const { healing, manaRestored } = calculatePartyBossCombatItemRestoration(tickedResources, resolvedEffect);
      participant.resources = {
        ...tickedResources,
        hp: Math.min(tickedResources.hpMax, tickedResources.hp + healing),
        mana: Math.min(tickedResources.manaMax, tickedResources.mana + manaRestored)
      };
      const supportTargets: NonNullable<PartyBossParticipantActionSummary["supportTargets"]> = [];
      if (resolvedEffect.kind === "paired-heal") {
        const ally = getPartyBossSupportTargets(next, participant, "lowest-hp-ally")
          .find((target) => target.characterId !== participant.characterId);
        if (ally) {
          const allyHealing = applyPartyBossHealing(ally.resources, resolvedEffect.amount);
          if (allyHealing > 0) supportTargets.push({ characterId: ally.characterId, healing: allyHealing });
        }
      }
      if (resolvedEffect.kind === "party-heal") {
        for (const target of getPartyBossSupportTargets(next, participant, "all-allies-including-self")) {
          if (target.characterId === participant.characterId) continue;
          const targetHealing = applyPartyBossHealing(target.resources, resolvedEffect.amount);
          if (targetHealing > 0) supportTargets.push({ characterId: target.characterId, healing: targetHealing });
        }
      }
      const itemDamage = resolvedEffect.kind === "critical-damage"
        ? Math.min(next.boss.hp, Math.max(0, Math.floor(resolvedEffect.amount)))
        : 0;
      next.boss.hp = Math.max(0, next.boss.hp - itemDamage);
      if (participant.statistics) participant.statistics.damage += itemDamage;
      if (resolvedEffect.kind === "reduce-cooldowns") participant.resources = reducePartyBossCooldowns(participant.resources, resolvedEffect.turns);
      const responseItem = resolvedEffect.kind === "guard-response" || resolvedEffect.kind === "evade-response";
      if (!responseItem) recordPartyBossCombatItemUse(participant, committed.item.id);

      if (origin === "manual") {
        participant.contribution.submittedActions += 1;
      } else {
        participant.contribution.timeoutActions += 1;
      }
      const supportHealing = supportTargets.reduce((sum, target) => sum + (target.healing ?? 0), 0);
      participant.contribution.healingDone = (participant.contribution.healingDone ?? 0) + healing + supportHealing;
      if (!responseItem) participant.contribution.itemUses = (participant.contribution.itemUses ?? 0) + 1;
      participant.contribution.damageDealt += itemDamage;
      bossDamage += itemDamage;

      const itemSummary: PartyBossParticipantActionSummary = {
        characterId: participant.characterId,
        action,
        origin,
        outcome: "item-used",
        damage: itemDamage,
        manaSpent: 0,
        itemId: committed.item.id,
        itemName: committed.item.name,
        ...(healing > 0 ? { healing } : {}),
        ...(manaRestored > 0 ? { manaRestored } : {}),
        hpAfter: participant.resources.hp,
        ...(supportTargets.length > 0 ? { supportTargets } : {})
      };
      actionSummaries.push(itemSummary);
      if (responseItem) {
        pendingItemResponses.set(participant.characterId, {
          item: committed.item,
          effect: resolvedEffect,
          participant,
          summary: itemSummary
        });
      }
      continue;
    }

    const combatAction: Extract<PlayerCombatActionType, "attack" | "defend" | "skill" | "race" | "gear"> =
      action === "item" ? "defend" : action;
    const bossHpBeforeAction = next.boss.hp;
    const result = resolveActorCombatAction({
      actorState: participant.resources,
      defenderState: {
        hp: next.boss.hp,
        hpMax: next.boss.hpMax,
        mana: 0,
        manaMax: 0
      },
      actorStats: withBardInspirationAccuracy(
        participant.combatStats,
        participant.bardInspiration
      ),
      defenderStats: next.boss,
      action: combatAction,
      ...(action === "gear" && committed?.gearAbility ? { skillProfile: committed.gearAbility.profile } : {}),
      fumbleSeed: `${input.seed}:${next.turn}:${participant.characterId}`,
      rng: new SeededRandomSource(`${input.seed}:${next.turn}:${participant.characterId}:${combatAction}`)
    });

    participant.resources = result.actorState;
    if ((participant.resources.guard?.abilityDamageReduction ?? 0) > 0) {
      abilityGuardSourceByCharacterId.set(participant.characterId, participant.characterId);
    }
    tickPartyBossCombatItemCooldowns(participant);
    next.boss.hp = Math.max(0, result.defenderState.hp);
    if (participant.statistics) {
      participant.statistics.damage += Math.max(0, bossHpBeforeAction - next.boss.hp);
    }
    participant.contribution.damageDealt += result.summary.actorDamage;
    bossDamage += result.summary.actorDamage;
    if (origin === "manual") {
      participant.contribution.submittedActions += 1;
    } else {
      participant.contribution.timeoutActions += 1;
    }

    const summary: PartyBossParticipantActionSummary = {
      characterId: participant.characterId,
      action: combatAction,
      origin,
      outcome: result.summary.actorOutcome,
      damage: result.summary.actorDamage,
      manaSpent: result.summary.manaSpent,
      ...(result.summary.skillId ? { skillId: result.summary.skillId } : {})
    };
    actionSummaries.push(summary);
    if (
      (action === "skill" || action === "race" || action === "gear") &&
      isCommittedPartyBossAbilityOutcome(result.summary.actorOutcome) &&
      !result.summary.fumble
    ) {
      pendingSupports.push({
        participant,
        profile: getPartyBossAbilityProfile(participant, action, committed?.gearAbility?.profile),
        summary
      });
    }
  }

  // Apply ally support after every participant has committed their own action. Otherwise a
  // later actorState assignment can erase protection granted by an earlier roster member.
  for (const pending of pendingSupports) {
    Object.assign(
      pending.summary,
      applyPartyBossAbilitySupport(
        next,
        pending.participant,
        pending.profile,
        counterDamageByCharacterId,
        abilityGuardSourceByCharacterId
      )
    );
  }

  if (next.boss.hp > 0) {
    const committedTaunt = actionSummaries.find((summary) =>
      summary.action === "taunt" && tryActivateWarriorRaidTaunt(next, summary.characterId)
    );
    if (committedTaunt) {
      committedTaunt.outcome = "taunt-activated";
      tauntRound.activatedCharacterId = committedTaunt.characterId;
      tauntRound.bossAttacksRemaining = WARRIOR_RAID_TAUNT_DURATION_BOSS_ATTACKS;
      const statistics = next.participants.find(
        (participant) => participant.characterId === committedTaunt.characterId
      )?.statistics;
      if (statistics) statistics.control = (statistics.control ?? 0) + 1;
    }
  }

  const expiredAfterVictory = next.boss.hp <= 0 ? clearActiveWarriorTaunt(next) : null;
  if (expiredAfterVictory) {
    tauntRound.expiredCharacterId = expiredAfterVictory;
    delete tauntRound.bossAttacksRemaining;
  }
  const itemResponseByCharacterId = new Map<string, {
    itemId: string;
    kind: "guard" | "evade";
    percent: number;
    used: boolean;
    preventedDamage: number;
  }>();
  const retaliationTargets = next.boss.hp > 0
    ? new Set(isBigBarrelBrotherState(next)
        ? getPartyBossRetaliationPlan(next).characterIds
        : next.participants
          .filter((participant) => participant.status === "active" && participant.resources.hp > 0)
          .map((participant) => participant.characterId))
    : new Set<string>();
  for (const [characterId, pending] of pendingItemResponses) {
    if (!retaliationTargets.has(characterId)) {
      pending.summary.outcome = "item-not-used";
      pending.summary.itemUnavailableReason = "effect-unavailable";
      continue;
    }
    itemResponseByCharacterId.set(characterId, {
      itemId: pending.item.id,
      kind: pending.effect.kind === "evade-response" ? "evade" : "guard",
      percent: pending.effect.kind === "evade-response" ? 100 : pending.effect.reductionPercent,
      used: false,
      preventedDamage: 0
    });
  }
  const retaliationResolution = next.boss.hp > 0
    ? applyBossRetaliation(
        next,
        counterDamageByCharacterId,
        itemResponseByCharacterId,
        abilityGuardSourceByCharacterId
      )
    : { retaliations: [] };
  for (const [characterId, pending] of pendingItemResponses) {
    const response = itemResponseByCharacterId.get(characterId);
    if (!response?.used) {
      pending.summary.outcome = "item-not-used";
      pending.summary.itemUnavailableReason = "effect-unavailable";
      continue;
    }
    recordPartyBossCombatItemUse(pending.participant, pending.item.id);
    pending.participant.contribution.itemUses = (pending.participant.contribution.itemUses ?? 0) + 1;
  }
  for (const summary of actionSummaries) {
    const participant = next.participants.find((entry) => entry.characterId === summary.characterId);
    const statistics = participant?.statistics;
    if (!statistics) continue;
    const supportHealing = (summary.supportTargets ?? []).reduce(
      (sum, target) => sum + Math.max(0, Math.floor(target.healing ?? 0)),
      0
    );
    const actorHealingAlreadyIncluded = (summary.supportTargets ?? []).some(
      (target) => target.characterId === summary.characterId && (target.healing ?? 0) > 0
    );
    statistics.healing += supportHealing
      + (actorHealingAlreadyIncluded ? 0 : Math.max(0, Math.floor(summary.healing ?? 0)));
    const committedForStatistics = summary.outcome !== "not-enough-mana" &&
      summary.outcome !== "skill-on-cooldown" &&
      summary.outcome !== "item-not-used" &&
      summary.outcome !== "taunt-failed";
    if (summary.origin === "manual" && committedForStatistics) statistics.actions += 1;
    if (
      summary.origin === "manual" &&
      committedForStatistics &&
      (summary.action === "skill" || summary.action === "race" || summary.action === "gear")
    ) {
      statistics.specialActions += 1;
    }
    if (
      summary.origin === "manual" &&
      summary.action === "defend" &&
      summary.outcome === "defended"
    ) statistics.guardedTurns += 1;
  }
  if (retaliationResolution.warriorTaunt) {
    if (retaliationResolution.warriorTaunt.expiredCharacterId) {
      delete tauntRound.bossAttacksRemaining;
    }
    Object.assign(tauntRound, retaliationResolution.warriorTaunt);
  }
  const bossRetaliations = retaliationResolution.retaliations;
  bossDamage += bossRetaliations.reduce((sum, retaliation) => sum + (retaliation.counterDamage ?? 0), 0);
  if (isBigBarrelBrotherState(next)) {
    for (const participant of roundParticipants) {
      const summary = actionSummaries.find((entry) => entry.characterId === participant.characterId);
      if (!summary || !participant.varenykSated) {
        if (summary && participant.bardInspiration) {
          const inspirationPulse = applyBardInspirationCombatPulse({
            inspiration: participant.bardInspiration,
            pulseId: [
              participant.bardInspiration.activationId,
              "big-barrel",
              next.partySessionId,
              next.turn,
              participant.characterId
            ].join(":"),
            now: input.now
          });
          if (inspirationPulse.inspiration) {
            participant.bardInspiration = inspirationPulse.inspiration;
          }
        }
        continue;
      }
      const pulse = applyVarenykSatedCombatPulse({
        sated: participant.varenykSated,
        resources: participant.resources,
        pulseId: [
          participant.varenykSated.activationId,
          "big-barrel",
          next.partySessionId,
          next.turn,
          participant.characterId
        ].join(":"),
        now: input.now
      });
      if (!pulse.sated) {
        continue;
      }
      participant.varenykSated = pulse.sated;
      if (pulse.applied) {
        participant.resources = { ...participant.resources, hp: pulse.resources.hp, mana: pulse.resources.mana };
      }
      summary.hpAfter = participant.resources.hp;
      if (pulse.hpRestored > 0 || pulse.manaRestored > 0) {
        summary.satedRecovery = { hpRestored: pulse.hpRestored, manaRestored: pulse.manaRestored };
        if (participant.statistics) participant.statistics.healing += pulse.hpRestored;
      }
      if (participant.bardInspiration) {
        const inspirationPulse = applyBardInspirationCombatPulse({
          inspiration: participant.bardInspiration,
          pulseId: [
            participant.bardInspiration.activationId,
            "big-barrel",
            next.partySessionId,
            next.turn,
            participant.characterId
          ].join(":"),
          now: input.now
        });
        if (inspirationPulse.inspiration) {
          participant.bardInspiration = inspirationPulse.inspiration;
        }
      }
    }
  }
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
    ...(retaliationResolution.personalProtocol ? { personalProtocol: retaliationResolution.personalProtocol } : {}),
    ...(Object.keys(tauntRound).length > 0 ? { warriorTaunt: tauntRound } : {}),
    ...(retaliationResolution.bardMusic ? { bardMusic: retaliationResolution.bardMusic } : {}),
    participantsAfter: next.participants.map((participant) => ({
      characterId: participant.characterId,
      status: participant.status,
      hp: participant.resources.hp,
      hpMax: participant.resources.hpMax,
      mana: participant.resources.mana,
      manaMax: participant.resources.manaMax,
      ...(participant.resources.cooldowns ? { cooldowns: cloneCombatCooldowns(participant.resources.cooldowns) } : {}),
      ...(participant.combatItems ? { combatItems: clonePartyBossCombatItemState(participant.combatItems) } : {}),
      varenykSated: participant.varenykSated
        ? cloneVarenykSatedCombatState(participant.varenykSated)
        : null,
      ...(next.bardMusic !== undefined
        ? {
            bardInspiration: participant.bardInspiration
              ? cloneBardInspirationCombatState(participant.bardInspiration)
              : null
          }
        : {})
    })),
    statusAfter
  };

  next.roundLog = [...next.roundLog, round];
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
  resources: Pick<CombatActorResourceState, "hp" | "hpMax" | "mana" | "manaMax">,
  effect: PartyBossCombatItemInput["effect"]
): number {
  return calculatePartyBossCombatItemRestoration(resources, effect).healing;
}

export function calculatePartyBossCombatItemRestoration(
  resources: Pick<CombatActorResourceState, "hp" | "hpMax" | "mana" | "manaMax">,
  effect: PartyBossCombatItemInput["effect"]
): { healing: number; manaRestored: number } {
  switch (effect.kind) {
    case "heal-hp":
      return { healing: clamp(Math.floor(effect.amount), 0, Math.max(0, resources.hpMax - resources.hp)), manaRestored: 0 };
    case "heal-hp-to-min-percent": {
      const percent = clamp(Math.floor(effect.percent), 1, 100);
      const targetHp = Math.min(resources.hpMax, Math.ceil(resources.hpMax * percent / 100));
      return { healing: Math.max(0, targetHp - resources.hp), manaRestored: 0 };
    }
    case "restore-mana":
      return { healing: 0, manaRestored: clamp(Math.floor(effect.amount), 0, Math.max(0, resources.manaMax - resources.mana)) };
    case "restore-both":
      return {
        healing: clamp(Math.floor(effect.hpAmount), 0, Math.max(0, resources.hpMax - resources.hp)),
        manaRestored: clamp(Math.floor(effect.manaAmount), 0, Math.max(0, resources.manaMax - resources.mana))
      };
    case "heal-hp-below-percent":
      return {
        healing: resources.hp <= Math.floor(resources.hpMax * effect.thresholdPercent / 100)
          ? clamp(Math.floor(effect.amount), 0, Math.max(0, resources.hpMax - resources.hp))
          : 0,
        manaRestored: 0
      };
    case "paired-heal":
    case "party-heal":
      return {
        healing: clamp(Math.floor(effect.amount), 0, Math.max(0, resources.hpMax - resources.hp)),
        manaRestored: 0
      };
    default:
      return { healing: 0, manaRestored: 0 };
  }
}

export function isPartyBossCombatItemEffectApplicable(
  state: PartyBossState,
  actor: PartyBossParticipantState,
  effect: ItemUseEffectContent
): boolean {
  if (effect.kind === "paired-heal") {
    return actor.resources.hp < actor.resources.hpMax || state.participants.some(
      (entry) => entry.characterId !== actor.characterId &&
        entry.status === "active" &&
        entry.resources.hp > 0 &&
        entry.resources.hp < entry.resources.hpMax
    );
  }
  if (effect.kind === "party-heal") {
    return state.participants.some((entry) => entry.status === "active" && entry.resources.hp > 0 && entry.resources.hp < entry.resources.hpMax);
  }
  if (effect.kind === "cleanse-negative") return false;
  if (effect.kind === "reduce-cooldowns") return hasPartyBossCooldown(actor.resources.cooldowns);
  if (effect.kind === "critical-damage" || effect.kind === "guard-response" || effect.kind === "evade-response") return state.boss.hp > 0;
  if (effect.kind === "random-resource") return actor.resources.hp < actor.resources.hpMax || actor.resources.mana < actor.resources.manaMax;
  const restoration = calculatePartyBossCombatItemRestoration(actor.resources, effect);
  return restoration.healing > 0 || restoration.manaRestored > 0;
}

export function getPartyBossCombatItemInapplicableReason(
  state: PartyBossState,
  actor: PartyBossParticipantState,
  effect: ItemUseEffectContent
): "full-hp" | "full-mana" | "full-resources" | "effect-unavailable" | null {
  if (isPartyBossCombatItemEffectApplicable(state, actor, effect)) {
    return null;
  }
  if (effect.kind === "restore-mana") {
    return "full-mana";
  }
  if (effect.kind === "restore-both" || effect.kind === "random-resource") {
    return actor.resources.hp >= actor.resources.hpMax && actor.resources.mana >= actor.resources.manaMax
      ? "full-resources"
      : "effect-unavailable";
  }
  if (effect.kind === "heal-hp-below-percent") {
    return actor.resources.hp > Math.floor(actor.resources.hpMax * effect.thresholdPercent / 100)
      ? "effect-unavailable"
      : "full-hp";
  }
  if (
    effect.kind === "paired-heal" ||
    effect.kind === "party-heal" ||
    effect.kind === "cleanse-negative" ||
    effect.kind === "reduce-cooldowns" ||
    effect.kind === "critical-damage" ||
    effect.kind === "guard-response" ||
    effect.kind === "evade-response"
  ) {
    return "effect-unavailable";
  }
  return "full-hp";
}

function hasPartyBossCooldown(cooldowns: CombatActorResourceState["cooldowns"]): boolean {
  return Boolean(cooldowns && (Object.values(cooldowns.abilities ?? {}).some((entry) => entry.remainingTurns > 0) || (cooldowns.skill?.remainingTurns ?? 0) > 0));
}

function resolvePartyBossRandomEffect(
  effect: ItemUseEffectContent,
  resources: CombatActorResourceState,
  rng: SeededRandomSource
): ItemUseEffectContent {
  if (effect.kind !== "random-resource") return effect;
  const candidates: ItemUseEffectContent[] = [];
  if (resources.hp < resources.hpMax) candidates.push({ kind: "heal-hp", amount: effect.amount });
  if (resources.mana < resources.manaMax) candidates.push({ kind: "restore-mana", amount: effect.amount });
  if (effect.bothAmount !== undefined) candidates.push({ kind: "restore-both", hpAmount: effect.bothAmount, manaAmount: effect.bothAmount });
  return candidates[rng.nextInt(0, candidates.length - 1)] ?? effect;
}

function reducePartyBossCooldowns(resources: CombatActorResourceState, turns: number): CombatActorResourceState {
  if (!resources.cooldowns) return resources;
  const cooldowns = cloneCombatCooldowns(resources.cooldowns);
  if (cooldowns.skill) cooldowns.skill.remainingTurns = Math.max(0, cooldowns.skill.remainingTurns - turns);
  for (const entry of Object.values(cooldowns.abilities ?? {})) entry.remainingTurns = Math.max(0, entry.remainingTurns - turns);
  return hasPartyBossCooldown(cooldowns)
    ? { ...resources, cooldowns }
    : { ...resources, cooldowns: undefined };
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
    ...(state.personalProtocol
      ? {
          personalProtocol: {
            ...state.personalProtocol,
            signatures: state.personalProtocol.signatures.map((signature) => ({ ...signature }))
          }
        }
      : {}),
    ...(state.warriorTaunt
      ? {
          warriorTaunt: {
            ...(state.warriorTaunt.active ? { active: { ...state.warriorTaunt.active } } : {}),
            cooldowns: Object.fromEntries(
              Object.entries(state.warriorTaunt.cooldowns).map(([characterId, cooldown]) => [characterId, { ...cooldown }])
            )
          }
        }
      : {}),
    ...(state.bardMusic
      ? {
          bardMusic: state.bardMusic.kind === "inspiration"
            ? { ...state.bardMusic, sourcePerformanceIds: [...state.bardMusic.sourcePerformanceIds] }
            : { ...state.bardMusic }
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
      ...(participant.varenykSated ? { varenykSated: cloneVarenykSatedCombatState(participant.varenykSated) } : {}),
      ...(participant.bardInspiration
        ? { bardInspiration: cloneBardInspirationCombatState(participant.bardInspiration) }
        : {}),
      ...(participant.bardMusicAvailableAt
        ? { bardMusicAvailableAt: participant.bardMusicAvailableAt }
        : {}),
      contribution: { ...participant.contribution },
      ...(participant.statistics ? { statistics: { ...participant.statistics } } : {})
    })),
    roundLog: state.roundLog.map((round) => ({
      ...round,
      actions: round.actions.map((action) => ({
        ...action,
        ...(action.satedRecovery ? { satedRecovery: { ...action.satedRecovery } } : {}),
        ...(action.supportTargets
          ? { supportTargets: action.supportTargets.map((target) => ({ ...target })) }
          : {})
      })),
      bossRetaliations: round.bossRetaliations.map((retaliation) => ({ ...retaliation })),
      ...(round.wardSign
        ? { wardSign: { ...round.wardSign, affectedCharacterIds: [...round.wardSign.affectedCharacterIds] } }
        : {}),
      ...(round.personalProtocol ? { personalProtocol: { ...round.personalProtocol } } : {}),
      ...(round.warriorTaunt ? { warriorTaunt: { ...round.warriorTaunt } } : {}),
      ...(round.bardMusic ? { bardMusic: { ...round.bardMusic } } : {}),
      ...(round.participantsAfter
        ? {
            participantsAfter: round.participantsAfter.map((participant) => ({
              ...participant,
              ...(participant.cooldowns ? { cooldowns: cloneCombatCooldowns(participant.cooldowns) } : {}),
              ...(participant.combatItems ? { combatItems: clonePartyBossCombatItemState(participant.combatItems) } : {}),
              ...(participant.varenykSated
                ? { varenykSated: cloneVarenykSatedCombatState(participant.varenykSated) }
                : participant.varenykSated === null
                  ? { varenykSated: null }
                  : {}),
              ...(participant.bardInspiration
                ? { bardInspiration: cloneBardInspirationCombatState(participant.bardInspiration) }
                : participant.bardInspiration === null
                  ? { bardInspiration: null }
                  : {})
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

function cappedPartyBossPrevention(
  hpBefore: number,
  damageBefore: number,
  damageAfter: number
): number {
  return Math.max(
    0,
    Math.min(Math.max(0, hpBefore), Math.max(0, damageBefore)) -
      Math.min(Math.max(0, hpBefore), Math.max(0, damageAfter))
  );
}

function creditPartyBossStatistic(
  state: PartyBossState,
  characterId: string,
  dimension: "guardPrevented" | "control",
  amount: number
): void {
  const statistics = state.participants.find(
    (participant) => participant.characterId === characterId
  )?.statistics;
  const applied = Math.max(0, Math.floor(amount));
  if (!statistics || applied <= 0) return;
  if (dimension === "guardPrevented") {
    statistics.guardPrevented += applied;
  } else {
    statistics.control = (statistics.control ?? 0) + applied;
  }
}

function applyBossRetaliation(
  state: PartyBossState,
  counterDamageByCharacterId: ReadonlyMap<string, number>,
  itemResponseByCharacterId: ReadonlyMap<string, {
    itemId: string;
    kind: "guard" | "evade";
    percent: number;
    used: boolean;
    preventedDamage: number;
  }> = new Map(),
  abilityGuardSourceByCharacterId: ReadonlyMap<string, string> = new Map()
): {
  retaliations: PartyBossRetaliationSummary[];
  wardSign?: PartyBossWardSignRoundSummary;
  personalProtocol?: PartyBossPersonalProtocolRoundSummary;
  warriorTaunt?: PartyBossWarriorTauntRoundSummary;
  bardMusic?: PartyBossBardMusicRoundSummary;
} {
  const retaliations: PartyBossRetaliationSummary[] = [];
  const big = isBigBarrelBrotherState(state);
  const broadBigRetaliation = big && isBigBarrelBroadRetaliationTurn(state);
  const wardCanTrigger = broadBigRetaliation && state.wardSign?.status === "carried";
  const personalProtocolCanTrigger = big && !broadBigRetaliation && state.personalProtocol !== undefined;
  const originalPlan = big ? getPartyBossRetaliationPlanWithoutTaunt(state) : null;
  const expiredBeforeTargeting = expireUnableWarriorTaunt(state);
  const activeTaunt = state.warriorTaunt?.active;
  const targetIds = activeTaunt
    ? [activeTaunt.characterId]
    : big
      ? (originalPlan?.characterIds ?? [])
      : state.participants.map((participant) => participant.characterId);
  const targetIdSet = new Set(targetIds);
  const targets = state.participants.filter((participant) => targetIdSet.has(participant.characterId));
  let wardPreventedDamage = 0;
  const wardAffectedCharacterIds: string[] = [];
  let personalProtocolRound: PartyBossPersonalProtocolRoundSummary | undefined;
  const lament = state.bardMusic?.kind === "lament" &&
    state.bardMusic.remainingBossResponses > 0
    ? state.bardMusic
    : null;

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
    const unmitigatedDamage = Math.max(1, Math.floor((rawDamage + bigPressure) * focusMultiplier));
    const guardedDamage = Math.max(1, Math.floor((rawDamage + bigPressure) * guardReduction * focusMultiplier));
    const damageBeforeLament = Math.max(0, guardedDamage - Math.max(0, participant.resources.guard?.abilityDamageReduction ?? 0));
    const lamentPrevented = lament
      ? Math.min(damageBeforeLament, lament.damageReduction)
      : 0;
    const damageBeforeWard = Math.max(0, damageBeforeLament - lamentPrevented);
    const wardPrevented = wardCanTrigger
      ? Math.min(damageBeforeWard, Math.floor(damageBeforeWard * state.wardSign!.mitigationPercent / 100))
      : 0;
    const damageAfterWardBase = Math.max(0, damageBeforeWard - wardPrevented);
    const signature = personalProtocolCanTrigger
      ? state.personalProtocol!.signatures.find((entry) =>
          entry.characterId === participant.characterId && entry.status === "unspent"
        )
      : undefined;
    const protocolPrevented = signature ? damageAfterWardBase : 0;
    const damageAfterProtocol = signature ? 0 : damageAfterWardBase;
    const itemResponse = itemResponseByCharacterId.get(participant.characterId);
    const itemResponseDelta = resolveCombatResponseItemDelta(
      {
        damage: itemResponse
          ? Math.min(participant.resources.hp, damageAfterProtocol)
          : damageAfterProtocol,
        harmfulOnHitConsequenceCount: 0
      },
      itemResponse
        ? { kind: itemResponse.kind, percent: itemResponse.percent }
        : undefined
    );
    if (itemResponseDelta.eligible && itemResponse) {
      itemResponse.used = true;
      itemResponse.preventedDamage = itemResponseDelta.preventedDamage;
    }
    const damage = itemResponseDelta.damageAfter;
    if (wardCanTrigger) {
      wardPreventedDamage += wardPrevented;
      wardAffectedCharacterIds.push(participant.characterId);
    }
    if (signature && state.personalProtocol) {
      const bossActionId = `big-barrel:${state.turn}:personal:${participant.characterId}`;
      signature.status = "spent";
      signature.triggeredTurn = state.turn;
      signature.bossActionId = bossActionId;
      signature.preventedDamage = protocolPrevented;
      personalProtocolRound = {
        kind: "bureaucramancer-personal-protocol-13b",
        status: "triggered",
        characterId: participant.characterId,
        preventedDamage: protocolPrevented,
        triggeredTurn: state.turn,
        bossActionId,
        spentCount: state.personalProtocol.signatures.filter((entry) => entry.status === "spent").length,
        signatureCount: state.personalProtocol.signatures.length
      };
    }
    const hpBeforeRetaliation = participant.resources.hp;
    participant.resources.hp = Math.max(0, participant.resources.hp - damage);
    participant.contribution.damageTaken += damage;
    if (participant.statistics) {
      const actualDamageTaken = Math.max(0, hpBeforeRetaliation - participant.resources.hp);
      participant.statistics.damageTaken += actualDamageTaken;
    }
    creditPartyBossStatistic(
      state,
      participant.characterId,
      "guardPrevented",
      cappedPartyBossPrevention(hpBeforeRetaliation, unmitigatedDamage, guardedDamage)
    );
    creditPartyBossStatistic(
      state,
      abilityGuardSourceByCharacterId.get(participant.characterId) ?? participant.characterId,
      "guardPrevented",
      cappedPartyBossPrevention(hpBeforeRetaliation, guardedDamage, damageBeforeLament)
    );
    if (lament) {
      creditPartyBossStatistic(
        state,
        lament.sourceCharacterId,
        "control",
        cappedPartyBossPrevention(hpBeforeRetaliation, damageBeforeLament, damageBeforeWard)
      );
    }
    if (wardCanTrigger && state.wardSign) {
      creditPartyBossStatistic(
        state,
        state.wardSign.placerCharacterId,
        "guardPrevented",
        cappedPartyBossPrevention(hpBeforeRetaliation, damageBeforeWard, damageAfterWardBase)
      );
    }
    if (signature) {
      creditPartyBossStatistic(
        state,
        signature.characterId,
        "control",
        cappedPartyBossPrevention(hpBeforeRetaliation, damageAfterWardBase, damageAfterProtocol)
      );
    }
    if (itemResponseDelta.eligible) {
      creditPartyBossStatistic(
        state,
        participant.characterId,
        "control",
        itemResponseDelta.preventedDamage + itemResponseDelta.preventedHarmfulOnHitConsequenceCount
      );
    }
    const counterDamage = damage > 0 && participant.resources.hp > 0
      ? Math.min(
          state.boss.hp,
          Math.max(0, Math.floor(counterDamageByCharacterId.get(participant.characterId) ?? 0))
        )
      : 0;
    state.boss.hp = Math.max(0, state.boss.hp - counterDamage);
    if (participant.statistics) participant.statistics.damage += counterDamage;

    if (participant.resources.hp <= 0) {
      participant.status = "knocked-out";
    }

    retaliations.push({
      characterId: participant.characterId,
      damage,
      hpAfter: participant.resources.hp,
      ...(activeTaunt && originalPlan && originalPlan.kind !== "none"
        ? { tauntRedirected: true, tauntOriginalKind: originalPlan.kind }
        : {}),
      ...(wardPrevented > 0 ? { damageBeforeWard, wardPreventedDamage: wardPrevented } : {}),
      ...(protocolPrevented > 0 ? { damageBeforeProtocol: damageAfterWardBase, protocolPreventedDamage: protocolPrevented } : {}),
      ...(lamentPrevented > 0 ? { damageBeforeLament, lamentPreventedDamage: lamentPrevented } : {}),
      ...(itemResponse?.used
        ? {
            itemResponseItemId: itemResponse.itemId,
            itemResponseKind: itemResponse.kind,
            itemResponsePreventedDamage: itemResponse.preventedDamage
          }
        : {}),
      ...(counterDamage > 0 ? { counterDamage } : {})
    });
  }

  const bardMusicRound = lament && retaliations.length > 0
    ? (() => {
        lament.remainingBossResponses = Math.max(0, lament.remainingBossResponses - 1);
        return {
          kind: "lament" as const,
          activationId: lament.activationId,
          sourceCharacterId: lament.sourceCharacterId,
          damageReduction: lament.damageReduction,
          activated: lament.activatedTurn === state.turn,
          remainingBossResponses: lament.remainingBossResponses,
          expired: lament.remainingBossResponses === 0
        };
      })()
    : lament && lament.activatedTurn === state.turn
      ? {
          kind: "lament" as const,
          activationId: lament.activationId,
          sourceCharacterId: lament.sourceCharacterId,
          damageReduction: lament.damageReduction,
          activated: true,
          remainingBossResponses: lament.remainingBossResponses,
          expired: false
        }
      : undefined;

  const warriorTauntRound = activeTaunt && originalPlan && originalPlan.kind !== "none"
    ? resolveWarriorTauntBossAttack(state, activeTaunt.characterId, originalPlan.kind)
    : expiredBeforeTargeting
      ? { expiredCharacterId: expiredBeforeTargeting }
      : undefined;

  if (wardCanTrigger && state.wardSign && wardAffectedCharacterIds.length > 0) {
    const currentUsesRemaining = Math.max(1, Math.floor(state.wardSign.usesRemaining ?? Math.max(1, state.wardSign.supportCount)));
    const usesRemaining = Math.max(0, currentUsesRemaining - 1);
    const usesMax = Math.max(1, Math.floor(state.wardSign.usesMax ?? Math.max(1, state.wardSign.supportCount)));
    const totalPreventedDamage = Math.max(0, Math.floor(state.wardSign.preventedDamage ?? 0)) + wardPreventedDamage;
    state.wardSign = {
      ...state.wardSign,
      status: usesRemaining > 0 ? "carried" : "broken",
      usesRemaining,
      usesMax,
      triggeredTurn: state.turn,
      preventedDamage: totalPreventedDamage,
      affectedCharacterIds: wardAffectedCharacterIds
    };
    return {
      retaliations,
      ...(personalProtocolRound ? { personalProtocol: personalProtocolRound } : {}),
      ...(warriorTauntRound ? { warriorTaunt: warriorTauntRound } : {}),
      ...(bardMusicRound ? { bardMusic: bardMusicRound } : {}),
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

  return {
    retaliations,
    ...(personalProtocolRound ? { personalProtocol: personalProtocolRound } : {}),
    ...(warriorTauntRound ? { warriorTaunt: warriorTauntRound } : {}),
    ...(bardMusicRound ? { bardMusic: bardMusicRound } : {})
  };
}

function applyPartyBossAbilitySupport(
  state: PartyBossState,
  actor: PartyBossParticipantState,
  ability: CombatSkillProfile | undefined,
  counterDamageByCharacterId: Map<string, number>,
  abilityGuardSourceByCharacterId: Map<string, string>
): {
  healing?: number;
  guard?: number;
  hpAfter?: number;
  supportTargets?: NonNullable<PartyBossParticipantActionSummary["supportTargets"]>;
} {
  if (!ability) {
    return {};
  }
  const healingAmount = Math.max(0, Math.floor(ability.healAmount ?? 0));
  const guard = Math.max(
    0,
    Math.floor(ability.source === "equipment"
      ? ability.guardReduction ?? 0
      : Math.max(ability.monsterDamageReduction, ability.guardReduction ?? 0))
  );
  const counterDamage = Math.max(0, Math.floor(ability.counterDamage ?? 0));
  if (healingAmount === 0 && guard === 0 && counterDamage === 0) {
    return {};
  }
  const healingTargets = healingAmount > 0
    ? getPartyBossSupportTargets(
        state,
        actor,
        isPartyBossSupportScope(ability.primaryTargetScope)
          ? ability.primaryTargetScope
          : ability.secondaryTargetScope ?? "self"
      )
    : [];
  const protectionTargets = guard > 0 || counterDamage > 0
    ? getPartyBossSupportTargets(
        state,
        actor,
        ability.secondaryTargetScope ?? (
          isPartyBossSupportScope(ability.primaryTargetScope) ? ability.primaryTargetScope : "self"
        )
      )
    : [];
  const targetIds = new Set([
    ...healingTargets.map((target) => target.characterId),
    ...protectionTargets.map((target) => target.characterId)
  ]);
  const supportTargets = [...targetIds].map((characterId) => {
    const target = state.participants.find((participant) => participant.characterId === characterId)!;
    const healing = healingTargets.some((candidate) => candidate.characterId === characterId)
      ? applyPartyBossHealing(target.resources, healingAmount)
      : 0;
    const protects = protectionTargets.some((candidate) => candidate.characterId === characterId);
    if (protects && guard > 0) {
      const previousAbilityGuard = target.resources.guard?.abilityDamageReduction ?? 0;
      target.resources.guard = {
        consecutiveDefends: 1,
        abilityDamageReduction: Math.max(
          guard,
          target.resources.guard?.abilityDamageReduction ?? 0
        )
      };
      if (guard > previousAbilityGuard) {
        abilityGuardSourceByCharacterId.set(target.characterId, actor.characterId);
      }
    }
    if (protects && counterDamage > 0) {
      counterDamageByCharacterId.set(
        target.characterId,
        Math.max(counterDamage, counterDamageByCharacterId.get(target.characterId) ?? 0)
      );
    }
    return {
      characterId: target.characterId,
      ...(healing > 0 ? { healing } : {}),
      ...(protects && guard > 0 ? { guard } : {}),
      ...(protects && counterDamage > 0 ? { counterDamage } : {})
    };
  });
  const actorSupport = supportTargets.find((target) => target.characterId === actor.characterId);
  return {
    ...(actorSupport?.healing ? { healing: actorSupport.healing, hpAfter: actor.resources.hp } : {}),
    ...(actorSupport?.guard ? { guard: actorSupport.guard } : {}),
    ...(supportTargets.length > 0 ? { supportTargets } : {})
  };
}

function getPartyBossAbilityProfile(
  participant: PartyBossParticipantState,
  action: "skill" | "race" | "gear",
  gearAbility: CombatGearAbilityInput["profile"] | undefined
): CombatSkillProfile | undefined {
  if (action === "skill") {
    return getCombatClassAbilityProfile(participant.combatStats.classId);
  }
  if (action === "race") {
    return getCombatRaceAbilityProfile(participant.combatStats.raceId) ?? undefined;
  }
  return gearAbility;
}

function getPartyBossSupportTargets(
  state: PartyBossState,
  actor: PartyBossParticipantState,
  scope: NonNullable<CombatSkillProfile["primaryTargetScope"]>
): PartyBossParticipantState[] {
  const living = state.participants.filter(
    (participant) => participant.status === "active" && participant.resources.hp > 0
  );
  switch (scope) {
    case "all-allies-including-self":
      return living;
    case "lowest-hp-ally": {
      const allies = living.filter((participant) => participant.characterId !== actor.characterId);
      const candidates = allies.length > 0 ? allies : [actor];
      return [candidates.reduce((lowest, participant) =>
        participant.resources.hp / Math.max(1, participant.resources.hpMax) <
          lowest.resources.hp / Math.max(1, lowest.resources.hpMax)
          ? participant
          : lowest
      )];
    }
    case "single-ally-or-self":
    case "self":
      return [actor];
    default:
      return [actor];
  }
}

function isPartyBossSupportScope(
  scope: CombatSkillProfile["primaryTargetScope"] | undefined
): scope is Extract<NonNullable<CombatSkillProfile["primaryTargetScope"]>,
  "self" | "single-ally-or-self" | "all-allies-including-self" | "lowest-hp-ally"> {
  return scope === "self" ||
    scope === "single-ally-or-self" ||
    scope === "all-allies-including-self" ||
    scope === "lowest-hp-ally";
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

  const tauntingWarrior = state.warriorTaunt?.active
    ? living.find((participant) => participant.characterId === state.warriorTaunt?.active?.characterId)
    : null;
  if (tauntingWarrior) {
    return {
      kind: isBigBarrelBroadRetaliationTurn(state) ? "broad" : "focused",
      characterIds: [tauntingWarrior.characterId]
    };
  }

  return getPartyBossRetaliationPlanWithoutTaunt(state);
}

function getPartyBossRetaliationPlanWithoutTaunt(state: PartyBossState): PartyBossRetaliationPlan {
  const living = state.participants.filter(
    (participant) => participant.status === "active" && participant.resources.hp > 0
  );

  if (isBigBarrelBroadRetaliationTurn(state)) {
    return { kind: "broad", characterIds: living.map((participant) => participant.characterId) };
  }

  const focused = selectBigBarrelRetaliationTarget(state, living);
  return focused
    ? { kind: "focused", characterIds: [focused.characterId] }
    : { kind: "none", characterIds: [] };
}

export type WarriorRaidTauntAvailability =
  | { available: true }
  | {
      available: false;
      reason: "not-big-barrel" | "not-active" | "not-participant" | "not-warrior" | "unable" | "active-taunt" | "cooldown";
      availableTurn?: number;
    };

export function getWarriorRaidTauntAvailability(
  state: PartyBossState,
  characterId: string
): WarriorRaidTauntAvailability {
  if (!isBigBarrelBrotherState(state)) {
    return { available: false, reason: "not-big-barrel" };
  }
  if (state.status !== "active") {
    return { available: false, reason: "not-active" };
  }
  const participant = state.participants.find((entry) => entry.characterId === characterId);
  if (!participant) {
    return { available: false, reason: "not-participant" };
  }
  if (participant.combatStats.classId !== "class.warrior") {
    return { available: false, reason: "not-warrior" };
  }
  if (participant.status !== "active" || participant.resources.hp <= 0) {
    return { available: false, reason: "unable" };
  }
  if (state.warriorTaunt?.active) {
    return { available: false, reason: "active-taunt" };
  }
  const availableTurn = state.warriorTaunt?.cooldowns[characterId]?.availableTurn;
  if (availableTurn !== undefined && state.turn < availableTurn) {
    return { available: false, reason: "cooldown", availableTurn };
  }
  return { available: true };
}

function tryActivateWarriorRaidTaunt(state: PartyBossState, characterId: string): boolean {
  if (!getWarriorRaidTauntAvailability(state, characterId).available) {
    return false;
  }
  state.warriorTaunt = {
    active: {
      characterId,
      activatedTurn: state.turn,
      bossAttacksRemaining: WARRIOR_RAID_TAUNT_DURATION_BOSS_ATTACKS
    },
    cooldowns: {
      ...(state.warriorTaunt?.cooldowns ?? {}),
      [characterId]: { availableTurn: state.turn + WARRIOR_RAID_TAUNT_COOLDOWN_TURNS }
    }
  };
  return true;
}

function expireUnableWarriorTaunt(state: PartyBossState): string | null {
  const active = state.warriorTaunt?.active;
  if (!active) {
    return null;
  }
  const participant = state.participants.find((entry) => entry.characterId === active.characterId);
  if (participant?.status === "active" && participant.resources.hp > 0) {
    return null;
  }
  delete state.warriorTaunt!.active;
  return active.characterId;
}

function clearActiveWarriorTaunt(state: PartyBossState): string | null {
  const characterId = state.warriorTaunt?.active?.characterId;
  if (!characterId) {
    return null;
  }
  delete state.warriorTaunt!.active;
  return characterId;
}

function resolveWarriorTauntBossAttack(
  state: PartyBossState,
  characterId: string,
  redirectedAttackKind: "focused" | "broad"
): PartyBossWarriorTauntRoundSummary {
  const active = state.warriorTaunt?.active;
  if (!active || active.characterId !== characterId) {
    return {};
  }
  const bossAttacksRemaining = Math.max(0, active.bossAttacksRemaining - 1);
  const participant = state.participants.find((entry) => entry.characterId === characterId);
  const expired = bossAttacksRemaining === 0 || participant?.status !== "active" || participant.resources.hp <= 0;
  if (expired) {
    delete state.warriorTaunt!.active;
  } else {
    active.bossAttacksRemaining = bossAttacksRemaining;
  }
  return {
    redirectedCharacterId: characterId,
    redirectedAttackKind,
    ...(expired
      ? { expiredCharacterId: characterId }
      : { bossAttacksRemaining })
  };
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
