import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaDevAccountResetRepository } from "../../src/db/repositories/prismaDevAccountResetRepository";
import { PrismaGuildWeeklyGoalRepository } from "../../src/db/repositories/prismaGuildWeeklyGoalRepository";
import { PrismaAchievementRepository } from "../../src/db/repositories/prismaAchievementRepository";
import { AchievementService } from "../../src/services/achievementService";
import { GuildWeeklyGoalService } from "../../src/services/guildWeeklyGoalService";
import {
  GUILD_WEEKLY_ACHIEVEMENT_ID,
  GUILD_WEEKLY_THIRTEEN_PERIODS_ACHIEVEMENT_ID,
  GUILD_WEEKLY_THREE_PERIODS_ACHIEVEMENT_ID
} from "../../src/domain/guildWeeklyGoal";

const RESET_TELEGRAM_ID = 65_001n;
const OTHER_TELEGRAM_ID = 65_002n;

describe("PrismaDevAccountResetRepository integration", () => {
  let directory: string;
  let prisma: PrismaClient;
  let repository: PrismaDevAccountResetRepository;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "kvestarnia-dev-account-reset-"));
    const databasePath = join(directory, "test.db").replace(/\\/g, "/");
    const databaseUrl = `file:${databasePath}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await createBaseSchema(prisma);
    await applySqlFile(prisma, "prisma/migrations/20260628090000_add_achievements/migration.sql");
    await applySqlFile(prisma, "prisma/migrations/20260819090000_referral_foundation/migration.sql");
    await applySqlFile(prisma, "prisma/migrations/20260824090000_guild_weekly_goal/migration.sql");
    repository = new PrismaDevAccountResetRepository(prisma);
  }, 70_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("atomically removes the User, Character, restrictive referral/guild rows, and related Chronicle evidence", async () => {
    const resetUser = await prisma.user.create({
      data: { id: "reset-user", telegramUserId: RESET_TELEGRAM_ID, displayName: "Стерти" }
    });
    const otherUser = await prisma.user.create({
      data: { id: "other-user", telegramUserId: OTHER_TELEGRAM_ID, displayName: "Лишити" }
    });
    const resetCharacter = await seedCharacter(prisma, resetUser.id, "reset-character", "Стерти");
    const otherCharacter = await seedCharacter(prisma, otherUser.id, "other-character", "Лишити");
    const code = await prisma.referralInviteCode.create({
      data: {
        id: "reset-code",
        inviterUserId: resetUser.id,
        token: "abCD_123-xyZ7890",
        inviterNameSnapshot: resetCharacter.name
      }
    });
    const attribution = await prisma.referralAttribution.create({
      data: {
        id: "reset-attribution",
        inviterUserId: resetUser.id,
        inviteeUserId: otherUser.id,
        inviteCodeId: code.id,
        status: "ACCEPTED",
        capturedAt: new Date("2026-08-20T07:00:00.000Z"),
        acceptedAt: new Date("2026-08-20T07:01:00.000Z"),
        arrivedAt: new Date("2026-08-20T07:02:00.000Z"),
        arrivedCharacterId: otherCharacter.id,
        inviteeNameSnapshot: otherCharacter.name,
        rewardPlanVersion: 1
      }
    });
    const reward = await prisma.referralReward.create({
      data: {
        id: "reset-reward",
        attributionId: attribution.id,
        beneficiaryUserId: resetUser.id,
        rewardFamily: "DIRECT_INVITEE_LEVEL",
        milestoneKey: "LEVEL_3",
        sourceAchievementId: "achievement.level.3",
        rewardPlanVersion: 1,
        rewardGold: 50,
        rewardItemsJson: [],
        state: "PENDING",
        earnedAt: new Date("2026-08-20T07:03:00.000Z"),
        nextAttemptAt: new Date("2026-08-20T07:03:00.000Z")
      }
    });
    await prisma.referralNotificationOutbox.createMany({
      data: [
        {
          id: "reset-join-outbox",
          logicalKey: `REFERRAL_JOINED:${attribution.id}`,
          kind: "REFERRAL_JOINED",
          recipientUserId: resetUser.id,
          payloadJson: {},
          nextAttemptAt: new Date("2026-08-20T07:02:00.000Z")
        },
        {
          id: "reset-payout-outbox",
          logicalKey: `REFERRAL_PAYOUT_GRANTED:${reward.id}`,
          kind: "REFERRAL_PAYOUT_GRANTED",
          recipientUserId: resetUser.id,
          payloadJson: {},
          nextAttemptAt: new Date("2026-08-20T07:03:00.000Z")
        }
      ]
    });
    const guild = await prisma.guild.create({
      data: {
        id: "reset-guild",
        normalizedName: "стерта",
        displayName: "Стерта",
        crest: "🕳️",
        description: "Локальна",
        founderUserId: resetUser.id,
        leaderUserId: resetUser.id,
        status: "active",
        charterExpiresAt: new Date("2030-08-20T07:00:00.000Z"),
        members: {
          create: [
            {
              id: "reset-member",
              userId: resetUser.id,
              activeUserKey: resetUser.id,
              role: "leader",
              joinedAt: new Date("2026-08-20T07:00:00.000Z")
            },
            {
              id: "other-member",
              userId: otherUser.id,
              activeUserKey: otherUser.id,
              role: "member",
              joinedAt: new Date("2026-08-20T07:01:00.000Z")
            }
          ]
        }
      }
    });
    const otherGuild = await prisma.guild.create({
      data: {
        id: "other-guild",
        normalizedName: "залишена",
        displayName: "Залишена",
        crest: "🧷",
        description: "Інша локальна",
        founderUserId: otherUser.id,
        leaderUserId: otherUser.id,
        status: "active",
        charterExpiresAt: new Date("2030-08-20T07:00:00.000Z")
      }
    });
    await prisma.guildAudit.create({
      data: {
        id: "reset-subject-audit",
        guildId: otherGuild.id,
        eventType: "member.joined",
        actorUserId: otherUser.id,
        subjectUserId: resetUser.id,
        dedupeKey: "reset-subject-audit",
        occurredAt: new Date("2026-08-20T07:01:00.000Z")
      }
    });
    await prisma.activityEvent.createMany({
      data: [
        {
          id: "reset-character-event",
          eventType: "character.created",
          category: "adventurer",
          severity: "normal",
          actorCharacterId: resetCharacter.id,
          actorDisplayName: resetCharacter.name,
          sourceType: "character",
          sourceId: resetCharacter.id,
          dedupeKey: `character.created:${resetCharacter.id}`,
          occurredAt: new Date("2026-08-20T07:00:00.000Z")
        },
        {
          id: "reset-referral-event",
          eventType: "referral.arrived",
          category: "adventurer",
          severity: "normal",
          actorCharacterId: otherCharacter.id,
          actorDisplayName: otherCharacter.name,
          subjectKind: "referral-inviter",
          subjectId: resetUser.id,
          subjectName: resetCharacter.name,
          sourceType: "referral-attribution",
          sourceId: attribution.id,
          dedupeKey: `character.created:${otherCharacter.id}`,
          occurredAt: new Date("2026-08-20T07:02:00.000Z")
        },
        {
          id: "unrelated-event",
          eventType: "character.level_reached",
          category: "progression",
          severity: "normal",
          actorCharacterId: otherCharacter.id,
          actorDisplayName: otherCharacter.name,
          sourceType: "test",
          sourceId: "unrelated",
          dedupeKey: "unrelated-event",
          occurredAt: new Date("2026-08-20T07:04:00.000Z")
        }
      ]
    });
    await prisma.playerHintReceipt.create({
      data: {
        id: "reset-hint",
        telegramUserId: RESET_TELEGRAM_ID,
        key: "onboarding.example",
        shownAt: new Date("2026-08-20T07:05:00.000Z")
      }
    });

    await expect(repository.deleteEverythingByTelegramUserId(RESET_TELEGRAM_ID)).resolves.toBe(true);
    await expect(repository.deleteEverythingByTelegramUserId(RESET_TELEGRAM_ID)).resolves.toBe(false);

    await expect(prisma.user.findUnique({ where: { telegramUserId: RESET_TELEGRAM_ID } })).resolves.toBeNull();
    await expect(prisma.character.findUnique({ where: { id: resetCharacter.id } })).resolves.toBeNull();
    await expect(prisma.referralInviteCode.count()).resolves.toBe(0);
    await expect(prisma.referralAttribution.count()).resolves.toBe(0);
    await expect(prisma.referralReward.count()).resolves.toBe(0);
    await expect(prisma.referralNotificationOutbox.count()).resolves.toBe(0);
    await expect(prisma.guild.findUnique({ where: { id: guild.id } })).resolves.toBeNull();
    await expect(prisma.guild.findUnique({ where: { id: otherGuild.id } })).resolves.toMatchObject({
      displayName: "Залишена"
    });
    await expect(prisma.guildAudit.count()).resolves.toBe(0);
    await expect(prisma.activityEvent.findMany({ select: { id: true } })).resolves.toEqual([
      { id: "unrelated-event" }
    ]);
    await expect(prisma.playerHintReceipt.count({
      where: { telegramUserId: RESET_TELEGRAM_ID }
    })).resolves.toBe(0);
    await expect(prisma.user.findUnique({ where: { telegramUserId: OTHER_TELEGRAM_ID } }))
      .resolves.toMatchObject({ id: otherUser.id });
    await expect(prisma.character.findUnique({ where: { id: otherCharacter.id } }))
      .resolves.toMatchObject({ name: otherCharacter.name });

    const recreated = await prisma.user.create({
      data: { telegramUserId: RESET_TELEGRAM_ID, displayName: "З нуля" }
    });
    expect(recreated.id).not.toBe(resetUser.id);
    await expect(prisma.character.count({ where: { userId: recreated.id } })).resolves.toBe(0);
    await expect(prisma.referralAttribution.count({
      where: { OR: [{ inviterUserId: recreated.id }, { inviteeUserId: recreated.id }] }
    })).resolves.toBe(0);
  }, 30_000);

  it("removes one ordinary contributor identity and outbox without deleting unrelated completed guild evidence", async () => {
    const resetUser = await seedUser(prisma, "weekly-contributor-reset", 65_101n, "Стерти внесок");
    const owner = await seedUser(prisma, "weekly-contributor-owner", 65_102n, "Власник");
    const resetCharacter = await seedCharacter(prisma, resetUser.id, "weekly-contributor-reset-character", "Стерти внесок");
    const ownerCharacter = await seedCharacter(prisma, owner.id, "weekly-contributor-owner-character", "Власник");
    const guild = await seedGuild(prisma, "weekly-surviving-guild", owner.id, [resetUser.id, owner.id]);
    const completedAt = new Date("2026-08-24T08:13:00.000Z");
    const contributions = Array.from({ length: 13 }, (_, index) => ({
      id: `weekly-surviving-contribution-${index + 1}`,
      sessionId: `weekly-surviving-session-${index + 1}`,
      completedAt: new Date(completedAt.getTime() - (12 - index) * 60_000),
      contributors: [
        ...(index === 0 ? [{ userId: resetUser.id, characterId: resetCharacter.id }] : []),
        { userId: owner.id, characterId: ownerCharacter.id }
      ]
    }));
    const period = await seedWeeklyPeriod(prisma, {
      id: "weekly-surviving-period",
      guildId: guild.id,
      periodKey: "12026-W35",
      completedAt,
      contributions
    });
    await seedEntitlement(prisma, "weekly-reset-entitlement-1", resetUser.id, GUILD_WEEKLY_ACHIEVEMENT_ID, period.id, "12026-W35", completedAt, {
      state: "PENDING"
    });
    await seedEntitlement(prisma, "weekly-reset-entitlement-3", resetUser.id, GUILD_WEEKLY_THREE_PERIODS_ACHIEVEMENT_ID, period.id, "12026-W35", completedAt, {
      state: "CLAIMED", claimToken: "sanitized-claim-token"
    });
    await seedEntitlement(prisma, "weekly-reset-entitlement-13", resetUser.id, GUILD_WEEKLY_THIRTEEN_PERIODS_ACHIEVEMENT_ID, period.id, "12026-W35", completedAt, {
      state: "PERMANENT_FAILURE"
    });
    await seedEntitlement(prisma, "weekly-owner-entitlement", owner.id, GUILD_WEEKLY_ACHIEVEMENT_ID, period.id, "12026-W35", completedAt, {
      state: "SENT"
    });

    await expect(repository.deleteEverythingByTelegramUserId(65_101n)).resolves.toBe(true);
    await expect(repository.deleteEverythingByTelegramUserId(65_101n)).resolves.toBe(false);

    await expectWeeklyUserIdAbsent(prisma, resetUser.id);
    await expect(prisma.guild.findUnique({ where: { id: guild.id } })).resolves.toMatchObject({ id: guild.id });
    await expect(prisma.guildWeeklyGoalPeriod.findUnique({ where: { id: period.id } })).resolves.toMatchObject({
      progressCount: 13,
      completedAt
    });
    await expect(prisma.guildWeeklyContribution.count({ where: { periodId: period.id } })).resolves.toBe(13);
    await expect(prisma.guildWeeklyContributorReceipt.count({ where: { userId: owner.id } })).resolves.toBe(13);
    await expect(prisma.guildWeeklyAchievementEntitlement.findUnique({
      where: { userId_achievementId: { userId: owner.id, achievementId: GUILD_WEEKLY_ACHIEVEMENT_ID } }
    })).resolves.toMatchObject({ notificationState: "SENT" });
    await expect(prisma.guildGloryReceipt.count({ where: { periodId: period.id } })).resolves.toBe(1);
    await expect(prisma.activityEvent.count({ where: { sourceId: period.id } })).resolves.toBe(1);
    await expect(prisma.groupCombatSession.count({ where: { id: { in: contributions.map((row) => row.sessionId) } } }))
      .resolves.toBe(13);
    await expectForeignKeysValid(prisma);

    const recreated = await prisma.user.create({
      data: { telegramUserId: 65_101n, displayName: "Новий UUID" }
    });
    expect(recreated.id).not.toBe(resetUser.id);
    await expectWeeklyUserIdAbsent(prisma, recreated.id);
  }, 30_000);

  it("deletes a founder-owned weekly graph without revoking survivor entitlements or notification state", async () => {
    const founder = await seedUser(prisma, "weekly-founder-reset", 65_201n, "Засновник");
    const survivor = await seedUser(prisma, "weekly-founder-survivor", 65_202n, "Свідок");
    const unrelatedOwner = await seedUser(prisma, "weekly-unrelated-owner", 65_203n, "Інша власниця");
    const retrySurvivor = await seedUser(prisma, "weekly-retry-survivor", 65_204n, "Невідступна");
    const founderCharacter = await seedCharacter(prisma, founder.id, "weekly-founder-character", "Засновник");
    const survivorCharacter = await seedCharacter(prisma, survivor.id, "weekly-founder-survivor-character", "Свідок");
    const unrelatedCharacter = await seedCharacter(prisma, unrelatedOwner.id, "weekly-unrelated-character", "Інша власниця");
    const retryCharacter = await seedCharacter(prisma, retrySurvivor.id, "weekly-retry-character", "Невідступна");
    const ownedGuild = await seedGuild(prisma, "weekly-owned-guild", founder.id, [
      founder.id,
      survivor.id,
      retrySurvivor.id
    ]);
    const unrelatedGuild = await seedGuild(prisma, "weekly-unrelated-guild", unrelatedOwner.id, [unrelatedOwner.id]);
    const completedAt = new Date("2026-08-25T08:13:00.000Z");
    const ownedContributions = Array.from({ length: 13 }, (_, index) => ({
      id: `weekly-owned-contribution-${index + 1}`,
      sessionId: `weekly-owned-session-${index + 1}`,
      completedAt: new Date(completedAt.getTime() - (12 - index) * 60_000),
      contributors: [
        { userId: founder.id, characterId: founderCharacter.id },
        { userId: survivor.id, characterId: survivorCharacter.id },
        { userId: retrySurvivor.id, characterId: retryCharacter.id }
      ]
    }));
    const ownedPeriod = await seedWeeklyPeriod(prisma, {
      id: "weekly-owned-period",
      guildId: ownedGuild.id,
      periodKey: "12026-W35",
      completedAt,
      contributions: ownedContributions
    });
    await seedEntitlement(prisma, "weekly-owned-founder-entitlement", founder.id, GUILD_WEEKLY_ACHIEVEMENT_ID, ownedPeriod.id, "12026-W35", completedAt, {
      state: "CLAIMED", claimToken: "owned-claim"
    });
    const survivorNotifiedAt = new Date(completedAt.getTime() + 60_000);
    await seedEntitlement(prisma, "weekly-owned-survivor-entitlement", survivor.id, GUILD_WEEKLY_ACHIEVEMENT_ID, ownedPeriod.id, "12026-W35", completedAt, {
      state: "SENT",
      attemptCount: 3,
      nextAttemptAt: new Date(completedAt.getTime() + 23_000),
      projectedCharacterId: survivorCharacter.id,
      projectedAt: completedAt,
      notifiedAt: survivorNotifiedAt
    });
    await prisma.characterAchievement.create({
      data: {
        id: "weekly-owned-survivor-character-achievement",
        characterId: survivorCharacter.id,
        achievementId: GUILD_WEEKLY_ACHIEVEMENT_ID,
        sourceType: "guild.weekly_goal_completed",
        sourceId: ownedPeriod.id,
        unlockedAt: completedAt,
        notifiedAt: survivorNotifiedAt
      }
    });
    const retryNextAttemptAt = new Date(completedAt.getTime() + 120_000);
    const retryClaimedUntil = new Date(completedAt.getTime() + 180_000);
    await seedEntitlement(prisma, "weekly-owned-retry-entitlement", retrySurvivor.id, GUILD_WEEKLY_ACHIEVEMENT_ID, ownedPeriod.id, "12026-W35", completedAt, {
      state: "CLAIMED",
      claimToken: "survivor-active-claim",
      attemptCount: 4,
      nextAttemptAt: retryNextAttemptAt,
      claimedUntil: retryClaimedUntil,
      projectedCharacterId: retryCharacter.id,
      projectedAt: completedAt
    });
    const unrelatedCompletedAt = new Date("2026-08-25T10:13:00.000Z");
    const unrelatedContributions = Array.from({ length: 13 }, (_, index) => ({
      id: `weekly-unrelated-contribution-${index + 1}`,
      sessionId: `weekly-unrelated-session-${index + 1}`,
      completedAt: new Date(unrelatedCompletedAt.getTime() - (12 - index) * 60_000),
      contributors: [
        { userId: survivor.id, characterId: survivorCharacter.id },
        { userId: unrelatedOwner.id, characterId: unrelatedCharacter.id }
      ]
    }));
    const unrelatedPeriod = await seedWeeklyPeriod(prisma, {
      id: "weekly-unrelated-period",
      guildId: unrelatedGuild.id,
      periodKey: "12026-W35",
      completedAt: unrelatedCompletedAt,
      contributions: unrelatedContributions
    });
    const survivorEntitlementBefore = await selectEntitlementState(
      prisma,
      "weekly-owned-survivor-entitlement"
    );
    const retryEntitlementBefore = await selectEntitlementState(
      prisma,
      "weekly-owned-retry-entitlement"
    );

    await expect(repository.deleteEverythingByTelegramUserId(65_201n)).resolves.toBe(true);
    await expect(repository.deleteEverythingByTelegramUserId(65_201n)).resolves.toBe(false);

    await expectWeeklyUserIdAbsent(prisma, founder.id);
    await expect(prisma.guild.findUnique({ where: { id: ownedGuild.id } })).resolves.toBeNull();
    await expect(prisma.guildWeeklyGoalPeriod.count({ where: { guildId: ownedGuild.id } })).resolves.toBe(0);
    await expect(prisma.guildWeeklyContribution.count({ where: { guildId: ownedGuild.id } })).resolves.toBe(0);
    await expect(prisma.guildGloryReceipt.count({ where: { guildId: ownedGuild.id } })).resolves.toBe(0);
    await expect(prisma.activityEvent.count({ where: { sourceId: ownedPeriod.id } })).resolves.toBe(0);
    await expect(prisma.guildWeeklyAchievementEntitlement.findUnique({
      where: { id: "weekly-owned-founder-entitlement" }
    })).resolves.toBeNull();
    await expect(selectEntitlementState(prisma, "weekly-owned-survivor-entitlement"))
      .resolves.toEqual(survivorEntitlementBefore);
    await expect(selectEntitlementState(prisma, "weekly-owned-retry-entitlement"))
      .resolves.toEqual(retryEntitlementBefore);
    await expect(prisma.guildWeeklyAchievementEntitlement.count({
      where: { userId: survivor.id, achievementId: GUILD_WEEKLY_ACHIEVEMENT_ID }
    })).resolves.toBe(1);
    expect(survivorEntitlementBefore).toMatchObject({
      id: "weekly-owned-survivor-entitlement",
      userId: survivor.id,
      achievementId: GUILD_WEEKLY_ACHIEVEMENT_ID,
      sourcePeriodId: ownedPeriod.id,
      sourcePeriodKey: "12026-W35",
      entitledAt: completedAt,
      notificationState: "SENT",
      notificationAttemptCount: 3,
      notifiedAt: survivorNotifiedAt
    });
    expect(retryEntitlementBefore).toMatchObject({
      id: "weekly-owned-retry-entitlement",
      userId: retrySurvivor.id,
      sourcePeriodId: ownedPeriod.id,
      notificationState: "CLAIMED",
      notificationAttemptCount: 4,
      notificationNextAttemptAt: retryNextAttemptAt,
      notificationClaimToken: "survivor-active-claim",
      notificationClaimedUntil: retryClaimedUntil
    });
    await expect(prisma.groupCombatSession.count({
      where: {
        id: { in: ownedContributions.map((row) => row.sessionId) },
        guildWeeklyGoalEligible: false
      }
    })).resolves.toBe(13);
    await expect(prisma.guildWeeklyReconciliation.count({
      where: { sessionId: { in: ownedContributions.map((row) => row.sessionId) } }
    })).resolves.toBe(0);
    await expect(prisma.guildWeeklyParticipantSnapshot.count({
      where: { sessionId: { in: ownedContributions.map((row) => row.sessionId) } }
    })).resolves.toBe(0);
    await expect(prisma.partySession.count({
      where: { id: { in: ownedContributions.map((row) => `party:${row.sessionId}`) } }
    })).resolves.toBe(13);
    await expect(prisma.guild.findUnique({ where: { id: unrelatedGuild.id } })).resolves.toMatchObject({ id: unrelatedGuild.id });
    await expect(prisma.guildWeeklyGoalPeriod.findUnique({ where: { id: unrelatedPeriod.id } })).resolves.toMatchObject({
      progressCount: 13,
      completedAt: unrelatedCompletedAt
    });
    await expect(prisma.groupCombatSession.findUnique({
      where: { id: "weekly-unrelated-session-1" },
      select: { id: true, guildWeeklyGoalEligible: true }
    }))
      .resolves.toMatchObject({ guildWeeklyGoalEligible: true });
    const weeklyRepository = new PrismaGuildWeeklyGoalRepository(prisma);
    await expect(weeklyRepository.recomputePeriod("12026-W35")).resolves.toBe(0);
    await expect(selectEntitlementState(prisma, "weekly-owned-survivor-entitlement"))
      .resolves.toEqual(survivorEntitlementBefore);
    const retryService = new GuildWeeklyGoalService(
      weeklyRepository,
      { enabled: true, devHelpersEnabled: false },
      () => new Date(retryClaimedUntil.getTime() - 1)
    );
    await expect(retryService.claimAchievementNotices(
      13,
      65_204n,
      { projectEntitlements: false }
    )).resolves.toEqual([]);
    const replay = await new PrismaGuildWeeklyGoalRepository(prisma)
      .recordEligibleTerminalSession(ownedContributions[0]!.sessionId);
    expect(replay).toEqual({
      state: "ineligible",
      reason: "feature-not-frozen",
      periodKey: "12026-W35"
    });
    await expect(prisma.guildWeeklyReconciliation.findUnique({
      where: { sessionId: ownedContributions[0]!.sessionId }
    })).resolves.toMatchObject({ decision: "ineligible", reason: "feature-not-frozen" });

    await prisma.character.delete({ where: { id: survivorCharacter.id } });
    await expect(prisma.characterAchievement.count({
      where: { characterId: survivorCharacter.id }
    })).resolves.toBe(0);
    const recreatedCharacter = await seedCharacter(
      prisma,
      survivor.id,
      "weekly-founder-survivor-character-recreated",
      "Свідок знову"
    );
    const projectionNow = new Date("2026-08-25T12:13:00.000Z");
    const projectionService = new GuildWeeklyGoalService(
      weeklyRepository,
      { enabled: true, devHelpersEnabled: false },
      () => projectionNow,
      new AchievementService(new PrismaAchievementRepository(prisma))
    );
    await expect(projectionService.getCurrentForTelegramUser(65_202n)).resolves.toMatchObject({
      state: "not-member"
    });
    await expect(projectionService.getCurrentForTelegramUser(65_202n)).resolves.toMatchObject({
      state: "not-member"
    });
    await expect(prisma.characterAchievement.findMany({
      where: {
        characterId: recreatedCharacter.id,
        achievementId: GUILD_WEEKLY_ACHIEVEMENT_ID
      },
      select: { achievementId: true, sourceId: true, unlockedAt: true }
    })).resolves.toEqual([{
      achievementId: GUILD_WEEKLY_ACHIEVEMENT_ID,
      sourceId: ownedPeriod.id,
      unlockedAt: completedAt
    }]);
    await expect(projectionService.claimAchievementNotices(13, 65_202n)).resolves.toEqual([]);
    await expect(prisma.guildWeeklyAchievementEntitlement.count({
      where: { userId: survivor.id, achievementId: GUILD_WEEKLY_ACHIEVEMENT_ID }
    })).resolves.toBe(1);
    await expect(prisma.guildWeeklyAchievementEntitlement.findUniqueOrThrow({
      where: { id: "weekly-owned-survivor-entitlement" },
      select: {
        id: true,
        sourcePeriodId: true,
        sourcePeriodKey: true,
        entitledAt: true,
        projectedCharacterId: true,
        projectedRemortCount: true,
        projectedAt: true,
        notificationState: true,
        notificationAttemptCount: true,
        notificationNextAttemptAt: true,
        notificationClaimToken: true,
        notificationClaimedUntil: true,
        notificationPermanentFailureAt: true,
        notificationLastErrorCategory: true,
        notifiedAt: true
      }
    })).resolves.toEqual({
      id: "weekly-owned-survivor-entitlement",
      sourcePeriodId: ownedPeriod.id,
      sourcePeriodKey: "12026-W35",
      entitledAt: completedAt,
      projectedCharacterId: recreatedCharacter.id,
      projectedRemortCount: 0,
      projectedAt: projectionNow,
      notificationState: "SENT",
      notificationAttemptCount: 3,
      notificationNextAttemptAt: new Date(completedAt.getTime() + 23_000),
      notificationClaimToken: null,
      notificationClaimedUntil: null,
      notificationPermanentFailureAt: null,
      notificationLastErrorCategory: null,
      notifiedAt: survivorNotifiedAt
    });
    await expectForeignKeysValid(prisma);
  }, 60_000);

  it("clears a surviving dev override and recomputes incomplete and receipt-complete periods", async () => {
    const resetUser = await seedUser(prisma, "weekly-override-reset", 65_301n, "Перевизначення");
    const owner = await seedUser(prisma, "weekly-override-owner", 65_302n, "Власниця");
    await seedCharacter(prisma, resetUser.id, "weekly-override-reset-character", "Перевизначення");
    const ownerCharacter = await seedCharacter(prisma, owner.id, "weekly-override-owner-character", "Власниця");
    const guild = await seedGuild(prisma, "weekly-override-guild", owner.id, [resetUser.id, owner.id]);
    const overrideAt = new Date("2026-09-01T10:13:00.000Z");
    const overrideOnly = await seedWeeklyPeriod(prisma, {
      id: "weekly-override-only-period",
      guildId: guild.id,
      periodKey: "12026-W36",
      completedAt: overrideAt,
      devOverrideUserId: resetUser.id,
      devOverrideCompletedAt: overrideAt,
      contributions: []
    });
    await seedEntitlement(prisma, "weekly-override-only-entitlement", resetUser.id, GUILD_WEEKLY_ACHIEVEMENT_ID, overrideOnly.id, "12026-W36", overrideAt, {
      state: "PENDING"
    });
    const realOverrideAt = new Date("2026-09-08T10:13:00.000Z");
    const receiptCompletedAt = new Date("2026-09-08T12:13:00.000Z");
    const realContributions = Array.from({ length: 13 }, (_, index) => ({
      id: `weekly-real-contribution-${index + 1}`,
      sessionId: `weekly-real-session-${index + 1}`,
      completedAt: new Date(receiptCompletedAt.getTime() - (12 - index) * 60_000),
      contributors: [{ userId: owner.id, characterId: ownerCharacter.id }]
    }));
    const realPeriod = await seedWeeklyPeriod(prisma, {
      id: "weekly-real-period",
      guildId: guild.id,
      periodKey: "12026-W37",
      completedAt: realOverrideAt,
      devOverrideUserId: resetUser.id,
      devOverrideCompletedAt: realOverrideAt,
      contributions: realContributions
    });
    await expect(repository.deleteEverythingByTelegramUserId(65_301n)).resolves.toBe(true);

    await expectWeeklyUserIdAbsent(prisma, resetUser.id);
    await expect(prisma.guildWeeklyGoalPeriod.findUnique({ where: { id: overrideOnly.id } })).resolves.toMatchObject({
      progressCount: 0,
      completedAt: null,
      devOverrideCompletedAt: null,
      devOverrideUserId: null
    });
    await expect(prisma.guildGloryReceipt.count({ where: { periodId: overrideOnly.id } })).resolves.toBe(0);
    await expect(prisma.activityEvent.count({ where: { sourceId: overrideOnly.id } })).resolves.toBe(0);
    await expect(prisma.guildWeeklyGoalPeriod.findUnique({ where: { id: realPeriod.id } })).resolves.toMatchObject({
      progressCount: 13,
      completedAt: receiptCompletedAt,
      devOverrideCompletedAt: null,
      devOverrideUserId: null
    });
    await expect(prisma.guildGloryReceipt.findUnique({ where: { periodId: realPeriod.id } })).resolves.toMatchObject({
      amount: 13,
      awardedAt: receiptCompletedAt
    });
    await expect(prisma.activityEvent.findUnique({
      where: { dedupeKey: `guild.weekly_goal_completed:${realPeriod.id}` }
    })).resolves.toMatchObject({ occurredAt: receiptCompletedAt });
    await expectForeignKeysValid(prisma);
  }, 30_000);

  it("rolls the complete weekly cleanup back when the final User deletion fails", async () => {
    const resetUser = await seedUser(prisma, "weekly-rollback-reset", 65_401n, "Відкотити");
    const owner = await seedUser(prisma, "weekly-rollback-owner", 65_402n, "Зберегти");
    await seedCharacter(prisma, resetUser.id, "weekly-rollback-character", "Відкотити");
    const guild = await seedGuild(prisma, "weekly-rollback-guild", owner.id, [resetUser.id, owner.id]);
    const overrideAt = new Date("2026-09-15T13:13:00.000Z");
    const period = await seedWeeklyPeriod(prisma, {
      id: "weekly-rollback-period",
      guildId: guild.id,
      periodKey: "12026-W38",
      completedAt: overrideAt,
      devOverrideUserId: resetUser.id,
      devOverrideCompletedAt: overrideAt,
      contributions: []
    });
    await seedEntitlement(prisma, "weekly-rollback-entitlement", resetUser.id, GUILD_WEEKLY_ACHIEVEMENT_ID, period.id, "12026-W38", overrideAt, {
      state: "CLAIMED", claimToken: "rollback-claim"
    });
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS dev_reset_blockers (
        user_id TEXT PRIMARY KEY,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
      )
    `);
    await prisma.$executeRawUnsafe("INSERT INTO dev_reset_blockers (user_id) VALUES (?)", resetUser.id);

    await expect(repository.deleteEverythingByTelegramUserId(65_401n)).rejects.toBeDefined();

    await expect(prisma.user.findUnique({ where: { id: resetUser.id } })).resolves.toMatchObject({ id: resetUser.id });
    await expect(prisma.guildWeeklyGoalPeriod.findUnique({ where: { id: period.id } })).resolves.toMatchObject({
      completedAt: overrideAt,
      devOverrideUserId: resetUser.id
    });
    await expect(prisma.guildGloryReceipt.count({ where: { periodId: period.id } })).resolves.toBe(1);
    await expect(prisma.guildWeeklyAchievementEntitlement.findUnique({
      where: { userId_achievementId: { userId: resetUser.id, achievementId: GUILD_WEEKLY_ACHIEVEMENT_ID } }
    })).resolves.toMatchObject({ notificationClaimToken: "rollback-claim" });
    await prisma.$executeRawUnsafe("DELETE FROM dev_reset_blockers WHERE user_id = ?", resetUser.id);
    await expect(repository.deleteEverythingByTelegramUserId(65_401n)).resolves.toBe(true);
    await expectForeignKeysValid(prisma);
  }, 30_000);
});

