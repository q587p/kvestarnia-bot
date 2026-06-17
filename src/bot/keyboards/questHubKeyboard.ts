import { InlineKeyboard } from "grammy";
import type { AdventureLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { CellarGrownupQuestLookupResult } from "../../services/cellarGrownupQuestService";
import type { FightLookupResult, ProblemQuestProgress } from "../../services/fightService";
import type { YegerQuestLookupResult } from "../../services/yegerQuestService";
import { BESTIARY_MIN_LEVEL, meetsActivityLevel } from "../../domain/progression/activityGates";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeRemortOpenCallbackData } from "../callbacks/remortCallbackData";

export interface QuestHubKeyboardInput {
  mode?: "active" | "archive";
  characterLevel?: number;
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>;
  fight: Exclude<FightLookupResult, { state: "no-character" }>;
  problemQuest?: ProblemQuestProgress;
  yeger: Exclude<YegerQuestLookupResult, { state: "no-character" }>;
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>;
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>;
}

export function buildQuestHubKeyboard(input: QuestHubKeyboardInput): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const problemQuest = getProblemQuestProgress(input);

  if (input.mode === "archive") {
    keyboard.text("📋 До справ", makeQuestCallbackData("list")).row();

    if (canOpenBestiary(input)) {
      keyboard.text("📖 Бестіарій", makeBestiaryListCallbackData(0)).row();
    }

    keyboard.text("🍺 До зали", makePlaceCallbackData("hall"));

    return keyboard;
  }

  let hasAction = false;

  if (canOpenRemort(input)) {
    keyboard.text("🕯️ Реморт", makeRemortOpenCallbackData()).row();
  }

  keyboard.text("🥊 До Бійцівського кутка", makePlaceCallbackData("fighting-corner")).row();

  if (canOpenProblemQuestInBar(problemQuest)) {
    keyboard.text("🍻 До шинку", makePlaceCallbackData("bar")).row();
  }

  if (input.adventure.state === "ready") {
    keyboard.text("🌯 До шаурми", makeQuestCallbackData("adventure"));
    hasAction = true;
  }

  if (
    input.fight.state === "ready" ||
    (input.fight.state === "persistent-ready" && problemQuest.issued) ||
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
    keyboard.text("🧹 У льох", makeQuestCallbackData("cellar"));
    keyboard.row();
  }

  addQuestReferenceButtons(keyboard, input);

  if (!hasReadyQuestAction(input)) {
    keyboard.text("🎒 Манатки", makeMenuCallbackData("inventory"));
    keyboard.row();
  }

  keyboard.text("🍺 До зали", makePlaceCallbackData("hall"));

  return keyboard;
}

function addQuestReferenceButtons(
  keyboard: InlineKeyboard,
  input: QuestHubKeyboardInput
): void {
  keyboard.text("📦 Архів", makeQuestCallbackData("archive"));

  if (canOpenBestiary(input)) {
    keyboard.text("📖 Бестіарій", makeBestiaryListCallbackData(0));
  }

  keyboard.row();
}

function canOpenBestiary(input: QuestHubKeyboardInput): boolean {
  return input.characterLevel === undefined || meetsActivityLevel(input.characterLevel, BESTIARY_MIN_LEVEL);
}

function canOpenRemort(input: QuestHubKeyboardInput): boolean {
  return (input.characterLevel ?? 0) >= 13;
}

function getFightButtonLabel(fight: QuestHubKeyboardInput["fight"]): string {
  if (fight.state === "persistent-active") {
    return "⚔️ Продовжити бій";
  }

  if (fight.state === "persistent-terminal") {
    return "📋 До запису бою";
  }

  if (fight.state === "persistent-ready") {
    return "⚔️ Розвʼязати проблему";
  }

  return "⚔️ До сутички";
}

function canOpenProblemQuestInBar(progress: ProblemQuestProgress): boolean {
  if (progress.branchComplete) {
    return false;
  }

  if (!progress.issued) {
    return true;
  }

  return progress.completed;
}

function getProblemQuestProgress(input: QuestHubKeyboardInput): ProblemQuestProgress {
  if (input.problemQuest) {
    return input.problemQuest;
  }

  if ("questProgress" in input.fight) {
    return input.fight.questProgress;
  }

  return {
    stageId: "93",
    title: "Девʼяносто три остаточно підозрілі проблеми",
    wins: 93,
    target: 93,
    completed: true,
    rewardClaimed: true,
    issued: true,
    branchComplete: true
  };
}

function hasReadyQuestAction(input: QuestHubKeyboardInput): boolean {
  const problemQuest = getProblemQuestProgress(input);

  return (
    input.adventure.state === "ready" ||
    input.fight.state === "ready" ||
    !problemQuest.branchComplete ||
    (input.fight.state === "persistent-ready" && problemQuest.issued) ||
    input.fight.state === "persistent-active" ||
    input.fight.state === "persistent-terminal" ||
    input.fight.state === "training-active" ||
    input.yeger.state === "offered" ||
    input.yeger.state === "in-progress" ||
    input.yeger.state === "turn-in-ready" ||
    input.cellar.state === "ready" ||
    (input.cellar.state === "level-retired" && input.cellarGrownup?.state !== "completed")
  );
}
