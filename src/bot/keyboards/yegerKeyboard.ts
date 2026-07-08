import { InlineKeyboard } from "grammy";
import type { ItemCraftOption } from "../../services/itemCraftService";
import type {
  YegerNotchExchangeLookupResult,
  YegerQuestLookupResult,
  YegerQuestTurnInResult
} from "../../services/yegerQuestService";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makeItemCraftPreviewCallbackData } from "../callbacks/itemCraftCallbackData";
import { makeItemDetailCallbackData } from "../callbacks/itemCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  makeYegerBandagesCallbackData,
  makeYegerBuyBandageCallbackData,
  makeYegerCancelBandagePurchaseCallbackData,
  makeYegerConfirmBandagePurchaseCallbackData,
  makeYegerFieldKitHelpCallbackData,
  makeYegerFreeBandageCallbackData,
  makeYegerHelpCallbackData,
  makeYegerNotchExchangeCallbackData,
  makeYegerNotchExchangeOpenCallbackData,
  makeYegerOpenCallbackData,
  makeYegerOutsideCallbackData,
  makeYegerQuestCallbackData,
  makeYegerStartCallbackData,
  makeYegerTrackCallbackData,
  makeYegerTurnInCallbackData
} from "../callbacks/yegerCallbackData";
import { presentYegerQuestTitle } from "../presenters/yegerQuestTitle";
import {
  decorateButtonLabel,
  mergeQuestMarkers,
  QuestMarker,
  resolveQuestMarkerForTarget,
  type QuestMarkerInput
} from "./questButtonMarkers";

export interface YegerNavigationOptions {
  questMarkers?: QuestMarkerInput | null;
  showFieldKitHelp?: boolean;
  showYardShortcut?: boolean;
}

