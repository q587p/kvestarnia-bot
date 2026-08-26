import { getAchievementDefinition } from "../content/achievements";
import {
  GUILD_WEEKLY_NOTIFICATION_MAX_ATTEMPTS,
  type ClaimedGuildWeeklyAchievementNotification,
  type GuildWeeklyAchievementNotificationErrorCategory,
  type GuildWeeklyAchievementNotificationFailureResult,
  type GuildGloryBoardResult,
  type GuildGloryBoardView,
  type GuildWeeklyContributionResult,
  type GuildWeeklyGoalMetrics,
  type GuildWeeklyGoalRepository,
  type GuildWeeklyGoalViewResult
} from "../db/repositories/guildWeeklyGoalRepository";
import {
  GUILD_WEEKLY_ACHIEVEMENT_ID,
  GUILD_WEEKLY_THIRTEEN_PERIODS_ACHIEVEMENT_ID,
  GUILD_WEEKLY_THREE_PERIODS_ACHIEVEMENT_ID
} from "../domain/guildWeeklyGoal";
import type { AchievementService, AchievementUnlock } from "./achievementService";

export interface GuildWeeklyAchievementNotice {
  entitlementId: string;
  claimToken: string;
  telegramUserId: bigint;
  characterId: string;
  characterName: string;
  classId: string;
  raceId: string;
  attemptCount: number;
  unlock: AchievementUnlock;
}

const WEEKLY_NOTIFICATION_BACKOFF_BASE_MS = 60_000;
const WEEKLY_NOTIFICATION_BACKOFF_MAX_MS = 13 * 60_000;
const WEEKLY_NOTIFICATION_RETRY_AFTER_MAX_MS = 93 * 60_000;

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
    await this.projectAchievementEntitlements(93);
    return result;
  }

  async getCurrentForTelegramUser(telegramUserId: bigint): Promise<GuildWeeklyGoalViewResult | { state: "disabled" }> {
    if (!this.isEnabled()) return { state: "disabled" };
    const result = await this.repository.getCurrentForTelegramUser(telegramUserId, this.clock());
    await this.projectAchievementEntitlements(93, telegramUserId);
    return result;
  }

  getGloryBoardForTelegramUser(
    telegramUserId: bigint,
    expectedLocationId: string,
    view: GuildGloryBoardView,
    page = 0
  ): Promise<GuildGloryBoardResult | { state: "disabled" }> {
    return this.isEnabled()
      ? this.repository.getGloryBoardForTelegramUser(
          telegramUserId,
          expectedLocationId,
          this.clock(),
          view,
          page
        )
      : Promise.resolve({ state: "disabled" });
  }

  async repairCurrentPeriod(limit = 13): Promise<{ recorded: number; reconciled: number; recomputed: number }> {
    if (!this.isEnabled()) return { recorded: 0, reconciled: 0, recomputed: 0 };
    const sessionIds = await this.repository.listUnreconciledTerminalSessionIds(limit);
    let recorded = 0;
    const periodKeys = new Set<string>();
    for (const sessionId of sessionIds) {
      const result = await this.repository.recordEligibleTerminalSession(sessionId);
      if (result.state === "recorded") recorded += 1;
      if (result.state === "recorded" || result.state === "replayed") {
        periodKeys.add(result.progress.periodKey);
      } else if (result.state === "ineligible" && result.periodKey) {
        periodKeys.add(result.periodKey);
      }
    }
    let recomputed = 0;
    for (const periodKey of periodKeys) recomputed += await this.repository.recomputePeriod(periodKey);
    await this.projectAchievementEntitlements(93);
    return { recorded, reconciled: sessionIds.length, recomputed };
  }

  async completeCurrentForDev(telegramUserId: bigint): Promise<GuildWeeklyGoalViewResult | { state: "disabled" }> {
    if (!this.areDevHelpersEnabled()) return { state: "disabled" };
    const result = await this.repository.completeCurrentForDev(telegramUserId, this.clock());
    await this.projectAchievementEntitlements(93, telegramUserId);
    return result;
  }

  async claimAchievementNotices(
    limit = 13,
    telegramUserId?: bigint,
    options: { projectEntitlements?: boolean } = {}
  ): Promise<GuildWeeklyAchievementNotice[]> {
    if (!this.isEnabled()) return [];
    if (options.projectEntitlements !== false) {
      await this.projectAchievementEntitlements(93, telegramUserId);
    }
    const claims = await this.repository.claimAchievementNotifications({
      limit,
      now: this.clock(),
      ...(telegramUserId === undefined ? {} : { telegramUserId })
    });
    return claims.map(toAchievementNotice);
  }

  markAchievementNoticeSent(notice: Pick<GuildWeeklyAchievementNotice, "entitlementId" | "claimToken">): Promise<boolean> {
    return this.repository.markAchievementNotificationSent(
      notice.entitlementId,
      notice.claimToken,
      this.clock()
    );
  }

  recordAchievementNoticeFailure(
    notice: Pick<GuildWeeklyAchievementNotice, "entitlementId" | "claimToken" | "attemptCount">,
    error: unknown
  ): Promise<GuildWeeklyAchievementNotificationFailureResult> {
    const failedAt = this.clock();
    const failure = classifyGuildWeeklyAchievementDeliveryFailure(error);
    const exhausted = notice.attemptCount >= GUILD_WEEKLY_NOTIFICATION_MAX_ATTEMPTS;
    if (failure.disposition === "permanent" || exhausted) {
      return this.repository.recordAchievementNotificationFailure({
        entitlementId: notice.entitlementId,
        claimToken: notice.claimToken,
        failedAt,
        errorCategory: exhausted ? "delivery-attempts-exhausted" : failure.category,
        disposition: "permanent"
      });
    }
    const exponentialBackoffMs = Math.min(
      WEEKLY_NOTIFICATION_BACKOFF_MAX_MS,
      WEEKLY_NOTIFICATION_BACKOFF_BASE_MS * (2 ** Math.min(4, Math.max(0, notice.attemptCount - 1)))
    );
    const retryAfterMs = Math.min(
      WEEKLY_NOTIFICATION_RETRY_AFTER_MAX_MS,
      Math.max(0, failure.retryAfterSeconds ?? 0) * 1000
    );
    return this.repository.recordAchievementNotificationFailure({
      entitlementId: notice.entitlementId,
      claimToken: notice.claimToken,
      failedAt,
      errorCategory: failure.category,
      disposition: "retry",
      nextAttemptAt: new Date(failedAt.getTime() + Math.max(exponentialBackoffMs, retryAfterMs))
    });
  }

  getMetrics(): Promise<GuildWeeklyGoalMetrics> {
    return this.repository.getMetrics();
  }

  private async projectAchievementEntitlements(limit: number, telegramUserId?: bigint): Promise<number> {
    if (!this.achievements) return 0;
    const candidates = await this.repository.listAchievementProjectionCandidates(limit, telegramUserId);
    let projected = 0;
    for (const candidate of candidates) {
      try {
        await this.achievements.trackEvent(achievementEvent(candidate));
        if (await this.repository.markAchievementProjected({
          entitlementId: candidate.entitlementId,
          characterId: candidate.characterId,
          remortCount: candidate.remortCount,
          projectedAt: this.clock()
        })) projected += 1;
      } catch {
        continue;
      }
    }
    return projected;
  }
}

