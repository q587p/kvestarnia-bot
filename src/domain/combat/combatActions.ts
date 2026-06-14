import type { StatKey } from "../characters/starterStats";
import type { CombatDamageKind } from "./combatState";

export interface CombatSkillProfile {
  id: string;
  damageKind: CombatDamageKind;
  stat: StatKey;
  manaCost: number;
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
        baseDamage: 4,
        multiplier: 1.1,
        accuracyBonus: 0.08,
        critBonus: 0,
        monsterDamageReduction: 1
      };
    case "class.bard":
      return {
        id: "skill-dangerous-couplet",
        damageKind: "social",
        stat: "charisma",
        manaCost: 2,
        baseDamage: 3,
        multiplier: 1,
        accuracyBonus: 0.08,
        critBonus: 0.03,
        monsterDamageReduction: 1
      };
    case "class.rogue":
    case "class.ranger":
      return {
        id: "skill-trick-shot",
        damageKind: "trick",
        stat: "dexterity",
        manaCost: 0,
        baseDamage: 4,
        multiplier: 1.15,
        accuracyBonus: 0.06,
        critBonus: 0.08,
        monsterDamageReduction: 0
      };
    case "class.priest":
      return {
        id: "skill-strict-blessing",
        damageKind: "spell",
        stat: "charisma",
        manaCost: 2,
        baseDamage: 4,
        multiplier: 1.05,
        accuracyBonus: 0.05,
        critBonus: 0.01,
        monsterDamageReduction: 2
      };
    case "class.kharakternyk":
      return {
        id: "skill-steppe-side-eye",
        damageKind: "trick",
        stat: "luck",
        manaCost: 1,
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
