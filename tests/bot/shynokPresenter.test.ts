import { describe, expect, it, vi } from "vitest";
import {
  presentShynokGate,
  presentShynokOverview,
  presentShynokDrinkMenu,
  presentShynokDrinkPreview,
  presentShynokDrinkConfirmResult,
  presentShynokRoundConfirm,
  presentShynokRoundOfferNotification,
  presentShynokRoundOfferResponse,
  presentShynokRoundPreview,
  presentShynokSaleSelection,
  presentBardPerformanceAudienceNotification,
  presentBardPerformanceResponseResult,
  presentBardPerformanceStartResult
} from "../../src/bot/presenters/shynokPresenter";
import type {
  ShynokDrinkConfirmResult,
  ShynokDrinkOrderResult,
  ShynokOverviewResult,
  ShynokRoundConfirmResult,
  ShynokRoundOfferRespondResult,
  ShynokRoundPreviewResult,
  ShynokSaleSelectionResult
} from "../../src/services/shynokService";
import type {
  BardPerformanceRespondResult,
  BardPerformanceStartResult,
  PresentedBardPerformance,
  PresentedBardPerformanceReaction
} from "../../src/services/bardPerformanceService";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import type { KorchmaRoundLeaderboard } from "../../src/db/repositories/korchmaRoundPurchaseRepository";

