import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaActivityEventRepository } from "../../src/db/repositories/prismaActivityEventRepository";

describe("PrismaActivityEventRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaActivityEventRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-activity-events-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createActivityEventSchema(prisma);
    repository = new PrismaActivityEventRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.activityEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("records and replays deduped activity rows", async () => {
    const occurredAt = new Date("2026-07-02T09:30:00.000Z");

    const first = await repository.record({
      eventType: "character.created",
      category: "adventurer",
      severity: "normal",
      actorCharacterId: "character-1",
      actorDisplayName: "Тестовий <герой>",
      sourceType: "character",
      sourceId: "character-1",
      dedupeKey: "character.created:character-1",
      payload: { note: "first" },
      occurredAt
    });
    const replay = await repository.record({
      eventType: "character.created",
      category: "adventurer",
      severity: "normal",
      actorCharacterId: "character-1",
      actorDisplayName: "Інше імʼя",
      sourceType: "character",
      sourceId: "character-1",
      dedupeKey: "character.created:character-1",
      payload: { note: "duplicate" },
      occurredAt: new Date("2026-07-02T09:31:00.000Z")
    });

    expect(replay).toEqual(first);
    await expect(prisma.activityEvent.count()).resolves.toBe(1);
  });

  it("lists bounded recent public rows with category and severity filters", async () => {
    const now = new Date("2026-07-02T12:00:00.000Z");
    await repository.record(makeEvent("event-1", "character.created", "adventurer", "normal", "2026-07-02T11:00:00.000Z"));
    await repository.record(makeEvent("event-guild", "guild.created", "adventurer", "high", "2026-07-02T10:30:00.000Z"));
    await repository.record(makeEvent(
      "event-2",
      "item.rare_received",
      "manatky",
      "high",
      "2026-07-02T10:00:00.000Z",
      { rarity: "rare" }
    ));
    await repository.record(makeEvent(
      "event-3",
      "item.rare_received",
      "manatky",
      "legendary",
      "2026-07-02T09:30:00.000Z",
      { rarity: "epic" }
    ));
    await repository.record(makeEvent(
      "event-underdog-7",
      "combat.underdog_won",
      "combat",
      "high",
      "2026-07-02T09:15:00.000Z",
      { levelDelta: 7 }
    ));
    await repository.record(makeEvent(
      "event-underdog-8",
      "combat.underdog_won",
      "combat",
      "high",
      "2026-07-02T09:00:00.000Z",
      { levelDelta: 8 }
    ));
    await repository.record(makeEvent("event-old", "combat.underdog_won", "combat", "high", "2026-03-01T10:00:00.000Z"));

    const manatky = await repository.listRecent({
      categories: ["manatky"],
      pageSize: 1,
      now,
      retentionDays: 93
    });
    const important = await repository.listRecent({
      severities: ["high", "legendary"],
      excludeRareManatky: true,
      minimumUnderdogLevelDelta: 8,
      pageSize: 5,
      now,
      retentionDays: 93
    });
    const adventurers = await repository.listRecent({
      categories: ["adventurer", "progression"],
      pageSize: 5,
      now,
      retentionDays: 93
    });
    const combat = await repository.listRecent({
      categories: ["combat", "raid"],
      pageSize: 5,
      now,
      retentionDays: 93
    });

    expect(manatky.events.map((event) => event.dedupeKey)).toEqual(["event-2"]);
    expect(manatky.hasNextPage).toBe(true);
    expect(adventurers.events.map((event) => event.dedupeKey)).toEqual(["event-1", "event-guild"]);
    expect(important.events.map((event) => event.dedupeKey)).toEqual(["event-guild", "event-3", "event-underdog-8"]);
    expect(combat.events.map((event) => event.dedupeKey)).toEqual(["event-underdog-7", "event-underdog-8"]);
  });
});

function makeEvent(
  dedupeKey: string,
  eventType: "character.created" | "guild.created" | "item.rare_received" | "combat.underdog_won",
  category: "adventurer" | "manatky" | "combat",
  severity: "normal" | "high" | "legendary",
  occurredAt: string,
  payload?: Record<string, unknown>
) {
  return {
    eventType,
    category,
    severity,
    actorCharacterId: "character-1",
    sourceType: "test",
    sourceId: dedupeKey,
    dedupeKey,
    payload,
    occurredAt: new Date(occurredAt)
  };
}

async function createActivityEventSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE activity_events (
      id TEXT NOT NULL PRIMARY KEY,
      event_type TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'public',
      actor_character_id TEXT,
      actor_display_name TEXT,
      related_character_ids_json JSONB,
      subject_kind TEXT,
      subject_id TEXT,
      subject_name TEXT,
      source_type TEXT,
      source_id TEXT,
      dedupe_key TEXT,
      payload_json JSONB,
      occurred_at DATETIME NOT NULL,
      published_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX activity_events_dedupe_key_key ON activity_events(dedupe_key);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX activity_events_visibility_occurred_at_idx ON activity_events(visibility, occurred_at);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX activity_events_category_occurred_at_idx ON activity_events(category, occurred_at);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX activity_events_severity_occurred_at_idx ON activity_events(severity, occurred_at);`);
}
