import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  GUILD_GLORY_BOARD_PAGE_SIZE,
  GUILD_WEEKLY_ACHIEVEMENT_ID,
  GUILD_WEEKLY_GLORY_AWARD,
  GUILD_WEEKLY_GOAL_KEY,
  GUILD_WEEKLY_GOAL_TARGET,
  GUILD_WEEKLY_MINIMUM_GUILD_PARTICIPANTS,
  GUILD_WEEKLY_THIRTEEN_PERIODS_ACHIEVEMENT_ID,
  GUILD_WEEKLY_THREE_PERIODS_ACHIEVEMENT_ID,
  guildWeeklyReconciliationReasons,
  getGuildWeeklyPeriod,
  type GuildWeeklyReconciliationReason
} from "../../domain/guildWeeklyGoal";
import { parseGroupCombatSettlementPlanStrict } from "../../domain/groupCombat/groupCombatStateValidation";
import {
  GUILD_WEEKLY_NOTIFICATION_MAX_ATTEMPTS,
  type ClaimedGuildWeeklyAchievementNotification,
  type GuildWeeklyAchievementNotificationFailureResult,
  type GuildGloryBoardEntry,
  type GuildGloryBoardResult,
  type GuildGloryBoardView,
  type GuildWeeklyAchievementProjectionCandidate,
  type GuildWeeklyContributionResult,
  type GuildWeeklyGoalMetrics,
  type GuildWeeklyGoalProgressRecord,
  type GuildWeeklyGoalRepository,
  type GuildWeeklyGoalViewResult
} from "./guildWeeklyGoalRepository";

const WEEKLY_NOTIFICATION_CLAIM_MS = 93_000;

