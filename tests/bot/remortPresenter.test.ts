import { describe, expect, it } from "vitest";
import {
  presentRemort,
  presentRemortConfirm
} from "../../src/bot/presenters/remortPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type {
  RemortConfirmResult,
  RemortViewResult
} from "../../src/services/remortService";

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  currentLocationId: "location.korchma.hall",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 13,
  xp: 1300,
  nextLevelXp: null,
  xpToNextLevel: null,
  gold: 42,
  hpCurrent: 40,
  hpMax: 40,
  manaCurrent: 20,
  manaMax: 20,
  stats: {
    strength: 12,
    dexterity: 8,
    intelligence: 8,
    charisma: 8,
    luck: 8
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: null
  },
  remortCount: 1,
  remortMemoryRank: 1
};

describe("remort presenter", () => {
  it("shows remort preview memory without a public x/5 cap", () => {
    const text = presentRemort({
      state: "ready",
      character,
      remortCount: 1,
      memoryRankAfter: 2,
      draft: {
        token: "0123456789abcdef",
        identity: {
          pronoun: "they",
          raceId: "race.human-ish",
          classId: "class.warrior"
        },
        selectedItems: [],
        expiresAt: new Date("2026-06-17T12:00:00Z")
      },
      identity: {
        pronoun: "they",
        pronounLabel: "Вони",
        raceId: "race.human-ish",
        raceKey: "human-ish",
        raceName: "Людисько",
        classId: "class.warrior",
        classKey: "warrior",
        className: "Воїн"
      },
      eligibleItems: [],
      selectedItems: [],
      expiresAt: new Date("2026-06-17T12:00:00Z")
    } satisfies RemortViewResult);

    expect(text).toContain("Памʼять минулих пригод додасть <b>+4 HP</b>");
    expect(text).not.toContain("2</b>/5");
  });

  it("shows completed remort memory without a public x/5 cap", () => {
    const text = presentRemortConfirm({
      state: "completed",
      character,
      remortNumber: 3,
      memoryRank: 3,
      hpBonus: 6,
      manaBonus: 3,
      preservedItems: [],
      previousLevel: 13
    } satisfies RemortConfirmResult);

    expect(text).toContain("Реморт: <b>3</b> · Памʼять минулих пригод лишилася з вами.");
    expect(text).toContain("Спомин дав: <b>+6 HP</b> · <b>+3 мани</b>.");
    expect(text).not.toContain("3</b>/5");
  });
});
