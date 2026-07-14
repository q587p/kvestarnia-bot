import type { AdventureLookupResult, MimicShawarmaLookupResult } from "../../services/adventureService";
import type { BarrelBeerTutorialLookupResult } from "../../services/barrelBeerTutorialService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { CellarGrownupQuestLookupResult } from "../../services/cellarGrownupQuestService";
import type {
  DailyKorchmaRoundExistingLookupResult,
  DailyKorchmaRoundMarkerLookupResult
} from "../../services/dailyKorchmaRoundService";
import type { FightLookupResult, ProblemQuestProgress } from "../../services/fightService";
import type { FirstKorchmaQuestLookupResult } from "../../services/firstKorchmaQuestService";
import type { FightingCornerQuestLookupResult } from "../../services/fightingCornerQuestService";
import type { ItemUpgradeQuestLookupResult } from "../../services/itemUpgradeService";
import type { YegerQuestLookupResult, YegerQuestMarkerLookupResult } from "../../services/yegerQuestService";
import {
  BESTIARY_MIN_LEVEL,
  FIGHTING_CORNER_MIN_LEVEL,
  STARTER_ACTIVITY_MAX_LEVEL,
  meetsActivityLevel
} from "../../domain/progression/activityGates";
import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  PRESENCE_LOCATION_KORCHMA_YARD,
  normalizePresenceLocationId
} from "../../services/presenceService";

export enum QuestMarker {
  NONE = 0,
  CAN_ACCEPT = 1,
  CAN_TURN_IN = 2
}

export type QuestMarkerTarget =
  | "menu.quest"
  | "location.korchma.hall"
  | "location.korchma.front"
  | "location.korchma.fighting-corner"
  | "location.korchma.yard"
  | "location.korchma.quest-table"
  | "location.korchma.bar"
  | "location.korchma.barrel"
  | "location.korchma.cellar"
  | "location.korchma.ranger-corner"
  | "quest.adventure"
  | "quest.fight"
  | "quest.problem"
  | "quest.first-korchma"
  | "quest.yeger"
  | "quest.cellar"
  | "quest.cellar-grownup"
  | "quest.barrel-beer-tutorial"
  | "quest.daily-korchma-round"
  | "quest.charkokovalnia"
  | "quest.fighting-corner-onboarding";

export interface QuestMarkerInput {
  characterLevel?: number;
  adventure?: Exclude<AdventureLookupResult, { state: "no-character" }>;
  starterAdventure?: Exclude<MimicShawarmaLookupResult, { state: "no-character" }>;
  fight?: Exclude<FightLookupResult, { state: "no-character" }>;
  firstKorchmaQuest?: Exclude<FirstKorchmaQuestLookupResult, { state: "no-character" }>;
  problemQuest?: ProblemQuestProgress;
  yeger?: Exclude<YegerQuestLookupResult | YegerQuestMarkerLookupResult, { state: "no-character" }>;
  cellar?: Exclude<CellarErrandLookupResult, { state: "no-character" }>;
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>;
  barrelBeerTutorial?: Exclude<BarrelBeerTutorialLookupResult, { state: "no-character" }>;
  dailyKorchmaRound?: Exclude<
    DailyKorchmaRoundExistingLookupResult | DailyKorchmaRoundMarkerLookupResult,
    { state: "no-character" }
  >;
  itemUpgrades?: Exclude<ItemUpgradeQuestLookupResult, { state: "no-character" }>;
  fightingCornerQuest?: Exclude<FightingCornerQuestLookupResult, { state: "no-character" | "disabled" }>;
}

const MARKER_SUFFIX: Record<QuestMarker, string> = {
  [QuestMarker.NONE]: "",
  [QuestMarker.CAN_ACCEPT]: "⚠️",
  [QuestMarker.CAN_TURN_IN]: "✅"
};

export function decorateButtonLabel(label: string, marker: QuestMarker | undefined): string {
  const suffix = marker === undefined ? "" : MARKER_SUFFIX[marker];

  return suffix ? `${label} ${suffix}` : label;
}

