import type { Bot, Context } from "grammy";
import type { InventoryService } from "../../services/inventoryService";
import { playerFromContext } from "../context";
import { buildEquipmentKeyboard } from "../keyboards/inventoryKeyboard";
import { presentEquipmentPreview } from "../presenters/equipmentPresenter";
import { presentInvalidCallback } from "../presenters/onboardingPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type SendMode = "reply" | "edit";

export function registerEquipmentCommand(bot: Bot, inventoryService: InventoryService): void {
  bot.command(["equipment", "gear", "equip"], async (ctx) => {
    await sendEquipment(ctx, inventoryService, "reply");
  });
}

export async function sendEquipment(
  ctx: Context,
  inventoryService: InventoryService,
  mode: SendMode
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentInvalidCallback());
    return;
  }

  const result = await inventoryService.listForTelegramUser(telegramUserId);
  const text = presentEquipmentPreview(result);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, {
      parse_mode: "HTML" as const,
      reply_markup: buildEquipmentKeyboard()
    });
    return;
  }

  await ctx.reply(text, {
    parse_mode: "HTML" as const,
    reply_markup: buildEquipmentKeyboard()
  });
}
