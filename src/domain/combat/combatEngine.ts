import type { RandomSource } from "../../shared/random";
import { DENSE_BANDAGE_ITEM_ID, FIELD_KIT_ITEM_ID } from "../itemCraft";
import {
  BASIC_DEFEND_ABILITY_ID,
  getCombatClassAbilityProfile,
  getCombatRaceAbilityProfile,
  getCombatSkillProfile,
  type CombatSkillProfile
} from "./combatActions";
import { recordCombatAnalyticsTurn } from "./combatBalanceAnalytics";
import { resolveMonsterBark } from "./combatBarks";
import {
  applyHeroActivationMonsterEffects,
  applyMonsterRuntimeFleePenalty,
  applyMonsterRuntimeHeroAttackModifiers,
  applyMonsterRuntimeHeroDamage,
  applyMonsterRuntimeMonsterActionModifiers,
  consumeMonsterRuntimeDirectHitModifiers,
  getMonsterRuntimeSkillManaCostIncrease,
  isHeroClassSkillLockedByMonster,
  monsterAbilityAsCombatSkill,
  presentActiveMonsterRuntimeEffectNotices,
  resolveMonsterRuntimeAction
} from "./monsterAbilityRuntime";
import {
  rollBasicAttack,
  rollFleeSuccess,
  rollMonsterDamage,
  rollMonsterSkillDamage,
  rollSkillAttack
} from "./combatBalance";
import {
  clampResource,
  cloneCombatCooldowns,
  cloneCombatItemState,
  clonePlayerAbilityFumblesState,
  cloneCombatState,
  cloneCombatTurnSummary,
  appendCombatTurnLogEntry,
  combatEnemyToMonster,
  getLivingCombatEnemies,
  getPrimaryCombatEnemy,
  getTerminalCombatTurnLogEventId,
  hasCombatEnemyCollection,
  normalizeCombatEnemies,
  syncPrimaryCombatEnemy,
  turnLogEnemies,
  updateCombatEnemy,
  PLAYER_ABILITY_FUMBLE_CYCLE_USES,
  type CombatActionOrigin,
  type CombatActionType,
  type CombatActorStats,
  type CombatBleedStatus,
  type CombatAllyAbilityResult,
  type CombatEnemyAbilityResult,
  type CombatEnemyState,
  type CombatEnemyTurnSummary,
  type CombatGuardState,
  type CombatPlayerAbilityFumbleSummary,
  type CombatState,
  type CombatTurnSummary,
  type MonsterCombatStats,
  type PlayerAbilityFumblesState,
  type PlayerCombatActionType
} from "./combatState";

export interface ResolveCombatTurnInput {
  state: CombatState;
  action: CombatActionType;
  actionOrigin?: CombatActionOrigin;
  gearAbility?: CombatGearAbilityInput;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  enemies?: MonsterCombatStats[];
  afterCommittedHeroAction?: (state: CombatState) => CombatTurnSummary["satedRecovery"] | undefined;
  rng: RandomSource;
}

export interface CombatGearAbilityInput {
  profile: CombatSkillProfile;
  bleed?: Omit<CombatBleedStatus, "refreshedAtTurn">;
}

export interface ResolveCombatItemTurnInput {
  state: CombatState;
  item: {
    id: string;
    name: string;
    effect: CombatItemEffectInput;
  };
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  enemies?: MonsterCombatStats[];
  afterCommittedHeroAction?: (state: CombatState) => CombatTurnSummary["satedRecovery"] | undefined;
  rng: RandomSource;
}

export type CombatItemEffectInput =
  | {
      kind: "heal-hp";
      amount: number;
    }
  | {
      kind: "heal-hp-to-min-percent";
      percent: number;
    };

export type ResolveCombatTurnResult =
  | {
      ok: true;
      state: CombatState;
      summary: CombatTurnSummary;
    }
  | {
      ok: false;
      reason: "inactive" | "not-enough-mana" | "skill-on-cooldown";
      state: CombatState;
      summary: CombatTurnSummary;
    };

export type ResolveCombatItemTurnResult =
  | {
      ok: true;
      state: CombatState;
      summary: CombatTurnSummary;
    }
  | {
      ok: false;
      reason: "inactive" | "full-hp" | "item-on-cooldown" | "item-limit-reached";
      state: CombatState;
      summary: CombatTurnSummary;
    };

export interface CombatActionAvailability {
  attack: { available: true };
  defend: { available: true };
  flee: { available: true };
  skill: {
    available: boolean;
    skill: ReturnType<typeof getCombatSkillProfile>;
    reason?: "not-enough-mana" | "cooldown";
    cooldownRemainingTurns?: number;
  };
  race: {
    available: boolean;
    ability: ReturnType<typeof getCombatRaceAbilityProfile>;
    reason?: "not-enough-mana" | "cooldown" | "missing";
    cooldownRemainingTurns?: number;
  };
}

export interface CombatGearActionAvailability {
  available: boolean;
  reason?: "not-enough-mana" | "cooldown";
  cooldownRemainingTurns?: number;
}

export interface CombatActorResourceState {
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  cooldowns?: CombatState["cooldowns"];
  guard?: CombatGuardState;
  playerAbilityFumbles?: PlayerAbilityFumblesState;
}

export interface ResolveActorCombatActionInput {
  actorState: CombatActorResourceState;
  defenderState: CombatActorResourceState;
  actorStats: CombatActorStats;
  defenderStats: MonsterCombatStats;
  action: Exclude<PlayerCombatActionType, "flee">;
  skillProfile?: CombatSkillProfile;
  fumbleSeed?: string;
  rng: RandomSource;
}

export interface ActorCombatActionSummary {
  action: Exclude<PlayerCombatActionType, "flee">;
  actorOutcome: Extract<
    CombatTurnSummary["heroOutcome"],
    "hit" | "critical-hit" | "miss" | "defended" | "not-enough-mana" | "skill-on-cooldown" | "critical-fumble" | "won"
  >;
  actorDamage: number;
  manaSpent: number;
  critical: boolean;
  skillId?: string;
  damageKind?: CombatTurnSummary["damageKind"];
  fumble?: CombatPlayerAbilityFumbleSummary;
}

export interface ResolveActorCombatActionResult {
  actorState: CombatActorResourceState;
  defenderState: CombatActorResourceState;
  summary: ActorCombatActionSummary;
}

interface MonsterResponseResult {
  damage: number;
  outcome?: CombatTurnSummary["monsterOutcome"];
  monsterAction?: CombatTurnSummary["monsterAction"];
  monsterSkill?: CombatSkillProfile;
  monsterEffectText?: string;
  monsterTelegraphAbilityId?: string;
  simultaneousFinalResponse?: boolean;
  defendCounter?: boolean;
}

export function getCombatActionAvailability(
  state: CombatState,
  hero: Pick<CombatActorStats, "classId" | "raceId">
): CombatActionAvailability {
  return getActorCombatActionAvailability({ ...state.hero, cooldowns: state.cooldowns }, hero);
}

export function getActorCombatActionAvailability(
  actorState: Pick<CombatActorResourceState, "mana" | "cooldowns">,
  actor: Pick<CombatActorStats, "classId" | "raceId">
): CombatActionAvailability {
  const skill = getCombatClassAbilityProfile(actor.classId);
  const raceAbility = getCombatRaceAbilityProfile(actor.raceId);
  const skillAvailability = getAbilityAvailability(actorState, skill);
  const raceAvailability = raceAbility
    ? getAbilityAvailability(actorState, raceAbility)
    : { available: false as const, reason: "missing" as const };

  return {
    attack: { available: true },
    defend: { available: true },
    flee: { available: true },
    skill: {
      ...skillAvailability,
      skill
    },
    race: {
      ...raceAvailability,
      ability: raceAbility
    }
  };
}

export function getCombatGearActionAvailability(
  state: CombatState,
  ability: CombatSkillProfile
): CombatGearActionAvailability {
  return getCombatGearActionAvailabilityForActor({ ...state.hero, cooldowns: state.cooldowns }, ability);
}

export function getCombatGearActionAvailabilityForActor(
  actorState: Pick<CombatActorResourceState, "mana" | "cooldowns">,
  ability: CombatSkillProfile
): CombatGearActionAvailability {
  return getAbilityAvailability(actorState, ability);
}

export function resolveActorCombatAction(
  input: ResolveActorCombatActionInput
): ResolveActorCombatActionResult {
  const actorState = cloneActorResourceState(input.actorState);
  const defenderState = cloneActorResourceState(input.defenderState);

  if (input.action === "defend") {
    const nextActor = tickActorCooldowns(actorState);
    nextActor.guard = getNextDefendGuard(actorState.guard);

    return {
      actorState: nextActor,
      defenderState,
      summary: {
        action: "defend",
        actorOutcome: "defended",
        actorDamage: 0,
        manaSpent: 0,
        critical: false,
        skillId: BASIC_DEFEND_ABILITY_ID
      }
    };
  }

  if (input.action === "skill") {
    const skill = getCombatClassAbilityProfile(input.actorStats.classId);
    const availability = getActorCombatActionAvailability(actorState, input.actorStats).skill;

    if (!availability.available) {
      return {
        actorState,
        defenderState,
        summary: {
          action: "skill",
          actorOutcome: availability.reason === "cooldown" ? "skill-on-cooldown" : "not-enough-mana",
          actorDamage: 0,
          manaSpent: 0,
          critical: false,
          skillId: skill.id,
          damageKind: skill.damageKind
        }
      };
    }

    return resolveActorAttack(input, skill);
  }

  if (input.action === "race") {
    const ability = getCombatRaceAbilityProfile(input.actorStats.raceId);
    const availability = getActorCombatActionAvailability(actorState, input.actorStats).race;

    if (!ability || !availability.available) {
      return {
        actorState,
        defenderState,
        summary: {
          action: "race",
          actorOutcome: availability.reason === "not-enough-mana" ? "not-enough-mana" : "skill-on-cooldown",
          actorDamage: 0,
          manaSpent: 0,
          critical: false,
          ...(ability ? { skillId: ability.id, damageKind: ability.damageKind } : {})
        }
      };
    }

    return resolveActorAttack(input, ability);
  }

  if (input.action === "gear") {
    const ability = input.skillProfile;
    const availability = ability
      ? getAbilityAvailability(actorState, ability)
      : { available: false as const, reason: "cooldown" as const };

    if (!ability || !availability.available) {
      return {
        actorState,
        defenderState,
        summary: {
          action: "gear",
          actorOutcome: availability.reason === "not-enough-mana" ? "not-enough-mana" : "skill-on-cooldown",
          actorDamage: 0,
          manaSpent: 0,
          critical: false,
          ...(ability ? { skillId: ability.id, damageKind: ability.damageKind } : {})
        }
      };
    }

    return resolveActorAttack(input, ability);
  }

  return resolveActorAttack(input);
}

