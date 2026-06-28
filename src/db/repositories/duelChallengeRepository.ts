import type { CharacterRecord } from "./characterRepository";
import type { CharacterEquipmentRecord } from "./equipmentRepository";
import type { CharacterStats } from "../../domain/characters/starterStats";
import type {
  DuelMode,
  TurnBasedDuelAction,
  TurnBasedDuelState,
  TurnBasedDuelStatus
} from "../../domain/duels/turnBasedDuel";

export type { DuelMode } from "../../domain/duels/turnBasedDuel";

export type DuelChallengeStatus =
  | "pending"
  | "active"
  | "declined"
  | "expired"
  | "resolved"
  | "forfeited"
  | "cancelled";

export interface DuelCharacterSnapshot extends CharacterRecord {
  telegramUserId: bigint;
  equipment: CharacterEquipmentRecord[];
}

export interface DuelResultPayload {
  mode?: DuelMode;
  rulesVersion?: string;
  terminalReason?: "defeat" | "surrender" | "max-turns" | "expired";
  xpRewards?: {
    challenger: number;
    target: number;
  };
  outcome: "challenger" | "target" | "draw";
  winnerCharacterId: string | null;
  loserCharacterId: string | null;
  challengerScore: number;
  targetScore: number;
  swing: number;
  flavorKey: string;
  balanceVersion?: string;
  participants?: {
    challenger: DuelResultParticipantSnapshot;
    target: DuelResultParticipantSnapshot;
  };
  audit?: {
    challenger: DuelResultBalanceAudit;
    target: DuelResultBalanceAudit;
  };
}

export interface DuelResultParticipantSnapshot {
  characterId: string;
  displayName: string;
  activeCosmeticTitle?: string | null;
  title: string;
  raceId: string;
  raceName: string;
  classId: string;
  className: string;
  level: number;
  remortCount: number;
}

export interface DuelResultProgressionBudget {
  level: number;
  remortCount: number;
  hpMax: number;
  manaMax: number;
  stats: CharacterStats;
  score: number;
}

export interface DuelResultBalanceAudit {
  balanceVersion: string;
  originalLevel: number;
  originalRemortCount: number;
  effectiveCombatLevel: number;
  progressionBudget: DuelResultProgressionBudget;
  targetProgressionBudget: DuelResultProgressionBudget;
  temporaryHpMax: number;
  temporaryManaMax: number;
  temporaryStats: CharacterStats;
  readinessPenalty: number;
  preparedScore: number;
}

export interface DuelChallengeRecord {
  id: string;
  challengerCharacterId: string;
  targetCharacterId: string | null;
  contextChatId: bigint | null;
  inviteToken: string;
  mode: DuelMode;
  status: DuelChallengeStatus;
  expiresAt: Date;
  resolvedAt: Date | null;
  result: DuelResultPayload | null;
  createdAt: Date;
  updatedAt: Date;
  challenger: DuelCharacterSnapshot;
  target: DuelCharacterSnapshot | null;
}

export interface DuelCombatSessionRecord {
  id: string;
  duelChallengeId: string;
  challengerCharacterId: string;
  targetCharacterId: string;
  status: TurnBasedDuelStatus;
  actingCharacterId: string;
  state: TurnBasedDuelState;
  turn: number;
  version: number;
  turnExpiresAt: Date;
  completedAt: Date | null;
  challengerChatId: bigint | null;
  challengerMessageId: number | null;
  targetChatId: bigint | null;
  targetMessageId: number | null;
  createdAt: Date;
  updatedAt: Date;
  challenge: DuelChallengeRecord;
}

export interface ResolvedDuelChallengeRecord extends DuelChallengeRecord {
  status: "resolved";
  resolvedAt: Date;
  result: DuelResultPayload;
  target: DuelCharacterSnapshot;
}

export interface CreateDuelChallengeInput {
  inviteToken: string;
  mode?: DuelMode;
  contextChatId?: bigint | null;
  expiresAt: Date;
}

export interface StartTurnBasedDuelSessionInput {
  sessionId: string;
  state: TurnBasedDuelState;
  turnExpiresAt: Date;
  targetChatId?: bigint | null;
  targetMessageId?: number | null;
}

export interface TransitionResult<T> {
  record: T | null;
  transitioned: boolean;
}

export interface UpdateTurnBasedDuelSessionInput {
  state: TurnBasedDuelState;
  status: TurnBasedDuelStatus;
  turnExpiresAt: Date;
  now: Date;
  deadlineMode: "player-action" | "timeout";
  completedAt?: Date | null;
  result?: DuelResultPayload | null;
  action?: {
    actorCharacterId: string;
    turn: number;
    actionKey: TurnBasedDuelAction | "timeout-attack" | "round";
    result: unknown;
  };
}

export interface DuelChallengeRepository {
  createOpenForTelegramUser(
    telegramUserId: bigint,
    input: CreateDuelChallengeInput
  ): Promise<DuelChallengeRecord | null>;

  createTargetedForTelegramUser(
    telegramUserId: bigint,
    targetCharacterId: string,
    input: CreateDuelChallengeInput
  ): Promise<DuelChallengeRecord | null>;

  findByToken(inviteToken: string): Promise<DuelChallengeRecord | null>;

  findCharacterByTelegramUser(
    telegramUserId: bigint
  ): Promise<DuelCharacterSnapshot | null>;

  markExpiredByToken(inviteToken: string, now: Date): Promise<DuelChallengeRecord | null>;

  cancelByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<TransitionResult<DuelChallengeRecord>>;

  declineByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<TransitionResult<DuelChallengeRecord>>;

  acceptByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    result: DuelResultPayload
  ): Promise<TransitionResult<DuelChallengeRecord>>;

  countResolvedBetweenCharacterPairSince(
    characterAId: string,
    characterBId: string,
    since: Date
  ): Promise<number>;

  listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]>;

  startTurnBasedByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    input: StartTurnBasedDuelSessionInput
  ): Promise<TransitionResult<DuelCombatSessionRecord>>;

  findActiveTurnBasedByTelegramUserId(
    telegramUserId: bigint
  ): Promise<DuelCombatSessionRecord | null>;

  findActiveCombatBlockerCharacterId(
    characterIds: string[]
  ): Promise<string | null>;

  findTurnBasedByTokenForTelegramUserId(
    inviteToken: string,
    telegramUserId: bigint
  ): Promise<DuelCombatSessionRecord | null>;

  findTurnBasedByToken(inviteToken: string): Promise<DuelCombatSessionRecord | null>;

  updateTurnBasedIfActiveVersion(
    sessionId: string,
    expectedTurn: number,
    expectedVersion: number,
    input: UpdateTurnBasedDuelSessionInput
  ): Promise<DuelCombatSessionRecord | null>;

  listDueTurnBasedSessions(now: Date, limit?: number): Promise<DuelCombatSessionRecord[]>;

  recordTurnBasedMessageReference(
    sessionId: string,
    participant: "challenger" | "target",
    reference: { chatId: bigint; messageId: number }
  ): Promise<DuelCombatSessionRecord | null>;

  repairTurnBasedCombatState(now: Date): Promise<{
    repairedSessions: number;
    removedOrphanLeases: number;
  }>;
}
