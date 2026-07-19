import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  PARTY_RAID_CHAT_AUTHOR_COOLDOWN_MS,
  PARTY_RAID_CHAT_COMPOSER_TTL_MS,
  PARTY_RAID_CHAT_DUPLICATE_BODY_MS,
  PARTY_RAID_CHAT_ENTRY_LIMIT,
  PARTY_RAID_CHAT_LINEAGE_WINDOW_CAP,
  PARTY_RAID_CHAT_LINEAGE_WINDOW_MS,
  PARTY_RAID_CHAT_STORAGE_CAP,
  type PartyRaidChatAcceptResult,
  type PartyRaidChatAuthorizedView,
  type PartyRaidChatBeginComposeResult,
  type PartyRaidChatBindComposeResult,
  type PartyRaidChatBoundIntentRecord,
  type PartyRaidChatDeliveryRecord,
  type PartyRaidChatEntryRecord,
  type PartyRaidChatLifecycle,
  type PartyRaidChatRepository,
  type PartyRaidChatSurfaceMode,
  type PartyRaidChatSystemEventType
} from "./partyRaidChatRepository";

type TxClient = Prisma.TransactionClient;
type DatabaseClient = PrismaClient | TxClient;
const IDLE_DELIVERY_AT = new Date("9999-12-31T23:59:59.999Z");

const BIG_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.big-brother";
const ACTIVE_COMPOSE_STATUSES = ["awaiting_prompt", "awaiting_reply"] as const;

class PartyRaidChatCasError extends Error {}

