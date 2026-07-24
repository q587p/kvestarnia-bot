import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { items } from "../../content";
import type {
  CreatePartySessionInput,
  JoinPartySessionInput,
  PartyCancelRepositoryResult,
  PartyCharacterSnapshot,
  PartyCreateRepositoryResult,
  PartyJoinRepositoryResult,
  PartyJoinIneligibleReason,
  PartyLeaveRepositoryResult,
  PartyParticipantReadiness,
  PartyParticipantRecord,
  PartyPersonalProtocolFileRepositoryResult,
  PartyPersonalProtocolRecord,
  PartyPersonalProtocolSignRepositoryResult,
  PartyPersonalProtocolSignatureRecord,
  PartyReadinessRepositoryResult,
  PartyWardSignPlaceRepositoryResult,
  PartyWardSignRecord,
  PartyWardSignSupportRecord,
  PartyWardSignSupportRepositoryResult,
  PartySessionRecord,
  PartySessionRepository,
  PartySessionStatus,
  PartyParticipantStatus,
  PartyJoinSource
} from "./partySessionRepository";
import { BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY, isBigBarrelEligible } from "../../domain/partyBoss/partyBoss";
import {
  buildFridayBarrelRaidPendingKey,
  FRIDAY_BARREL_RAID_KEY
} from "../../services/tavernRaidService";
import { buildPartyBossCombatStats } from "./partyBossRepository";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import {
  EQUIPMENT_ATTUNEMENT_ACTION_KEY,
  isEquipmentAttunementPendingForRow
} from "../../domain/equipment/equipmentAttunement";
import { applyPassiveResourceRegeneration } from "../../domain/resources/resourceRegeneration";
import {
  buildShynokRecoveryWindows,
  isShynokDrinkKey
} from "../../domain/shynokDrinks";
import {
  BUREAUCRAMANCER_PROTOCOL_CLASS_ID,
  BUREAUCRAMANCER_PROTOCOL_COOLDOWN_KEY,
  BUREAUCRAMANCER_PROTOCOL_COOLDOWN_MINUTES,
  BUREAUCRAMANCER_PROTOCOL_KIND,
  calculateBureaucramancerProtocolManaCost,
  BUREAUCRAMANCER_PROTOCOL_MIN_LEVEL
} from "../../services/bureaucramancerProtocol";
import { PrismaPartyRaidChatTransactionWriter } from "./prismaPartyRaidChatEvents";

type TxClient = Prisma.TransactionClient;
type PartySessionRow = Prisma.PartySessionGetPayload<{ include: typeof partySessionInclude }>;
type CharacterRow = Prisma.CharacterGetPayload<{ include: typeof partyCharacterInclude }>;

class KharakternykWardSupportManaSpendLostError extends Error {
  constructor(readonly sessionId: string) {
    super("Kharakternyk ward support mana spend lost after reservation.");
  }
}

class PersonalProtocolFilingParticipantChangedError extends Error {
  constructor(
    readonly sessionId: string,
    readonly characterId: string,
    readonly remortCount: number
  ) {
    super("Bureaucramancer personal protocol filer changed after reservation.");
  }
}

class PersonalProtocolFilingManaSpendLostError extends Error {
  constructor(readonly sessionId: string) {
    super("Bureaucramancer personal protocol mana spend lost after reservation.");
  }
}

const LIVE_STATUS = "recruiting";
const LIVE_MEMBERSHIP_STATUSES = ["recruiting", "active"] as const;
const BIG_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.big-brother";
const GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID = "group-combat.proof";
const KHARAKTERNYK_CLASS_ID = "class.kharakternyk";
const KHARAKTERNYK_WARD_PLACEMENT_BASE_MANA_COST = 13;
const KHARAKTERNYK_WARD_SUPPORT_BASE_MANA_COST = 8;
const KHARAKTERNYK_WARD_SUPPORT_CAP = 7;
const KHARAKTERNYK_WARD_SIGN_SNAPSHOT_KEY = "kharakternykWardSign";
const KHARAKTERNYK_WARD_SUPPORT_SNAPSHOT_KEY = "kharakternykWardSupport";
const BUREAUCRAMANCER_PROTOCOL_SNAPSHOT_KEY = "bureaucramancerPersonalProtocol13B";
const BUREAUCRAMANCER_PROTOCOL_SIGNATURE_SNAPSHOT_KEY = "bureaucramancerPersonalProtocol13BSignature";

