import { InlineKeyboard } from "grammy";
import type { AdventureLookupResult, MimicShawarmaLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { CellarGrownupQuestLookupResult } from "../../services/cellarGrownupQuestService";
import type { FightLookupResult, ProblemQuestProgress } from "../../services/fightService";
import type { DailyKorchmaRoundExistingLookupResult } from "../../services/dailyKorchmaRoundService";
import type { YegerQuestLookupResult } from "../../services/yegerQuestService";
import {
  BESTIARY_MIN_LEVEL,
  FIGHTING_CORNER_MIN_LEVEL,
  meetsActivityLevel,
  STARTER_ACTIVITY_MAX_LEVEL
} from "../../domain/progression/activityGates";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeRemortOpenCallbackData } from "../callbacks/remortCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";
import { makeDailyKorchmaRoundOverviewCallbackData, makeDailyKorchmaRoundClaimCallbackData } from "../callbacks/dailyKorchmaRoundCallbackData";
import { makeYegerTurnInCallbackData } from "../callbacks/yegerCallbackData";
import {
  decorateButtonLabel,
  resolveQuestMarkerForTarget
} from "./questButtonMarkers";

export interface QuestHubKeyboardInput {
  mode?: "active" | "archive";
  characterLevel?: number;
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>;
  starterAdventure?: Exclude<MimicShawarmaLookupResult, { state: "no-character" }>;
  fight: Exclude<FightLookupResult, { state: "no-character" }>;
  problemQuest?: ProblemQuestProgress;
  yeger: Exclude<YegerQuestLookupResult, { state: "no-character" }>;
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>;
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>;
  dailyKorchmaRound?: Exclude<DailyKorchmaRoundExistingLookupResult, { state: "no-character" }>;
}

export function buildQuestHubKeyboard(input: QuestHubKeyboardInput): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const problemQuest = getProblemQuestProgress(input);

  if (input.mode === "archive") {
    keyboard.text("📋 До справ", makeQuestCallbackData("list")).row();

    if (canOpenBestiary(input)) {
      keyboard.text("📖 Бестіарій", makeBestiaryListCallbackData(0)).row();
    }

    keyboard.text(buildBackToHallLabel(input), makePlaceCallbackData("hall"));

    return keyboard;
  }

  let hasAction = false;

  if (canOpenRemort(input)) {
    keyboard.text("🕯️ Реморт", makeRemortOpenCallbackData()).row();
  }

  if (canOpenProblemQuestInBar(input, problemQuest)) {
    keyboard.text(
      decorateButtonLabel("🍻 До шинку", resolveQuestMarkerForTarget(input, "location.korchma.bar")),
      makePlaceCallbackData("bar")
    ).row();
  }

  if (canOpenAdventure(input)) {
    keyboard.text(
      input.adventure.state === "level-locked"
        ? "🌯 До підозрілої шаурми"
        : decorateButtonLabel("🪧 Обрати пригоду", resolveQuestMarkerForTarget(input, "quest.adventure")),
      makeQuestCallbackData("adventure")
    );
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

    if (input.fight.state === "ready") {
      keyboard.text(
        "⚔️ До сутички",
        makeQuestCallbackData("fight")
      );
    } else {
      keyboard.text("🪜 До Низу", makePlaceCallbackData("deep"));
    }
    hasAction = true;
  }

  if (hasAction) {
    keyboard.row();
  }

  if (
    input.yeger.state === "offered" ||
    input.yeger.state === "in-progress"
  ) {
    keyboard.text(
      decorateButtonLabel("🏹 До Єгеря", resolveQuestMarkerForTarget(input, "quest.yeger")),
      makeTavernCallbackData("ranger")
    );
    keyboard.row();
  }

  if (input.yeger.state === "turn-in-ready") {
    keyboard.text(
      decorateButtonLabel("🏹 Здати Єгерю", resolveQuestMarkerForTarget(input, "quest.yeger")),
      makeYegerTurnInCallbackData()
    );
    keyboard.row();
  }

  if (
    input.cellar.state === "ready" ||
    input.cellar.state === "on-cooldown" ||
    (input.cellar.state === "level-retired" && input.cellarGrownup?.state !== "completed")
  ) {
    keyboard.text(
      decorateButtonLabel("🧹 У льох", resolveQuestMarkerForTarget(input, "location.korchma.cellar")),
      makeQuestCallbackData("cellar")
    );
    keyboard.row();
  }

  if (
    input.dailyKorchmaRound?.state === "not-issued" ||
    input.dailyKorchmaRound?.state === "ready" ||
    input.dailyKorchmaRound?.state === "turn-in-ready"
  ) {
    keyboard
      .text(
        decorateButtonLabel(
          input.dailyKorchmaRound.state === "turn-in-ready" ? "🧾 Здати обхід" : "🧾 Корчмарський обхід",
          resolveQuestMarkerForTarget(input, "quest.daily-korchma-round")
        ),
        input.dailyKorchmaRound.state === "turn-in-ready"
          ? makeDailyKorchmaRoundClaimCallbackData(
              input.dailyKorchmaRound.offer.dayToken,
              input.dailyKorchmaRound.offer.lifeToken
            )
          : makeDailyKorchmaRoundOverviewCallbackData(
              input.dailyKorchmaRound.state === "not-issued"
                ? input.dailyKorchmaRound.dayToken
                : input.dailyKorchmaRound.offer.dayToken
            )
      )
      .row();
  }

  addQuestReferenceButtons(keyboard, input);

  if (!hasReadyQuestAction(input)) {
    keyboard.text("🎒 Манатки", makeMenuCallbackData("inventory"));
    keyboard.row();
  }

  keyboard.text(buildBackToHallLabel(input), makePlaceCallbackData("hall"));

  return keyboard;
}

function buildBackToHallLabel(input: QuestHubKeyboardInput): string {
  return decorateButtonLabel(
    "🍺 До зали",
    resolveQuestMarkerForTarget(input, "location.korchma.hall")
  );
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

function canOpenFightingCorner(input: QuestHubKeyboardInput): boolean {
  return input.characterLevel === undefined || meetsActivityLevel(input.characterLevel, FIGHTING_CORNER_MIN_LEVEL);
}

function canOpenAdventure(input: QuestHubKeyboardInput): boolean {
  return (
    input.adventure.state === "ready" ||
    (input.adventure.state === "level-locked" &&
      (input.characterLevel ?? 0) <= STARTER_ACTIVITY_MAX_LEVEL &&
      input.starterAdventure?.state === "ready")
  );
}

function canOpenProblemQuestInBar(input: QuestHubKeyboardInput, progress: ProblemQuestProgress): boolean {
  if (!canOpenFightingCorner(input)) {
    return false;
  }

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
    canOpenAdventure(input) ||
    input.adventure.state === "active-fight" ||
    input.fight.state === "ready" ||
    (canOpenFightingCorner(input) && !problemQuest.branchComplete) ||
    (input.fight.state === "persistent-ready" && problemQuest.issued) ||
    input.fight.state === "persistent-active" ||
    input.fight.state === "persistent-terminal" ||
    input.fight.state === "training-active" ||
    input.yeger.state === "offered" ||
    input.yeger.state === "in-progress" ||
    input.yeger.state === "turn-in-ready" ||
    input.cellar.state === "ready" ||
    (input.cellar.state === "level-retired" && input.cellarGrownup?.state !== "completed") ||
    input.dailyKorchmaRound?.state === "not-issued" ||
    input.dailyKorchmaRound?.state === "ready" ||
    input.dailyKorchmaRound?.state === "turn-in-ready"
  );
}
