import type { StatKey } from "../characters/starterStats";
import type { CombatActionType, CombatDamageKind } from "./combatState";

export type CombatAbilitySource = "basic" | "class" | "race" | "signature" | "monster";
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
  damageKind: CombatDamageKind;
  stat: StatKey;
  manaCost: number;
  cooldownOwnActions: number;
  baseDamage: number;
  multiplier: number;
  accuracyBonus: number;
  critBonus: number;
  monsterDamageReduction: number;
}

const carefulStrike: CombatSkillProfile = {
  id: "skill.careful-strike",
  damageKind: "physical",
  stat: "strength",
  manaCost: 0,
  cooldownOwnActions: 1,
  baseDamage: 3,
  multiplier: 1.05,
  accuracyBonus: 0.04,
  critBonus: 0.02,
  monsterDamageReduction: 0
};

export function getCombatSkillProfile(classId: string | undefined): CombatSkillProfile {
  switch (classId) {
    case "class.warrior":
      return {
        id: "skill.forceful-strike",
        damageKind: "physical",
        stat: "strength",
        manaCost: 0,
        cooldownOwnActions: 1,
        baseDamage: 5,
        multiplier: 1.25,
        accuracyBonus: 0.03,
        critBonus: 0.02,
        monsterDamageReduction: 0
      };
    case "class.mage":
    case "class.varenyk-mancer":
      return {
        id: "skill.hot-spell",
        damageKind: "spell",
        stat: "intelligence",
        manaCost: 3,
        cooldownOwnActions: 1,
        baseDamage: 5,
        multiplier: 1.2,
        accuracyBonus: 0.06,
        critBonus: 0.01,
        monsterDamageReduction: 0
      };
    case "class.bureaucramancer":
      return {
        id: "skill.form-thirteen-b",
        damageKind: "spell",
        stat: "intelligence",
        manaCost: 2,
        cooldownOwnActions: 1,
        baseDamage: 4,
        multiplier: 1.1,
        accuracyBonus: 0.08,
        critBonus: 0,
        monsterDamageReduction: 1
      };
    case "class.bard":
      return {
        id: "skill.dangerous-couplet",
        damageKind: "social",
        stat: "charisma",
        manaCost: 2,
        cooldownOwnActions: 1,
        baseDamage: 3,
        multiplier: 1,
        accuracyBonus: 0.08,
        critBonus: 0.03,
        monsterDamageReduction: 1
      };
    case "class.rogue":
    case "class.ranger":
      return {
        id: "skill.trick-shot",
        damageKind: "trick",
        stat: "dexterity",
        manaCost: 0,
        cooldownOwnActions: 1,
        baseDamage: 4,
        multiplier: 1.15,
        accuracyBonus: 0.06,
        critBonus: 0.08,
        monsterDamageReduction: 0
      };
    case "class.priest":
      return {
        id: "skill.strict-blessing",
        damageKind: "spell",
        stat: "charisma",
        manaCost: 2,
        cooldownOwnActions: 1,
        baseDamage: 4,
        multiplier: 1.05,
        accuracyBonus: 0.05,
        critBonus: 0.01,
        monsterDamageReduction: 2
      };
    case "class.kharakternyk":
      return {
        id: "skill.steppe-side-eye",
        damageKind: "trick",
        stat: "luck",
        manaCost: 1,
        cooldownOwnActions: 1,
        baseDamage: 4,
        multiplier: 1.1,
        accuracyBonus: 0.05,
        critBonus: 0.06,
        monsterDamageReduction: 1
      };
    default:
      return carefulStrike;
  }
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
  const skill = getCombatSkillProfile(classId);

  return {
    id: skill.id,
    action: "skill",
    source: "class",
    label: skill.id,
    manaCost: skill.manaCost,
    cooldownOwnActions: skill.cooldownOwnActions,
    primaryTargetScope: "single-enemy",
    tags: ["direct", skill.damageKind]
  };
}

export function getCombatAbilityForAction(
  action: Exclude<CombatActionType, "flee">,
  classId: string | undefined
): CombatAbilityDefinition {
  return action === "skill" ? getClassCombatAbility(classId) : getBasicCombatAbility(action);
}
