import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { items } from "../../src/content";
import { PrismaItemUseRepository } from "../../src/db/repositories/prismaItemUseRepository";
import { createItemUseFingerprint } from "../../src/domain/itemUse";

const telegramUserId = 42n;
const characterId = "character-42";
const userId = "user-42";
const bandage = items.find((item) => item.id === "item.responsible-panic-bandage");

if (!bandage) {
  throw new Error("Bandage content is missing.");
}

describe("PrismaItemUseRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaItemUseRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-item-use-repo-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaItemUseRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.itemUseOrder.deleteMany();
    await prisma.itemTransfer.deleteMany();
    await prisma.korchmaMantokSale.deleteMany();
    await prisma.mantokChestRun.deleteMany();
    await prisma.levelBarterExchange.deleteMany();
    await prisma.activeCombatLease.deleteMany();
    await prisma.characterEquipment.deleteMany();
    await prisma.characterItem.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("consumes one bandage, heals once and replays duplicate confirmation", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(2);
    const preview = await createPreview("use-token-1");

    expect(preview).toMatchObject({
      state: "preview-created",
      order: {
        preview: {
          hpBefore: 10,
          hpMax: 41,
          healAmount: 7,
          hpAfter: 17
        }
      }
    });

    const first = await repository.confirmForTelegramUser(telegramUserId, {
      token: "use-token-1",
      itemContents: items,
      now: now()
    });
    const replay = await repository.confirmForTelegramUser(telegramUserId, {
      token: "use-token-1",
      itemContents: items,
      now: now()
    });

    expect(first).toMatchObject({ state: "used", order: { status: "completed" } });
    expect(replay).toMatchObject({ state: "replayed", order: { status: "completed" } });
    await expectBandageQuantity(1);
    await expectCharacterHp(17);
  });

  it("keeps concurrent confirmations to one consume", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);
    await createPreview("use-token-2");

    const results = await Promise.all([
      repository.confirmForTelegramUser(telegramUserId, {
        token: "use-token-2",
        itemContents: items,
        now: now()
      }),
      repository.confirmForTelegramUser(telegramUserId, {
        token: "use-token-2",
        itemContents: items,
        now: now()
      })
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["replayed", "used"]);
    await expectBandageQuantity(0);
    await expectCharacterHp(17);
  });

  it("blocks full HP without consuming a bandage", async () => {
    await seedCharacter({ hpCurrent: 41, hpMax: 25 });
    await seedBandages(1);

    const preview = await createPreview("use-token-full");

    expect(preview).toMatchObject({
      state: "full-hp",
      preview: {
        healAmount: 0,
        hpAfter: 41
      }
    });
    await expectBandageQuantity(1);
    expect(await prisma.itemUseOrder.count()).toBe(0);
  });

  it("blocks use during active combat", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);
    await prisma.activeCombatLease.create({
      data: {
        characterId,
        kind: "solo",
        referenceId: "fight-1"
      }
    });

    await expect(createPreview("use-token-combat")).resolves.toMatchObject({
      state: "combat-locked"
    });
    await expectBandageQuantity(1);
  });

  async function createPreview(token: string) {
    return repository.createPreviewForTelegramUser(telegramUserId, {
      item: bandage,
      itemContents: items,
      itemFingerprint: createItemUseFingerprint(bandage),
      token,
      now: now(),
      expiresAt: future()
    });
  }

  async function seedCharacter(input: { hpCurrent: number; hpMax: number }): Promise<void> {
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
        name: "Тестовий Мандрівник",
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.ranger",
        level: 4,
        xp: 70,
        gold: 0,
        hpCurrent: input.hpCurrent,
        hpMax: input.hpMax,
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

  async function seedBandages(quantity: number): Promise<void> {
    await prisma.characterItem.create({
      data: {
        characterId,
        itemId: bandage.id,
        quantity
      }
    });
  }

  async function expectBandageQuantity(quantity: number): Promise<void> {
    const stack = await prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId,
          itemId: bandage.id
        }
      }
    });

    expect(stack?.quantity ?? 0).toBe(quantity);
  }

  async function expectCharacterHp(hpCurrent: number): Promise<void> {
    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });

    expect(character.hpCurrent).toBe(hpCurrent);
  }
});