export function stripQuestMarkerSuffix(label: string): string {
  return label.replace(/\s(?:⚠️|📜|✅)$/u, "");
}

export function mergeQuestMarkers(markers: readonly (QuestMarker | undefined)[]): QuestMarker {
  return markers.reduce<QuestMarker>((strongest, marker) => {
    if (marker === undefined) {
      return strongest;
    }

    return marker > strongest ? marker : strongest;
  }, QuestMarker.NONE);
}

export function resolveQuestMarkerForTarget(
  input: QuestMarkerInput | undefined,
  target: QuestMarkerTarget
): QuestMarker {
  if (!input) {
    return QuestMarker.NONE;
  }

  switch (target) {
    case "quest.adventure":
      return canOpenAdventure(input) ? QuestMarker.CAN_ACCEPT : QuestMarker.NONE;
    case "quest.fight":
      return input.fight?.state === "ready" ? QuestMarker.CAN_ACCEPT : QuestMarker.NONE;
    case "quest.problem":
      return getProblemQuestMarker(input);
    case "quest.first-korchma":
      return getFirstKorchmaQuestMarker(input.firstKorchmaQuest);
    case "quest.yeger":
      return getYegerMarker(input.yeger);
    case "quest.cellar":
      return input.cellar?.state === "ready" ? QuestMarker.CAN_ACCEPT : QuestMarker.NONE;
    case "quest.cellar-grownup":
      return getCellarGrownupMarker(input.cellarGrownup);
    case "quest.barrel-beer-tutorial":
      return getBarrelBeerTutorialMarker(input.barrelBeerTutorial);
    case "quest.daily-korchma-round":
      return getDailyKorchmaRoundMarker(input.dailyKorchmaRound);
    case "quest.charkokovalnia":
      return getCharkokovalniaMarker(input.itemUpgrades);
    case "quest.fighting-corner-onboarding":
      return getFightingCornerOnboardingMarker(input.fightingCornerQuest);
    case "location.korchma.quest-table":
    case "menu.quest":
      return mergeQuestMarkers([
        resolveQuestMarkerForTarget(input, "quest.adventure"),
        resolveQuestMarkerForTarget(input, "quest.first-korchma"),
        resolveQuestMarkerForTarget(input, "quest.fight"),
        resolveQuestMarkerForTarget(input, "quest.problem"),
        resolveQuestMarkerForTarget(input, "quest.yeger"),
        resolveQuestMarkerForTarget(input, "quest.cellar"),
        resolveQuestMarkerForTarget(input, "quest.cellar-grownup"),
        resolveQuestMarkerForTarget(input, "quest.barrel-beer-tutorial"),
        resolveQuestMarkerForTarget(input, "quest.daily-korchma-round"),
        resolveQuestMarkerForTarget(input, "quest.charkokovalnia"),
        resolveQuestMarkerForTarget(input, "quest.fighting-corner-onboarding")
      ]);
    case "location.korchma.fighting-corner":
      return input.fightingCornerQuest?.state === "in-progress"
        ? QuestMarker.CAN_ACCEPT
        : QuestMarker.NONE;
    case "location.korchma.bar":
      return mergeQuestMarkers([
        resolveQuestMarkerForTarget(input, "quest.problem"),
        getBarrelBeerTutorialBarMarker(input.barrelBeerTutorial),
        input.cellarGrownup?.state === "bottle-obtained" ? QuestMarker.CAN_TURN_IN : QuestMarker.NONE
      ]);
    case "location.korchma.barrel":
      return mergeQuestMarkers([
        input.yeger?.state === "offered" ? QuestMarker.CAN_ACCEPT : QuestMarker.NONE,
        getBarrelBeerTutorialBarrelMarker(input.barrelBeerTutorial)
      ]);
    case "location.korchma.cellar":
      return mergeQuestMarkers([
        resolveQuestMarkerForTarget(input, "quest.cellar"),
        resolveQuestMarkerForTarget(input, "quest.cellar-grownup")
      ]);
    case "location.korchma.ranger-corner":
      return resolveQuestMarkerForTarget(input, "quest.yeger");
    case "location.korchma.yard":
      return resolveQuestMarkerForTarget(input, "quest.charkokovalnia");
    case "location.korchma.front":
      return QuestMarker.NONE;
    case "location.korchma.hall":
      return mergeQuestMarkers([
        resolveQuestMarkerForTarget(input, "location.korchma.quest-table"),
        resolveQuestMarkerForTarget(input, "location.korchma.bar"),
        resolveQuestMarkerForTarget(input, "location.korchma.barrel"),
        resolveQuestMarkerForTarget(input, "location.korchma.cellar"),
        resolveQuestMarkerForTarget(input, "location.korchma.ranger-corner"),
        resolveQuestMarkerForTarget(input, "location.korchma.yard"),
        resolveQuestMarkerForTarget(input, "location.korchma.fighting-corner")
      ]);
  }
}

