import type { Bot, Context } from "grammy";
import type { InventoryService } from "../../services/inventoryService";
import { playerFromContext } from "../context";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
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
  mode: SendMode
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentInvalidCallback());
    return;
  }

  const result = await inventoryService.listForTelegramUser(telegramUserId);
  const text = presentInventory(result);
  const options = {
    parse_mode: "HTML" as const,
    reply_markup: buildMainMenuKeyboard()
  };

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
