import type { MonsterContent } from "../../content/schema";
import type { MonsterCombatStats } from "./combatState";

export function deriveMonsterCombatStats(monster: MonsterContent): MonsterCombatStats {
  const tags = [...monster.tags];
  const level = Math.max(1, Math.floor(monster.level));
  const highTierLevel = Math.max(0, level - 4);
  const thresholdBoost = highTierLevel > 0 ? 1 : 0;

  return {
    monsterId: monster.id,
    level,
    hpMax:
      10 +
      level * 6 +
      highTierLevel * (8 + Math.floor(level / 2)) +
      thresholdBoost * 8 +
      tagHpBonus(tags),
    attack:
      2 +
      level * 2 +
      highTierLevel * 3 +
      Math.floor(highTierLevel / 2) +
      thresholdBoost * 2 +
      tagAttackBonus(tags),
    armor:
      Math.floor(level / 2) + Math.floor(highTierLevel / 2) + thresholdBoost + tagArmorBonus(tags),
    resist:
      Math.floor(level / 3) + Math.floor(highTierLevel / 2) + thresholdBoost + tagResistBonus(tags),
    dexterity:
      5 + level + Math.floor(highTierLevel / 2) + thresholdBoost + tagDexterityBonus(tags),
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
