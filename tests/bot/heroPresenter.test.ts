import { describe, expect, it } from "vitest";
import { presentHero, presentHeroMissing } from "../../src/bot/presenters/heroPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

const summary: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  currentLocationId: "location.korchma.cellar",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 2,
  xp: 15,
  nextLevelXp: 25,
  xpToNextLevel: 10,
  gold: 12,
  hpCurrent: 24,
  hpMax: 24,
  manaCurrent: 12,
  manaMax: 12,
  stats: {
    strength: 9,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 4,
    manaMax: 2,
    primaryStat: {
      stat: "strength",
      bonus: 1
    }
  }
};

describe("hero presenter", () => {
  it("shows race, class, stats, and a next step for an existing character", () => {
    const text = presentHero(summary);

    expect(text).toContain("<b>Мандрівник</b>");
    expect(text).toContain("<i>Людисько · Воїн</i>");
    expect(text).toContain("Людисько");
    expect(text).toContain("Воїн");
    expect(text).not.toContain("Звертання:");
    expect(text).not.toContain("Стать:");
    expect(text).toContain("Титул: <i>Пересічний Пригодник</i>");
    expect(text).toContain("Титул: <i>Пересічний Пригодник</i>\n\nРівень");
    expect(text).toContain("Рівень <b>2</b> · XP 15 · до наступного: 10 XP");
    expect(text).not.toContain("до рівня 3");
    expect(text).not.toContain("XP 15 · до наступного: 10 XP · золото");
    expect(text).toContain(
      "Рівень <b>2</b> · XP 15 · до наступного: 10 XP\nЗміна: +4 HP · +2 мани · +1 Спритності\n\n❤️ HP 24/24"
    );
    expect(text).toContain("❤️ HP 24/24 · 🔮 мана 12/12");
    expect(text).toContain("Сили 9");
    expect(text).toContain("Вдача 6");
    expect(text).not.toContain("Ріст рівня:");
    expect(text).not.toContain("Ріст:");
    expect(text).toContain(
      "\n\n👛 Золото: <b>12</b> <i>(а в манатках ще 0; торба чесна, аж нудно)</i>\n\nЗараз пригодник тут:"
    );
    expect(text).toContain("\n\nЗараз пригодник тут: <b>Льох корчми</b>.");
    expect(text).toContain("<i>Далі: /tavern, /quest або /fight.</i>");
    expect(text).not.toContain("/adventure або /fight");
    expect(text).toContain("\n\nТитул:");
    expect(text).toContain("\n\n❤️ HP");
    expect(text.split("\n").length).toBeLessThanOrEqual(18);
  });

  it("adds a short rest hint when the hero is at zero HP", () => {
    const text = presentHero({
      ...summary,
      hpCurrent: 0,
      hpMax: 24,
      resourceRecovery: {
        hpSecondsToFull: 600,
        manaSecondsToFull: 0
      }
    });

    expect(text).toContain("Відновлення: HP за ~10 хв");
    expect(text).toContain("Стан: HP 0 — спершу відпочиньте, тоді /fight.");
    expect(text).toContain(
      "Відновлення: HP за ~10 хв\nСтан: HP 0 — спершу відпочиньте, тоді /fight.\n\nСили 9"
    );
  });

  it("separates recovery timing from stats for readability", () => {
    const text = presentHero({
      ...summary,
      hpCurrent: 10,
      hpMax: 24,
      resourceRecovery: {
        hpSecondsToFull: 600,
        manaSecondsToFull: 0
      }
    });

    expect(text).toContain("❤️ HP 10/24 · 🔮 мана 12/12");
    expect(text).toContain("Відновлення: HP за ~10 хв\n\nСили 9");
  });

  it("shows inventory value next to carried gold", () => {
    const text = presentHero(summary, { inventoryGoldValue: 28 });

    expect(text).toContain("👛 Золото: <b>12</b>");
    expect(text).toContain("а в манатках ще 28");
    expect(text).toContain("корчмар уже примружився");
  });

  it("shows equipment contributions without hiding level growth", () => {
    const text = presentHero({
      ...summary,
      hpCurrent: 26,
      hpMax: 26,
      stats: {
        ...summary.stats,
        luck: 7
      },
      equipmentEffects: {
        hpMax: 2,
        manaMax: 0,
        armor: 1,
        resist: 0,
        weaponDamage: 2,
        spellPower: 0,
        stats: {
          strength: 0,
          dexterity: 0,
          intelligence: 0,
          charisma: 0,
          luck: 1
        },
        contributions: []
      }
    });

    expect(text).toContain("❤️ HP 26/26");
    expect(text).toContain("🎒 Манатки: +2 HP · +1 Вдачі");
    expect(text).toContain("🛡️ Захист спорядження: +1 до захисту");
    expect(text).toContain("🗡️ Зброя: +2 до удару");
    expect(text).toContain("Зміна: +4 HP · +2 мани · +1 Спритності");
  });

  it("shows remort memory without exposing a public x/5 scale", () => {
    const text = presentHero({
      ...summary,
      remortCount: 2,
      remortMemoryRank: 2
    });

    expect(text).toContain("🕯️ Памʼять минулих пригод: <b>2</b>");
    expect(text).not.toContain("Ремортів: <b>2</b> · Памʼять");
    expect(text).not.toContain("памʼять <b>2</b>/5");
    expect(text).not.toContain("2</b>/5");
  });


  it("uses distinct wealth jokes when gold or inventory value is zero", () => {
    const emptyHero = presentHero({ ...summary, gold: 0 }, { inventoryGoldValue: 0 });
    const itemRichHero = presentHero({ ...summary, gold: 0 }, { inventoryGoldValue: 28 });

    expect(emptyHero).toContain(
      "👛 Золото: <b>0</b> <i>(і в манатках ще 0; корчмар поставив риску в графі «надії»)</i>"
    );
    expect(emptyHero).not.toContain("корчмар уже примружився");
    expect(itemRichHero).toContain(
      "👛 Золото: <b>0</b> <i>(золота 0, зате в манатках ще 28; корчмар примружився на майбутню бухгалтерію)</i>"
    );
  });

  it("shows alpha cap wording at the current level cap", () => {
    const text = presentHero({
      ...summary,
      level: 10,
      xp: 425,
      nextLevelXp: null,
      xpToNextLevel: null
    });

    expect(text).toContain("ви дійшли до краю поточної гри");
    expect(text).not.toContain("до рівня 11");
  });

  it("hides starter command hint after reaching level three", () => {
    const text = presentHero({
      ...summary,
      level: 3,
      xp: 25,
      nextLevelXp: 45,
      xpToNextLevel: 20
    });

    expect(text).not.toContain("Далі: /tavern, /quest або /fight.");
  });

  it("prompts /start when the character does not exist", () => {
    expect(presentHeroMissing()).toContain("/start");
  });
});
