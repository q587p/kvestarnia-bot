import type { Context } from "grammy";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { buildTavernResultKeyboard } from "../keyboards/tavernKeyboard";
import { presentPendingRaidActionBlock } from "../presenters/tavernPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export async function editPendingRaidBlockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  tavernRaidService: TavernRaidService,
  behavior: { preserveCallbackSource?: boolean } = {}
): Promise<boolean> {
  const pending = await tavernRaidService.getActivePendingFridayBarrelRaidForTelegramUser(
    telegramUserId
  );

  if (pending.state !== "pending") {
    return false;
  }

  const text = presentPendingRaidActionBlock(pending);
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildTavernResultKeyboard("pending")
  };
  if (ctx.callbackQuery) {
    await safeAnswerCallbackQuery(ctx);
    if (behavior.preserveCallbackSource) {
      await ctx.reply(text, options);
    } else {
      await safeEditMessageText(ctx, text, options);
    }
  } else {
    await ctx.reply(text, options);
  }
  return true;
}
