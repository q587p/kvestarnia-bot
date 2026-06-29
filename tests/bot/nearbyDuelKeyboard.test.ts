import { describe, expect, it } from "vitest";
import { buildNearbyDuelCandidatesKeyboard } from "../../src/bot/keyboards/nearbyDuelKeyboard";
import type { NearbyDuelCandidatesSnapshot } from "../../src/services/presenceService";

describe("nearby duel keyboard", () => {
  it("shows party invite rows above duel rows when a live party is recruiting", () => {
    const keyboard = buildNearbyDuelCandidatesKeyboard(
      {
        state: "ready",
        location: {
          id: "location.korchma.bar",
          name: "Шинок"
        },
        page: 0,
        pageSize: 5,
        total: 1,
        totalPages: 1,
        visible: [
          {
            telegramUserId: 93n,
            name: "Shannar de Kassal",
            level: 8,
            status: "active"
          }
        ]
      } satisfies Extract<NearbyDuelCandidatesSnapshot, { state: "ready" }>,
      { partyInviteEnabled: true }
    );

    expect(inlineButtonTexts(keyboard)).toEqual([
      "🧭 Покликати у ватагу: Shannar de Kassal · 8",
      "⚔️ Shannar de Kassal · 8",
      "🔎 Оновити"
    ]);
  });
});

function inlineButtonTexts(keyboard: { inline_keyboard: Array<Array<{ text: string }>> }): string[] {
  return keyboard.inline_keyboard.flatMap((row) => row.map((button) => button.text));
}
