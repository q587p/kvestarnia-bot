import { describe, expect, it } from "vitest";
import {
  presentBarrelBeerTutorialLookup,
  presentBarrelBeerTutorialTurnIn
} from "../../src/bot/presenters/barrelBeerTutorialPresenter";
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

  it("presents the tutorial ring as an item grant after the reward amount", () => {
    const text = presentBarrelBeerTutorialTurnIn({
      state: "completed",
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
        beerRoundOffered: true,
        beerDrunk: true,
        activeBeer: true,
        currentLocationId: "location.korchma.quest-table"
      },
      reward: {
        xp: 8,
        gold: 0,
        itemGrants: [{
          itemId: "item.persten-pyvovladdia",
          name: "Перстень Пивовладдя",
          quantity: 1
        }]
      },
      levelChange: null,
      achievementUnlocks: []
    });

    expect(text).toContain([
      "<i>Отримано:</i>",
      "+8 XP",
      "",
      "Здобуто: <i>Перстень Пивовладдя</i>"
    ].join("\n"));
    expect(text).not.toContain("+1 Перстень Пивовладдя");
  });
});
