import type { Bot, Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_LOCATION_KORCHMA_CELLAR
} from "../../services/presenceService";
import type { CellarErrandService } from "../../services/cellarErrandService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import { buildCellarResultKeyboard } from "../keyboards/cellarKeyboard";
import {
  presentCellarCooldown,
  presentCellarNoCharacter,
  presentCellarStart
} from "../presenters/cellarPresenter";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
import { safeEditMessageText } from "../safeEditMessageText";

type ReplyOptions = Parameters<Context["reply"]>[1];

export function registerCellarCommand(
  bot: Bot,
  cellarErrandService: CellarErrandService,
  presenceService: PresenceService
): void {
  bot.command("cellar", async (ctx) => {
    await sendCellarErrandRouted(ctx, cellarErrandService, presenceService, "reply");
  });
}

export async function sendCellarErrandRouted(
  ctx: Context,
  cellarErrandService: CellarErrandService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, presentCellarNoCharacter());
    return;
  }

  const place = await presenceService.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await sendText(ctx, mode, presentCellarNoCharacter());
    return;
  }

  if (!place.insideKorchma) {
    await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
    return;
  }

  await sendCellarErrand(ctx, cellarErrandService, presenceService, mode);
}

export async function sendCellarErrand(
  ctx: Context,
  cellarErrandService: CellarErrandService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, presentCellarNoCharacter());
    return;
  }

  await markCellarPresence(ctx, presenceService);

  const result = await cellarErrandService.getForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentCellarNoCharacter());
    return;
  }

  if (result.state === "on-cooldown") {
    await sendText(ctx, mode, presentCellarCooldown(result), "on-cooldown");
    return;
  }

  await sendText(ctx, mode, presentCellarStart(result), "ready");
}

export async function markCellarPresence(
  ctx: Context,
  presenceService: PresenceService
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presenceService.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard: "ready" | "on-cooldown" | "enter-korchma" | false = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "enter-korchma" ? buildKorchmaFrontKeyboard() : buildCellarResultKeyboard(keyboard)
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
