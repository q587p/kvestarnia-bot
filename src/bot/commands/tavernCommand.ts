import type { Bot, Context } from "grammy";
import type { PresenceGroup, PresenceService } from "../../services/presenceService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { telegramUserIdFromContext } from "../context";
import {
  buildKorchmaFrontKeyboard,
  buildKorchmaHallKeyboard,
  buildTavernKeyboard,
  buildTavernResultKeyboard
} from "../keyboards/tavernKeyboard";
import {
  presentKorchmaFront,
  presentKorchmaHall,
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
  bot.command("tavern", async (ctx) => {
    await sendTavern(ctx, tavernRaidService, presenceService, "reply");
  });

  bot.command("raid", async (ctx) => {
    await sendTavernBarrel(ctx, tavernRaidService, presenceService, "reply");
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

  const presence = await getPlacePresence(telegramUserId, presenceService);

  await sendText(ctx, mode, presentKorchmaHall(result.character, presence), "hall");
}

export async function sendKorchmaFront(
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

  await sendText(ctx, mode, presentKorchmaFront(result.character), "front");
}

export async function sendTavernBarrel(
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

  const presence = await getPlacePresence(telegramUserId, presenceService);

  if (result.state === "already-completed") {
    await sendText(ctx, mode, presentTavernAlreadyRaided(result.character, presence), "barrel-result");
    return;
  }

  await sendText(ctx, mode, presentTavern(result.character, presence), true);
}

async function getPlacePresence(
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
  keyboard: boolean | "hall" | "front" | "barrel-result" = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "hall"
            ? buildKorchmaHallKeyboard()
            : keyboard === "front"
              ? buildKorchmaFrontKeyboard()
              : keyboard === "barrel-result"
                ? buildTavernResultKeyboard("already-completed")
                : buildTavernKeyboard()
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
