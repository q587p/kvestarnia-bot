import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPendingPassageEncounterRepository } from "../../src/db/repositories/prismaPendingPassageEncounterRepository";
import type { CombatState } from "../../src/domain/combat";

describe("PrismaPendingPassageEncounterRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaPendingPassageEncounterRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-pending-passage-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaPendingPassageEncounterRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("reuses same-passage previews and keeps all three passages distinct", async () => {
    await seedCharacter(prisma, "user-reuse", "character-reuse", 9201n);
    const now = new Date("2026-06-22T10:00:00.000Z");

    const straight = await repository.createForTelegramUser(9201n, makeEncounterInput("straight", "location.korchma.deep.level1.straight", now));
    const reused = await repository.createForTelegramUser(9201n, makeEncounterInput("straight-new", "location.korchma.deep.level1.straight", now));
    const left = await repository.createForTelegramUser(9201n, makeEncounterInput("left", "location.korchma.deep.level1.left", now));
    const right = await repository.createForTelegramUser(9201n, makeEncounterInput("right", "location.korchma.deep.level1.right", now));

    expect(reused?.id).toBe(straight?.id);
    expect(new Set([straight?.id, left?.id, right?.id]).size).toBe(3);
    await expect(prisma.pendingPassageEncounter.count({
      where: { characterId: "character-reuse", status: "pending" }
    })).resolves.toBe(3);
  });

  it("lets one concurrent first-consume create one session and one active lease", async () => {
    await seedCharacter(prisma, "user-consume-race", "character-consume-race", 9202n);
    const now = new Date("2026-06-22T10:00:00.000Z");
    const encounter = await repository.createForTelegramUser(9202n, makeEncounterInput("consume-race", "location.korchma.deep.level1.straight", now));
    if (!encounter) throw new Error("missing encounter");

    const [first, second] = await Promise.all([
      repository.consumeForTelegramUser(9202n, encounter.token, makeConsumeInput("session-consume-a", encounter, now)),
      repository.consumeForTelegramUser(9202n, encounter.token, makeConsumeInput("session-consume-b", encounter, now))
    ]);
    const states = [first.state, second.state];

    expect(states.filter((state) => state === "consumed")).toHaveLength(1);
    expect(states.some((state) => state === "already-consumed" || state === "version-changed" || state === "active-fight")).toBe(true);
    await expect(prisma.soloCombatSession.count({ where: { characterId: "character-consume-race" } })).resolves.toBe(1);
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-consume-race" } })).resolves.toBe(1);
    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: encounter.id } })).resolves.toMatchObject({
      status: "consumed",
      version: 2
    });
  });

  it("allows exactly one winner between consume and guarded expiry", async () => {
    await seedCharacter(prisma, "user-expiry-race", "character-expiry-race", 9203n);
    const now = new Date("2026-06-22T10:00:00.000Z");
    const encounter = await repository.createForTelegramUser(9203n, makeEncounterInput("expiry-race", "location.korchma.deep.level1.straight", now));
    if (!encounter) throw new Error("missing encounter");

    const [consume, expire] = await Promise.all([
      repository.consumeForTelegramUser(9203n, encounter.token, makeConsumeInput("session-expiry-race", encounter, now)),
      repository.expireById({
        id: encounter.id,
        expectedStatus: "pending",
        expectedVersion: encounter.version,
        now
      })
    ]);
    const row = await prisma.pendingPassageEncounter.findUnique({ where: { id: encounter.id } });

    expect([consume.state, expire.state].filter((state) => state === "consumed" || state === "expired")).toHaveLength(1);
    expect(row?.status === "consumed" || row?.status === "expired").toBe(true);
    expect(row?.version).toBe(2);
    if (row?.status === "consumed") {
      expect(row.combatSessionId).toBe("session-expiry-race");
    }
  });

  it("rejects stale versions, wrong owners and frozen-state mismatches without mutating rows", async () => {
    await seedCharacter(prisma, "user-invalid-owner", "character-invalid-owner", 9204n);
    await seedCharacter(prisma, "user-invalid-other", "character-invalid-other", 9205n);
    const now = new Date("2026-06-22T10:00:00.000Z");
    const encounter = await repository.createForTelegramUser(9204n, makeEncounterInput("invalid", "location.korchma.deep.level1.straight", now));
    if (!encounter) throw new Error("missing encounter");

    await expect(repository.consumeForTelegramUser(9204n, encounter.token, {
      ...makeConsumeInput("session-stale", encounter, now),
      expectedEncounterVersion: encounter.version + 1
    })).resolves.toMatchObject({ state: "version-changed" });
    await expect(repository.consumeForTelegramUser(9205n, encounter.token, makeConsumeInput("session-owner", encounter, now))).resolves.toEqual({ state: "invalid" });
    await expect(repository.consumeForTelegramUser(9204n, encounter.token, {
      ...makeConsumeInput("session-mismatch", encounter, now),
      monsterId: "monster.preapproval-dragonling"
    })).resolves.toEqual({ state: "invalid" });
    await expect(prisma.soloCombatSession.count({ where: { characterId: "character-invalid-owner" } })).resolves.toBe(0);
    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: encounter.id } })).resolves.toMatchObject({
      status: "pending",
      version: 1,
      combatSessionId: null
    });
  });

  it("lets one wounded re-attack relink win and blocks trail-expired re-attacks", async () => {
    await seedCharacter(prisma, "user-wounded", "character-wounded", 9206n);
    const now = new Date("2026-06-22T10:00:00.000Z");
    const encounter = await repository.createForTelegramUser(9206n, makeEncounterInput("wounded", "location.korchma.deep.level1.straight", now));
    if (!encounter) throw new Error("missing encounter");
    const consumed = await repository.consumeForTelegramUser(9206n, encounter.token, makeConsumeInput("session-wounded-original", encounter, now));
    if (consumed.state !== "consumed") throw new Error("not consumed");
    await prisma.activeCombatLease.deleteMany({ where: { characterId: "character-wounded" } });
    await prisma.soloCombatSession.update({
      where: { id: consumed.session.id },
      data: {
        status: "lost",
        stateJson: makeCombatState("session-wounded-original", encounter, {
          status: "lost",
          monsterHp: 5,
          completedAt: now
        })
      }
    });
    const current = await repository.findByTokenForTelegramUser(9206n, encounter.token);
    if (!current?.combatSessionId) throw new Error("missing linked session");

    const [first, second] = await Promise.all([
      repository.createSessionForConsumedEncounter(9206n, encounter.token, makeConsumeInput("session-wounded-a", current, now, current.combatSessionId)),
      repository.createSessionForConsumedEncounter(9206n, encounter.token, makeConsumeInput("session-wounded-b", current, now, current.combatSessionId))
    ]);

    expect([first.state, second.state].filter((state) => state === "consumed")).toHaveLength(1);
    await expect(prisma.soloCombatSession.count({ where: { characterId: "character-wounded" } })).resolves.toBe(2);
    const relinked = await repository.findByTokenForTelegramUser(9206n, encounter.token);
    if (!relinked?.combatSessionId) throw new Error("missing relinked session");
    await prisma.activeCombatLease.deleteMany({ where: { characterId: "character-wounded" } });
    await prisma.pendingPassageEncounter.update({
      where: { id: encounter.id },
      data: { expiresAt: new Date("2026-06-22T09:59:59.000Z") }
    });

    await expect(repository.createSessionForConsumedEncounter(9206n, encounter.token, makeConsumeInput("session-too-late", {
      ...relinked,
      expiresAt: new Date("2026-06-22T09:59:59.000Z")
    }, now, relinked.combatSessionId))).resolves.toMatchObject({ state: "not-pending" });
  });

  it("leaves the encounter pending when a conflicting active lease blocks session creation", async () => {
    await seedCharacter(prisma, "user-lease", "character-lease", 9207n);
    const now = new Date("2026-06-22T10:00:00.000Z");
    const encounter = await repository.createForTelegramUser(9207n, makeEncounterInput("lease", "location.korchma.deep.level1.straight", now));
    if (!encounter) throw new Error("missing encounter");
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-training",
        characterId: "character-lease",
        kind: "training",
        referenceId: "training-session"
      }
    });

    await expect(repository.consumeForTelegramUser(9207n, encounter.token, makeConsumeInput("session-blocked", encounter, now))).resolves.toEqual({
      state: "active-lease-conflict"
    });
    await expect(prisma.soloCombatSession.count({ where: { characterId: "character-lease" } })).resolves.toBe(0);
    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: encounter.id } })).resolves.toMatchObject({
      status: "pending",
      combatSessionId: null,
      version: 1
    });
  });
});

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      telegram_user_id INTEGER NOT NULL UNIQUE,
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
      id TEXT PRIMARY KEY,
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
    `CREATE TABLE pending_passage_encounters (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      origin_location_id TEXT NOT NULL,
      passage TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      base_monster_level INTEGER NOT NULL,
      effective_monster_level INTEGER NOT NULL,
      rules_version TEXT NOT NULL,
      seed_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      active_key TEXT UNIQUE,
      version INTEGER NOT NULL DEFAULT 1,
      combat_session_id TEXT,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME,
      cancelled_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE solo_combat_sessions (
      id TEXT PRIMARY KEY,
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
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function seedCharacter(prisma: PrismaClient, userId: string, characterId: string, telegramUserId: bigint): Promise<void> {
  await prisma.user.create({ data: { id: userId, telegramUserId } });
  await prisma.character.create({
    data: {
      id: characterId,
      userId,
      name: "Tester",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 6,
      xp: 110,
      gold: 0,
      hpCurrent: 22,
      hpMax: 22,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: {
        strength: 8,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    }
  });
}

function makeEncounterInput(suffix: string, originLocationId: string, now: Date) {
  const passage = originLocationId.endsWith(".left")
    ? "deep-left"
    : originLocationId.endsWith(".right")
      ? "deep-right"
      : "deep-straight";
  const difficulty = passage === "deep-left" ? "hard" : passage === "deep-right" ? "easy" : "normal";

  return {
    now,
    token: `token-${suffix}`,
    originLocationId,
    passage,
    difficulty,
    monsterId: "monster.deadline-spider",
    baseMonsterLevel: 3,
    effectiveMonsterLevel: 3,
    rulesVersion: "nyz-passage-preview-v1",
    seedHash: `seed-${suffix}`,
    expiresAt: new Date(now.getTime() + 93 * 60 * 1000)
  } as const;
}

function makeConsumeInput(
  sessionId: string,
  encounter: {
    version: number;
    combatSessionId: string | null;
    monsterId: string;
    baseMonsterLevel: number;
    effectiveMonsterLevel: number;
    originLocationId: string;
  },
  now: Date,
  expectedLinkedSessionId: string | null = null
) {
  return {
    sessionId,
    expectedEncounterVersion: encounter.version,
    expectedLinkedSessionId,
    monsterId: encounter.monsterId,
    state: makeCombatState(sessionId, encounter),
    sessionExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    now
  };
}

function makeCombatState(
  sessionId: string,
  encounter: {
    monsterId: string;
    baseMonsterLevel: number;
    effectiveMonsterLevel: number;
    originLocationId: string;
  },
  options: { status?: CombatState["status"]; monsterHp?: number; completedAt?: Date } = {}
): CombatState {
  return {
    id: sessionId,
    source: "normal",
    originLocationId: encounter.originLocationId,
    turn: 1,
    status: options.status ?? "active",
    ...(options.completedAt ? { completedAt: options.completedAt.toISOString() } : {}),
    hero: {
      hp: options.status === "lost" ? 0 : 22,
      hpMax: 22,
      mana: 10,
      manaMax: 10
    },
    monster: {
      id: encounter.monsterId,
      level: encounter.effectiveMonsterLevel,
      hp: options.monsterHp ?? 18,
      hpMax: 18,
      debugTrace: {
        baseMonsterLevel: encounter.baseMonsterLevel,
        effectiveMonsterLevel: encounter.effectiveMonsterLevel,
        interventionKind: "none",
        interventionSourceKey: "prypichnyk"
      }
    }
  };
}
