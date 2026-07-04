import { Prisma, type PrismaClient } from "@prisma/client";
import {
  DICE_POKER_RULES_VERSION,
  isDicePokerState,
  type DicePokerMode,
  type DicePokerState
} from "../../domain/dicePoker";
import {
  isTavernGameKey,
  KOSTI_MIN_PLAYERS,
  KOSTI_PLAYER_CAP,
  parseTavernGameDecision,
  resolveTavernGame,
  TAVERN_GAME_RULES_VERSION,
  TAVLEI_PLAYER_CAP,
  type TavernGameDecision,
  type TavernGameKey,
  type TavernGamePlayer,
  type TavernGameResolution
} from "../../domain/tavernGames";
import { getIncludedRemortCount } from "./prismaRemortCount";
import type {
  TavernGameCancelResult,
  TavernGameCharacterSnapshot,
  TavernGameCreateResult,
  DicePokerActionResult,
  TavernGameDecisionResult,
  TavernGameGateReason,
  TavernGameJoinResult,
  TavernGameParticipantRecord,
  TavernGameParticipantStatus,
  TavernGameRepository,
  TavernGameResolveResult,
  TavernGameSessionRecord,
  TavernGameSessionStatus
} from "./tavernGameRepository";

type TxClient = Prisma.TransactionClient;
type TavernGameSessionRow = Prisma.TavernGameSessionGetPayload<{ include: typeof tavernGameSessionInclude }>;
type CharacterRow = Prisma.CharacterGetPayload<{ include: typeof tavernGameCharacterInclude }>;
type ResolveSessionTxResult =
  | { state: "resolved"; session: TavernGameSessionRow; resolution: TavernGameResolution }
  | { state: "failed-refund"; session: TavernGameSessionRow };

const PRESENCE_LOCATION_KORCHMA_BAR = "location.korchma.bar";
const JOINED_STATUSES = ["joined", "decided"] as const;
const TERMINAL_STATUSES = ["completed", "cancelled_refund", "expired_refund", "failed_safe_refund"] as const;