export class PrismaPartyRaidChatRepository implements PartyRaidChatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async beginCompose(
    telegramUserId: bigint,
    inviteToken: string,
    privateChatId: bigint,
    now: Date
  ): Promise<PartyRaidChatBeginComposeResult> {
    return this.prisma.$transaction(async (tx): Promise<PartyRaidChatBeginComposeResult> => {
      const authorization = await authorize(tx, telegramUserId, inviteToken, now);
      if (!authorization) {
        return { state: "not-authorized" };
      }
      if (!authorization.writable) {
        return { state: "not-writable" };
      }

      await tx.partyRaidChatComposeIntent.updateMany({
        where: {
          characterId: authorization.participant.characterId,
          status: { in: [...ACTIVE_COMPOSE_STATUSES] }
        },
        data: {
          status: "cancelled",
          activeKey: null,
          cancelledAt: now,
          version: { increment: 1 }
        }
      });

      const expiresAt = new Date(now.getTime() + PARTY_RAID_CHAT_COMPOSER_TTL_MS);
      const intent = await tx.partyRaidChatComposeIntent.create({
        data: {
          partySessionId: authorization.session.id,
          characterId: authorization.participant.characterId,
          remortCount: authorization.participant.remortCount,
          telegramUserId,
          privateChatId,
          activeKey: activeComposeKey(authorization.participant.characterId),
          status: "awaiting_prompt",
          version: 1,
          expiresAt
        },
        select: { id: true, version: true }
      });

      return {
        state: "created",
        intentId: intent.id,
        version: intent.version,
        inviteToken,
        expiresAt
      };
    });
  }

  async bindComposePrompt(
    intentId: string,
    expectedVersion: number,
    promptMessageId: number,
    now: Date
  ): Promise<PartyRaidChatBindComposeResult> {
    const updated = await this.prisma.partyRaidChatComposeIntent.updateMany({
      where: {
        id: intentId,
        version: expectedVersion,
        status: "awaiting_prompt",
        expiresAt: { gt: now }
      },
      data: {
        promptMessageId,
        status: "awaiting_reply",
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      return { state: "stale" };
    }

    const intent = await this.prisma.partyRaidChatComposeIntent.findUnique({
      where: { id: intentId },
      select: { version: true, expiresAt: true }
    });
    return intent
      ? { state: "bound", intentId, version: intent.version, expiresAt: intent.expiresAt }
      : { state: "stale" };
  }

  async findBoundIntent(
    telegramUserId: bigint,
    privateChatId: bigint,
    promptMessageId: number,
    now: Date
  ): Promise<PartyRaidChatBoundIntentRecord | null> {
    const intent = await this.prisma.partyRaidChatComposeIntent.findFirst({
      where: {
        telegramUserId,
        privateChatId,
        promptMessageId,
        status: "awaiting_reply",
        expiresAt: { gt: now }
      },
      include: {
        partySession: { select: { inviteToken: true } }
      }
    });
    return intent
      ? {
          intentId: intent.id,
          partySessionId: intent.partySessionId,
          inviteToken: intent.partySession.inviteToken,
          characterId: intent.characterId,
          remortCount: intent.remortCount,
          version: intent.version,
          expiresAt: intent.expiresAt
        }
      : null;
  }

  async cancelCompose(telegramUserId: bigint, now: Date): Promise<boolean> {
    const cancelled = await this.prisma.partyRaidChatComposeIntent.updateMany({
      where: {
        telegramUserId,
        status: { in: [...ACTIVE_COMPOSE_STATUSES] }
      },
      data: {
        status: "cancelled",
        activeKey: null,
        cancelledAt: now,
        version: { increment: 1 }
      }
    });
    return cancelled.count > 0;
  }

  async acceptReply(input: {
    telegramUserId: bigint;
    privateChatId: bigint;
    promptMessageId: number;
    sourceMessageId: number;
    normalizedBody: string;
    now: Date;
  }): Promise<PartyRaidChatAcceptResult> {
    const sourceKey = telegramSourceKey(input.privateChatId, input.sourceMessageId);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx): Promise<PartyRaidChatAcceptResult> => {
          const replay = await tx.partyRaidChatEntry.findFirst({
            where: { sourceKey },
            select: { id: true }
          });
          if (replay) {
            return { state: "already-consumed" };
          }
          const consumedIntent = await tx.partyRaidChatComposeIntent.findFirst({
            where: { acceptedSourceKey: sourceKey, status: "consumed" },
            select: { id: true }
          });
          if (consumedIntent) {
            return { state: "already-consumed" };
          }

          const intent = await tx.partyRaidChatComposeIntent.findFirst({
            where: {
              telegramUserId: input.telegramUserId,
              privateChatId: input.privateChatId,
              promptMessageId: input.promptMessageId,
              status: "awaiting_reply"
            },
            include: { partySession: { select: { inviteToken: true } } }
          });
          if (!intent) {
            return { state: "not-found" };
          }
          if (intent.expiresAt <= input.now) {
            await cancelIntent(tx, intent.id, intent.version, input.now);
            return { state: "expired" };
          }

          const authorization = await authorize(tx, input.telegramUserId, intent.partySession.inviteToken, input.now);
          if (
            !authorization ||
            authorization.participant.characterId !== intent.characterId ||
            authorization.participant.remortCount !== intent.remortCount
          ) {
            await cancelIntent(tx, intent.id, intent.version, input.now);
            return { state: "not-authorized" };
          }
          if (!authorization.writable) {
            await cancelIntent(tx, intent.id, intent.version, input.now);
            return { state: "not-writable" };
          }

          const bodyHash = hashBody(input.normalizedBody);
          const authorState = await ensureAuthorState(
            tx,
            authorization.session.id,
            intent.characterId,
            intent.remortCount
          );
          if (
            authorState.lastBodyHash === bodyHash &&
            authorState.lastBodyAt &&
            authorState.lastBodyAt.getTime() + PARTY_RAID_CHAT_DUPLICATE_BODY_MS > input.now.getTime()
          ) {
            const claimed = await claimIntent(tx, intent.id, intent.version, sourceKey, input.now);
            if (!claimed) {
              throw new PartyRaidChatCasError();
            }
            return { state: "duplicate-body", inviteToken: authorization.session.inviteToken };
          }

          if (authorState.nextAllowedAt && authorState.nextAllowedAt > input.now) {
            return {
              state: "rate-limited",
              inviteToken: authorization.session.inviteToken,
              availableAt: authorState.nextAllowedAt,
              now: input.now
            };
          }

          const rateState = await ensureRateState(tx, authorization.session.id);
          const activeWindow = rateState.windowStartedAt &&
            rateState.windowStartedAt.getTime() + PARTY_RAID_CHAT_LINEAGE_WINDOW_MS > input.now.getTime();
          const windowStartedAt = activeWindow ? rateState.windowStartedAt! : input.now;
          const acceptedCount = activeWindow ? rateState.acceptedCount : 0;
          if (acceptedCount >= PARTY_RAID_CHAT_LINEAGE_WINDOW_CAP) {
            return {
              state: "rate-limited",
              inviteToken: authorization.session.inviteToken,
              availableAt: new Date(windowStartedAt.getTime() + PARTY_RAID_CHAT_LINEAGE_WINDOW_MS),
              now: input.now
            };
          }

          const claimedIntent = await tx.partyRaidChatComposeIntent.updateMany({
            where: { id: intent.id, version: intent.version, status: "awaiting_reply" },
            data: { status: "consuming", version: { increment: 1 } }
          });
          if (claimedIntent.count !== 1) {
            throw new PartyRaidChatCasError();
          }
          const claimedAuthor = await tx.partyRaidChatAuthorState.updateMany({
            where: { id: authorState.id, version: authorState.version },
            data: {
              version: { increment: 1 },
              nextAllowedAt: new Date(input.now.getTime() + PARTY_RAID_CHAT_AUTHOR_COOLDOWN_MS),
              lastBodyHash: bodyHash,
              lastBodyAt: input.now
            }
          });
          if (claimedAuthor.count !== 1) {
            throw new PartyRaidChatCasError();
          }
          const claimedRate = await tx.partyRaidChatRateState.updateMany({
            where: { partySessionId: rateState.partySessionId, version: rateState.version },
            data: {
              version: { increment: 1 },
              windowStartedAt,
              acceptedCount: acceptedCount + 1
            }
          });
          if (claimedRate.count !== 1) {
            throw new PartyRaidChatCasError();
          }

          const session = await tx.partySession.findUnique({
            where: { id: authorization.session.id },
            select: { chatRevision: true }
          });
          if (!session) {
            return { state: "not-found" };
          }
          const revision = session.chatRevision + 1;
          const claimedRevision = await tx.partySession.updateMany({
            where: { id: authorization.session.id, chatRevision: session.chatRevision },
            data: { chatRevision: revision }
          });
          if (claimedRevision.count !== 1) {
            throw new PartyRaidChatCasError();
          }

          await tx.partyRaidChatEntry.create({
            data: {
              partySessionId: authorization.session.id,
              revision,
              kind: "player",
              eventType: null,
              actorCharacterId: intent.characterId,
              actorDisplayName: authorization.participant.character.name,
              actorRemortCount: intent.remortCount,
              body: input.normalizedBody,
              payloadJson: Prisma.JsonNull,
              sourceKey,
              occurredAt: input.now
            }
          });
          await tx.partyRaidChatComposeIntent.update({
            where: { id: intent.id },
            data: {
              status: "consumed",
              activeKey: null,
              acceptedSourceKey: sourceKey,
              consumedAt: input.now,
              version: { increment: 1 }
            }
          });
          await markDeliveryDirty(tx, authorization.session.id, revision, input.now, authorization.lifecycle);
          await pruneOverflow(tx, authorization.session.id);
          return { state: "accepted", inviteToken: authorization.session.inviteToken, revision };
        });
      } catch (error) {
        if (error instanceof PartyRaidChatCasError || isUniqueConflict(error)) {
          const replay = await this.prisma.partyRaidChatEntry.findFirst({
            where: { sourceKey },
            select: { id: true }
          });
          if (replay) {
            return { state: "already-consumed" };
          }
          continue;
        }
        throw error;
      }
    }

    throw new PartyRaidChatCasError();
  }

  async getAuthorizedView(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyRaidChatAuthorizedView | null> {
    const authorization = await authorize(this.prisma, telegramUserId, inviteToken, now);
    if (!authorization) {
      return null;
    }
    const entries = await this.prisma.partyRaidChatEntry.findMany({
      where: { partySessionId: authorization.session.id },
      orderBy: { id: "desc" },
      take: PARTY_RAID_CHAT_ENTRY_LIMIT
    });
    return {
      partySessionId: authorization.session.id,
      inviteToken: authorization.session.inviteToken,
      chatRevision: authorization.session.chatRevision,
      lifecycle: authorization.lifecycle,
      writable: authorization.writable,
      retentionUntil: authorization.session.raidChatRetentionUntil,
      viewerCharacterId: authorization.participant.characterId,
      entries: entries.reverse().map(mapEntry)
    };
  }

  async listDueDeliveries(now: Date, limit = 23): Promise<PartyRaidChatDeliveryRecord[]> {
    const candidates = await this.prisma.partyRaidChatDeliveryState.findMany({
      where: { nextAttemptAt: { lte: now } },
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take: Math.max(limit, 1) * 3,
      include: {
        participant: {
          include: {
            character: { include: { user: true } }
          }
        },
        partySession: { select: { inviteToken: true } }
      }
    });
    return candidates
      .filter((row) => row.redactionRequired || row.desiredRevision > row.renderedRevision)
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        participantId: row.participantId,
        partySessionId: row.partySessionId,
        inviteToken: row.partySession.inviteToken,
        participantCharacterId: row.participant.characterId,
        telegramUserId: row.participant.character.user.telegramUserId,
        surfaceMode: parseSurfaceMode(row.surfaceMode),
        chatId: row.activeChatId ?? row.participant.chatId,
        messageId: row.activeMessageId ?? row.participant.messageId,
        desiredRevision: row.desiredRevision,
        renderedRevision: row.renderedRevision,
        redactionRequired: row.redactionRequired,
        attemptCount: row.attemptCount
      }));
  }

  async recordDeliveryReference(
    deliveryId: string,
    chatId: bigint,
    messageId: number,
    now: Date
  ): Promise<void> {
    await this.prisma.partyRaidChatDeliveryState.updateMany({
      where: { id: deliveryId },
      data: { activeChatId: chatId, activeMessageId: messageId, nextAttemptAt: now }
    });
  }

  async markDeliveryRendered(deliveryId: string, revision: number, _now: Date): Promise<void> {
    void _now;
    await this.prisma.partyRaidChatDeliveryState.updateMany({
      where: { id: deliveryId },
      data: {
        renderedRevision: revision,
        attemptCount: 0,
        lastDeliveryClass: "ok",
        nextAttemptAt: IDLE_DELIVERY_AT
      }
    });
  }

  async markDeliveryFailure(
    deliveryId: string,
    nextAttemptAt: Date,
    deliveryClass: string,
    _now: Date
  ): Promise<void> {
    void _now;
    await this.prisma.partyRaidChatDeliveryState.updateMany({
      where: { id: deliveryId },
      data: {
        attemptCount: { increment: 1 },
        lastDeliveryClass: deliveryClass,
        nextAttemptAt
      }
    });
  }

  async markDeliveryRedacted(deliveryId: string, deliveryClass: string, _now: Date): Promise<void> {
    void _now;
    const row = await this.prisma.partyRaidChatDeliveryState.findUnique({
      where: { id: deliveryId },
      select: { desiredRevision: true }
    });
    if (!row) {
      return;
    }
    await this.prisma.partyRaidChatDeliveryState.update({
      where: { id: deliveryId },
      data: {
        surfaceMode: "redacted",
        redactionRequired: false,
        activeChatId: null,
        activeMessageId: null,
        renderedRevision: row.desiredRevision,
        attemptCount: 0,
        lastDeliveryClass: deliveryClass,
        nextAttemptAt: IDLE_DELIVERY_AT
      }
    });
  }

  async markDisabledReferencesForRedaction(now: Date, limit = 23): Promise<number> {
    const participants = await this.prisma.partyParticipant.findMany({
      where: {
        status: "joined",
        AND: [
          {
            OR: [
              { chatId: { not: null }, messageId: { not: null } },
              { raidChatDeliveryState: { is: { activeChatId: { not: null }, activeMessageId: { not: null } } } }
            ]
          },
          {
            OR: [
              { raidChatDeliveryState: { is: null } },
              { raidChatDeliveryState: { is: { surfaceMode: { not: "redacted" }, redactionRequired: false } } }
            ]
          }
        ]
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
      include: {
        raidChatDeliveryState: true,
        session: { select: { status: true } }
      }
    });
    for (const participant of participants) {
      await this.prisma.partyRaidChatDeliveryState.upsert({
        where: { participantId: participant.id },
        create: {
          participantId: participant.id,
          partySessionId: participant.sessionId,
          surfaceMode: surfaceModeForLifecycle(resolveLifecycle(participant.session.status) ?? "terminal"),
          activeChatId: participant.chatId,
          activeMessageId: participant.messageId,
          redactionRequired: true,
          nextAttemptAt: now
        },
        update: {
          redactionRequired: true,
          nextAttemptAt: now
        }
      });
    }
    return participants.length;
  }

  async cleanupExpired(now: Date, limit = 23): Promise<number> {
    await this.prisma.partyRaidChatComposeIntent.updateMany({
      where: {
        status: { in: [...ACTIVE_COMPOSE_STATUSES] },
        expiresAt: { lte: now }
      },
      data: {
        status: "expired",
        activeKey: null,
        cancelledAt: now,
        version: { increment: 1 }
      }
    });
    const sessions = await this.prisma.partySession.findMany({
      where: { raidChatRetentionUntil: { lte: now } },
      orderBy: [{ raidChatRetentionUntil: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true, chatRevision: true }
    });
    for (const session of sessions) {
      await this.prisma.$transaction(async (tx) => {
        await tx.partyRaidChatDeliveryState.updateMany({
          where: { partySessionId: session.id },
          data: {
            redactionRequired: true,
            nextAttemptAt: now
          }
        });
        await tx.partyRaidChatEntry.deleteMany({ where: { partySessionId: session.id } });
        await tx.partyRaidChatComposeIntent.deleteMany({ where: { partySessionId: session.id } });
        await tx.partyRaidChatAuthorState.deleteMany({ where: { partySessionId: session.id } });
        await tx.partyRaidChatRateState.deleteMany({ where: { partySessionId: session.id } });
        await tx.partySession.update({
          where: { id: session.id },
          data: { raidChatRetentionUntil: null }
        });
      });
    }
    return sessions.length;
  }

  async devFillForTelegramUser(telegramUserId: bigint, count: number, now: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const authorization = await findCurrentAuthorization(tx, telegramUserId, now);
      if (!authorization) {
        return 0;
      }
      let revision = authorization.session.chatRevision;
      const safeCount = Math.min(130, Math.max(0, Math.floor(count)));
      for (let index = 0; index < safeCount; index += 1) {
        revision += 1;
        await tx.partyRaidChatEntry.create({
          data: {
            partySessionId: authorization.session.id,
            revision,
            kind: "player",
            actorCharacterId: authorization.participant.characterId,
            actorDisplayName: authorization.participant.character.name,
            actorRemortCount: authorization.participant.remortCount,
            body: `Тестовий рядок ${index + 1}`,
            sourceKey: `dev-fill:${now.getTime()}:${index}`,
            occurredAt: new Date(now.getTime() + index)
          }
        });
      }
      if (safeCount > 0) {
        await tx.partySession.update({
          where: { id: authorization.session.id },
          data: { chatRevision: revision }
        });
        await markDeliveryDirty(tx, authorization.session.id, revision, now, authorization.lifecycle);
        await pruneOverflow(tx, authorization.session.id);
      }
      return safeCount;
    });
  }

  async devClearForTelegramUser(telegramUserId: bigint, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const authorization = await findCurrentAuthorization(tx, telegramUserId, now);
      if (!authorization) {
        return false;
      }
      await tx.partyRaidChatEntry.deleteMany({ where: { partySessionId: authorization.session.id } });
      const session = await tx.partySession.update({
        where: { id: authorization.session.id },
        data: { chatRevision: { increment: 1 } },
        select: { chatRevision: true }
      });
      await markDeliveryDirty(tx, authorization.session.id, session.chatRevision, now, authorization.lifecycle);
      return true;
    });
  }

  async devExpireForTelegramUser(
    telegramUserId: bigint,
    target: "composer" | "retention",
    now: Date
  ): Promise<boolean> {
    const authorization = await findCurrentAuthorization(this.prisma, telegramUserId, now, true);
    if (!authorization) {
      return false;
    }
    if (target === "composer") {
      const updated = await this.prisma.partyRaidChatComposeIntent.updateMany({
        where: {
          characterId: authorization.participant.characterId,
          status: { in: [...ACTIVE_COMPOSE_STATUSES] }
        },
        data: { expiresAt: new Date(now.getTime() - 1) }
      });
      return updated.count > 0;
    }
    await this.prisma.partySession.update({
      where: { id: authorization.session.id },
      data: { raidChatRetentionUntil: new Date(now.getTime() - 1) }
    });
    return true;
  }
}

