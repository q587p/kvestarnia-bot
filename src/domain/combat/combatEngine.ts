import type { RandomSource } from "../../shared/random";
import {
  BASIC_DEFEND_ABILITY_ID,
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
  type CombatActionOrigin,
  type CombatActionType,
  type CombatActorStats,
  type CombatEnemyState,
  type CombatEnemyTurnSummary,
  type CombatGuardState,
  type CombatState,
  type CombatTurnSummary,
  type MonsterCombatStats,
  type PlayerCombatActionType
} from "./combatState";

export interface ResolveCombatTurnInput {
  state: CombatState;
  action: CombatActionType;
  actionOrigin?: CombatActionOrigin;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  enemies?: MonsterCombatStats[];
  rng: RandomSource;
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
  rng: RandomSource;
}

export type CombatItemEffectInput =
  | {
      kind: "heal-hp";
      amount: number;
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
      reason: "inactive" | "full-hp";
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
}

export interface CombatActorResourceState {
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  cooldowns?: CombatState["cooldowns"];
  guard?: CombatGuardState;
}

export interface ResolveActorCombatActionInput {
  actorState: CombatActorResourceState;
  defenderState: CombatActorResourceState;
  actorStats: CombatActorStats;
  defenderStats: MonsterCombatStats;
  action: Exclude<PlayerCombatActionType, "flee">;
  rng: RandomSource;
}

export interface ActorCombatActionSummary {
  action: Exclude<PlayerCombatActionType, "flee">;
  actorOutcome: Extract<
    CombatTurnSummary["heroOutcome"],
    "hit" | "critical-hit" | "miss" | "defended" | "not-enough-mana" | "skill-on-cooldown" | "won"
  >;
  actorDamage: number;
  manaSpent: number;
  critical: boolean;
  skillId?: string;
  damageKind?: CombatTurnSummary["damageKind"];
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
  hero: Pick<CombatActorStats, "classId">
): CombatActionAvailability {
  return getActorCombatActionAvailability({ ...state.hero, cooldowns: state.cooldowns }, hero);
}

