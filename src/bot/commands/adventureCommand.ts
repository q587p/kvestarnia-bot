import type { Bot, Context } from "grammy";
import type { AdventureService } from "../../services/adventureService";
import { telegramUserIdFromContext } from "../context";
import { buildAdventureKeyboard } from "../keyboards/adventureKeyboard";
import {
  presentAdventureAlreadyCompleted,
  presentAdventureNoCharacter,
  presentAdventureStart
} from "../presenters/adventurePresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type ReplyOptions = Parameters<Context["reply"]>[1];

export function registerAdventureCommand(bot: Bot, adventureService: AdventureService): void {
  bot.command(["adventure", "quest"], async (ctx) => {
    await sendAdventure(ctx, adventureService, "reply");
  });
}

export async function sendAdventure(
  ctx: Context,
  adventureService: AdventureService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await adventureService.getMimicShawarmaForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentAdventureNoCharacter());
    return;
  }

  if (result.state === "already-completed") {
    await sendText(ctx, mode, presentAdventureAlreadyCompleted(result));
    return;
  }

  await sendText(ctx, mode, presentAdventureStart(result.character), true);
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  includeKeyboard = false
): Promise<void> {
  const options = includeKeyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup: buildAdventureKeyboard()
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
