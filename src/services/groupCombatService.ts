import type {
  GroupCombatActionKey,
  GroupCombatTargetKind
} from "../domain/groupCombat/groupCombat";
import type {
  GroupCombatActionResult,
  GroupCombatRepository,
  GroupCombatSessionRecord,
  GroupCombatStartResult
} from "../db/repositories/groupCombatRepository";
import { randomBytes } from "node:crypto";
import type { AchievementService } from "./achievementService";

export const GROUP_COMBAT_TURN_MS = 23_000;
export const LEFT_PASSAGE_RECRUITING_MS = 3 * 60_000;
export const LEFT_PASSAGE_PARTY_ORIGIN_KIND = "nyz-left-passage-party.v1";
export const LEFT_PASSAGE_LOCATION_ID = "PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT";

export class GroupCombatService {
  constructor(
    private readonly repository: GroupCombatRepository,
    private readonly options: {
      enabled: boolean;
      devHelpersEnabled: boolean;
      leftPassagePartyAttackEnabled?: boolean;
    },
    private readonly now: () => Date = () => new Date(),
    private readonly achievements?: AchievementService
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
      locationId: LEFT_PASSAGE_LOCATION_ID,
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
      turnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS)
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
      turnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS)
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
      turnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS)
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
      turnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS)
    });
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

  async resolveDue(limit = 13): Promise<GroupCombatSessionRecord[]> {
    if (!this.options.enabled) {
      return [];
    }
    const now = this.now();
    const ids = await this.repository.listDueSessionIds(now, limit);
    const resolved: GroupCombatSessionRecord[] = [];
    for (const sessionId of ids) {
      try {
        const result = await this.repository.resolveTimedOutSession({
          sessionId,
          now,
          nextTurnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS)
        });
        const settled = await this.settleTerminalResult(result);
        if ("session" in settled) {
          resolved.push(settled.session);
        }
      } catch {
        continue;
      }
    }
    return resolved;
  }

  async repair(limit = 13): Promise<number> {
    if (!this.options.enabled) {
      return 0;
    }
    const repaired = await this.repository.repairInvalidOrOrphaned(this.now(), limit);
    await this.settlePending(limit);
    return repaired;
  }

  async settleParticipant(sessionId: string, telegramUserId: bigint) {
    const now = this.now();
    const result = await this.repository.settleParticipant({ sessionId, telegramUserId, now });
    if (
      (result.state === "settled" || result.state === "replayed") &&
      result.receipt.policy === "left-passage-party"
    ) {
      await this.achievements?.trackEventSafely({
        type: "left-passage.party-attack.completed",
        characterId: result.receipt.characterId,
        occurredAt: now,
        sourceId: sessionId
      });
    }
    return result;
  }

  async settlePending(limit = 13): Promise<number> {
    if (!this.options.enabled) {
      return 0;
    }
    const pending = await this.repository.listPendingSettlementParticipants(limit);
    let settled = 0;
    for (const participant of pending) {
      try {
        const result = await this.settleParticipant(participant.sessionId, participant.telegramUserId);
        settled += result.state === "settled" || result.state === "replayed" ? 1 : 0;
      } catch {
        continue;
      }
    }
    return settled;
  }

  async listPendingDelivery(limit = 13): Promise<GroupCombatSessionRecord[]> {
    if (!this.options.enabled) {
      return [];
    }
    const ids = await this.repository.listPendingDeliverySessionIds(limit);
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
  }): Promise<boolean> {
    return this.repository.compareAndSetParticipantCard(input);
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
    for (const participant of result.session.participants) {
      try {
        await this.settleParticipant(result.session.id, participant.telegramUserId);
      } catch {
        continue;
      }
    }
    const refreshed = await this.repository.findById(result.session.id);
    return refreshed ? { ...result, session: refreshed } : result;
  }
}
