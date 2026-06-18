import { describe, expect, it } from "vitest";
import { buildDoppelgangerCounterFlavor } from "../../src/domain/combat";

describe("combat flavor intents", () => {
  it.each([
    ["class.warrior", "warrior-pressure"],
    ["class.mage", "mage-spell"],
    ["class.bureaucramancer", "bureaucramancer-form"],
    ["class.bard", "bard-verse"],
    ["class.rogue", "rogue-feint"],
    ["class.ranger", "ranger-shot"],
    ["class.priest", "priest-blessing"],
    ["class.kharakternyk", "kharakternyk-omen"],
    ["class.varenyk-mancer", "varenyk-mancer-filling"]
  ])("returns class-specific doppelganger flavor for %s", (classId, intentId) => {
    const flavor = buildDoppelgangerCounterFlavor({
      actorKind: "doppelganger",
      classId,
      className: "Тестовий клас",
      raceId: "race.human-ish",
      raceName: "Людисько",
      targetName: "Мандрівник",
      seed: "session-1",
      turn: 2,
      action: "skill"
    });

    expect(flavor.intentId).toBe(intentId);
    expect(flavor.category).toBe("turn.before_ability");
    expect(flavor.lineId).toMatch(/^dg\.turn\.before_ability\./);
    expect(flavor.tags).toContain(`class:${classId}`);
    expect(flavor.tags).toContain("turn:2");
    expect(flavor.text.length).toBeGreaterThan(20);
    expect(flavor.text).not.toContain("undefined");
  });

  it("falls back to race flavor when class is unknown", () => {
    const flavor = buildDoppelgangerCounterFlavor({
      actorKind: "doppelganger",
      classId: "class.unfiled-maybe",
      raceId: "race.domovyk",
      raceName: "Домовик",
      targetName: "Мандрівник",
      seed: "session-2",
      action: "attack"
    });

    expect(flavor.intentId).toBe("race-flavor");
    expect(flavor.lineId).toMatch(/^dg\.turn\./);
    expect(flavor.text).not.toContain("undefined");
  });

  it("falls back to generic mirror mockery without known class or race", () => {
    const flavor = buildDoppelgangerCounterFlavor({
      actorKind: "doppelganger",
      seed: "session-3",
      action: "attack"
    });

    expect(flavor.intentId).toBe("mirror-mockery");
    expect(flavor.tags).toContain("doppelganger");
    expect(flavor.lineId).toMatch(/^dg\.turn\./);
  });

  it("uses a safe mirror category for failed escape attempts", () => {
    const flavor = buildDoppelgangerCounterFlavor({
      actorKind: "doppelganger",
      classId: "class.warrior",
      raceId: "race.dwarf",
      seed: "session-4",
      action: "flee"
    });

    expect(flavor.intentId).toBe("mirror-mockery");
    expect(flavor.category).toBe("turn.copying");
    expect(flavor.lineId).toMatch(/^dg\.turn\.copying\./);
  });
});
