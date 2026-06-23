import { describe, expect, it } from "vitest";
import {
  presentShynokGate,
  presentShynokRoundConfirm,
  presentShynokRoundOfferResponse,
  presentShynokRoundPreview
} from "../../src/bot/presenters/shynokPresenter";
import type {
  ShynokRoundConfirmResult,
  ShynokRoundOfferRespondResult,
  ShynokRoundPreviewResult
} from "../../src/services/shynokService";
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
        recoveryMultiplierBp: 15000,
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

  it("keeps the leaderboard visible after a round is placed", () => {
    const result: ShynokRoundConfirmResult = {
      state: "completed",
      character,
      tier: "fine",
      priceGold: 84,
      recipientCount: 2,
      leaderboard
    };

    const html = presentShynokRoundConfirm(result);

    expect(html).toContain("Списано: <b>84 золота</b>.");
    expect(html).toContain("🏅 Рейтинг щедрості");
    expect(html).toContain("1. Мандрівник &lt;&amp;&gt; — 2 частування · 84 золота");
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
          recoveryMultiplierBp: 12500,
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
        recoveryMultiplierBp: 12500,
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
});
