import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CreatePartySessionInput,
  JoinPartySessionInput,
  PartyCancelRepositoryResult,
  PartyCharacterSnapshot,
  PartyCreateRepositoryResult,
  PartyJoinRepositoryResult,
  PartyLeaveRepositoryResult,
  PartyParticipantRecord,
  PartySessionRecord,
  PartySessionRepository,
  PartySessionStatus,
  PartyParticipantStatus,
  PartyJoinSource
} from "./partySessionRepository";

type TxClient = Prisma.TransactionClient;
type PartySessionRow = Prisma.PartySessionGetPayload<{ include: typeof partySessionInclude }>;
type CharacterRow = Prisma.CharacterGetPayload<{ include: typeof partyCharacterInclude }>;

const LIVE_STATUS = "recruiting";
const LIVE_MEMBERSHIP_STATUSES = ["recruiting", "active"] as const;
const BIG_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.big-brother";

const partyCharacterInclude = {
  user: {
    select: {
      telegramUserId: true,
      lastSeenLocationId: true
    }
  },
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

const partySessionInclude = {
  leader: {
    include: partyCharacterInclude
  },
  participants: {
    include: {
      character: {
        include: partyCharacterInclude
      }
    },
    orderBy: [
      { joinedAt: "asc" as const },
      { id: "asc" as const }
    ]
  }
} satisfies Prisma.PartySessionInclude;

export class PrismaPartySessionRepository implements PartySessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createForTelegramUser(
    telegramUserId: bigint,
    input: CreatePartySessionInput
  ): Promise<PartyCreateRepositoryResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      await expireRecruitingTx(tx, input.now);
      const character = await findCharacterByTelegramUser(tx, telegramUserId);

      if (!character) {
        return { state: "no-character" } satisfies PartyCreateRepositoryResult;
      }

      const liveLeader = await findLiveLeaderSession(tx, character.id);
      if (liveLeader) {
        return { state: "live", session: mapSession(liveLeader) } satisfies PartyCreateRepositoryResult;
      }

      const liveMembership = await findLiveMembershipSession(tx, character.id);
      if (liveMembership) {
        return {
          state: "live-membership",
          session: mapSession(liveMembership)
        } satisfies PartyCreateRepositoryResult;
      }

      const session = await tx.partySession.create({
        data: {
          inviteToken: input.inviteToken,
          status: LIVE_STATUS,
          leaderCharacterId: character.id,
          periodId: input.periodId ?? null,
          originLocationId: input.originLocationId ?? character.user.lastSeenLocationId ?? null,
          participantCap: input.participantCap,
          minimumParticipants: input.minimumParticipants,
          joinUntilAt: input.joinUntilAt,
          expiresAt: input.expiresAt,
          activeLeaderKey: leaderKey(character.id),
          participants: {
            create: {
              characterId: character.id,
              remortCount: character._count.remorts,
              status: "joined",
              joinSource: "leader",
              joinedAt: input.now,
              snapshotJson: snapshotCharacter(character),
              chatId: input.chatId ?? null,
              messageId: input.messageId ?? null,
              activeMembershipKey: membershipKey(character.id)
            }
          }
        },
        include: partySessionInclude
      });

      return {
        state: "created",
        session: mapSession(session)
      } satisfies PartyCreateRepositoryResult;
    }).catch(async (error: unknown): Promise<PartyCreateRepositoryResult> => {
      if (!isUniqueConflict(error)) {
        throw error;
      }

      const character = await findCharacterByTelegramUser(this.prisma, telegramUserId);
      const session = character
        ? await findLiveLeaderSession(this.prisma, character.id)
          ?? await findLiveMembershipSession(this.prisma, character.id)
        : null;

      if (!character) {
        return { state: "no-character" };
      }

      return session
        ? {
            state: session.leaderCharacterId === character.id ? "live" : "live-membership",
            session: mapSession(session)
          }
        : { state: "no-character" };
    });

    return result;
  }

  async joinByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    input: JoinPartySessionInput
  ): Promise<PartyJoinRepositoryResult> {
    return this.prisma.$transaction(async (tx): Promise<PartyJoinRepositoryResult> => {
      await expireTokenIfNeededTx(tx, inviteToken, input.now);
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return { state: "not-found" };
      }

      if (session.status === "expired" || session.status === "cancelled") {
        const terminalState = session.status === "expired" ? "expired" : "cancelled";
        return { state: terminalState, session: mapSession(session) };
      }

      if (
        session.status !== LIVE_STATUS ||
        (session.expiresAt <= input.now && session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID)
      ) {
        const expired = await expireSessionTx(tx, session.id);
        return expired ? { state: "expired", session: mapSession(expired) } : { state: "not-found" };
      }

      if (session.expiresAt <= input.now) {
        return { state: "expired", session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const existing = session.participants.find((row) => row.characterId === character.id);
      if (existing?.status === "joined") {
        return { state: "already-joined", session: mapSession(session) };
      }

      const liveMembership = await findLiveMembershipSession(tx, character.id);
      if (liveMembership && liveMembership.id !== session.id) {
        return { state: "live-membership", session: mapSession(liveMembership) };
      }

      const joinedCount = await tx.partyParticipant.count({
        where: {
          sessionId: session.id,
          status: "joined"
        }
      });

      if (joinedCount >= session.participantCap) {
        return { state: "full", session: mapSession(session) };
      }

      if (existing) {
        await tx.partyParticipant.update({
          where: { id: existing.id },
          data: {
            status: "joined",
            joinSource: input.joinSource,
            joinedAt: input.now,
            leftAt: null,
            remortCount: character._count.remorts,
            snapshotJson: snapshotCharacter(character),
            chatId: input.chatId ?? existing.chatId,
            messageId: input.messageId ?? existing.messageId,
            activeMembershipKey: membershipKey(character.id)
          }
        });
      } else {
        await tx.partyParticipant.create({
          data: {
            sessionId: session.id,
            characterId: character.id,
            remortCount: character._count.remorts,
            status: "joined",
            joinSource: input.joinSource,
            joinedAt: input.now,
            snapshotJson: snapshotCharacter(character),
            chatId: input.chatId ?? null,
            messageId: input.messageId ?? null,
            activeMembershipKey: membershipKey(character.id)
          }
        });
      }

      const afterCount = await tx.partyParticipant.count({
        where: {
          sessionId: session.id,
          status: "joined"
        }
      });

      if (afterCount > session.participantCap) {
        throw new PartyCapacityRaceError();
      }

      const updated = await findSessionById(tx, session.id);
      return updated ? { state: "joined", session: mapSession(updated) } : { state: "not-found" };
    }).catch(async (error: unknown): Promise<PartyJoinRepositoryResult> => {
      if (error instanceof PartyCapacityRaceError) {
        const session = await this.findByToken(inviteToken, input.now);
        return session ? { state: "full", session } : { state: "not-found" };
      }

      if (!isUniqueConflict(error)) {
        throw error;
      }

      const character = await findCharacterByTelegramUser(this.prisma, telegramUserId);
      const liveMembership = character
        ? await findLiveMembershipSession(this.prisma, character.id)
        : null;

      if (!character) {
        return { state: "no-character" };
      }

      if (liveMembership) {
        return { state: "live-membership", session: mapSession(liveMembership) };
      }

      const session = await this.findByToken(inviteToken, input.now);
      return session ? { state: "full", session } : { state: "not-found" };
    });
  }

  async leaveByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyLeaveRepositoryResult> {
    return this.prisma.$transaction(async (tx) => {
      await expireTokenIfNeededTx(tx, inviteToken, now);
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return { state: "not-found" };
      }

      const terminalState = getTerminalReplayState(session);
      if (terminalState) {
        return { state: terminalState, session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const participant = session.participants.find((row) => row.characterId === character.id);
      if (!participant || participant.status !== "joined" || session.status !== LIVE_STATUS) {
        return { state: "not-member", session: mapSession(session) };
      }

      await tx.partyParticipant.update({
        where: { id: participant.id },
        data: {
          status: "left",
          leftAt: now,
          activeMembershipKey: null
        }
      });

      const remaining = await tx.partyParticipant.findMany({
        where: {
          sessionId: session.id,
          status: "joined"
        },
        orderBy: [
          { joinedAt: "asc" },
          { id: "asc" }
        ]
      });

      if (remaining.length === 0) {
        await terminalizeSessionTx(tx, session.id, "cancelled");
        const cancelled = await findSessionById(tx, session.id);
        return cancelled ? { state: "cancelled", session: mapSession(cancelled) } : { state: "not-found" };
      }

      if (session.leaderCharacterId === character.id) {
        const nextLeader = remaining[0]!;
        await tx.partySession.update({
          where: { id: session.id },
          data: {
            leaderCharacterId: nextLeader.characterId,
            activeLeaderKey: leaderKey(nextLeader.characterId),
            version: { increment: 1 }
          }
        });
        const updated = await findSessionById(tx, session.id);
        return updated ? { state: "leader-transferred", session: mapSession(updated) } : { state: "not-found" };
      }

      const updated = await findSessionById(tx, session.id);
      return updated ? { state: "left", session: mapSession(updated) } : { state: "not-found" };
    });
  }

  async cancelByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyCancelRepositoryResult> {
    return this.prisma.$transaction(async (tx) => {
      await expireTokenIfNeededTx(tx, inviteToken, now);
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return { state: "not-found" };
      }

      const terminalState = getTerminalReplayState(session);
      if (terminalState) {
        return { state: terminalState, session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      if (session.leaderCharacterId !== character.id || session.status !== LIVE_STATUS) {
        return { state: "not-leader", session: mapSession(session) };
      }

      await terminalizeSessionTx(tx, session.id, "cancelled");
      const updated = await findSessionById(tx, session.id);
      return updated ? { state: "cancelled", session: mapSession(updated) } : { state: "not-found" };
    });
  }

  async findByToken(inviteToken: string, now: Date): Promise<PartySessionRecord | null> {
    await this.expireByToken(inviteToken, now);
    const session = await findSessionByToken(this.prisma, inviteToken);
    return session ? mapSession(session) : null;
  }

  async findLiveRecruitingByTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<PartySessionRecord | null> {
    await this.expireRecruiting(now);
    const character = await findCharacterByTelegramUser(this.prisma, telegramUserId);
    if (!character) {
      return null;
    }

    const session = await findLiveLeaderSession(this.prisma, character.id);
    return session ? mapSession(session) : null;
  }

  async listRecruitingByOrigin(
    originLocationId: string,
    now: Date,
    limit = 23
  ): Promise<PartySessionRecord[]> {
    await this.expireRecruiting(now);
    const sessions = await this.prisma.partySession.findMany({
      where: {
        status: LIVE_STATUS,
        originLocationId,
        expiresAt: {
          gt: now
        }
      },
      include: partySessionInclude,
      orderBy: [
        { expiresAt: "asc" },
        { createdAt: "asc" }
      ],
      take: limit
    });

    return sessions.map(mapSession);
  }

  async listDueRecruitingByOrigin(
    originLocationId: string,
    now: Date,
    limit = 23
  ): Promise<PartySessionRecord[]> {
    const sessions = await this.prisma.partySession.findMany({
      where: {
        status: LIVE_STATUS,
        originLocationId,
        expiresAt: {
          lte: now
        }
      },
      include: partySessionInclude,
      orderBy: [
        { expiresAt: "asc" },
        { createdAt: "asc" }
      ],
      take: limit
    });

    return sessions.map(mapSession);
  }

  async expireByToken(inviteToken: string, now: Date): Promise<PartySessionRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      await expireTokenIfNeededTx(tx, inviteToken, now);
      const session = await findSessionByToken(tx, inviteToken);
      return session ? mapSession(session) : null;
    });
  }

  async forceExpireByToken(inviteToken: string): Promise<PartySessionRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return null;
      }

      if (session.status === LIVE_STATUS) {
        await terminalizeSessionTx(tx, session.id, "expired");
        const updated = await findSessionById(tx, session.id);
        return updated ? mapSession(updated) : null;
      }

      return mapSession(session);
    });
  }

  async expireRecruiting(now: Date, limit = 23): Promise<number> {
    return expireRecruitingTx(this.prisma, now, limit);
  }

  async cleanupLiveMembershipsForRemort(characterId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await expireRecruitingTx(tx, now);
      const liveRows = await tx.partyParticipant.findMany({
        where: {
          characterId,
          status: "joined",
          activeMembershipKey: membershipKey(characterId),
          session: {
            status: LIVE_STATUS
          }
        },
        include: {
          session: true
        }
      });

      for (const row of liveRows) {
        await tx.partyParticipant.update({
          where: { id: row.id },
          data: {
            status: "left",
            leftAt: now,
            activeMembershipKey: null
          }
        });

        const remaining = await tx.partyParticipant.findMany({
          where: {
            sessionId: row.sessionId,
            status: "joined"
          },
          orderBy: [
            { joinedAt: "asc" },
            { id: "asc" }
          ]
        });

        if (remaining.length === 0) {
        await terminalizeSessionTx(tx, row.sessionId, "cancelled");
        } else if (row.session.leaderCharacterId === characterId) {
          await tx.partySession.update({
            where: { id: row.sessionId },
            data: {
              leaderCharacterId: remaining[0]!.characterId,
              activeLeaderKey: leaderKey(remaining[0]!.characterId),
              version: { increment: 1 }
            }
          });
        }
      }
    });
  }
}

