import { describe, expect, it } from "vitest";
import {
  buildShynokGameSessionKeyboard,
  formatShynokOpenTableButtonLabel
} from "../../src/bot/keyboards/shynokKeyboard";

describe("Shynok game keyboards", () => {
  it("shows Tavlei cancellation only to the creator while the table is still alone and open", () => {
    const keyboard = buildShynokGameSessionKeyboard({
      state: "created",
      session: tavleiSession()
    }, { viewerTelegramUserId: 1001n });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["✖ Скасувати", "↩ До ігор"]);
  });

  it("hides Tavlei cancellation after the table can no longer be cancelled", () => {
    const keyboard = buildShynokGameSessionKeyboard({
      state: "not-cancellable",
      session: tavleiSession({ status: "ready", participantCount: 2 })
    }, { viewerTelegramUserId: 1001n });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["↩ До ігор"]);
    expect(flatInlineButtonCallbacks(keyboard)).not.toContain("v1:sh:gx:tavlei-token");
  });

  it("hides Tavlei cancellation from non-creators", () => {
    const keyboard = buildShynokGameSessionKeyboard({
      state: "created",
      session: tavleiSession()
    }, { viewerTelegramUserId: 2002n });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["↩ До ігор"]);
  });

  it("shows Kosti resolve only while the table is still open or ready", () => {
    const openKeyboard = buildShynokGameSessionKeyboard({
      state: "joined",
      session: kostiSession({ status: "open" })
    }, { viewerTelegramUserId: 1001n });
    const completedKeyboard = buildShynokGameSessionKeyboard({
      state: "resolved",
      session: kostiSession({ status: "completed" })
    }, { viewerTelegramUserId: 1001n });

    expect(flatInlineButtonTexts(openKeyboard)).toEqual(["🎲 Кинути зараз", "↩ До ігор"]);
    expect(flatInlineButtonTexts(completedKeyboard)).toEqual(["↩ До ігор"]);
  });

  it("labels Kosti table buttons with seven seats", () => {
    expect(formatShynokOpenTableButtonLabel("kosti", 6, 5)).toBe("🎲 Кості · 6/7 · 5 зол.");
  });
});

function tavleiSession(overrides: { status?: string; participantCount?: number } = {}) {
  const participants = [
    { characterId: "character-creator", status: "joined", telegramUserId: 1001n },
    { characterId: "character-guest", status: "joined", telegramUserId: 2002n }
  ].slice(0, overrides.participantCount ?? 1);

  return {
    token: "tavlei-token",
    gameKey: "tavlei" as const,
    status: overrides.status ?? "open",
    creatorCharacterId: "character-creator",
    participants
  };
}

function kostiSession(overrides: { status: string }) {
  return {
    token: "kosti-token",
    gameKey: "kosti" as const,
    status: overrides.status,
    creatorCharacterId: "character-creator",
    participants: [
      { characterId: "character-creator", status: "decided", telegramUserId: 1001n },
      { characterId: "character-guest", status: "decided", telegramUserId: 2002n }
    ]
  };
}

function flatInlineButtonTexts(keyboard: { inline_keyboard: { text: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

function flatInlineButtonCallbacks(
  keyboard: { inline_keyboard: { callback_data?: string }[][] }
): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.callback_data ?? "");
}
