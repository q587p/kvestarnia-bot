import type { PartyBossActionKey, PartyBossState } from "../../src/domain/partyBoss/partyBoss";
import { describe, expect, it } from "vitest";
import {
  createPartyBossState,
  resolvePartyBossRound
} from "../../src/domain/partyBoss/partyBoss";
import { findMantokAbilityGrantByKey } from "../../src/content";

const PARTY_BOSS_SIMULATION_HORIZON_TURNS = 13;
const PARTY_BOSS_SIMULATION_RUNS = 400;

describe("party boss reducer", () => {
  it("resolves submitted actions and fills missing participants with timeout defend", () => {
    const state = createPartyBossState({
      partySessionId: "party-1",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша"),
        participant("character-2", "Друга")
      ]
    });

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "session-1",
      actions: [
        {
          characterId: "character-1",
          action: "attack",
          origin: "manual"
        }
      ]
    });

    expect(result.round.actions).toHaveLength(2);
    expect(result.round.actions.find((action) => action.characterId === "character-1")?.origin).toBe("manual");
    expect(result.round.actions.find((action) => action.characterId === "character-2")).toMatchObject({
      action: "defend",
      origin: "timeout"
    });
    expect(result.state.participants.find((entry) => entry.characterId === "character-1")?.contribution.submittedActions).toBe(1);
    expect(result.state.participants.find((entry) => entry.characterId === "character-2")?.contribution.timeoutActions).toBe(1);
  });

  it("stores participant cooldown snapshots after each resolved round", () => {
    const state = createPartyBossState({
      partySessionId: "party-cooldown-snapshot",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша"),
        participant("character-2", "Друга")
      ]
    });
    const abilityId = "ability.race.practical-improvisation";
    state.participants[0]!.resources.cooldowns = {
      abilities: {
        [abilityId]: {
          id: abilityId,
          remainingTurns: 3
        }
      }
    };

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "cooldown-snapshot",
      actions: [
        { characterId: "character-1", action: "defend", origin: "manual" },
        { characterId: "character-2", action: "defend", origin: "manual" }
      ]
    });

    const snapshot = result.round.participantsAfter?.find((entry) => entry.characterId === "character-1");
    const live = result.state.participants.find((entry) => entry.characterId === "character-1");

    expect(snapshot?.cooldowns?.abilities?.[abilityId]).toEqual({
      id: abilityId,
      remainingTurns: 2
    });
    expect(live?.resources.cooldowns?.abilities?.[abilityId]).toEqual({
      id: abilityId,
      remainingTurns: 2
    });

    live!.resources.cooldowns!.abilities![abilityId]!.remainingTurns = 9;

    expect(snapshot?.cooldowns?.abilities?.[abilityId]?.remainingTurns).toBe(2);
  });

  it("resolves equipment gear actions in party boss rounds", () => {
    const grant = findMantokAbilityGrantByKey("rldagr");
    if (!grant?.combat) {
      throw new Error("Expected red-line dagger combat grant.");
    }
    const state = createPartyBossState({
      partySessionId: "party-gear",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", {
          level: 10,
          dexterity: 14,
          equipmentAbilityGrantIds: [grant.id]
        })
      ]
    });

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-gear",
      actions: [
        {
          characterId: "character-1",
          action: "gear",
          origin: "manual",
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
      ]
    });

    expect(result.round.actions[0]).toMatchObject({
      action: "gear",
      skillId: "gear.red-line-dagger"
    });
    expect(result.state.participants[0]?.resources.cooldowns?.abilities?.["gear.red-line-dagger"]).toEqual({
      id: "gear.red-line-dagger",
      remainingTurns: 3
    });
  });

  it("defensively resolves pre-queued party boss gear actions without effects when mana is missing", () => {
    const grant = findMantokAbilityGrantByKey("rldagr");
    if (!grant?.combat) {
      throw new Error("Expected red-line dagger combat grant.");
    }
    const state = createPartyBossState({
      partySessionId: "party-gear-no-mana",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", {
          level: 10,
          manaCurrent: 0,
          equipmentAbilityGrantIds: [grant.id]
        })
      ]
    });

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-gear-no-mana",
      actions: [
        {
          characterId: "character-1",
          action: "gear",
          origin: "manual",
          gearAbility: {
            profile: grant.combat.profile
          }
        }
      ]
    });

    expect(result.round.actions[0]).toMatchObject({
      action: "gear",
      outcome: "not-enough-mana",
      damage: 0,
      manaSpent: 0
    });
    expect(result.state.participants[0]?.resources.cooldowns?.abilities?.["gear.red-line-dagger"]).toBeUndefined();
  });

  it("defensively resolves pre-queued party boss gear actions without effects while equipment cooldown is active", () => {
    const grant = findMantokAbilityGrantByKey("rldagr");
    if (!grant?.combat) {
      throw new Error("Expected red-line dagger combat grant.");
    }
    const state = createPartyBossState({
      partySessionId: "party-gear-cooldown",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", {
          level: 10,
          equipmentAbilityGrantIds: [grant.id]
        })
      ]
    });
    state.participants[0]!.resources.cooldowns = {
      abilities: {
        [grant.combat.profile.id]: {
          id: grant.combat.profile.id,
          remainingTurns: 2
        }
      }
    };

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-gear-cooldown",
      actions: [
        {
          characterId: "character-1",
          action: "gear",
          origin: "manual",
          gearAbility: {
            profile: grant.combat.profile
          }
        }
      ]
    });

    expect(result.round.actions[0]).toMatchObject({
      action: "gear",
      outcome: "skill-on-cooldown",
      damage: 0,
      manaSpent: 0
    });
    expect(result.state.participants[0]?.resources.cooldowns?.abilities?.["gear.red-line-dagger"]).toEqual({
      id: "gear.red-line-dagger",
      remainingTurns: 2
    });
  });

  it("applies equipment guard effects before party boss retaliation", () => {
    const grant = findMantokAbilityGrantByKey("bcshield");
    if (!grant?.combat) {
      throw new Error("Expected barrel shield combat grant.");
    }
    const state = createPartyBossState({
      partySessionId: "party-gear-guard",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", {
          level: 9,
          equipmentAbilityGrantIds: [grant.id]
        })
      ]
    });

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-gear-guard",
      actions: [
        {
          characterId: "character-1",
          action: "gear",
          origin: "manual",
          gearAbility: {
            profile: grant.combat.profile
          }
        }
      ]
    });

    expect(result.round.actions[0]).toMatchObject({
      action: "gear",
      skillId: "gear.barrel-counter-shield",
      guard: 2
    });
    expect(result.round.bossRetaliations[0]).toMatchObject({
      characterId: "character-1",
      damage: 6,
      hpAfter: 24
    });
    expect(result.state.participants[0]?.resources.guard).toEqual({
      consecutiveDefends: 1,
      abilityDamageReduction: 2
    });
  });

  it("applies borrowed equipment healing and guard in party boss rounds", () => {
    const grant = findMantokAbilityGrantByKey("ascstf");
    if (!grant?.combat) {
      throw new Error("Expected Asclepius staff combat grant.");
    }
    const state = createPartyBossState({
      partySessionId: "party-gear-support",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", {
          level: 11,
          hp: 30,
          hpCurrent: 12,
          mana: 12,
          manaCurrent: 8,
          equipmentAbilityGrantIds: [grant.id]
        })
      ]
    });

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-gear-support",
      actions: [
        {
          characterId: "character-1",
          action: "gear",
          origin: "manual",
          gearAbility: {
            profile: grant.combat.profile
          }
        }
      ]
    });

    expect(result.round.actions[0]).toMatchObject({
      action: "gear",
      skillId: "gear.asclepius-instruction",
      healing: 4,
      guard: 1,
      hpAfter: 16
    });
    expect(result.state.participants[0]?.resources.guard).toEqual({
      consecutiveDefends: 1,
      abilityDamageReduction: 1
    });
  });

  it("keeps already submitted same-round actions when an earlier actor drops the boss", () => {
    const state = createPartyBossState({
      partySessionId: "party-simultaneous-finish",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", { strength: 30, dexterity: 30 }),
        participant("character-2", "Друга", { strength: 30, dexterity: 30 })
      ]
    });
    const wounded = {
      ...state,
      boss: {
        ...state.boss,
        hp: 1,
        hpMax: 1,
        armor: 0,
        resist: 0,
        dexterity: 0
      }
    };

    const result = resolvePartyBossRound({
      state: wounded,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "simultaneous-finish",
      actions: [
        { characterId: "character-1", action: "attack", origin: "manual" },
        { characterId: "character-2", action: "attack", origin: "manual" }
      ]
    });

    expect(result.state.status).toBe("won");
    expect(result.round.actions.map((action) => action.characterId)).toEqual([
      "character-1",
      "character-2"
    ]);
    expect(result.state.participants.find((entry) => entry.characterId === "character-1")?.contribution.submittedActions).toBe(1);
    expect(result.state.participants.find((entry) => entry.characterId === "character-2")?.contribution.submittedActions).toBe(1);
  });

  it("resolves a combat item as a party boss action and heals the frozen participant state", () => {
    const state = createPartyBossState({
      partySessionId: "party-item",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", { hp: 30, hpCurrent: 12, dexterity: 20 })
      ]
    });

    const result = resolvePartyBossRound({
      state: {
        ...state,
        boss: {
          ...state.boss,
          hp: 0,
          hpMax: 100,
          attack: 0,
          dexterity: 0
        }
      },
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-item",
      actions: [
        {
          characterId: "character-1",
          action: "item",
          origin: "manual",
          item: {
            id: "item.responsible-panic-bandage",
            name: "Бинт відповідальної паніки",
            effect: {
              kind: "heal-hp",
              amount: 7
            }
          }
        }
      ]
    });

    expect(result.round.actions[0]).toMatchObject({
      action: "item",
      outcome: "item-used",
      itemName: "Бинт відповідальної паніки",
      healing: 7
    });
    expect(result.state.participants[0]?.resources.hp).toBe(19);
    expect(result.state.participants[0]?.contribution.submittedActions).toBe(1);
  });

  it("applies crafted raid item healing rules and records their battle limits", () => {
    const denseState = createPartyBossState({
      partySessionId: "party-dense-item",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", { hp: 100, hpCurrent: 10, dexterity: 20 })
      ]
    });

    const denseResult = resolvePartyBossRound({
      state: {
        ...denseState,
        boss: {
          ...denseState.boss,
          hp: 0,
          hpMax: 100,
          attack: 0,
          dexterity: 0
        }
      },
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-dense-item",
      actions: [
        {
          characterId: "character-1",
          action: "item",
          origin: "manual",
          item: {
            id: "item.dense-bandage",
            name: "Щільний бинт",
            effect: {
              kind: "heal-hp",
              amount: 42
            }
          }
        }
      ]
    });

    expect(denseResult.round.actions[0]).toMatchObject({
      itemId: "item.dense-bandage",
      healing: 42
    });
    expect(denseResult.state.participants[0]?.resources.hp).toBe(52);
    expect(denseResult.state.participants[0]?.combatItems?.cooldowns?.["item.dense-bandage"]).toEqual({
      itemId: "item.dense-bandage",
      remainingTurns: 5
    });

    const fieldKitState = createPartyBossState({
      partySessionId: "party-field-kit",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", { hp: 100, hpCurrent: 10, dexterity: 20 })
      ]
    });

    const fieldKitResult = resolvePartyBossRound({
      state: {
        ...fieldKitState,
        boss: {
          ...fieldKitState.boss,
          hp: 0,
          hpMax: 100,
          attack: 0,
          dexterity: 0
        }
      },
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-field-kit",
      actions: [
        {
          characterId: "character-1",
          action: "item",
          origin: "manual",
          item: {
            id: "item.field-kit",
            name: "Польова аптечка",
            effect: {
              kind: "heal-hp-to-min-percent",
              percent: 93
            }
          }
        }
      ]
    });

    expect(fieldKitResult.round.actions[0]).toMatchObject({
      itemId: "item.field-kit",
      healing: 83,
      hpAfter: 93
    });
    expect(fieldKitResult.state.participants[0]?.resources.hp).toBe(93);
    expect(fieldKitResult.state.participants[0]?.combatItems?.uses?.["item.field-kit"]).toEqual({
      itemId: "item.field-kit",
      count: 1
    });
  });

  it("keeps party boss combat item cooldown snapshots attached to their original rounds", () => {
    const state = createPartyBossState({
      partySessionId: "party-dense-item-snapshot",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", { hp: 100, hpCurrent: 10, dexterity: 20 })
      ]
    });

    const first = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-dense-item-snapshot",
      actions: [
        {
          characterId: "character-1",
          action: "item",
          origin: "manual",
          item: {
            id: "item.dense-bandage",
            name: "Щільний бинт",
            effect: {
              kind: "heal-hp",
              amount: 42
            }
          }
        }
      ]
    });
    const second = resolvePartyBossRound({
      state: first.state,
      now: new Date("2026-06-30T10:00:46.000Z"),
      seed: "party-dense-item-snapshot",
      actions: [
        { characterId: "character-1", action: "defend", origin: "manual" }
      ]
    });

    const firstRoundSnapshot = second.state.roundLog[0]?.participantsAfter?.[0]?.combatItems?.cooldowns?.["item.dense-bandage"];
    const secondRoundSnapshot = second.state.roundLog[1]?.participantsAfter?.[0]?.combatItems?.cooldowns?.["item.dense-bandage"];

    expect(firstRoundSnapshot).toEqual({
      itemId: "item.dense-bandage",
      remainingTurns: 5
    });
    expect(secondRoundSnapshot).toEqual({
      itemId: "item.dense-bandage",
      remainingTurns: 4
    });
  });

  it("makes Big Barrel Brother hit the leader first and then the previous round top damage contributor", () => {
    let state = createPartyBossState({
      partySessionId: "big-focus",
      variant: "big-barrel",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("leader", "Голова", { hp: 120, level: 8, strength: 8, dexterity: 8 }),
        participant("striker", "Шкодійка", { hp: 120, level: 8, strength: 30, dexterity: 30 })
      ]
    });
    state = {
      ...state,
      boss: {
        ...state.boss,
        hp: 300,
        hpMax: 300,
        armor: 0,
        resist: 0,
        dexterity: 0
      }
    };

    const first = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "big-focus",
      actions: [
        { characterId: "leader", action: "defend", origin: "manual" },
        { characterId: "striker", action: "attack", origin: "manual" }
      ]
    });

    expect(first.round.bossRetaliations.map((retaliation) => retaliation.characterId)).toEqual(["leader"]);
    expect(first.round.actions.find((action) => action.characterId === "striker")?.damage).toBeGreaterThan(0);

    const second = resolvePartyBossRound({
      state: first.state,
      now: new Date("2026-06-30T10:00:46.000Z"),
      seed: "big-focus",
      actions: [
        { characterId: "leader", action: "defend", origin: "manual" },
        { characterId: "striker", action: "defend", origin: "manual" }
      ]
    });

    expect(second.round.bossRetaliations.map((retaliation) => retaliation.characterId)).toEqual(["striker"]);
  });

  it("scales Big Barrel Brother level from the current party leader instead of the average roster", () => {
    const state = createPartyBossState({
      partySessionId: "big-leader-level",
      variant: "big-barrel",
      leaderCharacterId: "leader-13",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("helper-8", "Молодша", { hp: 58, level: 8, strength: 16, dexterity: 11 }),
        participant("leader-13", "Ватажок", { hp: 82, level: 13, strength: 22, dexterity: 15 })
      ]
    });

    expect(state.boss.level).toBe(13);
  });

  it("keeps real missing resources and clamps impossible over-max snapshots to the participant max", () => {
    const state = createPartyBossState({
      partySessionId: "resource-clamp",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("wounded", "Поранена", { hp: 51, mana: 26, hpCurrent: 13, manaCurrent: 4 }),
        participant("overmax", "Переповнена", { hp: 51, mana: 26, hpCurrent: 93, manaCurrent: 42 })
      ]
    });

    expect(state.participants.find((entry) => entry.characterId === "wounded")?.resources).toMatchObject({
      hp: 13,
      hpMax: 51,
      mana: 4,
      manaMax: 26
    });
    expect(state.participants.find((entry) => entry.characterId === "overmax")?.resources).toMatchObject({
      hp: 51,
      hpMax: 51,
      mana: 26,
      manaMax: 26
    });
  });

  it("keeps Big Barrel Brother broad retaliation on a fixed fourth-turn cadence", () => {
    let state = createPartyBossState({
      partySessionId: "big-broad-cadence",
      variant: "big-barrel",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("leader", "Голова", { hp: 160, level: 8, strength: 8, dexterity: 8 }),
        participant("striker", "Шкодійка", { hp: 160, level: 8, strength: 30, dexterity: 30 })
      ]
    });
    state = {
      ...state,
      boss: {
        ...state.boss,
        hp: 500,
        hpMax: 500,
        armor: 0,
        resist: 0,
        dexterity: 0
      }
    };

    for (let turn = 1; turn <= 3; turn += 1) {
      const resolved = resolvePartyBossRound({
        state,
        now: new Date(`2026-06-30T10:0${turn}:00.000Z`),
        seed: "big-broad-cadence",
        actions: [
          { characterId: "leader", action: "defend", origin: "manual" },
          { characterId: "striker", action: "attack", origin: "manual" }
        ]
      });

      expect(resolved.round.bossRetaliations).toHaveLength(1);
      state = resolved.state;
    }

    const fourth = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:04:00.000Z"),
      seed: "big-broad-cadence",
      actions: [
        { characterId: "leader", action: "defend", origin: "manual" },
        { characterId: "striker", action: "defend", origin: "manual" }
      ]
    });

    expect(fourth.round.turn).toBe(4);
    expect(fourth.round.bossRetaliations.map((retaliation) => retaliation.characterId)).toEqual([
      "leader",
      "striker"
    ]);
    expect(fourth.round.participantsAfter).toEqual(fourth.state.participants.map((entry) => ({
      characterId: entry.characterId,
      status: entry.status,
      hp: entry.resources.hp,
      hpMax: entry.resources.hpMax,
      mana: entry.resources.mana,
      manaMax: entry.resources.manaMax
    })));
  });

  it("stays active past the old five-turn proof cap while the boss and a participant are alive", () => {
    let state = createPartyBossState({
      partySessionId: "party-old-cap",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        {
          ...participant("character-1", "Стійка"),
          combatStats: {
            ...participant("character-1", "Стійка").combatStats,
            hpMax: 300,
            hpCurrent: 300
          }
        }
      ]
    });
    state = {
      ...state,
      boss: {
        ...state.boss,
        hp: 300,
        hpMax: 300,
        attack: 1
      },
      participants: state.participants.map((entry) => ({
        ...entry,
        resources: {
          ...entry.resources,
          hp: 300,
          hpMax: 300
        }
      }))
    };

    for (let index = 0; index < 6; index += 1) {
      const resolved = resolvePartyBossRound({
        state,
        now: new Date(`2026-06-30T10:0${index}:23.000Z`),
        seed: "old-cap-proof",
        actions: [{
          characterId: "character-1",
          action: "defend",
          origin: "manual"
        }]
      });
      state = resolved.state;
    }

    expect(state.status).toBe("active");
    expect(state.turn).toBe(7);
    expect(state.boss.hp).toBeGreaterThan(0);
    expect(state.participants[0]?.resources.hp).toBeGreaterThan(0);
  });

  it("keeps the solo no-manatka/no-remort baseline below 13 percent wins by the 13-round simulation horizon", () => {
    const report = simulatePartyBoss({
      label: "solo baseline: no manatka or remort help",
      participants: [participant("solo", "Соло")],
      actionFor: () => "attack"
    });

    expect(report.winRate).toBeLessThanOrEqual(0.13);
  });

  it("keeps the intended prepared proof party near 42 percent wins by the 13-round simulation horizon", () => {
    const report = simulatePartyBoss({
      label: "prepared three-person proof party",
      participants: [
        participant("warrior", "Воїн", { hp: 30, level: 3, strength: 8, dexterity: 7, intelligence: 6, charisma: 6, luck: 6 }),
        participant("mage", "Маг", { hp: 28, mana: 18, level: 3, strength: 6, dexterity: 7, intelligence: 12, charisma: 6, luck: 6, classId: "class.mage" }),
        participant("bard", "Бард", { hp: 28, mana: 16, level: 3, strength: 6, dexterity: 8, intelligence: 6, charisma: 9, luck: 6, classId: "class.bard" })
      ],
      actionFor: (_participant, turn) => turn % 3 === 0 ? "skill" : "attack"
    });

    expect(report.winRate).toBeGreaterThanOrEqual(0.35);
    expect(report.winRate).toBeLessThanOrEqual(0.49);
  });

  it("keeps Big Barrel Brother active beyond the 13-round simulation horizon when no terminal condition occurs", () => {
    let state = createPartyBossState({
      partySessionId: "big-no-cap",
      variant: "big-barrel",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [participant("big-tank", "Стійка", { hp: 500, level: 8 })]
    });
    state = {
      ...state,
      boss: {
        ...state.boss,
        hp: 500,
        hpMax: 500,
        attack: 1
      }
    };

    for (let turn = 1; turn <= 14; turn += 1) {
      const resolved = resolvePartyBossRound({
        state,
        now: new Date(`2026-06-30T10:${turn.toString().padStart(2, "0")}:00.000Z`),
        seed: "big-no-cap",
        actions: [{
          characterId: "big-tank",
          action: "defend",
          origin: "manual"
        }]
      });
      state = resolved.state;
    }

    expect(state.status).toBe("active");
    expect(state.turn).toBe(15);
  });

  it("keeps the Big Barrel Brother solo no-manatka/no-remort baseline below 13 percent by the 13-round horizon", () => {
    const report = simulatePartyBoss({
      label: "big solo baseline",
      variant: "big-barrel",
      participants: [participant("solo", "Соло", { level: 8, hp: 52, mana: 18, strength: 14, dexterity: 10, intelligence: 8, charisma: 8, luck: 8 })],
      actionFor: () => "attack"
    });

    expect(report.winRate).toBeLessThanOrEqual(0.13);
  });

  it("keeps the prepared Big Barrel Brother entry party near 42 percent by the 13-round horizon", () => {
    const report = simulatePartyBoss({
      label: "big prepared entry party",
      variant: "big-barrel",
      participants: [
        participant("warrior", "Воїн", { hp: 58, mana: 18, level: 8, strength: 16, dexterity: 11, intelligence: 8, charisma: 8, luck: 8 }),
        participant("mage", "Маг", { hp: 50, mana: 28, level: 8, strength: 8, dexterity: 10, intelligence: 17, charisma: 9, luck: 8, classId: "class.mage" }),
        participant("bard", "Бард", { hp: 52, mana: 26, level: 8, strength: 9, dexterity: 11, intelligence: 9, charisma: 17, luck: 9, classId: "class.bard" })
      ],
      actionFor: (_participant, turn) => turn % 3 === 0 ? "skill" : "attack"
    });

    expect(report.winRate).toBeGreaterThanOrEqual(0.35);
    expect(report.winRate).toBeLessThanOrEqual(0.49);
  });

  it("keeps full same-level Big Barrel Brother parties inside the 75 to 93 percent target band", () => {
    const level8Report = simulatePartyBoss({
      label: "big full same-level party: level 8",
      variant: "big-barrel",
      participants: fullBigBarrelParty(8),
      actionFor: (_participant, turn) => turn % 3 === 0 ? "skill" : "attack"
    });
    const level13Report = simulatePartyBoss({
      label: "big full same-level party: level 13",
      variant: "big-barrel",
      participants: fullBigBarrelParty(13),
      actionFor: (_participant, turn) => turn % 3 === 0 ? "skill" : "attack"
    });

    expect(level8Report.winRate).toBeGreaterThanOrEqual(0.75);
    expect(level8Report.winRate).toBeLessThanOrEqual(0.93);
    expect(level13Report.winRate).toBeGreaterThanOrEqual(0.75);
    expect(level13Report.winRate).toBeLessThanOrEqual(0.93);
  });

  it("makes a level 13 Big Barrel Brother leader with lower-level joiners substantially harder", () => {
    const report = simulatePartyBoss({
      label: "big level 13 leader with lower-level joiners",
      variant: "big-barrel",
      leaderCharacterId: "leader",
      participants: [
        participant("leader", "Ватажок", { hp: 82, mana: 20, level: 13, strength: 22, dexterity: 15, intelligence: 8, charisma: 8, luck: 8 }),
        ...fullBigBarrelParty(8).slice(1)
      ],
      actionFor: (_participant, turn) => turn % 3 === 0 ? "skill" : "attack"
    });

    expect(report.winRate).toBeLessThanOrEqual(0.13);
  });
});

