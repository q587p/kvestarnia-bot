import { describe, expect, it } from "vitest";
import {
  buildBardPerformanceResponseKeyboard,
  buildBardPerformanceRespondResultKeyboard,
  buildShynokDicePokerKeyboard,
  buildShynokDicePokerStakeKeyboard,
  buildShynokDoppelgangerMenuKeyboard,
  buildShynokDoppelgangerStakeKeyboard,
  buildShynokGameHubKeyboard,
  buildShynokGameRulesKeyboard,
  buildShynokGameSessionKeyboard,
  buildShynokOverviewKeyboard,
  formatShynokOpenTableButtonLabel
} from "../../src/bot/keyboards/shynokKeyboard";
import { buildTavernGameActionKeyboard } from "../../src/bot/tavernGameNotifications";
import { startQuickDicePoker, startScorecardDicePoker } from "../../src/domain/dicePoker";

describe("Shynok game keyboards", () => {
  it("hides the Bard performance action while the current-location performance is live", () => {
    const keyboard = buildShynokOverviewKeyboard({
      ...shynokOverviewResult(),
      character: {
        ...shynokCharacter(),
        classId: "class.bard",
        level: 3
      }
    }, { bardPerformanceAvailable: false });

    expect(flatInlineButtonTexts(keyboard)).not.toContain("🎶 Виступити");
    expect(flatInlineButtonCallbacks(keyboard)).not.toContain("v1:sh:bp");
  });

  it.each([
    [0, []],
    [1, [1]],
    [2, [1]],
    [3, [1, 3]],
    [5, [1, 3, 5]],
    [13, [1, 3, 5, 13]]
  ] as const)("offers only Bard tips affordable with %i gold", (gold, expectedTips) => {
    const callbacks = flatInlineButtonCallbacks(buildBardPerformanceResponseKeyboard(
      "12345678-1234-4234-9234-123456789abc",
      gold
    ));

    expect(callbacks
      .filter((callback) => callback.includes(":bt:"))
      .map((callback) => Number(callback.split(":").at(-1))))
      .toEqual(expectedTips);
  });

  it("rebuilds an insufficient-gold reaction with only currently affordable tips", () => {
    const callbacks = flatInlineButtonCallbacks(buildBardPerformanceRespondResultKeyboard({
      state: "insufficient-gold",
      reaction: {
        id: "12345678-1234-4234-9234-123456789abc",
        audienceName: "Слухач",
        status: "offered",
        tipGold: 0,
        expiresAt: new Date("2026-06-26T10:13:00.000Z")
      },
      performance: {} as never,
      character: { ...shynokCharacter(), gold: 3 },
      attemptedTipGold: 5
    }));

    expect(callbacks.filter((callback) => callback.includes(":bt:"))).toEqual([
      "v1:sh:bt:12345678-1234-4234-9234-123456789abc:1",
      "v1:sh:bt:12345678-1234-4234-9234-123456789abc:3"
    ]);
  });

  it("opens live beer offers next to self drinks instead of accepting from the overview", () => {
    const keyboard = buildShynokOverviewKeyboard({
      ...shynokOverviewResult(),
      openRoundOffers: [roundOffer("12345678-1234-4234-9234-000000000093")]
    });

    expect(inlineButtonRows(keyboard)[0]).toEqual(["🍹 Напої для себе", "🍺 Вам пиво!"]);
    expect(flatInlineButtonCallbacks(keyboard)).toContain("v1:sh:ro:12345678-1234-4234-9234-000000000093");
    expect(flatInlineButtonCallbacks(keyboard)).not.toContain("v1:sh:ra:12345678-1234-4234-9234-000000000093");
    expect(flatInlineButtonCallbacks(keyboard)).not.toContain("v1:sh:rd:12345678-1234-4234-9234-000000000093");
  });

  it("does not mark the hall return when only Shynok itself has a quest marker", () => {
    const keyboard = buildShynokOverviewKeyboard(shynokOverviewResult(), {
      questMarkers: {
        characterLevel: 2,
        barrelBeerTutorial: {
          state: "in-progress",
          character: shynokCharacter(),
          progress: {
            accepted: true,
            stipendGranted: true,
            visitedBarrel: true,
            raidCompleted: true,
            beerRoundOffered: false,
            beerDrunk: false,
            activeBeer: false,
            currentLocationId: "location.korchma.bar"
          }
        }
      }
    });

    expect(flatInlineButtonTexts(keyboard)).toContain("⬅️ До зали");
    expect(flatInlineButtonTexts(keyboard)).not.toContain("⬅️ До зали ⚠️");
  });

  it("keeps marking the Shynok hall return when another Korchma location has a quest marker", () => {
    const keyboard = buildShynokOverviewKeyboard(shynokOverviewResult(), {
      questMarkers: {
        characterLevel: 2,
        barrelBeerTutorial: {
          state: "in-progress",
          character: shynokCharacter(),
          progress: {
            accepted: true,
            stipendGranted: true,
            visitedBarrel: false,
            raidCompleted: false,
            beerRoundOffered: false,
            beerDrunk: false,
            activeBeer: false,
            currentLocationId: "location.korchma.bar"
          }
        }
      }
    });

    expect(flatInlineButtonTexts(keyboard)).toContain("⬅️ До зали ⚠️");
  });

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
          playerCap: 8,
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
          playerCap: 8,
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

  it("hides invite actions from seated non-creators on open tables", () => {
    const token = "12345678-1234-4234-9234-123456789abc";
    const keyboard = buildShynokGameSessionKeyboard({
      state: "joined",
      session: kostiSession({
        status: "open",
        token,
        participantCount: 2,
        result: {
          kind: "dice_poker_table",
          mode: "scorecard",
          phase: "waiting",
          playerCap: 8,
          drawRound: 1
        }
      })
    }, {
      viewerTelegramUserId: 2002n,
      inviteUrl: `https://t.me/kvestarnia_bot?start=game_${token}`
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["✅ Готові", "↩ До ігор"]);
    expect(flatInlineButtonCallbacks(keyboard)).toContain(`v1:sh:grd:${token}:r`);
    expect(flatInlineButtonCallbacks(keyboard)).not.toContain(`v1:sh:gsh:${token}`);
    expect(flatInlineButtonUrls(keyboard)).toEqual([]);
  });

  it("toggles Dice Poker readiness back to waiting", () => {
    const token = "12345678-1234-4234-9234-123456789abc";
    const keyboard = buildShynokGameSessionKeyboard({
      state: "updated",
      session: kostiSession({
        status: "open",
        token,
        participantCount: 2,
        result: {
          kind: "dice_poker_table",
          mode: "quick",
          phase: "waiting",
          playerCap: 8,
          drawRound: 1
        },
        participantResults: [
          null,
          { kind: "tavern_table_readiness", readiness: "ready" }
        ]
      })
    }, {
      viewerTelegramUserId: 2002n,
      inviteUrl: `https://t.me/kvestarnia_bot?start=game_${token}`
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual(["⏳ Зачекайте", "↩ До ігор"]);
    expect(flatInlineButtonCallbacks(keyboard)).toContain(`v1:sh:grd:${token}:w`);
  });

  it("uses gendered Dice Poker ready labels", () => {
    const token = "12345678-1234-4234-9234-123456789abc";
    const keyboard = buildShynokGameSessionKeyboard({
      state: "joined",
      session: kostiSession({
        status: "open",
        token,
        participantCount: 1,
        participantPronouns: ["she"],
        result: {
          kind: "dice_poker_table",
          mode: "quick",
          phase: "waiting",
          playerCap: 8,
          drawRound: 1
        }
      })
    }, { viewerTelegramUserId: 1001n });

    expect(flatInlineButtonTexts(keyboard)).toContain("✅ Готова");
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

  it("labels Dice Poker table buttons with eight seats", () => {
    expect(formatShynokOpenTableButtonLabel("kosti", 6, 5, {
      kind: "dice_poker_table",
      mode: "quick",
      phase: "waiting",
      playerCap: 8,
      drawRound: 1
    })).toBe("⚡ Швидкі кості · 6/8 · 5 зол.");
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

  it("counts active Doppelganger tables without showing a join button", () => {
    const keyboard = buildShynokGameHubKeyboard({
      state: "ready",
      maxStake: 93,
      tavleiEnabled: true,
      kostiEnabled: true,
      doppelgangerAvailable: true,
      openTables: [{
        token: "12345678-1234-4234-9234-123456789abc",
        gameKey: "kosti",
        status: "ready",
        creatorCharacterId: "character-creator",
        participants: [{ characterId: "character-creator", status: "joined", telegramUserId: 1001n }],
        result: startQuickDicePoker("keyboard-doppelganger-table")
      } as never]
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🏆 Рейтинг",
      "♟ Тавлеї",
      "🎲 Кості",
      "🪞 Допельґанґер",
      "↩ Назад"
    ]);
    expect(flatInlineButtonCallbacks(keyboard).some((callback) => callback.includes(":gj:"))).toBe(false);
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

  it("offers a rematch from stored terminal Doppelganger Dice Poker cards", () => {
    const state = {
      ...startQuickDicePoker("keyboard-stored-rematch"),
      phase: "terminal" as const,
      outcome: "loss" as const,
      playerHand: {
        rank: "high" as const,
        tieBreak: [6, 5, 4, 3, 2]
      },
      opponentHand: {
        rank: "pair" as const,
        tieBreak: [6, 5, 4, 3]
      },
      reason: "Пара сильніша."
    };
    const keyboard = buildTavernGameActionKeyboard({
      state: "stale",
      session: {
        token: "12345678-1234-4234-9234-123456789abc",
        gameKey: "kosti",
        status: "completed",
        creatorCharacterId: "character-creator",
        result: {
          kind: "dice_poker",
          outcome: "loss",
          state
        },
        participants: [
          {
            characterId: "character-creator",
            status: "completed",
            telegramUserId: 1001n,
            decision: null
          }
        ]
      }
    }, 1001n);

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
          playerCap: 8,
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
            playerCap: 8,
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

function shynokOverviewResult() {
  return {
    state: "ready" as const,
    character: shynokCharacter(),
    openRoundOffers: []
  };
}

function roundOffer(id: string) {
  return {
    id,
    expiresAt: new Date("2026-06-23T10:05:00.000Z"),
    drink: {
      key: "drink.simple-beer" as const,
      name: "Просте пиво",
      emoji: "🍺",
      priceGold: 13,
      durationMinutes: 23,
      recoveryMultiplierBp: 12300,
      accuracyPenaltyPp: 5
    }
  };
}

function shynokCharacter() {
  return {
    id: "character-shynok",
    name: "Тестова Відвідувачка",
    pronoun: "they" as const,
    pronounLabel: "Вони",
    path: "boundary" as const,
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 2,
    xp: 0,
    gold: 93,
    hpCurrent: 10,
    hpMax: 10,
    manaCurrent: 5,
    manaMax: 5,
    attack: 3,
    defense: 2,
    speed: 2
  };
}

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
  participantResults?: unknown[];
  participantPronouns?: string[];
}) {
  const participants = [
    {
      characterId: "character-creator",
      status: "decided",
      telegramUserId: 1001n,
      character: { pronoun: overrides.participantPronouns?.[0] ?? "they" }
    },
    {
      characterId: "character-guest",
      status: "decided",
      telegramUserId: 2002n,
      character: { pronoun: overrides.participantPronouns?.[1] ?? "they" }
    }
  ].slice(0, overrides.participantCount ?? 2).map((participant, index) => ({
    ...participant,
    result: overrides.participantResults?.[index] ?? null
  }));

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
