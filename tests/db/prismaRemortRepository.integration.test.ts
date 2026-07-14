import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPendingPassageEncounterRepository } from "../../src/db/repositories/prismaPendingPassageEncounterRepository";
import { PrismaRemortRepository } from "../../src/db/repositories/prismaRemortRepository";
import type { RemortCompletionInput } from "../../src/db/repositories/remortRepository";
import type { CombatState } from "../../src/domain/combat";
import {
  settleVarenykSatedOutsideCombat,
  VARENYK_SATED_STATUS_KEY,
  type VarenykSatedPayloadV1
} from "../../src/domain/noncombat/varenykSatedSupport";

describe("PrismaRemortRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaRemortRepository;
  let passages: PrismaPendingPassageEncounterRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-remort-repo-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaRemortRepository(prisma);
    passages = new PrismaPendingPassageEncounterRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("expires active solo combat and cancels live passage trails atomically during remort", async () => {
    const now = new Date("2026-06-22T10:00:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-solo",
      characterId: "character-remort-solo",
      telegramUserId: 9301n
    });
    await seedCharacter(prisma, {
      userId: "user-remort-postal-sender",
      characterId: "character-remort-postal-sender",
      telegramUserId: 9399n
    });
    await seedCharacter(prisma, {
      userId: "user-remort-postal-receiver",
      characterId: "character-remort-postal-receiver",
      telegramUserId: 9398n
    });
    await seedDraft(prisma, "character-remort-solo", "token-remort-solo", now);
    await prisma.soloCombatSession.create({
      data: {
        id: "session-remort-solo",
        characterId: "character-remort-solo",
        monsterId: "monster.deadline-spider",
        status: "active",
        turn: 3,
        stateJson: makeCombatState("session-remort-solo", {
          turn: 3,
          turnExpiresAt: new Date(now.getTime() + 30_000).toISOString()
        }),
        expiresAt: new Date(now.getTime() + 30 * 60_000)
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-solo",
        characterId: "character-remort-solo",
        kind: "solo-combat",
        referenceId: "session-remort-solo"
      }
    });
    await seedPassage(prisma, {
      id: "passage-pending-live",
      token: "token-pending-live",
      characterId: "character-remort-solo",
      status: "pending",
      activeKey: "character-remort-solo:deep-straight",
      expiresAt: new Date(now.getTime() + 93 * 60_000)
    });
    await seedPassage(prisma, {
      id: "passage-consumed-live",
      token: "token-consumed-live",
      characterId: "character-remort-solo",
      status: "consumed",
      combatSessionId: "session-remort-solo",
      consumedAt: new Date(now.getTime() - 60_000),
      expiresAt: new Date(now.getTime() + 93 * 60_000)
    });
    await seedPassage(prisma, {
      id: "passage-expired-clock",
      token: "token-expired-clock",
      characterId: "character-remort-solo",
      status: "pending",
      activeKey: "character-remort-solo:deep-left",
      expiresAt: new Date(now.getTime() - 1)
    });
    await seedPassage(prisma, {
      id: "passage-already-cancelled",
      token: "token-already-cancelled",
      characterId: "character-remort-solo",
      status: "cancelled",
      cancelledAt: new Date(now.getTime() - 60_000),
      expiresAt: new Date(now.getTime() + 93 * 60_000),
      version: 4
    });
    await prisma.characterDrinkState.create({
      data: {
        id: "drink-remort-live",
        activationId: "activation-remort-live",
        characterId: "character-remort-solo",
        drinkKey: "drink.simple-beer",
        phase: "timed",
        startedAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() + 22 * 60_000),
        sourceType: "self_purchase",
        sourceId: "order-remort-pending"
      }
    });
    await prisma.korchmaDrinkOrder.createMany({
      data: [
        {
          id: "order-remort-pending",
          token: "token-order-remort-pending",
          characterId: "character-remort-solo",
          drinkKey: "drink.simple-beer",
          priceGold: 13,
          status: "pending",
          expiresAt: new Date(now.getTime() + 5 * 60_000)
        },
        {
          id: "order-remort-completed",
          token: "token-order-remort-completed",
          characterId: "character-remort-solo",
          drinkKey: "drink.thyme-tea",
          priceGold: 17,
          status: "completed",
          resultJson: { kind: "kept-history" },
          completedAt: new Date(now.getTime() - 60_000),
          expiresAt: new Date(now.getTime() + 5 * 60_000)
        }
      ]
    });
    await prisma.korchmaRoundPurchase.create({
      data: {
        id: "purchase-remort-offer",
        characterId: "character-remort-solo",
        tier: "simple",
        spentGold: 93,
        localDate: "2026-06-22",
        drinkKey: "drink.simple-beer",
        recipientCount: 1,
        offerExpiresAt: new Date(now.getTime() + 5 * 60_000)
      }
    });
    await prisma.korchmaRoundRecipient.create({
      data: {
        id: "offer-remort-open",
        purchaseId: "purchase-remort-offer",
        characterId: "character-remort-solo",
        drinkKey: "drink.simple-beer",
        status: "offered",
        offeredAt: now,
        expiresAt: new Date(now.getTime() + 5 * 60_000)
      }
    });
    await prisma.korchmaMantokSale.create({
      data: {
        id: "sale-remort-pending",
        token: "token-sale-remort-pending",
        characterId: "character-remort-solo",
        status: "pending",
        selectionJson: [{ itemId: "item.old-life", quantity: 1 }],
        selectionFingerprint: "old-life",
        nominalValue: 100,
        payoutGold: 42,
        expiresAt: new Date(now.getTime() + 5 * 60_000)
      }
    });
    await prisma.$executeRaw`
      INSERT INTO daily_actions (id, character_id, key, value_json, created_at, updated_at)
      VALUES ('daily-remort-bandage', 'character-remort-solo', 'yeger.bandage.purchase.confirm', '{}', ${new Date(now.getTime() - 60_000)}, ${new Date(now.getTime() - 60_000)})
    `;
    await prisma.characterCooldown.create({
      data: {
        id: "cooldown-remort-training",
        characterId: "character-remort-solo",
        key: "training.doppelganger.spar",
        availableAt: new Date(now.getTime() + 60 * 60_000),
        resultJson: { kind: "old-life-cooldown" }
      }
    });
    await prisma.huntContract.create({
      data: {
        id: "hunt-remort-contract",
        characterId: "character-remort-solo",
        localPeriodId: "2026-06-22",
        monsterId: "monster.deadline-spider",
        contractToken: "hunt-remort-token",
        status: "completed",
        completedAction: "attack",
        completedAt: new Date(now.getTime() - 60_000)
      }
    });
    await prisma.barrelRaidNotification.create({
      data: {
        id: "barrel-remort-notification",
        characterId: "character-remort-solo",
        telegramUserId: 9301n,
        chatId: 9301n,
        periodId: "2026-06-22:barrel",
        availableAt: new Date(now.getTime() + 60_000),
        status: "sent",
        sentAt: new Date(now.getTime() - 30_000)
      }
    });
    await prisma.itemTransfer.create({
      data: {
        id: "transfer-remort-postal",
        token: "token-remort-postal",
        transferKind: "postal",
        senderCharacterId: "character-remort-postal-sender",
        receiverCharacterId: "character-remort-solo",
        senderTelegramUserId: 9399n,
        receiverTelegramUserId: 9301n,
        senderName: "Поштовий відправник",
        receiverName: "Ремортний отримувач",
        senderRemortCount: 0,
        receiverRemortCount: 0,
        itemId: "item.remort-postal",
        itemName: "Ремортний поштовий ґудзик",
        itemFingerprint: "remort-postal-fingerprint",
        quantity: 2,
        packageJson: [{
          itemId: "item.remort-postal",
          itemName: "Ремортний поштовий ґудзик",
          quantity: 2,
          itemFingerprint: "remort-postal-fingerprint",
          unitGoldValue: 13,
          observedQuantity: 2,
          tags: []
        }],
        deliveryFeeGold: 6,
        status: "pending",
        reservationKey: "postal:character-remort-postal-sender",
        resultJson: {
          kind: "postal-test-pending",
          postalCustody: "sender-debited"
        },
        expiresAt: new Date(now.getTime() + 5 * 60_000)
      }
    });

    const result = await repository.completeDraftForTelegramUser(
      9301n,
      makeCompletionInput("token-remort-solo", now)
    );

    expect(result.state).toBe("completed");
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-remort-solo" } })).resolves.toBe(0);
    await expect(prisma.character.findUnique({ where: { id: "character-remort-solo" } })).resolves.toMatchObject({
      level: 1,
      xp: 0,
      gold: 0,
      hpCurrent: 31,
      hpMax: 31,
      manaCurrent: 12,
      manaMax: 12
    });

    const session = await prisma.soloCombatSession.findUnique({ where: { id: "session-remort-solo" } });
    expect(session).toMatchObject({ status: "expired", turn: 3, rewardXp: null, rewardGold: null, rewardClaimedAt: null });
    const state = session?.stateJson as unknown as CombatState;
    expect(state.status).toBe("expired");
    expect(state.completedAt).toBe(now.toISOString());
    expect(state.turnExpiresAt).toBeUndefined();
    expect(state.settlement).toMatchObject({
      status: "forfeited-by-remort",
      reason: "remort",
      settledAt: now.toISOString()
    });
    expect(state.hero.hp).toBe(9);
    expect(state.monster.hp).toBe(17);
    expect(state.turnLog?.filter((entry) => entry.eventId === "terminal:expired")).toHaveLength(1);

    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: "passage-pending-live" } })).resolves.toMatchObject({
      status: "cancelled",
      activeKey: null,
      cancelledAt: now,
      version: 2,
      combatSessionId: null
    });
    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: "passage-consumed-live" } })).resolves.toMatchObject({
      status: "cancelled",
      activeKey: null,
      cancelledAt: now,
      version: 2,
      combatSessionId: "session-remort-solo"
    });
    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: "passage-expired-clock" } })).resolves.toMatchObject({
      status: "pending",
      version: 1,
      cancelledAt: null
    });
    await expect(prisma.pendingPassageEncounter.findUnique({ where: { id: "passage-already-cancelled" } })).resolves.toMatchObject({
      status: "cancelled",
      version: 4
    });

    await expect(passages.consumeForTelegramUser(
      9301n,
      "token-pending-live",
      makeConsumeInput("session-stale-callback", now)
    )).resolves.toMatchObject({ state: "not-pending" });
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-remort-solo" }
    })).resolves.toBeNull();
    await expect(prisma.korchmaDrinkOrder.findUnique({
      where: { id: "order-remort-pending" }
    })).resolves.toMatchObject({ status: "cancelled" });
    await expect(prisma.korchmaDrinkOrder.findUnique({
      where: { id: "order-remort-completed" }
    })).resolves.toMatchObject({ status: "completed" });
    await expect(prisma.korchmaRoundRecipient.findUnique({
      where: { id: "offer-remort-open" }
    })).resolves.toMatchObject({ status: "expired", respondedAt: now });
    await expect(prisma.korchmaMantokSale.findUnique({
      where: { id: "sale-remort-pending" }
    })).resolves.toMatchObject({ status: "cancelled" });
    await expect(prisma.dailyAction.count({
      where: { characterId: "character-remort-solo" }
    })).resolves.toBe(0);
    await expect(prisma.characterCooldown.count({
      where: { characterId: "character-remort-solo" }
    })).resolves.toBe(0);
    await expect(prisma.huntContract.count({
      where: { characterId: "character-remort-solo" }
    })).resolves.toBe(0);
    await expect(prisma.barrelRaidNotification.count({
      where: { characterId: "character-remort-solo" }
    })).resolves.toBe(0);
    await expect(prisma.itemTransfer.findUnique({
      where: { id: "transfer-remort-postal" }
    })).resolves.toMatchObject({
      status: "cancelled",
      reservationKey: null,
      resultJson: { kind: "remort-cancelled-gift" }
    });
    await expect(prisma.characterItem.findMany({
      where: {
        characterId: "character-remort-postal-sender",
        itemId: "item.remort-postal"
      }
    })).resolves.toMatchObject([{ quantity: 2 }]);
    await expect(prisma.characterItem.findMany({
      where: {
        characterId: "character-remort-solo",
        itemId: "item.remort-postal"
      }
    })).resolves.toEqual([]);
    await expect(prisma.character.findUnique({
      where: { id: "character-remort-postal-sender" }
    })).resolves.toMatchObject({ gold: 587 });
    await repository.completeDraftForTelegramUser(9301n, makeCompletionInput("token-remort-solo", now));
    const replayedSession = await prisma.soloCombatSession.findUnique({ where: { id: "session-remort-solo" } });
    const replayedState = replayedSession?.stateJson as unknown as CombatState;
    expect(replayedState.turnLog?.filter((entry) => entry.eventId === "terminal:expired")).toHaveLength(1);
  }, 15_000);

  it("blocks sender remort while a sent postal package is in sender-debited custody", async () => {
    const now = new Date("2026-06-22T10:20:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-postal-block-sender",
      characterId: "character-remort-postal-block-sender",
      telegramUserId: 9311n
    });
    await seedCharacter(prisma, {
      userId: "user-remort-postal-block-receiver",
      characterId: "character-remort-postal-block-receiver",
      telegramUserId: 9312n
    });
    await seedDraft(prisma, "character-remort-postal-block-sender", "token-remort-postal-block", now);
    await seedPostalTransfer(prisma, {
      id: "transfer-remort-postal-block",
      token: "token-transfer-remort-postal-block",
      senderCharacterId: "character-remort-postal-block-sender",
      receiverCharacterId: "character-remort-postal-block-receiver",
      senderTelegramUserId: 9311n,
      receiverTelegramUserId: 9312n,
      status: "pending",
      postalCustody: "sender-debited",
      itemId: "item.remort-postal-block",
      quantity: 3,
      now
    });

    const result = await repository.completeDraftForTelegramUser(
      9311n,
      makeCompletionInput("token-remort-postal-block", now)
    );

    expect(result.state).toBe("invalid-draft");
    if (result.state !== "invalid-draft") {
      throw new Error(`Expected invalid draft, received ${result.state}`);
    }
    expect(result.reason).toContain("скасуйте відправлений пакунок");
    await expect(prisma.characterRemort.count({
      where: { characterId: "character-remort-postal-block-sender" }
    })).resolves.toBe(0);
    await expect(prisma.characterRemortDraft.findUnique({
      where: { id: "draft-token-remort-postal-block" }
    })).resolves.toMatchObject({ status: "pending" });
    await expect(prisma.itemTransfer.findUnique({
      where: { id: "transfer-remort-postal-block" }
    })).resolves.toMatchObject({
      status: "pending",
      deliveryFeeGold: 6,
      reservationKey: "postal:character-remort-postal-block-sender"
    });
    await expect(prisma.characterItem.findMany({
      where: {
        characterId: "character-remort-postal-block-sender",
        itemId: "item.remort-postal-block"
      }
    })).resolves.toEqual([]);
    await expect(prisma.character.findUnique({
      where: { id: "character-remort-postal-block-sender" }
    })).resolves.toMatchObject({ level: 13, xp: 1300, gold: 587 });
  });

  it("does not block remort on a private draft postal row or move draft package lines", async () => {
    const now = new Date("2026-06-22T10:25:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-postal-draft-sender",
      characterId: "character-remort-postal-draft-sender",
      telegramUserId: 9321n
    });
    await seedCharacter(prisma, {
      userId: "user-remort-postal-draft-receiver",
      characterId: "character-remort-postal-draft-receiver",
      telegramUserId: 9322n
    });
    await seedDraft(prisma, "character-remort-postal-draft-sender", "token-remort-postal-draft", now);
    await seedPostalTransfer(prisma, {
      id: "transfer-remort-postal-draft",
      token: "token-transfer-remort-postal-draft",
      senderCharacterId: "character-remort-postal-draft-sender",
      receiverCharacterId: "character-remort-postal-draft-receiver",
      senderTelegramUserId: 9321n,
      receiverTelegramUserId: 9322n,
      status: "draft",
      itemId: "item.remort-postal-draft",
      quantity: 2,
      now
    });

    const result = await repository.completeDraftForTelegramUser(
      9321n,
      makeCompletionInput("token-remort-postal-draft", now)
    );

    expect(result.state).toBe("completed");
    await expect(prisma.itemTransfer.findUnique({
      where: { id: "transfer-remort-postal-draft" }
    })).resolves.toMatchObject({
      status: "cancelled",
      reservationKey: null,
      deliveryFeeGold: 6,
      resultJson: { kind: "remort-cancelled-gift" }
    });
    await expect(prisma.characterItem.findMany({
      where: {
        itemId: "item.remort-postal-draft",
        OR: [
          { characterId: "character-remort-postal-draft-sender" },
          { characterId: "character-remort-postal-draft-receiver" }
        ]
      }
    })).resolves.toEqual([]);
  });

  it("marks a terminal pending solo settlement as forfeited when remort wins first", async () => {
    const now = new Date("2026-06-22T10:30:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-terminal-pending",
      characterId: "character-remort-terminal-pending",
      telegramUserId: 9305n
    });
    await seedDraft(prisma, "character-remort-terminal-pending", "token-remort-terminal-pending", now);
    const terminalState: CombatState = {
      ...makeCombatState("session-remort-terminal-pending"),
      status: "won",
      completedAt: now.toISOString(),
      settlement: {
        status: "pending",
        version: 1
      }
    };
    await prisma.soloCombatSession.create({
      data: {
        id: "session-remort-terminal-pending",
        characterId: "character-remort-terminal-pending",
        monsterId: "monster.deadline-spider",
        status: "won",
        turn: 3,
        stateJson: terminalState,
        expiresAt: new Date(now.getTime() + 30 * 60_000)
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-terminal-pending",
        characterId: "character-remort-terminal-pending",
        kind: "solo-combat",
        referenceId: "session-remort-terminal-pending"
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9305n,
      makeCompletionInput("token-remort-terminal-pending", now)
    )).resolves.toMatchObject({ state: "completed" });

    const session = await prisma.soloCombatSession.findUnique({
      where: { id: "session-remort-terminal-pending" }
    });
    const state = session?.stateJson as unknown as CombatState;
    expect(session).toMatchObject({
      status: "won",
      rewardXp: null,
      rewardGold: null,
      rewardClaimedAt: null
    });
    expect(state.settlement).toMatchObject({
      status: "forfeited-by-remort",
      reason: "remort",
      settledAt: now.toISOString()
    });
    await expect(prisma.activeCombatLease.count({
      where: { characterId: "character-remort-terminal-pending" }
    })).resolves.toBe(0);
    await expect(prisma.character.findUnique({
      where: { id: "character-remort-terminal-pending" }
    })).resolves.toMatchObject({
      level: 1,
      xp: 0,
      gold: 0,
      hpCurrent: 31,
      manaCurrent: 12
    });
  });

  it("blocks unsupported active leases without mutating remort state", async () => {
    const now = new Date("2026-06-22T11:00:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-duel",
      characterId: "character-remort-duel",
      telegramUserId: 9302n
    });
    await seedDraft(prisma, "character-remort-duel", "token-remort-duel", now);
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-duel",
        characterId: "character-remort-duel",
        kind: "duel-combat",
        referenceId: "duel-session"
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9302n,
      makeCompletionInput("token-remort-duel", now)
    )).resolves.toEqual({ state: "active-combat" });
    await expect(prisma.character.findUnique({ where: { id: "character-remort-duel" } })).resolves.toMatchObject({
      level: 13,
      xp: 1300,
      gold: 587,
      hpCurrent: 44,
      hpMax: 66
    });
    await expect(prisma.characterRemort.count({ where: { characterId: "character-remort-duel" } })).resolves.toBe(0);
    await expect(prisma.characterRemortDraft.findFirst({ where: { characterId: "character-remort-duel" } })).resolves.toMatchObject({
      status: "pending",
      completedAt: null
    });
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-remort-duel" } })).resolves.toBe(1);
  });

  it("clears a stale supported solo lease and completes remort", async () => {
    const now = new Date("2026-06-22T12:00:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-stale-lease",
      characterId: "character-remort-stale-lease",
      telegramUserId: 9303n
    });
    await seedDraft(prisma, "character-remort-stale-lease", "token-remort-stale-lease", now);
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-stale",
        characterId: "character-remort-stale-lease",
        kind: "solo-combat",
        referenceId: "missing-solo-session"
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9303n,
      makeCompletionInput("token-remort-stale-lease", now)
    )).resolves.toMatchObject({ state: "completed" });
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-remort-stale-lease" } })).resolves.toBe(0);
    await expect(prisma.characterRemort.count({ where: { characterId: "character-remort-stale-lease" } })).resolves.toBe(1);
  });

  it("cancels active party boss proof and clears leases during remort", async () => {
    const now = new Date("2026-06-22T12:30:00.000Z");
    const survivorId = "character-remort-party-survivor";
    await seedCharacter(prisma, {
      userId: "user-remort-party-boss",
      characterId: "character-remort-party-boss",
      telegramUserId: 9315n
    });
    await seedDraft(prisma, "character-remort-party-boss", "token-remort-party-boss", now);
    await seedCharacter(prisma, {
      userId: "user-remort-party-survivor",
      characterId: survivorId,
      telegramUserId: 9316n
    });
    const survivorPayload = makeSatedPayload(
      survivorId,
      new Date(now.getTime() - 5 * 60_000 - 30_000)
    );
    await prisma.characterCooldown.create({
      data: {
        characterId: survivorId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(survivorPayload.availableAt),
        resultJson: survivorPayload
      }
    });
    await prisma.partySession.create({
      data: {
        id: "party-remort-boss",
        inviteToken: "party-remort-boss-token",
        status: "active",
        leaderCharacterId: "character-remort-party-boss",
        participantCap: 8,
        minimumParticipants: 1,
        joinUntilAt: new Date(now.getTime() + 60_000),
        expiresAt: new Date(now.getTime() + 60_000),
        activeLeaderKey: "party-leader:character-remort-party-boss",
        participants: {
          create: [
            {
              id: "participant-remort-party-boss",
              characterId: "character-remort-party-boss",
              status: "joined",
              joinSource: "leader",
              joinedAt: now,
              activeMembershipKey: "party-member:character-remort-party-boss"
            },
            {
              id: "participant-remort-party-survivor",
              characterId: survivorId,
              status: "joined",
              joinSource: "invite",
              joinedAt: now,
              activeMembershipKey: `party-member:${survivorId}`
            }
          ]
        }
      }
    });
    await prisma.partyBossSession.create({
      data: {
        id: "boss-remort-party",
        partySessionId: "party-remort-boss",
        leaderCharacterId: "character-remort-party-boss",
        status: "active",
        turn: 1,
        version: 1,
        rulesVersion: "party-boss-proof-v1",
        bossKey: "party-boss-proof-one",
        stateJson: {
          status: "active",
          turn: 1,
          participants: [
            { characterId: "character-remort-party-boss" },
            {
              characterId: survivorId,
              varenykSated: makeFrozenSated(survivorPayload, new Date(now.getTime() - 5 * 60_000))
            }
          ]
        },
        turnExpiresAt: new Date(now.getTime() + 23_000)
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-party-boss",
        characterId: "character-remort-party-boss",
        kind: "party-boss",
        referenceId: "party-remort-boss"
      }
    });
    const survivorLeaseAt = new Date(now.getTime() - 5 * 60_000);
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-party-survivor",
        characterId: survivorId,
        kind: "party-boss",
        referenceId: "party-remort-boss",
        createdAt: survivorLeaseAt,
        updatedAt: survivorLeaseAt
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9315n,
      makeCompletionInput("token-remort-party-boss", now)
    )).resolves.toMatchObject({ state: "completed" });
    const bossSession = await prisma.partyBossSession.findUnique({ where: { id: "boss-remort-party" } });
    const bossResult = bossSession?.resultJson;

    expect(bossSession?.status).toBe("cancelled");
    expect(bossResult && typeof bossResult === "object" && !Array.isArray(bossResult)
      ? bossResult.reason
      : undefined).toBe("remort");
    await expect(prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: "party-remort-boss" } })).resolves.toBe(0);
    await expect(prisma.partyParticipant.findUnique({ where: { id: "participant-remort-party-boss" } })).resolves.toMatchObject({
      activeMembershipKey: null
    });
    const survivorCooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: survivorId, key: VARENYK_SATED_STATUS_KEY } }
    });
    const releasedPayload = survivorCooldown.resultJson as unknown as VarenykSatedPayloadV1;
    expect(releasedPayload.cursorAt).toBe("2026-06-22T12:29:30.000Z");
    expect(settleVarenykSatedOutsideCombat({
      payload: releasedPayload,
      resources: { hp: 40, hpMax: 60, mana: 20, manaMax: 40 },
      now: new Date(now.getTime() + 29_000),
      combatBlocked: false
    }).elapsedMinutes).toBe(0);
    expect(settleVarenykSatedOutsideCombat({
      payload: releasedPayload,
      resources: { hp: 40, hpMax: 60, mana: 20, manaMax: 40 },
      now: new Date(now.getTime() + 30_000),
      combatBlocked: false
    })).toMatchObject({ elapsedMinutes: 1, hpRestored: 1, manaRestored: 1 });
  });

  it("snaps a surviving Sated cursor to expiry when remort cancels Big Barrel after a round", async () => {
    const now = new Date("2026-06-22T15:00:00.000Z");
    const actorId = "character-remort-party-round-actor";
    const survivorId = "character-remort-party-round-survivor";
    await seedCharacter(prisma, { userId: "user-remort-party-round-actor", characterId: actorId, telegramUserId: 9317n });
    await seedCharacter(prisma, { userId: "user-remort-party-round-survivor", characterId: survivorId, telegramUserId: 9318n });
    await seedDraft(prisma, actorId, "token-remort-party-round", now);
    const payload = makeSatedPayload(survivorId, new Date(now.getTime() - 14 * 60_000));
    await prisma.characterCooldown.create({
      data: {
        characterId: survivorId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    await prisma.partySession.create({
      data: {
        id: "party-remort-after-round",
        inviteToken: "party-remort-after-round-token",
        status: "active",
        leaderCharacterId: actorId,
        participantCap: 8,
        minimumParticipants: 1,
        joinUntilAt: new Date(now.getTime() + 60_000),
        expiresAt: new Date(now.getTime() + 60_000),
        activeLeaderKey: `party-leader:${actorId}`,
        participants: {
          create: [
            { id: "participant-remort-round-actor", characterId: actorId, status: "joined", joinSource: "leader", joinedAt: now, activeMembershipKey: `party-member:${actorId}` },
            { id: "participant-remort-round-survivor", characterId: survivorId, status: "joined", joinSource: "invite", joinedAt: now, activeMembershipKey: `party-member:${survivorId}` }
          ]
        }
      }
    });
    await prisma.partyBossSession.create({
      data: {
        id: "boss-remort-after-round",
        partySessionId: "party-remort-after-round",
        leaderCharacterId: actorId,
        status: "active",
        turn: 2,
        version: 2,
        rulesVersion: "party-boss-proof-v1",
        bossKey: "party-boss-proof-one",
        stateJson: {
          status: "active",
          turn: 2,
          roundLog: [{ turn: 1 }],
          participants: [
            { characterId: actorId },
            { characterId: survivorId, varenykSated: makeFrozenSated(payload, new Date(now.getTime() - 13 * 60_000 - 30_000)) }
          ]
        },
        turnExpiresAt: new Date(now.getTime() + 23_000)
      }
    });
    for (const [id, characterId] of [["lease-remort-round-actor", actorId], ["lease-remort-round-survivor", survivorId]] as const) {
      const createdAt = new Date(now.getTime() - 13 * 60_000 - 30_000);
      await prisma.activeCombatLease.create({ data: { id, characterId, kind: "party-boss", referenceId: "party-remort-after-round", createdAt, updatedAt: createdAt } });
    }

    const first = await repository.completeDraftForTelegramUser(9317n, makeCompletionInput("token-remort-party-round", now));
    const cursorAfterFirst = ((await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: survivorId, key: VARENYK_SATED_STATUS_KEY } }
    })).resultJson as unknown as VarenykSatedPayloadV1).cursorAt;
    const replay = await repository.completeDraftForTelegramUser(9317n, makeCompletionInput("token-remort-party-round", now));
    const cursorAfterReplay = ((await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: survivorId, key: VARENYK_SATED_STATUS_KEY } }
    })).resultJson as unknown as VarenykSatedPayloadV1).cursorAt;

    expect(first).toMatchObject({ state: "completed" });
    expect(replay).toMatchObject({
      state: "replayed",
      remort: { id: first.state === "completed" ? first.remort.id : undefined }
    });
    expect(cursorAfterFirst).toBe(payload.expiresAt);
    expect(cursorAfterReplay).toBe(payload.expiresAt);
  });

  it("expires unreadable legacy solo state without rewards or character resource rollback", async () => {
    const now = new Date("2026-06-22T13:00:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-legacy-state",
      characterId: "character-remort-legacy-state",
      telegramUserId: 9304n
    });
    await seedDraft(prisma, "character-remort-legacy-state", "token-remort-legacy-state", now);
    await prisma.soloCombatSession.create({
      data: {
        id: "session-remort-legacy",
        characterId: "character-remort-legacy-state",
        monsterId: "monster.deadline-spider",
        status: "active",
        turn: 7,
        stateJson: { legacy: true, status: "active" },
        expiresAt: new Date(now.getTime() + 30 * 60_000)
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-legacy",
        characterId: "character-remort-legacy-state",
        kind: "solo-combat",
        referenceId: "session-remort-legacy"
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9304n,
      makeCompletionInput("token-remort-legacy-state", now)
    )).resolves.toMatchObject({ state: "completed" });
    await expect(prisma.soloCombatSession.findUnique({ where: { id: "session-remort-legacy" } })).resolves.toMatchObject({
      status: "expired",
      turn: 7,
      stateJson: { legacy: true, status: "active" },
      rewardXp: null,
      rewardGold: null,
      rewardClaimedAt: null
    });
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-remort-legacy-state" } })).resolves.toBe(0);
    await expect(prisma.character.findUnique({ where: { id: "character-remort-legacy-state" } })).resolves.toMatchObject({
      hpCurrent: 31,
      hpMax: 31,
      manaCurrent: 12,
      manaMax: 12
    });
  });
});

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      telegram_user_id INTEGER NOT NULL UNIQUE,
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
      id TEXT PRIMARY KEY,
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
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remort_drafts (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      selected_identity_json JSONB NOT NULL,
      selected_items_json JSONB NOT NULL,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY,
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
    `CREATE TABLE party_sessions (
      id TEXT PRIMARY KEY,
      invite_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recruiting',
      leader_character_id TEXT NOT NULL,
      period_id TEXT,
      origin_location_id TEXT,
      participant_cap INTEGER NOT NULL DEFAULT 8,
      minimum_participants INTEGER NOT NULL DEFAULT 1,
      join_until_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      active_leader_key TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'joined',
      join_source TEXT NOT NULL,
      joined_at DATETIME NOT NULL,
      left_at DATETIME,
      snapshot_json JSONB,
      chat_id INTEGER,
      message_id INTEGER,
      active_membership_key TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_sessions (
      id TEXT PRIMARY KEY,
      party_session_id TEXT NOT NULL,
      leader_character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      rules_version TEXT NOT NULL,
      boss_key TEXT NOT NULL,
      state_json JSONB NOT NULL,
      result_json JSONB,
      turn_expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      actor_character_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      action_key TEXT NOT NULL,
      result_json JSONB,
      submitted_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX party_sessions_invite_token_key ON party_sessions(invite_token)`,
    `CREATE UNIQUE INDEX party_sessions_active_leader_key_key ON party_sessions(active_leader_key)`,
    `CREATE INDEX party_sessions_status_expires_at_idx ON party_sessions(status, expires_at)`,
    `CREATE UNIQUE INDEX party_participants_active_membership_key_key ON party_participants(active_membership_key)`,
    `CREATE UNIQUE INDEX party_participants_session_id_character_id_key ON party_participants(session_id, character_id)`,
    `CREATE INDEX party_participants_character_id_status_idx ON party_participants(character_id, status)`,
    `CREATE INDEX party_participants_session_id_status_idx ON party_participants(session_id, status)`,
    `CREATE UNIQUE INDEX party_boss_sessions_party_session_id_key ON party_boss_sessions(party_session_id)`,
    `CREATE UNIQUE INDEX party_boss_actions_session_id_turn_actor_character_id_key ON party_boss_actions(session_id, turn, actor_character_id)`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, key)
    )`,
    `CREATE TABLE hunt_contracts (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      local_period_id TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      contract_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'posted',
      completed_action TEXT,
      reward_xp INTEGER,
      reward_gold INTEGER,
      reward_items_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, local_period_id)
    )`,
    `CREATE TABLE barrel_raid_notifications (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      telegram_user_id BIGINT NOT NULL,
      chat_id BIGINT NOT NULL,
      period_id TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      processing_started_at DATETIME,
      reward_claimed_at DATETIME,
      sent_at DATETIME,
      skipped_at DATETIME,
      last_error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(telegram_user_id, period_id)
    )`,
    `CREATE TABLE character_drink_states (
      id TEXT PRIMARY KEY,
      activation_id TEXT NOT NULL UNIQUE,
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
    `CREATE TABLE korchma_drink_orders (
      id TEXT PRIMARY KEY,
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
      id TEXT PRIMARY KEY,
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
      id TEXT PRIMARY KEY,
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
    `CREATE TABLE korchma_mantok_sales (
      id TEXT PRIMARY KEY,
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
      id TEXT PRIMARY KEY,
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
      id TEXT PRIMARY KEY,
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
    )`,
    `CREATE TABLE solo_combat_sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      state_json JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      reward_xp INTEGER,
      reward_gold INTEGER,
      reward_items_json JSONB,
      reward_claimed_at DATETIME,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE pending_passage_encounters (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      origin_location_id TEXT NOT NULL,
      passage TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      base_monster_level INTEGER NOT NULL,
      effective_monster_level INTEGER NOT NULL,
      rules_version TEXT NOT NULL,
      seed_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      active_key TEXT UNIQUE,
      version INTEGER NOT NULL DEFAULT 1,
      combat_session_id TEXT,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME,
      cancelled_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE mantok_chest_runs (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input_items_json JSONB NOT NULL,
      output_items_json JSONB,
      average_input_score INTEGER NOT NULL,
      minimum_output_score INTEGER NOT NULL,
      output_score INTEGER,
      completed_at DATETIME,
      expired_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE level_barter_exchanges (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      levels_spent INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      next_xp INTEGER NOT NULL,
      reward_gold INTEGER NOT NULL,
      reward_items_json JSONB NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function seedCharacter(
  prisma: PrismaClient,
  input: { userId: string; characterId: string; telegramUserId: bigint }
): Promise<void> {
  await prisma.user.create({
    data: {
      id: input.userId,
      telegramUserId: input.telegramUserId,
      lastSeenLocationId: "location.korchma.hall"
    }
  });
  await prisma.character.create({
    data: {
      id: input.characterId,
      userId: input.userId,
      name: "Shannar de Kassal",
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 13,
      xp: 1300,
      gold: 587,
      hpCurrent: 44,
      hpMax: 66,
      manaCurrent: 7,
      manaMax: 32,
      statsJson: {
        strength: 9,
        dexterity: 8,
        intelligence: 7,
        charisma: 6,
        luck: 5
      }
    }
  });
}

async function seedDraft(
  prisma: PrismaClient,
  characterId: string,
  token: string,
  now: Date
): Promise<void> {
  await prisma.characterRemortDraft.create({
    data: {
      id: `draft-${token}`,
      characterId,
      token,
      selectedIdentityJson: {
        pronoun: "she",
        raceId: "race.human-ish",
        classId: "class.mage"
      },
      selectedItemsJson: [],
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      createdAt: now,
      updatedAt: now
    }
  });
}

function makeSatedPayload(characterId: string, startedAt: Date): VarenykSatedPayloadV1 {
  return {
    kind: "varenyk-sated-support-v1",
    version: 1,
    activationId: `${characterId}-sated`,
    actorCharacterId: characterId,
    actorRemortCount: 0,
    recipientCharacterId: characterId,
    recipientRemortCount: 0,
    rank: 1,
    manaCost: 8,
    effectiveStats: { intelligence: 8, charisma: 8, level: 3, equipmentItemIds: [] },
    startedAt: startedAt.toISOString(),
    expiresAt: new Date(startedAt.getTime() + 13 * 60_000).toISOString(),
    availableAt: new Date(startedAt.getTime() + 93 * 60_000).toISOString(),
    cursorAt: startedAt.toISOString(),
    receipt: {
      version: 1,
      previewToken: `${characterId}-preview`,
      actorTelegramUserId: "9316",
      targetTelegramUserId: "9316",
      actorName: "Пан Вареник",
      targetName: "Пан Вареник",
      immediateHpRestored: 0,
      immediateManaRestored: 0,
      actorManaAfter: 12,
      targetHpAfter: 44,
      targetManaAfter: 7
    }
  };
}

function makeFrozenSated(payload: VarenykSatedPayloadV1, leaseStartedAt: Date) {
  return {
    version: 1 as const,
    activationId: payload.activationId,
    recipientCharacterId: payload.recipientCharacterId,
    recipientRemortCount: payload.recipientRemortCount,
    rank: payload.rank,
    expiresAt: payload.expiresAt,
    cursorAt: leaseStartedAt.toISOString(),
    leaseStartedAt: leaseStartedAt.toISOString(),
    outsideRemainderMs: 30_000,
    pulseIds: []
  };
}

async function seedPostalTransfer(
  prisma: PrismaClient,
  input: {
    id: string;
    token: string;
    senderCharacterId: string;
    receiverCharacterId: string;
    senderTelegramUserId: bigint;
    receiverTelegramUserId: bigint;
    status: "draft" | "pending";
    itemId: string;
    quantity: number;
    now: Date;
    postalCustody?: "sender-debited";
  }
): Promise<void> {
  await prisma.itemTransfer.create({
    data: {
      id: input.id,
      token: input.token,
      transferKind: "postal",
      senderCharacterId: input.senderCharacterId,
      receiverCharacterId: input.receiverCharacterId,
      senderTelegramUserId: input.senderTelegramUserId,
      receiverTelegramUserId: input.receiverTelegramUserId,
      senderName: "Ремортний відправник",
      receiverName: "Поштовий отримувач",
      senderRemortCount: 0,
      receiverRemortCount: 0,
      itemId: input.itemId,
      itemName: "Ремортна поштова манатка",
      itemFingerprint: `${input.itemId}-fingerprint`,
      quantity: input.quantity,
      packageJson: [{
        itemId: input.itemId,
        itemName: "Ремортна поштова манатка",
        quantity: input.quantity,
        itemFingerprint: `${input.itemId}-fingerprint`,
        unitGoldValue: 17,
        observedQuantity: input.quantity,
        tags: []
      }],
      deliveryFeeGold: 6,
      status: input.status,
      reservationKey: input.status === "pending" ? `postal:${input.senderCharacterId}` : null,
      resultJson: input.postalCustody
        ? {
            kind: "postal-test-pending",
            postalCustody: input.postalCustody
          }
        : {
            kind: "postal-test-draft"
          },
      expiresAt: new Date(input.now.getTime() + 5 * 60_000)
    }
  });
}

async function seedPassage(
  prisma: PrismaClient,
  input: {
    id: string;
    token: string;
    characterId: string;
    status: string;
    expiresAt: Date;
    activeKey?: string | null;
    combatSessionId?: string | null;
    consumedAt?: Date | null;
    cancelledAt?: Date | null;
    version?: number;
  }
): Promise<void> {
  await prisma.pendingPassageEncounter.create({
    data: {
      id: input.id,
      token: input.token,
      characterId: input.characterId,
      originLocationId: "location.korchma.deep.level1.straight",
      passage: "deep-straight",
      difficulty: "normal",
      monsterId: "monster.deadline-spider",
      baseMonsterLevel: 3,
      effectiveMonsterLevel: 3,
      rulesVersion: "nyz-passage-preview-v1",
      seedHash: `seed-${input.id}`,
      status: input.status,
      activeKey: input.activeKey ?? null,
      combatSessionId: input.combatSessionId ?? null,
      consumedAt: input.consumedAt ?? null,
      cancelledAt: input.cancelledAt ?? null,
      version: input.version ?? 1,
      expiresAt: input.expiresAt
    }
  });
}

function makeCompletionInput(token: string, now: Date): RemortCompletionInput {
  return {
    token,
    now,
    validate: () => ({
      state: "ready",
      identity: {
        pronoun: "she",
        raceId: "race.human-ish",
        classId: "class.mage"
      },
      selectedItems: [],
      keptItems: [],
      remortNumber: 1,
      memoryRank: 1,
      hpBonus: 6,
      manaBonus: 2,
      statBonuses: [{ stat: "intelligence", bonus: 1 }],
      statBonus: { stat: "intelligence", bonus: 1 },
      hpCurrent: 31,
      hpMax: 31,
      manaCurrent: 12,
      manaMax: 12,
      statsJson: {
        strength: 4,
        dexterity: 5,
        intelligence: 9,
        charisma: 6,
        luck: 7
      }
    })
  };
}

function makeCombatState(
  id: string,
  options: { turn?: number; turnExpiresAt?: string } = {}
): CombatState {
  return {
    id,
    source: "training",
    turn: options.turn ?? 1,
    status: "active",
    ...(options.turnExpiresAt ? { turnExpiresAt: options.turnExpiresAt } : {}),
    hero: {
      hp: 9,
      hpMax: 66,
      mana: 3,
      manaMax: 32
    },
    monster: {
      id: "monster.deadline-spider",
      level: 9,
      hp: 17,
      hpMax: 43
    },
    context: {
      chatId: "9301",
      messageId: 587
    },
    message: {
      chatId: "9301",
      messageId: 588
    },
    monsterRuntime: {
      cooldowns: {}
    },
    turnLog: [
      {
        eventId: "turn:2",
        turn: 2,
        summary: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 8,
          monsterDamage: 12,
          manaSpent: 0,
          critical: false
        },
        hero: {
          hp: 9,
          mana: 3
        },
        monster: {
          hp: 17
        }
      }
    ]
  };
}

function makeConsumeInput(sessionId: string, now: Date) {
  return {
    sessionId,
    expectedEncounterVersion: 2,
    expectedLinkedSessionId: null,
    monsterId: "monster.deadline-spider",
    state: makeCombatState(sessionId),
    sessionExpiresAt: new Date(now.getTime() + 30 * 60_000),
    now
  };
}
