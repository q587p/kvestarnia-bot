import { describe, expect, it } from "vitest";
import {
  items,
  monsterFlavorLines,
  monsterLoot,
  monsters,
  selectMonsterFlavorLine
} from "../../src/content";

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

const ordinaryMonsterLadderIds = [
  "monster.complaint-lantern",
  "monster.ledger-boar",
  "monster.salted-oath-pretzel",
  "monster.liar-corridor-map",
  "monster.foam-auditor-boots",
  "monster.three-signature-chimera",
  "monster.cheese-vault-warden",
  "monster.calendar-hydra",
  "monster.inventory-prophet",
  "monster.quiet-catastrophe-clerk"
] as const;

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
  it("keeps the first bestiary at exactly 30 monsters", () => {
    expect(monsters).toHaveLength(30);
    expect(monsters.map((monster) => monster.id)).toContain("monster.mimic-shawarma");
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

    for (const monsterId of ordinaryMonsterLadderIds) {
      const lines = monsterFlavorLines.filter((line) => line.monsterId === monsterId);
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

    for (const monsterId of legacyMonsterLootIds) {
      const lootIds = monsterLoot[monsterId] ?? [];

      expect(lootIds).toBeDefined();
      expect(monsterIds.has(monsterId)).toBe(true);
      expect(lootIds.length).toBeGreaterThanOrEqual(2);

      for (const itemId of lootIds) {
        expect(itemIds.has(itemId)).toBe(true);
      }
    }

    expect(Object.keys(monsterLoot)).toHaveLength(30);
  });

  it("covers the ordinary monster ladder with at least one loot item each", () => {
    const itemIds = new Set(items.map((item) => item.id));

    for (const monsterId of ordinaryMonsterLadderIds) {
      const lootIds = monsterLoot[monsterId] ?? [];

      expect(monsterLoot[monsterId], `missing loot mapping for ${monsterId}`).toBeDefined();
      expect(lootIds.length, `missing loot ids for ${monsterId}`).toBeGreaterThanOrEqual(1);

      for (const itemId of lootIds) {
        expect(itemIds.has(itemId), `missing loot item ${itemId} for ${monsterId}`).toBe(true);
      }
    }
  });
});
