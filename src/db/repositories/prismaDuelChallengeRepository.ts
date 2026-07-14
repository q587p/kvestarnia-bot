import { Prisma, type Character, type CharacterEquipment, type PrismaClient } from "@prisma/client";
import type {
  DuelChallengeRecord,
  DuelChallengeRepository,
  DuelChallengeStatus,
  DuelCombatActionRecord,
  DuelCombatSessionRecord,
  DuelCharacterSnapshot,
  DuelMode,
  DuelResultBalanceAudit,
  DuelResultParticipantSnapshot,
  DuelResultProgressionBudget,
  DuelResultPayload,
  CreateDuelChallengeInput,
  StartTurnBasedDuelSessionInput,
  UpdateTurnBasedDuelSessionInput,
  ResolvedDuelChallengeRecord
} from "./duelChallengeRepository";
import type { CharacterEquipmentRecord } from "./equipmentRepository";
import type { CharacterStats, StatKey } from "../../domain/characters/starterStats";
import type { CombatGearAbilityInput, CombatSkillProfile } from "../../domain/combat";
import type { TurnBasedDuelState, TurnBasedDuelStatus } from "../../domain/duels/turnBasedDuel";
import { parseVarenykSatedCombatState } from "../../domain/noncombat/varenykSatedSupport";
import { applyXpReward, getLevelForXp } from "../../domain/progression/level";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { countCharacterRemorts, getIncludedRemortCount } from "./prismaRemortCount";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";
import {
  advanceVarenykSatedCursorThroughCombat,
  freezeVarenykSatedFromCooldown
} from "./prismaVarenykSated";

type DuelChallengeWithCharacters = Awaited<ReturnType<typeof findChallengeByToken>>;
type DuelCombatSessionWithChallenge =
  | Prisma.DuelCombatSessionGetPayload<{ include: typeof sessionInclude }>
  | null;

