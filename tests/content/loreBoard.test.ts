import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeRaces,
  classes,
  items,
  loreCategories,
  loreEntryGroups,
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
import { raceAbilities } from "../../src/content/playerAbilities";

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

  it("keeps machine-readable class seed ids aligned with runtime lore ids and canonical refs", () => {
    const seed = JSON.parse(readFileSync(
      join(process.cwd(), "docs", "content", "kvestarnia-lore-seed.json"),
      "utf8"
    )) as {
      entries: Array<{
        id: string;
        categoryId: string;
        canonicalRefs?: string[];
      }>;
    };
    const seedClasses = seed.entries.filter((entry) => entry.categoryId === "classes");
    const runtimeClasses = loreEntries.filter((entry) => entry.categoryId === "classes");

    expect(new Set(seedClasses.map((entry) => entry.id)))
      .toEqual(new Set(runtimeClasses.map((entry) => entry.id)));
    for (const entry of seedClasses) {
      const runtime = runtimeClasses.find((candidate) => candidate.id === entry.id);
      expect(new Set(entry.canonicalRefs ?? []), entry.id).toEqual(new Set(
        runtime?.canonicalRefs
          ?.filter((ref) => ref.type === "class")
          .map((ref) => ref.id) ?? []
      ));
    }
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

  it("keeps place lore grouped without losing current place entries", () => {
    const groupedEntryIds = new Set(loreEntryGroups
      .filter((group) => group.categoryId === "places")
      .flatMap((group) => group.entryIds));
    const placeEntryIds = loreEntries
      .filter((entry) => entry.categoryId === "places")
      .map((entry) => entry.id);

    expect(loreEntryGroups.map((group) => group.title)).toEqual([
      "🏚 Надвірʼя",
      "🍺 Зала й шинок",
      "🛢 Бочка й льох",
      "🎯 Кутки",
      "⬇️ Низ"
    ]);
    expect(groupedEntryIds).toEqual(new Set(placeEntryIds));
  });

  it("keeps Shynok lore aligned with current social game surfaces", () => {
    const shynok = loreEntries.find((entry) => entry.id === "place-bar");

    expect(shynok?.body).toContain("Бард може виступити");
    expect(shynok?.body).toContain("пригостити всіх пивом");
    expect(shynok?.body).toContain("тавлеї чи кості");
  });

  it("keeps class lore aligned with combat and side class surfaces", () => {
    expect(classLoreBody("class-warrior")).toContain("🪓 Силовий замах");
    expect(classLoreBody("class-mage")).toContain("🔥 Гаряче закляття");
    expect(classLoreBody("class-bard")).toContain("🎶 Небезпечний куплет");
    expect(classLoreBody("class-rogue")).toContain("🌘 Тіньовий розтин");
    expect(classLoreBody("class-priest")).toContain("✨ Суворе благословення");
    expect(classLoreBody("class-varenyk-mancer")).toContain("🥟 Кипляча начинка");
    expect(classLoreBody("class-bureaucramancer")).toContain("📄 Форма 13-А");
    expect(classLoreBody("class-ranger")).toContain("🏹 Рикошетний постріл");
    expect(classLoreBody("class-kharakternyk")).toContain("👁 Степовий косий погляд");

    for (const entryId of ["class-warrior", "class-mage", "class-bard", "class-rogue", "class-priest", "class-ranger"]) {
      expect(classLoreBody(entryId), entryId).toContain("\n\n");
    }

    expect(classLoreBody("class-warrior")).toContain("по зброї в кожній руці");
    expect(classLoreBody("class-warrior")).toContain("🛡️ На мене!");
    expect(classLoreBody("class-mage")).toContain("Чароковальнею");
    expect(classLoreBody("class-bard")).toContain("У шинку бард може виступити");
    expect(classLoreBody("class-bard")).toContain("добровільно лишити чайові");
    expect(classLoreBody("class-bard")).toContain("«✨ Натхнення» від виступу не залежить від оплати");
    expect(classLoreBody("class-bard")).toContain("«🎻 Журлива балада»");
    expect(classLoreBody("class-rogue")).toContain("Тихою кишенею");
    expect(classLoreBody("class-priest")).toContain("полікувати маною без бинтів");
    expect(classLoreBody("class-varenyk-mancer")).toContain("«🍽️ Нагодувати»");
    expect(classLoreBody("class-varenyk-mancer")).toContain("«😋 Ситий»");
    expect(classLoreBody("class-bureaucramancer")).toContain("Протокол 13-З");
    expect(classLoreBody("class-ranger")).toContain("єгерський куток");
    expect(classLoreBody("class-kharakternyk")).toContain("поставити знак");
    expect(loreEntries.filter((entry) => entry.categoryId === "classes").map((entry) => entry.body).join("\n"))
      .not.toContain("З 3 рівня");
  });

  it("keeps race lore aligned with race combat abilities", () => {
    for (const ability of raceAbilities) {
      const entry = loreEntries.find((candidate) =>
        candidate.categoryId === "races" &&
        candidate.canonicalRefs?.some((ref) => ref.type === "race" && ref.id === ability.raceId)
      );

      expect(entry?.body, ability.raceId).toContain("\n\n");
      expect(entry?.body, ability.raceId).toContain(ability.label);
    }
  });

  it("keeps manatky lore aligned with one-use and crafting surfaces", () => {
    const lootTitles = loreEntries
      .filter((entry) => entry.categoryId === "loot")
      .map((entry) => entry.title);
    const oneUse = loreEntries.find((entry) => entry.id === "loot-one-use-mantok");
    const crafting = loreEntries.find((entry) => entry.id === "loot-mantok-crafting");

    expect(lootTitles).toEqual(expect.arrayContaining([
      "Разові манатки",
      "Крафт манаток"
    ]));
    expect(oneUse?.body).toContain("Поза боєм");
    expect(oneUse?.body).toContain("у бою");
    expect(oneUse?.canonicalRefs?.map((ref) => ref.id)).toEqual(expect.arrayContaining([
      "item.responsible-panic-bandage",
      "item.dense-bandage",
      "item.field-kit"
    ]));
    expect(crafting?.body).toContain("Щільний бинт");
    expect(crafting?.body).toContain("Польову аптечку");
    expect(crafting?.body).toContain("ремортного досвіду");
  });

  it("keeps manatky lore aligned with visible gear-action grants", () => {
    const general = loreEntries.find((entry) => entry.id === "loot-mantok-definition");

    expect(general?.body).toContain("Дія спорядження");
    expect(general?.body).toContain("бойового трюку");
    expect(general?.body).toContain("магічне покращення");
    expect(general?.body).not.toContain("таємний");
  });

  it("keeps yard lore aligned with the elf-mage and Charkokovalnia", () => {
    const yard = loreEntries.find((entry) => entry.id === "place-yard");

    expect(yard?.body).toContain("Чароковальня");
    expect(yard?.body).toContain("ельф-маг");
    expect(yard?.body).toContain("Іскрокаменем");
  });

  it("explains the shipped guild shell without promising shared party or economy ownership", () => {
    const guild = loreEntries.find((entry) => entry.id === "custom-guild-charter");
    const nest = loreEntries.find((entry) => entry.id === "place-guild-nest");

    expect(guild).toMatchObject({ categoryId: "customs", title: "Ґільдійний статут" });
    expect(nest).toMatchObject({
      categoryId: "places",
      title: "Гніздо ґільдій",
      canonicalRefs: [{ type: "location", id: "location.korchma.deep" }]
    });
    expect(guild?.body).toContain("587 золота");
    expect(guild?.body).toContain("🪺 Гнізді ґільдій");
    expect(guild?.body).toContain("картки персонажа");
    expect(guild?.body).not.toContain("🏰 Ґільдії");
    expect(guild?.body).toContain("приватним посиланням");
    expect(guild?.body).toContain("прийняття запрошення");
    expect(guild?.body).toContain("між ремортами");
    expect(guild?.body).toContain("не спільний гаманець чи власна ватага");

    const seed = JSON.parse(readFileSync(
      join(process.cwd(), "docs", "content", "kvestarnia-lore-seed.json"),
      "utf8"
    )) as { entries: Array<{ id: string; canonicalRefs?: string[] }> };
    expect(seed.entries.find((entry) => entry.id === "place-guild-nest"))
      .toMatchObject({ canonicalRefs: ["location.korchma.deep"] });
    const snapshot = JSON.parse(readFileSync(
      join(process.cwd(), "docs", "content", "kvestarnia-lore-canon-snapshot.json"),
      "utf8"
    )) as { places: Array<{ id: string; sublocations?: string[] }> };
    expect(snapshot.places.find((location) => location.id === "location.korchma.deep")?.sublocations)
      .toContain("Гніздо ґільдій");
    expect(readFileSync(
      join(process.cwd(), "docs", "content", "kvestarnia-lore-current-canon.md"),
      "utf8"
    )).toContain("Гніздо ґільдій");
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

  it("detects broken lore entry groups", () => {
    expect(validateLoreBoardContent({
      categories: loreCategories,
      entries: loreEntries,
      groups: [
        ...loreEntryGroups,
        {
          id: "broken",
          categoryId: "places",
          title: "",
          description: "",
          sortOrder: 999,
          entryIds: ["missing-entry", "race-human-ish"]
        }
      ]
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("empty title"),
      expect.stringContaining("empty description"),
      expect.stringContaining("unknown entry"),
      expect.stringContaining("from races")
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

function classLoreBody(entryId: string): string {
  const entry = loreEntries.find((candidate) => candidate.id === entryId);
  expect(entry, entryId).toBeDefined();
  return entry?.body ?? "";
}
