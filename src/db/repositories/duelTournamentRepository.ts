import type { Prisma } from "@prisma/client";
import type { DuelTournamentPeriod, DuelTournamentReward } from "../../domain/duels/duelTournament";
import type { CharacterRecord } from "./characterRepository";

export interface DuelTournamentClaimRecord {
  id: string;
  characterId: string;
  period: DuelTournamentPeriod;
  periodKey: string;
  points: number;
  rank: number;
  rewardGold: number;
  rewardItems: Prisma.JsonValue;
  result: Prisma.JsonValue | null;
  claimedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DuelTournamentCharacterRecord extends CharacterRecord {
  telegramUserId: bigint;
}

export interface ClaimDuelTournamentRewardInput {
  characterId: string;
  period: DuelTournamentPeriod;
  periodKey: string;
  points: number;
  rank: number;
  reward: DuelTournamentReward;
  result: Record<string, unknown>;
  claimedAt: Date;
}

export interface DuelTournamentClaimResult {
  claim: DuelTournamentClaimRecord;
  created: boolean;
}

export interface DuelTournamentRepository {
  findCharacterByTelegramUser(
    telegramUserId: bigint
  ): Promise<DuelTournamentCharacterRecord | null>;

  findClaim(
    characterId: string,
    period: DuelTournamentPeriod,
    periodKey: string
  ): Promise<DuelTournamentClaimRecord | null>;

  listClaimsForCharacter(characterId: string): Promise<DuelTournamentClaimRecord[]>;

  claimReward(input: ClaimDuelTournamentRewardInput): Promise<DuelTournamentClaimResult>;
}
