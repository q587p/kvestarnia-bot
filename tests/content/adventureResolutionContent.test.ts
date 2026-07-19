import { describe, expect, it } from "vitest";
import { activeRaces } from "../../src/content/races";
import { classes } from "../../src/content/classes";
import { getKnownComboTitleValues } from "../../src/content/characterOptions";
import {
  buildAdventureResolutionScene,
  getGeneralAdventureResolutionProblemIds
} from "../../src/content/adventureResolutionContent";
import { buildStarterQuestResolutionScene } from "../../src/content/starterQuestResolutionContent";
import {
  ADVENTURE_PROBLEM_IDS,
  getAdventureProblemPoolForProfile
} from "../../src/services/adventureService";
import {
  findQuestMethodByLegacyAction,
  getQuestMethodAffordanceKey,
  getQuestMethodTacticKey,
  resolveQuestMethodsForCharacter
} from "../../src/domain/quests/questMethodResolver";
import {
  calculateQuestChance,
  deriveQuestRiskBand,
  qualitativeQuestChance
} from "../../src/domain/quests/questChecks";
import type { QuestMethodDefinition } from "../../src/content/questResolution";

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

  it("gives every active adventure problem concrete selected-card objective copy", () => {
    const problemById = new Map(
      getAdventureProblemPoolForProfile().map((problem) => [problem.id, problem])
    );
    for (const race of activeRaces) {
      for (const problem of getAdventureProblemPoolForProfile({ raceId: race.id })) {
        problemById.set(problem.id, problem);
      }
    }
    for (const heroClass of classes) {
      for (const problem of getAdventureProblemPoolForProfile({ classId: heroClass.id })) {
        problemById.set(problem.id, problem);
      }
    }
    for (const title of getKnownComboTitleValues()) {
      for (const problem of getAdventureProblemPoolForProfile({ title })) {
        problemById.set(problem.id, problem);
      }
    }
    const pool = [...problemById.values()];
    const genericPlaceholders = [
      "проблема потребує вирішення",
      "треба розібратися",
      "допоможіть клієнту",
      "цими методами",
      "закрити справу",
      "вирішити ситуацію"
    ];

    expect(pool.map((problem) => problem.id).sort()).toEqual([...ADVENTURE_PROBLEM_IDS].sort());

    for (const problem of pool) {
      expect(problem.client.trim().length, `${problem.id}:client`).toBeGreaterThan(8);
      expect(problem.problem.trim().length, `${problem.id}:problem`).toBeGreaterThan(24);
      expect(problem.goal.trim().length, `${problem.id}:goal`).toBeGreaterThan(24);
      expect(problem.problem, `${problem.id}:problem`).not.toBe(problem.hook);
      expect(problem.goal, `${problem.id}:goal`).not.toBe(problem.hook);
      expect(problem.problem, `${problem.id}:problem`).not.toMatch(/\brace\b|\bclass\b|signature|grade|consequence/iu);
      expect(problem.goal, `${problem.id}:goal`).not.toMatch(/\brace\b|\bclass\b|signature|grade|consequence/iu);

      const normalized = `${problem.problem}\n${problem.goal}`.toLocaleLowerCase("uk-UA");
      for (const placeholder of genericPlaceholders) {
        expect(normalized, `${problem.id}:${placeholder}`).not.toContain(placeholder);
      }
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

  it("returns equivalent generated scenes in independent runtime containers", () => {
    const input = {
      problemId: "class-bard-manual",
      title: "Підручник просить сценічну паузу",
      character: bard
    };
    const first = buildAdventureResolutionScene(input);
    const second = buildAdventureResolutionScene(input);
    const originalMethodCount = second.methods.length;
    const originalLabel = second.methods[0]!.label;
    const originalHeadline = second.methods[0]!.outcomeText.success.headline;
    const firstSceneMethod = first.methods.find((method) => method.source === "scene")!;
    const secondSceneMethod = second.methods.find((method) => method.id === firstSceneMethod.id)!;
    const originalTechniques = [...secondSceneMethod.techniques];

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.methods).not.toBe(second.methods);
    expect(first.methods[0]).not.toBe(second.methods[0]);
    expect(first.methods[0]!.outcomeText).not.toBe(second.methods[0]!.outcomeText);
    expect(firstSceneMethod.techniques).not.toBe(secondSceneMethod.techniques);

    (first.methods as QuestMethodDefinition[]).pop();
    first.methods[0]!.label = "змінено лише в першій сцені";
    first.methods[0]!.outcomeText.success.headline = "змінено лише в першій сцені";
    (firstSceneMethod.techniques as Array<(typeof firstSceneMethod.techniques)[number]>).pop();

    expect(second.methods).toHaveLength(originalMethodCount);
    expect(second.methods[0]!.label).toBe(originalLabel);
    expect(second.methods[0]!.outcomeText.success.headline).toBe(originalHeadline);
    expect(secondSceneMethod.techniques).toEqual(originalTechniques);
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

  it("keeps representative method-help cards from collapsing into safe odds", () => {
    const samples = [
      character,
      {
        ...character,
        raceId: "race.dryland-rusalka",
        raceName: "Русалка сухопутна",
        classId: "class.bard",
        className: "Бард",
        stats: {
          ...character.stats,
          charisma: 12,
          luck: 10
        }
      },
      {
        ...character,
        raceId: "race.drantohor",
        raceName: "Дрантогор",
        classId: "class.rogue",
        className: "Пройдисвіт",
        stats: {
          ...character.stats,
          dexterity: 12,
          luck: 11
        }
      }
    ];

    for (const problemId of ADVENTURE_PROBLEM_IDS) {
      for (const profile of samples) {
        const methods = resolveQuestMethodsForCharacter(
          buildAdventureResolutionScene({
            problemId,
            title: problemId,
            character: profile
          }),
          profile,
          { maxMethods: 5, minMethods: 5 }
        );
        const chanceHints = methods.map((method) =>
          qualitativeQuestChance(
            calculateQuestChance({
              method,
              stats: profile.stats,
              raceId: profile.raceId,
              classId: profile.classId
            })
          )
        );
        const riskBands = methods.map(deriveQuestRiskBand);

        expect(methods.length, `${problemId}:${profile.raceId}:${profile.classId}`).toBe(5);
        expect(chanceHints.filter((hint) => hint === "майже надійно").length, problemId).toBeLessThanOrEqual(1);
        expect(chanceHints.filter((hint) => hint === "добрі шанси").length, problemId).toBeLessThanOrEqual(2);
        expect(
          chanceHints.filter((hint) => hint === "непевно" || hint === "дуже непевно").length,
          problemId
        ).toBeGreaterThanOrEqual(2);
        expect(riskBands.some((band) => band === "risky" || band === "wild"), problemId).toBe(true);
      }
    }
  });

  it("keeps active problem sets risk-owned without global punishment copy", () => {
    const riskyConsequences = new Set(["minor-injury", "serious-injury", "fight-handoff", "local-failure"]);
    const fallbackCopy = [
      "обраний підхід",
      "обраний метод",
      "потрібний кут",
      "Сторони погоджуються на коротку угоду",
      "Увагу відведено, потрібний результат витягнуто",
      "Шов, петля або хитрий вузол стають на місце",
      "Доказів вистачає, щоб сцена перестала сперечатись",
      "Деталь «",
      "Цей конкретний рух",
      "рух, доказ і наслідок",
      "знаходить точний робочий кут",
      "тримає справу достатньо міцно",
      "майже складає порядок",
      "зривається у найгострішому місці",
      "Уважний хід «",
      "Ремісничий рух «",
      "Акуратна робота «",
      "Ремонт «",
      "Робота «",
      "Перевірка «",
      "Рішення «",
      "Спроба «",
      "Особистий варіант",
      "Професійний варіант",
      "Особистий ризикований варіант",
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
          .join("\n");
        const normalizedOutcomeBodies = normalizeCopyGateText(outcomeBodies);
        const uniqueGradeBodies = new Set(
          Object.values(method.outcomeText).map((outcome) => outcome.body.join("\n"))
        );

        expect(uniqueGradeBodies.size, `${problemId}:${method.id}`).toBe(4);
        for (const fallback of fallbackCopy) {
          expect(normalizedOutcomeBodies, `${problemId}:${method.id}:${fallback}`).not.toContain(
            normalizeCopyGateText(fallback)
          );
        }
      }
    }
  });

  it("keeps adventure outcome copy free of known case and agreement breakages", () => {
    const sampledProblemIds = [
      ...ADVENTURE_PROBLEM_IDS,
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
      "навколо маршрут підошов",
      "навколо плащу талончик",
      "навколо з чорнилом про графу",
      "навколо підручнику межі уроку",
      "Уважну ревізію причини тримає",
      "зчіплюється з вагу прямого аргументу",
      "Вагу прямого аргументу допомагає",
      "Ремісничий підхід до «Закладку до розділу»",
      "«Закладку до розділу» ламається",
      "Сліди «Вперту клітинку» стають у ряд",
      "Домовленість «Апеляцію до здорового глузду»",
      "Коло для «Ритуал тиші в аудиторії»",
      "«Стрічки урочистости» прикриває трюк",
      "Обережний знак біля «Малу церемонію печатки»",
      "Край «Найгучнішу піну окремою ложкою»",
      "Сліди «Дно на таємну кімнату»",
      "до «Закладку",
      "біля «Малу",
      "навколо «Вперту",
      "для «Ритуал",
      "«Стрічки урочистости» прикриває",
      "«Апеляцію до здорового глузду» стишує"
    ];

    for (const problemId of new Set(sampledProblemIds)) {
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

  it("rejects copied long outcome skeletons across unrelated adventure scenes", () => {
    const repeatedSkeletons = new Map<string, Set<string>>();

    for (const { problemId, methodId, grade, sentence } of collectActiveAdventureOutcomeSentences()) {
      const skeleton = normalizeOutcomeSkeleton(sentence);
      if (skeleton.length < 42) {
        continue;
      }

      const key = `${grade}:${skeleton}`;
      const owners = repeatedSkeletons.get(key) ?? new Set<string>();
      owners.add(`${problemId}:${methodId}`);
      repeatedSkeletons.set(key, owners);
    }

    const duplicates = [...repeatedSkeletons.entries()]
      .filter(([, owners]) => new Set([...owners].map((owner) => owner.split(":")[0])).size > 1)
      .map(([skeleton, owners]) => `${skeleton} => ${[...owners].join(", ")}`);

    expect(duplicates).toEqual([]);
  });

  it("keeps named regression methods on explicit authored outcome beats", () => {
    const regressionIds = [
      "duel-memory",
      "fact-check",
      "stage-applause",
      "queue-talk",
      "coalition",
      "bribe-smoke",
      "survey-ink-talk",
      "manual-lecture",
      "uniform-office-talk",
      "title-queue-talk",
      "oil-soles",
      "jar-soot",
      "trim-wick",
      "measure-legs",
      "braid-bristles",
      "oil-hinge",
      "pin-thread-route",
      "chalk-fish",
      "clean-frame",
      "warm-teeth",
      "bookmark-debt",
      "pin-corner",
      "pad-clapper",
      "survey-fold-corner",
      "mug-steady-handle",
      "portrait-varnish-knock",
      "manual-bookmark-risk",
      "uniform-pin-cuff",
      "exam-scratch-margin",
      "title-knot-crest"
    ];
    const banned = [
      "знаходить точний робочий кут",
      "тримає справу достатньо міцно",
      "майже складає порядок",
      "зривається у найгострішому місці",
      "Деталь «",
      "Цей конкретний рух",
      "рух, доказ і наслідок"
    ];
    const problemIds = [
      "helmet",
      "cloak",
      "spoon",
      "chimney",
      "boots",
      "candle",
      "chair",
      "broom",
      "door",
      "map",
      "sign",
      "portrait",
      "key",
      "ledger",
      "rug",
      "bell",
      "race-human-ish-survey",
      "race-human-ish-mug",
      "race-human-ish-portrait",
      "class-bard-manual",
      "class-bard-uniform",
      "class-bard-exam",
      `title-${slugTitle(getKnownComboTitleValues()[0] ?? "Архівний Дух")}`
    ];
    const bodiesByMethod = new Map<string, string>();

    for (const problemId of problemIds) {
      const scene = buildAdventureResolutionScene({
        problemId,
        title: problemId,
        character
      });

      for (const method of scene.methods) {
        if (regressionIds.includes(method.id)) {
          bodiesByMethod.set(
            method.id,
            Object.values(method.outcomeText)
              .flatMap((outcome) => outcome.body)
              .join("\n")
          );
        }
      }
    }

    for (const id of regressionIds) {
      const body = bodiesByMethod.get(id);

      expect(body, id).toBeDefined();
      for (const phrase of banned) {
        expect(body!, `${id}:${phrase}`).not.toContain(phrase);
      }
    }

    expect(bodiesByMethod.get("duel-memory")).toContain("Спогад");
    expect(bodiesByMethod.get("fact-check")).toContain("Вмʼятини");
    expect(bodiesByMethod.get("stage-applause")).toContain("шолому");
    expect(bodiesByMethod.get("queue-talk")).toContain("Талончик");
    expect(bodiesByMethod.get("coalition")).toContain("Виделки");
    expect(bodiesByMethod.get("bribe-smoke")).toContain("вентиляцію");
    expect(bodiesByMethod.get("survey-ink-talk")).toContain("чорнилом");
    expect(bodiesByMethod.get("manual-lecture")).toContain("підручнику");
    expect(bodiesByMethod.get("uniform-office-talk")).toContain("Канцелярський край");
    expect(bodiesByMethod.get("title-queue-talk")).toContain("Черга пошани");
    expect(bodiesByMethod.get("oil-soles")).toContain("підошви");
    expect(bodiesByMethod.get("jar-soot")).toContain("Сажа");
    expect(bodiesByMethod.get("trim-wick")).toContain("Ґніт");
    expect(bodiesByMethod.get("measure-legs")).toContain("Ніжки");
    expect(bodiesByMethod.get("braid-bristles")).toContain("Щетина");
    expect(bodiesByMethod.get("oil-hinge")).toContain("Петля");
    expect(bodiesByMethod.get("pin-thread-route")).toContain("Нитка");
    expect(bodiesByMethod.get("chalk-fish")).toContain("риба");
    expect(bodiesByMethod.get("clean-frame")).toContain("Раму");
    expect(bodiesByMethod.get("warm-teeth")).toContain("Зубці");
    expect(bodiesByMethod.get("bookmark-debt")).toContain("Борг");
    expect(bodiesByMethod.get("pin-corner")).toContain("Кут килима");
    expect(bodiesByMethod.get("pad-clapper")).toContain("язичок дзвінка");
    expect(bodiesByMethod.get("survey-fold-corner")).toContain("Кут анкети");
    expect(bodiesByMethod.get("mug-steady-handle")).toContain("Ручку кухля");
    expect(bodiesByMethod.get("portrait-varnish-knock")).toContain("Лак");
    expect(bodiesByMethod.get("manual-bookmark-risk")).toContain("Сторінку");
    expect(bodiesByMethod.get("uniform-pin-cuff")).toContain("Манжет");
    expect(bodiesByMethod.get("exam-scratch-margin")).toContain("Відповідь");
    expect(bodiesByMethod.get("title-knot-crest")).toContain("Стрічка");
  });

  it("keeps the runaway boots copy explicit about cause, target, and method objects", () => {
    const problem = getAdventureProblemPoolForProfile().find((candidate) => candidate.id === "boots");
    const scene = buildAdventureResolutionScene({
      problemId: "boots",
      title: "Чоботи пішли без власника",
      character
    });

    expect(problem?.problem).toContain("образились");
    expect(problem?.goal).toContain("вхідних дверей");
    expect(problem?.goal).not.toContain("шкарпетки не стали свідками");
    expect(scene.methods.map((method) => method.label)).toEqual(
      expect.arrayContaining([
        "🛢️ Змастити підошви, щоб чоботи збили темп",
        "🤝 Записати чоботи в безпечну експедицію",
        "💪 Перегнати чоботи до вхідних дверей"
      ])
    );
  });

  it("capitalizes starter identity beats at sentence start", () => {
    const intellectualOrc = {
      ...character,
      raceId: "race.intellectual-orc",
      raceName: "Орк-інтелігент",
      classId: "class.warrior",
      className: "Воїн",
      stats: { ...character.stats, intelligence: 9, strength: 9 }
    };
    const scene = buildStarterQuestResolutionScene("shawarma", intellectualOrc);
    const raceMethod = scene.methods.find((method) => method.source === "race");

    expect(raceMethod).toBeDefined();
    expect(activeOutcomeBody(raceMethod!)).toContain("Уважна ревізія");
    expect(activeOutcomeBody(raceMethod!)).toContain("Перевірка складає докази");
    expect(activeOutcomeBody(raceMethod!)).not.toContain(". етична рецензія");
    expect(activeOutcomeBody(raceMethod!)).not.toContain(". уважна ревізія");
  });

  it("keeps runtime Ukrainian copy free of known mojibake markers", () => {
    const markers = ["Рџ", "Р“Р", "СЃ", "РЅ", "В«", "вЂ", "пёЏ"];
    const adventureProblemIds = [
      ...ADVENTURE_PROBLEM_IDS,
      "race-human-ish-survey",
      "race-human-ish-mug",
      "race-human-ish-portrait",
      "class-bard-manual",
      "class-bard-uniform",
      "class-bard-exam",
      `title-${slugTitle(getKnownComboTitleValues()[0] ?? "Архівний Дух")}`
    ];
    const copyBlocks = [
      ...adventureProblemIds.map((problemId) => {
        const scene = buildAdventureResolutionScene({
          problemId,
          title: problemId,
          character: bard
        });

        return [
          scene.sceneTitle,
          scene.sceneObject ?? "",
          scene.sceneObjectGenitive ?? "",
          ...scene.methods.flatMap((method) => [
            method.label,
            method.buttonLabel ?? "",
            method.hint,
            ...Object.values(method.outcomeText).flatMap((outcome) => [outcome.headline, ...outcome.body])
          ])
        ].join("\n");
      }),
      ...(["shawarma", "cellar-mouse"] as const).map((sceneId) => {
        const scene = buildStarterQuestResolutionScene(sceneId, bard);

        return [
          scene.sceneTitle,
          scene.sceneObject ?? "",
          ...scene.methods.flatMap((method) => [
            method.label,
            method.buttonLabel ?? "",
            method.hint,
            ...Object.values(method.outcomeText).flatMap((outcome) => [outcome.headline, ...outcome.body])
          ])
        ].join("\n");
      })
    ];

    for (const copy of copyBlocks) {
      for (const marker of markers) {
        expect(copy).not.toContain(marker);
      }
    }
  });

  it("keeps sentence starts capitalized in runtime quest copy", () => {
    const lowercaseAfterSentenceBreak = /[.!?]\s+\p{Ll}/u;

    for (const copy of collectRuntimeQuestCopy()) {
      expect(copy.match(lowercaseAfterSentenceBreak), copy).toBeNull();
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

  it("does not reuse one active outcome paragraph across unrelated scene methods", () => {
    for (const problemId of ADVENTURE_PROBLEM_IDS) {
      const methods = resolveQuestMethodsForCharacter(
        buildAdventureResolutionScene({
          problemId,
          title: problemId,
          character
        }),
        character
      );
      const sceneBodies = methods
        .filter((method) => method.source === "scene")
        .map(activeOutcomeBody);

      expect(new Set(sceneBodies).size, problemId).toBe(sceneBodies.length);
    }

    for (const sceneId of ["shawarma", "cellar-mouse"] as const) {
      const methods = resolveQuestMethodsForCharacter(buildStarterQuestResolutionScene(sceneId, character), character, {
        ...(sceneId === "cellar-mouse" ? { sceneSlotKey: "bribe-cheese" } : {})
      });
      const bodies = methods.map(activeOutcomeBody);

      expect(new Set(bodies).size, sceneId).toBe(bodies.length);
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

        if (consequence === "local-failure") {
          expect(method.hint, method.id).toMatch(/не закрит|без винагород|провал|не вдаст/i);
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

  it("surfaces character-shaped methods as visible scene actions", () => {
    const profile = {
      ...character,
      raceId: "race.domovyk",
      raceName: "Домовик",
      classId: "class.bureaucramancer",
      className: "Бюрокромант",
      title: "Домовий Аудитор",
      stats: { ...character.stats, intelligence: 9, charisma: 8 }
    };
    const scene = buildAdventureResolutionScene({
      problemId: "barrel",
      title: "Бочка вимагає орендну угоду",
      character: profile
    });
    const methods = resolveQuestMethodsForCharacter(scene, profile);
    const sources = new Set(methods.map((method) => method.source));

    expect(sources.has("race")).toBe(true);
    expect(sources.has("class")).toBe(true);
    expect(sources.has("signature")).toBe(true);
    expect(new Set(methods.map((method) => normalize(method.label))).size).toBe(methods.length);
    expect(new Set(methods.map(getQuestMethodAffordanceKey)).size).toBe(methods.length);
    for (const method of methods.filter((candidate) => candidate.source !== "scene")) {
      expect(method.label).not.toMatch(/Расовий спосіб|Класова техніка|signature|race\+class/u);
      expect(method.label).not.toMatch(/з печаткою|через внесок|дрібним ремонтом|обхідним ходом|по-домашньому|силовим підпором|на випадку|через ревізію|у ритм|мирною умовою|малим обрядом|за слідом|через пастку|тихим чаром|точним рухом/u);
    }
  });

  it("does not expose global technique suffixes on rendered method buttons", () => {
    const suffixes = /з печаткою|через внесок|дрібним ремонтом|обхідним ходом|по-домашньому|силовим підпором|на випадку|через ревізію|у ритм|мирною умовою|малим обрядом|за слідом|через пастку|тихим чаром|точним рухом/u;
    const profiles = [
      character,
      { ...character, raceId: "race.domovyk", classId: "class.bureaucramancer", title: "Домовий Аудитор" },
      { ...character, raceId: "race.dryland-rusalka", classId: "class.bard", title: "Співачка Без Моря" },
      { ...character, raceId: "race.intellectual-orc", classId: "class.warrior", title: "Критик Прикладного Биття" },
      { ...character, raceId: "race.drantohor", classId: "class.ranger", title: "Слідоход Чужої Карти" },
      { ...character, raceId: "race.molfar-soul", classId: "class.priest", title: "Пастир Малих Оберегів" }
    ];

    for (const profile of profiles) {
      for (const problemId of ADVENTURE_PROBLEM_IDS) {
        const methods = resolveQuestMethodsForCharacter(
          buildAdventureResolutionScene({
            problemId,
            title: problemId,
            character: profile
          }),
          profile
        );

        expect(methods.length, `${problemId}:${profile.raceId}:${profile.classId}`).toBeGreaterThanOrEqual(5);
        expect(methods.length, `${problemId}:${profile.raceId}:${profile.classId}`).toBeLessThanOrEqual(7);
        expect(methods.map((method) => method.buttonLabel ?? method.label).join("\n"), problemId).not.toMatch(suffixes);
      }
    }
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
      expect(
        methods.some((method) => method.source === "race" || method.source === "class" || method.source === "signature"),
        sceneId
      ).toBe(true);
      expect(new Set(methods.map(getQuestMethodTacticKey)).size, sceneId).toBe(methods.length);
      expect(new Set(methods.map(getQuestMethodAffordanceKey)).size, sceneId).toBe(methods.length);
      expect(injuryConsequences, sceneId).toContain("minor-injury");
      expect(injuryConsequences, sceneId).not.toContain("serious-injury");
    }
  });

  it("keeps the refreshed cellar mouse replies authored, reachable and varied", () => {
    const scene = buildStarterQuestResolutionScene("cellar-mouse", bard);
    const newMethodIds = [
      "write-mouse-minutes",
      "offer-thimble-office",
      "audit-crumb-border",
      "borrow-shadow",
      "sing-cheese-anthem",
      "appoint-shelf-mayor",
      "file-napkin-treaty"
    ];
    const newMethods = newMethodIds.map((id) => scene.methods.find((method) => method.id === id));

    expect(newMethods.every(Boolean)).toBe(true);

    for (const id of newMethodIds) {
      const visible = resolveQuestMethodsForCharacter(scene, bard, {
        sceneSlotKey: id,
        maxMethods: 7,
        minMethods: 5
      });

      expect(visible.map((method) => method.id), id).toContain(id);
    }

    const outcomeBodies = newMethods.flatMap((method) =>
      Object.values(method!.outcomeText).map((outcome) => outcome.body.join(" "))
    );
    const longSkeletons = outcomeBodies.map((body) =>
      normalize(body)
        .split(" ")
        .filter((word) => word.length > 3)
        .slice(0, 4)
        .join(" ")
    );

    expect(outcomeBodies).toHaveLength(28);
    expect(new Set(outcomeBodies).size).toBe(outcomeBodies.length);
    expect(new Set(longSkeletons).size).toBeGreaterThanOrEqual(13);
  });

  it("resolves duplicated legacy starter aliases through explicit canonical methods", () => {
    const shawarma = buildStarterQuestResolutionScene("shawarma", bard);
    const cellar = buildStarterQuestResolutionScene("cellar-mouse", bard);

    expect(shawarma.methods.filter((method) => method.legacyAction === "receipt").length).toBeGreaterThan(1);
    expect(shawarma.methods.filter((method) => method.legacyAction === "flee").length).toBeGreaterThan(1);
    expect(cellar.methods.filter((method) => method.legacyAction === "negotiate").length).toBeGreaterThan(1);
    expect(findQuestMethodByLegacyAction(shawarma, "receipt")?.id).toBe("demand-receipt");
    expect(findQuestMethodByLegacyAction(shawarma, "poke")?.id).toBe("pin-wrapper");
    expect(findQuestMethodByLegacyAction(shawarma, "flee")?.id).toBe("name-retreat");
    expect(findQuestMethodByLegacyAction(cellar, "cheese-trap")?.id).toBe("cheese-trap");
    expect(findQuestMethodByLegacyAction(cellar, "sweep-bravely")?.id).toBe("sweep-evidence");
    expect(findQuestMethodByLegacyAction(cellar, "negotiate")?.id).toBe("negotiate-shelf");
    expect(findQuestMethodByLegacyAction(cellar, "bribe-cheese")?.id).toBe("bribe-cheese");
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

function normalizeCopyGateText(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("uk-UA");
}

function collectActiveAdventureOutcomeSentences(): Array<{
  problemId: string;
  methodId: string;
  grade: string;
  sentence: string;
}> {
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
  const sentences: Array<{ problemId: string; methodId: string; grade: string; sentence: string }> = [];

  for (const problemId of new Set(problemIds)) {
    const scene = buildAdventureResolutionScene({
      problemId,
      title: problemId,
      character: bard
    });

    for (const method of scene.methods) {
      if (method.source !== "scene") {
        continue;
      }

      for (const [grade, outcome] of Object.entries(method.outcomeText)) {
        for (const bodyLine of outcome.body) {
          for (const sentence of bodyLine.split(/(?<=[.!?])\s+/u)) {
            const trimmed = sentence.trim();
            if (trimmed) {
              sentences.push({ problemId, methodId: method.id, grade, sentence: trimmed });
            }
          }
        }
      }
    }
  }

  return sentences;
}

function normalizeOutcomeSkeleton(sentence: string): string {
  return normalizeCopyGateText(sentence)
    .replace(/«[^»]*»/gu, "«»")
    .replace(/\b[a-z0-9.-]+\b/giu, "")
    .replace(/[^\p{L}\p{N}«»]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function collectRuntimeQuestCopy(): string[] {
  const adventureProblemIds = [
    ...ADVENTURE_PROBLEM_IDS,
    "race-human-ish-survey",
    "race-human-ish-mug",
    "race-human-ish-portrait",
    "class-bard-manual",
    "class-bard-uniform",
    "class-bard-exam",
    `title-${slugTitle(getKnownComboTitleValues()[0] ?? "Архівний Дух")}`
  ];
  const adventureCopy = adventureProblemIds.map((problemId) => {
    const scene = buildAdventureResolutionScene({
      problemId,
      title: problemId,
      character: bard
    });

    return [
      scene.sceneTitle,
      scene.sceneObject ?? "",
      scene.sceneObjectGenitive ?? "",
      ...scene.methods.flatMap((method) => [
        method.label,
        method.buttonLabel ?? "",
        method.hint,
        ...Object.values(method.outcomeText).flatMap((outcome) => [outcome.headline, ...outcome.body])
      ])
    ].join("\n");
  });
  const starterCopy = (["shawarma", "cellar-mouse"] as const).map((sceneId) => {
    const scene = buildStarterQuestResolutionScene(sceneId, bard);

    return [
      scene.sceneTitle,
      scene.sceneObject ?? "",
      ...scene.methods.flatMap((method) => [
        method.label,
        method.buttonLabel ?? "",
        method.hint,
        ...Object.values(method.outcomeText).flatMap((outcome) => [outcome.headline, ...outcome.body])
      ])
    ].join("\n");
  });

  return [...adventureCopy, ...starterCopy];
}

function activeOutcomeBody(method: {
  outcomeText: Record<string, { body: readonly string[] }>;
}): string {
  return Object.values(method.outcomeText)
    .flatMap((outcome) => outcome.body)
    .join("\n");
}