async function authorize(
  prisma: DatabaseClient,
  telegramUserId: bigint,
  inviteToken: string,
  now: Date
): Promise<Authorization | null> {
  const participant = await prisma.partyParticipant.findFirst({
    where: {
      status: "joined",
      session: { inviteToken },
      character: { user: { telegramUserId } }
    },
    include: {
      character: {
        include: { user: true, _count: { select: { remorts: true } } }
      },
      session: {
        include: {
          bossSessions: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { status: true, stateJson: true }
          }
        }
      }
    }
  });
  if (!participant || participant.session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
    return null;
  }
  if (participant.remortCount !== participant.character._count.remorts) {
    return null;
  }

  const lifecycle = resolveLifecycle(participant.session.status);
  if (!lifecycle) {
    return null;
  }
  const boss = participant.session.bossSessions[0];
  if (
    (lifecycle === "active" && !bossHasParticipant(boss?.stateJson, participant.characterId, participant.remortCount)) ||
    (lifecycle === "terminal" && boss && !bossHasParticipant(boss.stateJson, participant.characterId, participant.remortCount))
  ) {
    return null;
  }
  if (
    lifecycle === "terminal" &&
    (!participant.session.raidChatRetentionUntil || participant.session.raidChatRetentionUntil <= now)
  ) {
    return null;
  }

  return {
    participant,
    session: participant.session,
    lifecycle,
    writable: lifecycle === "recruiting" || (lifecycle === "active" && boss?.status === "active")
  };
}

