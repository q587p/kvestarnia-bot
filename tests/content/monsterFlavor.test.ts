import { describe, expect, it } from "vitest";
import {
  items,
  monsterFlavorLines,
  monsterLoot,
  monsters,
  selectMonsterFlavorLine
} from "../../src/content";
import {
  MONSTER_TROPHY_TARGET_SHARE,
  monsterTrophyLoot
} from "../../src/content/monsterTrophyCoverage";
import { equipmentSlots } from "../../src/content/equipmentSlots";
import { mantokEquipmentCoverageItems } from "../../src/content/mantokEquipmentCoverage";
import {
  MANTOK_EQUIPMENT_COVERAGE_LOOT_WEIGHT,
  mantokEquipmentCoverageLoot
} from "../../src/content/mantokEquipmentCoverageLoot";
import { getLootCandidates, getMonsterLootEntryItemId } from "../../src/domain/loot/lootEngine";

const forbiddenPlayerFacingPatterns = [
  /\bsun\b/i,
  /\bmoon\b/i,
  /\bboundary\b/i,
  /Шлях Сонця/i,
  /Шлях Місяця/i,
  /Шлях Межі/i,
  /<[^>]*>/
];

const baselineCharacter = {
  raceId: "race.human-ish",
  classId: "class.warrior",
  pronoun: "he" as const,
  path: "sun" as const
};

const legacyMonsterLootIds = [
  "monster.mimic-shawarma",
  "monster.basement-mouse-with-title",
  "monster.stamp-doorkeeper-skeleton",
  "monster.spreadsheet-goblin",
  "monster.deadline-spider",
  "monster.preapproval-dragonling",
  "monster.unread-rules-ghost",
  "monster.anxious-slippers-swarm",
  "monster.borshch-slime",
  "monster.conditionally-sliced-loaf-bandit",
  "monster.queue-counter-gargoyle",
  "monster.audit-mosquito",
  "monster.archival-knysh-eater",
  "monster.final-comment-troll",
  "monster.report-jellyfish",
  "monster.no-change-merchantling",
  "monster.self-critique-mirror",
  "monster.dry-sea-teapot",
  "monster.cabbage-knight-on-break",
  "monster.zero-declaration-tax-dragon"
] as const;