export class PrismaDuelChallengeRepository implements DuelChallengeRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hpRecoveryProducer = new HpRecoveryNotificationProducer(false)
  ) {}

  async createOpenForTelegramUser(
    telegramUserId: bigint,
    input: CreateDuelChallengeInput
  ): Promise<DuelChallengeRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!character) {
      return null;
    }

    const challenge = await this.prisma.duelChallenge.create({
      data: {
        challengerCharacterId: character.id,
        contextChatId: input.contextChatId ?? null,
        inviteToken: input.inviteToken,
        mode: input.mode ?? "quick",
        expiresAt: input.expiresAt
      }
    });

    return this.findByToken(challenge.inviteToken);
  }

  async createTargetedForTelegramUser(
    telegramUserId: bigint,
    targetCharacterId: string,
    input: CreateDuelChallengeInput
  ): Promise<DuelChallengeRecord | null> {
    const [challenger, target] = await Promise.all([
      this.prisma.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        select: {
          id: true
        }
      }),
      this.prisma.character.findUnique({
        where: {
          id: targetCharacterId
        },
        select: {
          id: true
        }
      })
    ]);

    if (!challenger || !target || challenger.id === target.id) {
      return null;
    }

    const challenge = await this.prisma.duelChallenge.create({
      data: {
        challengerCharacterId: challenger.id,
        targetCharacterId: target.id,
        contextChatId: input.contextChatId ?? null,
        inviteToken: input.inviteToken,
        mode: input.mode ?? "quick",
        expiresAt: input.expiresAt
      }
    });

    return this.findByToken(challenge.inviteToken);
  }

  async findByToken(inviteToken: string): Promise<DuelChallengeRecord | null> {
    return mapChallenge(await findChallengeByToken(this.prisma, inviteToken));
  }

  async listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]> {
    const records = await this.prisma.duelChallenge.findMany({
      where: {
        status: "resolved",
        resolvedAt: {
          gte: since
        },
        resultJson: {
          not: Prisma.JsonNull
        },
        targetCharacterId: {
          not: null
        }
      },
      include: {
        challenger: characterInclude,
        target: characterInclude
      },
      orderBy: {
        resolvedAt: "desc"
      }
    });

    return records.map(mapChallenge).filter(isResolvedDuelChallengeRecord);
  }

  async countResolvedBetweenCharacterPairSince(
    characterAId: string,
    characterBId: string,
    since: Date
  ): Promise<number> {
    return this.prisma.duelChallenge.count({
      where: {
        status: "resolved",
        resolvedAt: {
          gte: since
        },
        resultJson: {
          not: Prisma.JsonNull
        },
        OR: [
          {
            challengerCharacterId: characterAId,
            targetCharacterId: characterBId
          },
          {
            challengerCharacterId: characterBId,
            targetCharacterId: characterAId
          }
        ]
      }
    });
  }

  async findCharacterByTelegramUser(telegramUserId: bigint): Promise<DuelCharacterSnapshot | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      ...characterInclude
    });

    return character ? mapCharacter(character) : null;
  }

  async markExpiredByToken(inviteToken: string, now: Date): Promise<DuelChallengeRecord | null> {
    await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        expiresAt: {
          lte: now
        }
      },
      data: {
        status: "expired"
      }
    });

    return this.findByToken(inviteToken);
  }

  async cancelByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<{ record: DuelChallengeRecord | null; transitioned: boolean }> {
    await this.expireIfNeeded(inviteToken, now);
    const updated = await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        challenger: {
          user: {
            telegramUserId
          }
        }
      },
      data: {
        status: "cancelled"
      }
    });

    return {
      record: await this.findByToken(inviteToken),
      transitioned: updated.count === 1
    };
  }

  async declineByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<{ record: DuelChallengeRecord | null; transitioned: boolean }> {
    await this.expireIfNeeded(inviteToken, now);
    const updated = await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        target: {
          user: {
            telegramUserId
          }
        }
      },
      data: {
        status: "declined"
      }
    });

    return {
      record: await this.findByToken(inviteToken),
      transitioned: updated.count === 1
    };
  }

  async acceptByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    result: DuelResultPayload
  ): Promise<{ record: DuelChallengeRecord | null; transitioned: boolean }> {
    await this.expireIfNeeded(inviteToken, now);

    const target = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!target) {
      return { record: null, transitioned: false };
    }

    const updated = await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        expiresAt: {
          gt: now
        },
        challengerCharacterId: {
          not: target.id
        },
        OR: [
          {
            targetCharacterId: null
          },
          {
            targetCharacterId: target.id
          }
        ]
      },
      data: {
        targetCharacterId: target.id,
        status: "resolved",
        resolvedAt: now,
        resultJson: result as unknown as Prisma.InputJsonValue
      }
    });

    return {
      record: await this.findByToken(inviteToken),
      transitioned: updated.count === 1
    };
  }

  async startTurnBasedByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    input: StartTurnBasedDuelSessionInput
  ): Promise<{ record: DuelCombatSessionRecord | null; transitioned: boolean }> {
    await this.expireIfNeeded(inviteToken, now);

    const sessionId = input.sessionId;
    const session = await this.prisma.$transaction(async (tx) => {
      const target = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        select: {
          id: true
        }
      });

      if (!target) {
        return { record: null, transitioned: false };
      }

      const challenge = await tx.duelChallenge.findUnique({
        where: {
          inviteToken
        },
        select: {
          id: true,
          challengerCharacterId: true,
          targetCharacterId: true,
          status: true,
          mode: true,
          expiresAt: true
        }
      });

      if (
        !challenge ||
        challenge.status !== "pending" ||
        challenge.mode !== "turn-based" ||
        challenge.expiresAt <= now ||
        challenge.challengerCharacterId === target.id ||
        (challenge.targetCharacterId !== null && challenge.targetCharacterId !== target.id)
      ) {
        return { record: null, transitioned: false };
      }

      const participantIds = [challenge.challengerCharacterId, target.id];
      const activeSolo = await tx.soloCombatSession.count({
        where: {
          status: "active",
          characterId: {
            in: participantIds
          }
        }
      });

      if (activeSolo > 0) {
        return { record: null, transitioned: false };
      }

      const updated = await tx.duelChallenge.updateMany({
        where: {
          id: challenge.id,
          status: "pending",
          mode: "turn-based",
          expiresAt: {
            gt: now
          }
        },
        data: {
          targetCharacterId: target.id,
          status: "active"
        }
      });

      if (updated.count !== 1) {
        return { record: null, transitioned: false };
      }

      const state = {
        ...input.state,
        participants: { ...input.state.participants }
      };
      for (const side of ["challenger", "target"] as const) {
        const participant = state.participants[side];
        const sated = await freezeVarenykSatedFromCooldown({
          tx,
          characterId: participant.characterId,
          remortCount: participant.remortCount,
          resources: { hp: participant.hp, hpMax: participant.hpMax, mana: participant.mana, manaMax: participant.manaMax },
          now
        });
        state.participants[side] = {
          ...participant,
          hp: sated.resources.hp,
          mana: sated.resources.mana,
          ...(sated.sated ? { varenykSated: sated.sated } : {})
        };
      }

      await tx.activeCombatLease.createMany({
        data: participantIds.map((characterId) => ({
          characterId,
          kind: "turn-based-duel",
          referenceId: sessionId
        }))
      });

      const record = await tx.duelCombatSession.create({
        data: {
          id: sessionId,
          duelChallengeId: challenge.id,
          challengerCharacterId: challenge.challengerCharacterId,
          targetCharacterId: target.id,
          status: "active",
          actingCharacterId: state.actingCharacterId,
          stateJson: state as unknown as Prisma.InputJsonValue,
          turn: state.turn,
          version: 1,
          turnExpiresAt: input.turnExpiresAt,
          targetChatId: input.targetChatId ?? null,
          targetMessageId: input.targetMessageId ?? null
        },
        include: sessionInclude
      });

      return { record, transitioned: true };
    }).catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { record: null, transitioned: false };
      }

      throw error;
    });

    return {
      record: mapDuelCombatSession(session.record),
      transitioned: session.transitioned
    };
  }

  async findActiveCombatBlockerCharacterId(characterIds: string[]): Promise<string | null> {
    if (characterIds.length === 0) {
      return null;
    }

    const [activeLease, activeSolo] = await Promise.all([
      this.prisma.activeCombatLease.findFirst({
        where: {
          characterId: {
            in: characterIds
          }
        },
        select: {
          characterId: true
        }
      }),
      this.prisma.soloCombatSession.findFirst({
        where: {
          status: "active",
          characterId: {
            in: characterIds
          }
        },
        select: {
          characterId: true
        }
      })
    ]);

    const blockedIds = new Set(
      [activeLease?.characterId, activeSolo?.characterId].filter(
        (characterId): characterId is string => Boolean(characterId)
      )
    );

    return characterIds.find((characterId) => blockedIds.has(characterId)) ?? null;
  }

  async findActiveTurnBasedByTelegramUserId(
    telegramUserId: bigint
  ): Promise<DuelCombatSessionRecord | null> {
    const session = await this.prisma.duelCombatSession.findFirst({
      where: {
        status: "active",
        OR: [
          { challenger: { user: { telegramUserId } } },
          { target: { user: { telegramUserId } } }
        ]
      },
      orderBy: {
        updatedAt: "desc"
      },
      include: sessionInclude
    });

    return mapDuelCombatSession(session);
  }

  async findTurnBasedByTokenForTelegramUserId(
    inviteToken: string,
    telegramUserId: bigint
  ): Promise<DuelCombatSessionRecord | null> {
    const session = await this.prisma.duelCombatSession.findFirst({
      where: {
        duelChallenge: {
          inviteToken
        },
        OR: [
          { challenger: { user: { telegramUserId } } },
          { target: { user: { telegramUserId } } }
        ]
      },
      include: sessionInclude
    });

    return mapDuelCombatSession(session);
  }

  async findTurnBasedByToken(inviteToken: string): Promise<DuelCombatSessionRecord | null> {
    const session = await this.prisma.duelCombatSession.findFirst({
      where: {
        duelChallenge: {
          inviteToken
        }
      },
      include: sessionInclude
    });

    return mapDuelCombatSession(session);
  }

  async listTurnBasedActionsByToken(inviteToken: string): Promise<DuelCombatActionRecord[]> {
    const actions = await this.prisma.duelCombatAction.findMany({
      where: {
        session: {
          duelChallenge: {
            inviteToken
          }
        }
      },
      orderBy: [
        { turn: "asc" },
        { createdAt: "asc" }
      ]
    });

    return actions.map(mapDuelCombatAction);
  }

  async hasResolvedTurnBasedRoundByToken(inviteToken: string): Promise<boolean> {
    const action = await this.prisma.duelCombatAction.findFirst({
      where: {
        actionKey: { in: ["round", "timeout-attack"] },
        session: { duelChallenge: { inviteToken } }
      },
      select: { id: true }
    });

    return action !== null;
  }

  async updateTurnBasedIfActiveVersion(
    sessionId: string,
    expectedTurn: number,
    expectedVersion: number,
    input: UpdateTurnBasedDuelSessionInput
  ): Promise<DuelCombatSessionRecord | null> {
    const nextVersion = expectedVersion + 1;
    const session = await this.prisma.$transaction(async (tx) => {
      const update = await tx.duelCombatSession.updateMany({
        where: {
          id: sessionId,
          status: "active",
          turn: expectedTurn,
          version: expectedVersion,
          turnExpiresAt: input.deadlineMode === "player-action"
            ? { gt: input.now }
            : { lte: input.now }
        },
        data: {
          stateJson: input.state as unknown as Prisma.InputJsonValue,
          status: input.status,
          actingCharacterId: input.state.actingCharacterId,
          turn: input.state.turn,
          version: nextVersion,
          turnExpiresAt: input.turnExpiresAt,
          ...(input.status === "active" ? {} : { completedAt: input.completedAt ?? input.now })
        }
      });

      if (update.count !== 1) {
        return null;
      }

      for (const participant of Object.values(input.state.participants)) {
        if (!participant.varenykSated) {
          continue;
        }
        await advanceVarenykSatedCursorThroughCombat({
          tx,
          characterId: participant.characterId,
          activationId: participant.varenykSated.activationId,
          now: input.now,
          outsideRemainderMs: participant.varenykSated.outsideRemainderMs
        });
      }

      if (input.action) {
        await tx.duelCombatAction.create({
          data: {
            sessionId,
            actorCharacterId: input.action.actorCharacterId,
            turn: input.action.turn,
            actionKey: input.action.actionKey,
            resultJson: input.action.result as Prisma.InputJsonValue
          }
        }).catch((error: unknown) => {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            return null;
          }

          throw error;
        });
      }

      if (input.status !== "active") {
        const current = await tx.duelCombatSession.findUnique({
          where: { id: sessionId },
          select: {
            duelChallengeId: true,
            challengerCharacterId: true,
            targetCharacterId: true
          }
        });

        if (current) {
          const challengeUpdate = await tx.duelChallenge.updateMany({
            where: {
              id: current.duelChallengeId,
              status: "active"
            },
            data: {
              status: input.result ? "resolved" : input.status === "forfeited" ? "forfeited" : input.status,
              ...(input.result
                ? {
                    resolvedAt: input.completedAt ?? input.now,
                    resultJson: input.result as unknown as Prisma.InputJsonValue
                  }
                : {})
            }
          });

          if (challengeUpdate.count === 1 && input.result?.xpRewards) {
            await awardTurnBasedDuelXp(
              tx,
              current.challengerCharacterId,
              input.result.xpRewards.challenger,
              input.now,
              this.hpRecoveryProducer
            );
            await awardTurnBasedDuelXp(
              tx,
              current.targetCharacterId,
              input.result.xpRewards.target,
              input.now,
              this.hpRecoveryProducer
            );
          }

          await tx.activeCombatLease.deleteMany({
            where: {
              characterId: {
                in: [current.challengerCharacterId, current.targetCharacterId]
              },
              kind: "turn-based-duel",
              referenceId: sessionId
            }
          });
        }
      }

      return tx.duelCombatSession.findUnique({
        where: { id: sessionId },
        include: sessionInclude
      });
    });

    return mapDuelCombatSession(session);
  }

  async listDueTurnBasedSessions(now: Date, limit = 23): Promise<DuelCombatSessionRecord[]> {
    const sessions = await this.prisma.duelCombatSession.findMany({
      where: {
        status: "active",
        turnExpiresAt: {
          lte: now
        }
      },
      take: limit,
      orderBy: {
        turnExpiresAt: "asc"
      },
      include: sessionInclude
    });

    return sessions.map(mapDuelCombatSession).filter((session): session is DuelCombatSessionRecord => session !== null);
  }

  async recordTurnBasedMessageReference(
    sessionId: string,
    participant: "challenger" | "target",
    reference: { chatId: bigint; messageId: number }
  ): Promise<DuelCombatSessionRecord | null> {
    const record = await this.prisma.duelCombatSession.update({
      where: { id: sessionId },
      data: participant === "challenger"
        ? {
            challengerChatId: reference.chatId,
            challengerMessageId: reference.messageId
          }
        : {
            targetChatId: reference.chatId,
            targetMessageId: reference.messageId
          },
      include: sessionInclude
    }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) {
        return null;
      }

      throw error;
    });

    return mapDuelCombatSession(record);
  }

  async repairTurnBasedCombatState(now: Date): Promise<{
    repairedSessions: number;
    removedOrphanLeases: number;
  }> {
    let repairedSessions = 0;
    const activeSessions = await this.prisma.duelCombatSession.findMany({
      where: {
        status: "active"
      },
      include: sessionInclude
    });

    for (const session of activeSessions) {
      const state = parseTurnBasedDuelState(session.stateJson);
      const valid =
        state &&
        session.duelChallenge.status === "active" &&
        session.duelChallengeId === session.duelChallenge.id &&
        session.challengerCharacterId === session.duelChallenge.challengerCharacterId &&
        session.targetCharacterId === session.duelChallenge.targetCharacterId &&
        state.participants.challenger.characterId === session.challengerCharacterId &&
        state.participants.target.characterId === session.targetCharacterId &&
        state.turn === session.turn &&
        state.status === "active";

      if (valid) {
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.duelCombatSession.updateMany({
          where: {
            id: session.id,
            status: "active"
          },
          data: {
            status: "expired",
            completedAt: now
          }
        });

        if (updated.count !== 1) {
          return;
        }

        await tx.duelChallenge.updateMany({
          where: {
            id: session.duelChallengeId,
            status: "active"
          },
          data: {
            status: "expired"
          }
        });

        const repairLeases = await tx.activeCombatLease.findMany({
          where: {
            kind: "turn-based-duel",
            referenceId: session.id
          }
        });
        for (const lease of repairLeases) {
          const participant = state
            ? Object.values(state.participants).find((entry) => entry.characterId === lease.characterId)
            : undefined;
          await advanceVarenykSatedCursorThroughCombat({
            tx,
            characterId: lease.characterId,
            ...(participant?.varenykSated
              ? {
                  activationId: participant.varenykSated.activationId,
                  outsideRemainderMs: participant.varenykSated.outsideRemainderMs
                }
              : { leaseStartedAt: lease.createdAt }),
            now
          });
        }
        await tx.activeCombatLease.deleteMany({
          where: {
            kind: "turn-based-duel",
            referenceId: session.id
          }
        });
      });

      repairedSessions += 1;
      console.warn("Квестарня: repaired malformed turn-based duel session.", {
        sessionId: session.id,
        duelChallengeId: session.duelChallengeId,
        challengerCharacterId: session.challengerCharacterId,
        targetCharacterId: session.targetCharacterId
      });
    }

    const leases = await this.prisma.activeCombatLease.findMany({
      where: {
        kind: "turn-based-duel"
      }
    });
    let removedOrphanLeases = 0;

    for (const lease of leases) {
      const owner = await this.prisma.duelCombatSession.findFirst({
        where: {
          id: lease.referenceId,
          status: "active",
          OR: [
            { challengerCharacterId: lease.characterId },
            { targetCharacterId: lease.characterId }
          ]
        },
        select: { id: true }
      });

      if (owner) {
        continue;
      }

      const deleted = await this.prisma.$transaction(async (tx) => {
        await advanceVarenykSatedCursorThroughCombat({
          tx,
          characterId: lease.characterId,
          leaseStartedAt: lease.createdAt,
          now
        });
        return tx.activeCombatLease.deleteMany({
          where: {
            id: lease.id,
            kind: "turn-based-duel"
          }
        });
      });
      removedOrphanLeases += deleted.count;
      console.warn("Квестарня: removed orphan turn-based duel lease.", {
        leaseId: lease.id,
        characterId: lease.characterId,
        referenceId: lease.referenceId
      });
    }

    return { repairedSessions, removedOrphanLeases };
  }

  private async expireIfNeeded(inviteToken: string, now: Date): Promise<void> {
    await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        expiresAt: {
          lte: now
        }
      },
      data: {
        status: "expired"
      }
    });
  }
}