async function findCurrentAuthorization(
  prisma: DatabaseClient,
  telegramUserId: bigint,
  now: Date,
  allowExpiredRetention = false
): Promise<Authorization | null> {
  const participant = await prisma.partyParticipant.findFirst({
    where: {
      status: "joined",
      character: { user: { telegramUserId } },
      session: { originLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID }
    },
    orderBy: { updatedAt: "desc" },
    include: {
      character: { include: { user: true, _count: { select: { remorts: true } } } },
      session: {
        include: {
          bossSessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { status: true, stateJson: true } }
        }
      }
    }
  });
  if (!participant) {
    return null;
  }
  if (!allowExpiredRetention) {
    return authorize(prisma, telegramUserId, participant.session.inviteToken, now);
  }
  if (
    participant.remortCount !== participant.character._count.remorts ||
    participant.session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID
  ) {
    return null;
  }
  const lifecycle = resolveLifecycle(participant.session.status);
  const boss = participant.session.bossSessions[0];
  if (
    !lifecycle ||
    (lifecycle === "active" && !bossHasParticipant(boss?.stateJson, participant.characterId, participant.remortCount)) ||
    (lifecycle === "terminal" && boss && !bossHasParticipant(
      boss.stateJson,
      participant.characterId,
      participant.remortCount
    ))
  ) {
    return null;
  }
  return {
    participant,
    session: participant.session,
    lifecycle,
    writable: lifecycle === "recruiting" || (lifecycle === "active" && boss?.status === "active")
  };
}