export function getActorCombatActionAvailability(
  actorState: Pick<CombatActorResourceState, "mana" | "cooldowns">,
  actor: Pick<CombatActorStats, "classId">
): CombatActionAvailability {
  const skill = getCombatSkillProfile(actor.classId);
  const cooldown = getSkillCooldown(actorState.cooldowns, skill);

  if (cooldown && cooldown.remainingTurns > 0) {
    return {
      attack: { available: true },
      defend: { available: true },
      flee: { available: true },
      skill: {
        available: false,
        skill,
        reason: "cooldown",
        cooldownRemainingTurns: cooldown.remainingTurns
      }
    };
  }

  if (actorState.mana < skill.manaCost) {
    return {
      attack: { available: true },
      defend: { available: true },
      flee: { available: true },
      skill: {
        available: false,
        skill,
        reason: "not-enough-mana"
      }
    };
  }

  return {
    attack: { available: true },
    defend: { available: true },
    flee: { available: true },
    skill: { available: true, skill }
  };
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
    const skill = getCombatSkillProfile(input.actorStats.classId);
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

  if (input.action === "skill") {
    const skill = getCombatSkillProfile(input.hero.classId);
    if (isHeroClassSkillLockedByMonster(input.state)) {
      const summary = buildSummary({
        action: "skill",
        ...summaryActionOrigin(input),
        heroOutcome: "skill-on-cooldown",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false,
        skill
      });

      return {
        ok: false,
        reason: "skill-on-cooldown",
        state: cloneCombatState(input.state),
        summary
      };
    }

    const availability = getCombatActionAvailability(input.state, input.hero).skill;
    const manaPressure = getMonsterRuntimeSkillManaCostIncrease(input.state);

    if (!availability.available || input.state.hero.mana < skill.manaCost + manaPressure) {
      const summary = buildSummary({
        action: "skill",
        ...summaryActionOrigin(input),
        heroOutcome: availability.reason === "cooldown" ? "skill-on-cooldown" : "not-enough-mana",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false,
        skill
      });
      return {
        ok: false,
        reason: summary.heroOutcome === "skill-on-cooldown" ? "skill-on-cooldown" : "not-enough-mana",
        state: cloneCombatState(input.state),
        summary
      };
    }

    return resolveHeroAttack(input, skill);
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

  if (input.item.effect.kind === "heal-hp" && input.state.hero.hp >= input.state.hero.hpMax) {
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

function resolveSingleEnemyCombatItemTurn(
  input: ResolveCombatTurnInput,
  item: ResolveCombatItemTurnInput["item"]
): ResolveCombatItemTurnResult {
  const nextState = cloneCombatState(input.state);
  tickSkillCooldown(nextState);
  const heroHealing = resolveCombatItemHealing(nextState, item);
  nextState.hero.hp = Math.min(nextState.hero.hpMax, nextState.hero.hp + heroHealing);

  const heroEffect = applyHeroActivationMonsterEffects(nextState);
  const heroEffectDamage = heroEffect.damage;
  const monsterResponse = nextState.hero.hp > 0
    ? resolveMonsterResponse({
        state: nextState,
        input,
        damageReduction: 0
      })
    : { damage: 0 };
  const monsterDamage = heroEffectDamage + monsterResponse.damage;
  nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
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
  const heroHealing = resolveCombatItemHealing(nextState, item);
  nextState.hero.hp = Math.min(nextState.hero.hpMax, nextState.hero.hp + heroHealing);

  const activationPhase = resolveHeroActivationAndLivingEnemyPhase(nextState, input, 0);
  const { enemyPhase, heroEffectDamage } = activationPhase;
  nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
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
    ...(enemyPhase.primaryAction ? enemyActionToSummaryFields(enemyPhase.primaryAction) : {}),
    ...(enemyPhase.enemyActions.length > 0 ? { enemyActions: enemyPhase.enemyActions } : {})
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
  }
}

function resolveHeroSkip(input: ResolveCombatTurnInput): ResolveCombatTurnResult {
  if (hasCombatEnemyCollection(input.state)) {
    return resolveMultiEnemyHeroSkip(input);
  }

  const nextState = cloneCombatState(input.state);
  tickSkillCooldown(nextState);

  const heroEffect = applyHeroActivationMonsterEffects(nextState);
  const heroEffectDamage = heroEffect.damage;
  const monsterResponse = nextState.hero.hp > 0
    ? resolveMonsterResponse({
        state: nextState,
        input,
        damageReduction: 0
      })
    : { damage: 0 };
  const monsterDamage = heroEffectDamage + monsterResponse.damage;
  nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
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
  skill?: ReturnType<typeof getCombatSkillProfile>
): ResolveCombatTurnResult {
  if (hasCombatEnemyCollection(input.state)) {
    return resolveMultiEnemyHeroAttack(input, skill);
  }

  const nextState = cloneCombatState(input.state);
  const action = skill ? "skill" : input.action === "defend" ? "defend" : "attack";
  const monsterHpBeforeHeroAction = nextState.monster.hp;
  const defenderStats = applyMonsterRuntimeHeroAttackModifiers(
    nextState,
    applyDrinkHeroAttackModifiers(input.state, input.monster)
  );
  const actorAction = resolveActorCombatAction({
    actorState: {
      ...nextState.hero,
      cooldowns: nextState.cooldowns,
      ...(nextState.guard ? { guard: nextState.guard } : {})
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
    rng: input.rng
  });
  nextState.hero.hp = actorAction.actorState.hp;
  nextState.hero.mana = actorAction.actorState.mana;
  const manaPressure = skill ? getMonsterRuntimeSkillManaCostIncrease(nextState) : 0;
  if (manaPressure > 0) {
    nextState.hero.mana = clampResource(nextState.hero.mana - manaPressure, nextState.hero.manaMax);
  }
  setStateGuard(nextState, actorAction.actorState.guard);
  setStateCooldowns(nextState, actorAction.actorState.cooldowns);
  nextState.monster.hp = actorAction.defenderState.hp;
  const runtimeHeroDamage = applyMonsterRuntimeHeroDamage({
    state: nextState,
    heroDamage: actorAction.summary.actorDamage,
    monsterHpBeforeDamage: monsterHpBeforeHeroAction,
    heroAction: action,
    rng: input.rng
  });
  const heroDamage = runtimeHeroDamage.heroDamage;
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

  const heroEffect = applyHeroActivationMonsterEffects(nextState);
  heroEffectDamage = heroEffect.damage;
  monsterDamage += heroEffectDamage;
  if (nextState.hero.hp > 0) {
    monsterResponse = resolveMonsterResponse({
      state: nextState,
      input,
      damageReduction: skill?.monsterDamageReduction ?? 0,
      simultaneousFinalResponse: monsterDefeatedByHeroExchange
    });
    monsterDamage += monsterResponse.damage;
  }
  let counterDamage = 0;
  if (nextState.hero.hp > 0 && monsterResponse.defendCounter && monsterDamage > 0) {
    counterDamage = rollDefendCounterDamage(input.hero, input.monster, input.rng);
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
    input.rng
  );
  let monsterDamage = 0;
  let heroEffectDamage = 0;
  let monsterResponse: MonsterResponseResult = { damage: 0 };
  tickSkillCooldown(nextState);

  if (fled) {
    nextState.status = "fled";
    nextState.turn += 1;
  } else {
    const heroEffect = applyHeroActivationMonsterEffects(nextState);
    heroEffectDamage = heroEffect.damage;
    monsterResponse = nextState.hero.hp > 0
      ? resolveMonsterResponse({
          state: nextState,
          input,
          damageReduction: 0
        })
      : { damage: 0 };
    monsterDamage = heroEffectDamage + monsterResponse.damage;
    nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
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

  const activationPhase = resolveHeroActivationAndLivingEnemyPhase(nextState, input, 0);
  const { enemyPhase, heroEffectDamage } = activationPhase;
  nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
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
    ...(enemyPhase.primaryAction ? enemyActionToSummaryFields(enemyPhase.primaryAction) : {}),
    ...(enemyPhase.enemyActions.length > 0 ? { enemyActions: enemyPhase.enemyActions } : {})
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
  skill?: ReturnType<typeof getCombatSkillProfile>
): ResolveCombatTurnResult {
  const nextState = cloneCombatState(input.state);
  syncPrimaryCombatEnemy(nextState);
  const action = skill ? "skill" : input.action === "defend" ? "defend" : "attack";
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
      ...(nextState.guard ? { guard: nextState.guard } : {})
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
    rng: input.rng
  });
  nextState.hero.hp = actorAction.actorState.hp;
  nextState.hero.mana = actorAction.actorState.mana;
  const manaPressure = skill ? getMonsterRuntimeSkillManaCostIncrease(nextState) : 0;
  if (manaPressure > 0) {
    nextState.hero.mana = clampResource(nextState.hero.mana - manaPressure, nextState.hero.manaMax);
  }
  setStateGuard(nextState, actorAction.actorState.guard);
  setStateCooldowns(nextState, actorAction.actorState.cooldowns);
  primary.hp = actorAction.defenderState.hp;
  nextState.monster = combatEnemyToMonster(primary);
  const runtimeHeroDamage = applyMonsterRuntimeHeroDamage({
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
  const heroDamage = runtimeHeroDamage.heroDamage;
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
      skill?.monsterDamageReduction ?? 0,
      enemyPhaseParticipants
    );
    heroEffectDamage = activationPhase.heroEffectDamage;
    monsterDamage += activationPhase.monsterDamage;
    const enemyPhase = activationPhase.enemyPhase;
    if (nextState.hero.hp > 0 && enemyPhase.defendCounter && monsterDamage > 0) {
      counterDamage = rollDefendCounterDamage(input.hero, primaryStats, input.rng);
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
      ...(skill ? { skill } : {}),
      ...(enemyPhase.primaryAction ? enemyActionToSummaryFields(enemyPhase.primaryAction) : {}),
      ...(enemyPhase.enemyActions.length > 0 ? { enemyActions: enemyPhase.enemyActions } : {})
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
    input.rng
  );
  tickSkillCooldown(nextState);

  let enemyPhase: ReturnType<typeof resolveLivingEnemyPhase> = {
    monsterDamage: 0,
    enemyActions: [],
    defendCounter: false
  };
  let heroEffectDamage = 0;

  if (fled) {
    nextState.status = "fled";
  } else {
    const activationPhase = resolveHeroActivationAndLivingEnemyPhase(nextState, input, 0);
    heroEffectDamage = activationPhase.heroEffectDamage;
    enemyPhase = activationPhase.enemyPhase;
    enemyPhase.monsterDamage = activationPhase.monsterDamage;
    nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
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
    ...(enemyPhase.primaryAction ? enemyActionToSummaryFields(enemyPhase.primaryAction) : {}),
    ...(enemyPhase.enemyActions.length > 0 ? { enemyActions: enemyPhase.enemyActions } : {})
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
  skill?: ReturnType<typeof getCombatSkillProfile>
): ResolveActorCombatActionResult {
  const actorState = cloneActorResourceState(input.actorState);
  const defenderState = cloneActorResourceState(input.defenderState);
  const attack = skill
    ? rollSkillAttack(input.actorStats, input.defenderStats, skill, input.rng)
    : rollBasicAttack(input.actorStats, input.defenderStats, input.rng);
  const manaSpent = skill?.manaCost ?? 0;

  actorState.mana = clampResource(actorState.mana - manaSpent, actorState.manaMax);
  delete actorState.guard;
  defenderState.hp = Math.max(0, defenderState.hp - attack.damage);
  const tickedActorState = tickActorCooldowns(actorState);

  if (skill) {
    setActorAbilityCooldown(tickedActorState, skill.id, skill.cooldownOwnActions);
  }

  return {
    actorState: tickedActorState,
    defenderState,
    summary: {
      action: skill ? "skill" : "attack",
      actorOutcome: defenderState.hp <= 0
        ? "won"
        : attack.hit
          ? attack.critical
            ? "critical-hit"
            : "hit"
          : "miss",
      actorDamage: attack.damage,
      manaSpent,
      critical: attack.critical,
      ...(skill
        ? {
            skillId: skill.id,
            damageKind: skill.damageKind
          }
        : {})
    }
  };
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

  return Array.from(new Set(effectNotices));
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

function setActorAbilityCooldown(
  state: { cooldowns?: CombatState["cooldowns"] },
  abilityId: string,
  remainingTurns: number
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
    skill: {
      id: abilityId,
      remainingTurns
    }
  };
}

function tickActorCooldowns(state: CombatActorResourceState): CombatActorResourceState {
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
    ...(state.guard ? { guard: { ...state.guard } } : {})
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
  skill?: CombatSkillProfile;
  monsterSkill?: CombatSkillProfile;
  enemyActions?: CombatEnemyTurnSummary[];
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
    ...(input.enemyActions ? { enemyActions: input.enemyActions } : {}),
    ...(input.debugTrace ? { debugTrace: input.debugTrace } : {})
  };
}

function resolveHeroActivationAndLivingEnemyPhase(
  state: CombatState,
  input: ResolveCombatTurnInput,
  damageReduction: number,
  participants?: readonly CombatEnemyState[]
): {
  heroEffectDamage: number;
  monsterDamage: number;
  enemyPhase: ReturnType<typeof resolveLivingEnemyPhase>;
} {
  const heroEffect = applyHeroActivationMonsterEffects(state);
  const heroEffectDamage = heroEffect.damage;
  const enemyPhase = state.hero.hp > 0
    ? resolveLivingEnemyPhase(state, input, damageReduction, participants)
    : {
        monsterDamage: 0,
        enemyActions: [],
        defendCounter: false
      };

  return {
    heroEffectDamage,
    monsterDamage: heroEffectDamage + enemyPhase.monsterDamage,
    enemyPhase
  };
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
  defendCounter: boolean;
} {
  let monsterDamage = 0;
  let monsterOutcome: CombatTurnSummary["monsterOutcome"] | undefined;
  let defendCounter = false;
  const enemyActions: CombatEnemyTurnSummary[] = [];

  for (const participant of participants) {
    if (state.hero.hp <= 0) {
      break;
    }

    const enemy = normalizeCombatEnemies(state).find((candidate) =>
      candidate.enemyId === participant.enemyId
    ) ?? participant;
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
      damageReduction,
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
    defendCounter
  };
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

  return {
    damage: Math.max(1, Math.floor(input.damage * (1 - stance.damageReduction))),
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
  const legalAbilityIds = monster.classId ? [getCombatSkillProfile(monster.classId).id] : [];

  if (!monster.debugTrace && legalAbilityIds.length === 0 && !monsterSkill) {
    return undefined;
  }

  return {
    ...monster.debugTrace,
    legalAbilityIds,
    ...(monsterSkill ? { chosenAbilityId: monsterSkill.id } : {})
  };
}
