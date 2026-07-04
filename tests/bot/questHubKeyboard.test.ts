import { describe, expect, it } from "vitest";
import { buildQuestHubKeyboard } from "../../src/bot/keyboards/questHubKeyboard";
import type { QuestHubKeyboardInput } from "../../src/bot/keyboards/questHubKeyboard";
import { makeYegerTurnInCallbackData } from "../../src/bot/callbacks/yegerCallbackData";

describe("quest hub keyboard", () => {
  it("does not offer the fighting corner shortcut from the active quest hub", () => {
    const keyboard = buildQuestHubKeyboard(makeInput());
    const json = JSON.stringify(keyboard);

    expect(json).not.toContain("🥊 До Бійцівського кутка");
    expect(json).not.toContain("v1:place:fighting-corner");
    expect(json).not.toContain("v1:spar:open");
    expect(json).not.toContain("v1:duel:new");
  });

  it("hides the fighting corner before level three", () => {
    const keyboard = buildQuestHubKeyboard(makeInput({ characterLevel: 2 }));
    const json = JSON.stringify(keyboard);

    expect(json).not.toContain("🥊 До Бійцівського кутка");
    expect(json).not.toContain("v1:place:fighting-corner");
  });

  it("does not add training corner to archive mode", () => {
    const keyboard = buildQuestHubKeyboard(makeInput({ mode: "archive" }));
    const json = JSON.stringify(keyboard);

    expect(json).not.toContain("🥊 До Бійцівського кутка");
    expect(json).not.toContain("v1:place:fighting-corner");
    expect(json).not.toContain("v1:spar:open");
  });

  it("routes ready Korchmar turn-ins to the Shynok", () => {
    const keyboard = buildQuestHubKeyboard(
      makeInput({
        fight: {
          state: "persistent-ready",
          character: character(),
          questProgress: completedProblemQuestProgress()
        },
        problemQuest: completedProblemQuestProgress()
      })
    );
    const json = JSON.stringify(keyboard);

    expect(json).toContain("🍻 До шинку");
    expect(json).toContain("v1:place:bar");
    expect(json).not.toContain("v1:quest:problem");
  });

  it("keeps daily Korchma round turn-in as a quest table claim", () => {
    const keyboard = buildQuestHubKeyboard(
      makeInput({
        currentLocationId: "location.korchma.quest_table",
        dailyKorchmaRound: {
          state: "turn-in-ready",
          character: character(),
          offer: {
            dayKey: "2026-06-28",
            dayToken: "20260628",
            lifeToken: 7,
            requiredSteps: 2,
            completedSceneIds: ["scene.cellar.inventory-bottle", "scene.yeger.map-sneeze"],
            omittedSceneId: "scene.yard.rope",
            scenes: [
              {
                id: "scene.cellar.inventory-bottle",
                icon: "🍾",
                title: "Пляшка шепоче інвентаризацію",
                locationId: "location.korchma.cellar",
                hook: "У льосі пляшка шепоче номери.",
                actions: []
              },
              {
                id: "scene.yeger.map-sneeze",
                icon: "🗺️",
                title: "Мапа чхнула не в той бік",
                locationId: "location.korchma.yeger-corner",
                hook: "У єгерському кутку мапа має думку.",
                actions: []
              },
              {
                id: "scene.yard.rope",
                icon: "🪢",
                title: "Мотузка зав’язала питання",
                locationId: "location.korchma.yard",
                hook: "У задвірку мотузка має думку.",
                actions: []
              }
            ]
          }
        }
      })
    );
    const json = JSON.stringify(keyboard);

    expect(json).toContain("🧾 Здати обхід");
    expect(json).toContain("v1:dkr:c:20260628:7");
    expect(json).toContain("🍺 До зали");
    expect(json).toContain("v1:place:hall");
  });

  it("routes ready Yeger boards straight to turn-in from the quest table", () => {
    const keyboard = buildQuestHubKeyboard(
      makeInput({
        yeger: {
          state: "turn-in-ready",
          character: character(),
          progress: {
            completed: false,
            wins: 5,
            target: 5,
            rewardClaimed: false
          }
        }
      })
    );
    const json = JSON.stringify(keyboard);

    expect(json).toContain("🏹 Здати Єгерю");
    expect(json).toContain(makeYegerTurnInCallbackData());
    expect(json).not.toContain("v1:tavern:ranger");
  });

  it("offers an untaken daily Korchma round without an existing offer token", () => {
    const keyboard = buildQuestHubKeyboard(
      makeInput({
        currentLocationId: "location.korchma.quest_table",
        dailyKorchmaRound: {
          state: "not-issued",
          character: character(),
          dayToken: "20260628"
        }
      })
    );
    const json = JSON.stringify(keyboard);

    expect(json).toContain("🧾 Корчмарський обхід");
    expect(json).toContain("v1:dkr:o:20260628");
    expect(json).toContain("🍺 До зали");
    expect(json).toContain("v1:place:hall");
  });

  it("keeps the back-to-hall route from other Korchma locations", () => {
    const keyboard = buildQuestHubKeyboard(
      makeInput({
        currentLocationId: "location.korchma.bar"
      })
    );
    const json = JSON.stringify(keyboard);

    expect(json).toContain("🍺 До зали");
    expect(json).toContain("v1:place:hall");
  });

  it("keeps the hall return unmarked from the quest table when only table quests are ready", () => {
    const keyboard = buildQuestHubKeyboard(
      makeInput({
        currentLocationId: "location.korchma.quest_table",
        adventure: { state: "ready", character: character() },
        fight: { state: "level-retired", character: character(), maxLevel: 13, completed: true },
        problemQuest: {
          ...problemQuestProgress(),
          branchComplete: true,
          completed: true,
          rewardClaimed: true
        },
        yeger: {
          state: "completed",
          character: character(),
          progress: {
            completed: true,
            contractsClosed: 5,
            target: 5,
            rewardClaimed: true
          }
        },
        cellar: { state: "level-retired", character: character(), maxLevel: 3, completed: true }
      })
    );
    const json = JSON.stringify(keyboard);

    expect(json).toContain("🪧 Обрати пригоду ⚠️");
    expect(json).toContain("🍺 До зали");
    expect(json).toContain("v1:place:hall");
    expect(json).not.toContain("🍺 До зали ⚠️");
  });

  it("marks the back-to-hall route when hall child locations have available quests", () => {
    const keyboard = buildQuestHubKeyboard(
      makeInput({
        adventure: { state: "already-completed", character: character(), fightAvailable: false },
        fight: {
          state: "persistent-ready",
          character: character(),
          questProgress: completedProblemQuestProgress()
        },
        problemQuest: completedProblemQuestProgress(),
        yeger: {
          state: "completed",
          character: character(),
          progress: {
            completed: true,
            contractsClosed: 5,
            target: 5,
            rewardClaimed: true
          }
        },
        cellar: { state: "ready", character: character(), completed: false }
      })
    );
    const json = JSON.stringify(keyboard);

    expect(json).toContain("🍻 До шинку ✅");
    expect(json).toContain("🧹 У льох ⚠️");
    expect(json).toContain("🍺 До зали ✅");
  });
});

function makeInput(overrides: Partial<QuestHubKeyboardInput> = {}): QuestHubKeyboardInput {
  return {
    characterLevel: 3,
    adventure: { state: "already-completed", character: character(), fightAvailable: false },
    fight: {
      state: "persistent-ready",
      character: character(),
      questProgress: problemQuestProgress()
    },
    problemQuest: problemQuestProgress(),
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
    cellar: { state: "level-retired", character: character(), maxLevel: 3, completed: false },
    ...overrides
  };
}

function problemQuestProgress() {
  return {
    stageId: "13" as const,
    title: "Тринадцять дрібних проблем",
    wins: 0,
    target: 13,
    completed: false,
    rewardClaimed: false,
    issued: true,
    branchComplete: false
  };
}

function completedProblemQuestProgress() {
  return {
    stageId: "23" as const,
    title: "Двадцять три підозрілі проблеми",
    wins: 23,
    target: 23,
    completed: true,
    rewardClaimed: false,
    issued: true,
    branchComplete: false
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
