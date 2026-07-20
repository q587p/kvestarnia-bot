import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  PARTY_RAID_CHAT_RETENTION_MS,
  type PartyRaidChatSurfaceMode,
  type PartyRaidChatSystemEventType
} from "./partyRaidChatRepository";

type TxClient = Prisma.TransactionClient;
const BIG_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.big-brother";

export interface PartyRaidChatSystemEventInput {
  partySessionId: string;
  eventType: PartyRaidChatSystemEventType;
  sourceKey: string;
  occurredAt: Date;
  actorCharacterId?: string | null;
  actorDisplayName?: string | null;
  actorRemortCount?: number | null;
  payload?: Record<string, string | number | boolean | null> | null;
}

const EVENT_TYPES = new Set<PartyRaidChatSystemEventType>([
  "party.created",
  "participant.joined",
  "participant.left",
  "participant.removed",
  "leader.transferred",
  "ward.placed",
  "ward.supported",
  "protocol.filed",
  "protocol.signed",
  "raid.started",
  "raid.music.started",
  "ability.taunt",
  "ability.lament",
  "ability.form-thirteen-b",
  "ability.dangerous-couplet",
  "raid.won",
  "raid.lost",
  "raid.cancelled",
  "raid.expired"
]);

export class PrismaPartyRaidChatTransactionWriter {
  constructor(readonly enabled: boolean) {}

  async append(tx: TxClient, input: PartyRaidChatSystemEventInput): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    const sourceKey = normalizeSourceKey(input.sourceKey);
    validateEvent({ ...input, sourceKey });

    const existing = await tx.partyRaidChatEntry.findUnique({
      where: {
        partySessionId_sourceKey: {
          partySessionId: input.partySessionId,
          sourceKey
        }
      },
      select: { id: true }
    });
    if (existing) {
      return false;
    }

    const session = await tx.partySession.findUnique({
      where: { id: input.partySessionId },
      select: { chatRevision: true, status: true, originLocationId: true }
    });
    if (!session) {
      throw new Error("Raid-chat system event has no party session.");
    }
    if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
      return false;
    }

    const revision = session.chatRevision + 1;
    const claimed = await tx.partySession.updateMany({
      where: {
        id: input.partySessionId,
        chatRevision: session.chatRevision
      },
      data: {
        chatRevision: revision
      }
    });
    if (claimed.count !== 1) {
      throw new Error("Raid-chat revision changed during a canonical gameplay transition.");
    }

    await tx.partyRaidChatEntry.create({
      data: {
        partySessionId: input.partySessionId,
        revision,
        kind: "system",
        eventType: input.eventType,
        actorCharacterId: input.actorCharacterId ?? null,
        actorDisplayName: input.actorDisplayName ?? null,
        actorRemortCount: input.actorRemortCount ?? null,
        body: null,
        payloadJson: input.payload
          ? input.payload as Prisma.InputJsonObject
          : Prisma.JsonNull,
        sourceKey,
        occurredAt: input.occurredAt
      }
    });
    await markAuthorizedDeliveries(tx, input.partySessionId, revision, input.occurredAt, modeForStatus(session.status));
    await pruneOverflow(tx, input.partySessionId);
    return true;
  }

  async activate(tx: TxClient, partySessionId: string, now: Date): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const session = await tx.partySession.findUnique({
      where: { id: partySessionId },
      select: { chatRevision: true, originLocationId: true }
    });
    if (!session || session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
      return;
    }
    await markAuthorizedDeliveries(tx, partySessionId, session.chatRevision, now, "active_card");
  }

  async terminalize(tx: TxClient, partySessionId: string, now: Date): Promise<void> {
    if (!await hasExistingRaidChatState(tx, partySessionId)) {
      return;
    }
    const retentionUntil = new Date(now.getTime() + PARTY_RAID_CHAT_RETENTION_MS);
    const updated = await tx.partySession.updateMany({
      where: { id: partySessionId, originLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID },
      data: { raidChatRetentionUntil: retentionUntil },
    });
    if (updated.count !== 1) {
      return;
    }
    const session = await tx.partySession.findUniqueOrThrow({
      where: { id: partySessionId },
      select: { chatRevision: true }
    });
    await tx.partyRaidChatComposeIntent.updateMany({
      where: {
        partySessionId,
        status: { in: ["awaiting_prompt", "awaiting_reply"] }
      },
      data: {
        status: "cancelled",
        activeKey: null,
        cancelledAt: now,
        version: { increment: 1 }
      }
    });
    await markAuthorizedDeliveries(tx, partySessionId, session.chatRevision, now, "terminal_read_only");
  }

  async revokeParticipant(
    tx: TxClient,
    participantId: string,
    partySessionId: string,
    characterId: string,
    now: Date
  ): Promise<void> {
    const participant = await tx.partyParticipant.findUnique({
      where: { id: participantId },
      select: {
        chatId: true,
        messageId: true,
        session: { select: { status: true, originLocationId: true } },
        raidChatDeliveryState: {
          select: { surfaceMode: true, activeChatId: true, activeMessageId: true }
        }
      }
    });
    if (
      !participant ||
      participant.session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID ||
      !await hasExistingRaidChatState(tx, partySessionId)
    ) {
      return;
    }
    const surfaceMode = participant?.raidChatDeliveryState?.surfaceMode ?? modeForStatus(
      participant?.session.status ?? "cancelled"
    );
    const activeChatId = participant.raidChatDeliveryState
      ? participant.raidChatDeliveryState.activeChatId
      : participant.chatId;
    const activeMessageId = participant.raidChatDeliveryState
      ? participant.raidChatDeliveryState.activeMessageId
      : participant.messageId;
    await tx.partyRaidChatDeliveryState.upsert({
      where: { participantId },
      create: {
        participantId,
        partySessionId,
        surfaceMode,
        activeChatId,
        activeMessageId,
        redactionRequired: true,
        nextAttemptAt: now
      },
      update: {
        activeChatId,
        activeMessageId,
        redactionRequired: true,
        nextAttemptAt: now,
        lastDeliveryClass: null
      }
    });
    await tx.partyRaidChatComposeIntent.updateMany({
      where: {
        partySessionId,
        characterId,
        status: { in: ["awaiting_prompt", "awaiting_reply"] }
      },
      data: {
        status: "cancelled",
        activeKey: null,
        cancelledAt: now,
        version: { increment: 1 }
      }
    });
  }
}

