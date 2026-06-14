import { describe, expect, it } from "vitest";
import {
  characterFlavorLines,
  selectCharacterFlavorLine,
  type CharacterFlavorQuery
} from "../../src/content/characterFlavor";
import { getComboTitle } from "../../src/content/characterOptions";
import { classes } from "../../src/content/classes";
import { activeRaces } from "../../src/content/races";
import type { Pronoun } from "../../src/content/schema";
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

  it("renders combo flavor with the authored title instead of long race-class labels", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        raceId: "race.intellectual-orc",
        raceName: "Орк-інтелігент",
        classId: "class.mage",
        className: "Маг",
        title: "Кандидат Бойових Наук"
      },
      fixed("quest.start", "shawarma")
    );

    expect(line?.text).toContain("Кандидат Бойових Наук");
    expect(line?.text).not.toContain("Орк-інтелігент-Маг");
    expect(line?.text).not.toContain("{title}");
  });

  it("renders combo raid tips with the authored title instead of long race-class labels", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        raceId: "race.molfar-soul",
        raceName: "Мольфарська душа",
        classId: "class.rogue",
        className: "Злодій",
        title: "Обереговий Зникальник"
      },
      fixed("raid.prep-hint", "barrel")
    );

    expect(line?.text).toContain("Обереговий Зникальник");
    expect(line?.text).not.toContain("Мольфарська душа-злодій");
    expect(line?.text).not.toContain("{title}");
  });

  it("renders selected combo scene flavor with titles instead of visible race-class labels", () => {
    const comboQueries: CharacterFlavorQuery[] = [
      fixed("quest.start", "shawarma"),
      fixed("quest.start", "fight"),
      fixed("quest.start", "cellar"),
      fixed("quest.outcome", "cellar", "negotiate"),
      fixed("quest.outcome", "cellar", "cheese-trap"),
      fixed("quest.outcome", "cellar", "sweep-bravely"),
      fixed("raid.prep-hint", "barrel")
    ];

    for (const combo of availableRaceClassCombos()) {
      const race = activeRaces.find((candidate) => candidate.id === combo.raceId);
      const heroClass = classes.find((candidate) => candidate.id === combo.classId);

      if (!race || !heroClass) {
        throw new Error(`Missing combo content for ${combo.raceId}:${combo.classId}`);
      }

      const character = {
        ...baseCharacter,
        raceId: race.id,
        raceName: race.name,
        classId: heroClass.id,
        className: heroClass.name,
        title: `Тестовий титул ${race.id} ${heroClass.id}`
      };
      const visibleComboLabels = comboLabelVariants(
        race.name,
        heroClass.name,
        combo.raceId,
        combo.classId
      );

      for (const query of comboQueries) {
        const line = selectCharacterFlavorLine(character, query);
        const isSelectedComboLine = line?.selector?.combos?.some(
          (candidate) => candidate.raceId === combo.raceId && candidate.classId === combo.classId
        );

        if (query.placement !== "raid.prep-hint" || isSelectedComboLine) {
          expect(line?.text).toContain(character.title);
        }
        expect(line?.text).not.toContain("{title}");

        for (const label of visibleComboLabels) {
          expect(line?.text).not.toContain(label);
        }
      }
    }
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
      raceId: "race.unknown",
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

  it("has first quest start flavor for every active race and class", () => {
    for (const race of activeRaces) {
      expect(hasLine("quest.start", "shawarma", "raceIds", race.id)).toBe(true);
      expect(hasLine("quest.start", "fight", "raceIds", race.id)).toBe(true);
      expect(hasLine("quest.start", "cellar", "raceIds", race.id)).toBe(true);
    }

    for (const heroClass of classes) {
      expect(hasLine("quest.start", "shawarma", "classIds", heroClass.id)).toBe(true);
      expect(hasLine("quest.start", "fight", "classIds", heroClass.id)).toBe(true);
      expect(hasLine("quest.start", "cellar", "classIds", heroClass.id)).toBe(true);
    }
  });

  it("has first quest combo flavor for every available active race and class combination", () => {
    const combos = availableRaceClassCombos();

    for (const combo of combos) {
      expect(hasComboLine("quest.start", "shawarma", combo)).toBe(true);
      expect(hasComboLine("quest.start", "fight", combo)).toBe(true);
      expect(hasComboLine("quest.start", "cellar", combo)).toBe(true);
    }

    expect(combos.length).toBeGreaterThanOrEqual(40);
  });

  it("has cellar outcome flavor for every active race, class, combo, and cellar action", () => {
    const combos = availableRaceClassCombos();
    const actions = ["cheese-trap", "sweep-bravely", "negotiate"];

    for (const action of actions) {
      for (const race of activeRaces) {
        expect(hasActionLine("quest.outcome", "cellar", "raceIds", race.id, action)).toBe(true);
      }

      for (const heroClass of classes) {
        expect(hasActionLine("quest.outcome", "cellar", "classIds", heroClass.id, action)).toBe(true);
      }

      for (const combo of combos) {
        expect(hasComboActionLine("quest.outcome", "cellar", combo, action)).toBe(true);
      }
    }
  });

  it("keeps the first fight start unrevealed until an action resolves", () => {
    const line = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        raceId: "race.domovyk",
        raceName: "Домовик",
        classId: "class.rogue",
        className: "Злодій"
      },
      fixed("quest.start", "fight")
    );

    expect(line?.text).toContain("підозрілого монстра");
    expect(line?.text).not.toContain("Мімік-шаурма");
  });

  it("has varied ranger actions for active raids", () => {
    const lines = characterFlavorLines.filter(
      (line) => line.placement === "raid.ranger-action" && line.scene === "barrel"
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

    expect(lines.filter((line) => !line.selector).length).toBeGreaterThanOrEqual(10);

    for (const classId of classIds) {
      expect(lines.filter((line) => line.selector?.classIds?.includes(classId)).length).toBeGreaterThanOrEqual(3);
    }

    for (const raceId of raceIds) {
      expect(lines.filter((line) => line.selector?.raceIds?.includes(raceId)).length).toBeGreaterThanOrEqual(2);
    }
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

  it("keeps class outcome flavor distinct instead of swapping only the class name", () => {
    const mage = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        raceId: "race.unknown",
        classId: "class.mage",
        className: "Маг"
      },
      fixed("quest.outcome", "fight", "attack")
    );
    const bureaucramancer = selectCharacterFlavorLine(
      {
        ...baseCharacter,
        raceId: "race.unknown",
        classId: "class.bureaucramancer",
        className: "Бюрокромант"
      },
      fixed("quest.outcome", "fight", "attack")
    );

    expect(mage?.text).toContain("Маг");
    expect(mage?.text).toContain("іскри");
    expect(bureaucramancer?.text).toContain("Бюрокромант");
    expect(bureaucramancer?.text).toContain("формою");
    expect(mage?.text).not.toBe(bureaucramancer?.text);
    expect(mage?.text).not.toContain("перетворює проблему на досвід");
    expect(bureaucramancer?.text).not.toContain("перетворює проблему на досвід");
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

function hasLine(
  placement: CharacterFlavorQuery["placement"],
  scene: CharacterFlavorQuery["scene"],
  selectorKey: "raceIds" | "classIds",
  id: string
): boolean {
  return characterFlavorLines.some(
    (line) =>
      line.placement === placement &&
      line.scene === scene &&
      line.selector?.[selectorKey]?.includes(id)
  );
}

function hasComboLine(
  placement: CharacterFlavorQuery["placement"],
  scene: CharacterFlavorQuery["scene"],
  combo: { raceId: string; classId: string }
): boolean {
  return characterFlavorLines.some(
    (line) =>
      line.placement === placement &&
      line.scene === scene &&
      line.selector?.combos?.some(
        (candidate) => candidate.raceId === combo.raceId && candidate.classId === combo.classId
      )
  );
}

function hasActionLine(
  placement: CharacterFlavorQuery["placement"],
  scene: CharacterFlavorQuery["scene"],
  selectorKey: "raceIds" | "classIds",
  id: string,
  action: string
): boolean {
  return characterFlavorLines.some(
    (line) =>
      line.placement === placement &&
      line.scene === scene &&
      line.selector?.[selectorKey]?.includes(id) &&
      line.selector.actions?.includes(action)
  );
}

function hasComboActionLine(
  placement: CharacterFlavorQuery["placement"],
  scene: CharacterFlavorQuery["scene"],
  combo: { raceId: string; classId: string },
  action: string
): boolean {
  return characterFlavorLines.some(
    (line) =>
      line.placement === placement &&
      line.scene === scene &&
      line.selector?.combos?.some(
        (candidate) => candidate.raceId === combo.raceId && candidate.classId === combo.classId
      ) &&
      line.selector.actions?.includes(action)
  );
}

function availableRaceClassCombos(): Array<{ raceId: string; classId: string }> {
  return activeRaces.flatMap((race) =>
    classes
      .filter((heroClass) => !heroClass.allowedRaces || heroClass.allowedRaces.includes(race.id))
      .map((heroClass) => ({
        raceId: race.id,
        classId: heroClass.id
      }))
  );
}

function comboLabelVariants(
  raceName: string,
  className: string,
  raceId: string,
  classId: string
): string[] {
  const classLabels = classLabelVariants(className);
  const raceLabels =
    raceName === "Русалка сухопутна" ? [raceName, "Сухопутна русалка"] : [raceName];
  const pronouns: Pronoun[] = ["he", "she", "they"];
  const titleLabels = pronouns.flatMap((pronoun) => {
    const title = getComboTitle(raceId, classId, pronoun);

    return [title, lowerFirst(title), upperFirst(title.toLocaleLowerCase("uk-UA"))];
  });

  return [
    ...raceLabels.flatMap((raceLabel) =>
      classLabels.map((classLabel) => `${raceLabel}-${classLabel}`)
    ),
    ...titleLabels
  ];
}

function classLabelVariants(className: string): string[] {
  const classLabel = lowerFirst(className);
  const [, ...tailParts] = classLabel.split("-");
  const labels = [classLabel, ...classAlternativeLabels(classLabel)];

  if (tailParts.length === 0) {
    return labels;
  }

  return [...labels, tailParts.join("-")];
}

function classAlternativeLabels(classLabel: string): string[] {
  if (classLabel === "жрець") {
    return ["жриця"];
  }

  return [];
}

function lowerFirst(value: string): string {
  const [first = "", ...rest] = [...value];

  return `${first.toLocaleLowerCase("uk-UA")}${rest.join("")}`;
}

function upperFirst(value: string): string {
  const [first = "", ...rest] = [...value];

  return `${first.toLocaleUpperCase("uk-UA")}${rest.join("")}`;
}
