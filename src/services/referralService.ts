import { randomBytes, randomUUID } from "node:crypto";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type {
  CaptureReferralResult,
  ClaimedReferralNotification,
  ReferralConsentView,
  ReferralInviteePage,
  ReferralRepository,
  RespondReferralResult
} from "../db/repositories/referralRepository";
import type { TelegramUserProfile } from "../db/repositories/userRepository";
import {
  REFERRAL_POLICY_V1,
  type ReferralRewardItem
} from "../domain/referral/referralPolicy";
import { sanitizeReferralName } from "../domain/referral/referralIdentity";
import {
  REFERRAL_INVITE_SHARE_TEXT_COUNT,
  referralInviteShareText
} from "../content/referralInviteCopy";
import type { AchievementService } from "./achievementService";
import type { PublicActivityEventPublisher } from "./publicActivityEventPublisher";

const TOKEN_RETRIES = 5;
const REFERRAL_PAGE_SIZE = 5;
const DEFAULT_BATCH_LIMIT = 13;

export type ReferralDashboardResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | {
      state: "ready";
      inviteUrl: string;
      shareText: string;
      shareTexts: readonly string[];
      hasCharacter: boolean;
      arrivedTotal: number;
      grantedStageTotal: number;
      pendingStageTotal: number;
      earnedByMilestone: Record<"LEVEL_3" | "LEVEL_5" | "LEVEL_8" | "LEVEL_13", number>;
    };

export class ReferralService {
  constructor(
    private readonly referrals: ReferralRepository,
    private readonly characters: CharacterRepository,
    private readonly options: {
      foundationEnabled: boolean;
      payoutsEnabled: boolean;
      devHelpersEnabled: boolean;
      botUsername?: string | undefined;
    },
    private readonly achievements?: AchievementService,
    private readonly activityEvents?: PublicActivityEventPublisher,
    private readonly now: () => Date = () => new Date(),
    private readonly tokenFactory: () => string = () => randomBytes(12).toString("base64url")
  ) {}

  isFoundationEnabled(): boolean {
    return this.options.foundationEnabled;
  }

  arePayoutsEnabled(): boolean {
    return this.options.payoutsEnabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.options.devHelpersEnabled;
  }

  captureFromStart(player: TelegramUserProfile, token: string): Promise<CaptureReferralResult> {
    return this.referrals.captureFreshReferral(
      player,
      token,
      this.now(),
      this.options.foundationEnabled
    );
  }

  getPendingConsent(telegramUserId: bigint): Promise<ReferralConsentView | null> {
    return this.referrals.getPendingConsent(telegramUserId);
  }

  respondToConsent(
    telegramUserId: bigint,
    action: "accept" | "decline"
  ): Promise<RespondReferralResult> {
    return this.referrals.respondToConsent(
      telegramUserId,
      action,
      this.now(),
      REFERRAL_POLICY_V1.version,
      this.options.foundationEnabled
    );
  }

  async getDashboard(telegramUserId: bigint): Promise<ReferralDashboardResult> {
    if (!this.options.foundationEnabled) {
      return { state: "disabled" };
    }
    const existing = await this.referrals.getDashboard(telegramUserId);
    if (existing) {
      return {
        state: "ready",
        inviteUrl: this.buildInviteUrl(existing.token),
        shareText: this.buildShareText(existing.inviterName),
        shareTexts: this.buildShareTexts(existing.inviterName),
        hasCharacter: existing.hasCharacter,
        arrivedTotal: existing.arrivedTotal,
        grantedStageTotal: existing.grantedStageTotal,
        pendingStageTotal: existing.pendingStageTotal,
        earnedByMilestone: existing.earnedByMilestone
      };
    }
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    if (!character) {
      return { state: "no-character" };
    }
    for (let attempt = 0; attempt < TOKEN_RETRIES; attempt += 1) {
      const created = await this.referrals.getOrCreateInviteCode(
        telegramUserId,
        this.tokenFactory(),
        sanitizeReferralName(character.name)
      );
      if (created.state === "no-character") {
        return { state: "no-character" };
      }
      if (created.state === "token-collision") {
        continue;
      }
      const dashboard = await this.referrals.getDashboard(telegramUserId);
      if (!dashboard) {
        throw new Error("Referral code creation did not yield a dashboard projection.");
      }
      return {
        state: "ready",
        inviteUrl: this.buildInviteUrl(dashboard.token),
        shareText: this.buildShareText(dashboard.inviterName),
        shareTexts: this.buildShareTexts(dashboard.inviterName),
        hasCharacter: dashboard.hasCharacter,
        arrivedTotal: dashboard.arrivedTotal,
        grantedStageTotal: dashboard.grantedStageTotal,
        pendingStageTotal: dashboard.pendingStageTotal,
        earnedByMilestone: dashboard.earnedByMilestone
      };
    }
    throw new Error("Referral token collision retry limit exhausted.");
  }

  listInvitees(telegramUserId: bigint, page: number): Promise<ReferralInviteePage | null> {
    if (!this.options.foundationEnabled) {
      return Promise.resolve(null);
    }
    return this.referrals.listInvitees(telegramUserId, page, REFERRAL_PAGE_SIZE);
  }

