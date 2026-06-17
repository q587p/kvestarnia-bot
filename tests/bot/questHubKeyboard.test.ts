import { describe, expect, it } from "vitest";
import { buildQuestHubKeyboard } from "../../src/bot/keyboards/questHubKeyboard";
import type { QuestHubKeyboardInput } from "../../src/bot/keyboards/questHubKeyboard";

describe("quest hub keyboard", () => {
  it("offers the training corner from the active quest hub", () => {
    const keyboard = buildQuestHubKeyboard(makeInput());
    const json = JSON.stringify(keyboard);

    expect(json).toContain("🥊 Бійцівський куток");
    expect(json).toContain("v1:spar:open");
  });

  it("does not add training corner to archive mode", () => {
    const keyboard = buildQuestHubKeyboard(makeInput({ mode: "archive" }));
    const json = JSON.stringify(keyboard);

    expect(json).not.toContain("🥊 Бійцівський куток");
    expect(json).not.toContain("v1:spar:open");
  });
});

function makeInput(overrides: Partial<QuestHubKeyboardInput> = {}): QuestHubKeyboardInput {
  return {
    characterLevel: 3,
    adventure: { state: "already-completed", character: character(), fightAvailable: false },
    fight: {
      state: "persistent-ready",
      character: character(),
      questProgress: {
        wins: 0,
        target: 13,
        completed: false,
        rewardClaimed: false
      }
    },
    yeger: {
      state: "offered",
      character: character(),
      progress: {
        completed: false,
        contractsClosed: 0,
        target: 3,
        rewardClaimed: false
      }
    },
    cellar: { state: "level-retired", character: character(), maxLevel: 3 },
    ...overrides
  };
}

function character() {
  return {
    name: "Мандрівник",
    pronoun: "they" as const,
    pronounLabel: "вони",
    path: "path.sun" as const,
    currentLocationId: null,
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пригодник місцевого значення",
    level: 3,
    xp: 25,
    nextLevelXp: 45,
    xpToNextLevel: 20,
    gold: 7,
    hpCurrent: 22,
    hpMax: 30,
    manaCurrent: 10,
    manaMax: 14,
    stats: {
      strength: 10,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    levelBonus: {
      hpMax: 8,
      manaMax: 4,
      primaryStat: {
        stat: "strength" as const,
        bonus: 2
      }
    }
  };
}
