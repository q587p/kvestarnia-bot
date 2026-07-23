import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createGroupCombatTimeoutScheduler } from "../../src/bot/groupCombatTimeoutScheduler";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";

describe("group combat timeout scheduler", () => {
  it("does no scans or delivery while the proof gate is disabled", async () => {
    const repair = vi.fn();
    const resolveDue = vi.fn();
    const listPendingDelivery = vi.fn();
    const scheduler = createGroupCombatTimeoutScheduler({
      isEnabled: () => false,
      repair,
      resolveDue,
      listPendingDelivery
    } as unknown as GroupCombatService, { api: {} } as Bot);

    await expect(scheduler.tick()).resolves.toBe(0);
    expect(repair).not.toHaveBeenCalled();
    expect(resolveDue).not.toHaveBeenCalled();
    expect(listPendingDelivery).not.toHaveBeenCalled();
  });

  it("runs bounded repair before the lean due-session pass", async () => {
    const order: string[] = [];
    const repair = vi.fn(() => {
      order.push("repair");
      return Promise.resolve(2);
    });
    const resolveDue = vi.fn(() => {
      order.push("due");
      return Promise.resolve([]);
    });
    const listPendingDelivery = vi.fn(() => {
      order.push("delivery");
      return Promise.resolve([]);
    });
    const scheduler = createGroupCombatTimeoutScheduler({
      isEnabled: () => true,
      repair,
      resolveDue,
      listPendingDelivery
    } as unknown as GroupCombatService, { api: {} } as Bot);

    await expect(scheduler.tick()).resolves.toBe(2);
    expect(order).toEqual(["repair", "due", "delivery"]);
    expect(repair).toHaveBeenCalledWith(13);
    expect(resolveDue).toHaveBeenCalledWith(13);
    expect(listPendingDelivery).toHaveBeenCalledWith(13);
  });

  it("waits for an in-flight pass during shutdown", async () => {
    let releaseRepair: (() => void) | undefined;
    const repair = vi.fn(() => new Promise<number>((resolve) => {
      releaseRepair = () => resolve(1);
    }));
    const resolveDue = vi.fn().mockResolvedValue([]);
    const listPendingDelivery = vi.fn().mockResolvedValue([]);
    const scheduler = createGroupCombatTimeoutScheduler({
      isEnabled: () => true,
      repair,
      resolveDue,
      listPendingDelivery
    } as unknown as GroupCombatService, { api: {} } as Bot);

    const tick = scheduler.tick();
    await Promise.resolve();
    let stopped = false;
    const stop = scheduler.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();

    expect(stopped).toBe(false);
    releaseRepair?.();
    await expect(tick).resolves.toBe(1);
    await expect(stop).resolves.toBeUndefined();
    expect(stopped).toBe(true);
  });

  it("delivers a committed pending revision discovered after restart", async () => {
    const session = pendingSession();
    const editMessageText = vi.fn().mockResolvedValue(true);
    const sendMessage = vi.fn();
    const finalizeDeliveryAttempt = vi.fn().mockResolvedValue(true);
    const service = {
      isEnabled: () => true,
      repair: vi.fn().mockResolvedValue(0),
      resolveDue: vi.fn().mockResolvedValue([]),
      listPendingDelivery: vi.fn().mockResolvedValue([session]),
      findById: vi.fn().mockResolvedValue(session),
      markParticipantCardDelivered: vi.fn().mockResolvedValue(true),
      finalizeDeliveryAttempt
    } as unknown as GroupCombatService;
    const scheduler = createGroupCombatTimeoutScheduler(service, {
      api: { editMessageText, sendMessage, deleteMessage: vi.fn() }
    } as unknown as Bot);

    await expect(scheduler.tick()).resolves.toBe(1);
    expect(editMessageText).toHaveBeenCalledTimes(2);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(finalizeDeliveryAttempt).toHaveBeenCalledWith(session.id, session.deliveryRevision);
  });
});

function pendingSession(): GroupCombatSessionRecord {
  const participants = [
    { characterId: "character-1", telegramUserId: 1001n, name: "Лідерка", rosterOrder: 0 },
    { characterId: "character-2", telegramUserId: 1002n, name: "Друг", rosterOrder: 1 }
  ];
  return {
    id: "pending-terminal",
    partySessionId: "party-terminal",
    partyInviteToken: "proof-token-13",
    status: "won",
    turn: 1,
    version: 2,
    deliveryRevision: 2,
    deliveryPending: true,
    deliveryAttemptedAt: null,
    turnExpiresAt: new Date("2026-07-22T10:00:00.000Z"),
    completedAt: new Date("2026-07-22T10:00:00.000Z"),
    result: { kind: "rewardless-proof", outcome: "won", completedTurn: 1, rewards: { xp: 0, gold: 0, items: [] } },
    participants: participants.map((participant, index) => ({
      ...participant,
      remortCount: 0,
      chatId: participant.telegramUserId,
      messageId: 21 + index,
      referenceVersion: 1,
      deliveredRevision: 1
    })),
    queuedActions: [],
    state: {
      rulesVersion: "group-combat.v1",
      sessionId: "pending-terminal",
      partySessionId: "party-terminal",
      encounterKey: "proof-cellar-many",
      deterministicSeed: 42,
      status: "won",
      turn: 1,
      participants: participants.map((participant) => ({
        ...participant,
        telegramUserId: participant.telegramUserId.toString(),
        remortCount: 0,
        hp: 30,
        hpMax: 30,
        mana: 13,
        manaMax: 13,
        attack: 8,
        defense: 2,
        support: 5,
        equipmentItemIds: []
      })),
      enemies: [
        { id: "enemy-1", name: "Шурхіт", order: 0, hp: 0, hpMax: 12, attack: 4, defense: 0 },
        { id: "enemy-2", name: "Гуп", order: 1, hp: 0, hpMax: 14, attack: 5, defense: 1 }
      ],
      contributions: participants.map((participant) => ({
        characterId: participant.characterId,
        damage: 1,
        healing: 0,
        guardedTurns: 0
      })),
      recap: []
    }
  };
}
