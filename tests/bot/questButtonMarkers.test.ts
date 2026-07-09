import { describe, expect, it } from "vitest";
import {
  QuestMarker,
  decorateButtonLabel,
  mergeQuestMarkers,
  resolveQuestMarkerForTarget,
  stripQuestMarkerSuffix
} from "../../src/bot/keyboards/questButtonMarkers";

describe("quest button markers", () => {
  it("decorates labels with passive quest suffixes", () => {
    expect(decorateButtonLabel("💚 Цілитель", QuestMarker.CAN_ACCEPT)).toBe("💚 Цілитель ⚠️");
    expect(decorateButtonLabel("💚 Цілитель", QuestMarker.CAN_TURN_IN)).toBe("💚 Цілитель ✅");
    expect(decorateButtonLabel("💚 Цілитель", QuestMarker.NONE)).toBe("💚 Цілитель");
  });

  it("strips suffix markers for reply keyboard routing", () => {
    expect(stripQuestMarkerSuffix("📌 🍺 Таверна ✅")).toBe("📌 🍺 Таверна");
    expect(stripQuestMarkerSuffix("📌 🍺 Таверна ⚠️")).toBe("📌 🍺 Таверна");
    expect(stripQuestMarkerSuffix("📌 🍺 Таверна 📜")).toBe("📌 🍺 Таверна");
    expect(stripQuestMarkerSuffix("📌 🍺 Таверна")).toBe("📌 🍺 Таверна");
  });

  it("lets turn-in override accept when parent paths merge child markers", () => {
    expect(mergeQuestMarkers([QuestMarker.CAN_ACCEPT, QuestMarker.CAN_TURN_IN])).toBe(
      QuestMarker.CAN_TURN_IN
    );
  });

  it("marks available quest targets and completed turn-in targets", () => {
    expect(
      resolveQuestMarkerForTarget(
        {
          characterLevel: 4,
          yeger: { state: "offered", character: character(), progress: { wins: 0, target: 5 } }
        },
        "quest.yeger"
      )
    ).toBe(QuestMarker.CAN_ACCEPT);

    expect(
      resolveQuestMarkerForTarget(
        {
          characterLevel: 4,
          yeger: { state: "turn-in-ready", character: character(), progress: { wins: 5, target: 5 } }
        },
        "quest.yeger"
      )
    ).toBe(QuestMarker.CAN_TURN_IN);
  });

  it("propagates the strongest child marker to the hall parent", () => {
    expect(
      resolveQuestMarkerForTarget(
        {
          characterLevel: 4,
          yeger: { state: "offered", character: character(), progress: { wins: 0, target: 5 } },
          cellarGrownup: { state: "bottle-obtained", character: character(), bottleQuantity: 1 }
        },
        "location.korchma.hall"
      )
    ).toBe(QuestMarker.CAN_TURN_IN);
  });

  it("marks the first Korchma route until the quest table is reached", () => {
    const input = {
      characterLevel: 1,
      firstKorchmaQuest: {
        state: "active" as const,
        character: character(),
        progress: {
          enteredKorchma: false,
          reachedQuestTable: false,
          currentLocationId: "location.korchma.front"
        }
      }
    };

    expect(resolveQuestMarkerForTarget(input, "quest.first-korchma")).toBe(QuestMarker.CAN_ACCEPT);
    expect(resolveQuestMarkerForTarget(input, "menu.quest")).toBe(QuestMarker.CAN_ACCEPT);
    expect(resolveQuestMarkerForTarget(input, "location.korchma.quest-table")).toBe(QuestMarker.CAN_ACCEPT);
    expect(resolveQuestMarkerForTarget(input, "location.korchma.hall")).toBe(QuestMarker.CAN_ACCEPT);
    expect(
      resolveQuestMarkerForTarget(
        {
          ...input,
          firstKorchmaQuest: {
            ...input.firstKorchmaQuest,
            state: "completed" as const,
            reward: { xp: 1, gold: 0 }
          }
        },
        "quest.first-korchma"
      )
    ).toBe(QuestMarker.NONE);
  });

  it("marks the barrel only when the Yeger quest is offered there", () => {
    expect(
      resolveQuestMarkerForTarget(
        {
          characterLevel: 4,
          yeger: { state: "offered", character: character(), progress: { wins: 0, target: 5 } }
        },
        "location.korchma.barrel"
      )
    ).toBe(QuestMarker.CAN_ACCEPT);

    expect(
      resolveQuestMarkerForTarget(
        {
          characterLevel: 4,
          yeger: { state: "turn-in-ready", character: character(), progress: { wins: 5, target: 5 } }
        },
        "location.korchma.barrel"
      )
    ).toBe(QuestMarker.NONE);
  });

  it("does not mark unavailable or locked quests as acceptable", () => {
    expect(
      resolveQuestMarkerForTarget(
        {
          characterLevel: 2,
          yeger: { state: "level-locked", character: character(), requiredLevel: 4 }
        },
        "quest.yeger"
      )
    ).toBe(QuestMarker.NONE);
  });

  it("marks Charkokovalnia unlock across the table and yard paths only while unlock is pending", () => {
    const pendingInput = {
      characterLevel: 5,
      itemUpgrades: {
        state: "unlock-required" as const,
        character: character(),
        fieldKitQuantity: 1,
        rewardXp: 13
      }
    };

    expect(resolveQuestMarkerForTarget(pendingInput, "quest.charkokovalnia")).toBe(QuestMarker.CAN_ACCEPT);
    expect(resolveQuestMarkerForTarget(pendingInput, "location.korchma.yard")).toBe(QuestMarker.CAN_ACCEPT);
    expect(resolveQuestMarkerForTarget(pendingInput, "location.korchma.quest-table")).toBe(QuestMarker.CAN_ACCEPT);
    expect(resolveQuestMarkerForTarget(pendingInput, "location.korchma.hall")).toBe(QuestMarker.CAN_ACCEPT);

    const unlockedInput = {
      ...pendingInput,
      itemUpgrades: {
        state: "ready" as const,
        character: character()
      }
    };

    expect(resolveQuestMarkerForTarget(unlockedInput, "quest.charkokovalnia")).toBe(QuestMarker.NONE);
    expect(resolveQuestMarkerForTarget(unlockedInput, "location.korchma.yard")).toBe(QuestMarker.NONE);
    expect(resolveQuestMarkerForTarget(unlockedInput, "location.korchma.quest-table")).toBe(QuestMarker.NONE);
  });
});

function character() {
  return {
    name: "Мандрівник",
    pronoun: "they" as const,
    pronounLabel: "вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пригодник місцевого значення",
    level: 4,
    xp: 70,
    nextLevelXp: 110,
    xpToNextLevel: 40,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    stats: {
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      primaryStat: {
        stat: "strength" as const,
        bonus: 0
      }
    }
  };
}
