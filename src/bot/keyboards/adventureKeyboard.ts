import { InlineKeyboard } from "grammy";
import type {
  AdventureOffer,
  AdventureProblemResult
} from "../../services/adventureService";
import { getAdventureProblemIcon } from "../../services/adventureService";
import {
  makeAdventureApproachCallbackData,
  makeAdventureParticipantsCallbackData,
  makeAdventureProblemCallbackData
} from "../callbacks/adventureCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";

export function buildAdventureOfferKeyboard(offer: AdventureOffer): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const choice of offer.choices) {
    keyboard
      .text(`${getAdventureProblemIcon(choice.id)} ${choice.title}`, makeAdventureProblemCallbackData({
        periodToken: offer.periodToken,
        problemId: choice.id
      }))
      .row();
  }

  keyboard.text("📋 До справ", makePlaceCallbackData("quest-table"));

  return keyboard;
}

export function buildAdventureKeyboard(offer?: AdventureOffer | { classId?: string; raceId?: string }): InlineKeyboard {
  if (offer && "choices" in offer) {
    return buildAdventureOfferKeyboard(offer);
  }

  const labels = getLegacyAdventureActionLabels(offer);

  return new InlineKeyboard()
    .text(labels.poke, "v1:adv:mimic:poke")
    .row()
    .text(labels.receipt, "v1:adv:mimic:receipt")
    .row()
    .text(labels.flee, "v1:adv:mimic:flee")
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildAdventureApproachKeyboard(
  result: Extract<AdventureProblemResult, { state: "selected" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const approach of result.approaches) {
    keyboard
      .text(approach.label, makeAdventureApproachCallbackData({
        periodToken: result.offer.periodToken,
        problemId: result.choice.id,
        approach: approach.id
      }))
      .row();
  }

  keyboard.text("⬅️ Інші справи", makeQuestCallbackData("adventure"));

  return keyboard;
}

export function buildAdventureResultKeyboard(
  result:
    | { state: "stale"; offer: AdventureOffer }
    | { state: "active-fight" }
    | { state: "completed" | "already-completed" | "level-locked" | "level-retired" }
    | "completed"
    | "already-completed"
): InlineKeyboard {
  if (typeof result === "string") {
    return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  if (result.state === "stale") {
    return buildAdventureOfferKeyboard(result.offer);
  }

  if (result.state === "active-fight") {
    return new InlineKeyboard().text("⚔️ До бою", makeQuestCallbackData("fight"));
  }

  return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildAdventureParticipantsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ Назад", makeQuestCallbackData("adventure"));
}

export function buildAdventureParticipantsButton(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👀 Хто біля столу", makeAdventureParticipantsCallbackData())
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

function getLegacyAdventureActionLabels(character?: { classId?: string; raceId?: string }): {
  poke: string;
  receipt: string;
  flee: string;
} {
  if (character?.classId === "class.rogue") {
    return {
      poke: "🗝️ Перевірити кишені",
      receipt: "📋 Виманити чек",
      flee: "🏃 Зникнути за серветкою"
    };
  }

  return {
    poke: "🌯 Тицьнути шаурму",
    receipt: "📋 Попросити чек",
    flee: "🏃 Обережно відступити"
  };
}