const tavernGameCharacterInclude = {
  user: {
    select: {
      telegramUserId: true,
      lastSeenLocationId: true,
      currentRaidId: true
    }
  },
  activeCombatLease: {
    select: {
      kind: true,
      referenceId: true
    }
  },
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

const tavernGameSessionInclude = {
  creator: {
    include: tavernGameCharacterInclude
  },
  participants: {
    include: {
      character: {
        include: tavernGameCharacterInclude
      }
    },
    orderBy: [
      { joinedAt: "asc" as const },
      { id: "asc" as const }
    ]
  }
} satisfies Prisma.TavernGameSessionInclude;

export class PrismaTavernGameRepository implements TavernGameRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listOpen(now: Date, limit = 13): Promise<TavernGameSessionRecord[]> {
    await this.expireDue(now);
    const rows = await this.prisma.tavernGameSession.findMany({
      where: {
        status: "open",
        joinExpiresAt: {
          gt: now
        }
      },
      include: tavernGameSessionInclude,
      orderBy: [
        { joinExpiresAt: "asc" },
        { openedAt: "asc" }
      ],
      take: limit
    });

    return rows.map(mapSession);
  }

  async listCompletedSince(since: Date, limit = 587): Promise<TavernGameSessionRecord[]> {
    const rows = await this.prisma.tavernGameSession.findMany({
      where: {
        status: "completed",
        completedAt: {
          gte: since
        }
      },
      include: tavernGameSessionInclude,
      orderBy: [
        { completedAt: "desc" },
        { id: "asc" }
      ],
      take: limit
    });

    return rows.map(mapSession);
  }

  async peekByToken(token: string): Promise<TavernGameSessionRecord | null> {
    const row = await findSessionByToken(this.prisma, token);
    return row ? mapSession(row) : null;
  }

  async getByToken(token: string, now: Date): Promise<TavernGameSessionRecord | null> {
    await this.expireTokenIfNeeded(token, now);
    const row = await findSessionByToken(this.prisma, token);
    return row ? mapSession(row) : null;
  }

  async createForTelegramUser(
    telegramUserId: bigint,
    input: {
      gameKey: TavernGameKey;
      token: string;
      seed: string;
      stakeGold: number;
      maxStake: number;
      joinExpiresAt: Date;
      decisionExpiresAt: Date;
      cooldownMs: number;
      now: Date;
    }
  ): Promise<TavernGameCreateResult> {
    if (input.stakeGold < 1 || input.stakeGold > input.maxStake) {
      return { state: "invalid-stake", maxStake: input.maxStake };
    }

    return this.prisma.$transaction(async (tx): Promise<TavernGameCreateResult> => {
      await expireDueTx(tx, input.now);
      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const blocked = getGateReason(character);
      if (blocked) {
        return { state: "blocked", reason: blocked };
      }

      const live = await findLiveMembershipSession(tx, character.id);
      if (live) {
        return { state: "active-session", session: mapSession(live) };
      }

      const cooldownAfter = new Date(input.now.getTime() - input.cooldownMs);
      const recent = await tx.tavernGameSession.findFirst({
        where: {
          creatorCharacterId: character.id,
          openedAt: { gt: cooldownAfter }
        },
        orderBy: { openedAt: "desc" },
        select: { openedAt: true }
      });
      if (recent) {
        return {
          state: "cooldown",
          availableAt: new Date(recent.openedAt.getTime() + input.cooldownMs)
        };
      }

      const spent = await tx.character.updateMany({
        where: {
          id: character.id,
          gold: { gte: input.stakeGold }
        },
        data: {
          gold: { decrement: input.stakeGold }
        }
      });
      if (spent.count !== 1) {
        return {
          state: "insufficient-gold",
          character: mapCharacter(character),
          stakeGold: input.stakeGold
        };
      }

      const session = await tx.tavernGameSession.create({
        data: {
          token: input.token,
          gameKey: input.gameKey,
          status: "open",
          creatorCharacterId: character.id,
          stakeGold: input.stakeGold,
          potGold: input.stakeGold,
          seed: input.seed,
          rulesVersion: TAVERN_GAME_RULES_VERSION,
          openedAt: input.now,
          joinExpiresAt: input.joinExpiresAt,
          decisionExpiresAt: input.decisionExpiresAt,
          participants: {
            create: {
              characterId: character.id,
              telegramUserId,
              displayName: character.name,
              remortCount: getIncludedRemortCount(character),
              status: "joined",
              stakeGold: input.stakeGold,
              activeStakeKey: activeStakeKey(character.id),
              joinedAt: input.now
            }
          }
        },
        include: tavernGameSessionInclude
      });

      return { state: "created", session: mapSession(session) };
    }).catch(async (error: unknown): Promise<TavernGameCreateResult> => {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const character = await findCharacterByTelegramUser(this.prisma, telegramUserId);
      const live = character ? await findLiveMembershipSession(this.prisma, character.id) : null;
      return live ? { state: "active-session", session: mapSession(live) } : { state: "no-character" };
    });
  }

  async createDicePokerForTelegramUser(
    telegramUserId: bigint,
    input: {
      mode: DicePokerMode;
      token: string;
      seed: string;
      stakeGold: number;
      maxStake: number;
      expiresAt: Date;
      cooldownMs: number;
      now: Date;
      state: DicePokerState;
    }
  ): Promise<TavernGameCreateResult> {
    if (input.stakeGold < 1 || input.stakeGold > input.maxStake) {
      return { state: "invalid-stake", maxStake: input.maxStake };
    }

    return this.prisma.$transaction(async (tx): Promise<TavernGameCreateResult> => {
      await expireDueTx(tx, input.now);
      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const blocked = getGateReason(character);
      if (blocked) {
        return { state: "blocked", reason: blocked };
      }

      const live = await findLiveMembershipSession(tx, character.id);
      if (live) {
        return { state: "active-session", session: mapSession(live) };
      }

      const cooldownAfter = new Date(input.now.getTime() - input.cooldownMs);
      const recent = await tx.tavernGameSession.findFirst({
        where: {
          creatorCharacterId: character.id,
          openedAt: { gt: cooldownAfter }
        },
        orderBy: { openedAt: "desc" },
        select: { openedAt: true }
      });
      if (recent) {
        return {
          state: "cooldown",
          availableAt: new Date(recent.openedAt.getTime() + input.cooldownMs)
        };
      }

      const spent = await tx.character.updateMany({
        where: {
          id: character.id,
          gold: { gte: input.stakeGold }
        },
        data: {
          gold: { decrement: input.stakeGold }
        }
      });
      if (spent.count !== 1) {
        return {
          state: "insufficient-gold",
          character: mapCharacter(character),
          stakeGold: input.stakeGold
        };
      }

      const session = await tx.tavernGameSession.create({
        data: {
          token: input.token,
          gameKey: "kosti",
          status: "ready",
          creatorCharacterId: character.id,
          stakeGold: input.stakeGold,
          potGold: input.stakeGold,
          seed: input.seed,
          rulesVersion: DICE_POKER_RULES_VERSION,
          resultJson: input.state as unknown as Prisma.InputJsonValue,
          openedAt: input.now,
          joinExpiresAt: input.expiresAt,
          decisionExpiresAt: input.expiresAt,
          participants: {
            create: {
              characterId: character.id,
              telegramUserId,
              displayName: character.name,
              remortCount: getIncludedRemortCount(character),
              status: "joined",
              stakeGold: input.stakeGold,
              activeStakeKey: activeStakeKey(character.id),
              joinedAt: input.now
            }
          }
        },
        include: tavernGameSessionInclude
      });

      return { state: "created", session: mapSession(session) };
    }).catch(async (error: unknown): Promise<TavernGameCreateResult> => {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const character = await findCharacterByTelegramUser(this.prisma, telegramUserId);
      const live = character ? await findLiveMembershipSession(this.prisma, character.id) : null;
      return live ? { state: "active-session", session: mapSession(live) } : { state: "no-character" };
    });
  }

  async joinByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: { now: Date; decisionExpiresAt: Date }
  ): Promise<TavernGameJoinResult> {
    return this.prisma.$transaction(async (tx): Promise<TavernGameJoinResult> => {
      await expireTokenIfNeededTx(tx, token, input.now);
      const session = await findSessionByToken(tx, token);
      if (!session) {
        return { state: "not-found" };
      }
      if (isTerminal(session.status) || session.status !== "open") {
        return { state: "closed", session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }
      const blocked = getGateReason(character);
      if (blocked) {
        return { state: "blocked", reason: blocked };
      }
      if (session.gameKey === "tavlei" && session.creatorCharacterId === character.id) {
        return { state: "self-join", session: mapSession(session) };
      }

      const existing = session.participants.find((row) => row.characterId === character.id);
      if (existing?.status === "joined" || existing?.status === "decided") {
        return { state: "already-joined", session: mapSession(session) };
      }

      const live = await findLiveMembershipSession(tx, character.id);
      if (live && live.id !== session.id) {
        return { state: "active-session", session: mapSession(live) };
      }

      const joinedCount = countLiveParticipants(session);
      const cap = getParticipantCap(session.gameKey);
      if (joinedCount >= cap) {
        return { state: "full", session: mapSession(session) };
      }

      const spent = await tx.character.updateMany({
        where: {
          id: character.id,
          gold: { gte: session.stakeGold }
        },
        data: {
          gold: { decrement: session.stakeGold }
        }
      });
      if (spent.count !== 1) {
        return {
          state: "insufficient-gold",
          character: mapCharacter(character),
          session: mapSession(session)
        };
      }

      await tx.tavernGameParticipant.create({
        data: {
          sessionId: session.id,
          characterId: character.id,
          telegramUserId,
          displayName: character.name,
          remortCount: getIncludedRemortCount(character),
          status: "joined",
          stakeGold: session.stakeGold,
          activeStakeKey: activeStakeKey(character.id),
          joinedAt: input.now
        }
      });
      const nextCount = joinedCount + 1;
      await tx.tavernGameSession.update({
        where: { id: session.id },
        data: {
          potGold: { increment: session.stakeGold },
          ...(session.gameKey === "tavlei" && nextCount === 2
            ? { status: "ready", decisionExpiresAt: input.decisionExpiresAt }
            : session.gameKey === "kosti" && nextCount === getParticipantCap(session.gameKey)
              ? { status: "ready", decisionExpiresAt: input.decisionExpiresAt }
            : {})
        }
      });

      const updated = await findSessionByToken(tx, token);
      return updated ? { state: "joined", session: mapSession(updated) } : { state: "not-found" };
    }).catch(async (error: unknown): Promise<TavernGameJoinResult> => {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const session = await this.getByToken(token, input.now);
      return session ? { state: "full", session } : { state: "not-found" };
    });
  }

  async submitDecisionForTelegramUser(
    telegramUserId: bigint,
    token: string,
    decision: TavernGameDecision,
    now: Date
  ): Promise<TavernGameDecisionResult> {
    return this.prisma.$transaction(async (tx): Promise<TavernGameDecisionResult> => {
      await expireTokenIfNeededTx(tx, token, now);
      const session = await findSessionByToken(tx, token);
      if (!session) {
        return { state: "not-found" };
      }
      if (isTerminal(session.status)) {
        return {
          state: "replayed",
          session: mapSession(session)
        };
      }
      const acceptingDecision =
        session.gameKey === "tavlei"
          ? session.status === "ready"
          : session.status === "open" || session.status === "ready";
      if (session.gameKey !== decision.gameKey || !acceptingDecision) {
        return { state: "closed", session: mapSession(session) };
      }

      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }
      const blocked = getGateReason(character);
      if (blocked) {
        return { state: "blocked", reason: blocked };
      }
      const participant = session.participants.find((row) => row.characterId === character.id);
      if (!participant || !isJoinedStatus(participant.status)) {
        return { state: "not-participant", session: mapSession(session) };
      }
      if (participant.decisionJson) {
        return { state: "replayed", session: mapSession(session) };
      }

      await tx.tavernGameParticipant.update({
        where: { id: participant.id },
        data: {
          status: "decided",
          decisionJson: decision,
          decidedAt: now
        }
      });

      const updated = await findSessionByToken(tx, token);
      if (!updated) {
        return { state: "not-found" };
      }
      if (shouldResolveAfterDecision(updated)) {
        const resolved = await resolveSessionTx(tx, updated, now);
        if (resolved.state === "failed-refund") {
          return {
            state: "failed-refund",
            session: mapSession(resolved.session)
          };
        }
        return {
          state: "resolved",
          session: mapSession(resolved.session),
          resolution: resolved.resolution
        };
      }

      return { state: "decided", session: mapSession(updated) };
    });
  }

  async resolveKostiForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<TavernGameResolveResult> {
    return this.prisma.$transaction(async (tx): Promise<TavernGameResolveResult> => {
      await expireTokenIfNeededTx(tx, token, now);
      const session = await findSessionByToken(tx, token);
      if (!session) {
        return { state: "not-found" };
      }
      if (isTerminal(session.status)) {
        return {
          state: "replayed",
          session: mapSession(session),
          resolution: parseResolution(session.resultJson)
        };
      }
      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }
      if (session.creatorCharacterId !== character.id) {
        return { state: "not-creator", session: mapSession(session) };
      }
      if (
        session.gameKey !== "kosti" ||
        countLiveParticipants(session) < 2 ||
        (session.status !== "open" && session.status !== "ready")
      ) {
        return { state: "not-ready", session: mapSession(session) };
      }

      const ready = await tx.tavernGameSession.update({
        where: { id: session.id },
        data: {
          status: "ready",
          decisionExpiresAt: now
        },
        include: tavernGameSessionInclude
      });
      const resolved = await resolveSessionTx(tx, ready, now);
      if (resolved.state === "failed-refund") {
        return {
          state: "failed-refund",
          session: mapSession(resolved.session)
        };
      }
      return {
        state: "resolved",
        session: mapSession(resolved.session),
        resolution: resolved.resolution
      };
    });
  }

  async saveDicePokerStateForTelegramUser(
    telegramUserId: bigint,
    token: string,
    state: DicePokerState,
    now: Date
  ): Promise<DicePokerActionResult> {
    return this.prisma.$transaction(async (tx): Promise<DicePokerActionResult> => {
      await expireTokenIfNeededTx(tx, token, now);
      const session = await findSessionByToken(tx, token);
      if (!session) {
        return { state: "not-found" };
      }
      const gate = await validateDicePokerActionTx(tx, session, telegramUserId);
      if (gate) {
        return gate;
      }

      const updated = await tx.tavernGameSession.update({
        where: { id: session.id },
        data: {
          resultJson: state as unknown as Prisma.InputJsonValue,
          decisionExpiresAt: session.decisionExpiresAt && session.decisionExpiresAt < now
            ? now
            : session.decisionExpiresAt
        },
        include: tavernGameSessionInclude
      });

      return { state: "saved", session: mapSession(updated), dicePoker: state };
    });
  }

  async completeDicePokerForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: {
      state: DicePokerState;
      outcome: "win" | "loss" | "draw";
      payoutGold: number;
      refundedGold: number;
      now: Date;
    }
  ): Promise<DicePokerActionResult> {
    return this.prisma.$transaction(async (tx): Promise<DicePokerActionResult> => {
      await expireTokenIfNeededTx(tx, token, input.now);
      const session = await findSessionByToken(tx, token);
      if (!session) {
        return { state: "not-found" };
      }
      const gate = await validateDicePokerActionTx(tx, session, telegramUserId);
      if (gate) {
        return gate;
      }

      const participant = session.participants.find((row) => isJoinedStatus(row.status));
      if (!participant) {
        return { state: "closed", session: mapSession(session) };
      }

      const claimed = await tx.tavernGameSession.updateMany({
        where: {
          id: session.id,
          status: "ready",
          rulesVersion: DICE_POKER_RULES_VERSION
        },
        data: {
          status: "resolving"
        }
      });
      if (claimed.count !== 1) {
        const replay = await findSessionById(tx, session.id);
        return replay ? { state: "closed", session: mapSession(replay) } : { state: "not-found" };
      }

      const payoutGold = Math.max(0, Math.trunc(input.payoutGold));
      const refundedGold = Math.max(0, Math.trunc(input.refundedGold));
      const returnedGold = payoutGold + refundedGold;
      if (returnedGold > 0) {
        await tx.character.update({
          where: { id: participant.characterId },
          data: { gold: { increment: returnedGold } }
        });
      }

      await tx.tavernGameParticipant.update({
        where: { id: participant.id },
        data: {
          status: "completed",
          payoutGold,
          refundedGold,
          resultJson: {
            kind: "dice_poker",
            outcome: input.outcome,
            state: input.state
          } as unknown as Prisma.InputJsonValue,
          activeStakeKey: null,
          completedAt: input.now
        }
      });

      const completed = await tx.tavernGameSession.update({
        where: { id: session.id },
        data: {
          status: "completed",
          resultJson: {
            kind: "dice_poker",
            outcome: input.outcome,
            state: input.state,
            payoutGold,
            refundedGold
          } as unknown as Prisma.InputJsonValue,
          completedAt: input.now
        },
        include: tavernGameSessionInclude
      });

      return { state: "completed", session: mapSession(completed), dicePoker: input.state };
    });
  }

  async cancelDicePokerForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<DicePokerActionResult> {
    return this.prisma.$transaction(async (tx): Promise<DicePokerActionResult> => {
      await expireTokenIfNeededTx(tx, token, now);
      const session = await findSessionByToken(tx, token);
      if (!session) {
        return { state: "not-found" };
      }
      const gate = await validateDicePokerActionTx(tx, session, telegramUserId);
      if (gate) {
        return gate;
      }

      const refunded = await refundSessionTx(tx, session, "cancelled_refund", now, {
        kind: "dice_poker_cancelled"
      });
      return { state: "cancelled", session: mapSession(refunded) };
    });
  }

  async cancelForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<TavernGameCancelResult> {
    return this.prisma.$transaction(async (tx): Promise<TavernGameCancelResult> => {
      await expireTokenIfNeededTx(tx, token, now);
      const session = await findSessionByToken(tx, token);
      if (!session) {
        return { state: "not-found" };
      }
      const character = await findCharacterByTelegramUser(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }
      if (session.creatorCharacterId !== character.id) {
        return { state: "not-creator", session: mapSession(session) };
      }
      if (session.status !== "open" || countLiveParticipants(session) !== 1) {
        return { state: "not-cancellable", session: mapSession(session) };
      }

      const refunded = await refundSessionTx(tx, session, "cancelled_refund", now);
      return { state: "cancelled", session: mapSession(refunded) };
    });
  }

  async refundDisabledByToken(token: string, now: Date): Promise<TavernGameSessionRecord | null> {
    return this.prisma.$transaction(async (tx): Promise<TavernGameSessionRecord | null> => {
      const session = await findSessionByToken(tx, token);
      if (!session) {
        return null;
      }
      if (isTerminal(session.status)) {
        return mapSession(session);
      }

      const refunded = await refundSessionTx(tx, session, "cancelled_refund", now, {
        kind: "disabled_refund"
      });
      return mapSession(refunded);
    });
  }

  async expireDue(now: Date, limit = 23): Promise<number> {
    return this.prisma.$transaction((tx) => expireDueTx(tx, now, limit));
  }

  private async expireTokenIfNeeded(token: string, now: Date): Promise<void> {
    await this.prisma.$transaction((tx) => expireTokenIfNeededTx(tx, token, now));
  }
}

