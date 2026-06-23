import { describe, expect, it } from "vitest";
import { presentShynokRoundOfferResponse } from "../../src/bot/presenters/shynokPresenter";
import type { ShynokRoundOfferRespondResult } from "../../src/services/shynokService";

describe("shynokPresenter", () => {
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
