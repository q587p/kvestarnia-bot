import type { RandomSource } from "../../shared/random";
import { BASIC_DEFEND_ABILITY_ID, getCombatSkillProfile } from "./combatActions";
import { resolveMonsterBark } from "./combatBarks";
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
  type CombatActionType,
  type CombatActorStats,
  type CombatGuardState,
  type CombatState,
  type CombatTurnSummary,
  type MonsterCombatStats,
  type PlayerCombatActionType
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
      reason: "inactive" | "not-enough-mana" | "skill-on-cooldown";
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
  const cooldown = getAbilityCooldown(actorState.cooldowns, skill.id);

  if (cooldown?.id === skill.id && cooldown.remainingTurns > 0) {
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
    nextActor.guard = {
      consecutiveDefends: Math.max(0, actorState.guard?.consecutiveDefends ?? 0) + 1
    };

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

  if (input.action === "skill") {
    const skill = getCombatSkillProfile(input.hero.classId);
    const availability = getCombatActionAvailability(input.state, input.hero).skill;

    if (!availability.available) {
      const summary = buildSummary({
        action: "skill",
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

function resolveHeroSkip(input: ResolveCombatTurnInput): ResolveCombatTurnResult {
  const nextState = cloneCombatState(input.state);
  tickSkillCooldown(nextState);

  const monsterSkill = selectMonsterSkill(input.state, input.monster, input.rng);
  const monsterDamage = monsterSkill
    ? rollMonsterSkillDamage(input.hero, input.monster, monsterSkill, input.rng)
    : rollMonsterDamage(input.hero, input.monster, input.rng);
  nextState.hero.hp = Math.max(0, nextState.hero.hp - monsterDamage);
  nextState.status = nextState.hero.hp <= 0 ? "lost" : "active";
  nextState.turn += 1;
  const bark = resolveMonsterBark({
    state: input.state,
    monster: input.monster,
    monsterCommittedAction: true,
    monsterUsedAbility: Boolean(monsterSkill),
    monsterHpAfterHeroAction: nextState.monster.hp
  });
  nextState.barks = bark.state;
  const debugTrace = buildTurnDebugTrace(input.monster, monsterSkill);
  const summary = buildSummary({
    action: "skip",
    heroOutcome: "inactive",
    monsterOutcome: nextState.status === "lost" ? "lost" : monsterDamage > 0 ? "hit" : "miss",
    heroDamage: 0,
    monsterDamage,
    manaSpent: 0,
    critical: false,
    ...(monsterSkill ? { monsterSkill } : {}),
    ...(bark.barkId ? { monsterBarkId: bark.barkId } : {}),
    ...(debugTrace ? { debugTrace } : {})
  });
  nextState.lastTurn = summary;

  return {
    ok: true,
    state: nextState,
    summary
  };
}

function resolveHeroAttack(
  input: ResolveCombatTurnInput,
  skill?: ReturnType<typeof getCombatSkillProfile>
): ResolveCombatTurnResult {
  const nextState = cloneCombatState(input.state);
  const action = skill ? "skill" : input.action === "defend" ? "defend" : "attack";
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
    defenderStats: input.monster,
    action,
    rng: input.rng
  });
  nextState.hero.hp = actorAction.actorState.hp;
  nextState.hero.mana = actorAction.actorState.mana;
  setStateGuard(nextState, actorAction.actorState.guard);
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
  const defendedMonsterAttack = applyDefendStance({
    defenderGuard: nextState.guard,
    damage: monsterDamage,
    rng: input.rng
  });
  monsterDamage = defendedMonsterAttack.damage;
  nextState.hero.hp = Math.max(0, nextState.hero.hp - monsterDamage);
  let counterDamage = 0;
  if (nextState.hero.hp > 0 && defendedMonsterAttack.counter && monsterDamage > 0) {
    counterDamage = rollDefendCounterDamage(input.hero, input.monster, input.rng);
    nextState.monster.hp = Math.max(0, nextState.monster.hp - counterDamage);
  }
  nextState.status = nextState.hero.hp <= 0 ? "lost" : nextState.monster.hp <= 0 ? "won" : "active";
  const monsterOutcome = monsterDamage > 0 ? "hit" : "miss";
  nextState.turn += 1;
  const bark = resolveMonsterBark({
    state: input.state,
    monster: input.monster,
    monsterCommittedAction: true,
    monsterUsedAbility: Boolean(monsterSkill),
    monsterHpAfterHeroAction: nextState.monster.hp
  });
  nextState.barks = bark.state;

  const debugTrace = buildTurnDebugTrace(input.monster, monsterSkill);
  const summary = buildSummary({
    action: input.action,
    heroOutcome: actorAction.summary.actorOutcome,
    monsterOutcome: nextState.status === "lost" ? "lost" : monsterOutcome,
    heroDamage: actorAction.summary.actorDamage,
    monsterDamage,
    heroCounterDamage: counterDamage,
    manaSpent,
    critical: actorAction.summary.critical,
    ...(skill ? { skill } : {}),
    ...(monsterSkill ? { monsterSkill } : {}),
    ...(bark.barkId ? { monsterBarkId: bark.barkId } : {}),
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
  heroOutcome: CombatTurnSummary["heroOutcome"];
  monsterOutcome?: CombatTurnSummary["monsterOutcome"];
  heroDamage: number;
  monsterDamage: number;
  heroCounterDamage?: number;
  monsterBarkId?: string;
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
    ...(input.heroCounterDamage ? { heroCounterDamage: input.heroCounterDamage } : {}),
    ...(input.monsterBarkId ? { monsterBarkId: input.monsterBarkId } : {}),
    ...(input.debugTrace ? { debugTrace: input.debugTrace } : {})
  };
}

function getAbilityCooldown(
  cooldowns: CombatState["cooldowns"] | undefined,
  abilityId: string
): { id: string; remainingTurns: number } | undefined {
  return cooldowns?.abilities?.[abilityId] ?? (cooldowns?.skill?.id === abilityId ? cooldowns.skill : undefined);
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