export function resolveCombatTurn(input: ResolveCombatTurnInput): ResolveCombatTurnResult {
  if (input.state.status !== "active") {
    const summary: CombatTurnSummary = {
      action: input.action,
      ...summaryActionOrigin(input),
      heroOutcome: "inactive",
      heroDamage: 0,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false
    };

    return {
      ok: false,
      reason: "inactive",
      state: cloneCombatState(input.state),
      summary
    };
  }

  if (input.action === "flee") {
    return resolveFlee(input);
  }

  if (input.action === "skip") {
    return resolveHeroSkip(input);
  }

  if (input.action === "item") {
    const summary = buildSummary({
      action: "item",
      ...summaryActionOrigin(input),
      heroOutcome: "inactive",
      heroDamage: 0,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false
    });

    return {
      ok: false,
      reason: "inactive",
      state: cloneCombatState(input.state),
      summary
    };
  }

  if (input.action === "gear") {
    const ability = input.gearAbility?.profile;

    if (!ability) {
      const summary = buildSummary({
        action: "gear",
        ...summaryActionOrigin(input),
        heroOutcome: "skill-on-cooldown",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false
      });

      return {
        ok: false,
        reason: "skill-on-cooldown",
        state: cloneCombatState(input.state),
        summary
      };
    }

    const availability = getCombatGearActionAvailability(input.state, ability);

    if (!availability.available) {
      const summary = buildSummary({
        action: "gear",
        ...summaryActionOrigin(input),
        heroOutcome: availability.reason === "cooldown" ? "skill-on-cooldown" : "not-enough-mana",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false,
        skill: ability
      });

      return {
        ok: false,
        reason: summary.heroOutcome === "skill-on-cooldown" ? "skill-on-cooldown" : "not-enough-mana",
        state: cloneCombatState(input.state),
        summary
      };
    }

    return resolveHeroAttack(input, ability);
  }

  if (input.action === "skill" || input.action === "race") {
    const ability = input.action === "skill"
      ? getCombatClassAbilityProfile(input.hero.classId)
      : getCombatRaceAbilityProfile(input.hero.raceId);

    if (!ability) {
      const summary = buildSummary({
        action: input.action,
        ...summaryActionOrigin(input),
        heroOutcome: "skill-on-cooldown",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false
      });

      return {
        ok: false,
        reason: "skill-on-cooldown",
        state: cloneCombatState(input.state),
        summary
      };
    }

    if (input.action === "skill" && isHeroClassSkillLockedByMonster(input.state)) {
      const summary = buildSummary({
        action: input.action,
        ...summaryActionOrigin(input),
        heroOutcome: "skill-on-cooldown",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false,
        skill: ability
      });

      return {
        ok: false,
        reason: "skill-on-cooldown",
        state: cloneCombatState(input.state),
        summary
      };
    }

    const availability = input.action === "skill"
      ? getCombatActionAvailability(input.state, input.hero).skill
      : getCombatActionAvailability(input.state, input.hero).race;
    const manaPressure = input.action === "skill" ? getMonsterRuntimeSkillManaCostIncrease(input.state) : 0;

    if (!availability.available || input.state.hero.mana < ability.manaCost + manaPressure) {
      const summary = buildSummary({
        action: input.action,
        ...summaryActionOrigin(input),
        heroOutcome: availability.reason === "cooldown" ? "skill-on-cooldown" : "not-enough-mana",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false,
        skill: ability
      });
      return {
        ok: false,
        reason: summary.heroOutcome === "skill-on-cooldown" ? "skill-on-cooldown" : "not-enough-mana",
        state: cloneCombatState(input.state),
        summary
      };
    }

    return resolveHeroAttack(input, ability);
  }

  return resolveHeroAttack(input);
}

export function resolveCombatItemTurn(input: ResolveCombatItemTurnInput): ResolveCombatItemTurnResult {
  const turnInput: ResolveCombatTurnInput = {
    state: input.state,
    action: "item",
    hero: input.hero,
    monster: input.monster,
    ...(input.enemies ? { enemies: input.enemies } : {}),
    ...(input.afterCommittedHeroAction ? { afterCommittedHeroAction: input.afterCommittedHeroAction } : {}),
    rng: input.rng
  };

  if (input.state.status !== "active") {
    const summary = buildSummary({
      action: "item",
      heroOutcome: "inactive",
      heroDamage: 0,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false,
      item: input.item,
      heroHealing: 0
    });

    return {
      ok: false,
      reason: "inactive",
      state: cloneCombatState(input.state),
      summary
    };
  }

  const availability = getCombatItemAvailability(input.state, input.item.id);
  if (!availability.available) {
    const summary = buildSummary({
      action: "item",
      heroOutcome: "item-used",
      heroDamage: 0,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false,
      item: input.item,
      heroHealing: 0
    });

    return {
      ok: false,
      reason: availability.reason,
      state: cloneCombatState(input.state),
      summary
    };
  }

  if (resolveCombatItemHealing(input.state, input.item) <= 0) {
    const summary = buildSummary({
      action: "item",
      heroOutcome: "item-used",
      heroDamage: 0,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false,
      item: input.item,
      heroHealing: 0
    });

    return {
      ok: false,
      reason: "full-hp",
      state: cloneCombatState(input.state),
      summary
    };
  }

  if (hasCombatEnemyCollection(input.state)) {
    return resolveMultiEnemyCombatItemTurn(turnInput, input.item);
  }

  return resolveSingleEnemyCombatItemTurn(turnInput, input.item);
}

export function resolveCombatGearTurn(input: ResolveCombatGearTurnInput): ResolveCombatTurnResult {
  return resolveCombatTurn({
    state: input.state,
    action: "gear",
    gearAbility: input.ability,
    hero: input.hero,
    monster: input.monster,
    ...(input.enemies ? { enemies: input.enemies } : {}),
    ...(input.afterCommittedHeroAction ? { afterCommittedHeroAction: input.afterCommittedHeroAction } : {}),
    rng: input.rng
  });
}

function resolveSingleEnemyCombatItemTurn(
  input: ResolveCombatTurnInput,
  item: ResolveCombatItemTurnInput["item"]
): ResolveCombatItemTurnResult {
  const nextState = cloneCombatState(input.state);
  tickSkillCooldown(nextState);
  tickCombatItemCooldowns(nextState);
  const heroHealing = resolveCombatItemHealing(nextState, item);
  nextState.hero.hp = Math.min(nextState.hero.hpMax, nextState.hero.hp + heroHealing);
  recordCombatItemUse(nextState, item.id);

  const heroEffect = applyHeroActivationEffectsForCombatState(nextState);
  const heroEffectDamage = heroEffect.damage;
  const satedRecovery = nextState.hero.hp > 0
    ? input.afterCommittedHeroAction?.(nextState)
    : undefined;
  const monsterResponse = nextState.hero.hp > 0 && nextState.monster.hp > 0
    ? resolveMonsterResponse({
        state: nextState,
        input,
        damageReduction: 0
      })
    : { damage: 0 };
  const monsterDamage = heroEffectDamage + monsterResponse.damage;
  nextState.status = nextState.monster.hp <= 0 ? "won" : nextState.hero.hp <= 0 ? "lost" : "active";
  nextState.turn += 1;
  const bark = resolveMonsterBark({
    state: input.state,
    monster: input.monster,
    monsterCommittedAction: Boolean(monsterResponse.monsterAction),
    monsterUsedAbility: Boolean(monsterResponse.monsterSkill),
    monsterHpAfterHeroAction: nextState.monster.hp
  });
  nextState.barks = bark.state;
  const debugTrace = buildTurnDebugTrace(input.monster, monsterResponse.monsterSkill ?? null);
  const summary = buildSummary({
    action: "item",
    heroOutcome: "item-used",
    monsterOutcome: nextState.status === "lost"
      ? "lost"
      : monsterResponse.outcome ?? (monsterDamage > 0 ? "hit" : "miss"),
    heroDamage: 0,
    monsterDamage,
    heroEffectDamage,
    manaSpent: 0,
    critical: false,
    item,
    heroHealing,
    heroHpAfter: nextState.hero.hp,
    ...(satedRecovery ? { satedRecovery } : {}),
    ...(monsterResponse.monsterAction ? { monsterAction: monsterResponse.monsterAction } : {}),
    ...(monsterResponse.monsterSkill ? { monsterSkill: monsterResponse.monsterSkill } : {}),
    ...(monsterResponse.monsterEffectText ? { monsterEffectText: monsterResponse.monsterEffectText } : {}),
    ...(monsterResponse.monsterTelegraphAbilityId ? { monsterTelegraphAbilityId: monsterResponse.monsterTelegraphAbilityId } : {}),
    ...(bark.barkId ? { monsterBarkId: bark.barkId } : {}),
    ...(debugTrace ? { debugTrace } : {})
  });
  nextState.lastTurn = summary;
  appendCombatTurnLog(nextState, input.state.turn, summary);

  return {
    ok: true,
    state: recordCombatAnalyticsTurn(nextState, summary),
    summary
  };
}

function resolveMultiEnemyCombatItemTurn(
  input: ResolveCombatTurnInput,
  item: ResolveCombatItemTurnInput["item"]
): ResolveCombatItemTurnResult {
  const nextState = cloneCombatState(input.state);
  tickSkillCooldown(nextState);
  tickCombatItemCooldowns(nextState);
  const heroHealing = resolveCombatItemHealing(nextState, item);
  nextState.hero.hp = Math.min(nextState.hero.hpMax, nextState.hero.hp + heroHealing);
  recordCombatItemUse(nextState, item.id);

  const activationPhase = resolveHeroActivationAndLivingEnemyPhase(nextState, input, 0);
  const { enemyPhase, heroEffectDamage, satedRecovery } = activationPhase;
  nextState.status = getLivingCombatEnemies(nextState).length === 0
    ? "won"
    : nextState.hero.hp <= 0
      ? "lost"
      : "active";
  nextState.turn += 1;
  syncPrimaryCombatEnemy(nextState);
  const summary = buildSummary({
    action: "item",
    heroOutcome: "item-used",
    monsterOutcome: nextState.status === "lost" ? "lost" : enemyPhase.monsterOutcome,
    heroDamage: 0,
    monsterDamage: activationPhase.monsterDamage,
    heroEffectDamage,
    manaSpent: 0,
    critical: false,
    item,
    heroHealing,
    heroHpAfter: nextState.hero.hp,
    ...(satedRecovery ? { satedRecovery } : {}),
    ...(enemyPhase.primaryAction ? enemyActionToSummaryFields(enemyPhase.primaryAction) : {}),
    ...(enemyPhase.enemyActions.length > 0 ? { enemyActions: enemyPhase.enemyActions } : {}),
    ...(enemyPhase.enemyPressureSkips.length > 0 ? { enemyPressureSkips: enemyPhase.enemyPressureSkips } : {})
  });
  nextState.lastTurn = summary;
  appendCombatTurnLog(nextState, input.state.turn, summary);

  return {
    ok: true,
    state: recordCombatAnalyticsTurn(nextState, summary),
    summary
  };
}

function resolveCombatItemHealing(
  state: CombatState,
  item: ResolveCombatItemTurnInput["item"]
): number {
  switch (item.effect.kind) {
    case "heal-hp":
      return Math.min(Math.max(0, item.effect.amount), Math.max(0, state.hero.hpMax - state.hero.hp));
    case "heal-hp-to-min-percent": {
      const percent = Math.max(1, Math.min(100, Math.floor(item.effect.percent)));
      const targetHp = Math.min(state.hero.hpMax, Math.ceil(state.hero.hpMax * percent / 100));
      return Math.max(0, targetHp - state.hero.hp);
    }
  }
}

function getCombatItemAvailability(
  state: CombatState,
  itemId: string
): { available: true } | { available: false; reason: "item-on-cooldown" | "item-limit-reached" } {
  if (itemId === DENSE_BANDAGE_ITEM_ID) {
    const cooldown = state.combatItems?.cooldowns?.[itemId]?.remainingTurns ?? 0;
    return cooldown > 0
      ? { available: false, reason: "item-on-cooldown" }
      : { available: true };
  }

  if (itemId === FIELD_KIT_ITEM_ID) {
    const uses = state.combatItems?.uses?.[itemId]?.count ?? 0;
    return uses > 0
      ? { available: false, reason: "item-limit-reached" }
      : { available: true };
  }

  return { available: true };
}

function recordCombatItemUse(state: CombatState, itemId: string): void {
  if (itemId !== DENSE_BANDAGE_ITEM_ID && itemId !== FIELD_KIT_ITEM_ID) {
    return;
  }

  state.combatItems = cloneCombatItemState(state.combatItems ?? {});

  if (itemId === DENSE_BANDAGE_ITEM_ID) {
    state.combatItems.cooldowns = {
      ...(state.combatItems.cooldowns ?? {}),
      [itemId]: {
        itemId,
        remainingTurns: 5
      }
    };
    return;
  }

  state.combatItems.uses = {
    ...(state.combatItems.uses ?? {}),
    [itemId]: {
      itemId,
      count: (state.combatItems.uses?.[itemId]?.count ?? 0) + 1
    }
  };
}

