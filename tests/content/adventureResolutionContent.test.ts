import { describe, expect, it } from "vitest";
import { activeRaces } from "../../src/content/races";
import { classes } from "../../src/content/classes";
import { getKnownComboTitleValues } from "../../src/content/characterOptions";
import {
  buildAdventureResolutionScene,
  getGeneralAdventureResolutionProblemIds
} from "../../src/content/adventureResolutionContent";
import { ADVENTURE_PROBLEM_IDS } from "../../src/services/adventureService";
import { resolveQuestMethodsForCharacter } from "../../src/domain/quests/questMethodResolver";

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

      expect(methods.length, problemId).toBeGreaterThanOrEqual(3);
      expect(new Set(methods.map((method) => method.id)).size, problemId).toBe(methods.length);
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
      }

      for (const method of profileMethods.filter((candidate) =>
        candidate.source === "race" || candidate.source === "class"
      )) {
        expect(method.label, `${problemId}:${method.id}`).not.toMatch(/: [^\n]+$/u);
      }
    }
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
