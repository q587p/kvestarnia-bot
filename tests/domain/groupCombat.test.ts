import { describe, expect, it, vi } from "vitest";
import {
  buildGroupCombatTimeoutAction,
  buildGroupCombatSettlementPlan,
  buildGroupCombatSettlementReceipt,
  buildLeftPassageEncounterLootRewards,
  buildLeftPassageEncounterRewardBudget,
  createGroupCombatProofState,
  createLeftPassageGroupCombatState,
  deriveLeftPassageEnemyCount,
  deriveGroupCombatLockedAbilityId,
  getEffectiveGroupCombatAbilityManaCost,
  getGroupCombatActionProfile,
  getLeftPassageEnemyLootDropChanceMultiplier,
  getLeftPassageTierTwoDiscoveryMinutes,
  GROUP_COMBAT_CANONICAL_ENEMY_DAMAGE_ABILITY_IDS,
  GROUP_COMBAT_LOSS_REWARD_POLICY,
  GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT,
  GROUP_COMBAT_RECAP_LIMIT,
  GROUP_COMBAT_STATE_BYTE_LIMIT,
  GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS,
  assertGroupCombatMonsterAbilityExecutionContract,
  applyGroupCombatEnemyDamage,
  isSupportedGroupCombatMonsterAbility,
  resolveGroupCombatTurn,
  resolveGroupCombatTargets,
  selectGroupCombatLootVersionOneCandidate,
  selectGroupCombatLootVersionOneCandidates,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActorSnapshot
} from "../../src/domain/groupCombat/groupCombat";
import { PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT } from "../../src/services/presenceService";
import { items, monsters } from "../../src/content";
import { monsterLoot } from "../../src/content/monsterFlavor";
import { lootExpansionV1Data } from "../../src/content/lootExpansionV1Data";
import { classAbilities, raceAbilities } from "../../src/content/playerAbilities";
import { monsterAbilities } from "../../src/content/monsterAbilities";
import { getMonsterAbilityParameterCoverage } from "../../src/domain/combat/monsterAbilityRuntime";
import {
  mantokAbilityGrantDefinitions,
  type MantokAbilityGrantDefinition
} from "../../src/content/mantokAbilityGrants";
import * as lootDomain from "../../src/domain/loot";
import type { CombatSkillProfile } from "../../src/domain/combat";
import { GROUP_COMBAT_PRODUCTION_V1_CATALOG } from "../../src/domain/groupCombat/groupCombatProductionV1Catalog";
import {
  deriveGroupCombatProductionV1MonsterStats,
  findGroupCombatProductionV1Monster,
  getGroupCombatProductionV1BackupEffectiveLevel,
  getGroupCombatProductionV1LootCandidates,
  resolveGroupCombatProductionV1MonsterAbilities,
  selectGroupCombatProductionV1BackupMonster
} from "../../src/domain/groupCombat/groupCombatProductionV1Resolver";
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
import { buildBaselinePersistentFightWinXp } from "../../src/domain/combat/combatRewards";

