import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows race, class, stats, and a next step for an existing character", () => {
    const text = presentHero(summary);

    expect(text).toContain("<b>Мандрівник</b>");
    expect(text).toContain("<i>Людисько · Воїн</i>");
    expect(text).toContain("Людисько");
    expect(text).toContain("Воїн");
    expect(text).not.toContain("Звертання:");
    expect(text).not.toContain("Стать:");
    expect(text).toContain("Титул: <i>Пересічний Пригодник</i>");
    expect(text).not.toContain("Косметичний титул:");
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
    expect(text).toContain("\n\n👛 Золото: <b>12</b>\n\nЗараз пригодник тут:");
    expect(text).not.toContain("манатках ще 0");
    expect(text).toContain("\n\nЗараз пригодник тут: <b>Льох корчми</b>.");
    expect(text).toContain("<i>Далі: /tavern, /quest або /fight.</i>");
    expect(text).not.toContain("/adventure або /fight");
    expect(text).toContain("\n\nТитул:");
    expect(text).toContain("\n\n❤️ HP");
    expect(text.split("\n").length).toBeLessThanOrEqual(18);
  });

  it("shows the Sated effect with bold values and no embedded recovery notice", () => {
    const text = presentHero(summary, {
      activeVarenykSated: {
        activationId: "sated",
        rank: 3,
        expiresAt: new Date("2026-06-23T10:13:00.000Z")
      }
    });

    expect(text).toContain("😋 Стан: <b>Ситий</b> ще <b>13 хв</b> — <b>+2 HP</b> і <b>+2 мани</b> щохвилини поза боєм або кожен хід в бою (це забирає хвилину дії).");
    expect(text).not.toContain("ранг <b>3</b>");
    expect(text).not.toContain("Ситість відновила");
  });

  it("shows Inspiration through the same bold timed-status shape", () => {
    const text = presentHero(summary, {
      activeBardInspiration: {
        accuracyBonusPp: 1,
        expiresAt: new Date("2026-06-23T10:13:00.000Z")
      }
    });

    expect(text).toContain(
      "❤️ HP 24/24 · 🔮 мана 12/12\n\n✨ Стан: <b>Натхнення</b> ще <b>13 хв</b> — <b>+1</b> до влучання.\n\nСили 9"
    );
    expect(text).not.toContain("<b>Натхнення</b>:");
  });

  it("shows the recipient wait without calling an expired status active", () => {
    const text = presentHero(summary, {
      activeVarenykSated: {
        activationId: "expired-sated",
        rank: 3,
        expiresAt: new Date("2026-06-23T10:00:00.000Z")
      },
      varenykSatedAvailableAt: new Date("2026-06-23T11:33:00.000Z")
    });

    expect(text).toContain("🍽️ Нагодувати знову через <b>93 хв</b>");
    expect(text).not.toContain("😋 <b>Ситий</b>");
  });

  it("shows an active cosmetic title separately from the generated title", () => {
    const text = presentHero(summary, {
      activeCosmeticTitle: "Де тут вихід?"
    });

    expect(text).toContain("Титул: <i>Пересічний Пригодник</i>");
    expect(text).toContain("🏷️ Косметичний титул: <i>Де тут вихід?</i>");
    expect(text).toContain("Титул: <i>Пересічний Пригодник</i>\n🏷️ Косметичний титул:");
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
    expect(text).toContain("Стан: HP 0 — спершу відпочиньте; бій дочекається хоча б 1 HP.");
    expect(text).toContain(
      "Відновлення: HP за ~10 хв\nСтан: HP 0 — спершу відпочиньте; бій дочекається хоча б 1 HP.\n\nСили 9"
    );
    expect(text).not.toContain("/fight");
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

  it("shows the active Shynok buff below HP and mana", () => {
    const text = presentHero(summary, {
      activeDrink: {
        key: "drink.fine-beer",
        name: "Якісне <пиво>",
        emoji: "🍻",
        phase: "timed",
        startedAt: new Date("2026-06-23T10:00:00.000Z"),
        expiresAt: new Date("2026-06-23T10:42:00.000Z"),
        recoveryMultiplierBp: 14200,
        accuracyPenaltyPp: 10
      }
    });

    expect(text).toContain(
      "❤️ HP 24/24 · 🔮 мана 12/12\n\n🍻 Баф: <b>Якісне &lt;пиво&gt;</b> ще <b>42 хв</b> — відновлення швидше на <b>42%</b>, точність <b>−10</b>.\n\nСили 9"
    );
  });

  it.each([
    ["drink.thyme-tea", "Чай із чебрецем", "🍵", 42, 11300, undefined, "відновлення швидше на <b>13%</b>"],
    ["drink.simple-beer", "Просте пиво", "🍺", 23, 12300, 5, "відновлення швидше на <b>23%</b>, точність <b>−5</b>"]
  ] as const)("bolds active drink duration and modifiers for %s", (
    key,
    name,
    emoji,
    minutes,
    recoveryMultiplierBp,
    accuracyPenaltyPp,
    effect
  ) => {
    const text = presentHero(summary, {
      activeDrink: {
        key,
        name,
        emoji,
        phase: "timed",
        startedAt: new Date("2026-06-23T10:00:00.000Z"),
        expiresAt: new Date(`2026-06-23T10:${minutes}:00.000Z`),
        recoveryMultiplierBp,
        ...(accuracyPenaltyPp ? { accuracyPenaltyPp } : {})
      }
    });

    expect(text).toContain(`${emoji} Баф: <b>${name}</b> ще <b>${minutes} хв</b> — ${effect}.`);
  });

  it("shows the active Priest blessing near other timed statuses", () => {
    const text = presentHero(summary, {
      activePriestBlessing: {
        actorName: "Мандрівник",
        targetName: "Мандрівник",
        expiresAt: new Date("2026-06-23T10:13:00.000Z"),
        bonusStat: "luck",
        bonusAmount: 1
      }
    });

    expect(text).toContain(
      "❤️ HP 24/24 · 🔮 мана 12/12\n\n✨ Стан: <b>Жрецьке благословення</b> ще <b>13 хв</b> — дає <b>+1 Вдачі</b>.\n\nСили 9"
    );
    expect(text).not.toContain("не складається в стос");
  });

  it("shows Shynok and Priest timed statuses together", () => {
    const text = presentHero(summary, {
      activeDrink: {
        key: "drink.fine-beer",
        name: "Якісне пиво",
        emoji: "🍻",
        phase: "timed",
        startedAt: new Date("2026-06-23T10:00:00.000Z"),
        expiresAt: new Date("2026-06-23T10:42:00.000Z"),
        recoveryMultiplierBp: 14200
      },
      activePriestBlessing: {
        actorName: "Мандрівник",
        targetName: "Мандрівник",
        expiresAt: new Date("2026-06-23T10:13:00.000Z"),
        bonusStat: "luck",
        bonusAmount: 1
      }
    });

    expect(text).toContain(
      "<b>Стани:</b>\n🍻 <b>Якісне пиво</b> ще <b>42 хв</b> — відновлення швидше на <b>42%</b>.\n✨ <b>Жрецьке благословення</b> ще <b>13 хв</b>"
    );
    expect(text).not.toContain("<b>Стани:</b>\n🍻 Баф:");
    expect(text).not.toContain("<b>Стани:</b>\n✨ Стан:");
  });

  it("groups multiple active class states under one heading without repeated labels", () => {
    const text = presentHero(summary, {
      activeVarenykSated: {
        activationId: "sated",
        rank: 3,
        expiresAt: new Date("2026-06-23T10:13:00.000Z")
      },
      activeBardInspiration: {
        accuracyBonusPp: 1,
        expiresAt: new Date("2026-06-23T10:13:00.000Z")
      }
    });

    expect(text).toContain(
      "<b>Стани:</b>\n😋 <b>Ситий</b> ще <b>13 хв</b> — <b>+2 HP</b> і <b>+2 мани</b>"
    );
    expect(text).toContain(
      "✨ <b>Натхнення</b> ще <b>13 хв</b> — <b>+1</b> до влучання."
    );
    expect(text).not.toContain("😋 Стан:");
    expect(text).not.toContain("✨ Стан:");
  });

  it("shows equipment attunement as a timed status", () => {
    const text = presentHero({
      ...summary,
      equipmentAttunements: [
        {
          itemName: "Пательня переконання +1",
          strength: "weak",
          readyAt: new Date("2026-06-23T10:13:00.000Z")
        }
      ]
    });

    expect(text).toContain(
      "✨ Стан: <b>Налаштування на Пательня переконання +1</b> ще <b>13 хв</b>."
    );
    expect(text).toContain(
      "❤️ HP 24/24 · 🔮 мана 12/12\n\n✨ Стан: <b>Налаштування"
    );
  });

  it("shows queued pepper vodka as a pending monster combat buff", () => {
    const text = presentHero(summary, {
      activeDrink: {
        key: "drink.pepper-vodka",
        name: "Горілка з перцем",
        emoji: "🥃",
        phase: "queued",
        startedAt: new Date("2026-06-23T10:00:00.000Z"),
        expiresAt: new Date("2026-06-23T10:23:00.000Z"),
        outgoingDamageMultiplierBp: 11300,
        incomingDamageMultiplierBp: 11300
      }
    });

    expect(text).toContain(
      "❤️ HP 24/24 · 🔮 мана 12/12\n\n🥃 Баф: <b>Горілка з перцем</b> ще <b>23 хв</b> — чекає бою з монстром, завдана й отримана шкода <b>+13%</b>."
    );
    expect(text).not.toContain("PvE");
    expect(text).not.toContain("×1.13");
  });

  it("shows inventory value next to carried gold", () => {
    const text = presentHero(summary, { inventoryGoldValue: 28 });

    expect(text).toContain("👛 Золото: <b>12</b>");
    expect(text).toContain("а в манатках ще 28");
    expect(text).toContain("корчмар уже примружився");
  });

  it("shows zero inventory value only when the value was calculated", () => {
    const text = presentHero(summary, { inventoryGoldValue: 0 });

    expect(text).toContain(
      "👛 Золото: <b>12</b> <i>(а в манатках ще 0; торба чесна, аж нудно)</i>"
    );
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
      },
      equipmentAbilityActions: [
        {
          id: "mantok-ability.last-page-rapier",
          label: "🖋 Остання сторінка"
        }
      ]
    });

    expect(text).toContain("❤️ HP 26/26");
    expect(text).toContain("🎒 Манатки: +2 HP · +1 Вдачі");
    expect(text).toContain("🛡️ Захист спорядження: +1 до захисту");
    expect(text).toContain("🗡️ Удар: +2 до удару");
    expect(text).toContain("✨ Дія спорядження: <b>🖋 Остання сторінка</b>");
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
