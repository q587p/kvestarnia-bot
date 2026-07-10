import { describe, expect, it } from "vitest";
import {
  CELLAR_GROWNUP_ROLEPLAY_FAILURE_VARIANTS,
  presentCellarCooldown,
  presentCellarGrownupQuest,
  presentCellarIntro,
  presentCellarMethodHelp,
  presentCellarGrownupResult,
  presentCellarResult,
  selectCellarGrownupRoleplayFailureVariant,
  presentCellarStart
} from "../../src/bot/presenters/cellarPresenter";
import type {
  CellarErrandLookupResult,
  CellarErrandResult
} from "../../src/services/cellarErrandService";
import type {
  CellarGrownupQuestLookupResult,
  CellarGrownupQuestResult
} from "../../src/services/cellarGrownupQuestService";

describe("cellar presenter", () => {
  it("renders cellar intro as a separate scene header", () => {
    const text = presentCellarIntro(ready);

    expect(text).toContain("Корчмар показує на люк під баром.");
    expect(text).toContain("<blockquote>");
    expect(text).toContain("Корчмар:");
    expect(text).toContain("Миша:");
    expect(text).not.toContain("🐭 Льохова справа");
    expect(text).not.toContain("Можливі способи");
    expect(text).not.toContain("що робимо?");
  });

  it("renders cellar start action card with a compact method list", () => {
    const text = presentCellarStart(ready);

    expect(text).toContain("🐭 Льохова справа");
    expect(text).not.toContain("<blockquote>");
    expect(text).not.toContain("Корчмар показує на люк");
    expect(text).toContain("<i>Замовник:</i> миша з табличкою");
    expect(text).toContain("<i>Проблема:</i> льохова автономія");
    expect(text).toContain("<i>Ціль:</i> домовитися з норою");
    expect(text).toContain("<i>Можливі способи:</i>");
    expect(text).not.toContain("🧀 Поставити пастку по маршруту крихт");
    expect(text).not.toContain("Пастка й сліди. Винагорода звичайна. Можна постраждати.");
    expect(text).not.toContain("🪙 Дати миші 1 золоту «на сирний фонд»");
    expect(text).not.toContain("Винагорода скромніша. Коштує 1 золото.");
    expect(text).not.toMatch(/Шанси \d|Підпис методу|race\+class/u);
    expect(text).not.toContain("що робимо?");
    expect(text.trim().endsWith("<i>Можливі способи:</i>")).toBe(true);
    expect(text.indexOf("<i>Ціль:</i>")).toBeLessThan(text.indexOf("<i>Можливі способи:</i>"));
    expect(text.split("\n").length).toBeLessThanOrEqual(28);
  });

  it("renders cellar method help separately", () => {
    const text = presentCellarMethodHelp(ready);

    expect(text).toContain("Детальніше про способи:");
    expect(text).toContain("🧀 Поставити пастку по маршруту крихт");
    expect(text).toContain("<i>Пастка й сліди. Винагорода звичайна. Можна постраждати.</i>");
    expect(text).toContain("🪙 Дати миші 1 золоту «на сирний фонд»");
    expect(text).toContain("<i>Винагорода скромніша. Коштує 1 золото.</i>");
    expect(text).not.toContain("що робимо?");
  });

  it("omits cellar combo title prefix from the start action card", () => {
    const text = presentCellarStart({
      state: "ready",
      character: {
        ...character,
        raceId: "race.intellectual-orc",
        raceName: "Орк-інтелігент",
        classId: "class.mage",
        className: "Маг",
        title: "Кандидати Бойових Наук"
      }
    });

    expect(text).not.toContain("Кандидати Бойових Наук у льосі.");
    expect(text).not.toContain("Шахтна Іскрознавиця у льосі.");
    expect(text).toContain("Мишача позиція отримує шанс бути розібраною етично й дуже переконливо.");
  });

  it("adds character-aware flavor to cellar start and outcome scenes", () => {
    const domovyk = {
      ...character,
      raceId: "race.domovyk",
      raceName: "Домовик"
    };

    expect(presentCellarIntro({ state: "ready", character: domovyk })).toContain(
      "не плутати мою автономію з вашим житловим фондом"
    );
    expect(
      presentCellarResult({
        ...completed,
        action: "negotiate",
        character: domovyk
      })
    ).toContain("автономію за шафою");
  });

  it("does not render the old character prompt in cellar start text", () => {
    const text = presentCellarStart({
      state: "ready",
      character: {
        ...character,
        name: "<b>Мандрівник</b>"
      }
    });

    expect(text).not.toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>, що робимо?");
    expect(text).not.toContain("<b><b>Мандрівник</b></b>, що робимо?");
    expect(text).not.toContain("що робимо?");
  });

  it("renders completed result with reward and no exact timestamp", () => {
    const text = presentCellarResult(completed);

    expect(text).toContain("🧀");
    expect(text).toContain("Миша оцінила командний підхід");
    expect(text).toContain("<i>Метод:</i> cheese-trap");
    expect(text).toContain("💔 Втрачено здоров’я: 2");
    expect(text).toContain("❤️‍🩹 Здоров’я: 18/20");
    expect(text).not.toContain("\nВтрачено здоров’я: 2");
    expect(text).toContain("<i>Отримано:</i>");
    expect(text).toContain("+2 XP\n+1 золота");
    expect(text).toContain("Здобуто: <i>Сир процедурного сумніву</i>");
    expect(text).not.toContain("Підпис методу");
    expect(text).not.toContain("race+class");
    expect(text).toContain("Льох знову чекатиме за 3 хвилини.");
    expect(text).not.toContain("за:");
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
    expect(text).not.toMatch(/\d+\s*(?:секунд|хвилин)\s+тому/i);
  });

  it("changes mouse outcomes by race, class, and pronoun", () => {
    const bisynyTrap = presentCellarResult({
      ...completed,
      character: {
        ...character,
        raceId: "race.bisyny",
        raceName: "Бісини"
      }
    });
    const mageSweep = presentCellarResult({
      ...completed,
      action: "sweep-bravely",
      character: {
        ...character,
        classId: "class.mage",
        className: "Маг"
      }
    });
    const heroineSweep = presentCellarResult({
      ...completed,
      action: "sweep-bravely",
      character: {
        ...character,
        pronoun: "she",
        pronounLabel: "Вона",
        classId: "class.priest",
        className: "Жрець"
      }
    });

    expect(bisynyTrap).toContain("термінологію");
    expect(mageSweep).toContain("прогноз");
    expect(heroineSweep).toContain("Пригодниця");
  });

  it("renders cooldown without exact timestamp", () => {
    const text = presentCellarCooldown(onCooldown);

    expect(text).toContain("🐭 Льох тимчасово тихий.");
    expect(text).toContain("Можна повернутись за 2 хвилини.");
    expect(text).not.toContain("за:");
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("renders completed grownup cellar as a closed archive, not an active errand", () => {
    const text = presentCellarGrownupQuest({
      state: "completed",
      character: {
        ...character,
        level: 4
      },
      ending: "keep",
      reward: {
        xp: 40,
        gold: 0
      }
    } satisfies Extract<CellarGrownupQuestLookupResult, { state: "completed" }>);

    expect(text).toContain("✅ Доросла льохова справа вже закрита.");
    expect(text).toContain("Льох визнав це фіналом");
    expect(text).toContain("Далі краще повернутися до столу справ або зали.");
    expect(text).not.toContain("Що робимо?");
  });

  it("explains active grownup roleplay cooldown on unaffordable seal results", () => {
    const text = presentCellarGrownupResult({
      state: "insufficient-gold",
      character: {
        ...character,
        level: 4,
        gold: 5
      },
      price: 240,
      roleplayCooldown: {
        availableAt: new Date("2026-06-13T11:33:00.000Z"),
        now
      }
    });

    expect(text).toContain("Потрібно 240 золота. У вас — 5.");
    expect(text).toContain("Домовлятися можна буде за 93 хвилини.");
    expect(text).not.toContain("спробуйте домовитись із мишею");
  });

  it("renders varied grownup mouse roleplay failure copy", () => {
    const bodies = new Set(CELLAR_GROWNUP_ROLEPLAY_FAILURE_VARIANTS.map((variant) => variant.body));
    const quotes = new Set(CELLAR_GROWNUP_ROLEPLAY_FAILURE_VARIANTS.map((variant) => variant.quote));
    const seenQuotes = new Set<string>();

    expect(CELLAR_GROWNUP_ROLEPLAY_FAILURE_VARIANTS).toHaveLength(13);
    expect(bodies.size).toBe(13);
    expect(quotes.size).toBe(13);

    for (let index = 0; index < 400; index += 1) {
      seenQuotes.add(
        selectCellarGrownupRoleplayFailureVariant({
          ...grownupRoleplayFailed,
          availableAt: new Date(grownupRoleplayFailed.availableAt.getTime() + index * 60_000)
        }).quote
      );
    }

    const selected = selectCellarGrownupRoleplayFailureVariant(grownupRoleplayFailed);
    const text = presentCellarGrownupResult(grownupRoleplayFailed);

    expect(seenQuotes.size).toBe(13);
    expect(text).toContain(selected.body);
    expect(text).toContain(selected.quote);
    expect(text).toContain("Спробувати так само можна за 93 хвилини.");
  });

  it("sends the obtained grownup cellar bottle to the Шинок instead of resolving it in the cellar", () => {
    const lookupText = presentCellarGrownupQuest({
      state: "bottle-obtained",
      character: {
        ...character,
        level: 4
      },
      bottleQuantity: 1
    } satisfies Extract<CellarGrownupQuestLookupResult, { state: "bottle-obtained" }>);
    const resultText = presentCellarGrownupResult({
      state: "bottle-obtained",
      character: {
        ...character,
        level: 4
      },
      source: "roleplay",
      reward: {
        itemGrants: [
          {
            itemId: "item.cellar.foamy-mirage-bottle",
            name: "Пляшка Пінного Міражу",
            quantity: 1
          }
        ]
      }
    });

    expect(lookupText).toContain("Пляшку можна здати Корчмарю в шинку.");
    expect(resultText).toContain("Заберіть її з собою");
    expect(resultText).toContain("Корчмар приймає такі речі в шинку");
    expect(resultText).not.toContain("здати Корчмарю або лишити собі");
  });
});

const character = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Пригодники",
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
    primaryStat: {
      stat: "strength",
      bonus: 0
    }
  }
} as const;