export class PrismaGuildWeeklyGoalRepository implements GuildWeeklyGoalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordEligibleTerminalSession(sessionId: string): Promise<GuildWeeklyContributionResult> {
    return this.recordEligibleTerminalSessionAttempt(sessionId, 0);
  }

  private async recordEligibleTerminalSessionAttempt(
    sessionId: string,
    uniqueConflictAttempt: number
  ): Promise<GuildWeeklyContributionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingDecision = await tx.guildWeeklyReconciliation.findUnique({
          where: { sessionId },
          select: { decision: true, reason: true, periodKey: true }
        });
        if (existingDecision) return replayDecision(tx, sessionId, existingDecision);

        const session = await tx.groupCombatSession.findUnique({
          where: { id: sessionId },
          select: {
            id: true,
            encounterKey: true,
            status: true,
            guildWeeklyGoalEligible: true,
            completedAt: true,
            settlementPlanJson: true,
            weeklyParticipantSnapshots: {
              orderBy: [{ rosterOrder: "asc" }, { id: "asc" }],
              select: { userId: true, characterId: true, remortCount: true }
            }
          }
        });
        if (!session) return { state: "not-found" as const };
        const periodKey = session.completedAt ? getGuildWeeklyPeriod(session.completedAt).key : null;
        const reject = async (reason: Exclude<GuildWeeklyReconciliationReason, "credited">) => {
          await createReconciliation(tx, session.id, "ineligible", reason, periodKey, session.completedAt ?? new Date());
          return { state: "ineligible" as const, reason, periodKey };
        };
        if (!session.guildWeeklyGoalEligible) return reject("feature-not-frozen");
        if (session.encounterKey !== "nyz-left-passage-party.v1") return reject("wrong-encounter");
        if (session.status !== "won") return reject("not-won");
        if (!session.completedAt) return reject("missing-completion");
        if (session.settlementPlanJson === null) return reject("missing-settlement-plan");

        let plan: ReturnType<typeof parseGroupCombatSettlementPlanStrict>;
        try {
          plan = parseGroupCombatSettlementPlanStrict(session.settlementPlanJson);
        } catch {
          return reject("invalid-settlement-plan");
        }
        if (plan.policy !== "left-passage-party" || plan.outcome !== "won") {
          return reject("wrong-settlement-policy");
        }
        const manualCharacterIds = new Set(plan.participants
          .filter((participant) => participant.manualParticipation ?? participant.contribution.committedActions > 0)
          .map((participant) => participant.characterId));
        const participants = session.weeklyParticipantSnapshots.filter((participant) =>
          manualCharacterIds.has(participant.characterId)
        );
        if (participants.length < GUILD_WEEKLY_MINIMUM_GUILD_PARTICIPANTS) {
          return reject("too-few-manual-participants");
        }
        if (participants.some((participant) => !participant.userId)) return reject("missing-user-snapshot");

        const memberships = await tx.guildMember.findMany({
          where: {
            userId: { in: participants.map((participant) => participant.userId) },
            joinedAt: { lte: session.completedAt },
            OR: [{ leftAt: null }, { leftAt: { gt: session.completedAt } }],
            guild: {
              activatedAt: { lte: session.completedAt },
              OR: [{ disbandedAt: null }, { disbandedAt: { gt: session.completedAt } }]
            }
          },
          select: {
            guildId: true,
            userId: true,
            guild: { select: { displayName: true, crest: true } }
          }
        });
        const grouped = new Map<string, Map<string, (typeof memberships)[number]>>();
        for (const membership of memberships) {
          const rows = grouped.get(membership.guildId) ?? new Map<string, (typeof memberships)[number]>();
          rows.set(membership.userId, membership);
          grouped.set(membership.guildId, rows);
        }
        const eligible = [...grouped.entries()]
          .map(([guildId, rows]) => [guildId, [...rows.values()]] as const)
          .filter(([, rows]) => rows.length >= GUILD_WEEKLY_MINIMUM_GUILD_PARTICIPANTS)
          .sort(([leftId, leftRows], [rightId, rightRows]) =>
            rightRows.length - leftRows.length || leftId.localeCompare(rightId)
          )[0];
        if (!eligible) return reject("no-eligible-guild");

        const [guildId, eligibleMemberships] = eligible;
        const guildSnapshot = eligibleMemberships[0]!.guild;
        const period = getGuildWeeklyPeriod(session.completedAt);
        const goal = await tx.guildWeeklyGoalPeriod.upsert({
          where: { guildId_periodKey_goalKey: { guildId, periodKey: period.key, goalKey: GUILD_WEEKLY_GOAL_KEY } },
          create: {
            id: randomUUID(),
            guildId,
            periodKey: period.key,
            goalKey: GUILD_WEEKLY_GOAL_KEY,
            guildNameSnapshot: guildSnapshot.displayName,
            guildCrestSnapshot: guildSnapshot.crest,
            targetCount: GUILD_WEEKLY_GOAL_TARGET,
            progressCount: 0
          },
          update: {},
          select: { id: true }
        });
        await tx.guildWeeklyContribution.create({
          data: {
            id: randomUUID(),
            periodId: goal.id,
            guildId,
            groupCombatSessionId: session.id,
            expeditionCompletedAt: session.completedAt,
            contributors: {
              create: eligibleMemberships.map((membership) => {
                const participant = participants.find((candidate) => candidate.userId === membership.userId)!;
                return {
                  id: randomUUID(),
                  userId: membership.userId,
                  characterId: participant.characterId,
                  remortCount: participant.remortCount
                };
              })
            }
          }
        });
        await createReconciliation(tx, session.id, "credited", "credited", period.key, session.completedAt);
        const justCompleted = await recomputeGuildWeeklyPeriodArtifacts(tx, goal.id);
        return {
          state: "recorded" as const,
          progress: await loadProgressByPeriodId(tx, goal.id),
          justCompleted
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const decision = await this.prisma.guildWeeklyReconciliation.findUnique({
        where: { sessionId },
        select: { decision: true, reason: true, periodKey: true }
      });
      if (decision) return replayDecision(this.prisma, sessionId, decision);
      if (uniqueConflictAttempt < 2) return this.recordEligibleTerminalSessionAttempt(sessionId, uniqueConflictAttempt + 1);
      throw error;
    }
  }

  async getCurrentForTelegramUser(telegramUserId: bigint, now: Date): Promise<GuildWeeklyGoalViewResult> {
    const viewer = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      select: {
        user: {
          select: {
            guildMemberships: {
              where: { leftAt: null, guild: { status: "active" } },
              take: 1,
              select: { guild: { select: { id: true, displayName: true, crest: true } } }
            }
          }
        }
      }
    });
    if (!viewer) return { state: "no-character" };
    const guild = viewer.user.guildMemberships[0]?.guild;
    if (!guild) return { state: "not-member" };
    const period = getGuildWeeklyPeriod(now);
    const row = await this.prisma.guildWeeklyGoalPeriod.findUnique({
      where: { guildId_periodKey_goalKey: { guildId: guild.id, periodKey: period.key, goalKey: GUILD_WEEKLY_GOAL_KEY } },
      select: { id: true }
    });
    return {
      state: "ready",
      progress: row
        ? await loadProgressByPeriodId(this.prisma, row.id)
        : await emptyProgress(this.prisma, guild, period.key)
    };
  }

  async getGloryBoardForTelegramUser(
    telegramUserId: bigint,
    expectedLocationId: string,
    now: Date,
    view: GuildGloryBoardView,
    requestedPage: number
  ): Promise<GuildGloryBoardResult> {
    const actor = await this.prisma.user.findUnique({
      where: { telegramUserId },
      select: {
        lastSeenLocationId: true,
        character: { select: { id: true } },
        guildMemberships: {
          where: { leftAt: null, guild: { status: "active", disbandedAt: null } },
          take: 1,
          select: { guildId: true }
        }
      }
    });
    if (!actor?.character) return { state: "no-character" };
    if (actor.lastSeenLocationId !== expectedLocationId) return { state: "wrong-location" };
    const viewerGuildId = actor.guildMemberships[0]?.guildId ?? null;

    const total = await this.prisma.guild.count({ where: { status: "active", disbandedAt: null } });
    const totalPages = Math.max(1, Math.ceil(total / GUILD_GLORY_BOARD_PAGE_SIZE));
    const page = Math.min(Math.max(0, Math.floor(requestedPage)), totalPages - 1);
    const periodKey = getGuildWeeklyPeriod(now).key;
    const rows = await loadBoardRows(
      this.prisma,
      view,
      periodKey,
      page * GUILD_GLORY_BOARD_PAGE_SIZE,
      GUILD_GLORY_BOARD_PAGE_SIZE
    );
    const viewerGuild = viewerGuildId
      ? (await loadBoardRows(this.prisma, view, periodKey, 0, 1, viewerGuildId))[0] ?? null
      : null;
    return {
      state: "ready",
      view,
      periodKey,
      rows: rows.map((row) => mapBoardRow(row, viewerGuildId)),
      viewerGuild: viewerGuild ? mapBoardRow(viewerGuild, viewerGuildId) : null,
      page,
      hasPreviousPage: page > 0,
      hasNextPage: page < totalPages - 1
    };
  }

  async listUnreconciledTerminalSessionIds(limit: number): Promise<string[]> {
    const rows = await this.prisma.groupCombatSession.findMany({
      where: {
        guildWeeklyGoalEligible: true,
        completedAt: { not: null },
        weeklyReconciliation: null
      },
      orderBy: [{ completedAt: "asc" }, { id: "asc" }],
      take: boundedLimit(limit),
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  async recomputePeriod(periodKey: string): Promise<number> {
    const periods = await this.prisma.guildWeeklyGoalPeriod.findMany({
      where: { periodKey, goalKey: GUILD_WEEKLY_GOAL_KEY },
      select: { id: true, progressCount: true, completedAt: true }
    });
    let repaired = 0;
    for (const period of periods) {
      const before = `${period.progressCount}:${period.completedAt?.toISOString() ?? ""}`;
      await this.prisma.$transaction(async (tx) => {
        await recomputeGuildWeeklyPeriodArtifacts(tx, period.id);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const after = await this.prisma.guildWeeklyGoalPeriod.findUniqueOrThrow({
        where: { id: period.id },
        select: { progressCount: true, completedAt: true }
      });
      if (before !== `${after.progressCount}:${after.completedAt?.toISOString() ?? ""}`) repaired += 1;
    }
    return repaired;
  }

  async completeCurrentForDev(telegramUserId: bigint, now: Date): Promise<GuildWeeklyGoalViewResult> {
    const current = await this.getCurrentForTelegramUser(telegramUserId, now);
    if (current.state !== "ready") return current;
    const user = await this.prisma.user.findUnique({ where: { telegramUserId }, select: { id: true } });
    if (!user) return { state: "no-character" };
    const periodId = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.guildWeeklyGoalPeriod.findUnique({
        where: {
          guildId_periodKey_goalKey: {
            guildId: current.progress.guildId,
            periodKey: current.progress.periodKey,
            goalKey: GUILD_WEEKLY_GOAL_KEY
          }
        },
        select: { id: true, devOverrideCompletedAt: true }
      });
      const period = existing ?? await tx.guildWeeklyGoalPeriod.create({
        data: {
          id: randomUUID(),
          guildId: current.progress.guildId,
          periodKey: current.progress.periodKey,
          goalKey: GUILD_WEEKLY_GOAL_KEY,
          guildNameSnapshot: current.progress.guildName,
          guildCrestSnapshot: current.progress.guildCrest,
          targetCount: GUILD_WEEKLY_GOAL_TARGET,
          progressCount: 0
        },
        select: { id: true, devOverrideCompletedAt: true }
      });
      if (!period.devOverrideCompletedAt) {
        await tx.guildWeeklyGoalPeriod.update({
          where: { id: period.id },
          data: { devOverrideCompletedAt: now, devOverrideUserId: user.id }
        });
      }
      await recomputeGuildWeeklyPeriodArtifacts(tx, period.id);
      return period.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { state: "ready", progress: await loadProgressByPeriodId(this.prisma, periodId) };
  }

  async listAchievementProjectionCandidates(
    limit: number,
    telegramUserId?: bigint
  ): Promise<GuildWeeklyAchievementProjectionCandidate[]> {
    const telegramFilter = telegramUserId === undefined
      ? Prisma.empty
      : Prisma.sql`AND user."telegram_user_id" = ${telegramUserId}`;
    const rows = await this.prisma.$queryRaw<ProjectionRow[]>(Prisma.sql`
      SELECT entitlement."id" AS entitlement_id,
             entitlement."achievement_id" AS achievement_id,
             entitlement."source_period_id" AS source_period_id,
             entitlement."source_period_key" AS source_period_key,
             entitlement."entitled_at" AS entitled_at,
             user."telegram_user_id" AS telegram_user_id,
             user."id" AS user_id,
             character."id" AS character_id,
             (SELECT COUNT(*) FROM "character_remorts" AS remort WHERE remort."character_id" = character."id") AS remort_count,
             character."name" AS character_name,
             character."class_id" AS class_id,
             character."race_id" AS race_id
      FROM "guild_weekly_achievement_entitlements" AS entitlement
      JOIN "users" AS user ON user."id" = entitlement."user_id"
      JOIN "characters" AS character ON character."user_id" = user."id"
      WHERE (
        entitlement."projected_character_id" IS NULL OR
        entitlement."projected_character_id" <> character."id" OR
        entitlement."projected_remort_count" IS NULL OR
        entitlement."projected_remort_count" <>
          (SELECT COUNT(*) FROM "character_remorts" AS remort WHERE remort."character_id" = character."id")
      )
      ${telegramFilter}
      ORDER BY entitlement."entitled_at" ASC, entitlement."id" ASC
      LIMIT ${boundedLimit(limit)}
    `);
    return rows.map(mapProjectionRow);
  }

  async markAchievementProjected(input: {
    entitlementId: string;
    characterId: string;
    remortCount: number;
    projectedAt: Date;
  }): Promise<boolean> {
    const result = await this.prisma.guildWeeklyAchievementEntitlement.updateMany({
      where: { id: input.entitlementId },
      data: {
        projectedCharacterId: input.characterId,
        projectedRemortCount: input.remortCount,
        projectedAt: input.projectedAt
      }
    });
    return result.count === 1;
  }

  async claimAchievementNotifications(input: {
    limit: number;
    now: Date;
    telegramUserId?: bigint;
  }): Promise<ClaimedGuildWeeklyAchievementNotification[]> {
    const telegramFilter = input.telegramUserId === undefined
      ? Prisma.empty
      : Prisma.sql`AND user."telegram_user_id" = ${input.telegramUserId}`;
    const candidates = await this.prisma.$queryRaw<NotificationProjectionRow[]>(Prisma.sql`
      SELECT entitlement."id" AS entitlement_id,
             entitlement."achievement_id" AS achievement_id,
             entitlement."source_period_id" AS source_period_id,
             entitlement."source_period_key" AS source_period_key,
             entitlement."entitled_at" AS entitled_at,
             user."telegram_user_id" AS telegram_user_id,
             user."id" AS user_id,
             character."id" AS character_id,
             (SELECT COUNT(*) FROM "character_remorts" AS remort WHERE remort."character_id" = character."id") AS remort_count,
             character."name" AS character_name,
             character."class_id" AS class_id,
             character."race_id" AS race_id,
             entitlement."notification_state" AS notification_state,
             entitlement."notification_attempt_count" AS notification_attempt_count
      FROM "guild_weekly_achievement_entitlements" AS entitlement
      JOIN "users" AS user ON user."id" = entitlement."user_id"
      JOIN "characters" AS character ON character."user_id" = user."id"
      WHERE entitlement."projected_character_id" = character."id"
        AND entitlement."notification_attempt_count" <= ${GUILD_WEEKLY_NOTIFICATION_MAX_ATTEMPTS}
        AND (
          (
            entitlement."notification_state" = 'PENDING'
            AND entitlement."notification_next_attempt_at" <= ${input.now}
            AND entitlement."notification_claim_token" IS NULL
          ) OR (
            entitlement."notification_state" = 'CLAIMED'
            AND entitlement."notification_claimed_until" <= ${input.now}
          )
        )
        ${telegramFilter}
      ORDER BY entitlement."notification_next_attempt_at" ASC,
               entitlement."entitled_at" ASC,
               entitlement."id" ASC
      LIMIT ${boundedLimit(input.limit)}
    `);
    const claimed: ClaimedGuildWeeklyAchievementNotification[] = [];
    for (const candidate of candidates) {
      if (Number(candidate.notification_attempt_count) >= GUILD_WEEKLY_NOTIFICATION_MAX_ATTEMPTS) {
        await this.prisma.guildWeeklyAchievementEntitlement.updateMany({
          where: {
            id: candidate.entitlement_id,
            notificationState: candidate.notification_state,
            notificationAttemptCount: Number(candidate.notification_attempt_count)
          },
          data: {
            notificationState: "PERMANENT_FAILURE",
            notificationPermanentFailureAt: input.now,
            notificationClaimToken: null,
            notificationClaimedUntil: null,
            notificationLastErrorCategory: "delivery-attempts-exhausted"
          }
        });
        continue;
      }
      const claimToken = randomUUID();
      const updated = await this.prisma.guildWeeklyAchievementEntitlement.updateMany({
        where: {
          id: candidate.entitlement_id,
          notificationState: candidate.notification_state,
          notificationAttemptCount: Number(candidate.notification_attempt_count),
          OR: [
            {
              notificationState: "PENDING",
              notificationNextAttemptAt: { lte: input.now },
              notificationClaimToken: null
            },
            {
              notificationState: "CLAIMED",
              notificationClaimedUntil: { lte: input.now }
            }
          ]
        },
        data: {
          notificationState: "CLAIMED",
          notificationAttemptCount: { increment: 1 },
          notificationClaimToken: claimToken,
          notificationClaimedUntil: new Date(input.now.getTime() + WEEKLY_NOTIFICATION_CLAIM_MS),
          notificationLastErrorCategory: null
        }
      });
      if (updated.count === 1) claimed.push({
        ...mapProjectionRow(candidate),
        claimToken,
        attemptCount: Number(candidate.notification_attempt_count) + 1
      });
    }
    return claimed;
  }

  async markAchievementNotificationSent(entitlementId: string, claimToken: string, sentAt: Date): Promise<boolean> {
    const result = await this.prisma.guildWeeklyAchievementEntitlement.updateMany({
      where: { id: entitlementId, notificationState: "CLAIMED", notificationClaimToken: claimToken },
      data: {
        notificationState: "SENT",
        notifiedAt: sentAt,
        notificationClaimToken: null,
        notificationClaimedUntil: null,
        notificationLastErrorCategory: null
      }
    });
    return result.count === 1;
  }

  async recordAchievementNotificationFailure(input: {
    entitlementId: string;
    claimToken: string;
    failedAt: Date;
    errorCategory: Parameters<GuildWeeklyGoalRepository["recordAchievementNotificationFailure"]>[0]["errorCategory"];
    disposition: "retry" | "permanent";
    nextAttemptAt?: Date;
  }): Promise<GuildWeeklyAchievementNotificationFailureResult> {
    if (input.disposition === "retry" && !input.nextAttemptAt) {
      throw new Error("Retryable weekly notification failure requires nextAttemptAt.");
    }
    const result = await this.prisma.guildWeeklyAchievementEntitlement.updateMany({
      where: {
        id: input.entitlementId,
        notificationState: "CLAIMED",
        notificationClaimToken: input.claimToken
      },
      data: input.disposition === "retry"
        ? {
            notificationState: "PENDING",
            notificationNextAttemptAt: input.nextAttemptAt!,
            notificationClaimToken: null,
            notificationClaimedUntil: null,
            notificationLastErrorCategory: input.errorCategory
          }
        : {
            notificationState: "PERMANENT_FAILURE",
            notificationPermanentFailureAt: input.failedAt,
            notificationClaimToken: null,
            notificationClaimedUntil: null,
            notificationLastErrorCategory: input.errorCategory
          }
    });
    return result.count !== 1
      ? "lost"
      : input.disposition === "retry"
        ? "retry-scheduled"
        : "permanent-failure";
  }

  async getMetrics(): Promise<GuildWeeklyGoalMetrics> {
    const [periodsStarted, periodsCompleted, expeditionReceipts, contributorReceipts,
      reconciliationGroups, gloryReceipts, achievementEntitlements, notificationGroups,
      projectedNotifications] = await Promise.all([
      this.prisma.guildWeeklyGoalPeriod.count(),
      this.prisma.guildWeeklyGoalPeriod.count({ where: { completedAt: { not: null } } }),
      this.prisma.guildWeeklyContribution.count(),
      this.prisma.guildWeeklyContributorReceipt.count(),
      this.prisma.guildWeeklyReconciliation.groupBy({
        by: ["decision", "reason"],
        _count: { _all: true }
      }),
      this.prisma.guildGloryReceipt.count(),
      this.prisma.guildWeeklyAchievementEntitlement.count(),
      this.prisma.guildWeeklyAchievementEntitlement.groupBy({
        by: ["notificationState"],
        _count: { _all: true }
      }),
      this.prisma.guildWeeklyAchievementEntitlement.count({ where: { projectedAt: { not: null } } })
    ]);
    const reconciliationCount = (decision: string) => reconciliationGroups
      .filter((row) => row.decision === decision)
      .reduce((sum, row) => sum + row._count._all, 0);
    const ineligibleByReason = Object.fromEntries(
      guildWeeklyReconciliationReasons
        .filter((reason) => reason !== "credited")
        .map((reason) => [
          reason,
          reconciliationGroups.find((row) => row.decision === "ineligible" && row.reason === reason)?._count._all ?? 0
        ])
    ) as GuildWeeklyGoalMetrics["reconciliations"]["ineligibleByReason"];
    const notificationCount = (state: string) => notificationGroups
      .find((row) => row.notificationState === state)?._count._all ?? 0;
    const credited = reconciliationCount("credited");
    const ineligible = reconciliationCount("ineligible");
    return { scope: "cumulative-current", periodsStarted, periodsCompleted, expeditionReceipts, contributorReceipts,
      reconciliationDecisions: credited + ineligible,
      reconciliations: { credited, ineligible, ineligibleByReason },
      gloryReceipts,
      achievementEntitlements,
      achievementNotifications: {
        pending: notificationCount("PENDING"),
        claimed: notificationCount("CLAIMED"),
        projected: projectedNotifications,
        sent: notificationCount("SENT"),
        permanentFailure: notificationCount("PERMANENT_FAILURE")
      }
    };
  }
}

type ProgressClient = PrismaClient | Prisma.TransactionClient;

async function replayDecision(
  client: ProgressClient,
  sessionId: string,
  decision: { decision: string; reason: string; periodKey: string | null }
): Promise<GuildWeeklyContributionResult> {
  if (decision.decision !== "credited") {
    return { state: "ineligible", reason: decision.reason, periodKey: decision.periodKey };
  }
  const contribution = await client.guildWeeklyContribution.findUnique({
    where: { groupCombatSessionId: sessionId }, select: { periodId: true }
  });
  if (!contribution) throw new Error(`Credited weekly reconciliation ${sessionId} has no receipt.`);
  return { state: "replayed", progress: await loadProgressByPeriodId(client, contribution.periodId), justCompleted: false };
}

async function createReconciliation(
  tx: Prisma.TransactionClient,
  sessionId: string,
  decision: "credited" | "ineligible",
  reason: GuildWeeklyReconciliationReason,
  periodKey: string | null,
  reconciledAt: Date
): Promise<void> {
  await tx.guildWeeklyReconciliation.create({
    data: { id: randomUUID(), sessionId, decision, reason, periodKey, reconciledAt }
  });
}

export async function recomputeGuildWeeklyPeriodArtifacts(
  tx: Prisma.TransactionClient,
  periodId: string
): Promise<boolean> {
  const period = await tx.guildWeeklyGoalPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: {
      id: true, guildId: true, periodKey: true, targetCount: true, completedAt: true,
      devOverrideCompletedAt: true, devOverrideUserId: true,
      guildNameSnapshot: true, guildCrestSnapshot: true,
      contributions: {
        orderBy: [{ expeditionCompletedAt: "asc" }, { id: "asc" }],
        select: { id: true, expeditionCompletedAt: true, contributors: { select: { userId: true } } }
      }
    }
  });
  const receiptCompletion = period.contributions.length >= period.targetCount
    ? period.contributions[period.targetCount - 1]!.expeditionCompletedAt
    : null;
  const canonicalCompletedAt = receiptCompletion ?? period.devOverrideCompletedAt;
  const progressCount = canonicalCompletedAt ? period.targetCount : Math.min(period.contributions.length, period.targetCount);
  const justCompleted = !period.completedAt && canonicalCompletedAt !== null;
  await tx.guildWeeklyGoalPeriod.update({ where: { id: period.id }, data: { progressCount, completedAt: canonicalCompletedAt } });
  if (!canonicalCompletedAt) {
    const pendingEntitlements = await tx.guildWeeklyAchievementEntitlement.findMany({
      where: { sourcePeriodId: period.id, projectedAt: null, notifiedAt: null },
      select: { userId: true }
    });
    await tx.guildWeeklyAchievementEntitlement.deleteMany({
      where: { sourcePeriodId: period.id, projectedAt: null, notifiedAt: null }
    });
    await tx.guildGloryReceipt.deleteMany({ where: { periodId: period.id } });
    await tx.activityEvent.deleteMany({ where: { dedupeKey: `guild.weekly_goal_completed:${period.id}` } });
    for (const userId of new Set(pendingEntitlements.map((row) => row.userId))) {
      await syncUserEntitlements(tx, userId);
    }
    return false;
  }
  await tx.guildGloryReceipt.upsert({
    where: { periodId: period.id },
    create: {
      id: randomUUID(), guildId: period.guildId, periodId: period.id,
      sourceKey: `guild-weekly-goal:${period.id}`, amount: GUILD_WEEKLY_GLORY_AWARD,
      awardedAt: canonicalCompletedAt
    },
    update: { awardedAt: canonicalCompletedAt }
  });
  await tx.activityEvent.upsert({
    where: { dedupeKey: `guild.weekly_goal_completed:${period.id}` },
    create: {
      eventType: "guild.weekly_goal_completed", category: "adventurer", severity: "normal",
      visibility: "public", subjectKind: "guild", subjectId: period.guildId,
      subjectName: period.guildNameSnapshot, sourceType: "guild-weekly-goal", sourceId: period.id,
      dedupeKey: `guild.weekly_goal_completed:${period.id}`,
      payloadJson: { crest: period.guildCrestSnapshot, periodKey: period.periodKey, glory: GUILD_WEEKLY_GLORY_AWARD },
      occurredAt: canonicalCompletedAt
    },
    update: { occurredAt: canonicalCompletedAt }
  });
  const contributorUsers = new Set(period.contributions.flatMap((row) => row.contributors.map((receipt) => receipt.userId)));
  if (period.devOverrideUserId) contributorUsers.add(period.devOverrideUserId);
  for (const userId of contributorUsers) await syncUserEntitlements(tx, userId);
  return justCompleted;
}

async function syncUserEntitlements(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const [receipts, devPeriods] = await Promise.all([
    tx.guildWeeklyContributorReceipt.findMany({
      where: { userId, contribution: { period: { completedAt: { not: null } } } },
      select: { contribution: { select: { period: { select: { id: true, periodKey: true, completedAt: true } } } } }
    }),
    tx.guildWeeklyGoalPeriod.findMany({
      where: { devOverrideUserId: userId, completedAt: { not: null } },
      select: { id: true, periodKey: true, completedAt: true }
    })
  ]);
  const periodsByKey = new Map<string, { id: string; periodKey: string; completedAt: Date }>();
  const rememberPeriod = (period: { id: string; periodKey: string; completedAt: Date }) => {
    const existing = periodsByKey.get(period.periodKey);
    if (
      !existing ||
      period.completedAt.getTime() < existing.completedAt.getTime() ||
      (
        period.completedAt.getTime() === existing.completedAt.getTime() &&
        period.id.localeCompare(existing.id) < 0
      )
    ) {
      periodsByKey.set(period.periodKey, period);
    }
  };
  for (const receipt of receipts) {
    const period = receipt.contribution.period;
    if (period.completedAt) rememberPeriod({ ...period, completedAt: period.completedAt });
  }
  for (const period of devPeriods) {
    if (period.completedAt) rememberPeriod({ ...period, completedAt: period.completedAt });
  }
  const ordered = [...periodsByKey.values()].sort((left, right) =>
    left.completedAt.getTime() - right.completedAt.getTime() || left.periodKey.localeCompare(right.periodKey) || left.id.localeCompare(right.id)
  );
  const thresholds = [
    [1, GUILD_WEEKLY_ACHIEVEMENT_ID],
    [3, GUILD_WEEKLY_THREE_PERIODS_ACHIEVEMENT_ID],
    [13, GUILD_WEEKLY_THIRTEEN_PERIODS_ACHIEVEMENT_ID]
  ] as const;
  for (const [threshold, achievementId] of thresholds) {
    const source = ordered[threshold - 1];
    if (!source) continue;
    await tx.guildWeeklyAchievementEntitlement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: {
        id: randomUUID(), userId, achievementId, sourcePeriodId: source.id,
        sourcePeriodKey: source.periodKey, entitledAt: source.completedAt,
        notificationNextAttemptAt: source.completedAt
      },
      update: {}
    });
  }
}

