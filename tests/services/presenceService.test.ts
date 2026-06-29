import { describe, expect, it } from "vitest";
import type {
  MarkPresenceInput,
  PresenceRecord,
  PresenceRepository
} from "../../src/db/repositories/presenceRepository";
import {
  getPublicPresenceLocation,
  getPresenceStatus,
  isKorchmaInteriorLocation,
  normalizePresenceLocationId,
  PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER,
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_ADVENTURE_MIMIC_SHAWARMA,
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_UNKNOWN,
  PRESENCE_RAID_FRIDAY_BARREL,
  PresenceService
} from "../../src/services/presenceService";

const now = new Date("2026-06-13T12:00:00.000Z");

describe("PresenceService", () => {
  it("classifies active, idle, and inactive thresholds coarsely", () => {
    expect(getPresenceStatus(minutesAgo(5), now)).toBe("active");
    expect(getPresenceStatus(minutesAgo(6), now)).toBe("idle");
    expect(getPresenceStatus(minutesAgo(15), now)).toBe("idle");
    expect(getPresenceStatus(minutesAgo(16), now)).toBe("inactive");
  });

  it("names Шинок as a visible korchma location", () => {
    expect(getPublicPresenceLocation(PRESENCE_LOCATION_KORCHMA_BAR)).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_BAR,
      title: "Шинок",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    });
  });

  it("treats Шинок as korchma interior for routing gates", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_BAR)
    ]);
    const service = new PresenceService(repository, () => now);

    const place = await service.getCurrentPlaceForTelegramUser(1n);

    expect(isKorchmaInteriorLocation(PRESENCE_LOCATION_KORCHMA_BAR)).toBe(true);
    expect(place).toMatchObject({
      state: "ready",
      locationId: PRESENCE_LOCATION_KORCHMA_BAR,
      locationName: "Шинок",
      insideKorchma: true
    });
  });

  it("names the first Nyz tier as a specific korchma interior location", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1)
    ]);
    const service = new PresenceService(repository, () => now);

    const place = await service.getCurrentPlaceForTelegramUser(1n);

    expect(getPublicPresenceLocation(PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1)).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
      title: "Сутерени Корчми",
      regionName: "Низ",
      showNames: true,
      isSpecific: true
    });
    expect(isKorchmaInteriorLocation(PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1)).toBe(true);
    expect(place).toMatchObject({
      state: "ready",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
      locationName: "Сутерени Корчми",
      insideKorchma: true
    });
  });

  it("keeps Nyz passages as separate nearby duel locations", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT),
      player(2n, "Дара", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT),
      player(3n, "Нестор Прямоход", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT)
    ]);
    const service = new PresenceService(repository, () => now);

    const left = await service.getNearbyDuelCandidatesForTelegramUser(1n);
    const straight = await service.getNearbyDuelCandidatesForTelegramUser(3n);

    expect(getPublicPresenceLocation(PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT)).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      title: "Лівий прохід",
      regionName: "Сутерени Корчми"
    });
    expect(isKorchmaInteriorLocation(PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT)).toBe(true);
    expect(left).toMatchObject({
      state: "ready",
      location: {
        id: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        name: "Лівий прохід"
      },
      total: 1,
      visible: [
        {
          telegramUserId: 2n,
          name: "Дара"
        }
      ]
    });
    expect(straight).toMatchObject({
      state: "ready",
      location: {
        id: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
        name: "Прямий прохід"
      },
      total: 0,
      visible: []
    });
  });

  it("keeps the training doppelganger in the fighting corner as a real location", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER, {
        currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
      })
    ]);
    const service = new PresenceService(repository, () => now);

    const online = await service.getOnlineForTelegramUser(1n);

    expect(normalizePresenceLocationId(PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER)).toBe(
      PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER
    );
    expect(getPublicPresenceLocation(PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER)).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
      title: "Бійцівський куток"
    });
    expect(isKorchmaInteriorLocation(PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER)).toBe(true);
    expect(online).toMatchObject({
      state: "ready",
      location: {
        id: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
        name: "Бійцівський куток"
      },
      activity: {
        id: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER,
        locationName: "Бійцівський куток"
      }
    });
  });

  it("reports the current activity marker without expanding participant lists", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_QUEST_TABLE, {
        currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
      })
    ]);
    const service = new PresenceService(repository, () => now);

    await expect(service.getCurrentActivityForTelegramUser(1n)).resolves.toEqual({
      state: "ready",
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
    });
  });

  it("updates player presence after handled actions", async () => {
    const repository = new FakePresenceRepository();
    const service = new PresenceService(repository, () => now);

    await service.markAction({
      user: {
        telegramUserId: 1n,
        displayName: "587"
      },
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });

    expect(repository.records.get(1n)).toMatchObject({
      lastActionAt: now,
      lastSeenLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });
  });

  it("excludes inactive players from online and filters local presence by location", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL),
      player(2n, "Дара", minutesAgo(7), PRESENCE_LOCATION_KORCHMA_HALL),
      player(3n, "Нестор Межовий", minutesAgo(3), PRESENCE_LOCATION_KORCHMA_QUEST_TABLE),
      player(4n, "Давно не озивалися", minutesAgo(20), PRESENCE_LOCATION_KORCHMA_HALL)
    ]);
    const service = new PresenceService(repository, () => now);

    const snapshot = await service.getOnlineForTelegramUser(1n);

    expect(snapshot).toMatchObject({
      state: "ready",
      globalTotal: 3
    });

    if (snapshot.state !== "ready") {
      throw new Error("Expected ready snapshot");
    }

    expect(snapshot.location.people.active.map((person) => person.name)).toEqual(["587"]);
    expect(snapshot.location.people.idle.map((person) => person.name)).toEqual(["Дара"]);
    expect(snapshot.location.people.total).toBe(2);
    expect(snapshot.location.people.active.some((person) => person.name === "Нестор Межовий")).toBe(
      false
    );
  });

  it("keeps class and level metadata on same-location presence people", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "Shannar", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_BAR, {
        characterClassId: "class.bard",
        characterLevel: 3
      }),
      player(2n, "BooksDragon", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_BAR, {
        characterClassId: "class.mage",
        characterLevel: 4
      })
    ]);
    const service = new PresenceService(repository, () => now);

    const snapshot = await service.getOnlineForTelegramUser(1n);

    expect(snapshot).toMatchObject({
      state: "ready",
      location: {
        people: {
          active: [
            {
              telegramUserId: 2n,
              classId: "class.mage",
              level: 4
            },
            {
              telegramUserId: 1n,
              classId: "class.bard",
              level: 3
            }
          ]
        }
      }
    });
  });

  it("lists only active nearby duel candidates at the current location", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL),
      player(2n, "Дара", minutesAgo(2), PRESENCE_LOCATION_KORCHMA_HALL, {
        characterLevel: 5
      }),
      player(3n, "Притихлий Нестор", minutesAgo(7), PRESENCE_LOCATION_KORCHMA_HALL),
      player(4n, "Інша кімната", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_BAR)
    ]);
    const service = new PresenceService(repository, () => now);

    const snapshot = await service.getNearbyDuelCandidatesForTelegramUser(1n);

    expect(snapshot).toMatchObject({
      state: "ready",
      location: {
        id: PRESENCE_LOCATION_KORCHMA_HALL,
        name: "Зала корчми"
      },
      total: 1,
      totalPages: 1,
      visible: [
        {
          telegramUserId: 2n,
          name: "Дара",
          level: 5,
          status: "active"
        }
      ]
    });
  });

  it("revalidates nearby duel target activity at the current location", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL),
      player(2n, "Дара", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL)
    ]);
    const service = new PresenceService(repository, () => now);

    await expect(service.isNearbyDuelTargetAvailable(1n, 2n)).resolves.toBe(true);

    repository.records.set(
      2n,
      player(2n, "Дара", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_BAR)
    );

    await expect(service.isNearbyDuelTargetAvailable(1n, 2n)).resolves.toBe(false);

    repository.records.set(
      2n,
      player(2n, "Дара", minutesAgo(7), PRESENCE_LOCATION_KORCHMA_HALL)
    );

    await expect(service.isNearbyDuelTargetAvailable(1n, 2n)).resolves.toBe(false);
  });

  it("filters raid and adventure participants by the current scene only", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_BARREL, {
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL
      }),
      player(2n, "Дара", minutesAgo(9), PRESENCE_LOCATION_KORCHMA_BARREL, {
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL
      }),
      player(3n, "Нестор Межовий", minutesAgo(2), PRESENCE_LOCATION_KORCHMA_QUEST_TABLE, {
        currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
      }),
      player(4n, "Стара тінь", minutesAgo(20), PRESENCE_LOCATION_KORCHMA_BARREL, {
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL
      })
    ]);
    const service = new PresenceService(repository, () => now);

    const online = await service.getOnlineForTelegramUser(1n);
    const adventure = await service.getAdventureParticipantsForTelegramUser(
      3n,
      PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    );

    if (online.state !== "ready" || !online.activity || adventure.state !== "ready") {
      throw new Error("Expected ready activity snapshots");
    }

    expect(online.activity.people.active.map((person) => person.name)).toEqual(["587"]);
    expect(online.activity.people.idle.map((person) => person.name)).toEqual(["Дара"]);
    expect(online.activity.people.total).toBe(2);
    expect(adventure.activity.people.active.map((person) => person.name)).toEqual([
      "Нестор Межовий"
    ]);
    expect(adventure.activity.people.total).toBe(1);
  });

  it("aggregates active and idle people across korchma interior locations only", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL),
      player(2n, "Дара", minutesAgo(7), PRESENCE_LOCATION_KORCHMA_QUEST_TABLE),
      player(3n, "Нестор Межовий", minutesAgo(2), PRESENCE_LOCATION_KORCHMA_BARREL),
      player(4n, "Архіварка", minutesAgo(4), PRESENCE_LOCATION_KORCHMA_NEWS_CORNER),
      player(5n, "Переддверний Свідок", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_FRONT),
      player(6n, "Забутий плащ", minutesAgo(20), PRESENCE_LOCATION_KORCHMA_CELLAR)
    ]);
    const service = new PresenceService(repository, () => now);

    const presence = await service.getKorchmaInteriorPresence();

    expect(presence.active.map((person) => person.name)).toEqual([
      "587",
      "Архіварка",
      "Нестор Межовий"
    ]);
    expect(presence.idle.map((person) => person.name)).toEqual(["Дара"]);
    expect(presence.total).toBe(4);
    expect([...presence.active, ...presence.idle].map((person) => person.name)).not.toContain(
      "Переддверний Свідок"
    );
    expect([...presence.active, ...presence.idle].map((person) => person.name)).not.toContain(
      "Забутий плащ"
    );
  });

  it("builds the front-door arrival board from known korchma visitors", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_FRONT, {
        characterLevel: 3
      }),
      player(2n, "Дара", minutesAgo(80), PRESENCE_LOCATION_KORCHMA_HALL, {
        characterLevel: 2
      }),
      player(3n, "Сторонній свідок", minutesAgo(2), "location.elsewhere", {
        characterLevel: 1
      })
    ]);
    const service = new PresenceService(repository, () => now);

    const board = await service.getKorchmaArrivalBoard();

    expect(board.entries).toEqual([
      {
        telegramUserId: 1n,
        name: "587",
        level: 3,
        locationName: "Перед корчмою"
      },
      {
        telegramUserId: 2n,
        name: "Дара",
        level: 2,
        locationName: "Зала корчми"
      }
    ]);
  });

  it("groups public web presence by visible locations without player names by default", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL),
      player(2n, "Дара", minutesAgo(7), PRESENCE_LOCATION_KORCHMA_HALL),
      player(3n, "Нестор Межовий", minutesAgo(2), PRESENCE_LOCATION_KORCHMA_QUEST_TABLE),
      player(7n, "Льоховий Свідок", minutesAgo(2), PRESENCE_LOCATION_KORCHMA_CELLAR),
      player(4n, "Тихий плащ", minutesAgo(3), "location.secret-cellar"),
      player(5n, "Не показувати", minutesAgo(4), PRESENCE_LOCATION_KORCHMA_QUEST_TABLE, {
        showInPublicPresence: false
      }),
      player(6n, "Давно не озивалися", minutesAgo(20), PRESENCE_LOCATION_KORCHMA_HALL)
    ]);
    const service = new PresenceService(repository, () => now);

    const snapshot = await service.getPublicPresenceLocations();
    const hall = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_KORCHMA_HALL
    );
    const shawarma = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
    );
    const unknown = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_UNKNOWN
    );
    const cellar = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_KORCHMA_CELLAR
    );

    expect(snapshot.total).toBe(6);
    expect(hall).toMatchObject({
      title: "Зала корчми",
      regionName: "Корчма Квестарні",
      activeCount: 1,
      idleCount: 1,
      players: []
    });
    expect(shawarma).toMatchObject({
      activeCount: 2,
      idleCount: 0,
      players: []
    });
    expect(unknown).toMatchObject({
      title: "Невідома місцина",
      activeCount: 1,
      idleCount: 0,
      players: []
    });
    expect(cellar).toMatchObject({
      title: "Льох корчми",
      regionName: "Корчма Квестарні",
      activeCount: 1,
      idleCount: 0,
      players: []
    });
    expect(snapshot.locations.some((location) => location.locationId.includes("secret"))).toBe(
      false
    );
    expect(JSON.stringify(snapshot)).not.toContain("587");
    expect(JSON.stringify(snapshot)).not.toContain("Дара");
    expect(JSON.stringify(snapshot)).not.toContain("Нестор Межовий");
    expect(JSON.stringify(snapshot)).not.toContain("Льоховий Свідок");
    expect(JSON.stringify(snapshot)).not.toContain("Давно не озивалися");
    expect(JSON.stringify(snapshot)).not.toContain("Тихий плащ");
    expect(JSON.stringify(snapshot)).not.toContain("Не показувати");
  });

  it("can expose public names only when explicitly enabled and allowed", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL),
      player(2n, "Не показувати", minutesAgo(2), PRESENCE_LOCATION_KORCHMA_HALL, {
        showInPublicPresence: false
      }),
      player(3n, "Тихий плащ", minutesAgo(3), "hidden.deep-room")
    ]);
    const service = new PresenceService(repository, () => now, {
      publicPresenceNamesEnabled: true
    });

    const snapshot = await service.getPublicPresenceLocations();
    const hall = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_KORCHMA_HALL
    );
    const unknown = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_UNKNOWN
    );

    expect(hall).toMatchObject({
      players: ["587"]
    });
    expect(unknown).toMatchObject({
      title: "Невідома місцина",
      players: []
    });
    expect(JSON.stringify(snapshot)).not.toContain("Не показувати");
    expect(JSON.stringify(snapshot)).not.toContain("Тихий плащ");
  });

  it("resolves only known enabled active cosmetic titles for nearby presence", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL),
      player(2n, "Дара", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL, {
        characterActiveCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
      }),
      player(3n, "Архів", minutesAgo(1), PRESENCE_LOCATION_KORCHMA_HALL, {
        characterActiveCosmeticTitleGrantId: "cosmetic-title.unknown-future"
      })
    ]);
    const service = new PresenceService(repository, () => now);

    const snapshot = await service.getNearbyDuelCandidatesForTelegramUser(1n);

    expect(snapshot).toMatchObject({
      state: "ready",
      visible: [
        {
          telegramUserId: 3n,
          name: "Архів"
        },
        {
          telegramUserId: 2n,
          name: "Дара",
          activeCosmeticTitle: "Перший писар"
        }
      ]
    });
    if (snapshot.state === "ready") {
      expect(snapshot.visible[0]).not.toHaveProperty("activeCosmeticTitle");
    }
  });
});

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

