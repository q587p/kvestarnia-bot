import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ItemContent } from "../../src/content/schema";
import { PrismaShynokRepository } from "../../src/db/repositories/prismaShynokRepository";
import {
  buildMantokSaleBasket,
  buildMantokSaleEligibleStacks,
  selectAllMantokSaleEligibleUnits
} from "../../src/domain/mantokSales";

describe("PrismaShynokRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaShynokRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-shynok-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaShynokRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.korchmaRoundRecipient.deleteMany();
    await prisma.korchmaRoundPurchase.deleteMany();
    await prisma.korchmaDrinkOrder.deleteMany();
    await prisma.korchmaMantokSale.deleteMany();
    await prisma.characterDrinkState.deleteMany();
    await prisma.characterItem.deleteMany();
    await prisma.characterEquipment.deleteMany();
    await prisma.mantokChestRun.deleteMany();
    await prisma.levelBarterExchange.deleteMany();
    await prisma.activeCombatLease.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("accepts a round offer directly when no current drink exists", async () => {
    await seedCharacter({ telegramUserId: 101n, userId: "user-buyer", characterId: "character-buyer", gold: 500 });
    await seedCharacter({ telegramUserId: 102n, userId: "user-recipient", characterId: "character-recipient" });
    await seedRoundOffer({
      purchaseId: "purchase-direct",
      offerId: "12345678-1234-4234-9234-000000000101",
      buyerCharacterId: "character-buyer",
      recipientCharacterId: "character-recipient",
      drinkKey: "drink.simple-beer"
    });

    const result = await repository.respondToRoundOfferForTelegramUser(102n, {
      offerId: "12345678-1234-4234-9234-000000000101",
      action: "accept",
      now: now(),
      result: { kind: "round-offer-accept" }
    });

    expect(result.state).toBe("accepted");
    await expect(prisma.korchmaRoundRecipient.findUnique({
      where: { id: "12345678-1234-4234-9234-000000000101" }
    })).resolves.toMatchObject({ status: "accepted" });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-recipient" }
    })).resolves.toMatchObject({ drinkKey: "drink.simple-beer", sourceType: "round" });
  });

  it.each([
    ["timed tea", "drink.thyme-tea"],
    ["timed beer", "drink.simple-beer"],
    ["queued pepper vodka", "drink.pepper-vodka"]
  ] as const)("requires replacement confirmation for a current %s", async (_label, currentDrinkKey) => {
    await seedCharacter({ telegramUserId: 201n, userId: "user-buyer", characterId: "character-buyer", gold: 500 });
    await seedCharacter({ telegramUserId: 202n, userId: "user-recipient", characterId: "character-recipient" });
    await seedCurrentDrink("character-recipient", "drink-state-current", currentDrinkKey);
    await seedRoundOffer({
      purchaseId: "purchase-preview",
      offerId: "12345678-1234-4234-9234-000000000202",
      buyerCharacterId: "character-buyer",
      recipientCharacterId: "character-recipient",
      drinkKey: "drink.fine-beer"
    });

    const result = await repository.respondToRoundOfferForTelegramUser(202n, {
      offerId: "12345678-1234-4234-9234-000000000202",
      action: "accept",
      now: now(),
      result: { kind: "round-offer-accept" }
    });

    expect(result.state).toBe("replacement-required");
  });

  it("previews replacement without mutating offer, drink, or telemetry", async () => {
    await seedCharacter({ telegramUserId: 301n, userId: "user-buyer", characterId: "character-buyer", gold: 500 });
    await seedCharacter({ telegramUserId: 302n, userId: "user-recipient", characterId: "character-recipient" });
    await seedCurrentDrink("character-recipient", "drink-state-preview", "drink.thyme-tea");
    await seedRoundOffer({
      purchaseId: "purchase-no-mutate",
      offerId: "12345678-1234-4234-9234-000000000302",
      buyerCharacterId: "character-buyer",
      recipientCharacterId: "character-recipient",
      drinkKey: "drink.simple-beer"
    });

    const result = await repository.respondToRoundOfferForTelegramUser(302n, {
      offerId: "12345678-1234-4234-9234-000000000302",
      action: "accept",
      now: now(),
      result: { kind: "round-offer-accept" }
    });

    expect(result.state).toBe("replacement-required");
    await expect(prisma.korchmaRoundRecipient.findUnique({
      where: { id: "12345678-1234-4234-9234-000000000302" }
    })).resolves.toMatchObject({ status: "offered", respondedAt: null });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-recipient" }
    })).resolves.toMatchObject({ id: "drink-state-preview", drinkKey: "drink.thyme-tea" });
    await expect(prisma.korchmaRoundPurchase.findUnique({
      where: { id: "purchase-no-mutate" }
    })).resolves.toMatchObject({
      telemetryJson: { snapshotCount: 1, acceptedCount: 0, declinedCount: 0, expiredCount: 0 }
    });
  });

  it("confirms replacement and replays duplicate final confirmations", async () => {
    await seedCharacter({ telegramUserId: 401n, userId: "user-buyer", characterId: "character-buyer", gold: 500 });
    await seedCharacter({ telegramUserId: 402n, userId: "user-recipient", characterId: "character-recipient" });
    await seedCurrentDrink("character-recipient", "drink-state-replace", "drink.thyme-tea");
    await seedRoundOffer({
      purchaseId: "purchase-replace",
      offerId: "12345678-1234-4234-9234-000000000402",
      buyerCharacterId: "character-buyer",
      recipientCharacterId: "character-recipient",
      drinkKey: "drink.fine-beer"
    });
    const preview = await repository.respondToRoundOfferForTelegramUser(402n, {
      offerId: "12345678-1234-4234-9234-000000000402",
      action: "accept",
      now: now(),
      result: { kind: "round-offer-accept" }
    });
    if (preview.state !== "replacement-required") {
      throw new Error(`Expected replacement preview, got ${preview.state}`);
    }

    const first = await repository.respondToRoundOfferForTelegramUser(402n, {
      offerId: "12345678-1234-4234-9234-000000000402",
      action: "confirm-replacement",
      replacementGuard: preview.replacementGuard,
      now: now(),
      result: { kind: "round-offer-confirm-replacement" }
    });
    const second = await repository.respondToRoundOfferForTelegramUser(402n, {
      offerId: "12345678-1234-4234-9234-000000000402",
      action: "confirm-replacement",
      replacementGuard: preview.replacementGuard,
      now: now(),
      result: { kind: "round-offer-confirm-replacement" }
    });

    expect(first.state).toBe("accepted");
    expect(second.state).toBe("replayed");
    await expect(prisma.characterDrinkState.count({
      where: { characterId: "character-recipient" }
    })).resolves.toBe(1);
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-recipient" }
    })).resolves.toMatchObject({ drinkKey: "drink.fine-beer", sourceId: "12345678-1234-4234-9234-000000000402" });
    await expect(prisma.korchmaRoundPurchase.findUnique({
      where: { id: "purchase-replace" }
    })).resolves.toMatchObject({
      telemetryJson: { snapshotCount: 1, acceptedCount: 1, declinedCount: 0, expiredCount: 0 }
    });
  });

  it("rejects stale replacement when the current drink changed after preview", async () => {
    await seedCharacter({ telegramUserId: 501n, userId: "user-buyer", characterId: "character-buyer", gold: 500 });
    await seedCharacter({ telegramUserId: 502n, userId: "user-recipient", characterId: "character-recipient" });
    await seedCurrentDrink("character-recipient", "drink-state-old", "drink.thyme-tea");
    await seedRoundOffer({
      purchaseId: "purchase-stale",
      offerId: "12345678-1234-4234-9234-000000000502",
      buyerCharacterId: "character-buyer",
      recipientCharacterId: "character-recipient",
      drinkKey: "drink.simple-beer"
    });
    const preview = await repository.respondToRoundOfferForTelegramUser(502n, {
      offerId: "12345678-1234-4234-9234-000000000502",
      action: "accept",
      now: now(),
      result: { kind: "round-offer-accept" }
    });
    if (preview.state !== "replacement-required") {
      throw new Error(`Expected replacement preview, got ${preview.state}`);
    }
    await prisma.characterDrinkState.delete({ where: { characterId: "character-recipient" } });
    await seedCurrentDrink("character-recipient", "drink-state-new", "drink.fine-beer");

    const result = await repository.respondToRoundOfferForTelegramUser(502n, {
      offerId: "12345678-1234-4234-9234-000000000502",
      action: "confirm-replacement",
      replacementGuard: preview.replacementGuard,
      now: now(),
      result: { kind: "round-offer-confirm-replacement" }
    });

    expect(result.state).toBe("stale-replacement");
    await expect(prisma.korchmaRoundRecipient.findUnique({
      where: { id: "12345678-1234-4234-9234-000000000502" }
    })).resolves.toMatchObject({ status: "offered" });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-recipient" }
    })).resolves.toMatchObject({ id: "drink-state-new", drinkKey: "drink.fine-beer" });
  });

  it("rejects stale replacement after a real upsert replacement reuses the drink row id", async () => {
    await seedCharacter({ telegramUserId: 511n, userId: "user-buyer-upsert", characterId: "character-buyer-upsert", gold: 500 });
    await seedCharacter({ telegramUserId: 512n, userId: "user-recipient-upsert", characterId: "character-recipient-upsert", gold: 100 });
    await seedCurrentDrink("character-recipient-upsert", "drink-state-upsert", "drink.thyme-tea");
    const original = await prisma.characterDrinkState.findUniqueOrThrow({
      where: { characterId: "character-recipient-upsert" }
    });
    await seedRoundOffer({
      purchaseId: "purchase-upsert-stale",
      offerId: "12345678-1234-4234-9234-000000000512",
      buyerCharacterId: "character-buyer-upsert",
      recipientCharacterId: "character-recipient-upsert",
      drinkKey: "drink.fine-beer"
    });
    const preview = await repository.respondToRoundOfferForTelegramUser(512n, {
      offerId: "12345678-1234-4234-9234-000000000512",
      action: "accept",
      now: now(),
      result: { kind: "round-offer-accept" }
    });
    if (preview.state !== "replacement-required") {
      throw new Error(`Expected replacement preview, got ${preview.state}`);
    }
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-upsert-replacement",
        token: "12345678-1234-4234-9234-000000000513",
        characterId: "character-recipient-upsert",
        drinkKey: "drink.simple-beer",
        priceGold: 13,
        status: "pending",
        replacementJson: replacementExpectation(original),
        expiresAt: new Date("2026-06-23T10:05:00.000Z")
      }
    });
    await expect(repository.confirmSelfDrinkOrderForTelegramUser(512n, {
      token: "12345678-1234-4234-9234-000000000513",
      now: new Date("2026-06-23T10:01:00.000Z"),
      result: { kind: "self-drink-confirm" }
    })).resolves.toMatchObject({ state: "completed" });

    const replaced = await prisma.characterDrinkState.findUniqueOrThrow({
      where: { characterId: "character-recipient-upsert" }
    });
    expect(replaced.id).toBe(original.id);
    expect(replaced.activationId).not.toBe(original.activationId);

    const result = await repository.respondToRoundOfferForTelegramUser(512n, {
      offerId: "12345678-1234-4234-9234-000000000512",
      action: "confirm-replacement",
      replacementGuard: preview.replacementGuard,
      now: new Date("2026-06-23T10:02:00.000Z"),
      result: { kind: "round-offer-confirm-replacement" }
    });

    expect(result.state).toBe("stale-replacement");
    await expect(prisma.korchmaRoundRecipient.findUnique({
      where: { id: "12345678-1234-4234-9234-000000000512" }
    })).resolves.toMatchObject({ status: "offered" });
  });

  it.each(["expired", "declined", "accepted"] as const)(
    "does not replace when offer became %s after preview",
    async (status) => {
      await seedCharacter({ telegramUserId: 601n, userId: "user-buyer", characterId: "character-buyer", gold: 500 });
      await seedCharacter({ telegramUserId: 602n, userId: "user-recipient", characterId: "character-recipient" });
      await seedCurrentDrink("character-recipient", "drink-state-offer-status", "drink.thyme-tea");
      await seedRoundOffer({
        purchaseId: "purchase-offer-status",
        offerId: "12345678-1234-4234-9234-000000000602",
        buyerCharacterId: "character-buyer",
        recipientCharacterId: "character-recipient",
        drinkKey: "drink.simple-beer"
      });
      const preview = await repository.respondToRoundOfferForTelegramUser(602n, {
        offerId: "12345678-1234-4234-9234-000000000602",
        action: "accept",
        now: now(),
        result: { kind: "round-offer-accept" }
      });
      if (preview.state !== "replacement-required") {
        throw new Error(`Expected replacement preview, got ${preview.state}`);
      }
      await prisma.korchmaRoundRecipient.update({
        where: { id: "12345678-1234-4234-9234-000000000602" },
        data: { status }
      });

      const result = await repository.respondToRoundOfferForTelegramUser(602n, {
        offerId: "12345678-1234-4234-9234-000000000602",
        action: "confirm-replacement",
        replacementGuard: preview.replacementGuard,
        now: now(),
        result: { kind: "round-offer-confirm-replacement" }
      });

      expect(result.state).toBe(status === "accepted" ? "replayed" : status);
      await expect(prisma.characterDrinkState.findUnique({
        where: { characterId: "character-recipient" }
      })).resolves.toMatchObject({ id: "drink-state-offer-status", drinkKey: "drink.thyme-tea" });
    }
  );

  it("charges one self drink order across duplicate confirmations", async () => {
    await seedCharacter({ telegramUserId: 701n, userId: "user-self", characterId: "character-self", gold: 100 });
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-self",
        token: "12345678-1234-4234-9234-000000000701",
        characterId: "character-self",
        drinkKey: "drink.thyme-tea",
        priceGold: 17,
        status: "pending",
        replacementJson: null,
        expiresAt: new Date("2026-06-23T10:05:00.000Z")
      }
    });

    const results = await Promise.all([
      repository.confirmSelfDrinkOrderForTelegramUser(701n, {
        token: "12345678-1234-4234-9234-000000000701",
        now: now(),
        result: { kind: "self-drink-confirm" }
      }),
      repository.confirmSelfDrinkOrderForTelegramUser(701n, {
        token: "12345678-1234-4234-9234-000000000701",
        now: now(),
        result: { kind: "self-drink-confirm" }
      })
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["completed", "replayed"]);
    await expect(prisma.character.findUnique({ where: { id: "character-self" } })).resolves.toMatchObject({ gold: 83 });
    await expect(prisma.characterDrinkState.count({ where: { characterId: "character-self" } })).resolves.toBe(1);
  });

  it("real upsert replacement preserves row id but changes activation id and clips old recovery", async () => {
    await seedCharacter({ telegramUserId: 712n, userId: "user-self-upsert", characterId: "character-self-upsert", gold: 100 });
    await seedCurrentDrink("character-self-upsert", "drink-state-self-upsert", "drink.fine-beer");
    const original = await prisma.characterDrinkState.findUniqueOrThrow({
      where: { characterId: "character-self-upsert" }
    });
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-self-upsert",
        token: "12345678-1234-4234-9234-000000000712",
        characterId: "character-self-upsert",
        drinkKey: "drink.simple-beer",
        priceGold: 13,
        status: "pending",
        replacementJson: replacementExpectation(original),
        expiresAt: new Date("2026-06-23T10:10:00.000Z")
      }
    });

    const result = await repository.confirmSelfDrinkOrderForTelegramUser(712n, {
      token: "12345678-1234-4234-9234-000000000712",
      now: new Date("2026-06-23T10:05:00.000Z"),
      result: { kind: "self-drink-confirm" }
    });

    expect(result.state).toBe("completed");
    const replaced = await prisma.characterDrinkState.findUniqueOrThrow({
      where: { characterId: "character-self-upsert" }
    });
    expect(replaced.id).toBe(original.id);
    expect(replaced.activationId).not.toBe(original.activationId);
    expect(replaced.metadataJson).toMatchObject({
      previousRecoveryWindows: [{
        drinkKey: "drink.fine-beer",
        startsAt: "2026-06-23T10:00:00.000Z",
        expiresAt: "2026-06-23T10:05:00.000Z"
      }]
    });
  });

  it("stale self preview expecting no drink fails when a drink appears", async () => {
    await seedCharacter({ telegramUserId: 713n, userId: "user-self-none-stale", characterId: "character-self-none-stale", gold: 100 });
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-self-none-stale",
        token: "12345678-1234-4234-9234-000000000713",
        characterId: "character-self-none-stale",
        drinkKey: "drink.thyme-tea",
        priceGold: 17,
        status: "pending",
        replacementJson: { expected: "none" },
        expiresAt: new Date("2026-06-23T10:05:00.000Z")
      }
    });
    await seedCurrentDrink("character-self-none-stale", "drink-state-none-stale", "drink.simple-beer");

    const result = await repository.confirmSelfDrinkOrderForTelegramUser(713n, {
      token: "12345678-1234-4234-9234-000000000713",
      now: now(),
      result: { kind: "self-drink-confirm" }
    });

    expect(result.state).toBe("replacement-changed");
    await expect(prisma.character.findUnique({
      where: { id: "character-self-none-stale" }
    })).resolves.toMatchObject({ gold: 100 });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-self-none-stale" }
    })).resolves.toMatchObject({ drinkKey: "drink.simple-beer" });
  });

  it("stale self preview expecting an activation fails after that activation is refreshed", async () => {
    await seedCharacter({ telegramUserId: 714n, userId: "user-self-activation-stale", characterId: "character-self-activation-stale", gold: 100 });
    await seedCurrentDrink("character-self-activation-stale", "drink-state-activation-stale", "drink.pepper-vodka");
    const original = await prisma.characterDrinkState.findUniqueOrThrow({
      where: { characterId: "character-self-activation-stale" }
    });
    await prisma.korchmaDrinkOrder.createMany({
      data: [
        {
          id: "order-self-old-preview",
          token: "12345678-1234-4234-9234-000000000714",
          characterId: "character-self-activation-stale",
          drinkKey: "drink.simple-beer",
          priceGold: 13,
          status: "pending",
          replacementJson: replacementExpectation(original),
          expiresAt: new Date("2026-06-23T10:10:00.000Z")
        },
        {
          id: "order-self-refresh-vodka",
          token: "12345678-1234-4234-9234-000000000715",
          characterId: "character-self-activation-stale",
          drinkKey: "drink.pepper-vodka",
          priceGold: 42,
          status: "pending",
          replacementJson: replacementExpectation(original),
          expiresAt: new Date("2026-06-23T10:10:00.000Z")
        }
      ]
    });
    await expect(repository.confirmSelfDrinkOrderForTelegramUser(714n, {
      token: "12345678-1234-4234-9234-000000000715",
      now: new Date("2026-06-23T10:01:00.000Z"),
      result: { kind: "self-drink-confirm" }
    })).resolves.toMatchObject({ state: "completed" });

    const refreshed = await prisma.characterDrinkState.findUniqueOrThrow({
      where: { characterId: "character-self-activation-stale" }
    });
    expect(refreshed.id).toBe(original.id);
    expect(refreshed.activationId).not.toBe(original.activationId);

    const stale = await repository.confirmSelfDrinkOrderForTelegramUser(714n, {
      token: "12345678-1234-4234-9234-000000000714",
      now: new Date("2026-06-23T10:02:00.000Z"),
      result: { kind: "self-drink-confirm" }
    });

    expect(stale.state).toBe("replacement-changed");
    await expect(prisma.character.findUnique({
      where: { id: "character-self-activation-stale" }
    })).resolves.toMatchObject({ gold: 58 });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-self-activation-stale" }
    })).resolves.toMatchObject({
      drinkKey: "drink.pepper-vodka",
      activationId: refreshed.activationId
    });
  });

  it("blocks old-life self drink orders without spending gold or activating a drink", async () => {
    await seedCharacter({ telegramUserId: 721n, userId: "user-self-old-life", characterId: "character-self-old-life", gold: 100 });
    const boundary = new Date("2026-06-23T10:00:00.000Z");
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-self-old-life",
        token: "12345678-1234-4234-9234-000000000721",
        characterId: "character-self-old-life",
        remortCount: 0,
        drinkKey: "drink.thyme-tea",
        priceGold: 17,
        status: "pending",
        replacementJson: { expected: "none" },
        expiresAt: new Date("2026-06-23T10:10:00.000Z"),
        createdAt: boundary,
        updatedAt: boundary
      }
    });
    await prisma.characterRemort.create({
      data: {
        id: "remort-self-old-life",
        characterId: "character-self-old-life",
        token: "remort-token-self-old-life",
        remortNumber: 1,
        previousLevel: 3,
        previousXp: 100,
        previousGold: 100,
        displayNameSnapshot: "character-self-old-life",
        preservedPayloadJson: {},
        createdAt: boundary
      }
    });

    const result = await repository.confirmSelfDrinkOrderForTelegramUser(721n, {
      token: "12345678-1234-4234-9234-000000000721",
      now: new Date("2026-06-23T10:01:00.000Z"),
      result: { kind: "self-drink-confirm" }
    });

    expect(result.state).toBe("invalid-token");
    await expect(prisma.character.findUnique({
      where: { id: "character-self-old-life" }
    })).resolves.toMatchObject({ gold: 100 });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-self-old-life" }
    })).resolves.toBeNull();
  });

  it("completed self order replays its original activation after later replacement", async () => {
    await seedCharacter({ telegramUserId: 716n, userId: "user-self-replay-activation", characterId: "character-self-replay-activation", gold: 100 });
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-self-replay-first",
        token: "12345678-1234-4234-9234-000000000716",
        characterId: "character-self-replay-activation",
        drinkKey: "drink.thyme-tea",
        priceGold: 17,
        status: "pending",
        replacementJson: { expected: "none" },
        expiresAt: new Date("2026-06-23T10:10:00.000Z")
      }
    });
    const first = await repository.confirmSelfDrinkOrderForTelegramUser(716n, {
      token: "12345678-1234-4234-9234-000000000716",
      now: now(),
      result: { kind: "self-drink-confirm" }
    });
    if (first.state !== "completed") {
      throw new Error(`Expected completed, got ${first.state}`);
    }
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-self-replay-second",
        token: "12345678-1234-4234-9234-000000000717",
        characterId: "character-self-replay-activation",
        drinkKey: "drink.simple-beer",
        priceGold: 13,
        status: "pending",
        replacementJson: replacementExpectation(await prisma.characterDrinkState.findUniqueOrThrow({
          where: { characterId: "character-self-replay-activation" }
        })),
        expiresAt: new Date("2026-06-23T10:10:00.000Z")
      }
    });
    await expect(repository.confirmSelfDrinkOrderForTelegramUser(716n, {
      token: "12345678-1234-4234-9234-000000000717",
      now: new Date("2026-06-23T10:01:00.000Z"),
      result: { kind: "self-drink-confirm" }
    })).resolves.toMatchObject({ state: "completed" });

    const replay = await repository.confirmSelfDrinkOrderForTelegramUser(716n, {
      token: "12345678-1234-4234-9234-000000000716",
      now: new Date("2026-06-23T10:02:00.000Z"),
      result: { kind: "self-drink-confirm" }
    });

    expect(replay.state).toBe("replayed");
    expect(replay.state === "replayed" ? replay.drink?.activationId : null).toBe(first.drink.activationId);
    expect(replay.state === "replayed" ? replay.drink?.drinkKey : null).toBe("drink.thyme-tea");
  });

  it("completed self order replay does not fall back to the live current drink", async () => {
    await seedCharacter({ telegramUserId: 717n, userId: "user-self-replay-live-fallback", characterId: "character-self-replay-live-fallback", gold: 100 });
    await seedCurrentDrink("character-self-replay-live-fallback", "drink-state-self-live-fallback", "drink.fine-beer");
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-self-replay-live-fallback",
        token: "12345678-1234-4234-9234-000000000727",
        characterId: "character-self-replay-live-fallback",
        drinkKey: "drink.thyme-tea",
        priceGold: 17,
        status: "completed",
        replacementJson: { expected: "none" },
        resultJson: { kind: "legacy-without-activation-snapshot" },
        completedAt: now(),
        expiresAt: new Date("2026-06-23T10:10:00.000Z")
      }
    });

    const replay = await repository.confirmSelfDrinkOrderForTelegramUser(717n, {
      token: "12345678-1234-4234-9234-000000000727",
      now: new Date("2026-06-23T10:02:00.000Z"),
      result: { kind: "self-drink-confirm" }
    });

    expect(replay.state).toBe("replayed");
    expect(replay.state === "replayed" ? replay.drink : "not-replayed").toBeNull();
  });

  it("completed round acceptance replays its original activation after later replacement", async () => {
    await seedCharacter({ telegramUserId: 718n, userId: "user-round-replay-buyer", characterId: "character-round-replay-buyer", gold: 500 });
    await seedCharacter({ telegramUserId: 719n, userId: "user-round-replay-recipient", characterId: "character-round-replay-recipient", gold: 100 });
    await seedRoundOffer({
      purchaseId: "purchase-round-replay",
      offerId: "12345678-1234-4234-9234-000000000719",
      buyerCharacterId: "character-round-replay-buyer",
      recipientCharacterId: "character-round-replay-recipient",
      drinkKey: "drink.simple-beer"
    });
    const accepted = await repository.respondToRoundOfferForTelegramUser(719n, {
      offerId: "12345678-1234-4234-9234-000000000719",
      action: "accept",
      now: now(),
      result: { kind: "round-offer-accept" }
    });
    if (accepted.state !== "accepted") {
      throw new Error(`Expected accepted, got ${accepted.state}`);
    }
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-round-replay-replace",
        token: "12345678-1234-4234-9234-000000000720",
        characterId: "character-round-replay-recipient",
        drinkKey: "drink.fine-beer",
        priceGold: 42,
        status: "pending",
        replacementJson: replacementExpectation(await prisma.characterDrinkState.findUniqueOrThrow({
          where: { characterId: "character-round-replay-recipient" }
        })),
        expiresAt: new Date("2026-06-23T10:10:00.000Z")
      }
    });
    await expect(repository.confirmSelfDrinkOrderForTelegramUser(719n, {
      token: "12345678-1234-4234-9234-000000000720",
      now: new Date("2026-06-23T10:01:00.000Z"),
      result: { kind: "self-drink-confirm" }
    })).resolves.toMatchObject({ state: "completed" });

    const replay = await repository.respondToRoundOfferForTelegramUser(719n, {
      offerId: "12345678-1234-4234-9234-000000000719",
      action: "accept",
      now: new Date("2026-06-23T10:02:00.000Z"),
      result: { kind: "round-offer-accept" }
    });

    expect(replay.state).toBe("replayed");
    expect(replay.state === "replayed" ? replay.drink?.activationId : null).toBe(accepted.drink.activationId);
    expect(replay.state === "replayed" ? replay.drink?.drinkKey : null).toBe("drink.simple-beer");
  });

  it("completed round acceptance replay does not fall back to the live current drink", async () => {
    await seedCharacter({ telegramUserId: 7221n, userId: "user-round-replay-live-buyer", characterId: "character-round-replay-live-buyer", gold: 500 });
    await seedCharacter({ telegramUserId: 7222n, userId: "user-round-replay-live-recipient", characterId: "character-round-replay-live-recipient", gold: 100 });
    await seedRoundOffer({
      purchaseId: "purchase-round-replay-live-fallback",
      offerId: "12345678-1234-4234-9234-000000007222",
      buyerCharacterId: "character-round-replay-live-buyer",
      recipientCharacterId: "character-round-replay-live-recipient",
      drinkKey: "drink.simple-beer"
    });
    await prisma.korchmaRoundRecipient.update({
      where: { id: "12345678-1234-4234-9234-000000007222" },
      data: {
        status: "accepted",
        respondedAt: now(),
        resultJson: { kind: "legacy-without-activation-snapshot" }
      }
    });
    await seedCurrentDrink("character-round-replay-live-recipient", "drink-state-round-live-fallback", "drink.fine-beer");

    const replay = await repository.respondToRoundOfferForTelegramUser(7222n, {
      offerId: "12345678-1234-4234-9234-000000007222",
      action: "accept",
      now: new Date("2026-06-23T10:02:00.000Z"),
      result: { kind: "round-offer-accept" }
    });

    expect(replay.state).toBe("replayed");
    expect(replay.state === "replayed" ? replay.drink : "not-replayed").toBeNull();
  });

  it("blocks old-life round offers without accepting or activating a drink", async () => {
    await seedCharacter({ telegramUserId: 7201n, userId: "user-round-old-life-buyer", characterId: "character-round-old-life-buyer", gold: 500 });
    await seedCharacter({ telegramUserId: 7202n, userId: "user-round-old-life-recipient", characterId: "character-round-old-life-recipient", gold: 100 });
    const boundary = new Date("2026-06-23T10:00:00.000Z");
    await seedRoundOffer({
      purchaseId: "purchase-round-old-life",
      offerId: "12345678-1234-4234-9234-000000007202",
      buyerCharacterId: "character-round-old-life-buyer",
      recipientCharacterId: "character-round-old-life-recipient",
      drinkKey: "drink.simple-beer"
    });
    await prisma.korchmaRoundRecipient.update({
      where: { id: "12345678-1234-4234-9234-000000007202" },
      data: { remortCount: 0, createdAt: boundary, updatedAt: boundary }
    });
    await prisma.characterRemort.create({
      data: {
        id: "remort-round-old-life",
        characterId: "character-round-old-life-recipient",
        token: "remort-token-round-old-life",
        remortNumber: 1,
        previousLevel: 3,
        previousXp: 100,
        previousGold: 100,
        displayNameSnapshot: "character-round-old-life-recipient",
        preservedPayloadJson: {},
        createdAt: boundary
      }
    });

    const result = await repository.respondToRoundOfferForTelegramUser(7202n, {
      offerId: "12345678-1234-4234-9234-000000007202",
      action: "accept",
      now: new Date("2026-06-23T10:01:00.000Z"),
      result: { kind: "round-offer-accept" }
    });

    expect(result.state).toBe("invalid-offer");
    await expect(prisma.korchmaRoundRecipient.findUnique({
      where: { id: "12345678-1234-4234-9234-000000007202" }
    })).resolves.toMatchObject({ status: "offered" });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-round-old-life-recipient" }
    })).resolves.toBeNull();
  });

  it("records one expired-unused audit for queued vodka on lazy read", async () => {
    await seedCharacter({ telegramUserId: 715n, userId: "user-expired-vodka", characterId: "character-expired-vodka", gold: 100 });
    await prisma.characterDrinkState.create({
      data: {
        id: "drink-state-expired-vodka",
        activationId: "activation-expired-vodka",
        characterId: "character-expired-vodka",
        drinkKey: "drink.pepper-vodka",
        phase: "queued",
        startedAt: new Date("2026-06-23T10:00:00.000Z"),
        expiresAt: new Date("2026-06-23T10:23:00.000Z"),
        sourceType: "self_purchase",
        sourceId: "order-expired-vodka"
      }
    });

    await expect(repository.getActiveDrinkForTelegramUser(
      715n,
      new Date("2026-06-23T10:24:00.000Z")
    )).resolves.toBeNull();
    await expect(repository.getActiveDrinkForTelegramUser(
      715n,
      new Date("2026-06-23T10:25:00.000Z")
    )).resolves.toBeNull();

    await expect(prisma.shynokDrinkActivationAudit.findMany({
      where: { activationId: "activation-expired-vodka" }
    })).resolves.toMatchObject([{
      outcome: "expired-unused",
      sourceId: "order-expired-vodka",
      occurredAt: new Date("2026-06-23T10:23:00.000Z")
    }]);
  });

  it("blocks stale self-drink confirmation after the character leaves the Shynok", async () => {
    await seedCharacter({
      telegramUserId: 711n,
      userId: "user-self-stale-place",
      characterId: "character-self-stale-place",
      gold: 100,
      locationId: "location.korchma.hall"
    });
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-self-stale-place",
        token: "12345678-1234-4234-9234-000000000711",
        characterId: "character-self-stale-place",
        drinkKey: "drink.thyme-tea",
        priceGold: 17,
        status: "pending",
        replacementJson: null,
        expiresAt: new Date("2026-06-23T10:05:00.000Z")
      }
    });

    const result = await repository.confirmSelfDrinkOrderForTelegramUser(711n, {
      token: "12345678-1234-4234-9234-000000000711",
      now: now(),
      result: { kind: "self-drink-confirm" }
    });

    expect(result.state).toBe("invalid-token");
    await expect(prisma.character.findUnique({
      where: { id: "character-self-stale-place" }
    })).resolves.toMatchObject({ gold: 100 });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-self-stale-place" }
    })).resolves.toBeNull();
  });

  it("creates one round purchase across duplicate confirmations", async () => {
    await seedCharacter({ telegramUserId: 801n, userId: "user-round", characterId: "character-round", gold: 500 });
    await seedCharacter({ telegramUserId: 802n, userId: "user-round-target", characterId: "character-round-target" });
    await prisma.korchmaDrinkOrder.create({
      data: {
        id: "order-round",
        token: "12345678-1234-4234-9234-000000000801",
        characterId: "character-round",
        drinkKey: "drink.simple-beer",
        priceGold: 93,
        status: "pending-round",
        replacementJson: [{ characterId: "character-round-target", telegramUserId: "802" }],
        expiresAt: new Date("2026-06-23T10:05:00.000Z")
      }
    });

    const results = await Promise.all([
      repository.confirmRoundOrderForTelegramUser(801n, {
        token: "12345678-1234-4234-9234-000000000801",
        tier: "simple",
        localDate: "2026-06-23",
        offerExpiresAt: new Date("2026-06-23T10:05:00.000Z"),
        now: now()
      }),
      repository.confirmRoundOrderForTelegramUser(801n, {
        token: "12345678-1234-4234-9234-000000000801",
        tier: "simple",
        localDate: "2026-06-23",
        offerExpiresAt: new Date("2026-06-23T10:05:00.000Z"),
        now: now()
      })
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["completed", "replayed"]);
    await expect(prisma.character.findUnique({ where: { id: "character-round" } })).resolves.toMatchObject({ gold: 407 });
    await expect(prisma.korchmaRoundPurchase.count({ where: { characterId: "character-round" } })).resolves.toBe(1);
    await expect(prisma.korchmaRoundRecipient.count({ where: { characterId: "character-round-target" } })).resolves.toBe(1);
  });

  it("pays one Mantok sale across duplicate confirmations", async () => {
    await seedCharacter({ telegramUserId: 901n, userId: "user-sale", characterId: "character-sale", gold: 10 });
    await seedSaleItems("character-sale", { "item.test-copper-spoon": 2 });
    const basket = makeSaleBasket([{ itemId: "item.test-copper-spoon", quantity: 2 }]);
    await seedSale({
      token: "12345678-1234-4234-9234-000000000901",
      characterId: "character-sale",
      basket
    });

    const results = await Promise.all([
      repository.confirmSaleForTelegramUser(901n, {
        token: "12345678-1234-4234-9234-000000000901",
        itemContents: saleItemContents,
        result: { kind: "sale-confirm" },
        now: now()
      }),
      repository.confirmSaleForTelegramUser(901n, {
        token: "12345678-1234-4234-9234-000000000901",
        itemContents: saleItemContents,
        result: { kind: "sale-confirm" },
        now: now()
      })
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["replayed", "sold"]);
    await expect(prisma.character.findUnique({ where: { id: "character-sale" } })).resolves.toMatchObject({
      gold: 19
    });
    await expect(prisma.characterItem.count({ where: { characterId: "character-sale" } })).resolves.toBe(0);
    await expect(prisma.korchmaMantokSale.findUnique({
      where: { token: "12345678-1234-4234-9234-000000000901" }
    })).resolves.toMatchObject({ status: "completed", payoutGold: 9 });
  });

  it("blocks Mantok sale confirmation when an active combat lease appears after preview", async () => {
    await seedCharacter({ telegramUserId: 911n, userId: "user-sale-lease", characterId: "character-sale-lease", gold: 10 });
    await seedSaleItems("character-sale-lease", { "item.test-copper-spoon": 2 });
    const basket = makeSaleBasket([{ itemId: "item.test-copper-spoon", quantity: 2 }]);
    await seedSale({
      token: "12345678-1234-4234-9234-000000000911",
      characterId: "character-sale-lease",
      basket
    });
    await prisma.activeCombatLease.create({
      data: {
        characterId: "character-sale-lease",
        kind: "solo-combat",
        referenceId: "session-sale-lease"
      }
    });

    const result = await repository.confirmSaleForTelegramUser(911n, {
      token: "12345678-1234-4234-9234-000000000911",
      itemContents: saleItemContents,
      result: { kind: "sale-confirm" },
      now: now()
    });

    expect(result.state).toBe("invalid-token");
    await expect(prisma.character.findUnique({ where: { id: "character-sale-lease" } })).resolves.toMatchObject({
      gold: 10
    });
    await expect(prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: "character-sale-lease",
          itemId: "item.test-copper-spoon"
        }
      }
    })).resolves.toMatchObject({ quantity: 2 });
  });

  it("blocks old Mantok sale drafts after remort life changes", async () => {
    await seedCharacter({ telegramUserId: 912n, userId: "user-sale-remort", characterId: "character-sale-remort", gold: 10 });
    await seedSaleItems("character-sale-remort", { "item.test-copper-spoon": 2 });
    const basket = makeSaleBasket([{ itemId: "item.test-copper-spoon", quantity: 2 }]);
    const boundary = new Date("2026-06-23T09:55:00.000Z");
    await seedSale({
      token: "12345678-1234-4234-9234-000000000912",
      characterId: "character-sale-remort",
      basket,
      createdAt: boundary
    });
    await prisma.characterRemort.create({
      data: {
        id: "remort-sale-draft",
        characterId: "character-sale-remort",
        token: "remort-token-sale-draft",
        remortNumber: 1,
        previousLevel: 3,
        previousXp: 100,
        previousGold: 10,
        displayNameSnapshot: "character-sale-remort",
        preservedPayloadJson: {},
        createdAt: boundary
      }
    });

    const result = await repository.confirmSaleForTelegramUser(912n, {
      token: "12345678-1234-4234-9234-000000000912",
      itemContents: saleItemContents,
      result: { kind: "sale-confirm" },
      now: now()
    });

    expect(result.state).toBe("invalid-token");
    await expect(prisma.character.findUnique({ where: { id: "character-sale-remort" } })).resolves.toMatchObject({
      gold: 10
    });
    await expect(prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: "character-sale-remort",
          itemId: "item.test-copper-spoon"
        }
      }
    })).resolves.toMatchObject({ quantity: 2 });
  });

  it("leaves stale Mantok sale selection untouched", async () => {
    await seedCharacter({ telegramUserId: 1001n, userId: "user-sale-stale", characterId: "character-sale-stale", gold: 10 });
    await seedSaleItems("character-sale-stale", {
      "item.test-copper-spoon": 1,
      "item.test-tin-button": 1
    });
    const basket = makeSaleBasket([
      { itemId: "item.test-copper-spoon", quantity: 1 },
      { itemId: "item.test-tin-button", quantity: 1 }
    ]);
    await seedSale({
      token: "12345678-1234-4234-9234-000000001001",
      characterId: "character-sale-stale",
      basket
    });
    await prisma.characterItem.delete({
      where: {
        characterId_itemId: {
          characterId: "character-sale-stale",
          itemId: "item.test-tin-button"
        }
      }
    });

    const result = await repository.confirmSaleForTelegramUser(1001n, {
      token: "12345678-1234-4234-9234-000000001001",
      itemContents: saleItemContents,
      result: { kind: "sale-confirm" },
      now: now()
    });

    expect(result.state).toBe("stale-selection");
    await expect(prisma.character.findUnique({ where: { id: "character-sale-stale" } })).resolves.toMatchObject({
      gold: 10
    });
    await expect(prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: "character-sale-stale",
          itemId: "item.test-copper-spoon"
        }
      }
    })).resolves.toMatchObject({ quantity: 1 });
    await expect(prisma.korchmaMantokSale.findUnique({
      where: { token: "12345678-1234-4234-9234-000000001001" }
    })).resolves.toMatchObject({ status: "pending" });
  });

  it("does not reserve Shynok sale items for expired untouched pending gifts", async () => {
    await seedCharacter({ telegramUserId: 1002n, userId: "user-sale-expired-gift", characterId: "character-sale-expired-gift", gold: 10 });
    await seedSaleItems("character-sale-expired-gift", { "item.test-copper-spoon": 1 });
    await seedTransferReservation({
      token: "expired-gift-sale-reservation",
      characterId: "character-sale-expired-gift",
      itemId: "item.test-copper-spoon",
      status: "pending",
      expiresAt: new Date("2026-06-23T09:59:00.000Z")
    });

    const snapshot = await repository.getInventorySnapshotForTelegramUser(1002n, now());

    expect(snapshot?.reservedItemIds).not.toContain("item.test-copper-spoon");
    expect(buildMantokSaleEligibleStacks({
      stacks: snapshot?.items ?? [],
      reservedItemIds: new Set(snapshot?.reservedItemIds ?? []),
      itemContents: saleItemContents
    }).map((stack) => stack.itemId)).toContain("item.test-copper-spoon");
  });

  it("keeps processing gifts reserved from Shynok sale eligibility", async () => {
    await seedCharacter({ telegramUserId: 1003n, userId: "user-sale-processing-gift", characterId: "character-sale-processing-gift", gold: 10 });
    await seedSaleItems("character-sale-processing-gift", { "item.test-copper-spoon": 1 });
    await seedTransferReservation({
      token: "processing-gift-sale-reservation",
      characterId: "character-sale-processing-gift",
      itemId: "item.test-copper-spoon",
      status: "processing",
      expiresAt: new Date("2026-06-23T09:59:00.000Z")
    });

    const snapshot = await repository.getInventorySnapshotForTelegramUser(1003n, now());

    expect(snapshot?.reservedItemIds).toContain("item.test-copper-spoon");
    expect(buildMantokSaleEligibleStacks({
      stacks: snapshot?.items ?? [],
      reservedItemIds: new Set(snapshot?.reservedItemIds ?? []),
      itemContents: saleItemContents
    }).map((stack) => stack.itemId)).not.toContain("item.test-copper-spoon");
  });

  async function seedCharacter(input: {
    telegramUserId: bigint;
    userId: string;
    characterId: string;
    gold?: number;
    locationId?: string;
    currentRaidId?: string | null;
  }): Promise<void> {
    await prisma.user.create({
      data: {
        id: input.userId,
        telegramUserId: input.telegramUserId,
        displayName: input.characterId,
        lastSeenLocationId: input.locationId ?? "location.korchma.bar",
        currentRaidId: input.currentRaidId ?? null
      }
    });
    await prisma.character.create({
      data: {
        id: input.characterId,
        userId: input.userId,
        name: input.characterId,
        pronoun: "they",
        path: "boundary",
        raceId: "race.human",
        classId: "class.warrior",
        level: 1,
        xp: 0,
        gold: input.gold ?? 0,
        hpCurrent: 25,
        hpMax: 25,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: {}
      }
    });
  }

  async function seedCurrentDrink(characterId: string, id: string, drinkKey: string): Promise<void> {
    await prisma.characterDrinkState.create({
      data: {
        id,
        characterId,
        drinkKey,
        phase: drinkKey === "drink.pepper-vodka" ? "queued" : "timed",
        startedAt: now(),
        expiresAt: new Date("2026-06-23T10:30:00.000Z"),
        sourceType: "self_purchase",
        sourceId: "seed"
      }
    });
  }

  async function seedRoundOffer(input: {
    purchaseId: string;
    offerId: string;
    buyerCharacterId: string;
    recipientCharacterId: string;
    drinkKey: string;
  }): Promise<void> {
    await prisma.korchmaRoundPurchase.create({
      data: {
        id: input.purchaseId,
        characterId: input.buyerCharacterId,
        tier: "simple",
        spentGold: 93,
        localDate: "2026-06-23",
        drinkKey: input.drinkKey,
        recipientCount: 1,
        offerExpiresAt: new Date("2026-06-23T10:05:00.000Z"),
        rulesVersion: "shynok-round-v1",
        snapshotJson: [{ characterId: input.recipientCharacterId }],
        telemetryJson: { snapshotCount: 1, acceptedCount: 0, declinedCount: 0, expiredCount: 0 }
      }
    });
    await prisma.korchmaRoundRecipient.create({
      data: {
        id: input.offerId,
        purchaseId: input.purchaseId,
        characterId: input.recipientCharacterId,
        drinkKey: input.drinkKey,
        status: "offered",
        offeredAt: now(),
        expiresAt: new Date("2026-06-23T10:05:00.000Z")
      }
    });
  }

  async function seedSaleItems(characterId: string, items: Record<string, number>): Promise<void> {
    for (const [itemId, quantity] of Object.entries(items)) {
      await prisma.characterItem.create({
        data: {
          characterId,
          itemId,
          quantity
        }
      });
    }
  }

  async function seedTransferReservation(input: {
    token: string;
    characterId: string;
    itemId: string;
    status: string;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.itemTransfer.create({
      data: {
        token: input.token,
        senderCharacterId: input.characterId,
        receiverCharacterId: "character-transfer-reservation-receiver",
        senderTelegramUserId: 1002n,
        receiverTelegramUserId: 2002n,
        senderName: input.characterId,
        receiverName: "receiver",
        locationId: "location.korchma.bar",
        itemId: input.itemId,
        itemName: input.itemId,
        itemFingerprint: "test-fingerprint",
        quantity: 1,
        status: input.status,
        expiresAt: input.expiresAt,
        updatedAt: now()
      }
    });
  }

  async function seedSale(input: {
    token: string;
    characterId: string;
    basket: NonNullable<ReturnType<typeof buildMantokSaleBasket>>;
    createdAt?: Date;
  }): Promise<void> {
    await prisma.korchmaMantokSale.create({
      data: {
        token: input.token,
        characterId: input.characterId,
        status: "pending",
        selectionJson: input.basket.items,
        selectionFingerprint: input.basket.fingerprint,
        nominalValue: input.basket.nominalValue,
        payoutGold: input.basket.payoutGold,
        expiresAt: new Date("2026-06-23T10:05:00.000Z"),
        ...(input.createdAt ? { createdAt: input.createdAt } : {})
      }
    });
  }
});