function simulatePartyBoss(input: {
  label: string;
  variant?: "proof" | "big-barrel";
  leaderCharacterId?: string;
  participants: ReturnType<typeof participant>[];
  actionFor: (participant: PartyBossState["participants"][number], turn: number) => PartyBossActionKey;
}): { label: string; wins: number; losses: number; unresolvedByHorizon: number; winRate: number } {
  let wins = 0;
  let losses = 0;
  let unresolvedByHorizon = 0;

  for (let run = 0; run < PARTY_BOSS_SIMULATION_RUNS; run += 1) {
    const participants = input.participants.map((entry, index) => ({
      ...entry,
      characterId: `${entry.characterId}-${run}-${index}`
    }));
    const leaderIndex = input.leaderCharacterId
      ? input.participants.findIndex((entry) => entry.characterId === input.leaderCharacterId)
      : -1;
    const leaderInput = leaderIndex >= 0 && participants[leaderIndex]
      ? { leaderCharacterId: participants[leaderIndex].characterId }
      : {};
    let state = createPartyBossState({
      partySessionId: `${input.label}:${run}`,
      variant: input.variant,
      ...leaderInput,
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants
    });

    for (
      let turn = 1;
      turn <= PARTY_BOSS_SIMULATION_HORIZON_TURNS && state.status === "active";
      turn += 1
    ) {
      const actions = state.participants
        .filter((entry) => entry.status === "active" && entry.resources.hp > 0)
        .map((entry) => ({
          characterId: entry.characterId,
          action: input.actionFor(entry, turn),
          origin: "manual" as const
        }));

      const resolved = resolvePartyBossRound({
        state,
        now: new Date(`2026-06-30T10:${turn.toString().padStart(2, "0")}:00.000Z`),
        seed: `${input.label}:${run}`,
        actions
      });
      state = resolved.state;
    }

    if (state.status === "won") {
      wins += 1;
    } else if (state.status === "lost") {
      losses += 1;
    } else {
      unresolvedByHorizon += 1;
    }
  }

  return {
    label: input.label,
    wins,
    losses,
    unresolvedByHorizon,
    winRate: wins / PARTY_BOSS_SIMULATION_RUNS
  };
}