function resolveHeroSkip(input: ResolveCombatTurnInput): ResolveCombatTurnResult {
  if (hasCombatEnemyCollection(input.state)) {
    return resolveMultiEnemyHeroSkip(input);
  }

  const nextState = cloneCombatState(input.state);
  tickSkillCooldown(nextState);
  tickCombatItemCooldowns(nextState);

  const heroEffect = applyHeroActivationEffectsForCombatState(nextState);
  const heroEffectDamage = heroEffect.damage;
  const satedRecovery = nextState.hero.hp > 0
    ? input.afterCommittedHeroAction?.(nextState)
    : undefined;
  const monsterResponse = nextState.hero.hp > 0 && nextState.monster.hp > 0
    ? resolveMonsterResponse({
        state: nextState,
        input,
        damageReduction: 0
      })
    : { damage: 0 };
  const monsterDamage = heroEffectDamage + monsterResponse.damage;
  nextState.status = nextState.monster.hp <= 0 ? "won" : nextState.hero.hp <= 0 ? "lost" : "active";
  nextState.turn += 1;
  const bark = resolveMonsterBark({
    state: input.state,
    monster: input.monster,
    monsterCommittedAction: Boolean(monsterResponse.monsterAction),
    monsterUsedAbility: Boolean(monsterResponse.monsterSkill),
    monsterHpAfterHeroAction: nextState.monster.hp
  });
  nextState.barks = bark.state;
  const debugTrace = buildTurnDebugTrace(input.monster, monsterResponse.monsterSkill ?? null);
  const summary = buildSummary({
    action: "skip",
    ...summaryActionOrigin(input),
    heroOutcome: "inactive",
    monsterOutcome: nextState.status === "lost"
      ? "lost"
      : monsterResponse.outcome ?? (monsterDamage > 0 ? "hit" : "miss"),
    heroDamage: 0,
    monsterDamage,
    heroEffectDamage,
    manaSpent: 0,
    critical: false,
    ...(satedRecovery ? { satedRecovery } : {}),
    ...(monsterResponse.monsterAction ? { monsterAction: monsterResponse.monsterAction } : {}),
    ...(monsterResponse.monsterSkill ? { monsterSkill: monsterResponse.monsterSkill } : {}),
    ...(monsterResponse.monsterEffectText ? { monsterEffectText: monsterResponse.monsterEffectText } : {}),
    ...(monsterResponse.monsterTelegraphAbilityId ? { monsterTelegraphAbilityId: monsterResponse.monsterTelegraphAbilityId } : {}),
    ...(bark.barkId ? { monsterBarkId: bark.barkId } : {}),
    ...(debugTrace ? { debugTrace } : {})
  });
  nextState.lastTurn = summary;
  appendCombatTurnLog(nextState, input.state.turn, summary);

  return {
    ok: true,
    state: recordCombatAnalyticsTurn(nextState, summary),
    summary
  };
}

function resolveHeroAttack(
  input: ResolveCombatTurnInput,
  skill?: CombatSkillProfile
): ResolveCombatTurnResult {
  if (hasCombatEnemyCollection(input.state)) {
    return resolveMultiEnemyHeroAttack(input, skill);
  }

  const nextState = cloneCombatState(input.state);
  tickCombatItemCooldowns(nextState);
  const action = skill?.action ?? (input.action === "defend" ? "defend" : "attack");
  const monsterHpBeforeHeroAction = nextState.monster.hp;
  const defenderStats = applyMonsterRuntimeHeroAttackModifiers(
    nextState,
    applyDrinkHeroAttackModifiers(input.state, input.monster)
  );
  const actorAction = resolveActorCombatAction({
    actorState: {
      ...nextState.hero,
      cooldowns: nextState.cooldowns,
      ...(nextState.guard ? { guard: nextState.guard } : {}),
      ...(nextState.playerAbilityFumbles ? { playerAbilityFumbles: nextState.playerAbilityFumbles } : {})
    },
    defenderState: {
      hp: nextState.monster.hp,
      hpMax: nextState.monster.hpMax,
      mana: 0,
      manaMax: 0
    },
    actorStats: input.hero,
    defenderStats,
    action,
    ...(skill ? { skillProfile: skill } : {}),
    fumbleSeed: buildPlayerAbilityFumbleSeed(nextState, input.hero),
    rng: input.rng
  });
  nextState.hero.hp = actorAction.actorState.hp;
  nextState.hero.mana = actorAction.actorState.mana;
  const manaPressure = skill?.action === "skill" ? getMonsterRuntimeSkillManaCostIncrease(nextState) : 0;
  if (manaPressure > 0) {
    nextState.hero.mana = clampResource(nextState.hero.mana - manaPressure, nextState.hero.manaMax);
  }
  setStateGuard(nextState, actorAction.actorState.guard);
  setStateCooldowns(nextState, actorAction.actorState.cooldowns);
  setStatePlayerAbilityFumbles(nextState, actorAction.actorState.playerAbilityFumbles);
  const support = skill && !actorAction.summary.fumble
    ? applyPlayerAbilitySupport(nextState, skill)
    : emptyAbilitySupport();
  nextState.monster.hp = actorAction.defenderState.hp;
  const runtimeHeroDamage = actorAction.summary.fumble
    ? { heroDamage: 0, reflectedDamage: 0 }
    : applyMonsterRuntimeHeroDamage({
        state: nextState,
        heroDamage: actorAction.summary.actorDamage,
        monsterHpBeforeDamage: monsterHpBeforeHeroAction,
        heroAction: action,
        rng: input.rng
      });
  const heroDamage = runtimeHeroDamage.heroDamage;
  const enemyResults = skill && abilityDealsEnemyDamage(skill) && !actorAction.summary.fumble
    ? [buildEnemyAbilityResult({
        enemyId: "enemy:1",
        monsterId: input.monster.monsterId,
        ...(input.monster.name ? { monsterName: input.monster.name } : {}),
        damage: heroDamage,
        outcome: heroOutcomeFromActor(actorAction.summary.actorOutcome, nextState.monster.hp),
        critical: actorAction.summary.critical
      })]
    : [];
  const manaSpent = actorAction.summary.manaSpent + manaPressure;
  const monsterDefeatedByHeroExchange = monsterHpBeforeHeroAction > 0 &&
    nextState.monster.hp <= 0 &&
    heroDamage > 0;
  let monsterDamage = runtimeHeroDamage.reflectedDamage;
  let heroEffectDamage = 0;
  let monsterResponse: MonsterResponseResult = { damage: 0 };
  const heroOutcome = nextState.monster.hp <= 0 && actorAction.summary.actorOutcome === "won"
    ? "won"
    : actorAction.summary.actorOutcome === "won"
      ? "hit"
      : actorAction.summary.actorOutcome;

  applyGearBleedFromAction(nextState, input, skill, actorAction.summary, "enemy:1");
  if (nextState.hero.hp <= 0) {
    nextState.status = nextState.monster.hp <= 0 ? "won" : "lost";
    nextState.turn += 1;
    const summary = buildSummary({
      action: input.action,
      ...summaryActionOrigin(input),
      heroOutcome: nextState.status === "won"
        ? "won"
        : actorAction.summary.actorOutcome === "won"
          ? "hit"
          : actorAction.summary.actorOutcome,
      ...(nextState.status === "lost" ? { monsterOutcome: "lost" as const } : {}),
      heroDamage,
      monsterDamage,
      manaSpent,
      critical: actorAction.summary.critical,
      heroHealing: support.heroHealing,
      allyResults: support.allyResults,
      enemyResults,
      ...(actorAction.summary.fumble ? { fumble: actorAction.summary.fumble } : {}),
      ...(skill ? { skill } : {})
    });
    nextState.lastTurn = summary;
    appendCombatTurnLog(nextState, input.state.turn, summary);

    return {
      ok: true,
      state: recordCombatAnalyticsTurn(nextState, summary),
      summary
    };
  }

  const monsterDefeatedBeforeHeroEffects = nextState.monster.hp <= 0;
  const heroEffect = applyHeroActivationEffectsForCombatState(nextState);
  heroEffectDamage = heroEffect.damage;
  monsterDamage += heroEffectDamage;
  const satedRecovery = nextState.hero.hp > 0
    ? input.afterCommittedHeroAction?.(nextState)
    : undefined;
  if (nextState.hero.hp > 0 && (nextState.monster.hp > 0 || monsterDefeatedBeforeHeroEffects)) {
    monsterResponse = resolveMonsterResponse({
      state: nextState,
      input,
      damageReduction: getCommittedAbilityResponseDamageReduction(skill, actorAction.summary.fumble),
      simultaneousFinalResponse: monsterDefeatedByHeroExchange
    });
    monsterDamage += monsterResponse.damage;
  }
  let counterDamage = 0;
  if (
    nextState.hero.hp > 0 &&
    monsterDamage > 0 &&
    (monsterResponse.defendCounter || (!actorAction.summary.fumble && (skill?.counterDamage ?? 0) > 0))
  ) {
    counterDamage = !actorAction.summary.fumble && skill?.counterDamage
      ? skill.counterDamage
      : rollDefendCounterDamage(input.hero, input.monster, input.rng);
    nextState.monster.hp = Math.max(0, nextState.monster.hp - counterDamage);
  }
  nextState.status = nextState.monster.hp <= 0 ? "won" : nextState.hero.hp <= 0 ? "lost" : "active";
  const monsterOutcome = monsterResponse.outcome ?? (monsterDamage > 0 ? "hit" : "miss");
  nextState.turn += 1;
  const bark = resolveMonsterBark({
    state: input.state,
    monster: input.monster,
    monsterCommittedAction: Boolean(monsterResponse.monsterAction),
    monsterUsedAbility: Boolean(monsterResponse.monsterSkill),
    monsterHpAfterHeroAction: nextState.monster.hp
  });
  nextState.barks = bark.state;

  const debugTrace = buildTurnDebugTrace(input.monster, monsterResponse.monsterSkill ?? null);
  const summary = buildSummary({
    action: input.action,
    ...summaryActionOrigin(input),
    heroOutcome,
    monsterOutcome: nextState.status === "lost" ? "lost" : monsterOutcome,
    heroDamage,
    monsterDamage,
    heroEffectDamage,
    heroCounterDamage: counterDamage,
    manaSpent,
    critical: actorAction.summary.critical,
    heroHealing: support.heroHealing,
    allyResults: support.allyResults,
    enemyResults,
    ...(satedRecovery ? { satedRecovery } : {}),
    ...(actorAction.summary.fumble ? { fumble: actorAction.summary.fumble } : {}),
    ...(skill ? { skill } : {}),
    ...(monsterResponse.monsterAction ? { monsterAction: monsterResponse.monsterAction } : {}),
    ...(monsterResponse.monsterSkill ? { monsterSkill: monsterResponse.monsterSkill } : {}),
    ...(monsterResponse.monsterEffectText ? { monsterEffectText: monsterResponse.monsterEffectText } : {}),
    ...(monsterResponse.monsterTelegraphAbilityId ? { monsterTelegraphAbilityId: monsterResponse.monsterTelegraphAbilityId } : {}),
    ...(monsterResponse.simultaneousFinalResponse ? { simultaneousFinalResponse: true } : {}),
    ...(bark.barkId ? { monsterBarkId: bark.barkId } : {}),
    ...(debugTrace ? { debugTrace } : {})
  });
  nextState.lastTurn = summary;
  appendCombatTurnLog(nextState, input.state.turn, summary);

  return {
    ok: true,
    state: recordCombatAnalyticsTurn(nextState, summary),
    summary
  };
}

function resolveFlee(input: ResolveCombatTurnInput): ResolveCombatTurnResult {
  if (hasCombatEnemyCollection(input.state)) {
    return resolveMultiEnemyFlee(input);
  }

  const nextState = cloneCombatState(input.state);
  const fled = rollFleeSuccess(
    applyMonsterRuntimeFleePenalty(nextState, input.hero),
    input.monster,
    input.rng,
    getNextFleeAttemptNumber(input.state)
  );
  let monsterDamage = 0;
  let heroEffectDamage = 0;
  let satedRecovery: CombatTurnSummary["satedRecovery"] | undefined;
  let monsterResponse: MonsterResponseResult = { damage: 0 };
  tickSkillCooldown(nextState);
  tickCombatItemCooldowns(nextState);

  if (fled) {
    satedRecovery = nextState.hero.hp > 0
      ? input.afterCommittedHeroAction?.(nextState)
      : undefined;
    nextState.status = "fled";
    nextState.turn += 1;
  } else {
    const heroEffect = applyHeroActivationEffectsForCombatState(nextState);
    heroEffectDamage = heroEffect.damage;
    satedRecovery = nextState.hero.hp > 0
      ? input.afterCommittedHeroAction?.(nextState)
      : undefined;
    monsterResponse = nextState.hero.hp > 0 && nextState.monster.hp > 0
      ? resolveMonsterResponse({
          state: nextState,
          input,
          damageReduction: 0
        })
      : { damage: 0 };
    monsterDamage = heroEffectDamage + monsterResponse.damage;
    nextState.status = nextState.monster.hp <= 0 ? "won" : nextState.hero.hp <= 0 ? "lost" : "active";
    nextState.turn += 1;
  }

  const monsterOutcome: CombatTurnSummary["monsterOutcome"] | undefined =
    fled ? undefined : monsterResponse.outcome ?? (monsterDamage > 0 ? "hit" : "miss");
  const bark = fled
    ? null
    : resolveMonsterBark({
        state: input.state,
        monster: input.monster,
        monsterCommittedAction: Boolean(monsterResponse.monsterAction),
        monsterUsedAbility: Boolean(monsterResponse.monsterSkill),
        monsterHpAfterHeroAction: nextState.monster.hp
      });
  if (bark) {
    nextState.barks = bark.state;
  }

  const summary = buildSummary({
    action: "flee",
    ...summaryActionOrigin(input),
    heroOutcome: fled ? "fled" : "flee-failed",
    monsterOutcome: nextState.status === "lost" ? "lost" : monsterOutcome,
    heroDamage: 0,
    monsterDamage,
    heroEffectDamage,
    manaSpent: 0,
    critical: false,
    ...(satedRecovery ? { satedRecovery } : {}),
    ...(monsterResponse.monsterAction ? { monsterAction: monsterResponse.monsterAction } : {}),
    ...(monsterResponse.monsterSkill ? { monsterSkill: monsterResponse.monsterSkill } : {}),
    ...(monsterResponse.monsterEffectText ? { monsterEffectText: monsterResponse.monsterEffectText } : {}),
    ...(monsterResponse.monsterTelegraphAbilityId ? { monsterTelegraphAbilityId: monsterResponse.monsterTelegraphAbilityId } : {}),
    ...(bark?.barkId ? { monsterBarkId: bark.barkId } : {})
  });
  nextState.lastTurn = summary;
  appendCombatTurnLog(nextState, input.state.turn, summary);

  return {
    ok: true,
    state: recordCombatAnalyticsTurn(nextState, summary),
    summary
  };
}

