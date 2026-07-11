import { describe, expect, it } from "vitest";
import { items } from "../../src/content";
import {
  buildEquipmentAttunementPayload,
  getEquipmentAttunementDurationMs,
  getEquipmentMagicStrength,
  isEquipmentAttunementPendingForRow,
  MAGE_STRONG_EQUIPMENT_ATTUNEMENT_MS,
  MAGE_WEAK_EQUIPMENT_ATTUNEMENT_MS,
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
    expect(getEquipmentAttunementDurationMs("weak", "class.warrior")).toBe(WEAK_EQUIPMENT_ATTUNEMENT_MS);
    expect(getEquipmentAttunementDurationMs("strong", "class.warrior")).toBe(STRONG_EQUIPMENT_ATTUNEMENT_MS);
  });

  it("lets magical specialist classes attune weak and strong magic faster", () => {
    expect(getEquipmentAttunementDurationMs("weak", "class.mage")).toBe(MAGE_WEAK_EQUIPMENT_ATTUNEMENT_MS);
    expect(getEquipmentAttunementDurationMs("strong", "class.mage")).toBe(MAGE_STRONG_EQUIPMENT_ATTUNEMENT_MS);
    expect(getEquipmentAttunementDurationMs("weak", "class.varenyk-mancer")).toBe(MAGE_WEAK_EQUIPMENT_ATTUNEMENT_MS);
    expect(getEquipmentAttunementDurationMs("strong", "class.bureaucramancer")).toBe(MAGE_STRONG_EQUIPMENT_ATTUNEMENT_MS);
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

  it("matches the exact equipment row and stops excluding it once ready", () => {
    const updatedAt = new Date("2026-07-11T08:00:00.000Z");
    const row = { slot: "head", itemId: "item.pan-of-persuasion.plus-1", updatedAt };
    const payload = buildEquipmentAttunementPayload({
      slot: row.slot,
      itemId: row.itemId,
      itemName: "Пательня переконання +1",
      equipmentUpdatedAt: updatedAt,
      strength: "weak",
      startedAt: updatedAt,
      readyAt: new Date("2026-07-11T08:13:00.000Z")
    });

    expect(isEquipmentAttunementPendingForRow({
      row,
      actionPayloads: [payload],
      now: new Date("2026-07-11T08:12:59.999Z")
    })).toBe(true);
    expect(isEquipmentAttunementPendingForRow({
      row,
      actionPayloads: [payload],
      now: new Date("2026-07-11T08:13:00.000Z")
    })).toBe(false);
    expect(isEquipmentAttunementPendingForRow({
      row: { ...row, updatedAt: new Date(updatedAt.getTime() + 1) },
      actionPayloads: [payload],
      now: new Date("2026-07-11T08:12:00.000Z")
    })).toBe(false);
  });
});
