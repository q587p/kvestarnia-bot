import { describe, expect, it } from "vitest";
import type {
  TavernGameRepository,
  TavernGameSessionRecord
} from "../../src/db/repositories/tavernGameRepository";
import { TavernGameService } from "../../src/services/tavernGameService";

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
    const repository = new FakeTavernGameRepository({ openTables: [session()] });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true
    }), () => now);

    const result = await service.getHub();

    expect(result).toMatchObject({
      state: "ready",
      maxStake: 93,
      tavleiEnabled: true,
      kostiEnabled: false
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
      cooldownMs: 42_000,
      now
    });
    expect(repository.lastCreateInput?.joinExpiresAt.toISOString()).toBe("2026-07-02T10:13:00.000Z");
  });

  it("returns the request time with create cooldown results", async () => {
    const availableAt = new Date("2026-07-02T10:03:00.000Z");
    const repository = new FakeTavernGameRepository({
      createResult: { state: "cooldown", availableAt }
    });
    const service = new TavernGameService(repository, config({
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true
    }), () => now);

    const result = await service.createForTelegramUser(42n, "tavlei", 3);

    expect(result).toEqual({ state: "cooldown", availableAt, now });
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
  joinCalls = 0;
  refundDisabledCalls = 0;
  lastCreateInput: Parameters<TavernGameRepository["createForTelegramUser"]>[1] | null = null;

  constructor(private readonly options: {
    openTables?: TavernGameSessionRecord[];
    completedTables?: TavernGameSessionRecord[];
    tokenSession?: TavernGameSessionRecord;
    createResult?: Awaited<ReturnType<TavernGameRepository["createForTelegramUser"]>>;
  } = {}) {}

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
    return Promise.resolve(this.options.tokenSession ?? null);
  }

  getByToken(): Promise<TavernGameSessionRecord | null> {
    return Promise.resolve(this.options.tokenSession ?? null);
  }

  createForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<TavernGameRepository["createForTelegramUser"]>[1]
  ): ReturnType<TavernGameRepository["createForTelegramUser"]> {
    this.lastCreateInput = input;
    return Promise.resolve(this.options.createResult ?? { state: "created", session: session() });
  }

  joinByTokenForTelegramUser(): ReturnType<TavernGameRepository["joinByTokenForTelegramUser"]> {
    this.joinCalls += 1;
    return Promise.resolve({ state: "joined", session: session() });
  }

  submitDecisionForTelegramUser(): ReturnType<TavernGameRepository["submitDecisionForTelegramUser"]> {
    return Promise.reject(new Error("Not implemented in fake."));
  }

  resolveKostiForTelegramUser(): ReturnType<TavernGameRepository["resolveKostiForTelegramUser"]> {
    return Promise.reject(new Error("Not implemented in fake."));
  }

  cancelForTelegramUser(): ReturnType<TavernGameRepository["cancelForTelegramUser"]> {
    return Promise.reject(new Error("Not implemented in fake."));
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
  displayName: string
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
    character
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
