import type { Context } from "grammy";
import type { MarkPlayerPresenceInput } from "../../services/presenceService";
import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_RAID_FRIDAY_BARREL
} from "../../services/presenceService";
import { mainMenuButtons } from "../keyboards/mainMenuKeyboard";

export type PresenceContext = Omit<MarkPlayerPresenceInput, "user">;

export function getPresenceContext(ctx: Context): PresenceContext | null {
  const callbackData = ctx.callbackQuery?.data;

  if (callbackData) {
    return getCallbackPresenceContext(callbackData);
  }

  const text = ctx.message?.text?.trim();

  if (!text) {
    return null;
  }

  return getTextPresenceContext(text);
}

export function getCallbackPresenceContext(data: string): PresenceContext | null {
  if (data.startsWith("v1:tavern:round")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_BAR,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:tavern:raid" || data === "v1:tavern:participants") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
      currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
      currentAdventureId: null
    };
  }

  if (data === "v1:tavern:ranger") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data.startsWith("v1:adv:mimic:")) {
    return {};
  }

  if (data.startsWith("v1:cellar:")) {
    return {};
  }

  if (data.startsWith("v1:fight:mimic:")) {
    return {};
  }

  if (data.startsWith("v1:fight:turn:")) {
    return {};
  }

  if (data.startsWith("v1:hunt:")) {
    return {};
  }

  if (data.startsWith("v1:ygr:")) {
    return {};
  }

  if (data.startsWith("v1:bst:")) {
    return {};
  }

  if (data.startsWith("v1:quest:")) {
    return {};
  }

  if (
    data.startsWith("v1:item:") ||
    data.startsWith("v1:equip:") ||
    data.startsWith("v1:chest:") ||
    data.startsWith("v1:lvlx:")
  ) {
    return {};
  }

  if (data.startsWith("v1:onb:")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:menu:tavern") {
    return {};
  }

  if (data === "v1:place:hall") {
    return {};
  }

  if (data === "v1:place:front") {
    return {};
  }

  if (data === "v1:place:quest-table") {
    return {};
  }

  if (data === "v1:place:bar") {
    return {};
  }

  if (data === "v1:place:barrel") {
    return {};
  }

  if (data === "v1:place:cellar") {
    return {};
  }

  if (data === "v1:place:news-corner") {
    return {};
  }

  if (data.startsWith("v1:news:")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (
    data.startsWith("v1:menu:") ||
    data.startsWith("v1:devreset:") ||
    data.startsWith("v1:restart:")
  ) {
    return {};
  }

  return null;
}

export function getTextPresenceContext(text: string): PresenceContext | null {
  const command = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s|$)/i)?.[1]?.toLowerCase();

  if (command) {
    return getCommandPresenceContext(command);
  }

  if (text === mainMenuButtons.tavern) {
    return {};
  }

  if (text === mainMenuButtons.quest) {
    return {};
  }

  if (
    text === mainMenuButtons.hero ||
    text === mainMenuButtons.inventory ||
    text === mainMenuButtons.participants ||
    text === mainMenuButtons.help
  ) {
    return {};
  }

  return null;
}

export function getCommandPresenceContext(command: string): PresenceContext | null {
  if (command === "start") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (command === "tavern") {
    return {};
  }

  if (command === "raid") {
    return {};
  }

  if (command === "adventure" || command === "quest" || command === "cellar") {
    return {};
  }

  if (
    command === "fight" ||
    command === "hunt" ||
    command === "bestiary" ||
    command === "monsters"
  ) {
    return {};
  }

  if (command === "news") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (
    command === "hero" ||
    command === "profile" ||
    command === "me" ||
    command === "inventory" ||
    command === "items" ||
    command === "bag" ||
    command === "equipment" ||
    command === "gear" ||
    command === "equip" ||
    command === "guild" ||
    command === "online" ||
    command === "look" ||
    command === "help" ||
    command === "support" ||
    command === "version" ||
    command === "restart" ||
    command === "dev_reset_me"
  ) {
    return {};
  }

  return null;
}