const now = new Date("2026-06-13T10:00:00.000Z");

const ready: Extract<CellarErrandLookupResult, { state: "ready" }> = {
  state: "ready",
  character
};

const completed: Exclude<CellarErrandResult, { state: "no-character" }> = {
  state: "completed",
  action: "cheese-trap",
  character: {
    ...character,
    hpCurrent: 18
  },
  reward: {
    xp: 2,
    gold: 1,
    itemGrants: [
      {
        itemId: "item.cheese-of-procedural-doubt",
        name: "Сир процедурного сумніву",
        quantity: 1
      }
    ]
  },
  hpLoss: {
    lost: 2,
    before: 20,
    after: 18,
    max: 20
  },
  availableAt: new Date("2026-06-13T10:03:00.000Z"),
  now,
  levelChange: {
    oldLevel: 1,
    newLevel: 1,
    leveledUp: false
  }
};

const onCooldown: Extract<CellarErrandLookupResult, { state: "on-cooldown" }> = {
  state: "on-cooldown",
  character,
  availableAt: new Date("2026-06-13T10:02:00.000Z"),
  now
};

const grownupRoleplayFailed: Extract<CellarGrownupQuestResult, { state: "roleplay-failed" }> = {
  state: "roleplay-failed",
  character: {
    ...character,
    level: 4
  },
  availableAt: new Date("2026-06-13T11:33:00.000Z"),
  now,
  chance: 0.05
};
