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
    await expect(service.repairCurrentPeriod()).resolves.toEqual({ recorded: 0, recomputed: 0 });
    await expect(service.completeCurrentForDev(1n)).resolves.toEqual({ state: "disabled" });
    expect(repository.recordEligibleTerminalSession).not.toHaveBeenCalled();
    expect(repository.getCurrentForTelegramUser).not.toHaveBeenCalled();
  });

  it("projects completion achievements only from the authoritative completed receipt set", async () => {
    const progress = {
      guildId: "guild-1",
      guildName: "Печатка",
      guildCrest: "🦉",
      periodId: "period-1",
      periodKey: "12026-W35",
      progressCount: 13,
      targetCount: 13,
      completedAt: NOW,
      contributorCharacterIds: ["character-a", "character-b"]
    };
    const repository = repositoryMock();
    repository.recordEligibleTerminalSession.mockResolvedValue({
      state: "recorded",
      progress,
      justCompleted: true
    });
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([]);
    const service = new GuildWeeklyGoalService(repository, {
      enabled: true,
      devHelpersEnabled: false
    }, () => NOW, { trackEventSafely } as unknown as AchievementService);

    await expect(service.recordTerminalSession("session-1")).resolves.toMatchObject({ state: "recorded" });
    expect(trackEventSafely).toHaveBeenCalledTimes(2);
    expect(trackEventSafely).toHaveBeenNthCalledWith(1, {
      type: "guild.weekly_goal_completed",
      characterId: "character-a",
      occurredAt: NOW,
      sourceId: "period-1"
    });
    expect(trackEventSafely).toHaveBeenNthCalledWith(2, {
      type: "guild.weekly_goal_completed",
      characterId: "character-b",
      occurredAt: NOW,
      sourceId: "period-1"
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
    listUnrecordedEligibleSessionIds: vi.fn<GuildWeeklyGoalRepository["listUnrecordedEligibleSessionIds"]>(),
    recomputePeriod: vi.fn<GuildWeeklyGoalRepository["recomputePeriod"]>(),
    completeCurrentForDev: vi.fn<GuildWeeklyGoalRepository["completeCurrentForDev"]>(),
    getMetrics: vi.fn<GuildWeeklyGoalRepository["getMetrics"]>()
  } satisfies GuildWeeklyGoalRepository;
}
