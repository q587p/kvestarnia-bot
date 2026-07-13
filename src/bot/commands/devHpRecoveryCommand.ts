import type { Bot } from "grammy";
import type { HealthRecoveryNotificationService } from "../../services/healthRecoveryNotificationService";
import { telegramUserIdFromContext } from "../context";

export function registerDevHpRecoveryCommand(
  bot: Bot,
  service: Pick<HealthRecoveryNotificationService, "areDevHelpersEnabled" | "prepareDueForTelegramUser">
): void {
  if (!service.areDevHelpersEnabled()) {
    return;
  }

  bot.command("dev_hp_recovery_due", async (ctx) => {
    const telegramUserId = telegramUserIdFromContext(ctx.from);
    const prepared = telegramUserId
      ? await service.prepareDueForTelegramUser(telegramUserId)
      : false;
    await ctx.reply(
      prepared
        ? "🧪 Стан відновлення HP поранено й поставлено в чергу. Дочекайтеся наступного серверного tick."
        : "🧪 Не вдалося підготувати стан відновлення HP."
    );
  });
}