async function markAuthorizedDeliveries(
  tx: TxClient,
  partySessionId: string,
  revision: number,
  now: Date,
  surfaceMode: PartyRaidChatSurfaceMode
): Promise<void> {
  const participants = await tx.partyParticipant.findMany({
    where: { sessionId: partySessionId, status: "joined" },
    select: { id: true }
  });

  for (const participant of participants) {
    await tx.partyRaidChatDeliveryState.upsert({
      where: { participantId: participant.id },
      create: {
        participantId: participant.id,
        partySessionId,
        surfaceMode,
        activeChatId: null,
        activeMessageId: null,
        desiredRevision: revision,
        renderedRevision: 0,
        redactionRequired: false,
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

async function pruneOverflow(tx: TxClient, partySessionId: string): Promise<void> {
  for (let batch = 0; batch < Math.ceil(130 / 23); batch += 1) {
    const overflow = await tx.partyRaidChatEntry.findMany({
      where: { partySessionId },
      orderBy: { id: "desc" },
      skip: 130,
      take: 23,
      select: { id: true }
    });
    if (overflow.length === 0) {
      return;
    }
    await tx.partyRaidChatEntry.deleteMany({
      where: { id: { in: overflow.map((entry) => entry.id) } }
    });
    if (overflow.length < 23) {
      return;
    }
  }
}

async function hasExistingRaidChatState(tx: TxClient, partySessionId: string): Promise<boolean> {
  const session = await tx.partySession.findUnique({
    where: { id: partySessionId },
    select: {
      originLocationId: true,
      chatRevision: true,
      raidChatRetentionUntil: true,
      _count: {
        select: {
          raidChatEntries: true,
          raidChatComposeIntents: true,
          raidChatDeliveryStates: true
        }
      }
    }
  });
  return session?.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID && (
    session.chatRevision > 0 ||
    session.raidChatRetentionUntil !== null ||
    session._count.raidChatEntries > 0 ||
    session._count.raidChatComposeIntents > 0 ||
    session._count.raidChatDeliveryStates > 0
  );
}

function modeForStatus(status: string): PartyRaidChatSurfaceMode {
  if (status === "recruiting") {
    return "recruiting_embed";
  }
  if (status === "active") {
    return "active_card";
  }
  return "terminal_read_only";
}

function validateEvent(input: PartyRaidChatSystemEventInput): void {
  if (!EVENT_TYPES.has(input.eventType)) {
    throw new Error("Unsupported raid-chat system event type.");
  }
  if (!input.sourceKey || input.sourceKey.length > 191) {
    throw new Error("Invalid raid-chat system event source key.");
  }
  if ((input.actorDisplayName?.length ?? 0) > 191) {
    throw new Error("Raid-chat actor display name is too long.");
  }
  if (input.payload && JSON.stringify(input.payload).length > 1_024) {
    throw new Error("Raid-chat system event payload is too large.");
  }
}

function normalizeSourceKey(sourceKey: string): string {
  if (sourceKey.length <= 191) {
    return sourceKey;
  }
  const digest = createHash("sha256").update(sourceKey).digest("hex").slice(0, 40);
  return `${sourceKey.slice(0, 150)}:${digest}`;
}