export function buildYegerKeyboard(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): InlineKeyboard {
  if (result.state === "offered") {
    return baseYegerKeyboard()
      .text("🏹 Взяти справу", makeYegerStartCallbackData())
      .row()
      .text("📖 Кого шукати?", makeYegerHelpCallbackData())
      .row()
      .text("⬅️ До єгерського кутка", makeYegerOpenCallbackData());
  }

  if (result.state === "in-progress") {
    return baseYegerKeyboard()
      .text("🚪 Надвір", makeYegerOutsideCallbackData())
      .row()
      .text("📖 Кого шукати?", makeYegerHelpCallbackData())
      .row()
      .text("⬅️ До єгерського кутка", makeYegerOpenCallbackData());
  }

  if (result.state === "turn-in-ready") {
    return baseYegerKeyboard()
      .text(
        decorateButtonLabel("🏹 Здати Єгерю", resolveQuestMarkerForTarget({ yeger: result }, "quest.yeger")),
        makeYegerTurnInCallbackData()
      )
      .row()
      .text("📖 Кого шукати?", makeYegerHelpCallbackData())
      .row()
      .text("⬅️ До єгерського кутка", makeYegerOpenCallbackData());
  }

  if (result.state === "completed") {
    const keyboard = new InlineKeyboard();

    addRewardItemButton(keyboard, result.reward);

    return keyboard
      .text("📖 Бестіарій", makeBestiaryListCallbackData(0))
      .row()
      .text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildYegerHuntKeyboard(
  result: Extract<YegerQuestLookupResult, { state: "in-progress" }>
): InlineKeyboard {
  return inProgressKeyboard(result.tracking.state);
}

export function buildYegerCornerKeyboard(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>,
  options: YegerNavigationOptions = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "turn-in-ready") {
    keyboard.text(
      decorateButtonLabel("🏹 Здати Єгерю", resolveQuestMarkerForTarget({ yeger: result }, "quest.yeger")),
      makeYegerTurnInCallbackData()
    ).row();
  } else if (result.state !== "level-locked" && result.state !== "completed") {
    keyboard.text(
      decorateButtonLabel(
        `🏹 ${presentYegerQuestTitle(result.progress)}`,
        resolveQuestMarkerForTarget({ yeger: result }, "quest.yeger")
      ),
      makeYegerQuestCallbackData()
    ).row();
  }

  if (isBaseYegerQuestCompleted(result)) {
    keyboard.text("🩹 Бинти", makeYegerBandagesCallbackData()).row();
  }

  if (options.showFieldKitHelp) {
    keyboard.text("🧰 Аптечка?", makeYegerFieldKitHelpCallbackData()).row();
  }

  if (result.state === "completed" && result.notchExchange && result.notchExchange.options.length > 0) {
    keyboard.text("🪵 Обміняти риску", makeYegerNotchExchangeOpenCallbackData()).row();
  }

  return keyboard
    .text("📖 Бестіарій", makeBestiaryListCallbackData(0))
    .row()
    .text(buildBackToBarrelLabel(options), makePlaceCallbackData("barrel"));
}

export function buildYegerBandagesKeyboard(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>,
  options: { craftOptions?: ItemCraftOption[]; questMarkers?: QuestMarkerInput | null } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (isBaseYegerQuestCompleted(result)) {
    keyboard.text("🩹 1 бинт", makeYegerBuyBandageCallbackData(1));
    keyboard.text("🩹 5 бинтів", makeYegerBuyBandageCallbackData(5)).row();
    keyboard.text("🩹 17 бинтів", makeYegerBuyBandageCallbackData(17));
    keyboard.text("🩹 93 бинти", makeYegerBuyBandageCallbackData(93)).row();
    addCraftButtons(keyboard, options.craftOptions ?? []);
    if (result.character.classId === "class.ranger") {
      if (result.rangerBandage?.state === "available") {
        keyboard.text("🧰 5 єгерських бинтів", makeYegerFreeBandageCallbackData("bandage")).row();
      }
      if (result.rangerDenseBandage?.state === "available") {
        keyboard.text("🧵 Єгерський щільний", makeYegerFreeBandageCallbackData("dense-bandage")).row();
      }
      if (result.rangerFieldKit?.state === "available") {
        keyboard.text("🧰 Єгерська аптечка", makeYegerFreeBandageCallbackData("field-kit")).row();
      }
    }
  }

  return keyboard
    .text("⬅️ До єгерського кутка", makeYegerOpenCallbackData())
    .row()
    .text(buildBackToBarrelLabel(options), makePlaceCallbackData("barrel"));
}

export function buildYegerNotchExchangeKeyboard(
  result: YegerNotchExchangeLookupResult,
  options: YegerNavigationOptions = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "ready") {
    for (const option of result.summary.options) {
      keyboard
        .text(
          presentNotchExchangeButtonLabel(option),
          makeYegerNotchExchangeCallbackData(option.kind, result.summary.availableNotches)
        )
        .row();
    }
  }

  return keyboard
    .text("⬅️ До єгерського кутка", makeYegerOpenCallbackData())
    .row()
    .text(buildBackToBarrelLabel(options), makePlaceCallbackData("barrel"));
}

function isBaseYegerQuestCompleted(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): boolean {
  return result.state === "completed" || (
    result.state !== "level-locked" && result.progress.stageId === "second"
  );
}

export function buildYegerBandagePurchaseKeyboard(
  token: string,
  options: { confirmLabel?: string } = {}
): InlineKeyboard {
  return new InlineKeyboard()
    .text(options.confirmLabel ?? "✅ Купити", makeYegerConfirmBandagePurchaseCallbackData(token))
    .text("✖️ Скасувати", makeYegerCancelBandagePurchaseCallbackData(token))
    .row()
    .text("⬅️ До єгерського кутка", makeYegerOpenCallbackData());
}

export function buildYegerTurnInKeyboard(
  result: Exclude<YegerQuestTurnInResult, { state: "no-character" }>,
  options: {
    craftOptions?: ItemCraftOption[];
    notchExchange?: YegerNotchExchangeLookupResult;
    questMarkers?: QuestMarkerInput | null;
  } = {}
): InlineKeyboard {
  if (result.state === "not-started") {
    return new InlineKeyboard()
      .text("🏹 Взяти справу", makeYegerStartCallbackData())
      .row()
      .text("⬅️ До єгерського кутка", makeYegerOpenCallbackData());
  }

  if (result.state === "not-ready") {
    return inProgressKeyboard();
  }

  const keyboard = new InlineKeyboard();

  if (result.state === "completed" || result.state === "already-completed") {
    addRewardItemButton(keyboard, result.reward);
    if (options.notchExchange?.state === "ready" && options.notchExchange.summary.options.length > 0) {
      keyboard.text("🪵 Обміняти риску", makeYegerNotchExchangeOpenCallbackData()).row();
    }
    addCraftButtons(keyboard, options.craftOptions ?? []);
  }

  return keyboard
    .text("⬅️ До єгерського кутка", makeYegerOpenCallbackData())
    .row()
    .text(buildBackToBarrelLabel(options), makePlaceCallbackData("barrel"));
}

