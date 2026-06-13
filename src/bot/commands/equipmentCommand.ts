import type { Bot, Context } from "grammy";
import type { EquipmentService } from "../../services/equipmentService";
import { playerFromContext } from "../context";
import { buildEquipmentKeyboard } from "../keyboards/inventoryKeyboard";
import { presentEquipment } from "../presenters/equipmentPresenter";
import { presentInvalidCallback } from "../presenters/onboardingPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type SendMode = "reply" | "edit";

export function registerEquipmentCommand(bot: Bot, equipmentService: EquipmentService): void {
  bot.command(["equipment", "gear", "equip"], async (ctx) => {
    await sendEquipment(ctx, equipmentService, "reply");
  });
}

export async function sendEquipment(
  ctx: Context,
  equipmentService: EquipmentService,
  mode: SendMode
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.reply(presentInvalidCallback());
    return;
  }

  const result = await equipmentService.getEquipmentForTelegramUser(telegramUserId);
  const text = presentEquipment(result);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, {
      parse_mode: "HTML" as const,
      reply_markup: buildEquipmentKeyboard(result)
    });
    return;
  }

  await ctx.reply(text, {
    parse_mode: "HTML" as const,
    reply_markup: buildEquipmentKeyboard(result)
  });
}
