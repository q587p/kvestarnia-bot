import {
  BIG_BARREL_BROTHER_BOSS_KEY,
  BIG_BARREL_BROTHER_RULES_VERSION,
  type PartyBossActionKey
} from "../domain/partyBoss/partyBoss";
import { findMantokAbilityGrantByKey, items } from "../content";
import type {
  PartyBossActionResult,
  PartyBossDevWinResult,
  PartyBossRepository,
  PartyBossSessionRecord,
  PartyBossStartResult
} from "../db/repositories/partyBossRepository";
import type { InventoryRepository } from "../db/repositories/inventoryRepository";
import {
  calculatePartyBossCombatItemHealing,
  getPartyBossCombatItemAvailability,
  PARTY_BOSS_TURN_MS
} from "../domain/partyBoss/partyBoss";
import { findCombatUsableItemByKey, getCombatUsableItem } from "./combatItemUse";
import { systemClock, type Clock } from "../shared/time";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import type { PublicActivityEventPublisher } from "./publicActivityEventPublisher";
import type { BarrelBeerTutorialService } from "./barrelBeerTutorialService";

export interface PartyBossServiceOptions {
  enabled: boolean;
  devHelpersEnabled?: boolean;
  bardSupportEnabled?: boolean;
}

export type PartyBossDevRaidWinResult =
  | { state: "disabled" }
  | PartyBossDevWinResult;

export interface PartyBossCombatItemMenuEntry {
  itemId: string;
  itemKey: string;
  name: string;
  quantity: number;
}

export type PartyBossCombatItemMenuResult =
  | { state: "disabled" }
  | { state: "no-character" }
  | { state: "not-found" }
  | { state: "not-participant"; session: PartyBossSessionRecord }
  | { state: "stale"; session: PartyBossSessionRecord }
  | { state: "terminal"; session: PartyBossSessionRecord }
  | { state: "ready"; session: PartyBossSessionRecord; items: PartyBossCombatItemMenuEntry[] };

export type PartyBossActionServiceResult = PartyBossActionResult & {
  achievementUnlocksByCharacterId?: Record<string, AchievementUnlock[]>;
};

export class PartyBossService {
  constructor(
    private readonly sessions: PartyBossRepository,
    private readonly options: PartyBossServiceOptions,
    private readonly clock: Clock = systemClock,
    private readonly achievements?: AchievementService,
    private readonly activityEvents?: PublicActivityEventPublisher,
    private readonly inventory?: InventoryRepository,
    private readonly barrelBeerTutorial?: Pick<
      BarrelBeerTutorialService,
      "markVisitedBarrelForTelegramUser" | "markBarrelRaidCompletedForTelegramUser"
    >
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.isEnabled() && this.options.devHelpersEnabled === true;
  }

