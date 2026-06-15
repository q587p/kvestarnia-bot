import { InlineKeyboard } from "grammy";
import type { AdventureLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { CellarGrownupQuestLookupResult } from "../../services/cellarGrownupQuestService";
import type { FightLookupResult } from "../../services/fightService";
import type { YegerQuestLookupResult } from "../../services/yegerQuestService";
import { BESTIARY_MIN_LEVEL, meetsActivityLevel } from "../../domain/progression/activityGates";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export interface QuestHubKeyboardInput {
  mode?: "active" | "archive";
  characterLevel?: number;
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>;
  fight: Exclude<FightLookupResult, { state: "no-character" }>;
  yeger: Exclude<YegerQuestLookupResult, { state: "no-character" }>;
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>;
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>;
}

export function buildQuestHubKeyboard(input: QuestHubKeyboardInput): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (input.mode === "archive") {
    keyboard.text("📋 До справ", makeQuestCallbackData("list")).row();

    if (canOpenBestiary(input)) {
      keyboard.text("📖 Бестіарій", makeBestiaryListCallbackData(0)).row();
    }

    keyboard.text("🍺 До зали", makePlaceCallbackData("hall"));

    return keyboard;
  }

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

  if (
    input.yeger.state === "offered" ||
    input.yeger.state === "in-progress" ||
    input.yeger.state === "turn-in-ready"
  ) {
    keyboard.text("🏹 До Єгеря", makeQuestCallbackData("hunt"));
    keyboard.row();
  }

  if (
    input.cellar.state === "ready" ||
    input.cellar.state === "on-cooldown" ||
    (input.cellar.state === "level-retired" && input.cellarGrownup?.state !== "completed")
  ) {
    keyboard.text("🧹 У підвал", makeQuestCallbackData("cellar"));
    keyboard.row();
  }

  if (canOpenBestiary(input)) {
    keyboard.text("📦 Архів", makeQuestCallbackData("archive"));
    keyboard.row();
    keyboard.text("📖 Бестіарій", makeBestiaryListCallbackData(0));
    keyboard.row();
  } else {
    keyboard.text("📦 Архів", makeQuestCallbackData("archive"));
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
  return isPersistentFightState(fight.state) ? "🧾 До проблем" : "⚔️ До сутички";
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
    input.yeger.state === "offered" ||
    input.yeger.state === "in-progress" ||
    input.yeger.state === "turn-in-ready" ||
    input.cellar.state === "ready" ||
    (input.cellar.state === "level-retired" && input.cellarGrownup?.state !== "completed")
  );
}