describe("shynokPresenter", () => {
  const character = summarizeCharacter({
    name: "Дара",
    pronoun: "she",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 13,
    gold: 125,
    hpCurrent: 20,
    hpMax: 24,
    manaCurrent: 8,
    manaMax: 10,
    statsJson: {}
  });

  const leaderboard: KorchmaRoundLeaderboard = {
    day: [{ characterId: "character-2", name: "Мандрівник <&>", roundCount: 2, spentGold: 84 }],
    week: [{ characterId: "character-1", name: "Дара", roundCount: 1, spentGold: 42 }],
    month: []
  };

  it("uses short barrel-raid gate text", () => {
    expect(presentShynokGate({ state: "pending-raid" })).toBe(
      "🍻 Корчмар ховає кухоль. Спершу завершіть рейд на Бочку в цьому відтинку."
    );
  });

  it("explains that wrong-place Shynok actions wait at the bar", () => {
    const html = presentShynokGate({ state: "wrong-place" });

    expect(html).toContain("Кухоль чекає в Шинку");
    expect(html).toContain("дасть випити");
    expect(html).not.toContain("несвіжий");
  });

  it("omits character identity headers from the shynok overview", () => {
    const result: ShynokOverviewResult = {
      state: "ready",
      character: {
        ...character,
        name: "<b>Дара</b>",
        title: "<i>Шинкова Тестерка</i>"
      },
      activeDrink: null,
      openRoundOffers: []
    };
    const html = presentShynokOverview(result);

    expect(html).toMatch(/^🍻 Шинок\n\n/u);
    expect(html).not.toContain("&lt;b&gt;Дара&lt;/b&gt;");
    expect(html).not.toContain("&lt;i&gt;Шинкова Тестерка&lt;/i&gt;");
    expect(html).not.toContain("<b>Дара</b>");
    expect(html).not.toContain("<i>Шинкова Тестерка</i>");
    expect(html).not.toContain("ігровий стіл");
  });

  it("mentions table games on the shynok overview only when enabled", () => {
    const result: ShynokOverviewResult = {
      state: "ready",
      character,
      activeDrink: null,
      openRoundOffers: []
    };

    expect(presentShynokOverview(result)).not.toContain("ігровий стіл");
    expect(presentShynokOverview(result, { tavernGames: true })).toContain(
      "тавлеї й кості чекають"
    );
  });

  it("shows current gold on the self-drink menu", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"));

    try {
      const html = presentShynokDrinkMenu({
        state: "ready",
        character,
        activeDrink: {
          key: "drink.simple-beer",
          name: "Просте пиво",
          emoji: "🍺",
          priceGold: 13,
          durationMinutes: 23,
          phase: "timed",
          startedAt: new Date("2026-06-23T09:50:00.000Z"),
          expiresAt: new Date("2026-06-23T10:13:00.000Z"),
          recoveryMultiplierBp: 12300,
          accuracyPenaltyPp: 5
        }
      });

      expect(html).toContain("Поточний напій: 🍺 <b>Просте пиво</b> ще 13 хв.");
      expect(html).toContain("У кишені: <b>125 золота</b>.");
      expect(html).not.toContain("хв..");
    } finally {
      vi.useRealTimers();
    }
  });

  it("omits current drink copy when no drink is active", () => {
    const html = presentShynokDrinkMenu({
      state: "ready",
      character,
      activeDrink: null
    });

    expect(html).not.toContain("Поточний напій");
    expect(html).toContain("У кишені: <b>125 золота</b>.");
  });

  it("shows the generosity leaderboard immediately in round preview", () => {
    const result: ShynokRoundPreviewResult = {
      state: "preview",
      character,
      token: "12345678-1234-4234-9234-123456789abc",
      tier: "fine",
      drink: {
        key: "drink.fine-beer",
        name: "Якісне пиво",
        emoji: "🍻",
        priceGold: 42,
        durationMinutes: 42,
        recoveryMultiplierBp: 14200,
        accuracyPenaltyPp: 10
      },
      priceGold: 84,
      recipientCount: 2,
      leaderboard
    };

    const html = presentShynokRoundPreview(result);

    expect(html).toContain("🏅 Рейтинг щедрості");
    expect(html).toContain("1. Мандрівник &lt;&amp;&gt; — 2 частування · 84 золота");
    expect(html).toContain("1. Дара — 1 частування · 42 золота");
    expect(html).toContain("<b>За місяць</b>: ще ніхто не пригощав");
  });

  it("keeps the generosity leaderboard visible when a round is blocked by the Barrel raid", () => {
    const result: ShynokRoundPreviewResult = {
      state: "raid-required",
      character,
      leaderboard
    };

    const html = presentShynokRoundPreview(result);

    expect(html).toContain("🍻 Корчмар ховає кухоль. Спершу завершіть рейд на Бочку в цьому відтинку.");
    expect(html).toContain("🏅 Рейтинг щедрості");
    expect(html).toContain("1. Мандрівник &lt;&amp;&gt; — 2 частування · 84 золота");
  });

  it("keeps the generosity leaderboard visible when a round is too expensive", () => {
    const result: ShynokRoundPreviewResult = {
      state: "not-enough-gold",
      character,
      gold: 24,
      priceGold: 93,
      leaderboard
    };

    const html = presentShynokRoundPreview(result);

    expect(html).toContain("Раунд коштує <b>93 золота</b>, а у вас <b>24</b>.");
    expect(html).toContain("🏅 Рейтинг щедрості");
    expect(html).toContain("1. Мандрівник &lt;&amp;&gt; — 2 частування · 84 золота");
  });

  it("keeps the leaderboard visible after a round is placed", () => {
    const result: ShynokRoundConfirmResult = {
      state: "completed",
      character,
      tier: "fine",
      priceGold: 84,
      recipientCount: 2,
      recipients: [],
      leaderboard
    };

    const html = presentShynokRoundConfirm(result);

    expect(html).toContain("Списано: <b>84 золота</b>.");
    expect(html).toContain("🏅 Рейтинг щедрості");
    expect(html).toContain("1. Мандрівник &lt;&amp;&gt; — 2 частування · 84 золота");
  });

  it("does not expose exact Mantok sale percentage split in the selection copy", () => {
    const result: ShynokSaleSelectionResult = {
      state: "selection",
      character,
      sale: {
        id: "sale-1",
        token: "12345678-1234-4234-9234-123456789abc",
        characterId: "character-1",
        status: "pending",
        selection: [],
        selectionFingerprint: "empty",
        nominalValue: 100,
        payoutGold: 42,
        result: null,
        expiresAt: new Date("2026-06-23T10:10:00.000Z"),
        completedAt: null
      },
      items: [],
      selectedCount: 0,
      eligibleCount: 0,
      nominalValue: 100,
      payoutGold: 42,
      page: 0,
      pageCount: 1
    };

    const html = presentShynokSaleSelection(result);

    expect(html).toContain("Корчмар платить корчмарську частку");
    expect(html).not.toContain("42%");
    expect(html).not.toContain("58%");
  });

  it("escapes round replacement preview drink names", () => {
    const result: ShynokRoundOfferRespondResult = {
      state: "replacement-preview",
      offer: {
        id: "12345678-1234-4234-9234-123456789abc",
        drink: {
          key: "drink.simple-beer",
          name: "Просте <пиво>",
          emoji: "🍺",
          priceGold: 13,
          durationMinutes: 23,
          recoveryMultiplierBp: 12300,
          accuracyPenaltyPp: 5
        },
        expiresAt: new Date("2026-06-23T10:05:00.000Z")
      },
      drink: {
        key: "drink.simple-beer",
        name: "Просте <пиво>",
        emoji: "🍺",
        priceGold: 13,
        durationMinutes: 23,
        recoveryMultiplierBp: 12300,
        accuracyPenaltyPp: 5
      },
      activeDrink: {
        key: "drink.thyme-tea",
        name: "Чай & чебрець",
        emoji: "🍵",
        priceGold: 17,
        durationMinutes: 42,
        phase: "timed",
        startedAt: new Date("2026-06-23T10:00:00.000Z"),
        expiresAt: new Date("2026-06-23T10:42:00.000Z"),
        recoveryMultiplierBp: 11300
      },
      replacementGuard: "abcdef1234567890"
    };

    const html = presentShynokRoundOfferResponse(result);

    expect(html).toContain("Просте &lt;пиво&gt;");
    expect(html).toContain("Чай &amp; чебрець");
    expect(html).toContain("Поки що нічого не змінено.");
    expect(html).not.toContain("Просте <пиво>");
  });

  it("uses direct recipient copy for round offers", () => {
    const html = presentShynokRoundOfferNotification("Мандрівник <&>", {
      telegramUserId: 42n,
      name: "Дара",
      offer: {
        id: "offer-1",
        expiresAt: new Date("2026-06-23T10:23:00.000Z"),
        drink: {
          key: "drink.simple-beer",
          name: "Просте пиво",
          emoji: "🍺",
          priceGold: 13,
          durationMinutes: 23,
          recoveryMultiplierBp: 12300,
          accuracyPenaltyPp: 5
        }
      }
    });

    expect(html).toContain("<b>Мандрівник &lt;&amp;&gt;</b> ставить вам <b>Просте пиво</b>.");
    expect(html).toContain("Можна випити зараз або чемно відмовитися й лишити точність при собі.");
    expect(html).not.toContain("легенд");
  });

  it("marks both drink names in self-drink replacement preview", () => {
    const result: ShynokDrinkOrderResult = {
      state: "preview",
      character,
      token: "12345678-1234-4234-9234-123456789abc",
      drink: {
        key: "drink.simple-beer",
        name: "Просте <пиво>",
        emoji: "🍺",
        priceGold: 13,
        durationMinutes: 23,
        recoveryMultiplierBp: 12300,
        accuracyPenaltyPp: 5
      },
      activeDrink: {
        key: "drink.thyme-tea",
        name: "Чай & чебрець",
        emoji: "🍵",
        priceGold: 17,
        durationMinutes: 42,
        phase: "timed",
        startedAt: new Date("2026-06-23T10:00:00.000Z"),
        expiresAt: new Date("2026-06-23T10:42:00.000Z"),
        recoveryMultiplierBp: 11300
      }
    };

    const html = presentShynokDrinkPreview(result);

    expect(html).toContain(
      "На вас іще діє 🍵 <b>Чай &amp; чебрець</b>. 🍺 <b>Просте &lt;пиво&gt;</b> замінить цей ефект."
    );
    expect(html).toContain("Наливаємо?");
  });

  it("shows remaining minutes for a confirmed drink instead of an end time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"));

    try {
      const result: ShynokDrinkConfirmResult = {
        state: "completed",
        character,
        drink: {
          key: "drink.simple-beer",
          name: "Просте <пиво>",
          emoji: "🍺",
          priceGold: 13,
          durationMinutes: 23,
          phase: "timed",
          startedAt: new Date("2026-06-23T10:00:00.000Z"),
          expiresAt: new Date("2026-06-23T10:23:00.000Z"),
          recoveryMultiplierBp: 12300,
          accuracyPenaltyPp: 5
        },
        spentGold: 13
      };

      const html = presentShynokDrinkConfirmResult(result);

      expect(html).toContain("діє ще 23 хв.");
      expect(html).not.toContain("10:23");
      expect(html).toContain("Просте &lt;пиво&gt;");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the attempted amount when Bard tips are blocked by insufficient gold", () => {
    const html = presentBardPerformanceResponseResult({
      state: "insufficient-gold",
      reaction: bardReaction({ tipGold: 0 }),
      performance: bardPerformance(),
      character,
      attemptedTipGold: 13
    });

    expect(html).toContain("<b>13 золота</b>");
    expect(html).not.toContain("<b>0 золота</b>");
  });

  it("presents free Inspiration separately from applause and tips", () => {
    const html = presentBardPerformanceAudienceNotification("Лірник", {
      telegramUserId: 42n,
      name: "Слухачка",
      reaction: bardReaction(),
      inspiration: {
        mutation: "granted",
        accuracyBonusPp: 3,
        expiresAt: new Date("2026-07-18T10:13:00.000Z"),
        now: new Date("2026-07-18T10:00:00.000Z")
      }
    });

    expect(html).toContain("✨ Виступ надихає вас: +3 до влучання на 13 хв.");
    expect(html).toContain("кожен завершений хід забирає ще одну хвилину");
    expect(html).toContain("аплодувати безкоштовно");
  });

  it("says that equal or weaker Inspiration did not refresh the timer", () => {
    const html = presentBardPerformanceAudienceNotification("Лірник", {
      telegramUserId: 42n,
      name: "Слухачка",
      reaction: bardReaction(),
      inspiration: {
        mutation: "unchanged",
        accuracyBonusPp: 5,
        expiresAt: new Date("2026-07-18T10:07:00.000Z"),
        now: new Date("2026-07-18T10:00:00.000Z")
      }
    });

    expect(html).toContain("чинне <b>Натхнення</b> не слабше");
    expect(html).toContain("Новий виступ його не подовжив");
  });

  it("labels Bard live audience as a start snapshot and shows response time left", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T10:05:00.000Z"));

    try {
      const result: BardPerformanceStartResult = {
        state: "live",
        character,
        performance: bardPerformance({
          audienceCount: 0,
          expiresAt: new Date("2026-06-26T10:13:00.000Z"),
          cooldownAvailableAt: new Date("2026-06-26T11:33:00.000Z")
        })
      };

      const html = presentBardPerformanceStartResult(result);

      expect(html).toContain("🎶 Виступ уже триває.");
      expect(html).toContain("Місцина: <b>Шинок</b>.");
      expect(html).toContain("Слухачів на старті: <b>0</b>.");
      expect(html).toContain("Реакції на цей виступ: ще 8 хв.");
      expect(html).toContain("Публіка поки складається з корчмаря й дуже критичної полиці.");
      expect(html).toContain("Нові слухачі зможуть застати вже наступний виступ.");
      expect(html).toContain("Наступний новий виступ у цій місцині: 88 хв.");
      expect(html).not.toContain("Слухачів поруч");
      expect(html).not.toContain("Наступний виступ: 93 хв.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("omits tavern payout copy for off-Shynok Bard performances", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T10:05:00.000Z"));

    try {
      const result: BardPerformanceStartResult = {
        state: "started",
        character,
        performance: bardPerformance({
          housePayoutGold: 0,
          audienceCount: 1,
          locationId: "location.korchma.front"
        }),
        audience: []
      };

      const html = presentBardPerformanceStartResult(result);

      expect(html).toContain("Місцина: <b>Перед корчмою</b>.");
      expect(html).toContain("Слухачів на старті: <b>1</b>.");
      expect(html).not.toContain("Корчмарська виплата");
      expect(html).not.toContain("критичної полиці");
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains that Bard performances require another active listener", () => {
    const html = presentBardPerformanceStartResult({
      state: "no-audience",
      character
    });

    expect(html).toContain("замало живих слухачів");
    expect(html).toContain("ще хоча б один активний пригодник поруч");
    expect(html).not.toContain("критичної полиці");
  });

  it.each([
    ["performer-wrong-place", "Бард уже не на місці виступу"],
    ["performer-active-combat", "Бард уже зайнятий боєм"],
    ["performer-pending-raid", "Бард уже біля Бочки"],
    ["performer-remorted", "попередньому житті"]
  ] satisfies Array<[BardPerformanceRespondResult["state"], string]>)(
    "uses short stale performer copy for %s",
    (state, expected) => {
      const html = presentBardPerformanceResponseResult({
        state,
        reaction: bardReaction(),
        performance: bardPerformance()
      });

      expect(html).toContain(expected);
      expect(html).toContain("без списань");
    }
  );
});

function bardPerformance(overrides: Partial<PresentedBardPerformance> = {}): PresentedBardPerformance {
  return {
    id: "performance-1",
    token: "12345678-1234-4234-9234-000000000111",
    performerName: "Лірник",
    grade: "pleasant",
    housePayoutGold: 0,
    audienceCount: 1,
    locationId: "location.korchma.bar",
    startedAt: new Date("2026-06-26T10:00:00.000Z"),
    expiresAt: new Date("2026-06-26T10:13:00.000Z"),
    cooldownAvailableAt: new Date("2026-06-26T11:33:00.000Z"),
    ...overrides
  };
}

function bardReaction(
  overrides: Partial<PresentedBardPerformanceReaction> = {}
): PresentedBardPerformanceReaction {
  return {
    id: "12345678-1234-4234-9234-123456789abc",
    audienceName: "Слухач",
    status: "offered",
    tipGold: 0,
    expiresAt: new Date("2026-06-26T10:13:00.000Z"),
    ...overrides
  };
}
