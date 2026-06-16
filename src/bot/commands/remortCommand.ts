import type { Bot, Context } from "grammy";
import type { RemortService } from "../../services/remortService";
import { playerFromContext } from "../context";
import { buildRemortKeyboard } from "../keyboards/remortKeyboard";
import { presentRemort } from "../presenters/remortPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerRemortCommand(bot: Bot, remortService: RemortService): void {
  bot.command("remort", async (ctx) => {
    await sendRemort(ctx, remortService, "reply");
  });
}

export async function sendRemort(
  ctx: Context,
  remortService: RemortService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await remortService.openForTelegramUser(telegramUserId);

  await sendText(ctx, mode, presentRemort(result), {
    reply_markup: buildRemortKeyboard(result)
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  options: { reply_markup?: ReturnType<typeof buildRemortKeyboard> } = {}
): Promise<void> {
  const replyOptions = {
    ...HTML_MESSAGE_OPTIONS,
    ...options
  };

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, replyOptions);
    return;
  }

  await ctx.reply(text, replyOptions);
}
