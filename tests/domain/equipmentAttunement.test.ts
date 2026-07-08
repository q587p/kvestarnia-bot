import { describe, expect, it } from "vitest";
import { items } from "../../src/content";
import {
  getEquipmentAttunementDurationMs,
  getEquipmentMagicStrength,
  STRONG_EQUIPMENT_ATTUNEMENT_MS,
  WEAK_EQUIPMENT_ATTUNEMENT_MS
} from "../../src/domain/equipment/equipmentAttunement";

describe("equipment attunement", () => {
  it("classifies +1..+3 as weak magic and +4..+5 as strong magic", () => {
    const weak = items.find((item) => item.id === "item.pan-of-persuasion.plus-3");
    const strong = items.find((item) => item.id === "item.pan-of-persuasion.plus-4");

    expect(weak).toBeDefined();
    expect(strong).toBeDefined();
    expect(weak && getEquipmentMagicStrength(weak.id)).toBe("weak");
    expect(strong && getEquipmentMagicStrength(strong.id)).toBe("strong");
    expect(getEquipmentAttunementDurationMs("weak")).toBe(WEAK_EQUIPMENT_ATTUNEMENT_MS);
    expect(getEquipmentAttunementDurationMs("strong")).toBe(STRONG_EQUIPMENT_ATTUNEMENT_MS);
  });

  it("treats set pieces and ability-grant manatky as strong magic", () => {
    const setPiece = items.find((item) => item.id === "item.set.barrel-brother.shield");
    const abilityItem = items.find((item) => item.id === "item.ability.last-page-rapier");

    expect(setPiece && getEquipmentMagicStrength(setPiece.id)).toBe("strong");
    expect(abilityItem && getEquipmentMagicStrength(abilityItem.id)).toBe("strong");
  });

  it("does not require attunement for ordinary base equipment", () => {
    const base = items.find((item) => item.id === "item.pan-of-persuasion");

    expect(base && getEquipmentMagicStrength(base.id)).toBeNull();
  });
});
