import type { Bot, Context } from "grammy";
import type { HuntService } from "../../services/huntService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import {
  PRESENCE_ADVENTURE_HUNT_BOARD,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import { buildHuntBoardKeyboard } from "../keyboards/huntKeyboard";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentHuntAlreadyCompleted,
  presentHuntBoard,
  presentHuntMissingContractMonster,
  presentHuntNoCharacter
} from "../presenters/huntPresenter";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

type ReplyOptions = Parameters<Context["reply"]>[1];

export interface HuntCommandOptions {
  presence: PresenceService;
  tavernRaid?: TavernRaidService;
}

export function registerHuntCommand(
  bot: Bot,
  huntService: HuntService,
  options: HuntCommandOptions
): void {
  bot.command("hunt", async (ctx) => {
    await sendHuntBoard(ctx, huntService, "reply", {
      ...options,
      requireKorchmaInterior: true
    });
  });
}

export async function sendHuntBoard(
  ctx: Context,
  huntService: HuntService,
  mode: "reply" | "edit",
  options?: HuntCommandOptions & {
    requireKorchmaInterior?: boolean;
  }
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (
    await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options?.tavernRaid, mode)
  ) {
    return;
  }

  if (options?.requireKorchmaInterior === true) {
    const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await sendText(ctx, mode, presentHuntNoCharacter());
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
      return;
    }
  }

  const result = await huntService.getHuntBoardForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentHuntNoCharacter());
    return;
  }

  await markHuntPresence(ctx, options?.presence);

  if (result.state === "missing-contract-monster") {
    await sendText(ctx, mode, presentHuntMissingContractMonster(result));
    return;
  }

  if (result.state === "already-completed") {
    await sendText(ctx, mode, presentHuntAlreadyCompleted(result));
    return;
  }

  await sendText(ctx, mode, presentHuntBoard(result), result);
}

export async function markHuntPresence(
  ctx: Context,
  presence: PresenceService | undefined
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player || !presence) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_HUNT_BOARD
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard: Parameters<typeof buildHuntBoardKeyboard>[0] | "enter-korchma" | false = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "enter-korchma" ? buildKorchmaFrontKeyboard() : buildHuntBoardKeyboard(keyboard)
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
