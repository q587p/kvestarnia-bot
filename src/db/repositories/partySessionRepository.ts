import type { CharacterRecord } from "./characterRepository";

export const BIG_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.big-brother";
export const GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID = "group-combat.proof";
export const LEFT_PASSAGE_PARTY_ORIGIN_KIND = "nyz-left-passage-party.v1";

export type PartySessionStatus =
  | "recruiting"
  | "cancelled"
  | "expired"
  | "ineligible"
  | "active"
  | "completed";
export type PartyParticipantStatus = "joined" | "left";
export type PartyParticipantReadiness = "waiting" | "ready";
export type PartyJoinSource = "leader" | "nearby" | "deep-link" | "guild" | "dev";
export type PartyTerminalReplayState = "cancelled" | "expired" | "terminal-ineligible";

export function isAutomaticStartPartyOrigin(
  originLocationId: string | null,
  originKind: string | null
): boolean {
  return originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID ||
    originLocationId === GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID ||
    originKind === LEFT_PASSAGE_PARTY_ORIGIN_KIND;
}

export function isAuthoritativeLivePartySession(
  session: { status: string; expiresAt: Date; originLocationId: string | null; originKind: string | null },
  now: Date
): boolean {
  return session.status === "active" || (
    session.status === "recruiting" && (
      session.expiresAt > now || isAutomaticStartPartyOrigin(session.originLocationId, session.originKind)
    )
  );
}

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
  readiness?: PartyParticipantReadiness | undefined;
  wardSignSupport?: PartyWardSignSupportRecord | undefined;
  personalProtocolSignature?: PartyPersonalProtocolSignatureRecord | undefined;
  character: PartyCharacterSnapshot;
}

export interface PartyWardSignRecord {
  kind: "kharakternyk";
  placerCharacterId: string;
  supportCount: number;
  supportCap: number;
  manaCost: number;
  placedAt: Date;
}

export interface PartyWardSignSupportRecord {
  kind: "kharakternyk";
  placerCharacterId: string;
  supporterCharacterId: string;
  manaCost: number;
  supportedAt: Date;
}

export interface PartyPersonalProtocolRecord {
  kind: "bureaucramancer-personal-protocol-13b";
  protocolId: string;
  filerCharacterId: string;
  signatureCount: number;
  manaCost: number;
  filedAt: Date;
}

export interface PartyPersonalProtocolSignatureRecord {
  kind: "bureaucramancer-personal-protocol-13b";
  protocolId: string;
  filerCharacterId: string;
  signerCharacterId: string;
  signedAt: Date;
}

export interface PartySessionRecord {
  id: string;
  inviteToken: string;
  status: PartySessionStatus;
  leaderCharacterId: string;
  periodId: string | null;
  originLocationId: string | null;
  originKind: string | null;
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
  wardSign?: PartyWardSignRecord | undefined;
  personalProtocol?: PartyPersonalProtocolRecord | undefined;
}

export interface CreatePartySessionInput {
  inviteToken: string;
  periodId?: string | null;
  originLocationId?: string | null;
  originKind?: string | null;
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
  expectedOriginKind?: string;
  expectedOriginLocationId?: string;
  relocateToExpectedOrigin?: boolean;
}

export type PartyJoinIneligibleReason =
  | "level-gate"
  | "active-combat"
  | "already-completed"
  | "pending-solo-raid"
  | "loss-cooldown"
  | "wrong-location"
  | "active-adventure"
  | "active-raid"
  | "stale-life"
  | "dead"
  | "invalid-resources"
  | "active-search"
  | "left-passage-rest"
  | "expired-invitation";

export type PartyLossCooldownIneligible = {
  state: "ineligible";
  reason: "loss-cooldown";
  availableAt: Date;
  now: Date;
};

export type PartyPendingSoloRaidIneligible = {
  state: "ineligible";
  reason: "pending-solo-raid";
  availableAt: Date;
  now: Date;
};

export type PartyActiveSearchIneligible = {
  state: "ineligible";
  reason: "active-search";
  availableAt: Date;
  now: Date;
};

export type PartyLeftPassageRestIneligible = {
  state: "ineligible";
  reason: "left-passage-rest";
  availableAt: Date;
  now: Date;
};

export type PartyCreateRepositoryResult =
  | { state: "no-character" }
  | { state: "ineligible"; reason: "active-combat" }
  | PartyLossCooldownIneligible
  | PartyPendingSoloRaidIneligible
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
  | { state: "stale"; session: PartySessionRecord }
  | { state: "live-membership"; session: PartySessionRecord }
  | (PartyLossCooldownIneligible & { session: PartySessionRecord })
  | (PartyPendingSoloRaidIneligible & { session: PartySessionRecord })
  | (PartyActiveSearchIneligible & { session: PartySessionRecord })
  | (PartyLeftPassageRestIneligible & { session: PartySessionRecord })
  | {
      state: "ineligible";
      session: PartySessionRecord;
      reason?: Exclude<
        PartyJoinIneligibleReason,
        "loss-cooldown" | "pending-solo-raid" | "active-search" | "left-passage-rest"
      > | undefined;
    }
  | { state: "full" | PartyTerminalReplayState; session: PartySessionRecord };

