import type { CombatLifeState, CombatSettlementStatus, CombatState, CombatStatus } from "../../domain/combat";

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

export interface SoloCombatSessionCompletionRecord {
  monsterId: string;
  status: SoloCombatSessionStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date;
  state: CombatState | null;
}

export interface DueSoloCombatSessionRecord extends SoloCombatSessionRecord {
  telegramUserId: bigint;
}

export interface CreateSoloCombatSessionInput {
  id?: string;
  monsterId: string;
  state: CombatState;
  expiresAt: Date;
  drinkStateCommit?: CombatDrinkStateCommit;
}

export interface CombatDrinkStateCommit {
  expectedStateId: string;
  expectedActivationId: string;
  expectedStartedAt: Date;
  expectedExpiresAt: Date;
  drinkKey: string;
  phase: "timed" | "queued";
  now: Date;
  metadata?: unknown;
}

export interface UpdateSoloCombatSessionInput {
  state: CombatState;
  status: SoloCombatSessionStatus;
  expiresAt?: Date;
  releaseLease?: boolean;
  satedLeaseAt?: Date;
}

export interface ApplyCombatItemTurnInput extends UpdateSoloCombatSessionInput {
  telegramUserId: bigint;
  characterId: string;
  itemId: string;
  now: Date;
  allowNonmedicalConsumables?: boolean;
}

export type ApplyCombatItemTurnOutcome =
  | "updated"
  | "stale-turn"
  | "not-usable"
  | "not-owned"
  | "reserved";

export interface ApplyCombatItemTurnResult {
  outcome: ApplyCombatItemTurnOutcome;
  session: SoloCombatSessionRecord | null;
}

export interface RecordSoloCombatRewardInput {
  rewardXp: number;
  rewardGold: number;
  itemGrants: Array<{ itemId: string; quantity: number }>;
  claimedAt: Date;
  state?: CombatState;
  status?: SoloCombatSessionStatus;
  releaseLease?: boolean;
}

export interface SoloCombatSessionLifeRecord {
  remortCount: number;
}

export type SoloCombatLeaseLookupResult =
  | { state: "none" }
  | { state: "unsupported"; kind: string; referenceId: string }
  | { state: "missing-session"; referenceId: string }
  | { state: "active"; session: SoloCombatSessionRecord }
  | { state: "terminal-pending"; session: SoloCombatSessionRecord }
  | { state: "terminal-completed"; session: SoloCombatSessionRecord }
  | { state: "terminal-forfeited"; session: SoloCombatSessionRecord };

export type GuardedSettlementOutcome =
  | "completed"
  | "forfeited"
  | "already-completed"
  | "already-forfeited"
  | "substeps-incomplete"
  | "version-changed"
  | "missing";

export type GuardedResourceSettlementOutcome =
  | "applied"
  | "already-applied"
  | "already-completed"
  | "already-forfeited"
  | "life-mismatch"
  | "resource-cas-conflict"
  | "version-changed"
  | "missing";

export type GuardedTrainingSettlementOutcome =
  | "applied"
  | "already-applied"
  | "already-completed"
  | "already-forfeited"
  | "life-mismatch"
  | "cooldown-conflict"
  | "version-changed"
  | "missing";

export interface GuardedSettlementExpectation {
  settlementStatus?: CombatSettlementStatus;
  settlementVersion?: number;
  combatStatus?: SoloCombatSessionStatus;
  life?: Pick<CombatLifeState, "remortCount">;
}

export interface CompleteSoloCombatSettlementInput {
  expected?: GuardedSettlementExpectation;
  settledAt: Date;
  reward?: {
    rewardXp: number;
    rewardGold: number;
    itemGrants: Array<{ itemId: string; quantity: number }>;
    claimedAt: Date;
  };
  releaseLease?: boolean;
}

export interface ForfeitSoloCombatSettlementInput {
  expected?: GuardedSettlementExpectation;
  settledAt: Date;
  reason: "remort" | "life-mismatch" | "legacy-life-mismatch";
  releaseLease?: boolean;
}

export interface GuardedSettlementResult {
  outcome: GuardedSettlementOutcome;
  session: SoloCombatSessionRecord | null;
}

export interface ApplyTerminalResourcesInput {
  expected: GuardedSettlementExpectation & {
    life: Pick<CombatLifeState, "remortCount">;
  };
  appliedAt: Date;
  resources: {
    hpCurrent: number;
    manaCurrent: number;
    hpRegenAt: Date;
    manaRegenAt: Date;
  };
  expectedResources: {
    hpCurrent: number;
    manaCurrent: number;
    hpRegenAt?: Date | null;
    manaRegenAt?: Date | null;
  };
}

export interface ApplyTerminalResourcesResult {
  outcome: GuardedResourceSettlementOutcome;
  session: SoloCombatSessionRecord | null;
}

