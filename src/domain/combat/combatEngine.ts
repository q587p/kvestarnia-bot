import type { RandomSource } from "../../shared/random";
import { getCombatSkillProfile } from "./combatActions";
import {
  rollBasicAttack,
  rollFleeSuccess,
  rollMonsterDamage,
  rollMonsterSkillDamage,
  rollSkillAttack
} from "./combatBalance";
import {
  clampResource,
  cloneCombatState,
  type CombatActionType,
  type CombatActorStats,
  type CombatState,
  type CombatTurnSummary,
  type MonsterCombatStats
} from "./combatState";

export interface ResolveCombatTurnInput {
  state: CombatState;
  action: CombatActionType;
  hero: CombatActorStats;
  monster: MonsterCombatStats;
  rng: RandomSource;
}

export type ResolveCombatTurnResult =
  | {
      ok: true;
      state: CombatState;
      summary: CombatTurnSummary;
    }
  | {
      ok: false;
      reason: "inactive";
      state: CombatState;
      summary: CombatTurnSummary;
    };

export interface CombatActionAvailability {
  attack: { available: true };
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
}

export interface ResolveActorCombatActionInput {
  actorState: CombatActorResourceState;
  defenderState: CombatActorResourceState;
  actorStats: CombatActorStats;
  defenderStats: MonsterCombatStats;
  action: Exclude<CombatActionType, "flee">;
  rng: RandomSource;
}

export interface ActorCombatActionSummary {
  action: Exclude<CombatActionType, "flee">;
  actorOutcome: Extract<
    CombatTurnSummary["heroOutcome"],
    "hit" | "critical-hit" | "miss" | "not-enough-mana" | "skill-on-cooldown" | "won"
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
  const cooldown = actorState.cooldowns?.skill;

