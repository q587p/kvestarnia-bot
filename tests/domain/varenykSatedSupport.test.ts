import { describe, expect, it } from "vitest";
import {
  applyVarenykSatedCombatPulse,
  applyVarenykSatedImmediateRecovery,
  buildVarenykSatedPlan,
  freezeVarenykSatedForCombat,
  getAffordableVarenykSatedPlan,
  parseVarenykSatedCombatState,
  parseVarenykSatedPayload,
  settleVarenykSatedOutsideCombat,
  type VarenykSatedPayloadV1
} from "../../src/domain/noncombat/varenykSatedSupport";

const startedAt = new Date("2026-07-14T10:00:00.000Z");

describe("Varenyk-mancer Sated support", () => {
  it.each([
    [{ effectiveIntelligence: 8, effectiveCharisma: 9, level: 3 }, 1, 8],
    [{ effectiveIntelligence: 11, effectiveCharisma: 9, level: 3 }, 2, 12],
    [{ effectiveIntelligence: 14, effectiveCharisma: 9, level: 3 }, 3, 16],
    [{ effectiveIntelligence: 17, effectiveCharisma: 9, level: 3 }, 4, 20],
    [{ effectiveIntelligence: 20, effectiveCharisma: 9, level: 3 }, 5, 23],
    [{ effectiveIntelligence: 8, effectiveCharisma: 17, level: 3 }, 2, 12],
    [{ effectiveIntelligence: 99, effectiveCharisma: 99, level: 99 }, 5, 23]
  ])("maps effective stats to a deterministic capped rank and exact mana cost", (input, rank, manaCost) => {
    expect(buildVarenykSatedPlan(input)).toEqual({
      rank,
      manaCost,
      immediateHp: 2 + rank,
      immediateMana: 1
    });
  });

  it("caps immediate HP and mana independently", () => {
    expect(applyVarenykSatedImmediateRecovery(
      { hp: 9, hpMax: 10, mana: 4, manaMax: 4 },
      { immediateHp: 5, immediateMana: 1 }
    )).toEqual({
      resources: { hp: 10, hpMax: 10, mana: 4, manaMax: 4 },
      hpRestored: 1,
      manaRestored: 0
    });
  });

  it.each([
    [5, 23, 5, 23],
    [5, 22, 4, 20],
    [5, 19, 3, 16],
    [4, 12, 2, 12],
    [3, 8, 1, 8]
  ])("downgrades to the highest affordable rank", (plannedRank, mana, rank, manaCost) => {
    expect(getAffordableVarenykSatedPlan(plannedRank, mana)).toMatchObject({ rank, manaCost });
  });

  it("blocks when even rank one is unaffordable", () => {
    expect(getAffordableVarenykSatedPlan(5, 7)).toBeNull();
  });

  it("starts lazy recovery only after a complete minute and advances the cursor while full", () => {
    const payload = makePayload();
    const early = settleVarenykSatedOutsideCombat({
      payload,
      resources: { hp: 5, hpMax: 10, mana: 2, manaMax: 10 },
      now: new Date(startedAt.getTime() + 59_999),
      combatBlocked: false
    });
    expect(early.hpRestored).toBe(0);
    expect(early.payload.cursorAt).toBe(startedAt.toISOString());

    const full = settleVarenykSatedOutsideCombat({
      payload,
      resources: { hp: 10, hpMax: 10, mana: 10, manaMax: 10 },
      now: new Date(startedAt.getTime() + 3 * 60_000 + 23_000),
      combatBlocked: false
    });
    expect(full.hpRestored).toBe(0);
    expect(full.manaRestored).toBe(0);
    expect(full.payload.cursorAt).toBe(new Date(startedAt.getTime() + 3 * 60_000).toISOString());
  });

  it("settles through expiry and discards combat-blocked time", () => {
    const expired = settleVarenykSatedOutsideCombat({
      payload: makePayload(),
      resources: { hp: 1, hpMax: 30, mana: 1, manaMax: 30 },
      now: new Date(startedAt.getTime() + 20 * 60_000),
      combatBlocked: false
    });
    expect(expired.hpRestored).toBe(13);
    expect(expired.manaRestored).toBe(13);
    expect(expired.payload.cursorAt).toBe(new Date(startedAt.getTime() + 13 * 60_000).toISOString());

    const blocked = settleVarenykSatedOutsideCombat({
      payload: makePayload(),
      resources: { hp: 1, hpMax: 30, mana: 1, manaMax: 30 },
      now: new Date(startedAt.getTime() + 4 * 60_000),
      combatBlocked: true
    });
    expect(blocked.hpRestored).toBe(0);
    expect(blocked.manaRestored).toBe(0);
    expect(blocked.payload.cursorAt).toBe(new Date(startedAt.getTime() + 4 * 60_000).toISOString());
  });

  it("freezes the current-life activation and pulses once per durable identity after spending", () => {
    const frozen = freezeVarenykSatedForCombat(makePayload(), "recipient", 2, startedAt)!;
    const first = applyVarenykSatedCombatPulse({
      sated: frozen,
      resources: { hp: 4, hpMax: 10, mana: 0, manaMax: 10 },
      pulseId: "solo:session:turn:1:recipient",
      now: new Date(startedAt.getTime() + 60_000)
    });
    expect(first.resources).toEqual({ hp: 5, hpMax: 10, mana: 1, manaMax: 10 });
    expect(first.applied).toBe(true);

    const replay = applyVarenykSatedCombatPulse({
      sated: first.sated,
      resources: first.resources,
      pulseId: "solo:session:turn:1:recipient",
      now: new Date(startedAt.getTime() + 61_000)
    });
    expect(replay.resources).toEqual(first.resources);
    expect(replay.applied).toBe(false);
  });

  it("does not pulse after expiry or resurrect at zero HP", () => {
    const frozen = freezeVarenykSatedForCombat(makePayload(), "recipient", 2, startedAt)!;
    expect(applyVarenykSatedCombatPulse({
      sated: frozen,
      resources: { hp: 0, hpMax: 10, mana: 2, manaMax: 10 },
      pulseId: "zero",
      now: new Date(startedAt.getTime() + 60_000)
    }).applied).toBe(false);
    expect(applyVarenykSatedCombatPulse({
      sated: frozen,
      resources: { hp: 2, hpMax: 10, mana: 2, manaMax: 10 },
      pulseId: "expired",
      now: new Date(startedAt.getTime() + 13 * 60_000)
    }).applied).toBe(false);
  });

  it("round-trips versioned status and frozen combat state while rejecting malformed replay data", () => {
    const payload = makePayload();
    const frozen = freezeVarenykSatedForCombat(payload, "recipient", 2, startedAt)!;

    expect(parseVarenykSatedPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
    expect(parseVarenykSatedCombatState(JSON.parse(JSON.stringify(frozen)))).toEqual(frozen);
    expect(parseVarenykSatedPayload({ ...payload, version: 2 })).toBeNull();
    expect(parseVarenykSatedCombatState({ ...frozen, pulseIds: [13] })).toBeNull();
  });
});

function makePayload(): VarenykSatedPayloadV1 {
  return {
    kind: "varenyk-sated-support-v1",
    version: 1,
    activationId: "activation",
    actorCharacterId: "actor",
    actorRemortCount: 1,
    recipientCharacterId: "recipient",
    recipientRemortCount: 2,
    rank: 3,
    manaCost: 16,
    effectiveStats: { intelligence: 14, charisma: 9, level: 3, equipmentItemIds: [] },
    startedAt: startedAt.toISOString(),
    expiresAt: new Date(startedAt.getTime() + 13 * 60_000).toISOString(),
    availableAt: new Date(startedAt.getTime() + 93 * 60_000).toISOString(),
    cursorAt: startedAt.toISOString(),
    receipt: {
      version: 1,
      previewToken: "preview",
      actorTelegramUserId: "1",
      targetTelegramUserId: "2",
      actorName: "Actor",
      targetName: "Target",
      immediateHpRestored: 5,
      immediateManaRestored: 1,
      actorManaAfter: 10,
      targetHpAfter: 10,
      targetManaAfter: 5
    }
  };
}
