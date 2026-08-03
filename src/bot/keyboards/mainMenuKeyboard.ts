import { InlineKeyboard, Keyboard } from "grammy";
import { makeDevResetCallbackData } from "../callbacks/devResetCallbackData";
import { makeRestartCallbackData } from "../callbacks/restartCallbackData";
import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  PRESENCE_LOCATION_KORCHMA_YARD,
  normalizePresenceLocationId
} from "../../services/presenceService";
import {
  QuestMarker,
  decorateButtonLabel,
  resolveQuestMarkerForPresenceLocation,
  stripQuestMarkerSuffix,
  type QuestMarkerInput
} from "./questButtonMarkers";

export const mainMenuButtons = {
  hero: "👤 Персонаж",
  equipment: "🛡️ Спорядження",
  tavern: "🍺 Корчма",
  quest: "🗺️ Квести",
  inventory: "🎒 Манатки",
  participants: "👀 Хто поруч",
  guild: "🏰 Ґільдії",
  help: "📖 Допомога",
  admin: "🧰 Адмінка"
} as const;

export const mainMenuLocationButtons = {
  fallback: mainMenuButtons.tavern,
  front: "🚪 Перед корчмою",
  yard: "🪣 Задвірок корчми",
  hall: "🍺 Зала корчми",
  questTable: "📋 Стіл зі справами",
  bar: "🍻 Шинок",
  cellar: "🧹 Льох корчми",
  barrel: "🛢️ Біля Бочки",
  newsCorner: "📰 Дошка корчми",
  rangerCorner: "🏹 Єгерський куток",
  fightingCorner: "🥊 Бійцівський куток",
  deep: "🪜 Низ",
  deepLevel1: "🧱 Сутерени Корчми",
  deepLeft: "⬅️ Лівий прохід",
  deepStraight: "🚪 Прямий прохід",
  deepRight: "➡️ Правий прохід"
} as const;

const locationButtonByPresenceId = new Map<string, string>([
  [PRESENCE_LOCATION_KORCHMA_FRONT, mainMenuLocationButtons.front],
  [PRESENCE_LOCATION_KORCHMA_YARD, mainMenuLocationButtons.yard],
  [PRESENCE_LOCATION_KORCHMA_HALL, mainMenuLocationButtons.hall],
  [PRESENCE_LOCATION_KORCHMA_QUEST_TABLE, mainMenuLocationButtons.questTable],
  [PRESENCE_LOCATION_KORCHMA_BAR, mainMenuLocationButtons.bar],
  [PRESENCE_LOCATION_KORCHMA_CELLAR, mainMenuLocationButtons.cellar],
  [PRESENCE_LOCATION_KORCHMA_BARREL, mainMenuLocationButtons.barrel],
  [PRESENCE_LOCATION_KORCHMA_NEWS_CORNER, mainMenuLocationButtons.newsCorner],
  [PRESENCE_LOCATION_KORCHMA_RANGER_CORNER, mainMenuLocationButtons.rangerCorner],
  [PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER, mainMenuLocationButtons.fightingCorner],
  [PRESENCE_LOCATION_KORCHMA_DEEP, mainMenuLocationButtons.deep],
  [PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1, mainMenuLocationButtons.deepLevel1],
  [PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT, mainMenuLocationButtons.deepLeft],
  [PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT, mainMenuLocationButtons.deepStraight],
  [PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT, mainMenuLocationButtons.deepRight]
]);

const presenceIdByLocationButton = new Map<string, string>(
  [...locationButtonByPresenceId.entries()].map(([locationId, button]) => [button, locationId])
);

export const mainMenuLocationButtonTexts: readonly string[] = [
  mainMenuButtons.tavern,
  ...withQuestMarkerVariants([...new Set(Object.values(mainMenuLocationButtons))])
];

export const mainMenuQuestButtonTexts: readonly string[] = [
  ...withQuestMarkerVariants([mainMenuButtons.quest, "Квести"]),
  "🗺️ Квест"
];

export interface MainMenuKeyboardOptions {
  locationId?: string | null;
  includeAdmin?: boolean;
  questMarkers?: QuestMarkerInput | null;
}

export function buildMainMenuKeyboard(options: MainMenuKeyboardOptions = {}): Keyboard {
  const locationButton = getMainMenuLocationButtonText(options.locationId);
  const markedLocationButton = decorateButtonLabel(
    locationButton,
    resolveQuestMarkerForPresenceLocation(options.questMarkers ?? undefined, options.locationId)
  );

  const keyboard = new Keyboard()
    .text(mainMenuButtons.hero)
    .text(markedLocationButton)
    .row()
    .text(mainMenuButtons.quest)
    .text(mainMenuButtons.inventory)
    .row()
    .text(mainMenuButtons.participants)
    .text(mainMenuButtons.guild)
    .row()
    .text(mainMenuButtons.help);

  if (shouldIncludeAdminButton(options.includeAdmin)) {
    keyboard.text(mainMenuButtons.admin);
  }

  return keyboard.resized().persistent().placeholder("Що робимо далі?");
}

function shouldIncludeAdminButton(requested: boolean | undefined): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  if (requested !== undefined) {
    return requested;
  }

  return process.env.NODE_ENV !== "test";
}

export function getMainMenuLocationButtonText(locationId: string | null | undefined): string {
  if (!locationId) {
    return mainMenuButtons.tavern;
  }

  const normalized = normalizePresenceLocationId(locationId);

  return locationButtonByPresenceId.get(normalized) ?? mainMenuButtons.tavern;
}

export function isMainMenuLocationButtonText(text: string | undefined): boolean {
  return Boolean(text && mainMenuLocationButtonTexts.includes(text));
}

export function getMainMenuLocationButtonPresenceId(text: string | undefined): string | null {
  const strippedText = text ? stripQuestMarkerSuffix(text) : undefined;

  if (!strippedText || strippedText === mainMenuButtons.tavern) {
    return null;
  }

  return presenceIdByLocationButton.get(strippedText) ?? null;
}

function withQuestMarkerVariants(labels: readonly string[]): string[] {
  return labels.flatMap((label) => [
    label,
    decorateButtonLabel(label, QuestMarker.CAN_ACCEPT),
    decorateButtonLabel(label, QuestMarker.CAN_TURN_IN)
  ]);
}

export function buildDevResetKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Так, скинути", makeDevResetCallbackData("confirm"))
    .text("⬅️ Ні, лишити", makeDevResetCallbackData("cancel"));
}

export function buildRestartKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Так, почати з початку", makeRestartCallbackData("confirm"))
    .row()
    .text("⬅️ Ні, лишити персонажа", makeRestartCallbackData("cancel"));
}
