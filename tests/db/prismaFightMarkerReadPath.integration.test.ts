import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaDailyActionRepository } from "../../src/db/repositories/prismaDailyActionRepository";
import { PrismaSoloCombatSessionRepository } from "../../src/db/repositories/prismaSoloCombatSessionRepository";
import {
  FightService,
  PROBLEM_QUEST_BUCKET,
  PROBLEM_QUEST_STAGES
} from "../../src/services/fightService";

const telegramUserId = 317n;

describe("FightService quest-marker SQL budget", () => {
  let dir: string;
  let prisma: PrismaClient;
  let statements: string[];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-fight-marker-read-path-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    statements = [];
    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: [{ emit: "event", level: "query" }]
    });
    prisma.$on("query", (event: Prisma.QueryEvent) => statements.push(event.query.trim()));
    await createSchema(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  beforeEach(async () => {
    await prisma.activeCombatLease.deleteMany();
    await prisma.soloCombatSession.deleteMany();
    await prisma.dailyAction.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
    statements.length = 0;
  });

  it("keeps no-character, new-character, and veteran snapshots within five statements", async () => {
    const service = createService(prisma);

    expect(await service.getQuestMarkerSnapshotForTelegramUser(telegramUserId)).toMatchObject({
      fight: { status: "fulfilled", value: { state: "no-character" } },
      problemQuest: { status: "fulfilled", value: { state: "no-character" } }
    });
    expectReadBudget(statements, 1);

    await seedCharacter(prisma, { level: 1 });
    statements.length = 0;
    expect(await service.getQuestMarkerSnapshotForTelegramUser(telegramUserId)).toMatchObject({
      fight: { status: "fulfilled", value: { state: "ready" } },
      problemQuest: { status: "fulfilled", value: { state: "ready" } }
    });
    expectReadBudget(statements, 5);

    await prisma.character.update({ where: { id: "character-317" }, data: { level: 13 } });
    await prisma.dailyAction.create({
      data: {
        id: "problem-issued",
        characterId: "character-317",
        key: PROBLEM_QUEST_STAGES[0]!.issueKey,
        localDate: PROBLEM_QUEST_BUCKET,
        rewardXp: 0,
        rewardGold: 0
      }
    });
    statements.length = 0;
    expect(await service.getQuestMarkerSnapshotForTelegramUser(telegramUserId)).toMatchObject({
      fight: { status: "fulfilled", value: { state: "persistent-ready" } },
      problemQuest: { status: "fulfilled", value: { state: "ready" } }
    });
    expectReadBudget(statements, 5);
  });

  it("does not grow the query count for 10,000 irrelevant rows and caps valid wins at 93", async () => {
    await seedCharacter(prisma, { level: 13 });
    await prisma.dailyAction.create({
      data: {
        id: "problem-issued",
        characterId: "character-317",
        key: PROBLEM_QUEST_STAGES[0]!.issueKey,
        localDate: PROBLEM_QUEST_BUCKET,
        rewardXp: 0,
        rewardGold: 0,
        createdAt: new Date("2026-07-01T00:00:00.000Z")
      }
    });
    await seedCombatHistory(prisma);
    const repository = new PrismaSoloCombatSessionRepository(prisma);
    const service = createService(prisma, repository);

    statements.length = 0;
    const snapshot = await service.getQuestMarkerSnapshotForTelegramUser(telegramUserId);
    expectReadBudget(statements, 5);
    expect(snapshot.problemQuest).toMatchObject({
      status: "fulfilled",
      value: { state: "ready", progress: { wins: 93 } }
    });

    statements.length = 0;
    await expect(repository.countBoundedWonByTelegramUserId(telegramUserId, {
      life: { remortCount: 0 },
      limit: 587
    })).resolves.toBe(93);
    expectReadBudget(statements, 1);
  });
});

function createService(
  prisma: PrismaClient,
  sessions = new PrismaSoloCombatSessionRepository(prisma)
): FightService {
  return new FightService({
    characters: new PrismaCharacterRepository(prisma),
    dailyActions: new PrismaDailyActionRepository(prisma),
    combatSessions: sessions,
    clock: () => new Date("2026-07-21T12:00:00.000Z")
  });
}

