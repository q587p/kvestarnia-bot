import { describe, expect, it } from "vitest";
import {
  getActiveMantokSets,
  getMantokSetForItem,
  summarizeMantokSetBonusEffects
} from "../../../src/domain/equipment/mantokSetBonuses";

describe("mantok set bonuses", () => {
  it("activates a paired dagger 2/2 threshold", () => {
    const summaries = getActiveMantokSets([
      "item.set.red-line.left-dagger",
      "item.set.red-line.margin-dagger"
    ]);
    const summary = summaries[0];

    expect(summaries).toHaveLength(1);
    expect(summary?.set.id).toBe("mantok-set.red-line-duel");
    expect(summary?.equippedPieces.map((piece) => piece.itemId)).toEqual([
      "item.set.red-line.left-dagger",
      "item.set.red-line.margin-dagger"
    ]);
    expect(summary?.activeBonuses).toHaveLength(1);
    expect(summary?.activeBonuses[0]?.pieces).toBe(2);
    expect(summary?.activeBonuses[0]?.effect.dexterity).toBe(1);
    expect(summary?.nextBonus).toBeNull();
  });

  it("counts upgraded concrete item ids as their base Mantok set pieces", () => {
    const summaries = getActiveMantokSets([
      "item.set.red-line.left-dagger.plus-1",
      "item.set.red-line.margin-dagger"
    ]);
    const summary = summaries[0];

    expect(summaries).toHaveLength(1);
    expect(summary?.set.id).toBe("mantok-set.red-line-duel");
    expect(summary?.equippedPieces.map((piece) => piece.itemId)).toEqual([
      "item.set.red-line.left-dagger",
      "item.set.red-line.margin-dagger"
    ]);
    expect(summary?.activeBonuses[0]?.pieces).toBe(2);
  });

  it("resolves upgraded set-piece ids to the same Mantok set family", () => {
    expect(getMantokSetForItem("item.set.barrel-brother.helm")?.id).toBe(
      "mantok-set.barrel-brother-bulwark"
    );
    expect(getMantokSetForItem("item.set.barrel-brother.helm.plus-5")?.id).toBe(
      "mantok-set.barrel-brother-bulwark"
    );
  });

  it("activates partial and full armor thresholds", () => {
    const partial = summarizeMantokSetBonusEffects([
      "item.set.barrel-brother.helm",
      "item.set.barrel-brother.cuirass"
    ]);
    const full = summarizeMantokSetBonusEffects([
      "item.set.barrel-brother.helm",
      "item.set.barrel-brother.cuirass",
      "item.set.barrel-brother.greaves",
      "item.set.barrel-brother.shield"
    ]);

    expect(partial).toMatchObject({ armor: 1, hpMax: 2 });
    expect(full).toMatchObject({ armor: 2, hpMax: 2, resist: 2 });
  });

  it("supports multiple simultaneous sets", () => {
    const effect = summarizeMantokSetBonusEffects([
      "item.set.red-line.left-dagger",
      "item.set.red-line.margin-dagger",
      "item.set.couplet.harp",
      "item.set.couplet.cap"
    ]);

    expect(effect).toMatchObject({ dexterity: 1, charisma: 1 });
  });

  it("updates active bonuses when equipment is replaced or removed", () => {
    const full = summarizeMantokSetBonusEffects([
      "item.set.barrel-brother.helm",
      "item.set.barrel-brother.cuirass",
      "item.set.barrel-brother.greaves",
      "item.set.barrel-brother.shield"
    ]);
    const replaced = summarizeMantokSetBonusEffects([
      "item.set.barrel-brother.helm",
      "item.set.barrel-brother.cuirass",
      "item.set.barrel-brother.greaves"
    ]);
    const removed = summarizeMantokSetBonusEffects(["item.set.barrel-brother.helm"]);

    expect(full).toMatchObject({ armor: 2, hpMax: 2, resist: 2 });
    expect(replaced).toMatchObject({ armor: 1, hpMax: 2, resist: 1 });
    expect(removed).toEqual({});
  });

  it("does not count duplicate equipped item ids as extra set pieces", () => {
    const summaries = getActiveMantokSets([
      "item.set.yeger-shadow.longbow",
      "item.set.yeger-shadow.longbow",
      "item.set.yeger-shadow.hood"
    ]);
    const summary = summaries.find((candidate) => candidate.set.id === "mantok-set.yeger-shadow-path");

    expect(summary?.equippedPieces.map((piece) => piece.itemId)).toEqual([
      "item.set.yeger-shadow.hood",
      "item.set.yeger-shadow.longbow"
    ]);
    expect(summary?.activeBonuses.map((bonus) => bonus.pieces)).toEqual([2]);
    expect(summary?.nextBonus?.pieces).toBe(3);
  });
});
