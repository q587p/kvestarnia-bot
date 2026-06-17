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
      raceId: "race.human-ish",
      turn: 2,
      action: "skill"
    });

    expect(flavor.intentId).toBe(intentId);
    expect(flavor.tags).toContain(`class:${classId}`);
    expect(flavor.tags).toContain("turn:2");
    expect(flavor.text.length).toBeGreaterThan(20);
  });

  it("falls back to race flavor when class is unknown", () => {
    const flavor = buildDoppelgangerCounterFlavor({
      actorKind: "doppelganger",
      classId: "class.unfiled-maybe",
      raceId: "race.domovyk",
      action: "attack"
    });

    expect(flavor.intentId).toBe("race-flavor");
    expect(flavor.text).toContain("порога");
  });

  it("falls back to generic mirror mockery without known class or race", () => {
    const flavor = buildDoppelgangerCounterFlavor({
      actorKind: "doppelganger",
      action: "attack"
    });

    expect(flavor.intentId).toBe("mirror-mockery");
    expect(flavor.tags).toContain("doppelganger");
  });

  it("uses a safe mirror line for failed escape attempts", () => {
    const flavor = buildDoppelgangerCounterFlavor({
      actorKind: "doppelganger",
      classId: "class.warrior",
      raceId: "race.dwarf",
      action: "flee"
    });

    expect(flavor.intentId).toBe("mirror-mockery");
    expect(flavor.text).toContain("тактичне віддзеркалення");
  });
});
