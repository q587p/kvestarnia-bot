import { describe, expect, it } from "vitest";
import { getComboTitle } from "../../src/content/characterOptions";
import { classes } from "../../src/content/classes";
import { equipmentSlots } from "../../src/content/equipmentSlots";
import { items } from "../../src/content/items";
import { mantokEquipmentCoverageItems } from "../../src/content/mantokEquipmentCoverage";
import { activeRaces } from "../../src/content/races";
import type { EquipmentSlotContent, ItemContent } from "../../src/content/schema";
import { mapItemToEquipmentSlot } from "../../src/services/equipmentService";

describe("mantok equipment coverage content", () => {
  it("fills every canonical equipment slot with authored manatky", () => {
    const authoredSlots = new Set(
      items
        .filter((item) => !item.id.startsWith("item.loot-v1-"))
        .flatMap((item) => maybeOne(mapItemToEquipmentSlot(item)))
    );

    expect(authoredSlots).toEqual(new Set(equipmentSlots));
  });

  it("keeps the authored coverage pack narrow and balanced", () => {
    const coverageBySlot = new Map<EquipmentSlotContent, ItemContent>();

    for (const item of mantokEquipmentCoverageItems) {
      const slot = mapItemToEquipmentSlot(item);

      expect(slot, item.id).toBeDefined();
      expect(item.effect, item.id).toBeDefined();
      expect(item.id.startsWith("item.loot-v1-")).toBe(false);

      if (slot) {
        coverageBySlot.set(slot, item);
      }
    }

    expect(new Set(coverageBySlot.keys())).toEqual(new Set(equipmentSlots));
    expect(coverageBySlot.get("offhand")).toMatchObject({
      tags: ["offhand"]
    });
    expect(coverageBySlot.get("weapon")).toMatchObject({
      tags: ["twohand"]
    });
  });

  it("uses only current class, race, and title gates for authored equipment", () => {
    const classIds = new Set(classes.map((entry) => entry.id));
    const raceIds = new Set(activeRaces.map((entry) => entry.id));
    const comboTitles = new Set(
      activeRaces.flatMap((race) =>
        classes.flatMap((characterClass) => [
          getComboTitle(race.id, characterClass.id, "he"),
          getComboTitle(race.id, characterClass.id, "she"),
          getComboTitle(race.id, characterClass.id, "they")
        ])
      )
    );
    const requirements = mantokEquipmentCoverageItems.flatMap((item) =>
      item.equipmentRequirements ? [item.equipmentRequirements] : []
    );

    expect(requirements.some((requirement) => (requirement.classIds?.length ?? 0) > 0)).toBe(true);
    expect(requirements.some((requirement) => (requirement.raceIds?.length ?? 0) > 0)).toBe(true);
    expect(requirements.some((requirement) => (requirement.titleLabels?.length ?? 0) > 0)).toBe(
      true
    );

    for (const requirement of requirements) {
      for (const classId of requirement.classIds ?? []) {
        expect(classIds.has(classId), classId).toBe(true);
      }

      for (const raceId of requirement.raceIds ?? []) {
        expect(raceIds.has(raceId), raceId).toBe(true);
      }

      for (const title of requirement.titleLabels ?? []) {
        expect(comboTitles.has(title), title).toBe(true);
      }
    }
  });
});

function maybeOne<T>(value: T | null | undefined): T[] {
  return value ? [value] : [];
}
