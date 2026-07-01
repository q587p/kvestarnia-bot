import type { CharacterRecord } from "./characterRepository";

export type PartySessionStatus = "recruiting" | "cancelled" | "expired" | "active" | "completed";
export type PartyParticipantStatus = "joined" | "left";
export type PartyJoinSource = "leader" | "nearby" | "deep-link" | "dev";

export interface PartyCharacterSnapshot extends CharacterRecord {
  telegramUserId: bigint;
  activeCosmeticTitleGrantId?: string | null;
  remortCount: number;
}

export interface PartyParticipantRecord {
  id: string;
  sessionId: string;
  characterId: string;
  remortCount: number;
  status: PartyParticipantStatus;
  joinSource: PartyJoinSource;
  joinedAt: Date;
  leftAt: Date | null;
  chatId: bigint | null;
  messageId: number | null;
  character: PartyCharacterSnapshot;
}

export interface PartySessionRecord {
  id: string;
  inviteToken: string;
  status: PartySessionStatus;
  leaderCharacterId: string;
  periodId: string | null;
  originLocationId: string | null;
  participantCap: number;
  minimumParticipants: number;
  joinUntilAt: Date;
  expiresAt: Date;
  version: number;
  activeLeaderKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  leader: PartyCharacterSnapshot;
  participants: PartyParticipantRecord[];
}

export interface CreatePartySessionInput {
  inviteToken: string;
  periodId?: string | null;
  originLocationId?: string | null;
  participantCap: number;
  minimumParticipants: number;
  joinUntilAt: Date;
  expiresAt: Date;
  now: Date;
  chatId?: bigint | null;
  messageId?: number | null;
}

export interface JoinPartySessionInput {
  joinSource: Exclude<PartyJoinSource, "leader">;
  now: Date;
  chatId?: bigint | null;
  messageId?: number | null;
}

export type PartyCreateRepositoryResult =
  | { state: "no-character" }
  | { state: "ineligible" }
  | { state: "live"; session: PartySessionRecord }
  | { state: "live-membership"; session: PartySessionRecord }
  | { state: "created"; session: PartySessionRecord };

export type PartyJoinRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | {
      state: "joined";
      session: PartySessionRecord;
      cancelledSoloSession?: PartySessionRecord | undefined;
    }
  | { state: "already-joined"; session: PartySessionRecord }
  | { state: "live-membership"; session: PartySessionRecord }
  | { state: "ineligible"; session: PartySessionRecord }
  | { state: "full" | "cancelled" | "expired"; session: PartySessionRecord };

export type PartyLeaveRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-member"; session: PartySessionRecord }
  | { state: "left" | "leader-transferred" | "cancelled" | "expired"; session: PartySessionRecord };

export type PartyCancelRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-leader"; session: PartySessionRecord }
  | { state: "cancelled" | "expired"; session: PartySessionRecord };

export interface PartySessionRepository {
  createForTelegramUser(
    telegramUserId: bigint,
    input: CreatePartySessionInput
  ): Promise<PartyCreateRepositoryResult>;

  joinByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    input: JoinPartySessionInput
  ): Promise<PartyJoinRepositoryResult>;

  leaveByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyLeaveRepositoryResult>;

  cancelByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyCancelRepositoryResult>;

  findByToken(inviteToken: string, now: Date): Promise<PartySessionRecord | null>;
  findLiveRecruitingByTelegramUser(telegramUserId: bigint, now: Date): Promise<PartySessionRecord | null>;
  recordParticipantMessageReference(
    telegramUserId: bigint,
    inviteToken: string,
    input: { chatId: bigint; messageId: number; now: Date }
  ): Promise<PartySessionRecord | null>;
  listRecruitingByOrigin(originLocationId: string, now: Date, limit?: number): Promise<PartySessionRecord[]>;
  listDueRecruitingByOrigin(originLocationId: string, now: Date, limit?: number): Promise<PartySessionRecord[]>;
  expireByToken(inviteToken: string, now: Date): Promise<PartySessionRecord | null>;
  forceExpireByToken(inviteToken: string, now: Date): Promise<PartySessionRecord | null>;
  expireRecruiting(now: Date, limit?: number): Promise<number>;
  cleanupLiveMembershipsForRemort(characterId: string, now: Date): Promise<void>;
}
