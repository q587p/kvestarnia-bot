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
import { startPerfSpan } from "../performanceLogger";
import { presentInvalidCallback } from "../presenters/onboardingPresenter";
import { buildInventoryViewModel, presentInventoryViewModel } from "../presenters/inventoryPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type SendMode = "reply" | "edit";

type InventoryEquipmentService = Pick<
  EquipmentService,
  "getEquipmentForTelegramUser" | "getCompatibleItemIdsForSlotForTelegramUser"
> & Partial<Pick<EquipmentService, "getInventoryEquipmentProjectionForTelegramUser">>;

export function registerInventoryCommand(
  bot: Bot,
  inventoryService: InventoryService,
  equipmentService?: InventoryEquipmentService
): void {
  bot.command("inventory", async (ctx) => {
    await sendInventory(ctx, inventoryService, "reply", 0, null, equipmentService);
  });

  bot.command("items", async (ctx) => {
    await sendInventory(ctx, inventoryService, "reply", 0, null, equipmentService, "name-asc");
  });

  bot.command("bag", async (ctx) => {
    await sendInventory(ctx, inventoryService, "reply", 0, null, equipmentService, "date-desc");
  });
}

export async function sendInventory(
  ctx: Context,
  inventoryService: InventoryService,
  mode: SendMode,
  page = 0,
  filter: InventoryFilter = null,
  equipmentService?: InventoryEquipmentService,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentInvalidCallback());
    return;
  }

  const perf = startPerfSpan(mode === "edit" ? "inventory.edit" : "inventory.open", {
    telegramUserId
  });
  const { result, equipment, equippedItemIds, requirementLockedItemIds, slotCompatibleItemIds } = await perf.measureDb(async () => {
    const inventoryResult = await inventoryService.listForTelegramUser(telegramUserId);
    const inventoryItems = inventoryResult.state === "found" ? inventoryResult.items : [];
    const projection = equipmentService?.getInventoryEquipmentProjectionForTelegramUser
      ? await equipmentService.getInventoryEquipmentProjectionForTelegramUser(
          telegramUserId,
          inventoryItems,
          isInventoryEquipmentSlotFilter(filter) ? filter : null
        )
      : null;
    const equipmentResult = projection?.equipment ?? (equipmentService
      ? await equipmentService.getEquipmentForTelegramUser(telegramUserId)
      : null);
    const compatibleItemIds =
      projection?.slotCompatibleItemIds ?? (
        isInventoryEquipmentSlotFilter(filter) && equipmentService
        ? await equipmentService.getCompatibleItemIdsForSlotForTelegramUser(telegramUserId, filter)
        : null
      );

    return {
      result: inventoryResult,
      equipment: equipmentResult,
      equippedItemIds: projection?.equippedItemIds ?? null,
      requirementLockedItemIds: projection?.requirementLockedItemIds ?? null,
      slotCompatibleItemIds: compatibleItemIds
    };
  });
  const { model, text, replyMarkup } = perf.measureCompute(() => {
    const currentSlotItem =
      isInventoryEquipmentSlotFilter(filter) && equipment?.state === "ready"
        ? (equipment.slots.find((slot) => slot.slot === filter)?.item ?? null)
        : null;
    const resolvedEquippedItemIds = equippedItemIds ?? (
      equipment?.state === "ready"
        ? new Set(equipment.slots.flatMap((slot) => slot.item ? [slot.item.itemId] : []))
        : null
    );
    const inventoryOptions = {
      currentSlotItem,
      equippedItemIds: resolvedEquippedItemIds,
      requirementLockedItemIds,
      slotCompatibleItemIds,
      sort
    };
    const viewModel = buildInventoryViewModel(result, page, filter, inventoryOptions);

    return {
      model: viewModel,
      text: presentInventoryViewModel(viewModel),
      replyMarkup: buildInventoryKeyboardFromViewModel(viewModel)
    };
  });

  if (mode === "edit") {
    await perf.measureTelegramEdit(() => safeEditMessageText(ctx, text, {
      parse_mode: "HTML" as const,
      reply_markup: replyMarkup
    }));
    perf.end({
      itemCount: model.rawItems.length,
      filter,
      sort,
      page: model.safePage
    });
    return;
  }

  await perf.measureTelegramEdit(() => ctx.reply(text, {
    parse_mode: "HTML" as const,
    reply_markup: replyMarkup
  }));
  perf.end({
    itemCount: model.rawItems.length,
    filter,
    sort,
    page: model.safePage
  });
}
