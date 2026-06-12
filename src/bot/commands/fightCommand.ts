import type { Bot, Context } from "grammy";
import type { FightService } from "../../services/fightService";
import { telegramUserIdFromContext } from "../context";
import { buildFightKeyboard } from "../keyboards/fightKeyboard";
import { presentFightNoCharacter, presentFightStart } from "../presenters/fightPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type ReplyOptions = Parameters<Context["reply"]>[1];

export function registerFightCommand(bot: Bot, fightService: FightService): void {
  bot.command(["fight", "hunt"], async (ctx) => {
    await sendFight(ctx, fightService, "reply");
  });
}

export async function sendFight(
  ctx: Context,
  fightService: FightService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await fightService.getMimicShawarmaForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentFightNoCharacter());
    return;
  }

  await sendText(ctx, mode, presentFightStart(result.character), true);
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
        reply_markup: buildFightKeyboard()
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