async function awardTurnBasedDuelXp(
  tx: Prisma.TransactionClient,
  characterId: string,
  xpReward: number,
  now: Date,
  hpRecoveryProducer: HpRecoveryNotificationProducer
): Promise<void> {
  const amount = Math.max(0, Math.floor(xpReward));

  if (amount <= 0) {
    return;
  }

  const character = await tx.character.findUnique({
    where: {
      id: characterId
    }
  });

  if (!character) {
    return;
  }

  const rewardedCharacter = await tx.character.update({
    where: {
      id: character.id
    },
    data: {
      xp: {
        increment: amount
      }
    }
  });
  const remortCount = await countCharacterRemorts(tx, character.id);
  const rewardProgress = applyXpReward(character.xp, amount, { remortCount });
  const oldLevel = Math.max(character.level, rewardProgress.oldLevel);
  const newLevel = Math.max(rewardedCharacter.level, getLevelForXp(rewardedCharacter.xp, { remortCount }));

  if (newLevel !== rewardedCharacter.level) {
    await tx.character.update({
      where: {
        id: rewardedCharacter.id
      },
      data: {
        level: newLevel
      }
    });
  }

  await recordLevelMilestones(tx, character.id, oldLevel, newLevel, undefined, {
    remortCount
  });
  await hpRecoveryProducer.record(tx, character.id, now, "recovering");
}

