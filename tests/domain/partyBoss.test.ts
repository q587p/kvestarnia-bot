import type { PartyBossActionKey, PartyBossState } from "../../src/domain/partyBoss/partyBoss";
import { describe, expect, it } from "vitest";
import {
  createPartyBossState,
  getWarriorRaidTauntAvailability,
  resolvePartyBossRound
} from "../../src/domain/partyBoss/partyBoss";
import { findMantokAbilityGrantByKey } from "../../src/content";
import { getVarenykSatedRemainingCombatTurns } from "../../src/domain/noncombat/varenykSatedSupport";
import { getBardInspirationRemainingCombatTurns } from "../../src/domain/noncombat/bardSupport";

const PARTY_BOSS_SIMULATION_HORIZON_TURNS = 13;
const PARTY_BOSS_SIMULATION_RUNS = 400;

describe("party boss reducer", () => {
  it("grants one Sated pulse after Big Barrel retaliation", () => {
    const startedAt = new Date("2026-07-14T10:00:00.000Z");
    const state = createPartyBossState({
      partySessionId: "big-barrel-sated",
      variant: "big-barrel",
      now: startedAt,
      participants: [participant("character-1", "Вареник", { hp: 30, hpCurrent: 20, mana: 12, manaCurrent: 4 })]
    });
    state.participants[0]!.varenykSated = {
      version: 1,
      activationId: "sated-activation",
      recipientCharacterId: "character-1",
      recipientRemortCount: 0,
      rank: 2,
      expiresAt: new Date(startedAt.getTime() + 13 * 60_000).toISOString(),
      cursorAt: startedAt.toISOString(),
      leaseStartedAt: startedAt.toISOString(),
      outsideRemainderMs: 0,
      pulseIds: []
    };
    state.participants[0]!.bardInspiration = {
      version: 1,
      activationId: "inspiration-activation",
      sourcePerformanceId: "performance-big-barrel",
      sourceLocationId: "location.korchma.barrel",
      recipientCharacterId: "character-1",
      recipientRemortCount: 0,
      grade: "legendary",
      accuracyBonusPp: 5,
      expiresAt: new Date(startedAt.getTime() + 13 * 60_000).toISOString(),
      cursorAt: startedAt.toISOString(),
      leaseStartedAt: startedAt.toISOString(),
      outsideRemainderMs: 0,
      pulseIds: []
    };
    state.bardMusic = { kind: "inspiration", sourcePerformanceIds: ["performance-big-barrel"] };

    const resolved = resolvePartyBossRound({
      state,
      now: new Date(startedAt.getTime() + 60_000),
      seed: "big-barrel-sated",
      actions: [{ characterId: "character-1", action: "defend", origin: "manual" }]
    });

    expect(resolved.round.actions[0]?.satedRecovery).toEqual({ hpRestored: 2, manaRestored: 1 });
    expect(resolved.round.bossRetaliations[0]?.hpAfter).toBe(9);
    expect(resolved.round.actions[0]?.hpAfter).toBe(11);
    expect(resolved.state.participants[0]?.resources.hp).toBe(11);
    expect(resolved.state.participants[0]?.varenykSated?.pulseIds).toEqual([
      "sated-activation:big-barrel:big-barrel-sated:1:character-1"
    ]);
    expect(getVarenykSatedRemainingCombatTurns(
      resolved.state.participants[0]!.varenykSated!
    )).toBe(12);
    expect(resolved.round.participantsAfter?.[0]?.varenykSated?.pulseIds).toEqual([
      "sated-activation:big-barrel:big-barrel-sated:1:character-1"
    ]);
    expect(resolved.state.participants[0]?.bardInspiration?.pulseIds).toEqual([
      "inspiration-activation:big-barrel:big-barrel-sated:1:character-1"
    ]);
    expect(getBardInspirationRemainingCombatTurns(
      resolved.state.participants[0]!.bardInspiration!
    )).toBe(12);
    expect(resolved.round.participantsAfter?.[0]?.bardInspiration?.pulseIds).toEqual([
      "inspiration-activation:big-barrel:big-barrel-sated:1:character-1"
    ]);
  });

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

  it("spends Lament as a zero-damage action and reduces one focused boss response", () => {
    const state = createPartyBossState({
      partySessionId: "big-barrel-lament-focused",
      variant: "big-barrel",
      now: new Date("2026-07-18T10:00:00.000Z"),
      participants: [participant("bard", "Бард", { classId: "class.bard", charisma: 17 })]
    });
    state.boss.hp = 999;
    state.bardMusic = {
      kind: "lament",
      activationId: "lament-focused",
      sourceCharacterId: "bard",
      grade: "success",
      damageReduction: 3,
      remainingBossResponses: 8,
      activatedTurn: 1
    };

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-07-18T10:00:23.000Z"),
      seed: "lament-focused",
      actions: [{ characterId: "bard", action: "lament", origin: "manual" }]
    });

    expect(result.round.actions[0]).toMatchObject({
      action: "lament",
      outcome: "lament-activated",
      damage: 0,
      manaSpent: 0
    });
    expect(result.round.bossDamage).toBe(0);
    expect(result.round.bossHpAfter).toBe(999);
    expect(typeof result.round.bossRetaliations[0]?.damageBeforeLament).toBe("number");
    expect(result.round.bossRetaliations[0]?.lamentPreventedDamage).toBe(3);
    expect(result.round.bardMusic).toMatchObject({
      activated: true,
      remainingBossResponses: 7,
      expired: false
    });
  });

  it("reduces every target in one broad response but spends only one Lament response", () => {
    const state = createPartyBossState({
      partySessionId: "big-barrel-lament-broad",
      variant: "big-barrel",
      now: new Date("2026-07-18T10:00:00.000Z"),
      participants: [
        participant("bard", "Бард", { classId: "class.bard", charisma: 17 }),
        participant("ally", "Союзник")
      ]
    });
    state.turn = 4;
    state.boss.attack = 20;
    state.bardMusic = {
      kind: "lament",
      activationId: "lament-broad",
      sourceCharacterId: "bard",
      grade: "success",
      damageReduction: 3,
      remainingBossResponses: 2,
      activatedTurn: 4
    };

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-07-18T10:01:32.000Z"),
      seed: "lament-broad",
      actions: [
        { characterId: "bard", action: "lament", origin: "manual" },
        { characterId: "ally", action: "defend", origin: "manual" }
      ]
    });

    expect(result.round.bossRetaliations).toHaveLength(2);
    expect(result.round.bossRetaliations.every((entry) => entry.lamentPreventedDamage === 3)).toBe(true);
    expect(result.round.bardMusic?.remainingBossResponses).toBe(1);
  });

  it("applies Lament after guard reductions and before the broad Ward", () => {
    const state = createPartyBossState({
      partySessionId: "big-barrel-lament-order",
      variant: "big-barrel",
      now: new Date("2026-07-18T10:00:00.000Z"),
      participants: [participant("bard", "Бард", { classId: "class.bard", charisma: 17 })],
      wardSign: {
        kind: "kharakternyk",
        placerCharacterId: "bard",
        supportCount: 1
      }
    });
    state.turn = 4;
    state.boss.attack = 20;
    state.bardMusic = {
      kind: "lament",
      activationId: "lament-order",
      sourceCharacterId: "bard",
      grade: "success",
      damageReduction: 3,
      remainingBossResponses: 1,
      activatedTurn: 4
    };

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-07-18T10:01:32.000Z"),
      seed: "lament-order",
      actions: [{ characterId: "bard", action: "defend", origin: "manual" }]
    });
    const retaliation = result.round.bossRetaliations[0]!;

    expect(retaliation.lamentPreventedDamage).toBe(3);
    expect(retaliation.damageBeforeWard).toBe(retaliation.damageBeforeLament! - 3);
    expect(retaliation.wardPreventedDamage).toBe(
      Math.floor(retaliation.damageBeforeWard! * state.wardSign!.mitigationPercent / 100)
    );
    expect(result.round.bardMusic).toMatchObject({ remainingBossResponses: 0, expired: true });
  });

  it("allows Lament to reduce a boss response to zero damage", () => {
    const state = createPartyBossState({
      partySessionId: "big-barrel-lament-zero",
      variant: "big-barrel",
      now: new Date("2026-07-18T10:00:00.000Z"),
      participants: [participant("bard", "Бард", { classId: "class.bard", charisma: 17 })]
    });
    state.boss.attack = 1;
    state.bardMusic = {
      kind: "lament",
      activationId: "lament-zero",
      sourceCharacterId: "bard",
      grade: "great",
      damageReduction: 5,
      remainingBossResponses: 1,
      activatedTurn: 1
    };

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-07-18T10:00:23.000Z"),
      seed: "lament-zero",
      actions: [{ characterId: "bard", action: "lament", origin: "manual" }]
    });

    expect(result.round.bossRetaliations[0]).toMatchObject({
      damage: 0,
      damageBeforeLament: 2,
      lamentPreventedDamage: 2
    });
    expect(result.state.participants[0]?.resources.hp).toBe(30);
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

  it("applies Priest healing to the lowest ally and protection to the whole party", () => {
    const state = createPartyBossState({
      partySessionId: "party-priest-support",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("priest", "Жриця", { classId: "class.priest", charisma: 15 }),
        participant("ally", "Союзник", { hp: 30, hpCurrent: 10 })
      ]
    });

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-priest-support",
      actions: [
        { characterId: "priest", action: "skill", origin: "manual" },
        { characterId: "ally", action: "defend", origin: "manual" }
      ]
    });

    const action = result.round.actions.find((entry) => entry.characterId === "priest");
    expect(action?.supportTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({ characterId: "priest", guard: 2 }),
      expect.objectContaining({ characterId: "ally", healing: 7, guard: 2 })
    ]));
    expect(result.state.participants.find((entry) => entry.characterId === "ally")?.resources.hp).toBeGreaterThan(10);
  });

  it.each([
    ["priest-first", ["supporter", "ally"]],
    ["priest-last", ["ally", "supporter"]]
  ] as const)("keeps Priest ally healing and guard independent of roster order: %s", (_label, roster) => {
    const entries = new Map([
      ["supporter", participant("supporter", "Жриця", { classId: "class.priest", charisma: 15 })],
      ["ally", participant("ally", "Союзник", { hp: 30, hpCurrent: 10 })]
    ]);
    const state = createPartyBossState({
      partySessionId: `party-priest-order-${roster.join("-")}`,
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: roster.map((id) => entries.get(id)!)
    });
    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: `party-priest-order-${roster.join("-")}`,
      actions: [
        { characterId: "supporter", action: "skill", origin: "manual" },
        { characterId: "ally", action: "attack", origin: "manual" }
      ]
    });
    const ally = result.state.participants.find((entry) => entry.characterId === "ally")!;
    expect(ally.resources.guard?.abilityDamageReduction).toBe(2);
    expect(ally.resources.hp).toBeGreaterThan(10);
  });

  it.each([
    ["gear-first", ["supporter", "ally"]],
    ["gear-last", ["ally", "supporter"]]
  ] as const)("keeps equipment ally guard independent of roster order: %s", (_label, roster) => {
    const grant = findMantokAbilityGrantByKey("ascstf");
    if (!grant?.combat) throw new Error("Expected Asclepius staff combat grant.");
    const entries = new Map([
      ["supporter", participant("supporter", "Цілитель", { level: 11, equipmentAbilityGrantIds: [grant.id] })],
      ["ally", participant("ally", "Союзник", { hp: 30, hpCurrent: 10 })]
    ]);
    const state = createPartyBossState({
      partySessionId: `party-gear-order-${roster.join("-")}`,
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: roster.map((id) => entries.get(id)!)
    });
    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: `party-gear-order-${roster.join("-")}`,
      actions: [
        { characterId: "supporter", action: "gear", origin: "manual", gearAbility: { profile: grant.combat.profile } },
        { characterId: "ally", action: "attack", origin: "manual" }
      ]
    });
    const ally = result.state.participants.find((entry) => entry.characterId === "ally")!;
    expect(ally.resources.guard?.abilityDamageReduction).toBe(1);
    expect(result.round.actions.find((entry) => entry.characterId === "supporter")?.supportTargets).toEqual(
      expect.arrayContaining([expect.objectContaining({ characterId: "ally", healing: 4, guard: 1 })])
    );
  });

  it("applies the Molfar fog guard and counter to every living party member", () => {
    const state = createPartyBossState({
      partySessionId: "party-molfar-support",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("molfar", "Мольфар", { raceId: "race.molfar-soul", intelligence: 15 }),
        participant("ally", "Союзниця")
      ]
    });

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-molfar-support",
      actions: [
        { characterId: "molfar", action: "race", origin: "manual" },
        { characterId: "ally", action: "defend", origin: "manual" }
      ]
    });

    const action = result.round.actions.find((entry) => entry.characterId === "molfar");
    expect(action?.supportTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({ characterId: "molfar", guard: 3, counterDamage: 3 }),
      expect.objectContaining({ characterId: "ally", guard: 3, counterDamage: 3 })
    ]));
    expect(result.round.bossRetaliations.some((entry) => entry.counterDamage === 3)).toBe(true);
  });

  it.each([
    ["supporter-first", "attack", ["molfar", "ally"]],
    ["supporter-first", "defend", ["molfar", "ally"]],
    ["supporter-last", "attack", ["ally", "molfar"]],
    ["supporter-last", "defend", ["ally", "molfar"]]
  ] as const)("keeps ally protection through the ally action: %s/%s", (_order, allyAction, roster) => {
    const entries = new Map([
      ["molfar", participant("molfar", "Мольфар", { raceId: "race.molfar-soul", intelligence: 15 })],
      ["ally", participant("ally", "Союзник")]
    ]);
    const state = createPartyBossState({
      partySessionId: `party-order-${roster.join("-")}-${allyAction}`,
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: roster.map((id) => entries.get(id)!)
    });
    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: `party-order-${roster.join("-")}-${allyAction}`,
      actions: [
        { characterId: "molfar", action: "race", origin: "manual" },
        { characterId: "ally", action: allyAction, origin: "manual" }
      ]
    });

    expect(result.state.participants.find((entry) => entry.characterId === "ally")?.resources.guard?.abilityDamageReduction).toBe(3);
    expect(result.round.actions.find((entry) => entry.characterId === "molfar")?.supportTargets).toEqual(
      expect.arrayContaining([expect.objectContaining({ characterId: "ally", guard: 3, counterDamage: 3 })])
    );
  });

  it("does not apply Molfar counter through zero damage", () => {
    const state = createPartyBossState({
      partySessionId: "party-molfar-zero",
      variant: "big-barrel",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("molfar", "Мольфар", { raceId: "race.molfar-soul", intelligence: 15 }),
        participant("ally", "Союзник")
      ],
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-zero",
        filerCharacterId: "molfar",
        signerCharacterIds: ["molfar", "ally"]
      }
    });
    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-molfar-zero",
      actions: [
        { characterId: "molfar", action: "race", origin: "manual" },
        { characterId: "ally", action: "attack", origin: "manual" }
      ]
    });
    expect(result.round.bossRetaliations).toHaveLength(1);
    expect(result.round.bossRetaliations[0]).toMatchObject({ damage: 0 });
    expect(result.round.bossRetaliations[0]?.counterDamage).toBeUndefined();
  });

  it("does not apply Molfar counter after lethal damage or a full wipe", () => {
    const state = createPartyBossState({
      partySessionId: "party-molfar-lethal",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("molfar", "Мольфар", { hp: 1, hpCurrent: 1, raceId: "race.molfar-soul", intelligence: 15 }),
        participant("ally", "Союзник", { hp: 1, hpCurrent: 1 })
      ]
    });
    state.boss.attack = 587;
    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-molfar-lethal",
      actions: [
        { characterId: "molfar", action: "race", origin: "manual" },
        { characterId: "ally", action: "defend", origin: "manual" }
      ]
    });
    expect(result.state.status).toBe("lost");
    expect(result.round.bossRetaliations).toHaveLength(2);
    expect(result.round.bossRetaliations.every((entry) => entry.hpAfter === 0 && entry.counterDamage === undefined)).toBe(true);
  });

  it("skips retaliation and Molfar counter when participant actions kill the boss", () => {
    const state = createPartyBossState({
      partySessionId: "party-molfar-boss-kill",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [participant("molfar", "Мольфар", {
        raceId: "race.molfar-soul", intelligence: 30, dexterity: 30
      })]
    });
    state.boss = { ...state.boss, hp: 1, hpMax: 1, armor: 0, resist: 0, dexterity: 0 };
    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-molfar-boss-kill",
      actions: [{ characterId: "molfar", action: "attack", origin: "manual" }]
    });
    expect(result.state.status).toBe("won");
    expect(result.round.bossRetaliations).toEqual([]);
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

  it("restores the actor's resources with the explicit dual-resource consumable", () => {
    const state = createPartyBossState({
      partySessionId: "party-mana-item",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [participant("character-1", "Перша", { mana: 20, manaCurrent: 2 })]
    });
    const result = resolvePartyBossRound({
      state: { ...state, boss: { ...state.boss, hp: 0, attack: 0 } },
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-mana-item",
      actions: [{
        characterId: "character-1",
        action: "item",
        origin: "manual",
        item: {
          id: "item.loot-v1-c014",
          name: "Насіння Диванного Друїда",
          effect: { kind: "restore-both", hpAmount: 9, manaAmount: 9 }
        }
      }]
    });

    expect(result.round.actions[0]).toMatchObject({
      outcome: "item-used",
      manaRestored: 9
    });
    expect(result.state.participants[0]?.resources.mana).toBe(11);
    expect(result.state.participants[0]?.contribution.healingDone ?? 0).toBe(0);
  });

  it("heals every living raid participant by thirteen and replays the seeded round exactly", () => {
    const state = createPartyBossState({
      partySessionId: "party-raid-salad",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", { hp: 50, hpCurrent: 10 }),
        participant("character-2", "Друга", { hp: 50, hpCurrent: 20 }),
        participant("character-3", "Третя", { hp: 50, hpCurrent: 30 })
      ]
    });
    state.boss.attack = 0;
    const input = {
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-raid-salad",
      actions: [
        {
          characterId: "character-1",
          action: "item" as const,
          origin: "manual" as const,
          item: {
            id: "item.loot-v1-c012",
            name: "Салат «Олів'є Рейдовий»",
            effect: { kind: "party-heal" as const, amount: 13 }
          }
        },
        { characterId: "character-2", action: "defend" as const, origin: "manual" as const },
        { characterId: "character-3", action: "defend" as const, origin: "manual" as const }
      ]
    };

    const first = resolvePartyBossRound(structuredClone(input));
    const replay = resolvePartyBossRound(structuredClone(input));
    expect(first.state.participants.map((entry) => entry.resources.hp)).toEqual([22, 32, 42]);
    expect(first.round.actions[0]).toMatchObject({ healing: 13, supportTargets: [
      { characterId: "character-2", healing: 13 },
      { characterId: "character-3", healing: 13 }
    ] });
    expect(replay).toEqual(first);
  });

  it.each([
    ["item.loot-v1-c002", "Вареники Парного Бафу", { kind: "paired-heal" as const, amount: 8 }],
    ["item.loot-v1-c012", "Салат «Олів'є Рейдовий»", { kind: "party-heal" as const, amount: 13 }]
  ])("does not spend %s after an earlier raid salad fully heals the shared round", (itemId, name, effect) => {
    const state = createPartyBossState({
      partySessionId: `party-shared-full-${itemId}`,
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", { hp: 50, hpCurrent: 37, dexterity: 93 }),
        participant("character-2", "Друга", { hp: 50, hpCurrent: 37, dexterity: 1 })
      ]
    });
    state.boss.attack = 0;
    state.participants.forEach((entry) => {
      entry.resources.hp = entry.resources.hpMax - 13;
    });

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: `party-shared-full-${itemId}`,
      actions: [
        {
          characterId: "character-1",
          action: "item",
          origin: "manual",
          item: {
            id: "item.loot-v1-c012",
            name: "Салат «Олів'є Рейдовий»",
            effect: { kind: "party-heal", amount: 13 }
          }
        },
        {
          characterId: "character-2",
          action: "item",
          origin: "manual",
          item: { id: itemId, name, effect }
        }
      ]
    });

    expect(result.state.participants.map((entry) => entry.resources.hp)).toEqual(
      result.state.participants.map((entry) => entry.resources.hpMax - 1)
    );
    expect(result.round.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ characterId: "character-1", outcome: "item-used" }),
      expect.objectContaining({
        characterId: "character-2",
        outcome: "item-not-used",
        itemUnavailableReason: "effect-unavailable"
      })
    ]));
    expect(result.state.participants[1]?.combatItems?.uses?.[itemId]).toBeUndefined();
  });

  it("still spends the second raid salad when the earlier heal leaves useful recovery", () => {
    const state = createPartyBossState({
      partySessionId: "party-shared-partial",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("character-1", "Перша", { hp: 50, hpCurrent: 10, dexterity: 93 }),
        participant("character-2", "Друга", { hp: 50, hpCurrent: 10, dexterity: 1 })
      ]
    });
    state.boss.attack = 0;
    const salad = {
      id: "item.loot-v1-c012",
      name: "Салат «Олів'є Рейдовий»",
      effect: { kind: "party-heal" as const, amount: 13 }
    };

    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "party-shared-partial",
      actions: [
        { characterId: "character-1", action: "item", origin: "manual", item: salad },
        { characterId: "character-2", action: "item", origin: "manual", item: salad }
      ]
    });

    expect(result.state.participants.map((entry) => entry.resources.hp)).toEqual([35, 35]);
    expect(result.round.actions.map((entry) => entry.outcome)).toEqual(["item-used", "item-used"]);
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

  it.each([
    ["none", undefined, "item-not-used"],
    ["one", { skill: { id: "skill.test", remainingTurns: 1 } }, "item-not-used"],
    ["two", { skill: { id: "skill.test", remainingTurns: 2 } }, "item-used"],
    ["mixed", {
      skill: { id: "skill.test", remainingTurns: 1 },
      abilities: { "ability.test": { id: "ability.test", remainingTurns: 2 } }
    }, "item-used"]
  ] as const)("uses party-boss c005 only when post-tick cooldown benefit remains: %s", (_label, cooldowns, outcome) => {
    const state = createPartyBossState({
      partySessionId: `party-c005-${_label}`,
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [participant("coffee", "Кавоман")]
    });
    state.boss.attack = 0;
    if (cooldowns) state.participants[0]!.resources.cooldowns = structuredClone(cooldowns);
    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: `party-c005-${_label}`,
      actions: [{
        characterId: "coffee",
        action: "item",
        origin: "manual",
        item: { id: "item.loot-v1-c005", name: "Кава", effect: { kind: "reduce-cooldowns", turns: 1 } }
      }]
    });

    expect(result.round.actions[0]).toMatchObject({
      outcome,
      ...(outcome === "item-not-used" ? { itemUnavailableReason: "effect-unavailable" } : {})
    });
    expect(result.state.participants[0]?.resources.cooldowns).toBeUndefined();
    expect(result.state.participants[0]?.contribution.itemUses ?? 0).toBe(outcome === "item-used" ? 1 : 0);
  });

  it.each([
    ["item.loot-v1-c006", { kind: "guard-response" as const, reductionPercent: 42 }, "guard"],
    ["item.loot-v1-c013", { kind: "evade-response" as const }, "evade"],
    ["item.cellar.fancy-cheese", { kind: "evade-response" as const }, "evade"]
  ])("commits targeted party-boss response item %s with exact retaliation evidence", (itemId, effect, kind) => {
    const state = createPartyBossState({
      partySessionId: `party-response-${itemId}`,
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [participant("owner", "Власник", { hp: 100 })]
    });
    state.boss.attack = 20;
    const input = {
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: `party-response-${itemId}`,
      actions: [{
        characterId: "owner",
        action: "item" as const,
        origin: "manual" as const,
        item: { id: itemId, name: "Манатка відповіді", effect }
      }]
    };
    const first = resolvePartyBossRound(structuredClone(input));
    const replay = resolvePartyBossRound(structuredClone(input));

    expect(first.round.actions[0]).toMatchObject({ outcome: "item-used" });
    expect(first.round.bossRetaliations[0]).toMatchObject({
      characterId: "owner",
      itemResponseItemId: itemId,
      itemResponseKind: kind
    });
    expect(first.round.bossRetaliations[0]?.itemResponsePreventedDamage).toBeGreaterThan(0);
    expect(replay).toEqual(first);
  });

  it.each([
    ["leader", "item-used", true],
    ["striker", "item-not-used", false]
  ] as const)("commits a Big Barrel response item only when %s owns the focused response", (ownerId, outcome, targeted) => {
    const state = createPartyBossState({
      partySessionId: `big-response-${ownerId}`,
      variant: "big-barrel",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [
        participant("leader", "Голова", { hp: 120, level: 8 }),
        participant("striker", "Шкодійка", { hp: 120, level: 8 })
      ]
    });
    state.boss.attack = 20;
    const result = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: `big-response-${ownerId}`,
      actions: ["leader", "striker"].map((characterId) => characterId === ownerId
        ? {
            characterId,
            action: "item" as const,
            origin: "manual" as const,
            item: { id: "item.loot-v1-c013", name: "Млинці", effect: { kind: "evade-response" as const } }
          }
        : { characterId, action: "defend" as const, origin: "manual" as const })
    });

    expect(result.round.actions.find((entry) => entry.characterId === ownerId)).toMatchObject({
      outcome,
      ...(targeted ? {} : { itemUnavailableReason: "effect-unavailable" })
    });
    expect(result.round.bossRetaliations[0]?.characterId).toBe("leader");
    expect(result.round.bossRetaliations[0]?.itemResponseKind).toBe(targeted ? "evade" : undefined);
    expect(result.state.participants.find((entry) => entry.characterId === ownerId)?.contribution.itemUses ?? 0).toBe(targeted ? 1 : 0);
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

  it("activates Warrior Taunt before the same-round focused response and expires after exactly three boss attacks", () => {
    let state = createPartyBossState({
      partySessionId: "big-warrior-taunt-duration",
      variant: "big-barrel",
      now: new Date("2026-07-11T10:00:00.000Z"),
      participants: [
        participant("leader", "Маг", { hp: 999, level: 8, classId: "class.mage" }),
        participant("warrior", "Воїн", { hp: 999, level: 8, strength: 60, classId: "class.warrior" })
      ]
    });

    for (let turn = 1; turn <= 3; turn += 1) {
      const resolved = resolvePartyBossRound({
        state,
        now: new Date(`2026-07-11T10:0${turn}:00.000Z`),
        seed: "big-warrior-taunt-duration",
        actions: [
          { characterId: "leader", action: "defend", origin: "manual" },
          { characterId: "warrior", action: turn === 1 ? "taunt" : "defend", origin: "manual" }
        ]
      });

      expect(resolved.round.bossRetaliations).toHaveLength(1);
      expect(resolved.round.bossRetaliations[0]).toMatchObject({
        characterId: "warrior",
        tauntRedirected: true
      });
      if (turn < 3) {
        expect(resolved.round.warriorTaunt?.bossAttacksRemaining).toBe(3 - turn);
      } else {
        expect(resolved.round.warriorTaunt).toMatchObject({ expiredCharacterId: "warrior" });
        expect(resolved.round.warriorTaunt?.bossAttacksRemaining).toBeUndefined();
      }
      state = resolved.state;
    }

    expect(state.warriorTaunt?.active).toBeUndefined();
    expect(state.warriorTaunt?.cooldowns.warrior).toEqual({ availableTurn: 6 });
    expect(getWarriorRaidTauntAvailability(state, "warrior")).toMatchObject({
      available: false,
      reason: "cooldown",
      availableTurn: 6
    });

    for (let turn = 4; turn <= 5; turn += 1) {
      state = resolvePartyBossRound({
        state,
        now: new Date(`2026-07-11T10:0${turn}:00.000Z`),
        seed: "big-warrior-taunt-duration",
        actions: [
          { characterId: "leader", action: "defend", origin: "manual" },
          { characterId: "warrior", action: "defend", origin: "manual" }
        ]
      }).state;
    }

    expect(state.turn).toBe(6);
    expect(getWarriorRaidTauntAvailability(state, "warrior")).toEqual({ available: true });
  });

  it("redirects a broad Big Barrel response into one normal hit on the taunting Warrior", () => {
    const state = createPartyBossState({
      partySessionId: "big-warrior-taunt-broad",
      variant: "big-barrel",
      now: new Date("2026-07-11T10:00:00.000Z"),
      participants: [
        participant("warrior", "Воїн", { hp: 300, level: 8, strength: 30, classId: "class.warrior" }),
        participant("ally", "Союзниця", { hp: 300, level: 8, classId: "class.mage" })
      ]
    });
    state.turn = 4;
    const allyHpBefore = state.participants[1]!.resources.hp;

    const resolved = resolvePartyBossRound({
      state,
      now: new Date("2026-07-11T10:04:00.000Z"),
      seed: "big-warrior-taunt-broad",
      actions: [
        { characterId: "warrior", action: "taunt", origin: "manual" },
        { characterId: "ally", action: "defend", origin: "manual" }
      ]
    });

    expect(resolved.round.bossRetaliations).toEqual([
      expect.objectContaining({
        characterId: "warrior",
        tauntRedirected: true,
        tauntOriginalKind: "broad"
      })
    ]);
    expect(resolved.state.participants[1]?.resources.hp).toBe(allyHpBefore);
    expect(resolved.round.warriorTaunt).toMatchObject({
      activatedCharacterId: "warrior",
      redirectedCharacterId: "warrior",
      redirectedAttackKind: "broad",
      bossAttacksRemaining: 2
    });
  });

  it("applies one broad Kharakternyk ward response to the redirected Taunt target", () => {
    const state = createPartyBossState({
      partySessionId: "big-warrior-taunt-ward",
      variant: "big-barrel",
      leaderCharacterId: "warrior",
      now: new Date("2026-07-11T10:00:00.000Z"),
      wardSign: { kind: "kharakternyk", placerCharacterId: "ally", supportCount: 2 },
      participants: [
        participant("warrior", "Воїн", { hp: 300, level: 8, classId: "class.warrior" }),
        participant("ally", "Характерниця", { hp: 300, level: 8, classId: "class.kharakternyk" })
      ]
    });
    state.turn = 4;

    const resolved = resolvePartyBossRound({
      state,
      now: new Date("2026-07-11T10:04:00.000Z"),
      seed: "big-warrior-taunt-ward",
      actions: [
        { characterId: "warrior", action: "taunt", origin: "manual" },
        { characterId: "ally", action: "defend", origin: "manual" }
      ]
    });

    expect(resolved.round.bossRetaliations).toEqual([
      expect.objectContaining({ characterId: "warrior", tauntOriginalKind: "broad" })
    ]);
    expect(resolved.round.wardSign).toMatchObject({
      affectedCharacterIds: ["warrior"],
      usesRemaining: 1,
      usesMax: 2
    });
    expect(resolved.round.wardSign?.preventedDamage).toBeGreaterThan(0);
  });

  it("redirects a focused response into the taunting Protocol 13-Z signer", () => {
    const state = createPartyBossState({
      partySessionId: "big-warrior-taunt-protocol",
      variant: "big-barrel",
      leaderCharacterId: "ally",
      now: new Date("2026-07-11T10:00:00.000Z"),
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-taunt",
        filerCharacterId: "ally",
        signerCharacterIds: ["warrior"]
      },
      participants: [
        participant("ally", "Союзниця", { hp: 300, level: 8, classId: "class.bureaucramancer" }),
        participant("warrior", "Воїн", { hp: 300, level: 8, classId: "class.warrior" })
      ]
    });

    const resolved = resolvePartyBossRound({
      state,
      now: new Date("2026-07-11T10:01:00.000Z"),
      seed: "big-warrior-taunt-protocol",
      actions: [
        { characterId: "ally", action: "defend", origin: "manual" },
        { characterId: "warrior", action: "taunt", origin: "manual" }
      ]
    });

    expect(resolved.round.bossRetaliations).toEqual([
      expect.objectContaining({
        characterId: "warrior",
        damage: 0,
        tauntOriginalKind: "focused"
      })
    ]);
    expect(resolved.round.personalProtocol).toMatchObject({ characterId: "warrior", status: "triggered" });
  });

  it("clears single and double Defend guard when Taunt commits", () => {
    for (const defendCount of [1, 2]) {
      let state = createPartyBossState({
        partySessionId: `big-warrior-taunt-guard-${defendCount}`,
        variant: "big-barrel",
        now: new Date("2026-07-11T10:00:00.000Z"),
        participants: [participant("warrior", "Воїн", { hp: 999, level: 8, classId: "class.warrior" })]
      });
      for (let turn = 1; turn <= defendCount; turn += 1) {
        state = resolvePartyBossRound({
          state,
          now: new Date(`2026-07-11T10:0${turn}:00.000Z`),
          seed: `big-warrior-taunt-guard-${defendCount}`,
          actions: [{ characterId: "warrior", action: "defend", origin: "manual" }]
        }).state;
      }
      expect(state.participants[0]?.resources.guard?.consecutiveDefends).toBe(defendCount);

      const taunted = resolvePartyBossRound({
        state,
        now: new Date("2026-07-11T10:03:00.000Z"),
        seed: `big-warrior-taunt-guard-${defendCount}`,
        actions: [{ characterId: "warrior", action: "taunt", origin: "manual" }]
      });
      expect(taunted.state.participants[0]?.resources.guard).toBeUndefined();
    }
  });

  it("clears an active Taunt when the party wins before the boss response", () => {
    const state = createPartyBossState({
      partySessionId: "big-warrior-taunt-victory",
      variant: "big-barrel",
      now: new Date("2026-07-11T10:00:00.000Z"),
      participants: [
        participant("warrior", "Воїн", { hp: 100, level: 8, classId: "class.warrior" }),
        participant("ally", "Союзниця", { hp: 100, level: 8, strength: 60, classId: "class.mage" })
      ]
    });
    state.boss.hp = 1;
    state.warriorTaunt = {
      active: { characterId: "warrior", activatedTurn: 1, bossAttacksRemaining: 2 },
      cooldowns: { warrior: { availableTurn: 6 } }
    };

    const resolved = resolvePartyBossRound({
      state,
      now: new Date("2026-07-11T10:01:00.000Z"),
      seed: "big-warrior-taunt-victory",
      actions: [
        { characterId: "warrior", action: "defend", origin: "manual" },
        { characterId: "ally", action: "attack", origin: "manual" }
      ]
    });

    expect(resolved.state.status).toBe("won");
    expect(resolved.state.warriorTaunt?.active).toBeUndefined();
    expect(resolved.round.bossRetaliations).toEqual([]);
    expect(resolved.round.warriorTaunt).toEqual({ expiredCharacterId: "warrior" });
  });

  it("records only authoritative Taunt expiry when an early boss response knocks out the Warrior", () => {
    const state = createPartyBossState({
      partySessionId: "big-warrior-taunt-ko",
      variant: "big-barrel",
      now: new Date("2026-07-11T10:00:00.000Z"),
      participants: [
        participant("warrior", "Воїн", { hp: 20, hpCurrent: 1, level: 8, classId: "class.warrior" }),
        participant("ally", "Союзниця", { hp: 100, level: 8, classId: "class.mage" })
      ]
    });
    state.warriorTaunt = {
      active: { characterId: "warrior", activatedTurn: 1, bossAttacksRemaining: 3 },
      cooldowns: { warrior: { availableTurn: 6 } }
    };

    const resolved = resolvePartyBossRound({
      state,
      now: new Date("2026-07-11T10:01:00.000Z"),
      seed: "big-warrior-taunt-ko",
      actions: [
        { characterId: "warrior", action: "attack", origin: "manual" },
        { characterId: "ally", action: "defend", origin: "manual" }
      ]
    });

    expect(resolved.state.participants[0]?.status).toBe("knocked-out");
    expect(resolved.round.warriorTaunt).toMatchObject({ expiredCharacterId: "warrior" });
    expect(resolved.round.warriorTaunt?.bossAttacksRemaining).toBeUndefined();
  });

  it("expires Taunt before target selection when the Warrior is unable to continue", () => {
    const state = createPartyBossState({
      partySessionId: "big-warrior-taunt-unable",
      variant: "big-barrel",
      now: new Date("2026-07-11T10:00:00.000Z"),
      participants: [
        participant("warrior", "Воїн", { hp: 100, level: 8, classId: "class.warrior" }),
        participant("ally", "Союзниця", { hp: 100, level: 8, classId: "class.mage" })
      ]
    });
    state.warriorTaunt = {
      active: { characterId: "warrior", activatedTurn: 1, bossAttacksRemaining: 2 },
      cooldowns: { warrior: { availableTurn: 6 } }
    };
    state.participants[0]!.status = "knocked-out";
    state.participants[0]!.resources.hp = 0;
    state.turn = 2;

    const resolved = resolvePartyBossRound({
      state,
      now: new Date("2026-07-11T10:02:00.000Z"),
      seed: "big-warrior-taunt-unable",
      actions: [{ characterId: "ally", action: "defend", origin: "manual" }]
    });

    expect(resolved.round.bossRetaliations.map((entry) => entry.characterId)).toEqual(["ally"]);
    expect(resolved.round.warriorTaunt).toMatchObject({ expiredCharacterId: "warrior" });
    expect(resolved.state.warriorTaunt?.active).toBeUndefined();
  });

  it("resolves same-round multi-Warrior Taunts deterministically and cools down only the winner", () => {
    const state = createPartyBossState({
      partySessionId: "big-warrior-taunt-conflict",
      variant: "big-barrel",
      now: new Date("2026-07-11T10:00:00.000Z"),
      participants: [
        participant("warrior-a", "Перший", { hp: 300, level: 8, classId: "class.warrior" }),
        participant("warrior-b", "Другий", { hp: 300, level: 8, classId: "class.warrior" })
      ]
    });
    state.participants[0]!.resources.guard = { consecutiveDefends: 2 };
    state.participants[1]!.resources.guard = { consecutiveDefends: 1, abilityDamageReduction: 7 };

    const resolved = resolvePartyBossRound({
      state,
      now: new Date("2026-07-11T10:01:00.000Z"),
      seed: "big-warrior-taunt-conflict",
      actions: [
        { characterId: "warrior-b", action: "taunt", origin: "manual" },
        { characterId: "warrior-a", action: "taunt", origin: "manual" }
      ]
    });

    expect(resolved.round.actions).toEqual([
      expect.objectContaining({ characterId: "warrior-a", outcome: "taunt-activated" }),
      expect.objectContaining({ characterId: "warrior-b", outcome: "taunt-failed" })
    ]);
    expect(resolved.state.warriorTaunt?.cooldowns).toEqual({
      "warrior-a": { availableTurn: 6 }
    });
    expect(resolved.round.bossRetaliations.map((entry) => entry.characterId)).toEqual(["warrior-a"]);
    expect(resolved.state.participants.map((entry) => entry.resources.guard)).toEqual([undefined, undefined]);
  });

  it("blocks the first focused Big Barrel Brother retaliation once per protocol signer", () => {
    const state = createPartyBossState({
      partySessionId: "big-protocol",
      variant: "big-barrel",
      leaderCharacterId: "leader",
      now: new Date("2026-06-30T10:00:00.000Z"),
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-big-protocol",
        filerCharacterId: "leader",
        signerCharacterIds: ["leader", "striker"]
      },
      participants: [
        participant("leader", "Голова", { hp: 160, level: 8, strength: 8, dexterity: 8 }),
        participant("striker", "Шкодійка", { hp: 160, level: 8, strength: 30, dexterity: 30 }),
        participant("unsigned", "Без Підпису", { hp: 160, level: 8, strength: 24, dexterity: 24 })
      ]
    });

    const first = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "big-protocol",
      actions: [
        { characterId: "leader", action: "defend", origin: "manual" },
        { characterId: "striker", action: "attack", origin: "manual" },
        { characterId: "unsigned", action: "attack", origin: "manual" }
      ]
    });

    expect(first.round.bossRetaliations[0]).toMatchObject({
      characterId: "leader",
      damage: 0
    });
    expect(first.round.bossRetaliations[0]?.protocolPreventedDamage).toBeGreaterThan(0);
    expect(first.round.personalProtocol).toMatchObject({
      characterId: "leader",
      spentCount: 1,
      signatureCount: 2
    });

    const second = resolvePartyBossRound({
      state: first.state,
      now: new Date("2026-06-30T10:00:46.000Z"),
      seed: "big-protocol",
      actions: [
        { characterId: "leader", action: "defend", origin: "manual" },
        { characterId: "striker", action: "attack", origin: "manual" },
        { characterId: "unsigned", action: "defend", origin: "manual" }
      ]
    });

    expect(second.round.bossRetaliations[0]).toMatchObject({
      characterId: "striker",
      damage: 0
    });
    expect(second.round.bossRetaliations[0]?.protocolPreventedDamage).toBeGreaterThan(0);
    expect(second.round.personalProtocol).toMatchObject({
      characterId: "striker",
      spentCount: 2,
      signatureCount: 2
    });

    const third = resolvePartyBossRound({
      state: second.state,
      now: new Date("2026-06-30T10:01:09.000Z"),
      seed: "big-protocol",
      actions: [
        { characterId: "leader", action: "defend", origin: "manual" },
        { characterId: "striker", action: "attack", origin: "manual" },
        { characterId: "unsigned", action: "defend", origin: "manual" }
      ]
    });

    expect(third.round.bossRetaliations[0]).toMatchObject({
      characterId: "striker"
    });
    expect(third.round.bossRetaliations[0]?.damage).toBeGreaterThan(0);
    expect(third.round.bossRetaliations[0]?.protocolPreventedDamage).toBeUndefined();
    expect(third.round.personalProtocol).toBeUndefined();
  });

  it("does not block a focused Big Barrel Brother retaliation against an unsigned participant", () => {
    const state = createPartyBossState({
      partySessionId: "big-protocol-unsigned",
      variant: "big-barrel",
      leaderCharacterId: "unsigned-leader",
      now: new Date("2026-06-30T10:00:00.000Z"),
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-big-protocol-unsigned",
        filerCharacterId: "signer",
        signerCharacterIds: ["signer"]
      },
      participants: [
        participant("unsigned-leader", "Без Підпису", { hp: 160, level: 8, strength: 8, dexterity: 8 }),
        participant("signer", "Підписант", { hp: 160, level: 8, strength: 30, dexterity: 30 })
      ]
    });

    const resolved = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:00:23.000Z"),
      seed: "big-protocol-unsigned",
      actions: [
        { characterId: "unsigned-leader", action: "defend", origin: "manual" },
        { characterId: "signer", action: "attack", origin: "manual" }
      ]
    });

    expect(resolved.round.bossRetaliations[0]).toMatchObject({
      characterId: "unsigned-leader"
    });
    expect(resolved.round.bossRetaliations[0]?.damage).toBeGreaterThan(0);
    expect(resolved.round.bossRetaliations[0]?.protocolPreventedDamage).toBeUndefined();
    expect(resolved.round.personalProtocol).toBeUndefined();
    expect(resolved.state.personalProtocol?.signatures).toEqual([
      expect.objectContaining({ characterId: "signer", status: "unspent" })
    ]);
  });

  it("does not spend Bureaucramancer protocol signatures on broad Big Barrel Brother retaliation", () => {
    const state = createPartyBossState({
      partySessionId: "big-protocol-broad",
      variant: "big-barrel",
      leaderCharacterId: "leader",
      now: new Date("2026-06-30T10:00:00.000Z"),
      personalProtocol: {
        kind: "bureaucramancer-personal-protocol-13b",
        protocolId: "protocol-broad",
        filerCharacterId: "leader",
        signerCharacterIds: ["leader", "striker"]
      },
      participants: [
        participant("leader", "Голова", { hp: 160, level: 8, strength: 8, dexterity: 8 }),
        participant("striker", "Шкодійка", { hp: 160, level: 8, strength: 30, dexterity: 30 })
      ]
    });
    state.turn = 4;

    const resolved = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:04:00.000Z"),
      seed: "big-protocol-broad",
      actions: [
        { characterId: "leader", action: "defend", origin: "manual" },
        { characterId: "striker", action: "defend", origin: "manual" }
      ]
    });

    expect(resolved.round.bossRetaliations.map((retaliation) => retaliation.characterId)).toEqual([
      "leader",
      "striker"
    ]);
    expect(resolved.round.personalProtocol).toBeUndefined();
    expect(resolved.state.personalProtocol?.signatures).toEqual([
      expect.objectContaining({ characterId: "leader", status: "unspent" }),
      expect.objectContaining({ characterId: "striker", status: "unspent" })
    ]);
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
      manaMax: entry.resources.manaMax,
      varenykSated: null,
      bardInspiration: null
    })));
  });

  it("spends Kharakternyk ward sign supports as repeated Big Barrel broad-hit charges", () => {
    let state = createPartyBossState({
      partySessionId: "big-ward-sign",
      variant: "big-barrel",
      leaderCharacterId: "leader",
      now: new Date("2026-06-30T10:00:00.000Z"),
      wardSign: {
        kind: "kharakternyk",
        placerCharacterId: "leader",
        supportCount: 2
      },
      participants: [
        participant("leader", "Р—РЅР°РєР°СЂ", { hp: 160, level: 8, intelligence: 15, classId: "class.kharakternyk" }),
        participant("ally", "РџС–РґРїРѕСЂР°", { hp: 160, level: 8, intelligence: 10 })
      ]
    });
    state = {
      ...state,
      boss: {
        ...state.boss,
        hp: 500,
        hpMax: 500
      }
    };

    for (let turn = 1; turn <= 4; turn += 1) {
      const resolved = resolvePartyBossRound({
        state,
        now: new Date(`2026-06-30T10:0${turn}:00.000Z`),
        seed: "big-ward-sign",
        actions: [
          { characterId: "leader", action: "defend", origin: "manual" },
          { characterId: "ally", action: "defend", origin: "manual" }
        ]
      });
      state = resolved.state;
    }

    expect(state.roundLog.at(-1)?.wardSign).toMatchObject({
      kind: "kharakternyk",
      status: "triggered",
      supportCount: 2,
      usesRemaining: 1,
      usesMax: 2,
      mitigationPercent: 45
    });
    expect(state.roundLog.at(-1)?.wardSign?.preventedDamage).toBeGreaterThan(0);
    const firstPreventedDamage = state.roundLog.at(-1)?.wardSign?.preventedDamage ?? 0;
    expect(state.wardSign).toMatchObject({
      status: "carried",
      supportCount: 2,
      usesRemaining: 1,
      usesMax: 2,
      mitigationPercent: 45,
      preventedDamage: firstPreventedDamage
    });

    for (let turn = 5; turn <= 8; turn += 1) {
      const resolved = resolvePartyBossRound({
        state,
        now: new Date(`2026-06-30T10:0${turn}:00.000Z`),
        seed: "big-ward-sign",
        actions: [
          { characterId: "leader", action: "defend", origin: "manual" },
          { characterId: "ally", action: "defend", origin: "manual" }
        ]
      });
      state = resolved.state;
    }

    expect(state.roundLog.at(-1)?.wardSign).toMatchObject({
      kind: "kharakternyk",
      status: "triggered",
      supportCount: 2,
      usesRemaining: 0,
      usesMax: 2,
      mitigationPercent: 45
    });
    const secondPreventedDamage = state.roundLog.at(-1)?.wardSign?.preventedDamage ?? 0;
    expect(state.wardSign).toMatchObject({
      status: "broken",
      supportCount: 2,
      usesRemaining: 0,
      usesMax: 2,
      mitigationPercent: 45,
      preventedDamage: firstPreventedDamage + secondPreventedDamage
    });
  });

  it("lets an unsupported Kharakternyk ward sign trigger once", () => {
    let state = createPartyBossState({
      partySessionId: "big-ward-sign-solo",
      variant: "big-barrel",
      leaderCharacterId: "leader",
      now: new Date("2026-06-30T10:00:00.000Z"),
      wardSign: {
        kind: "kharakternyk",
        placerCharacterId: "leader",
        supportCount: 0
      },
      participants: [
        participant("leader", "Знакар", { hp: 160, level: 8, intelligence: 15, classId: "class.kharakternyk" })
      ]
    });
    state = {
      ...state,
      boss: {
        ...state.boss,
        hp: 500,
        hpMax: 500
      }
    };

    for (let turn = 1; turn <= 4; turn += 1) {
      const resolved = resolvePartyBossRound({
        state,
        now: new Date(`2026-06-30T10:1${turn}:00.000Z`),
        seed: "big-ward-sign-solo",
        actions: [
          { characterId: "leader", action: "defend", origin: "manual" }
        ]
      });
      state = resolved.state;
    }

    expect(state.roundLog.at(-1)?.wardSign).toMatchObject({
      kind: "kharakternyk",
      status: "triggered",
      supportCount: 0,
      usesRemaining: 0,
      usesMax: 1,
      mitigationPercent: 25
    });
    expect(state.wardSign).toMatchObject({
      status: "broken",
      supportCount: 0,
      usesRemaining: 0,
      usesMax: 1,
      mitigationPercent: 25
    });

    const afterBroken = resolvePartyBossRound({
      state,
      now: new Date("2026-06-30T10:15:00.000Z"),
      seed: "big-ward-sign-solo",
      actions: [
        { characterId: "leader", action: "defend", origin: "manual" }
      ]
    });

    expect(afterBroken.round.wardSign).toBeUndefined();
  });

  it("spends a Kharakternyk ward activation even when mitigation rounds to zero", () => {
    let state = createPartyBossState({
      partySessionId: "big-ward-sign-zero",
      variant: "big-barrel",
      leaderCharacterId: "leader",
      now: new Date("2026-06-30T10:00:00.000Z"),
      wardSign: {
        kind: "kharakternyk",
        placerCharacterId: "leader",
        supportCount: 0
      },
      participants: [
        participant("leader", "Знакар", { hp: 160, level: 8, intelligence: 15, classId: "class.kharakternyk" })
      ]
    });
    state = {
      ...state,
      boss: {
        ...state.boss,
        attack: 1,
        hp: 500,
        hpMax: 500
      }
    };

    for (let turn = 1; turn <= 4; turn += 1) {
      const resolved = resolvePartyBossRound({
        state,
        now: new Date(`2026-06-30T10:2${turn}:00.000Z`),
        seed: "big-ward-sign-zero",
        actions: [
          { characterId: "leader", action: "defend", origin: "manual" }
        ]
      });
      state = resolved.state;
    }

    expect(state.roundLog.at(-1)?.wardSign).toMatchObject({
      status: "triggered",
      supportCount: 0,
      usesRemaining: 0,
      usesMax: 1,
      preventedDamage: 0
    });
    expect(state.wardSign).toMatchObject({
      status: "broken",
      usesRemaining: 0,
      preventedDamage: 0
    });
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

    for (let turn = 1; turn <= 17; turn += 1) {
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
    expect(state.turn).toBe(18);
    expect(state.roundLog).toHaveLength(17);
    expect(state.roundLog.map((round) => round.turn)).toEqual(
      Array.from({ length: 17 }, (_unused, index) => index + 1)
    );
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
    raceId?: string;
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
      raceId: overrides.raceId ?? "race.human-ish",
      classId: overrides.classId ?? "class.warrior",
      armor: Math.max(0, Math.floor(strength / 3)),
      resist: Math.max(0, Math.floor(intelligence / 3)),
      weaponDamage: 1 + Math.max(0, Math.floor(strength / 4)),
      spellPower: 1 + Math.max(0, Math.floor(intelligence / 4))
    },
    ...(overrides.equipmentAbilityGrantIds ? { equipmentAbilityGrantIds: overrides.equipmentAbilityGrantIds } : {})
  };
}
