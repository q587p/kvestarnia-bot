import type { Bot, Context } from "grammy";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { telegramUserIdFromContext } from "../context";
import { buildTavernKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentTavern,
  presentTavernAlreadyRaided,
  presentTavernNoCharacter
} from "../presenters/tavernPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type ReplyOptions = Parameters<Context["reply"]>[1];

export function registerTavernCommand(bot: Bot, tavernRaidService: TavernRaidService): void {
  bot.command(["tavern", "raid"], async (ctx) => {
    await sendTavern(ctx, tavernRaidService, "reply");
  });
}

export async function sendTavern(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "already-completed") {
    await sendText(ctx, mode, presentTavernAlreadyRaided(result.character));
    return;
  }

  await sendText(ctx, mode, presentTavern(result.character), true);
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
        reply_markup: buildTavernKeyboard()
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
