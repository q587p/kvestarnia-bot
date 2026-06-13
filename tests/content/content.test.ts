import { describe, expect, it } from "vitest";
import {
  makeClassCallbackData,
  makeConfirmCallbackData,
  makeGenderCallbackData,
  makeRaceCallbackData,
  parseOnboardingCallbackData,
  TELEGRAM_CALLBACK_DATA_LIMIT
} from "../../src/bot/callbacks/onboardingCallbackData";
import { activeRaces, classes, items, monsters, races } from "../../src/content";
import { getComboTitle, pronounOptions } from "../../src/content/characterOptions";
import { classSchema, itemSchema, monsterSchema, raceSchema } from "../../src/content/schema";

const contentTables = [
  { name: "races", rows: races, schema: raceSchema },
  { name: "classes", rows: classes, schema: classSchema },
  { name: "monsters", rows: monsters, schema: monsterSchema },
  { name: "items", rows: items, schema: itemSchema }
] as const;

describe("content tables", () => {
  it.each(contentTables)("validates $name with Zod schemas", ({ rows, schema }) => {
    for (const row of rows) {
      expect(() => schema.parse(row)).not.toThrow();
    }
  });

  it.each(contentTables)("keeps ids unique in $name", ({ rows }) => {
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes first persistent loot item ids", () => {
    expect(items.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "item.pan-of-persuasion",
        "item.pot-helmet-of-early-access",
        "item.stamp-of-minor-authority",
        "item.apron-of-foam-resistance",
        "item.cork-ring-of-serious-business",
        "item.wet-hero-ticket",
        "item.cheese-of-procedural-doubt",
        "item.bristle-of-basement-order",
        "item.napkin-of-mouse-diplomacy",
        "item.suspicious-shawarma-wrapper",
        "item.receipt-of-formal-suspicion"
      ])
    );
  });

  it("keeps equipment preview content free of stat effects", () => {
    const equippablePreviewItems = items.filter((item) =>
      ["weapon", "armor", "accessory"].includes(item.slot)
    );

    expect(equippablePreviewItems.map((item) => item.id)).toContain("item.pan-of-persuasion");
    expect(equippablePreviewItems.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "item.stamp-of-minor-authority",
        "item.apron-of-foam-resistance",
        "item.cork-ring-of-serious-business"
      ])
    );
    for (const item of items) {
      expect(item).not.toHaveProperty("stats");
      expect(item).not.toHaveProperty("effects");
      expect(item).not.toHaveProperty("combatBonus");
      expect(item).not.toHaveProperty("rewardBonus");
    }
  });

  it("gives every item either a gold value or a priceless marker", () => {
    for (const item of items) {
      expect(item.goldValue !== undefined || item.priceless === true).toBe(true);
      expect(item.goldValue !== undefined && item.priceless === true).toBe(false);
    }
  });

  it("keeps legacy kharakternyk race out of active onboarding races", () => {
    expect(activeRaces.map((race) => race.id)).toEqual(
      expect.arrayContaining(["race.bisyny", "race.drantohor"])
    );
    expect(activeRaces.some((race) => race.id === "race.kharakternyk")).toBe(false);
    expect(classes.some((characterClass) => characterClass.id === "class.kharakternyk")).toBe(
      true
    );
  });

  it("keeps a broad set of authored race and class combo titles", () => {
    const expectedTitles = [
      ["race.human-ish", "class.bard", "Самозваний Куплетоносець"],
      ["race.human-ish", "class.varenyk-mancer", "Начинковий Оптиміст"],
      ["race.dwarf", "class.warrior", "Молотковий Аргумент"],
      ["race.dwarf", "class.ranger", "Гірський Слідознавець"],
      ["race.elf", "class.mage", "Довговухий Теоретик Вогню"],
      ["race.elf", "class.rogue", "Естетичний Зникальник"],
      ["race.elf", "class.priest", "Жрець Довгих Пояснень"],
      ["race.bisyny", "class.bard", "Редакторський Жах Куплетів"],
      ["race.bisyny", "class.rogue", "Коментатор Тіньового Проходу"],
      ["race.bisyny", "class.varenyk-mancer", "Начинковий Дискутант"],
      ["race.bisyny", "class.bureaucramancer", "Бісова Правка Форми"],
      ["race.drantohor", "class.warrior", "Остромазький Аргумент"],
      ["race.drantohor", "class.mage", "Заблукалий Теоретик Іскор"],
      ["race.drantohor", "class.rogue", "Межовий Обхідник"],
      ["race.drantohor", "class.bureaucramancer", "Гість Без Печатки"],
      ["race.drantohor", "class.ranger", "Слідознавець Чужої Карти"]
    ] as const;

    expect(expectedTitles).toHaveLength(16);

    for (const [raceId, classId, title] of expectedTitles) {
      expect(getComboTitle(raceId, classId)).toBe(title);
    }

    expect(getComboTitle("race.intellectual-orc", "class.priest", "she")).toBe(
      "Етична Зцілювачка Кулаком"
    );
    expect(getComboTitle("race.molfar-soul", "class.bureaucramancer", "they")).toBe(
      "Писарі Оберегових Справ"
    );
  });

  it("keeps onboarding gender callbacks valid and within Telegram limits", () => {
    for (const pronoun of pronounOptions) {
      const callbackData = makeGenderCallbackData(pronoun.id);

      expect(Buffer.byteLength(callbackData, "utf8")).toBeLessThanOrEqual(
        TELEGRAM_CALLBACK_DATA_LIMIT
      );
      expect(parseOnboardingCallbackData(callbackData).ok).toBe(true);
    }
  });

  it("keeps onboarding race callbacks valid and within Telegram limits", () => {
    for (const race of activeRaces) {
      const callbackData = makeRaceCallbackData("they", race.id);

      expect(Buffer.byteLength(callbackData, "utf8")).toBeLessThanOrEqual(
        TELEGRAM_CALLBACK_DATA_LIMIT
      );
      expect(parseOnboardingCallbackData(callbackData).ok).toBe(true);
    }
  });

  it("keeps onboarding class callbacks valid and within Telegram limits", () => {
    for (const race of activeRaces) {
      for (const characterClass of classes) {
        const callbackData = makeClassCallbackData("they", race.id, characterClass.id);

        expect(Buffer.byteLength(callbackData, "utf8")).toBeLessThanOrEqual(
          TELEGRAM_CALLBACK_DATA_LIMIT
        );
        expect(parseOnboardingCallbackData(callbackData).ok).toBe(true);
      }
    }
  });

  it("keeps onboarding confirmation callbacks valid and within Telegram limits", () => {
    for (const race of activeRaces) {
      for (const characterClass of classes) {
        const callbackData = makeConfirmCallbackData("they", race.id, characterClass.id);

        expect(Buffer.byteLength(callbackData, "utf8")).toBeLessThanOrEqual(
          TELEGRAM_CALLBACK_DATA_LIMIT
        );
        expect(parseOnboardingCallbackData(callbackData).ok).toBe(true);
      }
    }
  });
});
