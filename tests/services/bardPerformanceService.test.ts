import { describe, expect, it } from "vitest";
import type {
  BardPerformanceRepository,
  BardPerformanceStartSnapshot
} from "../../src/db/repositories/bardPerformanceRepository";
import { BardPerformanceService } from "../../src/services/bardPerformanceService";
import { FakeRandomSource } from "../../src/shared/random";

const now = new Date("2026-06-26T10:00:00.000Z");
const telegramUserId = 42n;

describe("BardPerformanceService", () => {
  it("starts a Shynok Bard performance with frozen effective stats and no XP", async () => {
    const repository = new FakeBardPerformanceRepository();
    const service = new BardPerformanceService(repository, () => now, new FakeRandomSource([0.5]));

    const result = await service.startForTelegramUser(telegramUserId);

    expect(result.state).toBe("started");
    expect(repository.lastStartInput).toMatchObject({
      techniqueId: "technique.class.bard.shynok-performance",
      rulesVersion: "bard-performance-v1",
      locationId: "location.korchma.bar",
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
});

class FakeBardPerformanceRepository implements BardPerformanceRepository {
  lastStartInput: Parameters<BardPerformanceRepository["startPerformanceForTelegramUser"]>[1] | null = null;
  lastRespondInput: Parameters<BardPerformanceRepository["respondToPerformanceForTelegramUser"]>[1] | null = null;

  constructor(private readonly overrides: Partial<BardPerformanceStartSnapshot> & {
    character?: Partial<BardPerformanceStartSnapshot["character"]>;
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
    return Promise.resolve({ state: "invalid-reaction" });
  }

  resetForTelegramUser(): ReturnType<BardPerformanceRepository["resetForTelegramUser"]> {
    return Promise.resolve(null);
  }
}
