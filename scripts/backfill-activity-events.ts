import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaActivityEventRepository } from "../src/db/repositories/prismaActivityEventRepository";
import { BIG_BARREL_BROTHER_RULES_VERSION } from "../src/domain/partyBoss/partyBoss";
import {
  activityEventBackfillKinds,
  backfillActivityEvents,
  getActivityEventBackfillLevelAchievementIds,
  getActivityEventBackfillRareItemIds,
  type ActivityEventBackfillStore,
  type ActivityEventBackfillSummary,
  type BackfillCharacterCreatedRow,
  type BackfillLevelAchievementRow,
  type BackfillPartyBossSessionRow,
  type BackfillRareCharacterItemRow
} from "../src/services/activityEventBackfillService";
import { LATEST_EVENTS_RETENTION_DAYS } from "../src/services/activityEventService";

class PrismaActivityEventBackfillStore implements ActivityEventBackfillStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listCharactersCreatedSince(since: Date | null): Promise<BackfillCharacterCreatedRow[]> {
    return this.prisma.character.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      select: {
        id: true,
        name: true,
        createdAt: true
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  }

  async listLevelAchievementsSince(
    since: Date | null,
    achievementIds: readonly string[]
  ): Promise<BackfillLevelAchievementRow[]> {
    const rows = await this.prisma.characterAchievement.findMany({
      where: {
        achievementId: { in: [...achievementIds] },
        ...(since ? { unlockedAt: { gte: since } } : {})
      },
      select: {
        id: true,
        characterId: true,
        achievementId: true,
        sourceType: true,
        sourceId: true,
        unlockedAt: true,
        character: {
          select: {
            name: true
          }
        }
      },
      orderBy: [{ unlockedAt: "asc" }, { id: "asc" }]
    });

    return rows.map((row) => ({
      id: row.id,
      characterId: row.characterId,
      characterName: row.character.name,
      achievementId: row.achievementId,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      unlockedAt: row.unlockedAt
    }));
  }

  async listRareCharacterItemsSince(
    since: Date | null,
    itemIds: readonly string[]
  ): Promise<BackfillRareCharacterItemRow[]> {
    const rows = await this.prisma.characterItem.findMany({
      where: {
        itemId: { in: [...itemIds] },
        ...(since ? { createdAt: { gte: since } } : {})
      },
      select: {
        id: true,
        characterId: true,
        itemId: true,
        createdAt: true,
        character: {
          select: {
            name: true
          }
        }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    return rows.map((row) => ({
      id: row.id,
      characterId: row.characterId,
      characterName: row.character.name,
      itemId: row.itemId,
      createdAt: row.createdAt
    }));
  }

  async listWonPartyBossSessionsSince(since: Date | null): Promise<BackfillPartyBossSessionRow[]> {
    const rows = await this.prisma.partyBossSession.findMany({
      where: {
        status: "won",
        rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
        ...(since
          ? {
              OR: [
                { completedAt: { gte: since } },
                { completedAt: null, updatedAt: { gte: since } }
              ]
            }
          : {})
      },
      select: {
        id: true,
        status: true,
        rulesVersion: true,
        bossKey: true,
        stateJson: true,
        completedAt: true,
        createdAt: true
      },
      orderBy: [{ completedAt: "asc" }, { id: "asc" }]
    });

    return rows;
  }

  async hasActivityEventDedupeKey(dedupeKey: string): Promise<boolean> {
    const row = await this.prisma.activityEvent.findUnique({
      where: { dedupeKey },
      select: { id: true }
    });
    return row !== null;
  }

  async hasRareItemEvent(characterId: string, itemId: string): Promise<boolean> {
    const row = await this.prisma.activityEvent.findFirst({
      where: {
        eventType: "item.rare_received",
        actorCharacterId: characterId,
        subjectId: itemId
      },
      select: { id: true }
    });
    return row !== null;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const store = new PrismaActivityEventBackfillStore(prisma);
  const recorder = new PrismaActivityEventRepository(prisma);

  try {
    const summary = await backfillActivityEvents({
      store,
      recorder,
      apply: options.apply,
      since: options.since
    });

    printSummary(summary);
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs(args: string[]): { apply: boolean; since: Date | null } {
  const apply = args.includes("--apply");
  const all = args.includes("--all");
  const sinceArg = args.find((arg) => arg.startsWith("--since="));
  const daysArg = args.find((arg) => arg.startsWith("--days="));

  if (all && sinceArg) {
    throw new Error("Use either --all or --since=YYYY-MM-DD, not both.");
  }

  if (all && daysArg) {
    throw new Error("Use either --all or --days=N, not both.");
  }

  if (sinceArg) {
    return { apply, since: parseDateArgument(sinceArg.slice("--since=".length)) };
  }

  if (all) {
    return { apply, since: null };
  }

  const days = daysArg
    ? parsePositiveInteger(daysArg.slice("--days=".length), "--days")
    : LATEST_EVENTS_RETENTION_DAYS;
  return {
    apply,
    since: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  };
}

function parseDateArgument(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --since date: ${value}`);
  }
  return parsed;
}

function parsePositiveInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

function printSummary(summary: ActivityEventBackfillSummary): void {
  console.log(summary.dryRun ? "Dry run: activity event archival backfill" : "Applied: activity event archival backfill");
  console.log(`Since: ${summary.since ? summary.since.toISOString() : "all available history"}`);
  console.log(`Level achievement ids: ${getActivityEventBackfillLevelAchievementIds().join(", ")}`);
  console.log(`Rare/epic item ids: ${getActivityEventBackfillRareItemIds().length}`);
  console.log("Counts:");

  for (const kind of activityEventBackfillKinds) {
    const count = summary.counts[kind];
    console.log(
      `- ${kind}: scanned ${count.scanned}, planned ${count.planned}, applied ${count.applied}, existing ${count.skippedExisting}, invalid ${count.skippedInvalid}`
    );
  }

  console.log("Unsupported:");
  console.log("- combat.underdog_won: not backfilled; archived rows do not reliably prove character level at fight time.");
  if (summary.dryRun) {
    console.log("Run with --apply to write planned rows.");
  }
}

main().catch((error: unknown) => {
  console.error(formatCliError(error));
  process.exitCode = 1;
});

function formatCliError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
    return [
      "Current DATABASE_URL is missing an expected table for activity event backfill.",
      "Run database migrations for this checkout first, then rerun the dry run."
    ].join("\n");
  }

  return error instanceof Error ? error.message : String(error);
}
