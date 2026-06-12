import type { Bot, Context } from "grammy";
import type { PresenceGroup, PresenceService } from "../../services/presenceService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { telegramUserIdFromContext } from "../context";
import { buildTavernKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentTavern,
  presentTavernAlreadyRaided,
  presentTavernNoCharacter
} from "../presenters/tavernPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type ReplyOptions = Parameters<Context["reply"]>[1];

export function registerTavernCommand(
  bot: Bot,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService
): void {
  bot.command(["tavern", "raid"], async (ctx) => {
    await sendTavern(ctx, tavernRaidService, presenceService, "reply");
  });
}

export async function sendTavern(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  const presence = await getTavernPresence(telegramUserId, presenceService);

  if (result.state === "already-completed") {
    await sendText(ctx, mode, presentTavernAlreadyRaided(result.character, presence));
    return;
  }

  await sendText(ctx, mode, presentTavern(result.character, presence), true);
}

async function getTavernPresence(
  telegramUserId: bigint,
  presenceService: PresenceService
): Promise<PresenceGroup | null> {
  const snapshot = await presenceService.getLookForTelegramUser(telegramUserId);

  return snapshot.state === "ready" ? snapshot.location.people : null;
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  includeKeyboard = false
): Promise<void> {
  const options = includeKeyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup: buildTavernKeyboard()
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
