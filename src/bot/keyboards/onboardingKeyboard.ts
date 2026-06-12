import { InlineKeyboard } from "grammy";
import {
  isClassAvailableForChoice,
  isRaceAvailableForPronoun,
  pronounOptions
} from "../../content/characterOptions";
import { classes } from "../../content/classes";
import { activeRaces } from "../../content/races";
import type { Pronoun } from "../../content/schema";
import {
  makeBackToClassCallbackData,
  makeBackToGenderCallbackData,
  makeBackToRaceCallbackData,
  makeClassCallbackData,
  makeConfirmCallbackData,
  makeGenderCallbackData,
  makeRaceCallbackData,
  makeUnavailableClassCallbackData,
  makeUnavailableRaceCallbackData
} from "../callbacks/onboardingCallbackData";

export function buildGenderKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  pronounOptions.forEach((option) => {
    keyboard.text(option.label, makeGenderCallbackData(option.id));
  });

  return keyboard;
}

export function buildRaceKeyboard(pronoun: Pronoun): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  activeRaces.forEach((race, index) => {
    const available = isRaceAvailableForPronoun(pronoun, race.id);
    keyboard.text(
      available ? race.name : `🚫 ${race.name}`,
      available
        ? makeRaceCallbackData(pronoun, race.id)
        : makeUnavailableRaceCallbackData(pronoun, race.id)
    );

    if (index % 2 === 1) {
      keyboard.row();
    }
  });

  keyboard.row().text("Назад", makeBackToGenderCallbackData());

  return keyboard;
}

export function buildClassKeyboard(pronoun: Pronoun, raceId: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  classes.forEach((characterClass, index) => {
    const available = isClassAvailableForChoice(pronoun, raceId, characterClass.id);
    keyboard.text(
      available ? characterClass.name : `🚫 ${characterClass.name}`,
      available
        ? makeClassCallbackData(pronoun, raceId, characterClass.id)
        : makeUnavailableClassCallbackData(pronoun, raceId, characterClass.id)
    );

    if (index % 2 === 1) {
      keyboard.row();
    }
  });

  keyboard.row().text("Назад до раси", makeBackToRaceCallbackData(pronoun));

  return keyboard;
}

export function buildConfirmationKeyboard(
  pronoun: Pronoun,
  raceId: string,
  classId: string
): InlineKeyboard {
  return new InlineKeyboard()
    .text("Почати", makeConfirmCallbackData(pronoun, raceId, classId))
    .row()
    .text("Назад до класу", makeBackToClassCallbackData(pronoun, raceId))
    .row()
    .text("Назад до раси", makeBackToRaceCallbackData(pronoun))
    .row()
    .text("Почати заново", makeBackToGenderCallbackData());
}
