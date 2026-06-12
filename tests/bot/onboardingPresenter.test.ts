import { describe, expect, it } from "vitest";
import { parseOnboardingCallbackData } from "../../src/bot/callbacks/onboardingCallbackData";
import {
  buildClassKeyboard,
  buildConfirmationKeyboard,
  buildGenderKeyboard,
  buildRaceKeyboard
} from "../../src/bot/keyboards/onboardingKeyboard";
import {
  presentCharacterSummary,
  presentClassSelected,
  presentGenderSelected,
  presentRaceSelected,
  presentWelcome
} from "../../src/bot/presenters/onboardingPresenter";
import { classes } from "../../src/content/classes";
import { races } from "../../src/content/races";

describe("onboarding presenters and keyboards", () => {
  it("keeps /start welcome short and Ukrainian", () => {
    const text = presentWelcome();

    expect(text).toContain("Квестарні");
    expect(text).toContain("🍺 Вітаємо в Квестарні.\n\nОберіть");
    expect(text.length).toBeLessThan(180);
  });

  it("builds gender buttons with valid callback data", () => {
    const buttons = buildGenderKeyboard().inline_keyboard.flat();

    expect(buttons).toHaveLength(3);
    expectAllButtonsValid(buttons);
  });

  it("builds race buttons with unavailable options and valid callback data", () => {
    const buttons = buildRaceKeyboard("she").inline_keyboard.flat();

    expect(buttons).toHaveLength(races.length + 1);
    expectAllButtonsValid(buttons);
    expect(buttons.some((button) => button.text.includes("🚫 Козак-характерник"))).toBe(true);
  });

  it("shows selected gender before race selection", () => {
    const text = presentGenderSelected("they");

    expect(text).toContain("<b>Вони</b>");
    expect(text).toContain("оберіть расу");
    expect(text).toContain("✅ Звертання: <b>Вони</b>\n\nТепер оберіть расу.\n\nДеякі");
  });

  it("shows selected pronoun and race as separated highlighted blocks", () => {
    const text = presentRaceSelected("he", "race.intellectual-orc");

    expect(text).toContain("✅ Звертання: <b>Він</b>");
    expect(text).toContain("✅ Раса: <b>Орк-інтелігент</b>");
    expect(text).toContain(
      "✅ Звертання: <b>Він</b>\n\n✅ Раса: <b>Орк-інтелігент</b>\n\n<i>"
    );
    expect(text).toContain("</i>\n\nТепер оберіть клас.");
  });

  it("builds class buttons with unavailable options and valid callback data", () => {
    const buttons = buildClassKeyboard("they", "race.molfar-soul").inline_keyboard.flat();

    expect(buttons).toHaveLength(classes.length + 1);
    expectAllButtonsValid(buttons);
    expect(buttons.some((button) => button.text.includes("🚫 Вареник-мант"))).toBe(true);
  });

  it("builds confirmation buttons with valid callback data", () => {
    const buttons = buildConfirmationKeyboard(
      "they",
      "race.molfar-soul",
      "class.bureaucramancer"
    ).inline_keyboard.flat();

    expect(buttons.map((button) => button.text)).toEqual([
      "Почати",
      "Назад до класу",
      "Назад до раси",
      "Почати заново"
    ]);
    expectAllButtonsValid(buttons);
  });

  it("presents a confirmation summary", () => {
    const text = presentClassSelected("they", "race.molfar-soul", "class.bureaucramancer");

    expect(text).toContain("Звертання: <b>Вони</b>");
    expect(text).not.toContain("Стать:");
    expect(text).toContain("<b>Мольфарська душа</b>");
    expect(text).toContain("<b>Бюрокромант</b>");
    expect(text).toContain("<i>Писар Оберегових Справ</i>");
  });

  it("keeps existing hero summary compact", () => {
    const text = presentCharacterSummary({
      name: "Мандрівник",
      pronoun: "they",
      pronounLabel: "Вони",
      path: "boundary",
      raceId: "race.human-ish",
      raceName: "Людисько",
      classId: "class.warrior",
      className: "Воїн",
      title: "Пересічний Герой",
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
    });

    expect(text).toContain("<b>Мандрівник</b>");
    expect(text).toContain("<i>Людисько · Воїн</i>");
    expect(text).toContain("Звертання: <b>Вони</b> · Титул: <i>Пересічний Герой</i>");
    expect(text).toContain("\n\nЗвертання:");
    expect(text).toContain("\n\nHP");
    expect(text.split("\n")).toHaveLength(7);
    expect(text.length).toBeLessThan(220);
  });
});

function expectAllButtonsValid(buttons: Array<{ text: string; callback_data?: string }>): void {
  for (const button of buttons) {
    expect(button.text).toBeTruthy();
    expect(parseOnboardingCallbackData(button.callback_data)).toMatchObject({
      ok: true
    });
  }
}
