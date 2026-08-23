import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaGuildWeeklyGoalRepository } from "../../src/db/repositories/prismaGuildWeeklyGoalRepository";

const COMPLETED_AT = new Date("2026-08-24T18:00:00.000Z");

describe("PrismaGuildWeeklyGoalRepository integration", () => {
  let directory: string;
  let prisma: PrismaClient;
  let repository: PrismaGuildWeeklyGoalRepository;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "kvestarnia-guild-weekly-"));
    prisma = new PrismaClient({ datasources: { db: { url: `file:${join(directory, "test.db").replace(/\\/gu, "/")}` } } });
    await createBaseSchema(prisma);
    await applySqlFile(prisma, "prisma/migrations/20260824090000_guild_weekly_goal/migration.sql");
    repository = new PrismaGuildWeeklyGoalRepository(prisma);
    await seedGuild(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("credits one winning expedition once, freezes membership at completion, and treats support equally", async () => {
    await seedSession(prisma, "weekly-race", COMPLETED_AT, true);
    await prisma.$executeRawUnsafe(
      `UPDATE guild_members SET left_at = ? WHERE id = 'member-b'`,
      new Date(COMPLETED_AT.getTime() + 1)
    );
    const results = await Promise.all([
      repository.recordEligibleTerminalSession("weekly-race"),
      repository.recordEligibleTerminalSession("weekly-race")
    ]);
    expect(results.map((result) => result.state).sort()).toEqual(["recorded", "replayed"]);
    await expect(prisma.guildWeeklyContribution.count({ where: { groupCombatSessionId: "weekly-race" } })).resolves.toBe(1);
    await expect(prisma.guildWeeklyContributorReceipt.findMany({
      where: { contribution: { groupCombatSessionId: "weekly-race" } },
      orderBy: { userId: "asc" },
      select: { userId: true, characterId: true, remortCount: true }
    })).resolves.toEqual([
      { userId: "user-a", characterId: "character-a", remortCount: 0 },
      { userId: "user-b", characterId: "character-b", remortCount: 0 }
    ]);

    await expect(repository.recordEligibleTerminalSession("weekly-race")).resolves.toMatchObject({
      state: "replayed",
      progress: { progressCount: 1, targetCount: 13, periodKey: "12026-W35" }
    });
  });

  it("keeps two different first-period receipts during a concurrent period-create race", async () => {
    const completedAt = new Date("2026-08-18T18:00:00.000Z");
    await seedSession(prisma, "weekly-parallel-a", completedAt, true);
    await seedSession(prisma, "weekly-parallel-b", new Date(completedAt.getTime() + 1), true);

    const results = await Promise.all([
      repository.recordEligibleTerminalSession("weekly-parallel-a"),
      repository.recordEligibleTerminalSession("weekly-parallel-b")
    ]);
    expect(results.map((result) => result.state).sort()).toEqual(["recorded", "recorded"]);
    await expect(prisma.guildWeeklyGoalPeriod.findUniqueOrThrow({
      where: { guildId_periodKey_goalKey: {
        guildId: "guild-weekly",
        periodKey: "12026-W34",
        goalKey: "ordinary-party-expeditions.v1"
      } },
      select: { progressCount: true, completedAt: true }
    })).resolves.toEqual({ progressCount: 2, completedAt: null });
  });

  it("keeps the kill switch isolated and emits one privacy-safe completion fact at thirteen receipts", async () => {
    await seedSession(prisma, "weekly-disabled", new Date(COMPLETED_AT.getTime() + 1_000), false);
    await expect(repository.recordEligibleTerminalSession("weekly-disabled")).resolves.toEqual({ state: "ineligible" });
    await expect(prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: "weekly-disabled" },
      select: { status: true, guildWeeklyGoalEligible: true }
    })).resolves.toEqual({ status: "won", guildWeeklyGoalEligible: false });

    await prisma.$executeRawUnsafe(`UPDATE guild_members SET left_at = NULL WHERE id = 'member-b'`);
    await prisma.$executeRawUnsafe(
      `UPDATE guilds SET display_name = ?, crest = ? WHERE id = 'guild-weekly'`,
      "Нова Назва",
      "🦊"
    );
    for (let index = 2; index <= 12; index += 1) {
      const id = `weekly-${index}`;
      await seedSession(prisma, id, new Date(COMPLETED_AT.getTime() + index * 1_000), true);
      await repository.recordEligibleTerminalSession(id);
    }
    await expect(prisma.activityEvent.count({
      where: { eventType: "guild.weekly_goal_completed" }
    })).resolves.toBe(0);
    await seedSession(prisma, "weekly-13", new Date(COMPLETED_AT.getTime() + 13_000), true);
    await repository.recordEligibleTerminalSession("weekly-13");
    const view = await repository.getCurrentForTelegramUser(70_001n, new Date("2026-08-25T12:00:00.000Z"));
    expect(view).toMatchObject({
      state: "ready",
      progress: { progressCount: 13, targetCount: 13, periodKey: "12026-W35" }
    });
    expect(view.state === "ready" ? view.progress.completedAt : null).not.toBeNull();
    const completionEvents = await prisma.activityEvent.findMany({
      where: { eventType: "guild.weekly_goal_completed" },
      select: {
        category: true,
        severity: true,
        actorCharacterId: true,
        relatedCharacterIds: true,
        subjectId: true,
        subjectName: true,
        payloadJson: true,
        dedupeKey: true
      }
    });
    expect(completionEvents).toHaveLength(1);
    expect(completionEvents[0]).toMatchObject({
      category: "adventurer",
      severity: "high",
      actorCharacterId: null,
      relatedCharacterIds: null,
      subjectId: "guild-weekly",
      subjectName: "Печатка Підтримки",
      payloadJson: { crest: "🦉", periodKey: "12026-W35" }
    });
    expect(completionEvents[0]?.dedupeKey).toMatch(/^guild\.weekly_goal_completed:/u);
    expect(await repository.getMetrics()).toEqual({
      periodsStarted: 2,
      periodsCompleted: 1,
      expeditionReceipts: 15,
      contributorReceipts: 30
    });

    const completedAt = view.state === "ready" ? view.progress.completedAt : null;
    await prisma.guildWeeklyGoalPeriod.updateMany({
      where: { periodKey: "12026-W35" },
      data: { progressCount: 0, completedAt: null }
    });
    await prisma.activityEvent.deleteMany({ where: { eventType: "guild.weekly_goal_completed" } });
    await expect(repository.recomputePeriod("12026-W35")).resolves.toBe(1);
    await expect(repository.getCurrentForTelegramUser(70_001n, new Date("2026-08-25T12:00:00.000Z")))
      .resolves.toMatchObject({
        state: "ready",
        progress: { progressCount: 13, completedAt }
      });
    await expect(prisma.activityEvent.count({
      where: { eventType: "guild.weekly_goal_completed" }
    })).resolves.toBe(1);
  });

  it("rolls forward without mutating the completed old period", async () => {
    const next = await repository.getCurrentForTelegramUser(70_001n, new Date("2026-08-31T12:00:00.000Z"));
    expect(next).toMatchObject({
      state: "ready",
      progress: { periodKey: "12026-W36", progressCount: 0, completedAt: null }
    });
    const completedPeriod = await prisma.guildWeeklyGoalPeriod.findUniqueOrThrow({
      where: { guildId_periodKey_goalKey: {
        guildId: "guild-weekly",
        periodKey: "12026-W35",
        goalKey: "ordinary-party-expeditions.v1"
      } },
      select: { progressCount: true, completedAt: true }
    });
    expect(completedPeriod.progressCount).toBe(13);
    expect(completedPeriod.completedAt).toBeInstanceOf(Date);
  });

  it("keeps local forced completion replay-stable and emits one Chronicle fact", async () => {
    const first = await repository.completeCurrentForDev(
      70_001n,
      new Date("2026-08-31T12:00:00.000Z")
    );
    expect(first).toMatchObject({
      state: "ready",
      progress: { periodKey: "12026-W36", progressCount: 13 }
    });
    if (first.state !== "ready") throw new Error("Expected a guild weekly period.");
    const replay = await repository.completeCurrentForDev(
      70_001n,
      new Date("2026-08-31T13:00:00.000Z")
    );
    expect(replay).toMatchObject({
      state: "ready",
      progress: { completedAt: first.progress.completedAt }
    });
    await expect(prisma.activityEvent.count({
      where: { sourceId: first.progress.periodId, eventType: "guild.weekly_goal_completed" }
    })).resolves.toBe(1);
  });
});

