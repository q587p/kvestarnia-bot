import "dotenv/config";

import { prisma } from "../src/db/prisma";
import { buildClosedAlphaAggregateReport } from "../src/domain/analytics/closedAlphaReport";

async function main(): Promise<void> {
  const { from, to } = parseWindow(process.argv.slice(2));
  const [characterCreationEvents, duelCompletedEvents, partyFinishEvents] = await Promise.all([
    prisma.activityEvent.findMany({
      where: {
        eventType: "character.created",
        occurredAt: { gte: from, lt: to },
        createdAt: { lt: to }
      },
      select: { occurredAt: true, createdAt: true }
    }),
    prisma.activityEvent.findMany({
      where: {
        eventType: "duel.completed",
        occurredAt: { gte: from, lt: to },
        createdAt: { lt: to }
      },
      select: { occurredAt: true, createdAt: true }
    }),
    prisma.activityEvent.findMany({
      where: {
        eventType: "raid.completed",
        sourceType: "party-boss",
        occurredAt: { gte: from, lt: to },
        createdAt: { lt: to }
      },
      select: { occurredAt: true, createdAt: true }
    })
  ]);

  const report = buildClosedAlphaAggregateReport({
    from,
    to,
    characterCreationEvents: characterCreationEvents.map(toRecordedEvent),
    duelEvents: duelCompletedEvents.map((row) => ({ ...toRecordedEvent(row), status: "resolved" })),
    partyFinishEvents: partyFinishEvents.map(toRecordedEvent)
  });

  console.log(JSON.stringify(report, null, 2));
}

function toRecordedEvent(row: { occurredAt: Date; createdAt: Date }): { occurredAt: Date; recordedAt: Date } {
  return { occurredAt: row.occurredAt, recordedAt: row.createdAt };
}

function parseWindow(args: readonly string[]): { from: Date; to: Date } {
  const now = new Date();
  const to = parseDateOption(args, "--to") ?? now;
  const from = parseDateOption(args, "--from") ?? new Date(to.getTime() - 93 * 24 * 60 * 60 * 1000);
  if (from >= to) {
    throw new Error("--from must be earlier than --to.");
  }
  return { from, to };
}

function parseDateOption(args: readonly string[], name: "--from" | "--to"): Date | null {
  const prefix = `${name}=`;
  const raw = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) {
    return null;
  }
  const value = new Date(raw);
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`Invalid ${name} timestamp.`);
  }
  return value;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
