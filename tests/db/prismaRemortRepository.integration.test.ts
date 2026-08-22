import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPendingPassageEncounterRepository } from "../../src/db/repositories/prismaPendingPassageEncounterRepository";
import { PrismaPartyBossRepository } from "../../src/db/repositories/prismaPartyBossRepository";
import { PrismaRemortRepository } from "../../src/db/repositories/prismaRemortRepository";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaClassNoncombatRepository } from "../../src/db/repositories/prismaClassNoncombatRepository";
import { PrismaEquipmentRepository } from "../../src/db/repositories/prismaEquipmentRepository";
import type { CharacterRepository } from "../../src/db/repositories/characterRepository";
import type { RemortCompletionInput } from "../../src/db/repositories/remortRepository";
import type { CombatState } from "../../src/domain/combat";
import { PrismaPartyRaidChatTransactionWriter } from "../../src/db/repositories/prismaPartyRaidChatEvents";
import {
  PARTY_RAID_CHAT_RETENTION_MS,
} from "../../src/db/repositories/partyRaidChatRepository";
import { PrismaPartyRaidChatRepository } from "../../src/db/repositories/prismaPartyRaidChatRepository";
import { HeroService } from "../../src/services/heroService";
import {
  VARENYK_SATED_STATUS_KEY,
  type VarenykSatedPayloadV1
} from "../../src/domain/noncombat/varenykSatedSupport";
import {
  DAILY_KORCHMA_ROUND_OFFER_KEY,
  DAILY_KORCHMA_ROUND_REWARD_KEY,
  DAILY_KORCHMA_ROUND_STEP_KEY
} from "../../src/services/dailyActionKeys";

