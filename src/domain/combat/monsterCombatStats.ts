import type { MonsterContent } from "../../content/schema";
import type { MonsterCombatStats } from "./combatState";

export function deriveMonsterCombatStats(monster: MonsterContent): MonsterCombatStats {
  const tags = [...monster.tags];
  const level = Math.max(1, Math.floor(monster.level));
  const highTierLevel = Math.max(0, level - 4);
  const lateTierLevel = Math.max(0, level - 7);

  return {
    monsterId: monster.id,
    name: monster.name,
    level,
    hpMax: 10 + level * 4 + highTierLevel * 2 + lateTierLevel + tagHpBonus(tags),
    attack: 2 + level + Math.floor(level / 2) + Math.floor(highTierLevel / 2) + tagAttackBonus(tags),
    armor: Math.floor(level / 3) + Math.floor(highTierLevel / 4) + tagArmorBonus(tags),
    resist: Math.floor(level / 3) + Math.floor(highTierLevel / 4) + tagResistBonus(tags),
    dexterity:
      5 + level + Math.floor(highTierLevel / 3) + tagDexterityBonus(tags),
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

  if (tags.includes("boss")) {
    bonus += 2;
  }

  if (tags.includes("mini-boss") || tags.includes("tiny-boss")) {
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