function player(
  telegramUserId: bigint,
  name: string,
  lastActionAt: Date,
  locationId: string,
  extra: Partial<PresenceRecord> = {}
): PresenceRecord {
  return {
    telegramUserId,
    displayName: name,
    characterName: name,
    lastActionAt,
    lastSeenLocationId: locationId,
    currentRaidId: null,
    currentAdventureId: null,
    ...extra
  };
}

class FakePresenceRepository implements PresenceRepository {
  readonly records = new Map<bigint, PresenceRecord>();

  constructor(records: PresenceRecord[] = []) {
    for (const record of records) {
      this.records.set(record.telegramUserId, record);
    }
  }

  markAction(input: MarkPresenceInput): Promise<void> {
    const existing = this.records.get(input.user.telegramUserId);

    this.records.set(input.user.telegramUserId, {
      telegramUserId: input.user.telegramUserId,
      displayName: input.user.displayName ?? existing?.displayName ?? null,
      characterName: existing?.characterName ?? input.user.displayName ?? null,
      lastActionAt: input.at,
      lastSeenLocationId: input.locationId ?? existing?.lastSeenLocationId ?? null,
      currentRaidId:
        input.currentRaidId === undefined
          ? (existing?.currentRaidId ?? null)
          : input.currentRaidId,
      currentAdventureId:
        input.currentAdventureId === undefined
          ? (existing?.currentAdventureId ?? null)
          : input.currentAdventureId
    });

    return Promise.resolve();
  }

