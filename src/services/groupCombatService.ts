import type {
  GroupCombatActionKey,
  GroupCombatTargetKind
} from "../domain/groupCombat/groupCombat";
import type {
  GroupCombatActionResult,
  GroupCombatRepository,
  GroupCombatSettlementNotice,
  GroupCombatSessionRecord,
  GroupCombatStartResult
} from "../db/repositories/groupCombatRepository";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import { randomBytes } from "node:crypto";
import { PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT } from "./presenceService";
import type { DailyActionRepository } from "../db/repositories/dailyActionRepository";
import { CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID } from "./itemGrant";
import { isQuestConsumableUseUnlocked } from "./questConsumableUse";
import { LEFT_PASSAGE_PARTY_ORIGIN_KIND } from "./partySessionService";
import type { GuildWeeklyGoalService } from "./guildWeeklyGoalService";

export { LEFT_PASSAGE_PARTY_ORIGIN_KIND } from "./partySessionService";

export const GROUP_COMBAT_TURN_MS = 23_000;
export const LEFT_PASSAGE_RECRUITING_MS = 3 * 60_000;
export const GROUP_COMBAT_DELIVERY_RETRY_MS = 13_000;
export interface GroupCombatResolvedDelivery {
  session: GroupCombatSessionRecord;
  settlementNotices: GroupCombatSettlementNotice[];
}
export interface GroupCombatRepairWork {
  repaired: number;
  settlementNotices: GroupCombatSettlementNotice[];
}

export type GroupCombatExitNavigation =
  | {
      state: "claimed";
      locationId: string | null;
      questMarkers: unknown;
      menuDelivered: boolean;
    }
  | { state: "busy" }
  | { state: "superseded" }
  | { state: "not-found" };

export class GroupCombatService {
  constructor(
    private readonly repository: GroupCombatRepository,
    private readonly options: {
      enabled: boolean;
      devHelpersEnabled: boolean;
      leftPassagePartyAttackEnabled?: boolean;
      guildIdentityEnabled?: boolean;
      guildWeeklyGoalEnabled?: boolean;
    },
    private readonly now: () => Date = () => new Date(),
    private readonly achievements?: AchievementService,
    private readonly resolveQuestMarkers?: (
      telegramUserId: bigint
    ) => Promise<unknown>,
    private readonly dailyActions?: Pick<DailyActionRepository, "findForTelegramUser">,
    private readonly guildWeeklyGoals?: GuildWeeklyGoalService
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.options.enabled && this.options.devHelpersEnabled;
  }

  isLeftPassageEntryEnabled(): boolean {
    return this.options.enabled && this.options.leftPassagePartyAttackEnabled === true;
  }

  async getHiddenCombatItemIdsForTelegramUser(telegramUserId: bigint): Promise<ReadonlySet<string>> {
    if (
      this.dailyActions &&
      !(await isQuestConsumableUseUnlocked(
        this.dailyActions,
        telegramUserId,
        CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID
      ))
    ) {
      return new Set([CELLAR_FOAMY_MIRAGE_BOTTLE_ITEM_ID]);
    }
    return new Set();
  }

  async createLeftPassageParty(input: {
    telegramUserId: bigint;
    encounterToken: string;
    chatId?: bigint | null;
    messageId?: number | null;
  }) {
    if (!this.isLeftPassageEntryEnabled()) {
      return { state: "disabled" as const };
    }
    const now = this.now();
    return this.repository.createLeftPassagePartyForTelegramUser({
      ...input,
      inviteToken: randomBytes(18).toString("base64url"),
      originKind: LEFT_PASSAGE_PARTY_ORIGIN_KIND,
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now,
      joinUntilAt: new Date(now.getTime() + LEFT_PASSAGE_RECRUITING_MS)
    });
  }

