import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runPartyRaidChatDeliveryTick } from "../../src/bot/partyRaidChatDeliveryScheduler";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import { PrismaPartyRaidChatRepository } from "../../src/db/repositories/prismaPartyRaidChatRepository";
import { PrismaPartyRaidChatTransactionWriter } from "../../src/db/repositories/prismaPartyRaidChatEvents";
import { PartyRaidChatService } from "../../src/services/partyRaidChatService";
import type { PartySessionService } from "../../src/services/partySessionService";

const NOW = new Date("2026-07-20T10:00:00.000Z");

describe("PrismaPartyRaidChatRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaPartyRaidChatRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-raid-chat-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await createLegacyMinimalSchema(prisma);
    await applyRaidChatMigration(prisma);
    repository = new PrismaPartyRaidChatRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("accepts an exact durable composer once without bumping gameplay version", async () => {
    await seedLineage(prisma, "accept", 7001n);
    await addParticipant(prisma, "accept", "recipient", 7014n);
    const begun = await repository.beginCompose(7001n, "raid-accept", 7001n, NOW);
    expect(begun.state).toBe("created");
    if (begun.state !== "created") {
      return;
    }
    await expect(repository.bindComposePrompt(begun.intentId, begun.version, 13, NOW)).resolves.toMatchObject({
      state: "bound"
    });

    const [first, replay] = await Promise.all([
      repository.acceptReply({
        telegramUserId: 7001n,
        privateChatId: 7001n,
        promptMessageId: 13,
        sourceMessageId: 42,
        normalizedBody: "Хало",
        now: NOW
      }),
      repository.acceptReply({
        telegramUserId: 7001n,
        privateChatId: 7001n,
        promptMessageId: 13,
        sourceMessageId: 42,
        normalizedBody: "Хало",
        now: NOW
      })
    ]);

    expect([first.state, replay.state].sort()).toEqual(["accepted", "already-consumed"]);
    const accepted = first.state === "accepted" ? first : replay;
    expect(accepted).toMatchObject({
      state: "accepted",
      notification: {
        authorDisplayName: "Гравець accept",
        body: "Хало",
        recipientTelegramUserIds: [7014n]
      }
    });
    await expect(prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "raid-accept" },
      select: { version: true, chatRevision: true }
    })).resolves.toEqual({ version: 7, chatRevision: 1 });
    expect(await prisma.partyRaidChatEntry.count()).toBe(1);
    await expect(repository.getAuthorizedView(7001n, "raid-accept", NOW)).resolves.toMatchObject({
      entries: [{ body: "Хало", revision: 1 }]
    });
  });

  it("applies duplicate-body before cooldown and keeps outsiders unauthorized", async () => {
    await seedLineage(prisma, "dedupe", 7002n);
    await prisma.user.create({ data: { id: "outsider", telegramUserId: 7999n, currentRaidId: "session-dedupe" } });
    await accept(repository, 7002n, "raid-dedupe", 20, 50, "Йой", NOW);
    const second = await beginAndBind(repository, 7002n, "raid-dedupe", 21, new Date(NOW.getTime() + 1_000));
    const duplicateInput = {
      telegramUserId: 7002n,
      privateChatId: 7002n,
      promptMessageId: second,
      sourceMessageId: 51,
      normalizedBody: "Йой",
      now: new Date(NOW.getTime() + 1_000)
    };
    await expect(repository.acceptReply(duplicateInput)).resolves.toMatchObject({ state: "duplicate-body" });
    await expect(repository.acceptReply(duplicateInput)).resolves.toEqual({ state: "already-consumed" });
    await expect(repository.getAuthorizedView(7999n, "raid-dedupe", NOW)).resolves.toBeNull();
    await expect(prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "raid-dedupe" },
      select: { chatRevision: true }
    })).resolves.toEqual({ chatRevision: 1 });
  });

  it("keeps only 130 stored rows while the newest 13 remain chronological", async () => {
    await seedLineage(prisma, "cap", 7003n);
    expect(await repository.devFillForTelegramUser(7003n, 130, NOW)).toBe(130);
    expect(await repository.devFillForTelegramUser(7003n, 130, NOW)).toBe(130);
    await accept(
      repository,
      7003n,
      "raid-cap",
      23,
      93,
      "Сто тридцять перший рядок",
      new Date(NOW.getTime() + 1_000)
    );
    expect(await prisma.partyRaidChatEntry.count({ where: { partySessionId: "session-cap" } })).toBe(130);
    const view = await repository.getAuthorizedView(7003n, "raid-cap", NOW);
    expect(view?.entries).toHaveLength(13);
    expect(view?.entries.map((entry) => entry.revision)).toEqual(
      Array.from({ length: 13 }, (_, index) => 249 + index)
    );
  });

  it("keeps only the newest composer generation and honors exact cooldown boundaries", async () => {
    await seedLineage(prisma, "composer", 7004n);
    const first = await repository.beginCompose(7004n, "raid-composer", 7004n, NOW);
    const second = await repository.beginCompose(7004n, "raid-composer", 7004n, NOW);
    if (first.state !== "created" || second.state !== "created") {
      throw new Error("Composer setup failed.");
    }
    await expect(repository.bindComposePrompt(first.intentId, first.version, 30, NOW)).resolves.toEqual({ state: "stale" });
    await expect(repository.bindComposePrompt(second.intentId, second.version, 31, NOW)).resolves.toMatchObject({ state: "bound" });
    await expect(repository.acceptReply({
      telegramUserId: 7004n,
      privateChatId: 7004n,
      promptMessageId: 31,
      sourceMessageId: 60,
      normalizedBody: "Перший",
      now: NOW
    })).resolves.toMatchObject({ state: "accepted" });

    const beforeBoundary = new Date(NOW.getTime() + 2_999);
    const throttledPrompt = await beginAndBind(repository, 7004n, "raid-composer", 32, beforeBoundary);
    await expect(repository.acceptReply({
      telegramUserId: 7004n,
      privateChatId: 7004n,
      promptMessageId: throttledPrompt,
      sourceMessageId: 61,
      normalizedBody: "Другий",
      now: beforeBoundary
    })).resolves.toMatchObject({ state: "rate-limited", availableAt: new Date(NOW.getTime() + 3_000) });

    await accept(
      repository,
      7004n,
      "raid-composer",
      33,
      62,
      "Другий",
      new Date(NOW.getTime() + 3_000)
    );
  });

  it("invalidates a bound composer across a quick disabled and re-enabled rollout", async () => {
    await seedLineage(prisma, "quick-rollout", 7013n);
    const rollout = { enabled: true, devHelpersEnabled: false };
    const service = new PartyRaidChatService(repository, rollout, () => NOW);
    const begun = await service.beginCompose(7013n, "raid-quick-rollout", 7013n);
    if (begun.state !== "created") {
      throw new Error("Composer setup failed.");
    }
    await expect(service.bindComposePrompt(begun.intentId, begun.version, 587)).resolves.toMatchObject({
      state: "bound"
    });

    rollout.enabled = false;
    await expect(service.prepareDisabledRedactions()).resolves.toBeGreaterThanOrEqual(1);
    rollout.enabled = true;

    await expect(service.findBoundIntent(7013n, 7013n, 587)).resolves.toBeNull();
    await expect(prisma.partyRaidChatComposeIntent.findUniqueOrThrow({
      where: { id: begun.intentId },
      select: { status: true, activeKey: true }
    })).resolves.toEqual({ status: "cancelled", activeKey: null });
  });

  it("keeps a pre-boss terminal transcript for the final joined roster until the exact retention boundary", async () => {
    await seedLineage(prisma, "terminal", 7005n);
    await accept(repository, 7005n, "raid-terminal", 34, 63, "Запис", NOW);
    const retentionUntil = new Date(NOW.getTime() + 13_000);
    await prisma.partySession.update({
      where: { id: "session-terminal" },
      data: { status: "cancelled", raidChatRetentionUntil: retentionUntil }
    });

    await expect(repository.getAuthorizedView(7005n, "raid-terminal", new Date(retentionUntil.getTime() - 1)))
      .resolves.toMatchObject({ lifecycle: "terminal", writable: false, entries: [{ body: "Запис" }] });
    await expect(repository.getAuthorizedView(7005n, "raid-terminal", retentionUntil)).resolves.toBeNull();
  });

  it("keeps an active knocked-out participant authorized to read and write", async () => {
    await seedLineage(prisma, "knocked-out", 7015n);
    await prisma.partySession.update({
      where: { id: "session-knocked-out" },
      data: { status: "active" }
    });
    const stateJson = JSON.stringify({
      participants: [{
        characterId: "character-knocked-out",
        remortCount: 0,
        status: "knocked-out"
      }]
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "party_boss_sessions" (
        "id", "party_session_id", "leader_character_id", "status", "turn", "version",
        "rules_version", "boss_key", "state_json", "participants_json", "created_at", "updated_at"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "boss-knocked-out",
      "session-knocked-out",
      "character-knocked-out",
      "active",
      1,
      1,
      "big-barrel-brother-v1",
      "big-barrel-brother",
      stateJson,
      stateJson,
      NOW.toISOString(),
      NOW.toISOString()
    );

    await expect(repository.getAuthorizedView(7015n, "raid-knocked-out", NOW)).resolves.toMatchObject({
      lifecycle: "active",
      writable: true,
      viewerCharacterId: "character-knocked-out"
    });
    await accept(repository, 7015n, "raid-knocked-out", 93, 94, "Ще тримаю зв'язок", NOW);
    await expect(repository.getAuthorizedView(7015n, "raid-knocked-out", NOW)).resolves.toMatchObject({
      writable: true,
      entries: [{ body: "Ще тримаю зв'язок" }]
    });
  });

  it("uses a fixed 42-per-93-second lineage window and resets at the exact boundary", async () => {
    await seedLineage(prisma, "window", 7010n);
    await prisma.partyRaidChatRateState.create({
      data: {
        partySessionId: "session-window",
        windowStartedAt: NOW,
        acceptedCount: 42
      }
    });
    const beforeBoundary = new Date(NOW.getTime() + 92_999);
    const promptMessageId = await beginAndBind(repository, 7010n, "raid-window", 37, beforeBoundary);
    const input = {
      telegramUserId: 7010n,
      privateChatId: 7010n,
      promptMessageId,
      sourceMessageId: 66,
      normalizedBody: "На межі",
      now: beforeBoundary
    };

    await expect(repository.acceptReply(input)).resolves.toMatchObject({
      state: "rate-limited",
      availableAt: new Date(NOW.getTime() + 93_000)
    });
    await expect(repository.acceptReply({
      ...input,
      now: new Date(NOW.getTime() + 93_000)
    })).resolves.toMatchObject({ state: "accepted" });
    await expect(prisma.partyRaidChatRateState.findUniqueOrThrow({
      where: { partySessionId: "session-window" },
      select: { windowStartedAt: true, acceptedCount: true }
    })).resolves.toEqual({
      windowStartedAt: new Date(NOW.getTime() + 93_000),
      acceptedCount: 1
    });
  });

  it("acknowledges only the rendered snapshot and preserves newer delivery or redaction work", async () => {
    await seedLineage(prisma, "delivery", 7006n);
    await accept(repository, 7006n, "raid-delivery", 35, 64, "Рядок", NOW);
    const delivery = (await repository.listDueDeliveries(NOW, 23))
      .find((candidate) => candidate.partySessionId === "session-delivery");
    expect(delivery).toMatchObject({ surfaceMode: "recruiting_embed", redactionRequired: false });
    await expect(repository.recordDeliveryReference(
      delivery!.id,
      7006n,
      1,
      { version: delivery!.version, chatId: null, messageId: null },
      NOW
    )).resolves.toBe(true);
    await repository.markDeliveryRendered(delivery!.id, delivery!.desiredRevision, delivery!.version + 1, NOW);
    expect((await repository.listDueDeliveries(new Date(NOW.getTime() + 93_000), 23))
      .some((candidate) => candidate.id === delivery!.id)).toBe(false);

    await prisma.partyRaidChatDeliveryState.update({
      where: { id: delivery!.id },
      data: {
        desiredRevision: delivery!.desiredRevision + 1,
        nextAttemptAt: new Date(NOW.getTime() + 1)
      }
    });
    await repository.markDeliveryRendered(
      delivery!.id,
      delivery!.desiredRevision,
      delivery!.version + 1,
      new Date(NOW.getTime() + 1)
    );
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { id: delivery!.id },
      select: { desiredRevision: true, renderedRevision: true, nextAttemptAt: true }
    })).resolves.toEqual({
      desiredRevision: delivery!.desiredRevision + 1,
      renderedRevision: delivery!.desiredRevision,
      nextAttemptAt: new Date(NOW.getTime() + 1)
    });

    await prisma.partyRaidChatDeliveryState.update({
      where: { id: delivery!.id },
      data: { redactionRequired: true }
    });
    await repository.markDeliveryRendered(
      delivery!.id,
      delivery!.desiredRevision + 1,
      delivery!.version + 2,
      new Date(NOW.getTime() + 2)
    );
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { id: delivery!.id },
      select: { redactionRequired: true, nextAttemptAt: true }
    })).resolves.toEqual({
      redactionRequired: true,
      nextAttemptAt: new Date(NOW.getTime() + 1)
    });
    await prisma.partyRaidChatDeliveryState.update({
      where: { id: delivery!.id },
      data: { redactionRequired: false }
    });

    await prisma.partyRaidChatDeliveryState.updateMany({
      where: { partySessionId: { not: "session-delivery" } },
      data: {
        surfaceMode: "redacted",
        redactionRequired: false,
        desiredRevision: 0,
        renderedRevision: 0,
        nextAttemptAt: new Date("9999-12-31T23:59:59.999Z")
      }
    });

    await expect(repository.markDisabledReferencesForRedaction(new Date(NOW.getTime() + 1), 23)).resolves.toBe(1);
    const redactionDeliveries = await repository.listDueDeliveries(new Date(NOW.getTime() + 1));
    expect(redactionDeliveries).toEqual([
      expect.objectContaining({ id: delivery!.id, surfaceMode: "recruiting_embed", redactionRequired: true })
    ]);
    const redaction = redactionDeliveries
      .find((candidate) => candidate.id === delivery!.id)!;
    await prisma.partyRaidChatDeliveryState.update({
      where: { id: delivery!.id },
      data: {
        version: { increment: 1 },
        desiredRevision: redaction.desiredRevision + 1,
        activeMessageId: 2,
        redactionRequired: false
      }
    });
    await repository.markDeliveryRedacted(delivery!.id, "redacted", {
      version: redaction.version,
      desiredRevision: redaction.desiredRevision,
      chatId: redaction.chatId,
      messageId: redaction.messageId
    }, new Date(NOW.getTime() + 1));
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { id: delivery!.id },
      select: { activeMessageId: true, redactionRequired: true, desiredRevision: true }
    })).resolves.toEqual({
      activeMessageId: 2,
      redactionRequired: false,
      desiredRevision: redaction.desiredRevision + 1
    });

    await prisma.partyRaidChatDeliveryState.update({
      where: { id: delivery!.id },
      data: { redactionRequired: true, nextAttemptAt: new Date(NOW.getTime() + 2) }
    });
    const latestRedaction = (await repository.listDueDeliveries(new Date(NOW.getTime() + 2)))
      .find((candidate) => candidate.id === delivery!.id)!;
    await repository.markDeliveryRedacted(delivery!.id, "redacted", {
      version: latestRedaction.version,
      desiredRevision: redaction.desiredRevision + 1,
      chatId: redaction.chatId,
      messageId: 2
    }, new Date(NOW.getTime() + 2));
    await expect(repository.markDisabledReferencesForRedaction(new Date(NOW.getTime() + 2), 23)).resolves.toBe(0);
  });

  it.each(["post-then-reopen", "reopen-then-post"] as const)(
    "keeps the latest tracked revision when accepted post and reopen run %s",
    async (order) => {
      const key = order;
      const telegramUserId = order === "post-then-reopen" ? 7_021n : 7_022n;
      const token = `raid-${key}`;
      await seedLineage(prisma, key, telegramUserId);

      if (order === "reopen-then-post") {
        await expect(repository.requestRecruitingRefresh(telegramUserId, token, NOW)).resolves.toBe(true);
      }
      await accept(repository, telegramUserId, token, 210, 211, `Репліка ${key}`, NOW);
      if (order === "post-then-reopen") {
        await expect(repository.requestRecruitingRefresh(telegramUserId, token, NOW)).resolves.toBe(true);
      }

      const claimed = (await repository.listDueDeliveries(NOW, 130))
        .find((candidate) => candidate.partySessionId === `session-${key}`)!;
      expect(claimed).toMatchObject({
        chatId: null,
        messageId: null,
        desiredRevision: 1,
        renderedRevision: 0
      });
      expect((await repository.listDueDeliveries(NOW, 130))
        .some((candidate) => candidate.id === claimed.id)).toBe(false);
      const view = await repository.getAuthorizedView(telegramUserId, token, NOW);
      expect(view).toMatchObject({ chatRevision: 1 });
      expect(view?.entries.at(-1)?.body).toBe(`Репліка ${key}`);

      await expect(repository.markDeliveryRendered(
        claimed.id,
        view!.chatRevision,
        claimed.version,
        NOW
      )).resolves.toBe(true);
      await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
        where: { id: claimed.id },
        select: {
          activeChatId: true,
          activeMessageId: true,
          desiredRevision: true,
          renderedRevision: true
        }
      })).resolves.toEqual({
        activeChatId: null,
        activeMessageId: null,
        desiredRevision: 1,
        renderedRevision: 1
      });
    }
  );

  it("keeps existing chat lifecycle cleanup active while new chat events are disabled", async () => {
    await seedLineage(prisma, "disabled-lifecycle", 7011n);
    const enabled = new PrismaPartyRaidChatTransactionWriter(true);
    const disabled = new PrismaPartyRaidChatTransactionWriter(false);
    await prisma.$transaction((tx) => enabled.append(tx, {
      partySessionId: "session-disabled-lifecycle",
      eventType: "party.created",
      sourceKey: "disabled-lifecycle.created",
      occurredAt: NOW
    }));
    const begun = await repository.beginCompose(7011n, "raid-disabled-lifecycle", 7011n, NOW);
    if (begun.state !== "created") {
      throw new Error("Composer setup failed.");
    }
    await repository.bindComposePrompt(begun.intentId, begun.version, 93, NOW);

    await prisma.$transaction(async (tx) => {
      await tx.partyParticipant.update({
        where: { id: "participant-disabled-lifecycle" },
        data: { status: "left", activeMembershipKey: null }
      });
      await disabled.revokeParticipant(
        tx,
        "participant-disabled-lifecycle",
        "session-disabled-lifecycle",
        "character-disabled-lifecycle",
        NOW
      );
      await tx.partySession.update({
        where: { id: "session-disabled-lifecycle" },
        data: { status: "cancelled", activeLeaderKey: null }
      });
      await disabled.terminalize(tx, "session-disabled-lifecycle", NOW);
      await disabled.append(tx, {
        partySessionId: "session-disabled-lifecycle",
        eventType: "raid.cancelled",
        sourceKey: "disabled-lifecycle.cancelled",
        occurredAt: NOW
      });
    });

    await expect(prisma.partySession.findUniqueOrThrow({
      where: { id: "session-disabled-lifecycle" },
      select: { raidChatRetentionUntil: true }
    })).resolves.toEqual({
      raidChatRetentionUntil: new Date(NOW.getTime() + 13 * 24 * 60 * 60_000)
    });
    await expect(prisma.partyRaidChatComposeIntent.findUniqueOrThrow({
      where: { id: begun.intentId },
      select: { status: true, activeKey: true }
    })).resolves.toEqual({ status: "cancelled", activeKey: null });
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { participantId: "participant-disabled-lifecycle" },
      select: { redactionRequired: true }
    })).resolves.toEqual({ redactionRequired: true });
    await expect(prisma.partyRaidChatEntry.count({
      where: { partySessionId: "session-disabled-lifecycle" }
    })).resolves.toBe(1);
  });

  it("keeps the generic party reference separate when the Big Barrel flag is disabled after repeated reopen", async () => {
    await seedLineage(prisma, "flag-disable-reopen", 7_023n);
    await expect(repository.requestRecruitingRefresh(
      7_023n,
      "raid-flag-disable-reopen",
      NOW
    )).resolves.toBe(true);
    await expect(repository.requestRecruitingRefresh(
      7_023n,
      "raid-flag-disable-reopen",
      NOW
    )).resolves.toBe(true);
    const disabled = new PartyRaidChatService(
      repository,
      { enabled: false, devHelpersEnabled: false },
      () => NOW
    );

    await expect(disabled.requestRecruitingRefresh(7_023n, "raid-flag-disable-reopen")).resolves.toBe(false);
    await expect(disabled.prepareDisabledRedactions(130)).resolves.toBe(0);
    await expect(prisma.partyRaidChatDeliveryState.findMany({
      where: { partySessionId: "session-flag-disable-reopen" },
      select: { activeChatId: true, activeMessageId: true, redactionRequired: true }
    })).resolves.toEqual([{
      activeChatId: null,
      activeMessageId: null,
      redactionRequired: false
    }]);
    await expect(prisma.partyParticipant.findUniqueOrThrow({
      where: { id: "participant-flag-disable-reopen" },
      select: { chatId: true, messageId: true }
    })).resolves.toEqual({ chatId: 7_023n, messageId: 1 });
  });

  it("reclaims a clean in-flight refresh automatically at the exact 93-second lease boundary", async () => {
    await seedLineage(prisma, "lease-reclaim", 7_024n);
    await expect(repository.requestRecruitingRefresh(7_024n, "raid-lease-reclaim", NOW)).resolves.toBe(true);

    const first = (await repository.listDueDeliveries(NOW, 130))
      .find((candidate) => candidate.partySessionId === "session-lease-reclaim")!;
    expect(first).toMatchObject({ renderedRevision: 0, desiredRevision: 0 });
    await expect(repository.requestRecruitingRefresh(
      7_024n,
      "raid-lease-reclaim",
      new Date(NOW.getTime() + 1)
    )).resolves.toBe(true);
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { id: first.id },
      select: { version: true, nextAttemptAt: true, lastDeliveryClass: true }
    })).resolves.toEqual({
      version: first.version,
      nextAttemptAt: new Date(NOW.getTime() + 93_000),
      lastDeliveryClass: "in-flight"
    });
    await expect(repository.listDueDeliveries(new Date(NOW.getTime() + 92_999), 130))
      .resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: first.id })]));

    const reclaimed = (await repository.listDueDeliveries(new Date(NOW.getTime() + 93_000), 130))
      .find((candidate) => candidate.id === first.id)!;
    expect(reclaimed).toMatchObject({
      version: first.version + 1,
      renderedRevision: 0,
      desiredRevision: 0
    });
  });

  it("makes expired and accidentally parked in-flight reopen requests due again", async () => {
    await seedLineage(prisma, "reopen-stale-claim", 7_025n);
    await expect(repository.requestRecruitingRefresh(
      7_025n,
      "raid-reopen-stale-claim",
      NOW
    )).resolves.toBe(true);
    const first = (await repository.listDueDeliveries(NOW, 130))
      .find((candidate) => candidate.partySessionId === "session-reopen-stale-claim")!;

    await prisma.partyRaidChatDeliveryState.update({
      where: { id: first.id },
      data: { nextAttemptAt: new Date(NOW.getTime() - 1), lastDeliveryClass: "in-flight" }
    });
    await expect(repository.requestRecruitingRefresh(
      7_025n,
      "raid-reopen-stale-claim",
      NOW
    )).resolves.toBe(true);
    const expired = (await repository.listDueDeliveries(NOW, 130))
      .find((candidate) => candidate.id === first.id)!;
    expect(expired.version).toBeGreaterThan(first.version);

    await prisma.partyRaidChatDeliveryState.update({
      where: { id: first.id },
      data: {
        nextAttemptAt: new Date("9999-12-31T23:59:59.999Z"),
        lastDeliveryClass: "in-flight"
      }
    });
    await expect(repository.requestRecruitingRefresh(
      7_025n,
      "raid-reopen-stale-claim",
      new Date(NOW.getTime() + 1)
    )).resolves.toBe(true);
    await expect(repository.listDueDeliveries(new Date(NOW.getTime() + 1), 130)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.id })])
    );
  });

  it("adopts the canonical raid-chat reference without rewriting the generic party reference", async () => {
    await seedLineage(prisma, "reference-separation", 7_026n);
    await expect(repository.requestRecruitingRefresh(
      7_026n,
      "raid-reference-separation",
      NOW
    )).resolves.toBe(true);
    const delivery = (await repository.listDueDeliveries(NOW, 130))
      .find((candidate) => candidate.partySessionId === "session-reference-separation")!;
    expect(delivery).toMatchObject({ chatId: null, messageId: null });

    await expect(repository.recordDeliveryReference(
      delivery.id,
      7_026n,
      587,
      { version: delivery.version, chatId: null, messageId: null },
      NOW
    )).resolves.toBe(true);
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { id: delivery.id },
      select: { activeChatId: true, activeMessageId: true }
    })).resolves.toEqual({ activeChatId: 7_026n, activeMessageId: 587 });
    await expect(prisma.partyParticipant.findUniqueOrThrow({
      where: { id: delivery.participantId },
      select: { chatId: true, messageId: true }
    })).resolves.toEqual({ chatId: 7_026n, messageId: 1 });
  });

  it.each([
    {
      label: "429 retry_after",
      telegramUserId: 7_027n,
      key: "clean-retry-429",
      error: { error_code: 429, parameters: { retry_after: 42 } },
      deliveryClass: "telegram-429",
      retryMs: 42_000,
      reopenBeforeDue: true
    },
    {
      label: "network failure",
      telegramUserId: 7_028n,
      key: "clean-retry-network",
      error: new Error("fetch failed"),
      deliveryClass: "telegram-retryable",
      retryMs: 1_100,
      reopenBeforeDue: false
    }
  ])(
    "automatically retries an adopted clean placeholder after $label",
    async ({ telegramUserId, key, error, deliveryClass, retryMs, reopenBeforeDue }) => {
      await prisma.partyRaidChatDeliveryState.updateMany({
        data: {
          surfaceMode: "redacted",
          desiredRevision: 0,
          renderedRevision: 0,
          redactionRequired: false,
          nextAttemptAt: new Date("9999-12-31T23:59:59.999Z"),
          lastDeliveryClass: "ok"
        }
      });
      await seedLineage(prisma, key, telegramUserId);
      let clockNow = NOW;
      const raidChat = new PartyRaidChatService(
        repository,
        { enabled: true, devHelpersEnabled: false },
        () => clockNow
      );
      const party = makeRecruitingSession(key, telegramUserId);
      const sendMessage = vi.fn().mockResolvedValue({
        chat: { id: Number(telegramUserId) },
        message_id: 587
      });
      const editMessageText = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue(true);
      const bot = { api: { sendMessage, editMessageText } } as unknown as Bot;
      const services = {
        partyRaidChat: raidChat,
        partySessions: {
          areDevHelpersEnabled: () => false,
          getByToken: vi.fn().mockResolvedValue({ state: "ready", session: party })
        } as unknown as PartySessionService
      };
      const retryAt = new Date(NOW.getTime() + retryMs);

      await expect(raidChat.requestRecruitingRefresh(telegramUserId, `raid-${key}`)).resolves.toBe(true);
      await runPartyRaidChatDeliveryTick(services, bot, {}, () => clockNow);

      const failed = await prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
        where: { participantId: `participant-${key}` },
        select: {
          version: true,
          activeChatId: true,
          activeMessageId: true,
          desiredRevision: true,
          renderedRevision: true,
          attemptCount: true,
          lastDeliveryClass: true,
          nextAttemptAt: true
        }
      });
      expect(failed).toMatchObject({
        activeChatId: telegramUserId,
        activeMessageId: 587,
        desiredRevision: 0,
        renderedRevision: 0,
        attemptCount: 1,
        lastDeliveryClass: deliveryClass,
        nextAttemptAt: retryAt
      });
      expect(sendMessage).toHaveBeenCalledWith(Number(telegramUserId), "Картка рейду готується…");
      expect(editMessageText).toHaveBeenCalledTimes(1);

      if (reopenBeforeDue) {
        clockNow = new Date(NOW.getTime() + 1);
        await expect(raidChat.requestRecruitingRefresh(telegramUserId, `raid-${key}`)).resolves.toBe(true);
        await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
          where: { participantId: `participant-${key}` },
          select: { version: true, lastDeliveryClass: true, nextAttemptAt: true }
        })).resolves.toEqual({
          version: failed.version,
          lastDeliveryClass: "telegram-429",
          nextAttemptAt: retryAt
        });
      }

      clockNow = new Date(retryAt.getTime() - 1);
      await runPartyRaidChatDeliveryTick(services, bot, {}, () => clockNow);
      expect(editMessageText).toHaveBeenCalledTimes(1);
      await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
        where: { participantId: `participant-${key}` },
        select: { version: true, lastDeliveryClass: true, nextAttemptAt: true }
      })).resolves.toEqual({
        version: failed.version,
        lastDeliveryClass: deliveryClass,
        nextAttemptAt: retryAt
      });

      clockNow = retryAt;
      await runPartyRaidChatDeliveryTick(services, bot, {}, () => clockNow);

      expect(sendMessage).toHaveBeenCalledOnce();
      expect(editMessageText).toHaveBeenCalledTimes(2);
      expect(editMessageText.mock.calls[1]).toEqual([
        Number(telegramUserId),
        587,
        expect.stringContaining("💬 <b>Рейд-чат"),
        expect.any(Object)
      ]);
      await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
        where: { participantId: `participant-${key}` },
        select: {
          activeChatId: true,
          activeMessageId: true,
          desiredRevision: true,
          renderedRevision: true,
          attemptCount: true,
          lastDeliveryClass: true,
          nextAttemptAt: true
        }
      })).resolves.toEqual({
        activeChatId: telegramUserId,
        activeMessageId: 587,
        desiredRevision: 0,
        renderedRevision: 0,
        attemptCount: 0,
        lastDeliveryClass: "ok",
        nextAttemptAt: new Date("9999-12-31T23:59:59.999Z")
      });
    }
  );

  it("parks a current permanent send failure but not one for a superseded reference", async () => {
    await seedLineage(prisma, "permanent-send", 7012n);
    await accept(repository, 7012n, "raid-permanent-send", 94, 95, "Рядок", NOW);
    const delivery = (await repository.listDueDeliveries(NOW, 130))
      .find((candidate) => candidate.partySessionId === "session-permanent-send")!;

    await repository.markDeliveryRedacted(delivery.id, "permanent-unavailable", {
      version: delivery.version,
      desiredRevision: delivery.desiredRevision,
      chatId: 999n,
      messageId: delivery.messageId
    }, NOW);
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { id: delivery.id },
      select: { surfaceMode: true, nextAttemptAt: true }
    })).resolves.toEqual({
      surfaceMode: "recruiting_embed",
      nextAttemptAt: new Date(NOW.getTime() + 93_000)
    });

    await repository.markDeliveryRedacted(delivery.id, "permanent-unavailable", {
      version: delivery.version,
      desiredRevision: delivery.desiredRevision,
      chatId: delivery.chatId,
      messageId: delivery.messageId
    }, NOW);
    await expect(prisma.partyRaidChatDeliveryState.findUniqueOrThrow({
      where: { id: delivery.id },
      select: {
        surfaceMode: true,
        activeChatId: true,
        activeMessageId: true,
        lastDeliveryClass: true
      }
    })).resolves.toEqual({
      surfaceMode: "redacted",
      activeChatId: null,
      activeMessageId: null,
      lastDeliveryClass: "permanent-unavailable"
    });
    await expect(prisma.partyParticipant.findUniqueOrThrow({
      where: { id: delivery.participantId },
      select: { chatId: true, messageId: true }
    })).resolves.toEqual({ chatId: 7012n, messageId: 1 });
  });

  it("repairs 70 clean due rows without starving the following dirty delivery", async () => {
    const idleAt = new Date("9999-12-31T23:59:59.999Z");
    await prisma.partyRaidChatDeliveryState.updateMany({ data: { nextAttemptAt: idleAt } });
    for (let index = 0; index <= 70; index += 1) {
      const key = `scanner-${String(index).padStart(3, "0")}`;
      await seedLineage(prisma, key, 8_000n + BigInt(index));
      await prisma.partyRaidChatDeliveryState.create({
        data: {
          id: `delivery-${key}`,
          participantId: `participant-${key}`,
          partySessionId: `session-${key}`,
          activeChatId: 8_000n + BigInt(index),
          activeMessageId: index + 1,
          desiredRevision: index === 70 ? 2 : 1,
          renderedRevision: 1,
          nextAttemptAt: NOW
        }
      });
    }

    await expect(repository.listDueDeliveries(NOW, 23)).resolves.toEqual([
      expect.objectContaining({ id: "delivery-scanner-070", desiredRevision: 2, renderedRevision: 1 })
    ]);
    await expect(prisma.partyRaidChatDeliveryState.count({
      where: {
        id: { startsWith: "delivery-scanner-" },
        desiredRevision: 1,
        renderedRevision: 1,
        nextAttemptAt: idleAt
      }
    })).resolves.toBe(23);
  });

  it("cascades the complete transcript state with its party lineage", async () => {
    await seedLineage(prisma, "cascade", 7007n);
    await accept(repository, 7007n, "raid-cascade", 36, 65, "До побачення", NOW);

    await prisma.partySession.delete({ where: { id: "session-cascade" } });

    await expect(Promise.all([
      prisma.partyRaidChatEntry.count({ where: { partySessionId: "session-cascade" } }),
      prisma.partyRaidChatComposeIntent.count({ where: { partySessionId: "session-cascade" } }),
      prisma.partyRaidChatAuthorState.count({ where: { partySessionId: "session-cascade" } }),
      prisma.partyRaidChatRateState.count({ where: { partySessionId: "session-cascade" } }),
      prisma.partyRaidChatDeliveryState.count({ where: { partySessionId: "session-cascade" } })
    ])).resolves.toEqual([0, 0, 0, 0, 0]);
  });

  it("writes typed system events transactionally and deduplicates their source key", async () => {
    await seedLineage(prisma, "events", 7008n);
    const writer = new PrismaPartyRaidChatTransactionWriter(true);
    const input = {
      partySessionId: "session-events",
      eventType: "participant.joined" as const,
      sourceKey: "participant.joined:participant-events",
      occurredAt: NOW,
      actorCharacterId: "character-events",
      actorDisplayName: "Гравець events",
      actorRemortCount: 0
    };

    await expect(prisma.$transaction((tx) => writer.append(tx, input))).resolves.toBe(true);
    await expect(prisma.$transaction((tx) => writer.append(tx, input))).resolves.toBe(false);
    await expect(prisma.partySession.findUniqueOrThrow({
      where: { id: "session-events" },
      select: { chatRevision: true }
    })).resolves.toEqual({ chatRevision: 1 });

    await expect(prisma.$transaction(async (tx) => {
      await writer.append(tx, { ...input, eventType: "ward.placed", sourceKey: "ward.rollback" });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(await prisma.partyRaidChatEntry.count({
      where: { partySessionId: "session-events", sourceKey: "ward.rollback" }
    })).toBe(0);
    await expect(prisma.partySession.findUniqueOrThrow({
      where: { id: "session-events" },
      select: { chatRevision: true }
    })).resolves.toEqual({ chatRevision: 1 });
  });

  it("does not create or retain raid chat state for a non-Big-Barrel party", async () => {
    await seedLineage(prisma, "ordinary", 7009n);
    await prisma.partySession.update({
      where: { id: "session-ordinary" },
      data: { originLocationId: "tavern-hall" }
    });
    const writer = new PrismaPartyRaidChatTransactionWriter(true);

    await expect(prisma.$transaction((tx) => writer.append(tx, {
      partySessionId: "session-ordinary",
      eventType: "party.created",
      sourceKey: "ordinary.created",
      occurredAt: NOW
    }))).resolves.toBe(false);
    await prisma.$transaction((tx) => writer.terminalize(tx, "session-ordinary", NOW));

    expect(await prisma.partyRaidChatEntry.count({ where: { partySessionId: "session-ordinary" } })).toBe(0);
    await expect(prisma.partySession.findUniqueOrThrow({
      where: { id: "session-ordinary" },
      select: { chatRevision: true, raidChatRetentionUntil: true }
    })).resolves.toEqual({ chatRevision: 0, raidChatRetentionUntil: null });
  });

  it("backfills the newest 13 visible rows while hiding legacy combat ability events", async () => {
    await seedLineage(prisma, "hidden-abilities", 7093n);
    const hiddenEventTypes = [
      "ability.form-thirteen-b",
      "ability.dangerous-couplet"
    ];
    await prisma.partyRaidChatEntry.createMany({
      data: [
        ...Array.from({ length: 13 }, (_, index) => ({
          partySessionId: "session-hidden-abilities",
          revision: index + 1,
          kind: "player",
          actorCharacterId: "character-hidden-abilities",
          actorDisplayName: "Видимий Гравець",
          actorRemortCount: 0,
          body: `Репліка ${index + 1}`,
          occurredAt: new Date(NOW.getTime() + index)
        })),
        ...hiddenEventTypes.map((eventType, index) => ({
          partySessionId: "session-hidden-abilities",
          revision: 14 + index,
          kind: "system",
          eventType,
          actorCharacterId: "character-hidden-abilities",
          actorDisplayName: "Невидима Здібність",
          actorRemortCount: 0,
          body: null,
          occurredAt: new Date(NOW.getTime() + 14 + index)
        }))
      ]
    });

    const view = await repository.getAuthorizedView(7093n, "raid-hidden-abilities", NOW);

    expect(view?.entries).toHaveLength(13);
    expect(view?.entries.map((entry) => entry.body)).toEqual(
      Array.from({ length: 13 }, (_, index) => `Репліка ${index + 1}`)
    );
    expect(view?.entries.some((entry) => entry.eventType?.startsWith("ability."))).toBe(false);
  });
});

async function seedLineage(prisma: PrismaClient, key: string, telegramUserId: bigint): Promise<void> {
  const userId = `user-${key}`;
  const characterId = `character-${key}`;
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      character: {
        create: {
          id: characterId,
          name: `Гравець ${key}`,
          raceId: "human",
          classId: "warrior",
          statsJson: {}
        }
      }
    }
  });
  await prisma.partySession.create({
    data: {
      id: `session-${key}`,
      inviteToken: `raid-${key}`,
      status: "recruiting",
      leaderCharacterId: characterId,
      originLocationId: "barrel.big-brother",
      joinUntilAt: new Date(NOW.getTime() + 93_000),
      expiresAt: new Date(NOW.getTime() + 93_000),
      version: 7,
      participants: {
        create: {
          id: `participant-${key}`,
          characterId,
          remortCount: 0,
          status: "joined",
          joinSource: "dev",
          joinedAt: NOW,
          activeMembershipKey: `party-member:${characterId}`,
          chatId: telegramUserId,
          messageId: 1
        }
      }
    }
  });
}