function now(): Date {
  return new Date("2026-06-25T09:00:00.000Z");
}

function future(): Date {
  return new Date("2026-06-25T09:23:00.000Z");
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
      "stats_json" JSONB NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE "character_items" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX "character_items_character_id_item_id_key" ON "character_items"("character_id", "item_id")`,
    `CREATE TABLE "character_equipment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "slot" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "active_combat_leases" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL UNIQUE,
      "kind" TEXT NOT NULL,
      "reference_id" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "character_remorts" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "remort_number" INTEGER NOT NULL,
      "previous_level" INTEGER NOT NULL,
      "previous_xp" INTEGER NOT NULL,
      "previous_gold" INTEGER NOT NULL,
      "display_name_snapshot" TEXT NOT NULL,
      "preserved_payload_json" JSONB NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "mantok_chest_runs" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "input_items_json" JSONB NOT NULL,
      "output_items_json" JSONB,
      "average_input_score" INTEGER NOT NULL,
      "minimum_output_score" INTEGER NOT NULL,
      "output_score" INTEGER,
      "completed_at" DATETIME,
      "expired_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "level_barter_exchanges" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'completed',
      "input_items_json" JSONB NOT NULL,
      "spent_gold" INTEGER NOT NULL,
      "level_before" INTEGER NOT NULL,
      "level_after" INTEGER NOT NULL,
      "xp_before" INTEGER NOT NULL,
      "xp_after" INTEGER NOT NULL,
      "xp_carry" INTEGER NOT NULL,
      "item_total_value" INTEGER NOT NULL,
      "selected_total_value" INTEGER NOT NULL,
      "overpay" INTEGER NOT NULL,
      "completed_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "korchma_mantok_sales" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "token" TEXT NOT NULL UNIQUE,
      "character_id" TEXT NOT NULL,
      "remort_count" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "selection_json" JSONB NOT NULL,
      "selection_fingerprint" TEXT NOT NULL,
      "nominal_value" INTEGER NOT NULL DEFAULT 0,
      "payout_gold" INTEGER NOT NULL DEFAULT 0,
      "result_json" JSONB,
      "expires_at" DATETIME NOT NULL,
      "completed_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "item_transfers" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "token" TEXT NOT NULL UNIQUE,
      "sender_character_id" TEXT NOT NULL,
      "receiver_character_id" TEXT NOT NULL,
      "sender_telegram_user_id" BIGINT NOT NULL,
      "receiver_telegram_user_id" BIGINT NOT NULL,
      "sender_name" TEXT NOT NULL,
      "receiver_name" TEXT NOT NULL,
      "sender_remort_count" INTEGER NOT NULL DEFAULT 0,
      "receiver_remort_count" INTEGER NOT NULL DEFAULT 0,
      "location_id" TEXT,
      "item_id" TEXT NOT NULL,
      "item_name" TEXT NOT NULL,
      "item_fingerprint" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "reservation_key" TEXT UNIQUE,
      "result_json" JSONB,
      "expires_at" DATETIME NOT NULL,
      "completed_at" DATETIME,
      "responded_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "item_use_orders" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "token" TEXT NOT NULL UNIQUE,
      "character_id" TEXT NOT NULL,
      "telegram_user_id" BIGINT NOT NULL,
      "remort_count" INTEGER NOT NULL DEFAULT 0,
      "item_id" TEXT NOT NULL,
      "item_name" TEXT NOT NULL,
      "item_fingerprint" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "effect_kind" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "reservation_key" TEXT UNIQUE,
      "preview_json" JSONB NOT NULL,
      "result_json" JSONB,
      "expires_at" DATETIME NOT NULL,
      "completed_at" DATETIME,
      "cancelled_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
