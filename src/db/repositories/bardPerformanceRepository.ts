import type { CharacterRecord } from "./characterRepository";
import type {
  BardInspirationPayloadV1
} from "../../domain/noncombat/bardSupport";
import type { BardPerformanceGrade } from "../../domain/noncombat/bardPerformance";

export type BardPerformanceStatus = "active" | "expired";
export type BardPerformanceReactionStatus = "offered" | "applauded" | "tipped" | "declined" | "expired";

export interface BardPerformanceRecord {
  id: string;
  token: string;
  characterId: string;
  telegramUserId: bigint;
  performerName: string;
  remortCount: number;
  techniqueId: string;
  rulesVersion: string;
  locationId: string;
  localDate: string;
  status: BardPerformanceStatus;
  grade: string;
  power: number;
  housePayoutGold: number;
  roleActionXp: number;
  audienceCount: number;
  statSnapshot: unknown;
  result: unknown;
  startedAt: Date;
  expiresAt: Date;
  cooldownAvailableAt: Date;
  completedAt: Date | null;
}

export interface BardPerformanceReactionRecord {
  id: string;
  performanceId: string;
  characterId: string;
  telegramUserId: bigint;
  audienceName: string;
  remortCount: number;
  status: BardPerformanceReactionStatus;
  tipGold: number;
  result: unknown;
  expiresAt: Date;
  respondedAt: Date | null;
}

export interface BardPerformanceStartSnapshot {
  character: CharacterRecord;
  equippedItemIds: string[];
  currentRaidId: string | null;
  activeCombatLease: { kind: string; referenceId: string } | null;
}

export interface BardPerformanceAudienceNotice {
  telegramUserId: bigint;
  name: string;
  reaction: BardPerformanceReactionRecord;
  inspiration?: {
    mutation: import("../../domain/noncombat/bardSupport").BardInspirationMutation;
    accuracyBonusPp: number;
    expiresAt: Date;
    now: Date;
  };
}

export type BardPerformanceStartResult =
  | { state: "no-character" }
  | { state: "wrong-place"; character: CharacterRecord }
  | { state: "active-combat"; character: CharacterRecord }
  | { state: "pending-raid"; character: CharacterRecord }
  | { state: "not-bard"; character: CharacterRecord }
  | { state: "level-locked"; character: CharacterRecord; requiredLevel: number }
  | { state: "no-audience"; character: CharacterRecord }
  | { state: "cooldown"; character: CharacterRecord; availableAt: Date }
  | { state: "live"; character: CharacterRecord; performance: BardPerformanceRecord }
  | {
      state: "started";
      character: CharacterRecord;
      performance: BardPerformanceRecord;
      audience: BardPerformanceAudienceNotice[];
    };

export type BardPerformanceRespondResult =
  | { state: "no-character" }
  | { state: "invalid-reaction" }
  | { state: "expired"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "declined"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "replayed"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "wrong-place"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "active-combat"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "pending-raid"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "remort-mismatch"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "performer-missing"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "performer-remorted"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "performer-wrong-place"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "performer-active-combat"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | { state: "performer-pending-raid"; reaction: BardPerformanceReactionRecord; performance: BardPerformanceRecord }
  | {
      state: "insufficient-gold";
      reaction: BardPerformanceReactionRecord;
      performance: BardPerformanceRecord;
      character: CharacterRecord;
      attemptedTipGold: number;
    }
  | {
      state: "applauded" | "tipped";
      reaction: BardPerformanceReactionRecord;
      performance: BardPerformanceRecord;
      character: CharacterRecord;
      performerTelegramUserId: bigint;
    };

export interface BardPerformanceRepository {
  getStartSnapshotForTelegramUser(telegramUserId: bigint): Promise<BardPerformanceStartSnapshot | null>;
  startPerformanceForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      techniqueId: string;
      rulesVersion: string;
      locationId: string;
      localDate: string;
      grade: string;
      power: number;
      rawHousePayoutGold: number;
      roleActionXp: number;
      statSnapshot: unknown;
      result: unknown;
      now: Date;
      expiresAt: Date;
      cooldownAvailableAt: Date;
      activeAudienceSince: Date;
      allowNoAudience: boolean;
      requiredLevel: number;
    }
  ): Promise<BardPerformanceStartResult>;
  respondToPerformanceForTelegramUser(
    telegramUserId: bigint,
    input: {
      reactionId: string;
      action: "applaud" | "decline" | "tip";
      tipGold?: number;
      now: Date;
      result: unknown;
    }
  ): Promise<BardPerformanceRespondResult>;
  resetForTelegramUser(telegramUserId: bigint, now: Date): Promise<{ character: CharacterRecord; deleted: number } | null>;
  getInspirationForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<{ character: CharacterRecord; inspiration: BardInspirationPayloadV1 | null } | null>;
  setInspirationForDev(
    telegramUserId: bigint,
    grade: BardPerformanceGrade | null,
    now: Date
  ): Promise<{ character: CharacterRecord; inspiration: BardInspirationPayloadV1 | null } | null>;
}
