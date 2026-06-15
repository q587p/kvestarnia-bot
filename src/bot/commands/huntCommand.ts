import type { Bot, Context } from "grammy";
import type { TavernRaidService } from "../../services/tavernRaidService";
import type { YegerQuestService } from "../../services/yegerQuestService";
import {
  PRESENCE_ADVENTURE_HUNT_BOARD,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import { buildYegerCornerKeyboard, buildYegerKeyboard } from "../keyboards/yegerKeyboard";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentYegerCorner,
  presentYegerNoCharacter,
  presentYegerQuest
} from "../presenters/yegerPresenter";
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
  yegerQuestService: YegerQuestService,
  options: HuntCommandOptions
): void {
  bot.command("hunt", async (ctx) => {
    await sendHuntBoard(ctx, yegerQuestService, "reply", {
      ...options,
      requireKorchmaInterior: true
    });
  });
}

export async function sendHuntBoard(
  ctx: Context,
  yegerQuestService: YegerQuestService,
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
      await sendText(ctx, mode, presentYegerNoCharacter());
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
      return;
    }
  }

  const result = await yegerQuestService.getForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentYegerNoCharacter());
    return;
  }

  await markHuntPresence(ctx, options?.presence);
  await sendText(ctx, mode, presentYegerQuest(result), result);
}

export async function sendYegerCorner(
  ctx: Context,
  yegerQuestService: YegerQuestService,
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
      await sendText(ctx, mode, presentYegerNoCharacter());
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
      return;
    }
  }

  const result = await yegerQuestService.getForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentYegerNoCharacter());
    return;
  }

  await markHuntPresence(ctx, options?.presence);
  await sendText(ctx, mode, presentYegerCorner(result), {
    kind: "corner",
    result
  });
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
    locationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_HUNT_BOARD
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | Parameters<typeof buildYegerKeyboard>[0]
    | { kind: "corner"; result: Parameters<typeof buildYegerCornerKeyboard>[0] }
    | "enter-korchma"
    | false = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup: buildReplyMarkup(keyboard)
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

function buildReplyMarkup(
  keyboard:
    | Parameters<typeof buildYegerKeyboard>[0]
    | { kind: "corner"; result: Parameters<typeof buildYegerCornerKeyboard>[0] }
    | "enter-korchma"
) {
  if (keyboard === "enter-korchma") {
    return buildKorchmaFrontKeyboard();
  }

  if ("kind" in keyboard) {
    return buildYegerCornerKeyboard(keyboard.result);
  }

  return buildYegerKeyboard(keyboard);
}