async function expireDueTx(tx: TxClient, now: Date, limit = 23): Promise<number> {
  const rows = await tx.tavernGameSession.findMany({
    where: {
      OR: [
        { status: "open", joinExpiresAt: { lte: now } },
        { status: "ready", decisionExpiresAt: { lte: now } }
      ]
    },
    include: tavernGameSessionInclude,
    orderBy: [
      { joinExpiresAt: "asc" },
      { createdAt: "asc" }
    ],
    take: limit
  });

  for (const row of rows) {
    if (isDicePokerRow(row)) {
      await refundSessionTx(tx, row, "expired_refund", now, {
        kind: "dice_poker_expired"
      });
    } else if (row.status === "open" && countLiveParticipants(row) < getMinimumParticipants(row.gameKey)) {
      await refundSessionTx(tx, row, "expired_refund", now);
    } else {
      await resolveSessionTx(tx, row, now);
    }
  }

  return rows.length;
}

async function expireTokenIfNeededTx(tx: TxClient, token: string, now: Date): Promise<void> {
  const row = await findSessionByToken(tx, token);
  if (!row || isTerminal(row.status)) {
    return;
  }
  if (isDicePokerRow(row) && row.decisionExpiresAt && row.decisionExpiresAt <= now) {
    await refundSessionTx(tx, row, "expired_refund", now, {
      kind: "dice_poker_expired"
    });
    return;
  }
  if (row.status === "open" && row.joinExpiresAt <= now && countLiveParticipants(row) < getMinimumParticipants(row.gameKey)) {
    await refundSessionTx(tx, row, "expired_refund", now);
    return;
  }
  if (row.status === "open" && row.joinExpiresAt <= now && countLiveParticipants(row) >= getMinimumParticipants(row.gameKey)) {
    await resolveSessionTx(tx, row, now);
    return;
  }
  if (row.status === "ready" && row.decisionExpiresAt && row.decisionExpiresAt <= now) {
    await resolveSessionTx(tx, row, now);
  }
}