  async reconcileForTelegramUser(
    telegramUserId: bigint,
    limit = DEFAULT_BATCH_LIMIT
  ): Promise<{ granted: number; pending: number }> {
    if (!this.options.payoutsEnabled) {
      return this.referrals.countRewardStatesForTelegramUser(telegramUserId);
    }
    const ids = await this.referrals.listPendingRewardIdsForTelegramUser(telegramUserId, limit);
    let granted = 0;
    for (const id of ids) {
      const result = await this.referrals.grantPendingReward(id, this.now());
      if (result.state !== "granted") {
        continue;
      }
      granted += 1;
      await this.trackGrantAchievements(result.grant);
    }
    const counts = await this.referrals.countRewardStatesForTelegramUser(telegramUserId);
    return { granted, pending: counts.pending };
  }

  async reconcileDue(limit = DEFAULT_BATCH_LIMIT): Promise<{ due: number; granted: number }> {
    if (!this.options.payoutsEnabled) {
      return { due: 0, granted: 0 };
    }
    const now = this.now();
    const ids = await this.referrals.listDueRewardIds(now, limit);
    let granted = 0;
    for (const id of ids) {
      try {
        const result = await this.referrals.grantPendingReward(id, now);
        if (result.state === "granted") {
          granted += 1;
          await this.trackGrantAchievements(result.grant);
        }
      } catch (error) {
        try {
          await this.referrals.reschedulePendingReward(id, now);
        } catch (rescheduleError) {
          console.error("Квестарня: відкладення помилкової виплати теж не завершилось.", {
            errorName: rescheduleError instanceof Error ? rescheduleError.name : "unknown"
          });
        }
        console.error("Квестарня: одна виплата за поклик відкладена після неочікуваної помилки.", {
          errorName: error instanceof Error ? error.name : "unknown"
        });
      }
    }
    return { due: ids.length, granted };
  }

  async reconcileArrivalChronicles(limit = DEFAULT_BATCH_LIMIT): Promise<{ due: number; recorded: number }> {
    if (!this.activityEvents) {
      return { due: 0, recorded: 0 };
    }
    const rows = await this.referrals.listUnrecordedArrivalChronicles(limit);
    let recorded = 0;
    for (const row of rows) {
      const event = await this.activityEvents.recordReferralArrivedSafely({
        characterId: row.characterId,
        inviteeDisplayName: row.inviteeName,
        inviterUserId: row.inviterUserId,
        inviterDisplayName: row.inviterName,
        attributionId: row.attributionId,
        occurredAt: row.arrivedAt
      });
      if (
        event?.eventType === "referral.arrived" &&
        event.dedupeKey === `character.created:${row.characterId}`
      ) {
        if (await this.referrals.markArrivalChronicleRecorded(row.attributionId, row.characterId, this.now())) {
          recorded += 1;
        }
      }
    }
    return { due: rows.length, recorded };
  }

  claimNextNotification(leaseMs = 42_000): Promise<ClaimedReferralNotification | null> {
    const now = this.now();
    return this.referrals.claimDueNotification(
      now,
      randomUUID(),
      new Date(now.getTime() + leaseMs),
      this.options.payoutsEnabled
    );
  }

  markNotificationSent(notification: ClaimedReferralNotification): Promise<boolean> {
    return this.referrals.markNotificationSent(
      notification.id,
      notification.claimToken,
      this.now()
    );
  }

  rescheduleNotification(notification: ClaimedReferralNotification): Promise<boolean> {
    const delay = Math.min(93_000, 1_100 * 2 ** Math.min(notification.attemptCount, 6));
    return this.referrals.rescheduleNotification(
      notification.id,
      notification.claimToken,
      new Date(this.now().getTime() + delay)
    );
  }

  private buildInviteUrl(token: string): string {
    const username = this.options.botUsername ?? "kvestarnia_bot";
    return `https://t.me/${username}?start=ref1_${token}`;
  }

  private buildShareText(inviterName: string): string {
    return referralInviteShareText(0, sanitizeReferralName(inviterName));
  }

  private buildShareTexts(inviterName: string): readonly string[] {
    const safeName = sanitizeReferralName(inviterName);
    return Array.from(
      { length: REFERRAL_INVITE_SHARE_TEXT_COUNT },
      (_, index) => referralInviteShareText(index, safeName)
    );
  }

  private async trackGrantAchievements(grant: {
    rewardId: string;
    characterId: string;
    balanceAfter: number;
    items: ReferralRewardItem[];
    grantedAt: Date;
  }): Promise<void> {
    if (!this.achievements) {
      return;
    }
    const itemIds = grant.items.flatMap((item) =>
      Array.from({ length: item.quantity }, () => item.itemId)
    );
    await this.achievements.trackEventSafely({
      type: "item.received",
      characterId: grant.characterId,
      itemIds,
      occurredAt: grant.grantedAt,
      sourceId: `referral-payout:${grant.rewardId}`
    });
    await this.achievements.trackEventSafely({
      type: "gold.balance",
      characterId: grant.characterId,
      gold: grant.balanceAfter,
      occurredAt: grant.grantedAt,
      sourceId: `referral-payout:${grant.rewardId}`
    });
  }
}