export function resolveQuestMarkerForPresenceLocation(
  input: QuestMarkerInput | undefined,
  locationId: string | null | undefined
): QuestMarker {
  if (!locationId) {
    return resolveQuestMarkerForTarget(input, "location.korchma.hall");
  }

  switch (normalizePresenceLocationId(locationId)) {
    case PRESENCE_LOCATION_KORCHMA_HALL:
      return resolveQuestMarkerForTarget(input, "location.korchma.hall");
    case PRESENCE_LOCATION_KORCHMA_FRONT:
      return resolveQuestMarkerForTarget(input, "location.korchma.front");
    case PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER:
      return resolveQuestMarkerForTarget(input, "location.korchma.fighting-corner");
    case PRESENCE_LOCATION_KORCHMA_YARD:
      return resolveQuestMarkerForTarget(input, "location.korchma.yard");
    case PRESENCE_LOCATION_KORCHMA_QUEST_TABLE:
      return resolveQuestMarkerForTarget(input, "location.korchma.quest-table");
    case PRESENCE_LOCATION_KORCHMA_BAR:
      return resolveQuestMarkerForTarget(input, "location.korchma.bar");
    case PRESENCE_LOCATION_KORCHMA_BARREL:
      return resolveQuestMarkerForTarget(input, "location.korchma.barrel");
    case PRESENCE_LOCATION_KORCHMA_CELLAR:
      return resolveQuestMarkerForTarget(input, "location.korchma.cellar");
    case PRESENCE_LOCATION_KORCHMA_RANGER_CORNER:
      return resolveQuestMarkerForTarget(input, "location.korchma.ranger-corner");
    default:
      return QuestMarker.NONE;
  }
}

function getFightingCornerOnboardingMarker(
  quest: QuestMarkerInput["fightingCornerQuest"]
): QuestMarker {
  if (quest?.state === "turn-in-ready") {
    return QuestMarker.CAN_TURN_IN;
  }
  return quest?.state === "available" ? QuestMarker.CAN_ACCEPT : QuestMarker.NONE;
}

function getYegerMarker(
  yeger: QuestMarkerInput["yeger"]
): QuestMarker {
  if (yeger?.state === "turn-in-ready") {
    return QuestMarker.CAN_TURN_IN;
  }

  if (yeger?.state === "offered") {
    return QuestMarker.CAN_ACCEPT;
  }

  return QuestMarker.NONE;
}

function getProblemQuestMarker(input: QuestMarkerInput): QuestMarker {
  const progress = getProblemQuestProgress(input);

  if (!progress || !canOpenProblemQuestInBar(input, progress)) {
    return QuestMarker.NONE;
  }

  if (progress.completed && !progress.rewardClaimed) {
    return QuestMarker.CAN_TURN_IN;
  }

  if (!progress.issued || progress.rewardClaimed) {
    return QuestMarker.CAN_ACCEPT;
  }

  return QuestMarker.NONE;
}

function getFirstKorchmaQuestMarker(
  quest: QuestMarkerInput["firstKorchmaQuest"]
): QuestMarker {
  return quest?.state === "active" ? QuestMarker.CAN_ACCEPT : QuestMarker.NONE;
}

