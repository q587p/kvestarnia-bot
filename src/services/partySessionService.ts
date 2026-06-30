import { randomBytes } from "node:crypto";
import type {
  PartyCancelRepositoryResult,
  PartyCreateRepositoryResult,
  PartyJoinRepositoryResult,
  PartyLeaveRepositoryResult,
  PartySessionRecord,
  PartySessionRepository
} from "../db/repositories/partySessionRepository";
import { systemClock, type Clock } from "../shared/time";

export const PARTY_SESSION_PARTICIPANT_CAP = 8;
export const PARTY_SESSION_MINIMUM_PARTICIPANTS = 1;
export const PARTY_SESSION_TTL_MS = 13 * 60 * 1000;
export const SENIOR_BARREL_PARTY_ORIGIN_LOCATION_ID = "barrel.senior";

export type PartyCreateResult =
  | { state: "disabled" }
  | PartyCreateRepositoryResult;

export type PartyViewResult = { state: "not-found" } | { state: "ready"; session: PartySessionRecord };
export type PartyJoinResult = PartyJoinRepositoryResult;
export type PartyLeaveResult = PartyLeaveRepositoryResult;
export type PartyCancelResult = PartyCancelRepositoryResult;

export interface PartySessionServiceOptions {
  enabled: boolean;
  devHelpersEnabled?: boolean;
  seniorBarrelBrotherEnabled?: boolean;
}

export class PartySessionService {
  constructor(
    private readonly sessions: PartySessionRepository,
    private readonly options: PartySessionServiceOptions,
    private readonly clock: Clock = systemClock
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.isEnabled() && this.options.devHelpersEnabled === true;
  }

  isSeniorBarrelBrotherEnabled(): boolean {
    return this.isEnabled() && this.options.seniorBarrelBrotherEnabled === true;
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

  async expireByToken(inviteToken: string): Promise<PartyViewResult> {
    if (!this.isEnabled()) {
      return { state: "not-found" };
    }

    const session = await this.sessions.expireByToken(inviteToken, this.clock());
    return session ? { state: "ready", session } : { state: "not-found" };
  }

  async forceExpireByToken(inviteToken: string): Promise<PartyViewResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "not-found" };
    }

    const session = await this.sessions.forceExpireByToken(inviteToken, this.clock());
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
  if (!botUsername) {
    return null;
  }

  return `https://t.me/${botUsername}?start=party_${token}`;
}

function createInviteToken(): string {
  return randomBytes(8).toString("base64url");
}
