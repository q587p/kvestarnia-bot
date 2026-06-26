import { PrismaClient } from "@prisma/client";
import {
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_STARTED_KEY
} from "../src/services/dailyActionKeys";
import {
  runRemortDailyActionCleanup,
  type RemortCleanupCharacter,
  type RemortDailyActionCleanupStore,
  type RemortDailyActionCleanupSummary
} from "../src/services/remortDailyActionCleanupService";

class PrismaRemortDailyActionCleanupStore implements RemortDailyActionCleanupStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listRemortedCharactersWithDailyActions(
    keys?: readonly string[]
  ): Promise<RemortCleanupCharacter[]> {
    const dailyActionWhere = keys?.length
      ? {
          key: {
            in: [...keys]
          }
        }
      : {};
    const characters = await this.prisma.character.findMany({
      where: {
        remorts: {
          some: {}
        },
        dailyActions: {
          some: dailyActionWhere
        }
      },
      select: {
        id: true,
        name: true,
        level: true,
        remorts: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1,
          select: {
            createdAt: true
          }
        },
        dailyActions: {
          where: dailyActionWhere,
          select: {
            id: true,
            key: true,
            localDate: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return characters.flatMap((character) => {
      const latestRemort = character.remorts[0];

      if (!latestRemort) {
        return [];
      }

      return [
        {
          id: character.id,
          name: character.name,
          level: character.level,
          latestRemortCreatedAt: latestRemort.createdAt,
          dailyActions: character.dailyActions
        }
      ];
    });
  }

  async deleteDailyActionsByIds(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await this.prisma.dailyAction.deleteMany({
      where: {
        id: {
          in: [...ids]
        }
      }
    });

    return result.count;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const yegerOnly = args.includes("--yeger-only");
  const keys = yegerOnly
    ? [YEGER_UNQUIET_TRIAL_STARTED_KEY, YEGER_UNQUIET_TRIAL_COMPLETED_KEY]
    : undefined;
  const prisma = new PrismaClient();

  try {
    const summary = await runRemortDailyActionCleanup({
      store: new PrismaRemortDailyActionCleanupStore(prisma),
      apply,
      ...(keys ? { keys } : {})
    });

    printSummary(summary, yegerOnly ? "Yeger remort daily-action cleanup" : "remort daily-action cleanup");
  } finally {
    await prisma.$disconnect();
  }
}

function printSummary(summary: RemortDailyActionCleanupSummary, label: string): void {
  console.log(summary.dryRun ? `Dry run: ${label}` : `Applied: ${label}`);
  console.log(`Characters scanned: ${summary.charactersScanned}`);
  console.log(`Characters affected: ${summary.charactersAffected}`);
  console.log(`Daily actions matched: ${summary.actionsMatched}`);
  console.log(`Daily actions deleted: ${summary.actionsDeleted}`);

  if (summary.entries.length === 0) {
    console.log("Entries: none");
    return;
  }

  console.log("Entries:");

  for (const entry of summary.entries) {
    console.log(
      `- ${entry.characterName} (${entry.characterId}), level ${entry.level}, remort ${entry.latestRemortCreatedAt.toISOString()}: ${entry.actionIds.length} rows`
    );
    console.log(`  keys: ${entry.actionKeys.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
