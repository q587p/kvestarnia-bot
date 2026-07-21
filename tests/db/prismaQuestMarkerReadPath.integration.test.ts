import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "../../src/app/createRepositories";
import { createServices } from "../../src/app/createServices";
import { buildQuestMarkerSnapshotForTelegramUser } from "../../src/bot/questMarkerSnapshot";
import type { AppConfig } from "../../src/config/env";
import {
  buildEquipmentAttunementPayload,
  EQUIPMENT_ATTUNEMENT_ACTION_KEY
} from "../../src/domain/equipment/equipmentAttunement";
import { ITEM_UPGRADE_UNLOCK_KEY, ITEM_UPGRADE_UNLOCK_LOCAL_DATE } from "../../src/domain/itemUpgrades";
import { buildAdventurePeriod, getAdventureRerollStoragePrefix } from "../../src/services/adventureService";
import {
  CELLAR_GROWNUP_COMPLETION_KEY,
  CELLAR_GROWNUP_ONCE
} from "../../src/services/cellarGrownupQuestService";
import {
  ADVENTURE_CHOICE_REROLL_KEY,
  PROBLEM_QUEST_13_ISSUED_KEY,
  PROBLEM_QUEST_13_REWARD_KEY,
  PROBLEM_QUEST_23_ISSUED_KEY
} from "../../src/services/dailyActionKeys";
import { PROBLEM_QUEST_BUCKET } from "../../src/services/fight/problemQuest";
import {
  buildFridayBarrelRaidPendingKey,
  FRIDAY_BARREL_RAID_KEY,
  getBarrelRaidPeriod
} from "../../src/services/tavernRaidService";