function resolveMultiEnemyHeroSkip(input: ResolveCombatTurnInput): ResolveCombatTurnResult {
  const nextState = cloneCombatState(input.state);
  tickSkillCooldown(nextState);
  tickCombatItemCooldowns(nextState);

  const activationPhase = resolveHeroActivationAndLivingEnemyPhase(nextState, input, 0);
  const { enemyPhase, heroEffectDamage, satedRecovery } = activationPhase;
  nextState.status = getLivingCombatEnemies(nextState).length === 0
    ? "won"
    : nextState.hero.hp <= 0
      ? "lost"
      : "active";
  nextState.turn += 1;
  syncPrimaryCombatEnemy(nextState);
  const summary = buildSummary({
    action: "skip",
    ...summaryActionOrigin(input),
    heroOutcome: "inactive",
    monsterOutcome: nextState.status === "lost" ? "lost" : enemyPhase.monsterOutcome,
    heroDamage: 0,
    monsterDamage: activationPhase.monsterDamage,
    heroEffectDamage,
    manaSpent: 0,
    critical: false,
    ...(satedRecovery ? { satedRecovery } : {}),
    ...(enemyPhase.primaryAction ? enemyActionToSummaryFields(enemyPhase.primaryAction) : {}),
    ...(enemyPhase.enemyActions.length > 0 ? { enemyActions: enemyPhase.enemyActions } : {}),
    ...(enemyPhase.enemyPressureSkips.length > 0 ? { enemyPressureSkips: enemyPhase.enemyPressureSkips } : {})
  });
  nextState.lastTurn = summary;
  appendCombatTurnLog(nextState, input.state.turn, summary);

  return {
    ok: true,
    state: recordCombatAnalyticsTurn(nextState, summary),
    summary
  };
}

function resolveMultiEnemyHeroAttack(
  input: ResolveCombatTurnInput,
  skill?: CombatSkillProfile
): ResolveCombatTurnResult {
  const nextState = cloneCombatState(input.state);
  tickCombatItemCooldowns(nextState);
  syncPrimaryCombatEnemy(nextState);
  const action = skill?.action ?? (input.action === "defend" ? "defend" : "attack");
  const primary = getPrimaryCombatEnemy(nextState);
  const enemyPhaseParticipants = getLivingCombatEnemies(nextState);
  const primaryStats = findEnemyStats(input, primary);
  const monsterHpBeforeHeroAction = primary.hp;
  const defenderStats = applyMonsterRuntimeHeroAttackModifiers(
    nextState,
    applyDrinkHeroAttackModifiers(input.state, primaryStats)
  );
  const actorAction = resolveActorCombatAction({
    actorState: {
      ...nextState.hero,
      cooldowns: nextState.cooldowns,
      ...(nextState.guard ? { guard: nextState.guard } : {}),
      ...(nextState.playerAbilityFumbles ? { playerAbilityFumbles: nextState.playerAbilityFumbles } : {})
    },
    defenderState: {
      hp: primary.hp,
      hpMax: primary.hpMax,
      mana: 0,
      manaMax: 0
    },
    actorStats: input.hero,
    defenderStats,
    action,
    ...(skill ? { skillProfile: skill } : {}),
    fumbleSeed: buildPlayerAbilityFumbleSeed(nextState, input.hero),
    rng: input.rng
  });
  nextState.hero.hp = actorAction.actorState.hp;
  nextState.hero.mana = actorAction.actorState.mana;
  const manaPressure = skill?.action === "skill" ? getMonsterRuntimeSkillManaCostIncrease(nextState) : 0;
  if (manaPressure > 0) {
    nextState.hero.mana = clampResource(nextState.hero.mana - manaPressure, nextState.hero.manaMax);
  }
  setStateGuard(nextState, actorAction.actorState.guard);
  setStateCooldowns(nextState, actorAction.actorState.cooldowns);
  setStatePlayerAbilityFumbles(nextState, actorAction.actorState.playerAbilityFumbles);
  const support = skill && !actorAction.summary.fumble
    ? applyPlayerAbilitySupport(nextState, skill)
    : emptyAbilitySupport();
  primary.hp = actorAction.defenderState.hp;
  nextState.monster = combatEnemyToMonster(primary);
  const runtimeHeroDamage = actorAction.summary.fumble
    ? { heroDamage: 0, reflectedDamage: 0 }
    : applyMonsterRuntimeHeroDamage({
        state: nextState,
        heroDamage: actorAction.summary.actorDamage,
        monsterHpBeforeDamage: monsterHpBeforeHeroAction,
        heroAction: action,
        rng: input.rng
      });
  primary.hp = nextState.monster.hp;
  if (nextState.monsterRuntime) {
    primary.monsterRuntime = nextState.monsterRuntime;
  } else {
    delete primary.monsterRuntime;
  }
  updateCombatEnemy(nextState, primary.enemyId, primary);
  let heroDamage = runtimeHeroDamage.heroDamage;
  const enemyResults: CombatEnemyAbilityResult[] = skill && abilityDealsEnemyDamage(skill) && !actorAction.summary.fumble
    ? [buildEnemyAbilityResult({
        enemyId: primary.enemyId,
        monsterId: primary.id,
        ...(primary.name ? { monsterName: primary.name } : {}),
        damage: runtimeHeroDamage.heroDamage,
        outcome: heroOutcomeFromActor(actorAction.summary.actorOutcome, primary.hp),
        critical: actorAction.summary.critical
      })]
    : [];
  if (skill && !actorAction.summary.fumble) {
    const extraDamage = applySecondaryEnemyAbilityDamage({
      state: nextState,
      input,
      ability: skill,
      primaryEnemyId: primary.enemyId,
      enemyResults
    });
    heroDamage += extraDamage;
  }
  applyGearBleedFromAction(nextState, input, skill, actorAction.summary, primary.enemyId);
  const monsterDefeatedByHeroExchange = monsterHpBeforeHeroAction > 0 &&
    primary.hp <= 0 &&
    heroDamage > 0;
  const manaSpent = actorAction.summary.manaSpent + manaPressure;
  let monsterDamage = runtimeHeroDamage.reflectedDamage;
  let heroEffectDamage = 0;
  let counterDamage = 0;

  if (nextState.hero.hp <= 0) {
    nextState.status = getLivingCombatEnemies(nextState).length === 0 ? "won" : "lost";
  } else {
    const activationPhase = resolveHeroActivationAndLivingEnemyPhase(
      nextState,
      input,
      getCommittedAbilityResponseDamageReduction(skill, actorAction.summary.fumble),
      enemyPhaseParticipants,
      monsterDefeatedByHeroExchange
    );
    heroEffectDamage = activationPhase.heroEffectDamage;
    monsterDamage += activationPhase.monsterDamage;
    const enemyPhase = activationPhase.enemyPhase;
    const satedRecovery = activationPhase.satedRecovery;
    if (
      nextState.hero.hp > 0 &&
      monsterDamage > 0 &&
      (enemyPhase.defendCounter || (!actorAction.summary.fumble && (skill?.counterDamage ?? 0) > 0))
    ) {
      counterDamage = !actorAction.summary.fumble && skill?.counterDamage
        ? skill.counterDamage
        : rollDefendCounterDamage(input.hero, primaryStats, input.rng);
      const counterTarget = getPrimaryCombatEnemy(nextState);
      counterTarget.hp = Math.max(0, counterTarget.hp - counterDamage);
      updateCombatEnemy(nextState, counterTarget.enemyId, counterTarget);
    }
    nextState.status = getLivingCombatEnemies(nextState).length === 0
      ? "won"
      : nextState.hero.hp <= 0
        ? "lost"
        : "active";
    const heroOutcome = nextState.status === "won"
      ? "won"
      : primary.hp <= 0 && actorAction.summary.actorOutcome === "won"
        ? "hit"
        : actorAction.summary.actorOutcome === "won"
          ? "hit"
          : actorAction.summary.actorOutcome;
    nextState.turn += 1;
    syncPrimaryCombatEnemy(nextState);
    const summary = buildSummary({
      action: input.action,
      ...summaryActionOrigin(input),
      heroOutcome,
      monsterOutcome: nextState.status === "lost" ? "lost" : enemyPhase.monsterOutcome,
      heroDamage,
      monsterDamage,
      heroEffectDamage,
      heroCounterDamage: counterDamage,
      manaSpent,
      critical: actorAction.summary.critical,
      heroHealing: support.heroHealing,
      allyResults: support.allyResults,
      enemyResults,
      ...(satedRecovery ? { satedRecovery } : {}),
      ...(actorAction.summary.fumble ? { fumble: actorAction.summary.fumble } : {}),
      ...(skill ? { skill } : {}),
      ...(enemyPhase.primaryAction ? enemyActionToSummaryFields(enemyPhase.primaryAction) : {}),
      ...(enemyPhase.enemyActions.length > 0 ? { enemyActions: enemyPhase.enemyActions } : {}),
      ...(enemyPhase.enemyPressureSkips.length > 0 ? { enemyPressureSkips: enemyPhase.enemyPressureSkips } : {})
    });
    nextState.lastTurn = summary;
    appendCombatTurnLog(nextState, input.state.turn, summary);

    return {
      ok: true,
      state: recordCombatAnalyticsTurn(nextState, summary),
      summary
    };
  }

  nextState.turn += 1;
  syncPrimaryCombatEnemy(nextState);
  const summary = buildSummary({
    action: input.action,
    ...summaryActionOrigin(input),
    heroOutcome: nextState.status === "won"
      ? "won"
      : actorAction.summary.actorOutcome === "won"
        ? "hit"
        : actorAction.summary.actorOutcome,
    heroDamage,
    monsterDamage,
    manaSpent,
    critical: actorAction.summary.critical,
    heroHealing: support.heroHealing,
    allyResults: support.allyResults,
    enemyResults,
    ...(actorAction.summary.fumble ? { fumble: actorAction.summary.fumble } : {}),
    ...(skill ? { skill } : {})
  });
  nextState.lastTurn = summary;
  appendCombatTurnLog(nextState, input.state.turn, summary);

  return {
    ok: true,
    state: recordCombatAnalyticsTurn(nextState, summary),
    summary
  };
}

