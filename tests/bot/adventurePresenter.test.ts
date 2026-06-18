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
  buildApproachOptions,
  type AdventureChoice,
  type AdventureProblemResult,
  type AdventureResult
} from "../../src/services/adventureService";

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
    expect(text).toContain("3. 🪖 <b>");
    expect(text).toContain("<i>Кухар &amp; свідок</i>\n\n2. 🛢️ <b>Бочка</b>");
  });

  it("presents selected problem approaches without exact reward or risk spoilers", () => {
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
    expect(text).toContain("Майже без драматичних зубів.");
    expect(text).toContain("Майже без драматичних зубів.\n\n🧠 Хитро");
    expect(text).toContain("Проблема може образитись.");
    expect(text).not.toContain("+4 XP");
    expect(text).not.toContain("+10 XP");
    expect(text).not.toContain("ризик 13%");
    expect(text).not.toContain("ризик 42%");
  });

  it("keeps approach hints lowercase after the dash", () => {
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

    expect(text).toContain("🛡️ Обережно розібратись — менше винагороди");
    expect(text).toContain("🧠 Знайти хитрий кут — середня винагорода");
    expect(text).toContain("🔥 Зробити красиво й небезпечно — більша винагорода");
    expect(text).not.toContain("— Менше винагороди");
    expect(text).not.toContain("— Середня винагорода");
    expect(text).not.toContain("— Більша винагорода");
  });

  it("shows non-complicated reward without level-up text", () => {
    const text = presentAdventureResult(completed(false));

    expect(text).toContain("✅ Справу закрито");
    expect(text).toContain("<b>+7 XP\n+4 золота</b>");
    expect(text).not.toContain("Рівень підріс");
  });

  it("shows complication-to-fight copy without granting reward", () => {
    const text = presentAdventureResult(completed(true));

    expect(text).toContain("Справа вкусила у відповідь");
    expect(text).toContain("метод <i>🧠 Хитро</i>");
    expect(text).not.toContain("метод «");
    expect(text).toContain("Нагорода не видана");
    expect(text).toContain("без заперечень.\n\nНагорода не видана");
    expect(text).not.toContain("+7 XP");
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
      reward: { xp: 7, gold: 4 },
      complicationChance: 23
    },
    complication,
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