  findByTelegramUserId(telegramUserId: bigint): Promise<PresenceRecord | null> {
    return Promise.resolve(this.records.get(telegramUserId) ?? null);
  }

  listSeenSince(since: Date): Promise<PresenceRecord[]> {
    return Promise.resolve(this.filter((record) => isRecent(record, since)));
  }

  listKorchmaVisitors(limit: number): Promise<PresenceRecord[]> {
    return Promise.resolve(
      this.filter((record) => isKorchmaLocation(record.lastSeenLocationId))
        .sort((left, right) => {
          const rightTime = right.lastActionAt?.getTime() ?? 0;
          const leftTime = left.lastActionAt?.getTime() ?? 0;

          return rightTime - leftTime;
        })
        .slice(0, limit)
    );
  }

  listByLocationSeenSince(locationId: string, since: Date): Promise<PresenceRecord[]> {
    return Promise.resolve(
      this.filter((record) => isRecent(record, since) && record.lastSeenLocationId === locationId)
    );
  }

  listByRaidSeenSince(currentRaidId: string, since: Date): Promise<PresenceRecord[]> {
    return Promise.resolve(
      this.filter((record) => isRecent(record, since) && record.currentRaidId === currentRaidId)
    );
  }

  listByAdventureSeenSince(
    currentAdventureId: string,
    since: Date
  ): Promise<PresenceRecord[]> {
    return Promise.resolve(
      this.filter(
        (record) => isRecent(record, since) && record.currentAdventureId === currentAdventureId
      )
    );
  }

  private filter(predicate: (record: PresenceRecord) => boolean): PresenceRecord[] {
    return [...this.records.values()].filter(
      (record) => record.characterName !== null && predicate(record)
    );
  }
}

function isRecent(record: PresenceRecord, since: Date): boolean {
  return Boolean(record.lastActionAt && record.lastActionAt >= since);
}

function isKorchmaLocation(locationId: string | null | undefined): boolean {
  return (
    locationId?.startsWith("location.korchma.") === true ||
    locationId === "location.tavern" ||
    locationId === "location.shawarma-table" ||
    locationId === "location.tavern-cellar"
  );
}
