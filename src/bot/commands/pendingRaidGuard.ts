import type { Context } from "grammy";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { buildTavernResultKeyboard } from "../keyboards/tavernKeyboard";
import { presentPendingRaidActionBlock } from "../presenters/tavernPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { memoizeUpdateRead } from "../updatePerformanceTrace";

type ReplyOptions = Parameters<Context["reply"]>[1];

export async function sendPendingRaidBlockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  tavernRaidService: TavernRaidService | undefined,
  mode: "reply" | "edit",
  options: { fresh?: boolean } = {}
): Promise<boolean> {
  if (!tavernRaidService) {
    return false;
  }

  const pending = options.fresh
    ? await tavernRaidService.getActivePendingFridayBarrelRaidForTelegramUser(telegramUserId)
    : await memoizeUpdateRead(
        `pending-friday:${telegramUserId}`,
        () => tavernRaidService.getActivePendingFridayBarrelRaidForTelegramUser(telegramUserId),
        "pendingRaid"
      );

  if (pending.state !== "pending") {
    return false;
  }

  const messageOptions = {
    parse_mode: "HTML" as const,
    reply_markup: buildTavernResultKeyboard("pending")
  } satisfies ReplyOptions;
  const text = presentPendingRaidActionBlock(pending);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, messageOptions);
    return true;
  }

  await ctx.reply(text, messageOptions);
  return true;
}
