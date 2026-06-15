import { InlineKeyboard } from "grammy";
import type { AdventureLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { FightLookupResult } from "../../services/fightService";
import type { HuntLookupResult } from "../../services/huntService";
import { BESTIARY_MIN_LEVEL, meetsActivityLevel } from "../../domain/progression/activityGates";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export interface QuestHubKeyboardInput {
  characterLevel?: number;
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

  if (
    input.fight.state === "ready" ||
    input.fight.state === "persistent-ready" ||
    input.fight.state === "persistent-active" ||
    input.fight.state === "persistent-terminal"
  ) {
    if (hasAction) {
      keyboard.row();
    }

    keyboard.text(getFightButtonLabel(input.fight), makeQuestCallbackData("fight"));
    hasAction = true;
  }

  if (hasAction) {
    keyboard.row();
  }

  if (input.hunt.state === "ready") {
    keyboard.text("🏹 До дошки", makeQuestCallbackData("hunt"));
    keyboard.row();
  }

  if (
    input.cellar.state === "ready" ||
    input.cellar.state === "on-cooldown" ||
    input.cellar.state === "level-retired"
  ) {
    keyboard.text("🧹 У підвал", makeQuestCallbackData("cellar"));
    keyboard.row();
  }

  if (canOpenBestiary(input)) {
    keyboard.text("📖 Бестіарій", makeBestiaryListCallbackData(0));
    keyboard.row();
  }

  if (!hasReadyQuestAction(input)) {
    keyboard.text("🎒 Манатки", makeMenuCallbackData("inventory"));
    keyboard.row();
  }

  keyboard.text("🍺 До зали", makePlaceCallbackData("hall"));

  return keyboard;
}

function canOpenBestiary(input: QuestHubKeyboardInput): boolean {
  return input.characterLevel === undefined || meetsActivityLevel(input.characterLevel, BESTIARY_MIN_LEVEL);
}

function getFightButtonLabel(fight: QuestHubKeyboardInput["fight"]): string {
  return isPersistentFightState(fight.state) ? "📋 До проблем" : "⚔️ До сутички";
}

function isPersistentFightState(state: QuestHubKeyboardInput["fight"]["state"]): boolean {
  return (
    state === "persistent-ready" ||
    state === "persistent-active" ||
    state === "persistent-terminal"
  );
}

function hasReadyQuestAction(input: QuestHubKeyboardInput): boolean {
  return (
    input.adventure.state === "ready" ||
    input.fight.state === "ready" ||
    input.fight.state === "persistent-ready" ||
    input.fight.state === "persistent-active" ||
    input.fight.state === "persistent-terminal" ||
    input.hunt.state === "ready" ||
    input.cellar.state === "ready" ||
    input.cellar.state === "level-retired"
  );
}
