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
      reason: "inactive" | "not-enough-mana";
      state: CombatState;
      summary: CombatTurnSummary;
    };

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

    if (input.state.hero.mana < skill.manaCost) {
      const summary: CombatTurnSummary = {
        action: input.action,
        heroOutcome: "not-enough-mana",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false,
        skillId: skill.id,
        damageKind: skill.damageKind
      };

      return {
        ok: false,
        reason: "not-enough-mana",
        state: cloneCombatState(input.state),
        summary
      };
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
  const attack = skill
    ? rollSkillAttack(input.hero, input.monster, skill, input.rng)
    : rollBasicAttack(input.hero, input.monster, input.rng);
  const manaSpent = skill?.manaCost ?? 0;
  const monsterHp = Math.max(0, nextState.monster.hp - attack.damage);

  nextState.hero.mana = clampResource(nextState.hero.mana - manaSpent, nextState.hero.manaMax);
  nextState.monster.hp = monsterHp;

  let monsterDamage = 0;
  let monsterSkill: ReturnType<typeof getCombatSkillProfile> | null = null;

  if (monsterHp <= 0) {
    nextState.status = "won";
    nextState.turn += 1;
    const summary = buildSummary({
      action: input.action,
      heroOutcome: "won",
      heroDamage: attack.damage,
      monsterDamage,
      manaSpent,
      critical: attack.critical,
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
    heroOutcome: attack.hit ? (attack.critical ? "critical-hit" : "hit") : "miss",
    monsterOutcome: nextState.status === "lost" ? "lost" : monsterOutcome,
    heroDamage: attack.damage,
    monsterDamage,
    manaSpent,
    critical: attack.critical,
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
