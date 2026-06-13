import { describe, expect, it } from "vitest";
import type {
  MarkPresenceInput,
  PresenceRecord,
  PresenceRepository
} from "../../src/db/repositories/presenceRepository";
import {
  getPresenceStatus,
  PRESENCE_ADVENTURE_MIMIC_SHAWARMA,
  PRESENCE_LOCATION_SHAWARMA,
  PRESENCE_LOCATION_TAVERN,
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

  it("updates player presence after handled actions", async () => {
    const repository = new FakePresenceRepository();
    const service = new PresenceService(repository, () => now);

    await service.markAction({
      user: {
        telegramUserId: 1n,
        displayName: "587"
      },
      locationId: PRESENCE_LOCATION_SHAWARMA,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });

    expect(repository.records.get(1n)).toMatchObject({
      lastActionAt: now,
      lastSeenLocationId: PRESENCE_LOCATION_SHAWARMA,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });
  });

  it("excludes inactive players from online and filters local presence by location", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_TAVERN),
      player(2n, "Дара", minutesAgo(7), PRESENCE_LOCATION_TAVERN),
      player(3n, "Нестор Межовий", minutesAgo(3), PRESENCE_LOCATION_SHAWARMA),
      player(4n, "Давно не озивалися", minutesAgo(20), PRESENCE_LOCATION_TAVERN)
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

  it("filters raid and adventure participants by the current scene only", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_TAVERN, {
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL
      }),
      player(2n, "Дара", minutesAgo(9), PRESENCE_LOCATION_TAVERN, {
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL
      }),
      player(3n, "Нестор Межовий", minutesAgo(2), PRESENCE_LOCATION_SHAWARMA, {
        currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
      }),
      player(4n, "Стара тінь", minutesAgo(20), PRESENCE_LOCATION_TAVERN, {
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

  it("groups public web presence by visible locations without player names by default", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_TAVERN),
      player(2n, "Дара", minutesAgo(7), PRESENCE_LOCATION_TAVERN),
      player(3n, "Нестор Межовий", minutesAgo(2), PRESENCE_LOCATION_SHAWARMA),
      player(4n, "Тихий плащ", minutesAgo(3), "location.secret-cellar"),
      player(5n, "Не показувати", minutesAgo(4), PRESENCE_LOCATION_SHAWARMA, {
        showInPublicPresence: false
      }),
      player(6n, "Давно не озивалися", minutesAgo(20), PRESENCE_LOCATION_TAVERN)
    ]);
    const service = new PresenceService(repository, () => now);

    const snapshot = await service.getPublicPresenceLocations();
    const tavern = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_TAVERN
    );
    const shawarma = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_SHAWARMA
    );
    const unknown = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_UNKNOWN
    );

    expect(snapshot.total).toBe(5);
    expect(tavern).toMatchObject({
      title: "Таверна Квестарні",
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
    expect(snapshot.locations.some((location) => location.locationId.includes("secret"))).toBe(
      false
    );
    expect(JSON.stringify(snapshot)).not.toContain("587");
    expect(JSON.stringify(snapshot)).not.toContain("Дара");
    expect(JSON.stringify(snapshot)).not.toContain("Нестор Межовий");
    expect(JSON.stringify(snapshot)).not.toContain("Давно не озивалися");
    expect(JSON.stringify(snapshot)).not.toContain("Тихий плащ");
    expect(JSON.stringify(snapshot)).not.toContain("Не показувати");
  });

  it("can expose public names only when explicitly enabled and allowed", async () => {
    const repository = new FakePresenceRepository([
      player(1n, "587", minutesAgo(1), PRESENCE_LOCATION_TAVERN),
      player(2n, "Не показувати", minutesAgo(2), PRESENCE_LOCATION_TAVERN, {
        showInPublicPresence: false
      }),
      player(3n, "Тихий плащ", minutesAgo(3), "hidden.deep-room")
    ]);
    const service = new PresenceService(repository, () => now, {
      publicPresenceNamesEnabled: true
    });

    const snapshot = await service.getPublicPresenceLocations();
    const tavern = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_TAVERN
    );
    const unknown = snapshot.locations.find(
      (location) => location.locationId === PRESENCE_LOCATION_UNKNOWN
    );

    expect(tavern).toMatchObject({
      players: ["587"]
    });
    expect(unknown).toMatchObject({
      title: "Невідома місцина",
      players: []
    });
    expect(JSON.stringify(snapshot)).not.toContain("Не показувати");
    expect(JSON.stringify(snapshot)).not.toContain("Тихий плащ");
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
