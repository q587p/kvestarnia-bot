import type { Bot, Context } from "grammy";
import type { FightService } from "../../services/fightService";
import {
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import { buildFightKeyboard } from "../keyboards/fightKeyboard";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentFightAlreadyCompleted,
  presentFightNoCharacter,
  presentFightStart
} from "../presenters/fightPresenter";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type ReplyOptions = Parameters<Context["reply"]>[1];

export interface FightCommandOptions {
  presence: PresenceService;
}

export function registerFightCommand(
  bot: Bot,
  fightService: FightService,
  options: FightCommandOptions
): void {
  bot.command(["fight", "hunt"], async (ctx) => {
    await sendFight(ctx, fightService, "reply", {
      ...options,
      requireKorchmaInterior: true
    });
  });
}

export async function sendFight(
  ctx: Context,
  fightService: FightService,
  mode: "reply" | "edit",
  options?: FightCommandOptions & {
    requireKorchmaInterior?: boolean;
  }
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (options?.requireKorchmaInterior === true) {
    const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await sendText(ctx, mode, presentFightNoCharacter());
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
      return;
    }
  }

  const result = await fightService.getMimicShawarmaForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentFightNoCharacter());
    return;
  }

  if (options?.presence) {
    await markFightPresence(ctx, options.presence);
  }

  if (result.state === "already-completed") {
    await sendText(ctx, mode, presentFightAlreadyCompleted(result));
    return;
  }

  await sendText(ctx, mode, presentFightStart(result.character), true);
}

async function markFightPresence(ctx: Context, presence: PresenceService): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard: boolean | "enter-korchma" = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup: keyboard === "enter-korchma" ? buildKorchmaFrontKeyboard() : buildFightKeyboard()
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
