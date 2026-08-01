import type {
  GroupCombatActionKey,
  GroupCombatResult,
  GroupCombatSettlementPlan,
  GroupCombatSettlementReceipt,
  GroupCombatState,
  GroupCombatTargetKind
} from "../../domain/groupCombat/groupCombat";
import type { PartySessionRecord } from "./partySessionRepository";
import type { RewardLevelChange } from "./dailyActionRepository";
import type { AchievementUnlock } from "../../services/achievementService";

export interface GroupCombatParticipantRecord {
  characterId: string;
  telegramUserId: bigint;
  name: string;
  currentLevel?: number;
  remortCount: number;
  rosterOrder: number;
  chatId: bigint | null;
  messageId: number | null;
  referenceVersion: number;
  deliveredRevision: number;
  replyKeyboardFingerprint: string | null;
  replyKeyboardGeneration: number;
  exitDeliveryState: "none" | "pending" | "claimed" | "menu-delivered" | "completed" | "superseded";
  exitDeliveryClaimToken: string | null;
  exitDeliveryClaimedAt: Date | null;
  exitDeliveryMessageId: number | null;
  settlementStatus: "pending" | "completed";
  settlementAttempts: number;
  settlementReceipt: GroupCombatSettlementReceipt | null;
  settledAt: Date | null;
}

export interface GroupCombatQueuedActionRecord {
  actorCharacterId: string;
  turn: number;
  action: GroupCombatActionKey;
  targetKind: GroupCombatTargetKind;
  targetId: string;
  payloadKey?: string;
  origin: "manual" | "timeout";
}

export interface GroupCombatSettlementNotice {
  telegramUserId: bigint;
  characterId: string;
  characterName: string;
  classId: string;
  raceId: string;
  levelChange: RewardLevelChange | null;
  achievementUnlocks: AchievementUnlock[];
}

export interface GroupCombatSessionRecord {
  id: string;
  partySessionId: string;
  partyInviteToken: string;
  status: GroupCombatState["status"];
  turn: number;
  version: number;
  deliveryRevision: number;
  deliveryPending: boolean;
  deliveryAttemptedAt: Date | null;
  state: GroupCombatState;
  result: GroupCombatResult | null;
  settlementPlan: GroupCombatSettlementPlan | null;
  turnExpiresAt: Date;
  completedAt: Date | null;
  participants: GroupCombatParticipantRecord[];
  queuedActions: GroupCombatQueuedActionRecord[];
}

export interface GroupCombatOperatorRepairRecord {
  id: string;
  encounterKey: string;
  rulesVersion: string;
  status: string;
  turn: number;
  version: number;
  repairState: "operator-required";
  repairReason: string;
  state: unknown;
  result: unknown;
  settlementPlan: unknown;
  actions: Array<{
    actorCharacterId: string;
    turn: number;
    actionKey: string;
    targetKind: string;
    targetId: string;
    payloadKey: string | null;
    origin: string;
    submittedAt: Date;
  }>;
  participants: Array<{
    characterId: string;
    remortCount: number;
    rosterOrder: number;
    snapshot: unknown;
    contribution: unknown;
    settlementStatus: string;
    settlementAttempts: number;
    settlementReceipt: unknown;
  }>;
}

export type GroupCombatStartResult =
  | {
      state: "disabled" | "no-character" | "not-found" | "not-leader" | "not-recruiting" | "invalid-size" | "invalid-life" | "blocked" | "invalid-roster" | "wrong-origin" | "wrong-location" | "expired-invitation" | "reservation-missing";
      partyVersion?: number;
    }
  | { state: "active-search"; availableAt: Date; now: Date; partyVersion?: number }
  | { state: "started" | "already-active" | "terminal"; session: GroupCombatSessionRecord };

export type LeftPassagePartyCreateResult =
  | {
      state:
        | "disabled"
        | "no-character"
        | "invalid-preview"
        | "wrong-location"
        | "stale-life"
        | "dead"
        | "invalid-resources"
        | "active-adventure"
        | "active-raid"
        | "active-combat"
        | "reservation-conflict"
        | "expired-invitation";
      resources?: {
        hpCurrent: number;
        hpMax: number;
        manaCurrent: number;
        manaMax: number;
      };
    }
  | { state: "active-search"; availableAt: Date; now: Date }
  | { state: "created" | "already-created" | "live-membership"; session: PartySessionRecord };

export type GroupCombatActionResult =
  | { state: "disabled" | "no-character" | "not-found" | "not-participant" | "stale" | "actor-unavailable" | "invalid-target" | "action-unavailable" | "invalidated" }
  | {
      state: "queued" | "replaced" | "duplicate" | "resolved" | "terminal";
      session: GroupCombatSessionRecord;
      settlementNotices?: GroupCombatSettlementNotice[];
    };