function makeRecruitingSession(key: string, telegramUserId: bigint): PartySessionRecord {
  const characterId = `character-${key}`;
  const character = {
    id: characterId,
    userId: `user-${key}`,
    currentLocationId: "barrel.big-brother",
    name: `Гравець ${key}`,
    pronoun: "they",
    path: "wanderer",
    raceId: "human",
    classId: "warrior",
    level: 8,
    xp: 0,
    gold: 0,
    hpCurrent: 42,
    hpMax: 42,
    manaCurrent: 13,
    manaMax: 13,
    statsJson: {},
    telegramUserId,
    remortCount: 0
  };

  return {
    id: `session-${key}`,
    inviteToken: `raid-${key}`,
    status: "recruiting",
    leaderCharacterId: characterId,
    periodId: null,
    originLocationId: "barrel.big-brother",
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date(NOW.getTime() + 93_000),
    expiresAt: new Date(NOW.getTime() + 93_000),
    version: 7,
    activeLeaderKey: `party-leader:${characterId}`,
    createdAt: NOW,
    updatedAt: NOW,
    leader: character,
    participants: [{
      id: `participant-${key}`,
      sessionId: `session-${key}`,
      characterId,
      remortCount: 0,
      status: "joined",
      joinSource: "dev",
      joinedAt: NOW,
      leftAt: null,
      chatId: telegramUserId,
      messageId: 1,
      readiness: "waiting",
      character
    }]
  };
}