async function loadProgressByPeriodId(client: ProgressClient, periodId: string): Promise<GuildWeeklyGoalProgressRecord> {
  const row = await client.guildWeeklyGoalPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: {
      id: true, periodKey: true, progressCount: true, targetCount: true, completedAt: true,
      guild: { select: { id: true, displayName: true, crest: true } },
      contributions: {
        orderBy: [{ expeditionCompletedAt: "asc" }, { id: "asc" }],
        select: { contributors: { select: { userId: true } } }
      }
    }
  });
  const summary = await loadGuildSummary(client, row.guild.id, row.periodKey);
  return {
    guildId: row.guild.id, guildName: row.guild.displayName, guildCrest: row.guild.crest,
    periodId: row.id, periodKey: row.periodKey, progressCount: row.progressCount,
    targetCount: row.targetCount, completedAt: row.completedAt,
    contributorUserIds: [...new Set(row.contributions.flatMap((contribution) =>
      contribution.contributors.map((receipt) => receipt.userId)
    ))],
    gloryTotal: summary.glory, weeklyPlace: summary.place
  };
}

async function emptyProgress(
  client: ProgressClient,
  guild: { id: string; displayName: string; crest: string },
  periodKey: string
): Promise<GuildWeeklyGoalProgressRecord> {
  const summary = await loadGuildSummary(client, guild.id, periodKey);
  return {
    guildId: guild.id, guildName: guild.displayName, guildCrest: guild.crest,
    periodId: null, periodKey, progressCount: 0, targetCount: GUILD_WEEKLY_GOAL_TARGET,
    completedAt: null, contributorUserIds: [], gloryTotal: summary.glory, weeklyPlace: summary.place
  };
}

