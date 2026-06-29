import { describe, expect, it } from "vitest";
import {
  createPartyBossState,
  resolvePartyBossRound
} from "../../src/domain/partyBoss/partyBoss";

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
});

function participant(characterId: string, name: string) {
  return {
    characterId,
    name,
    remortCount: 0,
    combatStats: {
      level: 3,
      hpMax: 30,
      manaMax: 12,
      hpCurrent: 30,
      manaCurrent: 12,
      strength: 8,
      dexterity: 6,
      intelligence: 5,
      charisma: 5,
      luck: 5,
      raceId: "race.human-ish",
      classId: "class.warrior",
      armor: 2,
      resist: 1,
      weaponDamage: 3,
      spellPower: 2
    }
  };
}