async function resolveSessionTx(
  tx: TxClient,
  row: TavernGameSessionRow,
  now: Date
): Promise<ResolveSessionTxResult> {
  const claimed = await tx.tavernGameSession.updateMany({
    where: {
      id: row.id,
      status: {
        in: ["open", "ready"]
      }
    },
    data: {
      status: "resolving"
    }
  });

  if (claimed.count !== 1) {
    const replay = await findSessionById(tx, row.id);
    const resolution = replay ? parseResolution(replay.resultJson) : null;
    if (replay && resolution) {
      return { state: "resolved", session: replay, resolution };
    }
    throw new Error("Tavern game resolution race lost without replay.");
  }

  const liveParticipants = row.participants.filter((participant) => isJoinedStatus(participant.status));
  let resolution: TavernGameResolution;
  try {
    resolution = resolveTavernGame({
      gameKey: parseGameKey(row.gameKey),
      seed: row.seed,
      stakeGold: row.stakeGold,
      players: liveParticipants.map((participant) => toResolverPlayer(participant, parseGameKey(row.gameKey)))
    });
    const payoutTotal = Object.values(resolution.payouts).reduce((sum, value) => sum + value, 0);
    const refundTotal = Object.values(resolution.refunds).reduce((sum, value) => sum + value, 0);
    if (payoutTotal + refundTotal !== row.potGold) {
      throw new Error(`Tavern game pot mismatch: ${payoutTotal + refundTotal} != ${row.potGold}`);
    }
  } catch (error) {
    const refunded = await refundSessionTx(tx, row, "failed_safe_refund", now, {
      kind: "failed_safe_refund",
      reason: error instanceof Error ? error.message : "unknown"
    });
    return { state: "failed-refund", session: refunded };
  }

  for (const participant of liveParticipants) {
    const payoutGold = resolution.payouts[participant.characterId] ?? 0;
    const refundedGold = resolution.refunds[participant.characterId] ?? 0;
    const returnedGold = payoutGold + refundedGold;
    if (returnedGold > 0) {
      await tx.character.update({
        where: { id: participant.characterId },
        data: { gold: { increment: returnedGold } }
      });
    }
    await tx.tavernGameParticipant.update({
      where: { id: participant.id },
      data: {
        status: refundedGold > 0 ? "left_refunded" : "completed",
        payoutGold,
        refundedGold,
        resultJson: resolution,
        activeStakeKey: null,
        completedAt: now
      }
    });
  }

  const completed = await tx.tavernGameSession.update({
    where: { id: row.id },
    data: {
      status: "completed",
      resultJson: resolution,
      completedAt: now
    },
    include: tavernGameSessionInclude
  });

  return { state: "resolved", session: completed, resolution };
}

