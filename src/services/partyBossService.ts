import type { PartyBossActionKey } from "../domain/partyBoss/partyBoss";
import type {
  PartyBossActionResult,
  PartyBossDevWinResult,
  PartyBossRepository,
  PartyBossSessionRecord,
  PartyBossStartResult
} from "../db/repositories/partyBossRepository";
import { PARTY_BOSS_TURN_MS } from "../domain/partyBoss/partyBoss";
import { systemClock, type Clock } from "../shared/time";

export interface PartyBossServiceOptions {
  enabled: boolean;
  devHelpersEnabled?: boolean;
}

export type PartyBossDevRaidWinResult =
  | { state: "disabled" }
  | PartyBossDevWinResult;

export class PartyBossService {
  constructor(
    private readonly sessions: PartyBossRepository,
    private readonly options: PartyBossServiceOptions,
    private readonly clock: Clock = systemClock
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.isEnabled() && this.options.devHelpersEnabled === true;
  }

  async startFromPartyForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    options: { allowExpiredRecruiting?: boolean } = {}
  ): Promise<PartyBossStartResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    return this.sessions.startFromRecruitingPartyForTelegramUser(telegramUserId, {
      partyInviteToken,
      now,
      turnExpiresAt: nextTurnDeadline(now),
      ...(options.allowExpiredRecruiting ? { allowExpiredRecruiting: true } : {})
    });
  }

  async submitActionForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number,
    action: PartyBossActionKey
  ): Promise<PartyBossActionResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    return this.sessions.submitActionForTelegramUser(telegramUserId, partyInviteToken, turn, action, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    });
  }

  async resolveDueTimedOutByToken(partyInviteToken: string): Promise<PartyBossActionResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    return this.sessions.resolveTimedOutByToken(partyInviteToken, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    }, "due");
  }

  async forceResolveTimedOutByToken(partyInviteToken: string): Promise<PartyBossActionResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    return this.sessions.resolveTimedOutByToken(partyInviteToken, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    }, "force-dev");
  }

  async getActiveForTelegramUser(telegramUserId: bigint): Promise<PartyBossSessionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return this.sessions.findActiveByTelegramUserId(telegramUserId);
  }

  async getByPartyInviteToken(partyInviteToken: string): Promise<PartyBossSessionRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return this.sessions.findByPartyInviteToken(partyInviteToken);
  }

  async listDueTimedOutSessions(options: { limit?: number } = {}): Promise<PartyBossSessionRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    return this.sessions.listDueTimedOutSessions(this.clock(), options);
  }

  async forceBigBarrelWinForTelegramUser(telegramUserId: bigint): Promise<PartyBossDevRaidWinResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }

    return this.sessions.forceBigBarrelWinForTelegramUser(telegramUserId, this.clock());
  }
}

function nextTurnDeadline(now: Date): Date {
  return new Date(now.getTime() + PARTY_BOSS_TURN_MS);
}
