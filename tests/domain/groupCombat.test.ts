import { describe, expect, it } from "vitest";
import {
  buildGroupCombatTimeoutAction,
  buildGroupCombatSettlementPlan,
  buildGroupCombatSettlementReceipt,
  createGroupCombatProofState,
  GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT,
  GROUP_COMBAT_RECAP_LIMIT,
  resolveGroupCombatTurn,
  resolveGroupCombatTargets,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActorSnapshot
} from "../../src/domain/groupCombat/groupCombat";
import {
  GroupCombatStateValidationError,
  parseGroupCombatResultStrict,
  parseGroupCombatSettlementPlanStrict,
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

  it("admits only bounded invalid repair rosters while keeping active and resolved proofs capped at three", () => {
    const base = proofState(2);
    const participants = Array.from(
      { length: GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT },
      (_, index) => participant(index, {})
    );
    const contributions = participants.map((actor) => ({
      characterId: actor.characterId,
      damage: 0,
      healing: 0,
      guardPrevented: 0,
      control: 0,
      damageTaken: 0,
      committedActions: 0,
      guardedTurns: 0
    }));
    const invalid = {
      ...base,
      status: "invalid" as const,
      participants,
      contributions
    };

    expect(parseGroupCombatStateStrict(invalid)).toEqual(invalid);
    expect(parseGroupCombatStateStrict({
      ...invalid,
      participants: invalid.participants.slice(0, 4),
      contributions: invalid.contributions.slice(0, 4)
    }).participants).toHaveLength(4);
    expect(() => parseGroupCombatStateStrict({
      ...invalid,
      participants: [...invalid.participants, participant(GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT, {})],
      contributions: [
        ...invalid.contributions,
        { ...invalid.contributions[0]!, characterId: `character-${GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT}` }
      ]
    })).toThrow(GroupCombatStateValidationError);

    for (const status of ["active", "won", "lost"] as const) {
      expect(() => parseGroupCombatStateStrict({
        ...invalid,
        status,
        participants: invalid.participants.slice(0, 4),
        contributions: invalid.contributions.slice(0, 4),
        enemies: status === "won"
          ? invalid.enemies.map((enemy) => ({ ...enemy, hp: 0 }))
          : invalid.enemies,
        turn: status === "lost" ? 25 : invalid.turn
      })).toThrow(GroupCombatStateValidationError);
    }
    expect(() => createGroupCombatProofState({
      sessionId: "four-player-start",
      partySessionId: "four-player-party",
      deterministicSeed: 42,
      participants: participants.slice(0, 4)
    })).toThrow("Group combat proof requires two or three participants.");

    const fourParticipantInvalid = {
      ...invalid,
      participants: invalid.participants.slice(0, 4),
      contributions: invalid.contributions.slice(0, 4)
    };
    const invalidPlan = buildGroupCombatSettlementPlan(fourParticipantInvalid)!;
    expect(parseGroupCombatSettlementPlanStrict(invalidPlan)).toEqual(invalidPlan);
    expect(() => parseGroupCombatSettlementPlanStrict({ ...invalidPlan, outcome: "won" }))
      .toThrow(GroupCombatStateValidationError);
    expect(() => parseGroupCombatSettlementPlanStrict({ ...invalidPlan, outcome: "lost" }))
      .toThrow(GroupCombatStateValidationError);
  });

  it.each([
    ["Priest", "class", "class.priest", "race.human-ish"],
    ["Bard", "class", "class.bard", "race.human-ish"],
    ["Varenyk-mancer", "class", "class.varenyk-mancer", "race.human-ish"],
    ["Dwarf", "race", "class.warrior", "race.dwarf"],
    ["Domovyk", "race", "class.warrior", "race.domovyk"],
    ["Molfar", "race", "class.warrior", "race.molfar-soul"]
  ] as const)("commits current %s support recipes with an authored effect", (_, actionKey, classId, raceId) => {
    const state = proofState(3);
    state.participants[0]!.classId = classId;
    state.participants[0]!.raceId = raceId;
    state.participants[1]!.hp = 10;
    state.participants[2]!.hp = 10;
    const beforeEnemies = state.enemies.map((enemy) => enemy.hp);
    const supportTarget = classId === "class.varenyk-mancer"
      ? state.participants[1]!.characterId
      : state.participants[0]!.characterId;
    const result = resolveGroupCombatTurn(state, [
      {
        ...action(state, 0, actionKey, supportTarget === state.participants[0]!.characterId ? "self" : "ally", supportTarget)
      },
      action(state, 1, "guard", "self", state.participants[1]!.characterId),
      action(state, 2, "guard", "self", state.participants[2]!.characterId)
    ]);
    const contribution = result.state.contributions[0]!;
    const enemiesChanged = result.state.enemies.some((enemy, index) => enemy.hp < beforeEnemies[index]!);
    const alliesChanged = contribution.healing > 0 || contribution.guardPrevented > 0 || contribution.control > 0;
    expect(enemiesChanged || alliesChanged || contribution.damage > 0).toBe(true);
    expect(contribution.committedActions).toBe(1);
    expect(result.state.participants[0]!.mana).toBeLessThanOrEqual(state.participants[0]!.mana);
  });

  it.each([
    ["class", "class.warrior", "race.human-ish", undefined, "skill.forceful-strike"],
    ["race", "class.warrior", "race.human-ish", undefined, "ability.race.practical-improvisation"],
    ["gear", "class.warrior", "race.human-ish", "gear.red-line-dagger", "gear.red-line-dagger"]
  ] as const)("retargets a committed single-enemy %s action when its authored target dies earlier", (
    actionKey,
    classId,
    raceId,
    payloadKey,
    abilityId
  ) => {
    const state = proofState(2);
    state.enemies[0]!.hp = 1;
    state.enemies[1]!.hp = 30;
    state.enemies[1]!.hpMax = 30;
    state.participants[1]!.classId = classId;
    state.participants[1]!.raceId = raceId;
    state.participants[1]!.gearAbilityIds = payloadKey ? [payloadKey] : [];
    state.participants[1]!.playerAbilityFumbles = {
      version: 1,
      abilities: {
        [abilityId]: { version: 1, cycle: 0, usesInCycle: 0, triggerAt: 93 }
      }
    };
    const committed: GroupCombatAction = {
      ...action(state, 1, actionKey, "enemy", state.enemies[0]!.id),
      ...(payloadKey ? { payloadKey } : {})
    };

    const result = resolveGroupCombatTurn(state, [
      action(state, 0, "attack", "enemy", state.enemies[0]!.id),
      committed
    ]);

    expect(result.state.enemies[0]!.hp).toBe(0);
    expect(result.state.enemies[1]!.hp).toBeLessThan(30);
    expect(result.state.contributions[1]!.damage).toBeGreaterThan(0);
    expect(result.state.participants[1]!.cooldowns?.abilities?.[abilityId]).toBeDefined();
  });

  it("applies strict blessing healing to only the lowest-HP ally and mitigation to every intended ally", () => {
    const state = proofState(3);
    state.participants[0]!.classId = "class.priest";
    state.participants[0]!.threat = 10;
    state.participants[1]!.hp = 1;
    state.participants[1]!.threat = 100;
    state.participants[2]!.hp = 2;
    state.participants[2]!.threat = 50;
    state.enemies.forEach((enemy) => {
      enemy.hp = 93;
      enemy.hpMax = 93;
      enemy.attack = 20;
    });
    const result = resolveGroupCombatTurn(state, [
      action(state, 0, "class", "self", state.participants[0]!.characterId),
      action(state, 1, "attack", "enemy", state.enemies[0]!.id),
      action(state, 2, "attack", "enemy", state.enemies[0]!.id)
    ]);

    expect(result.state.contributions[0]!.healing).toBe(7);
    expect(result.state.contributions[0]!.guardPrevented).toBe(3);
    expect(result.state.contributions[0]!.control).toBe(6);
    expect(result.state.participants[1]!.hp).toBe(0);
    expect(result.state.participants[2]!.hp).toBe(0);
    expect(result.state.participants[0]!.hp).toBe(15);
  });

  it.each(["guard", "aid", "item"] as const)("ticks ability cooldowns after a committed %s action", (actionKey) => {
    const state = proofState(2);
    const actor = state.participants[0]!;
    actor.cooldowns = {
      abilities: {
        "skill.forceful-strike": { id: "skill.forceful-strike", remainingTurns: 3 }
      }
    };
    state.participants[1]!.hp -= 1;
    if (actionKey === "item") {
      actor.hp -= 7;
      actor.combatItemQuantities = { "item.responsible-panic-bandage": 1 };
    }
    const committed: GroupCombatAction = actionKey === "guard"
      ? action(state, 0, "guard", "self", actor.characterId)
      : actionKey === "aid"
        ? action(state, 0, "aid", "ally", state.participants[1]!.characterId)
        : {
            ...action(state, 0, "item", "self", actor.characterId),
            payloadKey: "item.responsible-panic-bandage"
          };
    const result = resolveGroupCombatTurn(state, [
      committed,
      action(state, 1, "guard", "self", state.participants[1]!.characterId)
    ]);

    expect(result.state.participants[0]!.cooldowns?.abilities?.["skill.forceful-strike"]?.remainingTurns).toBe(2);
  });

  it("resolves lowest-HP ties by roster order and excludes dead allies", () => {
    const state = proofState(3);
    state.participants[0]!.hp = 0;
    state.participants[1]!.hp = 10;
    state.participants[2]!.hp = 10;
    expect(resolveGroupCombatTargets(
      state,
      state.participants[2]!.characterId,
      "lowest-hp-ally"
    )).toEqual([state.participants[1]!.characterId]);
  });

  it("creates immutable zero-reward participant receipts from the terminal plan", () => {
    const state = proofState(2);
    state.enemies.forEach((enemy) => { enemy.hp = 1; });
    const resolved = resolveGroupCombatTurn(state, [
      action(state, 0, "attack", "enemy", state.enemies[0]!.id),
      action(state, 1, "attack", "enemy", state.enemies[1]!.id)
    ]);
    expect(resolved.settlementPlan).not.toBeNull();
    const plan = structuredClone(resolved.settlementPlan!);
    const receipt = buildGroupCombatSettlementReceipt(plan, state.participants[1]!.characterId);
    expect(receipt?.rewards).toEqual({ xp: 0, gold: 0, items: [] });
    expect(resolved.settlementPlan).toEqual(plan);
  });

  it("commits supported gear and item payloads exactly once in deterministic state", () => {
    const gearState = proofState(2);
    gearState.participants[0]!.gearAbilityIds = ["gear.barrel-counter-shield"];
    const gearAction: GroupCombatAction = {
      ...action(gearState, 0, "gear", "self", gearState.participants[0]!.characterId),
      payloadKey: "gear.barrel-counter-shield"
    };
    expect(validateGroupCombatAction(gearState, gearAction)).toBe("ok");
    const geared = resolveGroupCombatTurn(gearState, [
      gearAction,
      action(gearState, 1, "guard", "self", gearState.participants[1]!.characterId)
    ]);
    expect(geared.state.participants[0]!.cooldowns?.abilities?.["gear.barrel-counter-shield"]).toBeDefined();

    const itemState = proofState(2);
    itemState.participants[0]!.hp = 10;
    itemState.participants[0]!.combatItemQuantities = { "item.responsible-panic-bandage": 1 };
    const itemAction: GroupCombatAction = {
      ...action(itemState, 0, "item", "self", itemState.participants[0]!.characterId),
      payloadKey: "item.responsible-panic-bandage"
    };
    const used = resolveGroupCombatTurn(itemState, [
      itemAction,
      action(itemState, 1, "guard", "self", itemState.participants[1]!.characterId)
    ]);
    expect(used.committedConsumables).toEqual([{
      characterId: itemState.participants[0]!.characterId,
      itemId: "item.responsible-panic-bandage"
    }]);
    expect(used.state.participants[0]!.combatItemQuantities).toEqual({});
    expect(used.state.contributions[0]!.healing).toBe(7);
  });

  it("preserves dense-bandage five-own-action cooldown and field-kit once-per-fight state", () => {
    let dense = proofState(2, { hp: 93, hpMax: 93, attack: 1, defense: 20 });
    dense.enemies.forEach((enemy) => {
      enemy.hp = 93;
      enemy.hpMax = 93;
      enemy.attack = 1;
    });
    dense.participants[0]!.hp = 30;
    dense.participants[0]!.combatItemQuantities = { "item.dense-bandage": 2 };
    let denseResolution = resolveGroupCombatTurn(dense, [
      { ...action(dense, 0, "item", "self", dense.participants[0]!.characterId), payloadKey: "item.dense-bandage" },
      action(dense, 1, "guard", "self", dense.participants[1]!.characterId)
    ]);
    dense = denseResolution.state;
    expect(dense.participants[0]!.combatItems?.cooldowns?.["item.dense-bandage"]?.remainingTurns).toBe(5);
    for (let ownAction = 1; ownAction <= 5; ownAction += 1) {
      denseResolution = resolveGroupCombatTurn(dense, dense.participants.map((actor) =>
        action(dense, actor.rosterOrder, "guard", "self", actor.characterId)
      ));
      dense = denseResolution.state;
      expect(dense.participants[0]!.combatItems?.cooldowns?.["item.dense-bandage"]?.remainingTurns)
        .toBe(ownAction < 5 ? 5 - ownAction : undefined);
    }
    dense.participants[0]!.hp -= 1;
    expect(validateGroupCombatAction(dense, {
      ...action(dense, 0, "item", "self", dense.participants[0]!.characterId),
      payloadKey: "item.dense-bandage"
    })).toBe("ok");

    const fieldKit = proofState(2, { hp: 93, hpMax: 93, defense: 20 });
    fieldKit.participants[0]!.hp = 30;
    fieldKit.participants[0]!.combatItemQuantities = { "item.field-kit": 2 };
    const fieldKitResolution = resolveGroupCombatTurn(fieldKit, [
      { ...action(fieldKit, 0, "item", "self", fieldKit.participants[0]!.characterId), payloadKey: "item.field-kit" },
      action(fieldKit, 1, "guard", "self", fieldKit.participants[1]!.characterId)
    ]);
    expect(fieldKitResolution.state.participants[0]!.combatItems?.uses?.["item.field-kit"]).toEqual({
      itemId: "item.field-kit",
      count: 1
    });
    expect(validateGroupCombatAction(fieldKitResolution.state, {
      ...action(
        fieldKitResolution.state,
        0,
        "item",
        "self",
        fieldKitResolution.state.participants[0]!.characterId
      ),
      payloadKey: "item.field-kit"
    })).toBe("action-unavailable");
    const healthyFieldKit = proofState(2, { hp: 93, hpMax: 93 });
    healthyFieldKit.participants[0]!.hp = 87;
    healthyFieldKit.participants[0]!.combatItemQuantities = { "item.field-kit": 1 };
    expect(validateGroupCombatAction(healthyFieldKit, {
      ...action(healthyFieldKit, 0, "item", "self", healthyFieldKit.participants[0]!.characterId),
      payloadKey: "item.field-kit"
    })).toBe("action-unavailable");
  });

  it("retargets after multiple enemy deaths and never lets AI target a dead participant", () => {
    const victory = proofState(2);
    victory.enemies.forEach((enemy) => { enemy.hp = 1; });
    const won = resolveGroupCombatTurn(victory, [
      action(victory, 0, "attack", "enemy", victory.enemies[0]!.id),
      action(victory, 1, "attack", "enemy", victory.enemies[0]!.id)
    ]);
    expect(won.state.status).toBe("won");
    expect(won.state.enemies.every((enemy) => enemy.hp === 0)).toBe(true);

    const loss = proofState(3);
    loss.participants[0]!.hp = 1;
    loss.participants[0]!.threat = 100;
    loss.enemies.forEach((enemy) => { enemy.attack = 13; });
    const defended = resolveGroupCombatTurn(loss, loss.participants.map((actor) =>
      action(loss, actor.rosterOrder, "guard", "self", actor.characterId)
    ));
    expect(defended.state.participants[0]!.hp).toBe(0);
    expect(defended.state.contributions[0]!.damageTaken).toBe(1);
    expect(defended.state.contributions.slice(1).some((row) => row.damageTaken > 0)).toBe(true);
  });

  it("wins at the turn cap when a counter kills the final enemy", () => {
    const state = proofState(2);
    state.turn = 25;
    state.participants[0]!.raceId = "race.molfar-soul";
    state.participants[0]!.threat = 100;
    state.enemies[0]!.hp = 1;
    state.enemies[0]!.attack = 20;
    state.enemies[1]!.hp = 0;
    const resolved = resolveGroupCombatTurn(state, [
      action(state, 0, "race", "self", state.participants[0]!.characterId),
      action(state, 1, "guard", "self", state.participants[1]!.characterId)
    ]);

    expect(resolved.state.status).toBe("won");
    expect(resolved.result?.outcome).toBe("won");
    expect(resolved.result?.completedTurn).toBe(25);
    expect(resolved.state.enemies[0]!.hp).toBe(0);
  });

  it("rejects unavailable abilities and commits a deterministic support fumble without support effects", () => {
    const unavailable = proofState(2);
    unavailable.participants[0]!.classId = "class.priest";
    unavailable.participants[0]!.mana = 0;
    const unavailableAction = action(
      unavailable,
      0,
      "class",
      "self",
      unavailable.participants[0]!.characterId
    );
    expect(validateGroupCombatAction(unavailable, unavailableAction)).toBe("action-unavailable");

    const fumble = proofState(2);
    fumble.participants[0]!.classId = "class.priest";
    fumble.participants[1]!.hp = 5;
    fumble.participants[0]!.playerAbilityFumbles = {
      version: 1,
      abilities: {
        "skill.strict-blessing": { version: 1, cycle: 0, usesInCycle: 0, triggerAt: 1 }
      }
    };
    const resolved = resolveGroupCombatTurn(fumble, [
      action(fumble, 0, "class", "self", fumble.participants[0]!.characterId),
      action(fumble, 1, "guard", "self", fumble.participants[1]!.characterId)
    ]);
    expect(resolved.state.contributions[0]!.healing).toBe(0);
    expect(resolved.state.contributions[0]!.committedActions).toBe(1);
    expect(resolved.state.recap[0]!.lines.join("\n")).toContain("Благословення перечитало адресата");
  });

  it("strictly rejects malformed and foreign status targets", () => {
    const state = proofState(2);
    expect(() => parseGroupCombatStateStrict({
      ...state,
      statuses: [{
        id: "foreign",
        kind: "bleed",
        sourceCharacterId: state.participants[0]!.characterId,
        targetKind: "participant",
        targetId: "missing",
        value: 1,
        remainingTurns: 1
      }]
    })).toThrow(GroupCombatStateValidationError);
    const itemState = proofState(2);
    itemState.participants[0]!.combatItems = {
      cooldowns: {
        "item.dense-bandage": { itemId: "item.dense-bandage", remainingTurns: 5 }
      },
      uses: {
        "item.field-kit": { itemId: "item.field-kit", count: 1 }
      }
    };
    expect(parseGroupCombatStateStrict(itemState)).toEqual(itemState);
    expect(() => parseGroupCombatStateStrict({
      ...itemState,
      participants: itemState.participants.map((participant, index) => index === 0
        ? {
            ...participant,
            combatItems: {
              uses: {
                "item.field-kit": { itemId: "item.field-kit", count: 2 }
              }
            }
          }
        : participant)
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
    classId: "class.warrior",
    raceId: "race.human-ish",
    level: 13,
    stats: { strength: 13, dexterity: 8, intelligence: 8, charisma: 8, luck: 8 },
    equipmentItemIds: [`item-${index}`],
    gearAbilityIds: [],
    combatItemQuantities: {},
    threat: 0,
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