async function findChallengeByToken(prisma: PrismaClient, inviteToken: string) {
  return prisma.duelChallenge.findUnique({
    where: {
      inviteToken
    },
    include: {
      challenger: characterInclude,
      target: characterInclude
    }
  });
}

const characterInclude = {
  include: {
    user: {
      select: {
        lastSeenLocationId: true,
        telegramUserId: true
      }
    },
    equipment: true,
    _count: {
      select: {
        remorts: true
      }
    }
  }
} satisfies Prisma.CharacterDefaultArgs;

const sessionInclude = {
  duelChallenge: {
    include: {
      challenger: characterInclude,
      target: characterInclude
    }
  }
} satisfies Prisma.DuelCombatSessionInclude;

function mapChallenge(record: DuelChallengeWithCharacters): DuelChallengeRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    challengerCharacterId: record.challengerCharacterId,
    targetCharacterId: record.targetCharacterId,
    contextChatId: record.contextChatId,
    inviteToken: record.inviteToken,
    mode: parseMode(record.mode),
    status: parseStatus(record.status),
    expiresAt: record.expiresAt,
    resolvedAt: record.resolvedAt,
    result: parseResult(record.resultJson),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    challenger: mapCharacter(record.challenger),
    target: record.target ? mapCharacter(record.target) : null
  };
}

function mapDuelCombatSession(
  record: DuelCombatSessionWithChallenge
): DuelCombatSessionRecord | null {
  if (!record) {
    return null;
  }

  const challenge = mapChallenge(record.duelChallenge);
  const state = parseTurnBasedDuelState(record.stateJson);

  if (
    !challenge ||
    !state ||
    state.participants.challenger.characterId !== record.challengerCharacterId ||
    state.participants.target.characterId !== record.targetCharacterId ||
    record.challengerCharacterId !== challenge.challengerCharacterId ||
    record.targetCharacterId !== challenge.targetCharacterId
  ) {
    return null;
  }

  return {
    id: record.id,
    duelChallengeId: record.duelChallengeId,
    challengerCharacterId: record.challengerCharacterId,
    targetCharacterId: record.targetCharacterId,
    status: parseTurnBasedStatus(record.status),
    actingCharacterId: record.actingCharacterId,
    state,
    turn: record.turn,
    version: record.version,
    turnExpiresAt: record.turnExpiresAt,
    completedAt: record.completedAt,
    challengerChatId: record.challengerChatId,
    challengerMessageId: record.challengerMessageId,
    targetChatId: record.targetChatId,
    targetMessageId: record.targetMessageId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    challenge
  };
}

function mapDuelCombatAction(record: {
  id: string;
  sessionId: string;
  actorCharacterId: string;
  turn: number;
  actionKey: string;
  resultJson: Prisma.JsonValue;
  createdAt: Date;
}): DuelCombatActionRecord {
  return {
    id: record.id,
    sessionId: record.sessionId,
    actorCharacterId: record.actorCharacterId,
    turn: record.turn,
    actionKey: parseDuelCombatActionKey(record.actionKey),
    result: record.resultJson,
    createdAt: record.createdAt
  };
}

function parseDuelCombatActionKey(value: string): DuelCombatActionRecord["actionKey"] {
  return value === "attack" ||
    value === "defend" ||
    value === "skill" ||
    value === "race" ||
    value === "gear" ||
    value === "surrender" ||
    value === "timeout-attack" ||
    value === "round"
    ? value
    : "round";
}

function isResolvedDuelChallengeRecord(
  record: DuelChallengeRecord | null
): record is ResolvedDuelChallengeRecord {
  return (
    record?.status === "resolved" &&
    record.resolvedAt !== null &&
    record.result !== null &&
    record.target !== null
  );
}