  isBardSupportEnabled(): boolean {
    return this.isEnabled() && this.options.bardSupportEnabled === true;
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
  ): Promise<PartyBossActionServiceResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    const result = await this.sessions.submitActionForTelegramUser(telegramUserId, partyInviteToken, turn, action, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    });
    const achievementUnlocksByCharacterId = await this.trackAchievementEvents(result);
    await this.trackBarrelBeerTutorialProgress(result);
    await this.trackActivityEvents(result);

    return withAchievementUnlocks(result, achievementUnlocksByCharacterId);
  }

  async submitLamentForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number
  ): Promise<PartyBossActionServiceResult> {
    if (!this.isBardSupportEnabled()) {
      return { state: "disabled" };
    }
    const now = this.clock();
    const result = await this.sessions.submitLamentForTelegramUser(
      telegramUserId,
      partyInviteToken,
      turn,
      {
        activationId: randomUUID(),
        now,
        nextTurnExpiresAt: nextTurnDeadline(now)
      }
    );
    await this.trackBarrelBeerTutorialProgress(result);
    await this.trackActivityEvents(result);

    return result;
  }

  async submitGearForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number,
    grantKey: string
  ): Promise<PartyBossActionServiceResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const session = await this.sessions.findByPartyInviteToken(partyInviteToken);
    const grant = findMantokAbilityGrantByKey(grantKey);
    const participantRecord = session?.participants.find(
      (participant) => participant.telegramUserId === telegramUserId
    );
    const participant = participantRecord
      ? session?.state.participants.find((candidate) => candidate.characterId === participantRecord.id)
      : null;

    if (!session) {
      return { state: "not-found" };
    }

    if (
      !grant?.combat ||
      !participantRecord ||
      !participant ||
      !participant.equipmentAbilityGrantIds?.includes(grant.id)
    ) {
      return { state: "stale", session };
    }

    const now = this.clock();
    const result = await this.sessions.submitActionForTelegramUser(
      telegramUserId,
      partyInviteToken,
      turn,
      "gear",
      {
        now,
        nextTurnExpiresAt: nextTurnDeadline(now)
      },
      {
        gearAbility: {
          profile: grant.combat.profile,
          ...(grant.combat.bleed
            ? {
                bleed: {
                  sourceAbilityId: grant.combat.profile.id,
                  ...grant.combat.bleed
                }
              }
            : {})
        }
      }
    );
    const achievementUnlocksByCharacterId = await this.trackAchievementEvents(result);
    await this.trackActivityEvents(result);

    return withAchievementUnlocks(result, achievementUnlocksByCharacterId);
  }

  async submitItemForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number,
    itemKey: string
  ): Promise<PartyBossActionServiceResult> {
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
    const achievementUnlocksByCharacterId = await this.trackAchievementEvents(result);
    await this.trackBarrelBeerTutorialProgress(result);
    await this.trackActivityEvents(result);

    return withAchievementUnlocks(result, achievementUnlocksByCharacterId);
  }

  async listCombatItemsForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number
  ): Promise<PartyBossCombatItemMenuResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const session = await this.sessions.findByPartyInviteToken(partyInviteToken);
    if (!session) {
      return { state: "not-found" };
    }

    if (session.status !== "active") {
      return { state: "terminal", session };
    }

    if (session.turn !== turn || session.state.turn !== turn) {
      return { state: "stale", session };
    }

    const participantRecord = session.participants.find(
      (participant) => participant.telegramUserId === telegramUserId
    );
    const participant = participantRecord
      ? session.state.participants.find((candidate) => candidate.characterId === participantRecord.id)
      : null;

    if (!participantRecord || !participant) {
      return { state: "not-participant", session };
    }

    if (participant.status !== "active" || participant.resources.hp <= 0) {
      return { state: "stale", session };
    }

    const inventoryItems = await this.inventory?.listByTelegramUserId(telegramUserId);
    if (!inventoryItems) {
      return { state: "no-character" };
    }

    const contentById = new Map(items.map((item) => [item.id, item]));
    const entries = inventoryItems.flatMap((inventoryItem): PartyBossCombatItemMenuEntry[] => {
      if (inventoryItem.characterId !== participant.characterId || inventoryItem.quantity <= 0) {
        return [];
      }

      const item = contentById.get(inventoryItem.itemId);
      const combatItem = item ? getCombatUsableItem(item) : null;
      if (!combatItem) {
        return [];
      }

      const availability = getPartyBossCombatItemAvailability(participant, combatItem.item.id);
      if (!availability.available) {
        return [];
      }

      const healing = calculatePartyBossCombatItemHealing(participant.resources, combatItem.effect);
      if (healing <= 0) {
        return [];
      }

      return [{
        itemId: combatItem.item.id,
        itemKey: combatItem.key,
        name: combatItem.item.name,
        quantity: inventoryItem.quantity
      }];
    });

    return {
      state: "ready",
      session,
      items: entries
    };
  }

  async hasCombatItemsForTelegramUser(
    telegramUserId: bigint,
    partyInviteToken: string,
    turn: number
  ): Promise<boolean> {
    const result = await this.listCombatItemsForTelegramUser(telegramUserId, partyInviteToken, turn);

    return result.state === "ready" && result.items.length > 0;
  }

  async resolveDueTimedOutByToken(partyInviteToken: string): Promise<PartyBossActionServiceResult> {
    if (!this.isEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    const result = await this.sessions.resolveTimedOutByToken(partyInviteToken, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    }, "due");
    const achievementUnlocksByCharacterId = await this.trackAchievementEvents(result);
    await this.trackBarrelBeerTutorialProgress(result);
    await this.trackActivityEvents(result);

    return withAchievementUnlocks(result, achievementUnlocksByCharacterId);
  }

  async forceResolveTimedOutByToken(partyInviteToken: string): Promise<PartyBossActionServiceResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }

    const now = this.clock();
    const result = await this.sessions.resolveTimedOutByToken(partyInviteToken, {
      now,
      nextTurnExpiresAt: nextTurnDeadline(now)
    }, "force-dev");
    const achievementUnlocksByCharacterId = await this.trackAchievementEvents(result);
    await this.trackBarrelBeerTutorialProgress(result);
    await this.trackActivityEvents(result);

    return withAchievementUnlocks(result, achievementUnlocksByCharacterId);
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

  private async trackAchievementEvents(result: PartyBossActionResult): Promise<Record<string, AchievementUnlock[]>> {
    if (!this.achievements || !("achievementEvents" in result) || !result.achievementEvents) {
      return {};
    }

    const unlocksByCharacterId: Record<string, AchievementUnlock[]> = {};
    for (const event of result.achievementEvents) {
      const eventUnlocks = await this.achievements.trackEventSafely(event.type === "item.used"
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
      if (event.type === "mantok.gear-action.used" || event.type === "warrior.raid-taunt.activated") {
        unlocksByCharacterId[event.characterId] = [
          ...(unlocksByCharacterId[event.characterId] ?? []),
          ...eventUnlocks
        ];
      }
    }

    return Object.fromEntries(
      Object.entries(unlocksByCharacterId).filter(([, unlocks]) => unlocks.length > 0)
    );
  }

  private async trackActivityEvents(result: PartyBossActionResult): Promise<void> {
    if (!this.activityEvents || !("session" in result)) {
      return;
    }

    await this.activityEvents.recordPartyRaidCompletedSafely(result.session);
  }

  private async trackBarrelBeerTutorialProgress(result: PartyBossActionResult): Promise<void> {
    if (!this.barrelBeerTutorial || !("session" in result) || !isBigBarrelBrotherSession(result.session)) {
      return;
    }

    const achievementEvents = "achievementEvents" in result
      ? result.achievementEvents ?? []
      : [];
    const claimedCharacterIds = new Set(
      achievementEvents
        .filter((event) => event.type === "barrel.raid.claimed")
        .map((event) => event.characterId)
    );

    if (claimedCharacterIds.size === 0) {
      return;
    }

    for (const participant of result.session.participants) {
      if (!claimedCharacterIds.has(participant.id)) {
        continue;
      }

      try {
        await this.barrelBeerTutorial.markVisitedBarrelForTelegramUser(participant.telegramUserId);
        await this.barrelBeerTutorial.markBarrelRaidCompletedForTelegramUser(participant.telegramUserId);
      } catch (error) {
        console.error("Квестарня: прогрес бочкової навчальної справи після рейду Старшого Брата не записався.", error);
      }
    }
  }
}

function nextTurnDeadline(now: Date): Date {
  return new Date(now.getTime() + PARTY_BOSS_TURN_MS);
}

function isBigBarrelBrotherSession(session: PartyBossSessionRecord): boolean {
  return session.rulesVersion === BIG_BARREL_BROTHER_RULES_VERSION ||
    session.bossKey === BIG_BARREL_BROTHER_BOSS_KEY ||
    session.state.rulesVersion === BIG_BARREL_BROTHER_RULES_VERSION ||
    session.state.boss.monsterId === BIG_BARREL_BROTHER_BOSS_KEY;
}

function withAchievementUnlocks(
  result: PartyBossActionResult,
  achievementUnlocksByCharacterId: Record<string, AchievementUnlock[]>
): PartyBossActionServiceResult {
  return Object.keys(achievementUnlocksByCharacterId).length > 0
    ? { ...result, achievementUnlocksByCharacterId }
    : result;
}
import { randomUUID } from "node:crypto";
