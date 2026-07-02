import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaActivityEventRepository } from "../src/db/repositories/prismaActivityEventRepository";
import type { ActivityEventRecord } from "../src/db/repositories/activityEventRepository";
import {
  ActivityEventService,
  LATEST_EVENTS_RETENTION_DAYS,
  latestEventFilters,
  type LatestEventFilter
} from "../src/services/activityEventService";

const DEFAULT_LIMIT = 13;
const DEFAULT_INTERVAL_SECONDS = 13;

interface PollOptions {
  filter: LatestEventFilter;
  limit: number;
  page: number;
  retentionDays: number;
  watch: boolean;
  intervalSeconds: number;
  json: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const events = new ActivityEventService(new PrismaActivityEventRepository(prisma));

  try {
    await printLatestEvents(events, options);

    if (!options.watch) {
      return;
    }

    const seenIds = new Set<string>();
    const initialPage = await events.listRecent(options.filter, {
      page: options.page,
      pageSize: options.limit,
      retentionDays: options.retentionDays
    });
    for (const event of initialPage.events) {
      seenIds.add(event.id);
    }

    console.error(`Polling ActivityEvent every ${options.intervalSeconds}s. Press Ctrl+C to stop.`);

    while (true) {
      await sleep(options.intervalSeconds * 1000);
      const page = await events.listRecent(options.filter, {
        page: options.page,
        pageSize: options.limit,
        retentionDays: options.retentionDays
      });
      const newEvents = page.events.filter((event) => !seenIds.has(event.id)).reverse();
      for (const event of page.events) {
        seenIds.add(event.id);
      }
      if (newEvents.length > 0) {
        printEvents(newEvents, options.json);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs(args: string[]): PollOptions {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const options: PollOptions = {
    filter: "all",
    limit: DEFAULT_LIMIT,
    page: 0,
    retentionDays: LATEST_EVENTS_RETENTION_DAYS,
    watch: false,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    json: false
  };

  for (const arg of args) {
    if (arg === "--watch") {
      options.watch = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg.startsWith("--filter=")) {
      options.filter = parseFilter(arg.slice("--filter=".length));
      continue;
    }
    if (arg.startsWith("--limit=")) {
      options.limit = parsePositiveInteger(arg.slice("--limit=".length), "--limit", 25);
      continue;
    }
    if (arg.startsWith("--page=")) {
      options.page = parseNonNegativeInteger(arg.slice("--page=".length), "--page");
      continue;
    }
    if (arg.startsWith("--retention-days=")) {
      options.retentionDays = parsePositiveInteger(arg.slice("--retention-days=".length), "--retention-days", 3660);
      continue;
    }
    if (arg.startsWith("--interval=")) {
      options.intervalSeconds = parsePositiveInteger(arg.slice("--interval=".length), "--interval", 3600);
      options.watch = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function printLatestEvents(events: ActivityEventService, options: PollOptions): Promise<void> {
  const page = await events.listRecent(options.filter, {
    page: options.page,
    pageSize: options.limit,
    retentionDays: options.retentionDays
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          filter: options.filter,
          page: page.page,
          pageSize: page.pageSize,
          hasNextPage: page.hasNextPage,
          events: page.events
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    `ActivityEvent latest rows: filter=${options.filter}, page=${page.page}, limit=${page.pageSize}, retentionDays=${options.retentionDays}`
  );
  console.log(`Rows: ${page.events.length}${page.hasNextPage ? " (more available)" : ""}`);
  printEvents(page.events, false, getEmptyEventsHint(options));
}

function printEvents(events: readonly ActivityEventRecord[], json: boolean, emptyHint: readonly string[] = []): void {
  if (json) {
    for (const event of events) {
      console.log(JSON.stringify(event));
    }
    return;
  }

  if (events.length === 0) {
    console.log("- no public activity events found");
    for (const line of emptyHint) {
      console.log(line);
    }
    return;
  }

  for (const event of events) {
    console.log(formatEvent(event));
  }
}

export function getEmptyEventsHint(options: Pick<PollOptions, "filter" | "page">): string[] {
  if (options.page > 0) {
    return ["- this page is empty; try --page=0 to read the newest rows first"];
  }

  if (options.filter !== "all") {
    return ["- this filter/window is empty; try --filter=all or a larger --retention-days value"];
  }

  return [
    "- existing characters/items are not read directly by this script; it only reads ActivityEvent rows",
    "- to preview reconstructable historical rows, run: npm run maintenance:backfill-activity-events",
    "- to write those rows into the current DATABASE_URL, run: npm run maintenance:backfill-activity-events -- --apply"
  ];
}

function formatEvent(event: ActivityEventRecord): string {
  const parts = [
    event.occurredAt.toISOString(),
    event.severity,
    event.category,
    event.eventType,
    `actor=${formatNullable(event.actorDisplayName ?? event.actorCharacterId)}`,
    `subject=${formatNullable(event.subjectName ?? event.subjectId)}`,
    `source=${formatSource(event)}`,
    `id=${event.id}`
  ];

  if (event.dedupeKey) {
    parts.push(`dedupe=${event.dedupeKey}`);
  }

  return parts.join(" | ");
}

function formatSource(event: ActivityEventRecord): string {
  if (!event.sourceType && !event.sourceId) {
    return "-";
  }
  return `${event.sourceType ?? "-"}:${event.sourceId ?? "-"}`;
}

function formatNullable(value: string | null): string {
  return value && value.trim().length > 0 ? value : "-";
}

function parseFilter(value: string): LatestEventFilter {
  if ((latestEventFilters as readonly string[]).includes(value)) {
    return value as LatestEventFilter;
  }

  throw new Error(`Invalid --filter: ${value}. Use one of: ${latestEventFilters.join(", ")}`);
}

function parsePositiveInteger(value: string, name: string, max: number): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`Invalid ${name}: ${value}. Expected 1..${max}.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 9999) {
    throw new Error(`Invalid ${name}: ${value}. Expected 0..9999.`);
  }
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printHelp(): void {
  console.log(
    [
      "Read public ActivityEvent rows from the current DATABASE_URL.",
      "",
      "Usage:",
      "  npm run maintenance:poll-activity-events",
      "  npm run maintenance:poll-activity-events -- --filter=imp --limit=13",
      "  npm run maintenance:poll-activity-events -- --watch --interval=13",
      "",
      "Preflight:",
      "  If this DATABASE_URL does not have ActivityEvent yet, run npm run db:deploy first.",
      "  For a local Prisma dev database, npm run db:migrate is also valid.",
      "",
      "Options:",
      `  --filter=${latestEventFilters.join("|")}       Feed filter to read. Default: all.`,
      "  --limit=N                 Rows per page, 1..25. Default: 13.",
      "  --page=N                  Zero-based page. Default: 0.",
      `  --retention-days=N        Lookback window, 1..3660. Default: ${LATEST_EVENTS_RETENTION_DAYS}.`,
      "  --watch                   Keep polling and print newly seen rows.",
      "  --interval=N              Watch interval in seconds, 1..3600. Implies --watch. Default: 13.",
      "  --json                    Print JSON instead of compact text.",
      "  --help                    Show this help."
    ].join("\n")
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(formatCliError(error));
    process.exitCode = 1;
  });
}

export function formatCliError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
    return [
      "Current DATABASE_URL is missing the ActivityEvent table.",
      "Apply committed migrations first:",
      "  npm run db:deploy",
      "",
      "For a local development database that intentionally uses Prisma dev migrations, use:",
      "  npm run db:migrate",
      "",
      "Then rerun:",
      "  npm run maintenance:poll-activity-events"
    ].join("\n");
  }

  return error instanceof Error ? error.message : String(error);
}
