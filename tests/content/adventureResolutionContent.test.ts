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
  getQuestMethodAffordanceKey,
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

  it("does not inject universal filler methods into unrelated active problems", () => {
    const forbiddenIds = new Set(["korchmar-witness", "mark-evidence", "quiet-minute"]);
    const forbiddenLabels = [
      "Покликати Корчмаря як свідка",
      "Позначити предмет контрольною ниткою",
      "Дати сцені хвилину тиші"
    ];
    const seenByLabel = new Map<string, Set<string>>();

    for (const problemId of ADVENTURE_PROBLEM_IDS) {
      const methods = resolveQuestMethodsForCharacter(
        buildAdventureResolutionScene({
          problemId,
          title: problemId,
          character
        }),
        character
      );

      expect(methods.some((method) => forbiddenIds.has(method.id)), problemId).toBe(false);

      for (const method of methods) {
        const label = method.buttonLabel ?? method.label;

        expect(forbiddenLabels.some((forbidden) => label.includes(forbidden)), problemId).toBe(false);

        if (!seenByLabel.has(label)) {
          seenByLabel.set(label, new Set());
        }

        seenByLabel.get(label)!.add(problemId);
      }
    }

    for (const [label, problemIds] of seenByLabel) {
      expect(problemIds.size, label).toBeLessThan(ADVENTURE_PROBLEM_IDS.length);
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
          expect(methods.length, `${problemId}:${race.id}:${heroClass.id}`).toBeGreaterThanOrEqual(5);
          expect(methods.length, `${problemId}:${race.id}:${heroClass.id}`).toBeLessThanOrEqual(7);
          expect(sources.has("scene"), `${problemId}:${race.id}:${heroClass.id}`).toBe(true);
          expect(new Set(methods.map((method) => normalize(method.label))).size, problemId).toBe(methods.length);
          expect(new Set(methods.map(getQuestMethodTacticKey)).size, problemId).toBe(methods.length);
          expect(new Set(methods.map(getQuestMethodAffordanceKey)).size, problemId).toBe(methods.length);

          for (const primaryStat of ["strength", "dexterity", "intelligence", "charisma", "luck"] as const) {
            expect(methods.filter((method) => method.primaryStat === primaryStat).length, primaryStat).toBeLessThanOrEqual(2);
          }
        }
      }
    }
  });

  it("keeps active problem sets risk-owned without global punishment copy", () => {
    const riskyConsequences = new Set(["minor-injury", "serious-injury", "fight-handoff"]);
    const fallbackCopy = [
      "обраний підхід",
      "обраний метод",
      "потрібний кут",
      "chosen approach",
      "chosen method"
    ];

    for (const problemId of ADVENTURE_PROBLEM_IDS) {
      const methods = resolveQuestMethodsForCharacter(
        buildAdventureResolutionScene({
          problemId,
          title: problemId,
          character
        }),
        character
      );

      expect(
        methods.some((method) => riskyConsequences.has(method.consequenceByGrade.complication)),
        problemId
      ).toBe(true);

      for (const method of methods) {
        const outcomeBodies = Object.values(method.outcomeText)
          .flatMap((outcome) => outcome.body)
          .join("\n")
          .toLocaleLowerCase("uk-UA");
        const uniqueGradeBodies = new Set(
          Object.values(method.outcomeText).map((outcome) => outcome.body.join("\n"))
        );

        expect(uniqueGradeBodies.size, `${problemId}:${method.id}`).toBe(4);
        for (const fallback of fallbackCopy) {
          expect(outcomeBodies, `${problemId}:${method.id}`).not.toContain(fallback);
        }
      }
    }
  });

  it("keeps adventure outcome copy free of known case and agreement breakages", () => {
    const sampledProblemIds = [
      "barrel",
      "bench",
      "helmet",
      "spoon",
      "race-human-ish-survey",
      "race-human-ish-mug",
      "race-human-ish-portrait",
      "class-bard-manual",
      "class-bard-uniform",
      "class-bard-exam",
      `title-${slugTitle(getKnownComboTitleValues()[0] ?? "Архівний Дух")}`
    ];
    const malformed = [
      "бочку приймає заставу",
      "від якої лаву не може відмовитись",
      "Ложку змушено визнає факт",
      "приводить анкети до робочого стану",
      "у портрета точну причину",
      "знаходить у бочку",
      "Уважну ревізію причини тримає",
      "зчіплюється з вагу прямого аргументу",
      "Вагу прямого аргументу допомагає"
    ];

    for (const problemId of sampledProblemIds) {
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character
      });
      const copy = scene.methods
        .flatMap((method) => Object.values(method.outcomeText))
        .flatMap((outcome) => [outcome.headline, ...outcome.body])
        .join("\n");

      for (const phrase of malformed) {
        expect(copy, `${problemId}:${phrase}`).not.toContain(phrase);
      }
    }
  });

  it("keeps full method labels out of resolved outcome bodies", () => {
    const problemIds = [
      ...getGeneralAdventureResolutionProblemIds(),
      "race-human-ish-survey",
      "race-human-ish-mug",
      "race-human-ish-portrait",
      "class-bard-manual",
      "class-bard-uniform",
      "class-bard-exam",
      `title-${slugTitle(getKnownComboTitleValues()[0] ?? "Архівний Дух")}`
    ];

    for (const problemId of problemIds) {
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character
      });

      for (const method of scene.methods) {
        const label = normalize(method.label);
        const copy = activeOutcomeBody(method).toLocaleLowerCase("uk-UA");

        expect(copy, `${problemId}:${method.id}`).not.toContain(label);
      }
    }
  });

  it("gives compared methods in the same scene visibly different outcome bodies", () => {
    const comparisons = [
      {
        problemId: "barrel",
        title: "Бочка вимагає орендну угоду",
        methodIds: ["inspect-staves", "sign-lease", "bribe-cork", "evict-emptiness"]
      },
      {
        problemId: "stew",
        title: "Казанок репетирує оперу",
        methodIds: ["conduct-duet", "lower-fire", "taste-critic", "lid-challenge"]
      },
      {
        problemId: "calendar",
        title: "Календар загубив четвер",
        methodIds: ["audit-days", "negotiate-week", "forge-thursday", "bribe-deadline"]
      },
      {
        problemId: "door",
        title: "Двері беруть плату за вихід",
        methodIds: ["inspect-hinges", "negotiate-toll", "fake-payment", "pay-tip"]
      }
    ] as const;

    for (const comparison of comparisons) {
      const scene = buildAdventureResolutionScene({
        problemId: comparison.problemId,
        title: comparison.title,
        character
      });
      const bodies = comparison.methodIds.map((methodId) => {
        const method = scene.methods.find((candidate) => candidate.id === methodId);

        expect(method, `${comparison.problemId}:${methodId}`).toBeDefined();
        return activeOutcomeBody(method!);
      });

      expect(new Set(bodies).size, comparison.problemId).toBe(bodies.length);
    }

    for (const sceneId of ["shawarma", "cellar-mouse"] as const) {
      const scene = buildStarterQuestResolutionScene(sceneId, bard);
      const sceneMethods = scene.methods.filter((method) => method.source === "scene");
      const bodies = sceneMethods.map(activeOutcomeBody);

      expect(new Set(bodies).size, sceneId).toBe(sceneMethods.length);
    }
  });

  it("keeps qualitative danger warnings on every rendered risky method variant", () => {
    const renderedSets = [
      ...ADVENTURE_PROBLEM_IDS.map((problemId) =>
        resolveQuestMethodsForCharacter(
          buildAdventureResolutionScene({
            problemId,
            title: problemId,
            character: bard
          }),
          bard
        )
      ),
      resolveQuestMethodsForCharacter(buildStarterQuestResolutionScene("shawarma", bard), bard),
      resolveQuestMethodsForCharacter(buildStarterQuestResolutionScene("cellar-mouse", bard), bard, {
        sceneSlotKey: "bribe-cheese"
      })
    ];

    for (const methods of renderedSets) {
      for (const method of methods) {
        const consequence = method.consequenceByGrade.complication;

        if (consequence === "minor-injury" || consequence === "serious-injury") {
          expect(method.hint, method.id).toMatch(
            /постраждати|небезпеч|пальц|забит|синц|обпект|впасти|травм/i
          );
        }

        if (consequence === "fight-handoff") {
          expect(method.hint, method.id).toMatch(/бійк|бій|істот|мешканц|поклик|виліз|варта/i);
        }
      }
    }
  });

  it("changes fitting visible affordances for different identities on the same scene", () => {
    const profiles = [
      {
        ...character,
        raceId: "race.domovyk",
        raceName: "Домовик",
        classId: "class.bureaucramancer",
        className: "Бюрокромант"
      },
      bard,
      {
        ...character,
        raceId: "race.intellectual-orc",
        raceName: "Орк-інтелігент",
        classId: "class.warrior",
        className: "Воїн",
        stats: { ...character.stats, intelligence: 9, strength: 9 }
      },
      {
        ...character,
        raceId: "race.drantohor",
        raceName: "Дрантогор",
        classId: "class.ranger",
        className: "Єгер",
        stats: { ...character.stats, dexterity: 9, luck: 8 }
      },
      {
        ...character,
        raceId: "race.molfar-soul",
        raceName: "Мольфарська душа",
        classId: "class.priest",
        className: "Жрець",
        stats: { ...character.stats, intelligence: 8, luck: 9 }
      }
    ] as const;
    const methodSets = profiles.map((profile) =>
      resolveQuestMethodsForCharacter(
        buildAdventureResolutionScene({
          problemId: "barrel",
          title: "Бочка вимагає орендну угоду",
          character: profile
        }),
        profile
      ).map((method) => method.id)
    );
    const uniqueSets = new Set(methodSets.map((methods) => methods.join("|")));

    expect(uniqueSets.size).toBeGreaterThan(1);
  });

  it("keeps starter shawarma and cellar mouse slots represented without duplicate tactics", () => {
    for (const sceneId of ["shawarma", "cellar-mouse"] as const) {
      const scene = buildStarterQuestResolutionScene(sceneId, bard);
      const methods = resolveQuestMethodsForCharacter(scene, bard, {
        ...(sceneId === "cellar-mouse" ? { sceneSlotKey: "bribe-cheese" } : {})
      });
      const sources = new Set(methods.map((method) => method.source));
      const injuryConsequences = methods
        .map((method) => method.consequenceByGrade.complication)
        .filter((consequence) => consequence === "minor-injury" || consequence === "serious-injury");

      expect(methods.length, sceneId).toBeGreaterThanOrEqual(5);
      expect(methods.length, sceneId).toBeLessThanOrEqual(7);
      expect(sources.has("scene")).toBe(true);
      expect(new Set(methods.map(getQuestMethodTacticKey)).size, sceneId).toBe(methods.length);
      expect(new Set(methods.map(getQuestMethodAffordanceKey)).size, sceneId).toBe(methods.length);
      expect(injuryConsequences, sceneId).toContain("minor-injury");
      expect(injuryConsequences, sceneId).not.toContain("serious-injury");
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

      for (const method of scene.methods) {
        const methodCopy = [
          method.label,
          method.buttonLabel ?? "",
          method.hint,
          ...Object.values(method.outcomeText).flatMap((outcome) => [outcome.headline, ...outcome.body])
        ].join("\n");
        expect(methodCopy, `${problemId}:${method.id}`).not.toMatch(
          /шаурмуу|формуу|кухольу|частину бочку|зі бочку|довкола бочку|до бочку/u
        );
      }

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
        expect(outcomeBody, `${problemId}:${method.id}`).not.toContain("Обраний підхід дає потрібний кут");
        expect(outcomeBody, `${problemId}:${method.id}`).not.toMatch(/:\s*[^:\n]+:/u);
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

function activeOutcomeBody(method: {
  outcomeText: Record<string, { body: readonly string[] }>;
}): string {
  return Object.values(method.outcomeText)
    .flatMap((outcome) => outcome.body)
    .join("\n");
}