async function loadGuildSummary(client: ProgressClient, guildId: string, periodKey: string): Promise<{ glory: number; place: number }> {
  const glory = await loadBoardRows(client, "glory", periodKey, 0, 1, guildId);
  const primacy = await loadBoardRows(client, "primacy", periodKey, 0, 1, guildId);
  return { glory: Number(glory[0]?.glory ?? 0), place: Number(primacy[0]?.place ?? 1) };
}

interface BoardRow {
  guild_id: string;
  guild_name: string;
  guild_crest: string;
  glory: bigint | number;
  progress_count: bigint | number;
  target_count: bigint | number;
  completed_at: Date | string | null;
  place: bigint | number;
  row_order: bigint | number;
}

async function loadBoardRows(
  client: ProgressClient,
  view: GuildGloryBoardView,
  periodKey: string,
  offset: number,
  limit: number,
  guildId?: string
): Promise<BoardRow[]> {
  const rankOrder = view === "glory"
    ? Prisma.sql`glory DESC`
    : Prisma.sql`CASE WHEN completed_at IS NOT NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN completed_at IS NOT NULL THEN completed_at END ASC,
        CASE WHEN completed_at IS NULL THEN progress_count END DESC`;
  const rowOrder = view === "glory"
    ? Prisma.sql`glory DESC, normalized_name ASC, guild_id ASC`
    : Prisma.sql`CASE WHEN completed_at IS NOT NULL THEN 0 ELSE 1 END ASC,
        CASE WHEN completed_at IS NOT NULL THEN completed_at END ASC,
        CASE WHEN completed_at IS NULL THEN progress_count END DESC,
        normalized_name ASC, guild_id ASC`;
  const filter = guildId ? Prisma.sql`WHERE guild_id = ${guildId}` : Prisma.empty;
  return client.$queryRaw<BoardRow[]>(Prisma.sql`
    WITH board_source AS (
      SELECT guild."id" AS guild_id, guild."display_name" AS guild_name,
             guild."crest" AS guild_crest, guild."normalized_name" AS normalized_name,
             COALESCE(SUM(receipt."amount"), 0) AS glory,
             COALESCE(period."progress_count", 0) AS progress_count,
             COALESCE(period."target_count", ${GUILD_WEEKLY_GOAL_TARGET}) AS target_count,
             period."completed_at" AS completed_at
      FROM "guilds" AS guild
      LEFT JOIN "guild_glory_receipts" AS receipt ON receipt."guild_id" = guild."id"
      LEFT JOIN "guild_weekly_goal_periods" AS period
        ON period."guild_id" = guild."id" AND period."period_key" = ${periodKey}
       AND period."goal_key" = ${GUILD_WEEKLY_GOAL_KEY}
      WHERE guild."status" = 'active' AND guild."disbanded_at" IS NULL
      GROUP BY guild."id", guild."display_name", guild."crest", guild."normalized_name",
               period."progress_count", period."target_count", period."completed_at"
    ), ranked AS (
      SELECT *, DENSE_RANK() OVER (ORDER BY ${rankOrder}) AS place,
             ROW_NUMBER() OVER (ORDER BY ${rowOrder}) AS row_order
      FROM board_source
    )
    SELECT guild_id, guild_name, guild_crest, glory, progress_count, target_count,
           completed_at, place, row_order
    FROM ranked ${filter}
    ORDER BY row_order ASC
    LIMIT ${Math.max(1, limit)} OFFSET ${Math.max(0, offset)}
  `);
}

