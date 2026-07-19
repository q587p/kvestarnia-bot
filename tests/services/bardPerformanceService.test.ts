import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type {
  BardPerformanceRepository,
  BardPerformanceReactionRecord,
  BardPerformanceRecord,
  BardPerformanceRespondResult,
  BardPerformanceStartSnapshot
} from "../../src/db/repositories/bardPerformanceRepository";
import { BardPerformanceService } from "../../src/services/bardPerformanceService";
import { FakeRandomSource } from "../../src/shared/random";

const now = new Date("2026-06-26T10:00:00.000Z");
const telegramUserId = 42n;

describe("BardPerformanceService", () => {
  it("returns a read-only live-performance notice with the service clock", async () => {
    const repository = new FakeBardPerformanceRepository({
      livePerformance: performanceRecord()
    });
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.5]));

    await expect(service.getLiveForTelegramUser(telegramUserId)).resolves.toEqual({
      expiresAt: new Date("2026-06-26T10:13:00.000Z"),
      now
    });
    expect(repository.liveReadCalls).toBe(1);
  });

  it("starts a Shynok Bard performance with frozen effective stats and no XP", async () => {
    const repository = new FakeBardPerformanceRepository();
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.5]));

    const result = await service.startForTelegramUser(telegramUserId);

    expect(result.state).toBe("started");
    expect(repository.lastStartInput).toMatchObject({
      techniqueId: "technique.class.bard.shynok-performance",
      rulesVersion: "bard-performance-v1",
      locationId: "location.korchma.bar",
      allowNoAudience: true,
      localDate: "2026-06-26",
      roleActionXp: 0,
      statSnapshot: {
        level: 3,
        charisma: 10,
        luck: 8
      }
    });
    expect(repository.lastStartInput?.expiresAt.toISOString()).toBe("2026-06-26T10:13:00.000Z");
    expect(repository.lastStartInput?.cooldownAvailableAt.toISOString()).toBe("2026-06-26T11:33:00.000Z");
  });

  it("starts an off-Shynok same-location performance without house payout", async () => {
    const repository = new FakeBardPerformanceRepository({
      character: { currentLocationId: "location.korchma.front" }
    });
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.5]));

    const result = await service.startForTelegramUser(telegramUserId);

    expect(result.state).toBe("started");
    expect(repository.lastStartInput).toMatchObject({
      locationId: "location.korchma.front",
      allowNoAudience: false,
      rawHousePayoutGold: 0,
      result: {
        rawHousePayoutGold: 0,
        roleActionXp: 0
      }
    });
  });

  it("blocks non-Bards before rolling or mutating", async () => {
    const repository = new FakeBardPerformanceRepository({
      character: { classId: "class.warrior" }
    });
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.99]));

    const result = await service.startForTelegramUser(telegramUserId);

    expect(result.state).toBe("not-bard");
    expect(repository.lastStartInput).toBeNull();
  });

  it("rejects unsupported tip amounts before repository mutation", async () => {
    const repository = new FakeBardPerformanceRepository();
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.5]));

    const result = await service.respondForTelegramUser(telegramUserId, {
      reactionId: "12345678-1234-4234-9234-123456789abc",
      action: "tip",
      tipGold: 2
    });

    expect(result.state).toBe("invalid-reaction");
    expect(repository.lastRespondInput).toBeNull();
  });

  it("preserves attempted tip amount when gold is insufficient", async () => {
    const repository = new FakeBardPerformanceRepository({
      respondResult: {
        state: "insufficient-gold",
        reaction: offeredReaction(),
        performance: performanceRecord(),
        character: characterRecord({ gold: 3 }),
        attemptedTipGold: 13
      }
    });
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.5]));

    const result = await service.respondForTelegramUser(telegramUserId, {
      reactionId: "12345678-1234-4234-9234-123456789abc",
      action: "tip",
      tipGold: 13
    });

    expect(result).toMatchObject({
      state: "insufficient-gold",
      attemptedTipGold: 13,
      reaction: { tipGold: 0 },
      character: { gold: 3 }
    });
  });

  it.each([
    ["performer-wrong-place"],
    ["performer-active-combat"],
    ["performer-pending-raid"],
    ["performer-remorted"]
  ] satisfies Array<[BardPerformanceRespondResult["state"]]>)("passes through stale performer state %s", async (state) => {
    const repository = new FakeBardPerformanceRepository({
      respondResult: {
        state,
        reaction: offeredReaction(),
        performance: performanceRecord()
      }
    });
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.5]));

    const result = await service.respondForTelegramUser(telegramUserId, {
      reactionId: "12345678-1234-4234-9234-123456789abc",
      action: state === "performer-wrong-place" ? "decline" : "tip",
      tipGold: state === "performer-wrong-place" ? undefined : 5
    });

    expect(result.state).toBe(state);
    expect(repository.lastRespondInput).toMatchObject({
      reactionId: "12345678-1234-4234-9234-123456789abc"
    });
  });

  it("cannot mutate through disabled dev helpers", async () => {
    const repository = new FakeBardPerformanceRepository();
    const service = new BardPerformanceService(
      repository,
      () => now,
      new FakeRandomSource([0.5]),
      { devHelpersEnabled: false }
    );

    await expect(service.resetForDev(telegramUserId)).resolves.toEqual({ state: "disabled" });
    await expect(service.setInspirationForDev(telegramUserId, 5)).resolves.toEqual({ state: "disabled" });
    expect(repository.resetCalls).toBe(0);
    expect(repository.setInspirationCalls).toBe(0);
  });

  it("omits optional Inspiration when its database read times out", async () => {
    const repository = new FakeBardPerformanceRepository({
      inspirationError: new Prisma.PrismaClientKnownRequestError("Socket timeout", {
        code: "P1008",
        clientVersion: "6.19.3"
      })
    });
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.5]));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(service.getInspirationForTelegramUser(telegramUserId)).resolves.toBeNull();
    expect(warning).toHaveBeenCalledWith(
      "Квестарня: Натхнення тимчасово пропущено через таймаут бази.",
      { code: "P1008" }
    );
    warning.mockRestore();
  });

  it("does not hide non-timeout Inspiration read failures", async () => {
    const failure = new Error("database unavailable");
    const repository = new FakeBardPerformanceRepository({ inspirationError: failure });
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.5]));

    await expect(service.getInspirationForTelegramUser(telegramUserId)).rejects.toBe(failure);
  });
});

