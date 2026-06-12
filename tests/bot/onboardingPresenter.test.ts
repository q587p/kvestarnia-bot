import { describe, expect, it } from "vitest";
import { classes } from "../../src/content/classes";
import { races } from "../../src/content/races";
import { buildClassKeyboard, buildRaceKeyboard } from "../../src/bot/keyboards/onboardingKeyboard";
import { parseOnboardingCallbackData } from "../../src/bot/callbacks/onboardingCallbackData";
import {
  presentCharacterSummary,
  presentWelcome
} from "../../src/bot/presenters/onboardingPresenter";

describe("onboarding presenters and keyboards", () => {
  it("keeps /start welcome short and Ukrainian", () => {
    const text = presentWelcome();

    expect(text).toContain("Квестарні");
    expect(text.length).toBeLessThan(180);
  });

  it("builds race buttons with valid callback data", () => {
    const buttons = buildRaceKeyboard().inline_keyboard.flat();

    expect(buttons).toHaveLength(races.length);
    for (const button of buttons) {
      expect(button.text).toBeTruthy();
      expect(parseOnboardingCallbackData("callback_data" in button ? button.callback_data : "")).toMatchObject({
        ok: true
      });
    }
  });

  it("builds class buttons with valid callback data", () => {
    const buttons = buildClassKeyboard("race.human-ish").inline_keyboard.flat();

    expect(buttons).toHaveLength(classes.length);
    for (const button of buttons) {
      expect(button.text).toBeTruthy();
      expect(parseOnboardingCallbackData("callback_data" in button ? button.callback_data : "")).toMatchObject({
        ok: true
      });
    }
  });

  it("keeps existing hero summary compact", () => {
    const text = presentCharacterSummary({
      name: "Мандрівник",
      raceId: "race.human-ish",
      raceName: "Людисько",
      classId: "class.warrior",
      className: "Воїн",
      level: 1,
      xp: 0,
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
      }
    });

    expect(text).toContain("Мандрівник");
    expect(text.split("\n")).toHaveLength(3);
    expect(text.length).toBeLessThan(180);
  });
});