function resolveMultiEnemyFlee(input: ResolveCombatTurnInput): ResolveCombatTurnResult {
  const nextState = cloneCombatState(input.state);
  const primary = getPrimaryCombatEnemy(nextState);
  const fled = rollFleeSuccess(
    applyMonsterRuntimeFleePenalty(nextState, input.hero),
    findEnemyStats(input, primary),
    input.rng,
    getNextFleeAttemptNumber(input.state)
  );
  tickSkillCooldown(nextState);
  tickCombatItemCooldowns(nextState);

  let enemyPhase: ReturnType<typeof resolveLivingEnemyPhase> = {
    monsterDamage: 0,
    enemyActions: [],
    enemyPressureSkips: [],
    defendCounter: false
  };
  let heroEffectDamage = 0;
  let satedRecovery: CombatTurnSummary["satedRecovery"] | undefined;

  if (fled) {
    satedRecovery = nextState.hero.hp > 0
      ? input.afterCommittedHeroAction?.(nextState)
      : undefined;
    nextState.status = "fled";
  } else {
    const activationPhase = resolveHeroActivationAndLivingEnemyPhase(nextState, input, 0);
    heroEffectDamage = activationPhase.heroEffectDamage;
    satedRecovery = activationPhase.satedRecovery;
    enemyPhase = activationPhase.enemyPhase;
    enemyPhase.monsterDamage = activationPhase.monsterDamage;
    nextState.status = getLivingCombatEnemies(nextState).length === 0
      ? "won"
      : nextState.hero.hp <= 0
        ? "lost"
        : "active";
  }

  nextState.turn += 1;
  syncPrimaryCombatEnemy(nextState);
  const summary = buildSummary({
    action: "flee",
    ...summaryActionOrigin(input),
    heroOutcome: fled ? "fled" : "flee-failed",
    ...(!fled
      ? { monsterOutcome: nextState.status === "lost" ? "lost" : enemyPhase.monsterOutcome }
      : {}),
    heroDamage: 0,
    monsterDamage: enemyPhase.monsterDamage,
    heroEffectDamage,
    manaSpent: 0,
    critical: false,
    ...(satedRecovery ? { satedRecovery } : {}),
    ...(enemyPhase.primaryAction ? enemyActionToSummaryFields(enemyPhase.primaryAction) : {}),
    ...(enemyPhase.enemyActions.length > 0 ? { enemyActions: enemyPhase.enemyActions } : {}),
    ...(enemyPhase.enemyPressureSkips.length > 0 ? { enemyPressureSkips: enemyPhase.enemyPressureSkips } : {})
  });
  nextState.lastTurn = summary;
  appendCombatTurnLog(nextState, input.state.turn, summary);

  return {
    ok: true,
    state: recordCombatAnalyticsTurn(nextState, summary),
    summary
  };
}

function resolveActorAttack(
  input: ResolveActorCombatActionInput,
  skill?: CombatSkillProfile
): ResolveActorCombatActionResult {
  const actorState = cloneActorResourceState(input.actorState);
  const defenderState = cloneActorResourceState(input.defenderState);
  const fumbleAdvance = skill
    ? advancePlayerAbilityFumbleCycle({
        state: actorState.playerAbilityFumbles,
        abilityId: skill.id,
        seed: input.fumbleSeed ?? `${input.actorStats.classId ?? "unknown"}:${input.actorStats.raceId ?? "unknown"}`
      })
    : null;
  const attack = skill && abilityDealsEnemyDamage(skill)
    ? rollSkillAttack(input.actorStats, input.defenderStats, skill, input.rng)
    : skill
      ? { damage: 0, hit: true, critical: false }
      : rollBasicAttack(input.actorStats, input.defenderStats, input.rng);
  const manaSpent = skill?.manaCost ?? 0;

  actorState.mana = clampResource(actorState.mana - manaSpent, actorState.manaMax);
  if (fumbleAdvance) {
    actorState.playerAbilityFumbles = fumbleAdvance.state;
  }
  delete actorState.guard;
  const fumble = fumbleAdvance?.fumbled
    ? applyPlayerAbilityFumble({
        ability: skill!,
        actorState,
        defenderState,
        actorStats: input.actorStats,
        plannedDamage: attack.damage
      })
    : null;
  if (!fumble) {
    defenderState.hp = Math.max(0, defenderState.hp - attack.damage);
  }
  const tickedActorState = tickActorCooldowns(actorState);

  if (skill) {
    setActorAbilityCooldown(
      tickedActorState,
      skill.id,
      skill.cooldownOwnActions,
      skill.source === "class"
    );
  }

  return {
    actorState: tickedActorState,
    defenderState,
    summary: {
      action: skill?.action ?? (skill ? "skill" : "attack"),
      actorOutcome: fumble
        ? "critical-fumble"
        : defenderState.hp <= 0
        ? "won"
        : attack.hit
          ? attack.critical
            ? "critical-hit"
            : "hit"
          : "miss",
      actorDamage: fumble ? 0 : attack.damage,
      manaSpent,
      critical: fumble ? false : attack.critical,
      ...(skill
        ? {
            skillId: skill.id,
            damageKind: skill.damageKind
          }
        : {}),
      ...(fumble ? { fumble } : {})
    }
  };
}

export function previewPlayerAbilityFumbleCycle(input: {
  state: PlayerAbilityFumblesState | undefined;
  abilityId: string;
  seed: string;
}): { fumbled: boolean } {
  const current = normalizePlayerAbilityFumbleState(
    input.state?.abilities[input.abilityId],
    input.abilityId,
    input.seed
  );

  return {
    fumbled: current.usesInCycle + 1 === current.triggerAt
  };
}

function advancePlayerAbilityFumbleCycle(input: {
  state: PlayerAbilityFumblesState | undefined;
  abilityId: string;
  seed: string;
}): { state: PlayerAbilityFumblesState; fumbled: boolean } {
  const abilities = input.state ? { ...clonePlayerAbilityFumblesState(input.state).abilities } : {};
  const current = normalizePlayerAbilityFumbleState(
    abilities[input.abilityId],
    input.abilityId,
    input.seed
  );
  const nextUsesInCycle = current.usesInCycle + 1;
  const fumbled = nextUsesInCycle === current.triggerAt;
  const nextCycle = nextUsesInCycle >= PLAYER_ABILITY_FUMBLE_CYCLE_USES
    ? current.cycle + 1
    : current.cycle;
  const nextEntry = nextUsesInCycle >= PLAYER_ABILITY_FUMBLE_CYCLE_USES
    ? createPlayerAbilityFumbleState(input.abilityId, input.seed, nextCycle)
    : {
        ...current,
        usesInCycle: nextUsesInCycle
      };

  return {
    state: {
      version: 1,
      abilities: {
        ...abilities,
        [input.abilityId]: nextEntry
      }
    },
    fumbled
  };
}

function normalizePlayerAbilityFumbleState(
  state: PlayerAbilityFumblesState["abilities"][string] | undefined,
  abilityId: string,
  seed: string
): PlayerAbilityFumblesState["abilities"][string] {
  if (
    state?.version === 1 &&
    state.cycle >= 0 &&
    state.usesInCycle >= 0 &&
    state.usesInCycle < PLAYER_ABILITY_FUMBLE_CYCLE_USES &&
    state.triggerAt >= 1 &&
    state.triggerAt <= PLAYER_ABILITY_FUMBLE_CYCLE_USES
  ) {
    return { ...state };
  }

  return createPlayerAbilityFumbleState(abilityId, seed, 0);
}

function createPlayerAbilityFumbleState(
  abilityId: string,
  seed: string,
  cycle: number
): PlayerAbilityFumblesState["abilities"][string] {
  return {
    version: 1,
    cycle,
    usesInCycle: 0,
    triggerAt: 1 + (stablePositiveHash(`${seed}:${abilityId}:${cycle}`) % PLAYER_ABILITY_FUMBLE_CYCLE_USES)
  };
}

function applyPlayerAbilityFumble(input: {
  ability: CombatSkillProfile;
  actorState: CombatActorResourceState;
  defenderState: CombatActorResourceState;
  actorStats: CombatActorStats;
  plannedDamage: number;
}): CombatPlayerAbilityFumbleSummary {
  const kind = getPlayerAbilityFumbleKind(input.ability);
  if (kind === "enemy-heal") {
    const healing = getPlayerAbilityFumbleHealing(input.ability, input.actorStats);
    const before = input.defenderState.hp;
    input.defenderState.hp = Math.min(input.defenderState.hpMax, input.defenderState.hp + healing);

    return {
      abilityId: input.ability.id,
      kind,
      line: input.ability.criticalFumbleLine ?? "Манатка образилась на інструкцію і вдарила не туди.",
      enemyHealing: input.defenderState.hp - before
    };
  }

  const damage = getPlayerAbilityFumbleSelfDamage(input.ability, input.actorStats, input.plannedDamage);
  input.actorState.hp = Math.max(0, input.actorState.hp - damage);

  return {
    abilityId: input.ability.id,
    kind,
    line: input.ability.criticalFumbleLine ?? "Манатка образилась на інструкцію і вдарила не туди.",
    selfDamage: damage
  };
}

function getPlayerAbilityFumbleKind(
  ability: CombatSkillProfile
): CombatPlayerAbilityFumbleSummary["kind"] {
  const hasHealing = getAbilityRecipe(ability).some((kind) => kind === "self-heal" || kind === "ally-heal");
  const allySupport = ability.secondaryTargetScope === "single-ally-or-self" ||
    ability.secondaryTargetScope === "all-allies-including-self" ||
    ability.primaryTargetScope === "lowest-hp-ally" ||
    ability.primaryTargetScope === "all-allies-including-self";

  return !abilityDealsEnemyDamage(ability) || hasHealing || allySupport
    ? "enemy-heal"
    : "self-damage";
}

function getPlayerAbilityFumbleSelfDamage(
  ability: CombatSkillProfile,
  actor: CombatActorStats,
  plannedDamage: number
): number {
  const statValue = actor[ability.stat] ?? 0;
  const fallbackDamage = Math.floor(Math.max(1, ability.baseDamage + statValue * Math.max(0.2, ability.multiplier / 2)));

  return Math.max(1, Math.max(plannedDamage, fallbackDamage));
}

function getPlayerAbilityFumbleHealing(
  ability: CombatSkillProfile,
  actor: CombatActorStats
): number {
  const statValue = actor[ability.stat] ?? 0;
  const supportAmount = Math.max(
    ability.healAmount ?? 0,
    ability.guardReduction ?? 0,
    ability.monsterDamageReduction ?? 0,
    ability.counterDamage ?? 0
  );

  return Math.max(1, Math.floor(supportAmount + Math.max(1, ability.baseDamage + statValue * 0.15)));
}

function buildPlayerAbilityFumbleSeed(
  state: CombatState,
  hero: Pick<CombatActorStats, "classId" | "raceId">
): string {
  return `${state.id ?? "combat"}:${hero.classId ?? "unknown-class"}:${hero.raceId ?? "unknown-race"}`;
}

function stablePositiveHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function abilityDealsEnemyDamage(ability: Pick<CombatSkillProfile, "recipe">): boolean {
  return getAbilityRecipe(ability).some((kind) =>
    kind === "direct-damage" ||
    kind === "all-enemies-damage" ||
    kind === "primary-plus-splash"
  );
}

function getAbilityRecipe(ability: Pick<CombatSkillProfile, "recipe">): NonNullable<CombatSkillProfile["recipe"]> {
  return ability.recipe ?? [];
}

function emptyAbilitySupport(): { heroHealing: number; allyResults: CombatAllyAbilityResult[] } {
  return { heroHealing: 0, allyResults: [] };
}

function applyPlayerAbilitySupport(
  state: CombatState,
  ability: CombatSkillProfile
): { heroHealing: number; allyResults: CombatAllyAbilityResult[] } {
  let heroHealing = 0;
  let guard = 0;

  if (ability.healAmount && ability.healAmount > 0) {
    const before = state.hero.hp;
    state.hero.hp = Math.min(state.hero.hpMax, state.hero.hp + ability.healAmount);
    heroHealing = state.hero.hp - before;
  }

  if (ability.guardReduction && ability.guardReduction > 0) {
    guard = ability.guardReduction;
    state.guard = getAbilityGuard(guard);
  }

  return heroHealing > 0 || guard > 0
    ? {
        heroHealing,
        allyResults: [{
          targetId: "self",
          label: "Ви",
          ...(heroHealing > 0 ? { healing: heroHealing } : {}),
          ...(guard > 0 ? { guard } : {})
        }]
      }
    : emptyAbilitySupport();
}

function applySecondaryEnemyAbilityDamage(input: {
  state: CombatState;
  input: ResolveCombatTurnInput;
  ability: CombatSkillProfile;
  primaryEnemyId: string;
  enemyResults: CombatEnemyAbilityResult[];
}): number {
  if (
    input.ability.primaryTargetScope !== "all-enemies" ||
    !getAbilityRecipe(input.ability).some((kind) => kind === "all-enemies-damage" || kind === "primary-plus-splash")
  ) {
    return 0;
  }

  let totalDamage = 0;
  const enemies = normalizeCombatEnemies(input.state).filter((enemy) =>
    enemy.enemyId !== input.primaryEnemyId && enemy.hp > 0
  );

  for (const enemy of enemies) {
    const stats = applyDrinkHeroAttackModifiers(
      input.input.state,
      findEnemyStats(input.input, enemy)
    );
    const secondaryAbility = getAbilityRecipe(input.ability).includes("primary-plus-splash")
      ? {
          ...input.ability,
          multiplier: input.ability.multiplier * (input.ability.secondaryMultiplier ?? 0.5),
          critBonus: Math.min(input.ability.critBonus, 0.02)
        }
      : input.ability;
    const roll = rollSkillAttack(input.input.hero, stats, secondaryAbility, input.input.rng);
    enemy.hp = Math.max(0, enemy.hp - roll.damage);
    updateCombatEnemy(input.state, enemy.enemyId, enemy);
    totalDamage += roll.damage;
    input.enemyResults.push(buildEnemyAbilityResult({
      enemyId: enemy.enemyId,
      monsterId: enemy.id,
      ...(enemy.name ? { monsterName: enemy.name } : {}),
      damage: roll.damage,
      outcome: enemy.hp <= 0 && roll.damage > 0 ? "won" : roll.hit ? roll.critical ? "critical-hit" : "hit" : "miss",
      critical: roll.critical
    }));
  }

  return totalDamage;
}

