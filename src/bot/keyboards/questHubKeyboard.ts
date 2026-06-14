import { InlineKeyboard } from "grammy";
import type { AdventureLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { FightLookupResult } from "../../services/fightService";
import type { HuntLookupResult } from "../../services/huntService";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export interface QuestHubKeyboardInput {
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>;
  fight: Exclude<FightLookupResult, { state: "no-character" }>;
  hunt: Exclude<HuntLookupResult, { state: "no-character" }>;
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

  if (input.hunt.state === "ready") {
    keyboard.text("🏹 До дошки", makeQuestCallbackData("hunt"));
    keyboard.row();
  }

  if (input.cellar.state === "ready" || input.cellar.state === "on-cooldown") {
    keyboard.text("🧹 У підвал", makeQuestCallbackData("cellar"));
    keyboard.row();
  }

  keyboard.text("📖 Бестіарій", makeBestiaryListCallbackData(0));
  keyboard.row();

  if (!hasReadyQuestAction(input)) {
    keyboard.text("🎒 Манатки", makeMenuCallbackData("inventory"));
    keyboard.row();
  }

  keyboard.text("🍺 До зали", makePlaceCallbackData("hall"));

  return keyboard;
}

function hasReadyQuestAction(input: QuestHubKeyboardInput): boolean {
  return (
    input.adventure.state === "ready" ||
    input.fight.state === "ready" ||
    input.hunt.state === "ready" ||
    input.cellar.state === "ready"
  );
}
