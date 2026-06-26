import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaBardPerformanceRepository } from "../../src/db/repositories/prismaBardPerformanceRepository";

describe("PrismaBardPerformanceRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaBardPerformanceRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-bard-performance-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaBardPerformanceRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.bardPerformanceReaction.deleteMany();
    await prisma.bardPerformance.deleteMany();
    await prisma.activeCombatLease.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.characterEquipment.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("starts once, clips daily house payout and snapshots active same-location audience", async () => {
    await seedCharacter({ telegramUserId: 101n, userId: "user-bard", characterId: "character-bard", classId: "class.bard", level: 3, gold: 10 });
    await seedCharacter({ telegramUserId: 102n, userId: "user-audience", characterId: "character-audience", gold: 20 });
    await seedCharacter({
      telegramUserId: 103n,
      userId: "user-idle",
      characterId: "character-idle",
      lastActionAt: new Date("2026-06-26T09:50:00.000Z")
    });
    await seedPerformance({
      id: "performance-earlier",
      token: "12345678-1234-4234-9234-000000000001",
      housePayoutGold: 20,
      expiresAt: new Date("2026-06-26T09:59:00.000Z"),
      cooldownAvailableAt: new Date("2026-06-26T09:59:00.000Z")
    });

    const result = await repository.startPerformanceForTelegramUser(101n, startInput({
      token: "12345678-1234-4234-9234-000000000101",
      rawHousePayoutGold: 13
    }));
    const duplicate = await repository.startPerformanceForTelegramUser(101n, startInput({
      token: "12345678-1234-4234-9234-000000000102",
      rawHousePayoutGold: 13
    }));

    expect(result.state).toBe("started");
    if (result.state !== "started") {
      throw new Error("Expected started result.");
    }
    expect(result.performance.housePayoutGold).toBe(3);
    expect(result.audience.map((notice) => notice.telegramUserId)).toEqual([102n]);
    expect(duplicate.state).toBe("live");
    await expect(prisma.character.findUnique({ where: { id: "character-bard" } })).resolves.toMatchObject({
      gold: 13
    });
  });

  it("requires real active same-location audience before creating a performance", async () => {
    await seedCharacter({
      telegramUserId: 151n,
      userId: "user-bard",
      characterId: "character-bard",
      classId: "class.bard",
      level: 3,
      gold: 10,
      locationId: "location.korchma.front"
    });

    const result = await repository.startPerformanceForTelegramUser(151n, startInput({
      token: "12345678-1234-4234-9234-000000000151",
      rawHousePayoutGold: 0,
      locationId: "location.korchma.front"
    }));

    expect(result.state).toBe("no-audience");
    await expect(prisma.bardPerformance.count()).resolves.toBe(0);
    await expect(prisma.character.findUnique({ where: { id: "character-bard" } })).resolves.toMatchObject({
      gold: 10
    });
  });

  it("allows Shynok performances without active audience and still applies house payout", async () => {
    await seedCharacter({
      telegramUserId: 155n,
      userId: "user-bard",
      characterId: "character-bard",
      classId: "class.bard",
      level: 3,
      gold: 10
    });

    const result = await repository.startPerformanceForTelegramUser(155n, startInput({
      token: "12345678-1234-4234-9234-000000000155",
      rawHousePayoutGold: 3
    }));

    expect(result.state).toBe("started");
    if (result.state !== "started") {
      throw new Error("Expected started result.");
    }
    expect(result.performance.locationId).toBe("location.korchma.bar");
    expect(result.performance.audienceCount).toBe(0);
    expect(result.performance.housePayoutGold).toBe(3);
    expect(result.audience).toEqual([]);
    await expect(prisma.character.findUnique({ where: { id: "character-bard" } })).resolves.toMatchObject({
      gold: 13
    });
  });

  it("serializes concurrent same-location starts to one live performance and one payout", async () => {
    await seedCharacter({
      telegramUserId: 156n,
      userId: "user-bard",
      characterId: "character-bard",
      classId: "class.bard",
      level: 3,
      gold: 10
    });

    const [left, right] = await Promise.all([
      repository.startPerformanceForTelegramUser(156n, startInput({
        token: "12345678-1234-4234-9234-000000000156",
        rawHousePayoutGold: 13
      })),
      repository.startPerformanceForTelegramUser(156n, startInput({
        token: "12345678-1234-4234-9234-000000000157",
        rawHousePayoutGold: 13
      }))
    ]);
    const states = [left.state, right.state].sort();

    expect(states).toEqual(["live", "started"]);
    await expect(prisma.bardPerformance.count()).resolves.toBe(1);
    await expect(prisma.bardPerformance.aggregate({ _sum: { housePayoutGold: true } })).resolves.toMatchObject({
      _sum: { housePayoutGold: 13 }
    });
    await expect(prisma.character.findUnique({ where: { id: "character-bard" } })).resolves.toMatchObject({
      gold: 23
    });
  });

  it("starts outside Shynok with no house payout and location-scoped cooldown", async () => {
    await seedCharacter({
      telegramUserId: 161n,
      userId: "user-bard",
      characterId: "character-bard",
      classId: "class.bard",
      level: 3,
      gold: 10,
      locationId: "location.korchma.front"
    });
    await seedCharacter({
      telegramUserId: 162n,
      userId: "user-audience",
      characterId: "character-audience",
      gold: 20,
      locationId: "location.korchma.front"
    });
    await seedPerformance({
      id: "performance-bar-cooldown",
      token: "12345678-1234-4234-9234-000000000160",
      housePayoutGold: 13,
      cooldownAvailableAt: new Date("2026-06-26T11:33:00.000Z"),
      expiresAt: new Date("2026-06-26T09:59:00.000Z"),
      locationId: "location.korchma.bar"
    });

    const result = await repository.startPerformanceForTelegramUser(161n, startInput({
      token: "12345678-1234-4234-9234-000000000161",
      rawHousePayoutGold: 0,
      locationId: "location.korchma.front"
    }));
    const duplicate = await repository.startPerformanceForTelegramUser(161n, startInput({
      token: "12345678-1234-4234-9234-000000000162",
      rawHousePayoutGold: 0,
      locationId: "location.korchma.front"
    }));

    expect(result.state).toBe("started");
    if (result.state !== "started") {
      throw new Error("Expected started result.");
    }
    expect(result.performance.locationId).toBe("location.korchma.front");
    expect(result.performance.housePayoutGold).toBe(0);
    expect(result.audience.map((notice) => notice.telegramUserId)).toEqual([162n]);
    expect(duplicate.state).toBe("live");
    await expect(prisma.character.findUnique({ where: { id: "character-bard" } })).resolves.toMatchObject({
      gold: 10
    });
  });

  it("moves a tip exactly once and replays duplicates without spending again", async () => {
    await seedCharacter({ telegramUserId: 201n, userId: "user-bard", characterId: "character-bard", classId: "class.bard", level: 3, gold: 0 });
    await seedCharacter({ telegramUserId: 202n, userId: "user-audience", characterId: "character-audience", gold: 8 });
    await seedPerformance({
      id: "performance-tip",
      token: "12345678-1234-4234-9234-000000000201",
      housePayoutGold: 0
    });
    await seedReaction({
      id: "12345678-1234-4234-9234-000000000202",
      performanceId: "performance-tip",
      characterId: "character-audience",
      telegramUserId: 202n
    });

    const first = await repository.respondToPerformanceForTelegramUser(202n, {
      reactionId: "12345678-1234-4234-9234-000000000202",
      action: "tip",
      tipGold: 5,
      now: now(),
      result: { action: "tip" }
    });
    const second = await repository.respondToPerformanceForTelegramUser(202n, {
      reactionId: "12345678-1234-4234-9234-000000000202",
      action: "tip",
      tipGold: 5,
      now: now(),
      result: { action: "tip" }
    });

    expect(first.state).toBe("tipped");
    expect(second.state).toBe("replayed");
    await expect(prisma.character.findUnique({ where: { id: "character-audience" } })).resolves.toMatchObject({
      gold: 3
    });
    await expect(prisma.character.findUnique({ where: { id: "character-bard" } })).resolves.toMatchObject({
      gold: 5
    });
    await expect(prisma.bardPerformanceReaction.findUnique({
      where: { id: "12345678-1234-4234-9234-000000000202" }
    })).resolves.toMatchObject({ status: "tipped", tipGold: 5 });
  });

  it("blocks response mutation after audience leaves Shynok", async () => {
    await seedCharacter({ telegramUserId: 301n, userId: "user-bard", characterId: "character-bard", classId: "class.bard", level: 3, gold: 0 });
    await seedCharacter({
      telegramUserId: 302n,
      userId: "user-audience",
      characterId: "character-audience",
      gold: 8,
      locationId: "location.korchma.hall"
    });
    await seedPerformance({
      id: "performance-location",
      token: "12345678-1234-4234-9234-000000000301",
      housePayoutGold: 0
    });
    await seedReaction({
      id: "12345678-1234-4234-9234-000000000302",
      performanceId: "performance-location",
      characterId: "character-audience",
      telegramUserId: 302n
    });

    const result = await repository.respondToPerformanceForTelegramUser(302n, {
      reactionId: "12345678-1234-4234-9234-000000000302",
      action: "tip",
      tipGold: 5,
      now: now(),
      result: { action: "tip" }
    });

    expect(result.state).toBe("wrong-place");
    await expect(prisma.character.findUnique({ where: { id: "character-audience" } })).resolves.toMatchObject({
      gold: 8
    });
    await expect(prisma.bardPerformanceReaction.findUnique({
      where: { id: "12345678-1234-4234-9234-000000000302" }
    })).resolves.toMatchObject({ status: "offered", tipGold: 0 });
  });

  it("returns attempted tip amount without mutating when audience lacks gold", async () => {
    await seedCharacter({ telegramUserId: 401n, userId: "user-bard", characterId: "character-bard", classId: "class.bard", level: 3, gold: 0 });
    await seedCharacter({ telegramUserId: 402n, userId: "user-audience", characterId: "character-audience", gold: 3 });
    await seedPerformance({
      id: "performance-insufficient",
      token: "12345678-1234-4234-9234-000000000401",
      housePayoutGold: 0
    });
    await seedReaction({
      id: "12345678-1234-4234-9234-000000000402",
      performanceId: "performance-insufficient",
      characterId: "character-audience",
      telegramUserId: 402n
    });

    const result = await repository.respondToPerformanceForTelegramUser(402n, {
      reactionId: "12345678-1234-4234-9234-000000000402",
      action: "tip",
      tipGold: 13,
      now: now(),
      result: { action: "tip" }
    });

    expect(result).toMatchObject({ state: "insufficient-gold", attemptedTipGold: 13 });
    await expect(prisma.character.findUnique({ where: { id: "character-audience" } })).resolves.toMatchObject({
      gold: 3
    });
    await expect(prisma.character.findUnique({ where: { id: "character-bard" } })).resolves.toMatchObject({
      gold: 0
    });
    await expect(prisma.bardPerformanceReaction.findUnique({
      where: { id: "12345678-1234-4234-9234-000000000402" }
    })).resolves.toMatchObject({ status: "offered", tipGold: 0 });
  });

  it("blocks decline mutation after performer leaves Shynok", async () => {
    await seedRespondablePerformance();
    await prisma.user.update({
      where: { id: "user-bard" },
      data: { lastSeenLocationId: "location.korchma.hall" }
    });

    const result = await repository.respondToPerformanceForTelegramUser(502n, {
      reactionId: "12345678-1234-4234-9234-000000000502",
      action: "decline",
      now: now(),
      result: { action: "decline" }
    });

    expect(result.state).toBe("performer-wrong-place");
    await expectOfferedReactionAndBalances("12345678-1234-4234-9234-000000000502");
  });

  it("blocks tip mutation after performer enters combat", async () => {
    await seedRespondablePerformance();
    await prisma.activeCombatLease.create({
      data: {
        characterId: "character-bard",
        kind: "fight",
        referenceId: "fight-bard"
      }
    });

    const result = await repository.respondToPerformanceForTelegramUser(502n, {
      reactionId: "12345678-1234-4234-9234-000000000502",
      action: "tip",
      tipGold: 5,
      now: now(),
      result: { action: "tip" }
    });

    expect(result.state).toBe("performer-active-combat");
    await expectOfferedReactionAndBalances("12345678-1234-4234-9234-000000000502");
  });

  it("blocks tip mutation after performer enters a pending Barrel raid", async () => {
    await seedRespondablePerformance();
    await prisma.user.update({
      where: { id: "user-bard" },
      data: { currentRaidId: "raid-barrel" }
    });

    const result = await repository.respondToPerformanceForTelegramUser(502n, {
      reactionId: "12345678-1234-4234-9234-000000000502",
      action: "tip",
      tipGold: 5,
      now: now(),
      result: { action: "tip" }
    });

    expect(result.state).toBe("performer-pending-raid");
    await expectOfferedReactionAndBalances("12345678-1234-4234-9234-000000000502");
  });

  it("blocks tip mutation after performer remorts", async () => {
    await seedRespondablePerformance();
    await prisma.characterRemort.create({
      data: {
        characterId: "character-bard",
        token: "remort-bard-1",
        remortNumber: 1,
        previousLevel: 3,
        previousXp: 25,
        previousGold: 0,
        displayNameSnapshot: "character-bard",
        preservedPayloadJson: {}
      }
    });

    const result = await repository.respondToPerformanceForTelegramUser(502n, {
      reactionId: "12345678-1234-4234-9234-000000000502",
      action: "tip",
      tipGold: 5,
      now: now(),
      result: { action: "tip" }
    });

    expect(result.state).toBe("performer-remorted");
    await expectOfferedReactionAndBalances("12345678-1234-4234-9234-000000000502");
  });

  async function seedCharacter(input: {
    telegramUserId: bigint;
    userId: string;
    characterId: string;
    classId?: string;
    level?: number;
    gold?: number;
    locationId?: string;
    currentRaidId?: string | null;
    lastActionAt?: Date;
  }): Promise<void> {
    await prisma.user.create({
      data: {
        id: input.userId,
        telegramUserId: input.telegramUserId,
        displayName: input.characterId,
        lastActionAt: input.lastActionAt ?? now(),
        lastSeenLocationId: input.locationId ?? "location.korchma.bar",
        currentRaidId: input.currentRaidId ?? null
      }
    });
    await prisma.character.create({
      data: {
        id: input.characterId,
        userId: input.userId,
        name: input.characterId,
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: input.classId ?? "class.warrior",
        level: input.level ?? 3,
        xp: 25,
        gold: input.gold ?? 0,
        hpCurrent: 25,
        hpMax: 25,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: { charisma: 8, luck: 6 }
      }
    });
  }

  async function seedPerformance(input: {
    id: string;
    token: string;
    housePayoutGold: number;
    cooldownAvailableAt?: Date;
    expiresAt?: Date;
    locationId?: string;
  }): Promise<void> {
    await prisma.bardPerformance.create({
      data: {
        id: input.id,
        token: input.token,
        characterId: "character-bard",
        telegramUserId: 101n,
        performerName: "character-bard",
        remortCount: 0,
        techniqueId: "technique.class.bard.shynok-performance",
        rulesVersion: "bard-performance-v1",
        locationId: input.locationId ?? "location.korchma.bar",
        localDate: "2026-06-26",
        status: "active",
        liveGuard: `character-bard:${input.locationId ?? "location.korchma.bar"}`,
        grade: "pleasant",
        power: 26,
        housePayoutGold: input.housePayoutGold,
        roleActionXp: 0,
        audienceCount: 0,
        statSnapshotJson: { level: 3, charisma: 8, luck: 6 },
        resultJson: { housePayoutGold: input.housePayoutGold },
        startedAt: now(),
        expiresAt: input.expiresAt ?? new Date("2026-06-26T10:13:00.000Z"),
        cooldownAvailableAt: input.cooldownAvailableAt ?? new Date("2026-06-26T11:33:00.000Z"),
        completedAt: now()
      }
    });
  }

  async function seedReaction(input: {
    id: string;
    performanceId: string;
    characterId: string;
    telegramUserId: bigint;
  }): Promise<void> {
    await prisma.bardPerformanceReaction.create({
      data: {
        id: input.id,
        performanceId: input.performanceId,
        characterId: input.characterId,
        telegramUserId: input.telegramUserId,
        audienceName: input.characterId,
        remortCount: 0,
        status: "offered",
        tipGold: 0,
        offeredAt: now(),
        expiresAt: new Date("2026-06-26T10:13:00.000Z")
      }
    });
  }

  async function seedRespondablePerformance(): Promise<void> {
    await seedCharacter({ telegramUserId: 501n, userId: "user-bard", characterId: "character-bard", classId: "class.bard", level: 3, gold: 0 });
    await seedCharacter({ telegramUserId: 502n, userId: "user-audience", characterId: "character-audience", gold: 8 });
    await seedPerformance({
      id: "performance-performer-stale",
      token: "12345678-1234-4234-9234-000000000501",
      housePayoutGold: 0
    });
    await seedReaction({
      id: "12345678-1234-4234-9234-000000000502",
      performanceId: "performance-performer-stale",
      characterId: "character-audience",
      telegramUserId: 502n
    });
  }

  async function expectOfferedReactionAndBalances(reactionId: string): Promise<void> {
    await expect(prisma.character.findUnique({ where: { id: "character-audience" } })).resolves.toMatchObject({
      gold: 8
    });
    await expect(prisma.character.findUnique({ where: { id: "character-bard" } })).resolves.toMatchObject({
      gold: 0
    });
    await expect(prisma.bardPerformanceReaction.findUnique({
      where: { id: reactionId }
    })).resolves.toMatchObject({ status: "offered", tipGold: 0 });
  }
});

