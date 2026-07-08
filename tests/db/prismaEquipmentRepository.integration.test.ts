import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaEquipmentRepository } from "../../src/db/repositories/prismaEquipmentRepository";

const telegramUserId = 42n;
const characterId = "character-equipment-test";

describe("PrismaEquipmentRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaEquipmentRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-equipment-repo-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaEquipmentRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.characterEquipment.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
    await seedCharacter();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("reads legacy armor rows through the canonical chest slot", async () => {
    await prisma.characterEquipment.create({
      data: {
        characterId,
        slot: "armor",
        itemId: "item.apron-of-foam-resistance"
      }
    });

    const snapshot = await repository.listByTelegramUserId(telegramUserId);

    expect(snapshot).toMatchObject({
      characterId,
      equipment: [
        {
          slot: "chest",
          itemId: "item.apron-of-foam-resistance"
        }
      ]
    });
  });

  it("writes canonical chest rows and removes legacy armor rows", async () => {
    await prisma.characterEquipment.create({
      data: {
        characterId,
        slot: "armor",
        itemId: "item.legacy-apron"
      }
    });

    const equipped = await repository.equipForCharacter(
      characterId,
      "chest",
      "item.apron-of-foam-resistance"
    );
    const rows = await prisma.characterEquipment.findMany({
      where: { characterId },
      orderBy: { slot: "asc" }
    });

    expect(equipped).toMatchObject({
      slot: "chest",
      itemId: "item.apron-of-foam-resistance"
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slot: "chest",
      itemId: "item.apron-of-foam-resistance"
    });
  });

  it("reports only one changed equip for concurrent duplicate same-item writes", async () => {
    const results = await Promise.all([
      repository.equipForCharacterAtomically({
        characterId,
        slot: "weapon",
        itemId: "item.pan-of-persuasion"
      }),
      repository.equipForCharacterAtomically({
        characterId,
        slot: "weapon",
        itemId: "item.pan-of-persuasion"
      })
    ]);
    const rows = await prisma.characterEquipment.findMany({
      where: { characterId },
      orderBy: { slot: "asc" }
    });

    expect(results.map((result) => result.changed).sort()).toEqual([false, true]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slot: "weapon",
      itemId: "item.pan-of-persuasion"
    });
  });

  it("clears a conflicting hand in the same atomic equip write", async () => {
    await prisma.characterEquipment.createMany({
      data: [
        {
          characterId,
          slot: "weapon",
          itemId: "item.pan-of-persuasion"
        },
        {
          characterId,
          slot: "offhand",
          itemId: "item.stamp-of-minor-authority"
        }
      ]
    });

    const result = await repository.equipForCharacterAtomically({
      characterId,
      slot: "weapon",
      itemId: "item.test-twohand-ladle",
      clearSlot: "offhand"
    });
    const rows = await prisma.characterEquipment.findMany({
      where: { characterId },
      orderBy: { slot: "asc" }
    });

    expect(result).toMatchObject({
      changed: true,
      record: {
        slot: "weapon",
        itemId: "item.test-twohand-ladle"
      }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slot: "weapon",
      itemId: "item.test-twohand-ladle"
    });
  });

  it("stores tuning attunement rows, can finish them for dev QA, and emits due notifications", async () => {
    const result = await repository.equipForCharacterAtomically({
      characterId,
      slot: "weapon",
      itemId: "item.pan-of-persuasion.plus-1",
      attunement: {
        strength: "weak",
        itemName: "Пательня переконання +1",
        startedAt: new Date("2099-01-01T00:00:00.000Z"),
        readyAt: new Date("2099-01-01T00:13:00.000Z")
      }
    });
    const tuningSnapshot = await repository.listByTelegramUserId(telegramUserId);

    expect(result.record.attunement).toMatchObject({
      state: "tuning",
      strength: "weak"
    });
    expect(tuningSnapshot?.equipment[0]).toMatchObject({
      itemId: "item.pan-of-persuasion.plus-1",
      attunement: {
        state: "tuning",
        strength: "weak"
      }
    });
    await expect(
      repository.listDueAttunementNotifications(new Date("2099-01-01T00:12:00.000Z"))
    ).resolves.toEqual([]);

    await expect(
      repository.finishPendingAttunementsForTelegramUser(
        telegramUserId,
        new Date("2000-01-01T00:00:00.000Z")
      )
    ).resolves.toEqual({
      state: "finished",
      count: 1
    });

    const due = await repository.listDueAttunementNotifications(new Date("2000-01-01T00:00:00.000Z"));
    expect(due).toMatchObject([
      {
        characterId,
        telegramUserId,
        itemId: "item.pan-of-persuasion.plus-1",
        itemName: "Пательня переконання +1",
        strength: "weak"
      }
    ]);
    expect(due[0]?.actionId).toEqual(expect.any(String));
    await expect(
      repository.markAttunementNotified(
        due[0]?.actionId ?? "",
        new Date("2000-01-01T00:01:00.000Z")
      )
    ).resolves.toBe(true);
    await expect(
      repository.listDueAttunementNotifications(new Date("2000-01-01T00:02:00.000Z"))
    ).resolves.toEqual([]);
  });

  it("clears both canonical chest and legacy armor rows on chest unequip", async () => {
    await prisma.characterEquipment.createMany({
      data: [
        {
          characterId,
          slot: "armor",
          itemId: "item.legacy-apron"
        },
        {
          characterId,
          slot: "chest",
          itemId: "item.apron-of-foam-resistance"
        }
      ]
    });

    await expect(repository.unequipForCharacter(characterId, "chest")).resolves.toBe(true);
    await expect(prisma.characterEquipment.count({ where: { characterId } })).resolves.toBe(0);
  });

  async function seedCharacter(): Promise<void> {
    await prisma.user.create({
      data: {
        id: "user-equipment-test",
        telegramUserId,
        displayName: "Equipment Test"
      }
    });
    await prisma.character.create({
      data: {
        id: characterId,
        userId: "user-equipment-test",
        name: "Equipment Test",
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 1,
        xp: 0,
        gold: 0,
        hpCurrent: 25,
        hpMax: 25,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: { strength: 1, dexterity: 1, intelligence: 1, charisma: 1, luck: 1 }
      }
    });
  }
});

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
    `CREATE TABLE "character_equipment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "slot" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_equipment_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "character_equipment_character_id_slot_key" ON "character_equipment"("character_id", "slot")`
    ,
    `CREATE TABLE "daily_actions" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
    `CREATE INDEX "daily_actions_key_idx" ON "daily_actions"("key")`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
