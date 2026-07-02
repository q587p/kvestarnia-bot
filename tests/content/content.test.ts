import { describe, expect, it } from "vitest";
import {
  makeClassCallbackData,
  makeConfirmCallbackData,
  makeGenderCallbackData,
  makeRaceCallbackData,
  parseOnboardingCallbackData,
  TELEGRAM_CALLBACK_DATA_LIMIT
} from "../../src/bot/callbacks/onboardingCallbackData";
import { activeRaces, classes, items, monsterFlavorLines, monsters, races } from "../../src/content";
import {
  getComboTitle,
  isClassAvailableForChoice,
  pronounOptions
} from "../../src/content/characterOptions";
import { monsterBarks, monsterBarkTextByMonsterId } from "../../src/content/monsterBarks";
import { monsterContextTraits } from "../../src/content/monsterContext";
import { monsterContextProfiles, monsterContextTraits } from "../../src/content/monsterContext";
import { classSchema, itemSchema, monsterSchema, raceSchema } from "../../src/content/schema";

const contentTables = [
  { name: "races", rows: races, schema: raceSchema },
  { name: "classes", rows: classes, schema: classSchema },
  { name: "monsters", rows: monsters, schema: monsterSchema },
  { name: "items", rows: items, schema: itemSchema }
] as const;