const partyCharacterInclude = {
  user: {
    select: {
      telegramUserId: true,
      lastSeenLocationId: true
    }
  },
  equipment: {
    orderBy: {
      slot: "asc" as const
    }
  },
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

const personalProtocolCharacterInclude = {
  ...partyCharacterInclude,
  drinkState: true
} satisfies Prisma.CharacterInclude;

type PersonalProtocolCharacterRow = Prisma.CharacterGetPayload<{
  include: typeof personalProtocolCharacterInclude;
}>;

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
  constructor(
    private readonly prisma: PrismaClient,
    private readonly raidChat = new PrismaPartyRaidChatTransactionWriter(false)
  ) {}

  async createForTelegramUser(
    telegramUserId: bigint,
    input: CreatePartySessionInput
  ): Promise<PartyCreateRepositoryResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      await expireRecruitingTx(tx, input.now, 23, this.raidChat);
      const character = await findCharacterByTelegramUser(tx, telegramUserId);

      if (!character) {
        return { state: "no-character" } satisfies PartyCreateRepositoryResult;
      }

      const isBigBarrel = input.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID;
      const [lossCooldown, pendingSoloRaid] = isBigBarrel
        ? await Promise.all([
            findActiveBigBarrelLossCooldown(tx, character.id, input.now),
            input.periodId
              ? findPendingSoloBarrelRaid(tx, character.id, input.periodId)
              : Promise.resolve(null)
          ])
        : [null, null];

      if (lossCooldown) {
        return {
          state: "ineligible",
          reason: "loss-cooldown",
          availableAt: lossCooldown.availableAt,
          now: input.now
        } satisfies PartyCreateRepositoryResult;
      }

      if (pendingSoloRaid) {
        return {
          state: "ineligible",
          reason: "pending-solo-raid",
          availableAt: pendingSoloRaid.availableAt,
          now: input.now
        } satisfies PartyCreateRepositoryResult;
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
      await this.raidChat.append(tx, {
        partySessionId: session.id,
        eventType: "party.created",
        sourceKey: `party:${session.id}:created`,
        occurredAt: input.now,
        actorCharacterId: character.id,
        actorDisplayName: character.name,
        actorRemortCount: character._count.remorts
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
      await expireTokenIfNeededTx(tx, inviteToken, input.now, this.raidChat);
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return { state: "not-found" };
      }

      const terminalState = getTerminalReplayState(session);
      if (terminalState) {
        return { state: terminalState, session: mapSession(session) };
      }

      if (session.status === "active" || session.status === "completed") {
        const character = await findCharacterByTelegramUser(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }
        return { state: "stale", session: mapSession(session) };
      }

      if (
        session.status !== LIVE_STATUS ||
        (session.expiresAt <= input.now && !isAutomaticStartOrigin(session.originLocationId))
      ) {
        const expired = await expireSessionTx(tx, session.id, input.now, this.raidChat);
        return expired ? { state: "expired", session: mapSession(expired) } : { state: "not-found" };
      }

      if (session.expiresAt <= input.now) {
        return { state: "expired", session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const ineligible = await getBigBarrelJoinIneligibleReason(tx, session, character, input.now);
      if (ineligible) {
        return ineligible.reason === "loss-cooldown" || ineligible.reason === "pending-solo-raid"
          ? {
              state: "ineligible",
              reason: ineligible.reason,
              availableAt: ineligible.availableAt,
              now: input.now,
              session: mapSession(session)
            }
          : { state: "ineligible", reason: ineligible.reason, session: mapSession(session) };
      }

      const existing = session.participants.find((row) => row.characterId === character.id);
      if (existing?.status === "joined") {
        return { state: "already-joined", session: mapSession(session) };
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

      let cancelledSoloSession: PartySessionRecord | null = null;
      const liveMembership = await findLiveMembershipSession(tx, character.id);
      if (liveMembership && liveMembership.id !== session.id) {
        if (!isPersonalBigBarrelRecruitingSession(liveMembership, character.id)) {
          return { state: "live-membership", session: mapSession(liveMembership) };
        }
      }

      const claimed = await claimRecruitingSessionVersion(tx, session);
      if (!claimed) {
        const latest = await findSessionById(tx, session.id);
        if (!latest) {
          return { state: "not-found" };
        }
        const latestParticipant = latest.participants.find((row) => row.characterId === character.id);
        return latest.status === LIVE_STATUS && latestParticipant?.status === "joined"
          ? { state: "already-joined", session: mapSession(latest) }
          : { state: "stale", session: mapSession(latest) };
      }

      if (liveMembership && liveMembership.id !== session.id) {
        await terminalizeSessionTx(tx, liveMembership.id, "cancelled", input.now, this.raidChat);
        const cancelled = await findSessionById(tx, liveMembership.id);
        cancelledSoloSession = cancelled ? mapSession(cancelled) : null;
      }

      if (existing) {
        const rejoined = await tx.partyParticipant.updateMany({
          where: {
            id: existing.id,
            sessionId: session.id,
            characterId: character.id,
            status: existing.status,
            remortCount: existing.remortCount,
            updatedAt: existing.updatedAt
          },
          data: {
            status: "joined",
            joinSource: input.joinSource,
            joinedAt: input.now,
            leftAt: null,
            remortCount: character._count.remorts,
            snapshotJson: snapshotCharacterForRejoin(character, existing),
            chatId: input.chatId ?? existing.chatId,
            messageId: input.messageId ?? existing.messageId,
            activeMembershipKey: membershipKey(character.id)
          }
        });
        if (rejoined.count !== 1) {
          throw new PartyPreparationParticipantChangedError(
            session.id,
            character.id,
            character._count.remorts
          );
        }
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

      await this.raidChat.append(tx, {
        partySessionId: session.id,
        eventType: "participant.joined",
        sourceKey: `party:${session.id}:participant:${character.id}:joined:v${session.version + 1}:life:${character._count.remorts}`,
        occurredAt: input.now,
        actorCharacterId: character.id,
        actorDisplayName: character.name,
        actorRemortCount: character._count.remorts
      });

      const updated = await findSessionById(tx, session.id);
      return updated
        ? {
            state: "joined",
            session: mapSession(updated),
            ...(cancelledSoloSession ? { cancelledSoloSession } : {})
          }
        : { state: "not-found" };
    }).catch(async (error: unknown): Promise<PartyJoinRepositoryResult> => {
      if (error instanceof PartyCapacityRaceError) {
        const session = await this.findByToken(inviteToken, input.now);
        return session ? { state: "full", session } : { state: "not-found" };
      }

      if (error instanceof PartyPreparationParticipantChangedError) {
        const latest = await findSessionById(this.prisma, error.sessionId);
        if (!latest) {
          return { state: "not-found" };
        }
        const participant = latest.participants.find((row) =>
          row.characterId === error.characterId && row.status === "joined"
        );
        return participant
          ? { state: "already-joined", session: mapSession(latest) }
          : { state: "stale", session: mapSession(latest) };
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
    return this.prisma.$transaction(async (tx): Promise<PartyLeaveRepositoryResult> => {
      await expireTokenIfNeededTx(tx, inviteToken, now, this.raidChat);
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
      if (!participant || participant.status !== "joined") {
        return { state: "not-member", session: mapSession(session) };
      }
      if (session.status !== LIVE_STATUS) {
        return { state: "stale", session: mapSession(session) };
      }

      const remaining = session.participants
        .filter((row) => row.status === "joined" && row.id !== participant.id)
        .sort((left, right) =>
          left.joinedAt.getTime() - right.joinedAt.getTime() || left.id.localeCompare(right.id)
        );
      const claimed = await claimRecruitingSessionVersion(tx, session);
      if (!claimed) {
        const latest = await findSessionById(tx, session.id);
        if (!latest) {
          return { state: "not-found" };
        }
        const latestTerminalState = getTerminalReplayState(latest);
        return latestTerminalState
          ? { state: latestTerminalState, session: mapSession(latest) }
          : { state: "stale", session: mapSession(latest) };
      }

      const left = await tx.partyParticipant.updateMany({
        where: {
          id: participant.id,
          sessionId: session.id,
          characterId: character.id,
          status: "joined",
          remortCount: participant.remortCount,
          updatedAt: participant.updatedAt
        },
        data: {
          status: "left",
          leftAt: now,
          activeMembershipKey: null
        }
      });
      if (left.count !== 1) {
        throw new PartyPreparationParticipantChangedError(
          session.id,
          character.id,
          character._count.remorts
        );
      }

      await this.raidChat.append(tx, {
        partySessionId: session.id,
        eventType: "participant.left",
        sourceKey: `party:${session.id}:participant:${character.id}:left:${participant.joinedAt.toISOString()}`,
        occurredAt: now,
        actorCharacterId: character.id,
        actorDisplayName: character.name,
        actorRemortCount: participant.remortCount
      });
      await this.raidChat.revokeParticipant(tx, participant.id, session.id, character.id, now);

      if (remaining.length === 0) {
        await terminalizeSessionTx(tx, session.id, "cancelled", now, this.raidChat);
        const cancelled = await findSessionById(tx, session.id);
        return cancelled ? { state: "cancelled", session: mapSession(cancelled) } : { state: "not-found" };
      }

      if (session.leaderCharacterId === character.id) {
        const nextLeader = remaining[0]!;
        await tx.partySession.update({
          where: { id: session.id },
          data: {
            leaderCharacterId: nextLeader.characterId,
            activeLeaderKey: leaderKey(nextLeader.characterId)
          }
        });
        await this.raidChat.append(tx, {
          partySessionId: session.id,
          eventType: "leader.transferred",
          sourceKey: `party:${session.id}:leader:${nextLeader.characterId}:${session.version + 1}`,
          occurredAt: now,
          actorCharacterId: nextLeader.characterId,
          actorDisplayName: nextLeader.character.name,
          actorRemortCount: nextLeader.remortCount
        });
        const updated = await findSessionById(tx, session.id);
        return updated ? { state: "leader-transferred", session: mapSession(updated) } : { state: "not-found" };
      }

      const updated = await findSessionById(tx, session.id);
      return updated ? { state: "left", session: mapSession(updated) } : { state: "not-found" };
    }).catch(async (error: unknown): Promise<PartyLeaveRepositoryResult> => {
      if (!(error instanceof PartyPreparationParticipantChangedError)) {
        throw error;
      }

      const latest = await findSessionById(this.prisma, error.sessionId);
      if (!latest) {
        return { state: "not-found" };
      }
      const terminalState = getTerminalReplayState(latest);
      return terminalState
        ? { state: terminalState, session: mapSession(latest) }
        : latest.participants.some((row) => row.characterId === error.characterId && row.status === "joined")
          ? { state: "stale", session: mapSession(latest) }
          : { state: "not-member", session: mapSession(latest) };
    });
  }

  async cancelByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyCancelRepositoryResult> {
    return this.prisma.$transaction(async (tx) => {
      await expireTokenIfNeededTx(tx, inviteToken, now, this.raidChat);
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

      if (session.leaderCharacterId !== character.id) {
        return { state: "not-leader", session: mapSession(session) };
      }
      if (session.status !== LIVE_STATUS) {
        return { state: "stale", session: mapSession(session) };
      }

      await terminalizeSessionTx(tx, session.id, "cancelled", now, this.raidChat);
      const updated = await findSessionById(tx, session.id);
      if (!updated) {
        return { state: "not-found" };
      }
      const updatedTerminalState = getTerminalReplayState(updated);
      return updatedTerminalState
        ? { state: updatedTerminalState, session: mapSession(updated) }
        : { state: "stale", session: mapSession(updated) };
    });
  }

  async setParticipantReadiness(
    telegramUserId: bigint,
    inviteToken: string,
    readiness: PartyParticipantReadiness,
    now: Date
  ): Promise<PartyReadinessRepositoryResult> {
    return this.prisma.$transaction(async (tx): Promise<PartyReadinessRepositoryResult> => {
      await expireTokenIfNeededTx(tx, inviteToken, now, this.raidChat);
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return { state: "not-found" };
      }

      const terminalState = getTerminalReplayState(session);
      if (terminalState) {
        return { state: terminalState, session: mapSession(session) };
      }

      if (session.status !== LIVE_STATUS) {
        return { state: "not-recruiting", session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const participant = session.participants.find((row) =>
        row.characterId === character.id && row.status === "joined"
      );
      if (!participant) {
        return { state: "not-member", session: mapSession(session) };
      }

      if (parseParticipantReadiness(participant.snapshotJson) === readiness) {
        return { state: "already-set", session: mapSession(session) };
      }

      const claimed = await claimRecruitingSessionVersion(tx, session);
      if (!claimed) {
        const latest = await findSessionById(tx, session.id);
        if (!latest) {
          return { state: "not-found" };
        }
        const latestTerminalState = getTerminalReplayState(latest);
        if (latestTerminalState) {
          return { state: latestTerminalState, session: mapSession(latest) };
        }
        if (latest.status !== LIVE_STATUS) {
          return { state: "not-recruiting", session: mapSession(latest) };
        }
        const latestParticipant = latest.participants.find((row) =>
          row.characterId === character.id && row.status === "joined"
        );
        if (!latestParticipant) {
          return { state: "not-member", session: mapSession(latest) };
        }
        return parseParticipantReadiness(latestParticipant.snapshotJson) === readiness
          ? { state: "already-set", session: mapSession(latest) }
          : { state: "stale", session: mapSession(latest) };
      }

      const updatedParticipant = await tx.partyParticipant.updateMany({
        where: {
          id: participant.id,
          sessionId: session.id,
          characterId: character.id,
          status: "joined",
          updatedAt: participant.updatedAt
        },
        data: {
          snapshotJson: snapshotWithReadiness(participant.snapshotJson, readiness)
        }
      });
      if (updatedParticipant.count !== 1) {
        throw new PartyPreparationParticipantChangedError(
          session.id,
          character.id,
          character._count.remorts
        );
      }

      const updated = await findSessionById(tx, session.id);
      return updated ? { state: "updated", session: mapSession(updated) } : { state: "not-found" };
    }).catch(async (error: unknown): Promise<PartyReadinessRepositoryResult> => {
      if (!(error instanceof PartyPreparationParticipantChangedError)) {
        throw error;
      }

      const latest = await findSessionById(this.prisma, error.sessionId);
      if (!latest) {
        return { state: "not-found" };
      }
      const terminalState = getTerminalReplayState(latest);
      if (terminalState) {
        return { state: terminalState, session: mapSession(latest) };
      }
      if (latest.status !== LIVE_STATUS) {
        return { state: "not-recruiting", session: mapSession(latest) };
      }
      const participant = latest.participants.find((row) =>
        row.characterId === error.characterId && row.status === "joined"
      );
      return participant
        ? parseParticipantReadiness(participant.snapshotJson) === readiness
          ? { state: "already-set", session: mapSession(latest) }
          : { state: "stale", session: mapSession(latest) }
        : { state: "not-member", session: mapSession(latest) };
    });
  }

  async placeKharakternykWardSign(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyWardSignPlaceRepositoryResult> {
    return this.prisma.$transaction(async (tx): Promise<PartyWardSignPlaceRepositoryResult> => {
      await expireTokenIfNeededTx(tx, inviteToken, now, this.raidChat);
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return { state: "not-found" };
      }

      const terminalState = getTerminalReplayState(session);
      if (terminalState) {
        return { state: terminalState, session: mapSession(session) };
      }

      if (session.status !== LIVE_STATUS) {
        return { state: "not-recruiting", session: mapSession(session) };
      }

      if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
        return { state: "not-big-barrel", session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const participant = session.participants.find((row) =>
        row.characterId === character.id && row.status === "joined"
      );
      if (!participant) {
        return { state: "not-member", session: mapSession(session) };
      }
      if (participant.remortCount !== character._count.remorts) {
        return { state: "not-member", session: mapSession(session) };
      }

      const existingWard = getActiveWardSign(session);
      if (existingWard?.placerCharacterId === character.id) {
        return { state: "already-placed", session: mapSession(session) };
      }
      if (existingWard) {
        return { state: "already-exists", session: mapSession(session) };
      }

      if (character.classId !== KHARAKTERNYK_CLASS_ID || character.level < 3) {
        return { state: "ineligible", session: mapSession(session) };
      }

      const manaCost = calculateWardPlacementManaCost(character);
      if (character.manaCurrent < manaCost) {
        return { state: "not-enough-mana", session: mapSession(session) };
      }

      const reserved = await reserveKharakternykWardSignSlot(tx, session);
      if (reserved !== "reserved") {
        return resolveKharakternykWardSignReservationLoss(reserved, character.id);
      }

      const spent = await tx.character.updateMany({
        where: {
          id: character.id,
          manaCurrent: {
            gte: manaCost
          }
        },
        data: {
          manaCurrent: {
            decrement: manaCost
          },
          manaRegenAt: now
        }
      });
      if (spent.count !== 1) {
        return { state: "not-enough-mana", session: mapSession(session) };
      }

      await tx.partyParticipant.update({
        where: { id: participant.id },
        data: {
          snapshotJson: snapshotWithWardSign(participant.snapshotJson, {
            kind: "kharakternyk",
            placerCharacterId: character.id,
            remortCount: character._count.remorts,
            manaCost,
            placedAt: now.toISOString()
          })
        }
      });

      await this.raidChat.append(tx, {
        partySessionId: session.id,
        eventType: "ward.placed",
        sourceKey: `party:${session.id}:ward:${character.id}`,
        occurredAt: now,
        actorCharacterId: character.id,
        actorDisplayName: character.name,
        actorRemortCount: character._count.remorts
      });
      const updated = await findSessionById(tx, session.id);
      return updated ? { state: "updated", session: mapSession(updated) } : { state: "not-found" };
    });
  }

  async supportKharakternykWardSign(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyWardSignSupportRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (tx): Promise<PartyWardSignSupportRepositoryResult> => {
        await expireTokenIfNeededTx(tx, inviteToken, now, this.raidChat);
        const session = await findSessionByToken(tx, inviteToken);

        if (!session) {
          return { state: "not-found" };
        }

        const terminalState = getTerminalReplayState(session);
        if (terminalState) {
          return { state: terminalState, session: mapSession(session) };
        }

        if (session.status !== LIVE_STATUS) {
          return { state: "not-recruiting", session: mapSession(session) };
        }

        if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
          return { state: "not-big-barrel", session: mapSession(session) };
        }

        const character = await findCharacterByTelegramUser(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }

        const participant = session.participants.find((row) =>
          row.characterId === character.id && row.status === "joined"
        );
        if (!participant) {
          return { state: "not-member", session: mapSession(session) };
        }
        if (participant.remortCount !== character._count.remorts) {
          return { state: "not-member", session: mapSession(session) };
        }

        const ward = getActiveWardSign(session);
        if (!ward) {
          return { state: "no-sign", session: mapSession(session) };
        }

        if (ward.placerCharacterId === character.id) {
          return { state: "self-support", session: mapSession(session) };
        }

        const existingSupport = parseWardSupport(participant.snapshotJson);
        if (existingSupport?.placerCharacterId === ward.placerCharacterId) {
          return { state: "already-supported", session: mapSession(session) };
        }

        const manaCost = calculateWardSupportManaCost(character);
        if (character.manaCurrent < manaCost) {
          return { state: "not-enough-mana", session: mapSession(session) };
        }

        const reserved = await reserveKharakternykWardSupportSlot(tx, session, participant, character, {
          kind: "kharakternyk",
          placerCharacterId: ward.placerCharacterId,
          supporterCharacterId: character.id,
          remortCount: character._count.remorts,
          manaCost,
          supportedAt: now.toISOString()
        });
        if (reserved !== "reserved") {
          return resolveKharakternykWardSupportReservationLoss(reserved, character.id, character._count.remorts);
        }

        const spent = await tx.character.updateMany({
          where: {
            id: character.id,
            manaCurrent: {
              gte: manaCost
            }
          },
          data: {
            manaCurrent: {
              decrement: manaCost
            },
            manaRegenAt: now
          }
        });
        if (spent.count !== 1) {
          throw new KharakternykWardSupportManaSpendLostError(session.id);
        }

        await this.raidChat.append(tx, {
          partySessionId: session.id,
          eventType: "ward.supported",
          sourceKey: `party:${session.id}:ward-support:${character.id}`,
          occurredAt: now,
          actorCharacterId: character.id,
          actorDisplayName: character.name,
          actorRemortCount: character._count.remorts
        });

        const updated = await findSessionById(tx, session.id);
        return updated ? { state: "updated", session: mapSession(updated) } : { state: "not-found" };
      });
    } catch (error) {
      if (error instanceof PartyPreparationParticipantChangedError) {
        const session = await findSessionById(this.prisma, error.sessionId);
        return resolveKharakternykWardSupportReservationLoss(
          session,
          error.characterId,
          error.remortCount
        );
      }

      if (error instanceof KharakternykWardSupportManaSpendLostError) {
        const session = await findSessionById(this.prisma, error.sessionId);
        return session ? { state: "not-enough-mana", session: mapSession(session) } : { state: "not-found" };
      }

      throw error;
    }
  }

  async fileBureaucramancerPersonalProtocol(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyPersonalProtocolFileRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (tx): Promise<PartyPersonalProtocolFileRepositoryResult> => {
      await expireTokenIfNeededTx(tx, inviteToken, now, this.raidChat);
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return { state: "not-found" };
      }

      const terminalState = getTerminalReplayState(session);
      if (terminalState) {
        return { state: terminalState, session: mapSession(session) };
      }

      if (session.status !== LIVE_STATUS || session.expiresAt <= now) {
        return { state: session.expiresAt <= now ? "expired" : "not-recruiting", session: mapSession(session) };
      }

      if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
        return { state: "not-big-barrel", session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const participant = session.participants.find((row) =>
        row.characterId === character.id && row.status === "joined"
      );
      if (!participant || participant.remortCount !== character._count.remorts) {
        return { state: "not-member", session: mapSession(session) };
      }

      const existingProtocol = getActivePersonalProtocol(session);
      if (existingProtocol?.filerCharacterId === character.id) {
        return { state: "already-filed", session: mapSession(session) };
      }
      if (existingProtocol) {
        return { state: "already-exists", session: mapSession(session) };
      }

      if (character.classId !== BUREAUCRAMANCER_PROTOCOL_CLASS_ID || character.level < BUREAUCRAMANCER_PROTOCOL_MIN_LEVEL) {
        return { state: "ineligible", session: mapSession(session) };
      }

      const activeLease = await tx.activeCombatLease.findUnique({
        where: { characterId: character.id },
        select: { id: true }
      });
      if (activeLease) {
        return { state: "blocked", session: mapSession(session) };
      }

      const cooldown = await tx.characterCooldown.findUnique({
        where: {
          characterId_key: {
            characterId: character.id,
            key: BUREAUCRAMANCER_PROTOCOL_COOLDOWN_KEY
          }
        },
        select: { availableAt: true }
      });
      if (cooldown && cooldown.availableAt > now) {
        return { state: "cooldown", availableAt: cooldown.availableAt, now, session: mapSession(session) };
      }

      const protocolCharacter = await tx.character.findUnique({
        where: { id: character.id },
        include: personalProtocolCharacterInclude
      });
      if (!protocolCharacter) {
        return { state: "no-character" };
      }
      const attunementPayloads = await findCurrentEquipmentAttunementPayloads(tx, protocolCharacter);
      const protocolResources = getPersonalProtocolResources(protocolCharacter, attunementPayloads, now);
      const manaCost = calculateBureaucramancerProtocolManaCost({
        level: protocolResources.summary.level,
        intelligence: protocolResources.summary.stats.intelligence
      });
      if (protocolResources.regeneration.resources.manaCurrent < manaCost) {
        return { state: "not-enough-mana", session: mapSession(session) };
      }

      const reserved = await reservePersonalProtocolSlot(tx, session);
      if (reserved !== "reserved") {
        return resolvePersonalProtocolFileReservationLoss(reserved, character.id, now);
      }

      const protocolId = buildPersonalProtocolId(session.id);
      const spent = await tx.character.updateMany({
        where: {
          id: character.id,
          manaCurrent: protocolCharacter.manaCurrent,
          manaRegenAt: protocolCharacter.manaRegenAt
        },
        data: {
          manaCurrent: protocolResources.regeneration.resources.manaCurrent - manaCost,
          manaMax: protocolResources.regeneration.resources.manaMax,
          manaRegenAt: now
        }
      });
      if (spent.count !== 1) {
        throw new PersonalProtocolFilingManaSpendLostError(session.id);
      }

      await tx.characterCooldown.upsert({
        where: {
          characterId_key: {
            characterId: character.id,
            key: BUREAUCRAMANCER_PROTOCOL_COOLDOWN_KEY
          }
        },
        create: {
          characterId: character.id,
          key: BUREAUCRAMANCER_PROTOCOL_COOLDOWN_KEY,
          availableAt: addMinutes(now, BUREAUCRAMANCER_PROTOCOL_COOLDOWN_MINUTES),
          resultJson: {
            kind: BUREAUCRAMANCER_PROTOCOL_KIND,
            partySessionId: session.id,
            protocolId,
            manaCost
          }
        },
        update: {
          availableAt: addMinutes(now, BUREAUCRAMANCER_PROTOCOL_COOLDOWN_MINUTES),
          resultJson: {
            kind: BUREAUCRAMANCER_PROTOCOL_KIND,
            partySessionId: session.id,
            protocolId,
            manaCost
          }
        }
      });

      const committedParticipant = await tx.partyParticipant.updateMany({
        where: {
          id: participant.id,
          sessionId: session.id,
          characterId: character.id,
          status: "joined",
          remortCount: character._count.remorts,
          updatedAt: participant.updatedAt
        },
        data: {
          snapshotJson: snapshotWithPersonalProtocol(participant.snapshotJson, {
            kind: BUREAUCRAMANCER_PROTOCOL_KIND,
            protocolId,
            filerCharacterId: character.id,
            remortCount: character._count.remorts,
            manaCost,
            filedAt: now.toISOString()
          }, {
            kind: BUREAUCRAMANCER_PROTOCOL_KIND,
            protocolId,
            filerCharacterId: character.id,
            signerCharacterId: character.id,
            remortCount: character._count.remorts,
            signedAt: now.toISOString()
          })
        }
      });
      if (committedParticipant.count !== 1) {
        throw new PersonalProtocolFilingParticipantChangedError(
          session.id,
          character.id,
          character._count.remorts
        );
      }


      await this.raidChat.append(tx, {
        partySessionId: session.id,
        eventType: "protocol.filed",
        sourceKey: `party:${session.id}:protocol:${protocolId}:filed`,
        occurredAt: now,
        actorCharacterId: character.id,
        actorDisplayName: character.name,
        actorRemortCount: character._count.remorts,
        payload: { protocolId }
      });

      const updated = await findSessionById(tx, session.id);
      return updated ? { state: "updated", session: mapSession(updated) } : { state: "not-found" };
      });
    } catch (error) {
      if (error instanceof PersonalProtocolFilingManaSpendLostError) {
        const session = await findSessionById(this.prisma, error.sessionId);
        return session ? { state: "not-enough-mana", session: mapSession(session) } : { state: "not-found" };
      }

      if (error instanceof PersonalProtocolFilingParticipantChangedError) {
        const session = await findSessionById(this.prisma, error.sessionId);
        if (!session) {
          return { state: "not-found" };
        }

        const participant = session.participants.find((row) =>
          row.characterId === error.characterId &&
          row.status === "joined" &&
          row.remortCount === error.remortCount
        );
        return participant
          ? { state: "stale", session: mapSession(session) }
          : { state: "not-member", session: mapSession(session) };
      }

      throw error;
    }
  }

  async signBureaucramancerPersonalProtocol(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyPersonalProtocolSignRepositoryResult> {
    return this.prisma.$transaction(async (tx): Promise<PartyPersonalProtocolSignRepositoryResult> => {
      await expireTokenIfNeededTx(tx, inviteToken, now, this.raidChat);
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return { state: "not-found" };
      }

      const terminalState = getTerminalReplayState(session);
      if (terminalState) {
        return { state: terminalState, session: mapSession(session) };
      }

      if (session.status !== LIVE_STATUS || session.expiresAt <= now) {
        return { state: session.expiresAt <= now ? "expired" : "not-recruiting", session: mapSession(session) };
      }

      if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
        return { state: "not-big-barrel", session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const participant = session.participants.find((row) =>
        row.characterId === character.id && row.status === "joined"
      );
      if (!participant || participant.remortCount !== character._count.remorts) {
        return { state: "not-member", session: mapSession(session) };
      }

      const protocol = getActivePersonalProtocol(session);
      if (!protocol) {
        return { state: "no-protocol", session: mapSession(session) };
      }

      const existingSignature = parsePersonalProtocolSignature(participant.snapshotJson);
      if (matchesPersonalProtocolIdentity(existingSignature, protocol)) {
        return { state: "already-signed", session: mapSession(session) };
      }

      const activeLease = await tx.activeCombatLease.findUnique({
        where: { characterId: character.id },
        select: { id: true }
      });
      if (activeLease) {
        return { state: "blocked", session: mapSession(session) };
      }

      const reserved = await reservePersonalProtocolSignatureSlot(tx, session, participant, character, protocol, now);
      if (reserved !== "reserved") {
        return resolvePersonalProtocolSignReservationLoss(reserved, character.id, character._count.remorts);
      }

      await this.raidChat.append(tx, {
        partySessionId: session.id,
        eventType: "protocol.signed",
        sourceKey: `party:${session.id}:protocol:${protocol.protocolId}:signed:${character.id}`,
        occurredAt: now,
        actorCharacterId: character.id,
        actorDisplayName: character.name,
        actorRemortCount: character._count.remorts,
        payload: { protocolId: protocol.protocolId }
      });

      const updated = await findSessionById(tx, session.id);
      return updated ? { state: "updated", session: mapSession(updated) } : { state: "not-found" };
    }).catch(async (error: unknown): Promise<PartyPersonalProtocolSignRepositoryResult> => {
      if (!(error instanceof PartyPreparationParticipantChangedError)) {
        throw error;
      }

      const latest = await findSessionById(this.prisma, error.sessionId);
      return resolvePersonalProtocolSignReservationLoss(
        latest,
        error.characterId,
        error.remortCount
      );
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

  async recordParticipantMessageReference(
    telegramUserId: bigint,
    inviteToken: string,
    input: { chatId: bigint; messageId: number; now: Date }
  ): Promise<PartySessionRecord | null> {
    return this.prisma.$transaction(async (tx): Promise<PartySessionRecord | null> => {
      const session = await findSessionByToken(tx, inviteToken);
      if (!session) {
        return null;
      }

      const participant = session.participants.find(
        (row) => row.status === "joined" && row.character.user.telegramUserId === telegramUserId
      );
      if (!participant) {
        return mapSession(session);
      }

      await tx.partyParticipant.update({
        where: { id: participant.id },
        data: {
          chatId: input.chatId,
          messageId: input.messageId,
          joinedAt: participant.joinedAt
        }
      });
      const updated = await findSessionById(tx, session.id);
      return updated ? mapSession(updated) : null;
    });
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
      await expireTokenIfNeededTx(tx, inviteToken, now, this.raidChat);
      const session = await findSessionByToken(tx, inviteToken);
      return session ? mapSession(session) : null;
    });
  }

  async forceExpireByToken(
    inviteToken: string,
    now: Date,
    expectedVersion?: number
  ): Promise<PartySessionRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const session = await findSessionByToken(tx, inviteToken);

      if (!session) {
        return null;
      }

      if (
        session.status === LIVE_STATUS &&
        (expectedVersion === undefined || session.version === expectedVersion)
      ) {
        await terminalizeSessionTx(tx, session.id, "expired", now, this.raidChat, expectedVersion);
        const updated = await findSessionById(tx, session.id);
        return updated ? mapSession(updated) : null;
      }

      return mapSession(session);
    });
  }

  async expireRecruiting(now: Date, limit = 23): Promise<number> {
    return this.prisma.$transaction((tx) => expireRecruitingTx(tx, now, limit, this.raidChat));
  }

  async cleanupLiveMembershipsForRemort(characterId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
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
          session: true,
          character: { select: { name: true } }
        }
      });

      for (const row of liveRows) {
        if (row.session.expiresAt <= now) {
          await terminalizeSessionTx(tx, row.sessionId, "expired", now, this.raidChat);
          await this.raidChat.revokeParticipant(tx, row.id, row.sessionId, characterId, now);
          continue;
        }
        await tx.partyParticipant.update({
          where: { id: row.id },
          data: {
            status: "left",
            leftAt: now,
            activeMembershipKey: null
          }
        });
        await this.raidChat.append(tx, {
          partySessionId: row.sessionId,
          eventType: "participant.removed",
          sourceKey: `party:${row.sessionId}:participant:${characterId}:remort:${row.remortCount}`,
          occurredAt: now,
          actorCharacterId: characterId,
          actorDisplayName: row.character.name,
          actorRemortCount: row.remortCount
        });
        await this.raidChat.revokeParticipant(tx, row.id, row.sessionId, characterId, now);

        const remaining = await tx.partyParticipant.findMany({
          where: {
            sessionId: row.sessionId,
            status: "joined"
          },
          orderBy: [
            { joinedAt: "asc" },
            { id: "asc" }
          ],
          include: { character: { select: { name: true } } }
        });

        if (remaining.length === 0) {
          await terminalizeSessionTx(tx, row.sessionId, "cancelled", now, this.raidChat);
        } else if (row.session.leaderCharacterId === characterId) {
          const transferred = await tx.partySession.update({
            where: { id: row.sessionId },
            data: {
              leaderCharacterId: remaining[0]!.characterId,
              activeLeaderKey: leaderKey(remaining[0]!.characterId),
              version: { increment: 1 }
            },
            select: { version: true }
          });
          await this.raidChat.append(tx, {
            partySessionId: row.sessionId,
            eventType: "leader.transferred",
            sourceKey: `party:${row.sessionId}:leader:${remaining[0]!.characterId}:remort:${transferred.version}`,
            occurredAt: now,
            actorCharacterId: remaining[0]!.characterId,
            actorDisplayName: remaining[0]!.character.name,
            actorRemortCount: remaining[0]!.remortCount
          });
        }
      }
    });
  }
}

