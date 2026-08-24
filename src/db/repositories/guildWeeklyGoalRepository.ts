export interface GuildWeeklyGoalProgressRecord {
  guildId: string;
  guildName: string;
  guildCrest: string;
  periodId: string | null;
  periodKey: string;
  progressCount: number;
  targetCount: number;
  completedAt: Date | null;
  contributorUserIds: string[];
  gloryTotal: number;
  weeklyPlace: number;
}

export type GuildWeeklyGoalViewResult =
  | { state: "no-character" | "not-member" }
  | { state: "ready"; progress: GuildWeeklyGoalProgressRecord };

export type GuildWeeklyContributionResult =
  | { state: "not-found" }
  | { state: "ineligible"; reason: string; periodKey: string | null }
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
  reconciliationDecisions: number;
  gloryReceipts: number;
  achievementEntitlements: number;
}

export type GuildGloryBoardView = "glory" | "primacy";

export interface GuildGloryBoardEntry {
  guildId: string;
  guildName: string;
  guildCrest: string;
  place: number;
  glory: number;
  progressCount: number;
  targetCount: number;
  completed: boolean;
  viewerGuild: boolean;
}

export type GuildGloryBoardResult =
  | { state: "no-character" | "wrong-location" | "not-member" }
  | {
      state: "ready";
      view: GuildGloryBoardView;
      periodKey: string;
      rows: GuildGloryBoardEntry[];
      viewerGuild: GuildGloryBoardEntry;
      page: number;
      hasPreviousPage: boolean;
      hasNextPage: boolean;
    };

export interface GuildWeeklyAchievementProjectionCandidate {
  entitlementId: string;
  achievementId: string;
  sourcePeriodId: string;
  sourcePeriodKey: string;
  entitledAt: Date;
  telegramUserId: bigint;
  userId: string;
  characterId: string;
  remortCount: number;
  characterName: string;
  classId: string;
  raceId: string;
}

export interface ClaimedGuildWeeklyAchievementNotification
  extends GuildWeeklyAchievementProjectionCandidate {
  claimToken: string;
}

export interface GuildWeeklyGoalRepository {
  recordEligibleTerminalSession(sessionId: string): Promise<GuildWeeklyContributionResult>;
  getCurrentForTelegramUser(telegramUserId: bigint, now: Date): Promise<GuildWeeklyGoalViewResult>;
  getGloryBoardForTelegramUser(
    telegramUserId: bigint,
    expectedLocationId: string,
    now: Date,
    view: GuildGloryBoardView,
    page: number
  ): Promise<GuildGloryBoardResult>;
  listUnreconciledTerminalSessionIds(limit: number): Promise<string[]>;
  recomputePeriod(periodKey: string): Promise<number>;
  completeCurrentForDev(telegramUserId: bigint, now: Date): Promise<GuildWeeklyGoalViewResult>;
  listAchievementProjectionCandidates(
    limit: number,
    telegramUserId?: bigint
  ): Promise<GuildWeeklyAchievementProjectionCandidate[]>;
  markAchievementProjected(input: {
    entitlementId: string;
    characterId: string;
    remortCount: number;
    projectedAt: Date;
  }): Promise<boolean>;
  claimAchievementNotifications(input: {
    limit: number;
    now: Date;
    telegramUserId?: bigint;
  }): Promise<ClaimedGuildWeeklyAchievementNotification[]>;
  markAchievementNotificationSent(entitlementId: string, claimToken: string, sentAt: Date): Promise<boolean>;
  releaseAchievementNotification(entitlementId: string, claimToken: string): Promise<boolean>;
  getMetrics(): Promise<GuildWeeklyGoalMetrics>;
}
