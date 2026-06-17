import { describe, expect, it } from "vitest";
import { checkLootExpansionEquipRequirement } from "../../src/content/lootExpansionV1";
import type { ItemContent } from "../../src/content/schema";
import {
  getItemDropChance,
  getLootExpansionCandidates,
  getLootCandidates,
  getLuckUpgradeChance,
  rollLootExpansionItem,
  rollLootRarity,
  rollMonsterLoot
} from "../../src/domain/loot";
import { FakeRandomSource, SeededRandomSource } from "../../src/shared/random";

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

  it("does not generate enhanced expansion loot below its unlock levels", () => {
    const levelTwoCandidates = getLootExpansionCandidates({
      profile: { level: 2, classId: "class.warrior", raceId: "race.human-ish" },
      sourceId: "trash_mob"
    });
    const levelNineCandidates = getLootExpansionCandidates({
      profile: { level: 9, classId: "class.warrior", raceId: "race.human-ish" },
      sourceId: "trash_mob"
    });
    const levelEighteenCandidates = getLootExpansionCandidates({
      profile: { level: 18, classId: "class.warrior", raceId: "race.human-ish" },
      sourceId: "boss_chest"
    });

    expect(levelTwoCandidates.every((candidate) => !candidate.item.name.match(/\+[1-5]$/))).toBe(
      true
    );
    expect(levelNineCandidates.every((candidate) => !candidate.item.name.endsWith("+3"))).toBe(
      true
    );
    expect(levelEighteenCandidates.some((candidate) => candidate.item.name.endsWith("+5"))).toBe(
      true
    );
  });

  it("does not generate loot that the current character cannot equip", () => {
    const profile = { level: 18, classId: "class.warrior", raceId: "race.human-ish" };
    const candidates = getLootExpansionCandidates({
      profile,
      sourceId: "boss_chest"
    });

    expect(candidates.length).toBeGreaterThan(0);

    for (const candidate of candidates) {
      expect(checkLootExpansionEquipRequirement(candidate.item.id, profile)).toMatchObject({
        canEquip: true,
        reasons: []
      });
    }
  });

  it("uses expansion candidates only when a character profile is supplied", () => {
    const withoutProfile = rollMonsterLoot({
      monsterId: "monster.common-only",
      monsterLoot,
      items,
      luck: 6,
      rng: new FakeRandomSource([0.1, 0.99, 0.9, 0])
    });
    const withProfile = rollMonsterLoot({
      monsterId: "monster.common-only",
      monsterLoot,
      items,
      luck: 6,
      rng: new FakeRandomSource([0.1, 0.99, 0.9, 0.99]),
      character: { level: 18, classId: "class.varenyk-mancer", raceId: "race.human-ish" },
      sourceId: "kitchen_dungeon"
    });

    expect(withoutProfile).toMatchObject({
      state: "dropped",
      item: { id: "item.common-spoon" }
    });
    expect(withProfile).toMatchObject({
      state: "dropped"
    });

    if (withProfile.state === "dropped") {
      expect([withProfile.item.id, withProfile.item.id.startsWith("item.loot-v1-")]).toContain(
        true
      );
    }
  });

  it("keeps seeded expansion sampling deterministic", () => {
    const input = {
      profile: {
        level: 10,
        classId: "class.bureaucramancer",
        raceId: "race.domovyk",
        titleIds: ["archive_rat"]
      },
      sourceId: "bureaucracy_wing" as const
    };
    const first = Array.from({ length: 5 }, () =>
      rollLootExpansionItem({ ...input, rng: new SeededRandomSource("loot-seed") })?.id
    );
    const second = Array.from({ length: 5 }, () =>
      rollLootExpansionItem({ ...input, rng: new SeededRandomSource("loot-seed") })?.id
    );

    expect(first).toEqual(second);
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
