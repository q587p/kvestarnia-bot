import type { TelegramUserProfile } from "./userRepository";
import type {
  ReferralMilestoneKey,
  ReferralRewardFailureCode,
  ReferralRewardItem
} from "../../domain/referral/referralPolicy";

export type ReferralAttributionStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export type CaptureReferralResult =
  | { state: "captured" }
  | { state: "pending" }
  | { state: "accepted" }
  | { state: "declined" }
  | { state: "existing-user" }
  | { state: "self" }
  | { state: "not-found" }
  | { state: "disabled" }
  | { state: "retry" };

export interface ReferralArrivalChronicleRecord {
  attributionId: string;
  characterId: string;
  inviteeName: string;
  inviterUserId: string;
  inviterName: string;
  arrivedAt: Date;
}

export interface ReferralAchievementReconciliationRecord {
  inviterUserId: string;
  achievementId:
    | "achievement.referral.first-arrival"
    | "achievement.referral.thirteen-arrivals";
  arrivalCount: 1 | 13;
  sourceId: string;
  occurredAt: Date;
}

export type ResolvePendingReferralResult =
  | { state: "accepted" }
  | { state: "declined" }
  | { state: "already-accepted" }
  | { state: "already-declined" }
  | { state: "legacy-character" }
  | { state: "not-found" };

export type ReferralInviteCodeResult =
  | { state: "ready"; token: string; inviterName: string; hasCharacter: boolean }
  | { state: "no-character" }
  | { state: "token-collision" };

export interface ReferralDashboardRecord {
  inviterUserId: string;
  token: string;
  inviterName: string;
  inviterIdentity: {
    name: string;
    activeCosmeticTitleGrantId: string | null;
    guildCrest?: string;
  };
  hasCharacter: boolean;
  arrivedTotal: number;
  grantedStageTotal: number;
  pendingStageTotal: number;
  earnedByMilestone: Record<ReferralMilestoneKey, number>;
}

export interface ReferralInviteeRow {
  attributionId: string;
  name: string | null;
  level: number | null;
  stages: Array<{ milestoneKey: ReferralMilestoneKey; state: "PENDING" | "GRANTED" }>;
}

export interface ReferralInviteePage {
  rows: ReferralInviteeRow[];
  page: number;
  totalPages: number;
  totalCount: number;
}

export interface GrantedReferralReward {
  rewardId: string;
  characterId: string;
  inviteeName: string | null;
  milestoneKey: ReferralMilestoneKey;
  level: number;
  gold: number;
  balanceAfter: number;
  items: ReferralRewardItem[];
  grantedAt: Date;
}

export type GrantReferralRewardResult =
  | { state: "granted"; grant: GrantedReferralReward }
  | { state: "already-granted" }
  | { state: "pending"; code: ReferralRewardFailureCode }
  | { state: "not-found" };

export interface ClaimedReferralNotification {
  id: string;
  claimToken: string;
  kind: "REFERRAL_JOINED" | "REFERRAL_PAYOUT_GRANTED" | "REFERRAL_ACHIEVEMENT_UNLOCKED";
  telegramUserId: bigint;
  payload: unknown;
  attemptCount: number;
}

export interface ReferralRepository {
  getOrCreateInviteCode(
    telegramUserId: bigint,
    token: string,
    inviterNameSnapshot: string
  ): Promise<ReferralInviteCodeResult>;
  captureFreshReferral(
    player: TelegramUserProfile,
    token: string,
    now: Date,
    enabled: boolean,
    rewardPlanVersion: number
  ): Promise<CaptureReferralResult>;
  resolvePendingReferral(
    telegramUserId: bigint,
    now: Date,
    rewardPlanVersion: number,
    foundationEnabled: boolean
  ): Promise<ResolvePendingReferralResult>;
  getDashboard(telegramUserId: bigint, now?: Date): Promise<ReferralDashboardRecord | null>;
  listInvitees(telegramUserId: bigint, page: number, pageSize: number): Promise<ReferralInviteePage | null>;
  listDueRewardIds(now: Date, limit: number): Promise<string[]>;
  listPendingRewardIdsForTelegramUser(telegramUserId: bigint, limit: number): Promise<string[]>;
  grantPendingReward(rewardId: string, now: Date): Promise<GrantReferralRewardResult>;
  claimDueNotification(
    now: Date,
    claimToken: string,
    leaseUntil: Date,
    payoutsEnabled: boolean
  ): Promise<ClaimedReferralNotification | null>;
  markNotificationSent(id: string, claimToken: string, sentAt: Date): Promise<boolean>;
  rescheduleNotification(id: string, claimToken: string, nextAttemptAt: Date): Promise<boolean>;
  countRewardStatesForTelegramUser(
    telegramUserId: bigint
  ): Promise<{ pending: number; granted: number }>;
  listUnrecordedArrivalChronicles(limit: number): Promise<ReferralArrivalChronicleRecord[]>;
  markArrivalChronicleRecorded(attributionId: string, characterId: string, recordedAt: Date): Promise<boolean>;
  listReferralAchievementReconciliationRecords(
    limit: number,
    inviterUserId?: string
  ): Promise<ReferralAchievementReconciliationRecord[]>;
  enqueueReferralAchievementNotifications(
    inviterUserId: string,
    achievementIds: readonly string[],
    now: Date
  ): Promise<number>;
  reschedulePendingReward(rewardId: string, now: Date): Promise<void>;
}
