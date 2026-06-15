import type { CombatState, CombatStatus } from "../../domain/combat";

export type SoloCombatSessionStatus = CombatStatus;

export interface SoloCombatRewardRecord {
  xp: number;
  gold: number;
  itemGrants: Array<{ itemId: string; quantity: number }>;
  claimedAt: Date;
}

export interface SoloCombatSessionRecord {
  id: string;
  characterId: string;
  monsterId: string;
  status: SoloCombatSessionStatus;
  turn: number;
  state: CombatState | null;
  reward: SoloCombatRewardRecord | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface CreateSoloCombatSessionInput {
  id?: string;
  monsterId: string;
  state: CombatState;
  expiresAt: Date;
}

export interface UpdateSoloCombatSessionInput {
  state: CombatState;
  status: SoloCombatSessionStatus;
  expiresAt?: Date;
}

export interface RecordSoloCombatRewardInput {
  rewardXp: number;
  rewardGold: number;
  itemGrants: Array<{ itemId: string; quantity: number }>;
  claimedAt: Date;
}

export interface SoloCombatSessionRepository {
  findActiveByTelegramUserId(telegramUserId: bigint): Promise<SoloCombatSessionRecord | null>;
  countWonByTelegramUserId(telegramUserId: bigint): Promise<number>;
  findByIdForTelegramUserId(
    telegramUserId: bigint,
    sessionId: string
  ): Promise<SoloCombatSessionRecord | null>;
  createForTelegramUser(
    telegramUserId: bigint,
    input: CreateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null>;
  updateById(
    sessionId: string,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null>;
  updateByIdIfActiveTurn(
    sessionId: string,
    expectedTurn: number,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null>;
  recordRewardById(
    sessionId: string,
    input: RecordSoloCombatRewardInput
  ): Promise<SoloCombatSessionRecord | null>;
  markStatusById(
    sessionId: string,
    status: SoloCombatSessionStatus
  ): Promise<SoloCombatSessionRecord | null>;
}
