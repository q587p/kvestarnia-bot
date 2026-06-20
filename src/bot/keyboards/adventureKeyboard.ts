import { InlineKeyboard } from "grammy";
import type {
  AdventureOffer,
  AdventureProblemResult
} from "../../services/adventureService";
import { buildStarterMethodOptions, getAdventureProblemIcon } from "../../services/adventureService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import {
  makeAdventureApproachCallbackData,
  makeMimicShawarmaMethodCallbackData,
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

export function buildAdventureKeyboard(offer?: AdventureOffer | CharacterSummary): InlineKeyboard {
  if (offer && "choices" in offer) {
    return buildAdventureOfferKeyboard(offer);
  }

  if (offer) {
    const keyboard = new InlineKeyboard();

    for (const method of buildStarterMethodOptions("shawarma", offer)) {
      keyboard
        .text(method.buttonLabel ?? method.label, makeMimicShawarmaMethodCallbackData(method.callbackKey ?? method.id))
        .row();
    }

    keyboard.text("📋 До справ", makePlaceCallbackData("quest-table"));

    return keyboard;
  }

  return new InlineKeyboard()
    .text("🌯 Тицьнути шаурму", "v1:adv:mimic:poke")
    .row()
    .text("📋 Попросити чек", "v1:adv:mimic:receipt")
    .row()
    .text("🏃 Обережно відступити", "v1:adv:mimic:flee")
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildAdventureApproachKeyboard(
  result: Extract<AdventureProblemResult, { state: "selected" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const approach of result.approaches) {
    keyboard
      .text(approach.buttonLabel ?? approach.label, makeAdventureApproachCallbackData({
        periodToken: result.offer.periodToken,
        problemId: result.choice.id,
        methodId: approach.callbackKey ?? approach.id
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
    | { state: "completed" | "already-completed" | "level-locked" | "level-retired" | "insufficient-gold" | "stale" }
    | "completed"
    | "already-completed"
): InlineKeyboard {
  if (typeof result === "string") {
    return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  if (result.state === "stale" && "offer" in result) {
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
