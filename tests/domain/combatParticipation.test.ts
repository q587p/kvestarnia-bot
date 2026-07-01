import { describe, expect, it } from "vitest";
import { isMeaningfulCombatParticipation } from "../../src/domain/combat/combatParticipation";

describe("isMeaningfulCombatParticipation", () => {
  it("does not count empty or timeout-only counters as meaningful", () => {
    expect(isMeaningfulCombatParticipation({})).toBe(false);
    expect(isMeaningfulCombatParticipation({ timeoutActions: 3 })).toBe(false);
  });

  it("counts manual action and combat contact as meaningful", () => {
    expect(isMeaningfulCombatParticipation({ manualActions: 1 })).toBe(true);
    expect(isMeaningfulCombatParticipation({ damageDealt: 1 })).toBe(true);
    expect(isMeaningfulCombatParticipation({ damageTaken: 1 })).toBe(true);
  });

  it("counts healing and real item use as meaningful", () => {
    expect(isMeaningfulCombatParticipation({ healingDone: 1 })).toBe(true);
    expect(isMeaningfulCombatParticipation({ itemUses: 1 })).toBe(true);
  });
});