function mapCharacter(
  record: Character & {
    user: { lastSeenLocationId: string | null; telegramUserId: bigint };
    equipment: CharacterEquipment[];
    _count?: { remorts?: number };
  }
): DuelCharacterSnapshot {
  const { user, equipment, ...character } = record;
  delete (character as { _count?: unknown })._count;

  return {
    ...character,
    telegramUserId: user.telegramUserId,
    currentLocationId: user.lastSeenLocationId,
    remortCount: getIncludedRemortCount(record),
    equipment: equipment.map(mapEquipment)
  };
}

function mapEquipment(record: CharacterEquipment): CharacterEquipmentRecord {
  return {
    id: record.id,
    characterId: record.characterId,
    slot: record.slot as CharacterEquipmentRecord["slot"],
    itemId: record.itemId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function parseStatus(status: string): DuelChallengeStatus {
  return status === "pending" ||
    status === "active" ||
    status === "declined" ||
    status === "expired" ||
    status === "resolved" ||
    status === "forfeited" ||
    status === "cancelled"
    ? status
    : "expired";
}

function parseMode(mode: string): DuelMode {
  return mode === "turn-based" ? "turn-based" : "quick";
}

function parseTurnBasedStatus(status: string): TurnBasedDuelStatus {
  return status === "active" ||
    status === "resolved" ||
    status === "expired" ||
    status === "forfeited"
    ? status
    : "expired";
}

function parseResult(value: unknown): DuelResultPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const outcome = value.outcome;

  if (outcome !== "challenger" && outcome !== "target" && outcome !== "draw") {
    return null;
  }

  const participants = parseParticipants(value.participants);
  const audit = parseAudit(value.audit);
  const xpRewards = parseXpRewards(value.xpRewards);
  const result: DuelResultPayload = {
    ...(value.mode === "quick" || value.mode === "turn-based" ? { mode: value.mode } : {}),
    ...(typeof value.rulesVersion === "string" ? { rulesVersion: value.rulesVersion } : {}),
    ...(isTerminalReason(value.terminalReason) ? { terminalReason: value.terminalReason } : {}),
    ...(xpRewards ? { xpRewards } : {}),
    outcome,
    winnerCharacterId: typeof value.winnerCharacterId === "string" ? value.winnerCharacterId : null,
    loserCharacterId: typeof value.loserCharacterId === "string" ? value.loserCharacterId : null,
    challengerScore: intOrZero(value.challengerScore),
    targetScore: intOrZero(value.targetScore),
    swing: intOrZero(value.swing),
    flavorKey: typeof value.flavorKey === "string" ? value.flavorKey : "direct-hit",
    ...(typeof value.balanceVersion === "string" ? { balanceVersion: value.balanceVersion } : {})
  };

  if (participants) {
    result.participants = participants;
  }

  if (audit) {
    result.audit = audit;
  }

  return result;
}

function parseXpRewards(value: unknown): DuelResultPayload["xpRewards"] | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    challenger: Math.max(0, intOrZero(value.challenger)),
    target: Math.max(0, intOrZero(value.target))
  };
}

function parseTurnBasedDuelState(value: unknown): TurnBasedDuelState | null {
  if (!isRecord(value) || value.mode !== "turn-based") {
    return null;
  }

  const status = parseTurnBasedStatusSafe(value.status);
  const turn = parsePositiveInt(value.turn);
  const participants = value.participants;
  const challenger = isRecord(participants) ? parseTurnBasedParticipant(participants.challenger) : null;
  const target = isRecord(participants) ? parseTurnBasedParticipant(participants.target) : null;

  if (
    !status ||
    typeof value.rulesVersion !== "string" ||
    typeof value.balanceVersion !== "string" ||
    turn === null ||
    typeof value.actingCharacterId !== "string" ||
    !challenger ||
    !target ||
    (value.actingCharacterId !== challenger.characterId &&
      value.actingCharacterId !== target.characterId)
  ) {
    return null;
  }

  const pendingActions = parsePendingActions(value.pendingActions, challenger.characterId, target.characterId);
  const lastRound = parseRoundSummary(value.lastRound);
  const lastAction = hasOwn(value, "lastAction") ? parseActionSummary(value.lastAction) : undefined;
  const outcome = parseTurnBasedOutcome(value.outcome);

  if (
    pendingActions === null ||
    lastRound === null ||
    lastAction === null ||
    outcome === null
  ) {
    return null;
  }

  return {
    mode: "turn-based",
    status,
    rulesVersion: value.rulesVersion,
    balanceVersion: value.balanceVersion,
    turn,
    actingCharacterId: value.actingCharacterId,
    participants: { challenger, target },
    ...(pendingActions ? { pendingActions } : {}),
    ...(lastRound ? { lastRound } : {}),
    ...(lastAction ? { lastAction } : {}),
    ...(outcome ? { outcome } : {})
  };
}

function parseTurnBasedStatusSafe(value: unknown): TurnBasedDuelStatus | null {
  return typeof value === "string" &&
    (value === "active" || value === "resolved" || value === "expired" || value === "forfeited")
    ? value
    : null;
}