function achievementEvent(candidate: {
  achievementId: string;
  characterId: string;
  entitledAt: Date;
  sourcePeriodId: string;
}) {
  if (candidate.achievementId === GUILD_WEEKLY_ACHIEVEMENT_ID) {
    return {
      type: "guild.weekly_goal_completed" as const,
      characterId: candidate.characterId,
      occurredAt: candidate.entitledAt,
      sourceId: candidate.sourcePeriodId
    };
  }
  const count = candidate.achievementId === GUILD_WEEKLY_THREE_PERIODS_ACHIEVEMENT_ID
    ? 3
    : candidate.achievementId === GUILD_WEEKLY_THIRTEEN_PERIODS_ACHIEVEMENT_ID
      ? 13
      : 0;
  if (count === 0) throw new Error(`Unknown weekly achievement entitlement: ${candidate.achievementId}`);
  return {
    type: "guild.weekly_goal_periods" as const,
    characterId: candidate.characterId,
    count,
    occurredAt: candidate.entitledAt,
    sourceId: candidate.sourcePeriodId
  };
}

function toAchievementNotice(claim: ClaimedGuildWeeklyAchievementNotification): GuildWeeklyAchievementNotice {
  const definition = getAchievementDefinition(claim.achievementId);
  if (!definition) throw new Error(`Unknown weekly achievement: ${claim.achievementId}`);
  return {
    entitlementId: claim.entitlementId,
    claimToken: claim.claimToken,
    telegramUserId: claim.telegramUserId,
    characterId: claim.characterId,
    characterName: claim.characterName,
    classId: claim.classId,
    raceId: claim.raceId,
    attemptCount: claim.attemptCount,
    unlock: {
      id: definition.id,
      title: definition.title,
      cosmeticTitleGrantId: definition.cosmeticTitleGrantId ?? null,
      unlockedAt: claim.entitledAt
    }
  };
}

export function classifyGuildWeeklyAchievementDeliveryFailure(error: unknown): {
  disposition: "retry" | "permanent";
  category: GuildWeeklyAchievementNotificationErrorCategory;
  retryAfterSeconds?: number;
} {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const nested = candidate.error && typeof candidate.error === "object"
    ? candidate.error as Record<string, unknown>
    : candidate.response && typeof candidate.response === "object"
      ? candidate.response as Record<string, unknown>
      : {};
  const code = numberOrNull(candidate.error_code)
    ?? numberOrNull(nested.error_code)
    ?? numberOrNull(candidate.statusCode)
    ?? numberOrNull(nested.status);
  const parameters = candidate.parameters && typeof candidate.parameters === "object"
    ? candidate.parameters as Record<string, unknown>
    : nested.parameters && typeof nested.parameters === "object"
      ? nested.parameters as Record<string, unknown>
      : {};

  if (code === 429) {
    const retryAfterSeconds = numberOrNull(parameters.retry_after);
    return retryAfterSeconds === null
      ? { disposition: "retry", category: "telegram-rate-limited" }
      : { disposition: "retry", category: "telegram-rate-limited", retryAfterSeconds };
  }
  if (code === 408) {
    return { disposition: "retry", category: "telegram-timeout" };
  }
  if (code !== null && code >= 500 && code <= 599) {
    return { disposition: "retry", category: "telegram-server" };
  }
  if (code !== null && code >= 400 && code <= 499) {
    return { disposition: "permanent", category: "telegram-client" };
  }
  return { disposition: "retry", category: "telegram-transport" };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