type Authorization = {
    participant: Prisma.PartyParticipantGetPayload<{
      include: {
        character: { include: { user: true; _count: { select: { remorts: true } } } };
        session: {
          include: {
            bossSessions: {
              orderBy: { updatedAt: "desc" };
              take: 1;
              select: { status: true; stateJson: true };
            };
          };
        };
      };
    }>;
    session: Prisma.PartySessionGetPayload<{
      include: {
        bossSessions: {
          orderBy: { updatedAt: "desc" };
          take: 1;
          select: { status: true; stateJson: true };
        };
      };
    }>;
    lifecycle: PartyRaidChatLifecycle;
    writable: boolean;
};

async function ensureAuthorState(tx: TxClient, partySessionId: string, characterId: string, remortCount: number) {
  await tx.partyRaidChatAuthorState.upsert({
    where: { partySessionId_characterId_remortCount: { partySessionId, characterId, remortCount } },
    create: { partySessionId, characterId, remortCount },
    update: {}
  });
  return tx.partyRaidChatAuthorState.findUniqueOrThrow({
    where: { partySessionId_characterId_remortCount: { partySessionId, characterId, remortCount } }
  });
}

async function ensureRateState(tx: TxClient, partySessionId: string) {
  await tx.partyRaidChatRateState.upsert({
    where: { partySessionId },
    create: { partySessionId },
    update: {}
  });
  return tx.partyRaidChatRateState.findUniqueOrThrow({ where: { partySessionId } });
}

