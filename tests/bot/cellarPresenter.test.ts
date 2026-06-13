import { describe, expect, it } from "vitest";
import {
  presentCellarCooldown,
  presentCellarResult,
  presentCellarStart
} from "../../src/bot/presenters/cellarPresenter";
import type {
  CellarErrandLookupResult,
  CellarErrandResult
} from "../../src/services/cellarErrandService";

describe("cellar presenter", () => {
  it("renders a short cellar start scene with HTML quote", () => {
    const text = presentCellarStart(ready);

    expect(text).toContain("🐭 Підвальна справа");
    expect(text).toContain("<blockquote>");
    expect(text).toContain("що робимо?");
    expect(text.split("\n").length).toBeLessThanOrEqual(8);
  });

  it("adds character-aware flavor to cellar start and outcome scenes", () => {
    const domovyk = {
      ...character,
      raceId: "race.domovyk",
      raceName: "Домовик"
    };

    expect(presentCellarStart({ state: "ready", character: domovyk })).toContain(
      "законного, хоч і неоформленого"
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

    expect(text).toContain("&lt;b&gt;Мандрівник&lt;/b&gt;, що робимо?");
    expect(text).not.toContain("<b>Мандрівник</b>, що робимо?");
  });

  it("renders completed result with reward and no exact timestamp", () => {
    const text = presentCellarResult(completed);

    expect(text).toContain("🧀 Пастка спрацювала частково.");
    expect(text).toContain("<b>+2 XP · +1 золота</b>");
    expect(text).toContain("Підвал знову чекатиме за: 3 хвилини.");
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
    expect(text).not.toMatch(/\d+\s*(?:секунд|хвилин)\s+тому/i);
  });

  it("renders cooldown without exact timestamp", () => {
    const text = presentCellarCooldown(onCooldown);

    expect(text).toContain("🐭 Підвал тимчасово тихий.");
    expect(text).toContain("Можна повернутись за: 2 хвилини.");
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
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
  title: "Пересічні Герої",
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
    itemGrants: []
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