describe("complete quest-marker snapshot SQL budget", () => {
  let dir: string;
  let prisma: PrismaClient;
  let statements: string[];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-marker-snapshot-"));
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
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
    statements.length = 0;
  });

  it("keeps a representative full-source main-menu snapshot within twelve reads", async () => {
    await prisma.user.create({
      data: { id: "marker-user", telegramUserId: 317n, updatedAt: new Date("2026-07-21T00:00:00.000Z") }
    });
    await prisma.character.create({
      data: {
        id: "marker-character",
        userId: "marker-user",
        name: "budget",
        raceId: "race.human",
        classId: "class.warrior",
        level: 13,
        hpRegenAt: new Date("2026-07-22T00:00:00.000Z"),
        manaRegenAt: new Date("2026-07-22T00:00:00.000Z"),
        statsJson: { strength: 6, dexterity: 6, intelligence: 6, charisma: 6, luck: 6 },
        updatedAt: new Date("2026-07-21T00:00:00.000Z")
      }
    });
    await prisma.$executeRawUnsafe(`
      WITH RECURSIVE rows(value) AS (
        SELECT 1 UNION ALL SELECT value + 1 FROM rows WHERE value < 10000
      )
      INSERT INTO daily_actions (
        id, character_id, key, local_date, reward_xp, reward_gold, spent_gold, created_at
      )
      SELECT 'irrelevant-' || value, 'marker-character', 'irrelevant.marker',
        'irrelevant-' || value, 0, 0, 0, '2026-07-01T00:00:00.000Z'
      FROM rows
    `);
    const services = createServices(createRepositories(prisma), testConfig());
    const legacyServices = { ...services };
    delete legacyServices.questMarkerReads;

    statements.length = 0;
    const legacySnapshot = await buildQuestMarkerSnapshotForTelegramUser(317n, legacyServices);
    expect(readStatements(statements)).toHaveLength(75);
    expect(writeStatements(statements)).toHaveLength(0);

    statements.length = 0;
    const snapshot = await buildQuestMarkerSnapshotForTelegramUser(317n, services);

    expect(normalizeVolatileTimes(snapshot)).toEqual(normalizeVolatileTimes(legacySnapshot));
    expect(snapshot).toMatchObject({ characterLevel: 13 });
    expect(Object.keys(snapshot ?? {})).toEqual(expect.arrayContaining([
      "adventure",
      "fight",
      "firstKorchmaQuest",
      "problemQuest",
      "yeger",
      "cellar",
      "barrelBeerTutorial",
      "dailyKorchmaRound",
      "itemUpgrades"
    ]));
    expectReadBudget(statements, 11, 12);
  });

  it("keeps older authoritative allowlisted markers visible past ninety-three newer rows", async () => {
    const now = new Date();
    const authoritativeAt = new Date(now.getTime() - 42 * 24 * 60 * 60_000);
    const equipmentUpdatedAt = new Date(now.getTime() - 23 * 60_000);
    const currentFriday = getBarrelRaidPeriod(now);
    const previousFriday = getBarrelRaidPeriod(new Date(currentFriday.startsAt.getTime() - 1));
    const rerollPrefix = getAdventureRerollStoragePrefix(buildAdventurePeriod(now));

    await prisma.user.create({
      data: { id: "crowded-user", telegramUserId: 9317n, updatedAt: now }
    });
    await prisma.character.create({
      data: {
        id: "crowded-character",
        userId: "crowded-user",
        name: "authoritative",
        raceId: "race.human",
        classId: "class.warrior",
        level: 13,
        xp: 1300,
        hpRegenAt: now,
        manaRegenAt: now,
        statsJson: { strength: 6, dexterity: 6, intelligence: 6, charisma: 6, luck: 6 },
        updatedAt: now
      }
    });
    await prisma.characterEquipment.create({
      data: {
        id: "crowded-weapon",
        characterId: "crowded-character",
        slot: "weapon",
        itemId: "item.pan-of-persuasion.plus-1",
        createdAt: authoritativeAt,
        updatedAt: equipmentUpdatedAt
      }
    });
    await prisma.characterCooldown.create({
      data: {
        id: "crowded-friday-pending",
        characterId: "crowded-character",
        key: buildFridayBarrelRaidPendingKey(previousFriday.id),
        availableAt: new Date(now.getTime() + 60 * 60_000),
        updatedAt: authoritativeAt
      }
    });
    await prisma.dailyAction.createMany({
      data: [
        markerAction("problem-13-issued", PROBLEM_QUEST_13_ISSUED_KEY, PROBLEM_QUEST_BUCKET, authoritativeAt),
        markerAction("problem-13-reward", PROBLEM_QUEST_13_REWARD_KEY, PROBLEM_QUEST_BUCKET, authoritativeAt),
        markerAction("problem-23-issued", PROBLEM_QUEST_23_ISSUED_KEY, PROBLEM_QUEST_BUCKET, authoritativeAt),
        markerAction("first-korchma-completed", "quest.first-korchma.completed", "life:0", authoritativeAt),
        markerAction("barrel-tutorial-completed", "quest.barrel-beer-tutorial.completed", "life:0", authoritativeAt),
        markerAction("item-upgrade-unlocked", ITEM_UPGRADE_UNLOCK_KEY, ITEM_UPGRADE_UNLOCK_LOCAL_DATE, authoritativeAt),
        markerAction("cellar-grownup-completed", CELLAR_GROWNUP_COMPLETION_KEY, CELLAR_GROWNUP_ONCE, authoritativeAt),
        markerAction("friday-current-completed", FRIDAY_BARREL_RAID_KEY, currentFriday.id, authoritativeAt),
        {
          ...markerAction(
            "current-equipment-attunement",
            EQUIPMENT_ATTUNEMENT_ACTION_KEY,
            `weapon:crowded-weapon:${equipmentUpdatedAt.getTime()}`,
            authoritativeAt
          ),
          resultJson: buildEquipmentAttunementPayload({
            slot: "weapon",
            itemId: "item.pan-of-persuasion.plus-1",
            itemName: "Пательня переконання +1",
            equipmentUpdatedAt,
            strength: "weak",
            startedAt: equipmentUpdatedAt,
            readyAt: new Date(now.getTime() + 42 * 60_000)
          })
        },
        ...Array.from({ length: 100 }, (_, index) => markerAction(
          `newer-allowlisted-${index}`,
          ADVENTURE_CHOICE_REROLL_KEY,
          `${rerollPrefix}${index.toString(36)}`,
          new Date(now.getTime() + index)
        ))
      ]
    });

    const services = createServices(createRepositories(prisma), testConfig());
    const legacyServices = { ...services };
    delete legacyServices.questMarkerReads;

    statements.length = 0;
    const legacySnapshot = await buildQuestMarkerSnapshotForTelegramUser(9317n, legacyServices);
    expect(readStatements(statements)).toHaveLength(75);
    expect(writeStatements(statements)).toHaveLength(0);

    statements.length = 0;
    const snapshot = await buildQuestMarkerSnapshotForTelegramUser(9317n, services);

    expect(normalizeVolatileTimes(snapshot)).toEqual(normalizeVolatileTimes(legacySnapshot));
    expect(snapshot).toMatchObject({
      problemQuest: { stageId: "23", issued: true, rewardClaimed: false },
      firstKorchmaQuest: { state: "completed" },
      barrelBeerTutorial: { state: "completed" },
      itemUpgrades: { state: "ready" },
      cellarGrownup: { state: "completed" },
      dailyKorchmaRound: { state: "pending-barrel" },
      adventure: {
        character: {
          equipmentEffects: { weaponDamage: 0, contributions: [] }
        }
      }
    });
    expectReadBudget(statements, 11, 12);
  });
});

