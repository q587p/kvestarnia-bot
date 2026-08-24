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

  it.each([
    [{ error_code: 403 }, "permanent", "telegram-client", undefined],
    [{ error_code: 400 }, "permanent", "telegram-client", undefined],
    [{ error_code: 429, parameters: { retry_after: 93 } }, "retry", "telegram-rate-limited", 93_000],
    [{ error_code: 429, parameters: { retry_after: 999_999 } }, "retry", "telegram-rate-limited", 93 * 60_000],
    [{ error_code: 503 }, "retry", "telegram-server", 60_000]
  ] as const)(
    "classifies bounded Telegram delivery failure %#",
    async (error, disposition, errorCategory, expectedDelayMs) => {
      const repository = repositoryMock();
      repository.recordAchievementNotificationFailure.mockResolvedValue(
        disposition === "retry" ? "retry-scheduled" : "permanent-failure"
      );
      const service = new GuildWeeklyGoalService(repository, {
        enabled: true,
        devHelpersEnabled: false
      }, () => NOW);
      const notice = { entitlementId: "entitlement-1", claimToken: "claim-1", attemptCount: 1 };

      await service.recordAchievementNoticeFailure(notice, error);

      expect(repository.recordAchievementNotificationFailure).toHaveBeenCalledWith({
        entitlementId: "entitlement-1",
        claimToken: "claim-1",
        failedAt: NOW,
        errorCategory,
        disposition,
        ...(expectedDelayMs === undefined
          ? {}
          : { nextAttemptAt: new Date(NOW.getTime() + expectedDelayMs) })
      });
    }
  );

  it("terminalizes the thirteenth failed attempt without scheduling another retry", async () => {
    const repository = repositoryMock();
    repository.recordAchievementNotificationFailure.mockResolvedValue("permanent-failure");
    const service = new GuildWeeklyGoalService(repository, {
      enabled: true,
      devHelpersEnabled: false
    }, () => NOW);

    await service.recordAchievementNoticeFailure({
      entitlementId: "entitlement-13",
      claimToken: "claim-13",
      attemptCount: 13
    }, { error_code: 503 });

    expect(repository.recordAchievementNotificationFailure).toHaveBeenCalledWith(expect.objectContaining({
      disposition: "permanent",
      errorCategory: "delivery-attempts-exhausted"
    }));
  });

  it("does not repeat the entitlement projection scan when an idle repair tick claims its projected outbox", async () => {
    const repository = repositoryMock();
    repository.listUnreconciledTerminalSessionIds.mockResolvedValue([]);
    const service = new GuildWeeklyGoalService(repository, {
      enabled: true,
      devHelpersEnabled: false
    }, () => NOW, { trackEvent: vi.fn() } as unknown as AchievementService);

    await service.repairCurrentPeriod(13);
    await service.claimAchievementNotices(13, undefined, { projectEntitlements: false });

    expect(repository.listAchievementProjectionCandidates).toHaveBeenCalledOnce();
    expect(repository.claimAchievementNotifications).toHaveBeenCalledOnce();
  });

  it("does not duplicate the underlying achievement projection after a permanent delivery failure", async () => {
    const repository = repositoryMock();
    const candidate = {
      entitlementId: "entitlement-stable",
      achievementId: "achievement.guild.weekly-goal-completed",
      sourcePeriodId: "period-stable",
      sourcePeriodKey: "12026-W35",
      entitledAt: NOW,
      telegramUserId: 1n,
      userId: "user-stable",
      characterId: "character-stable",
      remortCount: 0,
      characterName: "Стабільна",
      classId: "class.priest",
      raceId: "race.human-ish"
    };
    repository.listAchievementProjectionCandidates
      .mockResolvedValueOnce([candidate])
      .mockResolvedValue([]);
    repository.markAchievementProjected.mockResolvedValue(true);
    repository.claimAchievementNotifications
      .mockResolvedValueOnce([{ ...candidate, claimToken: "claim-stable", attemptCount: 1 }])
      .mockResolvedValue([]);
    repository.recordAchievementNotificationFailure.mockResolvedValue("permanent-failure");
    repository.listUnreconciledTerminalSessionIds.mockResolvedValue([]);
    const trackEvent = vi.fn<AchievementService["trackEvent"]>().mockResolvedValue([]);
    const service = new GuildWeeklyGoalService(repository, {
      enabled: true,
      devHelpersEnabled: false
    }, () => NOW, { trackEvent } as unknown as AchievementService);

    await service.getCurrentForTelegramUser(1n);
    const [notice] = await service.claimAchievementNotices(13, 1n, { projectEntitlements: false });
    await service.recordAchievementNoticeFailure(notice!, { error_code: 403 });
    await service.repairCurrentPeriod(13);
    await service.claimAchievementNotices(13, 1n, { projectEntitlements: false });

    expect(trackEvent).toHaveBeenCalledOnce();
    expect(repository.markAchievementProjected).toHaveBeenCalledOnce();
    expect(repository.recordAchievementNotificationFailure).toHaveBeenCalledOnce();
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
    recordAchievementNotificationFailure: vi.fn<GuildWeeklyGoalRepository["recordAchievementNotificationFailure"]>(),
    getMetrics: vi.fn<GuildWeeklyGoalRepository["getMetrics"]>()
  } satisfies GuildWeeklyGoalRepository;
}
