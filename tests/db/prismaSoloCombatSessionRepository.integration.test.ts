import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaSoloCombatSessionRepository } from "../../src/db/repositories/prismaSoloCombatSessionRepository";
import type { CreateSoloCombatSessionInput } from "../../src/db/repositories/soloCombatSessionRepository";
import type { CombatState } from "../../src/domain/combat";

describe("PrismaSoloCombatSessionRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaSoloCombatSessionRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-solo-combat-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaSoloCombatSessionRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("rolls back duplicate active solo fight creation through the combat lease", async () => {
    await seedCharacter(prisma, {
      userId: "user-solo-race",
      characterId: "character-solo-race",
      telegramUserId: 4242n
    });

    const [first, second] = await Promise.all([
      repository.createForTelegramUser(
        4242n,
        makeCreateInput("session-solo-race-a", "monster.deadline-spider")
      ),
      repository.createForTelegramUser(
        4242n,
        makeCreateInput("session-solo-race-b", "monster.preapproval-dragonling")
      )
    ]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second?.id).toBe(first?.id);

    const activeSessions = await prisma.soloCombatSession.findMany({
      where: {
        characterId: "character-solo-race",
        status: "active"
      }
    });
    const leases = await prisma.activeCombatLease.findMany({
      where: {
        characterId: "character-solo-race"
      }
    });

    expect(activeSessions).toHaveLength(1);
    expect(leases).toHaveLength(1);
    expect(leases[0]?.referenceId).toBe(activeSessions[0]?.id);
    expect(activeSessions[0]?.id).toBe(first?.id);
  });

  it("scans past newer active and non-ordinary sessions for recent ordinary monsters", async () => {
    await seedCharacter(prisma, {
      userId: "user-history",
      characterId: "character-history",
      telegramUserId: 4243n
    });

    const base = new Date("2026-06-22T10:00:00.000Z").getTime();
    const sessions = [];
    for (let index = 0; index < 55; index += 1) {
      const source = index % 2 === 0 ? "yeger" : "adventure";
      sessions.push(makeSoloSessionData({
        id: `noise-${String(index).padStart(2, "0")}`,
        characterId: "character-history",
        monsterId: `monster.noise-${index}`,
        status: index % 5 === 0 ? "active" : "won",
        source,
        completedAt: new Date(base + (90 + index) * 60_000),
        updatedAt: new Date(base + (90 + index) * 60_000)
      }));
    }

    sessions.push(makeSoloSessionData({
      id: "ordinary-old-duplicate",
      characterId: "character-history",
      monsterId: "monster.normal-a",
      status: "won",
      source: "normal",
      completedAt: new Date(base + 10 * 60_000),
      updatedAt: new Date(base + 10 * 60_000)
    }));
    sessions.push(makeSoloSessionData({
      id: "ordinary-c",
      characterId: "character-history",
      monsterId: "monster.normal-c",
      status: "lost",
      source: "normal",
      completedAt: new Date(base + 20 * 60_000),
      updatedAt: new Date(base + 20 * 60_000)
    }));
    sessions.push(makeSoloSessionData({
      id: "ordinary-b",
      characterId: "character-history",
      monsterId: "monster.normal-b",
      status: "won",
      source: "normal",
      completedAt: new Date(base + 30 * 60_000),
      updatedAt: new Date(base + 30 * 60_000)
    }));
    sessions.push(makeSoloSessionData({
      id: "ordinary-a",
      characterId: "character-history",
      monsterId: "monster.normal-a",
      status: "won",
      source: "normal",
      completedAt: new Date(base + 40 * 60_000),
      updatedAt: new Date(base + 40 * 60_000)
    }));
    await prisma.soloCombatSession.createMany({ data: sessions });

    await expect(repository.listRecentOrdinaryMonsterIdsByTelegramUserId(4243n, 3)).resolves.toEqual([
      "monster.normal-a",
      "monster.normal-b",
      "monster.normal-c"
    ]);
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

async function seedCharacter(
  prisma: PrismaClient,
  input: { userId: string; characterId: string; telegramUserId: bigint }
): Promise<void> {
  await prisma.user.create({
    data: {
      id: input.userId,
      telegramUserId: input.telegramUserId
    }
  });
  await prisma.character.create({
    data: {
      id: input.characterId,
      userId: input.userId,
      name: "Мандрівник",
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

function makeCreateInput(id: string, monsterId: string): CreateSoloCombatSessionInput {
  return {
    id,
    monsterId,
    state: makeCombatState(id, monsterId),
    expiresAt: new Date("2026-06-12T11:00:00.000Z")
  };
}

function makeCombatState(id: string, monsterId: string): CombatState {
  return {
    id,
    source: "normal",
    turn: 1,
    status: "active",
    hero: {
      hp: 22,
      hpMax: 22,
      mana: 10,
      manaMax: 10
    },
    monster: {
      id: monsterId,
      hp: 18,
      hpMax: 18
    }
  };
}

function makeSoloSessionData(input: {
  id: string;
  characterId: string;
  monsterId: string;
  status: "active" | "won" | "lost" | "fled" | "expired";
  source: NonNullable<CombatState["source"]>;
  completedAt: Date;
  updatedAt: Date;
}) {
  const state = {
    ...makeCombatState(input.id, input.monsterId),
    status: input.status,
    source: input.source,
    ...(input.status === "active" ? {} : { completedAt: input.completedAt.toISOString() })
  };

  return {
    id: input.id,
    characterId: input.characterId,
    monsterId: input.monsterId,
    stateJson: state,
    status: input.status,
    turn: 1,
    expiresAt: new Date(input.updatedAt.getTime() + 30 * 60_000),
    createdAt: input.completedAt,
    updatedAt: input.updatedAt
  };
}
