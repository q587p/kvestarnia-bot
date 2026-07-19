import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaBardPerformanceRepository } from "../../src/db/repositories/prismaBardPerformanceRepository";
import {
  grantBardInspiration,
  writeBardMusicAvailability
} from "../../src/db/repositories/prismaBardSupport";
import {
  BARD_INSPIRATION_STATUS_KEY,
  buildBardInspirationPayload,
  freezeBardInspirationForCombat,
  getBardMusicAvailabilityKey,
  parseBardInspirationPayload
} from "../../src/domain/noncombat/bardSupport";

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
    await prisma.characterCooldown.deleteMany();
    await prisma.duelCombatSession.deleteMany();
    await prisma.partyBossSession.deleteMany();
    await prisma.activeCombatLease.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.characterEquipment.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
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

  it("starts a new live performance after remort without reusing the previous-life guard", async () => {
    await seedCharacter({
      telegramUserId: 163n,
      userId: "user-life-bard",
      characterId: "character-life-bard",
      classId: "class.bard",
      level: 3
    });
    const lifeZero = await repository.startPerformanceForTelegramUser(163n, startInput({
      token: "12345678-1234-4234-9234-000000000163",
      rawHousePayoutGold: 0
    }));
    expect(lifeZero.state).toBe("started");
    await expect(repository.getLivePerformanceForTelegramUser(
      163n,
      new Date("2026-06-26T10:01:00.000Z")
    )).resolves.toMatchObject({ remortCount: 0 });

    await prisma.characterRemort.create({
      data: {
        characterId: "character-life-bard",
        token: "life-bard-remort-1",
        remortNumber: 1,
        previousLevel: 3,
        previousXp: 25,
        previousGold: 0,
        displayNameSnapshot: "character-life-bard",
        preservedPayloadJson: {}
      }
    });
    await prisma.characterCooldown.deleteMany({ where: { characterId: "character-life-bard" } });
    await expect(repository.getLivePerformanceForTelegramUser(
      163n,
      new Date("2026-06-26T10:01:00.000Z")
    )).resolves.toBeNull();
    const lifeOne = await repository.startPerformanceForTelegramUser(163n, startInput({
      token: "12345678-1234-4234-9234-000000000164",
      rawHousePayoutGold: 0
    }));

    expect(lifeOne.state).toBe("started");
    await expect(repository.getLivePerformanceForTelegramUser(
      163n,
      new Date("2026-06-26T10:01:00.000Z")
    )).resolves.toMatchObject({ remortCount: 1 });
    const rows = await prisma.bardPerformance.findMany({
      where: { characterId: "character-life-bard" },
      orderBy: { remortCount: "asc" },
      select: { remortCount: true, status: true, liveGuard: true }
    });
    expect(rows).toEqual([
      { remortCount: 0, status: "active", liveGuard: "character-life-bard:0:location.korchma.bar" },
      { remortCount: 1, status: "active", liveGuard: "character-life-bard:1:location.korchma.bar" }
    ]);
  });

  it("reads a live performance only at the Bard's current location", async () => {
    await seedCharacter({
      telegramUserId: 164n,
      userId: "user-location-bard",
      characterId: "character-location-bard",
      classId: "class.bard",
      level: 3
    });
    await repository.startPerformanceForTelegramUser(164n, startInput({
      token: "12345678-1234-4234-9234-000000000165",
      rawHousePayoutGold: 0
    }));

    await expect(repository.getLivePerformanceForTelegramUser(
      164n,
      new Date("2026-06-26T10:01:00.000Z")
    )).resolves.toMatchObject({ locationId: "location.korchma.bar" });

    await prisma.user.update({
      where: { id: "user-location-bard" },
      data: { lastSeenLocationId: "location.korchma.front" }
    });

    await expect(repository.getLivePerformanceForTelegramUser(
      164n,
      new Date("2026-06-26T10:01:00.000Z")
    )).resolves.toBeNull();
  });

  it("atomically grants Inspiration to the frozen audience and writes shared music availability", async () => {
    await seedCharacter({ telegramUserId: 104n, userId: "user-bard", characterId: "character-bard", classId: "class.bard", level: 3 });
    await seedCharacter({ telegramUserId: 105n, userId: "user-audience", characterId: "character-audience" });

    const result = await repository.startPerformanceForTelegramUser(104n, startInput({
      token: "12345678-1234-4234-9234-000000000104",
      rawHousePayoutGold: 0
    }));

    expect(result.state).toBe("started");
    if (result.state !== "started") {
      throw new Error("Expected Bard support start.");
    }
    expect(result.audience[0]?.inspiration).toMatchObject({
      mutation: "granted",
      accuracyBonusPp: 5
    });
    const inspiration = await prisma.characterCooldown.findUnique({
      where: { characterId_key: { characterId: "character-audience", key: BARD_INSPIRATION_STATUS_KEY } }
    });
    expect(parseBardInspirationPayload(inspiration?.resultJson)).toMatchObject({
      sourcePerformanceId: result.performance.id,
      recipientCharacterId: "character-audience",
      accuracyBonusPp: 5,
      expiresAt: "2026-06-26T10:13:00.000Z"
    });
    await expect(prisma.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: "character-bard",
          key: getBardMusicAvailabilityKey("location.korchma.bar")
        }
      }
    })).resolves.toMatchObject({ availableAt: new Date("2026-06-26T11:33:00.000Z") });
  });

  it("keeps equal or weaker Inspiration without refresh and replaces it with a stronger grade", async () => {
    await seedCharacter({ telegramUserId: 106n, userId: "user-audience", characterId: "character-audience" });
    const grant = (grade: "rough" | "pleasant" | "legendary", at: Date, id: string) => prisma.$transaction((tx) =>
      grantBardInspiration({
        tx,
        activationId: `activation-${id}`,
        sourcePerformanceId: `performance-${id}`,
        sourceCharacterId: "character-bard",
        sourceLocationId: "location.korchma.bar",
        recipientCharacterId: "character-audience",
        recipientRemortCount: 0,
        grade,
        now: at
      })
    );

    const first = await grant("pleasant", now(), "first");
    const unchanged = await grant("rough", new Date("2026-06-26T10:01:00.000Z"), "weaker");
    const replaced = await grant("legendary", new Date("2026-06-26T10:02:00.000Z"), "stronger");

    expect(first?.mutation).toBe("granted");
    expect(unchanged).toMatchObject({ mutation: "unchanged", inspiration: { activationId: "activation-first" } });
    expect(unchanged?.inspiration.expiresAt).toBe("2026-06-26T10:13:00.000Z");
    expect(replaced).toMatchObject({
      mutation: "replaced",
      inspiration: { activationId: "activation-stronger", expiresAt: "2026-06-26T10:15:00.000Z" }
    });
  });

  it("serializes concurrent Inspiration grades so a weaker grant cannot overwrite a stronger one", async () => {
    await seedCharacter({ telegramUserId: 108n, userId: "user-concurrent", characterId: "character-concurrent" });
    const grant = (grade: "rough" | "legendary", id: string) => prisma.$transaction((tx) =>
      grantBardInspiration({
        tx,
        activationId: `activation-${id}`,
        sourcePerformanceId: `performance-${id}`,
        sourceCharacterId: `bard-${id}`,
        sourceLocationId: "location.korchma.bar",
        recipientCharacterId: "character-concurrent",
        recipientRemortCount: 0,
        grade,
        now: now()
      })
    );

    await Promise.all([grant("rough", "rough"), grant("legendary", "legendary")]);
    const stored = await prisma.characterCooldown.findUniqueOrThrow({
      where: {
        characterId_key: {
          characterId: "character-concurrent",
          key: BARD_INSPIRATION_STATUS_KEY
        }
      }
    });

    expect(parseBardInspirationPayload(stored.resultJson)).toMatchObject({
      activationId: "activation-legendary",
      accuracyBonusPp: 5
    });
  });

  it("blocks a performance from the shared music cooldown written by Lament", async () => {
    await seedCharacter({ telegramUserId: 107n, userId: "user-bard", characterId: "character-bard", classId: "class.bard", level: 3 });
    await prisma.$transaction((tx) => writeBardMusicAvailability({
      tx,
      characterId: "character-bard",
      locationId: "location.korchma.bar",
      now: new Date("2026-06-26T09:30:00.000Z"),
      source: "lament",
      sourceId: "lament-1"
    }));

    await expect(repository.startPerformanceForTelegramUser(107n, startInput({
      token: "12345678-1234-4234-9234-000000000107",
      rawHousePayoutGold: 0
    }))).resolves.toMatchObject({
      state: "cooldown",
      availableAt: new Date("2026-06-26T11:03:00.000Z")
    });
  });

  it("ignores previous-life performance cooldown history after remort", async () => {
    await seedCharacter({
      telegramUserId: 101n,
      userId: "user-bard",
      characterId: "character-bard",
      classId: "class.bard",
      level: 3
    });
    await seedPerformance({
      id: "previous-life-performance",
      token: "12345678-1234-4234-9234-000000000108",
      housePayoutGold: 0,
      expiresAt: new Date("2026-06-26T09:59:00.000Z"),
      cooldownAvailableAt: new Date("2026-06-26T11:33:00.000Z")
    });
    await prisma.characterRemort.create({
      data: {
        id: "bard-remort-1",
        characterId: "character-bard",
        token: "bard-remort-token-1",
        remortNumber: 1,
        previousLevel: 3,
        previousXp: 25,
        previousGold: 0,
        displayNameSnapshot: "character-bard",
        preservedPayloadJson: {},
        createdAt: new Date("2026-06-26T09:59:30.000Z")
      }
    });

    await expect(repository.startPerformanceForTelegramUser(101n, startInput({
      token: "12345678-1234-4234-9234-000000000109",
      rawHousePayoutGold: 0
    }))).resolves.toMatchObject({ state: "started" });
  });

  it("shows the frozen Inspiration value after wall-clock expiry and the released value afterward", async () => {
    await seedCharacter({
      telegramUserId: 110n,
      userId: "user-frozen-hero",
      characterId: "character-frozen-hero"
    });
    const startedAt = new Date("2026-06-26T10:00:00.000Z");
    const payload = buildBardInspirationPayload({
      activationId: "frozen-hero-inspiration",
      sourcePerformanceId: "performance-frozen-hero",
      sourceCharacterId: "character-bard",
      sourceLocationId: "location.korchma.bar",
      recipientCharacterId: "character-frozen-hero",
      recipientRemortCount: 0,
      grade: "pleasant",
      now: startedAt
    });
    const frozen = freezeBardInspirationForCombat(
      payload,
      "character-frozen-hero",
      0,
      startedAt
    )!;
    await prisma.characterCooldown.create({
      data: {
        id: "frozen-hero-cooldown",
        characterId: "character-frozen-hero",
        key: BARD_INSPIRATION_STATUS_KEY,
        availableAt: new Date(payload.expiresAt),
        resultJson: payload
      }
    });
    await prisma.soloCombatSession.create({
      data: {
        id: "frozen-hero-session",
        characterId: "character-frozen-hero",
        monsterId: "monster.test",
        status: "active",
        turn: 1,
        stateJson: { bardInspiration: frozen },
        expiresAt: new Date("2026-06-26T11:00:00.000Z")
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "frozen-hero-lease",
        characterId: "character-frozen-hero",
        kind: "solo-combat",
        referenceId: "frozen-hero-session",
        createdAt: startedAt,
        updatedAt: startedAt
      }
    });

    const duringCombat = await repository.getInspirationForTelegramUser(
      110n,
      new Date("2026-06-26T10:20:00.000Z")
    );
    expect(duringCombat?.inspiration?.expiresAt).toBe("2026-06-26T10:33:00.000Z");
    expect(duringCombat?.inspiration?.cursorAt).toBe("2026-06-26T10:20:00.000Z");

    const released = {
      ...payload,
      expiresAt: "2026-06-26T10:33:00.000Z",
      cursorAt: "2026-06-26T10:20:00.000Z"
    };
    await prisma.activeCombatLease.delete({ where: { id: "frozen-hero-lease" } });
    await prisma.characterCooldown.update({
      where: { id: "frozen-hero-cooldown" },
      data: { availableAt: new Date(released.expiresAt), resultJson: released }
    });
    const afterRelease = await repository.getInspirationForTelegramUser(
      110n,
      new Date("2026-06-26T10:20:00.000Z")
    );
    expect(afterRelease?.inspiration).toMatchObject({
      expiresAt: released.expiresAt,
      cursorAt: released.cursorAt
    });
  });

  it.each([
    ["solo combat", "solo-combat"],
    ["turn duel", "turn-based-duel"],
    ["Big Barrel", "party-boss"]
  ] as const)("treats an exhausted frozen Inspiration snapshot as authoritative in %s", async (_label, kind) => {
    const characterId = `character-exhausted-${kind}`;
    const userId = `user-exhausted-${kind}`;
    const referenceId = `reference-exhausted-${kind}`;
    const startedAt = new Date("2026-06-26T10:00:00.000Z");
    await seedCharacter({ telegramUserId: 170n, userId, characterId });
    const payload = buildBardInspirationPayload({
      activationId: `activation-exhausted-${kind}`,
      sourcePerformanceId: "performance-exhausted",
      sourceCharacterId: "character-bard",
      sourceLocationId: "location.korchma.bar",
      recipientCharacterId: characterId,
      recipientRemortCount: 0,
      grade: "pleasant",
      now: startedAt
    });
    const frozen = {
      ...freezeBardInspirationForCombat(payload, characterId, 0, startedAt)!,
      expiresAt: startedAt.toISOString(),
      cursorAt: startedAt.toISOString(),
      pulseIds: Array.from({ length: 13 }, (_, index) => `pulse-${index + 1}`)
    };
    await prisma.characterCooldown.create({
      data: {
        characterId,
        key: BARD_INSPIRATION_STATUS_KEY,
        availableAt: new Date(payload.expiresAt),
        resultJson: payload
      }
    });

    if (kind === "solo-combat") {
      await prisma.soloCombatSession.create({
        data: {
          id: referenceId,
          characterId,
          monsterId: "monster.test",
          status: "active",
          turn: 14,
          stateJson: { bardInspiration: frozen },
          expiresAt: new Date("2026-06-26T11:00:00.000Z")
        }
      });
    } else if (kind === "turn-based-duel") {
      await prisma.$executeRawUnsafe(
        "INSERT INTO duel_combat_sessions (id, status, state_json) VALUES (?, 'active', ?)",
        referenceId,
        JSON.stringify({ participants: { challenger: { bardInspiration: frozen } } })
      );
    } else {
      await prisma.$executeRawUnsafe(
        "INSERT INTO party_boss_sessions (id, party_session_id, status, state_json) VALUES (?, ?, 'active', ?)",
        `boss-${referenceId}`,
        referenceId,
        JSON.stringify({ participants: [{ characterId, bardInspiration: frozen }] })
      );
    }
    await prisma.activeCombatLease.create({
      data: {
        characterId,
        kind,
        referenceId,
        createdAt: startedAt,
        updatedAt: startedAt
      }
    });

    const result = await repository.getInspirationForTelegramUser(
      170n,
      new Date("2026-06-26T10:01:00.000Z")
    );
    expect(result?.inspiration).toBeNull();
  });

  it("normalizes legacy presence aliases for Bard start, audience matching and response", async () => {
    await seedCharacter({
      telegramUserId: 111n,
      userId: "user-bard",
      characterId: "character-bard",
      classId: "class.bard",
      level: 3,
      locationId: "location.tavern"
    });
    await seedCharacter({
      telegramUserId: 112n,
      userId: "user-audience",
      characterId: "character-audience",
      gold: 3,
      locationId: "location.korchma.hall"
    });

    const started = await repository.startPerformanceForTelegramUser(111n, startInput({
      token: "12345678-1234-4234-9234-000000000111",
      rawHousePayoutGold: 0,
      locationId: "location.korchma.hall"
    }));

    expect(started.state).toBe("started");
    if (started.state !== "started") {
      throw new Error(`Expected alias-safe Bard start, got ${started.state}.`);
    }
    expect(started.audience.map((notice) => notice.telegramUserId)).toEqual([112n]);
    expect(started.audience[0]?.gold).toBe(3);

    await expect(repository.respondToPerformanceForTelegramUser(112n, {
      reactionId: started.audience[0]!.reaction.id,
      action: "decline",
      tipGold: 0,
      now: now(),
      result: { action: "decline" }
    })).resolves.toMatchObject({ state: "declined" });
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
    await expect(prisma.user.findUnique({ where: { id: "user-bard" } })).resolves.toMatchObject({
      lastSeenLocationId: "location.korchma.front"
    });
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

  it("blocks tip mutation after audience enters combat", async () => {
    await seedRespondablePerformance();
    await prisma.activeCombatLease.create({
      data: {
        characterId: "character-audience",
        kind: "fight",
        referenceId: "fight-audience"
      }
    });

    const result = await repository.respondToPerformanceForTelegramUser(502n, {
      reactionId: "12345678-1234-4234-9234-000000000502",
      action: "tip",
      tipGold: 5,
      now: now(),
      result: { action: "tip" }
    });

    expect(result.state).toBe("active-combat");
    await expectOfferedReactionAndBalances("12345678-1234-4234-9234-000000000502");
  });

  it("blocks tip mutation after audience enters a pending Barrel raid", async () => {
    await seedRespondablePerformance();
    await prisma.user.update({
      where: { id: "user-audience" },
      data: { currentRaidId: "raid-barrel" }
    });

    const result = await repository.respondToPerformanceForTelegramUser(502n, {
      reactionId: "12345678-1234-4234-9234-000000000502",
      action: "tip",
      tipGold: 5,
      now: now(),
      result: { action: "tip" }
    });

    expect(result.state).toBe("pending-raid");
    await expectOfferedReactionAndBalances("12345678-1234-4234-9234-000000000502");
  });

  it("blocks tip mutation after audience remorts", async () => {
    await seedRespondablePerformance();
    await prisma.characterRemort.create({
      data: {
        characterId: "character-audience",
        token: "remort-audience-1",
        remortNumber: 1,
        previousLevel: 3,
        previousXp: 25,
        previousGold: 8,
        displayNameSnapshot: "character-audience",
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

    expect(result.state).toBe("remort-mismatch");
    await expectOfferedReactionAndBalances("12345678-1234-4234-9234-000000000502");
  });

  it("expires stale audience reactions without moving gold", async () => {
    await seedRespondablePerformance();

    const result = await repository.respondToPerformanceForTelegramUser(502n, {
      reactionId: "12345678-1234-4234-9234-000000000502",
      action: "tip",
      tipGold: 5,
      now: new Date("2026-06-26T10:14:00.000Z"),
      result: { action: "tip" }
    });

    expect(result.state).toBe("expired");
    await expect(prisma.character.findUnique({ where: { id: "character-audience" } })).resolves.toMatchObject({
      gold: 8
    });
    await expect(prisma.character.findUnique({ where: { id: "character-bard" } })).resolves.toMatchObject({
      gold: 0
    });
    await expect(prisma.bardPerformanceReaction.findUnique({
      where: { id: "12345678-1234-4234-9234-000000000502" }
    })).resolves.toMatchObject({ status: "expired", tipGold: 0 });
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
        liveGuard: `character-bard:0:${input.locationId ?? "location.korchma.bar"}`,
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
      active_cosmetic_title_grant_id TEXT,
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
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE solo_combat_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      character_id TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      state_json JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      reward_xp INTEGER,
      reward_gold INTEGER,
      reward_items_json JSONB,
      reward_claimed_at DATETIME,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE duel_combat_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      state_json JSONB NOT NULL
    )`,
    `CREATE TABLE party_boss_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      party_session_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      state_json JSONB NOT NULL
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
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`
  );
}
