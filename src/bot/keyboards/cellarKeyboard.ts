import { InlineKeyboard } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { makeCellarCallbackData } from "../callbacks/cellarCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";

export type CellarKeyboardState = "ready" | "completed" | "on-cooldown";

export function buildCellarKeyboard(character?: CharacterSummary): InlineKeyboard {
  const labels = getCellarActionLabels(character);

  return new InlineKeyboard()
    .text(labels.cheeseTrap, makeCellarCallbackData("cheese-trap"))
    .row()
    .text(labels.sweepBravely, makeCellarCallbackData("sweep-bravely"))
    .row()
    .text(labels.negotiate, makeCellarCallbackData("negotiate"))
    .row()
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildCellarResultKeyboard(
  state: CellarKeyboardState,
  character?: CharacterSummary
): InlineKeyboard {
  if (state === "ready") {
    return buildCellarKeyboard(character);
  }

  return new InlineKeyboard().text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildCellarParticipantsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ Назад", makeQuestCallbackData("cellar"));
}

export type CellarGrownupKeyboardState =
  | "offered"
  | "has-seal"
  | "roleplay-cooldown"
  | "bottle-obtained"
  | "completed"
  | "insufficient";

export function buildCellarGrownupKeyboard(state: CellarGrownupKeyboardState): InlineKeyboard {
  if (state === "bottle-obtained") {
    return new InlineKeyboard()
      .text("🍾 Здати Корчмарю", makeCellarCallbackData("grownup-turn-in"))
      .row()
      .text("🎒 Лишити собі", makeCellarCallbackData("grownup-keep-bottle"))
      .row()
      .text("⬅️ До зали", makePlaceCallbackData("hall"));
  }

  if (state === "has-seal") {
    return new InlineKeyboard()
      .text("🧀 Показати пломбу", makeCellarCallbackData("grownup-show-seal"))
      .row()
      .text("🐭 Домовитись без пломби", makeCellarCallbackData("grownup-roleplay"))
      .row()
      .text("⬅️ До зали", makePlaceCallbackData("hall"));
  }

  if (state === "completed") {
    return new InlineKeyboard()
      .text("📋 До справ", makePlaceCallbackData("quest-table"))
      .row()
      .text("⬅️ До зали", makePlaceCallbackData("hall"));
  }

  const keyboard = new InlineKeyboard();

  if (state !== "roleplay-cooldown") {
    keyboard.text("🐭 Домовитись із мишею", makeCellarCallbackData("grownup-roleplay")).row();
  }

  keyboard
    .text("🧀 Купити пломбу", makeCellarCallbackData("grownup-buy-seal"))
    .row()
    .text("🏹 Дошка полювання", makeQuestCallbackData("hunt"))
    .row()
    .text("⬅️ До зали", makePlaceCallbackData("hall"));

  return keyboard;
}

function getCellarActionLabels(character?: CharacterSummary): {
  cheeseTrap: string;
  sweepBravely: string;
  negotiate: string;
} {
  if (character?.raceId === "race.domovyk") {
    return {
      cheeseTrap: "🧀 Виставити оренду сиром",
      sweepBravely: "🧹 Навести хатній лад",
      negotiate: "🤝 Поділити шафу"
    };
  }

  if (character?.classId === "class.bureaucramancer") {
    return {
      cheeseTrap: "🧀 Оформити сирну пастку",
      sweepBravely: "🧹 Інвентаризувати пил",
      negotiate: "🤝 Підписати серветку"
    };
  }

  if (character?.classId === "class.rogue") {
    return {
      cheeseTrap: "🧀 Підсунути сир",
      sweepBravely: "🧹 Замести сліди",
      negotiate: "🤝 Торгуватись пошепки"
    };
  }

  if (character?.classId === "class.ranger") {
    return {
      cheeseTrap: "🧀 Розкласти пастку по слідах",
      sweepBravely: "🧹 Прочитати пил",
      negotiate: "🤝 Піти мишачим слідом"
    };
  }

  if (character?.classId === "class.bard") {
    return {
      cheeseTrap: "🧀 Приманити куплетом",
      sweepBravely: "🧹 Змести в ритм",
      negotiate: "🤝 Заспівати угоду"
    };
  }

  return {
    cheeseTrap: "🧀 Поставити сирну пастку",
    sweepBravely: "🧹 Підмести хоробро",
    negotiate: "🤝 Домовитись із мишею"
  };
}
