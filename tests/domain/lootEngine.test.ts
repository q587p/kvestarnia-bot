import { describe, expect, it } from "vitest";
import type { ItemContent } from "../../src/content/schema";
import {
  getItemDropChance,
  getLootCandidates,
  getLuckUpgradeChance,
  rollLootRarity,
  rollMonsterLoot
} from "../../src/domain/loot";
import { FakeRandomSource } from "../../src/shared/random";

const items = [
  item("item.common-spoon", "common"),
  item("item.uncommon-fork", "uncommon"),
  item("item.rare-mug", "rare"),
  item("item.epic-napkin", "epic")
];

const monsterLoot = {
  "monster.test": items.map((candidate) => candidate.id),
  "monster.common-only": ["item.common-spoon"],
  "monster.missing-only": ["item.nope"]
} as const;

describe("loot engine", () => {
  it("builds stable eligible candidates from monster loot and item content", () => {
    expect(getLootCandidates({ monsterId: "monster.test", monsterLoot, items })).toEqual([
      { item: items[0], rarity: "common" },
      { item: items[1], rarity: "uncommon" },
      { item: items[2], rarity: "rare" },
      { item: items[3], rarity: "epic" }
    ]);
  });

  it("returns no eligible loot safely when content has no valid candidates", () => {
    expect(
      rollMonsterLoot({
        monsterId: "monster.missing-only",
        monsterLoot,
        items,
        luck: 6,
        rng: new FakeRandomSource([0])
      })
    ).toEqual({ state: "none", reason: "no-eligible-loot" });
  });

  it("uses deterministic RNG for drop, rarity, and candidate selection", () => {
    const roll = rollMonsterLoot({
      monsterId: "monster.test",
      monsterLoot,
      items,
      luck: 6,
      rng: new FakeRandomSource([0.1, 0.95, 0.9, 0])
    });

    expect(roll).toMatchObject({
      state: "dropped",
      rarity: "rare",
      item: {
        id: "item.rare-mug"
      }
    });
  });

  it("can return no drop without consuming a fake item", () => {
    expect(
      rollMonsterLoot({
        monsterId: "monster.test",
        monsterLoot,
        items,
        luck: 6,
        rng: new FakeRandomSource([0.9])
      })
    ).toEqual({ state: "none", reason: "no-drop" });
  });

  it("keeps LUCK bounded for drop and rarity upgrades", () => {
    expect(getItemDropChance(999)).toBeCloseTo(0.45);
    expect(getLuckUpgradeChance(999)).toBe(0.1);
    expect(getLuckUpgradeChance(6)).toBe(0);
  });

  it("does not make rare or epic mandatory with high LUCK", () => {
    const rarity = rollLootRarity(new FakeRandomSource([0.1, 0.9]), 999);

    expect(rarity).toBe("common");
  });

  it("falls back to the best available candidate at or below the rolled rarity", () => {
    const roll = rollMonsterLoot({
      monsterId: "monster.common-only",
      monsterLoot,
      items,
      luck: 6,
      rng: new FakeRandomSource([0.1, 0.99, 0.9, 0])
    });

    expect(roll).toMatchObject({
      state: "dropped",
      rarity: "epic",
      item: {
        id: "item.common-spoon"
      }
    });
  });
});

function item(id: string, rarity: ItemContent["rarity"]): ItemContent {
  return {
    id,
    name: id,
    description: id,
    rarity,
    slot: "junk",
    goldValue: 1
  };
}
