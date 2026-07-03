import type { PartyBossActionKey } from "../domain/partyBoss/partyBoss";
import { items } from "../content";
import type {
  PartyBossActionResult,
  PartyBossDevWinResult,
  PartyBossRepository,
  PartyBossSessionRecord,
  PartyBossStartResult
} from "../db/repositories/partyBossRepository";
import { PARTY_BOSS_TURN_MS } from "../domain/partyBoss/partyBoss";
import { findCombatUsableItemByKey } from "./combatItemUse";
import { systemClock, type Clock } from "../shared/time";
import type { AchievementService } from "./achievementService";
import type { PublicActivityEventPublisher } from "./publicActivityEventPublisher";

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
    private readonly clock: Clock = systemClock,
    private readonly achievements?: AchievementService,
    private readonly activityEvents?: PublicActivityEventPublisher
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
    const result = await this.sessions.submitActionForTelegramUser(telegramUserId, partyInviteToken, turn, action, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    });
    await this.trackAchievementEvents(result);
    await this.trackActivityEvents(result);

    return result;
  }

  async submitItemForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number,
    itemKey: string
  ): Promise<PartyBossActionResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    const combatItem = findCombatUsableItemByKey(items, itemKey);
    if (!combatItem) {
      const session = await this.sessions.findByPartyInviteToken(partyInviteToken);
      return {
        state: "item-unavailable",
        reason: "not-usable",
        ...(session ? { session } : {})
      };
    }
    const result = await this.sessions.submitItemForTelegramUser(
      telegramUserId,
      partyInviteToken,
      turn,
      {
        id: combatItem.item.id,
        name: combatItem.item.name,
        effect: combatItem.effect
      },
      {
        now,
        nextTurnExpiresAt: nextTurnDeadline(now)
      }
    );
    await this.trackAchievementEvents(result);
    await this.trackActivityEvents(result);

    return result;
  }

  async resolveDueTimedOutByToken(partyInviteToken: string): Promise<PartyBossActionResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    const result = await this.sessions.resolveTimedOutByToken(partyInviteToken, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    }, "due");
    await this.trackAchievementEvents(result);
    await this.trackActivityEvents(result);

    return result;
  }

  async forceResolveTimedOutByToken(partyInviteToken: string): Promise<PartyBossActionResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    const result = await this.sessions.resolveTimedOutByToken(partyInviteToken, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    }, "force-dev");
    await this.trackAchievementEvents(result);
    await this.trackActivityEvents(result);

    return result;
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

  private async trackAchievementEvents(result: PartyBossActionResult): Promise<void> {
    if (!this.achievements || !("achievementEvents" in result) || !result.achievementEvents) {
      return;
    }

    for (const event of result.achievementEvents) {
      await this.achievements.trackEventSafely(event.type === "item.used"
        ? {
            type: event.type,
            characterId: event.characterId,
            itemId: event.itemId,
            occurredAt: event.occurredAt,
            sourceId: event.sourceId
          }
        : {
            type: event.type,
            characterId: event.characterId,
            occurredAt: event.occurredAt,
            sourceId: event.sourceId
          });
    }
  }

  private async trackActivityEvents(result: PartyBossActionResult): Promise<void> {
    if (!this.activityEvents || !("session" in result)) {
      return;
    }

    await this.activityEvents.recordPartyRaidWonSafely(result.session);
  }
}

function nextTurnDeadline(now: Date): Date {
  return new Date(now.getTime() + PARTY_BOSS_TURN_MS);
}
