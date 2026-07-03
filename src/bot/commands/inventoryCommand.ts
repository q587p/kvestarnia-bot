import type { Bot, Context } from "grammy";
import type { EquipmentService } from "../../services/equipmentService";
import type { InventoryService } from "../../services/inventoryService";
import { playerFromContext } from "../context";
import {
  isInventoryEquipmentSlotFilter,
  type InventoryFilter
} from "../inventoryFilter";
import { buildInventoryKeyboard } from "../keyboards/inventoryKeyboard";
import { presentInvalidCallback } from "../presenters/onboardingPresenter";
import { presentInventory } from "../presenters/inventoryPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type SendMode = "reply" | "edit";

export function registerInventoryCommand(bot: Bot, inventoryService: InventoryService): void {
  bot.command(["inventory", "items", "bag"], async (ctx) => {
    await sendInventory(ctx, inventoryService, "reply");
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
  >
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentInvalidCallback());
    return;
  }

  const [result, equipment] = await Promise.all([
    inventoryService.listForTelegramUser(telegramUserId),
    isInventoryEquipmentSlotFilter(filter) && equipmentService
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
  const text = presentInventory(result, page, filter, {
    currentSlotItem,
    slotCompatibleItemIds
  });

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, {
      parse_mode: "HTML" as const,
      reply_markup: buildInventoryKeyboard(result, page, filter, { currentSlotItem, slotCompatibleItemIds })
    });
    return;
  }

  await ctx.reply(text, {
    parse_mode: "HTML" as const,
    reply_markup: buildInventoryKeyboard(result, page, filter, { currentSlotItem, slotCompatibleItemIds })
  });
}
