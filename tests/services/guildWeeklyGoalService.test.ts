import { describe, expect, it, vi } from "vitest";
import type { GuildWeeklyGoalRepository } from "../../src/db/repositories/guildWeeklyGoalRepository";
import type { AchievementService } from "../../src/services/achievementService";
import { GuildWeeklyGoalService } from "../../src/services/guildWeeklyGoalService";

const NOW = new Date("2026-08-25T12:00:00.000Z");

describe("GuildWeeklyGoalService", () => {
  it("keeps the kill switch read/write isolated", async () => {
    const repository = repositoryMock();
    const service = new GuildWeeklyGoalService(repository, {
      enabled: false,
      devHelpersEnabled: true
    }, () => NOW);

    await expect(service.recordTerminalSession("session-1")).resolves.toEqual({ state: "disabled" });
    await expect(service.getCurrentForTelegramUser(1n)).resolves.toEqual({ state: "disabled" });
    await expect(service.repairCurrentPeriod()).resolves.toEqual({ recorded: 0, reconciled: 0, recomputed: 0 });
    await expect(service.completeCurrentForDev(1n)).resolves.toEqual({ state: "disabled" });
    await expect(service.getGloryBoardForTelegramUser(1n, "location.korchma.deep", "glory", 0))
      .resolves.toEqual({ state: "disabled" });
    await expect(service.claimAchievementNotices()).resolves.toEqual([]);
    expect(repository.recordEligibleTerminalSession).not.toHaveBeenCalled();
    expect(repository.getCurrentForTelegramUser).not.toHaveBeenCalled();
  });

  it("projects durable User entitlements to the current Character once", async () => {
    const progress = {
      guildId: "guild-1",
      guildName: "Печатка",
      guildCrest: "🦉",
      periodId: "period-1",
      periodKey: "12026-W35",
      progressCount: 13,
      targetCount: 13,
      completedAt: NOW,
      contributorUserIds: ["user-a", "user-b"],
      gloryTotal: 13,
      weeklyPlace: 1
    };
    const repository = repositoryMock();
    repository.recordEligibleTerminalSession.mockResolvedValue({
      state: "recorded",
      progress,
      justCompleted: true
    });
    repository.listAchievementProjectionCandidates.mockResolvedValue([
      {
        entitlementId: "entitlement-a",
        achievementId: "achievement.guild.weekly-goal-completed",
        sourcePeriodId: "period-1",
        sourcePeriodKey: "12026-W35",
        entitledAt: NOW,
        telegramUserId: 1n,
        userId: "user-a",
        characterId: "character-a-current",
        remortCount: 2,
        characterName: "А",
        classId: "class.priest",
        raceId: "race.human-ish"
      }
    ]);
    repository.markAchievementProjected.mockResolvedValue(true);
    const trackEvent = vi.fn<AchievementService["trackEvent"]>().mockResolvedValue([]);
    const service = new GuildWeeklyGoalService(repository, {
      enabled: true,
      devHelpersEnabled: false
    }, () => NOW, { trackEvent } as unknown as AchievementService);

    await expect(service.recordTerminalSession("session-1")).resolves.toMatchObject({ state: "recorded" });
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith({
      type: "guild.weekly_goal_completed",
      characterId: "character-a-current",
      occurredAt: NOW,
      sourceId: "period-1"
    });
    expect(repository.markAchievementProjected).toHaveBeenCalledWith({
      entitlementId: "entitlement-a",
      characterId: "character-a-current",
      remortCount: 2,
      projectedAt: NOW
    });
  });

  it("keeps the completion helper disabled outside an explicitly enabled non-production service", async () => {
    const repository = repositoryMock();
    const service = new GuildWeeklyGoalService(repository, {
      enabled: true,
      devHelpersEnabled: false
    }, () => NOW);

    await expect(service.completeCurrentForDev(1n)).resolves.toEqual({ state: "disabled" });
    expect(repository.completeCurrentForDev).not.toHaveBeenCalled();
  });
});

function repositoryMock() {
  return {
    recordEligibleTerminalSession: vi.fn<GuildWeeklyGoalRepository["recordEligibleTerminalSession"]>(),
    getCurrentForTelegramUser: vi.fn<GuildWeeklyGoalRepository["getCurrentForTelegramUser"]>(),
    getGloryBoardForTelegramUser: vi.fn<GuildWeeklyGoalRepository["getGloryBoardForTelegramUser"]>(),
    listUnreconciledTerminalSessionIds: vi.fn<GuildWeeklyGoalRepository["listUnreconciledTerminalSessionIds"]>(),
    recomputePeriod: vi.fn<GuildWeeklyGoalRepository["recomputePeriod"]>(),
    completeCurrentForDev: vi.fn<GuildWeeklyGoalRepository["completeCurrentForDev"]>(),
    listAchievementProjectionCandidates: vi.fn<GuildWeeklyGoalRepository["listAchievementProjectionCandidates"]>().mockResolvedValue([]),
    markAchievementProjected: vi.fn<GuildWeeklyGoalRepository["markAchievementProjected"]>(),
    claimAchievementNotifications: vi.fn<GuildWeeklyGoalRepository["claimAchievementNotifications"]>().mockResolvedValue([]),
    markAchievementNotificationSent: vi.fn<GuildWeeklyGoalRepository["markAchievementNotificationSent"]>(),
    releaseAchievementNotification: vi.fn<GuildWeeklyGoalRepository["releaseAchievementNotification"]>(),
    getMetrics: vi.fn<GuildWeeklyGoalRepository["getMetrics"]>()
  } satisfies GuildWeeklyGoalRepository;
}
