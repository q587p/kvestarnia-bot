import { describe, expect, it } from "vitest";
import {
  buildShynokDicePokerKeyboard,
  buildShynokDicePokerStakeKeyboard,
  buildShynokGameRulesKeyboard,
  buildShynokGameSessionKeyboard,
  formatShynokOpenTableButtonLabel
} from "../../src/bot/keyboards/shynokKeyboard";
import { buildTavernGameActionKeyboard } from "../../src/bot/modules/tavern";
import { startQuickDicePoker, startScorecardDicePoker } from "../../src/domain/dicePoker";

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

    expect(flatInlineButtonTexts(openKeyboard)).toEqual(["▶️ Почати партію", "↩ До ігор"]);
    expect(flatInlineButtonTexts(completedKeyboard)).toEqual(["↩ До ігор"]);
  });

  it("labels Kosti table buttons with seven seats", () => {
    expect(formatShynokOpenTableButtonLabel("kosti", 6, 5)).toBe("🎲 Кості · 6/7 · 5 зол.");
  });

  it("asks for the dice mode before showing stakes", () => {
    expect(flatInlineButtonTexts(buildShynokGameRulesKeyboard("tavlei", 93))).toEqual([
      "💰 1",
      "💰 5",
      "💰 13",
      "💰 23",
      "💰 42",
      "💰 93",
      "↩ До ігор"
    ]);
    expect(flatInlineButtonTexts(buildShynokGameRulesKeyboard("kosti", 23))).toEqual([
      "⚡ Швидкі кості",
      "📜 Табличні кості",
      "❔ Правила",
      "↩ До ігор"
    ]);
    expect(flatInlineButtonTexts(buildShynokDicePokerStakeKeyboard("quick", 23))).toEqual([
      "👥 Стіл · 1",
      "🪞 Допельґанґер · 1",
      "👥 Стіл · 5",
      "🪞 Допельґанґер · 5",
      "👥 Стіл · 13",
      "🪞 Допельґанґер · 13",
      "👥 Стіл · 23",
      "🪞 Допельґанґер · 23",
      "❔ Правила",
      "↩ До костей"
    ]);
  });

  it("hides the Doppelganger stake buttons while he is in the fighting corner", () => {
    expect(flatInlineButtonTexts(buildShynokDicePokerStakeKeyboard("quick", 13, {
      doppelgangerAvailable: false
    }))).toEqual([
      "👥 Стіл · 1",
      "👥 Стіл · 5",
      "👥 Стіл · 13",
      "❔ Правила",
      "↩ До костей"
    ]);
  });

  it("shows clear quick dice poker next actions", () => {
    const state = {
      ...startQuickDicePoker("keyboard-quick"),
      playerDice: [6, 6, 2, 3, 4],
      selectedMask: 0b00011
    };
    const keyboard = buildShynokDicePokerKeyboard("12345678-1234-4234-9234-123456789abc", state);

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "✅ 6",
      "✅ 6",
      "⬜ 2",
      "⬜ 3",
      "⬜ 4",
      "🎲 Перекинути вибране",
      "❔ Правила",
      "✖ Скасувати",
      "↩ До ігор"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toContain(
      "v1:sh:gpr:12345678-1234-4234-9234-123456789abc"
    );
  });

  it("shows scorecard scoring choices with preview values", () => {
    const state = {
      ...startScorecardDicePoker("keyboard-scorecard"),
      dice: [1, 1, 1, 3, 4],
      selectedMask: 0
    };
    const keyboard = buildShynokDicePokerKeyboard("12345678-1234-4234-9234-123456789abc", state);
    const texts = flatInlineButtonTexts(keyboard);

    expect(texts).not.toContain("🎲 Лишити як є");
    expect(texts).toContain("Одиниці: 3");
    expect(texts).toContain("Трійки: 3");
    expect(texts).toContain("Шанс: 10");
    expect(texts).toContain("✖ Скасувати");
  });

  it("does not fall back to old Kosti decision buttons for malformed dice poker table state", () => {
    const keyboard = buildTavernGameActionKeyboard({
      state: "saved",
      session: {
        token: "12345678-1234-4234-9234-123456789abc",
        gameKey: "kosti",
        status: "ready",
        creatorCharacterId: "character-creator",
        result: {
          kind: "dice_poker_table",
          mode: "quick",
          phase: "playing",
          playerCap: 2,
          drawRound: 1
        },
        participants: [
          {
            characterId: "character-creator",
            status: "joined",
            telegramUserId: 1001n,
            decision: null
          }
        ]
      }
    }, 1001n);

    expect(flatInlineButtonTexts(keyboard)).toEqual(["↩ До ігор"]);
    expect(flatInlineButtonCallbacks(keyboard).some((callback) => callback.includes(":gk:"))).toBe(false);
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
