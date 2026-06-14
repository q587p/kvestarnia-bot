import type { Bot, Context } from "grammy";
import type { AdventureService } from "../../services/adventureService";
import type { CellarErrandService } from "../../services/cellarErrandService";
import type { FightService } from "../../services/fightService";
import type { HuntService } from "../../services/huntService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import {
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import { buildQuestHubKeyboard } from "../keyboards/questHubKeyboard";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentKorchmaQuestGate,
  presentQuestHub,
  presentQuestHubNoCharacter,
  type QuestHubSnapshot
} from "../presenters/questHubPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

type ReplyOptions = Parameters<Context["reply"]>[1];

export interface QuestHubCommandOptions {
  adventure: AdventureService;
  cellarErrand: CellarErrandService;
  fight: FightService;
  hunt: HuntService;
  presence: PresenceService;
  tavernRaid?: TavernRaidService;
}

export function registerQuestHubCommand(bot: Bot, options: QuestHubCommandOptions): void {
  bot.command("quest", async (ctx) => {
    await sendQuestHub(ctx, options, "reply");
  });
}

export async function sendQuestHub(
  ctx: Context,
  options: QuestHubCommandOptions,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (
    await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, mode)
  ) {
    return;
  }

  const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await sendText(ctx, mode, presentQuestHubNoCharacter());
    return;
  }

  if (!place.insideKorchma) {
    await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
    return;
  }

  const snapshot = await buildQuestHubSnapshot(telegramUserId, options);

  if (!snapshot) {
    await sendText(ctx, mode, presentQuestHubNoCharacter());
    return;
  }

  await markQuestTablePresence(ctx, options.presence);
  await sendText(ctx, mode, presentQuestHub(snapshot), snapshot);
}

async function buildQuestHubSnapshot(
  telegramUserId: bigint,
  options: QuestHubCommandOptions
): Promise<QuestHubSnapshot | null> {
  const adventure = await options.adventure.getMimicShawarmaForTelegramUser(telegramUserId);

  if (adventure.state === "no-character") {
    return null;
  }

  const fight = await options.fight.getMimicShawarmaForTelegramUser(telegramUserId);
  const hunt = await options.hunt.getHuntBoardForTelegramUser(telegramUserId);
  const cellar = await options.cellarErrand.getForTelegramUser(telegramUserId);

  if (fight.state === "no-character" || hunt.state === "no-character" || cellar.state === "no-character") {
    return null;
  }

  return {
    character: adventure.character,
    adventure,
    fight,
    hunt,
    cellar
  };
}

async function markQuestTablePresence(ctx: Context, presence: PresenceService): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: null
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard: QuestHubSnapshot | "enter-korchma" | false = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "enter-korchma" ? buildKorchmaFrontKeyboard() : buildQuestHubKeyboard(keyboard)
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
