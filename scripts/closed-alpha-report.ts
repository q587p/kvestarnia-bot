import "dotenv/config";

import { prisma } from "../src/db/prisma";
import { PrismaGuildWeeklyGoalRepository } from "../src/db/repositories/prismaGuildWeeklyGoalRepository";
import { ClosedAlphaReportService } from "../src/services/closedAlphaReportService";
import { GuildWeeklyGoalService } from "../src/services/guildWeeklyGoalService";

async function main(): Promise<void> {
  const { from, to } = parseWindow(process.argv.slice(2));
  const weeklyGoals = new GuildWeeklyGoalService(
    new PrismaGuildWeeklyGoalRepository(prisma),
    { enabled: false, devHelpersEnabled: false }
  );
  const report = await new ClosedAlphaReportService(prisma, weeklyGoals).build(from, to);

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
