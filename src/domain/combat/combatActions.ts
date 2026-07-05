import type { StatKey } from "../characters/starterStats";
import {
  fallbackClassAbility,
  findClassAbility,
  findRaceAbility,
  type PlayerAbilityDefinition
} from "../../content/playerAbilities";
import type { CombatActionType, CombatDamageKind, PlayerCombatActionType } from "./combatState";

export type CombatAbilitySource = "basic" | "class" | "race" | "equipment" | "signature" | "monster";
export type CombatTargetScope =
  | "self"
  | "single-enemy"
  | "lowest-hp-enemy"
  | "all-enemies"
  | "single-ally-or-self"
  | "all-allies-including-self"
  | "lowest-hp-ally";

export interface CombatAbilityDefinition {
  id: string;
  action: Exclude<CombatActionType, "flee">;
  source: CombatAbilitySource;
  label: string;
  manaCost: number;
  cooldownOwnActions: number;
  primaryTargetScope: CombatTargetScope;
  tags: string[];
}

export interface CombatSkillProfile {
  id: string;
  legacyCooldownIds?: readonly string[];
  source?: CombatAbilitySource;
  action?: Extract<PlayerCombatActionType, "skill" | "race" | "gear">;
  label?: string;
  description?: string;
  primaryTargetScope?: CombatTargetScope;
  secondaryTargetScope?: CombatTargetScope;
  damageKind: CombatDamageKind;
  stat: StatKey;
  manaCost: number;
  cooldownOwnActions: number;
  baseDamage: number;
  multiplier: number;
  secondaryMultiplier?: number;
  accuracyBonus: number;
  critBonus: number;
  monsterDamageReduction: number;
  healAmount?: number;
  guardReduction?: number;
  counterDamage?: number;
  criticalFumbleLine?: string;
  recipe?: PlayerAbilityDefinition["recipe"];
  tags?: readonly string[];
}

export type CombatPlayerAbilityProfile = CombatSkillProfile & {
  source: Extract<CombatAbilitySource, "class" | "race">;
  action: Extract<PlayerCombatActionType, "skill" | "race">;
  label: string;
  description: string;
  primaryTargetScope: CombatTargetScope;
  secondaryTargetScope?: CombatTargetScope;
  criticalFumbleLine: string;
  recipe: PlayerAbilityDefinition["recipe"];
  tags: readonly string[];
};

export function getCombatSkillProfile(classId: string | undefined): CombatSkillProfile {
  return playerAbilityToSkillProfile(findClassAbility(classId));
}

export function getCombatRaceAbilityProfile(raceId: string | undefined): CombatPlayerAbilityProfile | null {
  const ability = findRaceAbility(raceId);

  return ability ? playerAbilityToSkillProfile(ability) : null;
}

export function getCombatClassAbilityProfile(classId: string | undefined): CombatPlayerAbilityProfile {
  return playerAbilityToSkillProfile(findClassAbility(classId));
}

function playerAbilityToSkillProfile(ability: PlayerAbilityDefinition): CombatPlayerAbilityProfile {
  return {
    id: ability.id,
    source: ability.source,
    action: ability.action,
    label: ability.label,
    description: ability.description,
    primaryTargetScope: ability.primaryTargetScope,
    ...(ability.secondaryTargetScope ? { secondaryTargetScope: ability.secondaryTargetScope } : {}),
    ...(ability.legacyCooldownIds ? { legacyCooldownIds: ability.legacyCooldownIds } : {}),
    damageKind: ability.damageKind ?? "physical",
    stat: ability.stat ?? fallbackClassAbility.stat,
    manaCost: ability.manaCost,
    cooldownOwnActions: ability.cooldownOwnActions,
    baseDamage: ability.baseDamage ?? 0,
    multiplier: ability.multiplier ?? 0,
    ...(ability.secondaryMultiplier ? { secondaryMultiplier: ability.secondaryMultiplier } : {}),
    accuracyBonus: ability.accuracyBonus ?? 0,
    critBonus: ability.critBonus ?? 0,
    monsterDamageReduction: ability.monsterDamageReduction ?? 0,
    ...(ability.healAmount ? { healAmount: ability.healAmount } : {}),
    ...(ability.guardReduction ? { guardReduction: ability.guardReduction } : {}),
    ...(ability.counterDamage ? { counterDamage: ability.counterDamage } : {}),
    criticalFumbleLine: ability.criticalFumbleLine,
    recipe: ability.recipe,
    tags: ability.tags
  };
}

export const BASIC_ATTACK_ABILITY_ID = "ability.basic.attack";
export const BASIC_DEFEND_ABILITY_ID = "ability.basic.defend";

export function getBasicCombatAbility(action: "attack" | "defend"): CombatAbilityDefinition {
  if (action === "defend") {
    return {
      id: BASIC_DEFEND_ABILITY_ID,
      action: "defend",
      source: "basic",
      label: "🛡 Захищатися",
      manaCost: 0,
      cooldownOwnActions: 0,
      primaryTargetScope: "self",
      tags: ["defense", "stance"]
    };
  }

  return {
    id: BASIC_ATTACK_ABILITY_ID,
    action: "attack",
    source: "basic",
    label: "⚔️ Атакувати",
    manaCost: 0,
    cooldownOwnActions: 0,
    primaryTargetScope: "single-enemy",
    tags: ["direct", "physical"]
  };
}

export function getClassCombatAbility(classId: string | undefined): CombatAbilityDefinition {
  const skill = getCombatClassAbilityProfile(classId);

  return {
    id: skill.id,
    action: "skill",
    source: "class",
    label: skill.label,
    manaCost: skill.manaCost,
    cooldownOwnActions: skill.cooldownOwnActions,
    primaryTargetScope: skill.primaryTargetScope,
    tags: [...skill.tags]
  };
}

export function getRaceCombatAbility(raceId: string | undefined): CombatAbilityDefinition | null {
  const ability = getCombatRaceAbilityProfile(raceId);

  if (!ability) {
    return null;
  }

  return {
    id: ability.id,
    action: "race",
    source: "race",
    label: ability.label,
    manaCost: ability.manaCost,
    cooldownOwnActions: ability.cooldownOwnActions,
    primaryTargetScope: ability.primaryTargetScope,
    tags: [...ability.tags]
  };
}

export function getCombatAbilityForAction(
  action: Exclude<PlayerCombatActionType, "flee">,
  classId: string | undefined,
  raceId?: string
): CombatAbilityDefinition {
  if (action === "skill") {
    return getClassCombatAbility(classId);
  }

  if (action === "race") {
    return getRaceCombatAbility(raceId) ?? getBasicCombatAbility("defend");
  }

  if (action === "gear") {
    return getBasicCombatAbility("attack");
  }

  return getBasicCombatAbility(action);
}
