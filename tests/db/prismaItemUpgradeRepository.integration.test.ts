import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HpRecoveryNotificationProducer } from "../../src/db/repositories/hpRecoveryNotificationProducer";
import { PrismaItemUpgradeRepository } from "../../src/db/repositories/prismaItemUpgradeRepository";
import { PrismaEquipmentRepository } from "../../src/db/repositories/prismaEquipmentRepository";
import { PrismaItemUseRepository } from "../../src/db/repositories/prismaItemUseRepository";
import { PrismaItemTransferRepository } from "../../src/db/repositories/prismaItemTransferRepository";
import { PrismaMantokChestRepository } from "../../src/db/repositories/prismaMantokChestRepository";
import { PrismaLevelBarterRepository } from "../../src/db/repositories/prismaLevelBarterRepository";
import { PrismaShynokRepository } from "../../src/db/repositories/prismaShynokRepository";
import { items } from "../../src/content";
import { createItemUseFingerprint } from "../../src/domain/itemUse";
import { calculatePostalDeliveryFee, createItemGiftFingerprint } from "../../src/domain/itemTransfers";
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
const receiverTelegramUserId = 4040n;
const receiverUserId = "user-upgrade-4040";
const receiverCharacterId = "character-upgrade-4040";
const panPlusTwo = items.find((item) => item.id === panPlusTwoItemId)!;
const bandage = items.find((item) => item.id === "item.responsible-panic-bandage")!;

