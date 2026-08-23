import type {
  GuildWeeklyContributionResult,
  GuildWeeklyGoalMetrics,
  GuildWeeklyGoalRepository,
  GuildWeeklyGoalViewResult
} from "../db/repositories/guildWeeklyGoalRepository";
import { getGuildWeeklyPeriod } from "../domain/guildWeeklyGoal";
import type { AchievementService } from "./achievementService";

export class GuildWeeklyGoalService {
  constructor(
    private readonly repository: GuildWeeklyGoalRepository,
    private readonly options: { enabled: boolean; devHelpersEnabled: boolean },
    private readonly clock: () => Date = () => new Date(),
    private readonly achievements?: AchievementService
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.options.enabled && this.options.devHelpersEnabled;
  }

  async recordTerminalSession(sessionId: string): Promise<GuildWeeklyContributionResult | { state: "disabled" }> {
    if (!this.isEnabled()) return { state: "disabled" };
    const result = await this.repository.recordEligibleTerminalSession(sessionId);
    if (result.state === "recorded" || result.state === "replayed") {
      await this.projectCompletionAchievements(result.progress);
    }
    return result;
  }

  async getCurrentForTelegramUser(telegramUserId: bigint): Promise<GuildWeeklyGoalViewResult | { state: "disabled" }> {
    if (!this.isEnabled()) return { state: "disabled" };
    const result = await this.repository.getCurrentForTelegramUser(telegramUserId, this.clock());
    if (result.state === "ready") {
      await this.projectCompletionAchievements(result.progress);
    }
    return result;
  }

  async repairCurrentPeriod(limit = 13): Promise<{ recorded: number; recomputed: number }> {
    if (!this.isEnabled()) return { recorded: 0, recomputed: 0 };
    const period = getGuildWeeklyPeriod(this.clock());
    const sessionIds = await this.repository.listUnrecordedEligibleSessionIds(period.startsAt, period.endsAt, limit);
    let recorded = 0;
    for (const sessionId of sessionIds) {
      const result = await this.recordTerminalSession(sessionId);
      if (result.state === "recorded") recorded += 1;
    }
    return { recorded, recomputed: await this.repository.recomputePeriod(period.key) };
  }

  async completeCurrentForDev(telegramUserId: bigint): Promise<GuildWeeklyGoalViewResult | { state: "disabled" }> {
    if (!this.areDevHelpersEnabled()) return { state: "disabled" };
    const result = await this.repository.completeCurrentForDev(telegramUserId, this.clock());
    if (result.state === "ready") await this.projectCompletionAchievements(result.progress);
    return result;
  }

  getMetrics(): Promise<GuildWeeklyGoalMetrics> {
    return this.repository.getMetrics();
  }

  private async projectCompletionAchievements(progress: {
    periodId: string | null;
    completedAt: Date | null;
    contributorCharacterIds: string[];
  }): Promise<void> {
    if (!this.achievements || !progress.periodId || !progress.completedAt) return;
    for (const characterId of progress.contributorCharacterIds) {
      await this.achievements.trackEventSafely({
        type: "guild.weekly_goal_completed",
        characterId,
        occurredAt: progress.completedAt,
        sourceId: progress.periodId
      });
    }
  }
}
