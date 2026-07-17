import { describe, expect, it } from "vitest";
import { presentBarrelBeerTutorialLookup } from "../../src/bot/presenters/barrelBeerTutorialPresenter";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";

describe("barrel beer tutorial presenter", () => {
  it("makes the post-raid beer clue explicit on the active quest card", () => {
    const text = presentBarrelBeerTutorialLookup({
      state: "in-progress",
      character: summarizeCharacter({
        name: "Мандрівник",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 3,
        xp: 25,
        gold: 0,
        hpCurrent: 20,
        hpMax: 20,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: {}
      }),
      progress: {
        accepted: true,
        stipendGranted: true,
        visitedBarrel: true,
        raidCompleted: true,
        beerRoundOffered: false,
        beerDrunk: false,
        activeBeer: false,
        currentLocationId: "location.korchma.barrel"
      }
    });

    expect(text).toContain("вистав пиво всім, випий своє");
    expect(text).toContain("Рейд позаду. Тепер вистав пиво всім і випий своє.");
    expect(text).not.toContain("проведи пінну формальність");
  });
});