function expectReadBudget(statements: readonly string[], maximum: number): void {
  const reads = statements.filter((statement) => /^(SELECT|WITH)/i.test(statement));
  const writes = statements.filter((statement) => /^(INSERT|UPDATE|DELETE)/i.test(statement));
  expect(writes).toHaveLength(0);
  expect(reads).toHaveLength(maximum);
  expect(statements.length).toBe(reads.length);
}

async function seedCharacter(prisma: PrismaClient, input: { level: number }): Promise<void> {
  await prisma.user.create({
    data: { id: "user-317", telegramUserId, updatedAt: new Date("2026-07-21T00:00:00.000Z") }
  });
  await prisma.character.create({
    data: {
      id: "character-317",
      userId: "user-317",
      name: "budget",
      raceId: "race.human",
      classId: "class.warrior",
      level: input.level,
      hpRegenAt: new Date("2026-07-22T00:00:00.000Z"),
      manaRegenAt: new Date("2026-07-22T00:00:00.000Z"),
      statsJson: { strength: 6, dexterity: 6, intelligence: 6, charisma: 6, luck: 6 },
      updatedAt: new Date("2026-07-21T00:00:00.000Z")
    }
  });
}

async function seedCombatHistory(prisma: PrismaClient): Promise<void> {
  const irrelevantState = JSON.stringify({ status: "lost", life: { remortCount: 0 } });
  const validState = JSON.stringify({
    status: "won",
    life: { remortCount: 0 },
    settlement: { status: "completed" }
  });
  await prisma.$executeRawUnsafe(`
    WITH RECURSIVE rows(value) AS (
      SELECT 1 UNION ALL SELECT value + 1 FROM rows WHERE value < 10000
    )
    INSERT INTO solo_combat_sessions (
      id, character_id, monster_id, state_json, status, turn, expires_at, created_at, updated_at
    )
    SELECT 'irrelevant-' || value, 'character-317', 'monster.irrelevant', ?, 'lost', 1,
      '2026-07-22T00:00:00.000Z', '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z'
    FROM rows
  `, irrelevantState);
  await prisma.soloCombatSession.createMany({
    data: Array.from({ length: 120 }, (_, index) => ({
      id: `valid-${index}`,
      characterId: "character-317",
      monsterId: "monster.valid",
      stateJson: validState,
      status: "won",
      expiresAt: new Date("2026-07-22T00:00:00.000Z"),
      createdAt: new Date("2026-07-03T00:00:00.000Z"),
      updatedAt: new Date("2026-07-03T00:00:00.000Z")
    }))
  });
}

async function createSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE users (
    id TEXT NOT NULL PRIMARY KEY, telegram_user_id BIGINT NOT NULL UNIQUE,
    username TEXT, display_name TEXT, language_code TEXT, last_action_at DATETIME,
    last_seen_location_id TEXT, current_raid_id TEXT, current_adventure_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE characters (
    id TEXT NOT NULL PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    pronoun TEXT NOT NULL DEFAULT 'they', path TEXT NOT NULL DEFAULT 'boundary',
    race_id TEXT NOT NULL, class_id TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0, gold INTEGER NOT NULL DEFAULT 0,
    hp_current INTEGER NOT NULL DEFAULT 25, hp_max INTEGER NOT NULL DEFAULT 25,
    mana_current INTEGER NOT NULL DEFAULT 10, mana_max INTEGER NOT NULL DEFAULT 10,
    hp_regen_at DATETIME, mana_regen_at DATETIME, active_cosmetic_title_grant_id TEXT,
    stats_json JSONB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE character_remorts (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
    remort_number INTEGER NOT NULL, previous_level INTEGER NOT NULL, previous_xp INTEGER NOT NULL,
    previous_gold INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL,
    preserved_payload_json JSONB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, remort_number)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE daily_actions (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL,
    local_date TEXT NOT NULL, reward_xp INTEGER NOT NULL, reward_gold INTEGER NOT NULL,
    spent_gold INTEGER NOT NULL DEFAULT 0, result_json JSONB,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, key, local_date)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE solo_combat_sessions (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL, monster_id TEXT NOT NULL,
    state_json JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'active', turn INTEGER NOT NULL DEFAULT 1,
    reward_xp INTEGER, reward_gold INTEGER, reward_items_json JSONB, reward_claimed_at DATETIME,
    expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE active_combat_leases (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
    reference_id TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL
  )`);
}
