import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HpRecoveryNotificationProducer } from "../../src/db/repositories/hpRecoveryNotificationProducer";
import { PrismaItemUpgradeRepository } from "../../src/db/repositories/prismaItemUpgradeRepository";
import { FIELD_KIT_ITEM_ID } from "../../src/domain/itemCraft";
import {
  ITEM_DISMANTLE_RULES_VERSION,
  ITEM_UPGRADE_LOCATION_ID,
  ITEM_UPGRADE_UNLOCK_KEY,
  ITEM_UPGRADE_UNLOCK_LOCAL_DATE
} from "../../src/domain/itemUpgrades";
import { ISKROKAMIN_ITEM_ID } from "../../src/services/itemGrant";
import { ItemUpgradeService } from "../../src/services/itemUpgradeService";

const telegramUserId = 3030n;
const userId = "user-upgrade-3030";
const characterId = "character-upgrade-3030";
const panItemId = "item.pan-of-persuasion";
const panPlusOneItemId = "item.pan-of-persuasion.plus-1";
const panPlusTwoItemId = "item.pan-of-persuasion.plus-2";
const panPlusFourItemId = "item.pan-of-persuasion.plus-4";

describe("PrismaItemUpgradeRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaItemUpgradeRepository;
  let producerRecord: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-item-upgrade-repo-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    const producer = new HpRecoveryNotificationProducer(true);
    producerRecord = vi.spyOn(producer, "record").mockResolvedValue(undefined);
    repository = new PrismaItemUpgradeRepository(prisma, producer);
  }, 60_000);

  beforeEach(async () => {
    producerRecord.mockClear();
    await prisma.dailyAction.deleteMany();
    await prisma.characterEquipment.deleteMany();
    await prisma.characterItem.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
    await seedCharacter();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("upgrades one owned stack unit, aligns equipped rows and rejects stale replays before spend", async () => {
    await seedUnlock();
    await seedItem(panItemId, 2);
    await seedItem(ISKROKAMIN_ITEM_ID, 5);
    await prisma.characterEquipment.create({
      data: {
        characterId,
        slot: "weapon",
        itemId: panItemId
      }
    });

    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0,
      attemptGuard: "00000001",
      expectedFromLevel: 0,
      expectedQuantity: 2,
      expectedPityFailures: 0
    })).resolves.toMatchObject({
      state: "attempted",
      success: true,
      fromLevel: 0,
      targetLevel: 1,
      item: {
        itemId: panPlusOneItemId,
        quantity: 1,
        equipped: true
      },
      spent: {
        gold: 50,
        iskrokamin: 5,
        mana: 0
      }
    });

    await expectItemQuantity(panItemId, 1);
    await expectItemQuantity(panPlusOneItemId, 1);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
    await expectCharacterResources({ gold: 950, manaCurrent: 80 });
    await expectEquippedItem(panPlusOneItemId);
    expect(producerRecord).toHaveBeenCalledWith(expect.anything(), characterId, now(), "recovering");

    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0,
      attemptGuard: "00000001",
      expectedFromLevel: 0,
      expectedQuantity: 2,
      expectedPityFailures: 0
    })).resolves.toMatchObject({
      state: "stale-snapshot",
      item: {
        itemId: panItemId,
        quantity: 1
      }
    });

    await expectItemQuantity(panItemId, 1);
    await expectItemQuantity(panPlusOneItemId, 1);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
    await expectCharacterResources({ gold: 950, manaCurrent: 80 });
    await expectEquippedItem(panPlusOneItemId);
  });

  it("commits only one concurrent duplicate attempt from the same stack preview", async () => {
    await seedUnlock();
    await seedItem(panItemId, 2);
    await seedItem(ISKROKAMIN_ITEM_ID, 5);

    const input = {
      itemId: panItemId,
      method: "npc" as const,
      now: now(),
      roll: 0,
      attemptGuard: "00000002",
      expectedFromLevel: 0,
      expectedQuantity: 2,
      expectedPityFailures: 0
    };
    const results = await Promise.all([
      repository.attemptForTelegramUser(telegramUserId, input),
      repository.attemptForTelegramUser(telegramUserId, input)
    ]);

    expect(results.filter((result) => result.state === "attempted")).toHaveLength(1);
    expect(results.filter((result) => result.state === "stale-snapshot")).toHaveLength(1);
    await expectItemQuantity(panItemId, 1);
    await expectItemQuantity(panPlusOneItemId, 1);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
    await expectCharacterResources({ gold: 950, manaCurrent: 80 });
  });

  it("accepts a higher-plus same-template donor and consumes it once", async () => {
    await seedUnlock();
    await seedItem(panPlusOneItemId, 1);
    await seedItem(panPlusFourItemId, 1);
    await seedItem(ISKROKAMIN_ITEM_ID, 20);

    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panPlusOneItemId,
      method: "npc",
      donorItemId: panPlusFourItemId,
      now: now(),
      roll: 0,
      attemptGuard: "00000003",
      expectedFromLevel: 1,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({
      state: "attempted",
      success: true,
      donorConsumed: true,
      fromLevel: 1,
      targetLevel: 2,
      item: {
        itemId: panPlusTwoItemId,
        quantity: 1
      },
      finalChance: 98,
      spent: {
        gold: 120,
        iskrokamin: 7,
        mana: 0
      }
    });

    await expectItemQuantity(panPlusOneItemId, 0);
    await expectItemQuantity(panPlusTwoItemId, 1);
    await expectItemQuantity(panPlusFourItemId, 0);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 13);
    await expectCharacterResources({ gold: 880, manaCurrent: 80 });
  });

  it("spends a failed attempt exactly once and records bounded pity", async () => {
    await seedUnlock();
    await seedItem(panItemId, 1);
    await seedItem(ISKROKAMIN_ITEM_ID, 5);

    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0.999,
      attemptGuard: "00000004",
      expectedFromLevel: 0,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({
      state: "attempted",
      success: false,
      pityFailuresBefore: 0,
      pityFailuresAfter: 1
    });

    await expectItemQuantity(panItemId, 1);
    await expectItemQuantity(panPlusOneItemId, 0);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
    await expectCharacterResources({ gold: 950, manaCurrent: 80 });

    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0.999,
      attemptGuard: "00000004",
      expectedFromLevel: 0,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({
      state: "stale-snapshot",
      item: {
        itemId: panItemId,
        quantity: 1
      }
    });

    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
    await expectCharacterResources({ gold: 950, manaCurrent: 80 });

    await repository.setPityForTelegramUser(telegramUserId, panItemId, 1, 0, now());
    await seedItem(ISKROKAMIN_ITEM_ID, 5);
    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0,
      attemptGuard: "00000005",
      expectedFromLevel: 0,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({
      state: "attempted",
      success: true,
      fromLevel: 0,
      targetLevel: 1
    });

    await expectItemQuantity(panItemId, 0);
    await expectItemQuantity(panPlusOneItemId, 1);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
    await expectCharacterResources({ gold: 900, manaCurrent: 80 });
  });

  it("does not let a spent q1 claim block a future q1 stack from a new preview", async () => {
    await seedUnlock();
    await seedItem(panItemId, 1);
    await seedItem(ISKROKAMIN_ITEM_ID, 10);

    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0,
      attemptGuard: "00000006",
      expectedFromLevel: 0,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({
      state: "attempted",
      success: true,
      fromLevel: 0,
      targetLevel: 1
    });

    await expectItemQuantity(panItemId, 0);
    await seedItem(panItemId, 1);

    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0,
      attemptGuard: "00000007",
      expectedFromLevel: 0,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({
      state: "attempted",
      success: true,
      fromLevel: 0,
      targetLevel: 1
    });

    await expectItemQuantity(panItemId, 0);
    await expectItemQuantity(panPlusOneItemId, 2);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
    await expectCharacterResources({ gold: 900, manaCurrent: 80 });
  });

  it("requires the Korchma yard, level gate and field-kit unlock before spending", async () => {
    await seedItem(panItemId, 1);
    await seedItem(ISKROKAMIN_ITEM_ID, 5);
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenLocationId: "location.korchma.hall" }
    });

    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0,
      attemptGuard: "00000008",
      expectedFromLevel: 0,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({ state: "wrong-place" });
    await expectCharacterResources({ gold: 1_000, manaCurrent: 80 });
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 5);

    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenLocationId: ITEM_UPGRADE_LOCATION_ID }
    });
    await prisma.character.update({
      where: { id: characterId },
      data: { level: 4, xp: 0 }
    });

    await expect(repository.unlockForTelegramUser(telegramUserId, now()))
      .resolves.toMatchObject({ state: "level-locked", requiredLevel: 5 });

    await prisma.character.update({
      where: { id: characterId },
      data: { level: 5, xp: 0 }
    });
    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0,
      attemptGuard: "00000009",
      expectedFromLevel: 0,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({ state: "unlock-required", fieldKitQuantity: 0 });

    await seedItem(FIELD_KIT_ITEM_ID, 1);
    await expect(repository.unlockForTelegramUser(telegramUserId, now()))
      .resolves.toMatchObject({
        state: "unlocked",
        rewardXp: 38,
        levelChange: {
          leveledUp: false
        }
      });
    await expectItemQuantity(FIELD_KIT_ITEM_ID, 0);
    expect(producerRecord).toHaveBeenCalledWith(expect.anything(), characterId, now(), "recovering");

    await expect(repository.attemptForTelegramUser(telegramUserId, {
      itemId: panItemId,
      method: "npc",
      now: now(),
      roll: 0,
      attemptGuard: "0000000a",
      expectedFromLevel: 0,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({ state: "attempted", success: true });
  });

  it("atomically dismantles one unit and replays concurrent duplicate confirmations", async () => {
    await seedUnlock();
    await seedItem(panPlusTwoItemId, 2);
    const service = new ItemUpgradeService(repository, now);
    const preview = await service.previewDismantleForTelegramUser(telegramUserId, panPlusTwoItemId);
    if (preview.state !== "ready") throw new Error(`Expected dismantle preview, got ${preview.state}`);
    const input = {
      itemId: preview.item.itemId,
      expectedQuantity: preview.item.quantity,
      expectedRemortCount: preview.expectedRemortCount,
      expectedYield: preview.item.yield,
      payment: preview.payment,
      rulesFingerprint: preview.rulesFingerprint,
      guard: preview.guard,
      now: now()
    };
    const results = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      repository.dismantleForTelegramUser(telegramUserId, input)
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["dismantled", "replayed"]);
    await expectItemQuantity(panPlusTwoItemId, 1);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, preview.item.yield);
    await expectCharacterResources({ gold: 995, manaCurrent: 80 });
    await expect(repository.dismantleForTelegramUser(telegramUserId, input))
      .resolves.toMatchObject({ state: "replayed", yield: preview.item.yield });
  });

  it("fails closed on a forged durable dismantling receipt without spending or consuming", async () => {
    await seedUnlock();
    await seedItem(panPlusTwoItemId, 2);
    const service = new ItemUpgradeService(repository, now);
    const preview = await service.previewDismantleForTelegramUser(telegramUserId, panPlusTwoItemId);
    if (preview.state !== "ready") throw new Error(`Expected dismantle preview, got ${preview.state}`);
    await prisma.dailyAction.create({
      data: {
        characterId,
        key: `item-dismantle.receipt:${preview.guard}`,
        localDate: "persistent",
        rewardXp: 0,
        rewardGold: 0,
        spentGold: 0,
        resultJson: {
          version: 1,
          rulesVersion: ITEM_DISMANTLE_RULES_VERSION,
          remortCount: preview.expectedRemortCount,
          itemId: preview.item.itemId,
          baseItemId: panItemId,
          enhancementLevel: preview.item.enhancementLevel,
          baseRarity: preview.item.rarity,
          isSetPiece: preview.item.isSetPiece,
          quantityBefore: preview.item.quantity,
          yield: preview.item.yield,
          iskrokaminAfter: preview.item.yield,
          payment: preview.payment,
          paymentAmount: preview.paymentAmount,
          rulesFingerprint: preview.rulesFingerprint,
          guard: preview.guard
        }
      }
    });

    await expect(repository.dismantleForTelegramUser(telegramUserId, {
      itemId: preview.item.itemId,
      expectedQuantity: preview.item.quantity,
      expectedRemortCount: preview.expectedRemortCount,
      expectedYield: preview.item.yield,
      payment: preview.payment,
      rulesFingerprint: preview.rulesFingerprint,
      guard: preview.guard,
      now: now()
    })).resolves.toEqual({ state: "stale" });
    await expectItemQuantity(panPlusTwoItemId, 2);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
    await expectCharacterResources({ gold: 1_000, manaCurrent: 80 });
  });

  it("rechecks reservations and equipment atomically after dismantling preview", async () => {
    await seedUnlock();
    await seedItem(panPlusTwoItemId, 2);
    const service = new ItemUpgradeService(repository, now);
    const preview = await service.previewDismantleForTelegramUser(telegramUserId, panPlusTwoItemId);
    if (preview.state !== "ready") throw new Error(`Expected dismantle preview, got ${preview.state}`);
    const input = {
      itemId: preview.item.itemId,
      expectedQuantity: preview.item.quantity,
      expectedRemortCount: preview.expectedRemortCount,
      expectedYield: preview.item.yield,
      payment: preview.payment,
      rulesFingerprint: preview.rulesFingerprint,
      guard: preview.guard,
      now: now()
    };

    await prisma.$executeRawUnsafe(
      `INSERT INTO "item_use_orders" ("id", "character_id", "item_id", "status", "expires_at") VALUES (?, ?, ?, 'pending', ?)`,
      "reserved-after-preview",
      characterId,
      panPlusTwoItemId,
      new Date(now().getTime() + 60_000).toISOString()
    );
    await expect(repository.dismantleForTelegramUser(telegramUserId, input))
      .resolves.toEqual({ state: "reserved" });
    await prisma.$executeRawUnsafe(`DELETE FROM "item_use_orders" WHERE "id" = ?`, "reserved-after-preview");

    await prisma.characterEquipment.create({
      data: { characterId, slot: "weapon", itemId: panPlusTwoItemId }
    });
    await expect(repository.dismantleForTelegramUser(telegramUserId, input))
      .resolves.toEqual({ state: "equipped" });
    await expectItemQuantity(panPlusTwoItemId, 2);
    await expectCharacterResources({ gold: 1_000, manaCurrent: 80 });
  });

  it("rejects a pre-remort dismantling confirmation without spending or yielding", async () => {
    await seedUnlock();
    await seedItem(panPlusTwoItemId, 1);
    const service = new ItemUpgradeService(repository, now);
    const preview = await service.previewDismantleForTelegramUser(telegramUserId, panPlusTwoItemId);
    if (preview.state !== "ready") throw new Error(`Expected dismantle preview, got ${preview.state}`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "character_remorts" ("id", "character_id", "remort_number", "level_before", "xp_before") VALUES (?, ?, 1, 8, 0)`,
      "remort-after-preview",
      characterId
    );

    await expect(repository.dismantleForTelegramUser(telegramUserId, {
      itemId: preview.item.itemId,
      expectedQuantity: preview.item.quantity,
      expectedRemortCount: preview.expectedRemortCount,
      expectedYield: preview.item.yield,
      payment: preview.payment,
      rulesFingerprint: preview.rulesFingerprint,
      guard: preview.guard,
      now: now()
    })).resolves.toEqual({ state: "stale" });
    await expectItemQuantity(panPlusTwoItemId, 1);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
    await expectCharacterResources({ gold: 1_000, manaCurrent: 80 });
  });

  it("uses canonical mana regeneration and charges five mana for a magical class", async () => {
    await seedUnlock();
    await seedItem(panItemId, 1);
    await prisma.character.update({
      where: { id: characterId },
      data: {
        classId: "class.mage",
        manaCurrent: 2,
        manaMax: 80,
        manaRegenAt: new Date(now().getTime() - 24 * 60 * 60 * 1_000)
      }
    });
    const service = new ItemUpgradeService(repository, now);
    const preview = await service.previewDismantleForTelegramUser(telegramUserId, panItemId);
    if (preview.state !== "ready") throw new Error(`Expected dismantle preview, got ${preview.state}`);
    expect(preview).toMatchObject({ payment: "mana", paymentAmount: 5, available: 94 });

    await expect(repository.dismantleForTelegramUser(telegramUserId, {
      itemId: preview.item.itemId,
      expectedQuantity: preview.item.quantity,
      expectedRemortCount: preview.expectedRemortCount,
      expectedYield: preview.item.yield,
      payment: preview.payment,
      rulesFingerprint: preview.rulesFingerprint,
      guard: preview.guard,
      now: now()
    })).resolves.toMatchObject({ state: "dismantled", payment: "mana", paymentAmount: 5 });

    await expectItemQuantity(panItemId, 0);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, preview.item.yield);
    await expectCharacterResources({ gold: 1_000, manaCurrent: 89 });
  });

  async function seedCharacter(): Promise<void> {
    await prisma.user.create({
      data: {
        id: userId,
        telegramUserId,
        displayName: "Upgrade Test",
        lastSeenLocationId: ITEM_UPGRADE_LOCATION_ID
      }
    });
    await prisma.character.create({
      data: {
        id: characterId,
        userId,
        name: "Upgrade Test",
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 8,
        xp: 0,
        gold: 1_000,
        hpCurrent: 25,
        hpMax: 25,
        manaCurrent: 80,
        manaMax: 80,
        statsJson: {
          strength: 8,
          dexterity: 8,
          intelligence: 8,
          charisma: 8,
          luck: 10
        }
      }
    });
  }

  async function seedItem(itemId: string, quantity: number): Promise<void> {
    await prisma.characterItem.create({
      data: {
        characterId,
        itemId,
        quantity
      }
    });
  }

  async function seedUnlock(): Promise<void> {
    await prisma.dailyAction.create({
      data: {
        characterId,
        key: ITEM_UPGRADE_UNLOCK_KEY,
        localDate: ITEM_UPGRADE_UNLOCK_LOCAL_DATE,
        rewardXp: 0,
        rewardGold: 0,
        spentGold: 0,
        resultJson: {
          kind: "item-upgrade-unlock",
          version: 1,
          seeded: true
        }
      }
    });
  }

  async function expectItemQuantity(itemId: string, quantity: number): Promise<void> {
    const item = await prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId,
          itemId
        }
      }
    });

    expect(item?.quantity ?? 0).toBe(quantity);
  }

  async function expectCharacterResources(expected: {
    gold: number;
    manaCurrent: number;
  }): Promise<void> {
    await expect(prisma.character.findUnique({
      where: { id: characterId },
      select: { gold: true, manaCurrent: true }
    })).resolves.toEqual(expected);
  }

  async function expectEquippedItem(itemId: string): Promise<void> {
    await expect(prisma.characterEquipment.findFirst({
      where: { characterId, slot: "weapon" },
      select: { itemId: true }
    })).resolves.toEqual({ itemId });
  }
});

function now(): Date {
  return new Date("2026-07-07T09:00:00.000Z");
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
    `CREATE TABLE "character_equipment" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL,
      "slot" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_equipment_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "character_equipment_character_id_slot_key" ON "character_equipment"("character_id", "slot")`,
    `CREATE TABLE "mantok_chest_runs" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "input_items_json" JSONB NOT NULL
    )`,
    `CREATE TABLE "level_barter_exchanges" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'completed',
      "input_items_json" JSONB NOT NULL
    )`,
    `CREATE TABLE "korchma_mantok_sales" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "selection_json" JSONB NOT NULL,
      "expires_at" DATETIME NOT NULL
    )`,
    `CREATE TABLE "item_transfers" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sender_character_id" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "package_json" JSONB,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "expires_at" DATETIME NOT NULL
    )`,
    `CREATE TABLE "item_use_orders" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "expires_at" DATETIME NOT NULL
    )`,
    `CREATE TABLE "character_remorts" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL,
      "remort_number" INTEGER NOT NULL,
      "level_before" INTEGER NOT NULL DEFAULT 13,
      "xp_before" INTEGER NOT NULL DEFAULT 0,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_remorts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "character_remorts_character_id_remort_number_key" ON "character_remorts"("character_id", "remort_number")`,
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
    `CREATE UNIQUE INDEX "daily_actions_character_id_key_local_date_key" ON "daily_actions"("character_id", "key", "local_date")`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
