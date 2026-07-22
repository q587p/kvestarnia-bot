import { describe, expect, it } from "vitest";
import {
  buildGroupCombatTimeoutAction,
  createGroupCombatProofState,
  GROUP_COMBAT_RECAP_LIMIT,
  resolveGroupCombatTurn,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActorSnapshot
} from "../../src/domain/groupCombat/groupCombat";
import {
  GroupCombatStateValidationError,
  parseGroupCombatResultStrict,
  parseGroupCombatStateStrict
} from "../../src/domain/groupCombat/groupCombatStateValidation";
import {
  getCombatLeaseOwnerDescriptor,
  GROUP_COMBAT_LEASE_KIND
} from "../../src/domain/combat/combatLeaseRegistry";

describe("group combat proof reducer", () => {
  it("registers the group owner and repair boundary as remort-blocking", () => {
    expect(getCombatLeaseOwnerDescriptor(GROUP_COMBAT_LEASE_KIND)).toEqual({
      kind: "group-combat",
      owner: "group-combat",
      repairOwner: "group-combat",
      remortPolicy: "block"
    });
  });

  it("requires explicit live targets without mutating stale, wrong-side, or dead choices", () => {
    const state = proofState(2);
    const before = structuredClone(state);
    expect(validateGroupCombatAction(state, action(state, 0, "attack", "enemy", state.enemies[0]!.id))).toBe("ok");
    expect(validateGroupCombatAction(state, action(state, 0, "attack", "ally", state.participants[1]!.characterId))).toBe("invalid-target");
    expect(validateGroupCombatAction(state, action(state, 0, "aid", "ally", state.participants[0]!.characterId))).toBe("invalid-target");
    expect(validateGroupCombatAction(state, action(state, 0, "aid", "ally", state.participants[1]!.characterId))).toBe("invalid-target");
    state.participants[1]!.hp -= 1;
    expect(validateGroupCombatAction(state, action(state, 0, "aid", "ally", state.participants[1]!.characterId))).toBe("ok");
    expect(validateGroupCombatAction(state, action(state, 0, "guard", "self", state.participants[1]!.characterId))).toBe("invalid-target");
    state.enemies[0]!.hp = 0;
    expect(validateGroupCombatAction(state, action(state, 0, "attack", "enemy", state.enemies[0]!.id))).toBe("invalid-target");
    expect(before).toEqual(proofState(2));
  });

  it("fills a missing actor with resource-free self guard and resolves deterministically", () => {
    const first = proofState(3);
    first.participants[2]!.hp -= 4;
    const second = structuredClone(first);
    const actions = [
      action(first, 0, "attack", "enemy", first.enemies[0]!.id),
      action(first, 1, "aid", "ally", first.participants[2]!.characterId)
    ];
    const resolved = resolveGroupCombatTurn(first, actions);
    const repeated = resolveGroupCombatTurn(second, actions);

    expect(resolved).toEqual(repeated);
    expect(resolved.state.contributions[2]?.guardedTurns).toBe(1);
    expect(resolved.state.participants[2]?.mana).toBe(first.participants[2]?.mana);
    expect(resolved.state.recap[0]?.lines).toContain(`${first.participants[2]!.name} мовчить і стає в захист.`);
  });

  it("never reports zero healing when concurrent aid already filled the target", () => {
    const state = proofState(3);
    state.participants[2]!.hp -= 1;
    const resolution = resolveGroupCombatTurn(state, [
      action(state, 0, "aid", "ally", state.participants[2]!.characterId),
      action(state, 1, "aid", "ally", state.participants[2]!.characterId),
      action(state, 2, "guard", "self", state.participants[2]!.characterId)
    ]);

    expect(resolution.state.recap[0]?.lines.join("\n")).not.toContain("+0 HP");
    expect(resolution.state.recap[0]?.lines).toContain(
      `${state.participants[1]!.name} підстраховує ${state.participants[2]!.name}, але лікувати вже нічого.`
    );
  });

  it("keeps a 3x3 twenty-five-turn simulation and terminal payload bounded and rewardless", () => {
    let state = proofState(3, { attack: 1, hp: 93, hpMax: 93 });
    let result = null;
    for (let turn = 1; turn <= 25 && state.status === "active"; turn += 1) {
      const actions = state.participants
        .filter((participant) => participant.hp > 0)
        .map((participant) => buildGroupCombatTimeoutAction(state, participant.characterId));
      const resolution = resolveGroupCombatTurn(state, actions);
      state = resolution.state;
      result = resolution.result;
      expect(state.recap.length).toBeLessThanOrEqual(GROUP_COMBAT_RECAP_LIMIT);
      expect(JSON.stringify(state).length).toBeLessThan(13_000);
    }

    expect(state.status).toBe("lost");
    expect(result).toEqual({
      kind: "rewardless-proof",
      outcome: "lost",
      completedTurn: 25,
      rewards: { xp: 0, gold: 0, items: [] }
    });
    expect(parseGroupCombatResultStrict(result)).toEqual(result);
  });

  it("keeps thirteen simultaneous 3x3 proof states independent and bounded", () => {
    const sessions = Array.from({ length: 13 }, (_, index) => createGroupCombatProofState({
      sessionId: `group-session-${index}`,
      partySessionId: `party-session-${index}`,
      deterministicSeed: index,
      participants: Array.from({ length: 3 }, (__, actorIndex) => participant(actorIndex, {
        hp: 93,
        hpMax: 93,
        attack: 1
      }))
    }));

    for (let turn = 1; turn <= 25; turn += 1) {
      sessions.forEach((state, index) => {
        if (state.status !== "active") {
          return;
        }
        const resolution = resolveGroupCombatTurn(
          state,
          state.participants
            .filter((actor) => actor.hp > 0)
            .map((actor) => buildGroupCombatTimeoutAction(state, actor.characterId))
        );
        sessions[index] = resolution.state;
      });
    }

    expect(sessions.every((state) => state.status === "lost")).toBe(true);
    expect(new Set(sessions.map((state) => state.sessionId)).size).toBe(13);
    expect(Math.max(...sessions.map((state) => JSON.stringify(state).length))).toBeLessThan(13_000);
  });

  it("strictly rejects unknown rules and inconsistent result rewards", () => {
    const state = proofState(2);
    expect(() => parseGroupCombatStateStrict({ ...state, rulesVersion: "future" })).toThrow(GroupCombatStateValidationError);
    expect(() => parseGroupCombatStateStrict({ ...state, participants: [state.participants[0], state.participants[0]] })).toThrow(GroupCombatStateValidationError);
    expect(() => parseGroupCombatResultStrict({
      kind: "rewardless-proof",
      outcome: "won",
      completedTurn: 2,
      rewards: { xp: 1, gold: 0, items: [] }
    })).toThrow(GroupCombatStateValidationError);
  });
});

function proofState(
  count: 2 | 3,
  overrides: Partial<GroupCombatActorSnapshot> = {}
) {
  return createGroupCombatProofState({
    sessionId: "group-session",
    partySessionId: "party-session",
    deterministicSeed: 42,
    participants: Array.from({ length: count }, (_, index) => participant(index, overrides))
  });
}

function participant(index: number, overrides: Partial<GroupCombatActorSnapshot>): GroupCombatActorSnapshot {
  return {
    characterId: `character-${index}`,
    telegramUserId: `${1000 + index}`,
    name: `Пригодник ${index}`,
    remortCount: 0,
    rosterOrder: index,
    hp: 30,
    hpMax: 30,
    mana: 10,
    manaMax: 10,
    attack: 8,
    defense: 2,
    support: 6,
    equipmentItemIds: [`item-${index}`],
    ...overrides
  };
}

function action(
  state: ReturnType<typeof proofState>,
  actorIndex: number,
  key: GroupCombatAction["action"],
  targetKind: GroupCombatAction["targetKind"],
  targetId: string
): GroupCombatAction {
  return {
    actorCharacterId: state.participants[actorIndex]!.characterId,
    turn: state.turn,
    action: key,
    targetKind,
    targetId,
    origin: "manual"
  };
}