  if (cooldown?.id === skill.id && cooldown.remainingTurns > 0) {
    return {
      attack: { available: true },
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
    flee: { available: true },
    skill: { available: true, skill }
  };
}

export function resolveActorCombatAction(
  input: ResolveActorCombatActionInput
): ResolveActorCombatActionResult {
  const actorState = cloneActorResourceState(input.actorState);
  const defenderState = cloneActorResourceState(input.defenderState);

  if (input.action === "skill") {
    const skill = getCombatSkillProfile(input.actorStats.classId);
    const availability = getActorCombatActionAvailability(actorState, input.actorStats).skill;

    if (!availability.available) {
      const nextActor = tickActorSkillCooldown(actorState);
      return {
        actorState: nextActor,
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

  if (input.action === "skill") {
    const skill = getCombatSkillProfile(input.hero.classId);
    const availability = getCombatActionAvailability(input.state, input.hero).skill;

    if (!availability.available) {
      return resolveFailedSkillAttempt({
        ...input,
        skill,
        outcome: availability.reason === "cooldown" ? "skill-on-cooldown" : "not-enough-mana"
      });
    }

    return resolveHeroAttack(input, skill);
  }

  return resolveHeroAttack(input);
}

function resolveHeroAttack(
  input: ResolveCombatTurnInput,
  skill?: ReturnType<typeof getCombatSkillProfile>
): ResolveCombatTurnResult {
  const nextState = cloneCombatState(input.state);
  const actorAction = resolveActorCombatAction({
    actorState: {
      ...nextState.hero,
      cooldowns: nextState.cooldowns
    },
    defenderState: {
      hp: nextState.monster.hp,
      hpMax: nextState.monster.hpMax,
      mana: 0,
      manaMax: 0
    },
    actorStats: input.hero,
    defenderStats: input.monster,
    action: skill ? "skill" : "attack",
    rng: input.rng
  });
  nextState.hero.hp = actorAction.actorState.hp;
  nextState.hero.mana = actorAction.actorState.mana;
  setStateCooldowns(nextState, actorAction.actorState.cooldowns);
  nextState.monster.hp = actorAction.defenderState.hp;
  const monsterHp = nextState.monster.hp;
  const manaSpent = actorAction.summary.manaSpent;

  let monsterDamage = 0;
  let monsterSkill: ReturnType<typeof getCombatSkillProfile> | null = null;

  if (monsterHp <= 0) {
    nextState.status = "won";
    nextState.turn += 1;
    const summary = buildSummary({
      action: input.action,
      heroOutcome: "won",
      heroDamage: actorAction.summary.actorDamage,
      monsterDamage,
      manaSpent,
      critical: actorAction.summary.critical,
      ...(skill ? { skill } : {})
    });
    nextState.lastTurn = summary;

    return {
      ok: true,
      state: nextState,
      summary
    };
  }

  monsterSkill = selectMonsterSkill(input.state, input.monster, input.rng);
  monsterDamage = monsterSkill
    ? rollMonsterSkillDamage(
        input.hero,
        input.monster,
        monsterSkill,
        input.rng,
        skill?.monsterDamageReduction ?? 0
      )
    : rollMonsterDamage(
        input.hero,
        input.monster,
        input.rng,
        skill?.monsterDamageReduction ?? 0
      );
  nextState.hero.hp = Math.max(0, nextState.hero.hp - monsterDamage);
  const monsterOutcome = monsterDamage > 0 ? "hit" : "miss";
  nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
  nextState.turn += 1;

  const debugTrace = buildTurnDebugTrace(input.monster, monsterSkill);
  const summary = buildSummary({
    action: input.action,
    heroOutcome: actorAction.summary.actorOutcome,
    monsterOutcome: nextState.status === "lost" ? "lost" : monsterOutcome,
    heroDamage: actorAction.summary.actorDamage,
    monsterDamage,
    manaSpent,
    critical: actorAction.summary.critical,
    ...(skill ? { skill } : {}),
    ...(monsterSkill ? { monsterSkill } : {}),
    ...(debugTrace ? { debugTrace } : {})
  });
  nextState.lastTurn = summary;

  return {
    ok: true,
    state: nextState,
    summary
  };
}

function resolveFlee(input: ResolveCombatTurnInput): ResolveCombatTurnResult {
  const nextState = cloneCombatState(input.state);
  const fled = rollFleeSuccess(input.hero, input.monster, input.rng);
  let monsterDamage = 0;
  tickSkillCooldown(nextState);

  if (fled) {
    nextState.status = "fled";
    nextState.turn += 1;
  } else {
    monsterDamage = rollMonsterDamage(input.hero, input.monster, input.rng);
    nextState.hero.hp = Math.max(0, nextState.hero.hp - monsterDamage);
    nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
    nextState.turn += 1;
  }

  const monsterOutcome: CombatTurnSummary["monsterOutcome"] | undefined =
    fled ? undefined : monsterDamage > 0 ? "hit" : "miss";

  const summary = buildSummary({
    action: "flee",
    heroOutcome: fled ? "fled" : "flee-failed",
    monsterOutcome: nextState.status === "lost" ? "lost" : monsterOutcome,
    heroDamage: 0,
    monsterDamage,
    manaSpent: 0,
    critical: false
  });
  nextState.lastTurn = summary;

  return {
    ok: true,
    state: nextState,
    summary
  };
}

function resolveFailedSkillAttempt(
  input: ResolveCombatTurnInput & {
    skill: ReturnType<typeof getCombatSkillProfile>;
    outcome: Extract<CombatTurnSummary["heroOutcome"], "not-enough-mana" | "skill-on-cooldown">;
  }
): ResolveCombatTurnResult {
  const nextState = cloneCombatState(input.state);
  const actorAction = resolveActorCombatAction({
    actorState: {
      ...nextState.hero,
      cooldowns: nextState.cooldowns
    },
    defenderState: {
      hp: nextState.monster.hp,
      hpMax: nextState.monster.hpMax,
      mana: 0,
      manaMax: 0
    },
    actorStats: input.hero,
    defenderStats: input.monster,
    action: "skill",
    rng: input.rng
  });
  nextState.hero.mana = actorAction.actorState.mana;
  setStateCooldowns(nextState, actorAction.actorState.cooldowns);

  const monsterSkill = selectMonsterSkill(input.state, input.monster, input.rng);
  const monsterDamage = monsterSkill
    ? rollMonsterSkillDamage(input.hero, input.monster, monsterSkill, input.rng)
    : rollMonsterDamage(input.hero, input.monster, input.rng);

  nextState.hero.hp = Math.max(0, nextState.hero.hp - monsterDamage);
  nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
  nextState.turn += 1;

  const monsterOutcome = nextState.status === "lost" ? "lost" : monsterDamage > 0 ? "hit" : "miss";
  const debugTrace = buildTurnDebugTrace(input.monster, monsterSkill);
  const summary = buildSummary({
    action: "skill",
    heroOutcome: input.outcome,
    monsterOutcome,
    heroDamage: 0,
    monsterDamage,
    manaSpent: 0,
    critical: false,
    skill: input.skill,
    ...(monsterSkill ? { monsterSkill } : {}),
    ...(debugTrace ? { debugTrace } : {})
  });
  nextState.lastTurn = summary;

  return {
    ok: true,
    state: nextState,
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
  defenderState.hp = Math.max(0, defenderState.hp - attack.damage);
  const tickedActorState = tickActorSkillCooldown(actorState);

  if (skill && skill.manaCost === 0) {
    setActorSkillCooldown(tickedActorState, skill, input.actorStats);
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

export function getNonManaSkillCooldownTurns(
  hero: CombatActorStats,
  skill: ReturnType<typeof getCombatSkillProfile>
): number {
  const statScore = hero[skill.stat] ?? 0;
  const luckScore = hero.luck ?? 0;
  const score = statScore + Math.floor(luckScore / 2);

  if (score >= 12) {
    return 3;
  }

  if (score >= 8) {
    return 4;
  }

  return 5;
}

function tickSkillCooldown(state: CombatState): void {
  const ticked = tickActorSkillCooldown({
    hp: state.hero.hp,
    hpMax: state.hero.hpMax,
    mana: state.hero.mana,
    manaMax: state.hero.manaMax,
    cooldowns: state.cooldowns
  });

  setStateCooldowns(state, ticked.cooldowns);
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

function setActorSkillCooldown(
  state: { cooldowns?: CombatState["cooldowns"] },
  skill: ReturnType<typeof getCombatSkillProfile>,
  hero: CombatActorStats
): void {
  state.cooldowns = {
    ...state.cooldowns,
    skill: {
      id: skill.id,
      remainingTurns: getNonManaSkillCooldownTurns(hero, skill)
    }
  };
}

function tickActorSkillCooldown(state: CombatActorResourceState): CombatActorResourceState {
  const cooldown = state.cooldowns?.skill;

  if (!cooldown) {
    return cloneActorResourceState(state);
  }

  const remainingTurns = Math.max(0, cooldown.remainingTurns - 1);
  const next = cloneActorResourceState(state);

  if (remainingTurns <= 0) {
    delete next.cooldowns;
    return next;
  }

  next.cooldowns = {
    ...next.cooldowns,
    skill: {
      ...cooldown,
      remainingTurns
    }
  };

  return next;
}

function cloneActorResourceState(state: CombatActorResourceState): CombatActorResourceState {
  return {
    hp: state.hp,
    hpMax: state.hpMax,
    mana: state.mana,
    manaMax: state.manaMax,
    ...(state.cooldowns?.skill
      ? { cooldowns: { skill: { ...state.cooldowns.skill } } }
      : {})
  };
}

function buildSummary(input: {
  action: CombatActionType;
  heroOutcome: CombatTurnSummary["heroOutcome"];
  monsterOutcome?: CombatTurnSummary["monsterOutcome"];
  heroDamage: number;
  monsterDamage: number;
  manaSpent: number;
  critical: boolean;
  skill?: ReturnType<typeof getCombatSkillProfile>;
  monsterSkill?: ReturnType<typeof getCombatSkillProfile>;
  debugTrace?: ReturnType<typeof buildTurnDebugTrace>;
}): CombatTurnSummary {
  return {
    action: input.action,
    heroOutcome: input.heroOutcome,
    ...(input.monsterOutcome ? { monsterOutcome: input.monsterOutcome } : {}),
    heroDamage: input.heroDamage,
    monsterDamage: input.monsterDamage,
    manaSpent: input.manaSpent,
    critical: input.critical,
    ...(input.skill
      ? {
          skillId: input.skill.id,
          damageKind: input.skill.damageKind
        }
      : {}),
    ...(input.monsterSkill
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
    ...(input.debugTrace ? { debugTrace: input.debugTrace } : {})
  };
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
