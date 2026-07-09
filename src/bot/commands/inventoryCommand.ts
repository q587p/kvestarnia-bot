import type { Bot, Context } from "grammy";
import type { EquipmentService } from "../../services/equipmentService";
import type { InventoryService } from "../../services/inventoryService";
import { playerFromContext } from "../context";
import {
  isInventoryEquipmentSlotFilter,
  type InventoryFilter
} from "../inventoryFilter";
import { DEFAULT_INVENTORY_SORT, type InventorySort } from "../inventorySort";
import { buildInventoryKeyboardFromViewModel } from "../keyboards/inventoryKeyboard";
import { elapsedMs, hotPathNow, logSlowHotPathTiming } from "../performanceLogger";
import { presentInvalidCallback } from "../presenters/onboardingPresenter";
import { buildInventoryViewModel, presentInventoryViewModel } from "../presenters/inventoryPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type SendMode = "reply" | "edit";

export function registerInventoryCommand(
  bot: Bot,
  inventoryService: InventoryService,
  equipmentService?: Pick<
    EquipmentService,
    "getEquipmentForTelegramUser" | "getCompatibleItemIdsForSlotForTelegramUser"
  >
): void {
  bot.command(["inventory", "items", "bag"], async (ctx) => {
    await sendInventory(ctx, inventoryService, "reply", 0, null, equipmentService);
  });
}

export async function sendInventory(
  ctx: Context,
  inventoryService: InventoryService,
  mode: SendMode,
  page = 0,
  filter: InventoryFilter = null,
  equipmentService?: Pick<
    EquipmentService,
    "getEquipmentForTelegramUser" | "getCompatibleItemIdsForSlotForTelegramUser"
  >,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): Promise<void> {
  const totalStartedAt = hotPathNow();
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentInvalidCallback());
    return;
  }

  const dbStartedAt = hotPathNow();
  const [result, equipment] = await Promise.all([
    inventoryService.listForTelegramUser(telegramUserId),
    equipmentService
      ? equipmentService.getEquipmentForTelegramUser(telegramUserId)
      : Promise.resolve(null)
  ]);
  const slotCompatibleItemIds =
    isInventoryEquipmentSlotFilter(filter) &&
    equipmentService
      ? await equipmentService.getCompatibleItemIdsForSlotForTelegramUser(telegramUserId, filter)
      : null;
  const currentSlotItem =
    isInventoryEquipmentSlotFilter(filter) && equipment?.state === "ready"
      ? (equipment.slots.find((slot) => slot.slot === filter)?.item ?? null)
      : null;
  const equippedItemIds =
    equipment?.state === "ready"
      ? new Set(equipment.slots.flatMap((slot) => slot.item ? [slot.item.itemId] : []))
      : null;
  const dbMs = elapsedMs(dbStartedAt);
  const computeStartedAt = hotPathNow();
  const inventoryOptions = {
    currentSlotItem,
    equippedItemIds,
    slotCompatibleItemIds,
    sort
  };
  const model = buildInventoryViewModel(result, page, filter, inventoryOptions);
  const text = presentInventoryViewModel(model);
  const replyMarkup = buildInventoryKeyboardFromViewModel(model);
  const computeMs = elapsedMs(computeStartedAt);
  const telegramStartedAt = hotPathNow();

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, {
      parse_mode: "HTML" as const,
      reply_markup: replyMarkup
    });
    logSlowHotPathTiming({
      route: "inventory.edit",
      telegramUserId,
      itemCount: model.rawItems.length,
      filter,
      sort,
      page: model.safePage,
      dbMs,
      computeMs,
      telegramEditMs: elapsedMs(telegramStartedAt),
      totalMs: elapsedMs(totalStartedAt)
    });
    return;
  }

  await ctx.reply(text, {
    parse_mode: "HTML" as const,
    reply_markup: replyMarkup
  });
  logSlowHotPathTiming({
    route: "inventory.open",
    telegramUserId,
    itemCount: model.rawItems.length,
    filter,
    sort,
    page: model.safePage,
    dbMs,
    computeMs,
    telegramEditMs: elapsedMs(telegramStartedAt),
    totalMs: elapsedMs(totalStartedAt)
  });
}
