import type { Bot, Context } from "grammy";
import type { DuelCallback } from "../callbacks/duelCallbackData";
import type { DuelChallengeService } from "../../services/duelChallengeService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import {
  PRESENCE_ADVENTURE_DUEL_CHALLENGE,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import {
  buildDuelAcceptConfirmationKeyboard,
  buildDuelChallengeKeyboard,
  buildDuelCreateResourceWarningKeyboard,
  buildDuelEntryKeyboard,
  buildDuelNavigationKeyboard,
  buildDuelRematchResourceWarningKeyboard,
  buildDuelResourceWarningKeyboard,
  buildDuelResultKeyboard
} from "../keyboards/duelKeyboard";
import { buildEnterKorchmaKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentDuelAccept,
  presentDuelCancel,
  presentDuelCreate,
  presentDuelDecline,
  presentDuelInviteShare,
  presentDuelEntry,
  presentDuelKorchmaGate,
  presentDuelRematch,
  presentDuelResultShare,
  presentDuelView
} from "../presenters/duelPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};
type AnswerCallbackQueryOptions = Parameters<Context["answerCallbackQuery"]>[0];

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
      await sendText(ctx, mode, presentDuelKorchmaGate(), "enter-korchma");
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
  let answered = false;
  const answerCallback = async (options?: AnswerCallbackQueryOptions): Promise<void> => {
    if (answered) {
      return;
    }

    answered = true;
    await safeAnswerCallbackQuery(ctx, options);
  };

  if (!telegramUserId) {
    await answerCallback();
    await sendText(ctx, "edit", "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, "edit")) {
    await answerCallback();
    return;
  }

  if (callback.type === "new" || callback.type === "new-risk") {
    const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await answerCallback();
      await sendText(ctx, "edit", presentDuelCreate({ state: "no-character" }), "entry");
      return;
    }

    if (!place.insideKorchma) {
      await answerCallback();
      await sendText(ctx, "edit", presentDuelKorchmaGate(), "enter-korchma");
      return;
    }

    const result = await service.createOpenChallengeForTelegramUser(telegramUserId, {
      contextChatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
      ignoreResourceWarning: callback.type === "new-risk"
    });
    const inviteUrl = getInviteUrl(options.botUsername, result);
    if (result.state !== "resource-warning") {
      await markDuelPresence(ctx, options.presence);
    }
    await answerCallback();
    await sendText(
      ctx,
      "edit",
      presentDuelCreate(result, { inviteUrl }),
      result.state === "pending"
        ? { state: "pending", result }
        : result.state === "level-gated"
          ? "navigation"
          : result.state === "resource-warning"
            ? "create-resource-warning"
          : "result"
    );
    if (result.state === "pending" && inviteUrl) {
      await ctx.reply(presentDuelInviteShare(result.challenger, inviteUrl), HTML_MESSAGE_OPTIONS);
    }
    return;
  }

  if (callback.type === "accept" || callback.type === "accept-risk") {
    const result = await service.acceptForTelegramUser(telegramUserId, callback.token, {
      confirmed: callback.type === "accept-risk",
      ignoreResourceWarning: callback.type === "accept-risk"
    });

    if (result.state === "self-challenge") {
      await answerCallback({
        text: "Самодуель не записуємо. Виклик лишається відкритим; для внутрішніх конфліктів є Допельґанґер."
      });
      return;
    }

    if (result.state === "not-target") {
      await answerCallback({
        text: "Це адресний реванш. Корчмар чекає саме того пригодника, чиє імʼя в записі."
      });
      return;
    }

    await markDuelPresence(ctx, options.presence);
    await answerCallback();
    await sendText(
      ctx,
      "edit",
      presentDuelAccept(result),
      result.state === "pending"
        ? { state: "pending", result }
        : result.state === "resource-warning"
          ? { state: "resource-warning", token: result.challenge.inviteToken }
          : result.state === "confirmation"
            ? { state: "accept-confirmation", token: result.challenge.inviteToken }
            : result.state === "level-gated"
              ? "navigation"
              : result.state === "resolved"
                ? { state: "result", token: result.challenge.inviteToken }
                : "result"
    );
    return;
  }

  if (callback.type === "cancel") {
    const result = await service.cancelForTelegramUser(telegramUserId, callback.token);

    if (result.state === "not-owner") {
      await answerCallback({ text: "Це чужий виклик. Скасувати може тільки автор." });
      return;
    }

    await answerCallback();
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

    if (result.state === "open-invite") {
      await answerCallback({ text: "Ви не прийняли виклик. Він лишається на столі для інших." });
      return;
    }

    await answerCallback();
    await sendText(
      ctx,
      "edit",
      presentDuelDecline(result),
      result.state === "pending" ? { state: "pending", result } : "result"
    );
    return;
  }

  if (callback.type === "rematch" || callback.type === "rematch-risk") {
    const result = await service.createRematchForTelegramUser(telegramUserId, callback.token, {
      contextChatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
      ignoreResourceWarning: callback.type === "rematch-risk"
    });

    if (result.state === "not-participant") {
      await answerCallback({ text: "Реванш можуть кинути тільки учасники цієї дуелі." });
      return;
    }

    const inviteUrl = getInviteUrl(options.botUsername, result);

    if (result.state === "pending") {
      await markDuelPresence(ctx, options.presence);
    }

    await answerCallback();
    await sendText(
      ctx,
      "edit",
      presentDuelRematch(result, { inviteUrl }),
      result.state === "pending"
        ? { state: "pending", result }
        : result.state === "resource-warning"
          ? { state: "rematch-resource-warning", token: callback.token }
          : result.state === "level-gated"
            ? "navigation"
            : "result"
    );

    if (result.state === "pending" && inviteUrl) {
      await ctx.reply(presentDuelInviteShare(result.challenger, inviteUrl), HTML_MESSAGE_OPTIONS);
    }
    return;
  }

  if (callback.type === "share") {
    const result = await service.getByToken(callback.token);

    if (result.state !== "resolved") {
      await answerCallback({ text: "Картка доступна тільки для збереженого результату." });
      return;
    }

    await answerCallback();
    await ctx.reply(presentDuelResultShare(result), HTML_MESSAGE_OPTIONS);
    return;
  }

  const result = await service.getByToken(callback.token);
  await answerCallback();
  await sendText(
    ctx,
    "edit",
    result.state === "not-found"
      ? "Виклик не знайшовся."
      : presentDuelView(result, { inviteUrl: getInviteUrl(options.botUsername, result) }),
    result.state === "pending"
      ? { state: "pending", result }
      : result.state === "resolved"
        ? { state: "result", token: result.challenge.inviteToken }
        : "result"
  );
}

async function markDuelPresence(ctx: Context, presence: PresenceService): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
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
    | "create-resource-warning"
    | "navigation"
    | "result"
    | { state: "accept-confirmation"; token: string }
    | { state: "resource-warning"; token: string }
    | { state: "rematch-resource-warning"; token: string }
    | { state: "result"; token?: string }
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
                ? buildEnterKorchmaKeyboard()
                : keyboard === "create-resource-warning"
                  ? buildDuelCreateResourceWarningKeyboard()
                : keyboard === "navigation"
                  ? buildDuelNavigationKeyboard()
                : keyboard === "result"
                  ? buildDuelResultKeyboard()
                : keyboard.state === "resource-warning"
                  ? buildDuelResourceWarningKeyboard(keyboard.token)
                  : keyboard.state === "accept-confirmation"
                    ? buildDuelAcceptConfirmationKeyboard(keyboard.token)
                    : keyboard.state === "rematch-resource-warning"
                      ? buildDuelRematchResourceWarningKeyboard(keyboard.token)
                      : keyboard.state === "result"
                        ? buildDuelResultKeyboard(keyboard.token)
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