export function resolvePersonalProtocolSignReservationState(
  signature: PersonalProtocolIdentity | null,
  protocol: PersonalProtocolIdentity
): "already-signed" | "stale" {
  return matchesPersonalProtocolIdentity(signature, protocol) ? "already-signed" : "stale";
}

class PartyPreparationParticipantChangedError extends Error {
  constructor(
    readonly sessionId: string,
    readonly characterId: string,
    readonly remortCount: number
  ) {
    super("Party preparation participant changed after parent version claim.");
  }
}

export interface PersonalProtocolIdentity {
  protocolId: string;
  filerCharacterId: string;
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

async function expireTokenIfNeededTx(
  tx: TxClient,
  inviteToken: string,
  now: Date,
  raidChat: PrismaPartyRaidChatTransactionWriter
): Promise<void> {
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
    !isAutomaticStartOrigin(session.originLocationId)
  ) {
    await terminalizeSessionTx(tx, session.id, "expired", now, raidChat);
  }
}

async function expireSessionTx(
  tx: TxClient,
  sessionId: string,
  now: Date,
  raidChat: PrismaPartyRaidChatTransactionWriter
): Promise<PartySessionRow | null> {
  await terminalizeSessionTx(tx, sessionId, "expired", now, raidChat);
  return findSessionById(tx, sessionId);
}