  async startLeftPassage(telegramUserId: bigint, partyInviteToken: string): Promise<GroupCombatStartResult> {
    if (!this.isLeftPassageEntryEnabled()) {
      return { state: "disabled" };
    }
    const now = this.now();
    return this.repository.startLeftPassageForTelegramUser({
      telegramUserId,
      partyInviteToken,
      now,
      turnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS),
      ...(this.options.guildIdentityEnabled ? { includeGuildIdentity: true } : {}),
      ...(this.options.guildWeeklyGoalEnabled ? { guildWeeklyGoalEligible: true } : {})
    });
  }

  async startDueLeftPassage(partyInviteToken: string): Promise<GroupCombatStartResult> {
    if (!this.isLeftPassageEntryEnabled()) {
      return { state: "disabled" };
    }
    const now = this.now();
    return this.repository.startDueLeftPassage({
      partyInviteToken,
      now,
      turnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS),
      ...(this.options.guildIdentityEnabled ? { includeGuildIdentity: true } : {}),
      ...(this.options.guildWeeklyGoalEnabled ? { guildWeeklyGoalEligible: true } : {})
    });
  }

  async startReadyLeftPassage(partyInviteToken: string): Promise<GroupCombatStartResult> {
    if (!this.isLeftPassageEntryEnabled()) {
      return { state: "disabled" };
    }
    const now = this.now();
    return this.repository.startReadyLeftPassage({
      partyInviteToken,
      now,
      turnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS),
      ...(this.options.guildIdentityEnabled ? { includeGuildIdentity: true } : {}),
      ...(this.options.guildWeeklyGoalEnabled ? { guildWeeklyGoalEligible: true } : {})
    });
  }

  currentTime(): Date {
    return this.now();
  }

  async startProof(telegramUserId: bigint, partyInviteToken: string): Promise<GroupCombatStartResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }
    const now = this.now();
    return this.repository.startProofForTelegramUser({
      telegramUserId,
      partyInviteToken,
      now,
      turnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS),
      ...(this.options.guildIdentityEnabled ? { includeGuildIdentity: true } : {})
    });
  }

  async startDueProof(partyInviteToken: string): Promise<GroupCombatStartResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }
    const now = this.now();
    return this.repository.startDueProof({
      partyInviteToken,
      now,
      turnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS),
      ...(this.options.guildIdentityEnabled ? { includeGuildIdentity: true } : {})
    });
  }

  async resolveDevTimeout(partyInviteToken: string): Promise<GroupCombatActionResult> {
    if (!this.areDevHelpersEnabled()) {
      return { state: "disabled" };
    }
    const session = await this.repository.findByPartyInviteToken(partyInviteToken);
    if (!session) {
      return { state: "not-found" };
    }
    const now = new Date(Math.max(this.now().getTime(), session.turnExpiresAt.getTime()));
    const result = await this.repository.resolveTimedOutSession({
      sessionId: session.id,
      now,
      nextTurnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS)
    });
    return this.settleTerminalResult(result);
  }

  async submitAction(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    turn: number;
    action: GroupCombatActionKey;
    targetKind: GroupCombatTargetKind;
    targetId: string;
    payloadKey?: string;
  }): Promise<GroupCombatActionResult> {
    if (!this.options.enabled) {
      return { state: "disabled" };
    }
    const now = this.now();
    const result = await this.repository.submitActionForTelegramUser({
      ...input,
      now,
      nextTurnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS)
    });
    return this.settleTerminalResult(result);
  }

  findByToken(partyInviteToken: string): Promise<GroupCombatSessionRecord | null> {
    return this.options.enabled ? this.repository.findByPartyInviteToken(partyInviteToken) : Promise.resolve(null);
  }

  findById(sessionId: string): Promise<GroupCombatSessionRecord | null> {
    return this.options.enabled ? this.repository.findById(sessionId) : Promise.resolve(null);
  }

  findActiveForTelegramUser(telegramUserId: bigint): Promise<GroupCombatSessionRecord | null> {
    return this.options.enabled ? this.repository.findActiveByTelegramUserId(telegramUserId) : Promise.resolve(null);
  }

  inspectOperatorRepair(sessionId: string) {
    return this.repository.inspectOperatorRepair(sessionId);
  }

  async resolveDue(limit = 13): Promise<GroupCombatSessionRecord[]> {
    return (await this.resolveDueWithNotices(limit)).map((entry) => entry.session);
  }

  async resolveDueWithNotices(limit = 13): Promise<GroupCombatResolvedDelivery[]> {
    if (!this.options.enabled) {
      return [];
    }
    const now = this.now();
    const ids = await this.repository.listDueSessionIds(now, limit);
    const resolved: GroupCombatResolvedDelivery[] = [];
    for (const sessionId of ids) {
      try {
        const result = await this.repository.resolveTimedOutSession({
          sessionId,
          now,
          nextTurnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS)
        });
        const settled = await this.settleTerminalResult(result);
        if ("session" in settled) {
          resolved.push({
            session: settled.session,
            settlementNotices: settled.settlementNotices ?? []
          });
        }
      } catch {
        continue;
      }
    }
    return resolved;
  }

  async repair(limit = 13): Promise<number> {
    return (await this.repairWithNotices(limit)).repaired;
  }

  async repairWithNotices(limit = 13): Promise<GroupCombatRepairWork> {
    if (!this.options.enabled) {
      return { repaired: 0, settlementNotices: [] };
    }
    const repaired = await this.repository.repairInvalidOrOrphaned(this.now(), limit);
    const pending = await this.settlePendingWithNotices(limit);
    await this.guildWeeklyGoals?.repairCurrentPeriod(limit).catch(() => undefined);
    const weeklyNotices = await this.guildWeeklyGoals?.claimAchievementNotices(limit).catch(() => []) ?? [];
    return {
      repaired,
      settlementNotices: [
        ...pending.settlementNotices,
        ...weeklyNotices.map((notice) => ({
          telegramUserId: notice.telegramUserId,
          characterId: notice.characterId,
          characterName: notice.characterName,
          classId: notice.classId,
          raceId: notice.raceId,
          levelChange: null,
          achievementUnlocks: [notice.unlock],
          weeklyAchievementClaims: [{
            entitlementId: notice.entitlementId,
            claimToken: notice.claimToken
          }]
        }))
      ]
    };
  }

  markWeeklyAchievementNoticeSent(notice: { entitlementId: string; claimToken: string }): Promise<boolean> {
    return this.guildWeeklyGoals?.markAchievementNoticeSent(notice) ?? Promise.resolve(false);
  }

  releaseWeeklyAchievementNotice(notice: { entitlementId: string; claimToken: string }): Promise<boolean> {
    return this.guildWeeklyGoals?.releaseAchievementNotice(notice) ?? Promise.resolve(false);
  }

  async settleParticipant(sessionId: string, telegramUserId: bigint) {
    const result = await this.repository.settleParticipant({
      sessionId,
      telegramUserId,
      now: this.now()
    });
    let weeklyAchievementNotices: Awaited<ReturnType<GuildWeeklyGoalService["claimAchievementNotices"]>> = [];
    if (
      (result.state === "settled" || result.state === "replayed") &&
      result.receipt.policy === "left-passage-party"
    ) {
      await this.guildWeeklyGoals?.recordTerminalSession(sessionId).catch(() => undefined);
      if (result.state === "settled") {
        weeklyAchievementNotices = await this.guildWeeklyGoals?.claimAchievementNotices(13, telegramUserId)
          .catch(() => []) ?? [];
      }
    }
    if (
      result.state !== "settled" ||
      result.receipt.policy !== "left-passage-party" ||
      result.receipt.manualParticipation !== true ||
      !this.achievements
    ) {
      return weeklyAchievementNotices.length > 0
        ? {
            ...result,
            achievementUnlocks: weeklyAchievementNotices.map((notice) => notice.unlock),
            weeklyAchievementClaims: weeklyAchievementNotices.map(({ entitlementId, claimToken }) => ({ entitlementId, claimToken }))
          }
        : result;
    }
    const session = await this.repository.findById(sessionId);
    const unlocks: AchievementUnlock[] = [];
    const sourceId = `group-combat:${sessionId}:participant:${result.receipt.characterId}`;
    const occurredAt = this.now();
    if (result.levelChange?.leveledUp) {
      unlocks.push(...(await this.achievements?.trackEventSafely({
        type: "level.reached",
        characterId: result.receipt.characterId,
        level: result.levelChange.newLevel,
        occurredAt,
        sourceId
      }) ?? []));
    }
    if (result.receipt.rewards.items.length > 0) {
      unlocks.push(...(await this.achievements?.trackEventSafely({
        type: "item.received",
        characterId: result.receipt.characterId,
        itemIds: result.receipt.rewards.items.map((item) => item.itemId),
        occurredAt,
        sourceId
      }) ?? []));
    }
    if (session?.state.status === "won" || session?.state.status === "lost") {
      unlocks.push(...(await this.achievements?.trackEventSafely({
        type: "combat.finished",
        characterId: result.receipt.characterId,
        outcome: session.state.status,
        occurredAt,
        sourceId
      }) ?? []));
    }
    return {
      ...result,
      achievementUnlocks: [...unlocks, ...weeklyAchievementNotices.map((notice) => notice.unlock)],
      ...(weeklyAchievementNotices.length > 0
        ? { weeklyAchievementClaims: weeklyAchievementNotices.map(({ entitlementId, claimToken }) => ({ entitlementId, claimToken })) }
        : {})
    };
  }

  async settlePending(limit = 13): Promise<number> {
    return (await this.settlePendingWithNotices(limit)).settled;
  }

  async settlePendingWithNotices(limit = 13): Promise<{
    settled: number;
    settlementNotices: GroupCombatSettlementNotice[];
  }> {
    if (!this.options.enabled) {
      return { settled: 0, settlementNotices: [] };
    }
    const pending = await this.repository.listPendingSettlementParticipants(limit);
    let settled = 0;
    const settlementNotices: GroupCombatSettlementNotice[] = [];
    for (const participant of pending) {
      try {
        const result = await this.settleParticipant(participant.sessionId, participant.telegramUserId);
        settled += result.state === "settled" || result.state === "replayed" ? 1 : 0;
        if (result.state === "settled") {
          const session = await this.repository.findById(participant.sessionId);
          const record = session?.participants.find(
            (candidate) => candidate.telegramUserId === participant.telegramUserId
          );
          const frozen = record && session?.state.participants.find(
            (candidate) => candidate.characterId === record.characterId
          );
          if (session && record && frozen) {
            settlementNotices.push({
              telegramUserId: record.telegramUserId,
              characterId: record.characterId,
              characterName: record.name,
              classId: frozen.classId,
              raceId: frozen.raceId,
              levelChange: result.levelChange ?? null,
              achievementUnlocks: "achievementUnlocks" in result
                ? result.achievementUnlocks
                : [],
              ...(result && "weeklyAchievementClaims" in result
                ? { weeklyAchievementClaims: result.weeklyAchievementClaims }
                : {})
            });
          }
        }
      } catch {
        continue;
      }
    }
    return { settled, settlementNotices };
  }

  async listPendingDelivery(limit = 13): Promise<GroupCombatSessionRecord[]> {
    if (!this.options.enabled) {
      return [];
    }
    const ids = await this.repository.listPendingDeliverySessionIds(
      limit,
      new Date(this.now().getTime() - GROUP_COMBAT_DELIVERY_RETRY_MS)
    );
    const sessions: GroupCombatSessionRecord[] = [];
    for (const id of ids) {
      try {
        const session = await this.repository.findById(id);
        if (session) {
          sessions.push(session);
        }
      } catch {
        continue;
      }
    }
    return sessions;
  }

  compareAndSetParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
    publishedKeyboardFingerprint?: string | null;
  }): Promise<boolean> {
    return this.repository.compareAndSetParticipantCard(input);
  }

  replaceCompletedParticipantTerminalCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    expectedReferenceVersion: number;
    previousChatId: bigint | null;
    previousMessageId: number | null;
    terminalCard: {
      chatId: bigint;
      messageId: number;
    };
  }): Promise<boolean> {
    return this.repository.replaceCompletedParticipantTerminalCard(input);
  }

  releaseParticipantCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean> {
    return this.repository.releaseParticipantCard(input);
  }

  markParticipantCardDelivered(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    expectedReferenceVersion: number;
    chatId: bigint;
    messageId: number;
  }): Promise<boolean> {
    return this.repository.markParticipantCardDelivered(input);
  }

  claimParticipantUiPublication(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    keyboardFingerprint: string;
    claimToken: string;
    claimedAt: Date;
    staleBefore: Date;
  }) {
    return this.repository.claimParticipantUiPublication(input);
  }

  acknowledgeParticipantUiPublication(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    publishedKeyboardFingerprint: string | null;
    claimToken: string;
  }) {
    return this.repository.acknowledgeParticipantUiPublication(input);
  }

  renewParticipantUiPublicationClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    expectedDeliveryRevision: number;
    claimToken: string;
    claimedAt: Date;
  }): Promise<boolean> {
    return this.repository.renewParticipantUiPublicationClaim(input);
  }

  releaseParticipantUiPublicationClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
  }): Promise<boolean> {
    return this.repository.releaseParticipantUiPublicationClaim(input);
  }

  requestParticipantUiRefresh(input: {
    sessionId: string;
    telegramUserId: bigint;
  }): Promise<boolean> {
    return this.repository.requestParticipantUiRefresh(input);
  }

  async claimParticipantFleeExitDelivery(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    claimedAt: Date;
    staleBefore: Date;
  }): Promise<GroupCombatExitNavigation> {
    const claim = await this.repository.claimParticipantFleeExitDelivery(input);
    if (claim.state !== "claimed") {
      return claim;
    }
    return {
      ...claim,
      questMarkers: this.resolveQuestMarkers
        ? await this.resolveQuestMarkers(input.telegramUserId)
        : null
    };
  }

  releaseParticipantFleeExitDeliveryClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
  }): Promise<boolean> {
    return this.repository.releaseParticipantFleeExitDeliveryClaim(input);
  }

  renewParticipantFleeExitDeliveryClaim(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    claimedAt: Date;
  }): Promise<boolean> {
    return this.repository.renewParticipantFleeExitDeliveryClaim(input);
  }

  markParticipantFleeExitMenuDelivered(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    messageId: number;
  }): Promise<boolean> {
    return this.repository.markParticipantFleeExitMenuDelivered(input);
  }

  adoptParticipantFleeExitTerminalCard(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    expectedReferenceVersion: number;
    chatId: bigint | null;
    messageId: number | null;
    terminalCard: {
      chatId: bigint;
      messageId: number;
      deliveryRevision: number;
    };
  }): Promise<boolean> {
    return this.repository.adoptParticipantFleeExitTerminalCard(input);
  }

  completeParticipantFleeExitDelivery(input: {
    sessionId: string;
    telegramUserId: bigint;
    claimToken: string;
    expectedReferenceVersion: number;
    chatId: bigint | null;
    messageId: number | null;
    retainReference: boolean;
  }): Promise<boolean> {
    return this.repository.completeParticipantFleeExitDelivery(input);
  }

  finalizeDeliveryAttempt(sessionId: string, expectedDeliveryRevision: number): Promise<boolean> {
    return this.repository.finalizeDeliveryAttempt({
      sessionId,
      expectedDeliveryRevision,
      attemptedAt: this.now()
    });
  }

  private async settleTerminalResult(result: GroupCombatActionResult): Promise<GroupCombatActionResult> {
    if (!("session" in result) || result.session.status === "active") {
      return result;
    }
    const settlementNotices: GroupCombatSettlementNotice[] = [];
    for (const participant of result.session.participants) {
      try {
        const settlement = await this.settleParticipant(result.session.id, participant.telegramUserId);
        if (settlement.state === "settled") {
          const frozen = result.session.state.participants.find(
            (candidate) => candidate.characterId === participant.characterId
          );
          if (frozen) {
            settlementNotices.push({
              telegramUserId: participant.telegramUserId,
              characterId: participant.characterId,
              characterName: participant.name,
              classId: frozen.classId,
              raceId: frozen.raceId,
              levelChange: settlement.levelChange ?? null,
              achievementUnlocks: "achievementUnlocks" in settlement
                ? settlement.achievementUnlocks
                : [],
              ...(settlement && "weeklyAchievementClaims" in settlement
                ? { weeklyAchievementClaims: settlement.weeklyAchievementClaims }
                : {})
            });
          }
        }
      } catch {
        continue;
      }
    }
    const refreshed = await this.repository.findById(result.session.id);
    return refreshed
      ? {
          ...result,
          session: refreshed,
          ...(settlementNotices.length > 0 ? { settlementNotices } : {})
        }
      : result;
  }
}
