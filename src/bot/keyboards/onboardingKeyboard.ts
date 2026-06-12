import { InlineKeyboard } from "grammy";
import { classes } from "../../content/classes";
import { races } from "../../content/races";
import { makeClassCallbackData, makeRaceCallbackData } from "../callbacks/onboardingCallbackData";

export function buildRaceKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  races.forEach((race, index) => {
    keyboard.text(race.name, makeRaceCallbackData(race.id));

    if (index % 2 === 1) {
      keyboard.row();
    }
  });

  return keyboard;
}

export function buildClassKeyboard(raceId: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  classes.forEach((characterClass, index) => {
    keyboard.text(characterClass.name, makeClassCallbackData(raceId, characterClass.id));

    if (index % 2 === 1) {
      keyboard.row();
    }
  });

  return keyboard;
}
