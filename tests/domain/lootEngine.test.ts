import { describe, expect, it } from "vitest";
import { items as contentItems, monsterLoot as contentMonsterLoot } from "../../src/content";
import { checkLootExpansionEquipRequirement } from "../../src/content/lootExpansionV1";
import {
  MONSTER_TROPHY_FALLBACK_ITEM_IDS,
  MONSTER_TROPHY_TARGET_SHARE
} from "../../src/content/monsterTrophyCoverage";
import type { ItemContent } from "../../src/content/schema";
import {
  BANDAGE_DROP_QUANTITY_WEIGHTS,
  getIskrokaminReplacementChance,
  getItemDropChance,
  getLootExpansionCandidates,
  getLootCandidates,
  getLuckUpgradeChance,
  LOOT_RARITY_WEIGHTS,
  rollBandageDropQuantity,
  rollLootExpansionItem,
  rollLootRarity,
  rollMonsterLoot,
  rollPostFightBandageSlotReward
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

  it("accepts legendary candidates while keeping base legendary loot disabled", () => {
    const legendary = item("item.legendary-ladle", "legendary");

    expect(getLootCandidates({
      monsterId: "monster.legendary-test",
      monsterLoot: { "monster.legendary-test": [legendary.id] },
      items: [legendary]
    })).toEqual([{ item: legendary, rarity: "legendary" }]);
    expect(LOOT_RARITY_WEIGHTS.legendary).toBe(0);
    expect(rollLootRarity(new FakeRandomSource([0.999, 0]), 999)).toBe("epic");
  });

  it("preserves explicit monster loot weights on candidates", () => {
    const weightedMonsterLoot = {
      "monster.weighted": [
        { itemId: "item.common-spoon", weight: MONSTER_TROPHY_TARGET_SHARE },
        { itemId: "item.uncommon-fork", weight: 1 - MONSTER_TROPHY_TARGET_SHARE }
      ]
    } as const;

    expect(getLootCandidates({ monsterId: "monster.weighted", monsterLoot: weightedMonsterLoot, items })).toEqual([
      { item: items[0], rarity: "common", weight: MONSTER_TROPHY_TARGET_SHARE },
      { item: items[1], rarity: "uncommon", weight: 1 - MONSTER_TROPHY_TARGET_SHARE }
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

  it("keeps the base post-fight bandage quantity table explicit", () => {
    expect(BANDAGE_DROP_QUANTITY_WEIGHTS).toEqual([
      { quantity: 0, weight: 0.5 },
      { quantity: 1, weight: 0.25 },
      { quantity: 2, weight: 0.13 },
      { quantity: 3, weight: 0.08 },
      { quantity: 4, weight: 0.03 },
      { quantity: 5, weight: 0.01 }
    ]);
  });

  it("rolls base post-fight bandage quantities from the requested thresholds", () => {
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.499_999]) })).toBe(0);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.5]) })).toBe(1);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.749_999]) })).toBe(1);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.75]) })).toBe(2);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.879_999]) })).toBe(2);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.88]) })).toBe(3);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.959_999]) })).toBe(3);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.96]) })).toBe(4);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.989_999]) })).toBe(4);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.99]) })).toBe(5);
  });

  it("lets LUCK improve post-fight bandages without exceeding five", () => {
    expect(rollBandageDropQuantity({ luck: 16, rng: new FakeRandomSource([0.49, 0]) })).toBe(1);
    expect(rollBandageDropQuantity({ luck: 16, rng: new FakeRandomSource([0.99, 0]) })).toBe(5);
    expect(rollBandageDropQuantity({ luck: 6, rng: new FakeRandomSource([0.49, 0]) })).toBe(0);
  });

  it("returns no post-fight bandage-slot reward when the quantity is zero", () => {
    expect(
      rollPostFightBandageSlotReward({
        bandageQuantity: 0,
        luck: 6,
        rng: new FakeRandomSource([0])
      })
    ).toBeNull();
  });

  it("keeps the post-fight bandage slot exclusive between bandages and Iskrokamin", () => {
    expect(
      rollPostFightBandageSlotReward({
        bandageQuantity: 3,
        luck: 6,
        rng: new FakeRandomSource([0.5])
      })
    ).toEqual({ kind: "bandage", quantity: 3 });
    expect(
      rollPostFightBandageSlotReward({
        bandageQuantity: 3,
        luck: 6,
        rng: new FakeRandomSource([0.01])
      })
    ).toEqual({ kind: "iskrokamin", quantity: 2 });
  });

  it("keeps Luck bounded for Iskrokamin replacement", () => {
    expect(getIskrokaminReplacementChance(6)).toBe(0.04);
    expect(getIskrokaminReplacementChance(999)).toBe(0.06);
    expect(
      rollPostFightBandageSlotReward({
        bandageQuantity: 5,
        luck: 999,
        rng: new FakeRandomSource([0.059_999])
      })
    ).toEqual({ kind: "iskrokamin", quantity: 3 });
    expect(
      rollPostFightBandageSlotReward({
        bandageQuantity: 5,
        luck: 999,
        rng: new FakeRandomSource([0.06])
      })
    ).toEqual({ kind: "bandage", quantity: 5 });
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

  it("uses trophy weights so a single concrete monster trophy is not guaranteed", () => {
    const trophyMonsterId = "monster.collective-liability-cauldron";
    const fallbackIds = new Set<string>(MONSTER_TROPHY_FALLBACK_ITEM_IDS);
    const rolls = [0.01, 0.24, 0.99].map((candidateRoll) =>
      rollMonsterLoot({
        monsterId: trophyMonsterId,
        monsterLoot: contentMonsterLoot,
        items: contentItems,
        luck: 6,
        rng: new FakeRandomSource([0, 0, 0, candidateRoll])
      })
    );

    expect(rolls.every((roll) => roll.state === "dropped")).toBe(true);
    expect(
      rolls.some((roll) => roll.state === "dropped" && roll.item.id === "item.lid-of-shared-blame")
    ).toBe(true);
    expect(
      rolls.some((roll) => roll.state === "dropped" && fallbackIds.has(roll.item.id))
    ).toBe(true);
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

  it("keeps restricted authored Mantok coverage loot reachable as social trade candidates", () => {
    const candidates = getAllContentLootCandidateIds();

    expect(candidates).toContain("item.mantok.coverage.class.ranger.twohand-bow");
    expect(candidates).toContain("item.mantok.coverage.race.long-ear-cloak");
    expect(candidates).toContain("item.mantok.coverage.path.ranger-long-bow");
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

  it("lets LUCK influence guaranteed expansion item rarity", () => {
    const baseLuck = rollLootExpansionItem({
      profile: {
        level: 8,
        classId: "class.warrior",
        raceId: "race.human-ish"
      },
      sourceId: "boss_chest",
      luck: 6,
      rng: new FakeRandomSource([0.1, 0, 0])
    });
    const highLuck = rollLootExpansionItem({
      profile: {
        level: 8,
        classId: "class.warrior",
        raceId: "race.human-ish"
      },
      sourceId: "boss_chest",
      luck: 16,
      rng: new FakeRandomSource([0.1, 0, 0])
    });

    expect(baseLuck?.rarity).toBe("common");
    expect(highLuck?.rarity).toBe("uncommon");
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

function getAllContentLootCandidateIds(): string[] {
  return Object.keys(contentMonsterLoot).flatMap((monsterId) =>
    getLootCandidates({
      monsterId,
      monsterLoot: contentMonsterLoot,
      items: contentItems
    }).map((candidate) => candidate.item.id)
  );
}