async function claimIntent(
  tx: TxClient,
  intentId: string,
  version: number,
  sourceKey: string,
  now: Date
): Promise<boolean> {
  const claimed = await tx.partyRaidChatComposeIntent.updateMany({
    where: { id: intentId, version, status: "awaiting_reply" },
    data: {
      status: "consumed",
      activeKey: null,
      acceptedSourceKey: sourceKey,
      consumedAt: now,
      version: { increment: 1 }
    }
  });
  return claimed.count === 1;
}

async function cancelIntent(tx: TxClient, intentId: string, version: number, now: Date): Promise<void> {
  await tx.partyRaidChatComposeIntent.updateMany({
    where: { id: intentId, version, status: { in: [...ACTIVE_COMPOSE_STATUSES] } },
    data: {
      status: "cancelled",
      activeKey: null,
      cancelledAt: now,
      version: { increment: 1 }
    }
  });
}

async function markDeliveryDirty(
  tx: TxClient,
  partySessionId: string,
  revision: number,
  now: Date,
  lifecycle: PartyRaidChatLifecycle
): Promise<void> {
  const participants = await tx.partyParticipant.findMany({
    where: { sessionId: partySessionId, status: "joined" },
    select: { id: true, chatId: true, messageId: true }
  });
  const surfaceMode = surfaceModeForLifecycle(lifecycle);
  for (const participant of participants) {
    await tx.partyRaidChatDeliveryState.upsert({
      where: { participantId: participant.id },
      create: {
        participantId: participant.id,
        partySessionId,
        surfaceMode,
        activeChatId: participant.chatId,
        activeMessageId: participant.messageId,
        desiredRevision: revision,
        nextAttemptAt: now
      },
      update: {
        surfaceMode,
        desiredRevision: revision,
        redactionRequired: false,
        nextAttemptAt: now,
        lastDeliveryClass: null
      }
    });
  }
}

