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

describe("monster flavor content", () => {
  it("keeps the first bestiary at exactly 20 monsters", () => {
    expect(monsters).toHaveLength(20);
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

  it("gives every monster fallback, race, class, path or pronoun, combo, and loot-note hooks", () => {
    for (const monster of monsters) {
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
      expect(monsterIds.has(monsterId)).toBe(true);
      expect(lootIds.length).toBeGreaterThanOrEqual(2);

      for (const itemId of lootIds) {
        expect(itemIds.has(itemId)).toBe(true);
      }
    }

    expect(Object.keys(monsterLoot)).toHaveLength(monsters.length);
  });
});
