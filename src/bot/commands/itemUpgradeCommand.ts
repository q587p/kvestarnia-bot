import type { Context } from "grammy";
import type { ItemUpgradeService } from "../../services/itemUpgradeService";
import { playerFromContext } from "../context";
import { buildItemUpgradeListKeyboard } from "../keyboards/itemUpgradeKeyboard";
import { presentItemUpgradeList } from "../presenters/itemUpgradePresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export async function sendItemUpgradeList(
  ctx: Context,
  itemUpgrades: ItemUpgradeService,
  mode: "reply" | "edit" = "reply"
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
  const result = telegramUserId
    ? await itemUpgrades.listForTelegramUser(telegramUserId)
    : { state: "no-character" as const };
  const message = presentItemUpgradeList(result);
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemUpgradeListKeyboard(result)
  };

  if (mode === "edit") {
    await ctx.editMessageText(message, options);
    return;
  }

  await ctx.reply(message, options);
}
