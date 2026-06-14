import { InlineKeyboard } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { makeFightCallbackData } from "../callbacks/fightCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export type FightResultKeyboardState = "completed" | "already-completed";

export function buildFightKeyboard(character?: CharacterSummary): InlineKeyboard {
  const labels = getFightActionLabels(character);

  return new InlineKeyboard()
    .text(labels.attack, makeFightCallbackData("attack"))
    .row()
    .text(labels.receipt, makeFightCallbackData("receipt"))
    .row()
    .text(labels.flee, makeFightCallbackData("flee"))
    .row()
    .text("⬅️ До столу", makePlaceCallbackData("quest-table"));
}

export function buildFightResultKeyboard(
  state: FightResultKeyboardState,
  character?: CharacterSummary
): InlineKeyboard {
  if (state === "already-completed") {
    return new InlineKeyboard().text("⬅️ До столу", makePlaceCallbackData("quest-table"));
  }

  return buildFightKeyboard(character);
}

function getFightActionLabels(character?: CharacterSummary): {
  attack: string;
  receipt: string;
  flee: string;
} {
  if (character?.classId === "class.rogue") {
    return {
      attack: "🗡️ Вдарити з тіні",
      receipt: "📋 Підсунути чек",
      flee: "🏃 Розчинитись у драмі"
    };
  }

  if (character?.classId === "class.bureaucramancer") {
    return {
      attack: "🗡️ Поставити силову печатку",
      receipt: "📋 Збити актом",
      flee: "🏃 Взяти відвід"
    };
  }

  if (character?.raceId === "race.intellectual-orc") {
    return {
      attack: "🗡️ Аргументувати плечем",
      receipt: "📋 Додати протокол",
      flee: "🏃 Відійти з гідністю"
    };
  }

  if (character?.classId === "class.bard") {
    return {
      attack: "🎵 Вдарити приспівом",
      receipt: "📋 Заспівати про чек",
      flee: "🏃 Піти на біс"
    };
  }

  return {
    attack: "🗡️ Вдарити",
    receipt: "📋 Збити з пантелику чеком",
    flee: "🏃 Відступити красиво"
  };
}