export interface GroupCombatRepository {
  createLeftPassagePartyForTelegramUser(input: {
    telegramUserId: bigint;
    encounterToken: string;
    inviteToken: string;
    originKind: string;
    locationId: string;
    now: Date;
    joinUntilAt: Date;
    chatId?: bigint | null;
    messageId?: number | null;
  }): Promise<LeftPassagePartyCreateResult>;

  startProofForTelegramUser(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult>;

  startDueProof(input: {
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult>;

  startLeftPassageForTelegramUser(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult>;

  startDueLeftPassage(input: {
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult>;

  startReadyLeftPassage(input: {
    partyInviteToken: string;
    now: Date;
    turnExpiresAt: Date;
  }): Promise<GroupCombatStartResult>;

  submitActionForTelegramUser(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    turn: number;
    action: GroupCombatActionKey;
    targetKind: GroupCombatTargetKind;
    targetId: string;
    payloadKey?: string;
    now: Date;
    nextTurnExpiresAt: Date;
    allowNonmedicalConsumables?: boolean;
  }): Promise<GroupCombatActionResult>;

  resolveTimedOutSession(input: {
    sessionId: string;
    now: Date;
    nextTurnExpiresAt: Date;
    allowNonmedicalConsumables?: boolean;
  }): Promise<GroupCombatActionResult>;

  findByPartyInviteToken(partyInviteToken: string): Promise<GroupCombatSessionRecord | null>;
  findById(sessionId: string): Promise<GroupCombatSessionRecord | null>;
  findActiveByTelegramUserId(telegramUserId: bigint): Promise<GroupCombatSessionRecord | null>;
  inspectOperatorRepair(sessionId: string): Promise<GroupCombatOperatorRepairRecord | null>;
  listDueSessionIds(now: Date, limit: number): Promise<string[]>;
  listPendingDeliverySessionIds(limit: number): Promise<string[]>;
  listPendingSettlementParticipants(limit: number): Promise<Array<{
    sessionId: string;
    telegramUserId: bigint;
  }>>;
  repairInvalidOrOrphaned(now: Date, limit: number): Promise<number>;

  settleParticipant(input: {
    sessionId: string;
    telegramUserId: bigint;
    now: Date;
  }): Promise<
    | { state: "not-found" | "not-participant" | "not-terminal" | "invalid-plan" }
    | {
        state: "settled" | "replayed";
        receipt: GroupCombatSettlementReceipt;
        levelChange?: RewardLevelChange;
      }
  >;

  compareAndSetParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
    publishedKeyboardFingerprint?: string | null;
  }): Promise<boolean>;

  releaseParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean>;

  markParticipantCardDelivered(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean>;

  claimParticipantFleeExitDelivery(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<
    | { state: "claimed"; locationId: string | null; menuDelivered: boolean }
    | { state: "busy" | "superseded" | "not-found" }
  >;

  releaseParticipantFleeExitDeliveryClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
  }): Promise<boolean>;

  renewParticipantFleeExitDeliveryClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    claimedAt: Date;
  }): Promise<boolean>;

  markParticipantFleeExitMenuDelivered(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    messageId: number;
  }): Promise<boolean>;

  adoptParticipantFleeExitTerminalCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    expectedReferenceVersion: number;
    chatId: bigint | null;
    messageId: number | null;
    terminalCard: {
      chatId: bigint;
      messageId: number;
      deliveryRevision: number;
    };
  }): Promise<boolean>;

  completeParticipantFleeExitDelivery(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    expectedReferenceVersion: number;
    chatId: bigint | null;
    messageId: number | null;
    retainReference: boolean;
  }): Promise<boolean>;

  claimParticipantUiPublication(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    keyboardFingerprint: string;
    claimToken: string;
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<
    | {
        state: "claimed";
        publishReplyKeyboard: boolean;
        keyboardGeneration: number;
      }
    | { state: "busy" | "stale" | "superseded" | "not-found" }
  >;

  acknowledgeParticipantUiPublication(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    publishedKeyboardFingerprint: string | null;
    claimToken: string;
  }): Promise<"acknowledged" | "stale" | "not-owner">;

  renewParticipantUiPublicationClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    claimToken: string;
    claimedAt: Date;
  }): Promise<boolean>;

  releaseParticipantUiPublicationClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
  }): Promise<boolean>;

  requestParticipantUiRefresh(input: {
    sessionId: string;
    telegramUserId: bigint;
  }): Promise<boolean>;

  finalizeDeliveryAttempt(input: {
    sessionId: string;
    expectedDeliveryRevision: number;
    attemptedAt: Date;
  }): Promise<boolean>;
}
