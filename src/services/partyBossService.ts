import type { PartyBossActionKey } from "../domain/partyBoss/partyBoss";
import type {
  PartyBossActionResult,
  PartyBossRepository,
  PartyBossSessionRecord,
  PartyBossStartResult
} from "../db/repositories/partyBossRepository";
import { PARTY_BOSS_TURN_MS } from "../domain/partyBoss/partyBoss";
import { systemClock, type Clock } from "../shared/time";

export interface PartyBossServiceOptions {
  enabled: boolean;
}

export class PartyBossService {
  constructor(
    private readonly sessions: PartyBossRepository,
    private readonly options: PartyBossServiceOptions,
    private readonly clock: Clock = systemClock
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  async startFromPartyForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string
  ): Promise<PartyBossStartResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    return this.sessions.startFromRecruitingPartyForTelegramUser(telegramUserId, {
      partyInviteToken,
      now,
      turnExpiresAt: nextTurnDeadline(now)
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

  async resolveTimedOutByToken(partyInviteToken: string): Promise<PartyBossActionResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    return this.sessions.resolveTimedOutByToken(partyInviteToken, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    });
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
}

function nextTurnDeadline(now: Date): Date {
  return new Date(now.getTime() + PARTY_BOSS_TURN_MS);
}