function fullBigBarrelParty(level: 8 | 13): ReturnType<typeof participant>[] {
  const high = level >= 13;

  return [
    participant("warrior-1", "Воїн 1", { hp: high ? 82 : 58, mana: 20, level, strength: high ? 22 : 16, dexterity: high ? 15 : 11, intelligence: 8, charisma: 8, luck: 8 }),
    participant("warrior-2", "Воїн 2", { hp: high ? 82 : 58, mana: 20, level, strength: high ? 22 : 16, dexterity: high ? 15 : 11, intelligence: 8, charisma: 8, luck: 8 }),
    participant("mage-1", "Маг 1", { hp: high ? 70 : 50, mana: high ? 36 : 28, level, strength: 9, dexterity: high ? 14 : 10, intelligence: high ? 24 : 17, charisma: 9, luck: 8, classId: "class.mage" }),
    participant("mage-2", "Маг 2", { hp: high ? 70 : 50, mana: high ? 36 : 28, level, strength: 9, dexterity: high ? 14 : 10, intelligence: high ? 24 : 17, charisma: 9, luck: 8, classId: "class.mage" }),
    participant("bard-1", "Бард 1", { hp: high ? 72 : 52, mana: high ? 34 : 26, level, strength: 9, dexterity: high ? 14 : 11, intelligence: 9, charisma: high ? 24 : 17, luck: 9, classId: "class.bard" }),
    participant("bard-2", "Бард 2", { hp: high ? 72 : 52, mana: high ? 34 : 26, level, strength: 9, dexterity: high ? 14 : 11, intelligence: 9, charisma: high ? 24 : 17, luck: 9, classId: "class.bard" }),
    participant("rogue-1", "Розбій 1", { hp: high ? 76 : 54, mana: 22, level, strength: high ? 18 : 14, dexterity: high ? 24 : 17, intelligence: 9, charisma: 10, luck: high ? 15 : 10, classId: "class.rogue" }),
    participant("rogue-2", "Розбій 2", { hp: high ? 76 : 54, mana: 22, level, strength: high ? 18 : 14, dexterity: high ? 24 : 17, intelligence: 9, charisma: 10, luck: high ? 15 : 10, classId: "class.rogue" })
  ];
}

