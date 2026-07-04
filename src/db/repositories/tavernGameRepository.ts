import type { CharacterRecord } from "./characterRepository";
import type { DicePokerMode, DicePokerState, DicePokerStoredState } from "../../domain/dicePoker";
import type { TavernGameDecision, TavernGameKey, TavernGameResolution } from "../../domain/tavernGames";

export type TavernGameSessionStatus =
  | "open"
  | "ready"
  | "resolving"
  | "completed"
  | "cancelled_refund"
  | "expired_refund"
  | "failed_safe_refund";

export type TavernGameParticipantStatus =
  | "joined"
  | "decided"
  | "completed"
  | "left_refunded";

export interface TavernGameCharacterSnapshot extends CharacterRecord {
  telegramUserId: bigint;
  remortCount: number;
}

export interface TavernGameParticipantRecord {
  id: string;
  sessionId: string;
  characterId: string;
  telegramUserId: bigint;
  displayName: string;
  remortCount: number;
  status: TavernGameParticipantStatus;
  stakeGold: number;
  payoutGold: number;
  refundedGold: number;
  decision: unknown;
  result: unknown;
  joinedAt: Date;
  decidedAt: Date | null;
  completedAt: Date | null;
  character: TavernGameCharacterSnapshot;
}

export interface TavernGameSessionRecord {
  id: string;
  token: string;
  gameKey: TavernGameKey;
  status: TavernGameSessionStatus;
  creatorCharacterId: string;
  stakeGold: number;
  potGold: number;
  seed: string;
  rulesVersion: string;
  result: unknown;
  openedAt: Date;
  joinExpiresAt: Date;
  decisionExpiresAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  creator: TavernGameCharacterSnapshot;
  participants: TavernGameParticipantRecord[];
}

export interface TavernGameLeaderboardEntry {
  characterId: string;
  name: string;
  activeCosmeticTitle?: string | null;
  winCount: number;
  drawCount: number;
  lossCount: number;
}

export interface TavernGameLeaderboard {
  day: TavernGameLeaderboardEntry[];
  week: TavernGameLeaderboardEntry[];
  month: TavernGameLeaderboardEntry[];
}

export type TavernGameGateReason =
  | "wrong-place"
  | "active-combat"
  | "pending-raid"
  | "doppelganger-at-fighting-corner";

export type TavernGameCreateResult =
  | { state: "no-character" }
  | { state: "blocked"; reason: TavernGameGateReason }
  | { state: "invalid-stake"; maxStake: number }
  | { state: "insufficient-gold"; character: CharacterRecord; stakeGold: number }
  | { state: "active-session"; session: TavernGameSessionRecord }
  | { state: "cooldown"; availableAt: Date }
  | { state: "created"; session: TavernGameSessionRecord };

export type TavernGameJoinResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "blocked"; reason: TavernGameGateReason }
  | { state: "closed"; session: TavernGameSessionRecord }
  | { state: "full"; session: TavernGameSessionRecord }
  | { state: "self-join"; session: TavernGameSessionRecord }
  | { state: "already-joined"; session: TavernGameSessionRecord }
  | { state: "insufficient-gold"; character: CharacterRecord; session: TavernGameSessionRecord }
  | { state: "active-session"; session: TavernGameSessionRecord }
  | { state: "joined"; session: TavernGameSessionRecord }
  | { state: "started"; session: TavernGameSessionRecord };

export type TavernGameDecisionResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "blocked"; reason: TavernGameGateReason }
  | { state: "not-participant"; session: TavernGameSessionRecord }
  | { state: "closed"; session: TavernGameSessionRecord }
  | { state: "decided"; session: TavernGameSessionRecord }
  | { state: "replayed"; session: TavernGameSessionRecord }
  | { state: "failed-refund"; session: TavernGameSessionRecord }
  | { state: "resolved"; session: TavernGameSessionRecord; resolution: TavernGameResolution };