function startInput(overrides: {
  token: string;
  rawHousePayoutGold: number;
  locationId?: string;
  allowNoAudience?: boolean;
}) {
  const locationId = overrides.locationId ?? "location.korchma.bar";

  return {
    token: overrides.token,
    techniqueId: "technique.class.bard.shynok-performance",
    rulesVersion: "bard-performance-v1",
    locationId,
    localDate: "2026-06-26",
    grade: "legendary",
    power: 47,
    rawHousePayoutGold: overrides.rawHousePayoutGold,
    roleActionXp: 0,
    statSnapshot: { level: 3, charisma: 8, luck: 6 },
    result: { grade: "legendary" },
    now: now(),
    expiresAt: new Date("2026-06-26T10:13:00.000Z"),
    cooldownAvailableAt: new Date("2026-06-26T11:33:00.000Z"),
    activeAudienceSince: new Date("2026-06-26T09:55:00.000Z"),
    allowNoAudience: overrides.allowNoAudience ?? locationId === "location.korchma.bar",
    requiredLevel: 3
  };
}

function now(): Date {
  return new Date("2026-06-26T10:00:00.000Z");
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  const statements = [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      telegram_user_id BIGINT NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT,
      language_code TEXT,
      last_action_at DATETIME,
      last_seen_location_id TEXT,
      current_raid_id TEXT,
      current_adventure_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pronoun TEXT NOT NULL DEFAULT 'they',
      path TEXT NOT NULL DEFAULT 'boundary',
      race_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25,
      hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10,
      mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME,
      mana_regen_at DATETIME,
      stats_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE bard_performances (
      id TEXT PRIMARY KEY NOT NULL,
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      telegram_user_id BIGINT NOT NULL,
      performer_name TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      technique_id TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      location_id TEXT NOT NULL,
      local_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      live_guard TEXT,
      grade TEXT NOT NULL,
      power INTEGER NOT NULL,
      house_payout_gold INTEGER NOT NULL DEFAULT 0,
      role_action_xp INTEGER NOT NULL DEFAULT 0,
      audience_count INTEGER NOT NULL DEFAULT 0,
      stat_snapshot_json JSONB NOT NULL,
      result_json JSONB,
      started_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      cooldown_available_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE bard_performance_reactions (
      id TEXT PRIMARY KEY NOT NULL,
      performance_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      telegram_user_id BIGINT NOT NULL,
      audience_name TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'offered',
      tip_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      offered_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      responded_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX bard_performances_live_guard_key ON bard_performances(live_guard)`
  );
}