async function refundSessionTx(
  tx: TxClient,
  row: TavernGameSessionRow,
  status: "cancelled_refund" | "expired_refund" | "failed_safe_refund",
  now: Date,
  resultExtra: Record<string, unknown> = {}
): Promise<TavernGameSessionRow> {
  const claimed = await tx.tavernGameSession.updateMany({
    where: {
      id: row.id,
      status: {
        in: ["open", "ready", "resolving"]
      }
    },
    data: { status }
  });
  if (claimed.count !== 1) {
    const replay = await findSessionById(tx, row.id);
    if (!replay) {
      throw new Error("Tavern game refund row disappeared.");
    }
    return replay;
  }

  for (const participant of row.participants.filter((entry) => isJoinedStatus(entry.status))) {
    await tx.character.update({
      where: { id: participant.characterId },
      data: { gold: { increment: participant.stakeGold } }
    });
    await tx.tavernGameParticipant.update({
      where: { id: participant.id },
      data: {
        status: "left_refunded",
        refundedGold: participant.stakeGold,
        activeStakeKey: null,
        completedAt: now
      }
    });
  }

  return tx.tavernGameSession.update({
    where: { id: row.id },
    data: {
      status,
      resultJson: {
        kind: status,
        ...resultExtra,
        refundedGold: row.participants
          .filter((entry) => isJoinedStatus(entry.status))
          .reduce((sum, participant) => sum + participant.stakeGold, 0)
      },
      completedAt: now
    },
    include: tavernGameSessionInclude
  });
}

