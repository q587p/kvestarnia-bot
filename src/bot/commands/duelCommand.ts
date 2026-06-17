import type { Bot, Context } from "grammy";
import type { DuelCallback } from "../callbacks/duelCallbackData";
import type { DuelChallengeService } from "../../services/duelChallengeService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import {
  PRESENCE_ADVENTURE_DUEL_CHALLENGE,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import {
  buildDuelChallengeKeyboard,
  buildDuelEntryKeyboard,
  buildDuelResourceWarningKeyboard,
  buildDuelResultKeyboard
} from "../keyboards/duelKeyboard";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentDuelAccept,
  presentDuelCancel,
  presentDuelCreate,
  presentDuelDecline,
  presentDuelEntry,
  presentDuelView
} from "../presenters/duelPresenter";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export interface DuelCommandOptions {
  presence: PresenceService;
  tavernRaid?: TavernRaidService;
  botUsername?: string | undefined;
}

export function registerDuelCommand(
  bot: Bot,
  service: DuelChallengeService,
  options: DuelCommandOptions
): void {
  bot.command("duel", async (ctx) => {
    await sendDuelEntry(ctx, service, "reply", {
      ...options,
      requireKorchmaInterior: true
    });
  });
}

export async function sendDuelEntry(
  ctx: Context,
  _service: DuelChallengeService,
  mode: "reply" | "edit",
  options: DuelCommandOptions & { requireKorchmaInterior?: boolean }
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, mode)) {
    return;
  }

  if (options.requireKorchmaInterior === true) {
    const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await sendText(ctx, mode, presentDuelCreate({ state: "no-character" }), "entry");
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
      return;
    }
  }

  await markDuelPresence(ctx, options.presence);
  await sendText(ctx, mode, presentDuelEntry(), "entry");
}

export async function handleDuelCallback(
  ctx: Context,
  callback: DuelCallback,
  service: DuelChallengeService,
  options: DuelCommandOptions
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, "edit", "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, "edit")) {
    return;
  }

  if (callback.type === "new") {
    const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await sendText(ctx, "edit", presentDuelCreate({ state: "no-character" }), "entry");
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, "edit", presentKorchmaQuestGate(), "enter-korchma");
      return;
    }

    const result = await service.createOpenChallengeForTelegramUser(telegramUserId, {
      contextChatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null
    });
    await markDuelPresence(ctx, options.presence);
    await sendText(
      ctx,
      "edit",
      presentDuelCreate(result, { inviteUrl: getInviteUrl(options.botUsername, result) }),
      result.state === "pending" ? { state: "pending", result } : "result"
    );
    return;
  }

  if (callback.type === "accept" || callback.type === "accept-risk") {
    const result = await service.acceptForTelegramUser(telegramUserId, callback.token, {
      ignoreResourceWarning: callback.type === "accept-risk"
    });
    await markDuelPresence(ctx, options.presence);
    await sendText(
      ctx,
      "edit",
      presentDuelAccept(result),
      result.state === "pending"
        ? { state: "pending", result }
        : result.state === "resource-warning"
          ? { state: "resource-warning", token: result.challenge.inviteToken }
          : "result"
    );
    return;
  }

  if (callback.type === "cancel") {
    const result = await service.cancelForTelegramUser(telegramUserId, callback.token);
    await sendText(
      ctx,
      "edit",
      presentDuelCancel(result),
      result.state === "pending" ? { state: "pending", result } : "result"
    );
    return;
  }

  if (callback.type === "decline") {
    const result = await service.declineForTelegramUser(telegramUserId, callback.token);
    await sendText(
      ctx,
      "edit",
      presentDuelDecline(result),
      result.state === "pending" ? { state: "pending", result } : "result"
    );
    return;
  }

  const result = await service.getByToken(callback.token);
  await sendText(
    ctx,
    "edit",
    result.state === "not-found"
      ? "Виклик не знайшовся."
      : presentDuelView(result, { inviteUrl: getInviteUrl(options.botUsername, result) }),
    result.state === "pending" ? { state: "pending", result } : "result"
  );
}

async function markDuelPresence(ctx: Context, presence: PresenceService): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_DUEL_CHALLENGE
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | "entry"
    | "enter-korchma"
    | "result"
    | { state: "resource-warning"; token: string }
    | { state: "pending"; result: Parameters<typeof buildDuelChallengeKeyboard>[0] }
    | false = false
): Promise<void> {
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    ...(keyboard
      ? {
          reply_markup:
            keyboard === "entry"
              ? buildDuelEntryKeyboard()
              : keyboard === "enter-korchma"
                ? buildKorchmaFrontKeyboard()
                : keyboard === "result"
                  ? buildDuelResultKeyboard()
                  : keyboard.state === "resource-warning"
                    ? buildDuelResourceWarningKeyboard(keyboard.token)
                    : buildDuelChallengeKeyboard(keyboard.result)
        }
      : {})
  };

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

function getInviteUrl(
  botUsername: string | undefined,
  result: { state: string; challenge?: { inviteToken: string } }
): string | null {
  if (!botUsername || result.state !== "pending" || !result.challenge) {
    return null;
  }

  return `https://t.me/${botUsername}?start=duel_${result.challenge.inviteToken}`;
}
