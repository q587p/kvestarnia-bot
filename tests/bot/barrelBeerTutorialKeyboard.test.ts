import { describe, expect, it } from "vitest";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { buildBarrelBeerTutorialKeyboard } from "../../src/bot/keyboards/barrelBeerTutorialKeyboard";

describe("barrel beer tutorial keyboard", () => {
  it("marks the direct Barrel route after accepting the tutorial quest", () => {
    const keyboard = buildBarrelBeerTutorialKeyboard({
      state: "accepted",
      character: character(),
      progress: barrelBeerTutorialProgress({
        accepted: true,
        stipendGranted: true
      }),
      stipendGold: 39
    }).inline_keyboard;

    expect(keyboard[0]).toEqual([
      {
        text: "🛢️ До Бочки ⚠️",
        callback_data: makePlaceCallbackData("barrel")
      }
    ]);
    expect(keyboard[1]).toEqual([
      {
        text: "📋 До справ",
        callback_data: makeQuestCallbackData("list")
      }
    ]);
  });
});

function barrelBeerTutorialProgress(
  overrides: Partial<Parameters<typeof buildBarrelBeerTutorialKeyboard>[0]["progress"]> = {}
) {
  return {
    accepted: false,
    stipendGranted: false,
    visitedBarrel: false,
    raidCompleted: false,
    beerRoundOffered: false,
    beerDrunk: false,
    activeBeer: false,
    currentLocationId: "location.korchma.quest-table",
    ...overrides
  };
}

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
    level: 3,
    xp: 25,
    nextLevelXp: 45,
    xpToNextLevel: 20,
    gold: 39,
    hpCurrent: 28,
    hpMax: 28,
    manaCurrent: 14,
    manaMax: 14,
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
