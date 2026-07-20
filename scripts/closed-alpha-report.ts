import "dotenv/config";

import { prisma } from "../src/db/prisma";
import { buildClosedAlphaAggregateReport } from "../src/domain/analytics/closedAlphaReport";

async function main(): Promise<void> {
  const { from, to } = parseWindow(process.argv.slice(2));
  const [users, fights, duels, parties] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: {
        createdAt: true,
        lastActionAt: true,
        character: { select: { id: true } }
      }
    }),
    prisma.soloCombatSession.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { characterId: true, createdAt: true }
    }),
    prisma.duelChallenge.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { status: true, createdAt: true, resolvedAt: true }
    }),
    prisma.partySession.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: {
        createdAt: true,
        participants: {
          where: { joinSource: { not: "leader" } },
          select: { id: true }
        },
        bossSessions: {
          select: { status: true }
        }
      }
    })
  ]);

  const report = buildClosedAlphaAggregateReport({
    from,
    to,
    users: users.map((row) => ({
      createdAt: row.createdAt,
      lastActionAt: row.lastActionAt,
      characterId: row.character?.id ?? null
    })),
    fights,
    duels,
    parties: parties.map((row) => ({
      createdAt: row.createdAt,
      joinCount: row.participants.length,
      startCount: row.bossSessions.length,
      finishCount: row.bossSessions.filter((session) => session.status !== "active").length
    }))
  });

  console.log(JSON.stringify(report, null, 2));
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