describe("PrismaRemortRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaRemortRepository;
  let passages: PrismaPendingPassageEncounterRepository;
  let partyBosses: PrismaPartyBossRepository;

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
    await applyRaidChatMigration(prisma);
    await applyGuildMigration(prisma);
    const raidChat = new PrismaPartyRaidChatTransactionWriter(true);
    repository = new PrismaRemortRepository(prisma, undefined, raidChat);
    passages = new PrismaPendingPassageEncounterRepository(prisma);
    partyBosses = new PrismaPartyBossRepository(prisma, undefined, raidChat);
  }, 60_000);

  it("preserves User-level guild membership and leadership through a real remort", async () => {
    const now = new Date("2026-08-02T20:00:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-guild-leader",
      characterId: "character-remort-guild-leader",
      telegramUserId: 9350n
    });
    await seedDraft(prisma, "character-remort-guild-leader", "token-remort-guild-leader", now);
    await prisma.guild.create({
      data: {
        id: "guild-remort-leader",
        normalizedName: "ремортна печатка",
        reservationKey: "ремортна печатка",
        displayName: "Ремортна Печатка",
        crest: "🛡️",
        description: "",
        founderUserId: "user-remort-guild-leader",
        leaderUserId: "user-remort-guild-leader",
        status: "active",
        charterExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
        members: {
          create: {
            id: "guild-remort-leader-membership",
            userId: "user-remort-guild-leader",
            activeUserKey: "user-remort-guild-leader",
            role: "leader",
            joinedAt: now,
            createdAt: now,
            updatedAt: now
          }
        }
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9350n,
      makeCompletionInput("token-remort-guild-leader", now)
    )).resolves.toMatchObject({ state: "completed" });

    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: "guild-remort-leader" },
      select: {
        leaderUserId: true,
        members: { where: { activeUserKey: { not: null } }, select: { userId: true, role: true } }
      }
    })).resolves.toEqual({
      leaderUserId: "user-remort-guild-leader",
      members: [{ userId: "user-remort-guild-leader", role: "leader" }]
    });
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "character-remort-guild-leader" },
      select: { level: true }
    })).resolves.toEqual({ level: 1 });
  });

  it("preserves exact Daily Korchma ledgers while removing generic daily state in a real remort", async () => {
    const now = new Date("2026-08-22T10:00:00.000Z");
    const characterId = "character-remort-korchma-ledger";
    await seedCharacter(prisma, {
      userId: "user-remort-korchma-ledger",
      characterId,
      telegramUserId: 9351n
    });
    await seedDraft(prisma, characterId, "token-remort-korchma-ledger", now);
    await prisma.dailyAction.createMany({
      data: [
        {
          id: "daily-remort-korchma-offer",
          characterId,
          key: DAILY_KORCHMA_ROUND_OFFER_KEY,
          localDate: "2026-08-22",
          rewardXp: 0,
          rewardGold: 0,
          spentGold: 0,
          resultJson: { kind: "offer" }
        },
        {
          id: "daily-remort-korchma-step",
          characterId,
          key: DAILY_KORCHMA_ROUND_STEP_KEY,
          localDate: "2026-08-22:scene-1",
          rewardXp: 0,
          rewardGold: 0,
          spentGold: 0,
          resultJson: { kind: "step" }
        },
        {
          id: "daily-remort-korchma-reward",
          characterId,
          key: DAILY_KORCHMA_ROUND_REWARD_KEY,
          localDate: "2026-08-22",
          rewardXp: 0,
          rewardGold: 0,
          spentGold: 0,
          resultJson: { kind: "reward", appliedItemGrants: [] }
        },
        {
          id: "daily-remort-generic",
          characterId,
          key: "generic.remort-reset",
          localDate: "2026-08-22",
          rewardXp: 0,
          rewardGold: 0,
          spentGold: 0,
          resultJson: { kind: "generic" }
        }
      ]
    });

    await expect(repository.completeDraftForTelegramUser(
      9351n,
      makeCompletionInput("token-remort-korchma-ledger", now)
    )).resolves.toMatchObject({ state: "completed" });

    await expect(prisma.dailyAction.findMany({
      where: { characterId },
      orderBy: [{ key: "asc" }, { localDate: "asc" }],
      select: { key: true, localDate: true }
    })).resolves.toEqual([
      { key: DAILY_KORCHMA_ROUND_OFFER_KEY, localDate: "2026-08-22" },
      { key: DAILY_KORCHMA_ROUND_REWARD_KEY, localDate: "2026-08-22" },
      { key: DAILY_KORCHMA_ROUND_STEP_KEY, localDate: "2026-08-22:scene-1" }
    ]);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
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
      INSERT INTO daily_actions (id, character_id, key, local_date, reward_xp, reward_gold, result_json, created_at)
      VALUES ('daily-remort-bandage', 'character-remort-solo', 'yeger.bandage.purchase.confirm', '2026-06-22', 0, 0, '{}', ${new Date(now.getTime() - 60_000)})
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
    await prisma.$executeRawUnsafe(
      "INSERT INTO bard_performances (id, character_id, status, live_guard) VALUES (?, ?, 'active', ?)",
      "performance-remort-live",
      "character-remort-solo",
      "character-remort-solo:0:location.korchma.bar"
    );
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
    await expect(prisma.$queryRawUnsafe<Array<{ status: string; live_guard: string | null }>>(
      "SELECT status, live_guard FROM bard_performances WHERE id = ?",
      "performance-remort-live"
    )).resolves.toEqual([{ status: "expired", live_guard: null }]);
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

  it("blocks remort while a group-combat lease owns the current life", async () => {
    const now = new Date("2026-06-22T11:30:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-remort-group-combat",
      characterId: "character-remort-group-combat",
      telegramUserId: 9308n
    });
    await seedDraft(prisma, "character-remort-group-combat", "token-remort-group-combat", now);
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-remort-group-combat",
        characterId: "character-remort-group-combat",
        kind: "group-combat",
        referenceId: "group-combat-session"
      }
    });

    await expect(repository.completeDraftForTelegramUser(
      9308n,
      makeCompletionInput("token-remort-group-combat", now)
    )).resolves.toEqual({ state: "active-combat" });
    await expect(prisma.characterRemort.count({ where: { characterId: "character-remort-group-combat" } })).resolves.toBe(0);
    await expect(prisma.activeCombatLease.count({ where: { characterId: "character-remort-group-combat" } })).resolves.toBe(1);
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

  it("terminalizes only the actor's due Big Barrel chat during remort", async () => {
    const now = new Date("2026-06-22T12:30:00.000Z");
    const joinedAt = new Date(now.getTime() - 14 * 60_000);
    const actorId = "character-remort-due-chat";
    const survivorId = "character-remort-due-chat-survivor";
    const partyId = "party-remort-due-chat";
    const inviteToken = "party-remort-due-chat-token";
    const unrelatedLeaderId = "character-remort-due-chat-unrelated-leader";
    const unrelatedMemberId = "character-remort-due-chat-unrelated-member";
    const unrelatedPartyId = "party-remort-due-chat-unrelated";
    await seedCharacter(prisma, {
      userId: "user-remort-due-chat",
      characterId: actorId,
      telegramUserId: 99304n
    });
    await seedDraft(prisma, actorId, "token-remort-due-chat", now);
    await seedCharacter(prisma, {
      userId: "user-remort-due-chat-survivor",
      characterId: survivorId,
      telegramUserId: 99305n
    });
    await seedCharacter(prisma, {
      userId: "user-remort-due-chat-unrelated-leader",
      characterId: unrelatedLeaderId,
      telegramUserId: 99306n
    });
    await seedCharacter(prisma, {
      userId: "user-remort-due-chat-unrelated-member",
      characterId: unrelatedMemberId,
      telegramUserId: 99307n
    });
    await seedRecruitingBigBarrel(prisma, {
      partyId,
      inviteToken,
      actorId,
      survivorId,
      joinedAt
    });
    await seedRecruitingBigBarrel(prisma, {
      partyId: unrelatedPartyId,
      inviteToken: "party-remort-due-chat-unrelated-token",
      actorId: unrelatedLeaderId,
      survivorId: unrelatedMemberId,
      joinedAt
    });
    const writer = new PrismaPartyRaidChatTransactionWriter(true);
    await prisma.$transaction((tx) => writer.append(tx, {
      partySessionId: partyId,
      eventType: "party.created",
      sourceKey: `${partyId}:created`,
      occurredAt: joinedAt
    }));
    await prisma.$transaction((tx) => writer.append(tx, {
      partySessionId: unrelatedPartyId,
      eventType: "party.created",
      sourceKey: `${unrelatedPartyId}:created`,
      occurredAt: joinedAt
    }));
    const chat = new PrismaPartyRaidChatRepository(prisma);
    const begun = await chat.beginCompose(99304n, inviteToken, 99304n, now);
    if (begun.state !== "created") {
      throw new Error("Composer setup failed.");
    }
    await chat.bindComposePrompt(begun.intentId, begun.version, 42, now);
    await expect(chat.requestRecruitingRefresh(99304n, inviteToken, now)).resolves.toBe(true);
    await expect(chat.requestRecruitingRefresh(99304n, inviteToken, now)).resolves.toBe(true);

    await expect(repository.completeDraftForTelegramUser(
      99304n,
      makeCompletionInput("token-remort-due-chat", now)
    )).resolves.toMatchObject({ state: "completed" });

    await expect(prisma.partySession.findUniqueOrThrow({
      where: { id: partyId },
      select: { status: true, raidChatRetentionUntil: true }
    })).resolves.toEqual({
      status: "expired",
      raidChatRetentionUntil: new Date(now.getTime() + PARTY_RAID_CHAT_RETENTION_MS)
    });
    await expect(prisma.partySession.findUniqueOrThrow({
      where: { id: unrelatedPartyId },
      select: { status: true, raidChatRetentionUntil: true }
    })).resolves.toEqual({
      status: "recruiting",
      raidChatRetentionUntil: null
    });
    await expect(prisma.partyRaidChatEntry.count({
      where: { partySessionId: partyId, eventType: "raid.expired" }
    })).resolves.toBe(1);
    await expect(prisma.partyRaidChatComposeIntent.findUniqueOrThrow({
      where: { id: begun.intentId },
      select: { status: true, activeKey: true }
    })).resolves.toEqual({ status: "cancelled", activeKey: null });
    await expect(prisma.partyRaidChatDeliveryState.findFirstOrThrow({
      where: { participant: { characterId: actorId } },
      select: { surfaceMode: true, redactionRequired: true }
    })).resolves.toEqual({ surfaceMode: "terminal_read_only", redactionRequired: true });
    await expect(prisma.partyRaidChatDeliveryState.count({
      where: { participant: { characterId: actorId } }
    })).resolves.toBe(1);
    await expect(prisma.partyRaidChatDeliveryState.findFirstOrThrow({
      where: { participant: { characterId: unrelatedLeaderId } },
      select: { surfaceMode: true, redactionRequired: true }
    })).resolves.toEqual({ surfaceMode: "recruiting_embed", redactionRequired: false });
    await expect(prisma.partyRaidChatEntry.count({
      where: { partySessionId: unrelatedPartyId, eventType: "raid.expired" }
    })).resolves.toBe(0);
    await expect(prisma.partyParticipant.count({
      where: { sessionId: { in: [partyId, unrelatedPartyId] }, activeMembershipKey: { not: null } }
    })).resolves.toBe(2);
  });

  it("keeps the Big Barrel and frozen Sated state intact when a participant tries to remort", async () => {
    const startAt = new Date("2026-06-22T12:25:00.000Z");
    const now = new Date("2026-06-22T12:30:00.000Z");
    const actorId = "character-remort-party-boss";
    const survivorId = "character-remort-party-survivor";
    await seedCharacter(prisma, {
      userId: "user-remort-party-boss",
      characterId: actorId,
      telegramUserId: 9315n
    });
    await seedDraft(prisma, actorId, "token-remort-party-boss", now);
    await seedCharacter(prisma, {
      userId: "user-remort-party-survivor",
      characterId: survivorId,
      telegramUserId: 9316n
    });
    await prisma.character.update({
      where: { id: survivorId },
      data: {
        hpCurrent: 112,
        manaCurrent: 54,
        hpRegenAt: new Date(startAt.getTime() - 60 * 60_000),
        manaRegenAt: new Date(startAt.getTime() - 60 * 60_000)
      }
    });
    const survivorPayload = makeSatedPayload(
      survivorId,
      new Date(startAt.getTime() - 2 * 60_000 - 30_000)
    );
    await prisma.characterCooldown.create({
      data: {
        characterId: survivorId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(survivorPayload.availableAt),
        resultJson: survivorPayload
      }
    });
    await seedRecruitingBigBarrel(prisma, {
      partyId: "party-remort-boss",
      inviteToken: "party-remort-boss-token",
      actorId,
      survivorId,
      joinedAt: startAt
    });
    const started = await partyBosses.startFromRecruitingPartyForTelegramUser(9315n, {
      partyInviteToken: "party-remort-boss-token",
      now: startAt,
      turnExpiresAt: new Date(startAt.getTime() + 23_000)
    });
    expect(started.state).toBe("started");
    const leasesAtStart = await prisma.activeCombatLease.findMany({
      where: { kind: "party-boss", referenceId: "party-remort-boss" }
    });
    expect(leasesAtStart).toHaveLength(2);
    expect(leasesAtStart.every((lease) => lease.createdAt.getTime() === startAt.getTime())).toBe(true);
    await expect(prisma.character.findUnique({ where: { id: survivorId } })).resolves.toMatchObject({
      hpCurrent: 114,
      manaCurrent: 56,
      hpRegenAt: startAt,
      manaRegenAt: startAt
    });
    const frozenCursorAtStart = ((await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: survivorId, key: VARENYK_SATED_STATUS_KEY } }
    })).resultJson as unknown as VarenykSatedPayloadV1).cursorAt;

    await expect(repository.completeDraftForTelegramUser(
      9315n,
      makeCompletionInput("token-remort-party-boss", now)
    )).resolves.toEqual({ state: "active-combat" });
    const bossSession = await prisma.partyBossSession.findUnique({
      where: { partySessionId: "party-remort-boss" }
    });
    const bossResult = bossSession?.resultJson;

    expect(bossSession?.status).toBe("active");
    expect(bossResult).toBeNull();
    await expect(prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: "party-remort-boss" } })).resolves.toBe(2);
    await expect(prisma.partyParticipant.findUnique({ where: { id: "participant-remort-party-boss" } })).resolves.toMatchObject({
      activeMembershipKey: "party-member:character-remort-party-boss"
    });
    await expect(prisma.character.findUnique({ where: { id: survivorId } })).resolves.toMatchObject({
      hpCurrent: 114,
      manaCurrent: 56,
      hpRegenAt: startAt,
      manaRegenAt: startAt
    });
    const survivorCooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: survivorId, key: VARENYK_SATED_STATUS_KEY } }
    });
    const frozenPayload = survivorCooldown.resultJson as unknown as VarenykSatedPayloadV1;
    expect(frozenPayload.cursorAt).toBe(frozenCursorAtStart);
  });

  it("serializes real remort confirmation against PartyBoss start without SQLite timeout or mixed-life leases", async () => {
    const now = new Date("2026-06-22T12:40:00.000Z");
    const actorId = "character-remort-start-race";
    const survivorId = "character-remort-start-race-survivor";
    await seedCharacter(prisma, {
      userId: "user-remort-start-race",
      characterId: actorId,
      telegramUserId: 99321n
    });
    await seedCharacter(prisma, {
      userId: "user-remort-start-race-survivor",
      characterId: survivorId,
      telegramUserId: 99322n
    });
    await seedDraft(prisma, actorId, "token-remort-start-race", now);
    await seedRecruitingBigBarrel(prisma, {
      partyId: "party-remort-start-race",
      inviteToken: "party-remort-start-race-token",
      actorId,
      survivorId,
      joinedAt: now
    });

    const outcomes = await Promise.allSettled([
      repository.completeDraftForTelegramUser(99321n, makeCompletionInput("token-remort-start-race", now)),
      partyBosses.startFromRecruitingPartyForTelegramUser(99321n, {
        partyInviteToken: "party-remort-start-race-token",
        now,
        turnExpiresAt: new Date(now.getTime() + 23_000)
      })
    ]);
    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    const remort = outcomes[0].status === "fulfilled" ? outcomes[0].value : null;
    const start = outcomes[1].status === "fulfilled" ? outcomes[1].value : null;
    const remortWon = remort?.state === "completed";
    const startWon = start?.state === "started" || start?.state === "already-active";
    expect(Number(remortWon) + Number(startWon)).toBe(1);
    if (startWon) {
      expect(remort).toEqual({ state: "active-combat" });
    } else {
      expect(["terminal-ineligible", "not-recruiting", "ineligible", "not-leader"]).toContain(start?.state);
    }

    const activeBoss = await prisma.partyBossSession.findFirst({
      where: { partySessionId: "party-remort-start-race", status: "active" }
    });
    const leases = await prisma.activeCombatLease.findMany({
      where: { kind: "party-boss", referenceId: "party-remort-start-race" }
    });
    if (activeBoss) {
      const state = activeBoss.stateJson as unknown as { participants: Array<{ characterId: string; remortCount: number }> };
      const liveRemorts = await prisma.characterRemort.groupBy({
        by: ["characterId"],
        where: { characterId: { in: state.participants.map((participant) => participant.characterId) } },
        _count: { _all: true }
      });
      const counts = new Map(liveRemorts.map((row) => [row.characterId, row._count._all]));
      expect(state.participants.every((participant) => participant.remortCount === (counts.get(participant.characterId) ?? 0))).toBe(true);
      expect(leases).toHaveLength(state.participants.length);
    } else {
      expect(leases).toEqual([]);
    }
  });

  it("returns only the new-life Hero snapshot when real remort deletes Sated between preliminary Character and absence guard", async () => {
    const now = new Date("2026-07-15T09:00:00.000Z");
    const telegramUserId = 9320n;
    const characterId = "character-remort-public-sated";
    await seedCharacter(prisma, {
      userId: "user-remort-public-sated",
      characterId,
      telegramUserId
    });
    await prisma.character.update({
      where: { id: characterId },
      data: {
        classId: "class.varenyk-mancer",
        hpRegenAt: now,
        manaRegenAt: now
      }
    });
    await prisma.characterEquipment.create({
      data: {
        id: "equipment-remort-public-sated",
        characterId,
        slot: "head",
        itemId: "item.mantok.coverage.class.varenyk-mancer.dough-crown"
      }
    });
    const payload = makeSatedPayload(characterId, new Date(now.getTime() - 60_000));
    await prisma.characterCooldown.create({
      data: {
        id: "cooldown-remort-public-sated",
        characterId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    await seedDraft(prisma, characterId, "token-remort-public-sated", now);
    let remortResult: Awaited<ReturnType<PrismaRemortRepository["completeDraftForTelegramUser"]>> | null = null;
    const characters = withFirstCharacterReadInterleaving(
      new PrismaCharacterRepository(prisma),
      async () => {
        remortResult = await repository.completeDraftForTelegramUser(
          telegramUserId,
          makeCompletionInput("token-remort-public-sated", now)
        );
      }
    );
    const satedRepository = new PrismaClassNoncombatRepository(prisma);
    let satedSettlement: Awaited<
      ReturnType<PrismaClassNoncombatRepository["settleVarenykSatedForTelegramUser"]>
    > = null;
    const hero = new HeroService(
      characters,
      { listByTelegramUserId: () => Promise.resolve([]) },
      new PrismaEquipmentRepository(prisma),
      repository,
      undefined,
      () => now,
      undefined,
      {
        settleVarenykSatedForTelegramUser: async (...args) => {
          satedSettlement = await satedRepository.settleVarenykSatedForTelegramUser(...args);
          return satedSettlement;
        },
        getActivePriestBlessingForTelegramUser: () => Promise.resolve(null),
        getPriestSelfBlessAvailableAtForTelegramUser: () => Promise.resolve(null),
        isActorBlockedForTelegramUser: () => Promise.resolve(false)
      }
    );

    const result = await hero.findByTelegramUserId(telegramUserId);
    expect(remortResult).toMatchObject({ state: "completed" });
    expect(satedSettlement).toMatchObject({
      character: {
        id: characterId,
        classId: "class.mage",
        hpCurrent: 31,
        hpMax: 31,
        manaCurrent: 12,
        manaMax: 12,
        remortCount: 1
      },
      payload: null,
      hpRestored: 0,
      manaRestored: 0
    });
    expect(result).toMatchObject({
      state: "existing-character",
      character: {
        classId: "class.mage",
        level: 1,
        hpCurrent: 31,
        hpMax: 31,
        manaCurrent: 12,
        manaMax: 12,
        remortCount: 1,
        stats: { intelligence: 10 }
      },
      activeVarenykSated: null,
      varenykSatedAvailableAt: null,
      satedRecovery: null
    });
    expect(result).not.toHaveProperty("recoveryNotice");
    await expect(prisma.character.findUnique({ where: { id: characterId } })).resolves.toMatchObject({
      classId: "class.mage",
      hpCurrent: 31,
      hpMax: 31,
      manaCurrent: 12,
      manaMax: 12,
      hpRegenAt: null,
      manaRegenAt: null,
      statsJson: { intelligence: 9 }
    });
    await expect(prisma.characterRemort.count({ where: { characterId } })).resolves.toBe(1);
    await expect(prisma.characterEquipment.count({ where: { characterId } })).resolves.toBe(0);
    await expect(prisma.characterCooldown.findUnique({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    })).resolves.toBeNull();
  });

  it("blocks participant remort during an active Big Barrel without changing the raid", async () => {
    const startAt = new Date("2026-06-22T15:00:00.000Z");
    const now = new Date("2026-06-22T15:00:20.000Z");
    const actorId = "character-remort-party-round-actor";
    const survivorId = "character-remort-party-round-survivor";
    await seedCharacter(prisma, { userId: "user-remort-party-round-actor", characterId: actorId, telegramUserId: 9317n });
    await seedCharacter(prisma, { userId: "user-remort-party-round-survivor", characterId: survivorId, telegramUserId: 9318n });
    await seedDraft(prisma, actorId, "token-remort-party-round", now);
    await prisma.character.update({
      where: { id: survivorId },
      data: {
        hpCurrent: 112,
        manaCurrent: 54,
        hpRegenAt: new Date(startAt.getTime() - 60 * 60_000),
        manaRegenAt: new Date(startAt.getTime() - 60 * 60_000)
      }
    });
    const payload = makeSatedPayload(survivorId, new Date(startAt.getTime() - 2 * 60_000 - 30_000));
    await prisma.characterCooldown.create({
      data: {
        characterId: survivorId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    await seedRecruitingBigBarrel(prisma, {
      partyId: "party-remort-after-round",
      inviteToken: "party-remort-after-round-token",
      actorId,
      survivorId,
      joinedAt: startAt
    });
    const started = await partyBosses.startFromRecruitingPartyForTelegramUser(9317n, {
      partyInviteToken: "party-remort-after-round-token",
      now: startAt,
      turnExpiresAt: new Date(startAt.getTime() + 23_000)
    });
    expect(started.state).toBe("started");
    await partyBosses.submitActionForTelegramUser(9317n, "party-remort-after-round-token", 1, "attack", {
      now: new Date(startAt.getTime() + 10_000),
      nextTurnExpiresAt: new Date(startAt.getTime() + 33_000)
    });
    const resolved = await partyBosses.submitActionForTelegramUser(9318n, "party-remort-after-round-token", 1, "defend", {
      now: new Date(startAt.getTime() + 11_000),
      nextTurnExpiresAt: new Date(startAt.getTime() + 34_000)
    });
    expect(resolved.state).toBe("resolved");
    await expect(prisma.character.findUnique({ where: { id: survivorId } })).resolves.toMatchObject({
      hpCurrent: 114,
      manaCurrent: 56,
      hpRegenAt: startAt,
      manaRegenAt: startAt
    });

    const characters = new PrismaCharacterRepository(prisma);
    await expect(characters.restartByTelegramUserId(9317n)).resolves.toBe("active-combat");
    await expect(characters.restartByTelegramUserId(9318n)).resolves.toBe("active-combat");
    await expect(prisma.character.count({ where: { id: { in: [actorId, survivorId] } } })).resolves.toBe(2);

    const first = await repository.completeDraftForTelegramUser(9317n, makeCompletionInput("token-remort-party-round", now));
    const retry = await repository.completeDraftForTelegramUser(9317n, makeCompletionInput("token-remort-party-round", now));

    expect(first).toEqual({ state: "active-combat" });
    expect(retry).toEqual({ state: "active-combat" });
    await expect(prisma.character.findUnique({ where: { id: survivorId } })).resolves.toMatchObject({
      hpCurrent: 114,
      manaCurrent: 56,
      hpRegenAt: startAt,
      manaRegenAt: startAt
    });
    await expect(prisma.activeCombatLease.count({
      where: { kind: "party-boss", referenceId: "party-remort-after-round" }
    })).resolves.toBe(2);
    await expect(prisma.partyBossSession.findUnique({
      where: { partySessionId: "party-remort-after-round" }
    })).resolves.toMatchObject({ status: "active", turn: 2 });
    await expect(prisma.characterRemort.count({ where: { characterId: actorId } })).resolves.toBe(0);
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
      local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL,
      reward_gold INTEGER NOT NULL,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, key, local_date)
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
      origin_kind TEXT,
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
    `CREATE TABLE bard_performances (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      live_guard TEXT,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      reservation_origin TEXT,
      reservation_remort_count INTEGER,
      reserved_monster_hp INTEGER,
      reserved_party_session_id TEXT UNIQUE,
      group_combat_session_id TEXT UNIQUE,
      reserved_at DATETIME,
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

async function applyRaidChatMigration(prisma: PrismaClient): Promise<void> {
  for (const migration of [
    "20260720013000_add_party_raid_chat",
    "20260720171500_add_party_raid_chat_delivery_version",
    "20260721113000_party_boss_round_history"
  ]) {
    const sql = await readFile(resolve(`prisma/migrations/${migration}/migration.sql`), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}

async function applyGuildMigration(prisma: PrismaClient): Promise<void> {
  for (const migration of ["20260802230000_guild_foundation", "20260806120000_guild_custom_crests"]) {
    const sql = await readFile(resolve(`prisma/migrations/${migration}/migration.sql`), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}

function withFirstCharacterReadInterleaving(
  repository: CharacterRepository,
  afterRead: () => Promise<void>
): CharacterRepository {
  let interleaved = false;
  return new Proxy(repository, {
    get(target, property, receiver) {
      if (property === "findByTelegramUserId") {
        return async (telegramUserId: bigint) => {
          const character = await target.findByTelegramUserId(telegramUserId);
          if (!interleaved) {
            interleaved = true;
            await afterRead();
          }
          return character;
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) as unknown : value;
    }
  });
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

async function seedRecruitingBigBarrel(
  prisma: PrismaClient,
  input: {
    partyId: string;
    inviteToken: string;
    actorId: string;
    survivorId: string;
    joinedAt: Date;
  }
): Promise<void> {
  await prisma.partySession.create({
    data: {
      id: input.partyId,
      inviteToken: input.inviteToken,
      status: "recruiting",
      leaderCharacterId: input.actorId,
      periodId: `12026-06-22:${input.partyId}`,
      originLocationId: "barrel.big-brother",
      participantCap: 8,
      minimumParticipants: 1,
      joinUntilAt: new Date(input.joinedAt.getTime() + 13 * 60_000),
      expiresAt: new Date(input.joinedAt.getTime() + 13 * 60_000),
      activeLeaderKey: `party-leader:${input.actorId}`,
      createdAt: input.joinedAt,
      updatedAt: input.joinedAt,
      participants: {
        create: [input.actorId, input.survivorId].map((characterId, index) => ({
          id: `participant-${characterId.replace(/^character-/, "")}`,
          characterId,
          remortCount: 0,
          status: "joined",
          joinSource: index === 0 ? "leader" : "invite",
          joinedAt: input.joinedAt,
          activeMembershipKey: `party-member:${characterId}`
        }))
      }
    }
  });
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
