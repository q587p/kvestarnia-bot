import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  GUILD_WEEKLY_GOAL_KEY,
  GUILD_WEEKLY_GOAL_TARGET,
  GUILD_WEEKLY_MINIMUM_GUILD_PARTICIPANTS,
  getGuildWeeklyPeriod
} from "../../domain/guildWeeklyGoal";
import { parseGroupCombatSettlementPlanStrict } from "../../domain/groupCombat/groupCombatStateValidation";
import type {
  GuildWeeklyContributionResult,
  GuildWeeklyGoalMetrics,
  GuildWeeklyGoalProgressRecord,
  GuildWeeklyGoalRepository,
  GuildWeeklyGoalViewResult
} from "./guildWeeklyGoalRepository";

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
        const existing = await tx.guildWeeklyContribution.findUnique({
          where: { groupCombatSessionId: sessionId },
          select: { periodId: true }
        });
        if (existing) {
          return {
            state: "replayed" as const,
            progress: await loadProgressByPeriodId(tx, existing.periodId),
            justCompleted: false
          };
        }

        const session = await tx.groupCombatSession.findUnique({
          where: { id: sessionId },
          select: {
            id: true,
            encounterKey: true,
            status: true,
            guildWeeklyGoalEligible: true,
            completedAt: true,
            settlementPlanJson: true,
            participants: {
              select: {
                characterId: true,
                remortCount: true,
                character: { select: { userId: true } }
              }
            }
          }
        });
        if (!session) return { state: "not-found" as const };
        if (
          !session.guildWeeklyGoalEligible ||
          session.encounterKey !== "nyz-left-passage-party.v1" ||
          session.status !== "won" ||
          !session.completedAt ||
          session.settlementPlanJson === null
        ) {
          return { state: "ineligible" as const };
        }
        const plan = parseGroupCombatSettlementPlanStrict(session.settlementPlanJson);
        if (plan.policy !== "left-passage-party" || plan.outcome !== "won") {
          return { state: "ineligible" as const };
        }
        const manualCharacterIds = new Set(plan.participants
          .filter((participant) => participant.manualParticipation ?? participant.contribution.committedActions > 0)
          .map((participant) => participant.characterId));
        const participants = session.participants.filter((participant) => manualCharacterIds.has(participant.characterId));
        if (participants.length < GUILD_WEEKLY_MINIMUM_GUILD_PARTICIPANTS) {
          return { state: "ineligible" as const };
        }

        const memberships = await tx.guildMember.findMany({
          where: {
            userId: { in: participants.map((participant) => participant.character.userId) },
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
          const guildMemberships = grouped.get(membership.guildId) ??
            new Map<string, (typeof memberships)[number]>();
          guildMemberships.set(membership.userId, membership);
          grouped.set(membership.guildId, guildMemberships);
        }
        const eligible = [...grouped.entries()]
          .map(([candidateGuildId, rows]) => [candidateGuildId, [...rows.values()]] as const)
          .filter(([, rows]) => rows.length >= GUILD_WEEKLY_MINIMUM_GUILD_PARTICIPANTS)
          .sort(([leftId, leftRows], [rightId, rightRows]) => rightRows.length - leftRows.length || leftId.localeCompare(rightId))[0];
        if (!eligible) return { state: "ineligible" as const };
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
          select: {
            id: true,
            completedAt: true,
            guildNameSnapshot: true,
            guildCrestSnapshot: true
          }
        });
        const contributionId = randomUUID();
        await tx.guildWeeklyContribution.create({
          data: {
            id: contributionId,
            periodId: goal.id,
            guildId,
            groupCombatSessionId: session.id,
            expeditionCompletedAt: session.completedAt,
            contributors: {
              create: eligibleMemberships.map((membership) => {
                const participant = participants.find((candidate) => candidate.character.userId === membership.userId)!;
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
        const contributions = await tx.guildWeeklyContribution.findMany({
          where: { periodId: goal.id },
          orderBy: [{ expeditionCompletedAt: "asc" }, { id: "asc" }],
          select: { expeditionCompletedAt: true }
        });
        const canonicalCompletedAt = contributions.length >= GUILD_WEEKLY_GOAL_TARGET
          ? contributions[GUILD_WEEKLY_GOAL_TARGET - 1]!.expeditionCompletedAt
          : null;
        await tx.guildWeeklyGoalPeriod.update({
          where: { id: goal.id },
          data: {
            progressCount: Math.min(contributions.length, GUILD_WEEKLY_GOAL_TARGET),
            completedAt: canonicalCompletedAt
          }
        });
        const justCompleted = !goal.completedAt && canonicalCompletedAt !== null;
        if (canonicalCompletedAt) {
          await tx.activityEvent.upsert({
            where: { dedupeKey: `guild.weekly_goal_completed:${goal.id}` },
            create: {
                eventType: "guild.weekly_goal_completed",
                category: "adventurer",
                severity: "high",
                visibility: "public",
                subjectKind: "guild",
                subjectId: guildId,
                subjectName: goal.guildNameSnapshot,
                sourceType: "guild-weekly-goal",
                sourceId: goal.id,
                dedupeKey: `guild.weekly_goal_completed:${goal.id}`,
                payloadJson: { crest: goal.guildCrestSnapshot, periodKey: period.key },
                occurredAt: canonicalCompletedAt
            },
            update: { occurredAt: canonicalCompletedAt }
          });
        }
        return {
          state: "recorded" as const,
          progress: await loadProgressByPeriodId(tx, goal.id),
          justCompleted
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const existing = await this.prisma.guildWeeklyContribution.findUnique({
        where: { groupCombatSessionId: sessionId },
        select: { periodId: true }
      });
      if (existing) {
        return {
          state: "replayed",
          progress: await loadProgressByPeriodId(this.prisma, existing.periodId),
          justCompleted: false
        };
      }
      if (uniqueConflictAttempt < 2) {
        return this.recordEligibleTerminalSessionAttempt(sessionId, uniqueConflictAttempt + 1);
      }
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
        : emptyProgress(guild, period.key)
    };
  }

  async listUnrecordedEligibleSessionIds(startsAt: Date, endsAt: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.groupCombatSession.findMany({
      where: {
        guildWeeklyGoalEligible: true,
        status: "won",
        completedAt: { gte: startsAt, lt: endsAt },
        weeklyContribution: null
      },
      orderBy: [{ completedAt: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.min(93, Math.floor(limit))),
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  async recomputePeriod(periodKey: string): Promise<number> {
    const periods = await this.prisma.guildWeeklyGoalPeriod.findMany({
      where: { periodKey, goalKey: GUILD_WEEKLY_GOAL_KEY },
      select: {
        id: true,
        targetCount: true,
        progressCount: true,
        completedAt: true,
        guildId: true,
        guildNameSnapshot: true,
        guildCrestSnapshot: true
      }
    });
    let repaired = 0;
    for (const period of periods) {
      const contributions = await this.prisma.guildWeeklyContribution.findMany({
        where: { periodId: period.id },
        orderBy: [{ expeditionCompletedAt: "asc" }, { id: "asc" }],
        select: { expeditionCompletedAt: true }
      });
      const count = Math.min(contributions.length, period.targetCount);
      const shouldComplete = contributions.length >= period.targetCount;
      const canonicalCompletedAt = shouldComplete
        ? contributions[period.targetCount - 1]!.expeditionCompletedAt
        : null;
      const needsRepair = period.progressCount !== count ||
        (period.completedAt?.getTime() ?? null) !== (canonicalCompletedAt?.getTime() ?? null);
      if (needsRepair) {
        await this.prisma.guildWeeklyGoalPeriod.update({
          where: { id: period.id },
          data: { progressCount: count, completedAt: canonicalCompletedAt }
        });
        repaired += 1;
      }
      if (canonicalCompletedAt) {
        await this.prisma.activityEvent.upsert({
          where: { dedupeKey: `guild.weekly_goal_completed:${period.id}` },
          create: {
            eventType: "guild.weekly_goal_completed",
            category: "adventurer",
            severity: "high",
            visibility: "public",
            subjectKind: "guild",
            subjectId: period.guildId,
            subjectName: period.guildNameSnapshot,
            sourceType: "guild-weekly-goal",
            sourceId: period.id,
            dedupeKey: `guild.weekly_goal_completed:${period.id}`,
            payloadJson: { crest: period.guildCrestSnapshot, periodKey },
            occurredAt: canonicalCompletedAt
          },
          update: { occurredAt: canonicalCompletedAt }
        });
      } else {
        await this.prisma.activityEvent.deleteMany({
          where: { dedupeKey: `guild.weekly_goal_completed:${period.id}` }
        });
      }
    }
    return repaired;
  }

  async completeCurrentForDev(telegramUserId: bigint, now: Date): Promise<GuildWeeklyGoalViewResult> {
    const current = await this.getCurrentForTelegramUser(telegramUserId, now);
    if (current.state !== "ready") return current;
    if (current.progress.completedAt) return current;
    const period = await this.prisma.guildWeeklyGoalPeriod.upsert({
      where: {
        guildId_periodKey_goalKey: {
          guildId: current.progress.guildId,
          periodKey: current.progress.periodKey,
          goalKey: GUILD_WEEKLY_GOAL_KEY
        }
      },
      create: {
        id: randomUUID(),
        guildId: current.progress.guildId,
        periodKey: current.progress.periodKey,
        goalKey: GUILD_WEEKLY_GOAL_KEY,
        guildNameSnapshot: current.progress.guildName,
        guildCrestSnapshot: current.progress.guildCrest,
        targetCount: GUILD_WEEKLY_GOAL_TARGET,
        progressCount: GUILD_WEEKLY_GOAL_TARGET,
        completedAt: now
      },
      update: { progressCount: GUILD_WEEKLY_GOAL_TARGET, completedAt: now },
      select: { id: true, guildNameSnapshot: true, guildCrestSnapshot: true }
    });
    await this.prisma.activityEvent.upsert({
      where: { dedupeKey: `guild.weekly_goal_completed:${period.id}` },
      create: {
        eventType: "guild.weekly_goal_completed",
        category: "adventurer",
        severity: "high",
        visibility: "public",
        subjectKind: "guild",
        subjectId: current.progress.guildId,
        subjectName: period.guildNameSnapshot,
        sourceType: "guild-weekly-goal",
        sourceId: period.id,
        dedupeKey: `guild.weekly_goal_completed:${period.id}`,
        payloadJson: {
          crest: period.guildCrestSnapshot,
          periodKey: current.progress.periodKey
        },
        occurredAt: now
      },
      update: {}
    });
    return { state: "ready", progress: await loadProgressByPeriodId(this.prisma, period.id) };
  }

  async getMetrics(): Promise<GuildWeeklyGoalMetrics> {
    const [periodsStarted, periodsCompleted, expeditionReceipts, contributorReceipts] = await Promise.all([
      this.prisma.guildWeeklyGoalPeriod.count(),
      this.prisma.guildWeeklyGoalPeriod.count({ where: { completedAt: { not: null } } }),
      this.prisma.guildWeeklyContribution.count(),
      this.prisma.guildWeeklyContributorReceipt.count()
    ]);
    return { periodsStarted, periodsCompleted, expeditionReceipts, contributorReceipts };
  }
}

type ProgressClient = Pick<PrismaClient, "guildWeeklyGoalPeriod"> | Prisma.TransactionClient;

async function loadProgressByPeriodId(client: ProgressClient, periodId: string): Promise<GuildWeeklyGoalProgressRecord> {
  const row = await client.guildWeeklyGoalPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: {
      id: true,
      periodKey: true,
      progressCount: true,
      targetCount: true,
      completedAt: true,
      guild: { select: { id: true, displayName: true, crest: true } },
      contributions: {
        orderBy: [{ expeditionCompletedAt: "asc" }, { id: "asc" }],
        select: { contributors: { select: { userId: true, characterId: true } } }
      }
    }
  });
  const achievementCharacterByUser = new Map<string, string>();
  for (const contribution of row.contributions.slice(0, row.targetCount)) {
    for (const receipt of contribution.contributors) {
      achievementCharacterByUser.set(receipt.userId, receipt.characterId);
    }
  }
  return {
    guildId: row.guild.id,
    guildName: row.guild.displayName,
    guildCrest: row.guild.crest,
    periodId: row.id,
    periodKey: row.periodKey,
    progressCount: row.progressCount,
    targetCount: row.targetCount,
    completedAt: row.completedAt,
    contributorCharacterIds: [...achievementCharacterByUser.values()]
  };
}

function emptyProgress(
  guild: { id: string; displayName: string; crest: string },
  periodKey: string
): GuildWeeklyGoalProgressRecord {
  return {
    guildId: guild.id,
    guildName: guild.displayName,
    guildCrest: guild.crest,
    periodId: null,
    periodKey,
    progressCount: 0,
    targetCount: GUILD_WEEKLY_GOAL_TARGET,
    completedAt: null,
    contributorCharacterIds: []
  };
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
