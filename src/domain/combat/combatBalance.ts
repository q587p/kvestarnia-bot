import type { RandomSource } from "../../shared/random";
import type { CombatSkillProfile } from "./combatActions";
import type { CombatActorStats, MonsterCombatStats } from "./combatState";

export interface HeroAttackRoll {
  damage: number;
  hit: boolean;
  critical: boolean;
}

export function rollBasicAttack(
  hero: CombatActorStats,
  monster: MonsterCombatStats,
  rng: RandomSource
): HeroAttackRoll {
  return applyMonsterIncomingModifier(rollHeroDamage({
    baseDamage: 2 + (hero.weaponDamage ?? 0),
    statValue: hero.strength,
    level: hero.level,
    armorOrResist: monster.armor,
    accuracy: buildHitChance(hero.dexterity, monster.dexterity) +
      getHeroAccuracyBonus(hero) -
      getMonsterEvasionDelta(monster),
    critChance: buildCritChance(hero.dexterity, hero.luck),
    multiplier: 1,
    rng
  }), monster);
}

export function rollSkillAttack(
  hero: CombatActorStats,
  monster: MonsterCombatStats,
  skill: CombatSkillProfile,
  rng: RandomSource
): HeroAttackRoll {
  const targetDefense = skill.damageKind === "spell" ? monster.resist : monster.armor;
  const powerBonus = skill.damageKind === "spell" ? hero.spellPower ?? 0 : hero.weaponDamage ?? 0;

  return applyMonsterIncomingModifier(rollHeroDamage({
    baseDamage: skill.baseDamage + powerBonus,
    statValue: hero[skill.stat],
    level: hero.level,
    armorOrResist: targetDefense,
    accuracy: buildHitChance(hero.dexterity, monster.dexterity) +
      skill.accuracyBonus +
      getHeroAccuracyBonus(hero) -
      getMonsterEvasionDelta(monster),
    critChance: buildCritChance(hero.dexterity, hero.luck) + skill.critBonus,
    multiplier: skill.multiplier,
    rng
  }), monster);
}

export function rollMonsterDamage(
  hero: CombatActorStats,
  monster: MonsterCombatStats,
  rng: RandomSource,
  damageReduction = 0
): number {
  const hitChance = clamp(
    0.82 + (monster.dexterity - hero.dexterity) * 0.01 + getMonsterAccuracyDelta(monster),
    0.65,
    0.95
  );

  if (rng.nextFloat() >= hitChance) {
    return 0;
  }

  const variance = rng.nextInt(0, 2);
  const rawDamage = monster.attack + variance - Math.floor((hero.armor ?? 0) * 0.8) - damageReduction;

  return applyMonsterOutgoingModifier(Math.max(1, rawDamage), monster);
}

export function rollMonsterSkillDamage(
  hero: CombatActorStats,
  monster: MonsterCombatStats,
  skill: CombatSkillProfile,
  rng: RandomSource,
  damageReduction = 0
): number {
  const targetDefense = skill.damageKind === "spell" ? hero.resist ?? 0 : hero.armor ?? 0;
  const hitChance = clamp(
    0.8 + skill.accuracyBonus + (monster.dexterity - hero.dexterity) * 0.01 + getMonsterAccuracyDelta(monster),
    0.65,
    0.97
  );

  if (rng.nextFloat() >= hitChance) {
    return 0;
  }

  const variance = rng.nextInt(0, 2);
  const powerBonus = skill.damageKind === "spell" ? monster.spellPower ?? 0 : Math.floor(monster.attack / 3);
  const rawDamage =
    monster.attack +
    Math.ceil(skill.baseDamage / 2) +
    powerBonus +
    variance -
    Math.floor(targetDefense * 0.8) -
    damageReduction;

  return applyMonsterOutgoingModifier(Math.max(1, rawDamage), monster);
}

export function rollFleeSuccess(
  hero: CombatActorStats,
  monster: MonsterCombatStats,
  rng: RandomSource,
  attempt = 1
): boolean {
  const chance = buildFleeSuccessChance(hero, monster, attempt);

  return rng.nextFloat() < chance;
}

export function buildFleeSuccessChance(
  hero: CombatActorStats,
  monster: MonsterCombatStats,
  attempt = 1
): number {
  const baseChance = clamp(0.45 + (hero.dexterity + hero.luck - monster.level * 3) * 0.015, 0.25, 0.8);
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  if (normalizedAttempt >= 7) {
    return 1;
  }

  if (normalizedAttempt >= 5) {
    return normalizedAttempt === 5 ? 0.93 : 0.965;
  }

  if (normalizedAttempt === 1) {
    return baseChance;
  }

  return clamp(baseChance + ((0.93 - baseChance) * (normalizedAttempt - 1)) / 4, baseChance, 0.93);
}

function rollHeroDamage(input: {
  baseDamage: number;
  statValue: number;
  level: number;
  armorOrResist: number;
  accuracy: number;
  critChance: number;
  multiplier: number;
  rng: RandomSource;
}): HeroAttackRoll {
  const hitChance = clamp(input.accuracy, 0.6, 0.98);

  if (input.rng.nextFloat() >= hitChance) {
    return {
      damage: 0,
      hit: false,
      critical: false
    };
  }

  const critical = input.rng.nextFloat() < clamp(input.critChance, 0.03, 0.35);
  const levelBonus = Math.floor(Math.max(1, input.level) * 0.8);
  const statBonus = Math.floor(input.statValue * 0.55);
  const rawDamage = (input.baseDamage + statBonus + levelBonus) * input.multiplier;
  const criticalDamage = critical ? Math.floor(rawDamage * 1.5) : Math.floor(rawDamage);
  const damage = Math.max(1, criticalDamage - input.armorOrResist);

  return {
    damage,
    hit: true,
    critical
  };
}

function buildHitChance(heroDexterity: number, monsterDexterity: number): number {
  return clamp(0.9 + (heroDexterity - monsterDexterity) * 0.01, 0.72, 0.97);
}

function getHeroAccuracyBonus(hero: CombatActorStats): number {
  return Math.max(0, Math.floor(hero.accuracyBonusPp ?? 0)) / 100;
}

function buildCritChance(heroDexterity: number, heroLuck: number): number {
  return clamp(0.05 + heroDexterity * 0.004 + heroLuck * 0.003, 0.05, 0.25);
}

function applyMonsterIncomingModifier(roll: HeroAttackRoll, monster: MonsterCombatStats): HeroAttackRoll {
  if (!roll.hit || roll.damage <= 0) {
    return roll;
  }

  return {
    ...roll,
    damage: Math.max(1, Math.floor(roll.damage * (monster.contextModifiers?.incomingDamageMultiplier ?? 1)))
  };
}

function applyMonsterOutgoingModifier(damage: number, monster: MonsterCombatStats): number {
  return Math.max(1, Math.floor(damage * (monster.contextModifiers?.outgoingDamageMultiplier ?? 1)));
}

function getMonsterAccuracyDelta(monster: MonsterCombatStats): number {
  return (monster.contextModifiers?.accuracyDeltaPp ?? 0) / 100;
}

function getMonsterEvasionDelta(monster: MonsterCombatStats): number {
  return (monster.contextModifiers?.evasionDeltaPp ?? 0) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