function parseTurnBasedParticipant(value: unknown): TurnBasedDuelState["participants"]["challenger"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const characterId = stringOrNull(value.characterId);
  const displayName = stringOrNull(value.displayName);
  const activeCosmeticTitle = stringOrNull(value.activeCosmeticTitle);
  const title = stringOrNull(value.title);
  const raceId = stringOrNull(value.raceId);
  const raceName = stringOrNull(value.raceName);
  const classId = stringOrNull(value.classId);
  const className = stringOrNull(value.className);
  const level = parsePositiveInt(value.level);
  const remortCount = parseNonNegativeInt(value.remortCount);
  const stats = parseStats(value.stats);
  const combatStats = parseCombatStats(value.combatStats);
  const hp = parseNonNegativeInt(value.hp);
  const hpMax = parsePositiveInt(value.hpMax);
  const mana = parseNonNegativeInt(value.mana);
  const manaMax = parseNonNegativeInt(value.manaMax);
  const balanceAudit = parseBalanceAudit(value.balanceAudit);
  const cooldowns = hasOwn(value, "cooldowns") ? parseCooldowns(value.cooldowns) : undefined;
  const playerAbilityFumbles = hasOwn(value, "playerAbilityFumbles")
    ? parsePlayerAbilityFumbles(value.playerAbilityFumbles)
    : undefined;
  const equipmentEffects = hasOwn(value, "equipmentEffects")
    ? parseEquipmentEffects(value.equipmentEffects)
    : undefined;
  const equipmentAbilityGrantIds = hasOwn(value, "equipmentAbilityGrantIds")
    ? parseStringList(value.equipmentAbilityGrantIds)
    : undefined;
  const varenykSated = hasOwn(value, "varenykSated")
    ? parseVarenykSatedCombatState(value.varenykSated)
    : undefined;

  if (
    !characterId ||
    !displayName ||
    !title ||
    !raceId ||
    !raceName ||
    !classId ||
    !className ||
    level === null ||
    remortCount === null ||
    !stats ||
    !combatStats ||
    hp === null ||
    hpMax === null ||
    mana === null ||
    manaMax === null ||
    !balanceAudit ||
    cooldowns === null ||
    playerAbilityFumbles === null ||
    equipmentEffects === null ||
    equipmentAbilityGrantIds === null ||
    varenykSated === null
  ) {
    return null;
  }

  return {
    characterId,
    displayName,
    ...(activeCosmeticTitle ? { activeCosmeticTitle } : {}),
    title,
    raceId,
    raceName,
    classId,
    className,
    level,
    remortCount,
    stats,
    hp,
    hpMax,
    mana,
    manaMax,
    combatStats: {
      ...combatStats,
      raceId: combatStats.raceId ?? raceId
    },
    ...(cooldowns ? { cooldowns } : {}),
    ...(playerAbilityFumbles ? { playerAbilityFumbles } : {}),
    balanceAudit,
    ...(equipmentEffects ? { equipmentEffects } : {}),
    ...(equipmentAbilityGrantIds ? { equipmentAbilityGrantIds } : {}),
    ...(varenykSated ? { varenykSated } : {})
  };
}

function parsePlayerAbilityFumbles(value: unknown): TurnBasedDuelState["participants"]["challenger"]["playerAbilityFumbles"] | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.abilities)) {
    return null;
  }

  const abilities = Object.fromEntries(
    Object.entries(value.abilities).flatMap(([abilityId, entry]) => {
      if (!isRecord(entry) || entry.version !== 1 || abilityId.length === 0 || abilityId.length > 128) {
        return [];
      }
      const cycle = parseNonNegativeInt(entry.cycle);
      const usesInCycle = parseNonNegativeInt(entry.usesInCycle);
      const triggerAt = parsePositiveInt(entry.triggerAt);

      return cycle === null ||
        usesInCycle === null ||
        usesInCycle > 92 ||
        triggerAt === null ||
        triggerAt > 93
        ? []
        : [[abilityId, { version: 1 as const, cycle, usesInCycle, triggerAt }] as const];
    })
  );

  return Object.keys(abilities).length > 0
    ? { version: 1, abilities }
    : null;
}

function parseCombatStats(value: unknown): TurnBasedDuelState["participants"]["challenger"]["combatStats"] | null {
  if (!isRecord(value)) {
    return null;
  }
  const stats = parseStats(value);
  const level = parsePositiveInt(value.level);
  const hpMax = parsePositiveInt(value.hpMax);
  const manaMax = parseNonNegativeInt(value.manaMax);
  const classId = stringOrNull(value.classId);
  const raceId = stringOrNull(value.raceId);

  if (!stats || level === null || hpMax === null || manaMax === null || !classId) {
    return null;
  }

  return {
    ...stats,
    level,
    hpMax,
    manaMax,
    classId,
    ...(raceId ? { raceId } : {}),
    armor: intOrZero(value.armor),
    resist: intOrZero(value.resist),
    weaponDamage: intOrZero(value.weaponDamage),
    spellPower: intOrZero(value.spellPower)
  };
}

function parseEquipmentEffects(value: unknown): TurnBasedDuelState["participants"]["challenger"]["equipmentEffects"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const stats = parseStats(value.stats);

  if (hasOwn(value, "stats") && !stats) {
    return null;
  }

  return {
    hpMax: intOrZero(value.hpMax),
    manaMax: intOrZero(value.manaMax),
    armor: intOrZero(value.armor),
    resist: intOrZero(value.resist),
    weaponDamage: intOrZero(value.weaponDamage),
    spellPower: intOrZero(value.spellPower),
    stats: stats ?? createEmptyStats(),
    contributions: []
  };
}

function parseCooldowns(value: unknown): TurnBasedDuelState["participants"]["challenger"]["cooldowns"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const abilityEntries = isRecord(value.abilities)
    ? Object.entries(value.abilities).flatMap(([abilityId, entry]) => {
        if (!isRecord(entry)) {
          return [];
        }
        const id = stringOrNull(entry.id);
        const remainingTurns = parseNonNegativeInt(entry.remainingTurns);

        return id && remainingTurns !== null && remainingTurns > 0
          ? [[abilityId, { id, remainingTurns }] as const]
          : [];
      })
    : [];
  const skill = parseCooldown(value.skill);
  const abilities = Object.fromEntries([
    ...abilityEntries,
    ...(skill ? [[skill.id, skill] as const] : [])
  ]);

  return Object.keys(abilities).length > 0
    ? {
        abilities,
        ...(skill ? { skill } : {})
      }
    : null;
}

function parseCooldown(value: unknown): { id: string; remainingTurns: number } | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringOrNull(value.id);
  const remainingTurns = parseNonNegativeInt(value.remainingTurns);

  return id && remainingTurns !== null && remainingTurns > 0
    ? { id, remainingTurns }
    : null;
}

function parsePendingActions(
  value: unknown,
  challengerCharacterId: string,
  targetCharacterId: string
): TurnBasedDuelState["pendingActions"] | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    return null;
  }
  const challenger = parseQueuedAction(value.challenger, challengerCharacterId);
  const target = parseQueuedAction(value.target, targetCharacterId);

  if (Object.keys(value).some((key) => key !== "challenger" && key !== "target")) {
    return null;
  }

  if (
    (challenger === null && hasOwn(value, "challenger")) ||
    (target === null && hasOwn(value, "target"))
  ) {
    return null;
  }

  return challenger || target
    ? {
        ...(challenger ? { challenger } : {}),
        ...(target ? { target } : {})
      }
    : undefined;
}