function getCellarGrownupMarker(
  grownup: QuestMarkerInput["cellarGrownup"]
): QuestMarker {
  if (grownup?.state === "bottle-obtained") {
    return QuestMarker.CAN_TURN_IN;
  }

  if (grownup?.state === "offered") {
    return QuestMarker.CAN_ACCEPT;
  }

  return QuestMarker.NONE;
}

function getDailyKorchmaRoundMarker(
  round: QuestMarkerInput["dailyKorchmaRound"]
): QuestMarker {
  if (round?.state === "turn-in-ready") {
    return QuestMarker.CAN_TURN_IN;
  }

  if (round?.state === "not-issued") {
    return QuestMarker.CAN_ACCEPT;
  }

  return QuestMarker.NONE;
}

function getCharkokovalniaMarker(
  itemUpgrades: QuestMarkerInput["itemUpgrades"]
): QuestMarker {
  if (itemUpgrades?.state !== "unlock-required") {
    return QuestMarker.NONE;
  }

  return itemUpgrades.fieldKitQuantity > 0 ? QuestMarker.CAN_TURN_IN : QuestMarker.CAN_ACCEPT;
}

function getBarrelBeerTutorialMarker(
  quest: QuestMarkerInput["barrelBeerTutorial"]
): QuestMarker {
  if (quest?.state === "turn-in-ready") {
    return QuestMarker.CAN_TURN_IN;
  }

  if (
    quest?.state === "in-progress" &&
    quest.progress.visitedBarrel &&
    quest.progress.raidCompleted &&
    quest.progress.beerRoundOffered &&
    quest.progress.beerDrunk &&
    quest.progress.activeBeer
  ) {
    return QuestMarker.CAN_TURN_IN;
  }

  if (quest?.state === "available") {
    return QuestMarker.CAN_ACCEPT;
  }

  return QuestMarker.NONE;
}

function getBarrelBeerTutorialBarrelMarker(
  quest: QuestMarkerInput["barrelBeerTutorial"]
): QuestMarker {
  if (quest?.state !== "in-progress") {
    return QuestMarker.NONE;
  }

  return !quest.progress.visitedBarrel || !quest.progress.raidCompleted
    ? QuestMarker.CAN_ACCEPT
    : QuestMarker.NONE;
}

function getBarrelBeerTutorialBarMarker(
  quest: QuestMarkerInput["barrelBeerTutorial"]
): QuestMarker {
  if (quest?.state !== "in-progress") {
    return QuestMarker.NONE;
  }

  return quest.progress.visitedBarrel &&
    quest.progress.raidCompleted &&
    (!quest.progress.beerRoundOffered || !quest.progress.beerDrunk || !quest.progress.activeBeer)
    ? QuestMarker.CAN_ACCEPT
    : QuestMarker.NONE;
}

function canOpenAdventure(input: QuestMarkerInput): boolean {
  return (
    input.adventure?.state === "ready" ||
    (input.adventure?.state === "level-locked" &&
      (input.characterLevel ?? 0) <= STARTER_ACTIVITY_MAX_LEVEL &&
      input.starterAdventure?.state === "ready")
  );
}

function canOpenProblemQuestInBar(input: QuestMarkerInput, progress: ProblemQuestProgress): boolean {
  if (!canOpenFightingCorner(input)) {
    return false;
  }

  if (progress.branchComplete) {
    return false;
  }

  if (!progress.issued) {
    return true;
  }

  return progress.completed || progress.rewardClaimed;
}

function canOpenFightingCorner(input: QuestMarkerInput): boolean {
  return input.characterLevel === undefined || meetsActivityLevel(input.characterLevel, FIGHTING_CORNER_MIN_LEVEL);
}

function getProblemQuestProgress(input: QuestMarkerInput): ProblemQuestProgress | null {
  if (input.problemQuest) {
    return input.problemQuest;
  }

  if (input.fight && "questProgress" in input.fight) {
    return input.fight.questProgress;
  }

  return null;
}

export function canOpenBestiaryFromMarkers(input: QuestMarkerInput): boolean {
  return input.characterLevel === undefined || meetsActivityLevel(input.characterLevel, BESTIARY_MIN_LEVEL);
}
