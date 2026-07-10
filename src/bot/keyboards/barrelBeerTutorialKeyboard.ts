import { InlineKeyboard } from "grammy";
import type {
  BarrelBeerTutorialAcceptResult,
  BarrelBeerTutorialLookupResult,
  BarrelBeerTutorialTurnInResult
} from "../../services/barrelBeerTutorialService";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { decorateButtonLabel, QuestMarker } from "./questButtonMarkers";

type QuestState =
  | Exclude<BarrelBeerTutorialLookupResult, { state: "no-character" | "level-locked" | "level-retired" | "completed" }>
  | Exclude<BarrelBeerTutorialAcceptResult, { state: "no-character" | "level-locked" | "level-retired" | "already-completed" }>
  | Exclude<BarrelBeerTutorialTurnInResult, { state: "no-character" | "level-locked" | "level-retired" | "completed" | "already-completed" }>;

export function buildBarrelBeerTutorialKeyboard(result: QuestState): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const progress = result.progress;

  if (result.state === "available" || result.state === "not-started") {
    keyboard.text("🛢️ Взяти записку", makeQuestCallbackData("barrel-tutorial-accept")).row();
  } else if (result.state === "turn-in-ready") {
    keyboard.text("✅ Здати Бочку", makeQuestCallbackData("barrel-tutorial-turn-in")).row();
  } else if (!progress.visitedBarrel || !progress.raidCompleted) {
    keyboard.text(
      decorateButtonLabel("🛢️ До Бочки", QuestMarker.CAN_ACCEPT),
      makePlaceCallbackData("barrel")
    ).row();
  } else if (!progress.beerRoundOffered || !progress.beerDrunk || !progress.activeBeer) {
    keyboard.text("🍻 До шинку", makePlaceCallbackData("bar")).row();
  } else {
    keyboard.text("📋 До столу", makePlaceCallbackData("quest-table")).row();
  }

  keyboard.text("📋 До справ", makeQuestCallbackData("list"));

  return keyboard;
}

export function buildBarrelBeerTutorialCompletedKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📦 Архів", makeQuestCallbackData("archive"))
    .row()
    .text("📋 До справ", makeQuestCallbackData("list"));
}
