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
    await prisma.characterDrinkState.deleteMany();
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

  it("previews restore-to-full without consuming bandages", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);

    await expect(restoreToFull("restore-token-preview")).resolves.toMatchObject({
      state: "preview-created",
      neededQuantity: 2,
      availableQuantity: 3,
      order: {
        quantity: 2,
        preview: {
          mode: "restore-to-full",
          hpBefore: 30,
          hpMax: 41,
          healAmount: 11,
          hpAfter: 41
        }
      }
    });
    await expectBandageQuantity(3);
    await expectCharacterHp(30);
    expect(await prisma.itemUseOrder.count()).toBe(1);
  });

  it("confirms restore-to-full once and replays the canonical result", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);
    await restoreToFull("restore-token-confirm");

    const first = await repository.confirmForTelegramUser(telegramUserId, {
      token: "restore-token-confirm",
      itemContents: items,
      now: now()
    });
    const replay = await new PrismaItemUseRepository(prisma).confirmForTelegramUser(telegramUserId, {
      token: "restore-token-confirm",
      itemContents: items,
      now: now()
    });

    expect(first).toMatchObject({
      state: "used",
      order: {
        quantity: 2,
        result: {
          kind: "heal-hp",
          hpBefore: 30,
          hpMax: 41,
          healAmount: 11,
          hpAfter: 41
        }
      }
    });
    expect(replay).toMatchObject({
      state: "replayed",
      order: {
        quantity: 2,
        result: {
          kind: "heal-hp",
          hpBefore: 30,
          hpMax: 41,
          healAmount: 11,
          hpAfter: 41
        }
      }
    });
    await expectBandageQuantity(1);
    await expectCharacterHp(41);
  });

  it("does not spend partial bandages when restore-to-full no longer has enough", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(1);

    await expect(restoreToFull("restore-token-not-enough")).resolves.toMatchObject({
      state: "not-enough",
      neededQuantity: 2,
      availableQuantity: 1
    });
    await expectBandageQuantity(1);
    await expectCharacterHp(30);
  });

  it("cancels restore-to-full before confirmation without consuming", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);
    await restoreToFull("restore-token-cancel");

    await expect(repository.cancelForTelegramUser(telegramUserId, {
      token: "restore-token-cancel",
      now: now()
    })).resolves.toMatchObject({ state: "cancelled" });
    await expect(repository.confirmForTelegramUser(telegramUserId, {
      token: "restore-token-cancel",
      itemContents: items,
      now: now()
    })).resolves.toMatchObject({ state: "cancelled" });
    await expectBandageQuantity(3);
    await expectCharacterHp(30);
  });

  it("expires restore-to-full before confirmation without consuming", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);
    await restoreToFull("restore-token-expire");

    const late = new Date("2026-06-25T09:24:00.000Z");
    await expect(repository.cancelForTelegramUser(telegramUserId, {
      token: "restore-token-expire",
      now: late
    })).resolves.toMatchObject({ state: "expired" });
    await expect(repository.confirmForTelegramUser(telegramUserId, {
      token: "restore-token-expire",
      itemContents: items,
      now: late
    })).resolves.toMatchObject({ state: "expired" });
    await expectBandageQuantity(3);
    await expectCharacterHp(30);
  });

  it("canonicalizes a restore-to-full confirm-vs-cancel race", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);
    await restoreToFull("restore-token-confirm-cancel-race");

    const [confirm, cancel] = await Promise.all([
      repository.confirmForTelegramUser(telegramUserId, {
        token: "restore-token-confirm-cancel-race",
        itemContents: items,
        now: now()
      }),
      repository.cancelForTelegramUser(telegramUserId, {
        token: "restore-token-confirm-cancel-race",
        now: now()
      })
    ]);
    const order = await readUseOrder("restore-token-confirm-cancel-race");

    expect(["completed", "cancelled"]).toContain(order.status);
    expect(order.reservationKey).toBeNull();
    if (order.status === "completed") {
      expect(["used", "replayed"]).toContain(confirm.state);
      expect(cancel.state).toBe("completed");
      await expectBandageQuantity(1);
      await expectCharacterHp(41);
    } else {
      expect(confirm.state).toBe("cancelled");
      expect(["cancelled", "replayed"]).toContain(cancel.state);
      await expectBandageQuantity(3);
      await expectCharacterHp(30);
    }
  });

  it("canonicalizes a restore-to-full confirm-vs-expiry race", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);
    await restoreToFull("restore-token-confirm-expiry-race");

    const [confirm, expiry] = await Promise.all([
      repository.confirmForTelegramUser(telegramUserId, {
        token: "restore-token-confirm-expiry-race",
        itemContents: items,
        now: now()
      }),
      repository.cancelForTelegramUser(telegramUserId, {
        token: "restore-token-confirm-expiry-race",
        now: new Date("2026-06-25T09:24:00.000Z")
      })
    ]);
    const order = await readUseOrder("restore-token-confirm-expiry-race");

    expect(["completed", "expired"]).toContain(order.status);
    expect(order.reservationKey).toBeNull();
    if (order.status === "completed") {
      expect(["used", "replayed"]).toContain(confirm.state);
      expect(expiry.state).toBe("completed");
      await expectBandageQuantity(1);
      await expectCharacterHp(41);
    } else {
      expect(confirm.state).toBe("expired");
      expect(expiry.state).toBe("expired");
      await expectBandageQuantity(3);
      await expectCharacterHp(30);
    }
  });

  it("stales restore-to-full if current HP needs a different frozen quantity", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);
    await restoreToFull("restore-token-stale-hp");
    await prisma.character.update({
      where: { id: characterId },
      data: { hpCurrent: 37 }
    });

    await expect(repository.confirmForTelegramUser(telegramUserId, {
      token: "restore-token-stale-hp",
      itemContents: items,
      now: now()
    })).resolves.toMatchObject({
      state: "stale-selection",
      order: {
        status: "expired"
      }
    });
    const order = await readUseOrder("restore-token-stale-hp");
    expect(order.reservationKey).toBeNull();
    await expectBandageQuantity(3);
    await expectCharacterHp(37);
  });

  it("stores full-HP restore result when passive recovery reaches max before confirm", async () => {
    await seedCharacter({ hpCurrent: 40, hpMax: 25, hpRegenAt: now() });
    await seedBandages(2);
    await restoreToFull("restore-token-passive-full");
    await prisma.itemUseOrder.update({
      where: { token: "restore-token-passive-full" },
      data: { expiresAt: new Date("2026-06-25T12:00:00.000Z") }
    });

    const confirmAt = new Date("2026-06-25T11:00:00.000Z");
    const first = await repository.confirmForTelegramUser(telegramUserId, {
      token: "restore-token-passive-full",
      itemContents: items,
      now: confirmAt
    });
    const replay = await new PrismaItemUseRepository(prisma).confirmForTelegramUser(telegramUserId, {
      token: "restore-token-passive-full",
      itemContents: items,
      now: confirmAt
    });

    expect(first).toMatchObject({
      state: "full-hp",
      order: {
        result: {
          kind: "full-hp",
          hpBefore: 41,
          hpMax: 41,
          healAmount: 0,
          hpAfter: 41
        }
      }
    });
    expect(replay).toMatchObject({ state: "full-hp" });
    await expectBandageQuantity(2);
    await expectCharacterHp(41);
  });

  it("fails restore-to-full safely after remort changes the character life", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);
    await restoreToFull("restore-token-remort");
    await seedRemort();

    await expect(repository.confirmForTelegramUser(telegramUserId, {
      token: "restore-token-remort",
      itemContents: items,
      now: now()
    })).resolves.toMatchObject({
      state: "stale-selection",
      order: {
        status: "expired"
      }
    });
    await expectBandageQuantity(3);
    await expectCharacterHp(30);
  });

  it("blocks restore-to-full while the same item is reserved by another use order", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);
    await createPreview("use-token-reserves-restore");

    await expect(restoreToFull("restore-token-reserved-by-use")).resolves.toMatchObject({
      state: "reserved"
    });
    await expectBandageQuantity(3);
    await expectCharacterHp(30);
  });

  it("lets ordinary healing replace a pending restore-to-full preview", async () => {
    await seedCharacter({ hpCurrent: 0, hpMax: 31 });
    await seedBandages(7);
    await restoreToFull("restore-token-replaced-by-use");

    await expect(createPreview("use-token-replaces-restore")).resolves.toMatchObject({
      state: "preview-created",
      order: {
        token: "use-token-replaces-restore",
        quantity: 1,
        preview: {
          hpBefore: 0,
          hpAfter: 7
        }
      }
    });

    const oldOrder = await readUseOrder("restore-token-replaced-by-use");
    expect(oldOrder.status).toBe("cancelled");
    expect(oldOrder.reservationKey).toBeNull();
    await expectBandageQuantity(7);
    await expectCharacterHp(0);
  });

  it("blocks restore-to-full for equipped items", async () => {
    await seedCharacter({ hpCurrent: 30, hpMax: 25 });
    await seedBandages(3);
    await prisma.characterEquipment.create({
      data: {
        id: "equipment-restore-reserved",
        characterId,
        slot: "trinket",
        itemId: bandage.id
      }
    });

    await expect(restoreToFull("restore-token-equipped")).resolves.toMatchObject({
      state: "reserved"
    });
    await expectBandageQuantity(3);
    await expectCharacterHp(30);
  });

  it("preserves fractional mana recovery markers when a HP bandage leaves HP below max", async () => {
    const marker = new Date(now().getTime() - 1_000);
    await seedCharacter({ hpCurrent: 10, hpMax: 25, manaCurrent: 5, hpRegenAt: marker, manaRegenAt: marker });
    await seedBandages(1);
    await createPreview("use-token-fractional");

    await expect(repository.confirmForTelegramUser(telegramUserId, {
      token: "use-token-fractional",
      itemContents: items,
      now: now()
    })).resolves.toMatchObject({
      state: "used",
      order: {
        result: {
          hpAfter: 17
        }
      }
    });

    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(character.manaCurrent).toBe(5);
    expect(character.manaRegenAt).toEqual(marker);
    expect(character.hpRegenAt).toEqual(marker);
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

  it("canonicalizes a real concurrent confirm-vs-cancel race", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);
    await createPreview("use-token-confirm-cancel-race");

    const [confirm, cancel] = await Promise.all([
      repository.confirmForTelegramUser(telegramUserId, {
        token: "use-token-confirm-cancel-race",
        itemContents: items,
        now: now()
      }),
      repository.cancelForTelegramUser(telegramUserId, {
        token: "use-token-confirm-cancel-race",
        now: now()
      })
    ]);
    const order = await readUseOrder("use-token-confirm-cancel-race");

    expect(await prisma.itemUseOrder.count({ where: { token: "use-token-confirm-cancel-race" } })).toBe(1);
    expect(["completed", "cancelled"]).toContain(order.status);
    expect(order.reservationKey).toBeNull();
    if (order.status === "completed") {
      expect(["used", "replayed"]).toContain(confirm.state);
      expect(cancel.state).toBe("completed");
      await expectBandageQuantity(0);
      await expectCharacterHp(17);
    } else {
      expect(confirm.state).toBe("cancelled");
      expect(["cancelled", "replayed"]).toContain(cancel.state);
      await expectBandageQuantity(1);
      await expectCharacterHp(10);
    }
  });

  it("canonicalizes a real concurrent confirm-vs-expiry race", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);
    await createPreview("use-token-confirm-expiry-race");

    const [confirm, expiry] = await Promise.all([
      repository.confirmForTelegramUser(telegramUserId, {
        token: "use-token-confirm-expiry-race",
        itemContents: items,
        now: now()
      }),
      repository.cancelForTelegramUser(telegramUserId, {
        token: "use-token-confirm-expiry-race",
        now: new Date("2026-06-25T09:24:00.000Z")
      })
    ]);
    const order = await readUseOrder("use-token-confirm-expiry-race");

    expect(["completed", "expired"]).toContain(order.status);
    expect(order.reservationKey).toBeNull();
    if (order.status === "completed") {
      expect(["used", "replayed"]).toContain(confirm.state);
      expect(expiry.state).toBe("completed");
      await expectBandageQuantity(0);
      await expectCharacterHp(17);
    } else {
      expect(confirm.state).toBe("expired");
      expect(expiry.state).toBe("expired");
      await expectBandageQuantity(1);
      await expectCharacterHp(10);
    }
  });

  it("canonicalizes a real concurrent cancel-vs-expiry race", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);
    await createPreview("use-token-cancel-expiry-race");

    const [cancel, expiry] = await Promise.all([
      repository.cancelForTelegramUser(telegramUserId, {
        token: "use-token-cancel-expiry-race",
        now: now()
      }),
      repository.cancelForTelegramUser(telegramUserId, {
        token: "use-token-cancel-expiry-race",
        now: new Date("2026-06-25T09:24:00.000Z")
      })
    ]);
    const order = await readUseOrder("use-token-cancel-expiry-race");

    expect(["cancelled", "expired"]).toContain(order.status);
    expect(order.reservationKey).toBeNull();
    if (order.status === "cancelled") {
      expect(["cancelled", "replayed"]).toContain(cancel.state);
      expect(["cancelled", "replayed"]).toContain(expiry.state);
    } else {
      expect(cancel.state).toBe("expired");
      expect(expiry.state).toBe("expired");
    }
    await expectBandageQuantity(1);
    await expectCharacterHp(10);
  });

  it("refreshes a replayed live preview with the current recovery snapshot", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);

    await expect(createPreview("use-token-refresh-1")).resolves.toMatchObject({
      state: "preview-created",
      order: {
        preview: {
          hpBefore: 10,
          hpAfter: 17
        }
      }
    });
    await prisma.character.update({
      where: { id: characterId },
      data: { hpCurrent: 14 }
    });

    await expect(createPreview("use-token-refresh-2")).resolves.toMatchObject({
      state: "preview-replayed",
      order: {
        token: "use-token-refresh-1",
        preview: {
          hpBefore: 14,
          hpAfter: 21
        }
      }
    });
  });

  it("recovers the canonical live preview after duplicate preview reservation races", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);

    const results = await Promise.all([
      createPreview("use-token-race-1"),
      createPreview("use-token-race-2")
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["preview-created", "preview-replayed"]);
    expect(await prisma.itemUseOrder.count()).toBe(1);
    const order = await prisma.itemUseOrder.findFirstOrThrow();
    expect(order.status).toBe("pending");
    expect(order.reservationKey).toBe(`use:${characterId}:${bandage.id}`);
  });

  it("recovers the canonical restore-to-full preview after duplicate reservation races", async () => {
    await seedCharacter({ hpCurrent: 20, hpMax: 25 });
    await seedBandages(3);

    const results = await Promise.all([
      restoreToFull("restore-token-race-1"),
      restoreToFull("restore-token-race-2")
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["preview-created", "preview-replayed"]);
    expect(await prisma.itemUseOrder.count()).toBe(1);
    const order = await prisma.itemUseOrder.findFirstOrThrow();
    expect(order.status).toBe("pending");
    expect(order.quantity).toBe(3);
    expect(order.reservationKey).toBe(`use:${characterId}:${bandage.id}`);
  });

  it("does not replay a live preview after the stack becomes reserved by equipment", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);
    await createPreview("use-token-refresh-reserved");
    await prisma.characterEquipment.create({
      data: {
        id: "equipment-refresh-reserved",
        characterId,
        slot: "trinket",
        itemId: bandage.id
      }
    });

    await expect(createPreview("use-token-refresh-reserved-2")).resolves.toMatchObject({
      state: "reserved"
    });
    const order = await readUseOrder("use-token-refresh-reserved");
    expect(order.status).toBe("expired");
    expect(order.reservationKey).toBeNull();
  });

  it("reports the canonical completed order when cancel races behind confirm", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);
    await createPreview("use-token-cancel-after-complete");
    await repository.confirmForTelegramUser(telegramUserId, {
      token: "use-token-cancel-after-complete",
      itemContents: items,
      now: now()
    });

    await expect(repository.cancelForTelegramUser(telegramUserId, {
      token: "use-token-cancel-after-complete",
      now: now()
    })).resolves.toMatchObject({
      state: "completed",
      order: {
        status: "completed",
        result: {
          kind: "heal-hp"
        }
      }
    });
    await expectBandageQuantity(0);
    await expectCharacterHp(17);
  });

  it("does not fabricate cancel or expiry for a processing order", async () => {
    await seedCharacter({ hpCurrent: 10, hpMax: 25 });
    await seedBandages(1);
    await createPreview("use-token-processing");
    await prisma.itemUseOrder.update({
      where: { token: "use-token-processing" },
      data: { status: "processing" }
    });

    await expect(repository.cancelForTelegramUser(telegramUserId, {
      token: "use-token-processing",
      now: new Date("2026-06-25T09:30:00.000Z")
    })).resolves.toMatchObject({
      state: "stale-selection",
      order: {
        status: "processing"
      }
    });
    await expect(repository.confirmForTelegramUser(telegramUserId, {
      token: "use-token-processing",
      itemContents: items,
      now: new Date("2026-06-25T09:30:00.000Z")
    })).resolves.toMatchObject({
      state: "stale-selection",
      order: {
        status: "processing"
      }
    });
    await expectBandageQuantity(1);
    await expectCharacterHp(10);
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

  it("stores and replays a full-HP terminal result after passive recovery reaches max before confirm", async () => {
    await seedCharacter({
      hpCurrent: 40,
      hpMax: 25,
      hpRegenAt: now()
    });
    await seedBandages(1);
    const preview = await createPreview("use-token-passive-full");
    expect(preview).toMatchObject({
      state: "preview-created",
      order: {
        preview: {
          hpBefore: 40,
          hpMax: 41,
          hpAfter: 41
        }
      }
    });
    await prisma.itemUseOrder.update({
      where: { token: "use-token-passive-full" },
      data: { expiresAt: new Date("2026-06-25T12:00:00.000Z") }
    });

    const confirmAt = new Date("2026-06-25T11:00:00.000Z");
    const first = await repository.confirmForTelegramUser(telegramUserId, {
      token: "use-token-passive-full",
      itemContents: items,
      now: confirmAt
    });
    const replay = await new PrismaItemUseRepository(prisma).confirmForTelegramUser(telegramUserId, {
      token: "use-token-passive-full",
      itemContents: items,
      now: confirmAt
    });
    const order = await readUseOrder("use-token-passive-full");

    expect(first).toMatchObject({
      state: "full-hp",
      order: {
        result: {
          kind: "full-hp",
          hpBefore: 41,
          hpMax: 41,
          healAmount: 0,
          hpAfter: 41
        }
      }
    });
    expect(replay).toMatchObject({
      state: "full-hp",
      order: {
        result: {
          kind: "full-hp",
          hpBefore: 41,
          hpMax: 41,
          healAmount: 0,
          hpAfter: 41
        }
      }
    });
    expect(order.status).toBe("completed");
    expect(order.reservationKey).toBeNull();
    await expectBandageQuantity(1);
    await expectCharacterHp(41);
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

  async function restoreToFull(token: string) {
    return repository.restoreToFullForTelegramUser(telegramUserId, {
      item: bandage,
      itemContents: items,
      itemFingerprint: createItemUseFingerprint(bandage),
      token,
      now: now(),
      expiresAt: future()
    });
  }

  async function seedCharacter(input: {
    hpCurrent: number;
    hpMax: number;
    manaCurrent?: number;
    hpRegenAt?: Date;
    manaRegenAt?: Date;
  }): Promise<void> {
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
        manaCurrent: input.manaCurrent ?? 10,
        manaMax: 10,
        hpRegenAt: input.hpRegenAt ?? now(),
        manaRegenAt: input.manaRegenAt ?? now(),
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

  async function seedRemort(): Promise<void> {
    await prisma.characterRemort.create({
      data: {
        id: "remort-1",
        characterId,
        token: "remort-token-1",
        remortNumber: 1,
        previousLevel: 4,
        previousXp: 70,
        previousGold: 0,
        displayNameSnapshot: "Тестовий Мандрівник",
        preservedPayloadJson: {}
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

  async function readUseOrder(token: string) {
    return prisma.itemUseOrder.findUniqueOrThrow({
      where: { token }
    });
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
    `CREATE TABLE "character_drink_states" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "activation_id" TEXT NOT NULL,
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
