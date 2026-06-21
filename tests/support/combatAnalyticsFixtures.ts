import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { MonsterCombatStats } from "../../src/domain/combat";

export function makeCharacter(): CharacterSummary {
  return {
    name: "Shannar",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Доцент Прикладного Туману",
    level: 12,
    xp: 0,
    nextLevelXp: 100,
    xpToNextLevel: 100,
    gold: 0,
    hpCurrent: 40,
    hpMax: 40,
    manaCurrent: 10,
    manaMax: 10,
    stats: {
      strength: 10,
      dexterity: 7,
      intelligence: 5,
      charisma: 6,
      luck: 4
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      stats: {
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      }
    },
    equipmentEffects: {
      hpMax: 0,
      manaMax: 0,
      armor: 1,
      resist: 0,
      weaponDamage: 2,
      spellPower: 0,
      stats: {
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      },
      contributions: []
    },
    remortCount: 2
  };
}

export function makeMonster(): MonsterCombatStats {
  return {
    monsterId: "monster.rat",
    level: 10,
    hpMax: 20,
    attack: 5,
    armor: 0,
    resist: 0,
    dexterity: 5,
    tags: ["beast"]
  };
}