export function buildYegerHelpKeyboard(options: YegerNavigationOptions = {}): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (options.showYardShortcut) {
    keyboard.text("Перейти в задвірок", makePlaceCallbackData("yard")).row();
  }

  return keyboard
    .text("⬅️ До єгерського кутка", makeYegerOpenCallbackData())
    .row()
    .text("📖 Бестіарій", makeBestiaryListCallbackData(0))
    .row()
    .text(buildBackToBarrelLabel(options), makePlaceCallbackData("barrel"));
}

function inProgressKeyboard(
  trackingState: "none" | "tracking-pending" | "tracking-ready" = "none"
): InlineKeyboard {
  const trackButtonText = trackingState === "tracking-ready"
    ? "🔎 Перевірити слід"
    : trackingState === "tracking-pending"
      ? "⏳ Чекати слід"
      : "👣 Взяти слід";

  return baseYegerKeyboard()
    .text(trackButtonText, makeYegerTrackCallbackData())
    .row()
    .text("⬅️ Надвір", makePlaceCallbackData("front"));
}

function baseYegerKeyboard(): InlineKeyboard {
  return new InlineKeyboard();
}

function addRewardItemButton(
  keyboard: InlineKeyboard,
  reward: { itemGrants: Array<{ itemId: string; name: string }> }
): InlineKeyboard {
  const item = reward.itemGrants[0];

  if (!item) {
    return keyboard;
  }

  return keyboard.text(`🔎 ${item.name}`, makeItemDetailCallbackData(item.itemId)).row();
}

function addCraftButtons(
  keyboard: InlineKeyboard,
  craftOptions: ItemCraftOption[]
): InlineKeyboard {
  for (const option of craftOptions) {
    keyboard.text(option.recipe.buttonLabel, makeItemCraftPreviewCallbackData(option.recipe.code)).row();
  }

  return keyboard;
}

function presentNotchExchangeButtonLabel(
  option: Extract<YegerNotchExchangeLookupResult, { state: "ready" }>["summary"]["options"][number]
): string {
  switch (option.kind) {
    case "dense-bandage":
      return "🧵 Риску на щільний бинт";
    case "field-kit":
      return "🧰 2 риски на аптечку";
  }
}

function buildBackToBarrelLabel(options: YegerNavigationOptions): string {
  return decorateButtonLabel("🛢️ До Бочки", resolveBackToBarrelMarker(options.questMarkers));
}

function resolveBackToBarrelMarker(questMarkers: QuestMarkerInput | null | undefined): QuestMarker {
  const input = questMarkers ?? undefined;

  if (!input) {
    return QuestMarker.NONE;
  }

  return mergeQuestMarkers([
    resolveQuestMarkerForTarget(input, "quest.adventure"),
    resolveQuestMarkerForTarget(input, "quest.fight"),
    resolveQuestMarkerForTarget(input, "quest.daily-korchma-round"),
    getTableOnlyBarrelBeerTutorialMarker(input),
    resolveQuestMarkerForTarget(input, "location.korchma.bar"),
    resolveQuestMarkerForTarget(input, "location.korchma.cellar")
  ]);
}

function getTableOnlyBarrelBeerTutorialMarker(input: QuestMarkerInput): QuestMarker {
  const marker = resolveQuestMarkerForTarget(input, "quest.barrel-beer-tutorial");

  if (marker === QuestMarker.NONE) {
    return QuestMarker.NONE;
  }

  return resolveQuestMarkerForTarget(input, "location.korchma.barrel") === QuestMarker.NONE &&
    resolveQuestMarkerForTarget(input, "location.korchma.bar") === QuestMarker.NONE
    ? marker
    : QuestMarker.NONE;
}
