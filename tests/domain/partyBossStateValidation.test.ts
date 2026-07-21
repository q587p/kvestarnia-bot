import { describe, expect, it } from "vitest";
import {
  BIG_BARREL_BROTHER_BOSS_KEY,
  BIG_BARREL_BROTHER_RULES_VERSION,
  createPartyBossState
} from "../../src/domain/partyBoss/partyBoss";
import {
  parsePartyBossRoundSummaryStrict,
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

  it.each([
    ["missing boss dexterity", (state: ReturnType<typeof validState>) => { delete (state.boss as Partial<typeof state.boss>).dexterity; }],
    ["string boss dexterity", (state: ReturnType<typeof validState>) => { (state.boss as unknown as { dexterity: unknown }).dexterity = "8"; }],
    ["missing participant armor", (state: ReturnType<typeof validState>) => { delete state.participants[0]!.combatStats.armor; }],
    ["string participant damage", (state: ReturnType<typeof validState>) => { (state.participants[0]!.combatStats as unknown as { weaponDamage: unknown }).weaponDamage = "3"; }],
    ["resource maximum mismatch", (state: ReturnType<typeof validState>) => { state.participants[0]!.resources.hpMax += 1; }],
    ["active participant at zero hp", (state: ReturnType<typeof validState>) => { state.participants[0]!.resources.hp = 0; }],
    ["active participant at string zero hp", (state: ReturnType<typeof validState>) => { (state.participants[0]!.resources as unknown as { hp: unknown }).hp = "0"; }],
    ["invalid cooldown", (state: ReturnType<typeof validState>) => { state.participants[0]!.resources.cooldowns = { skill: { id: "skill", remainingTurns: "2" as never } }; }],
    ["string accuracy bonus", (state: ReturnType<typeof validState>) => { (state.participants[0]!.combatStats as unknown as { accuracyBonusPp: unknown }).accuracyBonusPp = "3"; }],
    ["invalid timed status", (state: ReturnType<typeof validState>) => { state.participants[0]!.bardMusicAvailableAt = "not-a-date"; }]
  ])("rejects strict runtime field corruption: %s", (_label, mutate) => {
    const state = validState();
    mutate(state);
    expectValidationCode(state, _label.includes("timed") ? "timestamp" : "numeric");
  });

  it.each([
    ["action", (state: ReturnType<typeof stateWithRound>) => { delete (state.roundLog[0]!.actions[0] as Partial<typeof state.roundLog[0]["actions"][number]>).manaSpent; }],
    ["retaliation", (state: ReturnType<typeof stateWithRound>) => { (state.roundLog[0]!.bossRetaliations[0] as unknown as { damage: unknown }).damage = "1"; }],
    ["participantsAfter", (state: ReturnType<typeof stateWithRound>) => { delete (state.roundLog[0]!.participantsAfter![0] as { manaMax?: number }).manaMax; }],
    ["active participantsAfter at zero hp", (state: ReturnType<typeof stateWithRound>) => { state.roundLog[0]!.participantsAfter![0]!.hp = 0; }]
  ])("rejects malformed nested round %s", (_label, mutate) => {
    const state = stateWithRound();
    mutate(state);
    expectValidationCode(state, "numeric");
  });

  it.each([
    ["supportCap", "7"],
    ["usesRemaining", "2"],
    ["usesMax", -1],
    ["supportCap", 0],
    ["usesRemaining", 3]
  ])("rejects invalid historical ward %s", (field, value) => {
    const round = stateWithWardRound().roundLog[0]! as unknown as Record<string, unknown>;
    const ward = round.wardSign as Record<string, unknown>;
    ward[field] = value;

    expect(() => parsePartyBossRoundSummaryStrict(round)).toThrowError(PartyBossStateValidationError);
  });

  it("rejects optional runtime-read enum and resource corruption before journal rendering", () => {
    const invalidOutcome = stateWithRound().roundLog[0]!;
    (invalidOutcome.actions[0] as unknown as { outcome: unknown }).outcome = "almost-hit";
    expect(() => parsePartyBossRoundSummaryStrict(invalidOutcome)).toThrowError(PartyBossStateValidationError);

    const invalidKnockout = stateWithRound().roundLog[0]!;
    invalidKnockout.participantsAfter![0]!.status = "knocked-out";
    expect(() => parsePartyBossRoundSummaryStrict(invalidKnockout)).toThrowError(PartyBossStateValidationError);
  });

  it("accepts a terminal frozen roster without comparing mutable live participants", () => {
    const state = validState();
    state.status = "cancelled";
    state.completedAt = new Date("2026-07-20T10:01:00.000Z").toISOString();
    expect(() => parsePartyBossStateStrict(state, {
      ...contract(),
      status: "cancelled",
      participantCharacterIds: undefined
    })).not.toThrow();
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

function stateWithRound() {
  const state = validState();
  state.roundLog = [{
    turn: 1,
    actions: [{
      characterId: "leader",
      action: "attack",
      origin: "manual",
      outcome: "hit",
      damage: 1,
      manaSpent: 0
    }],
    bossDamage: 1,
    bossHpAfter: state.boss.hp - 1,
    bossRetaliations: [{ characterId: "leader", damage: 1, hpAfter: 29 }],
    participantsAfter: [{
      characterId: "leader",
      status: "active",
      hp: 29,
      hpMax: 30,
      mana: 10,
      manaMax: 10
    }],
    statusAfter: "active"
  }];
  return state;
}

function stateWithWardRound() {
  const state = stateWithRound();
  state.roundLog[0]!.wardSign = {
    kind: "kharakternyk",
    status: "triggered",
    supportCount: 2,
    supportCap: 7,
    usesRemaining: 1,
    usesMax: 2,
    mitigationPercent: 13,
    preventedDamage: 3,
    affectedCharacterIds: ["leader"]
  };
  return state;
}