function mapBoardRow(row: BoardRow, viewerGuildId: string | null): GuildGloryBoardEntry {
  return {
    guildId: row.guild_id, guildName: row.guild_name, guildCrest: row.guild_crest,
    place: Number(row.place), glory: Number(row.glory), progressCount: Number(row.progress_count),
    targetCount: Number(row.target_count), completed: row.completed_at !== null,
    viewerGuild: row.guild_id === viewerGuildId
  };
}

interface ProjectionRow {
  entitlement_id: string;
  achievement_id: string;
  source_period_id: string;
  source_period_key: string;
  entitled_at: Date | string;
  telegram_user_id: bigint | number;
  user_id: string;
  character_id: string;
  remort_count: bigint | number;
  character_name: string;
  class_id: string;
  race_id: string;
}

interface NotificationProjectionRow extends ProjectionRow {
  notification_state: string;
  notification_attempt_count: bigint | number;
}

function mapProjectionRow(row: ProjectionRow): GuildWeeklyAchievementProjectionCandidate {
  return {
    entitlementId: row.entitlement_id, achievementId: row.achievement_id,
    sourcePeriodId: row.source_period_id, sourcePeriodKey: row.source_period_key,
    entitledAt: row.entitled_at instanceof Date ? row.entitled_at : new Date(row.entitled_at),
    telegramUserId: BigInt(row.telegram_user_id), userId: row.user_id,
    characterId: row.character_id, remortCount: Number(row.remort_count),
    characterName: row.character_name, classId: row.class_id, raceId: row.race_id
  };
}

function boundedLimit(limit: number): number {
  return Math.max(1, Math.min(93, Math.floor(limit)));
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
