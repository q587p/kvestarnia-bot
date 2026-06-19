import type { CharacterRecord } from "./characterRepository";
import type { CharacterEquipmentRecord } from "./equipmentRepository";
import type { CharacterStats } from "../../domain/characters/starterStats";

export type DuelChallengeStatus =
  | "pending"
  | "declined"
  | "expired"
  | "resolved"
  | "cancelled";

export interface DuelCharacterSnapshot extends CharacterRecord {
  telegramUserId: bigint;
  equipment: CharacterEquipmentRecord[];
}

export interface DuelResultPayload {
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
  status: DuelChallengeStatus;
  expiresAt: Date;
  resolvedAt: Date | null;
  result: DuelResultPayload | null;
  createdAt: Date;
  updatedAt: Date;
  challenger: DuelCharacterSnapshot;
  target: DuelCharacterSnapshot | null;
}

export interface ResolvedDuelChallengeRecord extends DuelChallengeRecord {
  status: "resolved";
  resolvedAt: Date;
  result: DuelResultPayload;
  target: DuelCharacterSnapshot;
}

export interface CreateDuelChallengeInput {
  inviteToken: string;
  contextChatId?: bigint | null;
  expiresAt: Date;
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
  ): Promise<DuelChallengeRecord | null>;

  declineByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<DuelChallengeRecord | null>;

  acceptByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    result: DuelResultPayload
  ): Promise<DuelChallengeRecord | null>;

  countResolvedBetweenCharacterPairSince(
    characterAId: string,
    characterBId: string,
    since: Date
  ): Promise<number>;

  listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]>;
}