async function seedUser(prisma: PrismaClient, id: string, telegramUserId: bigint, displayName: string) {
  return prisma.user.create({ data: { id, telegramUserId, displayName } });
}

async function seedGuild(
  prisma: PrismaClient,
  id: string,
  ownerUserId: string,
  memberUserIds: readonly string[]
) {
  return prisma.guild.create({
    data: {
      id,
      normalizedName: id,
      displayName: id,
      crest: "🧷",
      description: "Ізольована QA-ґільдія",
      founderUserId: ownerUserId,
      leaderUserId: ownerUserId,
      status: "active",
      activatedAt: new Date("2026-08-01T00:00:00.000Z"),
      charterExpiresAt: new Date("2030-08-01T00:00:00.000Z"),
      members: {
        create: memberUserIds.map((userId, index) => ({
          id: `${id}:member:${index}`,
          userId,
          activeUserKey: userId,
          role: userId === ownerUserId ? "leader" : "member",
          joinedAt: new Date("2026-08-01T00:00:00.000Z")
        }))
      }
    }
  });
}

interface WeeklyContributionSeed {
  id: string;
  sessionId: string;
  completedAt: Date;
  contributors: Array<{ userId: string; characterId: string }>;
}

async function seedWeeklyPeriod(prisma: PrismaClient, input: {
  id: string;
  guildId: string;
  periodKey: string;
  completedAt: Date | null;
  devOverrideCompletedAt?: Date;
  devOverrideUserId?: string;
  contributions: WeeklyContributionSeed[];
}) {
  const period = await prisma.guildWeeklyGoalPeriod.create({
    data: {
      id: input.id,
      guildId: input.guildId,
      periodKey: input.periodKey,
      goalKey: "ordinary-party-expeditions.v1",
      guildNameSnapshot: input.guildId,
      guildCrestSnapshot: "🧷",
      targetCount: 13,
      progressCount: input.completedAt ? 13 : Math.min(input.contributions.length, 13),
      completedAt: input.completedAt,
      devOverrideCompletedAt: input.devOverrideCompletedAt,
      devOverrideUserId: input.devOverrideUserId
    }
  });
  for (const contribution of input.contributions) {
    await seedCombatSession(prisma, contribution);
    await prisma.guildWeeklyContribution.create({
      data: {
        id: contribution.id,
        periodId: period.id,
        guildId: input.guildId,
        groupCombatSessionId: contribution.sessionId,
        expeditionCompletedAt: contribution.completedAt,
        contributors: {
          create: contribution.contributors.map((contributor, index) => ({
            id: `${contribution.id}:receipt:${index}`,
            userId: contributor.userId,
            characterId: contributor.characterId,
            remortCount: 0
          }))
        }
      }
    });
    await prisma.guildWeeklyParticipantSnapshot.createMany({
      data: contribution.contributors.map((contributor, index) => ({
        id: `${contribution.id}:snapshot:${index}`,
        sessionId: contribution.sessionId,
        userId: contributor.userId,
        characterId: contributor.characterId,
        remortCount: 0,
        rosterOrder: index
      }))
    });
    await prisma.guildWeeklyReconciliation.create({
      data: {
        id: `${contribution.id}:reconciliation`,
        sessionId: contribution.sessionId,
        decision: "credited",
        reason: "credited",
        periodKey: input.periodKey,
        reconciledAt: contribution.completedAt
      }
    });
  }
  if (input.completedAt) {
    await prisma.guildGloryReceipt.create({
      data: {
        id: `${input.id}:glory`,
        guildId: input.guildId,
        periodId: input.id,
        sourceKey: `guild-weekly-goal:${input.id}`,
        amount: 13,
        awardedAt: input.completedAt
      }
    });
    await prisma.activityEvent.create({
      data: {
        id: `${input.id}:chronicle`,
        eventType: "guild.weekly_goal_completed",
        category: "adventurer",
        severity: "normal",
        subjectKind: "guild",
        subjectId: input.guildId,
        subjectName: input.guildId,
        sourceType: "guild-weekly-goal",
        sourceId: input.id,
        dedupeKey: `guild.weekly_goal_completed:${input.id}`,
        payloadJson: { crest: "🧷", periodKey: input.periodKey, glory: 13 },
        occurredAt: input.completedAt
      }
    });
  }
  return period;
}