async function validateDicePokerActionTx(
  tx: TxClient,
  session: TavernGameSessionRow,
  telegramUserId: bigint
): Promise<Exclude<DicePokerActionResult, { state: "saved" | "completed" | "cancelled" }> | null> {
  if (isTerminal(session.status)) {
    return { state: "closed", session: mapSession(session) };
  }
  if (!isDicePokerRow(session) || session.status !== "ready" || !isDicePokerState(session.resultJson)) {
    return { state: "stale", session: mapSession(session) };
  }

  const character = await findCharacterByTelegramUser(tx, telegramUserId);
  if (!character) {
    return { state: "no-character" };
  }

  const blocked = getGateReason(character);
  if (blocked) {
    return { state: "blocked", reason: blocked };
  }

  const participant = session.participants.find((row) =>
    row.characterId === character.id && isJoinedStatus(row.status)
  );
  if (!participant) {
    return { state: "not-participant", session: mapSession(session) };
  }

  return null;
}

function shouldResolveAfterDecision(row: TavernGameSessionRow): boolean {
  const live = row.participants.filter((participant) => isJoinedStatus(participant.status));
  if (row.gameKey === "tavlei") {
    return live.length === 2 && live.every((participant) => participant.decisionJson !== null);
  }

  return row.status === "ready" && live.length >= 2 && live.every((participant) => participant.decisionJson !== null);
}

