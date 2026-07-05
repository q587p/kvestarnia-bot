import { describe, expect, it } from "vitest";
import type {
  DicePokerActionResult,
  TavernGameRepository,
  TavernGameSessionRecord
} from "../../src/db/repositories/tavernGameRepository";
import { DICE_POKER_SCORECARD_TTL_MS, TavernGameService } from "../../src/services/tavernGameService";
import {
  DICE_POKER_QUICK_SOCIAL_TTL_MS,
  DICE_POKER_RULES_VERSION,
  DICE_POKER_SCORE_CATEGORIES,
  DICE_POKER_SCORECARD_PLAYER_CAP,
  startDicePokerTable,
  startQuickDicePoker,
  startScorecardDicePoker,
  type DicePokerScoreCategory,
  type DicePokerState
} from "../../src/domain/dicePoker";
import {
  TAVLEI_DOPPELGANGER_CHARACTER_ID,
  TAVLEI_DOPPELGANGER_NAME
} from "../../src/domain/tavernGames";

const now = new Date("2026-07-02T10:00:00.000Z");

describe("TavernGameService", () => {
  it("keeps tavern games hidden by default", async () => {
    const repository = new FakeTavernGameRepository();
    const service = new TavernGameService(repository, config(), () => now);

    expect(service.isEnabled()).toBe(false);
    expect(await service.getHub()).toEqual({ state: "disabled" });
    expect(repository.listOpenCalls).toBe(0);
  });

  it("lists open tables when global and per-game flags are enabled", async () => {
    const repository = new FakeTavernGameRepository({
      openTables: [session()],
      character: { ...session().creator, gold: 42 }
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true
    }), () => now);

    const result = await service.getHub(42n);

    expect(result).toMatchObject({
      state: "ready",
      maxStake: 93,
      tavleiEnabled: true,
      kostiEnabled: false,
      doppelgangerAvailable: false,
      character: { gold: 42 }
    });
    expect(result.state === "ready" ? result.openTables : []).toHaveLength(1);
  });

  it("filters disabled game tables out of the hub", async () => {
    const repository = new FakeTavernGameRepository({
      openTables: [
        session({ id: "session-tavlei", gameKey: "tavlei" }),
        session({ id: "session-kosti", gameKey: "kosti" })
      ]
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true,
      tavernGameKostiEnabled: false
    }), () => now);

    const result = await service.getHub();

    expect(result.state === "ready" ? result.openTables.map((table) => table.gameKey) : []).toEqual(["tavlei"]);
  });

  it("passes bounded create inputs to the repository", async () => {
    const repository = new FakeTavernGameRepository();
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true,
      tavernGameMaxStake: 13,
      tavernGameCreateCooldownSec: 42
    }), () => now);

    await service.createForTelegramUser(42n, "tavlei", 3);

    expect(repository.lastCreateInput).toMatchObject({
      gameKey: "tavlei",
      stakeGold: 3,
      maxStake: 13,
      cooldownMs: 0,
      now
    });
    expect(repository.lastCreateInput?.joinExpiresAt.toISOString()).toBe("2026-07-02T10:13:00.000Z");
  });

  it("blocks disabled per-game create before repository mutation", async () => {
    const repository = new FakeTavernGameRepository();
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true,
      tavernGameKostiEnabled: false
    }), () => now);

    const result = await service.createForTelegramUser(42n, "kosti", 3);

    expect(result).toEqual({ state: "game-disabled", gameKey: "kosti" });
    expect(repository.lastCreateInput).toBeNull();
  });

  it("refunds a stale token table when that game is disabled before joining", async () => {
    const existing = session({ gameKey: "kosti", token: "12345678-1234-4234-9234-000000000321" });
    const repository = new FakeTavernGameRepository({ tokenSession: existing });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true,
      tavernGameKostiEnabled: false
    }), () => now);

    const result = await service.joinByTokenForTelegramUser(42n, existing.token);

    expect(result).toEqual({ state: "game-disabled-refunded", gameKey: "kosti", session: existing });
    expect(repository.refundDisabledCalls).toBe(1);
    expect(repository.joinCalls).toBe(0);
  });

  it("creates quick dice poker through the Kosti entry point", async () => {
    const repository = new FakeTavernGameRepository();
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true,
      tavernGameMaxStake: 23,
      tavernGameCreateCooldownSec: 42
    }), () => now);

    await service.createDicePokerForTelegramUser(42n, "quick", 13);

    expect(repository.lastDicePokerCreateInput).toMatchObject({
      stakeGold: 13,
      maxStake: 23,
      cooldownMs: 0,
      status: "open",
      decisionExpiresAt: null,
      now
    });
    expect(repository.lastDicePokerCreateInput?.state).toMatchObject({
      kind: "dice_poker_table",
      mode: "quick",
      phase: "waiting",
      playerCap: 8
    });
    expect(repository.lastDicePokerCreateInput?.participantState).toMatchObject({
      kind: "dice_poker",
      mode: "quick",
      phase: "quick-reroll"
    });
    expect(repository.lastDicePokerCreateInput?.joinExpiresAt?.toISOString()).toBe("2026-07-02T10:13:00.000Z");
  });

  it("creates scorecard dice poker as a social table with a longer action deadline constant", async () => {
    const repository = new FakeTavernGameRepository();
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    await service.createDicePokerForTelegramUser(42n, "scorecard", 13);

    expect(repository.lastDicePokerCreateInput?.state).toMatchObject({
      kind: "dice_poker_table",
      mode: "scorecard",
      phase: "waiting",
      playerCap: DICE_POKER_SCORECARD_PLAYER_CAP
    });
    expect(repository.lastDicePokerCreateInput?.joinExpiresAt?.toISOString()).toBe("2026-07-02T10:13:00.000Z");
    expect(repository.lastDicePokerCreateInput?.decisionExpiresAt).toBeNull();
    expect(DICE_POKER_SCORECARD_TTL_MS).toBe(93 * 60_000);
  });

  it("blocks daytime Doppelganger dice poker before reserving a stake", async () => {
    const repository = new FakeTavernGameRepository();
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.createDicePokerWithDoppelgangerForTelegramUser(42n, "quick", 13);

    expect(result).toEqual({ state: "blocked", reason: "doppelganger-at-fighting-corner" });
    expect(repository.lastDicePokerCreateInput).toBeNull();
  });

  it("allows Doppelganger dice poker at night in Shynok", async () => {
    const repository = new FakeTavernGameRepository();
    const night = new Date("2026-07-02T20:00:00.000Z");
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => night);

    const result = await service.createDicePokerWithDoppelgangerForTelegramUser(42n, "quick", 13);

    expect(result.state).toBe("created");
    expect(repository.lastDicePokerCreateInput).toMatchObject({
      stakeGold: 13,
      now: night
    });
    expect(repository.lastDicePokerCreateInput?.expiresAt.toISOString()).toBe("2026-07-02T20:03:00.000Z");
    expect(repository.lastDicePokerCreateInput?.state).toMatchObject({
      kind: "dice_poker",
      mode: "quick"
    });
  });

  it("passes a three-minute quick social start deadline on table joins", async () => {
    const repository = new FakeTavernGameRepository();
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    await service.joinByTokenForTelegramUser(42n, "12345678-1234-4234-9234-000000000777");

    expect(repository.lastJoinInput?.decisionExpiresAt.toISOString()).toBe("2026-07-02T10:05:00.000Z");
    expect(repository.lastJoinInput?.quickStartExpiresAt.toISOString()).toBe("2026-07-02T10:03:00.000Z");
    expect(DICE_POKER_QUICK_SOCIAL_TTL_MS).toBe(3 * 60_000);
  });

  it("blocks daytime Doppelganger Tavlei before reserving a stake", async () => {
    const repository = new FakeTavernGameRepository();
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true
    }), () => now);

    const result = await service.createTavleiWithDoppelgangerForTelegramUser(42n, 13);

    expect(result).toEqual({ state: "blocked", reason: "doppelganger-at-fighting-corner" });
    expect(repository.lastTavleiDoppelgangerCreateInput).toBeNull();
  });

  it("allows Doppelganger Tavlei at night in Shynok", async () => {
    const repository = new FakeTavernGameRepository();
    const night = new Date("2026-07-02T20:00:00.000Z");
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true,
      tavernGameCreateCooldownSec: 42
    }), () => night);

    const result = await service.createTavleiWithDoppelgangerForTelegramUser(42n, 13);

    expect(result.state).toBe("created");
    expect(repository.lastTavleiDoppelgangerCreateInput).toMatchObject({
      stakeGold: 13,
      cooldownMs: 0,
      now: night,
      state: { kind: "tavlei_doppelganger", opponent: "doppelganger" }
    });
    expect(repository.lastTavleiDoppelgangerCreateInput?.expiresAt.toISOString()).toBe("2026-07-02T20:05:00.000Z");
  });

  it("refunds old incompatible Kosti sessions before legacy decisions", async () => {
    const existing = session({
      gameKey: "kosti",
      rulesVersion: "tavern-games-v1",
      token: "12345678-1234-4234-9234-000000000421"
    });
    const repository = new FakeTavernGameRepository({ tokenSession: existing });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.submitKostiDecisionForTelegramUser(42n, existing.token, "steady", "no_sign");

    expect(result).toEqual({ state: "game-disabled-refunded", gameKey: "kosti", session: existing });
    expect(repository.refundDisabledCalls).toBe(1);
    expect(repository.submitDecisionCalls).toBe(0);
  });

  it("refunds old incompatible Kosti sessions before direct join callbacks", async () => {
    const existing = session({
      gameKey: "kosti",
      rulesVersion: "tavern-games-v1",
      token: "12345678-1234-4234-9234-000000000425"
    });
    const repository = new FakeTavernGameRepository({ tokenSession: existing });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.joinByTokenForTelegramUser(43n, existing.token);

    expect(result).toEqual({ state: "game-disabled-refunded", gameKey: "kosti", session: existing });
    expect(repository.refundDisabledCalls).toBe(1);
    expect(repository.joinCalls).toBe(0);
  });

  it("allows invite views for creators on open Tavlei and Dice Poker tables", async () => {
    const player = participant("character-creator", 42n, "Тест", { status: "joined" });
    const tavlei = session({
      token: "12345678-1234-4234-9234-000000000431",
      gameKey: "tavlei",
      status: "open",
      creatorCharacterId: player.characterId,
      joinExpiresAt: new Date(now.getTime() + 60_000),
      participants: [player]
    });
    const scorecard = session({
      token: "12345678-1234-4234-9234-000000000432",
      gameKey: "kosti",
      status: "open",
      creatorCharacterId: player.characterId,
      rulesVersion: DICE_POKER_RULES_VERSION,
      result: startDicePokerTable("scorecard"),
      joinExpiresAt: new Date(now.getTime() + 60_000),
      participants: [player]
    });
    const tavleiService = new TavernGameService(new FakeTavernGameRepository({ tokenSession: tavlei }), config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true
    }), () => now);
    const scorecardService = new TavernGameService(new FakeTavernGameRepository({ tokenSession: scorecard }), config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    expect(await tavleiService.getInviteViewForTelegramUser(42n, tavlei.token)).toEqual({
      state: "ready",
      session: tavlei
    });
    expect(await scorecardService.getInviteViewForTelegramUser(42n, scorecard.token)).toEqual({
      state: "ready",
      session: scorecard
    });
  });

  it("does not expose invite views to outsiders or already-started tables", async () => {
    const player = participant("character-creator", 42n, "Тест", { status: "joined" });
    const waiting = session({
      token: "12345678-1234-4234-9234-000000000433",
      gameKey: "kosti",
      status: "open",
      creatorCharacterId: player.characterId,
      rulesVersion: DICE_POKER_RULES_VERSION,
      result: startDicePokerTable("quick"),
      participants: [player]
    });
    const playing = session({
      ...waiting,
      token: "12345678-1234-4234-9234-000000000434",
      result: { ...startDicePokerTable("quick"), phase: "playing" as const }
    });
    const outsiderService = new TavernGameService(new FakeTavernGameRepository({ tokenSession: waiting }), config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);
    const playingService = new TavernGameService(new FakeTavernGameRepository({ tokenSession: playing }), config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    expect(await outsiderService.getInviteViewForTelegramUser(43n, waiting.token)).toEqual({
      state: "not-participant",
      session: waiting
    });
    expect(await playingService.getInviteViewForTelegramUser(42n, playing.token)).toEqual({
      state: "stale",
      session: playing
    });
  });

  it("does not expose invite views to seated non-creators", async () => {
    const creator = participant("character-creator", 42n, "Тест", { status: "joined" });
    const joiner = participant("character-joiner", 43n, "Другий", { status: "joined" });
    const waiting = session({
      token: "12345678-1234-4234-9234-000000000435",
      gameKey: "kosti",
      status: "open",
      creatorCharacterId: creator.characterId,
      rulesVersion: DICE_POKER_RULES_VERSION,
      result: startDicePokerTable("scorecard"),
      participants: [creator, joiner]
    });
    const service = new TavernGameService(new FakeTavernGameRepository({ tokenSession: waiting }), config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    expect(await service.getInviteViewForTelegramUser(43n, waiting.token)).toEqual({
      state: "not-creator",
      session: waiting
    });
  });

  it("keeps expired invite preview passive without refunding or expiring the table", async () => {
    const player = participant("character-creator", 42n, "Тест", { status: "joined" });
    const waiting = session({
      token: "12345678-1234-4234-9234-000000000436",
      gameKey: "kosti",
      status: "open",
      creatorCharacterId: player.characterId,
      rulesVersion: DICE_POKER_RULES_VERSION,
      result: startDicePokerTable("quick"),
      joinExpiresAt: new Date(now.getTime() - 1000),
      participants: [player]
    });
    const repository = new FakeTavernGameRepository({ tokenSession: waiting });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    expect(await service.getInviteViewForTelegramUser(42n, waiting.token)).toEqual({
      state: "stale",
      session: waiting
    });
    expect(repository.peekCalls).toBe(1);
    expect(repository.getByTokenCalls).toBe(0);
    expect(repository.refundDisabledCalls).toBe(0);
  });

  it("refunds an old incompatible active Kosti session before starting dice poker", async () => {
    const existing = session({
      gameKey: "kosti",
      rulesVersion: "tavern-games-v1",
      token: "12345678-1234-4234-9234-000000000424"
    });
    const repository = new FakeTavernGameRepository({
      createResult: { state: "active-session", session: existing },
      tokenSession: existing
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.createDicePokerForTelegramUser(42n, "quick", 3);

    expect(result).toEqual({ state: "game-disabled-refunded", gameKey: "kosti", session: existing });
    expect(repository.refundDisabledCalls).toBe(1);
  });

  it("quick dice poker resolves once and completes through the repository", async () => {
    const token = "12345678-1234-4234-9234-000000000422";
    const quick = startQuickDicePoker("quick-win");
    const repository = new FakeTavernGameRepository({
      tokenSession: session({
        token,
        gameKey: "kosti",
        status: "ready",
        rulesVersion: DICE_POKER_RULES_VERSION,
        seed: "quick-win",
        result: {
          ...quick,
          playerDice: [6, 6, 6, 6, 6],
          opponentDice: [1, 2, 3, 4, 5],
          selectedMask: 0
        }
      })
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.rollDicePokerForTelegramUser(42n, token);

    expect(result.state).toBe("completed");
    expect(repository.completeDicePokerCalls).toBe(1);
    expect(repository.lastCompleteInput).toMatchObject({
      outcome: "win",
      payoutGold: 3,
      refundedGold: 0
    });
  });

  it("stores high scorecard completion as a win", async () => {
    const token = "12345678-1234-4234-9234-000000000427";
    const scorecard = nearTerminalScorecard("scorecard-high", 20);
    const repository = new FakeTavernGameRepository({
      tokenSession: session({
        token,
        gameKey: "kosti",
        status: "ready",
        rulesVersion: DICE_POKER_RULES_VERSION,
        result: scorecard
      })
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    await service.scoreScorecardCategoryForTelegramUser(42n, token, "chance");

    expect(repository.lastCompleteInput).toMatchObject({
      outcome: "win",
      payoutGold: 3,
      refundedGold: 0
    });
  });

  it("stores lower scorecard completion as a safe draw refund", async () => {
    const token = "12345678-1234-4234-9234-000000000428";
    const scorecard = nearTerminalScorecard("scorecard-low", 0);
    const repository = new FakeTavernGameRepository({
      tokenSession: session({
        token,
        gameKey: "kosti",
        status: "ready",
        rulesVersion: DICE_POKER_RULES_VERSION,
        result: scorecard
      })
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    await service.scoreScorecardCategoryForTelegramUser(42n, token, "chance");

    expect(repository.lastCompleteInput).toMatchObject({
      outcome: "draw",
      payoutGold: 0,
      refundedGold: 3
    });
  });

  it("does not reroll scorecard dice after the third roll", async () => {
    const token = "12345678-1234-4234-9234-000000000423";
    const scorecard = {
      ...startScorecardDicePoker("scorecard-third"),
      roll: 3
    };
    const repository = new FakeTavernGameRepository({
      tokenSession: session({
        token,
        gameKey: "kosti",
        status: "ready",
        rulesVersion: DICE_POKER_RULES_VERSION,
        result: scorecard
      })
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.rollDicePokerForTelegramUser(42n, token);

    expect(result).toMatchObject({ state: "saved", dicePoker: scorecard });
    expect(repository.saveDicePokerCalls).toBe(0);
  });

  it("refreshes scorecard deadline on valid state-changing actions", async () => {
    const token = "12345678-1234-4234-9234-000000000426";
    const scorecard = {
      ...startScorecardDicePoker("scorecard-refresh"),
      selectedMask: 1
    };
    const repository = new FakeTavernGameRepository({
      tokenSession: session({
        token,
        gameKey: "kosti",
        status: "ready",
        rulesVersion: DICE_POKER_RULES_VERSION,
        result: scorecard
      })
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    await service.rollDicePokerForTelegramUser(42n, token);

    expect(repository.lastSaveInput?.expiresAt?.toISOString()).toBe("2026-07-02T11:33:00.000Z");
  });

  it("returns an active dice poker session for rules back navigation without mutating state", async () => {
    const token = "12345678-1234-4234-9234-000000000429";
    const quick = startQuickDicePoker("quick-view");
    const repository = new FakeTavernGameRepository({
      tokenSession: session({
        token,
        gameKey: "kosti",
        status: "ready",
        rulesVersion: DICE_POKER_RULES_VERSION,
        result: quick,
        participants: [participant("character-1", 42n, "Тест", { status: "joined" })]
      })
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.viewDicePokerForTelegramUser(42n, token);

    expect(result).toMatchObject({ state: "saved", dicePoker: quick });
    expect(repository.saveDicePokerCalls).toBe(0);
    expect(repository.completeDicePokerCalls).toBe(0);
  });

  it("keeps the legacy tavern game dev reset as a no-op after cooldown removal", async () => {
    const repository = new FakeTavernGameRepository({
      character: { ...session().creator, gold: 42 },
      resetCreateCooldownResult: { state: "reset", updated: 2 }
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true,
      tavernGameKostiEnabled: true,
      tavernGameCreateCooldownSec: 120
    }), () => now);

    const result = await service.resetCreateCooldownForDev(42n);

    expect(result).toEqual({ state: "reset", updated: 0 });
    expect(repository.lastResetCreateCooldownInput).toBeNull();
  });

  it("creates a rematch table from a completed social dice poker table and returns invitees", async () => {
    const previous = session({
      gameKey: "kosti",
      status: "completed",
      stakeGold: 13,
      token: "12345678-1234-4234-9234-000000000430",
      rulesVersion: DICE_POKER_RULES_VERSION,
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
        participant("character-1", 42n, "Перша", { status: "completed" }),
        participant("character-2", 43n, "Другий", { status: "completed" })
      ]
    });
    const repository = new FakeTavernGameRepository({ tokenSession: previous });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.createRematchForTelegramUser(42n, previous.token);

    expect(result.state).toBe("created");
    expect(repository.lastDicePokerCreateInput).toMatchObject({
      mode: "quick",
      stakeGold: 13,
      status: "open",
      cooldownMs: 0
    });
    expect(result.rematchInvitees).toEqual([{ telegramUserId: 43n, displayName: "Другий" }]);
  });

  it("starts a Doppelganger rematch from stored terminal Dice Poker result without invitees", async () => {
    const previousState = {
      ...startQuickDicePoker("doppel-rematch"),
      phase: "terminal" as const,
      outcome: "loss" as const,
      playerHand: { rank: "high" as const, tieBreak: [6, 5, 4, 3, 2] },
      opponentHand: { rank: "pair" as const, tieBreak: [6, 5, 4, 3] },
      reason: "Пара сильніша."
    };
    const previous = session({
      gameKey: "kosti",
      status: "completed",
      stakeGold: 5,
      token: "12345678-1234-4234-9234-000000000431",
      rulesVersion: DICE_POKER_RULES_VERSION,
      result: {
        kind: "dice_poker",
        outcome: "loss",
        state: previousState
      },
      participants: [participant("character-1", 42n, "Тест", { status: "completed" })]
    });
    const night = new Date("2026-07-02T20:00:00.000Z");
    const repository = new FakeTavernGameRepository({ tokenSession: previous });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => night);

    const result = await service.createRematchForTelegramUser(42n, previous.token);

    expect(result.state).toBe("created");
    expect(repository.lastDicePokerCreateInput).toMatchObject({
      mode: "quick",
      stakeGold: 5,
      cooldownMs: 0
    });
    expect(result).not.toHaveProperty("rematchInvitees");
  });

  it("blocks a daytime Doppelganger rematch without reserving a stake", async () => {
    const previousState = {
      ...startQuickDicePoker("doppel-rematch-day"),
      phase: "terminal" as const,
      outcome: "win" as const,
      playerHand: { rank: "pair" as const, tieBreak: [6, 5, 4, 3] },
      opponentHand: { rank: "high" as const, tieBreak: [6, 5, 4, 3, 2] },
      reason: "Пара сильніша."
    };
    const previous = session({
      gameKey: "kosti",
      status: "completed",
      stakeGold: 5,
      token: "12345678-1234-4234-9234-000000000432",
      rulesVersion: DICE_POKER_RULES_VERSION,
      result: {
        kind: "dice_poker",
        outcome: "win",
        state: previousState
      },
      participants: [participant("character-1", 42n, "Тест", { status: "completed" })]
    });
    const day = new Date("2026-07-02T10:00:00.000Z");
    const repository = new FakeTavernGameRepository({ tokenSession: previous });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => day);

    const result = await service.createRematchForTelegramUser(42n, previous.token);

    expect(result).toEqual({ state: "blocked", reason: "doppelganger-at-fighting-corner" });
    expect(repository.lastDicePokerCreateInput).toBeNull();
    expect(result).not.toHaveProperty("rematchInvitees");
  });

  it("builds day week and month leaderboards from completed tables", async () => {
    const alice = participant("character-a", 101n, "Аля");
    const bob = participant("character-b", 102n, "Боб");
    const chub = participant("character-c", 103n, "Чуб");
    const repository = new FakeTavernGameRepository({
      completedTables: [
        session({
          id: "kosti-day",
          gameKey: "kosti",
          status: "completed",
          completedAt: new Date("2026-07-02T09:00:00.000Z"),
          result: {
            gameKey: "kosti",
            outcome: "completed",
            players: [
              { characterId: alice.characterId },
              { characterId: bob.characterId }
            ],
            mainWinnerCharacterId: alice.characterId
          },
          participants: [alice, bob]
        }),
        session({
          id: "tavlei-week",
          gameKey: "tavlei",
          status: "completed",
          completedAt: new Date("2026-06-30T09:00:00.000Z"),
          result: {
            gameKey: "tavlei",
            outcome: "draw",
            players: [
              { characterId: alice.characterId },
              { characterId: chub.characterId }
            ]
          },
          participants: [alice, chub]
        }),
        session({
          id: "tavlei-month",
          gameKey: "tavlei",
          status: "completed",
          completedAt: new Date("2026-06-22T09:00:00.000Z"),
          result: {
            gameKey: "tavlei",
            outcome: "win",
            players: [
              { characterId: alice.characterId },
              { characterId: chub.characterId }
            ],
            winnerCharacterId: chub.characterId
          },
          participants: [alice, chub]
        })
      ]
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.getLeaderboard();

    expect(result.state).toBe("ready");
    expect(result.state === "ready" ? result.leaderboard.day : []).toEqual([
      { characterId: "character-a", name: "Аля", winCount: 1, drawCount: 0, lossCount: 0 },
      { characterId: "character-b", name: "Боб", winCount: 0, drawCount: 0, lossCount: 1 }
    ]);
    expect(result.state === "ready" ? result.leaderboard.week : []).toEqual([
      { characterId: "character-a", name: "Аля", winCount: 1, drawCount: 1, lossCount: 0 },
      { characterId: "character-c", name: "Чуб", winCount: 0, drawCount: 1, lossCount: 0 },
      { characterId: "character-b", name: "Боб", winCount: 0, drawCount: 0, lossCount: 1 }
    ]);
    expect(result.state === "ready" ? result.leaderboard.month : []).toEqual([
      { characterId: "character-c", name: "Чуб", winCount: 1, drawCount: 1, lossCount: 0 },
      { characterId: "character-a", name: "Аля", winCount: 1, drawCount: 1, lossCount: 1 },
      { characterId: "character-b", name: "Боб", winCount: 0, drawCount: 0, lossCount: 1 }
    ]);
    expect(repository.lastCompletedSince?.toISOString()).toBe("2026-06-01T10:00:00.000Z");
  });

  it("counts completed dice poker outcomes in leaderboards", async () => {
    const quickWinner = participant("character-quick-win", 201n, "Перша");
    const quickLoser = participant("character-quick-loss", 202n, "Другий");
    const quickDrawer = participant("character-quick-draw", 203n, "Третя");
    const scorecardWinner = participant("character-scorecard-win", 204n, "Четверта");
    const repository = new FakeTavernGameRepository({
      completedTables: [
        dicePokerSession("dice-quick-win", quickWinner, "win"),
        dicePokerSession("dice-quick-loss", quickLoser, "loss"),
        dicePokerSession("dice-quick-draw", quickDrawer, "draw"),
        dicePokerSession("dice-scorecard-win", scorecardWinner, "win")
      ]
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameKostiEnabled: true
    }), () => now);

    const result = await service.getLeaderboard();

    expect(result.state === "ready" ? result.leaderboard.day : []).toEqual([
      {
        characterId: TAVLEI_DOPPELGANGER_CHARACTER_ID,
        name: TAVLEI_DOPPELGANGER_NAME,
        winCount: 1,
        drawCount: 1,
        lossCount: 2
      },
      { characterId: "character-quick-win", name: "Перша", winCount: 1, drawCount: 0, lossCount: 0 },
      { characterId: "character-scorecard-win", name: "Четверта", winCount: 1, drawCount: 0, lossCount: 0 },
      { characterId: "character-quick-draw", name: "Третя", winCount: 0, drawCount: 1, lossCount: 0 },
      { characterId: "character-quick-loss", name: "Другий", winCount: 0, drawCount: 0, lossCount: 1 }
    ]);
  });

  it("counts the Doppelganger from completed Tavlei fallback outcomes", async () => {
    const playerWinner = participant("character-tavlei-win", 301n, "Переможниця");
    const playerLoser = participant("character-tavlei-loss", 302n, "Програвець");
    const playerDrawer = participant("character-tavlei-draw", 303n, "Нічийник");
    const repository = new FakeTavernGameRepository({
      completedTables: [
        tavleiDoppelgangerSession("tavlei-player-win", playerWinner, "win"),
        tavleiDoppelgangerSession("tavlei-player-loss", playerLoser, "loss"),
        tavleiDoppelgangerSession("tavlei-player-draw", playerDrawer, "draw")
      ]
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true
    }), () => now);

    const result = await service.getLeaderboard();

    expect(result.state === "ready" ? result.leaderboard.day : []).toEqual([
      {
        characterId: TAVLEI_DOPPELGANGER_CHARACTER_ID,
        name: TAVLEI_DOPPELGANGER_NAME,
        winCount: 1,
        drawCount: 1,
        lossCount: 1
      },
      { characterId: "character-tavlei-win", name: "Переможниця", winCount: 1, drawCount: 0, lossCount: 0 },
      { characterId: "character-tavlei-draw", name: "Нічийник", winCount: 0, drawCount: 1, lossCount: 0 },
      { characterId: "character-tavlei-loss", name: "Програвець", winCount: 0, drawCount: 0, lossCount: 1 }
    ]);
  });
});

function config(overrides: Partial<ConstructorParameters<typeof TavernGameService>[1]> = {}): ConstructorParameters<typeof TavernGameService>[1] {
  return {
    tavernGamesEnabled: false,
    tavernGameTavleiEnabled: false,
    tavernGameKostiEnabled: false,
    tavernGameMaxStake: 93,
    tavernGameCreateCooldownSec: 60,
    ...overrides
  };
}

class FakeTavernGameRepository implements TavernGameRepository {
  listOpenCalls = 0;
  peekCalls = 0;
  getByTokenCalls = 0;
  joinCalls = 0;
  refundDisabledCalls = 0;
  submitDecisionCalls = 0;
  saveDicePokerCalls = 0;
  completeDicePokerCalls = 0;
  lastCreateInput: Parameters<TavernGameRepository["createForTelegramUser"]>[1] | null = null;
  lastDicePokerCreateInput: Parameters<TavernGameRepository["createDicePokerForTelegramUser"]>[1] | null = null;
  lastTavleiDoppelgangerCreateInput: Parameters<TavernGameRepository["createTavleiDoppelgangerForTelegramUser"]>[1] | null = null;
  lastJoinInput: Parameters<TavernGameRepository["joinByTokenForTelegramUser"]>[2] | null = null;
  lastCompleteInput: Parameters<TavernGameRepository["completeDicePokerForTelegramUser"]>[2] | null = null;
  lastSaveInput: {
    state: DicePokerState;
    now: Date;
    expiresAt?: Date;
  } | null = null;
  lastResetCreateCooldownInput: { now: Date; cooldownMs: number } | null = null;

  constructor(private readonly options: {
    openTables?: TavernGameSessionRecord[];
    completedTables?: TavernGameSessionRecord[];
    tokenSession?: TavernGameSessionRecord;
    character?: TavernGameSessionRecord["creator"];
    createResult?: Awaited<ReturnType<TavernGameRepository["createForTelegramUser"]>>;
    dicePokerActionResult?: DicePokerActionResult;
    resetCreateCooldownResult?: Awaited<ReturnType<TavernGameRepository["resetCreateCooldownForTelegramUser"]>>;
  } = {}) {}

  findCharacterByTelegramUser(): ReturnType<TavernGameRepository["findCharacterByTelegramUser"]> {
    return Promise.resolve(this.options.character ?? null);
  }

  listOpen(): Promise<TavernGameSessionRecord[]> {
    this.listOpenCalls += 1;
    return Promise.resolve(this.options.openTables ?? []);
  }

  lastCompletedSince: Date | null = null;

  listCompletedSince(since: Date): Promise<TavernGameSessionRecord[]> {
    this.lastCompletedSince = since;
    return Promise.resolve((this.options.completedTables ?? []).filter((table) =>
      table.completedAt !== null && table.completedAt >= since
    ));
  }

  peekByToken(): Promise<TavernGameSessionRecord | null> {
    this.peekCalls += 1;
    return Promise.resolve(this.options.tokenSession ?? null);
  }

  getByToken(): Promise<TavernGameSessionRecord | null> {
    this.getByTokenCalls += 1;
    return Promise.resolve(this.options.tokenSession ?? null);
  }

  createForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<TavernGameRepository["createForTelegramUser"]>[1]
  ): ReturnType<TavernGameRepository["createForTelegramUser"]> {
    this.lastCreateInput = input;
    return Promise.resolve(this.options.createResult ?? { state: "created", session: session() });
  }

  createDicePokerForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<TavernGameRepository["createDicePokerForTelegramUser"]>[1]
  ): ReturnType<TavernGameRepository["createDicePokerForTelegramUser"]> {
    this.lastDicePokerCreateInput = input;
    return Promise.resolve(this.options.createResult ?? {
      state: "created",
      session: session({
        gameKey: "kosti",
        status: "ready",
        rulesVersion: DICE_POKER_RULES_VERSION,
        seed: input.seed,
        result: input.state
      })
    });
  }

  createTavleiDoppelgangerForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<TavernGameRepository["createTavleiDoppelgangerForTelegramUser"]>[1]
  ): ReturnType<TavernGameRepository["createTavleiDoppelgangerForTelegramUser"]> {
    this.lastTavleiDoppelgangerCreateInput = input;
    return Promise.resolve(this.options.createResult ?? {
      state: "created",
      session: session({
        gameKey: "tavlei",
        status: "ready",
        rulesVersion: "tavlei-doppelganger-v1",
        seed: input.seed,
        result: input.state
      })
    });
  }

  joinByTokenForTelegramUser(
    _telegramUserId: bigint,
    _token: string,
    input: Parameters<TavernGameRepository["joinByTokenForTelegramUser"]>[2]
  ): ReturnType<TavernGameRepository["joinByTokenForTelegramUser"]> {
    this.joinCalls += 1;
    this.lastJoinInput = input;
    return Promise.resolve({ state: "joined", session: session() });
  }

  submitDecisionForTelegramUser(): ReturnType<TavernGameRepository["submitDecisionForTelegramUser"]> {
    this.submitDecisionCalls += 1;
    return Promise.reject(new Error("Not implemented in fake."));
  }

  resolveKostiForTelegramUser(): ReturnType<TavernGameRepository["resolveKostiForTelegramUser"]> {
    return Promise.reject(new Error("Not implemented in fake."));
  }

  cancelForTelegramUser(): ReturnType<TavernGameRepository["cancelForTelegramUser"]> {
    return Promise.reject(new Error("Not implemented in fake."));
  }

  saveDicePokerStateForTelegramUser(
    _telegramUserId: bigint,
    _token: string,
    state: DicePokerState,
    now: Date,
    expiresAt?: Date
  ): ReturnType<TavernGameRepository["saveDicePokerStateForTelegramUser"]> {
    this.saveDicePokerCalls += 1;
    this.lastSaveInput = { state, now, expiresAt };
    const saved = session({
      gameKey: "kosti",
      status: "ready",
      rulesVersion: DICE_POKER_RULES_VERSION,
      result: state
    });
    return Promise.resolve(this.options.dicePokerActionResult ?? { state: "saved", session: saved, dicePoker: state });
  }

  completeDicePokerForTelegramUser(
    _telegramUserId: bigint,
    _token: string,
    input: Parameters<TavernGameRepository["completeDicePokerForTelegramUser"]>[2]
  ): ReturnType<TavernGameRepository["completeDicePokerForTelegramUser"]> {
    this.completeDicePokerCalls += 1;
    this.lastCompleteInput = input;
    const completed = session({
      gameKey: "kosti",
      status: "completed",
      rulesVersion: DICE_POKER_RULES_VERSION,
      result: input.state
    });
    return Promise.resolve(this.options.dicePokerActionResult ?? {
      state: "completed",
      session: completed,
      dicePoker: input.state
    });
  }

  cancelDicePokerForTelegramUser(): ReturnType<TavernGameRepository["cancelDicePokerForTelegramUser"]> {
    return Promise.resolve({ state: "cancelled", session: session() });
  }

  resetCreateCooldownForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<TavernGameRepository["resetCreateCooldownForTelegramUser"]>[1]
  ): ReturnType<TavernGameRepository["resetCreateCooldownForTelegramUser"]> {
    this.lastResetCreateCooldownInput = input;
    return Promise.resolve(this.options.resetCreateCooldownResult ?? { state: "reset", updated: 0 });
  }

  refundDisabledByToken(): Promise<TavernGameSessionRecord | null> {
    this.refundDisabledCalls += 1;
    return Promise.resolve(this.options.tokenSession ?? null);
  }

  expireDue(): Promise<number> {
    return Promise.resolve(0);
  }
}

function participant(
  characterId: string,
  telegramUserId: bigint,
  displayName: string,
  overrides: Partial<TavernGameSessionRecord["participants"][number]> = {}
): TavernGameSessionRecord["participants"][number] {
  const character = {
    id: characterId,
    userId: `user-${characterId}`,
    telegramUserId,
    currentLocationId: "location.korchma.bar",
    name: displayName,
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
    id: `participant-${characterId}`,
    sessionId: "session-1",
    characterId,
    telegramUserId,
    displayName,
    remortCount: 0,
    status: "completed",
    stakeGold: 3,
    payoutGold: 0,
    refundedGold: 0,
    decision: null,
    result: null,
    joinedAt: now,
    decidedAt: now,
    completedAt: now,
    character,
    ...overrides
  };
}

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

  return {
    id: "session-1",
    token: "12345678-1234-4234-9234-123456789abc",
    gameKey: "tavlei",
    status: "open",
    creatorCharacterId: character.id,
    stakeGold: 3,
    potGold: 3,
    seed: "seed",
    rulesVersion: "tavern-games-v1",
    result: null,
    openedAt: now,
    joinExpiresAt: now,
    decisionExpiresAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    creator: character,
    participants: [],
    ...overrides
  };
}

function dicePokerSession(
  id: string,
  player: TavernGameSessionRecord["participants"][number],
  outcome: "win" | "draw" | "loss"
): TavernGameSessionRecord {
  return session({
    id,
    token: `${id}-token`,
    gameKey: "kosti",
    status: "completed",
    rulesVersion: DICE_POKER_RULES_VERSION,
    result: {
      kind: "dice_poker",
      outcome,
      state: startQuickDicePoker(`${id}-seed`)
    },
    completedAt: new Date("2026-07-02T09:00:00.000Z"),
    participants: [player]
  });
}

function tavleiDoppelgangerSession(
  id: string,
  player: TavernGameSessionRecord["participants"][number],
  playerOutcome: "win" | "draw" | "loss"
): TavernGameSessionRecord {
  const outcome = playerOutcome === "draw" ? "draw" : "win";
  const winnerCharacterId = playerOutcome === "win"
    ? player.characterId
    : playerOutcome === "loss"
      ? TAVLEI_DOPPELGANGER_CHARACTER_ID
      : undefined;

  return session({
    id,
    token: `${id}-token`,
    gameKey: "tavlei",
    status: "completed",
    rulesVersion: "tavlei-doppelganger-v1",
    result: {
      gameKey: "tavlei",
      outcome,
      potGold: 13,
      payouts: winnerCharacterId ? { [winnerCharacterId]: 13 } : {},
      refunds: playerOutcome === "draw" ? { [player.characterId]: 13 } : {},
      players: [
        {
          participantId: player.id,
          characterId: player.characterId,
          name: player.displayName,
          tactic: "quiet_trap"
        },
        {
          participantId: "doppelganger",
          characterId: TAVLEI_DOPPELGANGER_CHARACTER_ID,
          name: TAVLEI_DOPPELGANGER_NAME,
          tactic: "long_game"
        }
      ],
      ...(winnerCharacterId
        ? {
            winnerCharacterId,
            winnerName: winnerCharacterId === player.characterId ? player.displayName : TAVLEI_DOPPELGANGER_NAME,
            loserName: winnerCharacterId === player.characterId ? TAVLEI_DOPPELGANGER_NAME : player.displayName,
            narrativeKey: "quiet_trap:long_game"
          }
        : {}),
      opponentKind: "doppelganger"
    },
    completedAt: new Date("2026-07-02T09:00:00.000Z"),
    participants: [player]
  });
}

function nearTerminalScorecard(seed: string, score: number): DicePokerState {
  const scores = Object.fromEntries(
    DICE_POKER_SCORE_CATEGORIES
      .filter((category) => category !== "chance")
      .map((category) => [category, score])
  ) as Partial<Record<DicePokerScoreCategory, number>>;

  return {
    ...startScorecardDicePoker(seed),
    turn: 13,
    roll: 3,
    dice: [1, 1, 1, 1, 1],
    scores
  };
}
