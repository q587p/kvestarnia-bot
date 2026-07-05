import { describe, expect, it } from "vitest";
import type { TavernGameSessionRecord } from "../../src/db/repositories/tavernGameRepository";
import {
  presentDoppelgangerGameMenu,
  presentDoppelgangerStakeMenu,
  presentDicePokerRules,
  presentTavernGameInviteShare,
  presentTavernGameActionResult,
  presentTavernGameHub,
  presentTavernGameLeaderboard,
  presentTavernGameRules,
  presentTavernGameSession
} from "../../src/bot/presenters/tavernGamePresenter";
import {
  evaluateQuickHand,
  startQuickDicePoker,
  startScorecardDicePoker,
  type DicePokerState
} from "../../src/domain/dicePoker";

describe("tavern game presenter", () => {
  it("shows player gold and the Doppelganger branch on the table-games hub", () => {
    const text = presentTavernGameHub({
      state: "ready",
      maxStake: 93,
      tavleiEnabled: true,
      kostiEnabled: true,
      doppelgangerAvailable: true,
      character: { gold: 42 },
      openTables: []
    });

    expect(text).toContain("Найбільша ставка зараз: <b>93 зол.</b>");
    expect(text).toContain("У тебе зараз: <b>42 зол.</b>");
    expect(text).toContain("🪞 Допельґанґер уже сів окремо");
  });

  it("shows active Doppelganger games in the table-games hub", () => {
    const text = presentTavernGameHub({
      state: "ready",
      maxStake: 93,
      tavleiEnabled: true,
      kostiEnabled: true,
      doppelgangerAvailable: true,
      character: { gold: 42 },
      openTables: [
        session({
          status: "ready",
          gameKey: "kosti",
          stakeGold: 13,
          creator: {
            ...session().creator,
            name: "Shannar de Kassal"
          },
          result: startQuickDicePoker("hub-doppelganger"),
          participants: [participant({
            displayName: "Shannar de Kassal",
            character: {
              ...participant().character,
              name: "Shannar de Kassal"
            }
          })]
        })
      ]
    });

    expect(text).toContain("Столи зараз:");
    expect(text).toContain("• ⚡ Швидкі кості з Допельґанґером · ставка 13 зол. · грає Shannar de Kassal");
    expect(text).not.toContain("1/7");
    expect(text).not.toContain("Поки що ніхто не тримає стіл.");
  });

  it("describes Doppelganger game and stake menus compactly", () => {
    expect(presentDoppelgangerGameMenu(93)).toContain("Оберіть гру з Допельґанґером");
    expect(presentDoppelgangerStakeMenu("tavlei", 93)).toContain("♟ Тавлеї з Допельґанґером");
  });

  it("describes Kosti as clear dice poker modes", () => {
    const text = presentTavernGameRules("kosti", 25);

    expect(text).toContain("🎲 Кості й покер");
    expect(text).toContain("⚡ Швидкі кості");
    expect(text).toContain("📜 Табличні кості");
    expect(text).toContain("Ставку корчма спитає наступним кроком");
    expect(text).not.toContain("від двох до семи гравців");
  });

  it("renders open Tavlei table cards with spaced blocks and titled bold names", () => {
    const host = participant({
      status: "joined",
      stakeGold: 13,
      payoutGold: 0,
      displayName: "Kyjivan BooksDragon",
      character: {
        ...participant().character,
        name: "Kyjivan BooksDragon",
        activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
      }
    });
    const text = presentTavernGameSession(session({
      gameKey: "tavlei",
      status: "open",
      stakeGold: 13,
      potGold: 13,
      completedAt: null,
      participants: [host]
    }));

    expect(text).toBe([
      "♟ Тавлеї · ставка <b>13 зол.</b>",
      "",
      "За столом: <b>Kyjivan BooksDragon</b> (<i>«Перший писар»</i>)",
      "Банк: <b>13 зол.</b>",
      "",
      "Чекаємо другого гравця."
    ].join("\n"));
  });

  it("renders ready Tavlei decision cards with spaced blocks and titled bold names", () => {
    const first = participant({
      status: "joined",
      stakeGold: 13,
      payoutGold: 0,
      displayName: "Kyjivan BooksDragon",
      character: {
        ...participant().character,
        name: "Kyjivan BooksDragon",
        activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
      }
    });
    const second = participant({
      id: "participant-2",
      characterId: "character-2",
      telegramUserId: 43n,
      status: "joined",
      stakeGold: 13,
      payoutGold: 0,
      displayName: "Shannar de Kassal",
      character: {
        ...participant().character,
        id: "character-2",
        telegramUserId: 43n,
        name: "Shannar de Kassal",
        activeCosmeticTitleGrantId: "cosmetic-title.level-two-stool"
      }
    });
    const text = presentTavernGameSession(session({
      gameKey: "tavlei",
      status: "ready",
      stakeGold: 13,
      potGold: 26,
      completedAt: null,
      participants: [first, second]
    }));

    expect(text).toBe([
      "♟ Тавлеї · ставка <b>13 зол.</b>",
      "",
      "За столом: <b>Kyjivan BooksDragon</b> (<i>«Перший писар»</i>), <b>Shannar de Kassal</b> (<i>«Табуретник»</i>)",
      "Банк: <b>26 зол.</b>",
      "",
      "Оберіть тактику. Коли обидва зроблять вибір, партія завершиться сама."
    ].join("\n"));
  });

  it("renders compact invite cards for open table games", () => {
    const tableSession = session({
      status: "open",
      completedAt: null,
      result: {
        kind: "dice_poker_table",
        mode: "scorecard",
        phase: "waiting",
        playerCap: 8,
        drawRound: 1
      }
    });
    const text = presentTavernGameInviteShare(
      tableSession,
      "https://t.me/kvestarnia_bot?start=game_12345678-1234-4234-9234-123456789abc",
      { templateIndex: 0 }
    );

    expect(text).toContain("<b>🎲 Стіл у шинку шукає гравців</b>");
    expect(text).toContain("Кличе: <b>Тест</b>");
    expect(text).toContain("Гра: 📜 Табличні кості");
    expect(text).toContain("Місця: 1/8");
    expect(text).toContain("Ставка: <b>3 зол.</b>");
    expect(text).toContain("https://t.me/kvestarnia_bot?start=game_12345678-1234-4234-9234-123456789abc");
  });

  it("keeps compact rules for both dice poker modes", () => {
    const text = presentDicePokerRules();

    expect(text).toContain("Сила рук: Покер, Каре, Фул-хаус");
    expect(text).toContain("13 ходів");
    expect(text).toContain("протерміновані партії");
  });

  it("shows quick dice poker result with hands and reason", () => {
    const state: DicePokerState = {
      kind: "dice_poker",
      mode: "quick",
      phase: "terminal",
      outcome: "win",
      drawRound: 1,
      playerDice: [6, 6, 6, 2, 1],
      opponentDice: [5, 5, 4, 4, 2],
      playerHand: evaluateQuickHand([6, 6, 6, 2, 1]),
      opponentHand: evaluateQuickHand([5, 5, 4, 4, 2]),
      reason: "Трійка сильніша за дві пари."
    };

    const text = presentTavernGameActionResult({
      state: "completed",
      session: session({ result: state }),
      dicePoker: state
    });

    expect(text).toContain("Твої кості: 6 6 6 2 1 — Трійка шісток");
    expect(text).toContain("Кості Допельґанґера: 5 5 4 4 2 — Дві пари");
    expect(text).toContain("🏆 Перемога: трійка сильніша за дві пари.");
    expect(text).toContain("💰 Виплата: <b>3 зол.</b>");
  });

  it("shows quick dice poker losses with readable spacing and exact lost stake", () => {
    const state: DicePokerState = {
      kind: "dice_poker",
      mode: "quick",
      phase: "terminal",
      outcome: "loss",
      drawRound: 1,
      playerDice: [4, 5, 1, 6, 2],
      opponentDice: [1, 6, 6, 4, 3],
      playerHand: evaluateQuickHand([4, 5, 1, 6, 2]),
      opponentHand: evaluateQuickHand([1, 6, 6, 4, 3]),
      reason: "Пара сильніша за старшу кістку."
    };

    const text = presentTavernGameActionResult({
      state: "completed",
      session: session({
        result: state,
        participants: [participant({ payoutGold: 0, refundedGold: 0, stakeGold: 13 })]
      }),
      dicePoker: state
    });

    expect(text).toContain("Твої кості: 4 5 1 6 2 — Старша кістка 6.\n\nКості Допельґанґера");
    expect(text).toContain("💀 Поразка: пара сильніша за старшу кістку.");
    expect(text).toContain("💸 Ставка програна: <b>13 зол.</b>");
    expect(text).not.toContain("шинкар");
  });

  it("renders social quick table starts with the viewer's own dice", () => {
    const firstState = {
      ...startQuickDicePoker("quick-social-first"),
      playerDice: [1, 1, 2, 3, 4]
    };
    const secondState = {
      ...startQuickDicePoker("quick-social-second"),
      playerDice: [6, 6, 5, 4, 3]
    };
    const tableSession = session({
      status: "ready",
      result: {
        kind: "dice_poker_table",
        mode: "quick",
        phase: "playing",
        playerCap: 8,
        drawRound: 1
      },
      participants: [
        participant({ characterId: "character-1", telegramUserId: 1001n, status: "joined", decision: firstState }),
        participant({ characterId: "character-2", telegramUserId: 2002n, status: "joined", decision: secondState })
      ]
    });

    const firstText = presentTavernGameActionResult({
      state: "started",
      session: tableSession,
      viewerTelegramUserId: 1001n
    });
    const secondText = presentTavernGameActionResult({
      state: "started",
      session: tableSession,
      viewerTelegramUserId: 2002n
    });

    expect(firstText).toContain("Твої кості: 1 1 2 3 4");
    expect(firstText).not.toContain("6 6 5 4 3");
    expect(firstText).not.toContain("Допельґанґер");
    expect(firstText).not.toContain("Партія йде");
    expect(secondText).toContain("Твої кості: 6 6 5 4 3");
  });

  it("renders terminal social quick table results with spaced titled rows", () => {
    const tableSession = session({
      status: "completed",
      stakeGold: 13,
      potGold: 26,
      result: {
        kind: "dice_poker_table",
        mode: "quick",
        phase: "terminal",
        playerCap: 8,
        drawRound: 1,
        outcomes: {
          "character-1": "win",
          "character-2": "loss"
        }
      },
      participants: [
        participant({
          characterId: "character-1",
          telegramUserId: 1001n,
          displayName: "Shannar de Kassal",
          stakeGold: 13,
          payoutGold: 26,
          character: {
            ...participant().character,
            id: "character-1",
            telegramUserId: 1001n,
            name: "Shannar de Kassal",
            activeCosmeticTitleGrantId: "cosmetic-title.level-two-stool"
          }
        }),
        participant({
          id: "participant-2",
          characterId: "character-2",
          telegramUserId: 2002n,
          displayName: "Kyjivan BooksDragon",
          stakeGold: 13,
          payoutGold: 0,
          character: {
            ...participant().character,
            id: "character-2",
            telegramUserId: 2002n,
            name: "Kyjivan BooksDragon",
            activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
          }
        })
      ]
    });

    const text = presentTavernGameActionResult({
      state: "completed",
      session: tableSession,
      dicePoker: startQuickDicePoker("terminal-social-result"),
      viewerTelegramUserId: 2002n
    });

    expect(text).toBe([
      "⚡ Швидкі кості",
      "",
      "<b>Shannar de Kassal</b> (<i>«Табуретник»</i>): 🏆 перемога · виплата <b>26 зол.</b>",
      "",
      "<b>Kyjivan BooksDragon</b> (<i>«Перший писар»</i>): 💀 поразка"
    ].join("\n"));
  });

  it("renders terminal social scorecard results with spaced titled blocks", () => {
    const tableSession = session({
      status: "completed",
      stakeGold: 23,
      potGold: 69,
      result: {
        kind: "dice_poker_table",
        mode: "scorecard",
        phase: "terminal",
        playerCap: 8,
        drawRound: 1,
        outcomes: {
          "character-1": "loss",
          "character-2": "win",
          "character-3": "loss"
        },
        totals: {
          "character-1": 63,
          "character-2": 105,
          "character-3": 63
        }
      },
      participants: [
        participant({
          id: "participant-1",
          characterId: "character-1",
          telegramUserId: 1001n,
          displayName: "Ігровий Майстер",
          stakeGold: 23,
          payoutGold: 0,
          character: {
            ...participant().character,
            id: "character-1",
            telegramUserId: 1001n,
            name: "Ігровий Майстер",
            activeCosmeticTitleGrantId: null
          }
        }),
        participant({
          id: "participant-2",
          characterId: "character-2",
          telegramUserId: 2002n,
          displayName: "Kyjivan BooksDragon",
          stakeGold: 23,
          payoutGold: 69,
          character: {
            ...participant().character,
            id: "character-2",
            telegramUserId: 2002n,
            name: "Kyjivan BooksDragon",
            activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
          }
        }),
        participant({
          id: "participant-3",
          characterId: "character-3",
          telegramUserId: 3003n,
          displayName: "Shannar de Kassal",
          stakeGold: 23,
          payoutGold: 0,
          character: {
            ...participant().character,
            id: "character-3",
            telegramUserId: 3003n,
            name: "Shannar de Kassal",
            activeCosmeticTitleGrantId: "cosmetic-title.level-two-stool"
          }
        })
      ]
    });

    const text = presentTavernGameActionResult({
      state: "completed",
      session: tableSession,
      viewerTelegramUserId: 2002n
    });

    expect(text).toBe([
      "📜 Табличні кості",
      "",
      "<b>Ігровий Майстер</b> · <b>63 очк.</b>",
      "💀 поразка",
      "",
      "<b>Kyjivan BooksDragon</b> (<i>«Перший писар»</i>) · <b>105 очк.</b>",
      "🏆 перемога · виплата <b>69 зол.</b>",
      "",
      "<b>Shannar de Kassal</b> (<i>«Табуретник»</i>) · <b>63 очк.</b>",
      "💀 поразка"
    ].join("\n"));
  });

  it("renders social scorecard starts with the viewer's own scorecard", () => {
    const firstState = {
      ...startScorecardDicePoker("scorecard-social-first"),
      dice: [1, 1, 1, 3, 4]
    };
    const secondState = {
      ...startScorecardDicePoker("scorecard-social-second"),
      dice: [6, 6, 6, 5, 4]
    };
    const tableSession = session({
      status: "ready",
      result: {
        kind: "dice_poker_table",
        mode: "scorecard",
        phase: "playing",
        playerCap: 8,
        drawRound: 1
      },
      participants: [
        participant({ characterId: "character-1", telegramUserId: 1001n, status: "joined", decision: firstState }),
        participant({ characterId: "character-2", telegramUserId: 2002n, status: "joined", decision: secondState })
      ]
    });

    const text = presentTavernGameActionResult({
      state: "started",
      session: tableSession,
      viewerTelegramUserId: 1001n
    });

    expect(text).toContain("📜 Табличні кості");
    expect(text).toContain("Кості: 1 1 1 3 4");
    expect(text).toContain("Одиниці 3");
    expect(text).not.toContain("6 6 6 5 4");
    expect(text).not.toContain("Партія йде");
  });

  it("fails stale legacy dice callbacks closed with friendly copy", () => {
    expect(presentTavernGameActionResult({ state: "stale" })).toContain("Стара кнопка від старих костей");
  });

  it("replays stored terminal Dice Poker cards instead of legacy stale copy", () => {
    const state: DicePokerState = {
      kind: "dice_poker",
      mode: "quick",
      phase: "terminal",
      outcome: "loss",
      drawRound: 1,
      playerDice: [1, 2, 3, 4, 6],
      opponentDice: [6, 6, 3, 2, 1],
      playerHand: evaluateQuickHand([1, 2, 3, 4, 6]),
      opponentHand: evaluateQuickHand([6, 6, 3, 2, 1]),
      reason: "Пара сильніша."
    };

    const text = presentTavernGameActionResult({
      state: "stale",
      session: session({
        status: "completed",
        result: {
          kind: "dice_poker",
          outcome: "loss",
          state
        },
        participants: [participant({ payoutGold: 0, refundedGold: 0, stakeGold: 5 })]
      })
    });

    expect(text).toContain("⚡ Швидкі кості");
    expect(text).toContain("Кості Допельґанґера");
    expect(text).toContain("💸 Ставка програна: <b>5 зол.</b>");
    expect(text).not.toContain("Стара кнопка від старих костей");
  });

  it("does not present legacy create cooldown as an active pause", () => {
    const text = presentTavernGameActionResult({
      state: "cooldown",
      availableAt: new Date("2026-07-02T10:03:01.000Z"),
      now: new Date("2026-07-02T10:00:00.000Z")
    });

    expect(text).toContain("Стіл уже можна відкривати без паузи.");
    expect(text).not.toContain("Новий стіл ще на паузі.");
    expect(text).not.toContain("Спробуйте ще раз за");
  });

  it("does not suggest a real midnight self-play mode for Tavlei", () => {
    const text = presentTavernGameActionResult({ state: "self-join" });

    expect(text).toContain("потрібен інший пригодник");
    expect(text).toContain("Власна тінь");
    expect(text).not.toContain("опівноч");
  });

  it("shows tavern game leaderboard for day week and month", () => {
    const text = presentTavernGameLeaderboard({
      state: "ready",
      leaderboard: {
        day: [{
          characterId: "character-1",
          name: "<b>Дара</b>",
          activeCosmeticTitle: "Перший <стіл>",
          winCount: 2,
          drawCount: 1,
          lossCount: 5
        }],
        week: [],
        month: [{ characterId: "character-2", name: "Нестор", winCount: 11, drawCount: 12, lossCount: 14 }]
      }
    });

    expect(text).toContain("🏆 Рейтинг ігор за столом");
    expect(text).toContain("Корчмар рахує завершені тавлеї та кості");
    expect(text).toContain("<b>За добу</b>:");
    expect(text).toContain("1. &lt;b&gt;Дара&lt;/b&gt; (<i>«Перший &lt;стіл&gt;»</i>) — 2 перемоги, 1 нічия, 5 поразок");
    expect(text).toContain("<b>За тиждень</b>: ще ніхто не дограв");
    expect(text).toContain("1. Нестор — 11 перемог, 12 нічиїх, 14 поразок");
    expect(text).not.toContain("<b>Дара</b>");
  });

  it("renders Tavlei against the Doppelganger without pretending the fallback opponent receives a payout", () => {
    const text = presentTavernGameActionResult({
      state: "resolved",
      session: session({
        gameKey: "tavlei",
        participants: [participant({ payoutGold: 0, refundedGold: 0, stakeGold: 13 })]
      }),
      resolution: {
        gameKey: "tavlei",
        outcome: "win",
        opponentKind: "doppelganger",
        potGold: 13,
        payouts: { "__doppelganger__": 13 },
        refunds: {},
        players: [
          {
            participantId: "participant-1",
            characterId: "character-1",
            name: "Тест",
            tactic: "quiet_trap"
          },
          {
            participantId: "doppelganger",
            characterId: "__doppelganger__",
            name: "Сумлінний Допельґанґер",
            tactic: "sharp_opening"
          }
        ],
        winnerCharacterId: "__doppelganger__",
        winnerName: "Сумлінний Допельґанґер",
        loserName: "Тест",
        narrativeKey: "sharp_opening:quiet_trap"
      }
    });

    expect(text).toContain("♟ Тавлеї з Допельґанґером завершено.");
    expect(text).toContain("💀 Поразка.");
    expect(text).toContain("💸 Ставка програна: <b>13 зол.</b>");
    expect(text).not.toContain("Виграш");
  });
});