function toResolverPlayer(
  row: TavernGameSessionRow["participants"][number],
  gameKey: TavernGameKey
): TavernGamePlayer {
  const stats = parseStats(row.character.statsJson);
  return {
    participantId: row.id,
    characterId: row.characterId,
    name: row.displayName,
    level: row.character.level,
    stats,
    stakeGold: row.stakeGold,
    decision: parseTavernGameDecision(gameKey, row.decisionJson)
  };
}

async function findCharacterByTelegramUser(
  prisma: Pick<PrismaClient, "character"> | TxClient,
  telegramUserId: bigint
): Promise<CharacterRow | null> {
  return prisma.character.findFirst({
    where: {
      user: { telegramUserId }
    },
    include: tavernGameCharacterInclude
  });
}

async function findSessionByToken(
  prisma: Pick<PrismaClient, "tavernGameSession"> | TxClient,
  token: string
): Promise<TavernGameSessionRow | null> {
  return prisma.tavernGameSession.findUnique({
    where: { token },
    include: tavernGameSessionInclude
  });
}

async function findSessionById(
  prisma: Pick<PrismaClient, "tavernGameSession"> | TxClient,
  id: string
): Promise<TavernGameSessionRow | null> {
  return prisma.tavernGameSession.findUnique({
    where: { id },
    include: tavernGameSessionInclude
  });
}

