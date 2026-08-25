import type { GuildWeeklyReconciliationReason } from "../../domain/guildWeeklyGoal";

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
  scope: "cumulative-current";
  periodsStarted: number;
  periodsCompleted: number;
  expeditionReceipts: number;
  contributorReceipts: number;
  reconciliationDecisions: number;
  reconciliations: {
    credited: number;
    ineligible: number;
    ineligibleByReason: Record<Exclude<GuildWeeklyReconciliationReason, "credited">, number>;
  };
  gloryReceipts: number;
  achievementEntitlements: number;
  achievementNotifications: {
    pending: number;
    claimed: number;
    projected: number;
    sent: number;
    permanentFailure: number;
  };
}

export const GUILD_WEEKLY_NOTIFICATION_MAX_ATTEMPTS = 13;

export type GuildWeeklyAchievementNotificationState =
  | "PENDING"
  | "CLAIMED"
  | "SENT"
  | "PERMANENT_FAILURE";

export type GuildWeeklyAchievementNotificationErrorCategory =
  | "telegram-client"
  | "telegram-rate-limited"
  | "telegram-server"
  | "telegram-timeout"
  | "telegram-transport"
  | "delivery-attempts-exhausted";

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
  | { state: "no-character" | "wrong-location" }
  | {
      state: "ready";
      view: GuildGloryBoardView;
      periodKey: string;
      rows: GuildGloryBoardEntry[];
      viewerGuild: GuildGloryBoardEntry | null;
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
  attemptCount: number;
}

export type GuildWeeklyAchievementNotificationFailureResult =
  | "retry-scheduled"
  | "permanent-failure"
  | "lost";

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
  recordAchievementNotificationFailure(input: {
    entitlementId: string;
    claimToken: string;
    failedAt: Date;
    errorCategory: GuildWeeklyAchievementNotificationErrorCategory;
    disposition: "retry" | "permanent";
    nextAttemptAt?: Date;
  }): Promise<GuildWeeklyAchievementNotificationFailureResult>;
  getMetrics(): Promise<GuildWeeklyGoalMetrics>;
}