class FakeBardPerformanceRepository implements BardPerformanceRepository {
  lastStartInput: Parameters<BardPerformanceRepository["startPerformanceForTelegramUser"]>[1] | null = null;
  lastRespondInput: Parameters<BardPerformanceRepository["respondToPerformanceForTelegramUser"]>[1] | null = null;
  resetCalls = 0;
  setInspirationCalls = 0;
  liveReadCalls = 0;

  constructor(private readonly overrides: Partial<BardPerformanceStartSnapshot> & {
    character?: Partial<BardPerformanceStartSnapshot["character"]>;
    respondResult?: BardPerformanceRespondResult;
    livePerformance?: BardPerformanceRecord | null;
    inspirationError?: Error;
  } = {}) {}

  getStartSnapshotForTelegramUser(): Promise<BardPerformanceStartSnapshot | null> {
    const { character: characterOverrides, ...snapshotOverrides } = this.overrides;

    return Promise.resolve({
      character: {
        id: "character-bard",
        userId: "user-bard",
        currentLocationId: "location.korchma.bar",
        name: "Лірник",
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.bard",
        level: 3,
        xp: 25,
        gold: 0,
        hpCurrent: 20,
        hpMax: 20,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: { charisma: 8, luck: 6 },
        remortCount: 0,
        ...characterOverrides
      },
      equippedItemIds: [],
      currentRaidId: null,
      activeCombatLease: null,
      ...snapshotOverrides
    });
  }

  startPerformanceForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<BardPerformanceRepository["startPerformanceForTelegramUser"]>[1]
  ): ReturnType<BardPerformanceRepository["startPerformanceForTelegramUser"]> {
    this.lastStartInput = input;

    return Promise.resolve({
      state: "started",
      character: {
        id: "character-bard",
        userId: "user-bard",
        currentLocationId: "location.korchma.bar",
        name: "Лірник",
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.bard",
        level: 3,
        xp: 25,
        gold: 3,
        hpCurrent: 20,
        hpMax: 20,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: { charisma: 8, luck: 6 },
        remortCount: 0
      },
      performance: {
        id: "performance-1",
        token: input.token,
        characterId: "character-bard",
        telegramUserId,
        performerName: "Лірник",
        remortCount: 0,
        techniqueId: input.techniqueId,
        rulesVersion: input.rulesVersion,
        locationId: input.locationId,
        localDate: input.localDate,
        status: "active",
        grade: input.grade,
        power: input.power,
        housePayoutGold: input.rawHousePayoutGold,
        roleActionXp: input.roleActionXp,
        audienceCount: 0,
        statSnapshot: input.statSnapshot,
        result: input.result,
        startedAt: input.now,
        expiresAt: input.expiresAt,
        cooldownAvailableAt: input.cooldownAvailableAt,
        completedAt: input.now
      },
      audience: []
    });
  }

  respondToPerformanceForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<BardPerformanceRepository["respondToPerformanceForTelegramUser"]>[1]
  ): ReturnType<BardPerformanceRepository["respondToPerformanceForTelegramUser"]> {
    this.lastRespondInput = input;
    return Promise.resolve(this.overrides.respondResult ?? { state: "invalid-reaction" });
  }

  resetForTelegramUser(): ReturnType<BardPerformanceRepository["resetForTelegramUser"]> {
    this.resetCalls += 1;
    return Promise.resolve(null);
  }

  getLivePerformanceForTelegramUser(): Promise<BardPerformanceRecord | null> {
    this.liveReadCalls += 1;
    return Promise.resolve(this.overrides.livePerformance ?? null);
  }

  getInspirationForTelegramUser(): ReturnType<BardPerformanceRepository["getInspirationForTelegramUser"]> {
    if (this.overrides.inspirationError) {
      return Promise.reject(this.overrides.inspirationError);
    }
    return Promise.resolve(null);
  }

  setInspirationForDev(): ReturnType<BardPerformanceRepository["setInspirationForDev"]> {
    this.setInspirationCalls += 1;
    return Promise.resolve(null);
  }
}

function characterRecord(overrides: Partial<BardPerformanceStartSnapshot["character"]> = {}): BardPerformanceStartSnapshot["character"] {
  return {
    id: "character-bard",
    userId: "user-bard",
    currentLocationId: "location.korchma.bar",
    name: "Лірник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.bard",
    level: 3,
    xp: 25,
    gold: 0,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: { charisma: 8, luck: 6 },
    remortCount: 0,
    ...overrides
  };
}

function performanceRecord(): BardPerformanceRecord {
  return {
    id: "performance-1",
    token: "12345678-1234-4234-9234-000000000111",
    characterId: "character-bard",
    telegramUserId,
    performerName: "Лірник",
    remortCount: 0,
    techniqueId: "technique.class.bard.shynok-performance",
    rulesVersion: "bard-performance-v1",
    locationId: "location.korchma.bar",
    localDate: "2026-06-26",
    status: "active",
    grade: "pleasant",
    power: 26,
    housePayoutGold: 0,
    roleActionXp: 0,
    audienceCount: 1,
    statSnapshot: { level: 3, charisma: 8, luck: 6 },
    result: {},
    startedAt: now,
    expiresAt: new Date("2026-06-26T10:13:00.000Z"),
    cooldownAvailableAt: new Date("2026-06-26T11:33:00.000Z"),
    completedAt: now
  };
}

function offeredReaction(): BardPerformanceReactionRecord {
  return {
    id: "12345678-1234-4234-9234-123456789abc",
    performanceId: "performance-1",
    characterId: "character-audience",
    telegramUserId,
    audienceName: "Слухач",
    remortCount: 0,
    status: "offered",
    tipGold: 0,
    result: {},
    expiresAt: new Date("2026-06-26T10:13:00.000Z"),
    respondedAt: null
  };
}