function buildEnemyAbilityResult(input: {
  enemyId: string;
  monsterId: string;
  monsterName?: string;
  damage: number;
  outcome: CombatEnemyAbilityResult["outcome"];
  critical?: boolean;
}): CombatEnemyAbilityResult {
  return {
    enemyId: input.enemyId,
    monsterId: input.monsterId,
    ...(input.monsterName ? { monsterName: input.monsterName } : {}),
    damage: Math.max(0, input.damage),
    outcome: input.outcome,
    ...(input.critical ? { critical: true } : {})
  };
}

function heroOutcomeFromActor(
  outcome: ActorCombatActionSummary["actorOutcome"],
  targetHp: number
): CombatEnemyAbilityResult["outcome"] {
  if (targetHp <= 0 && outcome !== "miss") {
    return "won";
  }

  if (outcome === "critical-hit") {
    return "critical-hit";
  }

  return outcome === "miss" ? "miss" : "hit";
}

function appendCombatTurnLog(
  state: CombatState,
  turn: number,
  summary: CombatTurnSummary
): void {
  const notices = buildCombatTurnLogNotices(state);

  appendCombatTurnLogEntry(state, {
    ...(state.status !== "active" ? { eventId: getTerminalCombatTurnLogEventId(state.status) } : {}),
    turn,
    summary: cloneCombatTurnSummary(summary),
    ...(notices.length > 0 ? { notices } : {}),
    ...(state.cooldowns ? { cooldowns: cloneCombatCooldowns(state.cooldowns) } : {}),
    hero: {
      hp: state.hero.hp,
      mana: state.hero.mana
    },
    monster: {
      hp: state.monster.hp
    },
    ...turnLogEnemies(state)
  });
}

function getNextFleeAttemptNumber(state: CombatState): number {
  const failedAttempts = state.turnLog?.filter((entry) =>
    entry.summary.action === "flee" && entry.summary.heroOutcome === "flee-failed"
  ).length ?? 0;

  return failedAttempts + 1;
}

function buildCombatTurnLogNotices(state: CombatState): string[] {
  const runtimes = state.enemies
    ? state.enemies.flatMap((enemy) => enemy.monsterRuntime ? [enemy.monsterRuntime] : [])
    : state.monsterRuntime
      ? [state.monsterRuntime]
      : [];
  const effectNotices = runtimes.flatMap((runtime) =>
    presentActiveMonsterRuntimeEffectNotices(runtime).map((notice) =>
      `Ефект триває: ${trimTerminalPunctuation(notice)}.`
    )
  );
  const bleedNotices = Object.values(state.enemyStatuses?.enemies ?? {})
    .flatMap((status) => status.bleed ? [status.bleed] : [])
    .map((bleed) =>
      `Ефект триває: кровотеча ${bleed.damagePerActivation} шкоди, ще ${bleed.remainingHeroActivations} активац.`
    );

  return Array.from(new Set([...effectNotices, ...bleedNotices]));
}

function trimTerminalPunctuation(text: string): string {
  return text.trim().replace(/[.!?]+$/u, "");
}

export function getNonManaSkillCooldownTurns(
  hero: CombatActorStats,
  skill: ReturnType<typeof getCombatSkillProfile>
): number {
  void hero;
  return skill.cooldownOwnActions;
}

function tickSkillCooldown(state: CombatState): void {
  const ticked = tickActorCooldowns({
    hp: state.hero.hp,
    hpMax: state.hero.hpMax,
    mana: state.hero.mana,
    manaMax: state.hero.manaMax,
    cooldowns: state.cooldowns,
    ...(state.guard ? { guard: state.guard } : {})
  });

  setStateCooldowns(state, ticked.cooldowns);
  delete state.guard;
}

function tickCombatItemCooldowns(state: CombatState): void {
  const current = state.combatItems?.cooldowns;
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

  const uses = state.combatItems?.uses;
  if (Object.keys(cooldowns).length > 0 || uses) {
    state.combatItems = {
      ...(Object.keys(cooldowns).length > 0 ? { cooldowns } : {}),
      ...(uses ? { uses: { ...uses } } : {})
    };
    return;
  }

  delete state.combatItems;
}

function setStateCooldowns(
  state: { cooldowns?: CombatState["cooldowns"] },
  cooldowns: CombatState["cooldowns"] | undefined
): void {
  if (cooldowns) {
    state.cooldowns = cooldowns;
    return;
  }

  delete state.cooldowns;
}

function setStateGuard(
  state: { guard?: CombatGuardState },
  guard: CombatGuardState | undefined
): void {
  if (guard) {
    state.guard = guard;
    return;
  }

  delete state.guard;
}

function setStatePlayerAbilityFumbles(
  state: { playerAbilityFumbles?: PlayerAbilityFumblesState },
  fumbles: PlayerAbilityFumblesState | undefined
): void {
  if (fumbles) {
    state.playerAbilityFumbles = fumbles;
    return;
  }

  delete state.playerAbilityFumbles;
}

function setActorAbilityCooldown(
  state: { cooldowns?: CombatState["cooldowns"] },
  abilityId: string,
  remainingTurns: number,
  mirrorSkill = true
): void {
  if (remainingTurns <= 0) {
    return;
  }

  state.cooldowns = {
    ...state.cooldowns,
    abilities: {
      ...state.cooldowns?.abilities,
      [abilityId]: {
        id: abilityId,
        remainingTurns
      }
    },
    ...(mirrorSkill
      ? {
          skill: {
            id: abilityId,
            remainingTurns
          }
        }
      : state.cooldowns?.skill ? { skill: state.cooldowns.skill } : {})
  };
}

export function tickActorCooldowns(state: CombatActorResourceState): CombatActorResourceState {
  const next = cloneActorResourceState(state);
  const abilityEntries = Object.entries(normalizeCooldownAbilities(state.cooldowns));
  const ticked = Object.fromEntries(
    abilityEntries
      .map(([abilityId, cooldown]) => [
        abilityId,
        {
          ...cooldown,
          remainingTurns: Math.max(0, cooldown.remainingTurns - 1)
        }
      ] as const)
      .filter(([, cooldown]) => cooldown.remainingTurns > 0)
  );

  if (Object.keys(ticked).length === 0) {
    delete next.cooldowns;
    return next;
  }

  const skill = next.cooldowns?.skill;
  const mirroredSkill = skill ? ticked[skill.id] : undefined;
  next.cooldowns = {
    abilities: ticked,
    ...(mirroredSkill ? { skill: { ...mirroredSkill } } : {})
  };

  return next;
}

function cloneActorResourceState(state: CombatActorResourceState): CombatActorResourceState {
  return {
    hp: state.hp,
    hpMax: state.hpMax,
    mana: state.mana,
    manaMax: state.manaMax,
    ...(state.cooldowns ? { cooldowns: cloneCombatCooldowns(state.cooldowns) } : {}),
    ...(state.guard ? { guard: { ...state.guard } } : {}),
    ...(state.playerAbilityFumbles
      ? { playerAbilityFumbles: clonePlayerAbilityFumblesState(state.playerAbilityFumbles) }
      : {})
  };
}

function buildSummary(input: {
  action: CombatActionType;
  actionOrigin?: CombatActionOrigin;
  heroOutcome: CombatTurnSummary["heroOutcome"];
  monsterOutcome?: CombatTurnSummary["monsterOutcome"];
  heroDamage: number;
  monsterDamage: number;
  heroEffectDamage?: number;
  heroCounterDamage?: number;
  monsterBarkId?: string;
  monsterAction?: CombatTurnSummary["monsterAction"];
  monsterEffectText?: string;
  monsterTelegraphAbilityId?: string;
  simultaneousFinalResponse?: boolean;
  manaSpent: number;
  critical: boolean;
  item?: ResolveCombatItemTurnInput["item"];
  heroHealing?: number;
  heroHpAfter?: number;
  skill?: CombatSkillProfile;
  monsterSkill?: CombatSkillProfile;
  enemyResults?: CombatEnemyAbilityResult[];
  allyResults?: CombatAllyAbilityResult[];
  fumble?: CombatPlayerAbilityFumbleSummary;
  enemyActions?: CombatEnemyTurnSummary[];
  enemyPressureSkips?: CombatTurnSummary["enemyPressureSkips"];
  satedRecovery?: CombatTurnSummary["satedRecovery"];
  debugTrace?: ReturnType<typeof buildTurnDebugTrace>;
}): CombatTurnSummary {
  return {
    action: input.action,
    ...(input.actionOrigin && input.actionOrigin !== "manual" ? { actionOrigin: input.actionOrigin } : {}),
    heroOutcome: input.heroOutcome,
    ...(input.monsterOutcome ? { monsterOutcome: input.monsterOutcome } : {}),
    heroDamage: input.heroDamage,
    monsterDamage: input.monsterDamage,
    ...(input.heroEffectDamage ? { heroEffectDamage: input.heroEffectDamage } : {}),
    manaSpent: input.manaSpent,
    critical: input.critical,
    ...(input.skill
      ? {
          skillId: input.skill.id,
          ...(input.skill.source ? { abilitySource: input.skill.source } : {}),
          ...(input.skill.primaryTargetScope ? { targetScope: input.skill.primaryTargetScope } : {}),
          ...(input.skill.secondaryTargetScope ? { secondaryTargetScope: input.skill.secondaryTargetScope } : {}),
          damageKind: input.skill.damageKind
        }
      : {}),
    ...(input.monsterAction
      ? { monsterAction: input.monsterAction }
      : input.monsterSkill
        ? { monsterAction: "skill" as const }
        : input.monsterOutcome
          ? { monsterAction: "attack" as const }
          : {}),
    ...(input.monsterSkill
      ? {
          monsterSkillId: input.monsterSkill.id,
          monsterDamageKind: input.monsterSkill.damageKind
        }
      : {}),
    ...(input.monsterEffectText ? { monsterEffectText: input.monsterEffectText } : {}),
    ...(input.monsterTelegraphAbilityId ? { monsterTelegraphAbilityId: input.monsterTelegraphAbilityId } : {}),
    ...(input.simultaneousFinalResponse ? { simultaneousFinalResponse: true } : {}),
    ...(input.heroCounterDamage ? { heroCounterDamage: input.heroCounterDamage } : {}),
    ...(input.monsterBarkId ? { monsterBarkId: input.monsterBarkId } : {}),
    ...(input.item ? { itemId: input.item.id, itemName: input.item.name } : {}),
    ...(input.heroHealing ? { heroHealing: input.heroHealing } : {}),
    ...(input.heroHpAfter !== undefined ? { heroHpAfter: input.heroHpAfter } : {}),
    ...(input.enemyResults && input.enemyResults.length > 0 ? { enemyResults: input.enemyResults } : {}),
    ...(input.allyResults && input.allyResults.length > 0 ? { allyResults: input.allyResults } : {}),
    ...(input.fumble ? { fumble: input.fumble } : {}),
    ...(input.enemyActions ? { enemyActions: input.enemyActions } : {}),
    ...(input.enemyPressureSkips && input.enemyPressureSkips.length > 0
      ? { enemyPressureSkips: input.enemyPressureSkips }
      : {}),
    ...(input.satedRecovery ? { satedRecovery: input.satedRecovery } : {}),
    ...(input.debugTrace ? { debugTrace: input.debugTrace } : {})
  };
}

export interface ResolveCombatGearTurnInput {
  state: CombatState;
  ability: CombatGearAbilityInput;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  enemies?: MonsterCombatStats[];
  afterCommittedHeroAction?: (state: CombatState) => CombatTurnSummary["satedRecovery"] | undefined;
  rng: RandomSource;
}

