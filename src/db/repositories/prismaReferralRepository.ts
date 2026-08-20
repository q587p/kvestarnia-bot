import { Prisma, type PrismaClient } from "@prisma/client";
import {
  REFERRAL_POLICY_V1,
  getReferralPolicy,
  type ReferralMilestoneKey,
  validateFrozenReferralReward
} from "../../domain/referral/referralPolicy";
import type { TelegramUserProfile } from "./userRepository";
import type {
  CaptureReferralResult,
  ClaimedReferralNotification,
  GrantReferralRewardResult,
  ReferralDashboardRecord,
  ReferralInviteCodeResult,
  ReferralInviteePage,
  ReferralInviteeRow,
  ReferralArrivalChronicleRecord,
  ReferralRepository,
  ResolvePendingReferralResult
} from "./referralRepository";
import { readLiveGuildCrest } from "./guildIdentityRead";
import { getAchievementDefinition } from "../../content/achievements";

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000
} as const;

export class PrismaReferralRepository implements ReferralRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreateInviteCode(
    telegramUserId: bigint,
    token: string,
    inviterNameSnapshot: string
  ): Promise<ReferralInviteCodeResult> {
    try {
      return await this.serializable(async (tx) => {
        const user = await tx.user.findUnique({
          where: { telegramUserId },
          select: {
            id: true,
            character: { select: { id: true } },
            referralInviteCode: {
              select: { token: true, inviterNameSnapshot: true }
            }
          }
        });
        if (!user) {
          return { state: "no-character" };
        }
        if (user.referralInviteCode) {
          return {
            state: "ready",
            token: user.referralInviteCode.token,
            inviterName: user.referralInviteCode.inviterNameSnapshot,
            hasCharacter: Boolean(user.character)
          };
        }
        if (!user.character) {
          return { state: "no-character" };
        }
        const created = await tx.referralInviteCode.create({
          data: { inviterUserId: user.id, token, inviterNameSnapshot },
          select: { token: true, inviterNameSnapshot: true }
        });
        return {
          state: "ready",
          token: created.token,
          inviterName: created.inviterNameSnapshot,
          hasCharacter: true
        };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const winner = await this.prisma.referralInviteCode.findFirst({
        where: { inviterUser: { telegramUserId } },
        select: {
          token: true,
          inviterNameSnapshot: true,
          inviterUser: { select: { character: { select: { id: true } } } }
        }
      });
      return winner
        ? {
            state: "ready",
            token: winner.token,
            inviterName: winner.inviterNameSnapshot,
            hasCharacter: Boolean(winner.inviterUser.character)
          }
        : { state: "token-collision" };
    }
  }

  async captureFreshReferral(
    player: TelegramUserProfile,
    token: string,
    now: Date,
    enabled: boolean,
    rewardPlanVersion: number
  ): Promise<CaptureReferralResult> {
    try {
      return await this.serializable(async (tx) => {
        const code = await tx.referralInviteCode.findUnique({
          where: { token },
          select: {
            id: true,
            inviterUserId: true,
            inviterNameSnapshot: true,
            inviterUser: { select: { telegramUserId: true } }
          }
        });
        if (!code) {
          return { state: "not-found" };
        }
        if (!enabled) {
          return { state: "disabled" };
        }
        if (code.inviterUser.telegramUserId === player.telegramUserId) {
          return { state: "self" };
        }
        const existingUser = await tx.user.findUnique({
          where: { telegramUserId: player.telegramUserId },
          select: {
            character: { select: { id: true } },
            referralAttributionReceived: {
              select: {
                id: true,
                status: true,
                inviteCode: { select: { inviterNameSnapshot: true } }
              }
            }
          }
        });
        if (existingUser) {
          return resolveExistingCapture(
            tx,
            existingUser.referralAttributionReceived,
            Boolean(existingUser.character),
            now,
            rewardPlanVersion
          );
        }
        const user = await tx.user.create({
          data: {
            telegramUserId: player.telegramUserId,
            username: player.username ?? null,
            displayName: player.displayName ?? null,
            languageCode: player.languageCode ?? null
          },
          select: { id: true }
        });
        const attribution = await tx.referralAttribution.create({
          data: {
            inviterUserId: code.inviterUserId,
            inviteeUserId: user.id,
            inviteCodeId: code.id,
            status: "ACCEPTED",
            capturedAt: now,
            acceptedAt: now,
            rewardPlanVersion
          },
          select: { id: true }
        });
        void attribution;
        return { state: "captured" };
      });
    } catch (error) {
      if (!isUniqueConflict(error) && !isWriteConflict(error)) {
        throw error;
      }
      return this.classifyCaptureAfterRace(player.telegramUserId);
    }
  }

  async resolvePendingReferral(
    telegramUserId: bigint,
    now: Date,
    rewardPlanVersion: number,
    foundationEnabled: boolean
  ): Promise<ResolvePendingReferralResult> {
    return this.serializable(async (tx) => {
      const user = await tx.user.findUnique({
        where: { telegramUserId },
        select: {
          character: { select: { id: true } },
          referralAttributionReceived: {
            select: {
              id: true,
              status: true
            }
          }
        }
      });
      const attribution = user?.referralAttributionReceived;
      if (!attribution) {
        return { state: "not-found" };
      }
      if (attribution.status === "ACCEPTED") {
        return { state: "already-accepted" };
      }
      if (attribution.status === "DECLINED") {
        return { state: "already-declined" };
      }
      if (!foundationEnabled || user?.character) {
        const updated = await tx.referralAttribution.updateMany({
          where: { id: attribution.id, status: "PENDING" },
          data: { status: "DECLINED", declinedAt: now }
        });
        if (updated.count !== 1) {
          return classifyResolvedPendingReferral(
            await tx.referralAttribution.findUnique({
              where: { id: attribution.id },
              select: { status: true }
            })
          );
        }
        return { state: user?.character ? "legacy-character" : "declined" };
      }
      const updated = await tx.referralAttribution.updateMany({
        where: { id: attribution.id, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedAt: now, rewardPlanVersion }
      });
      if (updated.count !== 1) {
        return classifyResolvedPendingReferral(
          await tx.referralAttribution.findUnique({
            where: { id: attribution.id },
            select: { status: true }
          })
        );
      }
      return { state: "accepted" };
    });
  }

  async getDashboard(
    telegramUserId: bigint,
    now = new Date()
  ): Promise<ReferralDashboardRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramUserId },
      select: {
        id: true,
        character: {
          select: {
            id: true,
            name: true,
            activeCosmeticTitleGrantId: true
          }
        },
        guildMemberships: {
          select: {
            leftAt: true,
            activeUserKey: true,
            guild: {
              select: {
                crest: true,
                status: true,
                charterExpiresAt: true,
                disbandedAt: true
              }
            }
          }
        },
        referralInviteCode: { select: { token: true, inviterNameSnapshot: true } }
      }
    });
    if (!user?.referralInviteCode) {
      return null;
    }
    const attributionWhere = {
      inviterUserId: user.id,
      status: "ACCEPTED",
      arrivedAt: { not: null }
    } satisfies Prisma.ReferralAttributionWhereInput;
    const rewardWhere = {
      beneficiaryUserId: user.id,
      attribution: attributionWhere
    } satisfies Prisma.ReferralRewardWhereInput;
    const [arrivedTotal, grantedStageTotal, pendingStageTotal, grouped] = await Promise.all([
      this.prisma.referralAttribution.count({ where: attributionWhere }),
      this.prisma.referralReward.count({ where: { ...rewardWhere, state: "GRANTED" } }),
      this.prisma.referralReward.count({ where: { ...rewardWhere, state: "PENDING" } }),
      this.prisma.referralReward.groupBy({
        by: ["milestoneKey"],
        where: rewardWhere,
        _count: { _all: true }
      })
    ]);
    const earnedByMilestone = emptyMilestoneCounts();
    for (const row of grouped) {
      if (isReferralMilestoneKey(row.milestoneKey)) {
        earnedByMilestone[row.milestoneKey] = row._count._all;
      }
    }
    const guildCrest = readLiveGuildCrest(user.guildMemberships, now);
    return {
      inviterUserId: user.id,
      token: user.referralInviteCode.token,
      inviterName: user.referralInviteCode.inviterNameSnapshot,
      inviterIdentity: {
        name: user.character?.name ?? user.referralInviteCode.inviterNameSnapshot,
        activeCosmeticTitleGrantId: user.character?.activeCosmeticTitleGrantId ?? null,
        ...(guildCrest ? { guildCrest } : {})
      },
      hasCharacter: Boolean(user.character),
      arrivedTotal,
      grantedStageTotal,
      pendingStageTotal,
      earnedByMilestone
    };
  }

  async listInvitees(
    telegramUserId: bigint,
    requestedPage: number,
    pageSize: number
  ): Promise<ReferralInviteePage | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramUserId },
      select: { id: true }
    });
    if (!user) {
      return null;
    }
    const where = {
      inviterUserId: user.id,
      status: "ACCEPTED",
      arrivedAt: { not: null }
    } satisfies Prisma.ReferralAttributionWhereInput;
    const totalCount = await this.prisma.referralAttribution.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = Math.min(totalPages - 1, Math.max(0, Math.floor(requestedPage)));
    const rows = await this.prisma.referralAttribution.findMany({
      where,
      orderBy: [{ acceptedAt: "asc" }, { id: "asc" }],
      skip: page * pageSize,
      take: pageSize,
      select: {
        id: true,
        inviteeUser: { select: { character: { select: { name: true, level: true } } } },
        rewards: { select: { milestoneKey: true, state: true } }
      }
    });
    return {
      rows: rows.map((row): ReferralInviteeRow => ({
        attributionId: row.id,
        name: row.inviteeUser.character?.name ?? null,
        level: row.inviteeUser.character?.level ?? null,
        stages: row.rewards.flatMap((reward) =>
          isReferralMilestoneKey(reward.milestoneKey) &&
          (reward.state === "PENDING" || reward.state === "GRANTED")
            ? [{ milestoneKey: reward.milestoneKey, state: reward.state }]
            : []
        )
      })),
      page,
      totalPages,
      totalCount
    };
  }

  async listDueRewardIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.referralReward.findMany({
      where: { state: "PENDING", nextAttemptAt: { lte: now } },
      orderBy: [{ nextAttemptAt: "asc" }, { earnedAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  async listPendingRewardIdsForTelegramUser(
    telegramUserId: bigint,
    limit: number
  ): Promise<string[]> {
    const rows = await this.prisma.referralReward.findMany({
      where: {
        state: "PENDING",
        beneficiaryUser: { telegramUserId }
      },
      orderBy: [{ earnedAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  async grantPendingReward(rewardId: string, now: Date): Promise<GrantReferralRewardResult> {
    try {
      return await this.serializable(async (tx) => {
        const reward = await tx.referralReward.findUnique({
          where: { id: rewardId },
          include: {
            beneficiaryUser: {
              select: {
                character: {
                  select: { id: true, gold: true, remorts: { select: { id: true } } }
                }
              }
            },
            attribution: {
              select: {
                inviteeUser: { select: { character: { select: { name: true } } } }
              }
            }
          }
        });
        if (!reward) {
          return { state: "not-found" };
        }
        if (reward.state === "GRANTED") {
          return { state: "already-granted" };
        }
        const validated = validateFrozenReferralReward(reward);
        if (!validated.ok) {
          await markRewardFailure(tx, reward.id, reward.deliveryAttemptCount, validated.code, now);
          return { state: "pending", code: validated.code };
        }
        const character = reward.beneficiaryUser.character;
        if (!character) {
          await markRewardFailure(tx, reward.id, reward.deliveryAttemptCount, "NO_CHARACTER", now);
          return { state: "pending", code: "NO_CHARACTER" };
        }
        const policy = getReferralPolicy(reward.rewardPlanVersion);
        const stage = policy?.stages.find((candidate) => candidate.key === reward.milestoneKey);
        if (!stage) {
          await markRewardFailure(tx, reward.id, reward.deliveryAttemptCount, "INVALID_BUNDLE", now);
          return { state: "pending", code: "INVALID_BUNDLE" };
        }
        const won = await tx.referralReward.updateMany({
          where: { id: reward.id, state: "PENDING" },
          data: {
            state: "GRANTED",
            grantedAt: now,
            grantedCharacterId: character.id,
            grantedRemortCount: character.remorts.length,
            deliveryAttemptCount: { increment: 1 },
            lastFailureCode: null
          }
        });
        if (won.count !== 1) {
          return { state: "already-granted" };
        }
        const updatedCharacter = await tx.character.update({
          where: { id: character.id },
          data: { gold: { increment: reward.rewardGold } },
          select: { gold: true }
        });
        for (const item of validated.items) {
          await tx.characterItem.upsert({
            where: { characterId_itemId: { characterId: character.id, itemId: item.itemId } },
            create: { characterId: character.id, itemId: item.itemId, quantity: item.quantity },
            update: { quantity: { increment: item.quantity } }
          });
        }
        const actualGrant = {
          gold: reward.rewardGold,
          balanceAfter: updatedCharacter.gold,
          items: validated.items
        };
        await tx.referralReward.update({
          where: { id: reward.id },
          data: { actualGrantJson: actualGrant }
        });
        await tx.referralNotificationOutbox.create({
          data: {
            logicalKey: `REFERRAL_PAYOUT_GRANTED:${reward.id}`,
            kind: "REFERRAL_PAYOUT_GRANTED",
            recipientUserId: reward.beneficiaryUserId,
            payloadJson: {
              rewardId: reward.id,
              inviteeName: reward.attribution.inviteeUser.character?.name ?? null,
              milestoneKey: reward.milestoneKey,
              level: stage.level,
              gold: reward.rewardGold,
              items: validated.items
            },
            state: "PENDING",
            nextAttemptAt: now
          }
        });
        return {
          state: "granted",
          grant: {
            rewardId: reward.id,
            characterId: character.id,
            inviteeName: reward.attribution.inviteeUser.character?.name ?? null,
            milestoneKey: stage.key,
            level: stage.level,
            gold: reward.rewardGold,
            balanceAfter: updatedCharacter.gold,
            items: validated.items,
            grantedAt: now
          }
        };
      });
    } catch (error) {
      if (isWriteConflict(error)) {
        await this.markTransientRewardFailure(rewardId, now);
        return { state: "pending", code: "TRANSIENT" };
      }
      throw error;
    }
  }

  async claimDueNotification(
    now: Date,
    claimToken: string,
    leaseUntil: Date,
    payoutsEnabled: boolean
  ): Promise<ClaimedReferralNotification | null> {
    return this.serializable(async (tx) => {
      const kindWhere = payoutsEnabled
        ? {}
        : { kind: { in: ["REFERRAL_JOINED", "REFERRAL_ACHIEVEMENT_UNLOCKED"] } };
      const dueWhere = {
        ...kindWhere,
        OR: [
          { state: "PENDING", nextAttemptAt: { lte: now } },
          { state: "PROCESSING", claimedUntil: { lte: now } }
        ]
      } satisfies Prisma.ReferralNotificationOutboxWhereInput;
      const row = await tx.referralNotificationOutbox.findFirst({
        where: dueWhere,
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true }
      });
      if (!row) {
        return null;
      }
      const claimed = await tx.referralNotificationOutbox.updateMany({
        where: { id: row.id, ...dueWhere },
        data: {
          state: "PROCESSING",
          claimToken,
          claimedUntil: leaseUntil,
          attemptCount: { increment: 1 }
        }
      });
      if (claimed.count !== 1) {
        return null;
      }
      const current = await tx.referralNotificationOutbox.findUnique({
        where: { id: row.id },
        select: {
          id: true,
          claimToken: true,
          kind: true,
          payloadJson: true,
          attemptCount: true,
          recipientUser: { select: { telegramUserId: true } }
        }
      });
      if (
        !current?.claimToken ||
        current.kind !== "REFERRAL_JOINED" &&
        current.kind !== "REFERRAL_PAYOUT_GRANTED" &&
        current.kind !== "REFERRAL_ACHIEVEMENT_UNLOCKED"
      ) {
        return null;
      }
      return {
        id: current.id,
        claimToken: current.claimToken,
        kind: current.kind,
        telegramUserId: current.recipientUser.telegramUserId,
        payload: current.payloadJson,
        attemptCount: current.attemptCount
      };
    });
  }

  async markNotificationSent(id: string, claimToken: string, sentAt: Date): Promise<boolean> {
    const result = await this.prisma.referralNotificationOutbox.updateMany({
      where: { id, state: "PROCESSING", claimToken },
      data: {
        state: "SENT",
        sentAt,
        claimToken: null,
        claimedUntil: null
      }
    });
    return result.count === 1;
  }

  async rescheduleNotification(
    id: string,
    claimToken: string,
    nextAttemptAt: Date
  ): Promise<boolean> {
    const result = await this.prisma.referralNotificationOutbox.updateMany({
      where: { id, state: "PROCESSING", claimToken },
      data: {
        state: "PENDING",
        nextAttemptAt,
        claimToken: null,
        claimedUntil: null
      }
    });
    return result.count === 1;
  }

  async countRewardStatesForTelegramUser(
    telegramUserId: bigint
  ): Promise<{ pending: number; granted: number }> {
    const [pending, granted] = await Promise.all([
      this.prisma.referralReward.count({
        where: { beneficiaryUser: { telegramUserId }, state: "PENDING" }
      }),
      this.prisma.referralReward.count({
        where: { beneficiaryUser: { telegramUserId }, state: "GRANTED" }
      })
    ]);
    return { pending, granted };
  }

  private async classifyCaptureAfterRace(
    telegramUserId: bigint
  ): Promise<CaptureReferralResult> {
    const user = await this.prisma.user.findUnique({
      where: { telegramUserId },
      select: {
        referralAttributionReceived: {
          select: {
            id: true,
            status: true,
            inviteCode: { select: { inviterNameSnapshot: true } }
          }
        }
      }
    });
    return user ? existingCaptureResult(user.referralAttributionReceived) : { state: "retry" };
  }

  async listUnrecordedArrivalChronicles(limit: number): Promise<ReferralArrivalChronicleRecord[]> {
    const rows = await this.prisma.referralAttribution.findMany({
      where: {
        status: "ACCEPTED",
        arrivedAt: { not: null },
        arrivedCharacterId: { not: null },
        inviteeNameSnapshot: { not: null },
        chronicleRecordedAt: null
      },
      orderBy: [{ arrivedAt: "asc" }, { id: "asc" }],
      take: limit,
      select: {
        id: true,
        arrivedAt: true,
        arrivedCharacterId: true,
        inviteeNameSnapshot: true,
        inviterUserId: true,
        inviteCode: { select: { inviterNameSnapshot: true } }
      }
    });
    return rows.map((row) => ({
      attributionId: row.id,
      characterId: row.arrivedCharacterId!,
      inviteeName: row.inviteeNameSnapshot!,
      inviterUserId: row.inviterUserId,
      inviterName: row.inviteCode.inviterNameSnapshot,
      arrivedAt: row.arrivedAt!
    }));
  }

  async markArrivalChronicleRecorded(
    attributionId: string,
    characterId: string,
    recordedAt: Date
  ): Promise<boolean> {
    const result = await this.prisma.referralAttribution.updateMany({
      where: { id: attributionId, arrivedCharacterId: characterId, chronicleRecordedAt: null },
      data: { chronicleRecordedAt: recordedAt }
    });
    return result.count === 1;
  }

  countArrivedForInviterUserId(inviterUserId: string): Promise<number> {
    return this.prisma.referralAttribution.count({
      where: { inviterUserId, status: "ACCEPTED", arrivedAt: { not: null } }
    });
  }

  async enqueueReferralAchievementNotifications(
    inviterUserId: string,
    achievementIds: readonly string[],
    now: Date
  ): Promise<number> {
    const character = await this.prisma.character.findUnique({
      where: { userId: inviterUserId },
      select: {
        id: true,
        achievements: {
          where: { achievementId: { in: [...achievementIds] } },
          select: { achievementId: true }
        }
      }
    });
    if (!character) {
      return 0;
    }
    let created = 0;
    for (const achievement of character.achievements) {
      const definition = getAchievementDefinition(achievement.achievementId);
      if (!definition) {
        continue;
      }
      try {
        await this.prisma.referralNotificationOutbox.create({
          data: {
            logicalKey: `REFERRAL_ACHIEVEMENT:${character.id}:${achievement.achievementId}`,
            kind: "REFERRAL_ACHIEVEMENT_UNLOCKED",
            recipientUserId: inviterUserId,
            payloadJson: { achievementId: achievement.achievementId, title: definition.title },
            state: "PENDING",
            nextAttemptAt: now
          }
        });
        created += 1;
      } catch (error) {
        if (!isUniqueConflict(error)) {
          throw error;
        }
      }
    }
    return created;
  }

  reschedulePendingReward(rewardId: string, now: Date): Promise<void> {
    return this.markTransientRewardFailure(rewardId, now);
  }

  private async markTransientRewardFailure(rewardId: string, now: Date): Promise<void> {
    const reward = await this.prisma.referralReward.findUnique({
      where: { id: rewardId },
      select: { deliveryAttemptCount: true, state: true }
    });
    if (!reward || reward.state !== "PENDING") {
      return;
    }
    await this.prisma.referralReward.updateMany({
      where: { id: rewardId, state: "PENDING" },
      data: {
        deliveryAttemptCount: { increment: 1 },
        lastFailureCode: "TRANSIENT",
        nextAttemptAt: rewardBackoffAt(now, reward.deliveryAttemptCount)
      }
    });
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, TRANSACTION_OPTIONS);
      } catch (error) {
        if (!isWriteConflict(error) || attempt === 2) {
          throw error;
        }
      }
    }
    throw new Error("Referral transaction retry loop exhausted unexpectedly.");
  }
}

function existingCaptureResult(
  attribution:
    | { id: string; status: string; inviteCode: { inviterNameSnapshot: string } }
    | null
): CaptureReferralResult {
  if (!attribution) {
    return { state: "existing-user" };
  }
  if (attribution.status === "PENDING") {
    return { state: "pending" };
  }
  return attribution.status === "ACCEPTED" ? { state: "accepted" } : { state: "declined" };
}

async function resolveExistingCapture(
  tx: Prisma.TransactionClient,
  attribution: { id: string; status: string; inviteCode: { inviterNameSnapshot: string } } | null,
  hasCharacter: boolean,
  now: Date,
  rewardPlanVersion: number
): Promise<CaptureReferralResult> {
  if (!attribution || attribution.status !== "PENDING") {
    return existingCaptureResult(attribution);
  }
  if (hasCharacter) {
    const updated = await tx.referralAttribution.updateMany({
      where: { id: attribution.id, status: "PENDING" },
      data: { status: "DECLINED", declinedAt: now }
    });
    if (updated.count === 1) {
      return { state: "existing-user" };
    }
    return classifyExistingCapture(
      await tx.referralAttribution.findUnique({
        where: { id: attribution.id },
        select: { status: true }
      }),
      true
    );
  }
  const updated = await tx.referralAttribution.updateMany({
    where: { id: attribution.id, status: "PENDING" },
    data: { status: "ACCEPTED", acceptedAt: now, rewardPlanVersion }
  });
  if (updated.count === 1) {
    return { state: "accepted" };
  }
  return classifyExistingCapture(
    await tx.referralAttribution.findUnique({
      where: { id: attribution.id },
      select: { status: true }
    }),
    false
  );
}

function classifyResolvedPendingReferral(
  attribution: { status: string } | null
): ResolvePendingReferralResult {
  if (!attribution) {
    return { state: "not-found" };
  }
  return attribution.status === "ACCEPTED"
    ? { state: "already-accepted" }
    : attribution.status === "DECLINED"
      ? { state: "already-declined" }
      : { state: "not-found" };
}

function classifyExistingCapture(
  attribution: { status: string } | null,
  hasCharacter: boolean
): CaptureReferralResult {
  if (!attribution) {
    return hasCharacter ? { state: "existing-user" } : { state: "retry" };
  }
  if (attribution.status === "ACCEPTED") {
    return { state: "accepted" };
  }
  if (attribution.status === "DECLINED") {
    return { state: "declined" };
  }
  return hasCharacter ? { state: "existing-user" } : { state: "retry" };
}

async function markRewardFailure(
  tx: Prisma.TransactionClient,
  rewardId: string,
  attemptCount: number,
  code: string,
  now: Date
): Promise<void> {
  await tx.referralReward.updateMany({
    where: { id: rewardId, state: "PENDING" },
    data: {
      deliveryAttemptCount: { increment: 1 },
      lastFailureCode: code,
      nextAttemptAt: rewardBackoffAt(now, attemptCount)
    }
  });
}

function rewardBackoffAt(now: Date, attemptCount: number): Date {
  const minutes = Math.min(93, 2 ** Math.min(6, Math.max(0, attemptCount)));
  return new Date(now.getTime() + minutes * 60_000);
}

function emptyMilestoneCounts(): Record<ReferralMilestoneKey, number> {
  return { LEVEL_3: 0, LEVEL_5: 0, LEVEL_8: 0, LEVEL_13: 0 };
}

function isReferralMilestoneKey(value: string): value is ReferralMilestoneKey {
  return REFERRAL_POLICY_V1.stages.some((stage) => stage.key === value);
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