async function expireRecruitingTx(
  prisma: TxClient,
  now: Date,
  limit: number,
  raidChat: PrismaPartyRaidChatTransactionWriter
): Promise<number> {
  const sessions = await prisma.partySession.findMany({
    where: {
      status: LIVE_STATUS,
      originLocationId: {
        notIn: [
          BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
          GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID
        ]
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
    await terminalizeSessionTx(prisma, session.id, "expired", now, raidChat);
  }

  return sessions.length;
}

function isAutomaticStartOrigin(originLocationId: string | null): boolean {
  return originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID ||
    originLocationId === GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID;
}

async function terminalizeSessionTx(
  tx: TxClient,
  sessionId: string,
  status: "cancelled" | "expired",
  now: Date,
  raidChat: PrismaPartyRaidChatTransactionWriter,
  expectedVersion?: number
): Promise<void> {
  const transitioned = await tx.partySession.updateMany({
    where: {
      id: sessionId,
      status: LIVE_STATUS,
      ...(expectedVersion === undefined ? {} : { version: expectedVersion })
    },
    data: {
      status,
      activeLeaderKey: null,
      version: {
        increment: 1
      }
    }
  });
  if (transitioned.count !== 1) {
    return;
  }
  await raidChat.append(tx, {
    partySessionId: sessionId,
    eventType: status === "expired" ? "raid.expired" : "raid.cancelled",
    sourceKey: `party:${sessionId}:terminal:${status}`,
    occurredAt: now
  });
  await raidChat.terminalize(tx, sessionId, now);
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
  const wardSign = mapWardSign(row);
  const personalProtocol = mapPersonalProtocol(row);
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
    participants: row.participants.map(mapParticipant),
    ...(wardSign ? { wardSign } : {}),
    ...(personalProtocol ? { personalProtocol } : {})
  };
}

function mapWardSign(row: PartySessionRow): PartyWardSignRecord | null {
  const active = getActiveWardSign(row);
  if (!active) {
    return null;
  }

  return {
    kind: "kharakternyk",
    placerCharacterId: active.placerCharacterId,
    supportCount: countActiveWardSupports(row, active.placerCharacterId),
    supportCap: KHARAKTERNYK_WARD_SUPPORT_CAP,
    manaCost: active.manaCost,
    placedAt: new Date(active.placedAt)
  };
}

function mapPersonalProtocol(row: PartySessionRow): PartyPersonalProtocolRecord | null {
  const active = getActivePersonalProtocol(row);
  if (!active) {
    return null;
  }

  return {
    kind: BUREAUCRAMANCER_PROTOCOL_KIND,
    protocolId: active.protocolId,
    filerCharacterId: active.filerCharacterId,
    signatureCount: countActivePersonalProtocolSignatures(row, active),
    manaCost: active.manaCost,
    filedAt: new Date(active.filedAt)
  };
}

function isPersonalBigBarrelRecruitingSession(session: PartySessionRow, characterId: string): boolean {
  const joined = session.participants.filter((participant) => participant.status === "joined");

  return (
    session.status === LIVE_STATUS &&
    session.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID &&
    session.leaderCharacterId === characterId &&
    joined.length === 1 &&
    joined[0]?.characterId === characterId
  );
}

async function getBigBarrelJoinIneligibleReason(
  tx: TxClient,
  session: PartySessionRow,
  character: CharacterRow,
  now: Date
): Promise<
  | { reason: Exclude<PartyJoinIneligibleReason, "loss-cooldown" | "pending-solo-raid"> }
  | { reason: "loss-cooldown"; availableAt: Date }
  | { reason: "pending-solo-raid"; availableAt: Date }
  | null
> {
  if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
    return null;
  }

  if (!isBigBarrelEligible(character.level, character._count.remorts)) {
    return { reason: "level-gate" };
  }

  const [activeLease, existingSuccess, pendingSoloRaid, activeLossCooldown] = await Promise.all([
    tx.activeCombatLease.findUnique({
      where: {
        characterId: character.id
      },
      select: {
        id: true
      }
    }),
    session.periodId
      ? tx.dailyAction.findUnique({
          where: {
            characterId_key_localDate: {
              characterId: character.id,
              key: FRIDAY_BARREL_RAID_KEY,
              localDate: session.periodId
            }
          },
          select: {
            id: true
          }
        })
      : Promise.resolve(null),
    session.periodId
      ? findPendingSoloBarrelRaid(tx, character.id, session.periodId)
      : Promise.resolve(null),
    findActiveBigBarrelLossCooldown(tx, character.id, now)
  ]);

  if (activeLease) {
    return { reason: "active-combat" };
  }

  if (existingSuccess) {
    return { reason: "already-completed" };
  }

  if (pendingSoloRaid) {
    return {
      reason: "pending-solo-raid",
      availableAt: pendingSoloRaid.availableAt
    };
  }

  if (activeLossCooldown) {
    return {
      reason: "loss-cooldown",
      availableAt: activeLossCooldown.availableAt
    };
  }

  return null;
}

async function findActiveBigBarrelLossCooldown(
  tx: TxClient,
  characterId: string,
  now: Date
): Promise<{ availableAt: Date } | null> {
  const cooldown = await tx.characterCooldown.findUnique({
    where: {
      characterId_key: {
        characterId,
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY
      }
    },
    select: {
      availableAt: true
    }
  });

  return cooldown && cooldown.availableAt > now ? cooldown : null;
}

async function findPendingSoloBarrelRaid(
  tx: TxClient,
  characterId: string,
  periodId: string
): Promise<{ availableAt: Date } | null> {
  const [pending, completed] = await Promise.all([
    tx.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId,
          key: buildFridayBarrelRaidPendingKey(periodId)
        }
      },
      select: {
        availableAt: true
      }
    }),
    tx.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId,
          key: FRIDAY_BARREL_RAID_KEY,
          localDate: periodId
        }
      },
      select: {
        id: true
      }
    })
  ]);

  return pending && !completed ? pending : null;
}

