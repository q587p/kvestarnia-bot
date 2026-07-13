import type { Context } from "grammy";
import type { ItemUpgradeService } from "../../services/itemUpgradeService";
import { playerFromContext } from "../context";
import { DEFAULT_INVENTORY_SORT, type InventorySort } from "../inventorySort";
import { buildItemUpgradeListKeyboard } from "../keyboards/itemUpgradeKeyboard";
import { startPerfSpan } from "../performanceLogger";
import { presentItemUpgradeList } from "../presenters/itemUpgradePresenter";
import { safeEditMessageText } from "../safeEditMessageText";

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
  const perf = startPerfSpan("item-upgrade.list", {
    telegramUserId: telegramUserId ?? null
  });
  const result = await perf.measureDb(() => telegramUserId
    ? itemUpgrades.listForTelegramUser(telegramUserId)
    : Promise.resolve({ state: "no-character" as const }));
  const { message, options } = perf.measureCompute(() => ({
    message: presentItemUpgradeList(result),
    options: {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemUpgradeListKeyboard(result, page, sort)
    }
  }));

  if (mode === "edit") {
    await perf.measureTelegramEdit(() => safeEditMessageText(ctx, message, options));
    perf.end({
      itemCount: result.state === "ready" ? result.items.length : 0,
      sort,
      page
    });
    return;
  }

  await perf.measureTelegramEdit(() => ctx.reply(message, options));
  perf.end({
    itemCount: result.state === "ready" ? result.items.length : 0,
    sort,
    page
  });
}
