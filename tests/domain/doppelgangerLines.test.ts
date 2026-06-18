import { describe, expect, it } from "vitest";
import { selectDoppelgangerLine } from "../../src/domain/combat";

describe("doppelganger line selector", () => {
  it("varies spawn copy lines across deterministic battle seeds", () => {
    const selected = Array.from({ length: 20 }, (_value, index) =>
      selectDoppelgangerLine({
        category: "spawn.copy",
        seed: `battle-${index}`,
        targetName: "Мандрівник"
      }).id
    );

    expect(new Set(selected).size).toBeGreaterThan(1);
  });

  it("avoids recent line ids when another valid line is available", () => {
    const first = selectDoppelgangerLine({
      category: "turn.idle",
      seed: "same-battle",
      turn: 1
    });
    const second = selectDoppelgangerLine({
      category: "turn.idle",
      seed: "same-battle",
      turn: 1,
      recentLineIds: [first.id],
      recentLineMemorySize: 3
    });

    expect(second.id).not.toBe(first.id);
  });

  it("filters templates with missing placeholders instead of rendering raw values", () => {
    const line = selectDoppelgangerLine({
      category: "spawn.random",
      seed: "missing-race-and-class"
    });

    expect(line.text).not.toContain("{raceName}");
    expect(line.text).not.toContain("{className}");
    expect(line.text).not.toContain("undefined");
    expect(line.text).not.toContain("null");
  });

  it("renders provided placeholders for copy lines", () => {
    const line = selectDoppelgangerLine({
      category: "spawn.copy",
      seed: "named-target",
      targetName: "Пані Ложка"
    });

    expect(line.text).not.toContain("{targetName}");
    expect(line.text).not.toContain("undefined");
  });
});
