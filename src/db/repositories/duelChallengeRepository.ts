import type { CharacterRecord } from "./characterRepository";
import type { CharacterEquipmentRecord } from "./equipmentRepository";

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
}
