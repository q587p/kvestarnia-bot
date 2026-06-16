import { describe, expect, it } from "vitest";
import {
  presentLevelBarterConfirmResult,
  presentLevelBarterOffer,
  presentLevelBarterPreview
} from "../../src/bot/presenters/levelBarterPresenter";
import type {
  LevelBarterPresentedOffer
} from "../../src/services/levelBarterService";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("level barter presenter", () => {
  it("shows item value and wallet value separately", () => {
    const text = presentLevelBarterOffer({
      state: "ready",
      character: character(),
      offer: offer()
    });

    expect(text).toContain("Манаток, які можна віддати");
    expect(text).toContain("👛 У гаманці");
    expect(text).toContain("1000");
  });

  it("shows gold supplement and overpay in preview", () => {
    const text = presentLevelBarterPreview({
      state: "preview",
      character: character(),
      offer: offer({ itemTotalValue: 700, goldSpent: 300, overpay: 0 })
    });

    expect(text).toContain("Манатками: <b>700</b>");
    expect(text).toContain("З гаманця: <b>300</b>");
    expect(text).toContain("Переплата речами: <b>0</b>");
  });

  it("refuses level 13 as battle-only", () => {
    const offerText = presentLevelBarterOffer({
      state: "battle-only-level",
      character: character({ name: "Мармна" }),
      level: 13
    });
    const confirmText = presentLevelBarterConfirmResult({
      state: "battle-only-level",
      level: 13
    });

    expect(offerText).toContain("тринадцятий рівень так не береться");
    expect(confirmText).toContain("тільки боями");
  });

  it("does not leak raw item ids", () => {
    const text = presentLevelBarterPreview({
      state: "preview",
      character: character(),
      offer: offer()
    });

    expect(text).toContain("Пательня переконання");
    expect(text).not.toContain("item.pan-of-persuasion");
  });

  it("explains that gold-only exchange still needs an item", () => {
    const text = presentLevelBarterPreview({
      state: "insufficient",
      character: character({ gold: 1000 }),
      eligibleTotalValue: 0,
      gold: 1000,
      combinedValue: 1000,
      cost: 1000
    });

    expect(text).toContain("хоча б одна оцінена манатка");
  });

  it("shows completed replay without scary stale copy", () => {
    const text = presentLevelBarterConfirmResult({
      state: "replayed",
      character: character({ level: 5, gold: 0 }),
      offer: offer({ itemTotalValue: 25, goldSpent: 975 })
    });

    expect(text).toContain("уже заніс цей обмін у журнал");
    expect(text).toContain("Тепер ви <b>5</b> рівня.");
    expect(text).not.toContain("Порахуємо ще раз");
  });
});

function offer(overrides: Partial<LevelBarterPresentedOffer> = {}): LevelBarterPresentedOffer {
  return {
    token: "abcdef1234567890",
    itemTotalValue: 1000,
    goldSpent: 0,
    selectedTotalValue: 1000,
    overpay: 0,
    levelBefore: 4,
    levelAfter: 5,
    xpCarry: 3,
    xpBefore: 48,
    xpAfter: 73,
    cost: 1000,
    items: [
      {
        itemId: "item.pan-of-persuasion",
        quantity: 1,
        unitGoldValue: 1000,
        totalGoldValue: 1000,
        content: {
          id: "item.pan-of-persuasion",
          name: "Пательня переконання",
          description: "Аргумент із ручкою.",
          rarity: "rare" as const,
          slot: "weapon" as const,
          goldValue: 1000
        }
      }
    ],
    ...overrides
  };
}

function character(overrides: Partial<CharacterSummary> = {}): CharacterSummary {
  return {
    name: "Shannar de Kassal",
    pronoun: "they",
    pronounLabel: "вони",
    path: "boundary",
    raceId: "race.intellectual-orc",
    raceName: "Орк-інтелігент",
    classId: "class.priest",
    className: "Жрець",
    title: "Завідувачі Чужої Полиці",
    level: 4,
    xp: 48,
    nextLevelXp: 70,
    xpToNextLevel: 22,
    gold: 300,
    hpCurrent: 30,
    hpMax: 32,
    manaCurrent: 16,
    manaMax: 16,
    stats: {
      strength: 5,
      dexterity: 5,
      intelligence: 8,
      charisma: 6,
      luck: 5
    },
    levelBonus: {
      hpMax: 12,
      manaMax: 6,
      primaryStat: "intelligence",
      primaryStatBonus: 3
    },
    ...overrides
  };
}