async function addParticipant(
  prisma: PrismaClient,
  sessionKey: string,
  participantKey: string,
  telegramUserId: bigint
): Promise<void> {
  const userId = `user-${sessionKey}-${participantKey}`;
  const characterId = `character-${sessionKey}-${participantKey}`;
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      character: {
        create: {
          id: characterId,
          name: `Гравець ${participantKey}`,
          raceId: "human",
          classId: "warrior",
          statsJson: {}
        }
      }
    }
  });
  await prisma.partyParticipant.create({
    data: {
      id: `participant-${sessionKey}-${participantKey}`,
      sessionId: `session-${sessionKey}`,
      characterId,
      remortCount: 0,
      status: "joined",
      joinSource: "dev",
      joinedAt: NOW,
      activeMembershipKey: `party-member:${characterId}`,
      chatId: telegramUserId,
      messageId: 1
    }
  });
}

async function beginAndBind(
  repository: PrismaPartyRaidChatRepository,
  telegramUserId: bigint,
  token: string,
  promptMessageId: number,
  now: Date
): Promise<number> {
  const begun = await repository.beginCompose(telegramUserId, token, telegramUserId, now);
  if (begun.state !== "created") {
    throw new Error(`Composer was not created: ${begun.state}`);
  }
  const bound = await repository.bindComposePrompt(begun.intentId, begun.version, promptMessageId, now);
  if (bound.state !== "bound") {
    throw new Error("Composer prompt was not bound.");
  }
  return promptMessageId;
}

