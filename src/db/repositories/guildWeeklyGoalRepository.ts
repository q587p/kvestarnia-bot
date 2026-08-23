export interface GuildWeeklyGoalProgressRecord {
  guildId: string;
  guildName: string;
  guildCrest: string;
  periodId: string | null;
  periodKey: string;
  progressCount: number;
  targetCount: number;
  completedAt: Date | null;
  contributorCharacterIds: string[];
}

export type GuildWeeklyGoalViewResult =
  | { state: "no-character" | "not-member" }
  | { state: "ready"; progress: GuildWeeklyGoalProgressRecord };

export type GuildWeeklyContributionResult =
  | { state: "ineligible" | "not-found" }
  | {
      state: "recorded" | "replayed";
      progress: GuildWeeklyGoalProgressRecord;
      justCompleted: boolean;
    };

export interface GuildWeeklyGoalMetrics {
  periodsStarted: number;
  periodsCompleted: number;
  expeditionReceipts: number;
  contributorReceipts: number;
}

export interface GuildWeeklyGoalRepository {
  recordEligibleTerminalSession(sessionId: string): Promise<GuildWeeklyContributionResult>;
  getCurrentForTelegramUser(telegramUserId: bigint, now: Date): Promise<GuildWeeklyGoalViewResult>;
  listUnrecordedEligibleSessionIds(startsAt: Date, endsAt: Date, limit: number): Promise<string[]>;
  recomputePeriod(periodKey: string): Promise<number>;
  completeCurrentForDev(telegramUserId: bigint, now: Date): Promise<GuildWeeklyGoalViewResult>;
  getMetrics(): Promise<GuildWeeklyGoalMetrics>;
}