async function findLiveMembershipSession(
  prisma: Pick<PrismaClient, "tavernGameParticipant"> | TxClient,
  characterId: string
): Promise<TavernGameSessionRow | null> {
  const participant = await prisma.tavernGameParticipant.findFirst({
    where: {
      activeStakeKey: activeStakeKey(characterId),
      status: {
        in: [...JOINED_STATUSES]
      },
      session: {
        status: {
          in: ["open", "ready", "resolving"]
        }
      }
    },
    include: {
      session: {
        include: tavernGameSessionInclude
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return participant?.session ?? null;
}

function mapSession(row: TavernGameSessionRow): TavernGameSessionRecord {
  return {
    id: row.id,
    token: row.token,
    gameKey: parseGameKey(row.gameKey),
    status: parseStatus(row.status),
    creatorCharacterId: row.creatorCharacterId,
    stakeGold: row.stakeGold,
    potGold: row.potGold,
    seed: row.seed,
    rulesVersion: row.rulesVersion,
    result: row.resultJson,
    openedAt: row.openedAt,
    joinExpiresAt: row.joinExpiresAt,
    decisionExpiresAt: row.decisionExpiresAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    creator: mapCharacter(row.creator),
    participants: row.participants.map(mapParticipant)
  };
}

function mapParticipant(row: TavernGameSessionRow["participants"][number]): TavernGameParticipantRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    characterId: row.characterId,
    telegramUserId: row.telegramUserId,
    displayName: row.displayName,
    remortCount: row.remortCount,
    status: parseParticipantStatus(row.status),
    stakeGold: row.stakeGold,
    payoutGold: row.payoutGold,
    refundedGold: row.refundedGold,
    decision: row.decisionJson,
    result: row.resultJson,
    joinedAt: row.joinedAt,
    decidedAt: row.decidedAt,
    completedAt: row.completedAt,
    character: mapCharacter(row.character)
  };
}

function mapCharacter(row: CharacterRow): TavernGameCharacterSnapshot {
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
    remortCount: getIncludedRemortCount(row)
  };
}

function parseStatus(value: string): TavernGameSessionStatus {
  return isTerminal(value) || value === "open" || value === "ready" || value === "resolving"
    ? value
    : "open";
}

function parseParticipantStatus(value: string): TavernGameParticipantStatus {
  return value === "decided" || value === "completed" || value === "left_refunded" ? value : "joined";
}

function parseGameKey(value: string): TavernGameKey {
  return isTavernGameKey(value) ? value : "tavlei";
}

function getParticipantCap(gameKey: string): number {
  return gameKey === "kosti" ? KOSTI_PLAYER_CAP : TAVLEI_PLAYER_CAP;
}

function isDicePokerRow(row: TavernGameSessionRow): boolean {
  return row.gameKey === "kosti" && row.rulesVersion === DICE_POKER_RULES_VERSION;
}

function getMinimumParticipants(gameKey: string): number {
  return gameKey === "kosti" ? KOSTI_MIN_PLAYERS : TAVLEI_PLAYER_CAP;
}

function countLiveParticipants(row: TavernGameSessionRow): number {
  return row.participants.filter((participant) => isJoinedStatus(participant.status)).length;
}

function isJoinedStatus(status: string): boolean {
  return status === "joined" || status === "decided";
}

function isTerminal(status: string): status is TavernGameSessionStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

function getGateReason(character: CharacterRow): TavernGameGateReason | null {
  if (character.user.lastSeenLocationId !== PRESENCE_LOCATION_KORCHMA_BAR) {
    return "wrong-place";
  }
  if (character.activeCombatLease) {
    return "active-combat";
  }
  if (character.user.currentRaidId) {
    return "pending-raid";
  }

  return null;
}

function activeStakeKey(characterId: string): string {
  return `tavern-game:${characterId}`;
}

function parseStats(input: unknown): { intelligence: number; luck: number } {
  const source = typeof input === "object" && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    intelligence: Number.isFinite(Number(source.intelligence)) ? Number(source.intelligence) : 5,
    luck: Number.isFinite(Number(source.luck)) ? Number(source.luck) : 5
  };
}

function parseResolution(input: unknown): TavernGameResolution | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const value = input as { gameKey?: unknown; potGold?: unknown; payouts?: unknown; refunds?: unknown };
  if ((value.gameKey === "tavlei" || value.gameKey === "kosti") && Number.isInteger(value.potGold)) {
    return input as TavernGameResolution;
  }

  return null;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