describe("monster flavor content", () => {
  it("keeps the expanded bestiary roster stable", () => {
    expect(monsters).toHaveLength(93);
    expect(monsters.map((monster) => monster.id)).toContain("monster.mimic-shawarma");
    expect(monsters.map((monster) => monster.id)).toContain("monster.expired-archive-upyr-king");
  });

  it("gives every monster meaningful tags", () => {
    for (const monster of monsters) {
      expect(monster.tags.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps monster flavor ids unique", () => {
    const ids = monsterFlavorLines.map((line) => line.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the original bestiary rich and the new ladder minimal but valid", () => {
    for (const monster of monsters.slice(0, 20)) {
      const lines = monsterFlavorLines.filter((line) => line.monsterId === monster.id);
      const startLines = lines.filter((line) => line.placement === "monster.start");

      expect(startLines.some((line) => !line.selector)).toBe(true);
      expect(startLines.some((line) => line.selector?.raceIds?.length)).toBe(true);
      expect(startLines.some((line) => line.selector?.classIds?.length)).toBe(true);
      expect(
        startLines.some((line) => line.selector?.paths?.length || line.selector?.pronouns?.length)
      ).toBe(true);
      expect(startLines.some((line) => line.selector?.combos?.length)).toBe(true);
      expect(lines.some((line) => line.placement === "monster.loot-note")).toBe(true);
    }

    for (const monster of monsters.slice(20, 31)) {
      const lines = monsterFlavorLines.filter((line) => line.monsterId === monster.id);
      const startLines = lines.filter((line) => line.placement === "monster.start");

      expect(startLines.some((line) => !line.selector)).toBe(true);
      expect(lines.some((line) => line.placement === "monster.loot-note")).toBe(true);
      expect(startLines.some((line) => line.selector?.raceIds?.length)).toBe(false);
      expect(startLines.some((line) => line.selector?.classIds?.length)).toBe(false);
      expect(
        startLines.some((line) => line.selector?.paths?.length || line.selector?.pronouns?.length)
      ).toBe(false);
      expect(startLines.some((line) => line.selector?.combos?.length)).toBe(false);
    }
  });

  it("keeps player-facing monster flavor free of hidden path labels and raw HTML", () => {
    for (const line of monsterFlavorLines) {
      const playerFacing = `${line.id} ${line.text}`;

      for (const pattern of forbiddenPlayerFacingPatterns) {
        expect(playerFacing).not.toMatch(pattern);
      }
    }
  });

  it("selects monster flavor by combo, class, race, path, then fallback priority", () => {
    expect(
      selectMonsterFlavorLine(
        {
          raceId: "race.dryland-rusalka",
          classId: "class.varenyk-mancer",
          pronoun: "they",
          path: "boundary"
        },
        { monsterId: "monster.mimic-shawarma", placement: "monster.start", seed: "combo" }
      )?.id
    ).toBe("monster-flavor.mimic-shawarma.combo.dryland-rusalka-varenyk-mancer");

    expect(
      selectMonsterFlavorLine(
        {
          raceId: "race.bisyny",
          classId: "class.bureaucramancer",
          pronoun: "they",
          path: "boundary"
        },
        { monsterId: "monster.mimic-shawarma", placement: "monster.start", seed: "class" }
      )?.id
    ).toBe("monster-flavor.mimic-shawarma.class.bureaucramancer");

    expect(
      selectMonsterFlavorLine(
        {
          raceId: "race.bisyny",
          classId: "class.warrior",
          pronoun: "they",
          path: "boundary"
        },
        { monsterId: "monster.mimic-shawarma", placement: "monster.start", seed: "race" }
      )?.id
    ).toBe("monster-flavor.mimic-shawarma.race.bisyny");

    expect(
      selectMonsterFlavorLine(
        {
          raceId: "race.elf",
          classId: "class.warrior",
          pronoun: "they",
          path: "boundary"
        },
        { monsterId: "monster.mimic-shawarma", placement: "monster.start", seed: "path" }
      )?.id
    ).toBe("monster-flavor.mimic-shawarma.path-c");

    expect(
      selectMonsterFlavorLine(
        baselineCharacter,
        { monsterId: "monster.mimic-shawarma", placement: "monster.start", seed: "fallback" }
      )?.id
    ).toBe("monster-flavor.mimic-shawarma.fallback.start");
  });

  it("selects the same monster flavor for the same seed", () => {
    const query = {
      monsterId: "monster.deadline-spider",
      placement: "monster.start" as const,
      seed: "stable-seed"
    };

    expect(selectMonsterFlavorLine(baselineCharacter, query)).toEqual(
      selectMonsterFlavorLine(baselineCharacter, query)
    );
  });

  it("maps every monster loot reference to an existing item", () => {
    const itemIds = new Set(items.map((item) => item.id));
    const monsterIds = new Set(monsters.map((monster) => monster.id));

    for (const [monsterId, lootIds] of Object.entries(monsterLoot)) {
      expect(monsterIds.has(monsterId), `orphan loot mapping for ${monsterId}`).toBe(true);

      if ((legacyMonsterLootIds as readonly string[]).includes(monsterId)) {
        expect(lootIds.length, `legacy loot should stay rich for ${monsterId}`).toBeGreaterThanOrEqual(2);
      }

      for (const lootEntry of lootIds) {
        const itemId = getMonsterLootEntryItemId(lootEntry);

        expect(itemIds.has(itemId), `missing loot item ${itemId} for ${monsterId}`).toBe(true);
      }
    }

    expect(Object.keys(monsterLoot)).toHaveLength(monsters.length);
  });

  it("covers every active monster with at least one reachable loot item", () => {
    const itemIds = new Set(items.map((item) => item.id));
    const lootByMonster = new Map<string, readonly string[]>(Object.entries(monsterLoot));

    for (const monster of monsters) {
      const lootIds = lootByMonster.get(monster.id) ?? [];
      const candidates = getLootCandidates({ monsterId: monster.id, monsterLoot, items });

      expect(lootByMonster.has(monster.id), `missing loot mapping for ${monster.id}`).toBe(true);
      expect(lootIds.length, `missing loot ids for ${monster.id}`).toBeGreaterThanOrEqual(1);
      expect(candidates.length, `unreachable loot candidates for ${monster.id}`).toBeGreaterThanOrEqual(1);

      for (const lootEntry of lootIds) {
        const itemId = getMonsterLootEntryItemId(lootEntry);

        expect(itemIds.has(itemId), `missing loot item ${itemId} for ${monster.id}`).toBe(true);
      }
    }
  });

  it("adds every authored Mantok equipment coverage item to monster loot without orphan monsters", () => {
    const monsterIds = new Set(monsters.map((monster) => monster.id));
    const coverageItemIds = new Set(mantokEquipmentCoverageItems.map((item) => item.id));
    const coverageLootEntries = Object.entries(mantokEquipmentCoverageLoot).flatMap(
      ([monsterId, entries]) => entries.map((entry) => ({ monsterId, entry }))
    );
    const coverageLootItemIds = new Set(coverageLootEntries.map(({ entry }) => entry.itemId));
    const runtimeCoverageItemIds = new Set(
      Object.values(monsterLoot)
        .flatMap((entries) => entries.map(getMonsterLootEntryItemId))
        .filter((itemId) => coverageItemIds.has(itemId))
    );

    expect(coverageLootEntries).toHaveLength(mantokEquipmentCoverageItems.length);
    expect(coverageLootItemIds.size).toBe(mantokEquipmentCoverageItems.length);
    expect(runtimeCoverageItemIds).toEqual(coverageItemIds);

    for (const { monsterId, entry } of coverageLootEntries) {
      expect(monsterIds.has(monsterId), `orphan coverage loot monster ${monsterId}`).toBe(true);
      expect(coverageItemIds.has(entry.itemId), `unknown coverage loot item ${entry.itemId}`).toBe(
        true
      );
      expect(entry.weight).toBe(MANTOK_EQUIPMENT_COVERAGE_LOOT_WEIGHT);
    }

    for (const slot of equipmentSlots) {
      expect(
        coverageLootEntries.some(({ entry }) => entry.equipmentSlot === slot),
        `missing coverage loot slot ${slot}`
      ).toBe(true);
    }
  });

  it("keeps trophy-covered monsters weighted with reachable non-trophy fallback loot", () => {
    const itemById = new Map(items.map((item) => [item.id, item]));

    for (const [monsterId, lootEntries] of Object.entries(monsterTrophyLoot)) {
      const trophyEntries = lootEntries.filter((entry) => entry.kind === "trophy");
      const fallbackEntries = lootEntries.filter((entry) => entry.kind === "fallback");
      const trophyIds = new Set(trophyEntries.map((entry) => entry.itemId));
      const fallbackIds = new Set(fallbackEntries.map((entry) => entry.itemId));
      const candidates = getLootCandidates({ monsterId, monsterLoot, items });
      const candidateIds = new Set(candidates.map((candidate) => candidate.item.id));

      expect(trophyEntries, `missing trophy entry for ${monsterId}`).toHaveLength(1);
      expect(fallbackEntries.length, `missing fallback entries for ${monsterId}`).toBeGreaterThan(0);
      expect(trophyEntries[0]?.weight, `wrong trophy weight for ${monsterId}`).toBeCloseTo(
        MONSTER_TROPHY_TARGET_SHARE
      );

      for (const trophyId of trophyIds) {
        expect(candidateIds.has(trophyId), `unreachable trophy ${trophyId} for ${monsterId}`).toBe(
          true
        );
      }

      for (const fallbackId of fallbackIds) {
        expect(
          candidateIds.has(fallbackId),
          `unreachable non-trophy fallback ${fallbackId} for ${monsterId}`
        ).toBe(true);
      }

      const trophyRarities = new Set(
        [...trophyIds].map((itemId) => itemById.get(itemId)?.rarity).filter(Boolean)
      );
      const fallbackRarities = new Set(
        [...fallbackIds].map((itemId) => itemById.get(itemId)?.rarity).filter(Boolean)
      );

      expect(trophyRarities.size, `ambiguous trophy rarity for ${monsterId}`).toBe(1);
      for (const rarity of fallbackRarities) {
        expect(trophyRarities.has(rarity), `fallback rarity ${rarity} differs for ${monsterId}`).toBe(
          true
        );
      }
    }
  });
});