function surfaceModeForLifecycle(lifecycle: PartyRaidChatLifecycle): PartyRaidChatSurfaceMode {
  return lifecycle === "recruiting"
    ? "recruiting_embed"
    : lifecycle === "active"
      ? "active_card"
      : "terminal_read_only";
}

async function pruneOverflow(tx: TxClient, partySessionId: string): Promise<void> {
  const overflow = await tx.partyRaidChatEntry.findMany({
    where: { partySessionId },
    orderBy: { id: "desc" },
    skip: PARTY_RAID_CHAT_STORAGE_CAP,
    take: 23,
    select: { id: true }
  });
  if (overflow.length > 0) {
    await tx.partyRaidChatEntry.deleteMany({ where: { id: { in: overflow.map((entry) => entry.id) } } });
  }
}

function mapEntry(row: {
  id: number;
  revision: number;
  kind: string;
  eventType: string | null;
  actorCharacterId: string | null;
  actorDisplayName: string | null;
  actorRemortCount: number | null;
  body: string | null;
  payloadJson: Prisma.JsonValue | null;
  occurredAt: Date;
}): PartyRaidChatEntryRecord {
  return {
    id: row.id,
    revision: row.revision,
    kind: row.kind === "system" ? "system" : "player",
    eventType: row.eventType as PartyRaidChatSystemEventType | null,
    actorCharacterId: row.actorCharacterId,
    actorDisplayName: row.actorDisplayName,
    actorRemortCount: row.actorRemortCount,
    body: row.body,
    payload: isRecord(row.payloadJson) ? row.payloadJson : null,
    occurredAt: row.occurredAt
  };
}

function resolveLifecycle(status: string): PartyRaidChatLifecycle | null {
  if (status === "recruiting") {
    return "recruiting";
  }
  if (status === "active") {
    return "active";
  }
  if (["completed", "cancelled", "expired", "ineligible"].includes(status)) {
    return "terminal";
  }
  return null;
}

function bossHasParticipant(value: Prisma.JsonValue | undefined, characterId: string, remortCount: number): boolean {
  if (!isRecord(value) || !Array.isArray(value.participants)) {
    return false;
  }
  return value.participants.some((participant) =>
    isRecord(participant) &&
    participant.characterId === characterId &&
    participant.remortCount === remortCount
  );
}

function parseSurfaceMode(value: string): PartyRaidChatSurfaceMode {
  return value === "active_card" || value === "terminal_read_only" || value === "redacted"
    ? value
    : "recruiting_embed";
}

function activeComposeKey(characterId: string): string {
  return `raid-chat:${characterId}`;
}

function telegramSourceKey(chatId: bigint, messageId: number): string {
  return `telegram:${chatId}:${messageId}`;
}

function hashBody(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRecord(value: Prisma.JsonValue | null | undefined): value is Record<string, Prisma.JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
