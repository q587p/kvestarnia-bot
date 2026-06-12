import type { Bot, Context } from "grammy";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { telegramUserIdFromContext } from "../context";
import { buildTavernKeyboard } from "../keyboards/tavernKeyboard";
import { presentTavern, presentTavernNoCharacter } from "../presenters/tavernPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

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
        reply_markup: buildTavernKeyboard()
      }
    : undefined;

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