function mapParticipant(row: PartySessionRow["participants"][number]): PartyParticipantRecord {
  const wardSignSupport = parseWardSupport(row.snapshotJson);
  const personalProtocolSignature = parsePersonalProtocolSignatureRecord(row.snapshotJson);
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
    readiness: parseParticipantReadiness(row.snapshotJson),
    ...(wardSignSupport ? { wardSignSupport } : {}),
    ...(personalProtocolSignature ? { personalProtocolSignature } : {}),
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
    remortCount: character._count.remorts,
    raidReadiness: "waiting"
  };
}

function snapshotCharacterForRejoin(
  character: CharacterRow,
  existing: PartySessionRow["participants"][number]
): Prisma.InputJsonObject {
  const snapshot = copySnapshot(snapshotCharacter(character) as Prisma.JsonValue);
  const remortCount = character._count.remorts;
  if (existing.remortCount !== remortCount) {
    return snapshot;
  }

  const protocol = parsePersonalProtocol(existing.snapshotJson);
  if (
    protocol &&
    protocol.filerCharacterId === character.id &&
    protocol.remortCount === remortCount
  ) {
    snapshot[BUREAUCRAMANCER_PROTOCOL_SNAPSHOT_KEY] = {
      version: 1,
      ...protocol
    };
  }

  const signature = parsePersonalProtocolSignature(existing.snapshotJson);
  if (
    signature &&
    signature.signerCharacterId === character.id &&
    signature.remortCount === remortCount
  ) {
    snapshot[BUREAUCRAMANCER_PROTOCOL_SIGNATURE_SNAPSHOT_KEY] = {
      version: 1,
      ...signature
    };
  }

  return snapshot;
}

