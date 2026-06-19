import { describe, expect, it } from "vitest";
import {
  presentCellarCooldown,
  presentCellarGrownupQuest,
  presentCellarGrownupResult,
  presentCellarResult,
  presentCellarStart
} from "../../src/bot/presenters/cellarPresenter";
import type {
  CellarErrandLookupResult,
  CellarErrandResult
} from "../../src/services/cellarErrandService";
import type { CellarGrownupQuestLookupResult } from "../../src/services/cellarGrownupQuestService";

describe("cellar presenter", () => {
  it("renders a short cellar start scene with HTML quote", () => {
    const text = presentCellarStart(ready);

    expect(text).toContain("🐭 Льохова справа");
    expect(text).toContain("<blockquote>");
    expect(text).toContain("Миша:");
    expect(text).toContain("що робимо?");
    expect(text.split("\n").length).toBeLessThanOrEqual(13);
  });

  it("adds character-aware flavor to cellar start and outcome scenes", () => {
    const domovyk = {
      ...character,
      raceId: "race.domovyk",
      raceName: "Домовик"
    };

    expect(presentCellarStart({ state: "ready", character: domovyk })).toContain(
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

  it("escapes character names in cellar start text", () => {
    const text = presentCellarStart({
      state: "ready",
      character: {
        ...character,
        name: "<b>Мандрівник</b>"
      }
    });

    expect(text).toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>, що робимо?");
    expect(text).not.toContain("<b><b>Мандрівник</b></b>, що робимо?");
  });

  it("renders completed result with reward and no exact timestamp", () => {
    const text = presentCellarResult(completed);

    expect(text).toContain("🧀");
    expect(text).toContain("Миша оцінила командний підхід");
    expect(text).toContain("<i>Метод:</i> cheese-trap");
    expect(text).toContain("<b>+2 XP\n+1 золота</b>");
    expect(text).toContain("Здобуто: <i>Сир процедурного сумніву</i>");
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
  character,
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
