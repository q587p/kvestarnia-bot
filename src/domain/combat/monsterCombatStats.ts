import type { MonsterContent } from "../../content/schema";
import type { MonsterCombatStats } from "./combatState";

export function deriveMonsterCombatStats(monster: MonsterContent): MonsterCombatStats {
  const tags = [...monster.tags];
  const level = Math.max(1, Math.floor(monster.level));

  return {
    monsterId: monster.id,
    level,
    hpMax: 10 + level * 6 + tagHpBonus(tags),
    attack: 2 + level * 2 + tagAttackBonus(tags),
    armor: Math.floor(level / 2) + tagArmorBonus(tags),
    resist: Math.floor(level / 3) + tagResistBonus(tags),
    dexterity: 5 + level + tagDexterityBonus(tags),
    tags
  };
}

function tagHpBonus(tags: string[]): number {
  let bonus = 0;

  if (tags.includes("boss")) {
    bonus += 12;
  }

  if (tags.includes("mini-boss") || tags.includes("tiny-boss")) {
    bonus += 4;
  }

  if (tags.includes("swarm")) {
    bonus += 3;
  }

  return bonus;
}

function tagAttackBonus(tags: string[]): number {
  let bonus = 0;

  if (tags.includes("dragon") || tags.includes("fire")) {
    bonus += 2;
  }

  if (tags.includes("boss") || tags.includes("mini-boss")) {
    bonus += 1;
  }

  return bonus;
}

function tagArmorBonus(tags: string[]): number {
  return countMatching(tags, ["armor", "stone", "construct", "knight"]);
}

function tagResistBonus(tags: string[]): number {
  return countMatching(tags, ["ghost", "undead", "cursed", "mind"]);
}

function tagDexterityBonus(tags: string[]): number {
  return countMatching(tags, ["beast", "insect", "mobility", "trickster"]);
}

function countMatching(tags: string[], needles: string[]): number {
  return needles.reduce((total, needle) => total + (tags.includes(needle) ? 1 : 0), 0);
}