function markerAction(id: string, key: string, localDate: string, createdAt: Date) {
  return {
    id,
    characterId: "crowded-character",
    key,
    localDate,
    rewardXp: 0,
    rewardGold: 0,
    spentGold: 0,
    createdAt
  };
}

function testConfig(): AppConfig {
  return {
    nodeEnv: "test",
    databaseUrl: "file:marker-budget.db",
    deployNotificationsEnabled: false,
    devGrantCommandsEnabled: false,
    combatBalanceAnalyticsEnabled: false,
    partySessionFoundationEnabled: false,
    partySessionDevHelpersEnabled: false,
    bigBarrelBrotherRaidEnabled: false
  };
}

function expectReadBudget(statements: readonly string[], expected: number, maximum: number): void {
  const reads = readStatements(statements);
  const writes = writeStatements(statements);
  expect(writes).toHaveLength(0);
  expect(reads).toHaveLength(expected);
  expect(reads.length).toBeLessThanOrEqual(maximum);
  expect(statements.length).toBe(reads.length);
}

function readStatements(statements: readonly string[]): string[] {
  return statements.filter((statement) => /^(SELECT|WITH)/i.test(statement));
}

function writeStatements(statements: readonly string[]): string[] {
  return statements.filter((statement) => /^(INSERT|UPDATE|DELETE)/i.test(statement));
}

function normalizeVolatileTimes(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeVolatileTimes);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    key === "hpFullAt" || key === "manaFullAt" ? "volatile-time" : normalizeVolatileTimes(nested)
  ]));
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
  await prisma.$executeRawUnsafe(`CREATE TABLE character_cooldowns (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL,
    available_at DATETIME NOT NULL, result_json JSONB, updated_at DATETIME NOT NULL,
    UNIQUE(character_id, key)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE character_equipment (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL, slot TEXT NOT NULL,
    item_id TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL, UNIQUE(character_id, slot)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE character_items (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL, item_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL, UNIQUE(character_id, item_id)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE character_drink_states (
    id TEXT NOT NULL PRIMARY KEY, activation_id TEXT NOT NULL UNIQUE, character_id TEXT NOT NULL UNIQUE,
    remort_count INTEGER NOT NULL DEFAULT 0, drink_key TEXT NOT NULL, phase TEXT NOT NULL,
    started_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, source_type TEXT NOT NULL,
    source_id TEXT, metadata_json JSONB, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE active_combat_leases (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
    reference_id TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE solo_combat_sessions (
    id TEXT NOT NULL PRIMARY KEY, character_id TEXT NOT NULL, monster_id TEXT NOT NULL,
    state_json JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'active', turn INTEGER NOT NULL DEFAULT 1,
    reward_xp INTEGER, reward_gold INTEGER, reward_items_json JSONB, reward_claimed_at DATETIME,
    expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL
  )`);
}
