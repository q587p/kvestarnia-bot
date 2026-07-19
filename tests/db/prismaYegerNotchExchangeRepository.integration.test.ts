import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaYegerNotchExchangeRepository } from "../../src/db/repositories/prismaYegerNotchExchangeRepository";
import { DENSE_BANDAGE_ITEM_ID, FIELD_KIT_ITEM_ID } from "../../src/domain/itemCraft";
import { YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY } from "../../src/services/dailyActionKeys";
import { YEGER_FIRST_NOTCH_ITEM_ID } from "../../src/services/itemGrant";
import { YEGER_UNQUIET_TRIAL_BUCKET } from "../../src/services/yegerQuestService";

const telegramUserId = 9022n;
const userId = "user-yeger-notch-9022";
const characterId = "character-yeger-notch-9022";

describe("PrismaYegerNotchExchangeRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaYegerNotchExchangeRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-yeger-notch-exchange-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaYegerNotchExchangeRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.characterItem.deleteMany();
    await prisma.dailyAction.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
    await seedCharacter();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("keeps exchanges locked before the second Yeger board is completed", async () => {
    await seedNotches(2);

    await expect(repository.getForTelegramUser(telegramUserId)).resolves.toMatchObject({ state: "locked" });
    await expect(repository.exchangeForTelegramUser(telegramUserId, {
      kind: "dense-bandage",
      expectedNotches: 2,
      now: now()
    })).resolves.toMatchObject({ state: "locked" });
    await expectItemQuantity(YEGER_FIRST_NOTCH_ITEM_ID, 2);
    await expectItemQuantity(DENSE_BANDAGE_ITEM_ID, 0);
  });

  it("exchanges notches for medical supplies and rejects a stale duplicate callback", async () => {
    await seedSecondBoardCompletion();
    await seedNotches(2);

    await expect(repository.getForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "ready",
      summary: {
        availableNotches: 2,
        options: [
          { kind: "dense-bandage", requiredNotches: 1, outputItemId: DENSE_BANDAGE_ITEM_ID },
          { kind: "field-kit", requiredNotches: 2, outputItemId: FIELD_KIT_ITEM_ID }
        ]
      }
    });
    await expect(repository.exchangeForTelegramUser(telegramUserId, {
      kind: "field-kit",
      expectedNotches: 2,
      now: now()
    })).resolves.toMatchObject({
      state: "exchanged",
      spentNotches: 2,
      itemGrants: [{ itemId: FIELD_KIT_ITEM_ID, quantity: 1 }],
      summary: { availableNotches: 0, options: [] }
    });
    await expect(repository.exchangeForTelegramUser(telegramUserId, {
      kind: "field-kit",
      expectedNotches: 2,
      now: now()
    })).resolves.toMatchObject({
      state: "stale",
      expectedNotches: 2,
      currentNotches: 0
    });
    await expectItemQuantity(YEGER_FIRST_NOTCH_ITEM_ID, 0);
    await expectItemQuantity(FIELD_KIT_ITEM_ID, 1);
    await expect(prisma.dailyAction.count({
      where: {
        characterId,
        key: "yeger.notch.exchange"
      }
    })).resolves.toBe(1);
  });

  async function seedCharacter(): Promise<void> {
    await prisma.user.create({
      data: {
        id: userId,
        telegramUserId,
        lastSeenLocationId: "location.korchma.ranger_corner"
      }
    });
    await prisma.character.create({
      data: {
        id: characterId,
        userId,
        name: "Тестовий Єгерник",
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 8,
        xp: 320,
        gold: 0,
        hpCurrent: 20,
        hpMax: 25,
        manaCurrent: 10,
        manaMax: 10,
        hpRegenAt: now(),
        manaRegenAt: now(),
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

  async function seedSecondBoardCompletion(): Promise<void> {
    await prisma.dailyAction.create({
      data: {
        characterId,
        key: YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
        localDate: YEGER_UNQUIET_TRIAL_BUCKET,
        rewardXp: 0,
        rewardGold: 0
      }
    });
  }

  async function seedNotches(quantity: number): Promise<void> {
    await prisma.characterItem.create({
      data: {
        characterId,
        itemId: YEGER_FIRST_NOTCH_ITEM_ID,
        quantity
      }
    });
  }

  async function expectItemQuantity(itemId: string, quantity: number): Promise<void> {
    const stack = await prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId,
          itemId
        }
      }
    });

    expect(stack?.quantity ?? 0).toBe(quantity);
  }
});

function now(): Date {
  return new Date("2026-07-03T09:00:00.000Z");
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  const statements = [
    `CREATE TABLE "users" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "telegram_user_id" BIGINT NOT NULL UNIQUE,
      "username" TEXT,
      "display_name" TEXT,
      "language_code" TEXT,
      "last_action_at" DATETIME,
      "last_seen_location_id" TEXT,
      "current_raid_id" TEXT,
      "current_adventure_id" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "characters" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "user_id" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "pronoun" TEXT NOT NULL DEFAULT 'they',
      "path" TEXT NOT NULL DEFAULT 'boundary',
      "race_id" TEXT NOT NULL,
      "class_id" TEXT NOT NULL,
      "level" INTEGER NOT NULL DEFAULT 1,
      "xp" INTEGER NOT NULL DEFAULT 0,
      "gold" INTEGER NOT NULL DEFAULT 0,
      "hp_current" INTEGER NOT NULL DEFAULT 25,
      "hp_max" INTEGER NOT NULL DEFAULT 25,
      "mana_current" INTEGER NOT NULL DEFAULT 10,
      "mana_max" INTEGER NOT NULL DEFAULT 10,
      "hp_regen_at" DATETIME,
      "mana_regen_at" DATETIME,
      "active_cosmetic_title_grant_id" TEXT,
      "stats_json" JSONB NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE "character_items" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_items_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "character_items_character_id_item_id_key" ON "character_items"("character_id", "item_id")`,
    `CREATE TABLE "daily_actions" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "local_date" TEXT NOT NULL,
      "reward_xp" INTEGER NOT NULL,
      "reward_gold" INTEGER NOT NULL,
      "spent_gold" INTEGER NOT NULL DEFAULT 0,
      "result_json" JSONB,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "daily_actions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "daily_actions_character_id_key_local_date_key" ON "daily_actions"("character_id", "key", "local_date")`,
    `CREATE TABLE "character_remorts" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "remort_number" INTEGER NOT NULL,
      "previous_level" INTEGER NOT NULL,
      "previous_xp" INTEGER NOT NULL,
      "previous_gold" INTEGER NOT NULL,
      "display_name_snapshot" TEXT NOT NULL,
      "preserved_payload_json" JSONB NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_remorts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