function parseQueuedAction(
  value: unknown,
  expectedCharacterId: string
): NonNullable<TurnBasedDuelState["pendingActions"]>["challenger"] | null {
  if (!isRecord(value) || value.actorCharacterId !== expectedCharacterId) {
    return null;
  }
  if (
    value.action !== "attack" &&
    value.action !== "defend" &&
    value.action !== "skill" &&
    value.action !== "race" &&
    value.action !== "gear"
  ) {
    return null;
  }

  const gearAbility = value.action === "gear" ? parseGearAbility(value.gearAbility) : undefined;
  if (value.action === "gear" && !gearAbility) {
    return null;
  }

  return {
    actorCharacterId: expectedCharacterId,
    action: value.action,
    ...(gearAbility ? { gearAbility } : {})
  };
}

function parseRoundSummary(value: unknown): TurnBasedDuelState["lastRound"] | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    return null;
  }
  const turn = parsePositiveInt(value.turn);
  const actions = Array.isArray(value.actions)
    ? value.actions.map(parseActionSummary)
    : null;

  const parsedActions = actions?.filter((action): action is NonNullable<ReturnType<typeof parseActionSummary>> => action !== null);

  return turn !== null && actions && parsedActions && parsedActions.length === actions.length
    ? { turn, actions: parsedActions }
    : null;
}

function parseActionSummary(value: unknown): TurnBasedDuelState["lastAction"] | null {
  if (!isRecord(value)) {
    return null;
  }
  const actorCharacterId = stringOrNull(value.actorCharacterId);
  const defenderCharacterId = stringOrNull(value.defenderCharacterId);
  const damage = parseNonNegativeInt(value.damage);
  const healing = parseNonNegativeInt(value.healing);
  const guard = parseNonNegativeInt(value.guard);
  const manaSpent = parseNonNegativeInt(value.manaSpent);
  const fumble = parsePlayerAbilityFumbleSummary(value.fumble);
  const satedRecovery = parseTurnBasedSatedRecovery(value.satedRecovery);
  const action = isTurnBasedSummaryAction(value.action) ? value.action : null;
  const outcome = isTurnBasedSummaryOutcome(value.outcome) ? value.outcome : null;

  if (
    !actorCharacterId ||
    !defenderCharacterId ||
    !action ||
    !outcome ||
    damage === null ||
    manaSpent === null ||
    fumble === null
  ) {
    return null;
  }

  return {
    actorCharacterId,
    defenderCharacterId,
    action,
    outcome,
    damage,
    ...(healing !== null && healing > 0 ? { healing } : {}),
    ...(guard !== null && guard > 0 ? { guard } : {}),
    manaSpent,
    critical: value.critical === true,
    ...(typeof value.skillId === "string" ? { skillId: value.skillId } : {}),
    ...(fumble ? { fumble } : {}),
    ...(satedRecovery ? { satedRecovery } : {})
  };
}

function parseTurnBasedSatedRecovery(
  value: unknown
): NonNullable<TurnBasedDuelState["lastAction"]>["satedRecovery"] | null {
  if (!isRecord(value)) {
    return null;
  }
  const hpRestored = parseNonNegativeInt(value.hpRestored);
  const manaRestored = parseNonNegativeInt(value.manaRestored);
  return hpRestored !== null && manaRestored !== null ? { hpRestored, manaRestored } : null;
}

function parsePlayerAbilityFumbleSummary(
  value: unknown
): NonNullable<TurnBasedDuelState["lastAction"]>["fumble"] | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    return null;
  }

  const abilityId = stringOrNull(value.abilityId);
  const line = stringOrNull(value.line);
  const selfDamage = parseNonNegativeInt(value.selfDamage);
  const enemyHealing = parseNonNegativeInt(value.enemyHealing);

  if (!abilityId || !line) {
    return null;
  }

  if (value.kind === "self-damage" && selfDamage !== null && selfDamage > 0) {
    return { abilityId, kind: "self-damage", line, selfDamage };
  }

  if (value.kind === "enemy-heal" && enemyHealing !== null) {
    return { abilityId, kind: "enemy-heal", line, enemyHealing };
  }

  return null;
}

function parseTurnBasedOutcome(value: unknown): TurnBasedDuelState["outcome"] | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    return null;
  }
  const outcome = value.outcome;
  const reason = value.reason;

  if (
    (outcome !== "challenger" && outcome !== "target" && outcome !== "draw") ||
    !isTerminalReason(reason)
  ) {
    return null;
  }

  return {
    outcome,
    winnerCharacterId: stringOrNull(value.winnerCharacterId),
    loserCharacterId: stringOrNull(value.loserCharacterId),
    reason
  };
}

function isTurnBasedSummaryAction(value: unknown): value is NonNullable<TurnBasedDuelState["lastAction"]>["action"] {
  return value === "attack" ||
    value === "defend" ||
    value === "skill" ||
    value === "race" ||
    value === "gear" ||
    value === "surrender" ||
    value === "timeout-attack";
}

function parseStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const result = value.filter((entry): entry is string =>
    typeof entry === "string" && entry.length > 0 && entry.length <= 128
  );

  return result.length === value.length ? result : null;
}

function parseGearAbility(value: unknown): CombatGearAbilityInput | null {
  if (!isRecord(value) || !isRecord(value.profile)) {
    return null;
  }

  const profile = value.profile;
  const id = stringOrNull(profile.id);
  const label = stringOrNull(profile.label);
  const description = stringOrNull(profile.description);
  const manaCost = parseNonNegativeInt(profile.manaCost);
  const cooldownOwnActions = parsePositiveInt(profile.cooldownOwnActions);
  const baseDamage = numberOrNull(profile.baseDamage);
  const multiplier = numberOrNull(profile.multiplier);
  const damageKind = parseDamageKind(profile.damageKind);
  const stat = parseStatKey(profile.stat);
  const primaryTargetScope = parseTargetScope(profile.primaryTargetScope);
  const secondaryTargetScope = hasOwn(profile, "secondaryTargetScope")
    ? parseTargetScope(profile.secondaryTargetScope)
    : undefined;
  const recipe = parseStringList(profile.recipe);
  const accuracyBonus = typeof profile.accuracyBonus === "number" ? profile.accuracyBonus : 0;
  const critBonus = typeof profile.critBonus === "number" ? profile.critBonus : 0;
  const monsterDamageReduction =
    typeof profile.monsterDamageReduction === "number" ? profile.monsterDamageReduction : 0;

  if (
    !id ||
    !label ||
    !description ||
    manaCost === null ||
    cooldownOwnActions === null ||
    baseDamage === null ||
    multiplier === null ||
    !damageKind ||
    !stat ||
    primaryTargetScope === null ||
    recipe === null ||
    secondaryTargetScope === null
  ) {
    return null;
  }

  const bleed = isRecord(value.bleed)
    ? {
        sourceAbilityId: stringOrNull(value.bleed.sourceAbilityId),
        damagePerActivation: parsePositiveInt(value.bleed.damagePerActivation),
        remainingHeroActivations: parsePositiveInt(value.bleed.remainingHeroActivations)
      }
    : null;

  return {
    profile: {
      id,
      label,
      description,
      manaCost,
      cooldownOwnActions,
      baseDamage,
      multiplier,
      damageKind,
      stat,
      accuracyBonus,
      critBonus,
      monsterDamageReduction,
      ...(primaryTargetScope ? { primaryTargetScope } : {}),
      ...(secondaryTargetScope ? { secondaryTargetScope } : {}),
      ...(typeof profile.guardReduction === "number" ? { guardReduction: profile.guardReduction } : {}),
      ...(typeof profile.healAmount === "number" ? { healAmount: profile.healAmount } : {}),
      ...(recipe.length > 0 ? { recipe: recipe as NonNullable<CombatSkillProfile["recipe"]> } : {})
    },
    ...(bleed?.sourceAbilityId && bleed.damagePerActivation !== null && bleed.remainingHeroActivations !== null
      ? {
          bleed: {
            sourceAbilityId: bleed.sourceAbilityId,
            damagePerActivation: bleed.damagePerActivation,
            remainingHeroActivations: bleed.remainingHeroActivations
          }
        }
      : {})
  };
}

