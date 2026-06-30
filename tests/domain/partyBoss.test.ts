import type { PartyBossActionKey, PartyBossState } from "../../src/domain/partyBoss/partyBoss";
import { describe, expect, it } from "vitest";
import {
  createPartyBossState,
  resolvePartyBossRound
} from "../../src/domain/partyBoss/partyBoss";

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

  it("keeps Senior Barrel Brother active beyond the 13-round simulation horizon when no terminal condition occurs", () => {
    let state = createPartyBossState({
      partySessionId: "senior-no-cap",
      variant: "senior-barrel",
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: [participant("senior-tank", "Стійка", { hp: 500, level: 8 })]
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
        seed: "senior-no-cap",
        actions: [{
          characterId: "senior-tank",
          action: "defend",
          origin: "manual"
        }]
      });
      state = resolved.state;
    }

    expect(state.status).toBe("active");
    expect(state.turn).toBe(15);
  });

  it("keeps the Senior solo no-manatka/no-remort baseline below 13 percent by the 13-round horizon", () => {
    const report = simulatePartyBoss({
      label: "senior solo baseline",
      variant: "senior-barrel",
      participants: [participant("solo", "Соло", { level: 8, hp: 52, mana: 18, strength: 14, dexterity: 10, intelligence: 8, charisma: 8, luck: 8 })],
      actionFor: () => "attack"
    });

    expect(report.winRate).toBeLessThanOrEqual(0.13);
  });

  it("keeps the prepared Senior entry party near 42 percent by the 13-round horizon", () => {
    const report = simulatePartyBoss({
      label: "senior prepared entry party",
      variant: "senior-barrel",
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
});

function simulatePartyBoss(input: {
  label: string;
  variant?: "proof" | "senior-barrel";
  participants: ReturnType<typeof participant>[];
  actionFor: (participant: PartyBossState["participants"][number], turn: number) => PartyBossActionKey;
}): { label: string; wins: number; losses: number; unresolvedByHorizon: number; winRate: number } {
  let wins = 0;
  let losses = 0;
  let unresolvedByHorizon = 0;

  for (let run = 0; run < PARTY_BOSS_SIMULATION_RUNS; run += 1) {
    let state = createPartyBossState({
      partySessionId: `${input.label}:${run}`,
      variant: input.variant,
      now: new Date("2026-06-30T10:00:00.000Z"),
      participants: input.participants.map((entry, index) => ({
        ...entry,
        characterId: `${entry.characterId}-${run}-${index}`
      }))
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
      hpCurrent: overrides.hp ?? 30,
      manaCurrent: overrides.mana ?? 12,
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
    }
  };
}
