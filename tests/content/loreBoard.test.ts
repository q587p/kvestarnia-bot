import { describe, expect, it } from "vitest";
import {
  activeRaces,
  classes,
  items,
  loreCategories,
  monsters,
  selectRandomLoreEntry,
  selectRandomLoreEntryForCategory,
  validateLoreBoardContent
} from "../../src/content";
import { loreEntries, type LoreCanonicalRef } from "../../src/content/loreBoard";
import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  PRESENCE_LOCATION_KORCHMA_YARD
} from "../../src/services/presenceService";

describe("lore board content", () => {
  it("validates ids, category links, body/source text and canonical refs", () => {
    expect(validateLoreBoardContent({
      knownRefs: {
        race: new Set(activeRaces.map((race) => race.id)),
        class: new Set(classes.map((characterClass) => characterClass.id)),
        monster: new Set(monsters.map((monster) => monster.id)),
        item: new Set(items.map((item) => item.id)),
        location: new Set([
          PRESENCE_LOCATION_KORCHMA_FRONT,
          PRESENCE_LOCATION_KORCHMA_YARD,
          PRESENCE_LOCATION_KORCHMA_HALL,
          PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
          PRESENCE_LOCATION_KORCHMA_BAR,
          PRESENCE_LOCATION_KORCHMA_CELLAR,
          PRESENCE_LOCATION_KORCHMA_BARREL,
          PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
          PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
          PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
          PRESENCE_LOCATION_KORCHMA_DEEP,
          PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
          PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
          PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
          PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT
        ])
      }
    })).toEqual([]);
  });

  it("ships all MVP lore categories, with external categories marked explicitly", () => {
    expect(loreCategories.map((category) => category.title)).toEqual([
      "🏚 Про Квестарню",
      "🪧 Місцини корчми",
      "🧝 Раси пригодників",
      "⚔️ Класи пригодників",
      "🧌 Бестіарій",
      "🎒 Манатки",
      "📜 Звичаї й чутки"
    ]);

    for (const category of loreCategories) {
      if (category.entryMode === "external") {
        expect(loreEntries.some((entry) => entry.categoryId === category.id), category.id).toBe(false);
        continue;
      }

      expect(loreEntries.some((entry) => entry.categoryId === category.id), category.id).toBe(true);
    }

    expect(loreCategories.find((category) => category.id === "bestiary")?.entryMode).toBe("external");
  });

  it("covers every active race and class in current lore refs", () => {
    const raceRefs = canonicalRefIds("races", "race");
    const classRefs = canonicalRefIds("classes", "class");

    expect(raceRefs).toEqual(new Set(activeRaces.map((race) => race.id)));
    expect(classRefs).toEqual(new Set(classes.map((characterClass) => characterClass.id)));
  });

  it("covers every current Korchma presence location in place lore refs", () => {
    expect(canonicalRefIds("places", "location")).toEqual(new Set([
      PRESENCE_LOCATION_KORCHMA_FRONT,
      PRESENCE_LOCATION_KORCHMA_YARD,
      PRESENCE_LOCATION_KORCHMA_HALL,
      PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      PRESENCE_LOCATION_KORCHMA_BAR,
      PRESENCE_LOCATION_KORCHMA_CELLAR,
      PRESENCE_LOCATION_KORCHMA_BARREL,
      PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
      PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
      PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
      PRESENCE_LOCATION_KORCHMA_DEEP,
      PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
      PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
      PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT
    ]));
  });

  it("detects broken lore records", () => {
    expect(validateLoreBoardContent({
      categories: loreCategories,
      entries: [
        ...loreEntries,
        {
          id: loreEntries[0]?.id ?? "duplicate",
          categoryId: "missing",
          title: "",
          source: "",
          body: "",
          canonicalRefs: [{ type: "monster", id: "monster.missing" }]
        }
      ],
      knownRefs: {
        monster: new Set(monsters.map((monster) => monster.id))
      }
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("Duplicate lore entry id"),
      expect.stringContaining("unknown category"),
      expect.stringContaining("empty title"),
      expect.stringContaining("empty source"),
      expect.stringContaining("empty body"),
      expect.stringContaining("unknown monster id")
    ]));
  });

  it("returns safe random selections and empty-category fallbacks", () => {
    expect(selectRandomLoreEntry(loreEntries, () => 0)).toBe(loreEntries[0]);
    expect(selectRandomLoreEntry(loreEntries, () => 0.999)?.id).toBe(loreEntries.at(-1)?.id);
    expect(selectRandomLoreEntry([], () => 0.5)).toBeUndefined();
    expect(selectRandomLoreEntryForCategory("missing", () => 0.5)).toBeUndefined();
  });
});

function canonicalRefIds(categoryId: string, type: "race" | "class" | "location"): Set<string> {
  const ids: string[] = [];

  for (const entry of loreEntries) {
    if (entry.categoryId !== categoryId) {
      continue;
    }

    const refs: readonly LoreCanonicalRef[] = entry.canonicalRefs ?? [];

    for (const ref of refs) {
      if (ref.type === type) {
        ids.push(ref.id);
      }
    }
  }

  return new Set(ids);
}