function snapshotWithReadiness(
  snapshotJson: Prisma.JsonValue | null,
  readiness: PartyParticipantReadiness
): Prisma.InputJsonObject {
  const snapshot = copySnapshot(snapshotJson);

  snapshot.raidReadiness = readiness;
  return snapshot;
}

function snapshotWithWardSign(
  snapshotJson: Prisma.JsonValue | null,
  wardSign: InternalWardSignSnapshot
): Prisma.InputJsonObject {
  const snapshot = copySnapshot(snapshotJson);
  snapshot[KHARAKTERNYK_WARD_SIGN_SNAPSHOT_KEY] = {
    version: 1,
    ...wardSign
  };
  delete snapshot[KHARAKTERNYK_WARD_SUPPORT_SNAPSHOT_KEY];
  return snapshot;
}

function snapshotWithWardSupport(
  snapshotJson: Prisma.JsonValue | null,
  wardSupport: InternalWardSupportSnapshot
): Prisma.InputJsonObject {
  const snapshot = copySnapshot(snapshotJson);
  snapshot[KHARAKTERNYK_WARD_SUPPORT_SNAPSHOT_KEY] = {
    version: 1,
    ...wardSupport
  };
  return snapshot;
}

function snapshotWithPersonalProtocol(
  snapshotJson: Prisma.JsonValue | null,
  protocol: InternalPersonalProtocolSnapshot,
  signature: InternalPersonalProtocolSignatureSnapshot
): Prisma.InputJsonObject {
  const snapshot = copySnapshot(snapshotJson);
  snapshot[BUREAUCRAMANCER_PROTOCOL_SNAPSHOT_KEY] = {
    version: 1,
    ...protocol
  };
  snapshot[BUREAUCRAMANCER_PROTOCOL_SIGNATURE_SNAPSHOT_KEY] = {
    version: 1,
    ...signature
  };
  return snapshot;
}

function snapshotWithPersonalProtocolSignature(
  snapshotJson: Prisma.JsonValue | null,
  signature: InternalPersonalProtocolSignatureSnapshot
): Prisma.InputJsonObject {
  const snapshot = copySnapshot(snapshotJson);
  snapshot[BUREAUCRAMANCER_PROTOCOL_SIGNATURE_SNAPSHOT_KEY] = {
    version: 1,
    ...signature
  };
  return snapshot;
}

function copySnapshot(snapshotJson: Prisma.JsonValue | null): Record<string, Prisma.InputJsonValue> {
  const snapshot: Record<string, Prisma.InputJsonValue> = {};

  if (snapshotJson && typeof snapshotJson === "object" && !Array.isArray(snapshotJson)) {
    for (const [key, value] of Object.entries(snapshotJson)) {
      snapshot[key] = value as Prisma.InputJsonValue;
    }
  }

  return snapshot;
}

function parseParticipantReadiness(snapshotJson: Prisma.JsonValue | null): PartyParticipantReadiness {
  if (snapshotJson && typeof snapshotJson === "object" && !Array.isArray(snapshotJson)) {
    const readiness = (snapshotJson as Record<string, unknown>).raidReadiness;
    return readiness === "ready" ? "ready" : "waiting";
  }

  return "waiting";
}

async function claimRecruitingSessionVersion(
  tx: TxClient,
  session: PartySessionRow,
  options: { requireBigBarrel?: boolean } = {}
): Promise<boolean> {
  const claimed = await tx.partySession.updateMany({
    where: {
      id: session.id,
      status: LIVE_STATUS,
      version: session.version,
      ...(options.requireBigBarrel
        ? { originLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID }
        : {})
    },
    data: {
      version: { increment: 1 }
    }
  });

  return claimed.count === 1;
}

async function reserveKharakternykWardSignSlot(
  tx: TxClient,
  session: PartySessionRow
): Promise<"reserved" | PartySessionRow | null> {
  let candidate: PartySessionRow | null = session;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reserved = await tx.partySession.updateMany({
      where: {
        id: candidate.id,
        status: LIVE_STATUS,
        originLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
        version: candidate.version
      },
      data: {
        version: { increment: 1 }
      }
    });
    if (reserved.count === 1) {
      return "reserved";
    }

    candidate = await findSessionById(tx, candidate.id);
    if (!candidate || candidate.status !== LIVE_STATUS || candidate.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
      return candidate;
    }

    if (getActiveWardSign(candidate)) {
      return candidate;
    }
  }

  return candidate;
}

function resolveKharakternykWardSignReservationLoss(
  session: PartySessionRow | null,
  placerCharacterId: string
): PartyWardSignPlaceRepositoryResult {
  if (!session) {
    return { state: "not-found" };
  }

  const terminalState = getTerminalReplayState(session);
  if (terminalState) {
    return { state: terminalState, session: mapSession(session) };
  }

  if (session.status !== LIVE_STATUS) {
    return { state: "not-recruiting", session: mapSession(session) };
  }

  if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
    return { state: "not-big-barrel", session: mapSession(session) };
  }

  const existingWard = getActiveWardSign(session);
  if (existingWard?.placerCharacterId === placerCharacterId) {
    return { state: "already-placed", session: mapSession(session) };
  }

  return {
    state: existingWard ? "already-exists" : "stale",
    session: mapSession(session)
  };
}

async function reserveKharakternykWardSupportSlot(
  tx: TxClient,
  session: PartySessionRow,
  participant: PartySessionRow["participants"][number],
  character: CharacterRow,
  wardSupport: InternalWardSupportSnapshot
): Promise<"reserved" | PartySessionRow | null> {
  let candidate: PartySessionRow | null = session;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidateParticipant = candidate.participants.find((row) =>
      row.id === participant.id &&
      row.characterId === character.id &&
      row.status === "joined" &&
      row.remortCount === character._count.remorts
    );
    if (!candidateParticipant) {
      return candidate;
    }

    const ward = getActiveWardSign(candidate);
    if (!ward || ward.placerCharacterId !== wardSupport.placerCharacterId) {
      return candidate;
    }

    const existingSupport = parseWardSupport(candidateParticipant.snapshotJson);
    if (existingSupport?.placerCharacterId === ward.placerCharacterId) {
      return candidate;
    }

    const parentClaimed = await claimRecruitingSessionVersion(tx, candidate, { requireBigBarrel: true });
    if (!parentClaimed) {
      candidate = await findSessionById(tx, candidate.id);
      if (!candidate || candidate.status !== LIVE_STATUS || candidate.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
        return candidate;
      }
      continue;
    }

    const reserved = await tx.partyParticipant.updateMany({
      where: {
        id: candidateParticipant.id,
        characterId: character.id,
        status: "joined",
        remortCount: character._count.remorts,
        updatedAt: candidateParticipant.updatedAt,
        sessionId: candidate.id
      },
      data: {
        snapshotJson: snapshotWithWardSupport(candidateParticipant.snapshotJson, wardSupport)
      }
    });
    if (reserved.count === 1) {
      return "reserved";
    }
    throw new PartyPreparationParticipantChangedError(
      candidate.id,
      character.id,
      character._count.remorts
    );
  }

  return candidate;
}