const ordinaryMonsterLadderIds = [
  "monster.complaint-lantern",
  "monster.ledger-boar",
  "monster.salted-oath-pretzel",
  "monster.unclosed-closure-act",
  "monster.liar-corridor-map",
  "monster.foam-auditor-boots",
  "monster.three-signature-chimera",
  "monster.cheese-vault-warden",
  "monster.calendar-hydra",
  "monster.inventory-prophet",
  "monster.quiet-catastrophe-clerk"
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

  it("covers the current monster roster with contextual profiles and five authored barks", () => {
    const monsterIds = monsters.map((monster) => monster.id);
    const traitIds = new Set(monsterContextTraits.map((trait) => trait.id));
    const contextProfileIds = monsterContextProfiles.map((profile) => profile.monsterId);
    const barkMonsterIds = Object.keys(monsterBarkTextByMonsterId);

    expect(monsters).toHaveLength(93);
    expect(new Set(contextProfileIds).size).toBe(contextProfileIds.length);
    expect(new Set(barkMonsterIds).size).toBe(barkMonsterIds.length);
    expect(contextProfileIds.sort()).toEqual([...monsterIds].sort());
    expect(barkMonsterIds.sort()).toEqual([...monsterIds].sort());

    for (const profile of monsterContextProfiles) {
      expect(profile.contextTraitIds.length).toBeGreaterThanOrEqual(1);
      expect(profile.contextTraitIds.length).toBeLessThanOrEqual(2);
      for (const traitId of profile.contextTraitIds) {
        expect(traitIds.has(traitId), `${profile.monsterId} references ${traitId}`).toBe(true);
      }
    }

    for (const [monsterId, barks] of Object.entries(monsterBarkTextByMonsterId)) {
      expect(Object.values(barks), monsterId).toHaveLength(5);
      expect(new Set(Object.values(barks)).size, monsterId).toBe(5);
    }

    expect(new Set(monsterBarks.map((bark) => bark.id)).size).toBe(monsterBarks.length);
  });

  it("keeps monster bark copy free of accidental Telegram hashtags", () => {
    for (const [monsterId, barks] of Object.entries(monsterBarkTextByMonsterId)) {
      for (const text of Object.values(barks)) {
        expect(text, `${monsterId}: ${text}`).not.toMatch(/#[^\s.,!?»]+/u);
      }
    }
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
        "item.receipt-of-formal-suspicion",
        "item.badge-of-thirteen-small-problems"
      ])
    );
  });

  it("gives starter equipment small declared effects", () => {
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
    expect(items.find((item) => item.id === "item.pan-of-persuasion")).toMatchObject({
      effect: {
        weaponDamage: 2
      }
    });
    expect(items.find((item) => item.id === "item.stamp-of-minor-authority")).toMatchObject({
      effect: {
        weaponDamage: 1,
        intelligence: 1
      }
    });
    expect(items.find((item) => item.id === "item.apron-of-foam-resistance")).toMatchObject({
      effect: {
        armor: 1,
        hpMax: 2
      }
    });
    expect(items.find((item) => item.id === "item.cork-ring-of-serious-business")).toMatchObject({
      effect: {
        luck: 1
      }
    });
  });

  it("keeps junk, cosmetics, and the thirteen-problems badge free of power effects", () => {
    for (const item of items.filter((candidate) =>
      ["junk", "cosmetic", "consumable"].includes(candidate.slot)
    )) {
      expect(item).not.toHaveProperty("effect");
      expect(item).not.toHaveProperty("stats");
      expect(item).not.toHaveProperty("effects");
      expect(item).not.toHaveProperty("combatBonus");
      expect(item).not.toHaveProperty("rewardBonus");
    }

    expect(items.find((item) => item.id === "item.badge-of-thirteen-small-problems")).toMatchObject({
      slot: "cosmetic"
    });
    expect(items.find((item) => item.id === "item.badge-of-thirteen-small-problems")).not.toHaveProperty(
      "effect"
    );
  });

  it("keeps equippable items from showing up without a declared effect", () => {
    const equippableItems = items.filter((item) =>
      ["weapon", "armor", "accessory"].includes(item.slot)
    );

    expect(equippableItems.length).toBeGreaterThan(0);

    for (const item of equippableItems) {
      expect(item.effect, `missing effect for ${item.id}`).toBeDefined();
    }
  });

  it("rejects accidental power effects on unsupported item slots", () => {
    expect(() =>
      itemSchema.parse({
        id: "item.test-junk-power",
        name: "Сміття з амбіціями",
        description: "Дуже хоче бути мечем.",
        rarity: "common",
        slot: "junk",
        goldValue: 1,
        effect: {
          weaponDamage: 1
        }
      })
    ).toThrow();
  });

  it("validates the narrow item tag and use-effect contract", () => {
    const bandage = items.find((item) => item.id === "item.responsible-panic-bandage");
    const denseBandage = items.find((item) => item.id === "item.dense-bandage");
    const fieldKit = items.find((item) => item.id === "item.field-kit");

    expect(bandage).toMatchObject({
      slot: "consumable",
      tags: ["consumable", "one-use", "trade-blocked", "duel-blocked"],
      useEffect: {
        kind: "heal-hp",
        amount: 7
      }
    });
    expect(denseBandage).toMatchObject({
      slot: "consumable",
      tags: ["consumable", "one-use", "trade-blocked", "duel-blocked", "raid-blocked"],
      useEffect: {
        kind: "heal-hp",
        amount: 42
      }
    });
    expect(fieldKit).toMatchObject({
      slot: "consumable",
      tags: ["consumable", "one-use", "trade-blocked", "duel-blocked", "raid-blocked"],
      useEffect: {
        kind: "heal-hp-to-min-percent",
        percent: 93
      }
    });
    expect(() => itemSchema.parse({
      id: "item.test-unknown-tag",
      name: "Тест",
      description: "Тест.",
      rarity: "common",
      slot: "junk",
      goldValue: 1,
      tags: ["mystery"]
    })).toThrow();
    expect(() => itemSchema.parse({
      id: "item.test-duplicate-tag",
      name: "Тест",
      description: "Тест.",
      rarity: "common",
      slot: "junk",
      goldValue: 1,
      tags: ["tradeable", "tradeable"]
    })).toThrow();
    expect(() => itemSchema.parse({
      id: "item.test-trade-contradiction",
      name: "Тест",
      description: "Тест.",
      rarity: "common",
      slot: "junk",
      goldValue: 1,
      tags: ["tradeable", "trade-blocked"]
    })).toThrow();
    expect(() => itemSchema.parse({
      id: "item.test-soulbound-tradeable",
      name: "Тест",
      description: "Тест.",
      rarity: "common",
      slot: "junk",
      goldValue: 1,
      tags: ["soulbound", "tradeable"]
    })).toThrow();
    expect(() => itemSchema.parse({
      id: "item.test-one-use-without-consumable",
      name: "Тест",
      description: "Тест.",
      rarity: "common",
      slot: "consumable",
      goldValue: 1,
      tags: ["one-use"]
    })).toThrow();
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

  it("keeps Human-ish flavor mysterious without promising an exact stat preview", () => {
    expect(races.find((race) => race.id === "race.human-ish")).toMatchObject({
      name: "Людисько",
      description: "Практичне в усьому, що вдалося вписати в корчмарську анкету.",
      statBonus: {
        strength: 1,
        dexterity: 1,
        charisma: 1
      }
    });
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

  it("keeps every active race and class pair on authored titles", () => {
    const fallbackTitles = [
      "Пригодник місцевого значення",
      "Пригодниця місцевого значення",
      "Пригодники місцевого значення"
    ];
    const validPairs = activeRaces.flatMap((race) =>
      classes.flatMap((characterClass) => {
        const allowedPronouns = pronounOptions
          .map((pronoun) => pronoun.id)
          .filter((pronoun) => isClassAvailableForChoice(pronoun, race.id, characterClass.id));

        return allowedPronouns.length > 0
          ? [{ raceId: race.id, classId: characterClass.id, allowedPronouns }]
          : [];
      })
    );

    expect(validPairs).toHaveLength(54);
    expect(validPairs.every((pair) => pair.allowedPronouns.length > 0)).toBe(true);

    for (const { raceId, classId, allowedPronouns } of validPairs) {
      for (const pronoun of allowedPronouns) {
        expect(fallbackTitles).not.toContain(getComboTitle(raceId, classId, pronoun));
      }
    }

    for (const pronoun of pronounOptions.map((option) => option.id)) {
      const titles = validPairs
        .filter((pair) => pair.allowedPronouns.includes(pronoun))
        .map((pair) => getComboTitle(pair.raceId, pair.classId, pronoun));

      expect(new Set(titles).size).toBe(titles.length);
    }

    expect(getComboTitle("race.unknown", "class.mage", "he")).toBe(
      "Пригодник місцевого значення"
    );
    expect(getComboTitle("race.human-ish", "class.unknown", "she")).toBe(
      "Пригодниця місцевого значення"
    );
    expect(getComboTitle("race.unknown", "class.unknown", "they")).toBe(
      "Пригодники місцевого значення"
    );
  });

  it("does not ship mojibake placeholder question marks in monster context cues", () => {
    const cues = monsterContextTraits.flatMap((trait) =>
      trait.branches.flatMap((branch) => branch.cue ? [branch.cue] : [])
    );

    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) {
      expect(cue).not.toMatch(/\?{4,}/);
    }
  });

  it("covers the ordinary solo-fight ladder from level 4 through 13", () => {
    expect(monsters.map((monster) => monster.id)).toEqual(
      expect.arrayContaining(ordinaryMonsterLadderIds)
    );

    for (const level of Array.from({ length: 10 }, (_, index) => index + 4)) {
      const ordinaryMonstersAtLevel = monsters.filter(
        (monster) =>
          monster.level === level &&
          !monster.tags.includes("starter") &&
          !monster.tags.includes("boss") &&
          !monster.tags.includes("mini-boss") &&
          !monster.tags.includes("tiny-boss")
      );

      expect(ordinaryMonstersAtLevel).not.toHaveLength(0);
    }

    for (const monsterId of ordinaryMonsterLadderIds) {
      const monster = monsters.find((candidate) => candidate.id === monsterId);

      expect(monster, `missing monster ${monsterId}`).toBeDefined();
      expect(monster?.tags).not.toEqual(
        expect.arrayContaining(["starter", "boss", "mini-boss", "tiny-boss"])
      );
    }
  });

  it("gives every new ladder monster fallback start and loot-note flavor lines", () => {
    for (const monsterId of ordinaryMonsterLadderIds) {
      expect(
        monsterFlavorLines.some(
          (line) =>
            line.monsterId === monsterId &&
            line.placement === "monster.start" &&
            line.id.endsWith(".fallback.start")
        ),
        `missing fallback start line for ${monsterId}`
      ).toBe(true);

      expect(
        monsterFlavorLines.some(
          (line) => line.monsterId === monsterId && line.placement === "monster.loot-note"
        ),
        `missing loot-note line for ${monsterId}`
      ).toBe(true);
    }
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