async function seedCombatSession(prisma: PrismaClient, contribution: WeeklyContributionSeed): Promise<void> {
  const partyId = `party:${contribution.sessionId}`;
  await prisma.$executeRawUnsafe("INSERT INTO party_sessions (id) VALUES (?)", partyId);
  await prisma.$executeRawUnsafe(
    `INSERT INTO group_combat_sessions (
      id, party_session_id, encounter_key, status, completed_at, settlement_plan_json,
      updated_at, guild_weekly_goal_eligible
    ) VALUES (?, ?, 'nyz-left-passage-party.v1', 'won', ?, NULL, ?, true)`,
    contribution.sessionId,
    partyId,
    contribution.completedAt,
    contribution.completedAt
  );
  for (const [index, contributor] of contribution.contributors.entries()) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO group_combat_participants (
        id, session_id, character_id, remort_count, roster_order
      ) VALUES (?, ?, ?, 0, ?)`,
      `${contribution.sessionId}:participant:${index}`,
      contribution.sessionId,
      contributor.characterId,
      index
    );
  }
}

async function seedEntitlement(
  prisma: PrismaClient,
  id: string,
  userId: string,
  achievementId: string,
  sourcePeriodId: string,
  sourcePeriodKey: string,
  entitledAt: Date,
  notification: {
    state: "PENDING" | "CLAIMED" | "SENT" | "PERMANENT_FAILURE";
    claimToken?: string;
    attemptCount?: number;
    nextAttemptAt?: Date;
    claimedUntil?: Date;
    permanentFailureAt?: Date;
    lastErrorCategory?: string;
    notifiedAt?: Date;
    projectedCharacterId?: string;
    projectedRemortCount?: number;
    projectedAt?: Date;
  }
): Promise<void> {
  await prisma.guildWeeklyAchievementEntitlement.create({
    data: {
      id,
      userId,
      achievementId,
      sourcePeriodId,
      sourcePeriodKey,
      entitledAt,
      projectedCharacterId: notification.projectedCharacterId,
      projectedRemortCount: notification.projectedCharacterId
        ? notification.projectedRemortCount ?? 0
        : null,
      projectedAt: notification.projectedAt,
      notificationState: notification.state,
      notificationAttemptCount: notification.attemptCount ?? 0,
      notificationNextAttemptAt: notification.nextAttemptAt ?? entitledAt,
      notificationClaimToken: notification.claimToken,
      notificationClaimedUntil: notification.claimedUntil ?? (notification.state === "CLAIMED"
        ? new Date(entitledAt.getTime() + 93_000)
        : null),
      notificationPermanentFailureAt: notification.permanentFailureAt
        ?? (notification.state === "PERMANENT_FAILURE" ? entitledAt : null),
      notificationLastErrorCategory: notification.lastErrorCategory,
      notifiedAt: notification.notifiedAt ?? (notification.state === "SENT"
        ? entitledAt
        : null)
    }
  });
}

function selectEntitlementState(prisma: PrismaClient, id: string) {
  return prisma.guildWeeklyAchievementEntitlement.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      userId: true,
      achievementId: true,
      sourcePeriodId: true,
      sourcePeriodKey: true,
      entitledAt: true,
      projectedCharacterId: true,
      projectedRemortCount: true,
      projectedAt: true,
      notificationState: true,
      notificationAttemptCount: true,
      notificationNextAttemptAt: true,
      notificationClaimToken: true,
      notificationClaimedUntil: true,
      notificationPermanentFailureAt: true,
      notificationLastErrorCategory: true,
      notifiedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

async function expectWeeklyUserIdAbsent(prisma: PrismaClient, userId: string): Promise<void> {
  const [entitlements, receipts, snapshots, devOverrides] = await Promise.all([
    prisma.guildWeeklyAchievementEntitlement.count({ where: { userId } }),
    prisma.guildWeeklyContributorReceipt.count({ where: { userId } }),
    prisma.guildWeeklyParticipantSnapshot.count({ where: { userId } }),
    prisma.guildWeeklyGoalPeriod.count({ where: { devOverrideUserId: userId } })
  ]);
  expect({ entitlements, receipts, snapshots, devOverrides }).toEqual({
    entitlements: 0,
    receipts: 0,
    snapshots: 0,
    devOverrides: 0
  });
}

async function expectForeignKeysValid(prisma: PrismaClient): Promise<void> {
  const violations = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>("PRAGMA foreign_key_check");
  expect(violations).toEqual([]);
}

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  characterId: string,
  name: string
) {
  return prisma.character.create({
    data: {
      id: characterId,
      userId,
      name,
      raceId: "race.human-ish",
      classId: "class.warrior",
      statsJson: { strength: 5, dexterity: 5, intelligence: 5, charisma: 5, luck: 5 }
    }
  });
}

async function createBaseSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL UNIQUE, username TEXT,
      display_name TEXT, language_code TEXT, last_action_at DATETIME, last_seen_location_id TEXT,
      current_raid_id TEXT, current_adventure_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      pronoun TEXT NOT NULL DEFAULT 'they', path TEXT NOT NULL DEFAULT 'boundary',
      race_id TEXT NOT NULL, class_id TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0, gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25, hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10, mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME, mana_regen_at DATETIME, active_cosmetic_title_grant_id TEXT,
      stats_json JSONB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE activity_events (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'public', actor_character_id TEXT, actor_display_name TEXT,
      related_character_ids_json JSONB, subject_kind TEXT, subject_id TEXT, subject_name TEXT,
      source_type TEXT, source_id TEXT, dedupe_key TEXT UNIQUE, payload_json JSONB,
      occurred_at DATETIME NOT NULL, published_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE guilds (
      id TEXT PRIMARY KEY, normalized_name TEXT NOT NULL, reservation_key TEXT UNIQUE,
      display_name TEXT NOT NULL, crest TEXT NOT NULL, crest_kind TEXT NOT NULL DEFAULT 'catalog',
      crest_reservation_key TEXT UNIQUE, crest_file_id TEXT, crest_file_unique_id TEXT,
      crest_width INTEGER, crest_height INTEGER, crest_file_size INTEGER,
      description TEXT NOT NULL, founder_user_id TEXT NOT NULL, leader_user_id TEXT NOT NULL,
      leadership_nominee_user_id TEXT, leadership_offered_at DATETIME,
      status TEXT NOT NULL DEFAULT 'forming', version INTEGER NOT NULL DEFAULT 1,
      charter_expires_at DATETIME NOT NULL, activated_at DATETIME, activated_by_invite_id TEXT,
      disbanded_at DATETIME, name_release_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (founder_user_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (leadership_nominee_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE guild_members (
      id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      active_user_key TEXT UNIQUE, role TEXT NOT NULL DEFAULT 'member', joined_at DATETIME NOT NULL,
      left_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE guild_audits (
      id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, event_type TEXT NOT NULL,
      actor_user_id TEXT, subject_user_id TEXT, dedupe_key TEXT NOT NULL UNIQUE,
      payload_json JSONB, occurred_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE player_hint_receipts (
      id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL, key TEXT NOT NULL,
      shown_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (telegram_user_id, key)
    )`,
    `CREATE TABLE party_sessions (
      id TEXT PRIMARY KEY
    )`,
    `CREATE TABLE group_combat_sessions (
      id TEXT PRIMARY KEY, party_session_id TEXT NOT NULL UNIQUE,
      encounter_key TEXT NOT NULL, status TEXT NOT NULL, completed_at DATETIME,
      settlement_plan_json JSONB, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (party_session_id) REFERENCES party_sessions(id)
    )`,
    `CREATE TABLE group_combat_participants (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL, roster_order INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES group_combat_sessions(id),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function applySqlFile(prisma: PrismaClient, path: string): Promise<void> {
  const sql = await readFile(resolve(path), "utf8");
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}