async function seedGuild(prisma: PrismaClient): Promise<void> {
  for (const [suffix, telegramId] of [["a", 70_001n], ["b", 70_002n], ["c", 70_003n]] as const) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO users (id, telegram_user_id) VALUES (?, ?)`,
      `user-${suffix}`,
      telegramId
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO characters (id, user_id) VALUES (?, ?)`,
      `character-${suffix}`,
      `user-${suffix}`
    );
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO guilds (id, display_name, crest, status, activated_at) VALUES (?, ?, ?, 'active', ?)`,
    "guild-weekly",
    "Печатка Підтримки",
    "🦉",
    new Date("2026-08-01T00:00:00.000Z")
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO guild_members (id, guild_id, user_id, joined_at) VALUES
      ('member-a', 'guild-weekly', 'user-a', ?),
      ('member-b', 'guild-weekly', 'user-b', ?)`,
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-08-01T00:00:00.000Z")
  );
}

async function seedSession(prisma: PrismaClient, id: string, completedAt: Date, eligible: boolean): Promise<void> {
  const partyId = `party-${id}`;
  await prisma.$executeRawUnsafe(`INSERT INTO party_sessions (id) VALUES (?)`, partyId);
  const plan = settlementPlan(id);
  await prisma.$executeRawUnsafe(
    `INSERT INTO group_combat_sessions
      (id, party_session_id, encounter_key, status, completed_at, settlement_plan_json, guild_weekly_goal_eligible)
      VALUES (?, ?, 'nyz-left-passage-party.v1', 'won', ?, ?, ?)`,
    id,
    partyId,
    completedAt,
    JSON.stringify(plan),
    eligible
  );
  for (const suffix of ["a", "b", "c"] as const) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO group_combat_participants (id, session_id, character_id, remort_count)
       VALUES (?, ?, ?, 0)`,
      `${id}-${suffix}`,
      id,
      `character-${suffix}`
    );
  }
}

function settlementPlan(sessionId: string) {
  return {
    version: 1,
    policy: "left-passage-party",
    sessionId,
    outcome: "won",
    completedTurn: 2,
    participants: [
      participant("character-a", 0, true, { damage: 23, healing: 0, guardPrevented: 0, control: 0 }),
      participant("character-b", 1, true, { damage: 0, healing: 13, guardPrevented: 8, control: 1 }),
      participant("character-c", 2, false, { damage: 0, healing: 0, guardPrevented: 0, control: 0 })
    ]
  };
}

function participant(
  characterId: string,
  rosterOrder: number,
  manualParticipation: boolean,
  values: { damage: number; healing: number; guardPrevented: number; control: number }
) {
  return {
    characterId,
    remortCount: 0,
    rosterOrder,
    resources: { hp: 10, mana: 5 },
    contribution: {
      characterId,
      ...values,
      damageTaken: 1,
      committedActions: manualParticipation ? 1 : 0,
      guardedTurns: values.guardPrevented > 0 ? 1 : 0,
      specialActions: values.healing > 0 ? 1 : 0
    },
    rewards: { xp: 0, gold: 0, items: [] },
    manualParticipation,
    effects: {
      resourcesKey: `resources:${characterId}`,
      xpKey: `xp:${characterId}`,
      goldKey: `gold:${characterId}`,
      itemKey: null,
      activityKey: manualParticipation ? `activity:${characterId}` : null
    }
  };
}

async function createBaseSchema(prisma: PrismaClient): Promise<void> {
  await executeSql(prisma, `
    CREATE TABLE users (
      id TEXT NOT NULL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL UNIQUE
    );
    CREATE TABLE characters (
      id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE guilds (
      id TEXT NOT NULL PRIMARY KEY,
      display_name TEXT NOT NULL,
      crest TEXT NOT NULL,
      status TEXT NOT NULL,
      activated_at DATETIME,
      disbanded_at DATETIME
    );
    CREATE TABLE guild_members (
      id TEXT NOT NULL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at DATETIME NOT NULL,
      left_at DATETIME,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guild_id) REFERENCES guilds(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE party_sessions (id TEXT NOT NULL PRIMARY KEY);
    CREATE TABLE group_combat_sessions (
      id TEXT NOT NULL PRIMARY KEY,
      party_session_id TEXT NOT NULL UNIQUE,
      encounter_key TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at DATETIME,
      settlement_plan_json JSONB,
      FOREIGN KEY (party_session_id) REFERENCES party_sessions(id)
    );
    CREATE TABLE group_combat_participants (
      id TEXT NOT NULL PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES group_combat_sessions(id),
      FOREIGN KEY (character_id) REFERENCES characters(id)
    );
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
      dedupe_key TEXT UNIQUE,
      payload_json JSONB,
      occurred_at DATETIME NOT NULL,
      published_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function applySqlFile(prisma: PrismaClient, path: string): Promise<void> {
  const sql = await readFile(resolve(path), "utf8");
  await executeSql(prisma, sql);
}

async function executeSql(prisma: PrismaClient, sql: string): Promise<void> {
  for (const statement of sql.split(/;\s*(?:\r?\n|$)/u).map((value) => value.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}
