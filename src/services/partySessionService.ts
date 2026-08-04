import { randomBytes } from "node:crypto";
import type {
  PartyCancelRepositoryResult,
  PartyCreateRepositoryResult,
  PartyJoinRepositoryResult,
  PartyLeaveRepositoryResult,
  PartyParticipantReadiness,
  PartyReadinessRepositoryResult,
  PartyWardSignPlaceRepositoryResult,
  PartyWardSignSupportRepositoryResult,
  PartyPersonalProtocolFileRepositoryResult,
  PartyPersonalProtocolSignRepositoryResult,
  PartySessionRecord,
  PartySessionRepository
} from "../db/repositories/partySessionRepository";
import { systemClock, type Clock } from "../shared/time";
import type { AchievementService } from "./achievementService";
import { PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT } from "./presenceService";

export const PARTY_SESSION_PARTICIPANT_CAP = 8;
export const PARTY_SESSION_MINIMUM_PARTICIPANTS = 1;
export const PARTY_SESSION_TTL_MS = 13 * 60 * 1000;
export const BIG_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.big-brother";
export const GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID = "group-combat.proof";
export const LEFT_PASSAGE_PARTY_ORIGIN_KIND = "nyz-left-passage-party.v1";
export const GROUP_COMBAT_PARTY_PARTICIPANT_CAP = 3;
export const GROUP_COMBAT_PARTY_MINIMUM_PARTICIPANTS = 2;
export const GROUP_COMBAT_PARTY_TTL_MS = 3 * 60 * 1000;

export type PartyCreateResult =
  | { state: "disabled" }
  | PartyCreateRepositoryResult;

export type PartyViewResult = { state: "not-found" } | { state: "ready"; session: PartySessionRecord };
export type PartyJoinResult = PartyJoinRepositoryResult;
export type PartyLeaveResult = PartyLeaveRepositoryResult;
export type PartyCancelResult = PartyCancelRepositoryResult;
export type PartyReadinessResult = PartyReadinessRepositoryResult;
export type PartyWardSignPlaceResult = PartyWardSignPlaceRepositoryResult;
export type PartyWardSignSupportResult = PartyWardSignSupportRepositoryResult;
export type PartyPersonalProtocolFileResult = PartyPersonalProtocolFileRepositoryResult;
export type PartyPersonalProtocolSignResult = PartyPersonalProtocolSignRepositoryResult;

export interface PartySessionServiceOptions {
  enabled: boolean;
  runtimeServicingEnabled?: boolean;
  devHelpersEnabled?: boolean;
  bigBarrelBrotherEnabled?: boolean;
  leftPassagePartyAttackEnabled?: boolean;
}

export class PartySessionService {
  constructor(
    private readonly sessions: PartySessionRepository,
    private readonly options: PartySessionServiceOptions,
    private readonly clock: Clock = systemClock,
    private readonly achievements?: AchievementService
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  private canServiceRuntime(): boolean {
    return this.options.runtimeServicingEnabled === true || this.isEnabled();
  }

  areDevHelpersEnabled(): boolean {
    return this.isEnabled() && this.options.devHelpersEnabled === true;
  }

  isBigBarrelBrotherEnabled(): boolean {
    return this.isEnabled() && this.options.bigBarrelBrotherEnabled === true;
  }

  isLeftPassagePartyAttackEnabled(): boolean {
    return this.isEnabled() && this.options.leftPassagePartyAttackEnabled === true;
  }

  async createForTelegramUser(
    telegramUserId: bigint,
    input: {
      chatId?: bigint | null;
      messageId?: number | null;
      periodId?: string | null;
      originLocationId?: string | null;
    } = {}
  ): Promise<PartyCreateResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    const expiresAt = new Date(now.getTime() + PARTY_SESSION_TTL_MS);

    return this.sessions.createForTelegramUser(telegramUserId, {
      inviteToken: createInviteToken(),
      participantCap: PARTY_SESSION_PARTICIPANT_CAP,
      minimumParticipants: PARTY_SESSION_MINIMUM_PARTICIPANTS,
      joinUntilAt: expiresAt,
      expiresAt,
      now,
      periodId: input.periodId ?? null,
      originLocationId: input.originLocationId ?? null,
      originKind: null,
      chatId: input.chatId ?? null,
      messageId: input.messageId ?? null
    });
  }

  async createGroupCombatProofForTelegramUser(
    telegramUserId: bigint,
    input: {
      chatId?: bigint | null;
      messageId?: number | null;
    } = {}
  ): Promise<PartyCreateResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    const expiresAt = new Date(now.getTime() + GROUP_COMBAT_PARTY_TTL_MS);