export type TavernGameResolveResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-creator"; session: TavernGameSessionRecord }
  | { state: "not-ready"; session: TavernGameSessionRecord }
  | { state: "closed"; session: TavernGameSessionRecord }
  | { state: "failed-refund"; session: TavernGameSessionRecord }
  | { state: "resolved"; session: TavernGameSessionRecord; resolution: TavernGameResolution }
  | { state: "started"; session: TavernGameSessionRecord; resolution: null }
  | { state: "replayed"; session: TavernGameSessionRecord; resolution: TavernGameResolution | null };

export type TavernGameCancelResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-creator"; session: TavernGameSessionRecord }
  | { state: "not-cancellable"; session: TavernGameSessionRecord }
  | { state: "cancelled"; session: TavernGameSessionRecord };

export type DicePokerActionResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "blocked"; reason: TavernGameGateReason }
  | { state: "not-participant"; session: TavernGameSessionRecord }
  | { state: "closed"; session: TavernGameSessionRecord }
  | { state: "stale"; session: TavernGameSessionRecord }
  | { state: "saved"; session: TavernGameSessionRecord; dicePoker: DicePokerState }
  | { state: "completed"; session: TavernGameSessionRecord; dicePoker: DicePokerState }
  | { state: "cancelled"; session: TavernGameSessionRecord };

export interface TavernGameRepository {
  listOpen(now: Date, limit?: number): Promise<TavernGameSessionRecord[]>;
  listCompletedSince(since: Date, limit?: number): Promise<TavernGameSessionRecord[]>;
  peekByToken(token: string): Promise<TavernGameSessionRecord | null>;
  getByToken(token: string, now: Date): Promise<TavernGameSessionRecord | null>;
  createForTelegramUser(
    telegramUserId: bigint,
    input: {
      gameKey: TavernGameKey;
      token: string;
      seed: string;
      stakeGold: number;
      maxStake: number;
      joinExpiresAt: Date;
      decisionExpiresAt: Date;
      cooldownMs: number;
      now: Date;
    }
  ): Promise<TavernGameCreateResult>;
  createDicePokerForTelegramUser(
    telegramUserId: bigint,
    input: {
      mode: DicePokerMode;
      token: string;
      seed: string;
      stakeGold: number;
      maxStake: number;
      expiresAt: Date;
      cooldownMs: number;
      now: Date;
      state: DicePokerStoredState;
      participantState?: DicePokerState;
      status?: "open" | "ready";
      joinExpiresAt?: Date;
      decisionExpiresAt?: Date | null;
    }
  ): Promise<TavernGameCreateResult>;
  joinByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: { now: Date; decisionExpiresAt: Date }
  ): Promise<TavernGameJoinResult>;
  submitDecisionForTelegramUser(
    telegramUserId: bigint,
    token: string,
    decision: TavernGameDecision,
    now: Date
  ): Promise<TavernGameDecisionResult>;
  resolveKostiForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<TavernGameResolveResult>;
  saveDicePokerStateForTelegramUser(
    telegramUserId: bigint,
    token: string,
    state: DicePokerState,
    now: Date,
    expiresAt?: Date
  ): Promise<DicePokerActionResult>;
  completeDicePokerForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: {
      state: DicePokerState;
      outcome: "win" | "loss" | "draw";
      payoutGold: number;
      refundedGold: number;
      now: Date;
    }
  ): Promise<DicePokerActionResult>;
  cancelDicePokerForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<DicePokerActionResult>;
  saveDicePokerParticipantStateForTelegramUser(
    telegramUserId: bigint,
    token: string,
    state: DicePokerState,
    now: Date,
    expiresAt?: Date
  ): Promise<DicePokerActionResult>;
  resetCreateCooldownForTelegramUser(
    telegramUserId: bigint,
    input: { now: Date; cooldownMs: number }
  ): Promise<{ state: "no-character" } | { state: "reset"; updated: number }>;
  cancelForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<TavernGameCancelResult>;
  refundDisabledByToken(token: string, now: Date): Promise<TavernGameSessionRecord | null>;
  expireDue(now: Date, limit?: number): Promise<number>;
}
