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
    .text("👥 Учасники", makeCellarCallbackData("participants"))
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

  return new InlineKeyboard()
    .text("👥 Учасники", makeCellarCallbackData("participants"))
    .row()
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildCellarParticipantsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ Назад", makeQuestCallbackData("cellar"));
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
