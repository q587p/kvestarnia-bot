import type { CombatState } from "../../domain/combat";
import type { CombatDrinkStateCommit } from "./soloCombatSessionRepository";
import type { PersistentFightDifficultyId } from "../../services/fightService";
import type { SoloCombatSessionRecord } from "./soloCombatSessionRepository";

export type PendingPassageEncounterStatus = "pending" | "reserved" | "consumed" | "expired" | "cancelled";

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
  reservationOrigin: string | null;
  reservationRemortCount: number | null;
  reservedPartySessionId: string | null;
  reservedPartyInviteToken: string | null;
  groupCombatSessionId: string | null;
  reservedAt: Date | null;
  expiresAt: Date;
  consumedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePendingPassageEncounterInput {
  now: Date;
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
  expectedEncounterVersion: number;
  expectedRulesVersion?: string;
  expectedLinkedSessionId?: string | null;
  monsterId: string;
  state: CombatState;
  sessionExpiresAt: Date;
  now: Date;
  drinkStateCommit?: CombatDrinkStateCommit;
}

export interface ConsumedPendingPassageEncounterRecord {
  encounter: PendingPassageEncounterRecord;
  session: SoloCombatSessionRecord | null;
}

export type ConsumePendingPassageEncounterResult =
  | { state: "consumed"; encounter: PendingPassageEncounterRecord; session: SoloCombatSessionRecord }
  | { state: "already-consumed"; encounter: PendingPassageEncounterRecord; session: SoloCombatSessionRecord | null }
  | { state: "invalid" }
  | { state: "version-changed"; encounter: PendingPassageEncounterRecord }
  | { state: "not-pending"; encounter: PendingPassageEncounterRecord }
  | { state: "active-fight"; session: SoloCombatSessionRecord }
  | { state: "active-lease-conflict" };

export type ExpirePendingPassageEncounterResult =
  | { state: "expired"; encounter: PendingPassageEncounterRecord }
  | { state: "already-consumed"; encounter: PendingPassageEncounterRecord }
  | { state: "already-terminal"; encounter: PendingPassageEncounterRecord }
  | { state: "version-changed"; encounter: PendingPassageEncounterRecord }
  | { state: "missing" };

export interface PendingPassageEncounterRepository {
  findReusableForTelegramUser(
    telegramUserId: bigint,
    originLocationId: string,
    now: Date,
    rulesVersion?: string
  ): Promise<PendingPassageEncounterRecord | null>;
  findByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string,
    rulesVersion?: string
  ): Promise<PendingPassageEncounterRecord | null>;
  findLatestConsumedForTelegramUser(
    telegramUserId: bigint,
    originLocationId: string,
    now: Date,
    rulesVersion?: string
  ): Promise<ConsumedPendingPassageEncounterRecord | null>;
  createForTelegramUser(
    telegramUserId: bigint,
    input: CreatePendingPassageEncounterInput
  ): Promise<PendingPassageEncounterRecord | null>;
  expireById(input: {
    id: string;
    expectedStatus: "pending";
    expectedVersion: number;
    now: Date;
  }): Promise<ExpirePendingPassageEncounterResult>;
  consumeForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput
  ): Promise<ConsumePendingPassageEncounterResult>;
  createSessionForConsumedEncounter(
    telegramUserId: bigint,
    token: string,
    input: ConsumePendingPassageEncounterInput
  ): Promise<ConsumePendingPassageEncounterResult>;
}
