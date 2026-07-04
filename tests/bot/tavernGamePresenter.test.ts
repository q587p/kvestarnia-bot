import { describe, expect, it } from "vitest";
import type { TavernGameSessionRecord } from "../../src/db/repositories/tavernGameRepository";
import {
  presentDicePokerRules,
  presentTavernGameActionResult,
  presentTavernGameLeaderboard,
  presentTavernGameRules
} from "../../src/bot/presenters/tavernGamePresenter";
import { evaluateQuickHand, type DicePokerState } from "../../src/domain/dicePoker";

describe("tavern game presenter", () => {
  it("describes Kosti as clear dice poker modes", () => {
    const text = presentTavernGameRules("kosti", 25);

    expect(text).toContain("🎲 Кості й покер");
    expect(text).toContain("⚡ Швидкі кості");
    expect(text).toContain("📜 Табличні кості");
    expect(text).toContain("Ставку корчма спитає наступним кроком");
    expect(text).not.toContain("від двох до семи гравців");
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

  it("fails stale legacy dice callbacks closed with friendly copy", () => {
    expect(presentTavernGameActionResult({ state: "stale" })).toContain("Стара кнопка від старих костей");
  });

  it("explains create cooldown without implying an open table exists", () => {
    const text = presentTavernGameActionResult({
      state: "cooldown",
      availableAt: new Date("2026-07-02T10:03:01.000Z"),
      now: new Date("2026-07-02T10:00:00.000Z")
    });

    expect(text).toContain("Новий стіл ще на паузі.");
    expect(text).toContain("обмеження на створення нових столів");
    expect(text).toContain("не ознака, що десь уже відкрита партія");
    expect(text).toContain("Спробуйте ще раз за 4 хвилини.");
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
