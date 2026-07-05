import { describe, expect, it } from "vitest";
import {
  buildShynokDicePokerKeyboard,
  buildShynokDicePokerStakeKeyboard,
  buildShynokDoppelgangerMenuKeyboard,
  buildShynokDoppelgangerStakeKeyboard,
  buildShynokGameHubKeyboard,
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
      session: tavleiSession({ status: "ready", participantCount: 2 })
    }, { viewerTelegramUserId: 2002n });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["↩ До ігор"]);
  });

  it("offers invite actions on open Tavlei and Dice Poker tables", () => {
    const token = "12345678-1234-4234-9234-123456789abc";
    const tavleiKeyboard = buildShynokGameSessionKeyboard({
      state: "created",
      session: tavleiSession({ token })
    }, {
      viewerTelegramUserId: 1001n,
      inviteUrl: `https://t.me/kvestarnia_bot?start=game_${token}`
    });
    const diceKeyboard = buildShynokGameSessionKeyboard({
      state: "created",
      session: kostiSession({
        status: "open",
        token,
        participantCount: 1,
        result: {
          kind: "dice_poker_table",
          mode: "quick",
          phase: "waiting",
          playerCap: 2,
          drawRound: 1
        }
      })
    }, {
      viewerTelegramUserId: 1001n,
      inviteUrl: `https://t.me/kvestarnia_bot?start=game_${token}`
    });

    expect(flatInlineButtonTexts(tavleiKeyboard)).toEqual([
      "✖ Скасувати",
      "📣 Запрошення до столу",
      "🔗 Запросити до столу",
      "↩ До ігор"
    ]);
    expect(flatInlineButtonCallbacks(tavleiKeyboard)).toContain(`v1:sh:gsh:${token}`);
    expect(flatInlineButtonUrls(tavleiKeyboard)[0]).toContain(encodeURIComponent(`game_${token}`));
    expect(flatInlineButtonTexts(diceKeyboard)).toContain("📣 Запрошення до столу");
  });

  it("shows join retry instead of invite actions to non-participants on open tables", () => {
    const token = "12345678-1234-4234-9234-123456789abc";
    const keyboard = buildShynokGameSessionKeyboard({
      state: "insufficient-gold",
      session: kostiSession({
        status: "open",
        token,
        participantCount: 1,
        result: {
          kind: "dice_poker_table",
          mode: "quick",
          phase: "waiting",
          playerCap: 2,
          drawRound: 1
        }
      })
    }, {
      viewerTelegramUserId: 2002n,
      inviteUrl: `https://t.me/kvestarnia_bot?start=game_${token}`
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["✅ Сісти за стіл", "↩ До ігор"]);
    expect(flatInlineButtonCallbacks(keyboard)).toContain(`v1:sh:gj:${token}`);
    expect(flatInlineButtonCallbacks(keyboard)).not.toContain(`v1:sh:gsh:${token}`);
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
    expect(flatInlineButtonTexts(completedKeyboard)).toEqual(["🔁 Зіграти ще", "↩ До ігор"]);
    expect(flatInlineButtonCallbacks(completedKeyboard)).toContain("v1:sh:grm:kosti-token");
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
    expect(inlineButtonRows(buildShynokDicePokerStakeKeyboard("quick", 23))).toEqual([
      ["👥 1", "👥 5", "👥 13", "👥 23"],
      ["❔ Правила"],
      ["↩ До костей"]
    ]);
  });

  it("shows the Doppelganger as a separate table-games branch", () => {
    expect(flatInlineButtonTexts(buildShynokGameHubKeyboard({
      state: "ready",
      maxStake: 93,
      tavleiEnabled: true,
      kostiEnabled: true,
      doppelgangerAvailable: true,
      openTables: []
    }))).toEqual([
      "🏆 Рейтинг",
      "♟ Тавлеї",
      "🎲 Кості",
      "🪞 Допельґанґер",
      "↩ Назад"
    ]);
    expect(inlineButtonRows(buildShynokDoppelgangerMenuKeyboard({
      tavleiEnabled: true,
      kostiEnabled: true
    }))).toEqual([
      ["⚡ Швидкі кості"],
      ["📜 Табличні кості"],
      ["♟ Тавлеї"],
      ["↩ До ігор"]
    ]);
    expect(inlineButtonRows(buildShynokDoppelgangerStakeKeyboard("tavlei", 13))).toEqual([
      ["1", "5", "13"],
      ["↩ До Допельґанґера"]
    ]);
  });

  it("hides the Doppelganger branch while he is in the fighting corner", () => {
    expect(flatInlineButtonTexts(buildShynokGameHubKeyboard({
      state: "ready",
      maxStake: 93,
      tavleiEnabled: true,
      kostiEnabled: true,
      doppelgangerAvailable: false,
      openTables: []
    }))).not.toContain("🪞 Допельґанґер");
    expect(inlineButtonRows(buildShynokDicePokerStakeKeyboard("quick", 13))).toEqual([
      ["👥 1", "👥 5", "👥 13"],
      ["❔ Правила"],
      ["↩ До костей"]
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

  it("offers a rematch from terminal dice poker cards", () => {
    const state = {
      ...startQuickDicePoker("keyboard-rematch"),
      phase: "terminal" as const,
      outcome: "win" as const,
      playerHand: {
        rank: "poker" as const,
        tieBreak: [6]
      },
      opponentHand: {
        rank: "high" as const,
        tieBreak: [5, 4, 3, 2, 1]
      },
      reason: "Покер сильніший."
    };
    const keyboard = buildShynokDicePokerKeyboard("12345678-1234-4234-9234-123456789abc", state, {
      allowRematch: true
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["🔁 Зіграти ще", "↩ До ігор"]);
    expect(flatInlineButtonCallbacks(keyboard)).toContain(
      "v1:sh:grm:12345678-1234-4234-9234-123456789abc"
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

  it("does not show stale dice poker reroll controls for closed social tables", () => {
    const keyboard = buildTavernGameActionKeyboard({
      state: "closed",
      session: {
        token: "12345678-1234-4234-9234-123456789abc",
        gameKey: "kosti",
        status: "completed",
        creatorCharacterId: "character-creator",
        result: {
          kind: "dice_poker_table",
          mode: "quick",
          phase: "terminal",
          playerCap: 2,
          drawRound: 1,
          outcomes: {
            "character-creator": "loss",
            "character-guest": "win"
          }
        },
        participants: [
          {
            characterId: "character-creator",
            status: "decided",
            telegramUserId: 1001n,
            decision: startQuickDicePoker("stale-quick-table")
          },
          {
            characterId: "character-guest",
            status: "completed",
            telegramUserId: 2002n,
            decision: null
          }
        ]
      }
    }, 1001n);
    const callbacks = flatInlineButtonCallbacks(keyboard);

    expect(flatInlineButtonTexts(keyboard)).toEqual(["🔁 Зіграти ще", "↩ До ігор"]);
    expect(callbacks.some((callback) => callback.includes(":gdr:"))).toBe(false);
    expect(callbacks.some((callback) => callback.includes(":gdt:"))).toBe(false);
    expect(callbacks.some((callback) => callback.includes(":gds:"))).toBe(false);
  });
});

function tavleiSession(overrides: { status?: string; participantCount?: number; token?: string } = {}) {
  const participants = [
    { characterId: "character-creator", status: "joined", telegramUserId: 1001n },
    { characterId: "character-guest", status: "joined", telegramUserId: 2002n }
  ].slice(0, overrides.participantCount ?? 1);

  return {
    token: overrides.token ?? "tavlei-token",
    gameKey: "tavlei" as const,
    status: overrides.status ?? "open",
    creatorCharacterId: "character-creator",
    participants
  };
}

function kostiSession(overrides: {
  status: string;
  token?: string;
  participantCount?: number;
  result?: unknown;
}) {
  const participants = [
    { characterId: "character-creator", status: "decided", telegramUserId: 1001n },
    { characterId: "character-guest", status: "decided", telegramUserId: 2002n }
  ].slice(0, overrides.participantCount ?? 2);

  return {
    token: overrides.token ?? "kosti-token",
    gameKey: "kosti" as const,
    status: overrides.status,
    creatorCharacterId: "character-creator",
    participants,
    result: overrides.result
  };
}

function flatInlineButtonTexts(keyboard: { inline_keyboard: { text: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

function inlineButtonRows(keyboard: { inline_keyboard: { text: string }[][] }): string[][] {
  return keyboard.inline_keyboard.map((row) => row.map((button) => button.text));
}

function flatInlineButtonCallbacks(
  keyboard: { inline_keyboard: { callback_data?: string }[][] }
): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.callback_data ?? "");
}

function flatInlineButtonUrls(
  keyboard: { inline_keyboard: { url?: string }[][] }
): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.url).filter(Boolean) as string[];
}