function isTurnBasedSummaryOutcome(value: unknown): value is NonNullable<TurnBasedDuelState["lastAction"]>["outcome"] {
  return (
    value === "hit" ||
    value === "critical-hit" ||
    value === "miss" ||
    value === "defended" ||
    value === "not-enough-mana" ||
    value === "skill-on-cooldown" ||
    value === "critical-fumble" ||
    value === "won" ||
    value === "surrendered" ||
    value === "draw"
  );
}

function isTerminalReason(value: unknown): value is NonNullable<DuelResultPayload["terminalReason"]> {
  return value === "defeat" || value === "surrender" || value === "max-turns" || value === "expired";
}

function parseParticipants(value: unknown): DuelResultPayload["participants"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const challenger = parseParticipant(value.challenger);
  const target = parseParticipant(value.target);

  return challenger && target ? { challenger, target } : null;
}

function parseParticipant(value: unknown): DuelResultParticipantSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const characterId = stringOrNull(value.characterId);
  const displayName = stringOrNull(value.displayName);
  const activeCosmeticTitle = stringOrNull(value.activeCosmeticTitle);
  const title = stringOrNull(value.title);
  const raceId = stringOrNull(value.raceId);
  const raceName = stringOrNull(value.raceName);
  const classId = stringOrNull(value.classId);
  const className = stringOrNull(value.className);

  if (!characterId || !displayName || !title || !raceId || !raceName || !classId || !className) {
    return null;
  }

  return {
    characterId,
    displayName,
    ...(activeCosmeticTitle ? { activeCosmeticTitle } : {}),
    title,
    raceId,
    raceName,
    classId,
    className,
    level: Math.max(1, intOrZero(value.level)),
    remortCount: Math.max(0, intOrZero(value.remortCount))
  };
}

function parseAudit(value: unknown): DuelResultPayload["audit"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const challenger = parseBalanceAudit(value.challenger);
  const target = parseBalanceAudit(value.target);

  return challenger && target ? { challenger, target } : null;
}

function parseBalanceAudit(value: unknown): DuelResultBalanceAudit | null {
  if (!isRecord(value) || typeof value.balanceVersion !== "string") {
    return null;
  }

  const progressionBudget = parseProgressionBudget(value.progressionBudget);
  const targetProgressionBudget = parseProgressionBudget(value.targetProgressionBudget);

  if (!progressionBudget || !targetProgressionBudget) {
    return null;
  }

  return {
    balanceVersion: value.balanceVersion,
    originalLevel: intOrZero(value.originalLevel),
    originalRemortCount: intOrZero(value.originalRemortCount),
    effectiveCombatLevel: typeof value.effectiveCombatLevel === "number"
      ? Math.max(1, intOrZero(value.effectiveCombatLevel))
      : targetProgressionBudget.level,
    progressionBudget,
    targetProgressionBudget,
    temporaryHpMax: intOrZero(value.temporaryHpMax),
    temporaryManaMax: intOrZero(value.temporaryManaMax),
    temporaryStats: parseStats(value.temporaryStats) ?? parseLegacyPrimaryStat(
      value.primaryStat,
      value.temporaryPrimaryStat
    ),
    readinessPenalty: intOrZero(value.readinessPenalty),
    preparedScore: intOrZero(value.preparedScore)
  };
}

function parseProgressionBudget(value: unknown): DuelResultProgressionBudget | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    level: Math.max(1, intOrZero(value.level)),
    remortCount: Math.max(0, intOrZero(value.remortCount)),
    hpMax: intOrZero(value.hpMax),
    manaMax: intOrZero(value.manaMax),
    stats: parseStats(value.stats) ?? parseLegacyPrimaryStat(value.primaryStat, value.primaryStat),
    score: intOrZero(value.score)
  };
}

function parseStats(value: unknown): CharacterStats | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    strength: intOrZero(value.strength),
    dexterity: intOrZero(value.dexterity),
    intelligence: intOrZero(value.intelligence),
    charisma: intOrZero(value.charisma),
    luck: intOrZero(value.luck)
  };
}

function parseLegacyPrimaryStat(stat: unknown, bonus: unknown): CharacterStats {
  const stats = createEmptyStats();

  if (typeof stat === "string" && isStatKey(stat)) {
    stats[stat] = intOrZero(bonus);
  }

  return stats;
}

function isStatKey(value: string): value is StatKey {
  return (
    value === "strength" ||
    value === "dexterity" ||
    value === "intelligence" ||
    value === "charisma" ||
    value === "luck"
  );
}

function createEmptyStats(): CharacterStats {
  return {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    charisma: 0,
    luck: 0
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function intOrZero(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsePositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function parseNonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDamageKind(value: unknown) {
  return value === "physical" || value === "spell" || value === "social" || value === "trick"
    ? value
    : null;
}

function parseStatKey(value: unknown) {
  return value === "strength" ||
    value === "dexterity" ||
    value === "intelligence" ||
    value === "charisma" ||
    value === "luck"
    ? value
    : null;
}

function parseTargetScope(value: unknown) {
  return value === undefined
    ? undefined
    : value === "single-enemy" ||
        value === "all-enemies" ||
        value === "self" ||
        value === "lowest-hp-ally" ||
        value === "all-allies-including-self"
      ? value
      : null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