function participant(
  characterId: string,
  name: string,
  overrides: {
    hp?: number;
    mana?: number;
    level?: number;
    strength?: number;
    dexterity?: number;
    intelligence?: number;
    charisma?: number;
    luck?: number;
    classId?: string;
    hpCurrent?: number;
    manaCurrent?: number;
    equipmentAbilityGrantIds?: string[];
  } = {}
) {
  const strength = overrides.strength ?? 8;
  const intelligence = overrides.intelligence ?? 5;

  return {
    characterId,
    name,
    remortCount: 0,
    combatStats: {
      level: overrides.level ?? 3,
      hpMax: overrides.hp ?? 30,
      manaMax: overrides.mana ?? 12,
      hpCurrent: overrides.hpCurrent ?? overrides.hp ?? 30,
      manaCurrent: overrides.manaCurrent ?? overrides.mana ?? 12,
      strength,
      dexterity: overrides.dexterity ?? 6,
      intelligence,
      charisma: overrides.charisma ?? 5,
      luck: overrides.luck ?? 5,
      raceId: "race.human-ish",
      classId: overrides.classId ?? "class.warrior",
      armor: Math.max(0, Math.floor(strength / 3)),
      resist: Math.max(0, Math.floor(intelligence / 3)),
      weaponDamage: 1 + Math.max(0, Math.floor(strength / 4)),
      spellPower: 1 + Math.max(0, Math.floor(intelligence / 4))
    },
    ...(overrides.equipmentAbilityGrantIds ? { equipmentAbilityGrantIds: overrides.equipmentAbilityGrantIds } : {})
  };
}
