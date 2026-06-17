import { describe, expect, it } from "vitest";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import {
  buildTrainingDoppelgangerCombatStats,
  getTrainingDoppelgangerRecoveryMs,
  rollTrainingDoppelgangerXpReward,
  TRAINING_DOPPELGANGER_MONSTER_ID
} from "../../src/domain/trainingDoppelganger";
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

function buildCharacter(overrides: { level?: number; luck?: number } = {}) {
  return summarizeCharacter({
    name: "Мандрівник",
    pronoun: "they",
    path: "path.sun",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: overrides.level ?? 3,
    xp: 25,
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
  });
}
