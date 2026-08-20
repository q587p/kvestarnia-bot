import type { TelegramUserProfile } from "./userRepository";
import type {
  ReferralMilestoneKey,
  ReferralRewardFailureCode,
  ReferralRewardItem
} from "../../domain/referral/referralPolicy";

export type ReferralAttributionStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface ReferralConsentView {
  attributionId: string;
  status: ReferralAttributionStatus;
  inviterName: string;
}

export type CaptureReferralResult =
  | { state: "captured"; consent: ReferralConsentView }
  | { state: "pending"; consent: ReferralConsentView }
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

export type RespondReferralResult =
  | { state: "accepted" }
  | { state: "declined" }
  | { state: "already-accepted" }
  | { state: "already-declined" }
  | { state: "disabled"; consent: ReferralConsentView }
  | { state: "legacy-character" }
  | { state: "not-found" };

export type ReferralInviteCodeResult =
  | { state: "ready"; token: string; inviterName: string; hasCharacter: boolean }
  | { state: "no-character" }
  | { state: "token-collision" };

export interface ReferralDashboardRecord {
  token: string;
  inviterName: string;
  inviterIdentity: {
    name: string;
    activeCosmeticTitleGrantId: string | null;
    guildCrest?: string;
    guildName?: string;
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
  kind: "REFERRAL_JOINED" | "REFERRAL_PAYOUT_GRANTED";
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
    enabled: boolean
  ): Promise<CaptureReferralResult>;
  getPendingConsent(telegramUserId: bigint): Promise<ReferralConsentView | null>;
  respondToConsent(
    telegramUserId: bigint,
    action: "accept" | "decline",
    now: Date,
    rewardPlanVersion: number,
    foundationEnabled: boolean
  ): Promise<RespondReferralResult>;
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
  reschedulePendingReward(rewardId: string, now: Date): Promise<void>;
}