function resolveHeroActivationAndLivingEnemyPhase(
  state: CombatState,
  input: ResolveCombatTurnInput,
  damageReduction: number,
  participants?: readonly CombatEnemyState[],
  allowDefeatedEnemyPhase = false
): {
  heroEffectDamage: number;
  monsterDamage: number;
  enemyPhase: ReturnType<typeof resolveLivingEnemyPhase>;
  satedRecovery?: CombatTurnSummary["satedRecovery"];
} {
  const heroEffect = applyHeroActivationEffectsForCombatState(state, participants);
  const heroEffectDamage = heroEffect.damage;
  const satedRecovery = state.hero.hp > 0
    ? input.afterCommittedHeroAction?.(state)
    : undefined;
  const enemyPhase = state.hero.hp > 0 && (getLivingCombatEnemies(state).length > 0 || allowDefeatedEnemyPhase)
    ? resolveLivingEnemyPhase(state, input, damageReduction, participants)
    : {
        monsterDamage: 0,
        enemyActions: [],
        enemyPressureSkips: [],
        defendCounter: false
      };

  return {
    heroEffectDamage,
    monsterDamage: heroEffectDamage + enemyPhase.monsterDamage,
    enemyPhase,
    ...(satedRecovery ? { satedRecovery } : {})
  };
}

function applyHeroActivationEffectsForCombatState(
  state: CombatState,
  participants?: readonly CombatEnemyState[]
): {
  damage: number;
} {
  const monsterRuntime = applyHeroActivationMonsterEffectsForCombatState(state, participants);
  const bleedDamage = applyHeroActivationBleedStatuses(state, participants);

  return {
    damage: monsterRuntime.damage + bleedDamage
  };
}

function applyHeroActivationMonsterEffectsForCombatState(
  state: CombatState,
  participants?: readonly CombatEnemyState[]
): {
  damage: number;
} {
  if (!hasCombatEnemyCollection(state)) {
    return applyHeroActivationMonsterEffects(state);
  }

  const participantIds = new Set(
    (participants ?? normalizeCombatEnemies(state)).map((enemy) => enemy.enemyId)
  );
  const primaryEnemyId = getPrimaryCombatEnemy(state).enemyId;
  let damage = 0;
  const enemies = normalizeCombatEnemies(state).map((enemy) => {
    const runtime = enemy.monsterRuntime ?? (enemy.enemyId === primaryEnemyId ? state.monsterRuntime : undefined);
    if (!participantIds.has(enemy.enemyId) || !runtime) {
      return enemy;
    }

    const effectState: CombatState = {
      ...state,
      hero: state.hero,
      monster: combatEnemyToMonster(enemy),
      monsterRuntime: runtime
    };
    const effect = applyHeroActivationMonsterEffects(effectState);
    damage += effect.damage;

    return {
      ...enemy,
      ...(effectState.monsterRuntime ? { monsterRuntime: effectState.monsterRuntime } : {})
    };
  });

  state.enemies = enemies;
  syncPrimaryCombatEnemy(state);

  return { damage };
}

function applyGearBleedFromAction(
  state: CombatState,
  input: ResolveCombatTurnInput,
  skill: CombatSkillProfile | undefined,
  summary: ActorCombatActionSummary,
  enemyId: string
): void {
  const bleed = input.gearAbility?.bleed;
  if (
    !bleed ||
    skill?.action !== "gear" ||
    summary.fumble ||
    summary.actorDamage <= 0 ||
    (summary.actorOutcome !== "hit" && summary.actorOutcome !== "critical-hit" && summary.actorOutcome !== "won")
  ) {
    return;
  }

  state.enemyStatuses = {
    version: 1,
    enemies: {
      ...(state.enemyStatuses?.enemies ?? {}),
      [enemyId]: {
        ...(state.enemyStatuses?.enemies[enemyId] ?? {}),
        bleed: {
          ...bleed,
          damagePerActivation: Math.max(1, Math.floor(bleed.damagePerActivation)),
          remainingHeroActivations: Math.max(1, Math.floor(bleed.remainingHeroActivations)),
          refreshedAtTurn: state.turn
        }
      }
    }
  };
}

function applyHeroActivationBleedStatuses(
  state: CombatState,
  participants?: readonly CombatEnemyState[]
): number {
  const statuses = state.enemyStatuses?.enemies;
  if (!statuses) {
    return 0;
  }

  const participantIds = hasCombatEnemyCollection(state)
    ? new Set((participants ?? normalizeCombatEnemies(state)).map((enemy) => enemy.enemyId))
    : new Set(["enemy:1"]);
  let damage = 0;
  const nextStatuses: NonNullable<CombatState["enemyStatuses"]>["enemies"] = {};

  for (const [enemyId, status] of Object.entries(statuses)) {
    const bleed = status.bleed;
    if (!bleed) {
      nextStatuses[enemyId] = { ...status };
      continue;
    }

    if (!participantIds.has(enemyId)) {
      nextStatuses[enemyId] = { ...status, bleed: { ...bleed } };
      continue;
    }

    const appliedDamage = applyBleedDamageToEnemy(state, enemyId, bleed.damagePerActivation);
    damage += appliedDamage;
    const remainingHeroActivations = bleed.remainingHeroActivations - 1;
    if (remainingHeroActivations > 0 && appliedDamage > 0 && isBleedTargetAlive(state, enemyId)) {
      nextStatuses[enemyId] = {
        ...status,
        bleed: {
          ...bleed,
          remainingHeroActivations
        }
      };
    } else if (Object.keys(status).some((key) => key !== "bleed")) {
      nextStatuses[enemyId] = { ...status };
      delete nextStatuses[enemyId].bleed;
    }
  }

  if (Object.keys(nextStatuses).length > 0) {
    state.enemyStatuses = {
      version: 1,
      enemies: nextStatuses
    };
  } else {
    delete state.enemyStatuses;
  }

  return damage;
}

function isBleedTargetAlive(state: CombatState, enemyId: string): boolean {
  if (!hasCombatEnemyCollection(state)) {
    return state.monster.hp > 0;
  }

  return (normalizeCombatEnemies(state).find((enemy) => enemy.enemyId === enemyId)?.hp ?? 0) > 0;
}

function applyBleedDamageToEnemy(
  state: CombatState,
  enemyId: string,
  amount: number
): number {
  const damage = Math.max(1, Math.floor(amount));
  if (!hasCombatEnemyCollection(state)) {
    const before = state.monster.hp;
    state.monster.hp = Math.max(0, state.monster.hp - damage);

    return before - state.monster.hp;
  }

  const enemy = normalizeCombatEnemies(state).find((candidate) => candidate.enemyId === enemyId);
  if (!enemy || enemy.hp <= 0) {
    return 0;
  }

  const before = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - damage);
  updateCombatEnemy(state, enemy.enemyId, enemy);
  syncPrimaryCombatEnemy(state);

  return before - enemy.hp;
}

function resolveLivingEnemyPhase(
  state: CombatState,
  input: ResolveCombatTurnInput,
  damageReduction: number,
  participants: readonly CombatEnemyState[] = getLivingCombatEnemies(state)
): {
  monsterDamage: number;
  monsterOutcome?: CombatTurnSummary["monsterOutcome"];
  primaryAction?: CombatEnemyTurnSummary;
  enemyActions: CombatEnemyTurnSummary[];
  enemyPressureSkips: NonNullable<CombatTurnSummary["enemyPressureSkips"]>;
  defendCounter: boolean;
} {
  let monsterDamage = 0;
  let monsterOutcome: CombatTurnSummary["monsterOutcome"] | undefined;
  let defendCounter = false;
  const enemyActions: CombatEnemyTurnSummary[] = [];
  const enemyPressureSkips: NonNullable<CombatTurnSummary["enemyPressureSkips"]> = [];

  for (const [participantIndex, participant] of participants.entries()) {
    if (state.hero.hp <= 0) {
      break;
    }

    const enemy = normalizeCombatEnemies(state).find((candidate) =>
      candidate.enemyId === participant.enemyId
    ) ?? participant;
    const livingEnemyCount = getLivingCombatEnemies(state).length;
    if (shouldSkipBackupEnemyPressure({
      livingEnemyCount,
      participantIndex,
      turn: state.turn
    })) {
      enemyPressureSkips.push({
        enemyId: enemy.enemyId,
        monsterId: enemy.id,
        ...(enemy.name ? { monsterName: enemy.name } : {})
      });
      continue;
    }
    const simultaneousFinalResponse = participant.hp > 0 && enemy.hp <= 0;
    state.monster = combatEnemyToMonster(enemy);
    if (enemy.monsterRuntime) {
      state.monsterRuntime = enemy.monsterRuntime;
    } else {
      delete state.monsterRuntime;
    }

    const response = resolveMonsterResponse({
      state,
      input: {
        ...input,
        monster: findEnemyStats(input, enemy)
      },
      damageReduction: damageReduction + getBackupEnemyPressureDamageReduction({
        enemy,
        livingEnemyCount,
        participantIndex
      }),
      simultaneousFinalResponse
    });
    const updatedEnemy: CombatEnemyState = {
      ...enemy,
      ...state.monster,
      ...(state.monsterRuntime ? { monsterRuntime: state.monsterRuntime } : {})
    };
    updateCombatEnemy(state, enemy.enemyId, updatedEnemy);
    monsterDamage += response.damage;
    monsterOutcome = state.hero.hp <= 0
      ? "lost"
      : response.outcome ?? (response.damage > 0 ? "hit" : "miss");
    defendCounter = defendCounter || Boolean(response.defendCounter);
    enemyActions.push({
      enemyId: enemy.enemyId,
      monsterId: enemy.id,
      ...(enemy.name ? { monsterName: enemy.name } : {}),
      ...(monsterOutcome ? { monsterOutcome } : {}),
      monsterDamage: response.damage,
      ...(response.monsterAction ? { monsterAction: response.monsterAction } : {}),
      ...(response.monsterSkill ? { monsterSkillId: response.monsterSkill.id } : {}),
      ...(response.monsterSkill?.damageKind ? { monsterDamageKind: response.monsterSkill.damageKind } : {}),
      ...(response.monsterEffectText ? { monsterEffectText: response.monsterEffectText } : {}),
      ...(response.monsterTelegraphAbilityId ? { monsterTelegraphAbilityId: response.monsterTelegraphAbilityId } : {}),
      ...(response.simultaneousFinalResponse ? { simultaneousFinalResponse: true } : {})
    });
  }

  syncPrimaryCombatEnemy(state);

  return {
    monsterDamage,
    ...(monsterOutcome ? { monsterOutcome } : {}),
    ...(enemyActions[0] ? { primaryAction: enemyActions[0] } : {}),
    enemyActions,
    enemyPressureSkips,
    defendCounter
  };
}

function shouldSkipBackupEnemyPressure(input: {
  livingEnemyCount: number;
  participantIndex: number;
  turn: number;
}): boolean {
  return input.livingEnemyCount > 1 && input.participantIndex > 0 && input.turn % 2 === 1;
}

function getBackupEnemyPressureDamageReduction(input: {
  enemy: CombatEnemyState;
  livingEnemyCount: number;
  participantIndex: number;
}): number {
  if (input.livingEnemyCount <= 1 || input.participantIndex === 0) {
    return 0;
  }

  const level = Math.max(1, Math.floor(input.enemy.level ?? 1));

  return level + 3;
}

function enemyActionToSummaryFields(action: CombatEnemyTurnSummary): {
  monsterOutcome?: CombatTurnSummary["monsterOutcome"];
  monsterAction?: CombatTurnSummary["monsterAction"];
  monsterEffectText?: string;
  monsterTelegraphAbilityId?: string;
  simultaneousFinalResponse?: boolean;
} {
  return {
    ...(action.monsterOutcome ? { monsterOutcome: action.monsterOutcome } : {}),
    ...(action.monsterAction ? { monsterAction: action.monsterAction } : {}),
    ...(action.monsterEffectText ? { monsterEffectText: action.monsterEffectText } : {}),
    ...(action.monsterTelegraphAbilityId ? { monsterTelegraphAbilityId: action.monsterTelegraphAbilityId } : {}),
    ...(action.simultaneousFinalResponse ? { simultaneousFinalResponse: true } : {})
  };
}

function findEnemyStats(input: ResolveCombatTurnInput, enemy: CombatEnemyState): MonsterCombatStats {
  const stats = input.enemies?.find((candidate) => candidate.monsterId === enemy.id);
  const fallback = stats ?? input.monster;

  return {
    ...fallback,
    monsterId: enemy.id,
    ...(enemy.name ? { name: enemy.name } : {}),
    level: enemy.level ?? fallback.level,
    hpMax: enemy.hpMax,
    attack: enemy.attack ?? fallback.attack,
    armor: enemy.armor ?? fallback.armor,
    resist: enemy.resist ?? fallback.resist,
    dexterity: enemy.dexterity ?? fallback.dexterity,
    ...(enemy.spellPower !== undefined ? { spellPower: enemy.spellPower } : {}),
    ...(enemy.contextModifiers ? { contextModifiers: { ...enemy.contextModifiers } } : {}),
    ...(enemy.debugTrace ? { debugTrace: { ...enemy.debugTrace } } : {})
  };
}

