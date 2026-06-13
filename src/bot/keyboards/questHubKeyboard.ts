import { InlineKeyboard } from "grammy";
import type { AdventureLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { FightLookupResult } from "../../services/fightService";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export interface QuestHubKeyboardInput {
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>;
  fight: Exclude<FightLookupResult, { state: "no-character" }>;
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>;
}

export function buildQuestHubKeyboard(input: QuestHubKeyboardInput): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  let hasAction = false;

  if (input.adventure.state === "ready") {
    keyboard.text("🌯 До шаурми", makeQuestCallbackData("adventure"));
    hasAction = true;
  }

  if (input.fight.state === "ready") {
    if (hasAction) {
      keyboard.row();
    }

    keyboard.text("⚔️ До сутички", makeQuestCallbackData("fight"));
    hasAction = true;
  }

  if (hasAction) {
    keyboard.row();
  }

  keyboard.text("🧹 У підвал", makeQuestCallbackData("cellar"));
  keyboard.row().text("🍺 До зали", makePlaceCallbackData("hall"));

  return keyboard;
}
