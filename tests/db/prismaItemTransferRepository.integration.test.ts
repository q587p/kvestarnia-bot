import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { items } from "../../src/content";
import type { ItemContent } from "../../src/content/schema";
import { PrismaItemTransferRepository } from "../../src/db/repositories/prismaItemTransferRepository";
import { createItemGiftFingerprint } from "../../src/domain/itemTransfers";

const item: ItemContent = {
  id: "item.test-gift-spoon",
  name: "Тестова ложка",
  description: "Для дарчого тесту.",
  rarity: "common",
  slot: "junk",
  goldValue: 13
};
const postalItems: ItemContent[] = Array.from({ length: 5 }, (_value, index) => ({
  id: `item.test-postal-${index + 1}`,
  name: `Поштова манатка ${index + 1}`,
  description: "Для поштового тесту.",
  rarity: "common",
  slot: "junk",
  goldValue: 13 + index
}));
const bandage = items.find((candidate) => candidate.id === "item.responsible-panic-bandage");

if (!bandage) {
  throw new Error("Bandage content is missing.");
}

describe("PrismaItemTransferRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaItemTransferRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-gifts-repo-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaItemTransferRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS item_transfer_terminal_race`);
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

  it("moves one item unit exactly once and replays duplicate accepts", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 2);

    const created = await createGift();
    expect(created.state).toBe("created");

    const first = await repository.acceptGiftForTelegramUser(2n, {
      token: "gift-token-1",
      itemContents: [item],
      now: now(),
      result: { kind: "test-accept" }
    });
    expect(first.state).toBe("completed");

    const replay = await repository.acceptGiftForTelegramUser(2n, {
      token: "gift-token-1",
      itemContents: [item],
      now: now(),
      result: { kind: "test-accept-again" }
    });
    expect(replay.state).toBe("replayed");

    await expectQuantities({ sender: 1, receiver: 1 });
  });

  it("moves one item unit exactly once with duplicate concurrent accepts", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 2);
    await createGift();

    const results = await Promise.all([
      acceptGift({ kind: "test-concurrent-accept-1" }),
      acceptGift({ kind: "test-concurrent-accept-2" })
    ]);
    const states = results.map((result) => result.state).sort();

    expect(states).toEqual(["completed", "replayed"]);
    await expectFinalTransfer("completed");
    await expectQuantities({ sender: 1, receiver: 1 });
  });

  it("keeps duplicate concurrent gift creates to one live reservation", async () => {
    await seedCharacter(1n, "sender", "Р”Р°СЂСѓРІР°Р»СЊРЅРёРє");
    await seedCharacter(2n, "receiver", "РћС‚СЂРёРјСѓРІР°С‡");
    await seedItem("sender", 1);

    const attempts = await Promise.allSettled([
      createGift("gift-token-1"),
      createGift("gift-token-2")
    ]);

    expect(attempts).toEqual([
      expect.objectContaining({ status: "fulfilled" }),
      expect.objectContaining({ status: "fulfilled" })
    ]);
    const states = attempts.map((attempt) => {
      if (attempt.status !== "fulfilled") {
        throw attempt.reason;
      }

      return attempt.value.state;
    }).sort();
    expect(states).toEqual(["created", "stale-selection"]);

    const liveTransfers = await prisma.itemTransfer.findMany({
      where: {
        senderCharacterId: "sender",
        itemId: item.id,
        status: { in: ["pending", "processing"] }
      }
    });
    expect(liveTransfers).toHaveLength(1);
    expect(liveTransfers[0]?.status).toBe("pending");
    expect(liveTransfers[0]?.reservationKey).toBe(`gift:sender:${item.id}`);
    await expectQuantities({ sender: 1, receiver: 0 });
  });

  it("keeps accept and decline races consistent with the canonical terminal state", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await createGift();

    const [accept, decline] = await Promise.all([
      acceptGift({ kind: "test-accept-decline-race" }),
      repository.declineGiftForTelegramUser(2n, "gift-token-1", now())
    ]);
    const final = await getFinalTransfer();

    expect(final.status === "completed" || final.status === "declined").toBe(true);
    expect(accept).toMatchObject({ transfer: { status: final.status } });
    expect(decline).toMatchObject({ transfer: { status: final.status } });
    expect(accept.state === "completed" || accept.state === "replayed" || accept.state === "declined").toBe(true);
    expect(decline.state === "replayed" || decline.state === "declined").toBe(true);
    await expectQuantities(final.status === "completed" ? { sender: 0, receiver: 1 } : { sender: 1, receiver: 0 });
  });

  it("keeps accept and cancel races consistent with the canonical terminal state", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await createGift();

    const [accept, cancel] = await Promise.all([
      acceptGift({ kind: "test-accept-cancel-race" }),
      repository.cancelGiftForTelegramUser(1n, "gift-token-1", now())
    ]);
    const final = await getFinalTransfer();

    expect(final.status === "completed" || final.status === "cancelled").toBe(true);
    expect(accept).toMatchObject({ transfer: { status: final.status } });
    expect(cancel).toMatchObject({ transfer: { status: final.status } });
    expect(accept.state === "completed" || accept.state === "replayed" || accept.state === "cancelled").toBe(true);
    expect(cancel.state === "replayed" || cancel.state === "cancelled").toBe(true);
    await expectQuantities(final.status === "completed" ? { sender: 0, receiver: 1 } : { sender: 1, receiver: 0 });
  });

  it("replays canonical completed state when an expired accept loses the status race", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await createGift("gift-token-1", past());
    await installTerminalRaceTrigger("expired", "completed");

    const result = await acceptGift({ kind: "test-expired-race" });

    expect(result.state).toBe("replayed");
    expect(result).toMatchObject({ transfer: { status: "completed" } });
  });

  it.each([
    ["equipped", async () => {
      await prisma.characterEquipment.create({
        data: { characterId: "sender", slot: "weapon", itemId: item.id }
      });
    }],
    ["chested", async () => {
      await prisma.mantokChestRun.create({
        data: {
          characterId: "sender",
          token: "chest-token",
          status: "pending",
          inputItemsJson: [{ itemId: item.id, quantity: 1 }],
          averageInputScore: 1,
          minimumOutputScore: 2,
          updatedAt: now()
        }
      });
    }],
    ["bartered", async () => {
      await prisma.levelBarterExchange.create({
        data: {
          characterId: "sender",
          token: "barter-token",
          status: "pending",
          inputItemsJson: [{ itemId: item.id, quantity: 1 }],
          spentGold: 0,
          levelBefore: 3,
          levelAfter: 4,
          xpBefore: 100,
          xpAfter: 200,
          xpCarry: 0,
          itemTotalValue: 13,
          selectedTotalValue: 13,
          overpay: 0
        }
      });
    }],
    ["sold", async () => {
      await prisma.korchmaMantokSale.create({
        data: {
          token: "sale-token",
          characterId: "sender",
          remortCount: 0,
          status: "pending",
          selectionJson: [{ itemId: item.id, quantity: 1 }],
          selectionFingerprint: "sale",
          nominalValue: 13,
          payoutGold: 5,
          expiresAt: future(),
          updatedAt: now()
        }
      });
    }]
  ] as const)("blocks %s item reservations before creating a gift", async (_name, reserve) => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 2);
    await reserve();

    await expect(createGift()).resolves.toMatchObject({ state: "stale-selection" });
  });

  it("decline and cancel release the reservation for a later gift", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);

    await createGift("gift-token-1");
    await expect(createGift("gift-token-2")).resolves.toMatchObject({ state: "stale-selection" });

    const decline = await repository.declineGiftForTelegramUser(2n, "gift-token-1", now());
    expect(decline).toMatchObject({ state: "declined", transitioned: true });
    const declineReplay = await repository.declineGiftForTelegramUser(2n, "gift-token-1", now());
    expect(declineReplay).toMatchObject({ state: "declined" });
    expect(declineReplay).not.toHaveProperty("transitioned");
    await expect(createGift("gift-token-3")).resolves.toMatchObject({ state: "created" });

    const cancel = await repository.cancelGiftForTelegramUser(1n, "gift-token-3", now());
    expect(cancel).toMatchObject({ state: "cancelled", transitioned: true });
    const cancelReplay = await repository.cancelGiftForTelegramUser(1n, "gift-token-3", now());
    expect(cancelReplay).toMatchObject({ state: "cancelled" });
    expect(cancelReplay).not.toHaveProperty("transitioned");
    await expect(createGift("gift-token-4")).resolves.toMatchObject({ state: "created" });
  });

  it("reserves the whole itemId stack while a gift is pending", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 2);

    await expect(createGift("gift-token-1")).resolves.toMatchObject({ state: "created" });
    await expect(createGift("gift-token-2")).resolves.toMatchObject({ state: "stale-selection" });
    await expectQuantities({ sender: 2, receiver: 0 });
  });

  it("releases an untouched expired pending gift reservation for a later gift", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 2);

    await expect(createGift("gift-token-1", past())).resolves.toMatchObject({ state: "created" });
    await expect(createGift("gift-token-2", future())).resolves.toMatchObject({ state: "created" });
    await expect(prisma.itemTransfer.findUnique({ where: { token: "gift-token-1" } })).resolves.toMatchObject({
      status: "expired",
      reservationKey: null
    });
    await expectQuantities({ sender: 2, receiver: 0 });
  });

  it("keeps processing gifts reserved even after their expiry time", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 2);
    await createGift("gift-token-1", past());
    await prisma.itemTransfer.update({
      where: { token: "gift-token-1" },
      data: { status: "processing", updatedAt: now() }
    });

    await expect(createGift("gift-token-2", future())).resolves.toMatchObject({ state: "stale-selection" });
    await expectQuantities({ sender: 2, receiver: 0 });
  });

  it("expires a stale gift without moving the item", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await createGift("gift-token-1", past());

    const result = await repository.acceptGiftForTelegramUser(2n, {
      token: "gift-token-1",
      itemContents: [item],
      now: now(),
      result: { kind: "test-expired" }
    });

    expect(result.state).toBe("expired");
    await expectQuantities({ sender: 1, receiver: 0 });
  });

  it("canonicalizes old decline and cancel callbacks after passive expiry", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await createGift("gift-token-1", past());

    const decline = await repository.declineGiftForTelegramUser(2n, "gift-token-1", now());
    const cancel = await repository.cancelGiftForTelegramUser(1n, "gift-token-1", now());

    expect(decline).toMatchObject({ state: "expired", transfer: { status: "expired" } });
    expect(cancel).toMatchObject({ state: "expired", transfer: { status: "expired" } });
    await expectQuantities({ sender: 1, receiver: 0 });
  });

  it("rejects create when the item fingerprint no longer matches the rendered card", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);

    const result = await repository.createGiftForTelegramUser(1n, {
      token: "gift-token-1",
      receiverTelegramUserId: 2n,
      item,
      itemFingerprint: createItemGiftFingerprint({ ...item, name: "Old rendered spoon" }),
      now: now(),
      expiresAt: future()
    });

    expect(result.state).toBe("stale-selection");
    await expect(prisma.itemTransfer.count()).resolves.toBe(0);
    await expectQuantities({ sender: 1, receiver: 0 });
  });

  it("rejects an old rendered gift selection when tags now block transfer", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1, bandage.id);

    const result = await repository.createGiftForTelegramUser(1n, {
      token: "gift-token-1",
      receiverTelegramUserId: 2n,
      item: bandage,
      itemFingerprint: createItemGiftFingerprint(bandage),
      now: now(),
      expiresAt: future()
    });

    expect(result.state).toBe("stale-selection");
    await expect(prisma.itemTransfer.count()).resolves.toBe(0);
    await expect(prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: "sender",
          itemId: bandage.id
        }
      }
    })).resolves.toMatchObject({ quantity: 1 });
  });

  it("fails safely when item content changes before accept", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await createGift();

    const changed = { ...item, name: "Інша ложка" };
    const result = await repository.acceptGiftForTelegramUser(2n, {
      token: "gift-token-1",
      itemContents: [changed],
      now: now(),
      result: { kind: "test-accept" }
    });

    expect(result.state).toBe("stale-selection");
    await expectQuantities({ sender: 1, receiver: 0 });
  });

  it("fails safely when the sender stack changes before accept", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await createGift();
    await prisma.characterItem.deleteMany({ where: { characterId: "sender", itemId: item.id } });

    const result = await acceptGift({ kind: "test-stale-stack" });

    expect(result.state).toBe("stale-selection");
    await expectQuantities({ sender: 0, receiver: 0 });
  });

  it("replays completed state for old sender cancel buttons", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await createGift();

    await expect(acceptGift({ kind: "test-complete-before-cancel" })).resolves.toMatchObject({ state: "completed" });
    const cancel = await repository.cancelGiftForTelegramUser(1n, "gift-token-1", now());

    expect(cancel.state).toBe("replayed");
    expect(cancel).toMatchObject({ transfer: { status: "completed" } });
    await expectQuantities({ sender: 0, receiver: 1 });
  });

  it("blocks active combat before creating a gift", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await prisma.activeCombatLease.create({
      data: { characterId: "receiver", kind: "duel", referenceId: "duel-1" }
    });

    await expect(createGift()).resolves.toMatchObject({ state: "combat-locked" });
  });

  it("blocks active combat before accepting a gift", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedItem("sender", 1);
    await createGift();
    await prisma.activeCombatLease.create({
      data: { characterId: "sender", kind: "duel", referenceId: "duel-2" }
    });

    const result = await repository.acceptGiftForTelegramUser(2n, {
      token: "gift-token-1",
      itemContents: [item],
      now: now(),
      result: { kind: "test-combat-locked" }
    });

    expect(result.state).toBe("combat-locked");
    await expectQuantities({ sender: 1, receiver: 0 });
  });

  it("discovers known postal recipients from completed transfer history without same-location presence", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await prisma.user.update({
      where: { id: "user-receiver" },
      data: { lastSeenLocationId: "location.korchma.yard" }
    });
    await seedCompletedRelationship();

    const recipients = await repository.getPostalRecipientsForTelegramUser(1n, 0, 5);
    expect(recipients).toMatchObject({
      state: "ready",
      total: 1,
      visible: [expect.objectContaining({ telegramUserId: 2n, name: "Отримувач" })]
    });
    const draft = await repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      receiverTelegramUserId: 2n,
      now: now(),
      expiresAt: future()
    });
    expect(draft).toMatchObject({ state: "created" });
  });

  it("discovers known postal recipients from accepted duels and explicit Bard reactions", async () => {
    await seedCharacter(1n, "sender", "Поштар");
    await seedCharacter(2n, "duelist", "Дуелянт");
    await seedCharacter(3n, "listener", "Слухач");
    await seedCharacter(4n, "performer", "Бардеса");
    await seedCharacter(5n, "passive", "Мовчун");
    await seedDuelRelationship("sender", "duelist");
    await seedBardPerformanceReaction({
      performanceId: "performance-sender",
      performerId: "sender",
      audienceId: "listener",
      audienceTelegramUserId: 3n,
      status: "applauded"
    });
    await seedBardPerformanceReaction({
      performanceId: "performance-performer",
      performerId: "performer",
      audienceId: "sender",
      audienceTelegramUserId: 1n,
      status: "tipped"
    });
    await seedBardPerformanceReaction({
      performanceId: "performance-passive",
      performerId: "sender",
      audienceId: "passive",
      audienceTelegramUserId: 5n,
      status: "offered"
    });

    const recipients = await repository.getPostalRecipientsForTelegramUser(1n, 0, 5);

    expect(recipients).toMatchObject({
      state: "ready",
      total: 3
    });
    expect(recipients.state === "ready" ? recipients.visible.map((recipient) => recipient.name).sort() : [])
      .toEqual(["Бардеса", "Дуелянт", "Слухач"]);
    await expect(repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-duel-token",
      receiverTelegramUserId: 2n,
      now: now(),
      expiresAt: future()
    })).resolves.toMatchObject({ state: "created" });
    await expect(repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-listener-token",
      receiverTelegramUserId: 3n,
      now: now(),
      expiresAt: future()
    })).resolves.toMatchObject({ state: "created" });
    await expect(repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-performer-token",
      receiverTelegramUserId: 4n,
      now: now(),
      expiresAt: future()
    })).resolves.toMatchObject({ state: "created" });
    await expect(repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-passive-token",
      receiverTelegramUserId: 5n,
      now: now(),
      expiresAt: future()
    })).resolves.toMatchObject({ state: "target-not-found" });
  });

  it("charges the sender fee at postal confirmation and moves a five-type package once", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await prisma.character.update({ where: { id: "sender" }, data: { gold: 100 } });
    await seedCompletedRelationship();
    for (const content of postalItems) {
      await seedItem("sender", 93, content.id);
    }
    const lines = postalItems.map((content, index) => packageLine(content, index + 1));

    await createPostal(lines);
    await expect(prisma.character.findUnique({ where: { id: "sender" } })).resolves.toMatchObject({ gold: 90 });
    await expect(repository.getPostalRecipientsForTelegramUser(1n, 0, 5)).resolves.toMatchObject({
      state: "ready",
      inTransit: {
        total: 1,
        visible: [expect.objectContaining({ direction: "outgoing", otherName: "Отримувач", deliveryFeeGold: 10 })]
      }
    });
    await expect(repository.getPostalRecipientsForTelegramUser(2n, 0, 5)).resolves.toMatchObject({
      state: "ready",
      inTransit: {
        total: 1,
        visible: [expect.objectContaining({ direction: "incoming", otherName: "Дарувальник", deliveryFeeGold: 10 })]
      }
    });
    for (const [index, content] of postalItems.entries()) {
      await expectItemQuantity("sender", content.id, 93 - (index + 1));
      await expectItemQuantity("receiver", content.id, 0);
    }

    const accepted = await repository.acceptPostalForTelegramUser(2n, {
      token: "postal-token-1",
      itemContents: postalItems,
      now: now(),
      result: { kind: "postal-test-accepted" }
    });
    expect(accepted.state).toBe("completed");
    const replay = await repository.acceptPostalForTelegramUser(2n, {
      token: "postal-token-1",
      itemContents: postalItems,
      now: now(),
      result: { kind: "postal-test-replay" }
    });
    expect(replay.state).toBe("replayed");

    await expect(prisma.character.findUnique({ where: { id: "sender" } })).resolves.toMatchObject({ gold: 90 });
    await expect(repository.getPostalRecipientsForTelegramUser(1n, 0, 5, { historyPage: 0 })).resolves.toMatchObject({
      state: "ready",
      history: {
        total: 1,
        visible: [expect.objectContaining({ direction: "outgoing", otherName: "Отримувач", deliveryFeeGold: 10 })]
      }
    });
    for (const [index, content] of postalItems.entries()) {
      await expectItemQuantity("sender", content.id, 93 - (index + 1));
      await expectItemQuantity("receiver", content.id, index + 1);
    }
  }, 15_000);

  it("lets postal packages send explicit trade-blocked bandages", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await prisma.character.update({ where: { id: "sender" }, data: { gold: 100 } });
    await seedCompletedRelationship();
    await seedItem("sender", 2, bandage.id);

    await repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      receiverTelegramUserId: 2n,
      now: now(),
      expiresAt: future()
    });
    await expect(repository.updatePostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      packageLines: [packageLine(bandage, 2)],
      deliveryFeeGold: 0,
      now: now()
    })).resolves.toMatchObject({ state: "updated" });

    const confirmed = await repository.confirmPostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      itemContents: [bandage],
      now: now(),
      expiresAt: future(),
      result: { kind: "postal-test-bandage-pending" }
    });
    expect(confirmed.state).toBe("created");
    await expectItemQuantity("sender", bandage.id, 0);
    await expectItemQuantity("receiver", bandage.id, 0);

    const accepted = await repository.acceptPostalForTelegramUser(2n, {
      token: "postal-token-1",
      itemContents: [bandage],
      now: now(),
      result: { kind: "postal-test-bandage-accepted" }
    });

    expect(accepted.state).toBe("completed");
    await expectItemQuantity("sender", bandage.id, 0);
    await expectItemQuantity("receiver", bandage.id, 2);
  });

  it("does not create a pending postal package when sender lacks gold at confirmation", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await prisma.character.update({ where: { id: "sender" }, data: { gold: 1 } });
    await seedCompletedRelationship();
    for (const content of postalItems.slice(0, 2)) {
      await seedItem("sender", 5, content.id);
    }
    const lines = postalItems.slice(0, 2).map((content) => packageLine(content, 2));
    await repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      receiverTelegramUserId: 2n,
      now: now(),
      expiresAt: future()
    });
    await expect(repository.updatePostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      packageLines: lines,
      deliveryFeeGold: 0,
      now: now()
    })).resolves.toMatchObject({ state: "updated" });

    const confirmed = await repository.confirmPostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      itemContents: postalItems,
      now: now(),
      expiresAt: future(),
      result: { kind: "postal-test-no-gold" }
    });

    expect(confirmed.state).toBe("insufficient-gold");
    await expect(prisma.character.findUnique({ where: { id: "sender" } })).resolves.toMatchObject({ gold: 1 });
    await expect(prisma.itemTransfer.findUnique({ where: { token: "postal-token-1" } }))
      .resolves.toMatchObject({ status: "draft", reservationKey: null });
    for (const content of postalItems.slice(0, 2)) {
      await expectItemQuantity("sender", content.id, 5);
      await expectItemQuantity("receiver", content.id, 0);
    }
  });

  it("does not move a partial postal package when one line becomes stale", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await prisma.character.update({ where: { id: "sender" }, data: { gold: 100 } });
    await seedCompletedRelationship();
    for (const content of postalItems.slice(0, 2)) {
      await seedItem("sender", 3, content.id);
    }
    const lines = postalItems.slice(0, 2).map((content) => packageLine(content, 2));
    await createPostal(lines);
    const staleContents = postalItems.map((content, index) => index === 1
      ? { ...content, name: `${content.name} stale` }
      : content);

    const accepted = await repository.acceptPostalForTelegramUser(2n, {
      token: "postal-token-1",
      itemContents: staleContents,
      now: now(),
      result: { kind: "postal-test-stale" }
    });

    expect(accepted.state).toBe("stale-selection");
    await expect(prisma.character.findUnique({ where: { id: "sender" } })).resolves.toMatchObject({ gold: 93 });
    await expectItemQuantity("sender", postalItems[0]!.id, 1);
    await expectItemQuantity("sender", postalItems[1]!.id, 1);
    await expectItemQuantity("receiver", postalItems[0]!.id, 0);
    await expectItemQuantity("receiver", postalItems[1]!.id, 0);
  });

  it("lets the sender cancel a postal draft without moving items or charging the fee", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await prisma.character.update({ where: { id: "sender" }, data: { gold: 100 } });
    await seedCompletedRelationship();
    await seedItem("sender", 5, postalItems[0]!.id);

    await expect(repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      receiverTelegramUserId: 2n,
      now: now(),
      expiresAt: future()
    })).resolves.toMatchObject({ state: "created", transfer: { status: "draft" } });
    await expect(repository.updatePostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      packageLines: [packageLine(postalItems[0]!, 2)],
      deliveryFeeGold: 6,
      now: now()
    })).resolves.toMatchObject({ state: "updated" });
    await expect(prisma.itemTransfer.findUnique({ where: { token: "postal-token-1" } }))
      .resolves.toMatchObject({ transferKind: "postal", status: "draft" });

    const cancelled = await repository.cancelPostalForTelegramUser(1n, "postal-token-1", now());
    expect(cancelled).toMatchObject({
      state: "cancelled",
      transitioned: true,
      transfer: { status: "cancelled" }
    });

    const row = await prisma.itemTransfer.findUniqueOrThrow({ where: { token: "postal-token-1" } });
    expect(row).toMatchObject({
      status: "cancelled",
      reservationKey: null,
      resultJson: { kind: "cancelled" }
    });
    await expect(prisma.character.findUnique({ where: { id: "sender" } })).resolves.toMatchObject({ gold: 100 });
    await expectItemQuantity("sender", postalItems[0]!.id, 5);
    await expectItemQuantity("receiver", postalItems[0]!.id, 0);

    const replay = await repository.cancelPostalForTelegramUser(1n, "postal-token-1", now());
    expect(replay).toMatchObject({ state: "cancelled", transfer: { status: "cancelled" } });
    expect(replay).not.toHaveProperty("transitioned");
  });

  it("keeps postal draft cancellation sender-only", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedCompletedRelationship();

    await expect(repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      receiverTelegramUserId: 2n,
      now: now(),
      expiresAt: future()
    })).resolves.toMatchObject({ state: "created", transfer: { status: "draft" } });

    await expect(repository.cancelPostalForTelegramUser(2n, "postal-token-1", now()))
      .resolves.toMatchObject({ state: "not-sender" });
    await expect(prisma.itemTransfer.findUnique({ where: { token: "postal-token-1" } }))
      .resolves.toMatchObject({ status: "draft", reservationKey: null });
  });

  it("still lets the sender cancel a pending postal package and releases the live reservation", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedCompletedRelationship();
    await seedItem("sender", 5, postalItems[0]!.id);
    await createPostal([packageLine(postalItems[0]!, 2)]);

    await expect(prisma.itemTransfer.findUnique({ where: { token: "postal-token-1" } }))
      .resolves.toMatchObject({ status: "pending", reservationKey: "postal:sender" });
    await expectItemQuantity("sender", postalItems[0]!.id, 3);
    await expectItemQuantity("receiver", postalItems[0]!.id, 0);

    const cancelled = await repository.cancelPostalForTelegramUser(1n, "postal-token-1", new Date("2026-06-24T10:24:00.000Z"));
    expect(cancelled).toMatchObject({ state: "cancelled", transitioned: true });
    await expect(prisma.itemTransfer.findUnique({ where: { token: "postal-token-1" } }))
      .resolves.toMatchObject({ status: "cancelled", reservationKey: null });

    const replay = await repository.cancelPostalForTelegramUser(1n, "postal-token-1", now());
    expect(replay).toMatchObject({ state: "cancelled", transfer: { status: "cancelled" } });
    expect(replay).not.toHaveProperty("transitioned");
    await expect(prisma.character.findUnique({ where: { id: "sender" } })).resolves.toMatchObject({ gold: 4 });
    await expectItemQuantity("sender", postalItems[0]!.id, 5);
    await expectItemQuantity("receiver", postalItems[0]!.id, 0);
  });

  it("returns a pending postal package to the sender when it expires", async () => {
    await seedCharacter(1n, "sender", "Дарувальник");
    await seedCharacter(2n, "receiver", "Отримувач");
    await seedCompletedRelationship();
    await seedItem("sender", 5, postalItems[0]!.id);
    await createPostal([packageLine(postalItems[0]!, 2)]);

    const expired = await repository.acceptPostalForTelegramUser(2n, {
      token: "postal-token-1",
      itemContents: postalItems,
      now: new Date("2026-06-24T10:24:00.000Z"),
      result: { kind: "postal-test-expired-accept" }
    });

    expect(expired).toMatchObject({ state: "expired", transitioned: true });
    await expect(prisma.itemTransfer.findUnique({ where: { token: "postal-token-1" } }))
      .resolves.toMatchObject({ status: "expired", reservationKey: null });
    await expectItemQuantity("sender", postalItems[0]!.id, 5);
    await expectItemQuantity("receiver", postalItems[0]!.id, 0);
  });

  function createGift(token = "gift-token-1", expiresAt = future()) {
    return repository.createGiftForTelegramUser(1n, {
      token,
      receiverTelegramUserId: 2n,
      item,
      itemFingerprint: createItemGiftFingerprint(item),
      now: now(),
      expiresAt
    });
  }

  async function createPostal(lines: ReturnType<typeof packageLine>[]) {
    await repository.createPostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      receiverTelegramUserId: 2n,
      now: now(),
      expiresAt: future()
    });
    await expect(repository.updatePostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      packageLines: lines,
      deliveryFeeGold: 0,
      now: now()
    })).resolves.toMatchObject({ state: "updated" });
    await expect(repository.confirmPostalDraftForTelegramUser(1n, {
      token: "postal-token-1",
      itemContents: postalItems,
      now: now(),
      expiresAt: future(),
      result: { kind: "postal-test-pending" }
    })).resolves.toMatchObject({ state: "created" });
  }

  function acceptGift(result: unknown) {
    return repository.acceptGiftForTelegramUser(2n, {
      token: "gift-token-1",
      itemContents: [item],
      now: now(),
      result
    });
  }

  async function getFinalTransfer() {
    const transfer = await prisma.itemTransfer.findUniqueOrThrow({ where: { token: "gift-token-1" } });
    expect(["completed", "declined", "cancelled", "expired"]).toContain(transfer.status);
    return transfer;
  }

  async function expectFinalTransfer(status: string) {
    const transfer = await prisma.itemTransfer.findUniqueOrThrow({ where: { token: "gift-token-1" } });
    expect(transfer.status).toBe(status);
  }

  async function installTerminalRaceTrigger(requestedStatus: string, canonicalStatus: string) {
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER item_transfer_terminal_race
      BEFORE UPDATE OF status ON item_transfers
      WHEN OLD.token = 'gift-token-1' AND NEW.status = '${requestedStatus}'
      BEGIN
        UPDATE item_transfers
        SET status = '${canonicalStatus}',
            result_json = '{"kind":"forced-terminal-race"}',
            completed_at = CASE WHEN '${canonicalStatus}' = 'completed' THEN NEW.updated_at ELSE completed_at END,
            responded_at = CASE WHEN '${canonicalStatus}' <> 'completed' THEN NEW.updated_at ELSE responded_at END,
            updated_at = NEW.updated_at
        WHERE id = OLD.id;
        SELECT RAISE(IGNORE);
      END
    `);
  }

  async function seedCharacter(telegramUserId: bigint, characterId: string, name: string) {
    await prisma.user.create({
      data: {
        id: `user-${characterId}`,
        telegramUserId,
        displayName: name,
        lastSeenLocationId: "location.korchma.bar"
      }
    });
    await prisma.character.create({
      data: {
        id: characterId,
        userId: `user-${characterId}`,
        name,
        pronoun: "they",
        path: "boundary",
        raceId: "race.human",
        classId: "class.ranger",
        level: 4,
        xp: 300,
        gold: 10,
        hpCurrent: 25,
        hpMax: 25,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: { strength: 1, dexterity: 1, intelligence: 1, charisma: 1, luck: 1 }
      }
    });
  }

  async function seedItem(characterId: string, quantity: number, itemId = item.id) {
    await prisma.characterItem.create({
      data: {
        characterId,
        itemId,
        quantity
      }
    });
  }

  async function seedCompletedRelationship() {
    await prisma.itemTransfer.create({
      data: {
        token: `relationship-${Date.now()}-${Math.random()}`,
        transferKind: "gift",
        senderCharacterId: "sender",
        receiverCharacterId: "receiver",
        senderTelegramUserId: 1n,
        receiverTelegramUserId: 2n,
        senderName: "Дарувальник",
        receiverName: "Отримувач",
        senderRemortCount: 0,
        receiverRemortCount: 0,
        locationId: "location.korchma.bar",
        itemId: item.id,
        itemName: item.name,
        itemFingerprint: createItemGiftFingerprint(item),
        quantity: 1,
        status: "completed",
        resultJson: { kind: "seed-relationship" },
        expiresAt: future(),
        completedAt: now(),
        updatedAt: now()
      }
    });
  }

  async function seedDuelRelationship(challengerCharacterId: string, targetCharacterId: string) {
    await prisma.duelChallenge.create({
      data: {
        challengerCharacterId,
        targetCharacterId,
        inviteToken: `duel-${challengerCharacterId}-${targetCharacterId}`,
        mode: "quick",
        status: "resolved",
        expiresAt: future(),
        resolvedAt: now(),
        resultJson: { kind: "test-duel" },
        updatedAt: now()
      }
    });
  }

  async function seedBardPerformanceReaction(input: {
    performanceId: string;
    performerId: string;
    audienceId: string;
    audienceTelegramUserId: bigint;
    status: "offered" | "applauded" | "tipped";
  }) {
    await prisma.bardPerformance.create({
      data: {
        id: input.performanceId,
        token: `${input.performanceId}-token`,
        characterId: input.performerId,
        telegramUserId: input.performerId === "sender" ? 1n : 4n,
        performerName: input.performerId,
        remortCount: 0,
        techniqueId: "technique.class.bard.shynok-performance",
        rulesVersion: "test",
        locationId: "location.korchma.bar",
        localDate: "12026-06-24",
        status: "completed",
        grade: "modest",
        power: 13,
        housePayoutGold: 0,
        roleActionXp: 0,
        audienceCount: 1,
        statSnapshotJson: { charisma: 1, luck: 1 },
        startedAt: now(),
        expiresAt: future(),
        cooldownAvailableAt: future(),
        completedAt: now(),
        updatedAt: now()
      }
    });
    await prisma.bardPerformanceReaction.create({
      data: {
        id: `${input.performanceId}-reaction`,
        performanceId: input.performanceId,
        characterId: input.audienceId,
        telegramUserId: input.audienceTelegramUserId,
        audienceName: input.audienceId,
        remortCount: 0,
        status: input.status,
        tipGold: input.status === "tipped" ? 5 : 0,
        resultJson: input.status === "offered" ? undefined : { action: input.status },
        offeredAt: now(),
        expiresAt: future(),
        respondedAt: input.status === "offered" ? undefined : now(),
        updatedAt: now()
      }
    });
  }

  async function expectQuantities(expected: { sender: number; receiver: number }) {
    const rows = await prisma.characterItem.findMany({
      where: { itemId: item.id },
      orderBy: { characterId: "asc" }
    });
    const quantities = Object.fromEntries(rows.map((row) => [row.characterId, row.quantity]));
    expect(quantities.sender ?? 0).toBe(expected.sender);
    expect(quantities.receiver ?? 0).toBe(expected.receiver);
  }

  async function expectItemQuantity(characterId: string, itemId: string, quantity: number) {
    const row = await prisma.characterItem.findUnique({
      where: { characterId_itemId: { characterId, itemId } }
    });
    expect(row?.quantity ?? 0).toBe(quantity);
  }
});

function packageLine(content: ItemContent, quantity: number) {
  return {
    itemId: content.id,
    itemName: content.name,
    quantity,
    itemFingerprint: createItemGiftFingerprint(content),
    unitGoldValue: content.goldValue ?? 0,
    observedQuantity: 93,
    tags: [...(content.tags ?? [])].sort()
  };
}

function now(): Date {
  return new Date("2026-06-24T10:00:00.000Z");
}

function future(): Date {
  return new Date("2026-06-24T10:23:00.000Z");
}

function past(): Date {
  return new Date("2026-06-24T09:59:00.000Z");
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
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_items_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "character_items_character_id_item_id_key" ON "character_items"("character_id", "item_id")`,
    `CREATE TABLE "character_equipment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "slot" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_equipment_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "character_equipment_character_id_slot_key" ON "character_equipment"("character_id", "slot")`,
    `CREATE TABLE "active_combat_leases" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL UNIQUE,
      "kind" TEXT NOT NULL,
      "reference_id" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "active_combat_leases_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE "character_remorts" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "remort_number" INTEGER NOT NULL,
      "previous_name" TEXT NOT NULL,
      "previous_level" INTEGER NOT NULL,
      "previous_xp" INTEGER NOT NULL,
      "preserved_payload_json" JSONB NOT NULL,
      "completed_at" DATETIME NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_remorts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE "bard_performances" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "token" TEXT NOT NULL UNIQUE,
      "character_id" TEXT NOT NULL,
      "telegram_user_id" BIGINT NOT NULL,
      "performer_name" TEXT NOT NULL,
      "remort_count" INTEGER NOT NULL DEFAULT 0,
      "technique_id" TEXT NOT NULL,
      "rules_version" TEXT NOT NULL,
      "location_id" TEXT NOT NULL,
      "local_date" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'active',
      "live_guard" TEXT UNIQUE,
      "grade" TEXT NOT NULL,
      "power" INTEGER NOT NULL,
      "house_payout_gold" INTEGER NOT NULL DEFAULT 0,
      "role_action_xp" INTEGER NOT NULL DEFAULT 0,
      "audience_count" INTEGER NOT NULL DEFAULT 0,
      "stat_snapshot_json" JSONB NOT NULL,
      "result_json" JSONB,
      "started_at" DATETIME NOT NULL,
      "expires_at" DATETIME NOT NULL,
      "cooldown_available_at" DATETIME NOT NULL,
      "completed_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "bard_performance_reactions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "performance_id" TEXT NOT NULL,
      "character_id" TEXT NOT NULL,
      "telegram_user_id" BIGINT NOT NULL,
      "audience_name" TEXT NOT NULL,
      "remort_count" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'offered',
      "tip_gold" INTEGER NOT NULL DEFAULT 0,
      "result_json" JSONB,
      "offered_at" DATETIME NOT NULL,
      "expires_at" DATETIME NOT NULL,
      "responded_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX "bard_performance_reactions_performance_id_character_id_key" ON "bard_performance_reactions"("performance_id", "character_id")`,
    `CREATE TABLE "duel_challenges" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "challenger_character_id" TEXT NOT NULL,
      "target_character_id" TEXT,
      "context_chat_id" BIGINT,
      "invite_token" TEXT NOT NULL UNIQUE,
      "mode" TEXT NOT NULL DEFAULT 'quick',
      "status" TEXT NOT NULL DEFAULT 'pending',
      "expires_at" DATETIME NOT NULL,
      "resolved_at" DATETIME,
      "result_json" JSONB,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
