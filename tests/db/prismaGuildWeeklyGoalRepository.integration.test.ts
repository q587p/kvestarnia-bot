import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AchievementService } from "../../src/services/achievementService";
import { PrismaGuildWeeklyGoalRepository } from "../../src/db/repositories/prismaGuildWeeklyGoalRepository";
import { GuildWeeklyGoalService } from "../../src/services/guildWeeklyGoalService";
import { PrismaActivityEventRepository } from "../../src/db/repositories/prismaActivityEventRepository";
import { ActivityEventService } from "../../src/services/activityEventService";

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
    await expect(repository.recordEligibleTerminalSession("weekly-disabled")).resolves.toEqual({
      state: "ineligible",
      reason: "feature-not-frozen",
      periodKey: "12026-W35"
    });
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
      severity: "normal",
      actorCharacterId: null,
      relatedCharacterIds: null,
      subjectId: "guild-weekly",
      subjectName: "Печатка Підтримки",
      payloadJson: { crest: "🦉", periodKey: "12026-W35", glory: 13 }
    });
    expect(completionEvents[0]?.dedupeKey).toMatch(/^guild\.weekly_goal_completed:/u);
    expect(await repository.getMetrics()).toEqual({
      periodsStarted: 2,
      periodsCompleted: 1,
      expeditionReceipts: 15,
      contributorReceipts: 30,
      reconciliationDecisions: 16,
      reconciliations: {
        credited: 15,
        ineligible: 1,
        ineligibleByReason: {
          "feature-not-frozen": 1,
          "wrong-encounter": 0,
          "not-won": 0,
          "missing-completion": 0,
          "missing-settlement-plan": 0,
          "invalid-settlement-plan": 0,
          "wrong-settlement-policy": 0,
          "too-few-manual-participants": 0,
          "missing-user-snapshot": 0,
          "no-eligible-guild": 0
        }
      },
      gloryReceipts: 1,
      achievementEntitlements: 2,
      achievementNotifications: {
        pending: 2,
        claimed: 0,
        projected: 0,
        sent: 0,
        permanentFailure: 0
      }
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
    await repository.recomputePeriod("12026-W36");
    const repaired = await repository.getCurrentForTelegramUser(70_001n, new Date("2026-08-31T14:00:00.000Z"));
    expect(repaired).toMatchObject({
      state: "ready",
      progress: { completedAt: first.progress.completedAt, progressCount: 13 }
    });
    await expect(prisma.guildGloryReceipt.count({ where: { periodId: first.progress.periodId! } })).resolves.toBe(1);
    await expect(prisma.guildWeeklyAchievementEntitlement.count({ where: { userId: "user-a" } })).resolves.toBe(1);
  });

  it("advances a bounded repair queue past thirteen rejected terminals and recovers an old Sunday after Monday", async () => {
    const sunday = new Date("2026-09-06T20:59:00.000Z");
    for (let index = 0; index < 13; index += 1) {
      const id = `weekly-rejected-${index}`;
      await seedSession(prisma, id, new Date(sunday.getTime() - (13 - index) * 1_000), true);
      const plan = settlementPlan(id);
      plan.participants[1]!.manualParticipation = false;
      plan.participants[1]!.contribution.committedActions = 0;
      await prisma.$executeRawUnsafe(
        `UPDATE group_combat_sessions SET settlement_plan_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        JSON.stringify(plan),
        id
      );
    }
    await seedSession(prisma, "weekly-sunday-eligible", sunday, true);
    const service = new GuildWeeklyGoalService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-09-07T08:00:00.000Z")
    );

    await expect(service.repairCurrentPeriod(13)).resolves.toMatchObject({ recorded: 0, reconciled: 13 });
    await expect(service.repairCurrentPeriod(13)).resolves.toMatchObject({ recorded: 1, reconciled: 1 });
    await expect(prisma.guildWeeklyReconciliation.count({
      where: { sessionId: { startsWith: "weekly-rejected-" } }
    })).resolves.toBe(13);
    await expect(prisma.guildWeeklyContribution.findUnique({
      where: { groupCombatSessionId: "weekly-sunday-eligible" },
      select: { period: { select: { periodKey: true } } }
    })).resolves.toEqual({ period: { periodKey: "12026-W36" } });
    const monday = await repository.getCurrentForTelegramUser(70_001n, new Date("2026-09-07T08:00:00.000Z"));
    expect(monday).toMatchObject({ state: "ready", progress: { periodKey: "12026-W37", progressCount: 0 } });
  });

  it("awards one Glory receipt under concurrent thirteenth contributions and keeps it stable after replay, rename and remort", async () => {
    const base = new Date("2026-09-14T12:00:00.000Z");
    for (let index = 1; index <= 12; index += 1) {
      const id = `weekly-glory-${index}`;
      await seedSession(prisma, id, new Date(base.getTime() + index * 1_000), true);
      await repository.recordEligibleTerminalSession(id);
    }
    await seedSession(prisma, "weekly-glory-13a", new Date(base.getTime() + 13_000), true);
    await seedSession(prisma, "weekly-glory-13b", new Date(base.getTime() + 13_000), true);
    const results = await Promise.all([
      repository.recordEligibleTerminalSession("weekly-glory-13a"),
      repository.recordEligibleTerminalSession("weekly-glory-13b")
    ]);
    expect(results.every((result) => result.state === "recorded")).toBe(true);
    const period = await prisma.guildWeeklyGoalPeriod.findUniqueOrThrow({
      where: { guildId_periodKey_goalKey: {
        guildId: "guild-weekly",
        periodKey: "12026-W38",
        goalKey: "ordinary-party-expeditions.v1"
      } },
      select: { id: true, completedAt: true, progressCount: true }
    });
    expect(period.progressCount).toBe(13);
    await expect(prisma.guildGloryReceipt.findMany({
      where: { periodId: period.id },
      select: { amount: true, sourceKey: true, awardedAt: true }
    })).resolves.toEqual([{
      amount: 13,
      sourceKey: `guild-weekly-goal:${period.id}`,
      awardedAt: period.completedAt
    }]);
    await prisma.$executeRawUnsafe(
      `UPDATE guilds SET display_name = 'Перейменована Печатка', normalized_name = 'перейменована печатка' WHERE id = 'guild-weekly'`
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO character_remorts (id, character_id) VALUES ('weekly-remort-a', 'character-a')`
    );
    await repository.recomputePeriod("12026-W38");
    await repository.recordEligibleTerminalSession("weekly-glory-13a");
    await expect(prisma.guildGloryReceipt.count({ where: { periodId: period.id } })).resolves.toBe(1);
    const event = await prisma.activityEvent.findUniqueOrThrow({
      where: { dedupeKey: `guild.weekly_goal_completed:${period.id}` },
      select: { subjectName: true, payloadJson: true }
    });
    expect(event.subjectName).toBe("Нова Назва");
    expect(event.payloadJson).toMatchObject({ glory: 13 });
  });

  it("ranks Glory and current Primacy with dense ties, deterministic five-row pages, own-place recovery and privacy guards", async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE users SET last_seen_location_id = 'location.korchma.deep', updated_at = CURRENT_TIMESTAMP WHERE id = 'user-a'`
    );
    const boardGuilds = [
      ["board-a", "абетка", "Абетка", "🅰️", 26, 13, "2026-08-24T17:00:00.000Z"],
      ["board-b", "бочка", "Бочка", "🅱️", 26, 13, "2026-08-24T17:00:00.000Z"],
      ["board-c", "вишня", "Вишня", "🍒", 13, 9, null],
      ["board-d", "дуб", "Дуб", "🌳", 13, 9, null],
      ["board-e", "єнот", "Єнот", "🦝", 0, 4, null],
      ["board-f", "жук", "Жук", "🪲", 0, 0, null]
    ] as const;
    for (const [id, normalized, name, crest, glory, progress, completedAt] of boardGuilds) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO guilds (id, normalized_name, display_name, crest, status, activated_at)
         VALUES (?, ?, ?, ?, 'active', ?)`,
        id, normalized, name, crest, new Date("2026-08-01T00:00:00.000Z")
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO guild_weekly_goal_periods
          (id, guild_id, period_key, goal_key, guild_name_snapshot, guild_crest_snapshot,
           target_count, progress_count, completed_at, updated_at)
         VALUES (?, ?, '12026-W35', 'ordinary-party-expeditions.v1', ?, ?, 13, ?, ?, CURRENT_TIMESTAMP)`,
        `period-${id}`, id, name, crest, progress, completedAt ? new Date(completedAt) : null
      );
      if (glory > 0) {
        for (let index = 0; index < glory / 13; index += 1) {
          const receiptPeriodId = index === 0 ? `period-${id}` : `historical-${id}-${index}`;
          if (index > 0) {
            await prisma.$executeRawUnsafe(
              `INSERT INTO guild_weekly_goal_periods
                (id, guild_id, period_key, goal_key, guild_name_snapshot, guild_crest_snapshot,
                 target_count, progress_count, completed_at, updated_at)
               VALUES (?, ?, ?, 'ordinary-party-expeditions.v1', ?, ?, 13, 13, ?, CURRENT_TIMESTAMP)`,
              receiptPeriodId, id, `12026-W${30 + index}`, name, crest, new Date("2026-07-01T00:00:00.000Z")
            );
          }
          await prisma.$executeRawUnsafe(
            `INSERT INTO guild_glory_receipts
              (id, guild_id, period_id, source_key, amount, awarded_at)
             VALUES (?, ?, ?, ?, 13, ?)`,
            `glory-${id}-${index}`, id, receiptPeriodId, `source-${id}-${index}`, new Date("2026-08-01T00:00:00.000Z")
          );
        }
      }
    }

    const gloryFirst = await repository.getGloryBoardForTelegramUser(
      70_001n, "location.korchma.deep", new Date("2026-08-25T12:00:00.000Z"), "glory", 0
    );
    expect(gloryFirst).toMatchObject({ state: "ready", page: 0 });
    if (gloryFirst.state !== "ready") throw new Error("Expected Glory board.");
    expect(gloryFirst.rows[0]).toMatchObject({ glory: 39 });
    expect(gloryFirst.rows).toHaveLength(5);
    const tiedGlory = gloryFirst.rows.filter((row) => row.glory === 26);
    expect(tiedGlory).toHaveLength(2);
    expect(new Set(tiedGlory.map((row) => row.place)).size).toBe(1);
    expect(tiedGlory.map((row) => row.guildId)).toEqual(["board-a", "board-b"]);

    const glorySecond = await repository.getGloryBoardForTelegramUser(
      70_001n, "location.korchma.deep", new Date("2026-08-25T12:00:00.000Z"), "glory", 93
    );
    expect(glorySecond).toMatchObject({ state: "ready", page: 1, hasNextPage: false });
    if (glorySecond.state !== "ready") throw new Error("Expected second Glory page.");
    expect(glorySecond.rows.length).toBe(2);
    expect(glorySecond.viewerGuild.guildId).toBe("guild-weekly");
    expect(glorySecond.rows.some((row) => row.guildId === "guild-weekly")).toBe(false);
    expect(Object.keys(glorySecond.viewerGuild).sort()).toEqual([
      "completed", "glory", "guildCrest", "guildId", "guildName", "place",
      "progressCount", "targetCount", "viewerGuild"
    ].sort());

    const primacy = await repository.getGloryBoardForTelegramUser(
      70_001n, "location.korchma.deep", new Date("2026-08-25T12:00:00.000Z"), "primacy", 0
    );
    if (primacy.state !== "ready") throw new Error("Expected Primacy board.");
    expect(primacy.rows.slice(0, 2).map((row) => row.guildId)).toEqual(["board-a", "board-b"]);
    expect(primacy.rows[0]!.place).toBe(primacy.rows[1]!.place);
    const progressTie = primacy.rows.filter((row) => row.progressCount === 9);
    expect(progressTie.map((row) => row.place)).toEqual([progressTie[0]!.place, progressTie[0]!.place]);

    await expect(repository.getGloryBoardForTelegramUser(
      70_001n, "wrong-location", new Date("2026-08-25T12:00:00.000Z"), "glory", 0
    )).resolves.toEqual({ state: "wrong-location" });
    await expect(repository.getGloryBoardForTelegramUser(
      70_003n, "location.korchma.deep", new Date("2026-08-25T12:00:00.000Z"), "glory", 0
    )).resolves.toEqual({ state: "wrong-location" });
    await prisma.$executeRawUnsafe(
      `UPDATE users SET last_seen_location_id = 'location.korchma.deep', updated_at = CURRENT_TIMESTAMP WHERE id = 'user-c'`
    );
    await expect(repository.getGloryBoardForTelegramUser(
      70_003n, "location.korchma.deep", new Date("2026-08-25T12:00:00.000Z"), "glory", 0
    )).resolves.toEqual({ state: "not-member" });
  });

  it("keeps ordinary weekly completion in all and adventurer Chronicles but out of Important", async () => {
    const activity = new ActivityEventService(new PrismaActivityEventRepository(prisma));
    const now = new Date("2026-09-14T13:00:00.000Z");
    const [all, adventurers, important] = await Promise.all([
      activity.listRecent("all", { now }),
      activity.listRecent("adv", { now }),
      activity.listRecent("imp", { now })
    ]);
    const isWeekly = (event: { eventType: string }) => event.eventType === "guild.weekly_goal_completed";
    expect(all.events.some(isWeekly)).toBe(true);
    expect(adventurers.events.some(isWeekly)).toBe(true);
    expect(important.events.some(isWeekly)).toBe(false);
  });

  it("recovers historical User identity after Character deletion and reprojects once after recreation", async () => {
    const base = new Date("2026-10-05T12:00:00.000Z");
    for (let index = 1; index <= 13; index += 1) {
      await seedSession(prisma, `weekly-restart-${index}`, new Date(base.getTime() + index * 1_000), true);
    }
    await prisma.character.deleteMany({ where: { id: { in: ["character-a", "character-b"] } } });
    for (let index = 1; index <= 13; index += 1) {
      await repository.recordEligibleTerminalSession(`weekly-restart-${index}`);
    }
    const contribution = await prisma.guildWeeklyContribution.findUniqueOrThrow({
      where: { groupCombatSessionId: "weekly-restart-13" },
      select: { contributors: { orderBy: { userId: "asc" }, select: { userId: true, characterId: true } } }
    });
    expect(contribution.contributors).toEqual([
      { userId: "user-a", characterId: "character-a" },
      { userId: "user-b", characterId: "character-b" }
    ]);
    await prisma.$executeRawUnsafe(
      `INSERT INTO characters (id, user_id, name, class_id, race_id) VALUES
       ('character-a-recreated', 'user-a', 'Відновлена А', 'class.priest', 'race.human-ish'),
       ('character-b-recreated', 'user-b', 'Відновлений Б', 'class.warrior', 'race.dwarf')`
    );
    const candidates = await repository.listAchievementProjectionCandidates(93);
    expect(candidates.filter((row) => row.userId === "user-a").map((row) => row.characterId))
      .toContain("character-a-recreated");
    expect(candidates.filter((row) => row.userId === "user-b").map((row) => row.characterId))
      .toContain("character-b-recreated");
    expect(new Set(candidates.map((row) => row.entitlementId)).size).toBe(candidates.length);

    const trackEvent = vi.fn<AchievementService["trackEvent"]>().mockResolvedValue([]);
    const service = new GuildWeeklyGoalService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-10-05T13:00:00.000Z"),
      { trackEvent } as unknown as AchievementService
    );
    await service.getCurrentForTelegramUser(70_001n);
    const projectedCalls = trackEvent.mock.calls.length;
    expect(projectedCalls).toBeGreaterThanOrEqual(1);
    await service.getCurrentForTelegramUser(70_001n);
    expect(trackEvent).toHaveBeenCalledTimes(projectedCalls);
    const [leftClaims, rightClaims] = await Promise.all([
      service.claimAchievementNotices(13, 70_001n),
      service.claimAchievementNotices(13, 70_001n)
    ]);
    expect(leftClaims.length + rightClaims.length).toBe(projectedCalls);
    const claimed = [...leftClaims, ...rightClaims];
    for (const notice of claimed) await service.markAchievementNoticeSent(notice);
    await expect(service.claimAchievementNotices(13, 70_001n)).resolves.toEqual([]);
  });

  it("creates durable three- and thirteen-period User milestones once across repair and replay", async () => {
    const firstExtraMonday = new Date("2026-10-12T12:00:00.000Z");
    for (let index = 0; index < 9; index += 1) {
      await repository.completeCurrentForDev(
        70_001n,
        new Date(firstExtraMonday.getTime() + index * 7 * 24 * 60 * 60_000)
      );
    }
    await expect(prisma.guildWeeklyAchievementEntitlement.findMany({
      where: { userId: "user-a" },
      orderBy: { achievementId: "asc" },
      select: { achievementId: true }
    })).resolves.toEqual([
      { achievementId: "achievement.guild.thirteen-weekly-goals" },
      { achievementId: "achievement.guild.three-weekly-goals" },
      { achievementId: "achievement.guild.weekly-goal-completed" }
    ]);

    const trackEvent = vi.fn<AchievementService["trackEvent"]>().mockResolvedValue([]);
    const service = new GuildWeeklyGoalService(
      repository,
      { enabled: true, devHelpersEnabled: true },
      () => new Date("2026-12-07T13:00:00.000Z"),
      { trackEvent } as unknown as AchievementService
    );
    await service.getCurrentForTelegramUser(70_001n);
    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "guild.weekly_goal_periods",
      characterId: "character-a-recreated",
      count: 13
    }));
    const [left, right] = await Promise.all([
      service.claimAchievementNotices(13, 70_001n),
      service.claimAchievementNotices(13, 70_001n)
    ]);
    const milestoneClaims = [...left, ...right].filter((notice) =>
      notice.unlock.id === "achievement.guild.thirteen-weekly-goals"
    );
    expect(milestoneClaims).toHaveLength(1);
    await service.markAchievementNoticeSent(milestoneClaims[0]!);
    await repository.completeCurrentForDev(70_001n, new Date("2026-12-07T14:00:00.000Z"));
    await repository.recomputePeriod("12026-W50");
    await expect(prisma.guildWeeklyAchievementEntitlement.count({
      where: {
        userId: "user-a",
        achievementId: "achievement.guild.thirteen-weekly-goals"
      }
    })).resolves.toBe(1);
    await expect(service.claimAchievementNotices(13, 70_001n)).resolves.toEqual([]);
  });

  it("bounds permanent and transient Telegram retries with leases, restart-stable backoff and exact-once SENT", async () => {
    const isolatedDirectory = await mkdtemp(join(tmpdir(), "kvestarnia-weekly-outbox-"));
    const statements: string[] = [];
    const isolated = new PrismaClient({
      datasources: { db: { url: `file:${join(isolatedDirectory, "outbox.db").replace(/\\/gu, "/")}` } },
      log: [{ emit: "event", level: "query" }]
    });
    isolated.$on("query", (event: { query: string }) => statements.push(event.query));
    try {
      await createBaseSchema(isolated);
      await applySqlFile(isolated, "prisma/migrations/20260824090000_guild_weekly_goal/migration.sql");
      await seedGuild(isolated);
      const source = await new PrismaGuildWeeklyGoalRepository(isolated).completeCurrentForDev(
        70_001n,
        new Date("2026-08-25T12:00:00.000Z")
      );
      if (source.state !== "ready" || !source.progress.periodId) throw new Error("Expected dev period evidence.");
      const sourcePeriodId = source.progress.periodId;
      const dueAt = new Date("2026-08-25T13:00:00.000Z");
      const weeklyAchievementId = "achievement.guild.weekly-goal-completed";
      const existingA = await isolated.guildWeeklyAchievementEntitlement.findUniqueOrThrow({
        where: { userId_achievementId: { userId: "user-a", achievementId: weeklyAchievementId } },
        select: { id: true }
      });
      for (const [suffix, id] of [["a", existingA.id], ["b", "outbox-b"], ["c", "outbox-c"]] as const) {
        await isolated.guildWeeklyAchievementEntitlement.upsert({
          where: { userId_achievementId: { userId: `user-${suffix}`, achievementId: weeklyAchievementId } },
          create: {
            id,
            userId: `user-${suffix}`,
            achievementId: weeklyAchievementId,
            sourcePeriodId,
            sourcePeriodKey: "12026-W35",
            entitledAt: dueAt,
            projectedCharacterId: `character-${suffix}`,
            projectedRemortCount: 0,
            projectedAt: dueAt,
            notificationNextAttemptAt: dueAt
          },
          update: {
            projectedCharacterId: `character-${suffix}`,
            projectedRemortCount: 0,
            projectedAt: dueAt,
            notificationState: "PENDING",
            notificationAttemptCount: 0,
            notificationNextAttemptAt: dueAt,
            notificationClaimToken: null,
            notificationClaimedUntil: null,
            notificationPermanentFailureAt: null,
            notificationLastErrorCategory: null,
            notifiedAt: null
          }
        });
      }

      let now = dueAt;
      const makeService = () => new GuildWeeklyGoalService(
        new PrismaGuildWeeklyGoalRepository(isolated),
        { enabled: true, devHelpersEnabled: false },
        () => now
      );
      const permanentService = makeService();
      const [permanent] = await permanentService.claimAchievementNotices(
        13,
        70_001n,
        { projectEntitlements: false }
      );
      expect(permanent?.attemptCount).toBe(1);
      await permanentService.recordAchievementNoticeFailure(permanent!, { error_code: 403 });
      await expect(isolated.guildWeeklyAchievementEntitlement.findUniqueOrThrow({
        where: { id: existingA.id },
        select: { notificationState: true, notificationAttemptCount: true, notificationLastErrorCategory: true }
      })).resolves.toEqual({
        notificationState: "PERMANENT_FAILURE",
        notificationAttemptCount: 1,
        notificationLastErrorCategory: "telegram-client"
      });
      now = new Date(dueAt.getTime() + 5_000);
      await expect(makeService().claimAchievementNotices(
        13,
        70_001n,
        { projectEntitlements: false }
      )).resolves.toEqual([]);

      now = dueAt;
      const transientService = makeService();
      const [firstTransient] = await transientService.claimAchievementNotices(
        13,
        70_002n,
        { projectEntitlements: false }
      );
      await transientService.recordAchievementNoticeFailure(
        firstTransient!,
        { error_code: 429, parameters: { retry_after: 23 } }
      );
      const firstDue = new Date(dueAt.getTime() + 60_000);
      await expect(isolated.guildWeeklyAchievementEntitlement.findUniqueOrThrow({
        where: { id: "outbox-b" },
        select: { notificationState: true, notificationAttemptCount: true, notificationNextAttemptAt: true }
      })).resolves.toEqual({
        notificationState: "PENDING",
        notificationAttemptCount: 1,
        notificationNextAttemptAt: firstDue
      });
      now = new Date(firstDue.getTime() - 1);
      await expect(makeService().claimAchievementNotices(
        13,
        70_002n,
        { projectEntitlements: false }
      )).resolves.toEqual([]);

      now = firstDue;
      const restartedService = makeService();
      const [secondTransient] = await restartedService.claimAchievementNotices(
        13,
        70_002n,
        { projectEntitlements: false }
      );
      expect(secondTransient?.attemptCount).toBe(2);
      await restartedService.recordAchievementNoticeFailure(secondTransient!, { error_code: 503 });
      const secondDue = new Date(firstDue.getTime() + 120_000);
      now = new Date(secondDue.getTime() - 1);
      await expect(makeService().claimAchievementNotices(
        13,
        70_002n,
        { projectEntitlements: false }
      )).resolves.toEqual([]);
      now = secondDue;
      const [successful] = await makeService().claimAchievementNotices(
        13,
        70_002n,
        { projectEntitlements: false }
      );
      expect(successful?.attemptCount).toBe(3);
      await expect(makeService().markAchievementNoticeSent(successful!)).resolves.toBe(true);
      await expect(makeService().markAchievementNoticeSent(successful!)).resolves.toBe(false);
      await expect(isolated.guildWeeklyAchievementEntitlement.findUniqueOrThrow({
        where: { id: "outbox-b" },
        select: { notificationState: true, notificationAttemptCount: true, notifiedAt: true }
      })).resolves.toEqual({
        notificationState: "SENT",
        notificationAttemptCount: 3,
        notifiedAt: secondDue
      });

      now = dueAt;
      const concurrent = await Promise.all([
        makeService().claimAchievementNotices(13, 70_003n, { projectEntitlements: false }),
        makeService().claimAchievementNotices(13, 70_003n, { projectEntitlements: false })
      ]);
      expect(concurrent.flat()).toHaveLength(1);
      await makeService().recordAchievementNoticeFailure(concurrent.flat()[0]!, { error_code: 400 });
      await expect(isolated.guildWeeklyAchievementEntitlement.count({
        where: { userId: { in: ["user-a", "user-b", "user-c"] }, achievementId: weeklyAchievementId }
      })).resolves.toBe(3);

      statements.length = 0;
      now = new Date(secondDue.getTime() + 5_000);
      await expect(makeService().claimAchievementNotices(
        13,
        undefined,
        { projectEntitlements: false }
      )).resolves.toEqual([]);
      expect(statements).toHaveLength(1);
      expect(statements[0]).toContain("guild_weekly_achievement_entitlements");

      statements.length = 0;
      const operatorMetrics = await new PrismaGuildWeeklyGoalRepository(isolated).getMetrics();
      expect(statements).toHaveLength(9);
      expect(statements.join("\n")).not.toMatch(/telegram_user_id|character_id|claim_token|notified_at/i);
      expect(operatorMetrics.achievementNotifications).toEqual({
        pending: 0,
        claimed: 0,
        projected: 3,
        sent: 1,
        permanentFailure: 2
      });
      expect(Object.keys(operatorMetrics.reconciliations.ineligibleByReason)).toHaveLength(10);
    } finally {
      await isolated.$disconnect();
      await rm(isolatedDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }, 60_000);

  it("counts one User-week across two completed guild periods after a guild change", async () => {
    const isolatedDirectory = await mkdtemp(join(tmpdir(), "kvestarnia-weekly-user-week-"));
    const isolated = new PrismaClient({
      datasources: { db: { url: `file:${join(isolatedDirectory, "user-week.db").replace(/\\/gu, "/")}` } }
    });
    try {
      await createBaseSchema(isolated);
      await applySqlFile(isolated, "prisma/migrations/20260824090000_guild_weekly_goal/migration.sql");
      await seedGuild(isolated);
      await isolated.$executeRawUnsafe(
        `INSERT INTO guilds (id, normalized_name, display_name, crest, status, activated_at)
         VALUES ('guild-weekly-b', 'друга печатка', 'Друга Печатка', '🦊', 'active', ?)` ,
        new Date("2026-08-01T00:00:00.000Z")
      );
      const changeAt = new Date("2026-08-24T19:00:00.000Z");
      await isolated.$executeRawUnsafe(`UPDATE guild_members SET left_at = ? WHERE id = 'member-a'`, changeAt);
      await isolated.$executeRawUnsafe(
        `INSERT INTO guild_members (id, guild_id, user_id, joined_at) VALUES
         ('member-a-b', 'guild-weekly-b', 'user-a', ?),
         ('member-c-b', 'guild-weekly-b', 'user-c', ?)` ,
        changeAt,
        changeAt
      );
      const evidence = [
        ["period-cross-a", "guild-weekly", "12026-W35", new Date("2026-08-24T18:00:00.000Z")],
        ["period-cross-b", "guild-weekly-b", "12026-W35", new Date("2026-08-24T20:00:00.000Z")],
        ["period-cross-c", "guild-weekly-b", "12026-W36", new Date("2026-09-01T20:00:00.000Z")],
        ["period-cross-d", "guild-weekly-b", "12026-W37", new Date("2026-09-08T20:00:00.000Z")]
      ] as const;
      for (const row of evidence) await seedCompletedPeriodEvidence(isolated, ...row, "user-a", "character-a");
      const isolatedRepository = new PrismaGuildWeeklyGoalRepository(isolated);

      await isolatedRepository.recomputePeriod("12026-W35");
      await expect(isolated.guildWeeklyAchievementEntitlement.findMany({
        where: { userId: "user-a" },
        orderBy: { achievementId: "asc" },
        select: { achievementId: true, sourcePeriodId: true, sourcePeriodKey: true }
      })).resolves.toEqual([{
        achievementId: "achievement.guild.weekly-goal-completed",
        sourcePeriodId: "period-cross-a",
        sourcePeriodKey: "12026-W35"
      }]);
      await isolatedRepository.recomputePeriod("12026-W36");
      await expect(isolated.guildWeeklyAchievementEntitlement.count({
        where: { userId: "user-a", achievementId: "achievement.guild.three-weekly-goals" }
      })).resolves.toBe(0);
      await isolatedRepository.recomputePeriod("12026-W37");
      await expect(isolated.guildWeeklyAchievementEntitlement.findUniqueOrThrow({
        where: {
          userId_achievementId: {
            userId: "user-a",
            achievementId: "achievement.guild.three-weekly-goals"
          }
        },
        select: { sourcePeriodId: true, sourcePeriodKey: true }
      })).resolves.toEqual({ sourcePeriodId: "period-cross-d", sourcePeriodKey: "12026-W37" });
      const distinctWeeks = await isolated.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT period."period_key") AS count
        FROM "guild_weekly_contributor_receipts" AS receipt
        JOIN "guild_weekly_contributions" AS contribution ON contribution."id" = receipt."contribution_id"
        JOIN "guild_weekly_goal_periods" AS period ON period."id" = contribution."period_id"
        WHERE receipt."user_id" = 'user-a' AND period."completed_at" IS NOT NULL
      `;
      expect(Number(distinctWeeks[0]!.count)).toBe(3);
    } finally {
      await isolated.$disconnect();
      await rm(isolatedDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }, 60_000);

  it("applies, rolls back and restores the migration without touching unrelated populated rows", async () => {
    const smokeDirectory = await mkdtemp(join(tmpdir(), "kvestarnia-weekly-rollback-"));
    const smoke = new PrismaClient({ datasources: { db: { url: `file:${join(smokeDirectory, "smoke.db").replace(/\\/gu, "/")}` } } });
    try {
      await createBaseSchema(smoke);
      await smoke.$executeRawUnsafe(`INSERT INTO users (id, telegram_user_id) VALUES ('keep-user', 99001)`);
      await smoke.$executeRawUnsafe(`INSERT INTO characters (id, user_id) VALUES ('keep-character', 'keep-user')`);
      await smoke.$executeRawUnsafe(
        `INSERT INTO guilds (id, normalized_name, display_name, crest, status, activated_at)
         VALUES ('keep-guild', 'keep', 'Збережена', '🧷', 'active', CURRENT_TIMESTAMP)`
      );
      await smoke.$executeRawUnsafe(`INSERT INTO party_sessions (id) VALUES ('keep-party')`);
      await smoke.$executeRawUnsafe(
        `INSERT INTO group_combat_sessions (id, party_session_id, encounter_key, status)
         VALUES ('keep-combat', 'keep-party', 'proof.v1', 'won')`
      );
      await applySqlFile(smoke, "prisma/migrations/20260824090000_guild_weekly_goal/migration.sql");
      await applySqlFile(smoke, "prisma/migrations/20260824090000_guild_weekly_goal/rollback.sql");
      for (const [table, expected] of [["users", 1], ["characters", 1], ["guilds", 1], ["party_sessions", 1], ["group_combat_sessions", 1]] as const) {
        const rows = await smoke.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS count FROM ${table}`);
        expect(Number(rows[0]!.count)).toBe(expected);
      }
      const columns = await smoke.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info('group_combat_sessions')`);
      expect(columns.some((column) => column.name === "guild_weekly_goal_eligible")).toBe(false);
      await applySqlFile(smoke, "prisma/migrations/20260824090000_guild_weekly_goal/migration.sql");
      const restored = await smoke.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info('guild_glory_receipts')`);
      expect(restored.some((column) => column.name === "source_key")).toBe(true);
      const restoredOutbox = await smoke.$queryRawUnsafe<Array<{ name: string }>>(
        `PRAGMA table_info('guild_weekly_achievement_entitlements')`
      );
      expect(restoredOutbox.map((column) => column.name)).toEqual(expect.arrayContaining([
        "notification_state",
        "notification_attempt_count",
        "notification_next_attempt_at",
        "notification_permanent_failure_at",
        "notification_last_error_category"
      ]));
      await expect(smoke.user.count()).resolves.toBe(1);
    } finally {
      await smoke.$disconnect();
      await rm(smokeDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
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
      `INSERT INTO group_combat_participants (id, session_id, character_id, remort_count, roster_order)
       VALUES (?, ?, ?, 0, ?)`,
      `${id}-${suffix}`,
      id,
      `character-${suffix}`,
      suffix === "a" ? 0 : suffix === "b" ? 1 : 2
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO guild_weekly_participant_snapshots
        (id, session_id, user_id, character_id, remort_count, roster_order)
       VALUES (?, ?, ?, ?, 0, ?)`,
      `weekly-snapshot-${id}-${suffix}`,
      id,
      `user-${suffix}`,
      `character-${suffix}`,
      suffix === "a" ? 0 : suffix === "b" ? 1 : 2
    );
  }
}

async function seedCompletedPeriodEvidence(
  prisma: PrismaClient,
  periodId: string,
  guildId: string,
  periodKey: string,
  firstCompletedAt: Date,
  userId: string,
  characterId: string
): Promise<void> {
  const guild = await prisma.guild.findUniqueOrThrow({
    where: { id: guildId },
    select: { displayName: true, crest: true }
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO guild_weekly_goal_periods
      (id, guild_id, period_key, goal_key, guild_name_snapshot, guild_crest_snapshot,
       target_count, progress_count, updated_at)
     VALUES (?, ?, ?, 'ordinary-party-expeditions.v1', ?, ?, 13, 0, CURRENT_TIMESTAMP)`,
    periodId,
    guildId,
    periodKey,
    guild.displayName,
    guild.crest
  );
  for (let index = 0; index < 13; index += 1) {
    const sessionId = `${periodId}-session-${index}`;
    const contributionId = `${periodId}-contribution-${index}`;
    const completedAt = new Date(firstCompletedAt.getTime() + index);
    await prisma.$executeRawUnsafe(`INSERT INTO party_sessions (id) VALUES (?)`, `${sessionId}-party`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO group_combat_sessions
        (id, party_session_id, encounter_key, status, completed_at, guild_weekly_goal_eligible)
       VALUES (?, ?, 'nyz-left-passage-party.v1', 'won', ?, true)`,
      sessionId,
      `${sessionId}-party`,
      completedAt
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO guild_weekly_contributions
        (id, period_id, guild_id, group_combat_session_id, expedition_completed_at)
       VALUES (?, ?, ?, ?, ?)`,
      contributionId,
      periodId,
      guildId,
      sessionId,
      completedAt
    );
    if (index === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO guild_weekly_contributor_receipts
          (id, contribution_id, user_id, character_id, remort_count)
         VALUES (?, ?, ?, ?, 0)`,
        `${periodId}-receipt`,
        contributionId,
        userId,
        characterId
      );
    }
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
      telegram_user_id BIGINT NOT NULL UNIQUE,
      last_seen_location_id TEXT,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE characters (
      id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT 'Пригодник',
      class_id TEXT NOT NULL DEFAULT 'class.warrior',
      race_id TEXT NOT NULL DEFAULT 'race.human-ish',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE character_remorts (
      id TEXT NOT NULL PRIMARY KEY,
      character_id TEXT NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE TABLE guilds (
      id TEXT NOT NULL PRIMARY KEY,
      normalized_name TEXT NOT NULL DEFAULT '',
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
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (party_session_id) REFERENCES party_sessions(id)
    );
    CREATE TABLE group_combat_participants (
      id TEXT NOT NULL PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL,
      roster_order INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES group_combat_sessions(id),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
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
