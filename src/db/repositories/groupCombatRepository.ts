import type {
  GroupCombatActionKey,
  GroupCombatResult,
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
}

export interface GroupCombatQueuedActionRecord {
  actorCharacterId: string;
  turn: number;
  action: GroupCombatActionKey;
  targetKind: GroupCombatTargetKind;
  targetId: string;
  origin: "manual" | "timeout";
}

export interface GroupCombatSessionRecord {
  id: string;
  partySessionId: string;
  partyInviteToken: string;
  status: GroupCombatState["status"];
  turn: number;
  version: number;
  state: GroupCombatState;
  result: GroupCombatResult | null;
  turnExpiresAt: Date;
  completedAt: Date | null;
  participants: GroupCombatParticipantRecord[];
  queuedActions: GroupCombatQueuedActionRecord[];
}

export type GroupCombatStartResult =
  | { state: "disabled" | "no-character" | "not-found" | "not-leader" | "not-recruiting" | "invalid-size" | "invalid-life" | "blocked" | "invalid-roster" }
  | { state: "started" | "already-active" | "terminal"; session: GroupCombatSessionRecord };

export type GroupCombatActionResult =
  | { state: "disabled" | "no-character" | "not-found" | "not-participant" | "stale" | "actor-unavailable" | "invalid-target" | "invalidated" }
  | { state: "queued" | "duplicate" | "resolved" | "terminal"; session: GroupCombatSessionRecord };

export interface GroupCombatRepository {
  startProofForTelegramUser(input: {
    telegramUserId: bigint;
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
    now: Date;
    nextTurnExpiresAt: Date;
  }): Promise<GroupCombatActionResult>;

  resolveTimedOutSession(input: {
    sessionId: string;
    now: Date;
    nextTurnExpiresAt: Date;
  }): Promise<GroupCombatActionResult>;

  findByPartyInviteToken(partyInviteToken: string): Promise<GroupCombatSessionRecord | null>;
  findActiveByTelegramUserId(telegramUserId: bigint): Promise<GroupCombatSessionRecord | null>;
  listDueSessionIds(now: Date, limit: number): Promise<string[]>;
  repairInvalidOrOrphaned(now: Date, limit: number): Promise<number>;

  compareAndSetParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean>;
}