const saleItemContents: ItemContent[] = [
  {
    id: "item.test-copper-spoon",
    name: "Мідна ложка",
    description: "Тестова манатка.",
    rarity: "common",
    slot: "junk",
    goldValue: 10
  },
  {
    id: "item.test-tin-button",
    name: "Бляшаний ґудзик",
    description: "Тестова манатка.",
    rarity: "common",
    slot: "junk",
    goldValue: 20
  }
];

function now(): Date {
  return new Date("2026-06-23T10:00:00.000Z");
}

function replacementExpectation(state: {
  id: string;
  activationId: string;
  drinkKey: string;
  phase: string;
  startedAt: Date;
  expiresAt: Date;
}) {
  return {
    expected: "activation",
    drinkStateId: state.id,
    activationId: state.activationId,
    drinkKey: state.drinkKey,
    phase: state.phase,
    startedAt: state.startedAt.toISOString(),
    expiresAt: state.expiresAt.toISOString()
  };
}

function makeSaleBasket(selection: Array<{ itemId: string; quantity: number }>) {
  const eligible = buildMantokSaleEligibleStacks({
    stacks: selection,
    itemContents: saleItemContents
  });
  const selected = selectAllMantokSaleEligibleUnits(eligible);
  const basket = buildMantokSaleBasket(selected, eligible);
  if (!basket) {
    throw new Error("Expected sale basket.");
  }

  return basket;
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  const statements = [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      telegram_user_id BIGINT NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT,
      language_code TEXT,
      last_action_at DATETIME,
      last_seen_location_id TEXT,
      current_raid_id TEXT,
      current_adventure_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pronoun TEXT NOT NULL DEFAULT 'they',
      path TEXT NOT NULL DEFAULT 'boundary',
      race_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25,
      hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10,
      mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME,
      mana_regen_at DATETIME,
      active_cosmetic_title_grant_id TEXT,
      stats_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY NOT NULL,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_drink_states (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      activation_id TEXT NOT NULL,
      character_id TEXT NOT NULL UNIQUE,
      remort_count INTEGER NOT NULL DEFAULT 0,
      drink_key TEXT NOT NULL,
      phase TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      metadata_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX character_drink_states_activation_id_key
      ON character_drink_states(activation_id)`,
    `CREATE TABLE shynok_drink_activation_audits (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      activation_id TEXT NOT NULL UNIQUE,
      drink_key TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      outcome TEXT NOT NULL,
      combat_session_id TEXT,
      occurred_at DATETIME NOT NULL,
      metadata_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_drink_orders (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      drink_key TEXT NOT NULL,
      price_gold INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      replacement_json JSONB,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_round_purchases (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL,
      spent_gold INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      drink_key TEXT,
      recipient_count INTEGER,
      offer_expires_at DATETIME,
      rules_version TEXT,
      snapshot_json JSONB,
      telemetry_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_round_recipients (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      purchase_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      drink_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offered',
      offered_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      responded_at DATETIME,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX korchma_round_recipients_purchase_id_character_id_key
      ON korchma_round_recipients(purchase_id, character_id)`,
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      enhancement_level INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX character_items_character_id_item_id_key ON character_items(character_id, item_id)`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE mantok_chest_runs (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      input_items_json JSONB NOT NULL,
      output_items_json JSONB,
      average_input_score INTEGER NOT NULL DEFAULT 0,
      minimum_output_score INTEGER NOT NULL DEFAULT 0,
      output_score INTEGER,
      completed_at DATETIME,
      expired_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE level_barter_exchanges (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      input_items_json JSONB NOT NULL,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      level_before INTEGER NOT NULL DEFAULT 1,
      level_after INTEGER NOT NULL DEFAULT 1,
      xp_before INTEGER NOT NULL DEFAULT 0,
      xp_after INTEGER NOT NULL DEFAULT 0,
      xp_carry INTEGER NOT NULL DEFAULT 0,
      item_total_value INTEGER NOT NULL DEFAULT 0,
      selected_total_value INTEGER NOT NULL DEFAULT 0,
      overpay INTEGER NOT NULL DEFAULT 0,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_mantok_sales (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      selection_json JSONB NOT NULL,
      selection_fingerprint TEXT NOT NULL,
      nominal_value INTEGER NOT NULL DEFAULT 0,
      payout_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE item_transfers (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      token TEXT NOT NULL UNIQUE,
      transfer_kind TEXT NOT NULL DEFAULT 'gift',
      sender_character_id TEXT NOT NULL,
      receiver_character_id TEXT NOT NULL,
      sender_telegram_user_id BIGINT NOT NULL,
      receiver_telegram_user_id BIGINT NOT NULL,
      sender_name TEXT NOT NULL,
      receiver_name TEXT NOT NULL,
      sender_remort_count INTEGER NOT NULL DEFAULT 0,
      receiver_remort_count INTEGER NOT NULL DEFAULT 0,
      location_id TEXT,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_fingerprint TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      package_json JSONB,
      delivery_fee_gold INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      reservation_key TEXT UNIQUE,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      responded_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE item_use_orders (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      telegram_user_id BIGINT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_fingerprint TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      effect_kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reservation_key TEXT UNIQUE,
      preview_json JSONB NOT NULL,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      cancelled_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
