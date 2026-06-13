import { describe, expect, it } from "vitest";
import {
  characterFlavorLines,
  selectCharacterFlavorLine,
  type CharacterFlavorQuery
} from "../../src/content/characterFlavor";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

const baseCharacter: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: null
  }
};

describe("character flavor content", () => {
  it("keeps all flavor ids unique", () => {
    const ids = characterFlavorLines.map((line) => line.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not expose hidden path ids, path labels, or raw HTML markers", () => {
    const forbiddenPatterns = [
      /\bsun\b/i,
      /\bmoon\b/i,
      /\bboundary\b/i,
      /Шлях Сонця/i,
      /Шлях Місяця/i,
      /Шлях Межі/i,
      /Сонячний шлях/i,
      /Місячний шлях/i,
      /Межовий шлях/i,
      /[<>]/
    ];

    for (const line of characterFlavorLines) {
      const inspected = `${line.id}: ${line.text}`;

      for (const pattern of forbiddenPatterns) {
        expect(inspected).not.toMatch(pattern);
      }
    }
  });

  it("keeps placement, scene, and action combinations valid", () => {
    const allowedPlacements = new Set([
      "korchma.greeting",
      "quest.start",
      "quest.outcome",
      "raid.prep-hint",
      "raid.ranger-action"
    ]);
    const allowedScenes = new Set(["shawarma", "fight", "cellar", "barrel"]);
    const allowedActionsByScene = {
      shawarma: new Set(["poke", "receipt", "flee"]),
      fight: new Set(["attack", "receipt", "flee"]),
      cellar: new Set(["negotiate", "cheese-trap", "sweep-bravely"]),
      barrel: new Set<string>()
    };

    for (const line of characterFlavorLines) {
      expect(allowedPlacements.has(line.placement)).toBe(true);

      if (line.scene) {
        expect(allowedScenes.has(line.scene)).toBe(true);
      }

      if (line.placement === "raid.prep-hint") {
        expect(line.scene).toBe("barrel");
      }

      if (line.placement === "raid.ranger-action") {
        expect(line.scene).toBe("barrel");
      }

      if (line.placement === "quest.outcome") {
        expect(line.scene).toBeDefined();
      }

      for (const action of line.selector?.actions ?? []) {
        expect(line.scene).toBeDefined();
        expect(allowedActionsByScene[line.scene ?? "barrel"].has(action)).toBe(true);
      }
    }
  });

  it("falls back to general korchma greeting when no specific scene line matches", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        raceId: "race.unknown",
        classId: "class.unknown"
      },
      fixed("korchma.greeting")
    );

    expect(line?.id).toMatch(/^korchma\.greeting\.fallback\./);
  });

  it("prefers exact race and class combo flavor over class or race lines", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        raceId: "race.bisyny",
        raceName: "Бісини",
        classId: "class.bard",
        className: "Бард"
      },
      fixed("korchma.greeting")
    );

    expect(line?.id).toBe("korchma.greeting.combo.bisyny-bard");
    expect(line?.text).toContain("культурний скандал");
  });

  it("keeps scene-specific flavor ahead of generic fallback flavor", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        classId: "class.warrior",
        className: "Воїн"
      },
      fixed("raid.prep-hint", "barrel")
    );

    expect(line?.id).toMatch(/^barrel\.raid-hint\.(?:class\.warrior|combo\.)/);
    expect(line?.id).not.toMatch(/fallback/);
  });

  it("does not let one scene action flavor leak into another scene", () => {
    const rogue = {
      ...baseCharacter,
      classId: "class.rogue",
      className: "Злодій"
    };

    const shawarma = selectCharacterFlavorLine(rogue, fixed("quest.start", "shawarma"));
    const fight = selectCharacterFlavorLine(rogue, fixed("quest.start", "fight"));

    expect(shawarma?.id).toBe("shawarma.start.class.rogue");
    expect(fight?.id).toBe("fight.start.class.rogue");
  });

  it("selects the same line for the same character and seed", () => {
    const query = fixed("raid.prep-hint", "barrel");
    const first = selectCharacterFlavorLine(baseCharacter, query);
    const second = selectCharacterFlavorLine(baseCharacter, query);

    expect(first?.id).toBe(second?.id);
  });

  it("has broad barrel raid advice for classes, races, combos, and universal fallback", () => {
    const lines = characterFlavorLines.filter(
      (line) => line.placement === "raid.prep-hint" && line.scene === "barrel"
    );
    const classIds = [
      "class.warrior",
      "class.mage",
      "class.bard",
      "class.rogue",
      "class.priest",
      "class.varenyk-mancer",
      "class.bureaucramancer",
      "class.ranger",
      "class.kharakternyk"
    ];
    const raceIds = [
      "race.human-ish",
      "race.dwarf",
      "race.elf",
      "race.bisyny",
      "race.drantohor",
      "race.domovyk",
      "race.dryland-rusalka",
      "race.intellectual-orc",
      "race.molfar-soul"
    ];

    for (const classId of classIds) {
      expect(lines.filter((line) => line.selector?.classIds?.includes(classId)).length).toBeGreaterThanOrEqual(5);
    }

    for (const raceId of raceIds) {
      expect(lines.filter((line) => line.selector?.raceIds?.includes(raceId)).length).toBeGreaterThanOrEqual(5);
    }

    expect(lines.filter((line) => !line.selector).length).toBeGreaterThanOrEqual(10);
    expect(lines.filter((line) => line.selector?.combos?.length).length).toBeGreaterThanOrEqual(42);
  });

  it("has varied ranger actions for active raids", () => {
    const lines = characterFlavorLines.filter(
      (line) => line.placement === "raid.ranger-action" && line.scene === "barrel"
    );

    expect(lines.filter((line) => !line.selector).length).toBeGreaterThanOrEqual(10);
    expect(lines.some((line) => line.selector?.classIds?.includes("class.bard"))).toBe(true);
    expect(lines.some((line) => line.selector?.raceIds?.includes("race.domovyk"))).toBe(true);
  });

  it("filters outcome flavor by action", () => {
    const receipt = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        classId: "class.bureaucramancer",
        className: "Бюрокромант"
      },
      fixed("quest.outcome", "shawarma", "receipt")
    );
    const poke = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        classId: "class.bureaucramancer",
        className: "Бюрокромант"
      },
      fixed("quest.outcome", "shawarma", "poke")
    );

    expect(receipt?.id).toBe("shawarma.outcome.bureaucramancer.receipt");
    expect(poke?.id).not.toBe("shawarma.outcome.bureaucramancer.receipt");
  });

  it("does not expose hidden path names in selected player-facing text", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        path: "sun"
      },
      fixed("korchma.greeting")
    );

    expect(line?.text).not.toMatch(/\b(?:sun|moon|boundary)\b/i);
    expect(line?.text).not.toContain("Сонячний шлях");
    expect(line?.text).not.toContain("Місячний шлях");
    expect(line?.text).not.toContain("Межовий шлях");
  });
});

function fixed(
  placement: CharacterFlavorQuery["placement"],
  scene?: CharacterFlavorQuery["scene"],
  action?: string
): CharacterFlavorQuery {
  return {
    placement,
    scene,
    action,
    seed: "12026-06-13"
  };
}