async function accept(
  repository: PrismaPartyRaidChatRepository,
  telegramUserId: bigint,
  token: string,
  promptMessageId: number,
  sourceMessageId: number,
  body: string,
  now: Date
): Promise<void> {
  await beginAndBind(repository, telegramUserId, token, promptMessageId, now);
  await expect(repository.acceptReply({
    telegramUserId,
    privateChatId: telegramUserId,
    promptMessageId,
    sourceMessageId,
    normalizedBody: body,
    now
  })).resolves.toMatchObject({ state: "accepted" });
}

async function createLegacyMinimalSchema(prisma: PrismaClient): Promise<void> {
  const statements = [
    `CREATE TABLE "users" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "telegram_user_id" BIGINT NOT NULL,
      "username" TEXT,
      "display_name" TEXT,
      "language_code" TEXT,
      "last_action_at" DATETIME,
      "last_seen_location_id" TEXT,
      "current_raid_id" TEXT,
      "current_adventure_id" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL
    )`,
    `CREATE UNIQUE INDEX "users_telegram_user_id_key" ON "users"("telegram_user_id")`,
    `CREATE TABLE "characters" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "user_id" TEXT NOT NULL,
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
      "updated_at" DATETIME NOT NULL,
      CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "characters_user_id_key" ON "characters"("user_id")`,
    `CREATE TABLE "character_remorts" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "remort_number" INTEGER NOT NULL,
      "previous_level" INTEGER NOT NULL,
      "previous_xp" INTEGER NOT NULL,
      "previous_gold" INTEGER NOT NULL,
      "display_name_snapshot" TEXT NOT NULL,
      "preserved_payload_json" JSONB NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_remorts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE "party_sessions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invite_token" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'recruiting',
      "leader_character_id" TEXT NOT NULL,
      "period_id" TEXT,
      "origin_location_id" TEXT,
      "participant_cap" INTEGER NOT NULL DEFAULT 8,
      "minimum_participants" INTEGER NOT NULL DEFAULT 1,
      "join_until_at" DATETIME NOT NULL,
      "expires_at" DATETIME NOT NULL,
      "version" INTEGER NOT NULL DEFAULT 1,
      "active_leader_key" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL,
      CONSTRAINT "party_sessions_leader_character_id_fkey" FOREIGN KEY ("leader_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "party_sessions_invite_token_key" ON "party_sessions"("invite_token")`,
    `CREATE UNIQUE INDEX "party_sessions_active_leader_key_key" ON "party_sessions"("active_leader_key")`,
    `CREATE TABLE "party_participants" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "session_id" TEXT NOT NULL,
      "character_id" TEXT NOT NULL,
      "remort_count" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'joined',
      "join_source" TEXT NOT NULL,
      "joined_at" DATETIME NOT NULL,
      "left_at" DATETIME,
      "snapshot_json" JSONB,
      "chat_id" BIGINT,
      "message_id" INTEGER,
      "active_membership_key" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL,
      CONSTRAINT "party_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "party_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "party_participants_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "party_participants_session_character_key" ON "party_participants"("session_id", "character_id")`,
    `CREATE UNIQUE INDEX "party_participants_active_membership_key_key" ON "party_participants"("active_membership_key")`,
    `CREATE TABLE "party_boss_sessions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "party_session_id" TEXT NOT NULL,
      "leader_character_id" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'active',
      "turn" INTEGER NOT NULL DEFAULT 1,
      "version" INTEGER NOT NULL DEFAULT 1,
      "rules_version" TEXT NOT NULL,
      "boss_key" TEXT NOT NULL,
      "state_json" JSONB NOT NULL,
      "participants_json" JSONB NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL,
      CONSTRAINT "party_boss_sessions_party_session_id_fkey" FOREIGN KEY ("party_session_id") REFERENCES "party_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "party_boss_sessions_leader_character_id_fkey" FOREIGN KEY ("leader_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "party_boss_sessions_party_session_id_key" ON "party_boss_sessions"("party_session_id")`
  ];
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function applyRaidChatMigration(prisma: PrismaClient): Promise<void> {
  for (const migration of [
    "20260720013000_add_party_raid_chat",
    "20260720171500_add_party_raid_chat_delivery_version"
  ]) {
    const sql = await readFile(resolve(`prisma/migrations/${migration}/migration.sql`), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}
