import { describe, expect, it } from "vitest";
import {
  BIG_BARREL_BROTHER_BOSS_KEY,
  BIG_BARREL_BROTHER_RULES_VERSION,
  createPartyBossState
} from "../../src/domain/partyBoss/partyBoss";
import {
  parsePartyBossStateStrict,
  PartyBossStateValidationError
} from "../../src/domain/partyBoss/partyBossStateValidation";

describe("PartyBoss strict state validation", () => {
  it("clones a valid versioned state whose row and roster agree", () => {
    const state = validState();

    const parsed = parsePartyBossStateStrict(state, contract());

    expect(parsed).toEqual(state);
    expect(parsed).not.toBe(state);
  });

  it.each([
    ["non-object", null, "not-object"],
    ["partial", { rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION }, "party-session"],
    ["rules mismatch", { ...validState(), rulesVersion: "party-boss-proof-v1" }, "rules-version"],
    ["turn mismatch", { ...validState(), turn: 2 }, "turn"],
    ["party mismatch", { ...validState(), partySessionId: "other-party" }, "party-session"],
    ["invalid number", { ...validState(), boss: { ...validState().boss, hp: -1 } }, "numeric"]
  ])("rejects %s", (_label, value, code) => {
    expectValidationCode(value, code);
  });

  it("rejects duplicate and missing roster entries", () => {
    const state = validState();
    state.participants.push({ ...state.participants[0]! });

    expectValidationCode(state, "roster");

    const missing = validState();
    expectValidationCode(missing, "roster", {
      ...contract(),
      participantCharacterIds: ["leader", "missing"]
    });
  });
});

function expectValidationCode(
  value: unknown,
  expectedCode: PartyBossStateValidationError["code"],
  expectedContract = contract()
): void {
  try {
    parsePartyBossStateStrict(value, expectedContract);
  } catch (error) {
    expect(error).toBeInstanceOf(PartyBossStateValidationError);
    if (!(error instanceof PartyBossStateValidationError)) {
      throw error;
    }
    expect(error.code).toBe(expectedCode);
    return;
  }
  throw new Error(`Expected PartyBoss validation error ${expectedCode}.`);
}

function validState() {
  return createPartyBossState({
    partySessionId: "party-strict",
    variant: "big-barrel",
    now: new Date("2026-07-20T10:00:00.000Z"),
    participants: [{
      characterId: "leader",
      name: "Провідниця",
      remortCount: 0,
      combatStats: {
        level: 8,
        hpCurrent: 30,
        hpMax: 30,
        manaCurrent: 10,
        manaMax: 10,
        raceId: "race.human-ish",
        classId: "class.warrior",
        strength: 8,
        dexterity: 8,
        intelligence: 8,
        charisma: 8,
        luck: 8,
        armor: 2,
        resist: 2,
        weaponDamage: 3,
        spellPower: 3
      }
    }]
  });
}

function contract() {
  return {
    rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
    partySessionId: "party-strict",
    status: "active" as const,
    turn: 1,
    bossKey: BIG_BARREL_BROTHER_BOSS_KEY,
    participantCharacterIds: ["leader"]
  };
}