function resolveKharakternykWardSupportReservationLoss(
  session: PartySessionRow | null,
  supporterCharacterId: string,
  supporterRemortCount: number
): PartyWardSignSupportRepositoryResult {
  if (!session) {
    return { state: "not-found" };
  }

  const terminalState = getTerminalReplayState(session);
  if (terminalState) {
    return { state: terminalState, session: mapSession(session) };
  }

  if (session.status !== LIVE_STATUS) {
    return { state: "not-recruiting", session: mapSession(session) };
  }

  if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
    return { state: "not-big-barrel", session: mapSession(session) };
  }

  const participant = session.participants.find((row) =>
    row.characterId === supporterCharacterId &&
    row.status === "joined" &&
    row.remortCount === supporterRemortCount
  );
  if (!participant) {
    return { state: "not-member", session: mapSession(session) };
  }

  const ward = getActiveWardSign(session);
  if (!ward) {
    return { state: "no-sign", session: mapSession(session) };
  }

  if (ward.placerCharacterId === supporterCharacterId) {
    return { state: "self-support", session: mapSession(session) };
  }

  const existingSupport = parseWardSupport(participant.snapshotJson);
  if (existingSupport?.placerCharacterId === ward.placerCharacterId) {
    return { state: "already-supported", session: mapSession(session) };
  }

  return { state: "stale", session: mapSession(session) };
}

async function reservePersonalProtocolSlot(
  tx: TxClient,
  session: PartySessionRow
): Promise<"reserved" | PartySessionRow | null> {
  let candidate: PartySessionRow | null = session;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reserved = await tx.partySession.updateMany({
      where: {
        id: candidate.id,
        status: LIVE_STATUS,
        originLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
        version: candidate.version
      },
      data: {
        version: { increment: 1 }
      }
    });
    if (reserved.count === 1) {
      return "reserved";
    }

    candidate = await findSessionById(tx, candidate.id);
    if (!candidate || candidate.status !== LIVE_STATUS || candidate.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
      return candidate;
    }

    if (getActivePersonalProtocol(candidate)) {
      return candidate;
    }
  }

  return candidate;
}

function resolvePersonalProtocolFileReservationLoss(
  session: PartySessionRow | null,
  filerCharacterId: string,
  now: Date
): PartyPersonalProtocolFileRepositoryResult {
  if (!session) {
    return { state: "not-found" };
  }

  const terminalState = getTerminalReplayState(session);
  if (terminalState) {
    return { state: terminalState, session: mapSession(session) };
  }

  if (session.status !== LIVE_STATUS || session.expiresAt <= now) {
    return { state: session.expiresAt <= now ? "expired" : "not-recruiting", session: mapSession(session) };
  }

  if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
    return { state: "not-big-barrel", session: mapSession(session) };
  }

  const existingProtocol = getActivePersonalProtocol(session);
  if (existingProtocol?.filerCharacterId === filerCharacterId) {
    return { state: "already-filed", session: mapSession(session) };
  }

  return {
    state: existingProtocol ? "already-exists" : "stale",
    session: mapSession(session)
  };
}

async function reservePersonalProtocolSignatureSlot(
  tx: TxClient,
  session: PartySessionRow,
  participant: PartySessionRow["participants"][number],
  character: CharacterRow,
  protocol: InternalPersonalProtocolSnapshot,
  now: Date
): Promise<"reserved" | PartySessionRow | null> {
  let candidate: PartySessionRow | null = session;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidateParticipant = candidate.participants.find((row) =>
      row.id === participant.id &&
      row.characterId === character.id &&
      row.status === "joined" &&
      row.remortCount === character._count.remorts
    );
    if (!candidateParticipant) {
      return candidate;
    }

    const currentProtocol = getActivePersonalProtocol(candidate);
    if (!currentProtocol || !matchesPersonalProtocolIdentity(currentProtocol, protocol)) {
      return candidate;
    }

    const existingSignature = parsePersonalProtocolSignature(candidateParticipant.snapshotJson);
    if (matchesPersonalProtocolIdentity(existingSignature, currentProtocol)) {
      return candidate;
    }

    const parentClaimed = await claimRecruitingSessionVersion(tx, candidate, { requireBigBarrel: true });
    if (!parentClaimed) {
      candidate = await findSessionById(tx, candidate.id);
      if (!candidate || candidate.status !== LIVE_STATUS || candidate.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
        return candidate;
      }
      continue;
    }

    const reserved = await tx.partyParticipant.updateMany({
      where: {
        id: candidateParticipant.id,
        characterId: character.id,
        status: "joined",
        remortCount: character._count.remorts,
        updatedAt: candidateParticipant.updatedAt,
        sessionId: candidate.id
      },
      data: {
        snapshotJson: snapshotWithPersonalProtocolSignature(candidateParticipant.snapshotJson, {
          kind: BUREAUCRAMANCER_PROTOCOL_KIND,
          protocolId: currentProtocol.protocolId,
          filerCharacterId: currentProtocol.filerCharacterId,
          signerCharacterId: character.id,
          remortCount: character._count.remorts,
          signedAt: now.toISOString()
        })
      }
    });
    if (reserved.count === 1) {
      return "reserved";
    }
    throw new PartyPreparationParticipantChangedError(
      candidate.id,
      character.id,
      character._count.remorts
    );
  }

  return candidate;
}

function resolvePersonalProtocolSignReservationLoss(
  session: PartySessionRow | null,
  signerCharacterId: string,
  signerRemortCount: number
): PartyPersonalProtocolSignRepositoryResult {
  if (!session) {
    return { state: "not-found" };
  }

  const terminalState = getTerminalReplayState(session);
  if (terminalState) {
    return { state: terminalState, session: mapSession(session) };
  }

  if (session.status !== LIVE_STATUS) {
    return { state: "not-recruiting", session: mapSession(session) };
  }

  if (session.originLocationId !== BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
    return { state: "not-big-barrel", session: mapSession(session) };
  }

  const participant = session.participants.find((row) =>
    row.characterId === signerCharacterId &&
    row.status === "joined" &&
    row.remortCount === signerRemortCount
  );
  if (!participant) {
    return { state: "not-member", session: mapSession(session) };
  }

  const protocol = getActivePersonalProtocol(session);
  if (!protocol) {
    return { state: "no-protocol", session: mapSession(session) };
  }

  const existingSignature = parsePersonalProtocolSignature(participant.snapshotJson);
  return {
    state: resolvePersonalProtocolSignReservationState(existingSignature, protocol),
    session: mapSession(session)
  };
}

interface InternalWardSignSnapshot {
  kind: "kharakternyk";
  placerCharacterId: string;
  remortCount: number;
  manaCost: number;
  placedAt: string;
}

interface InternalWardSupportSnapshot {
  kind: "kharakternyk";
  placerCharacterId: string;
  supporterCharacterId: string;
  remortCount: number;
  manaCost: number;
  supportedAt: string;
}

interface InternalPersonalProtocolSnapshot {
  kind: typeof BUREAUCRAMANCER_PROTOCOL_KIND;
  version?: 1;
  protocolId: string;
  filerCharacterId: string;
  remortCount: number;
  manaCost: number;
  filedAt: string;
}

interface InternalPersonalProtocolSignatureSnapshot {
  kind: typeof BUREAUCRAMANCER_PROTOCOL_KIND;
  version?: 1;
  protocolId: string;
  filerCharacterId: string;
  signerCharacterId: string;
  remortCount: number;
  signedAt: string;
}

function getActiveWardSign(row: PartySessionRow): InternalWardSignSnapshot | null {
  const joined = row.participants.filter((participant) => participant.status === "joined");
  for (const participant of joined) {
    const wardSign = parseWardSign(participant.snapshotJson);
    if (
      wardSign &&
      wardSign.placerCharacterId === participant.characterId &&
      wardSign.remortCount === participant.remortCount
    ) {
      return wardSign;
    }
  }

  return null;
}

function countActiveWardSupports(row: PartySessionRow, placerCharacterId: string): number {
  const count = row.participants.filter((participant) => {
    if (participant.status !== "joined" || participant.characterId === placerCharacterId) {
      return false;
    }

    const support = parseInternalWardSupport(participant.snapshotJson);
    return (
      support?.placerCharacterId === placerCharacterId &&
      support.supporterCharacterId === participant.characterId &&
      support.remortCount === participant.remortCount
    );
  }).length;

  return Math.min(KHARAKTERNYK_WARD_SUPPORT_CAP, count);
}

function parseWardSign(snapshotJson: Prisma.JsonValue | null): InternalWardSignSnapshot | null {
  const value = getSnapshotObject(snapshotJson, KHARAKTERNYK_WARD_SIGN_SNAPSHOT_KEY);
  if (!value) {
    return null;
  }

  if (
    value.kind !== "kharakternyk" ||
    typeof value.placerCharacterId !== "string" ||
    typeof value.remortCount !== "number" ||
    typeof value.manaCost !== "number" ||
    typeof value.placedAt !== "string" ||
    Number.isNaN(new Date(value.placedAt).getTime())
  ) {
    return null;
  }

  return {
    kind: "kharakternyk",
    placerCharacterId: value.placerCharacterId,
    remortCount: Math.max(0, Math.floor(value.remortCount)),
    manaCost: Math.max(0, Math.floor(value.manaCost)),
    placedAt: value.placedAt
  };
}

function parseWardSupport(snapshotJson: Prisma.JsonValue | null): PartyWardSignSupportRecord | null {
  const support = parseInternalWardSupport(snapshotJson);
  if (!support) {
    return null;
  }

  return {
    kind: "kharakternyk",
    placerCharacterId: support.placerCharacterId,
    supporterCharacterId: support.supporterCharacterId,
    manaCost: support.manaCost,
    supportedAt: new Date(support.supportedAt)
  };
}

