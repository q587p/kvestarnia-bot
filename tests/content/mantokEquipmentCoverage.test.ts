import { describe, expect, it } from "vitest";
import { equipmentSlots } from "../../src/content/equipmentSlots";
import {
  MANTOK_EQUIPMENT_COVERAGE_TITLE_BUCKETS,
  checkMantokEquipmentCoverageRequirement,
  getMantokEquipmentCoverageReport,
  mantokEquipmentCoverageItems
} from "../../src/content/mantokEquipmentCoverage";
import { classes } from "../../src/content/classes";
import { activeRaces } from "../../src/content/races";
import { itemSchema } from "../../src/content/schema";

describe("mantok equipment coverage content", () => {
  it("ships valid authored equipment for every canonical equipment slot", () => {
    const report = getMantokEquipmentCoverageReport();

    expect(report.itemCount).toBe(101);
    expect(report.slotCounts).toEqual({
      weapon: 18,
      offhand: 16,
      head: 14,
      chest: 12,
      legs: 12,
      accessory: 15,
      tool: 14
    });
    expect(report.slotSpread).toBeLessThanOrEqual(10);

    for (const slot of equipmentSlots) {
      expect(report.slotCounts[slot], slot).toBeGreaterThanOrEqual(5);
    }

    for (const item of mantokEquipmentCoverageItems) {
      expect(() => itemSchema.parse(item)).not.toThrow();
      expect(item.effect, item.id).toBeDefined();
    }
  });

  it("gives every active class, active race and title bucket at least two restricted items", () => {
    const report = getMantokEquipmentCoverageReport();

    for (const characterClass of classes) {
      expect(report.restrictedClassCounts[characterClass.id], characterClass.id).toBeGreaterThanOrEqual(2);
    }

    for (const race of activeRaces) {
      expect(report.restrictedRaceCounts[race.id], race.id).toBeGreaterThanOrEqual(2);
    }

    for (const titleBucket of MANTOK_EQUIPMENT_COVERAGE_TITLE_BUCKETS) {
      expect(report.restrictedTitleBucketCounts[titleBucket], titleBucket).toBeGreaterThanOrEqual(2);
    }
  });

  it("enforces class, race and title-bucket gates for authored coverage manatky", () => {
    expect(
      checkMantokEquipmentCoverageRequirement("item.mantok.coverage.class.ranger.twohand-bow", {
        level: 13,
        classId: "class.warrior",
        raceId: "race.human-ish"
      })
    ).toMatchObject({ canEquip: false, reasons: ["class"] });

    expect(
      checkMantokEquipmentCoverageRequirement("item.mantok.coverage.class.ranger.twohand-bow", {
        level: 13,
        classId: "class.ranger",
        raceId: "race.elf"
      })
    ).toMatchObject({ canEquip: true, reasons: [] });

    expect(
      checkMantokEquipmentCoverageRequirement("item.mantok.coverage.race.dwarf-stone-buckler", {
        level: 13,
        classId: "class.warrior",
        raceId: "race.human-ish"
      })
    ).toMatchObject({ canEquip: false, reasons: ["race"] });

    expect(
      checkMantokEquipmentCoverageRequirement("item.mantok.coverage.path.ranger-long-bow", {
        level: 13,
        classId: "class.ranger",
        raceId: "race.elf",
        title: "Слідознавець Чужої Карти"
      })
    ).toMatchObject({ canEquip: true, reasons: [] });

    expect(
      checkMantokEquipmentCoverageRequirement("item.mantok.coverage.path.ranger-long-bow", {
        level: 13,
        classId: "class.ranger",
        raceId: "race.elf",
        title: "Пригодник місцевого значення"
      })
    ).toMatchObject({ canEquip: false, reasons: ["title"] });
  });

  it("marks logical offhand and two-handed coverage items with hand tags", () => {
    expect(mantokEquipmentCoverageItems.find((item) => item.id === "item.mantok.coverage.class.ranger.twohand-bow")).toMatchObject({
      equipmentSlot: "weapon",
      tags: ["twohand"]
    });
    expect(mantokEquipmentCoverageItems.find((item) => item.id === "item.mantok.coverage.universal.notice-board-shield")).toMatchObject({
      equipmentSlot: "offhand",
      tags: ["offhand"]
    });
  });
});