    return this.sessions.createForTelegramUser(telegramUserId, {
      inviteToken: createInviteToken(),
      participantCap: GROUP_COMBAT_PARTY_PARTICIPANT_CAP,
      minimumParticipants: GROUP_COMBAT_PARTY_MINIMUM_PARTICIPANTS,
      joinUntilAt: expiresAt,
      expiresAt,
      now,
      periodId: null,
      originLocationId: GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID,
      originKind: null,
      chatId: input.chatId ?? null,
      messageId: input.messageId ?? null
    });
  }

  async joinByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    input: {
      source: "nearby" | "deep-link" | "dev";
      chatId?: bigint | null;
      messageId?: number | null;
    }
  ): Promise<PartyJoinResult> {
    if (!this.isEnabled()) {
      return { state: "not-found" };
    }

    return this.sessions.joinByTokenForTelegramUser(telegramUserId, inviteToken, {
      joinSource: input.source,
      now: this.clock(),
      chatId: input.chatId ?? null,
      messageId: input.messageId ?? null
    });
  }

  async joinLeftPassageByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    input: {
      chatId?: bigint | null;
      messageId?: number | null;
    } = {}
  ): Promise<PartyJoinResult> {
    if (!this.isLeftPassagePartyAttackEnabled()) {
      return { state: "not-found" };
    }

    return this.sessions.joinByTokenForTelegramUser(telegramUserId, inviteToken, {
      joinSource: "deep-link",
      now: this.clock(),
      chatId: input.chatId ?? null,
      messageId: input.messageId ?? null,
      expectedOriginKind: LEFT_PASSAGE_PARTY_ORIGIN_KIND,
      expectedOriginLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      relocateToExpectedOrigin: true
    });
  }

  async leaveByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<PartyLeaveResult> {
    if (!this.isEnabled()) {
      return { state: "not-found" };
    }

    return this.sessions.leaveByTokenForTelegramUser(telegramUserId, inviteToken, this.clock());
  }

  async cancelByTokenForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<PartyCancelResult> {
    if (!this.isEnabled()) {
      return { state: "not-found" };
    }

    return this.sessions.cancelByTokenForTelegramUser(telegramUserId, inviteToken, this.clock());
  }

  async setReadinessForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string,
    readiness: PartyParticipantReadiness
  ): Promise<PartyReadinessResult> {
    if (!this.isEnabled()) {
      return { state: "not-found" };
    }

    return this.sessions.setParticipantReadiness(telegramUserId, inviteToken, readiness, this.clock());
  }

  async placeKharakternykWardSignForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<PartyWardSignPlaceResult> {
    if (!this.isBigBarrelBrotherEnabled()) {
      return { state: "not-found" };
    }

    return this.sessions.placeKharakternykWardSign(telegramUserId, inviteToken, this.clock());
  }

  async supportKharakternykWardSignForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<PartyWardSignSupportResult> {
    if (!this.isBigBarrelBrotherEnabled()) {
      return { state: "not-found" };
    }

    return this.sessions.supportKharakternykWardSign(telegramUserId, inviteToken, this.clock());
  }

  async fileBureaucramancerPersonalProtocolForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<PartyPersonalProtocolFileResult> {
    if (!this.isBigBarrelBrotherEnabled()) {
      return { state: "not-found" };
    }

    const now = this.clock();
    const result = await this.sessions.fileBureaucramancerPersonalProtocol(telegramUserId, inviteToken, now);
    if (result.state === "updated") {
      const participant = result.session.participants.find((row) => row.character.telegramUserId === telegramUserId);
      if (participant && result.session.personalProtocol) {
        await this.achievements?.trackEventSafely({
          type: "bureaucramancer.protocol.filed",
          characterId: participant.characterId,
          sourceId: result.session.personalProtocol.protocolId,
          occurredAt: now
        });
      }
    }
    return result;
  }

  async signBureaucramancerPersonalProtocolForTelegramUser(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<PartyPersonalProtocolSignResult> {
    if (!this.isBigBarrelBrotherEnabled()) {
      return { state: "not-found" };
    }

    const now = this.clock();
    const result = await this.sessions.signBureaucramancerPersonalProtocol(telegramUserId, inviteToken, now);
    if (result.state === "updated") {
      const participant = result.session.participants.find((row) => row.character.telegramUserId === telegramUserId);
      if (participant && result.session.personalProtocol) {
        await this.achievements?.trackEventSafely({
          type: "bureaucramancer.protocol.signed",
          characterId: participant.characterId,
          sourceId: result.session.personalProtocol.protocolId,
          occurredAt: now
        });
      }
    }
    return result;
  }

  async getByToken(inviteToken: string): Promise<PartyViewResult> {
    if (!this.isEnabled()) {
      return { state: "not-found" };
    }

    const session = await this.sessions.findByToken(inviteToken, this.clock());
    return session ? { state: "ready", session } : { state: "not-found" };
  }

  async getLiveRecruitingByTelegramUser(
    telegramUserId: bigint
  ): Promise<PartySessionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return this.sessions.findLiveRecruitingByTelegramUser(telegramUserId, this.clock());
  }

  async recordParticipantMessageReference(
    telegramUserId: bigint,
    inviteToken: string,
    input: {
      chatId: bigint;
      messageId: number;
    }
  ): Promise<PartySessionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return this.sessions.recordParticipantMessageReference(telegramUserId, inviteToken, {
      ...input,
      now: this.clock()
    });
  }

  async listRecruitingBigBarrelBrother(): Promise<PartySessionRecord[]> {
    if (!this.isBigBarrelBrotherEnabled()) {
      return [];
    }

    return this.sessions.listRecruitingByOrigin(BIG_BARREL_PARTY_ORIGIN_LOCATION_ID, this.clock());
  }

  async listVisibleRecruitingAtLocation(locationId: string): Promise<PartySessionRecord[]> {
    if (locationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
      return this.listRecruitingBigBarrelBrother();
    }
    if (
      locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT &&
      this.isLeftPassagePartyAttackEnabled()
    ) {
      const sessions = await this.sessions.listRecruitingByOriginKind(
        LEFT_PASSAGE_PARTY_ORIGIN_KIND,
        PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        this.clock()
      );
      return sessions;
    }

    return [];
  }

  async listDueRecruitingBigBarrelBrother(): Promise<PartySessionRecord[]> {
    if (!this.isBigBarrelBrotherEnabled()) {
      return [];
    }

    return this.sessions.listDueRecruitingByOrigin(BIG_BARREL_PARTY_ORIGIN_LOCATION_ID, this.clock());
  }

  async listDueRecruitingGroupCombatProof(): Promise<PartySessionRecord[]> {
    if (!this.areDevHelpersEnabled()) {
      return [];
    }

    return this.sessions.listDueRecruitingByOrigin(GROUP_COMBAT_PARTY_ORIGIN_LOCATION_ID, this.clock());
  }

  async listDueRecruitingLeftPassageParty(): Promise<PartySessionRecord[]> {
    if (!this.canServiceRuntime()) {
      return [];
    }

    return this.sessions.listDueRecruitingByOriginKind(LEFT_PASSAGE_PARTY_ORIGIN_KIND, this.clock());
  }

  async expireDueLeftPassageParty(
    inviteToken: string,
    expectedVersion: number
  ): Promise<PartyViewResult> {
    if (!this.canServiceRuntime()) {
      return { state: "not-found" };
    }
    const current = await this.sessions.findByToken(inviteToken, this.clock());
    if (current?.originKind !== LEFT_PASSAGE_PARTY_ORIGIN_KIND) {
      return { state: "not-found" };
    }
    const session = await this.sessions.forceExpireByToken(inviteToken, this.clock(), expectedVersion);
    return session ? { state: "ready", session } : { state: "not-found" };
  }

  async expireByToken(inviteToken: string): Promise<PartyViewResult> {
    if (!this.isEnabled()) {
      return { state: "not-found" };
    }

    const session = await this.sessions.expireByToken(inviteToken, this.clock());
    return session ? { state: "ready", session } : { state: "not-found" };
  }

  async forceExpireByToken(inviteToken: string, expectedVersion?: number): Promise<PartyViewResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "not-found" };
    }

    const session = await this.sessions.forceExpireByToken(inviteToken, this.clock(), expectedVersion);
    return session ? { state: "ready", session } : { state: "not-found" };
  }

  async expireRecruiting(): Promise<number> {
    if (!this.isEnabled()) {
      return 0;
    }

    return this.sessions.expireRecruiting(this.clock());
  }
}