function parseInternalWardSupport(snapshotJson: Prisma.JsonValue | null): InternalWardSupportSnapshot | null {
  const value = getSnapshotObject(snapshotJson, KHARAKTERNYK_WARD_SUPPORT_SNAPSHOT_KEY);
  if (!value) {
    return null;
  }

  if (
    value.kind !== "kharakternyk" ||
    typeof value.placerCharacterId !== "string" ||
    typeof value.supporterCharacterId !== "string" ||
    typeof value.remortCount !== "number" ||
    typeof value.manaCost !== "number" ||
    typeof value.supportedAt !== "string" ||
    Number.isNaN(new Date(value.supportedAt).getTime())
  ) {
    return null;
  }

  return {
    kind: "kharakternyk",
    placerCharacterId: value.placerCharacterId,
    supporterCharacterId: value.supporterCharacterId,
    remortCount: Math.max(0, Math.floor(value.remortCount)),
    manaCost: Math.max(0, Math.floor(value.manaCost)),
    supportedAt: value.supportedAt
  };
}

function getActivePersonalProtocol(row: PartySessionRow): InternalPersonalProtocolSnapshot | null {
  for (const participant of row.participants) {
    const protocol = parsePersonalProtocol(participant.snapshotJson);
    if (
      protocol &&
      protocol.filerCharacterId === participant.characterId &&
      protocol.remortCount === participant.remortCount &&
      participant.character._count.remorts === participant.remortCount
    ) {
      return protocol;
    }
  }

  return null;
}

function countActivePersonalProtocolSignatures(
  row: PartySessionRow,
  protocol: InternalPersonalProtocolSnapshot
): number {
  return row.participants.filter((participant) => {
    if (
      participant.status !== "joined" ||
      participant.character._count.remorts !== participant.remortCount
    ) {
      return false;
    }

    const signature = parsePersonalProtocolSignature(participant.snapshotJson);
    if (!signature) {
      return false;
    }
    return (
      matchesPersonalProtocolIdentity(signature, protocol) &&
      signature.signerCharacterId === participant.characterId &&
      signature.remortCount === participant.remortCount
    );
  }).length;
}

function parsePersonalProtocol(snapshotJson: Prisma.JsonValue | null): InternalPersonalProtocolSnapshot | null {
  const value = getSnapshotObject(snapshotJson, BUREAUCRAMANCER_PROTOCOL_SNAPSHOT_KEY);
  if (!value) {
    return null;
  }

  if (
    value.kind !== BUREAUCRAMANCER_PROTOCOL_KIND ||
    value.version !== 1 ||
    typeof value.protocolId !== "string" ||
    typeof value.filerCharacterId !== "string" ||
    typeof value.remortCount !== "number" ||
    typeof value.manaCost !== "number" ||
    typeof value.filedAt !== "string" ||
    Number.isNaN(new Date(value.filedAt).getTime())
  ) {
    return null;
  }

  return {
    kind: BUREAUCRAMANCER_PROTOCOL_KIND,
    version: 1,
    protocolId: value.protocolId,
    filerCharacterId: value.filerCharacterId,
    remortCount: Math.max(0, Math.floor(value.remortCount)),
    manaCost: Math.max(0, Math.floor(value.manaCost)),
    filedAt: value.filedAt
  };
}

function parsePersonalProtocolSignatureRecord(snapshotJson: Prisma.JsonValue | null): PartyPersonalProtocolSignatureRecord | null {
  const signature = parsePersonalProtocolSignature(snapshotJson);
  if (!signature) {
    return null;
  }

  return {
    kind: BUREAUCRAMANCER_PROTOCOL_KIND,
    protocolId: signature.protocolId,
    filerCharacterId: signature.filerCharacterId,
    signerCharacterId: signature.signerCharacterId,
    signedAt: new Date(signature.signedAt)
  };
}

function parsePersonalProtocolSignature(
  snapshotJson: Prisma.JsonValue | null
): InternalPersonalProtocolSignatureSnapshot | null {
  const value = getSnapshotObject(snapshotJson, BUREAUCRAMANCER_PROTOCOL_SIGNATURE_SNAPSHOT_KEY);
  if (!value) {
    return null;
  }

  if (
    value.kind !== BUREAUCRAMANCER_PROTOCOL_KIND ||
    value.version !== 1 ||
    typeof value.protocolId !== "string" ||
    typeof value.filerCharacterId !== "string" ||
    typeof value.signerCharacterId !== "string" ||
    typeof value.remortCount !== "number" ||
    typeof value.signedAt !== "string" ||
    Number.isNaN(new Date(value.signedAt).getTime())
  ) {
    return null;
  }

  return {
    kind: BUREAUCRAMANCER_PROTOCOL_KIND,
    version: 1,
    protocolId: value.protocolId,
    filerCharacterId: value.filerCharacterId,
    signerCharacterId: value.signerCharacterId,
    remortCount: Math.max(0, Math.floor(value.remortCount)),
    signedAt: value.signedAt
  };
}

function getSnapshotObject(snapshotJson: Prisma.JsonValue | null, key: string): Record<string, unknown> | null {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) {
    return null;
  }

  const value = (snapshotJson as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function calculateWardSupportManaCost(character: CharacterRow): number {
  return KHARAKTERNYK_WARD_SUPPORT_BASE_MANA_COST - calculateWardManaDiscount(character, 0, 3);
}

function calculateWardPlacementManaCost(character: CharacterRow): number {
  return KHARAKTERNYK_WARD_PLACEMENT_BASE_MANA_COST - calculateWardManaDiscount(character, 2, 5);
}

function calculateWardManaDiscount(character: CharacterRow, min: number, max: number): number {
  const stats = buildPartyBossCombatStats({
    ...mapCharacter(character),
    equipment: character.equipment
  });
  const craftSense = Math.max(0, Math.floor(stats.intelligence)) + Math.max(0, Math.floor(stats.luck));
  const discount = Math.floor(craftSense / 8);

  return Math.min(max, Math.max(min, discount));
}

function getTerminalReplayState(
  row: PartySessionRow
): "cancelled" | "expired" | "terminal-ineligible" | null {
  const status = parseStatus(row.status);
  return status === "ineligible"
    ? "terminal-ineligible"
    : status === "cancelled" || status === "expired"
      ? status
      : null;
}

function parseStatus(value: string): PartySessionStatus {
  return value === "cancelled" || value === "expired" || value === "ineligible" || value === "active" || value === "completed"
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

function matchesPersonalProtocolIdentity(
  candidate: PersonalProtocolIdentity | null | undefined,
  protocol: PersonalProtocolIdentity
): boolean {
  return (
    candidate?.protocolId === protocol.protocolId &&
    candidate.filerCharacterId === protocol.filerCharacterId
  );
}

function getPersonalProtocolResources(
  character: PersonalProtocolCharacterRow,
  actionPayloads: readonly (Prisma.JsonValue | null)[],
  now: Date
) {
  const equippedItems = character.equipment.flatMap((row) => {
    if (isEquipmentAttunementPendingForRow({ row, actionPayloads, now })) {
      return [];
    }

    const item = items.find((candidate) => candidate.id === row.itemId);
    return item ? [item] : [];
  });
  const summary = summarizeCharacter(mapCharacter(character), {
    equippedItems,
    remortCount: character._count.remorts
  });
  const regeneration = applyPassiveResourceRegeneration({
    resources: {
      hpCurrent: summary.hpCurrent,
      hpMax: summary.hpMax,
      manaCurrent: summary.manaCurrent,
      manaMax: summary.manaMax,
      hpRegenAt: character.hpRegenAt,
      manaRegenAt: character.manaRegenAt
    },
    profile: {
      raceId: summary.raceId,
      classId: summary.classId,
      title: summary.title,
      stats: summary.stats
    },
    now,
    multiplierWindows: buildShynokRecoveryWindows(mapPartyDrinkState(character.drinkState))
  });

  return { summary, regeneration };
}

async function findCurrentEquipmentAttunementPayloads(
  tx: TxClient,
  character: Pick<PersonalProtocolCharacterRow, "id" | "equipment">
): Promise<Array<Prisma.JsonValue | null>> {
  const localDates = character.equipment.map((row) => `${row.slot}:${row.id}:${row.updatedAt.getTime()}`);
  if (localDates.length === 0) {
    return [];
  }

  const actions = await tx.dailyAction.findMany({
    where: {
      characterId: character.id,
      key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
      localDate: { in: localDates }
    },
    select: { resultJson: true }
  });
  return actions.map((row) => row.resultJson);
}

function mapPartyDrinkState(
  record: PersonalProtocolCharacterRow["drinkState"]
): Parameters<typeof buildShynokRecoveryWindows>[0] {
  if (!record || !isShynokDrinkKey(record.drinkKey)) {
    return null;
  }

  const phase = record.phase === "timed" || record.phase === "queued"
    ? record.phase
    : null;
  if (!phase) {
    return null;
  }

  return {
    drinkKey: record.drinkKey,
    phase,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    metadata: record.metadataJson
  };
}

function buildPersonalProtocolId(sessionId: string): string {
  return `bureaucramancer-personal-protocol-13b:${sessionId}:${randomUUID()}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + Math.max(0, Math.floor(minutes)) * 60_000);
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

class PartyCapacityRaceError extends Error {
  constructor() {
    super("Party capacity changed during join.");
  }
}
