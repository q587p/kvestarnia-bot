import type {
  GroupCombatActionKey,
  GroupCombatResult,
  GroupCombatSettlementPlan,
  GroupCombatSettlementReceipt,
  GroupCombatState,
  GroupCombatTargetKind
} from "../../domain/groupCombat/groupCombat";

export interface GroupCombatParticipantRecord {
  characterId: string;
  telegramUserId: bigint;
  name: string;
  remortCount: number;
  rosterOrder: number;
  chatId: bigint | null;
  messageId: number | null;
  referenceVersion: number;
  deliveredRevision: number;
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

export type GroupCombatStartResult =
  | {
      state: "disabled" | "no-character" | "not-found" | "not-leader" | "not-recruiting" | "invalid-size" | "invalid-life" | "blocked" | "invalid-roster";
      partyVersion?: number;
    }
  | { state: "started" | "already-active" | "terminal"; session: GroupCombatSessionRecord };

export type GroupCombatActionResult =
  | { state: "disabled" | "no-character" | "not-found" | "not-participant" | "stale" | "actor-unavailable" | "invalid-target" | "action-unavailable" | "invalidated" }
  | { state: "queued" | "replaced" | "duplicate" | "resolved" | "terminal"; session: GroupCombatSessionRecord };

export interface GroupCombatRepository {
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
  }): Promise<GroupCombatActionResult>;

  resolveTimedOutSession(input: {
    sessionId: string;
    now: Date;
    nextTurnExpiresAt: Date;
  }): Promise<GroupCombatActionResult>;

  findByPartyInviteToken(partyInviteToken: string): Promise<GroupCombatSessionRecord | null>;
  findById(sessionId: string): Promise<GroupCombatSessionRecord | null>;
  findActiveByTelegramUserId(telegramUserId: bigint): Promise<GroupCombatSessionRecord | null>;
  listDueSessionIds(now: Date, limit: number): Promise<string[]>;
  listPendingDeliverySessionIds(limit: number): Promise<string[]>;
  repairInvalidOrOrphaned(now: Date, limit: number): Promise<number>;

  settleParticipant(input: {
    sessionId: string;
    telegramUserId: bigint;
    now: Date;
  }): Promise<
    | { state: "not-found" | "not-participant" | "not-terminal" | "invalid-plan" }
    | { state: "settled" | "replayed"; receipt: GroupCombatSettlementReceipt }
  >;

  compareAndSetParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
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

  finalizeDeliveryAttempt(input: {
    sessionId: string;
    expectedDeliveryRevision: number;
    attemptedAt: Date;
  }): Promise<boolean>;
}