describe("group combat proof reducer", () => {
  it("keeps the tier-two discovery window deterministic inside 13–23 minutes", () => {
    const values = Array.from({ length: 42 }, (_, seed) =>
      getLeftPassageTierTwoDiscoveryMinutes(seed)
    );

    expect(Math.min(...values)).toBe(13);
    expect(Math.max(...values)).toBe(23);
    expect(getLeftPassageTierTwoDiscoveryMinutes(587)).toBe(17);
  });

  it("registers the group owner and repair boundary as remort-blocking", () => {
    expect(getCombatLeaseOwnerDescriptor(GROUP_COMBAT_LEASE_KIND)).toEqual({
      kind: "group-combat",
      owner: "group-combat",
      repairOwner: "group-combat",
      remortPolicy: "block"
    });
  });

  it("freezes production difficulty and rewards only meaningful participants from one neutral pool", () => {
    const state = leftPassageState();
    state.status = "won";
    state.turn = 4;
    state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    state.participants[0]!.hp = 17;
    state.participants[0]!.mana = 3;
    state.contributions[0]!.committedActions = 2;
    const plan = buildGroupCombatSettlementPlan(state)!;
    const expectedLoot = buildLeftPassageEncounterLootRewards(
      state,
      [state.participants[0]!]
    );

    expect(plan.policy).toBe("left-passage-party");
    expect(plan.participants[0]?.resources).toEqual({ hp: 17, mana: 3 });
    expect(plan.participants[0]?.rewards).toEqual({
      xp: state.production!.rewards.winXpTotal,
      gold: state.production!.rewards.winGoldTotal,
      items: expectedLoot.get(state.participants[0]!.characterId) ?? []
    });
    expect(plan.participants[1]?.rewards).toEqual({ xp: 0, gold: 0, items: [] });
    expect(plan.participants[0]?.effects?.activityKey).toBe("group-combat:group-session:activity");
    expect(plan.participants[1]?.effects?.activityKey).toBeNull();
    expect(buildGroupCombatSettlementReceipt(plan, "character-0")).toEqual(expect.objectContaining({
      policy: "left-passage-party",
      resources: { hp: 17, mana: 3 }
    }));
    expect(parseGroupCombatSettlementPlanStrict(plan)).toEqual(plan);
    expect(parseGroupCombatStateStrict(state)).toEqual(state);
  });

  it("keeps the same encounter-wide reward budget for a strict 3x3 production state", () => {
    const state = leftPassageState(3);
    state.status = "won";
    state.turn = 5;
    state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    state.contributions.forEach((contribution) => {
      contribution.committedActions = 1;
    });

    const plan = buildGroupCombatSettlementPlan(state)!;
    const expectedLoot = buildLeftPassageEncounterLootRewards(
      state,
      state.participants
    );
    expect(state.participants).toHaveLength(3);
    expect(state.enemies).toHaveLength(3);
    expect(plan.participants.reduce((sum, row) => sum + row.rewards.xp, 0))
      .toBe(state.production!.rewards.winXpTotal);
    expect(plan.participants.reduce((sum, row) => sum + row.rewards.gold, 0))
      .toBe(state.production!.rewards.winGoldTotal);
    expect(plan.participants.flatMap((row) => row.rewards.items)).toEqual(
      plan.participants.flatMap((row) =>
        expectedLoot.get(row.characterId) ?? []
      )
    );
    expect(buildGroupCombatSettlementPlan(structuredClone(state))).toEqual(plan);
    expect(parseGroupCombatStateStrict(state)).toEqual(state);
  });

  it("rolls per-enemy authored and expansion manatky, including rare Iskrokamin replacement", () => {
    const seen = new Set<string>();

    for (let seed = 0; seed < 23; seed += 1) {
      const candidate = leftPassageState(3, true, {}, `loot-contract-${seed}`);
      candidate.status = "won";
      candidate.turn = 5;
      candidate.enemies.forEach((enemy) => {
        enemy.hp = 0;
      });
      candidate.contributions.forEach((contribution) => {
        contribution.committedActions = 1;
      });
      for (const rewards of buildLeftPassageEncounterLootRewards(
        candidate,
        candidate.participants
      ).values()) {
        rewards.forEach((item) => seen.add(item.itemId));
      }
    }

    expect(seen).toContain("item.iskrokamin");
    expect([...seen].some((itemId) => itemId.startsWith("item.loot-v1-"))).toBe(true);
    expect([...seen].some((itemId) => itemId !== "item.iskrokamin")).toBe(true);
  });

  it.each([
    undefined,
    "Туманник",
    "Куплетник",
    "Начинковий пророк",
    "Формулярник"
  ])("keeps cosmetic title %s presentation-only for v1 loot and settlement", (title) => {
    const baseline = leftPassageState(2, false);
    const titled = leftPassageState(
      2,
      false,
      title ? { activeCosmeticTitle: title } : {}
    );
    for (const state of [baseline, titled]) {
      state.status = "won";
      state.turn = 4;
      state.enemies.forEach((enemy) => {
        enemy.hp = 0;
      });
      state.contributions.forEach((contribution) => {
        contribution.committedActions = 1;
      });
    }

    expect(titled.participants[0]?.activeCosmeticTitle).toBe(title);
    expect(titled.production?.rewards.lootSnapshot)
      .toEqual(baseline.production?.rewards.lootSnapshot);
    expect(buildLeftPassageEncounterLootRewards(titled, titled.participants))
      .toEqual(buildLeftPassageEncounterLootRewards(baseline, baseline.participants));
    expect(buildGroupCombatSettlementPlan(titled))
      .toEqual(buildGroupCombatSettlementPlan(baseline));
  });

  it("keeps active v1 loot and terminal plans invariant under catalog and generic-algorithm drift", () => {
    const active = leftPassageState(3, true);
    const terminal = structuredClone(active);
    terminal.status = "won";
    terminal.turn = 5;
    terminal.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    terminal.contributions.forEach((contribution) => {
      contribution.committedActions = 1;
    });
    const expectedPlan = buildGroupCombatSettlementPlan(terminal);
    const itemCatalog = [...items];
    const lootCatalog = structuredClone(monsterLoot);
    const genericRoll = vi.spyOn(lootDomain, "rollMonsterLoot");

    try {
      items.splice(0, items.length);
      for (const key of Object.keys(monsterLoot)) {
        delete monsterLoot[key];
      }
      genericRoll.mockImplementation(() => {
        throw new Error("future generic loot algorithm must not run");
      });
      genericRoll.mockClear();

      const replayedTerminal = structuredClone(active);
      replayedTerminal.status = "won";
      replayedTerminal.turn = 5;
      replayedTerminal.enemies.forEach((enemy) => {
        enemy.hp = 0;
      });
      replayedTerminal.contributions.forEach((contribution) => {
        contribution.committedActions = 1;
      });
      expect(buildGroupCombatSettlementPlan(replayedTerminal)).toEqual(expectedPlan);
      expect(buildGroupCombatSettlementPlan(terminal)).toEqual(expectedPlan);
      expect(genericRoll).not.toHaveBeenCalled();
    } finally {
      genericRoll.mockRestore();
      items.splice(0, items.length, ...itemCatalog);
      for (const key of Object.keys(monsterLoot)) {
        delete monsterLoot[key];
      }
      Object.assign(monsterLoot, lootCatalog);
    }
  });

  it("matches every released v1 direct-loot and expansion candidate boundary", () => {
    const eligibilityProfiles = [
      { classId: "class.unknown", raceId: "race.unknown" },
      ...lootExpansionV1Data.classes.map((classEntry) => ({
        classId: `class.${classEntry.id}`,
        raceId: "race.unknown"
      })),
      ...lootExpansionV1Data.races.map((raceEntry) => ({
        classId: "class.unknown",
        raceId: `race.${raceEntry.id}`
      }))
    ];
    const affinityProfiles = lootExpansionV1Data.classes.flatMap((classEntry) =>
      lootExpansionV1Data.races.map((raceEntry) => ({
        classId: `class.${classEntry.id}`,
        raceId: `race.${raceEntry.id}`
      }))
    );
    const sourceMonsters = [...new Map(monsters.map((monster) => [
      getTestLootExpansionSource(monster.level, monster.tags),
      monster
    ])).values()];
    const affinityMonster = monsters.find((monster) =>
      getTestLootExpansionSource(monster.level, monster.tags) ===
        "bureaucracy_wing"
    )!;
    const cases = [
      ...monsters.map((monster) => ({
        monster,
        level: 23,
        classId: "class.unknown",
        raceId: "race.unknown"
      })),
      ...sourceMonsters.flatMap((monster) =>
        [1, 3, 6, 10, 14, 18, 23].map((level) => ({
          monster,
          level,
          classId: "class.unknown",
          raceId: "race.unknown"
        }))
      ),
      ...[1, 3, 6, 10, 14, 18, 23].flatMap((level) =>
        eligibilityProfiles.map((profile) => ({
          monster: affinityMonster,
          level,
          ...profile
        }))
      ),
      ...affinityProfiles.map((profile) => ({
        monster: affinityMonster,
        level: 23,
        ...profile
      }))
    ];

    for (const fixture of cases) {
      const sourceId = getTestLootExpansionSource(
        fixture.monster.level,
        fixture.monster.tags
      );
      const expected = [
        ...lootDomain.getLootCandidates({
          monsterId: fixture.monster.id,
          monsterLoot,
          items
        }),
        ...lootDomain.getLootExpansionCandidates({
          profile: {
            level: fixture.level,
            classId: fixture.classId,
            raceId: fixture.raceId
          },
          sourceId,
          sourceTags: fixture.monster.tags
        })
      ].map((candidate) => ({
        itemId: candidate.item.id,
        rarity: candidate.rarity,
        weight: candidate.weight ?? 1
      }));
      const actual = getGroupCombatProductionV1LootCandidates({
        monsterId: fixture.monster.id,
        participantLevel: fixture.level,
        classId: fixture.classId,
        raceId: fixture.raceId
      });
      expect(actual.map(({ itemId, rarity }) => ({ itemId, rarity })))
        .toEqual(expected.map(({ itemId, rarity }) => ({ itemId, rarity })));
      actual.forEach((candidate, index) => {
        expect(candidate.weight).toBeCloseTo(expected[index]!.weight, 12);
      });
    }
  });

  it("keeps every released x025 variant epic and deterministically selectable", () => {
    const candidates = getGroupCombatProductionV1LootCandidates({
      monsterId: "monster.spreadsheet-goblin",
      participantLevel: 23,
      classId: "class.warrior",
      raceId: "race.bisyny"
    });
    const epic = selectGroupCombatLootVersionOneCandidates(candidates, "epic");
    const x025 = epic.filter((candidate) =>
      candidate.itemId === "item.loot-v1-x025" ||
      candidate.itemId.startsWith("item.loot-v1-x025-plus-")
    );

    expect(x025.map((candidate) => candidate.itemId)).toEqual([
      "item.loot-v1-x025",
      "item.loot-v1-x025-plus-1",
      "item.loot-v1-x025-plus-2",
      "item.loot-v1-x025-plus-3",
      "item.loot-v1-x025-plus-4",
      "item.loot-v1-x025-plus-5"
    ]);
    expect(x025.every((candidate) => candidate.rarity === "epic")).toBe(true);
    const totalWeight = epic.reduce((sum, candidate) => sum + candidate.weight, 0);
    for (const target of x025) {
      const targetIndex = epic.indexOf(target);
      const weightBefore = epic
        .slice(0, targetIndex)
        .reduce((sum, candidate) => sum + candidate.weight, 0);
      const nextFloat = () =>
        (weightBefore + target.weight / 2) / totalWeight;
      expect(
        selectGroupCombatLootVersionOneCandidate(epic, { nextFloat })
      ).toBe(target);
    }
  });

  it("gates expansion loot by the frozen participant level, independently of enemy pressure", () => {
    const levelThirteen = getGroupCombatProductionV1LootCandidates({
      monsterId: "monster.spreadsheet-goblin",
      participantLevel: 13,
      classId: "class.warrior",
      raceId: "race.bisyny"
    });
    const levelTwentyThree = getGroupCombatProductionV1LootCandidates({
      monsterId: "monster.spreadsheet-goblin",
      participantLevel: 23,
      classId: "class.warrior",
      raceId: "race.bisyny"
    });

    expect(levelThirteen.some(({ itemId }) => itemId.includes("loot-v1-x025"))).toBe(false);
    expect(levelTwentyThree.some(({ itemId }) => itemId === "item.loot-v1-x025")).toBe(true);
  });

  it("adds independent enemy opportunities and scales each broad-loot chance by enemy level", () => {
    const state = leftPassageState(3, true);
    state.status = "won";
    const eligible = [state.participants[0]!];
    const oneEnemy = structuredClone(state);
    oneEnemy.enemies = oneEnemy.enemies.slice(0, 1);
    const oneRewards = buildLeftPassageEncounterLootRewards(oneEnemy, eligible);
    const allRewards = buildLeftPassageEncounterLootRewards(state, eligible);
    const quantity = (rewards: Map<string, Array<{ quantity: number }>>) =>
      [...rewards.values()].flat().reduce((sum, item) => sum + item.quantity, 0);

    expect(quantity(allRewards)).toBeGreaterThanOrEqual(quantity(oneRewards));
    expect(getLeftPassageEnemyLootDropChanceMultiplier({
      effectiveEnemyLevel: 3,
      participantLevel: 8
    })).toBe(0.75);
    expect(getLeftPassageEnemyLootDropChanceMultiplier({
      effectiveEnemyLevel: 8,
      participantLevel: 8
    })).toBe(1);
    expect(getLeftPassageEnemyLootDropChanceMultiplier({
      effectiveEnemyLevel: 18,
      participantLevel: 8
    })).toBe(1.5);
  });

  it("derives one to six enemies from party size and frozen participant power", () => {
    const baseParticipants = [0, 1, 2].map((index) => participant(index, { level: 4 }));
    const baseThreat = baseParticipants.map((entry) => ({
      characterId: entry.characterId,
      rosterOrder: entry.rosterOrder,
      remortCount: entry.remortCount,
      decision: {
        enemyCount: 1 as const,
        reason: "base" as const,
        eligibleWins: 0,
        secondEnemyLevelBonus: 0
      }
    }));

    expect(deriveLeftPassageEnemyCount({
      participants: baseParticipants.slice(0, 1),
      threatParticipants: baseThreat.slice(0, 1),
      primaryEffectiveMonsterLevel: 4
    })).toBe(1);
    expect(deriveLeftPassageEnemyCount({
      participants: baseParticipants.slice(0, 2),
      threatParticipants: baseThreat.slice(0, 2),
      primaryEffectiveMonsterLevel: 4
    })).toBe(2);
    expect(deriveLeftPassageEnemyCount({
      participants: baseParticipants.map((entry) => ({ ...entry, level: 7 })),
      threatParticipants: baseThreat,
      primaryEffectiveMonsterLevel: 4
    })).toBe(6);
    expect(deriveLeftPassageEnemyCount({
      participants: [
        { ...baseParticipants[0]!, remortCount: 1 },
        baseParticipants[1]!,
        baseParticipants[2]!
      ],
      threatParticipants: baseThreat.map((entry, index) => index === 1
        ? {
            ...entry,
            decision: {
              enemyCount: 2 as const,
              reason: "ordinary-win-streak" as const,
              eligibleWins: 3,
              secondEnemyLevelBonus: 1
            }
          }
        : entry),
      primaryEffectiveMonsterLevel: 4
    })).toBe(5);
  });

  it("strictly accepts production fights from solo 1x1 through strong-party 3x6", () => {
    const solo = leftPassageState(1);
    const strongParty = leftPassageState(3, true);

    expect(solo.participants).toHaveLength(1);
    expect(solo.enemies).toHaveLength(1);
    expect(strongParty.participants).toHaveLength(3);
    expect(strongParty.enemies).toHaveLength(6);
    expect(parseGroupCombatStateStrict(solo)).toEqual(solo);
    expect(parseGroupCombatStateStrict(strongParty)).toEqual(strongParty);
  });

  it("keeps timeout guards out of manual participation and every production reward", () => {
    const state = leftPassageState();
    const resolved = resolveGroupCombatTurn(state, []);

    expect(resolved.state.contributions.map((row) => ({
      committedActions: row.committedActions,
      guardedTurns: row.guardedTurns
    }))).toEqual([
      { committedActions: 0, guardedTurns: 1 },
      { committedActions: 0, guardedTurns: 1 }
    ]);

    resolved.state.status = "won";
    resolved.state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    const plan = buildGroupCombatSettlementPlan(resolved.state)!;
    expect(plan.participants.map((row) => row.rewards)).toEqual([
      { xp: 0, gold: 0, items: [] },
      { xp: 0, gold: 0, items: [] }
    ]);
    expect(plan.participants.every((row) => row.effects?.activityKey === null)).toBe(true);
    expect(plan.participants.map((row) =>
      buildGroupCombatSettlementReceipt(plan, row.characterId)?.manualParticipation
    )).toEqual([false, false]);
  });

  it("rewards only the manual participant in a mixed manual and timeout turn", () => {
    const state = leftPassageState();
    const manual = state.participants[0]!;
    const resolved = resolveGroupCombatTurn(state, [{
      actorCharacterId: manual.characterId,
      turn: state.turn,
      action: "guard",
      targetKind: "self",
      targetId: manual.characterId,
      origin: "manual"
    }]);

    resolved.state.status = "won";
    resolved.state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    const plan = buildGroupCombatSettlementPlan(resolved.state)!;
    expect(plan.participants[0]!.rewards.xp).toBeGreaterThan(0);
    expect(plan.participants[0]!.rewards.gold).toBeGreaterThan(0);
    expect(plan.participants[1]!.rewards).toEqual({ xp: 0, gold: 0, items: [] });
    expect(plan.participants[0]!.effects?.activityKey).not.toBeNull();
    expect(plan.participants[1]!.effects?.activityKey).toBeNull();
  });

  it("rolls each participant flee independently and excludes only the successful escape from rewards", () => {
    const state = leftPassageState(3);
    state.deterministicSeed = 1;
    state.participants[0]!.combatItemQuantities["item.responsible-panic-bandage"] = 1;
    state.participants[1]!.combatItemQuantities["item.responsible-panic-bandage"] = 1;
    const resourcesBefore = state.participants.slice(0, 2).map((participant) => ({
      mana: participant.mana,
      items: { ...participant.combatItemQuantities }
    }));
    const resolved = resolveGroupCombatTurn(state, [
      action(state, 0, "flee", "self", state.participants[0]!.characterId),
      action(state, 1, "flee", "self", state.participants[1]!.characterId),
      action(state, 2, "guard", "self", state.participants[2]!.characterId)
    ]);

    expect(resolved.state.status).toBe("active");
    expect(resolved.state.participants.slice(0, 2).map((participant) => participant.fleeAttempts))
      .toEqual([1, 1]);
    const escaped = resolved.state.participants.find(
      (participant) => participant.fledAtTurn !== undefined
    )!;
    const remaining = resolved.state.participants.filter(
      (participant) => participant.fledAtTurn === undefined
    );
    expect(escaped.hp).toBeGreaterThan(0);
    expect(resolved.committedConsumables).toEqual([]);
    expect(resolved.state.participants.slice(0, 2).map((participant) => ({
      mana: participant.mana,
      items: participant.combatItemQuantities
    }))).toEqual(resourcesBefore);

    resolved.state.status = "won";
    resolved.state.enemies.forEach((enemy) => {
      enemy.hp = 0;
    });
    const plan = buildGroupCombatSettlementPlan(resolved.state)!;
    const escapedPlan = plan.participants.find(
      (participant) => participant.characterId === escaped.characterId
    )!;
    expect(escapedPlan.rewards).toEqual({ xp: 0, gold: 0, items: [] });
    expect(escapedPlan.manualParticipation).toBe(false);
    expect(remaining.every((participant) =>
      plan.participants.find((row) => row.characterId === participant.characterId)!.rewards.xp > 0
    )).toBe(true);
  });

  it("counts failed flee attempts separately without turning them into guard", () => {
    const state = leftPassageState();
    state.deterministicSeed = 0;
    const first = resolveGroupCombatTurn(state, [
      action(state, 0, "flee", "self", state.participants[0]!.characterId),
      action(state, 1, "guard", "self", state.participants[1]!.characterId)
    ]);
    const fleeing = first.state.participants[0]!;

    expect(fleeing.fleeAttempts).toBe(1);
    expect(first.state.contributions[0]!.guardedTurns).toBe(0);
    expect(first.state.recap.at(-1)?.lines).toContain(
      `${fleeing.name} пробує відступити, але Лівий прохід не відпускає. Спроба 1.`
    );

    const second = resolveGroupCombatTurn(first.state, [
      action(first.state, 0, "flee", "self", fleeing.characterId),
      action(first.state, 1, "guard", "self", first.state.participants[1]!.characterId)
    ]);
    expect(second.state.participants[0]!.fleeAttempts).toBe(2);
  });

  it("rewards every accepted manual action when the first actor kills the final enemy", () => {
    const state = leftPassageState(3);
    state.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    state.enemies[0]!.hp = 1;
    state.participants[1]!.mana = 10;
    state.participants[2]!.hp -= 5;
    state.participants[2]!.combatItemQuantities["item.responsible-panic-bandage"] = 1;
    const skippedAbilityMana = state.participants[1]!.mana;
    const skippedItemHp = state.participants[2]!.hp;
    const actions: GroupCombatAction[] = [
      action(state, 0, "attack", "enemy", state.enemies[0]!.id),
      action(state, 1, "class", "enemy", state.enemies[0]!.id),
      {
        ...action(
          state,
          2,
          "item",
          "self",
          state.participants[2]!.characterId
        ),
        payloadKey: "item.responsible-panic-bandage"
      }
    ];
    const resolved = resolveGroupCombatTurn(state, actions);
    const plan = resolved.settlementPlan!;

    expect(resolved.state.status).toBe("won");
    expect(resolved.state.contributions.map((row) => row.committedActions)).toEqual([1, 1, 1]);
    expect(plan.participants.every((row) =>
      row.rewards.xp > 0 &&
      buildGroupCombatSettlementReceipt(plan, row.characterId)?.manualParticipation
    )).toBe(true);
    expect(plan.participants.filter((row) => row.effects?.activityKey)).toHaveLength(1);
    expect(plan.participants.reduce((sum, row) => sum + row.rewards.xp, 0)).toBe(
      state.production!.rewards.winXpTotal
    );
    expect(plan.participants.reduce((sum, row) => sum + row.rewards.gold, 0)).toBe(
      state.production!.rewards.winGoldTotal
    );
    expect(resolved.state.participants[1]!.mana).toBe(skippedAbilityMana);
    expect(resolved.state.participants[1]!.cooldowns).toBeUndefined();
    expect(resolved.state.participants[2]!.hp).toBe(skippedItemHp);
    expect(resolved.state.participants[2]!.combatItemQuantities).toEqual({
      "item.responsible-panic-bandage": 1
    });
    expect(resolved.committedConsumables).toEqual([]);
  });

  it("awards half ordinary XP for each defeated enemy when the party still loses", () => {
    const state = leftPassageState(3);
    state.status = "lost";
    state.enemies[0]!.hp = 0;
    state.participants.forEach((participant) => { participant.hp = 0; });
    state.contributions.forEach((contribution) => { contribution.committedActions = 1; });

    const plan = buildGroupCombatSettlementPlan(state)!;
    const frozenEnemy = state.production!.canonicalV1.enemies.find(
      (enemy) => enemy.enemyId === state.enemies[0]!.id
    )!;
    const characterLevel = Math.max(...state.participants.map((participant) => participant.level));
    const expectedPartialXp = Math.ceil(buildBaselinePersistentFightWinXp({
      characterLevel,
      baseMonsterLevel: frozenEnemy.baseRewardLevel,
      effectiveMonsterLevel: frozenEnemy.level
    }) / 2);

    expect(state.production!.rewards.lossPolicy).toBe(GROUP_COMBAT_LOSS_REWARD_POLICY);
    const lossXp = plan.participants.reduce(
      (sum, participant) => sum + participant.rewards.xp,
      0
    );
    expect(lossXp).toBe(state.production!.rewards.lossXpTotal + expectedPartialXp);
    expect(lossXp).toBeLessThan(state.production!.rewards.winXpTotal);
    expect(plan.participants.every((participant) =>
      buildGroupCombatSettlementReceipt(plan, participant.characterId)?.manualParticipation
    )).toBe(true);
    expect(plan.participants.every((participant) => participant.rewards.gold === 0)).toBe(true);
    expect(plan.participants.every((participant) => participant.rewards.items.length === 0)).toBe(true);
  });

  it("records each enemy defeat in the resolving turn instead of only at combat end", () => {
    const state = proofState(2);
    state.enemies.forEach((enemy) => {
      enemy.hp = 1;
    });

    const resolved = resolveGroupCombatTurn(state, [
      action(state, 0, "attack", "enemy", state.enemies[0]!.id),
      action(state, 1, "attack", "enemy", state.enemies[0]!.id)
    ]);
    const defeatLines = resolved.state.recap[0]!.lines.filter((line) =>
      line.startsWith("🧾 Знешкоджено:")
    );

    expect(defeatLines).toHaveLength(2);
    expect(defeatLines[0]).toContain(state.enemies[0]!.name);
    expect(defeatLines[0]).toContain(`Нова ціль — ${state.enemies[1]!.name}`);
    expect(defeatLines[1]).toContain(state.enemies[1]!.name);
    expect(defeatLines[1]).toContain("стоїть «досить»");
  });

  it("states the per-target meaning of all-enemy damage and all-ally protection", () => {
    const damageState = proofState(2);
    damageState.participants[0]!.classId = "class.bard";
    damageState.enemies.forEach((enemy) => {
      enemy.hp = 93;
      enemy.hpMax = 93;
    });
    const damaged = resolveGroupCombatTurn(damageState, [
      action(damageState, 0, "class", "enemy", damageState.enemies[0]!.id),
      action(
        damageState,
        1,
        "guard",
        "self",
        damageState.participants[1]!.characterId
      )
    ]);
    const damageLine = damaged.state.recap[0]!.lines.find((line) =>
      line.includes("Небезпечний куплет")
    );
    expect(damageLine).toContain("усім ворогам");
    expect(damageLine).toMatch(/по \d+ шкоди|Комірний Шурхіт 1: \d+ шкоди, Комірний Шурхіт 2: \d+ шкоди/);

    const supportState = proofState(3);
    supportState.participants[0]!.classId = "class.priest";
    supportState.participants[1]!.hp = 3;
    const supported = resolveGroupCombatTurn(supportState, [
      action(
        supportState,
        0,
        "class",
        "self",
        supportState.participants[0]!.characterId
      ),
      action(
        supportState,
        1,
        "guard",
        "self",
        supportState.participants[1]!.characterId
      ),
      action(
        supportState,
        2,
        "guard",
        "self",
        supportState.participants[2]!.characterId
      )
    ]);
    const supportLine = supported.state.recap[0]!.lines.find((line) =>
      line.includes("Суворе благословення")
    );
    expect(supportLine).toContain("захист усім союзникам");
    expect(supportLine).toContain(`${supportState.participants[1]!.name}: +`);
    expect(supportLine).not.toContain("усім союзникам — по +");
  });

  it("names the solo actor and action once for abilities and items", () => {
    const damageState = leftPassageState(1);
    const damageActor = damageState.participants[0]!;
    damageActor.raceId = "race.elf";
    damageActor.stats.dexterity = 23;
    damageState.enemies[0]!.hp = 93;
    damageState.enemies[0]!.hpMax = 93;
    damageState.enemies[0]!.defense = 0;
    damageState.enemies[0]!.attack = 1;
    const damaged = resolveGroupCombatTurn(damageState, [
      action(damageState, 0, "race", "enemy", damageState.enemies[0]!.id)
    ]);
    const damageLine = damaged.state.recap[0]!.lines.find((line) =>
      line.includes("Ображена точність")
    );

    expect(damageLine).toMatch(
      /^Пригодник 0 застосовує вміння — 🎯 Ображена точність: (?:критично; )?\d+ шкоди\.$/
    );
    expect(damageLine).not.toContain("«");

    const supportState = leftPassageState(1);
    const actor = supportState.participants[0]!;
    actor.classId = "class.priest";
    actor.hp = 10;
    actor.hpMax = 93;
    supportState.enemies[0]!.hp = 93;
    supportState.enemies[0]!.hpMax = 93;
    supportState.enemies[0]!.attack = 1;
    const supported = resolveGroupCombatTurn(supportState, [
      action(supportState, 0, "class", "self", actor.characterId)
    ]);
    const supportLine = supported.state.recap[0]!.lines.find((line) =>
      line.includes("Суворе благословення")
    );

    expect(supportLine).toMatch(
      /^Пригодник 0 застосовує вміння — ✨ Суворе благословення: (?:\d+ шкоди; )?\+7 HP; захист усім союзникам\.$/
    );
    expect(supportLine?.split(actor.name)).toHaveLength(2);
    expect(supportLine).not.toContain("«");

    const itemState = leftPassageState(1);
    const itemActor = itemState.participants[0]!;
    itemActor.hp = 30;
    itemActor.hpMax = 93;
    itemActor.combatItemQuantities = { "item.field-kit": 1 };
    itemState.enemies[0]!.hp = 93;
    itemState.enemies[0]!.hpMax = 93;
    itemState.enemies[0]!.attack = 1;
    const itemResult = resolveGroupCombatTurn(itemState, [{
      ...action(itemState, 0, "item", "self", itemActor.characterId),
      payloadKey: "item.field-kit"
    }]);
    const itemLine = itemResult.state.recap[0]!.lines.find((line) =>
      line.includes("Польова аптечка")
    );

    expect(itemLine).toMatch(
      /^Пригодник 0 використовує манатку — ⚕️ Польова аптечка: \+\d+ HP\.$/
    );
    expect(itemLine?.split(itemActor.name)).toHaveLength(2);
    expect(itemLine).not.toContain("«");
  });

  it("lets at most one deterministic monster speak in a multi-enemy turn", () => {
    const state = leftPassageState(3);
    const actions = state.participants.map((participant) =>
      buildGroupCombatTimeoutAction(state, participant.characterId)
    );

    const first = resolveGroupCombatTurn(state, actions);
    const replay = resolveGroupCombatTurn(structuredClone(state), actions);

    expect(first.state.recap[0]?.monsterBarkIds?.length ?? 0).toBeLessThanOrEqual(1);
    expect(replay.state.recap[0]?.monsterBarkIds).toEqual(
      first.state.recap[0]?.monsterBarkIds
    );
  });

  it("records accepted manual participation before a start-of-turn bleed win", () => {
    const state = leftPassageState(3);
    state.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    state.enemies[0]!.hp = 1;
    state.participants[2]!.hp -= 5;
    state.participants[2]!.combatItemQuantities["item.responsible-panic-bandage"] = 1;
    state.statuses.push({
      id: "final-bleed",
      kind: "bleed",
      sourceCharacterId: state.participants[0]!.characterId,
      targetKind: "enemy",
      targetId: state.enemies[0]!.id,
      value: 1,
      remainingTurns: 1
    });
    const manaBefore = state.participants[1]!.mana;
    const itemBefore = structuredClone(state.participants[2]!.combatItemQuantities);
    const resolved = resolveGroupCombatTurn(state, [
      action(state, 0, "guard", "self", state.participants[0]!.characterId),
      action(state, 1, "class", "enemy", state.enemies[0]!.id),
      {
        ...action(state, 2, "item", "self", state.participants[2]!.characterId),
        payloadKey: "item.responsible-panic-bandage"
      }
    ]);

    expect(resolved.state.status).toBe("won");
    expect(resolved.state.contributions.map((row) => row.committedActions)).toEqual([1, 1, 1]);
    expect(resolved.settlementPlan!.participants.every((row) =>
      row.rewards.xp > 0 &&
      buildGroupCombatSettlementReceipt(
        resolved.settlementPlan!,
        row.characterId
      )?.manualParticipation
    )).toBe(true);
    expect(resolved.settlementPlan!.participants.filter((row) =>
      row.effects?.activityKey
    )).toHaveLength(1);
    expect(resolved.state.participants[1]!.mana).toBe(manaBefore);
    expect(resolved.state.participants[2]!.combatItemQuantities).toEqual(itemBefore);
    expect(resolved.committedConsumables).toEqual([]);
    expect(resolved.state.recap[0]!.lines.join("\n")).not.toContain("відповідає");
  });

  it("gives an enemy alive at the exchange start one final basic response after defeat", () => {
    const state = leftPassageState(1, true);
    const actor = state.participants[0]!;
    const defeated = state.enemies[0]!;
    const survivor = state.enemies[1]!;
    actor.hp = actor.hpMax = 93;
    actor.attack = 93;
    actor.defense = 20;
    defeated.hp = 1;
    defeated.attack = 1;
    survivor.hp = survivor.hpMax = 93;
    survivor.attack = 1;
    const resolved = resolveGroupCombatTurn(state, [
      action(state, 0, "attack", "enemy", defeated.id)
    ]);
    const recap = resolved.state.recap[0]!.lines.join("\n");

    expect(resolved.state.status).toBe("active");
    expect(resolved.state.enemies[0]!.hp).toBe(0);
    expect(recap).toContain(
      `${defeated.name} востаннє відповідає ${actor.name}: 1 шкоди.`
    );
    expect(recap).not.toContain(`${defeated.name} застосовує`);
  });

  it("keeps victory when the final enemy response also defeats the last participant", () => {
    const state = leftPassageState(1);
    const actor = state.participants[0]!;
    const enemy = state.enemies[0]!;
    actor.hp = 1;
    actor.attack = 93;
    actor.defense = 0;
    enemy.hp = 1;
    enemy.attack = 93;
    const resolved = resolveGroupCombatTurn(state, [
      action(state, 0, "attack", "enemy", enemy.id)
    ]);

    expect(resolved.state.status).toBe("won");
    expect(resolved.state.participants[0]!.hp).toBe(0);
    expect(resolved.state.enemies[0]!.hp).toBe(0);
    expect(resolved.state.recap[0]!.lines.join("\n")).toContain(
      `${enemy.name} востаннє відповідає ${actor.name}:`
    );
  });

  it("keeps timeout-only participants ineligible after an early terminal action", () => {
    const state = leftPassageState(3);
    state.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    state.enemies[0]!.hp = 1;
    const resolved = resolveGroupCombatTurn(state, [
      action(state, 0, "attack", "enemy", state.enemies[0]!.id),
      action(state, 1, "guard", "self", state.participants[1]!.characterId)
    ]);

    expect(resolved.state.contributions.map((row) => row.committedActions)).toEqual([1, 1, 0]);
    expect(resolved.settlementPlan!.participants[2]!.rewards).toEqual({
      xp: 0,
      gold: 0,
      items: []
    });
    expect(resolved.settlementPlan!.participants[2]!.effects?.activityKey).toBeNull();
  });

  it("uses a supported authored damage special and records its cooldown and contribution", () => {
    const state = proofState(2);
    state.enemies[0]!.abilityIds = ["monster.preapproved-bite"];
    const actor = state.participants[0]!;
    actor.hp = actor.hpMax = 93;
    const resolved = resolveGroupCombatTurn(state, [{
      actorCharacterId: actor.characterId,
      turn: state.turn,
      action: "guard",
      targetKind: "self",
      targetId: actor.characterId,
      origin: "manual"
    }]);
    const enemy = resolved.state.enemies[0]!;
    const contribution = resolved.state.enemyContributions?.[0];

    expect(resolved.state.recap[0]?.lines.join("\n")).toContain("застосовує");
    expect(Object.values(enemy.abilityCooldowns ?? {})).toEqual([
      expect.objectContaining({ remainingTurns: 3 })
    ]);
    expect(contribution).toEqual(expect.objectContaining({
      enemyId: enemy.id,
      actions: 1,
      specialActions: 1
    }));
    expect(contribution?.damage).toBeGreaterThanOrEqual(0);
    expect(parseGroupCombatStateStrict(resolved.state)).toEqual(resolved.state);
  });

  it("uses both authored ledger-boar specials instead of stripping them from GroupCombat", () => {
    expect(resolveGroupCombatProductionV1MonsterAbilities({
      monsterId: "monster.ledger-boar",
      effectiveLevel: 8
    }).map((ability) => ability.id)).toEqual([
      "monster.ledger-charge",
      "monster.ledger-audit"
    ]);

    const chargeState = proofState(2);
    chargeState.enemies[0]!.abilityIds = ["monster.ledger-charge"];
    chargeState.enemies[1]!.hp = 0;
    chargeState.participants[0]!.hp = chargeState.participants[0]!.hpMax = 93;
    const charged = resolveGroupCombatTurn(chargeState, chargeState.participants.map((participant) =>
      buildGroupCombatTimeoutAction(chargeState, participant.characterId)
    ));
    expect(charged.state.recap[0]!.lines.join("\n")).toContain("🐗 Прибутково-видатковий таран");
    expect(charged.state.enemyContributions?.[0]).toEqual(expect.objectContaining({
      specialActions: 1
    }));
    expect(charged.state.enemyContributions?.[0]?.damage).toBeGreaterThan(0);

    const auditState = proofState(2);
    auditState.enemies[0]!.abilityIds = ["monster.ledger-audit"];
    auditState.enemies[1]!.hp = 0;
    auditState.participants[0]!.mana = 10;
    auditState.participants[0]!.hp = auditState.participants[0]!.hpMax = 93;
    const audited = resolveGroupCombatTurn(auditState, auditState.participants.map((participant) =>
      buildGroupCombatTimeoutAction(auditState, participant.characterId)
    ));
    expect(audited.state.participants[0]!.mana).toBe(9);
    expect(audited.state.statuses).toContainEqual(expect.objectContaining({
      kind: "monster-incoming-damage",
      sourceAbilityId: "monster.ledger-audit",
      targetId: auditState.participants[0]!.characterId,
      value: 11_500,
      remainingTurns: 2
    }));
    expect(audited.state.recap[0]!.lines.join("\n")).toContain("📒 Звірка копит");
    expect(audited.state.enemyContributions?.[0]).toEqual(expect.objectContaining({
      control: 1,
      specialActions: 1
    }));
    expect(parseGroupCombatStateStrict(audited.state)).toEqual(audited.state);
  });

  it("admits every canonical authored monster ability instead of maintaining a short GroupCombat allowlist", () => {
    expect(GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS).toHaveLength(monsterAbilities.length);
    expect(new Set(GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS)).toEqual(
      new Set(monsterAbilities.map((ability) => ability.id))
    );
    expect(Object.values(GROUP_COMBAT_PRODUCTION_V1_CATALOG.abilities)).toEqual(
      monsterAbilities
    );
    expect(monsterAbilities.every((ability) =>
      isSupportedGroupCombatMonsterAbility(ability.id)
    )).toBe(true);
    expect(() =>
      assertGroupCombatMonsterAbilityExecutionContract(monsterAbilities)
    ).not.toThrow();
    for (const ability of monsterAbilities) {
      const coverage = getMonsterAbilityParameterCoverage(ability);
      expect(coverage.map((entry) => entry.parameter).sort(), ability.id).toEqual(
        Object.keys(ability.parameters).sort()
      );
      expect(new Set(coverage.map((entry) => entry.parameter)).size, ability.id)
        .toBe(coverage.length);
      expect(coverage.every((entry) => entry.consumer.length > 0), ability.id).toBe(true);
    }

    const state = proofState(2);
    state.enemies[0]!.abilityIds = ["monster.sauce-spit"];
    state.enemies[1]!.hp = 0;
    state.participants.forEach((participant) => {
      participant.hp = participant.hpMax = 93;
    });
    const resolved = resolveGroupCombatTurn(state, state.participants.map((participant) =>
      buildGroupCombatTimeoutAction(state, participant.characterId)
    ));

    expect(resolved.state.recap[0]!.lines.join("\n")).toContain("🌯 Соусний плювок");
    expect(resolved.state.enemyContributions?.[0]?.specialActions).toBe(1);
    expect(resolved.state.enemyContributions?.[0]?.damage).toBeGreaterThan(0);
  });

  it("executes every canonical authored monster ability as a named special", () => {
    for (const ability of monsterAbilities) {
      const state = proofState(2);
      state.enemies[0]!.abilityIds = [ability.id];
      state.enemies[0]!.hp = Math.max(1, Math.floor(state.enemies[0]!.hpMax / 2));
      state.enemies[1]!.hp = Math.max(1, Math.floor(state.enemies[1]!.hpMax / 2));
      state.participants.forEach((participant) => {
        participant.hpMax = 186;
        participant.hp = 93;
        participant.manaMax = 186;
        participant.mana = 93;
      });
      const resolved = resolveGroupCombatTurn(state, state.participants.map((participant) =>
        buildGroupCombatTimeoutAction(state, participant.characterId)
      ));

      expect(
        resolved.state.enemyContributions?.[0]?.specialActions,
        ability.id
      ).toBe(1);
      expect(
        resolved.state.recap[0]!.lines.join("\n"),
        ability.id
      ).toContain(ability.label);
      let parsed;
      try {
        parsed = parseGroupCombatStateStrict(resolved.state);
      } catch (error) {
        throw new Error(
          `${ability.id}: ${String(error)}; statuses=${JSON.stringify(resolved.state.statuses)}; ` +
          `abilityEffects=${JSON.stringify(resolved.state.abilityEffects)}; ` +
          `expired=${JSON.stringify(resolved.state.expiredAbilityEffects)}; ` +
          `enemies=${JSON.stringify(resolved.state.enemies)}`
        );
      }
      expect(parsed, ability.id).toEqual(resolved.state);
    }
  });

  it("preserves self-only defense without turning it into player damage", () => {
    const state = proofState(2);
    state.enemies[0]!.abilityIds = ["monster.royal-scurry"];
    state.enemies[1]!.hp = 0;
    const hpBefore = state.participants.map((participant) => participant.hp);
    const resolved = resolveGroupCombatTurn(state, state.participants.map((participant) =>
      buildGroupCombatTimeoutAction(state, participant.characterId)
    ));

    expect(resolved.state.participants.map((participant) => participant.hp)).toEqual(hpBefore);
    expect(resolved.state.statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "monster-damage-reduction",
        sourceEnemyId: state.enemies[0]!.id,
        targetId: state.enemies[0]!.id
      }),
      expect.objectContaining({
        kind: "monster-evasion",
        sourceEnemyId: state.enemies[0]!.id,
        targetId: state.enemies[0]!.id
      })
    ]));
    expect(resolved.state.enemyContributions?.[0]).toEqual(expect.objectContaining({
      damage: 0,
      specialActions: 1,
      guardedTurns: 1
    }));
  });

  it("applies authored damage reduction to later player damage", () => {
    const initial = proofState(2);
    initial.enemies[0]!.abilityIds = ["monster.royal-scurry"];
    initial.enemies[1]!.hp = 0;
    const defended = resolveGroupCombatTurn(initial, initial.participants.map((participant) =>
      buildGroupCombatTimeoutAction(initial, participant.characterId)
    )).state;
    defended.statuses = defended.statuses.filter((status) =>
      status.kind !== "monster-evasion"
    );
    const unprotected = structuredClone(defended);
    unprotected.statuses = [];
    unprotected.enemyContributions![0]!.guardPrevented = 0;

    const defendedResult = resolveGroupCombatTurn(defended, [
      action(defended, 0, "attack", "enemy", defended.enemies[0]!.id)
    ]);
    const unprotectedResult = resolveGroupCombatTurn(unprotected, [
      action(unprotected, 0, "attack", "enemy", unprotected.enemies[0]!.id)
    ]);

    expect(defendedResult.state.enemies[0]!.hp)
      .toBeGreaterThan(unprotectedResult.state.enemies[0]!.hp);
    expect(defendedResult.state.enemyContributions?.[0]?.guardPrevented)
      .toBeGreaterThan(0);
  });

  it("applies an authored all-player special to every living participant", () => {
    const state = proofState(3);
    state.enemies[0]!.abilityIds = ["monster.smoke-without-approval"];
    state.enemies.slice(1).forEach((enemy) => {
      enemy.hp = 0;
    });
    state.participants.forEach((participant) => {
      participant.hp = participant.hpMax = 93;
    });
    const resolved = resolveGroupCombatTurn(state, state.participants.map((participant) =>
      buildGroupCombatTimeoutAction(state, participant.characterId)
    ));

    expect(resolved.state.participants.every((participant) => participant.hp < participant.hpMax)).toBe(true);
    expect(resolved.state.statuses.filter((status) =>
      status.kind === "monster-accuracy-penalty"
    )).toHaveLength(3);
    expect(resolved.state.enemyContributions?.[0]?.damage).toBe(
      resolved.state.participants.reduce((sum, participant) => sum + (participant.hpMax - participant.hp), 0)
    );
  });

  it("executes a formerly filtered authored status ability as a special", () => {
    const state = proofState(2);
    state.enemies[0]!.abilityIds = ["monster.asset-freeze"];
    const resolved = resolveGroupCombatTurn(state, state.participants.map((participant) =>
      buildGroupCombatTimeoutAction(state, participant.characterId)
    ));

    expect(resolved.state.enemyContributions?.[0]).toEqual(expect.objectContaining({
      actions: 1,
      specialActions: 1
    }));
    expect(resolved.state.enemies[0]!.abilityCooldowns?.["monster.asset-freeze"])
      .toEqual(expect.objectContaining({ remainingTurns: 4 }));
    expect(resolved.state.recap[0]!.lines.join("\n")).toContain("Заморозити активи");
  });

  it("persists typed state deltas for the deep-review monster effect families", () => {
    const cases = [
      ["monster.stamp-denied", ["ability-lock"]],
      ["monster.asset-freeze", ["mana-cost-pressure"]],
      ["monster.audit-formula", ["mark"]],
      ["monster.inventory-prophecy", ["repeat-penalty", "evasion", "counter"]],
      ["monster.title-tax", ["outgoing-damage"]],
      ["monster.false-exit", ["flee", "confusion"]],
      ["monster.transparent-report", ["reflect"]]
    ] as const;

    for (const [abilityId, expectedKinds] of cases) {
      const state = proofState(2);
      state.enemies[0]!.abilityIds = [abilityId];
      state.enemies[1]!.hp = 0;
      state.participants.forEach((participant) => {
        participant.hp = participant.hpMax = 186;
        participant.mana = participant.manaMax = 93;
      });
      const resolved = resolveGroupCombatTurn(
        state,
        state.participants.map((participant) =>
          buildGroupCombatTimeoutAction(state, participant.characterId)
        )
      );
      const kinds = new Set(
        (resolved.state.abilityEffects ?? [])
          .filter((effect) => effect.sourceAbilityId === abilityId)
          .map((effect) => effect.kind)
      );
      for (const kind of expectedKinds) {
        expect(kinds.has(kind), `${abilityId}:${kind}`).toBe(true);
      }
      expect(parseGroupCombatStateStrict(resolved.state)).toEqual(resolved.state);
    }
  });

  it("extends the real longest cooldown for reschedule", () => {
    const state = proofState(2);
    state.enemies[0]!.abilityIds = ["monster.reschedule"];
    state.enemies[1]!.hp = 0;
    state.participants[0]!.cooldowns = {
      abilities: {
        "class.test": { id: "class.test", remainingTurns: 4 },
        "race.test": { id: "race.test", remainingTurns: 2 }
      }
    };
    const resolved = resolveGroupCombatTurn(
      state,
      state.participants.map((participant) =>
        buildGroupCombatTimeoutAction(state, participant.characterId)
      )
    );

    expect(
      resolved.state.participants[0]!.cooldowns?.abilities?.["class.test"]
        ?.remainingTurns
    ).toBe(4);
  });

  it("round-trips active monster effects on restart and rejects semantic corruption", () => {
    const state = proofState(2);
    state.enemies[0]!.abilityIds = ["monster.audit-formula"];
    state.enemies[1]!.hp = 0;
    const resolved = resolveGroupCombatTurn(
      state,
      state.participants.map((participant) =>
        buildGroupCombatTimeoutAction(state, participant.characterId)
      )
    ).state;
    const restarted = parseGroupCombatStateStrict(
      JSON.parse(JSON.stringify(resolved))
    );
    expect(restarted).toEqual(resolved);

    const corrupted = structuredClone(resolved);
    corrupted.abilityEffects![0]!.value += 0.01;
    expect(() => parseGroupCombatStateStrict(corrupted)).toThrow(
      GroupCombatStateValidationError
    );
  });

  it.each([
    "monster.reopen-case",
    "monster.return-to-first-instance",
    "monster.reactivate-archive",
    "monster.posthumous-audit",
    "monster.write-off-and-summon"
  ])("%s reapplies an expired effect with separate canonical provenance", (reapplyAbilityId) => {
    let state = proofState(2, { hp: 587, hpMax: 587, defense: 93 });
    state.participants[1]!.hp = 0;
    state.enemies[0]!.abilityIds = ["monster.audit-formula"];
    state.enemies[1]!.hp = 0;
    state = resolveGroupCombatTurn(state, [
      buildGroupCombatTimeoutAction(state, state.participants[0]!.characterId)
    ]).state;
    expect(state.abilityEffects?.some((effect) =>
      effect.sourceAbilityId === "monster.audit-formula" &&
      effect.kind === "mark"
    )).toBe(true);

    state = resolveGroupCombatTurn(state, [
      action(state, 0, "guard", "self", state.participants[0]!.characterId)
    ]).state;
    const expired = state.expiredAbilityEffects?.find((effect) =>
      effect.sourceAbilityId === "monster.audit-formula" &&
      effect.kind === "mark"
    );
    expect(expired, reapplyAbilityId).toBeDefined();

    state = resolveGroupCombatTurn(state, [
      action(state, 0, "guard", "self", state.participants[0]!.characterId)
    ]).state;
    state.enemies[0]!.abilityIds = ["monster.audit-formula", reapplyAbilityId];
    state.enemies[0]!.abilityCooldowns = {
      "monster.audit-formula": {
        id: "monster.audit-formula",
        remainingTurns: 1
      }
    };
    const beforeReapply = structuredClone(state);
    const resolved = resolveGroupCombatTurn(state, [
      action(state, 0, "guard", "self", state.participants[0]!.characterId)
    ]);
    const repeated = resolveGroupCombatTurn(structuredClone(beforeReapply), [
      action(
        beforeReapply,
        0,
        "guard",
        "self",
        beforeReapply.participants[0]!.characterId
      )
    ]);
    const reapplied = resolved.state.abilityEffects?.find((effect) =>
      effect.sourceAbilityId === "monster.audit-formula" &&
      effect.kind === "mark" &&
      effect.reapplication?.sourceAbilityId === reapplyAbilityId
    );
    expect(resolved).toEqual(repeated);
    expect(
      reapplied,
      `${reapplyAbilityId}: ${JSON.stringify(resolved.state.recap.at(-1))}; effects=${JSON.stringify(resolved.state.abilityEffects)}`
    ).toMatchObject({
      sourceEnemyId: expired!.sourceEnemyId,
      sourceAbilityId: expired!.sourceAbilityId,
      targetKind: expired!.targetKind,
      targetId: expired!.targetId,
      kind: expired!.kind,
      value: expired!.value,
      polarity: expired!.polarity,
      removable: expired!.removable,
      trigger: expired!.trigger,
      charges: 1,
      reapplication: {
        sourceEnemyId: resolved.state.enemies[0]!.id,
        sourceAbilityId: reapplyAbilityId,
        turn: beforeReapply.turn
      }
    });
    const restarted = parseGroupCombatStateStrict(
      JSON.parse(JSON.stringify(resolved.state))
    );
    expect(restarted).toEqual(resolved.state);
    const corrupted = structuredClone(resolved.state);
    corrupted.abilityEffects!.find((effect) =>
      effect.reapplication?.sourceAbilityId === reapplyAbilityId
    )!.reapplication!.sourceAbilityId = "monster.audit-formula";
    expect(() => parseGroupCombatStateStrict(corrupted)).toThrow(
      GroupCombatStateValidationError
    );
  });

  it("consumes a charged mark only on the first landed incoming hit", () => {
    const initial = proofState(2, { hp: 93, hpMax: 93, defense: 2 });
    initial.participants[1]!.hp = 0;
    initial.enemies[0]!.abilityIds = ["monster.audit-formula"];
    initial.enemies[1]!.hp = 0;
    const marked = resolveGroupCombatTurn(initial, [
      buildGroupCombatTimeoutAction(initial, initial.participants[0]!.characterId)
    ]).state;
    expect(marked.abilityEffects?.find((effect) => effect.kind === "mark")?.charges)
      .toBe(1);

    const missed = structuredClone(marked);
    expect(applyGroupCombatEnemyDamage(
      missed,
      missed.enemies[0]!,
      missed.participants[0]!,
      0
    )).toBe(0);
    expect(missed.abilityEffects?.find((effect) => effect.kind === "mark"))
      .toMatchObject({ charges: 1, remainingTargetActivations: 2 });
    expect(parseGroupCombatStateStrict(JSON.parse(JSON.stringify(missed))))
      .toEqual(missed);

    const landedInput = structuredClone(marked);
    const landed = resolveGroupCombatTurn(landedInput, [
      action(
        landedInput,
        0,
        "guard",
        "self",
        landedInput.participants[0]!.characterId
      )
    ]);
    expect(landed.state.participants[0]!.hp).toBeLessThan(
      landedInput.participants[0]!.hp
    );
    expect(landed.state.contributions[0]!.guardPrevented).toBeGreaterThan(0);
    expect(landed.state.abilityEffects?.some((effect) => effect.kind === "mark") ?? false)
      .toBe(false);
    expect(landed.state.expiredAbilityEffects?.some((effect) =>
      effect.kind === "mark"
    )).toBe(true);
    expect(resolveGroupCombatTurn(
      parseGroupCombatStateStrict(JSON.parse(JSON.stringify(landedInput))),
      [action(
        landedInput,
        0,
        "guard",
        "self",
        landedInput.participants[0]!.characterId
      )]
    )).toEqual(landed);
  });

  it.each([
    ["monster.stamp-denied", "class"],
    ["monster.denied-closure", "race"]
  ] as const)("locks only the authored $1 ability source for %s", (abilityId, lockedSource) => {
    const state = proofState(2);
    state.enemies[0]!.abilityIds = [abilityId];
    state.enemies[1]!.hp = 0;
    const resolved = resolveGroupCombatTurn(
      state,
      state.participants.map((participant) =>
        buildGroupCombatTimeoutAction(state, participant.characterId)
      )
    ).state;
    const lock = resolved.abilityEffects?.find((effect) =>
      effect.sourceAbilityId === abilityId && effect.kind === "ability-lock"
    );
    expect(lock?.lockSource).toBe(lockedSource);
    const actorIndex = resolved.participants.findIndex(
      (participant) => participant.characterId === lock?.targetId
    );
    expect(validateGroupCombatAction(resolved, action(
      resolved,
      actorIndex,
      lockedSource,
      "enemy",
      resolved.enemies[0]!.id
    ))).toBe("action-unavailable");
    const otherSource = lockedSource === "class" ? "race" : "class";
    expect(validateGroupCombatAction(resolved, action(
      resolved,
      actorIndex,
      otherSource,
      "enemy",
      resolved.enemies[0]!.id
    ))).toBe("ok");
    expect(parseGroupCombatStateStrict(resolved)).toEqual(resolved);
  });

  it("persists and enforces one deterministic any-ability lock", () => {
    const state = proofState(2);
    state.participants.forEach((participant) => {
      participant.gearAbilityIds = ["gear.last-page-rapier"];
    });
    state.enemies[0]!.abilityIds = ["monster.chimera-veto"];
    state.enemies[1]!.hp = 0;
    const resolved = resolveGroupCombatTurn(
      state,
      state.participants.map((participant) =>
        buildGroupCombatTimeoutAction(state, participant.characterId)
      )
    ).state;
    const lock = resolved.abilityEffects?.find((effect) =>
      effect.sourceAbilityId === "monster.chimera-veto" &&
      effect.kind === "ability-lock"
    );
    if (!lock) {
      throw new Error("Expected deterministic any-ability lock");
    }
    const actorIndex = resolved.participants.findIndex(
      (participant) => participant.characterId === lock.targetId
    );
    const actor = resolved.participants[actorIndex]!;
    expect(lock.lockedAbilityId).toBe(deriveGroupCombatLockedAbilityId(
      resolved,
      actor,
      lock.sourceEnemyId,
      lock.sourceAbilityId
    ));
    const actions = [
      ["class", getGroupCombatActionProfile(actor, "class")?.ability.id],
      ["race", getGroupCombatActionProfile(actor, "race")?.ability.id],
      ["gear", "gear.last-page-rapier"]
    ] as const;
    for (const [actionKey, abilityId] of actions) {
      const candidate = {
        ...action(resolved, actorIndex, actionKey, "enemy", resolved.enemies[0]!.id),
        ...(actionKey === "gear" ? { payloadKey: abilityId } : {})
      };
      expect(validateGroupCombatAction(resolved, candidate), `${actionKey}:${abilityId}`)
        .toBe(abilityId === lock.lockedAbilityId ? "action-unavailable" : "ok");
    }
    expect(parseGroupCombatStateStrict(JSON.parse(JSON.stringify(resolved)))).toEqual(resolved);
    const corrupted = structuredClone(resolved);
    corrupted.abilityEffects!.find((effect) =>
      effect.sourceAbilityId === "monster.chimera-veto"
    )!.lockedAbilityId = "ability.noncanonical";
    expect(() => parseGroupCombatStateStrict(corrupted)).toThrow(
      GroupCombatStateValidationError
    );
  });

  it("charges mana pressure exactly once only for mana-cost abilities", () => {
    const initial = proofState(2, {
      classId: "class.mage",
      raceId: "race.drantohor",
      mana: 30,
      manaMax: 30,
      gearAbilityIds: ["gear.last-page-rapier"]
    });
    initial.enemies[0]!.abilityIds = ["monster.asset-freeze"];
    initial.enemies[1]!.hp = 0;
    const pressured = resolveGroupCombatTurn(
      initial,
      initial.participants.map((participant) =>
        buildGroupCombatTimeoutAction(initial, participant.characterId)
      )
    ).state;
    const pressure = pressured.abilityEffects?.find((effect) =>
      effect.kind === "mana-cost-pressure"
    );
    if (!pressure) {
      throw new Error("Expected mana-cost pressure");
    }
    const actorIndex = pressured.participants.findIndex(
      (participant) => participant.characterId === pressure.targetId
    );
    const cases = [
      { actionKey: "class" as const },
      { actionKey: "race" as const },
      { actionKey: "gear" as const, payloadKey: "gear.last-page-rapier" }
    ];
    for (const entry of cases) {
      const state = structuredClone(pressured);
      const candidateActor = state.participants[actorIndex]!;
      candidateActor.mana = 30;
      delete candidateActor.cooldowns;
      const profile = getGroupCombatActionProfile(
        candidateActor,
        entry.actionKey,
        entry.payloadKey
      )!;
      const effectiveCost = getEffectiveGroupCombatAbilityManaCost(
        state,
        candidateActor,
        profile.ability
      );
      expect(effectiveCost).toBe(profile.ability.manaCost + Math.floor(pressure.value));
      const chosen: GroupCombatAction = {
        ...action(
          state,
          actorIndex,
          entry.actionKey,
          "enemy",
          state.enemies[0]!.id
        ),
        ...(entry.payloadKey ? { payloadKey: entry.payloadKey } : {})
      };
      const submitted = state.participants.map((participant, index) =>
        index === actorIndex
          ? chosen
          : action(state, index, "guard", "self", participant.characterId)
      );
      const resolved = resolveGroupCombatTurn(state, submitted);
      expect(resolved.state.participants[actorIndex]!.mana, entry.actionKey)
        .toBe(30 - effectiveCost);
      expect(resolveGroupCombatTurn(structuredClone(state), submitted), entry.actionKey)
        .toEqual(resolved);
      expect(parseGroupCombatStateStrict(JSON.parse(JSON.stringify(resolved.state))))
        .toEqual(resolved.state);
    }

    const attackState = structuredClone(pressured);
    attackState.participants[actorIndex]!.mana = 30;
    const attacked = resolveGroupCombatTurn(
      attackState,
      attackState.participants.map((participant, index) =>
        index === actorIndex
          ? action(attackState, index, "attack", "enemy", attackState.enemies[0]!.id)
          : action(attackState, index, "guard", "self", participant.characterId)
      )
    );
    expect(attacked.state.participants[actorIndex]!.mana).toBe(30);
    for (const actionKey of ["guard", "flee"] as const) {
      const state = structuredClone(pressured);
      state.participants[actorIndex]!.mana = 30;
      const resolved = resolveGroupCombatTurn(
        state,
        state.participants.map((participant, index) =>
          index === actorIndex
            ? action(state, index, actionKey, "self", participant.characterId)
            : action(state, index, "guard", "self", participant.characterId)
        )
      );
      expect(resolved.state.participants[actorIndex]!.mana, actionKey).toBe(30);
    }
    const itemState = structuredClone(pressured);
    itemState.participants[actorIndex]!.mana = 30;
    itemState.participants[actorIndex]!.hp -= 1;
    itemState.participants[actorIndex]!.combatItemQuantities = {
      "item.responsible-panic-bandage": 1
    };
    const itemResult = resolveGroupCombatTurn(
      itemState,
      itemState.participants.map((participant, index) =>
        index === actorIndex
          ? {
              ...action(itemState, index, "item", "self", participant.characterId),
              payloadKey: "item.responsible-panic-bandage"
            }
          : action(itemState, index, "guard", "self", participant.characterId)
      )
    );
    expect(itemResult.state.participants[actorIndex]!.mana).toBe(30);

    const insufficient = structuredClone(pressured);
    const insufficientActor = insufficient.participants[actorIndex]!;
    const classProfile = getGroupCombatActionProfile(insufficientActor, "class")!;
    insufficientActor.mana =
      getEffectiveGroupCombatAbilityManaCost(insufficient, insufficientActor, classProfile.ability) - 1;
    const unavailable = action(
      insufficient,
      actorIndex,
      "class",
      "enemy",
      insufficient.enemies[0]!.id
    );
    const beforeUnavailable = structuredClone(insufficient);
    expect(validateGroupCombatAction(insufficient, unavailable)).toBe("action-unavailable");
    expect(insufficient).toEqual(beforeUnavailable);

    const fumble = structuredClone(pressured);
    const fumbleActor = fumble.participants[actorIndex]!;
    fumbleActor.mana = 30;
    const fumbleProfile = getGroupCombatActionProfile(fumbleActor, "class")!;
    fumbleActor.playerAbilityFumbles = {
      version: 1,
      abilities: {
        [fumbleProfile.ability.id]: {
          version: 1,
          cycle: 0,
          usesInCycle: 0,
          triggerAt: 1
        }
      }
    };
    const fumbled = resolveGroupCombatTurn(
      fumble,
      fumble.participants.map((participant, index) =>
        index === actorIndex
          ? action(fumble, index, "class", "enemy", fumble.enemies[0]!.id)
          : action(fumble, index, "guard", "self", participant.characterId)
      )
    );
    expect(fumbled.state.participants[actorIndex]!.mana).toBe(
      30 - getEffectiveGroupCombatAbilityManaCost(fumble, fumbleActor, fumbleProfile.ability)
    );
    expect(fumbled.state.recap.at(-1)!.lines.join("\n")).toContain(
      fumbleProfile.ability.criticalFumbleLine
    );
  });

  it.each([1, 5, 6, 7])(
    "persists canonical false-exit flee evidence for attempt %i",
    (attempt) => {
      const initial = proofState(2, { hp: 93, hpMax: 93 });
      initial.enemies[0]!.abilityIds = ["monster.false-exit"];
      initial.enemies[1]!.hp = 0;
      const pressured = resolveGroupCombatTurn(
        initial,
        initial.participants.map((participant) =>
          buildGroupCombatTimeoutAction(initial, participant.characterId)
        )
      ).state;
      const fleePressure = pressured.abilityEffects?.find(
        (effect) => effect.kind === "flee"
      );
      if (!fleePressure) {
        throw new Error("Expected flee pressure");
      }
      const actorIndex = pressured.participants.findIndex(
        (participant) => participant.characterId === fleePressure.targetId
      );
      if (attempt > 1) {
        pressured.participants[actorIndex]!.fleeAttempts = attempt - 1;
      } else {
        delete pressured.participants[actorIndex]!.fleeAttempts;
      }
      const submitted = pressured.participants.map((participant, index) =>
        index === actorIndex
          ? action(pressured, index, "flee", "self", participant.characterId)
          : action(pressured, index, "guard", "self", participant.characterId)
      );
      const resolved = resolveGroupCombatTurn(pressured, submitted);
      const repeated = resolveGroupCombatTurn(structuredClone(pressured), submitted);
      const actor = resolved.state.participants[actorIndex]!;
      expect(resolved).toEqual(repeated);
      expect(actor.fleeAttempts).toBe(attempt);
      if (attempt === 7) {
        expect(actor.fledAtTurn).toBe(pressured.turn);
        expect(resolved.state.recap.at(-1)!.lines.join("\n")).toContain(
          `Спроба ${attempt} вдалася`
        );
      }
      expect(parseGroupCombatStateStrict(JSON.parse(JSON.stringify(resolved.state))))
        .toEqual(resolved.state);
    }
  );

  it("selects exactly one fire-safety-cycle rider per eligible activation", () => {
    let state = proofState(2);
    state.enemies[0]!.abilityIds = ["monster.fire-safety-cycle"];
    state.enemies[1]!.hp = 0;
    state.participants.forEach((participant) => {
      participant.hp = participant.hpMax = 587;
    });
    const resolveCycle = () => {
      const next = resolveGroupCombatTurn(
        state,
        state.participants.map((participant) =>
          buildGroupCombatTimeoutAction(state, participant.characterId)
        )
      ).state;
      return next;
    };

    state = resolveCycle();
    expect(
      state.recap.at(-1)!.lines.join("\n").match(/Вогонь, гасіння, акт/g)
    ).toHaveLength(1);
    expect(
      state.expiredAbilityEffects?.some((effect) =>
        effect.sourceAbilityId === "monster.fire-safety-cycle" &&
        effect.kind === "burn"
      ) ??
      state.abilityEffects?.some((effect) =>
        effect.sourceAbilityId === "monster.fire-safety-cycle" &&
        effect.kind === "burn"
      )
    ).toBe(true);

    state.turn = 4;
    delete state.enemies[0]!.abilityCooldowns;
    state = resolveCycle();
    expect(state.enemies[0]!.shield?.sourceAbilityId).toBe(
      "monster.fire-safety-cycle"
    );

    state.turn = 7;
    delete state.enemies[0]!.abilityCooldowns;
    state = resolveCycle();
    expect(
      state.abilityEffects?.filter((effect) =>
        effect.sourceAbilityId === "monster.fire-safety-cycle" &&
        effect.kind === "outgoing-damage"
      )
    ).toHaveLength(2);
  });

  it("heals self and allies and buffs all monsters with exact supported scopes", () => {
    const selfState = proofState(2);
    selfState.enemies[0]!.abilityIds = ["monster.cabbage-plate"];
    selfState.enemies[0]!.hp -= 10;
    const selfResolved = resolveGroupCombatTurn(selfState, selfState.participants.map((participant) =>
      buildGroupCombatTimeoutAction(selfState, participant.characterId)
    ));
    expect(selfResolved.state.enemies[0]!.hp).toBeGreaterThan(selfState.enemies[0]!.hp);
    expect(selfResolved.state.enemies[0]!.shield?.points).toBeGreaterThan(0);

    const allyState = proofState(2);
    allyState.enemies[0]!.abilityIds = ["monster.return-to-staff"];
    allyState.enemies[1]!.hp = 5;
    allyState.statuses.push({
      id: "ally-bleed",
      kind: "bleed",
      sourceCharacterId: allyState.participants[0]!.characterId,
      targetKind: "enemy",
      targetId: allyState.enemies[1]!.id,
      value: 1,
      remainingTurns: 2
    });
    const allyResolved = resolveGroupCombatTurn(allyState, allyState.participants.map((participant) =>
      buildGroupCombatTimeoutAction(allyState, participant.characterId)
    ));
    expect(allyResolved.state.enemies[1]!.hp).toBeGreaterThan(4);
    expect(allyResolved.state.enemyContributions?.[0]?.healing).toBeGreaterThan(0);
    expect(allyResolved.state.statuses.some((status) =>
      status.kind === "bleed" && status.targetId === allyState.enemies[1]!.id
    )).toBe(false);

    const groupState = proofState(2);
    groupState.enemies[0]!.abilityIds = ["monster.common-group-rally"];
    const groupResolved = resolveGroupCombatTurn(groupState, groupState.participants.map((participant) =>
      buildGroupCombatTimeoutAction(groupState, participant.characterId)
    ));
    expect(groupResolved.state.enemies.every((enemy) => (enemy.shield?.points ?? 0) > 0)).toBe(true);
    expect(groupResolved.state.statuses.filter((status) =>
      status.kind === "monster-damage-reduction"
    )).toHaveLength(2);
  });

  it("replays supported monster cooldowns deterministically across a strict restart", () => {
    const initial = proofState(2);
    initial.enemies[0]!.abilityIds = ["monster.preapproved-bite"];
    const actions = initial.participants.map((participant) =>
      buildGroupCombatTimeoutAction(initial, participant.characterId)
    );
    const first = resolveGroupCombatTurn(initial, actions);
    const repeated = resolveGroupCombatTurn(structuredClone(initial), actions);
    expect(first).toEqual(repeated);

    let restarted = parseGroupCombatStateStrict(first.state);
    for (let index = 0; index < 3; index += 1) {
      restarted = resolveGroupCombatTurn(
        parseGroupCombatStateStrict(structuredClone(restarted)),
        restarted.participants
          .filter((participant) => participant.hp > 0)
          .map((participant) => buildGroupCombatTimeoutAction(restarted, participant.characterId))
      ).state;
    }
    expect(restarted.enemies[0]!.abilityCooldowns?.["monster.preapproved-bite"]?.remainingTurns).toBe(3);
    expect(restarted.enemyContributions?.[0]?.specialActions).toBe(2);
  });

  it("requires explicit live targets without mutating stale, wrong-side, or dead choices", () => {
    const state = proofState(2);
    const before = structuredClone(state);
    expect(validateGroupCombatAction(state, action(state, 0, "attack", "enemy", state.enemies[0]!.id))).toBe("ok");
    expect(validateGroupCombatAction(state, action(state, 0, "attack", "ally", state.participants[1]!.characterId))).toBe("invalid-target");
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
      action(first, 1, "attack", "enemy", first.enemies[1]!.id)
    ];
    const resolved = resolveGroupCombatTurn(first, actions);
    const repeated = resolveGroupCombatTurn(second, actions);

    expect(resolved).toEqual(repeated);
    expect(resolved.state.contributions[2]?.guardedTurns).toBe(1);
    expect(resolved.state.participants[2]?.mana).toBe(first.participants[2]?.mana);
    expect(resolved.state.recap[0]?.lines).toContain(`${first.participants[2]!.name} мовчить і стає в захист.`);
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
      expect(Buffer.byteLength(JSON.stringify(state), "utf8")).toBeLessThanOrEqual(
        GROUP_COMBAT_STATE_BYTE_LIMIT
      );
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

  it("keeps the complete twenty-five-turn 3x6 production journal inside the state budget", () => {
    const measured = Array.from({ length: 42 }, (_, index) => {
      let state = leftPassageState(3, true, {}, `budget-roster-${index}`);
      state.participants.forEach((actor) => {
        actor.hp = 587;
        actor.hpMax = 587;
        actor.defense = 93;
      });
      for (let turn = 1; turn <= 25 && state.status === "active"; turn += 1) {
        state = resolveGroupCombatTurn(
          state,
          state.participants
            .filter((actor) => actor.hp > 0)
            .map((actor) => buildGroupCombatTimeoutAction(state, actor.characterId))
        ).state;
      }
      return {
        seed: index,
        state,
        bytes: Buffer.byteLength(JSON.stringify(state), "utf8")
      };
    });
    const worst = measured.reduce((current, candidate) =>
      candidate.bytes > current.bytes ? candidate : current
    );
    const effectHeavy = measured.reduce((current, candidate) => {
      const evidenceBytes = (entry: typeof candidate) => Buffer.byteLength(
        JSON.stringify({
          abilities: entry.state.production?.canonicalV1.enemies.flatMap(
            (enemy) => enemy.abilities
          ),
          active: entry.state.abilityEffects ?? [],
          expired: entry.state.expiredAbilityEffects ?? []
        }),
        "utf8"
      );
      return evidenceBytes(candidate) > evidenceBytes(current) ? candidate : current;
    });
    const { state } = worst;
    const stateBytes = worst.bytes;
    const withoutRecapBytes = Buffer.byteLength(
      JSON.stringify({ ...state, recap: [] }),
      "utf8"
    );
    console.log(
      "Left-passage 3x6 full-journal worst state bytes",
      stateBytes,
      "/",
      GROUP_COMBAT_STATE_BYTE_LIMIT,
      "seed",
      worst.seed
    );
    console.log("Left-passage 3x6 state bytes without recap", withoutRecapBytes);
    console.log(
      "Left-passage 3x6 active/expired effects",
      state.abilityEffects?.length ?? 0,
      state.expiredAbilityEffects?.length ?? 0
    );
    console.log(
      "Left-passage 3x6 effect-heavy state bytes",
      effectHeavy.bytes,
      "seed",
      effectHeavy.seed,
      "effects",
      (effectHeavy.state.abilityEffects?.length ?? 0) +
        (effectHeavy.state.expiredAbilityEffects?.length ?? 0)
    );
    expect(state.recap).toHaveLength(25);
    expect(state.recap.every((entry) => entry.snapshot !== undefined)).toBe(true);
    expect(stateBytes).toBeLessThanOrEqual(GROUP_COMBAT_STATE_BYTE_LIMIT);
    expect(parseGroupCombatStateStrict(state)).toEqual(state);
    expect(
      (effectHeavy.state.abilityEffects?.length ?? 0) +
        (effectHeavy.state.expiredAbilityEffects?.length ?? 0)
    ).toBeGreaterThanOrEqual(13);
    expect(effectHeavy.bytes).toBeLessThanOrEqual(GROUP_COMBAT_STATE_BYTE_LIMIT);
    expect(parseGroupCombatStateStrict(effectHeavy.state)).toEqual(effectHeavy.state);
  });

  it("continues production combat past turn twenty-five with a rolling journal", () => {
    let state = leftPassageState(1, true);
    state.participants[0]!.hp = 587;
    state.participants[0]!.hpMax = 587;
    state.participants[0]!.defense = 93;
    for (let turn = 1; turn <= 25; turn += 1) {
      const resolved = resolveGroupCombatTurn(state, [
        buildGroupCombatTimeoutAction(state, state.participants[0]!.characterId)
      ]);
      state = resolved.state;
      expect(resolved.result).toBeNull();
      expect(resolved.settlementPlan).toBeNull();
    }

    expect(state.status).toBe("active");
    expect(state.turn).toBe(26);
    expect(state.recap).toHaveLength(25);
    expect(state.recap[0]!.turn).toBe(1);
    expect(parseGroupCombatStateStrict(state)).toEqual(state);

    state = resolveGroupCombatTurn(state, [
      buildGroupCombatTimeoutAction(state, state.participants[0]!.characterId)
    ]).state;
    expect(state.status).toBe("active");
    expect(state.turn).toBe(27);
    expect(state.recap).toHaveLength(25);
    expect(state.recap[0]!.turn).toBe(2);
    expect(state.recap.at(-1)!.turn).toBe(26);
    expect(parseGroupCombatStateStrict(state)).toEqual(state);
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
    expect(Math.max(...sessions.map((state) =>
      Buffer.byteLength(JSON.stringify(state), "utf8")
    ))).toBeLessThanOrEqual(GROUP_COMBAT_STATE_BYTE_LIMIT);
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

  it.each(["guard", "item"] as const)("ticks ability cooldowns after a committed %s action", (actionKey) => {
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

  it("ticks cooldowns on timeout guard without counting a manual action", () => {
    const state = proofState(2);
    state.participants[0]!.cooldowns = {
      abilities: {
        "skill.forceful-strike": {
          id: "skill.forceful-strike",
          remainingTurns: 3
        }
      }
    };

    const result = resolveGroupCombatTurn(state, []);

    expect(
      result.state.participants[0]!.cooldowns?.abilities?.["skill.forceful-strike"]?.remainingTurns
    ).toBe(2);
    expect(result.state.contributions[0]).toMatchObject({
      committedActions: 0,
      guardedTurns: 1
    });
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

  it("explicitly classifies every supported direct-damage profile without an enemy scope", () => {
    const gearProfiles: CombatSkillProfile[] = [];
    const gearDefinitions = mantokAbilityGrantDefinitions as unknown as
      readonly MantokAbilityGrantDefinition[];
    for (const definition of gearDefinitions) {
      if (definition.combat) {
        gearProfiles.push(definition.combat.profile);
      }
    }
    const profiles: CombatSkillProfile[] = [
      ...classAbilities,
      ...raceAbilities,
      ...gearProfiles
    ];
    const supportDamageProfiles = profiles
      .filter((profile) => profile.recipe?.includes("direct-damage"))
      .filter((profile) => ![
        profile.primaryTargetScope,
        profile.secondaryTargetScope
      ].some((scope) =>
        scope === "single-enemy" ||
        scope === "all-enemies" ||
        scope === "lowest-hp-enemy"
      ))
      .map((profile) => profile.id)
      .sort();

    expect(supportDamageProfiles).toEqual(
      [...GROUP_COMBAT_CANONICAL_ENEMY_DAMAGE_ABILITY_IDS].sort()
    );
  });

  it.each([
    {
      abilityId: "skill.strict-blessing",
      actionKey: "class" as const,
      actor: {
        classId: "class.priest",
        mana: 10
      },
      manaCost: 4,
      healAmount: 7
    },
    {
      abilityId: "gear.asclepius-instruction",
      actionKey: "gear" as const,
      actor: {
        classId: "class.warrior",
        mana: 10,
        level: 13,
        gearAbilityIds: ["gear.asclepius-instruction"]
      },
      manaCost: 5,
      healAmount: 4
    }
  ])(
    "$abilityId heals and protects the committed ally while damaging the canonical living enemy",
    ({ abilityId, actionKey, actor: actorOverrides, manaCost, healAmount }) => {
      const state = proofState(3);
      Object.assign(state.participants[0]!, actorOverrides);
      state.participants[1]!.hp = 5;
      state.participants[1]!.defense = 100;
      state.participants[1]!.threat = 1_000;
      const initialEnemyHp = state.enemies.map((enemy) => enemy.hp);
      const submitted = [
        {
          ...action(
            state,
            0,
            actionKey,
            "self",
            state.participants[0]!.characterId
          ),
          ...(actionKey === "gear" ? { payloadKey: abilityId } : {})
        },
        action(state, 1, "guard", "self", state.participants[1]!.characterId),
        action(state, 2, "guard", "self", state.participants[2]!.characterId)
      ];

      const resolved = resolveGroupCombatTurn(state, submitted);
      const replay = resolveGroupCombatTurn(structuredClone(state), submitted);
      const actor = resolved.state.participants[0]!;
      const healedAlly = resolved.state.participants[1]!;
      const recap = resolved.state.recap[0]!.lines.join("\n");

      expect(replay).toEqual(resolved);
      expect(healedAlly.hp).toBe(5 + healAmount);
      expect(resolved.state.enemies[0]!.hp).toBeLessThan(initialEnemyHp[0]!);
      expect(resolved.state.enemies[1]!.hp).toBe(initialEnemyHp[1]);
      expect(resolved.state.enemies[2]!.hp).toBe(initialEnemyHp[2]);
      expect(recap).toMatch(new RegExp(`${abilityId === "skill.strict-blessing"
        ? "Суворе благословення"
        : "Інструкція Асклепія"}.*\\d+ шкоди`));
      expect(actor.mana).toBe(10 - manaCost);
      expect(actionKey === "class"
        ? actor.cooldowns?.skill?.id
        : actor.cooldowns?.abilities?.[abilityId]?.id
      ).toBe(abilityId);
      expect(resolved.state.contributions[0]!.guardPrevented).toBeGreaterThan(0);
      expect(recap).toContain("захист усім союзникам");
    }
  );

  it.each([
    {
      abilityId: "skill.strict-blessing",
      actionKey: "class" as const,
      actor: { classId: "class.priest" },
      manaCost: 4
    },
    {
      abilityId: "gear.asclepius-instruction",
      actionKey: "gear" as const,
      actor: {
        gearAbilityIds: ["gear.asclepius-instruction"],
        level: 13
      },
      manaCost: 5
    }
  ])("$abilityId keeps deterministic fumble resource semantics", ({
    abilityId,
    actionKey,
    actor: actorOverrides,
    manaCost
  }) => {
    const state = proofState(2);
    Object.assign(state.participants[0]!, actorOverrides);
    state.participants[0]!.playerAbilityFumbles = {
      version: 1,
      abilities: {
        [abilityId]: { version: 1, cycle: 0, usesInCycle: 0, triggerAt: 1 }
      }
    };
    const initialEnemyHp = state.enemies.map((enemy) => enemy.hp);
    const submitted = [
      {
        ...action(
          state,
          0,
          actionKey,
          "self",
          state.participants[0]!.characterId
        ),
        ...(actionKey === "gear" ? { payloadKey: abilityId } : {})
      },
      action(state, 1, "guard", "self", state.participants[1]!.characterId)
    ];
    const resolved = resolveGroupCombatTurn(state, submitted);

    expect(resolved.state.enemies.map((enemy) => enemy.hp)).toEqual(initialEnemyHp);
    expect(resolved.state.contributions[0]!.healing).toBe(0);
    expect(resolved.state.participants[0]!.mana).toBe(10 - manaCost);
    expect(actionKey === "class"
      ? resolved.state.participants[0]!.cooldowns?.skill?.id
      : resolved.state.participants[0]!.cooldowns?.abilities?.[abilityId]?.id
    ).toBe(abilityId);
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

  it("strictly rejects unsupported abilities in a persisted production loadout", () => {
    const state = leftPassageState(1);
    state.enemies[0]!.abilityIds = [
      ...(state.enemies[0]!.abilityIds ?? []),
      "monster.asset-freeze"
    ];

    expect(() => parseGroupCombatStateStrict(state)).toThrow(
      "Production enemy state is not derivable from immutable v1 inputs."
    );
  });

  it("strictly rejects forged supported monster effects and shields", () => {
    const statusState = proofState(2);
    statusState.enemies[0]!.abilityIds = ["monster.royal-scurry"];
    statusState.statuses.push({
      id: "forged-monster-buff",
      kind: "monster-damage-reduction",
      sourceEnemyId: statusState.enemies[0]!.id,
      sourceAbilityId: "monster.royal-scurry",
      targetKind: "enemy",
      targetId: statusState.enemies[0]!.id,
      value: 9999,
      remainingTurns: 1,
      appliedTurn: statusState.turn
    });
    expect(() => parseGroupCombatStateStrict(statusState)).toThrow(
      "Status source is not canonical."
    );

    const shieldState = proofState(2);
    shieldState.enemies[0]!.abilityIds = ["monster.cabbage-plate"];
    shieldState.enemies[0]!.shield = {
      sourceAbilityId: "monster.cabbage-plate",
      sourceEnemyId: shieldState.enemies[0]!.id,
      points: shieldState.enemies[0]!.hpMax
    };
    expect(() => parseGroupCombatStateStrict(shieldState)).toThrow(
      "Enemy shield source is not canonical."
    );

    const wrongTargetState = proofState(2);
    wrongTargetState.enemies[0]!.abilityIds = ["monster.cabbage-plate"];
    wrongTargetState.enemies[1]!.shield = {
      sourceAbilityId: "monster.cabbage-plate",
      sourceEnemyId: wrongTargetState.enemies[0]!.id,
      points: 1
    };
    expect(() => parseGroupCombatStateStrict(wrongTargetState)).toThrow(
      "Enemy shield source is not canonical."
    );
  });

  it("strictly rejects forged participant flee evidence", () => {
    const missingAttempts = leftPassageState();
    missingAttempts.participants[0]!.fledAtTurn = 1;
    expect(() => parseGroupCombatStateStrict(missingAttempts)).toThrow(
      "Participant flee evidence is not canonical."
    );

    const impossibleFailure = leftPassageState();
    impossibleFailure.participants[0]!.fleeAttempts = 7;
    expect(() => parseGroupCombatStateStrict(impossibleFailure)).toThrow(
      "Participant flee evidence is not canonical."
    );

    const futureEscape = leftPassageState();
    futureEscape.participants[0]!.fleeAttempts = 1;
    futureEscape.participants[0]!.fledAtTurn = futureEscape.turn + 1;
    expect(() => parseGroupCombatStateStrict(futureEscape)).toThrow(
      "Participant fled after the current turn."
    );
  });

  it("fails closed on shape-valid production location, roster, pressure, item, difficulty, and reward corruption", () => {
    const corruptions: Array<(state: ReturnType<typeof leftPassageState>) => void> = [
      (state) => {
        state.production!.locationId = "PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT";
      },
      (state) => {
        state.enemies.pop();
      },
      (state) => {
        state.production!.threat.sourceCharacterId = state.participants[1]!.characterId;
      },
      (state) => {
        state.production!.remort.backupAdjustments[0]!.hpMaxAdded += 1;
      },
      (state) => {
        state.production!.threat.appliedSecondEnemyLevelBonus = 1;
      },
      (state) => {
        state.production!.rewards.winXpTotal += 1;
      },
      (state) => {
        (state.production!.rewards as { lootVersion: number }).lootVersion = 2;
      },
      (state) => {
        state.production!.rewards.lootSnapshot.enemies[0]!.participantRolls.reverse();
      },
      (state) => {
        state.production!.rewards.lootSnapshot.enemies[0]!.participantRolls[0]!.items = [
          { itemId: "item.iskrokamin", quantity: 1 },
          { itemId: "item.iskrokamin", quantity: 2 }
        ];
      }
    ];
    for (const corrupt of corruptions) {
      const state = leftPassageState();
      corrupt(state);
      expect(() => parseGroupCombatStateStrict(state)).toThrow(GroupCombatStateValidationError);
    }
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

function leftPassageState(
  count: 1 | 2 | 3 = 2,
  strong = false,
  participantOverrides: Partial<GroupCombatActorSnapshot> = {},
  encounterSeed = "seed-23"
) {
  const participants = Array.from(
    { length: count },
    (_, index) => participant(index, {
      level: strong ? 7 : 4,
      ...participantOverrides
    })
  );
  const enemyCount = strong ? count * 2 : count;
  const usedMonsterIds = ["monster.deadline-spider"];
  const enemyInputs = Array.from({ length: enemyCount }, (_, index) => {
    if (index === 0) {
      return { monsterId: "monster.deadline-spider", level: 4 };
    }
    const monster = selectGroupCombatProductionV1BackupMonster({
      participantLevel: participants[0]!.level,
      encounterSeed,
      partySessionId: "party-session",
      index,
      usedMonsterIds
    });
    usedMonsterIds.push(monster.id);
    return {
      monsterId: monster.id,
      level: getGroupCombatProductionV1BackupEffectiveLevel(participants[0]!.level)
    };
  });
  const enemies = enemyInputs.map(({ monsterId, level }, index) => {
    const authored = findGroupCombatProductionV1Monster(monsterId)!;
    const stats = deriveGroupCombatProductionV1MonsterStats({
      monsterId,
      effectiveLevel: level
    })!;
    const abilityIds = resolveGroupCombatProductionV1MonsterAbilities({
      monsterId,
      effectiveLevel: level
    }).map((ability) => ability.id);
    return {
      id: index === 0 ? "primary:encounter-13" : `backup:${index}:${monsterId}`,
      monsterId,
      name: authored.name,
      order: index,
      level,
      hp: stats.hpMax,
      hpMax: stats.hpMax,
      attack: stats.attack,
      defense: Math.max(stats.armor, stats.resist),
      ...(abilityIds.length > 0 ? { abilityIds } : {})
    };
  });
  const rewardBudget = buildLeftPassageEncounterRewardBudget({
    participantLevels: participants.map((participant) => participant.level),
    enemies: enemies.map((enemy) => ({
      baseLevel: findGroupCombatProductionV1Monster(enemy.monsterId)?.level ?? enemy.level,
      effectiveLevel: enemy.level
    })),
    deterministicKey: `${encounterSeed}:party-session:rewards`
  });
  return createLeftPassageGroupCombatState({
    sessionId: "group-session",
    partySessionId: "party-session",
    deterministicSeed: 42,
    participants,
    enemies,
    difficulty: {
      version: 1,
      origin: "nyz-left-passage-party.v1",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      encounterId: "encounter-13",
      encounterToken: "encounter-token-13",
      encounterSeed,
      initiatingCharacterId: "character-0",
      initiatingRemortCount: 0,
      primaryMonsterId: "monster.deadline-spider",
      primaryBaseMonsterLevel: 2,
      primaryEffectiveMonsterLevel: 4,
      primaryStartingHp: enemies[0]!.hp,
      threat: {
        participants: participants.map((entry) => ({
          characterId: entry.characterId,
          rosterOrder: entry.rosterOrder,
          remortCount: entry.remortCount,
          decision: {
            enemyCount: 1,
            reason: "base",
            eligibleWins: 0,
            secondEnemyLevelBonus: 0
          }
        })),
        sourceCharacterId: "character-0",
        sourceRosterOrder: 0,
        escalated: false,
        requestedSecondEnemyLevelBonus: 0,
        appliedSecondEnemyLevelBonus: 0,
        boostedEnemyId: null,
        levelCap: 23
      },
      remort: {
        participants: participants.map((entry) => ({
          characterId: entry.characterId,
          rosterOrder: entry.rosterOrder,
          remortCount: entry.remortCount
        })),
        sourceCharacterId: "character-0",
        sourceRosterOrder: 0,
        sourceRemortCount: 0,
        backupAdjustments: enemies.slice(1).map((enemy) => ({
          enemyId: enemy.id,
          remortCount: 0,
          hpMaxAdded: 0,
          attackAdded: 0
        }))
      },
      rewards: {
        winXpTotal: rewardBudget.winXpTotal,
        winGoldTotal: rewardBudget.winGoldTotal,
        lossXpTotal: rewardBudget.lossXpTotal,
        lossPolicy: GROUP_COMBAT_LOSS_REWARD_POLICY,
        lootVersion: 1
      }
    }
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

function getTestLootExpansionSource(
  level: number,
  tags: readonly string[]
): "kitchen_dungeon" | "bureaucracy_wing" | "forest_sidequest" | "elite_mob" | "trash_mob" {
  const tagSet = new Set(tags);
  if (["food", "kitchen", "pan", "cheese"].some((tag) => tagSet.has(tag))) {
    return "kitchen_dungeon";
  }
  if (
    ["bureaucracy", "paper", "queue", "tax", "audit", "deadline", "calendar"]
      .some((tag) => tagSet.has(tag))
  ) {
    return "bureaucracy_wing";
  }
  if (["forest", "garden", "druid", "frog"].some((tag) => tagSet.has(tag))) {
    return "forest_sidequest";
  }
  return level >= 10 ? "elite_mob" : "trash_mob";
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
