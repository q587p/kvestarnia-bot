import { describe, expect, it } from "vitest";
import {
  applyBardInspirationCombatPulse,
  buildBardInspirationPayload,
  buildBardLamentPlan,
  freezeBardInspirationForCombat,
  getBardInspirationAccuracyBonusPp,
  getBardInspirationRemainingCombatTurns,
  getBardLamentDamageReduction,
  parseBardInspirationPayload
} from "../../src/domain/noncombat/bardSupport";

describe("bardSupport domain", () => {
  it("maps all performance grades to the frozen support values", () => {
    const grades = ["rough", "pleasant", "memorable", "legendary"] as const;
    expect(grades.map((grade) => [
      getBardInspirationAccuracyBonusPp(grade),
      getBardLamentDamageReduction(grade)
    ])).toEqual([[1, 1], [2, 2], [3, 3], [5, 5]]);
  });

  it("reuses the performance grade and clamps Lament duration at 8–13 responses", () => {
    expect(buildBardLamentPlan({ charisma: 6, luck: 3, level: 3, roll: -2 })).toMatchObject({
      grade: "rough",
      damageReduction: 1,
      bossResponses: 8
    });
    expect(buildBardLamentPlan({ charisma: 15, luck: 8, level: 42, roll: 2 })).toMatchObject({
      grade: "legendary",
      damageReduction: 5,
      bossResponses: 13
    });
  });

  it("freezes 13 hybrid minutes and pulses committed turns exactly once", () => {
    const startedAt = new Date("2026-07-18T20:00:00.000Z");
    const payload = buildBardInspirationPayload({
      activationId: "activation",
      sourcePerformanceId: "performance",
      sourceCharacterId: "bard",
      sourceLocationId: "location.korchma.barrel",
      recipientCharacterId: "listener",
      recipientRemortCount: 2,
      grade: "memorable",
      now: startedAt
    });
    const frozen = freezeBardInspirationForCombat(
      payload,
      "listener",
      2,
      new Date(startedAt.getTime() + 30_000)
    );
    expect(frozen).not.toBeNull();
    expect(getBardInspirationRemainingCombatTurns(frozen!)).toBe(13);

    const first = applyBardInspirationCombatPulse({
      inspiration: frozen!,
      pulseId: "turn:1",
      now: new Date(startedAt.getTime() + 60_000)
    });
    expect(first.applied).toBe(true);
    expect(getBardInspirationRemainingCombatTurns(first.inspiration!)).toBe(12);
    const duplicate = applyBardInspirationCombatPulse({
      inspiration: first.inspiration!,
      pulseId: "turn:1",
      now: new Date(startedAt.getTime() + 90_000)
    });
    expect(duplicate.applied).toBe(false);
    expect(getBardInspirationRemainingCombatTurns(duplicate.inspiration!)).toBe(12);
  });

  it("rejects malformed or life-mismatched payloads", () => {
    expect(parseBardInspirationPayload({ kind: "bard-support-v1", version: 1 })).toBeNull();
    const payload = buildBardInspirationPayload({
      activationId: "activation",
      sourcePerformanceId: "performance",
      sourceCharacterId: "bard",
      sourceLocationId: "location.korchma.bar",
      recipientCharacterId: "listener",
      recipientRemortCount: 1,
      grade: "pleasant",
      now: new Date("2026-07-18T20:00:00.000Z")
    });
    expect(freezeBardInspirationForCombat(
      payload,
      "listener",
      2,
      new Date("2026-07-18T20:01:00.000Z")
    )).toBeNull();
  });
});