export interface ApplyTrainingCooldownInput {
  telegramUserId: bigint;
  expected: GuardedSettlementExpectation & {
    life: Pick<CombatLifeState, "remortCount">;
  };
  now: Date;
  availableAt: Date;
  cooldownKey: string;
}

export interface ApplyTrainingCooldownResult {
  outcome: GuardedTrainingSettlementOutcome;
  session: SoloCombatSessionRecord | null;
  availableAt: Date | null;
}

export type LegacySoloCombatSettlementAdoptionOutcome =
  | "adopted"
  | "already-current"
  | "already-terminal-settlement"
  | "life-mismatch"
  | "stale-status-turn"
  | "missing-state"
  | "missing-mismatched-lease"
  | "missing";

export interface AdoptLegacySoloCombatSettlementInput {
  expectedStatus: SoloCombatSessionStatus;
  expectedTurn: number;
  expectedSettlementVersion?: number | null;
  now: Date;
}

export interface AdoptLegacySoloCombatSettlementResult {
  outcome: LegacySoloCombatSettlementAdoptionOutcome;
  session: SoloCombatSessionRecord | null;
}

export interface SoloCombatSessionRepository {
  findActiveByTelegramUserId(telegramUserId: bigint): Promise<SoloCombatSessionRecord | null>;
  findLeasedByTelegramUserId?(telegramUserId: bigint): Promise<SoloCombatLeaseLookupResult>;
  findLeasedByCharacterId?(characterId: string): Promise<SoloCombatLeaseLookupResult>;
  releaseLeaseBySessionId?(sessionId: string, now?: Date): Promise<boolean>;
  listDueActiveSessions?(
    now: Date,
    options?: {
      limit?: number;
      monsterIds?: readonly string[];
      excludeMonsterIds?: readonly string[];
    }
  ): Promise<DueSoloCombatSessionRecord[]>;
  countWonByTelegramUserId(
    telegramUserId: bigint,
    options?: {
      excludeMonsterIds?: readonly string[];
      since?: Date;
      life?: Pick<CombatLifeState, "remortCount">;
    }
  ): Promise<number>;
  listCompletedByTelegramUserIdSince(
    telegramUserId: bigint,
    since: Date
  ): Promise<SoloCombatSessionCompletionRecord[]>;
  countProgressEligibleWinsByTelegramUserId?(
    telegramUserId: bigint,
    options: {
      monsterIds: readonly string[];
      completedSince: Date;
      life: Pick<CombatLifeState, "remortCount">;
      limit: number;
    }
  ): Promise<number>;
  countBoundedWonByTelegramUserId?(
    telegramUserId: bigint,
    options: {
      excludeMonsterIds?: readonly string[];
      since?: Date;
      life?: Pick<CombatLifeState, "remortCount">;
      limit: number;
    }
  ): Promise<number>;
  listRecentCompletedByTelegramUserId?(
    telegramUserId: bigint,
    limit: number
  ): Promise<SoloCombatSessionCompletionRecord[]>;
  clearMonsterRestCooldownForTelegramUser?(
    telegramUserId: bigint,
    input: { since: Date; completedAt: Date }
  ): Promise<number>;
  listRecentOrdinaryMonsterIdsByTelegramUserId?(
    telegramUserId: bigint,
    limit: number
  ): Promise<string[]>;
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
  applyCombatItemTurnById?(
    sessionId: string,
    expectedTurn: number,
    input: ApplyCombatItemTurnInput
  ): Promise<ApplyCombatItemTurnResult>;
  recordRewardById(
    sessionId: string,
    input: RecordSoloCombatRewardInput
  ): Promise<SoloCombatSessionRecord | null>;
  completeSettlementById?(
    sessionId: string,
    input: CompleteSoloCombatSettlementInput
  ): Promise<GuardedSettlementResult>;
  applyTerminalResourcesById?(
    sessionId: string,
    input: ApplyTerminalResourcesInput
  ): Promise<ApplyTerminalResourcesResult>;
  applyTrainingCooldownById?(
    sessionId: string,
    input: ApplyTrainingCooldownInput
  ): Promise<ApplyTrainingCooldownResult>;
  adoptLegacySettlementById?(
    sessionId: string,
    input: AdoptLegacySoloCombatSettlementInput
  ): Promise<AdoptLegacySoloCombatSettlementResult>;
  forfeitSettlementById?(
    sessionId: string,
    input: ForfeitSoloCombatSettlementInput
  ): Promise<GuardedSettlementResult>;
  resolveLifeById?(sessionId: string): Promise<SoloCombatSessionLifeRecord | null>;
  markStatusById(
    sessionId: string,
    status: SoloCombatSessionStatus,
    observedAt?: Date
  ): Promise<SoloCombatSessionRecord | null>;
}
