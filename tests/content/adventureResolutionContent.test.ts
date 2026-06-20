import { describe, expect, it } from "vitest";
import { activeRaces } from "../../src/content/races";
import { classes } from "../../src/content/classes";
import { getKnownComboTitleValues } from "../../src/content/characterOptions";
import {
  buildAdventureResolutionScene,
  getGeneralAdventureResolutionProblemIds
} from "../../src/content/adventureResolutionContent";
import { buildStarterQuestResolutionScene } from "../../src/content/starterQuestResolutionContent";
import { ADVENTURE_PROBLEM_IDS } from "../../src/services/adventureService";
import {
  getQuestMethodTacticKey,
  resolveQuestMethodsForCharacter
} from "../../src/domain/quests/questMethodResolver";

describe("adventure resolution content", () => {
  it("covers every current general adventure problem with authored scene methods", () => {
    expect(getGeneralAdventureResolutionProblemIds()).toHaveLength(24);

    for (const problemId of getGeneralAdventureResolutionProblemIds()) {
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character
      });

      expect(scene.methods.filter((method) => method.source === "scene").length).toBeGreaterThanOrEqual(3);
      expect(scene.methods.every((method) => method.outcomeText.complication.body.length > 0)).toBe(true);
    }
  });

  it("builds at least three usable methods for every current adventure problem id", () => {
    for (const problemId of ADVENTURE_PROBLEM_IDS) {
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character
      });
      const methods = resolveQuestMethodsForCharacter(scene, character);
      const callbackKeys = methods.map((method) => method.callbackKey ?? method.id);

      expect(methods.length, problemId).toBeGreaterThanOrEqual(3);
      expect(new Set(methods.map((method) => method.id)).size, problemId).toBe(methods.length);
      expect(new Set(callbackKeys).size, problemId).toBe(callbackKeys.length);
    }
  });

  it("has generated coverage for every active race, class and known title", () => {
    for (const race of activeRaces) {
      const problemId = `race-${race.id.replace("race.", "")}-portrait`;
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character: { ...character, raceId: race.id, raceName: race.name }
      });

      expect(scene.methods.some((method) => method.source === "race"), race.id).toBe(true);
    }

    for (const heroClass of classes) {
      const problemId = `class-${heroClass.id.replace("class.", "")}-manual`;
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character: { ...character, classId: heroClass.id, className: heroClass.name }
      });

      expect(scene.methods.some((method) => method.source === "class"), heroClass.id).toBe(true);
    }

    for (const title of getKnownComboTitleValues()) {
      const problemId = `title-${slugTitle(title)}`;
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character: { ...character, title }
      });

      expect(scene.methods.some((method) => method.source === "signature"), title).toBe(true);
    }
  });

  it("keeps generated problem families scene-native instead of universal fallback methods", () => {
    const generatedIds = ADVENTURE_PROBLEM_IDS.filter((problemId) =>
      /^(race|class|title)-/u.test(problemId)
    );

    for (const problemId of generatedIds) {
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character
      });
      const sceneMethods = scene.methods.filter((method) => method.source === "scene");

      expect(sceneMethods.map((method) => method.id), problemId).not.toEqual(
        expect.arrayContaining(["inspect-scene", "negotiate-scene", "deceive-scene", "ritual-scene"])
      );
      expect(new Set(sceneMethods.map((method) => method.label)).size, problemId).toBe(sceneMethods.length);
      expect(sceneMethods.every((method) => method.callbackKey && method.callbackKey.length <= 8), problemId).toBe(true);
    }
  });

  it("keeps INT-heavy generated problems from hiding the class method", () => {
    const intellectualBureaucramancer = {
      ...character,
      raceId: "race.intellectual-orc",
      raceName: "Орк-інтелігент",
      classId: "class.bureaucramancer",
      className: "Бюрокромант",
      stats: {
        ...character.stats,
        intelligence: 11
      }
    };
    const scene = buildAdventureResolutionScene({
      problemId: "class-bureaucramancer-uniform",
      title: "Форма для «Бюрокроманта» не влазить у клітинку",
      character: intellectualBureaucramancer
    });
    const methods = resolveQuestMethodsForCharacter(scene, intellectualBureaucramancer);

    expect(methods.some((method) => method.source === "class")).toBe(true);
    for (const primaryStat of ["strength", "dexterity", "intelligence", "charisma", "luck"] as const) {
      expect(methods.filter((method) => method.primaryStat === primaryStat).length, primaryStat).toBeLessThanOrEqual(2);
    }
  });

  it("keeps the visible method matrix complete and constrained for active race/class combos", () => {
    for (const problemId of ADVENTURE_PROBLEM_IDS) {
      for (const race of activeRaces) {
        for (const heroClass of classes) {
          const profile = {
            ...character,
            raceId: race.id,
            raceName: race.name,
            classId: heroClass.id,
            className: heroClass.name
          };
          const scene = buildAdventureResolutionScene({
            problemId,
            title: problemId,
            character: profile
          });
          const methods = resolveQuestMethodsForCharacter(scene, profile);
          const repeated = resolveQuestMethodsForCharacter(scene, profile);
          const sources = new Set(methods.map((method) => method.source));

          expect(methods.map((method) => method.id), problemId).toEqual(repeated.map((method) => method.id));
          expect(methods.length, `${problemId}:${race.id}:${heroClass.id}`).toBeGreaterThanOrEqual(3);
          expect(methods.length, `${problemId}:${race.id}:${heroClass.id}`).toBeLessThanOrEqual(4);
          expect(sources.has("scene"), `${problemId}:${race.id}:${heroClass.id}`).toBe(true);
          expect(sources.has("race"), `${problemId}:${race.id}:${heroClass.id}`).toBe(true);
          expect(sources.has("class"), `${problemId}:${race.id}:${heroClass.id}`).toBe(true);
          expect(sources.has("signature"), `${problemId}:${race.id}:${heroClass.id}`).toBe(true);
          expect(new Set(methods.map((method) => normalize(method.label))).size, problemId).toBe(methods.length);
          expect(new Set(methods.map(getQuestMethodTacticKey)).size, problemId).toBe(methods.length);

          for (const primaryStat of ["strength", "dexterity", "intelligence", "charisma", "luck"] as const) {
            expect(methods.filter((method) => method.primaryStat === primaryStat).length, primaryStat).toBeLessThanOrEqual(2);
          }
        }
      }
    }
  });

  it("keeps starter shawarma and cellar mouse slots represented without duplicate tactics", () => {
    for (const sceneId of ["shawarma", "cellar-mouse"] as const) {
      const scene = buildStarterQuestResolutionScene(sceneId, bard);
      const methods = resolveQuestMethodsForCharacter(scene, bard, {
        maxMethods: 4,
        minMethods: 3,
        ...(sceneId === "cellar-mouse" ? { sceneSlotKey: "bribe-cheese" } : {})
      });
      const sources = new Set(methods.map((method) => method.source));

      expect(methods.length, sceneId).toBe(4);
      expect(sources).toEqual(new Set(["scene", "race", "class", "signature"]));
      expect(new Set(methods.map(getQuestMethodTacticKey)).size, sceneId).toBe(methods.length);
    }
  });

  it("keeps generated profile methods free of internal mechanic labels and object suffixes", () => {
    const bard = {
      ...character,
      raceId: "race.dryland-rusalka",
      raceName: "Русалка сухопутна",
      classId: "class.bard",
      className: "Бард",
      title: "Співачка Без Моря"
    };

    for (const problemId of ADVENTURE_PROBLEM_IDS) {
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character: bard
      });
      const profileMethods = scene.methods.filter((method) =>
        method.source === "race" || method.source === "class" || method.source === "signature"
      );

      for (const method of profileMethods) {
        expect(method.hint, `${problemId}:${method.id}`).not.toMatch(
          /Расовий спосіб|Класова техніка|race\+class|signature/u
        );
        const outcomeBody = Object.values(method.outcomeText)
          .flatMap((outcome) => outcome.body)
          .join("\n");
        expect(outcomeBody, `${problemId}:${method.id}`).not.toMatch(
          /Підпис методу|Расовий спосіб|Класова техніка|race\+class/u
        );
        expect(outcomeBody, `${problemId}:${method.id}`).not.toMatch(/:\s*[^:\n]+:/u);
        expect(`${method.label}\n${method.buttonLabel ?? ""}\n${outcomeBody}`, `${problemId}:${method.id}`).not.toMatch(
          /шаурмуу|формуу|кухольу|частину бочку|зі бочку|довкола бочку/u
        );
      }

      for (const method of profileMethods.filter((candidate) =>
        candidate.source === "race" || candidate.source === "class"
      )) {
        expect(method.label, `${problemId}:${method.id}`).not.toMatch(/: [^\n]+$/u);
      }
    }
  });

  it("makes the same race and class adapt to unrelated scene affordances", () => {
    const stew = resolveQuestMethodsForCharacter(
      buildAdventureResolutionScene({
        problemId: "stew",
        title: "Казанок репетирує оперу",
        character: bard
      }),
      bard
    );
    const door = resolveQuestMethodsForCharacter(
      buildAdventureResolutionScene({
        problemId: "door",
        title: "Двері беруть плату за вихід",
        character: bard
      }),
      bard
    );

    expect(stew.find((method) => method.source === "class")?.label).not.toBe(
      door.find((method) => method.source === "class")?.label
    );
    expect(stew.find((method) => method.source === "race")?.label).not.toBe(
      door.find((method) => method.source === "race")?.label
    );
    expect(stew.find((method) => method.source === "signature")?.outcomeText.success.body.join("\n")).not.toBe(
      door.find((method) => method.source === "signature")?.outcomeText.success.body.join("\n")
    );
  });
});

function slugTitle(title: string): string {
  return title
    .toLocaleLowerCase("uk-UA")
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

const character = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 3,
  xp: 25,
  nextLevelXp: 50,
  xpToNextLevel: 25,
  gold: 9,
  hpCurrent: 28,
  hpMax: 28,
  manaCurrent: 14,
  manaMax: 14,
  stats: {
    strength: 9,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 8,
    manaMax: 4,
    primaryStat: {
      stat: "strength",
      bonus: 2
    }
  }
} as const;

const bard = {
  ...character,
  raceId: "race.dryland-rusalka",
  raceName: "Русалка сухопутна",
  classId: "class.bard",
  className: "Бард",
  title: "Співачка Без Моря",
  stats: {
    strength: 6,
    dexterity: 6,
    intelligence: 8,
    charisma: 9,
    luck: 7
  }
} as const;

function normalize(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, "").trim().toLocaleLowerCase("uk-UA");
}
