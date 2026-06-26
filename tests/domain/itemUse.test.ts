import { describe, expect, it } from "vitest";
import {
  calculateHealingPreview,
  createItemUseFingerprint,
  getItemUseEffect
} from "../../src/domain/itemUse";
import type { ItemContent } from "../../src/content/schema";

const bandage: ItemContent = {
  id: "item.test-bandage",
  name: "Тестовий бинт",
  description: "Для перевірки.",
  rarity: "common",
  slot: "consumable",
  goldValue: 7,
  tags: ["consumable", "one-use"],
  useEffect: {
    kind: "heal-hp",
    amount: 7
  }
};

describe("item use domain", () => {
  it("recognizes only tagged one-use healing consumables", () => {
    expect(getItemUseEffect(bandage)).toEqual({ kind: "heal-hp", amount: 7 });
    expect(getItemUseEffect({ ...bandage, tags: ["consumable"] })).toBeNull();
    expect(getItemUseEffect({ ...bandage, slot: "junk" })).toBeNull();
  });

  it("caps healing at current max HP", () => {
    expect(calculateHealingPreview({
      hpCurrent: 10,
      hpMax: 15,
      effect: bandage.useEffect!
    })).toMatchObject({
      hpBefore: 10,
      hpMax: 15,
      healAmount: 5,
      hpAfter: 15
    });
  });

  it("fingerprints behavior-relevant content", () => {
    expect(createItemUseFingerprint(bandage)).toBe(createItemUseFingerprint({
      ...bandage,
      tags: ["one-use", "consumable"]
    }));
    expect(createItemUseFingerprint(bandage)).not.toBe(createItemUseFingerprint({
      ...bandage,
      useEffect: { kind: "heal-hp", amount: 6 }
    }));
  });
});
