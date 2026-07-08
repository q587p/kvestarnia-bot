import type { Context } from "grammy";
import type { ItemUpgradeService } from "../../services/itemUpgradeService";
import { playerFromContext } from "../context";
import { DEFAULT_INVENTORY_SORT, type InventorySort } from "../inventorySort";
import { buildItemUpgradeListKeyboard } from "../keyboards/itemUpgradeKeyboard";
import { presentItemUpgradeList } from "../presenters/itemUpgradePresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export async function sendItemUpgradeList(
  ctx: Context,
  itemUpgrades: ItemUpgradeService,
  mode: "reply" | "edit" = "reply",
  page = 0,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
  const result = telegramUserId
    ? await itemUpgrades.listForTelegramUser(telegramUserId)
    : { state: "no-character" as const };
  const message = presentItemUpgradeList(result);
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemUpgradeListKeyboard(result, page, sort)
  };

  if (mode === "edit") {
    await ctx.editMessageText(message, options);
    return;
  }

  await ctx.reply(message, options);
}
