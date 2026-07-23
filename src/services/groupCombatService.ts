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

export const GROUP_COMBAT_TURN_MS = 23_000;

export class GroupCombatService {
  constructor(
    private readonly repository: GroupCombatRepository,
    private readonly options: { enabled: boolean; devHelpersEnabled: boolean },
    private readonly now: () => Date = () => new Date()
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.options.enabled && this.options.devHelpersEnabled;
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

  async submitAction(input: {
    telegramUserId: bigint;
    partyInviteToken: string;
    turn: number;
    action: GroupCombatActionKey;
    targetKind: GroupCombatTargetKind;
    targetId: string;
  }): Promise<GroupCombatActionResult> {
    if (!this.options.enabled) {
      return { state: "disabled" };
    }
    const now = this.now();
    return this.repository.submitActionForTelegramUser({
      ...input,
      now,
      nextTurnExpiresAt: new Date(now.getTime() + GROUP_COMBAT_TURN_MS)
    });
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
        if ("session" in result) {
          resolved.push(result.session);
        }
      } catch {
        continue;
      }
    }
    return resolved;
  }

  async repair(limit = 13): Promise<number> {
    return this.options.enabled ? this.repository.repairInvalidOrOrphaned(this.now(), limit) : 0;
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
}
