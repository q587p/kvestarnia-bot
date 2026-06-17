import type { Bot, Context } from "grammy";
import type { EquipmentService, EquipmentSlot } from "../../services/equipmentService";
import type { InventoryService } from "../../services/inventoryService";
import { playerFromContext } from "../context";
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
  slotFilter: EquipmentSlot | null = null,
  equipmentService?: Pick<EquipmentService, "getEquipmentForTelegramUser">
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentInvalidCallback());
    return;
  }

  const [result, equipment] = await Promise.all([
    inventoryService.listForTelegramUser(telegramUserId),
    slotFilter && equipmentService
      ? equipmentService.getEquipmentForTelegramUser(telegramUserId)
      : Promise.resolve(null)
  ]);
  const currentSlotItem =
    slotFilter && equipment?.state === "ready"
      ? (equipment.slots.find((slot) => slot.slot === slotFilter)?.item ?? null)
      : null;
  const text = presentInventory(result, page, slotFilter, {
    currentSlotItem
  });

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, {
      parse_mode: "HTML" as const,
      reply_markup: buildInventoryKeyboard(result, page, slotFilter)
    });
    return;
  }

  await ctx.reply(text, {
    parse_mode: "HTML" as const,
    reply_markup: buildInventoryKeyboard(result, page, slotFilter)
  });
}
