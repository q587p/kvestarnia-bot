import type { CombatState } from "../../domain/combat";
import type { PersistentFightDifficultyId } from "../../services/fightService";
import type { SoloCombatSessionRecord } from "./soloCombatSessionRepository";

export type PendingPassageEncounterStatus = "pending" | "consumed" | "expired" | "cancelled";

export interface PendingPassageEncounterRecord {
  id: string;
  token: string;
  characterId: string;
  originLocationId: string;
  passage: "deep-left" | "deep-straight" | "deep-right";
  difficulty: PersistentFightDifficultyId;
  monsterId: string;
  baseMonsterLevel: number;
  effectiveMonsterLevel: number;
  rulesVersion: string;
  seedHash: string;
  status: PendingPassageEncounterStatus;
  version: number;
  combatSessionId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePendingPassageEncounterInput {
  token: string;
  originLocationId: string;
  passage: "deep-left" | "deep-straight" | "deep-right";
  difficulty: PersistentFightDifficultyId;
  monsterId: string;
  baseMonsterLevel: number;
  effectiveMonsterLevel: number;
  rulesVersion: string;
  seedHash: string;
  expiresAt: Date;
}

export interface ConsumePendingPassageEncounterInput {
  sessionId: string;
  monsterId: string;
  state: CombatState;
  sessionExpiresAt: Date;
  now: Date;
}

export type ConsumePendingPassageEncounterResult =
  | { state: "consumed"; encounter: PendingPassageEncounterRecord; session: SoloCombatSessionRecord }
  | { state: "already-consumed"; encounter: PendingPassageEncounterRecord; session: SoloCombatSessionRecord | null }
  | { state: "invalid" }
  | { state: "not-pending"; encounter: PendingPassageEncounterRecord }
  | { state: "active-fight"; session: SoloCombatSessionRecord };

export interface PendingPassageEncounterRepository {
  findReusableForTelegramUser(
    telegramUserId: bigint,
    originLocationId: string,
    now: Date
  ): Promise<PendingPassageEncounterRecord | null>;
  findByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<PendingPassageEncounterRecord | null>;
  createForTelegramUser(
    telegramUserId: bigint,
    input: CreatePendingPassageEncounterInput
  ): Promise<PendingPassageEncounterRecord | null>;
  expireById(id: string, now: Date): Promise<PendingPassageEncounterRecord | null>;
  consumeForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput
  ): Promise<ConsumePendingPassageEncounterResult>;
}
