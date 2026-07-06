import { describe, expect, it } from "vitest";
import { buildRemortKeyboard } from "../../src/bot/keyboards/remortKeyboard";
import { parseRemortCallbackData } from "../../src/bot/callbacks/remortCallbackData";
import type { RemortViewResult } from "../../src/services/remortService";

const token = "0123456789abcdef";

describe("remort keyboard", () => {
  it("paginates remort item choices instead of hiding everything after the first eight", () => {
    const result = readyRemortView(10);

    const firstPage = buttons(buildRemortKeyboard(result));
    expect(firstPage.map((button) => button.text)).toContain("▫️ Манатка 8");
    expect(firstPage.map((button) => button.text)).not.toContain("▫️ Манатка 9");
    expect(firstPage).toContainEqual(expect.objectContaining({ text: "Манатки ➡️" }));

    const secondPage = buttons(buildRemortKeyboard(result, { itemPage: 1 }));
    expect(secondPage.map((button) => button.text)).toContain("▫️ Манатка 9");
    expect(secondPage.map((button) => button.text)).toContain("▫️ Манатка 10");
    expect(secondPage).toContainEqual(expect.objectContaining({ text: "⬅️ Манатки" }));

    const ninthItem = secondPage.find((button) => button.text === "▫️ Манатка 9");
    expect(parseRemortCallbackData(ninthItem?.callback_data)).toEqual({
      ok: true,
      value: { type: "item", token, itemKey: "000000000008", page: 1 }
    });
  });

  it("clamps an out-of-range requested remort item page to the last page", () => {
    const result = readyRemortView(10);

    const text = buttons(buildRemortKeyboard(result, { itemPage: 93 })).map((button) => button.text);

    expect(text).toContain("▫️ Манатка 9");
    expect(text).toContain("2/2");
  });
});

function readyRemortView(itemCount: number): Extract<RemortViewResult, { state: "ready" }> {
  return {
    state: "ready",
    character: {
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
    },
    remortCount: 1,
    memoryRankAfter: 2,
    hpBonusAfter: 23,
    manaBonusAfter: 12,
    statBonusesAfter: [],
    statBonusAfter: null,
    draft: {
      token,
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
    eligibleItems: Array.from({ length: itemCount }, (_, index) => ({
      itemId: `item.test.${index + 1}`,
      itemKey: index.toString(16).padStart(12, "0"),
      name: `Манатка ${index + 1}`,
      quantity: 1,
      selected: false,
      known: true
    })),
    selectedItems: [],
    expiresAt: new Date("2026-06-17T12:00:00Z")
  };
}

function buttons(keyboard: unknown): Array<{ text: string; callback_data: string }> {
  return ((keyboard as { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> }).inline_keyboard ?? [])
    .flat();
}