async function findCharacterByTelegramUser(
  prisma: Pick<PrismaClient, "character"> | TxClient,
  telegramUserId: bigint
): Promise<CharacterRow | null> {
  return prisma.character.findFirst({
    where: {
      user: {
        telegramUserId
      }
    },
    include: partyCharacterInclude
  });
}

async function findSessionByToken(
  prisma: Pick<PrismaClient, "partySession"> | TxClient,
  inviteToken: string
): Promise<PartySessionRow | null> {
  return prisma.partySession.findUnique({
    where: { inviteToken },
    include: partySessionInclude
  });
}

async function findSessionById(
  prisma: Pick<PrismaClient, "partySession"> | TxClient,
  id: string
): Promise<PartySessionRow | null> {
  return prisma.partySession.findUnique({
    where: { id },
    include: partySessionInclude
  });
}

async function findLiveLeaderSession(
  prisma: Pick<PrismaClient, "partySession"> | TxClient,
  characterId: string
): Promise<PartySessionRow | null> {
  return prisma.partySession.findFirst({
    where: {
      status: LIVE_STATUS,
      activeLeaderKey: leaderKey(characterId)
    },
    include: partySessionInclude,
    orderBy: {
      updatedAt: "desc"
    }
  });
}

async function findLiveMembershipSession(
  prisma: Pick<PrismaClient, "partyParticipant"> | TxClient,
  characterId: string
): Promise<PartySessionRow | null> {
  const participant = await prisma.partyParticipant.findFirst({
    where: {
      activeMembershipKey: membershipKey(characterId),
      status: "joined",
      session: {
        status: {
          in: [...LIVE_MEMBERSHIP_STATUSES]
        }
      }
    },
    include: {
      session: {
        include: partySessionInclude
      }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  return participant?.session ?? null;
}

async function expireTokenIfNeededTx(tx: TxClient, inviteToken: string, now: Date): Promise<void> {
  const session = await tx.partySession.findUnique({
    where: { inviteToken },
    select: {
      id: true,
      status: true,
      originLocationId: true,
      expiresAt: true
    }
  });

  if (
    session?.status === LIVE_STATUS &&
    session.expiresAt <= now &&
    session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID
  ) {
    await terminalizeSessionTx(tx, session.id, "expired");
  }
}

async function expireSessionTx(
  tx: TxClient,
  sessionId: string
): Promise<PartySessionRow | null> {
  await terminalizeSessionTx(tx, sessionId, "expired");
  return findSessionById(tx, sessionId);
}

async function expireRecruitingTx(
  prisma: Pick<PrismaClient, "partySession" | "partyParticipant"> | TxClient,
  now: Date,
  limit = 23
): Promise<number> {
  const sessions = await prisma.partySession.findMany({
    where: {
      status: LIVE_STATUS,
      originLocationId: {
        not: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID
      },
      expiresAt: {
        lte: now
      }
    },
    select: {
      id: true
    },
    take: limit,
    orderBy: {
      expiresAt: "asc"
    }
  });

  for (const session of sessions) {
    await terminalizeSessionTx(prisma, session.id, "expired");
  }

  return sessions.length;
}

async function terminalizeSessionTx(
  tx: Pick<PrismaClient, "partySession" | "partyParticipant"> | TxClient,
  sessionId: string,
  status: "cancelled" | "expired"
): Promise<void> {
  await tx.partySession.updateMany({
    where: {
      id: sessionId,
      status: LIVE_STATUS
    },
    data: {
      status,
      activeLeaderKey: null,
      version: {
        increment: 1
      }
    }
  });
  await tx.partyParticipant.updateMany({
    where: {
      sessionId,
      activeMembershipKey: {
        not: null
      }
    },
    data: {
      activeMembershipKey: null
    }
  });
}

function mapSession(row: PartySessionRow): PartySessionRecord {
  return {
    id: row.id,
    inviteToken: row.inviteToken,
    status: parseStatus(row.status),
    leaderCharacterId: row.leaderCharacterId,
    periodId: row.periodId,
    originLocationId: row.originLocationId,
    participantCap: row.participantCap,
    minimumParticipants: row.minimumParticipants,
    joinUntilAt: row.joinUntilAt,
    expiresAt: row.expiresAt,
    version: row.version,
    activeLeaderKey: row.activeLeaderKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    leader: mapCharacter(row.leader),
    participants: row.participants.map(mapParticipant)
  };
}

function mapParticipant(row: PartySessionRow["participants"][number]): PartyParticipantRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    characterId: row.characterId,
    remortCount: row.remortCount,
    status: parseParticipantStatus(row.status),
    joinSource: parseJoinSource(row.joinSource),
    joinedAt: row.joinedAt,
    leftAt: row.leftAt,
    chatId: row.chatId,
    messageId: row.messageId,
    character: mapCharacter(row.character)
  };
}

function mapCharacter(row: CharacterRow): PartyCharacterSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    currentLocationId: row.user.lastSeenLocationId,
    name: row.name,
    pronoun: row.pronoun,
    path: row.path,
    raceId: row.raceId,
    classId: row.classId,
    level: row.level,
    xp: row.xp,
    gold: row.gold,
    hpCurrent: row.hpCurrent,
    hpMax: row.hpMax,
    manaCurrent: row.manaCurrent,
    manaMax: row.manaMax,
    hpRegenAt: row.hpRegenAt,
    manaRegenAt: row.manaRegenAt,
    activeCosmeticTitleGrantId: row.activeCosmeticTitleGrantId,
    statsJson: row.statsJson,
    telegramUserId: row.user.telegramUserId,
    remortCount: row._count.remorts
  };
}

function snapshotCharacter(character: CharacterRow): Prisma.InputJsonObject {
  return {
    characterId: character.id,
    displayName: character.name,
    level: character.level,
    raceId: character.raceId,
    classId: character.classId,
    remortCount: character._count.remorts
  };
}

function getTerminalReplayState(row: PartySessionRow): "cancelled" | "expired" | null {
  const status = parseStatus(row.status);
  return status === "cancelled" || status === "expired" ? status : null;
}

function parseStatus(value: string): PartySessionStatus {
  return value === "cancelled" || value === "expired" || value === "active" || value === "completed"
    ? value
    : "recruiting";
}

function parseParticipantStatus(value: string): PartyParticipantStatus {
  return value === "left" ? "left" : "joined";
}

function parseJoinSource(value: string): PartyJoinSource {
  return value === "nearby" || value === "deep-link" || value === "dev" ? value : "leader";
}

function leaderKey(characterId: string): string {
  return `party-leader:${characterId}`;
}

function membershipKey(characterId: string): string {
  return `party-member:${characterId}`;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

class PartyCapacityRaceError extends Error {
  constructor() {
    super("Party capacity changed during join.");
  }
}
