import { InlineKeyboard } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { makeAdventureCallbackData } from "../callbacks/adventureCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";

export type AdventureResultKeyboardState = "completed" | "already-completed";

export function buildAdventureKeyboard(character?: CharacterSummary): InlineKeyboard {
  const labels = getAdventureActionLabels(character);

  return new InlineKeyboard()
    .text(labels.poke, makeAdventureCallbackData("poke"))
    .row()
    .text(labels.receipt, makeAdventureCallbackData("receipt"))
    .row()
    .text(labels.flee, makeAdventureCallbackData("flee"))
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildAdventureResultKeyboard(
  state: AdventureResultKeyboardState,
  character?: CharacterSummary
): InlineKeyboard {
  if (state === "completed" || state === "already-completed") {
    return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  return buildAdventureKeyboard(character);
}

export function buildAdventureParticipantsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ Назад", makeQuestCallbackData("adventure"));
}

function getAdventureActionLabels(character?: CharacterSummary): {
  poke: string;
  receipt: string;
  flee: string;
} {
  if (character?.classId === "class.bureaucramancer") {
    return {
      poke: "🖋️ Звірити лаваш",
      receipt: "📋 Оформити чек",
      flee: "🏃 Взяти паузу на погодження"
    };
  }

  if (character?.classId === "class.rogue") {
    return {
      poke: "🗝️ Перевірити кишені",
      receipt: "📋 Виманити чек",
      flee: "🏃 Зникнути за серветкою"
    };
  }

  if (character?.raceId === "race.domovyk") {
    return {
      poke: "🏠 Стягнути оренду",
      receipt: "📋 Перевірити рахунок",
      flee: "🏃 Відійти за піч"
    };
  }

  if (character?.classId === "class.varenyk-mancer") {
    return {
      poke: "🥟 Порівняти з тістом",
      receipt: "📋 Попросити чек",
      flee: "🏃 Врятувати начинку"
    };
  }

  return {
    poke: "🌯 Тицьнути шаурму",
    receipt: "📋 Попросити чек",
    flee: "🏃 Обережно відступити"
  };
}
