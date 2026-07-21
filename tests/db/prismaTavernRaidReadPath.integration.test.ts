import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaCooldownRepository } from "../../src/db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "../../src/db/repositories/prismaDailyActionRepository";
import type { KorchmaRoundPurchaseRepository } from "../../src/db/repositories/korchmaRoundPurchaseRepository";
import {
  buildFridayBarrelRaidPendingKey,
  FRIDAY_BARREL_RAID_KEY,
  getBarrelRaidPeriod,
  TavernRaidService
} from "../../src/services/tavernRaidService";

describe("TavernRaidService Friday read-path SQL budget", () => {
  let dir: string;
  let prisma: PrismaClient;
  let statements: string[];
  const now = new Date("2026-07-24T12:00:00.000Z");
  const telegramUserId = 317n;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-friday-read-path-"));
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
    await prisma.dailyAction.deleteMany();
    await prisma.characterCooldown.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
    statements.length = 0;
  });

  it("uses one statement for the no-character path", async () => {
    await expect(runLegacyFridayLookup(prisma, now, telegramUserId)).resolves.toBeNull();
    expectReadBudget(statements, 1);

    statements.length = 0;
    const result = await createService(prisma, now)
      .getActivePendingFridayBarrelRaidForTelegramUser(telegramUserId);

    expect(result).toEqual({ state: "no-character" });
    expectReadBudget(statements, 1);
  });

  it("keeps no-pending, current, older, and completed-history paths at three statements", async () => {
    await seedCharacter(prisma, telegramUserId);
    const current = getBarrelRaidPeriod(now);
    const older = getBarrelRaidPeriod(new Date(current.startsAt.getTime() - 1));

    const run = async () => {
      statements.length = 0;
      const result = await createService(prisma, now)
        .getActivePendingFridayBarrelRaidForTelegramUser(telegramUserId);
      expectReadBudget(statements, 3);
      return result;
    };

    statements.length = 0;
    await expect(runLegacyFridayLookup(prisma, now, telegramUserId)).resolves.toBeNull();
    expectReadBudget(statements, 50);
    expect(await run()).toEqual({ state: "none" });

    await seedCooldown(prisma, current.id, new Date(now.getTime() + 60_000));
    statements.length = 0;
    await expect(runLegacyFridayLookup(prisma, now, telegramUserId)).resolves.toBe(current.id);
    expectReadBudget(statements, 6);
    expect(await run()).toMatchObject({ state: "pending", periodId: current.id });

    await prisma.dailyAction.create({
      data: {
        id: "completion-current",
        characterId: "character-317",
        key: FRIDAY_BARREL_RAID_KEY,
        localDate: current.id,
        rewardXp: 0,
        rewardGold: 0
      }
    });
    await seedCooldown(prisma, older.id, new Date(now.getTime() + 120_000));
    statements.length = 0;
    await expect(runLegacyFridayLookup(prisma, now, telegramUserId)).resolves.toBe(older.id);
    expectReadBudget(statements, 10);
    expect(await run()).toMatchObject({ state: "pending", periodId: older.id });

    let cursor = current;
    const periods = Array.from({ length: 24 }, (_, index) => {
      if (index > 0) {
        cursor = getBarrelRaidPeriod(new Date(cursor.startsAt.getTime() - 1));
      }
      return cursor;
    });
    await prisma.characterCooldown.deleteMany();
    await prisma.dailyAction.deleteMany();
    await prisma.characterCooldown.createMany({
      data: periods.map((period, index) => ({
        id: `cooldown-${index}`,
        characterId: "character-317",
        key: buildFridayBarrelRaidPendingKey(period.id),
        availableAt: new Date(now.getTime() + (index + 1) * 60_000),
        updatedAt: now
      }))
    });
    await prisma.dailyAction.createMany({
      data: periods.map((period, index) => ({
        id: `completion-${index}`,
        characterId: "character-317",
        key: FRIDAY_BARREL_RAID_KEY,
        localDate: period.id,
        rewardXp: 0,
        rewardGold: 0
      }))
    });
    statements.length = 0;
    await expect(runLegacyFridayLookup(prisma, now, telegramUserId)).resolves.toBeNull();
    expectReadBudget(statements, 98);
    expect(await run()).toEqual({ state: "none" });
  });
});

async function runLegacyFridayLookup(
  prisma: PrismaClient,
  now: Date,
  telegramUserId: bigint
): Promise<string | null> {
  const characters = new PrismaCharacterRepository(prisma);
  const cooldowns = new PrismaCooldownRepository(prisma);
  const actions = new PrismaDailyActionRepository(prisma);
  const character = await characters.findByTelegramUserId(telegramUserId);
  if (!character) {
    return null;
  }

  let period = getBarrelRaidPeriod(now);
  for (let index = 0; index < 24; index += 1) {
    const cooldown = await cooldowns.findForTelegramUser(
      telegramUserId,
      buildFridayBarrelRaidPendingKey(period.id)
    );
    if (cooldown?.cooldown) {
      const completed = await actions.findForTelegramUser(telegramUserId, {
        key: FRIDAY_BARREL_RAID_KEY,
        localDate: period.id
      });
      if (!completed) {
        return period.id;
      }
    }
    period = getBarrelRaidPeriod(new Date(period.startsAt.getTime() - 1));
  }

  return null;
}

function createService(prisma: PrismaClient, now: Date): TavernRaidService {
  const rounds: KorchmaRoundPurchaseRepository = {
    spendGoldAndCreate: () => Promise.resolve(null),
    getLeaderboard: () => Promise.resolve({ day: [], week: [], month: [] })
  };
  return new TavernRaidService(
    new PrismaCharacterRepository(prisma),
    new PrismaDailyActionRepository(prisma),
    rounds,
    new PrismaCooldownRepository(prisma),
    () => now
  );
}

function expectReadBudget(statements: readonly string[], maximum: number): void {
  const reads = statements.filter((statement) => /^SELECT/i.test(statement));
  const writes = statements.filter((statement) => /^(INSERT|UPDATE|DELETE)/i.test(statement));
  expect(writes).toHaveLength(0);
  expect(reads).toHaveLength(maximum);
  expect(statements.length).toBe(reads.length);
}

async function seedCharacter(prisma: PrismaClient, userId: bigint): Promise<void> {
  await prisma.user.create({
    data: { id: "user-317", telegramUserId: userId, updatedAt: nowForSeed }
  });
  await prisma.character.create({
    data: {
      id: "character-317",
      userId: "user-317",
      name: "budget",
      raceId: "race.human",
      classId: "class.warrior",
      statsJson: { strength: 6, dexterity: 6, intelligence: 6, charisma: 6, luck: 6 },
      updatedAt: nowForSeed
    }
  });
}

async function seedCooldown(prisma: PrismaClient, periodId: string, availableAt: Date): Promise<void> {
  await prisma.characterCooldown.create({
    data: {
      id: `cooldown-${periodId}`,
      characterId: "character-317",
      key: buildFridayBarrelRaidPendingKey(periodId),
      availableAt,
      updatedAt: nowForSeed
    }
  });
}

const nowForSeed = new Date("2026-07-24T00:00:00.000Z");

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
    UNIQUE(character_id, remort_number),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE character_cooldowns (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL,
    available_at DATETIME NOT NULL, result_json JSONB, updated_at DATETIME NOT NULL,
    UNIQUE(character_id, key),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE daily_actions (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL,
    local_date TEXT NOT NULL, reward_xp INTEGER NOT NULL, reward_gold INTEGER NOT NULL,
    spent_gold INTEGER NOT NULL DEFAULT 0, result_json JSONB,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, key, local_date),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);
}
