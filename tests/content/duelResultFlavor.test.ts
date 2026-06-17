import { describe, expect, it } from "vitest";
import { classes } from "../../src/content/classes";
import {
  DUEL_CLASS_FINISHERS,
  DUEL_DRAW_FINISHERS,
  DUEL_LOSER_CLASS_FINISHERS,
  DUEL_LOSER_RACE_FINISHERS,
  DUEL_RACE_FINISHERS,
  DUEL_UNIVERSAL_FINISHERS,
  pickDuelDrawFlavor,
  pickDuelResultFlavor
} from "../../src/content/duelResultFlavor";
import { races } from "../../src/content/races";

describe("duel result flavor", () => {
  it("keeps enough universal, winner-specific and loser-specific duel finishers", () => {
    expect(DUEL_UNIVERSAL_FINISHERS.length).toBeGreaterThanOrEqual(13);
    expect(DUEL_DRAW_FINISHERS.length).toBeGreaterThanOrEqual(8);

    for (const characterClass of classes) {
      expect(DUEL_CLASS_FINISHERS[characterClass.id]?.length).toBeGreaterThanOrEqual(2);
      expect(DUEL_LOSER_CLASS_FINISHERS[characterClass.id]?.length).toBeGreaterThanOrEqual(2);
    }

    for (const race of races) {
      expect(DUEL_RACE_FINISHERS[race.id]?.length).toBeGreaterThanOrEqual(2);
      expect(DUEL_LOSER_RACE_FINISHERS[race.id]?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("picks stable duel result text for the same saved duel", () => {
    const input = {
      result: {
        outcome: "challenger" as const,
        challengerScore: 94,
        targetScore: 81,
        swing: 8,
        flavorKey: "clever-trick"
      },
      winner: {
        name: "Переможець",
        raceId: "race.bisyny",
        classId: "class.bard"
      },
      loser: {
        name: "Переможений",
        raceId: "race.dwarf",
        classId: "class.warrior"
      },
      winnerName: "<b>Переможець</b>",
      loserName: "<b>Переможений</b>"
    };

    expect(pickDuelResultFlavor(input)).toBe(pickDuelResultFlavor(input));
  });

  it("picks stable draw text for the same saved duel", () => {
    const input = {
      result: {
        outcome: "draw" as const,
        challengerScore: 77,
        targetScore: 77,
        swing: 0,
        flavorKey: "dramatic-draw"
      },
      challenger: {
        name: "Перший",
        raceId: "race.human-ish",
        classId: "class.warrior"
      },
      target: {
        name: "Другий",
        raceId: "race.elf",
        classId: "class.mage"
      },
      challengerName: "<b>Перший</b>",
      targetName: "<b>Другий</b>"
    };

    expect(pickDuelDrawFlavor(input)).toBe(pickDuelDrawFlavor(input));
  });
});