function getAbilityCooldown(
  cooldowns: CombatState["cooldowns"] | undefined,
  abilityId: string
): { id: string; remainingTurns: number } | undefined {
  return cooldowns?.abilities?.[abilityId] ?? (cooldowns?.skill?.id === abilityId ? cooldowns.skill : undefined);
}

function getSkillCooldown(
  cooldowns: CombatState["cooldowns"] | undefined,
  skill: CombatSkillProfile
): { id: string; remainingTurns: number } | undefined {
  return [skill.id, ...(skill.legacyCooldownIds ?? [])]
    .map((abilityId) => getAbilityCooldown(cooldowns, abilityId))
    .find((cooldown) => cooldown !== undefined);
}

function getAbilityAvailability(
  actorState: Pick<CombatActorResourceState, "mana" | "cooldowns">,
  ability: CombatSkillProfile
): {
  available: boolean;
  reason?: "not-enough-mana" | "cooldown";
  cooldownRemainingTurns?: number;
} {
  const cooldown = getSkillCooldown(actorState.cooldowns, ability);

  if (cooldown && cooldown.remainingTurns > 0) {
    return {
      available: false,
      reason: "cooldown",
      cooldownRemainingTurns: cooldown.remainingTurns
    };
  }

  if (actorState.mana < ability.manaCost) {
    return {
      available: false,
      reason: "not-enough-mana"
    };
  }

  return { available: true };
}

function normalizeCooldownAbilities(
  cooldowns: CombatState["cooldowns"] | undefined
): Record<string, { id: string; remainingTurns: number }> {
  return {
    ...(cooldowns?.abilities ?? {}),
    ...(cooldowns?.skill ? { [cooldowns.skill.id]: cooldowns.skill } : {})
  };
}

export function getDefendStance(guard: CombatGuardState | undefined): {
  evasionChance: number;
  damageReduction: number;
  counterChance: number;
} {
  const count = Math.max(1, guard?.consecutiveDefends ?? 1);

  if (count <= 1) {
    return { evasionChance: 0.15, damageReduction: 0.4, counterChance: 0.3 };
  }

  if (count === 2) {
    return { evasionChance: 0.1, damageReduction: 0.3, counterChance: 0.15 };
  }

  return { evasionChance: 0.05, damageReduction: 0.2, counterChance: 0 };
}

export function getNextDefendGuard(guard: CombatGuardState | undefined): CombatGuardState {
  return {
    consecutiveDefends: Math.max(0, guard?.consecutiveDefends ?? 0) + 1
  };
}

function getAbilityGuard(damageReduction: number): CombatGuardState {
  return {
    consecutiveDefends: 1,
    abilityDamageReduction: Math.max(1, Math.floor(damageReduction))
  };
}

function getAbilityResponseDamageReduction(ability: CombatSkillProfile | undefined): number {
  if (!ability) {
    return 0;
  }

  return ability.guardReduction && ability.guardReduction > 0
    ? 0
    : ability.monsterDamageReduction;
}

function getCommittedAbilityResponseDamageReduction(
  ability: CombatSkillProfile | undefined,
  fumble: CombatPlayerAbilityFumbleSummary | undefined
): number {
  return fumble ? 0 : getAbilityResponseDamageReduction(ability);
}

function summaryActionOrigin(input: ResolveCombatTurnInput): { actionOrigin?: CombatActionOrigin } {
  return input.actionOrigin && input.actionOrigin !== "manual"
    ? { actionOrigin: input.actionOrigin }
    : {};
}

function applyDefendStance(input: {
  defenderGuard: CombatGuardState | undefined;
  damage: number;
  rng: RandomSource;
}): { damage: number; counter: boolean } {
  if (!input.defenderGuard || input.damage <= 0) {
    return { damage: input.damage, counter: false };
  }

  const stance = getDefendStance(input.defenderGuard);
  if (input.rng.nextFloat() < stance.evasionChance) {
    return { damage: 0, counter: false };
  }

  const reducedDamage = Math.max(1, Math.floor(input.damage * (1 - stance.damageReduction)));

  return {
    damage: Math.max(0, reducedDamage - Math.max(0, input.defenderGuard.abilityDamageReduction ?? 0)),
    counter: stance.counterChance > 0 && input.rng.nextFloat() < stance.counterChance
  };
}

function resolveMonsterResponse(input: {
  state: CombatState;
  input: ResolveCombatTurnInput;
  damageReduction: number;
  simultaneousFinalResponse?: boolean;
}): MonsterResponseResult {
  const monsterForResponse = applyDrinkMonsterActionModifiers(input.state, input.input.monster);

  if (input.simultaneousFinalResponse) {
    return {
      ...resolveBasicMonsterResponse({ ...input, monster: monsterForResponse }),
      simultaneousFinalResponse: true
    };
  }

  if (input.state.monsterRuntime) {
    const runtimeMonster = applyMonsterRuntimeMonsterActionModifiers(input.state, monsterForResponse);
    const response = resolveMonsterRuntimeAction({
      state: input.state,
      hero: input.input.hero,
      monster: runtimeMonster,
      rng: input.input.rng,
      damageReduction: input.damageReduction,
      defendStance: input.state.guard ? getDefendStance(input.state.guard) : undefined
    });
    const basicAttackDamage = response.actionKind === "attack"
      ? rollMonsterDamage(
          input.input.hero,
          runtimeMonster,
          input.input.rng,
          input.damageReduction
        )
      : 0;
    const defendedBasicAttack = applyDefendStance({
      defenderGuard: input.state.guard,
      damage: basicAttackDamage,
      rng: input.input.rng
    });
    const modifiedBasicAttack = consumeMonsterRuntimeDirectHitModifiers({
      state: input.state,
      damage: defendedBasicAttack.damage
    });
    if (modifiedBasicAttack.damage > 0) {
      input.state.hero.hp = Math.max(0, input.state.hero.hp - modifiedBasicAttack.damage);
    }
    const monsterSkill = response.ability ? monsterAbilityAsCombatSkill(response.ability) : undefined;

    return {
      damage: response.damage + modifiedBasicAttack.damage,
      ...(response.outcome ? { outcome: response.outcome } : {}),
      ...(response.actionKind
        ? { monsterAction: response.actionKind === "ability" ? "skill" : response.actionKind }
        : {}),
      ...(monsterSkill ? { monsterSkill } : {}),
      ...(response.effectText ? { monsterEffectText: response.effectText } : {}),
      ...(response.telegraphAbility ? { monsterTelegraphAbilityId: response.telegraphAbility.id } : {}),
      ...(response.actionKind === "attack" ? { defendCounter: defendedBasicAttack.counter } : {})
    };
  }

  const monsterSkill = selectMonsterSkill(input.input.state, monsterForResponse, input.input.rng);
  if (monsterSkill) {
    const damage = rollMonsterSkillDamage(
      input.input.hero,
      monsterForResponse,
      monsterSkill,
      input.input.rng,
      input.damageReduction
    );
    input.state.hero.hp = Math.max(0, input.state.hero.hp - damage);

    return {
      damage,
      monsterAction: "skill",
      monsterSkill
    };
  }

  return resolveBasicMonsterResponse({ ...input, monster: monsterForResponse });
}

function resolveBasicMonsterResponse(input: {
  state: CombatState;
  input: ResolveCombatTurnInput;
  damageReduction: number;
  monster: MonsterCombatStats;
}): MonsterResponseResult {
  const monsterDamage = rollMonsterDamage(
    input.input.hero,
    input.monster,
    input.input.rng,
    input.damageReduction
  );
  const defendedMonsterAttack = applyDefendStance({
    defenderGuard: input.state.guard,
    damage: monsterDamage,
    rng: input.input.rng
  });
  const modifiedMonsterAttack = consumeMonsterRuntimeDirectHitModifiers({
    state: input.state,
    damage: defendedMonsterAttack.damage
  });
  input.state.hero.hp = Math.max(0, input.state.hero.hp - modifiedMonsterAttack.damage);

  return {
    damage: modifiedMonsterAttack.damage,
    monsterAction: "attack",
    defendCounter: defendedMonsterAttack.counter
  };
}

function applyDrinkHeroAttackModifiers(state: CombatState, monster: MonsterCombatStats): MonsterCombatStats {
  const modifiers = state.drinkModifiers;
  const accuracyPenaltyPp = Math.max(0, Math.floor(modifiers?.accuracyPenaltyPp ?? 0));
  const outgoingDamageMultiplierBp = Math.max(0, Math.floor(modifiers?.outgoingDamageMultiplierBp ?? 10000));

  if (accuracyPenaltyPp === 0 && outgoingDamageMultiplierBp === 10000) {
    return monster;
  }

  const context = monster.contextModifiers ?? emptyCombatContextModifiers();

  return {
    ...monster,
    contextModifiers: {
      ...context,
      evasionDeltaPp: context.evasionDeltaPp + accuracyPenaltyPp,
      incomingDamageMultiplier: context.incomingDamageMultiplier * (outgoingDamageMultiplierBp / 10000)
    }
  };
}

function applyDrinkMonsterActionModifiers(state: CombatState, monster: MonsterCombatStats): MonsterCombatStats {
  const incomingDamageMultiplierBp = Math.max(0, Math.floor(state.drinkModifiers?.incomingDamageMultiplierBp ?? 10000));

  if (incomingDamageMultiplierBp === 10000) {
    return monster;
  }

  const context = monster.contextModifiers ?? emptyCombatContextModifiers();

  return {
    ...monster,
    contextModifiers: {
      ...context,
      outgoingDamageMultiplier: context.outgoingDamageMultiplier * (incomingDamageMultiplierBp / 10000)
    }
  };
}

function emptyCombatContextModifiers(): NonNullable<MonsterCombatStats["contextModifiers"]> {
  return {
    outgoingDamageMultiplier: 1,
    incomingDamageMultiplier: 1,
    accuracyDeltaPp: 0,
    evasionDeltaPp: 0,
    abilityWeightDelta: 0,
    signatureCooldownDelta: 0,
    flatArmorDelta: 0,
    flatResistDelta: 0,
    flatDexterityDelta: 0
  };
}

function rollDefendCounterDamage(
  hero: CombatActorStats,
  monster: MonsterCombatStats,
  rng: RandomSource
): number {
  const attack = rollBasicAttack(
    {
      ...hero,
      dexterity: Math.max(0, hero.dexterity - 10),
      luck: 0,
      weaponDamage: Math.floor((hero.weaponDamage ?? 0) / 2),
      level: Math.max(1, Math.floor(hero.level * 0.45))
    },
    monster,
    rng
  );

  return attack.hit ? Math.max(1, Math.floor(attack.damage * 0.45)) : 0;
}

function selectMonsterSkill(
  state: CombatState,
  monster: MonsterCombatStats,
  rng: RandomSource
): ReturnType<typeof getCombatSkillProfile> | null {
  if (!monster.tags.includes("doppelganger") || !monster.classId) {
    return null;
  }

  const skill = getCombatSkillProfile(monster.classId);
  if (state.turn === 1) {
    return rng.nextFloat() < 0.5 ? skill : null;
  }

  if (state.turn === 2 && !state.lastTurn?.monsterSkillId) {
    return skill;
  }

  return rng.nextFloat() < 0.35 ? skill : null;
}

function buildTurnDebugTrace(
  monster: MonsterCombatStats,
  monsterSkill: ReturnType<typeof getCombatSkillProfile> | null
) {
  const legalAbilityIds = getMonsterLegalAbilityIds(monster);

  if (!monster.debugTrace && legalAbilityIds.length === 0 && !monsterSkill) {
    return undefined;
  }

  return {
    ...monster.debugTrace,
    legalAbilityIds,
    ...(monsterSkill ? { chosenAbilityId: monsterSkill.id } : {})
  };
}

function getMonsterLegalAbilityIds(monster: MonsterCombatStats): string[] {
  const raceAbility = getCombatRaceAbilityProfile(monster.raceId);

  return [
    ...(monster.classId ? [getCombatSkillProfile(monster.classId).id] : []),
    ...(raceAbility ? [raceAbility.id] : [])
  ];
}