function session(overrides: Partial<TavernGameSessionRecord> = {}): TavernGameSessionRecord {
  const character = {
    id: "character-1",
    userId: "user-1",
    telegramUserId: 42n,
    currentLocationId: "location.korchma.bar",
    name: "Тест",
    pronoun: "they" as const,
    path: "path",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 0,
    gold: 10,
    hpCurrent: 10,
    hpMax: 10,
    manaCurrent: 5,
    manaMax: 5,
    hpRegenAt: null,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: {},
    remortCount: 0
  };
  const baseParticipant = participant();

  return {
    id: "session-1",
    token: "12345678-1234-4234-9234-123456789abc",
    gameKey: "kosti",
    status: "completed",
    creatorCharacterId: character.id,
    stakeGold: 3,
    potGold: 3,
    seed: "seed",
    rulesVersion: "dice-poker-v1",
    result: null,
    openedAt: new Date("2026-07-02T10:00:00.000Z"),
    joinExpiresAt: new Date("2026-07-02T10:05:00.000Z"),
    decisionExpiresAt: new Date("2026-07-02T10:05:00.000Z"),
    completedAt: new Date("2026-07-02T10:01:00.000Z"),
    createdAt: new Date("2026-07-02T10:00:00.000Z"),
    updatedAt: new Date("2026-07-02T10:01:00.000Z"),
    creator: character,
    participants: [baseParticipant],
    ...overrides
  };
}

function participant(
  overrides: Partial<TavernGameSessionRecord["participants"][number]> = {}
): TavernGameSessionRecord["participants"][number] {
  const character = {
    id: "character-1",
    userId: "user-1",
    telegramUserId: 42n,
    currentLocationId: "location.korchma.bar",
    name: "Тест",
    pronoun: "they" as const,
    path: "path",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 0,
    gold: 10,
    hpCurrent: 10,
    hpMax: 10,
    manaCurrent: 5,
    manaMax: 5,
    hpRegenAt: null,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: {},
    remortCount: 0
  };

  return {
    id: "participant-1",
    sessionId: "session-1",
    characterId: character.id,
    telegramUserId: 42n,
    displayName: "Тест",
    remortCount: 0,
    status: "completed" as const,
    stakeGold: 3,
    payoutGold: 3,
    refundedGold: 0,
    decision: null,
    result: null,
    joinedAt: new Date("2026-07-02T10:00:00.000Z"),
    decidedAt: null,
    completedAt: new Date("2026-07-02T10:01:00.000Z"),
    character,
    ...overrides
  };
}
