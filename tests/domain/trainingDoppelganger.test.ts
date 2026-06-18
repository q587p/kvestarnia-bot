import { describe, expect, it } from "vitest";
import type { ItemContent } from "../../src/content/schema";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import {
  buildTrainingDoppelgangerCombatStats,
  buildTrainingDoppelgangerCombatStatsFromState,
  buildTrainingDoppelgangerSpawn,
  getTrainingDoppelgangerRecoveryMs,
  rollTrainingDoppelgangerXpReward,
  TRAINING_DOPPELGANGER_MONSTER_ID
} from "../../src/domain/trainingDoppelganger";
import { startCombat } from "../../src/domain/combat";
import { FakeRandomSource } from "../../src/shared/random";

describe("training doppelganger domain", () => {
  it("builds a combat enemy from the current hero summary", () => {
    const character = buildCharacter();
    const stats = buildTrainingDoppelgangerCombatStats(character);

    expect(stats).toMatchObject({
      monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
      level: character.level,
      hpMax: character.hpMax,
      tags: ["training", "doppelganger"]
    });
    expect(stats.attack).toBeGreaterThan(0);
    expect(stats.dexterity).toBeGreaterThanOrEqual(character.stats.dexterity);
  });

  it("copies equipped passive effects into an ephemeral combat summary", () => {
    const weapon = {
      id: "item.test-copy-sword",
      name: "Тестовий меч віддзеркалення",
      description: "Тільки для unit-тесту.",
      rarity: "common" as const,
      slot: "weapon" as const,
      goldValue: 1,
      effect: {
        weaponDamage: 3
      }
    };
    const character = buildCharacter({ equippedItems: [weapon] });
    const spawn = buildTrainingDoppelgangerSpawn(character, {
      equippedItems: [weapon],
      spawnConfig: { mode: "COPY_TARGET" }
    });

    expect(spawn.mode).toBe("COPY_TARGET");
    expect(spawn.monster.attack).toBe(buildTrainingDoppelgangerCombatStats(buildCharacter()).attack + 3);
    expect(spawn.monster.copiedEquipment).toEqual([
      {
        sourceItemId: "item.test-copy-sword",
        name: "Тестовий меч віддзеркалення",
        slot: "weapon",
        effectKeys: ["weaponDamage"]
      }
    ]);
    expect(spawn.monster.debugTrace).toMatchObject({
      spawnMode: "COPY_TARGET",
      source: "target",
      copiedEquipmentCount: 1,
      appliedEffectKeys: ["weaponDamage"]
    });
  });

  it("builds a valid random-build doppelganger without persistent items", () => {
    const source = buildCharacter({ level: 6, xp: 300 });
    const spawn = buildTrainingDoppelgangerSpawn(source, {
      rng: new FakeRandomSource([0.1, 0.2, 0.3, 0.4]),
      spawnConfig: { mode: "RANDOM_BUILD" }
    });

    expect(spawn.mode).toBe("RANDOM_BUILD");
    expect(spawn.character.level).toBe(source.level);
    expect(spawn.character.raceId).toMatch(/^race\./);
    expect(spawn.character.classId).toMatch(/^class\./);
    expect(spawn.monster.debugTrace).toMatchObject({
      spawnMode: "RANDOM_BUILD",
      source: "random-build"
    });
    expect(spawn.monster.copiedEquipment?.length ?? 0).toBeGreaterThan(0);
  });

  it("preserves ephemeral champion source metadata in combat state", () => {
    const champion = buildCharacter({ name: "Боривітер", classId: "class.bard" });
    const spawn = buildTrainingDoppelgangerSpawn(champion, {
      spawnConfig: { mode: "COPY_CHAMPION_WEEK" }
    });

    expect(spawn.mode).toBe("COPY_TARGET");
    expect(spawn.monster.classId).toBe("class.bard");
    expect(spawn.monster.debugTrace).toMatchObject({
      spawnMode: "COPY_CHAMPION_WEEK",
      source: "champion-fallback",
      championPeriod: "week",
      championName: "Боривітер"
    });
  });

  it("restores combat stats from the stored doppelganger state snapshot", () => {
    const source = buildCharacter();
    const spawn = buildTrainingDoppelgangerSpawn(source, {
      rng: new FakeRandomSource([0.1, 0.2, 0.3, 0.4]),
      spawnConfig: { mode: "RANDOM_BUILD" }
    });
    const state = startCombat({
      id: "session-1",
      hero: {
        level: source.level,
        hpMax: source.hpMax,
        manaMax: source.manaMax,
        hpCurrent: source.hpCurrent,
        manaCurrent: source.manaCurrent,
        classId: source.classId,
        ...source.stats
      },
      monster: spawn.monster
    });

    expect(buildTrainingDoppelgangerCombatStatsFromState(state, source)).toMatchObject({
      monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
      attack: spawn.monster.attack,
      armor: spawn.monster.armor,
      resist: spawn.monster.resist,
      classId: spawn.monster.classId,
      raceId: spawn.monster.raceId
    });
  });

  it("grants level-scaled XP without gold for training outcomes", () => {
    const character = buildCharacter({ level: 13, luck: 20 });
    const won = rollTrainingDoppelgangerXpReward(character, "won", new FakeRandomSource([0, 0, 0]));
    const lost = rollTrainingDoppelgangerXpReward(character, "lost", new FakeRandomSource([0, 0, 0]));

    expect(won).toEqual({ xp: 17, gold: 0 });
    expect(lost).toEqual({ xp: 1, gold: 0 });
  });

  it("scales recovery cooldown from the doppelganger's missing HP", () => {
    const character = buildCharacter();
    const scratched = getTrainingDoppelgangerRecoveryMs({
      character,
      doppelgangerHp: 20,
      doppelgangerHpMax: 22
    });
    const defeated = getTrainingDoppelgangerRecoveryMs({
      character,
      doppelgangerHp: 0,
      doppelgangerHpMax: 22
    });

    expect(scratched).toBeGreaterThanOrEqual(60_000);
    expect(defeated).toBeGreaterThan(scratched);
  });
});

function buildCharacter(
  overrides: {
    level?: number;
    xp?: number;
    luck?: number;
    name?: string;
    classId?: string;
    equippedItems?: ItemContent[];
  } = {}
) {
  return summarizeCharacter(
    {
      name: overrides.name ?? "Мандрівник",
      pronoun: "they",
      path: "path.sun",
      raceId: "race.human-ish",
      classId: overrides.classId ?? "class.warrior",
      level: overrides.level ?? 3,
      xp: overrides.xp ?? 25,
      gold: 0,
      hpCurrent: 22,
      hpMax: 22,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: {
        strength: 8,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: overrides.luck ?? 6
      }
    },
    { equippedItems: overrides.equippedItems ?? [] }
  );
}
