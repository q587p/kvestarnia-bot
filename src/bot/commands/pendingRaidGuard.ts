import type { Context } from "grammy";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { buildTavernResultKeyboard } from "../keyboards/tavernKeyboard";
import { presentPendingRaidActionBlock } from "../presenters/tavernPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type ReplyOptions = Parameters<Context["reply"]>[1];

export async function sendPendingRaidBlockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  tavernRaidService: TavernRaidService | undefined,
  mode: "reply" | "edit"
): Promise<boolean> {
  if (!tavernRaidService) {
    return false;
  }

  const pending = await tavernRaidService.getActivePendingFridayBarrelRaidForTelegramUser(
    telegramUserId
  );

  if (pending.state !== "pending") {
    return false;
  }

  const options = {
    parse_mode: "HTML" as const,
    reply_markup: buildTavernResultKeyboard("pending")
  } satisfies ReplyOptions;
  const text = presentPendingRaidActionBlock(pending);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return true;
  }

  await ctx.reply(text, options);
  return true;
}
