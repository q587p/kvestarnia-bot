import type { Context } from "grammy";
import type { ItemUpgradeService } from "../../services/itemUpgradeService";
import { playerFromContext } from "../context";
import { DEFAULT_INVENTORY_SORT, type InventorySort } from "../inventorySort";
import { buildItemUpgradeListKeyboard } from "../keyboards/itemUpgradeKeyboard";
import { elapsedMs, hotPathNow, logSlowHotPathTiming } from "../performanceLogger";
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
  const totalStartedAt = hotPathNow();
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
  const dbStartedAt = hotPathNow();
  const result = telegramUserId
    ? await itemUpgrades.listForTelegramUser(telegramUserId)
    : { state: "no-character" as const };
  const dbMs = elapsedMs(dbStartedAt);
  const computeStartedAt = hotPathNow();
  const message = presentItemUpgradeList(result);
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemUpgradeListKeyboard(result, page, sort)
  };
  const computeMs = elapsedMs(computeStartedAt);
  const telegramStartedAt = hotPathNow();

  if (mode === "edit") {
    await safeEditMessageText(ctx, message, options);
    logSlowHotPathTiming({
      route: "item-upgrade.list",
      telegramUserId: telegramUserId ?? null,
      itemCount: result.state === "ready" ? result.items.length : 0,
      sort,
      page,
      dbMs,
      computeMs,
      telegramEditMs: elapsedMs(telegramStartedAt),
      totalMs: elapsedMs(totalStartedAt)
    });
    return;
  }

  await ctx.reply(message, options);
  logSlowHotPathTiming({
    route: "item-upgrade.list",
    telegramUserId: telegramUserId ?? null,
    itemCount: result.state === "ready" ? result.items.length : 0,
    sort,
    page,
    dbMs,
    computeMs,
    telegramEditMs: elapsedMs(telegramStartedAt),
    totalMs: elapsedMs(totalStartedAt)
  });
}