export function buildPartyInviteUrl(botUsername: string | undefined, token: string): string | null {
  const normalizedUsername = normalizeBotUsername(botUsername);
  if (!normalizedUsername) {
    return null;
  }

  return `https://t.me/${normalizedUsername}?start=party_${token}`;
}

export function buildLeftPassagePartyInviteUrl(botUsername: string | undefined, token: string): string | null {
  const normalizedUsername = normalizeBotUsername(botUsername);
  if (!normalizedUsername) {
    return null;
  }

  return `https://t.me/${normalizedUsername}?start=nyz_left_attack_${token}`;
}

export function buildPartyInviteUrlForSession(
  botUsername: string | undefined,
  session: Pick<PartySessionRecord, "inviteToken" | "originKind" | "originLocationId">
): string | null {
  return session.originKind === LEFT_PASSAGE_PARTY_ORIGIN_KIND &&
    session.originLocationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
    ? buildLeftPassagePartyInviteUrl(botUsername, session.inviteToken)
    : buildPartyInviteUrl(botUsername, session.inviteToken);
}

function normalizeBotUsername(botUsername: string | undefined): string | null {
  const normalized = botUsername?.trim().replace(/^@/u, "") ?? "";

  return /^[A-Za-z0-9_]{5,32}$/u.test(normalized) ? normalized : null;
}

function createInviteToken(): string {
  return randomBytes(8).toString("base64url");
}
