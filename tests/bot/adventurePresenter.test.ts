import { describe, expect, it } from "vitest";
import {
  presentAdventureAlreadyCompleted,
  presentAdventureLevelLocked,
  presentAdventureOffer,
  presentAdventureProblem,
  presentAdventureResult
} from "../../src/bot/presenters/adventurePresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import {
  buildAdventureMethodOptions,
  buildApproachOptions,
  type AdventureChoice,
  type AdventureProblemResult,
  type AdventureResult
} from "../../src/services/adventureService";
import { buildAdventureResolutionScene } from "../../src/content/adventureResolutionContent";

const character: CharacterSummary = {
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
};

const choice: AdventureChoice = {
  id: "stew",
  title: "Казанок <репетирує>",
  hook: "Юшка вимагає «райдер» і ложку.",
  client: "Кухар & свідок"
};

describe("adventure presenter", () => {
  it("shows three offered choices and escapes player/content HTML", () => {
    const text = presentAdventureOffer({
      state: "ready",
      character: {
        ...character,
        name: "<b>Мандрівник</b>"
      },
      offer: {
        localDate: "2026-06-12",
        periodToken: "period93",
        expiresAt: new Date("2026-06-12T11:23:00.000Z"),
        choices: [
          choice,
          { id: "barrel", title: "Бочка", hook: "Вимагає угоду.", client: "Корчмар" },
          { id: "helmet", title: "Шолом", hook: "Просить овацій.", client: "Зброяр" }
        ]
      }
    });

    expect(text).toContain("🪧 Три справи на найближчий час");
    expect(text).toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>");
    expect(text).toContain("1. 🍲 <b>Казанок &lt;репетирує&gt;</b>");
    expect(text).toContain("Кухар &amp; свідок");
    expect(text).not.toContain("Юшка вимагає");
    expect(text).not.toContain("Корчмар виклав");
    expect(text).not.toContain("Оберіть одну справу");
    expect(text).toContain("3. 🪖 <b>");
    expect(text).toContain("<i>Кухар &amp; свідок</i>\n\n2. 🛢️ <b>Бочка</b>");
  });

  it("presents selected problem without reward or exact odds spoilers", () => {
    const result: Extract<AdventureProblemResult, { state: "selected" }> = {
      state: "selected",
      character,
      offer: {
        localDate: "2026-06-12",
        periodToken: "period93",
        expiresAt: new Date("2026-06-12T11:23:00.000Z"),
        choices: [choice]
      },
      choice,
      approaches: [
        {
          id: "safe",
          label: "🛡️ Обережно",
          hint: "Майже без драматичних зубів.",
          reward: { xp: 4, gold: 2 },
          complicationChance: 13
        },
        {
          id: "flair",
          label: "🧠 Хитро",
          hint: "Середній ризик.",
          reward: { xp: 7, gold: 4 },
          complicationChance: 23
        },
        {
          id: "risky",
          label: "🔥 Небезпечно",
          hint: "Проблема може образитись.",
          reward: { xp: 10, gold: 7 },
          complicationChance: 42
        }
      ]
    };
    const text = presentAdventureProblem(result);

    expect(text).toContain("Казанок &lt;репетирує&gt;");
    expect(text).toContain("Можливі способи:\n\n🛡️ Обережно");
    expect(text).toContain("Метод оберіть самі.");
    expect(text).toContain("🛡️ Обережно");
    expect(text).toContain("Майже без драматичних зубів.");
    expect(text).not.toContain("🧠 Хитро — Середній ризик.");
    expect(text).not.toContain("+4 XP");
    expect(text).not.toContain("+10 XP");
    expect(text).not.toContain("ризик 13%");
    expect(text).not.toContain("ризик 42%");
  });

  it("does not print the approach reward ladder on the selected problem screen", () => {
    const result: Extract<AdventureProblemResult, { state: "selected" }> = {
      state: "selected",
      character,
      offer: {
        localDate: "2026-06-12",
        periodToken: "period93",
        expiresAt: new Date("2026-06-12T11:23:00.000Z"),
        choices: [choice]
      },
      choice,
      approaches: buildApproachOptions(character)
    };
    const text = presentAdventureProblem(result);

    expect(text).not.toContain("🛡️ Обережно розібратись — менше винагороди");
    expect(text).not.toContain("🧠 Знайти хитрий кут — середня винагорода");
    expect(text).not.toContain("🔥 Зробити красиво й небезпечно — більша винагорода");
    expect(text).not.toContain("винагороди");
    expect(text).not.toContain("шанс ускладнення");
    expect(text).not.toContain("— Менше винагороди");
    expect(text).not.toContain("— Середня винагорода");
    expect(text).not.toContain("— Більша винагорода");
  });

  it("separates authored methods and hides internal method source labels", () => {
    const bard = {
      ...character,
      raceId: "race.dryland-rusalka",
      raceName: "Русалка сухопутна",
      classId: "class.bard",
      className: "Бард",
      title: "Співачка Без Моря"
    };
    const uniformChoice = {
      id: "class-bard-uniform",
      title: "Форма для «Барда» не влазить у клітинку",
      hook: "У бланку професій для «Барда» лишилася надто мала клітинка.",
      client: "Клітинка"
    };
    const result: Extract<AdventureProblemResult, { state: "selected" }> = {
      state: "selected",
      character: bard,
      offer: {
        localDate: "2026-06-12",
        periodToken: "period93",
        expiresAt: new Date("2026-06-12T11:23:00.000Z"),
        choices: [uniformChoice]
      },
      choice: uniformChoice,
      approaches: buildAdventureMethodOptions(uniformChoice, bard)
    };

    const text = presentAdventureProblem(result);

    expect(text).toContain("Підсунути запасне поле");
    expect(text).toContain("Домовитися з канцелярським краєм");
    expect(text).not.toContain("Підняти сухий приплив для");
    expect(text).not.toContain("Переспівати ритм");
    expect(text).not.toContain("«Співачка Без Моря» поєднує");
    expect(text).toContain("Особистий варіант.");
    expect(text).toContain("Професійний варіант.");
    expect(text).not.toContain("Особистий підхід героя.");
    expect(text).not.toContain("Професійний підхід героя.");
    expect(text).not.toContain("Надійне розслідування. Майже надійно.");
    expect(text).not.toContain("Надійне розслідування. майже надійно.");
    expect(text).not.toContain("Расовий спосіб");
    expect(text).not.toContain("Класова техніка");
    expect(text).not.toContain("race+class");
    expect(text).not.toContain("точну біографію");
    expect(text).not.toContain(": форму");
    expect(text).toContain("</i>\n\n");
    expect(text.match(/<i>/gu)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("shows non-complicated reward without level-up text", () => {
    const text = presentAdventureResult(completed(false));

    expect(text).toContain("✅ Справу закрито");
    expect(text).toContain("Винагорода за справу:");
    expect(text).toContain("\n\nВинагорода за справу:\n<b>+7 XP\n+4 золота</b>");
    expect(text.indexOf("Казанок &lt;репетирує&gt;")).toBeLessThan(text.indexOf("<i>Метод:</i> 🧠 Хитро"));
    expect(text.indexOf("<i>Метод:</i> 🧠 Хитро")).toBeLessThan(text.indexOf("без заперечень."));
    expect(text).not.toContain("Підпис методу");
    expect(text).not.toContain("race+class");
    expect(text).not.toContain("Рівень підріс");
  });

  it("keeps generated strong-success scene outcomes neutral for plural titles", () => {
    const scene = buildAdventureResolutionScene({
      problemId: "boots",
      title: "Чоботи пішли без власника",
      character
    });
    const method = scene.methods.find((candidate) => candidate.id === "track-soles");

    expect(method?.outcomeText["strong-success"].body.join("\n")).toContain("Деталь «маршрут підошов»");
    expect(method?.outcomeText["strong-success"].body.join("\n")).not.toContain("Прочитати маршрут підошов.");
    expect(method?.outcomeText["strong-success"].body.join("\n")).not.toContain("у чоботи");
    expect(method?.outcomeText["strong-success"].body.join("\n")).not.toContain("перестає сперечатися");
  });

  it("shows complication-to-fight copy without granting reward", () => {
    const text = presentAdventureResult(completed(true));

    expect(text).toContain("Справа вкусила у відповідь");
    expect(text).toContain("<i>Метод:</i> 🧠 Хитро");
    expect(text).not.toContain("метод «");
    expect(text).not.toContain("Винагорода за справу:");
    expect(text).toContain("Нагорода не видана");
    expect(text).toContain("без заперечень.");
    expect(text).not.toContain("+7 XP");
  });

  it("shows bounded HP loss only when a quest injury happened", () => {
    const result = {
      ...completed(false),
      character: {
        ...character,
        hpCurrent: 17
      },
      hpLoss: {
        before: 20,
        max: 28,
        lost: 3,
        after: 17
      }
    };
    const text = presentAdventureResult(result);

    expect(text).toContain("Втрачено здоров’я: 3");
    expect(text).toContain("Здоров’я: 17/28");
  });

  it("uses the returned character summary for the current HP line after injury", () => {
    const result = {
      ...completed(false),
      character: {
        ...character,
        hpCurrent: 17,
        hpMax: 32
      },
      hpLoss: {
        before: 20,
        max: 28,
        lost: 3,
        after: 17
      }
    };
    const text = presentAdventureResult(result);

    expect(text).toContain("Втрачено здоров’я: 3");
    expect(text).toContain("Здоров’я: 17/32");
    expect(text).not.toContain("Здоров’я: 17/28");
  });

  it("does not imply duplicate rewards for already-completed adventure", () => {
    const text = presentAdventureAlreadyCompleted();

    expect(text).toContain("уже закрито");
    expect(text).not.toContain("+7 XP");
  });

  it("keeps level gate copy short", () => {
    expect(
      presentAdventureLevelLocked({
        state: "level-locked",
        character,
        requiredLevel: 3
      })
    ).toContain("відкриється з 3 рівня");
  });
});

function completed(complication: boolean): Extract<AdventureResult, { state: "completed" }> {
  return {
    state: "completed",
    character,
    choice,
    approach: {
      id: "flair",
      label: "🧠 Хитро",
      hint: "Середній ризик.",
      chanceHint: "непевно",
      reward: { xp: 7, gold: 4 },
      source: "scene",
      primaryStat: "charisma",
      consequenceByGrade: {
        "strong-success": "full-reward",
        success: "full-reward",
        "mixed-success": "reduced-reward",
        complication: complication ? "fight-handoff" : "cosmetic-mess"
      }
    },
    grade: complication ? "complication" : "success",
    consequence: complication ? "fight-handoff" : "full-reward",
    outcome: {
      headline: complication ? "⚠️ Справа вкусила у відповідь" : "✅ Справу закрито",
      body: [
        choice.title,
        "",
        complication
          ? "Сцена не прийняла метод без заперечень."
          : "Сцена погодилась бути вирішеною без заперечень."
      ]
    },
    spentGold: 0,
    hpLoss: null,
    fightHandoff: complication,
    fightEncounter: complication ? { monsterId: "monster.borshch-slime" } : null,
    complication,
    check: {
      chance: 55,
      roll: complication ? 99 : 12,
      grade: complication ? "complication" : "success"
    },
    reward: {
      xp: complication ? 0 : 7,
      gold: complication ? 0 : 4,
      localDate: "2026-06-12",
      itemGrants: []
    },
    levelChange: {
      oldLevel: 3,
      newLevel: 3,
      leveledUp: false
    }
  };
}
