import { describe, expect, it } from "vitest";
import { createGroupCombatProofState } from "../../src/domain/groupCombat/groupCombat";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import { presentGroupCombat } from "../../src/bot/presenters/groupCombatPresenter";

const NOW = new Date("2026-07-22T10:00:00.000Z");

describe("group combat presenter", () => {
  it("keeps the maximum proof card bounded and shows the canonical remaining turn wait", () => {
    const state = createGroupCombatProofState({
      sessionId: "group-card",
      partySessionId: "party-card",
      deterministicSeed: 42,
      participants: Array.from({ length: 3 }, (_, index) => ({
        characterId: `character-${index}`,
        telegramUserId: `${1001 + index}`,
        name: `Пригодник із довгим ім’ям ${index + 1}`,
        remortCount: 0,
        rosterOrder: index,
        hp: 93,
        hpMax: 93,
        mana: 42,
        manaMax: 42,
        attack: 8,
        defense: 2,
        support: 6,
        equipmentItemIds: [`item-${index}`]
      }))
    });
    state.recap = Array.from({ length: 5 }, (_, index) => ({
      turn: index + 1,
      lines: Array.from({ length: 13 }, (__, line) => `Рядок ${line + 1}: пригода триває без зайвого галасу.`)
    }));
    const participants = state.participants.map((actor) => ({
      characterId: actor.characterId,
      telegramUserId: BigInt(actor.telegramUserId),
      name: actor.name,
      remortCount: actor.remortCount,
      rosterOrder: actor.rosterOrder,
      chatId: BigInt(actor.telegramUserId),
      messageId: 13 + actor.rosterOrder,
      referenceVersion: 1,
      deliveredRevision: 0
    }));
    const session: GroupCombatSessionRecord = {
      id: state.sessionId,
      partySessionId: state.partySessionId,
      partyInviteToken: "proof-token-13",
      status: "active",
      turn: state.turn,
      version: 1,
      deliveryRevision: 1,
      deliveryPending: true,
      deliveryAttemptedAt: null,
      state,
      result: null,
      turnExpiresAt: new Date(NOW.getTime() + 23_000),
      completedAt: null,
      participants,
      queuedActions: []
    };

    const text = presentGroupCombat(session, participants[0]!.characterId, { now: NOW });

    expect(text).toContain("До захисту мовчунів — 23 секунди.");
    expect(text.length).toBeLessThan(4_096);
  });
});