export type PartyLeaveRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-member"; session: PartySessionRecord }
  | { state: "stale"; session: PartySessionRecord }
  | { state: "left" | "leader-transferred" | PartyTerminalReplayState; session: PartySessionRecord };

export type PartyCancelRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-leader"; session: PartySessionRecord }
  | { state: "stale"; session: PartySessionRecord }
  | { state: PartyTerminalReplayState; session: PartySessionRecord };

export type PartyReadinessRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-member" | "not-recruiting"; session: PartySessionRecord }
  | { state: "updated" | "already-set" | "stale" | PartyTerminalReplayState; session: PartySessionRecord };

export type PartyWardSignPlaceRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | {
      state:
        | "updated"
        | "already-placed"
        | "already-exists"
        | "stale"
        | "not-member"
        | "not-recruiting"
        | "not-big-barrel"
        | "ineligible"
        | "not-enough-mana"
        | PartyTerminalReplayState;
      session: PartySessionRecord;
    };

export type PartyWardSignSupportRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | {
      state:
        | "updated"
        | "already-supported"
        | "stale"
        | "not-member"
        | "not-recruiting"
        | "not-big-barrel"
        | "no-sign"
        | "self-support"
        | "not-enough-mana"
        | PartyTerminalReplayState;
      session: PartySessionRecord;
    };

export type PartyPersonalProtocolFileRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | {
      state: "cooldown";
      availableAt: Date;
      now: Date;
      session: PartySessionRecord;
    }
  | {
      state:
        | "updated"
        | "already-filed"
        | "already-exists"
        | "not-member"
        | "not-recruiting"
        | "not-big-barrel"
        | "ineligible"
        | "blocked"
        | "not-enough-mana"
        | "stale"
        | PartyTerminalReplayState;
      session: PartySessionRecord;
    };

export type PartyPersonalProtocolSignRepositoryResult =
  | { state: "no-character" }
  | { state: "not-found" }
  | {
      state:
        | "updated"
        | "already-signed"
        | "not-member"
        | "not-recruiting"
        | "not-big-barrel"
        | "no-protocol"
        | "blocked"
        | "stale"
        | PartyTerminalReplayState;
      session: PartySessionRecord;
    };

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

  setParticipantReadiness(
    telegramUserId: bigint,
    inviteToken: string,
    readiness: PartyParticipantReadiness,
    now: Date
  ): Promise<PartyReadinessRepositoryResult>;

  placeKharakternykWardSign(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyWardSignPlaceRepositoryResult>;

  supportKharakternykWardSign(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyWardSignSupportRepositoryResult>;

  fileBureaucramancerPersonalProtocol(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyPersonalProtocolFileRepositoryResult>;

  signBureaucramancerPersonalProtocol(
    telegramUserId: bigint,
    inviteToken: string,
    now: Date
  ): Promise<PartyPersonalProtocolSignRepositoryResult>;

  findByToken(inviteToken: string, now: Date): Promise<PartySessionRecord | null>;
  findLiveRecruitingByTelegramUser(telegramUserId: bigint, now: Date): Promise<PartySessionRecord | null>;
  recordParticipantMessageReference(
    telegramUserId: bigint,
    inviteToken: string,
    input: { chatId: bigint; messageId: number; now: Date }
  ): Promise<PartySessionRecord | null>;
  listRecruitingByOrigin(originLocationId: string, now: Date, limit?: number): Promise<PartySessionRecord[]>;
  listRecruitingByOriginKind(
    originKind: string,
    originLocationId: string,
    now: Date,
    limit?: number
  ): Promise<PartySessionRecord[]>;
  listDueRecruitingByOrigin(originLocationId: string, now: Date, limit?: number): Promise<PartySessionRecord[]>;
  listDueRecruitingByOriginKind(originKind: string, now: Date, limit?: number): Promise<PartySessionRecord[]>;
  expireByToken(inviteToken: string, now: Date): Promise<PartySessionRecord | null>;
  forceExpireByToken(inviteToken: string, now: Date, expectedVersion?: number): Promise<PartySessionRecord | null>;
  expireRecruiting(now: Date, limit?: number): Promise<number>;
  cleanupLiveMembershipsForRemort(characterId: string, now: Date): Promise<void>;
}
