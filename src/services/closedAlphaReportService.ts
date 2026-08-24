import type { PrismaClient } from "@prisma/client";
import { buildClosedAlphaAggregateReport } from "../domain/analytics/closedAlphaReport";
import type { GuildWeeklyGoalService } from "./guildWeeklyGoalService";

export class ClosedAlphaReportService {
  constructor(
    private readonly prisma: Pick<PrismaClient, "activityEvent">,
    private readonly guildWeeklyGoals: Pick<GuildWeeklyGoalService, "getMetrics">
  ) {}

  async build(from: Date, to: Date) {
    const [characterCreationEvents, duelCompletedEvents, partyFinishEvents, guildWeeklyGoalMetrics] =
      await Promise.all([
        this.prisma.activityEvent.findMany({
          where: {
            eventType: "character.created",
            occurredAt: { gte: from, lt: to },
            createdAt: { lt: to }
          },
          select: { occurredAt: true, createdAt: true }
        }),
        this.prisma.activityEvent.findMany({
          where: {
            eventType: "duel.completed",
            occurredAt: { gte: from, lt: to },
            createdAt: { lt: to }
          },
          select: { occurredAt: true, createdAt: true }
        }),
        this.prisma.activityEvent.findMany({
          where: {
            eventType: "raid.completed",
            sourceType: "party-boss",
            occurredAt: { gte: from, lt: to },
            createdAt: { lt: to }
          },
          select: { occurredAt: true, createdAt: true }
        }),
        this.guildWeeklyGoals.getMetrics()
      ]);

    return buildClosedAlphaAggregateReport({
      from,
      to,
      characterCreationEvents: characterCreationEvents.map(toRecordedEvent),
      duelEvents: duelCompletedEvents.map((row) => ({ ...toRecordedEvent(row), status: "resolved" })),
      partyFinishEvents: partyFinishEvents.map(toRecordedEvent),
      guildWeeklyGoalMetrics
    });
  }
}

function toRecordedEvent(row: { occurredAt: Date; createdAt: Date }): { occurredAt: Date; recordedAt: Date } {
  return { occurredAt: row.occurredAt, recordedAt: row.createdAt };
}