describe("PrismaItemUpgradeRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let contenderPrisma: PrismaClient;
  let repository: PrismaItemUpgradeRepository;
  let contenderRepository: PrismaItemUpgradeRepository;
  let equipmentRepository: PrismaEquipmentRepository;
  let itemUseRepository: PrismaItemUseRepository;
  let itemTransferRepository: PrismaItemTransferRepository;
  let mantokChestRepository: PrismaMantokChestRepository;
  let levelBarterRepository: PrismaLevelBarterRepository;
  let shynokRepository: PrismaShynokRepository;
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
    contenderPrisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
    await contenderPrisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
    const producer = new HpRecoveryNotificationProducer(true);
    producerRecord = vi.spyOn(producer, "record").mockResolvedValue(undefined);
    repository = new PrismaItemUpgradeRepository(prisma, producer);
    contenderRepository = new PrismaItemUpgradeRepository(contenderPrisma, producer);
    equipmentRepository = new PrismaEquipmentRepository(contenderPrisma);
    itemUseRepository = new PrismaItemUseRepository(contenderPrisma, producer);
    itemTransferRepository = new PrismaItemTransferRepository(contenderPrisma);
    mantokChestRepository = new PrismaMantokChestRepository(contenderPrisma);
    levelBarterRepository = new PrismaLevelBarterRepository(contenderPrisma, producer);
    shynokRepository = new PrismaShynokRepository(contenderPrisma, producer);
  }, 60_000);

  beforeEach(async () => {
    producerRecord.mockClear();
    await prisma.dailyAction.deleteMany();
    await prisma.mantokChestRun.deleteMany();
    await prisma.levelBarterExchange.deleteMany();
    await prisma.korchmaMantokSale.deleteMany();
    await prisma.$executeRawUnsafe(`DELETE FROM "item_use_orders"`);
    await prisma.$executeRawUnsafe(`DELETE FROM "item_transfers"`);
    await prisma.characterEquipment.deleteMany();
    await prisma.characterItem.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
    await seedCharacter();
    await seedReceiver();
  });

  afterAll(async () => {
    await contenderPrisma?.$disconnect();
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
      contenderRepository.dismantleForTelegramUser(telegramUserId, input)
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["dismantled", "replayed"]);
    await expectItemQuantity(panPlusTwoItemId, 1);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, preview.item.yield);
    await expectCharacterResources({ gold: 995, manaCurrent: 80 });
    await expect(repository.dismantleForTelegramUser(telegramUserId, input))
      .resolves.toMatchObject({ state: "replayed", yield: preview.item.yield });
    await expectDismantleReceiptCount(preview.guard, 1);
  });

  it("serializes dismantling against equipping the same last copy", async () => {
    const { preview, input } = await prepareDismantleRace();

    const [dismantle, equip] = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      equipmentRepository.equipForCharacterAtomically({
        characterId,
        slot: "weapon",
        itemId: panPlusTwoItemId
      })
    ]);

    const equipped = await prisma.characterEquipment.findFirst({
      where: { characterId, itemId: panPlusTwoItemId }
    });
    const quantity = await getItemQuantity(panPlusTwoItemId);
    expect(
      (dismantle.state === "dismantled" && "state" in equip && equip.state === "not-owned") ||
      (dismantle.state === "equipped" && !("state" in equip))
    ).toBe(true);
    expect(equipped ? quantity : true).toBeTruthy();
    expect(equipped === null).toBe(dismantle.state === "dismantled");
    await assertDismantleRaceEconomy(preview, dismantle.state === "dismantled");
  });

  it("serializes dismantling against production item-use preview creation", async () => {
    const { preview, input } = await prepareDismantleRace();
    await prisma.character.update({ where: { id: characterId }, data: { hpCurrent: 10 } });
    const usablePan = { ...bandage, id: panPlusTwo.id, name: panPlusTwo.name };

    const [dismantle, itemUse] = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      itemUseRepository.createPreviewForTelegramUser(telegramUserId, {
        item: usablePan,
        itemContents: [usablePan],
        itemFingerprint: createItemUseFingerprint(usablePan),
        token: "item-use-race",
        now: now(),
        expiresAt: new Date(now().getTime() + 60_000)
      })
    ]);

    expect(
      (dismantle.state === "dismantled" && itemUse.state === "not-owned") ||
      (dismantle.state === "reserved" && (itemUse.state === "preview-created" || itemUse.state === "preview-replayed"))
    ).toBe(true);
    const liveOrders = await prisma.itemUseOrder.count({
      where: { characterId, itemId: panPlusTwoItemId, status: { in: ["pending", "processing"] } }
    });
    expect(liveOrders).toBe(dismantle.state === "dismantled" ? 0 : 1);
    await assertDismantleRaceEconomy(preview, dismantle.state === "dismantled");
  });

  it("keeps restore-to-full production preview and dismantling domain-disjoint without contention leaks", async () => {
    const { preview, input } = await prepareDismantleRace();
    await seedItem(bandage.id, 13);
    await prisma.character.update({ where: { id: characterId }, data: { hpCurrent: 10 } });

    const [dismantle, restore] = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      itemUseRepository.restoreToFullForTelegramUser(telegramUserId, {
        item: bandage,
        itemContents: [bandage],
        itemFingerprint: createItemUseFingerprint(bandage),
        token: "restore-to-full-race",
        now: now(),
        expiresAt: new Date(now().getTime() + 60_000)
      })
    ]);

    expect(dismantle.state).toBe("dismantled");
    expect(["preview-created", "preview-replayed"]).toContain(restore.state);
    await assertDismantleRaceEconomy(preview, true);
    await expectItemQuantity(bandage.id, 13);
    await expect(prisma.itemUseOrder.count({ where: { token: "restore-to-full-race", status: "pending" } }))
      .resolves.toBe(1);
  });

  it("serializes dismantling against production gift reservation creation", async () => {
    const { preview, input } = await prepareDismantleRace();

    const [dismantle, gift] = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      itemTransferRepository.createGiftForTelegramUser(telegramUserId, {
        token: "item-transfer-race",
        receiverTelegramUserId,
        item: panPlusTwo,
        itemFingerprint: createItemGiftFingerprint(panPlusTwo),
        expiresAt: new Date(now().getTime() + 60_000),
        now: now()
      })
    ]);

    expect(
      (dismantle.state === "dismantled" && gift.state === "stale-selection") ||
      (dismantle.state === "reserved" && gift.state === "created")
    ).toBe(true);
    const liveTransfers = await prisma.itemTransfer.count({
      where: { token: "item-transfer-race", status: { in: ["pending", "processing"] } }
    });
    expect(liveTransfers).toBe(dismantle.state === "dismantled" ? 0 : 1);
    await expect(prisma.characterItem.count({
      where: { characterId: receiverCharacterId, itemId: panPlusTwoItemId }
    })).resolves.toBe(0);
    await assertDismantleRaceEconomy(preview, dismantle.state === "dismantled");
  });

  it("serializes dismantling against production postal draft confirmation and custody", async () => {
    const { preview, input } = await prepareDismantleRace();
    await seedPostalDraft("postal-confirm-race", preview.item.quantity);

    const [dismantle, postal] = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      itemTransferRepository.confirmPostalDraftForTelegramUser(telegramUserId, {
        token: "postal-confirm-race",
        itemContents: [panPlusTwo],
        now: now(),
        expiresAt: new Date(now().getTime() + 60_000),
        result: { kind: "postal-confirm-race" }
      })
    ]);

    const validPostalRace =
      (dismantle.state === "dismantled" && postal.state === "stale-selection") ||
      ((dismantle.state === "reserved" || dismantle.state === "not-owned") && postal.state === "created");
    if (!validPostalRace) throw new Error(`Unexpected postal race: ${dismantle.state}/${postal.state}`);
    const transfer = await prisma.itemTransfer.findUniqueOrThrow({ where: { token: "postal-confirm-race" } });
    expect(transfer.status).toBe(dismantle.state === "dismantled" ? "draft" : "pending");
    expect(transfer.resultJson).toEqual(dismantle.state === "dismantled"
      ? null
      : expect.objectContaining({ postalCustody: "sender-debited" }));
    await expect(prisma.characterItem.count({
      where: { characterId: receiverCharacterId, itemId: panPlusTwoItemId }
    })).resolves.toBe(0);
    if (dismantle.state === "dismantled") {
      await assertDismantleRaceEconomy(preview, true);
    } else {
      await expectCharacterResources({ gold: 1_000 - transfer.deliveryFeeGold, manaCurrent: 80 });
      await expectItemQuantity(panPlusTwoItemId, 0);
      await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
      await expectDismantleReceiptCount(preview.guard, 0);
    }
  });

  it("serializes dismantling against production Mantok Chest reservation creation", async () => {
    const { preview, input } = await prepareDismantleRace();
    const [dismantle, run] = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      mantokChestRepository.createPendingRunForTelegramUser(telegramUserId, {
        token: "mantok-create-race",
        inputItems: [{ itemId: panPlusTwoItemId, quantity: 1 }],
        averageInputScore: 1,
        minimumOutputScore: 1,
        now: now()
      })
    ]);

    expect(
      (dismantle.state === "dismantled" && run === null) ||
      (dismantle.state === "reserved" && run?.status === "pending")
    ).toBe(true);
    await expect(prisma.mantokChestRun.count({
      where: { token: "mantok-create-race", status: "pending" }
    })).resolves.toBe(dismantle.state === "dismantled" ? 0 : 1);
    await assertDismantleRaceEconomy(preview, dismantle.state === "dismantled");
  });

  it("serializes dismantling against production Mantok Chest reservation refresh", async () => {
    await seedItem(bandage.id, 1);
    const existing = await mantokChestRepository.createPendingRunForTelegramUser(telegramUserId, {
      token: "mantok-update-race",
      inputItems: [{ itemId: bandage.id, quantity: 1 }],
      averageInputScore: 1,
      minimumOutputScore: 1,
      now: now()
    });
    expect(existing?.status).toBe("pending");
    const { preview, input } = await prepareDismantleRace();

    const [dismantle, updated] = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      mantokChestRepository.updatePendingRunInputItemsForTelegramUser(telegramUserId, {
        token: "mantok-update-race",
        inputItems: [{ itemId: panPlusTwoItemId, quantity: 1 }],
        averageInputScore: 1,
        minimumOutputScore: 1,
        now: now()
      })
    ]);

    expect(
      (dismantle.state === "dismantled" && updated === null) ||
      (dismantle.state === "reserved" && updated?.inputItems[0]?.itemId === panPlusTwoItemId)
    ).toBe(true);
    const current = await prisma.mantokChestRun.findUniqueOrThrow({ where: { token: "mantok-update-race" } });
    expect(current.inputItemsJson).toEqual(dismantle.state === "dismantled"
      ? [{ itemId: bandage.id, quantity: 1 }]
      : [{ itemId: panPlusTwoItemId, quantity: 1 }]);
    await assertDismantleRaceEconomy(preview, dismantle.state === "dismantled");
  });

  it("serializes dismantling against production Shynok sale reservation creation", async () => {
    const { preview, input } = await prepareDismantleRace();
    const [dismantle, sale] = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      shynokRepository.createSaleForTelegramUser(telegramUserId, {
        token: "shynok-sale-race",
        selection: [{ itemId: panPlusTwoItemId, quantity: 1 }],
        selectionFingerprint: "shynok-sale-race",
        nominalValue: 1,
        payoutGold: 1,
        expiresAt: new Date(now().getTime() + 60_000),
        now: now()
      })
    ]);

    expect(
      (dismantle.state === "dismantled" && sale === null) ||
      (dismantle.state === "reserved" && sale?.status === "pending")
    ).toBe(true);
    await expect(prisma.korchmaMantokSale.count({
      where: { token: "shynok-sale-race", status: "pending" }
    })).resolves.toBe(dismantle.state === "dismantled" ? 0 : 1);
    await assertDismantleRaceEconomy(preview, dismantle.state === "dismantled");
  });

  it("serializes dismantling against production Level Barter settlement", async () => {
    const { preview, input } = await prepareDismantleRace();
    const [dismantle, barter] = await Promise.all([
      repository.dismantleForTelegramUser(telegramUserId, input),
      levelBarterRepository.confirmAutoExchangeForTelegramUser(telegramUserId, {
        expectedToken: "level-barter-race",
        now: now(),
        createPlan: (snapshot) => snapshot.items.some((item) =>
          item.itemId === panPlusTwoItemId && item.quantity >= 1 &&
          !snapshot.equippedItemIds.includes(item.itemId) &&
          !snapshot.reservedItemIds?.includes(item.itemId)
        )
          ? {
              state: "ready",
              plan: {
                token: "level-barter-race",
                items: [{ itemId: panPlusTwoItemId, quantity: 1 }],
                goldSpent: 0,
                levelBefore: snapshot.character.level,
                levelAfter: snapshot.character.level,
                xpBefore: snapshot.character.xp,
                xpAfter: snapshot.character.xp,
                xpCarry: 0,
                itemTotalValue: 1,
                selectedTotalValue: 1,
                overpay: 0
              }
            }
          : { state: "token-mismatch" }
      })
    ]);

    const validBarterRace =
      (dismantle.state === "dismantled" && barter.state === "stale-selection") ||
      ((dismantle.state === "stale" || dismantle.state === "not-owned") && barter.state === "exchanged");
    if (!validBarterRace) throw new Error(`Unexpected barter race: ${dismantle.state}/${barter.state}`);
    await expectItemQuantity(panPlusTwoItemId, 0);
    await expect(prisma.levelBarterExchange.count({
      where: { token: "level-barter-race", status: "pending" }
    })).resolves.toBe(0);
    await expect(prisma.levelBarterExchange.count({
      where: { token: "level-barter-race", status: "completed" }
    })).resolves.toBe(barter.state === "exchanged" ? 1 : 0);
    if (dismantle.state === "dismantled") {
      await assertDismantleRaceEconomy(preview, true);
    } else {
      await expectCharacterResources({ gold: 1_000, manaCurrent: 80 });
      await expectItemQuantity(ISKROKAMIN_ITEM_ID, 0);
      await expectDismantleReceiptCount(preview.guard, 0);
    }
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

    await prisma.character.update({ where: { id: characterId }, data: { hpCurrent: 10 } });
    const usablePan = { ...bandage, id: panPlusTwo.id, name: panPlusTwo.name };
    await expect(itemUseRepository.createPreviewForTelegramUser(telegramUserId, {
      item: usablePan,
      itemContents: [usablePan],
      itemFingerprint: createItemUseFingerprint(usablePan),
      token: "reserved-after-preview",
      now: now(),
      expiresAt: new Date(now().getTime() + 60_000)
    })).resolves.toMatchObject({ state: "preview-created" });
    await expect(repository.dismantleForTelegramUser(telegramUserId, input))
      .resolves.toEqual({ state: "reserved" });
    await prisma.itemUseOrder.delete({ where: { token: "reserved-after-preview" } });

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

  async function prepareDismantleRace() {
    await seedUnlock();
    await seedItem(panPlusTwoItemId, 1);
    const service = new ItemUpgradeService(repository, now);
    const preview = await service.previewDismantleForTelegramUser(telegramUserId, panPlusTwoItemId);
    if (preview.state !== "ready") throw new Error(`Expected dismantle preview, got ${preview.state}`);
    return {
      preview,
      input: {
        itemId: preview.item.itemId,
        expectedQuantity: preview.item.quantity,
        expectedRemortCount: preview.expectedRemortCount,
        expectedYield: preview.item.yield,
        payment: preview.payment,
        rulesFingerprint: preview.rulesFingerprint,
        guard: preview.guard,
        now: now()
      }
    };
  }

  async function seedPostalDraft(token: string, observedQuantity: number): Promise<void> {
    const line = {
      itemId: panPlusTwo.id,
      itemName: panPlusTwo.name,
      quantity: 1,
      itemFingerprint: createItemGiftFingerprint(panPlusTwo),
      unitGoldValue: panPlusTwo.goldValue ?? 0,
      observedQuantity,
      tags: []
    };
    await prisma.itemTransfer.create({
      data: {
        token,
        transferKind: "postal",
        senderCharacterId: characterId,
        receiverCharacterId,
        senderTelegramUserId: telegramUserId,
        receiverTelegramUserId,
        senderName: "Upgrade Test",
        receiverName: "Upgrade Receiver",
        senderRemortCount: 0,
        receiverRemortCount: 0,
        itemId: panPlusTwo.id,
        itemName: panPlusTwo.name,
        itemFingerprint: createItemGiftFingerprint(panPlusTwo),
        quantity: 1,
        packageJson: [line],
        deliveryFeeGold: calculatePostalDeliveryFee([line]),
        status: "draft",
        expiresAt: new Date(now().getTime() + 60_000),
        updatedAt: now()
      }
    });
  }

  async function seedReceiver(): Promise<void> {
    await prisma.user.create({
      data: {
        id: receiverUserId,
        telegramUserId: receiverTelegramUserId,
        displayName: "Upgrade Receiver",
        lastSeenLocationId: ITEM_UPGRADE_LOCATION_ID
      }
    });
    await prisma.character.create({
      data: {
        id: receiverCharacterId,
        userId: receiverUserId,
        name: "Upgrade Receiver",
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 8,
        xp: 0,
        gold: 100,
        hpCurrent: 25,
        hpMax: 25,
        manaCurrent: 80,
        manaMax: 80,
        statsJson: { strength: 8, dexterity: 8, intelligence: 8, charisma: 8, luck: 10 }
      }
    });
  }

  async function assertDismantleRaceEconomy(
    preview: Extract<Awaited<ReturnType<ItemUpgradeService["previewDismantleForTelegramUser"]>>, { state: "ready" }>,
    dismantled: boolean
  ): Promise<void> {
    await expectCharacterResources({ gold: dismantled ? 995 : 1_000, manaCurrent: 80 });
    await expectItemQuantity(panPlusTwoItemId, dismantled ? 0 : 1);
    await expectItemQuantity(ISKROKAMIN_ITEM_ID, dismantled ? preview.item.yield : 0);
    await expectDismantleReceiptCount(preview.guard, dismantled ? 1 : 0);
  }

  async function expectDismantleReceiptCount(guard: string, count: number): Promise<void> {
    await expect(prisma.dailyAction.count({
      where: {
        characterId,
        key: `item-dismantle.receipt:${guard}`,
        localDate: "persistent"
      }
    })).resolves.toBe(count);
  }

  async function getItemQuantity(itemId: string): Promise<number> {
    return (await prisma.characterItem.findUnique({
      where: { characterId_itemId: { characterId, itemId } },
      select: { quantity: true }
    }))?.quantity ?? 0;
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
    `CREATE TABLE "active_combat_leases" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL UNIQUE,
      "kind" TEXT NOT NULL,
      "reference_id" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "character_drink_states" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "activation_id" TEXT NOT NULL UNIQUE,
      "character_id" TEXT NOT NULL UNIQUE,
      "remort_count" INTEGER NOT NULL DEFAULT 0,
      "drink_key" TEXT NOT NULL,
      "phase" TEXT NOT NULL,
      "started_at" DATETIME NOT NULL,
      "expires_at" DATETIME NOT NULL,
      "source_type" TEXT NOT NULL,
      "source_id" TEXT,
      "metadata_json" JSONB,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "mantok_chest_runs" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "input_items_json" JSONB NOT NULL,
      "output_items_json" JSONB,
      "average_input_score" INTEGER NOT NULL DEFAULT 0,
      "minimum_output_score" INTEGER NOT NULL DEFAULT 0,
      "output_score" INTEGER,
      "completed_at" DATETIME,
      "expired_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "level_barter_exchanges" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'completed',
      "input_items_json" JSONB NOT NULL,
      "spent_gold" INTEGER NOT NULL DEFAULT 0,
      "level_before" INTEGER NOT NULL DEFAULT 1,
      "level_after" INTEGER NOT NULL DEFAULT 1,
      "xp_before" INTEGER NOT NULL DEFAULT 0,
      "xp_after" INTEGER NOT NULL DEFAULT 0,
      "xp_carry" INTEGER NOT NULL DEFAULT 0,
      "item_total_value" INTEGER NOT NULL DEFAULT 0,
      "selected_total_value" INTEGER NOT NULL DEFAULT 0,
      "overpay" INTEGER NOT NULL DEFAULT 0,
      "completed_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX "level_barter_exchanges_character_id_token_key" ON "level_barter_exchanges"("character_id", "token")`,
    `CREATE TABLE "korchma_mantok_sales" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "token" TEXT NOT NULL UNIQUE,
      "transfer_kind" TEXT NOT NULL DEFAULT 'gift',
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
      "package_json" JSONB,
      "delivery_fee_gold" INTEGER NOT NULL DEFAULT 0,
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
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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
