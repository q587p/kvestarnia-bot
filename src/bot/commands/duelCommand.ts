import type { Bot, Context } from "grammy";
import type { DuelCallback } from "../callbacks/duelCallbackData";
import {
  getInitialDuelInviteTemplateIndex,
  getNextDuelInviteTemplateIndex
} from "../../content/duelInviteFlavor";
import type {
  DuelAcceptResult,
  DuelChallengeService,
  DuelChallengeView,
  DuelDeclineResult
} from "../../services/duelChallengeService";
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
  buildDuelInviteShareKeyboard,
  buildDuelJournalKeyboard,
  buildDuelNavigationKeyboard,
  buildDuelOwnerChallengeKeyboard,
  buildDuelRematchResourceWarningKeyboard,
  buildDuelResourceWarningKeyboard,
  buildDuelResultKeyboard,
  buildDuelTargetedInviteKeyboard,
} from "../keyboards/duelKeyboard";
import { presentFightingCornerQuestProgressNotification } from "../presenters/fightingCornerQuestPresenter";
import { buildEnterKorchmaKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentDuelAccept,
  presentDuelCancel,
  presentDuelCreate,
  presentDuelDecline,
  presentDuelDeclineNotification,
  presentDuelInviteShare,
  presentDuelEntry,
  presentDuelKorchmaGate,
  presentDuelRematch,
  presentDuelResultShare,
  presentTurnBasedDuelJournal,
  presentTurnBasedDuelIntro,
  presentDuelView
} from "../presenters/duelPresenter";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";
import {
  getCallbackPreviousMainMenuLocationId,
  refreshCallbackMainMenuLocationBeforeReplies
} from "../modules/mainMenu";
import {
  deliverCanonicalTurnBasedDuelParticipantCard,
  getTurnBasedDuelParticipantReference,
  showCanonicalTurnBasedDuelCard,
  showCanonicalTurnBasedDuelResultCard,
  type TurnBasedDuelParticipant
} from "../turnBasedDuelCardDelivery";
import type { DuelCombatSessionRecord } from "../../db/repositories/duelChallengeRepository";
import {
  classifyTurnBasedDuelRoute,
  getRememberedTurnBasedDuelRouteClassification,
  isTurnBasedDuelCardCallback
} from "../turnBasedDuelRouteClassification";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};
type AnswerCallbackQueryOptions = Parameters<Context["answerCallbackQuery"]>[0];
type DeclinedDuelChallengeView =
  Extract<DuelChallengeView, { state: "expired" | "cancelled" | "declined" }> & { state: "declined" };

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

  if (callback.type === "invite") {
    const result = await service.getInviteRotationForTelegramUser(telegramUserId, callback.token);

    if (result.state === "not-owner") {
      await answerCallback({ text: "Інший текст може вибрати тільки автор виклику." });
      return;
    }

    if (result.state === "not-found") {
      await answerCallback({ text: "Цей інвайт уже загубився між кухлем і протоколом." });
      return;
    }

    if (result.state === "not-pending") {
      await answerCallback({ text: "Цей інвайт уже не змінюємо: запис не відкритий." });
      return;
    }

    const inviteUrl = buildInviteUrl(options.botUsername, result.challenge.inviteToken, result.challenge.mode);

    if (!inviteUrl) {
      await answerCallback({ text: "Посилання ще не зібралося: бот не знає свій username." });
      return;
    }

    const nextTemplateIndex = getNextDuelInviteTemplateIndex(
      result.challenge.inviteToken,
      callback.templateIndex
    );

    await answerCallback();
    await safeEditMessageText(
      ctx,
      presentDuelInviteShare(result.challenger, inviteUrl, {
        templateIndex: nextTemplateIndex,
        mode: result.challenge.mode
      }),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildDuelInviteShareKeyboard(result.challenge.inviteToken, nextTemplateIndex)
      }
    );
    return;
  }

  const observedTurnDuelRoute = getRememberedTurnBasedDuelRouteClassification(ctx);
  const currentTurnDuelRoute = await classifyTurnBasedDuelRoute(
    ctx,
    callback,
    telegramUserId,
    service
  );
  const preservesResolvedCanonical =
    currentTurnDuelRoute?.state === "resolved" &&
    (
      currentTurnDuelRoute.sourceIsCanonical ||
      observedTurnDuelRoute?.token === currentTurnDuelRoute.token
    );
  const isResolvedCanonicalRematch =
    preservesResolvedCanonical &&
    (callback.type === "rematch" || callback.type === "rematch-risk");
  if (
    isResolvedCanonicalRematch &&
    await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, "reply")
  ) {
    await answerCallback();
    return;
  }
  const pendingRaidProtectsResolvedCanonical =
    preservesResolvedCanonical &&
    !isResolvedCanonicalRematch &&
    !isTurnBasedDuelCardCallback(callback) &&
    typeof options.tavernRaid?.getActivePendingFridayBarrelRaidForTelegramUser === "function" &&
    (await options.tavernRaid.getActivePendingFridayBarrelRaidForTelegramUser(telegramUserId)).state === "pending";
  if (
    currentTurnDuelRoute?.state === "resolved" &&
    preservesResolvedCanonical &&
    (isTurnBasedDuelCardCallback(callback) || pendingRaidProtectsResolvedCanonical)
  ) {
    await answerCallback();
    await clearCurrentDuelCallbackKeyboardIfNonCanonical(
      ctx,
      currentTurnDuelRoute.session,
      currentTurnDuelRoute.participant
    );
    await showCanonicalTurnBasedDuelResultCard(
      ctx,
      currentTurnDuelRoute.view,
      currentTurnDuelRoute.session,
      service,
      "edit"
    );
    return;
  }

  if (
    isTurnBasedDuelCardCallback(callback) &&
    observedTurnDuelRoute?.state === "active" &&
    observedTurnDuelRoute.token === callback.token &&
    !currentTurnDuelRoute
  ) {
    await answerCallback();
    return;
  }

  const exactActiveTurnDuel = currentTurnDuelRoute?.state === "active" ||
    await isExactActiveTurnDuelCallback(callback, telegramUserId, service);
  if (
    !exactActiveTurnDuel &&
    !preservesResolvedCanonical &&
    await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, "edit")
  ) {
    await answerCallback();
    return;
  }

  if (
    callback.type === "new" ||
    callback.type === "new-risk" ||
    callback.type === "new-turn-based" ||
    callback.type === "new-turn-based-risk"
  ) {
    const mode = callback.type === "new-turn-based" || callback.type === "new-turn-based-risk"
      ? "turn-based" as const
      : "quick" as const;
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
      ignoreResourceWarning: callback.type === "new-risk" || callback.type === "new-turn-based-risk",
      ...(mode === "turn-based" ? { mode } : {})
    });
    const inviteUrl = getInviteUrl(options.botUsername, result);
    await answerCallback();
    await sendText(
      ctx,
      "edit",
      presentDuelCreate(result, { inviteUrl, mode }),
      result.state === "pending"
        ? { state: "pending-owner", token: result.challenge.inviteToken }
        : result.state === "level-gated"
          ? "navigation"
          : result.state === "resource-warning"
            ? { state: "create-resource-warning", mode }
          : "result"
    );
    if (result.state === "pending") {
      if (inviteUrl) {
        const templateIndex = getInitialDuelInviteTemplateIndex(result.challenge.inviteToken);
        await ctx.reply(presentDuelInviteShare(result.challenger, inviteUrl, {
          templateIndex,
          mode: result.challenge.mode
        }), {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildDuelInviteShareKeyboard(result.challenge.inviteToken, templateIndex)
        });
      }
      await notifyTargetedRematchInvite(ctx, result, inviteUrl);
    }
    return;
  }

  if (callback.type === "accept" || callback.type === "accept-risk") {
    const previousLocationId = await getCallbackPreviousMainMenuLocationId(ctx, options.presence);
    const result = await service.acceptForTelegramUser(telegramUserId, callback.token, {
      confirmed: callback.type === "accept-risk",
      ignoreResourceWarning: callback.type === "accept-risk"
    });

    if (callback.type === "accept-risk" && result.state !== "busy" && !isFreshDuelAcceptTransition(result)) {
      await markNeutralDuelPresence(ctx, options.presence);
    }

    if (result.state === "self-challenge") {
      await answerCallback();
      await sendText(
        ctx,
        "edit",
        presentDuelAccept(result),
        { state: "pending-owner", token: result.challenge.inviteToken }
      );
      return;
    }

    if (result.state === "not-target") {
      await answerCallback({
        text: "Це адресний реванш. Корчмар чекає саме того пригодника, чиє імʼя в записі."
      });
      return;
    }

    if (isFreshDuelAcceptTransition(result)) {
      await markDuelPresence(ctx, options.presence);
    }
    await answerCallback();
    if (result.state === "active") {
      if (result.transitioned) {
        await refreshCallbackMainMenuLocationBeforeReplies(
          ctx,
          PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
          previousLocationId
        );
        await clearCurrentDuelCallbackKeyboard(ctx);
        await ctx.reply(presentTurnBasedDuelIntro(result), HTML_MESSAGE_OPTIONS);
        await showCanonicalTurnBasedDuelCard(ctx, result, service, "reply");
      } else {
        await clearCurrentDuelCallbackKeyboardIfNonCanonical(ctx, result.session, getViewerParticipant(ctx, result));
        await showCanonicalTurnBasedDuelCard(ctx, result, service, "reply", { allowFallback: false });
      }
      if (result.transitioned) {
        await notifyTurnBasedParticipants(ctx, result, service, { includeIntro: true });
      }
      return;
    }
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
                ? { state: "result", token: result.challenge.inviteToken, mode: result.challenge.mode }
                : "result"
    );

    if (result.state === "resolved" && result.transitioned) {
      await notifyOtherQuickDuelResultParticipant(ctx, result);
    }
    if (result.state === "resolved") {
      await notifyFightingCornerQuestProgress(ctx, result.questProgressUpdates ?? []);
    }
    return;
  }

  if (callback.type === "turn" || callback.type === "gear") {
    if (!isPrivateChat(ctx)) {
      await answerCallback({ text: "Ходи дуелі приймаються тільки в приваті з ботом." });
      const current = await service.getByToken(callback.token);
      if (current.state === "active") {
        await sendTurnBasedDuelCard(ctx, "edit", current, service);
        return;
      }
      await sendText(
        ctx,
        "edit",
        current.state === "not-found"
          ? "Цю дуель уже не можна відкрити з цієї кнопки."
          : presentDuelView(current, { inviteUrl: getInviteUrl(options.botUsername, current) }),
        current.state === "resolved"
            ? { state: "result", token: current.challenge.inviteToken, mode: current.challenge.mode }
            : "result"
      );
      return;
    }

    const result = await service.resolveTurnBasedActionForTelegramUser(telegramUserId, {
      inviteToken: callback.token,
      expectedTurn: callback.turn,
      expectedVersion: callback.version,
      action: callback.type === "gear" ? "gear" : callback.action,
      ...(callback.type === "gear" ? { grantKey: callback.grantKey } : {})
    });

    await answerCallback(
      result.state === "wrong-turn"
        ? { text: "Зараз не ваш хід." }
        : result.state === "not-enough-mana"
          ? { text: "Не вистачає мани для цієї дії спорядження." }
        : result.state === "skill-on-cooldown"
          ? { text: "Дія спорядження ще відсапується." }
        : result.state === "stale"
          ? { text: "Цей хід уже змінився. Показую актуальний запис." }
          : result.state === "already-acted"
            ? { text: "Ваш вибір уже записано. Чекаємо другого учасника або таймер." }
          : undefined
    );

    if (result.state === "no-character") {
      await sendText(ctx, "edit", presentDuelCreate({ state: "no-character" }), "entry");
      return;
    }

    if (result.state === "not-found") {
      await sendText(ctx, "edit", "Дуель не знайшлася або вже стала легендою без протоколу.", "result");
      return;
    }

    const current = await service.getByToken(callback.token);

    if (current.state === "not-found") {
      await sendText(ctx, "edit", "Цю дуель уже не можна відкрити з цієї кнопки.", "result");
      return;
    }

    if (current.state === "active") {
      await clearCurrentDuelCallbackKeyboardIfNonCanonical(ctx, current.session, getViewerParticipant(ctx, current));
      await sendTurnBasedDuelCard(ctx, "edit", current, service);
      if (result.state === "updated") {
        await sendTurnBasedAchievementUnlocks(ctx, current, result);
        await notifyOtherTurnBasedParticipant(ctx, current, service, result.achievementUnlocksByCharacterId);
      }
      return;
    }

    if (current.state === "resolved" && result.state === "updated") {
      await clearCurrentDuelCallbackKeyboardIfNonCanonical(
        ctx,
        result.session,
        getViewerParticipant(ctx, current)
      );
      await showCanonicalTurnBasedDuelResultCard(ctx, current, result.session, service, "edit");
    } else {
      await sendText(
        ctx,
        "edit",
        presentDuelView(current, { inviteUrl: getInviteUrl(options.botUsername, current) }),
        current.state === "resolved"
          ? { state: "result", token: current.challenge.inviteToken, mode: current.challenge.mode }
          : "result"
      );
    }

    if (result.state === "updated" && current.state === "resolved") {
      await sendTurnBasedAchievementUnlocks(ctx, current, result);
      await notifyOtherTurnBasedResultParticipant(
        ctx,
        current,
        result.session,
        service,
        result.achievementUnlocksByCharacterId
      );
      await notifyFightingCornerQuestProgress(ctx, result.questProgressUpdates ?? []);
    }
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

    if (result.state === "cancelled" && result.transitioned) {
      await notifyTargetedDuelCancellation(ctx, result);
    }
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
      presentDuelDecline(result, { inviteUrl: getInviteUrl(options.botUsername, result) }),
      result.state === "pending" ? { state: "pending", result } : "result"
    );
    if (isDeclinedDuelChallengeView(result) && result.transitioned) {
      await notifyDuelChallengerDecline(ctx, result);
    }
    return;
  }

  if (callback.type === "rematch" || callback.type === "rematch-risk") {
    const result = await service.createRematchForTelegramUser(telegramUserId, callback.token, {
      contextChatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
      ignoreResourceWarning: callback.type === "rematch-risk"
    });

    if (result.state === "busy") {
      await answerCallback({ text: "Спершу завершіть поточний бій." });
      return;
    }

    if (result.state === "not-participant") {
      await answerCallback({ text: "Реванш можуть кинути тільки учасники цієї дуелі." });
      return;
    }

    await markNeutralDuelPresence(ctx, options.presence);

    const inviteUrl = getInviteUrl(options.botUsername, result);

    await answerCallback();
    await sendText(
      ctx,
      "edit",
      presentDuelRematch(result, { inviteUrl }),
      result.state === "pending"
        ? { state: "pending-owner", token: result.challenge.inviteToken }
        : result.state === "resource-warning"
          ? { state: "rematch-resource-warning", token: callback.token }
          : result.state === "level-gated"
            ? "navigation"
            : "result"
    );

    if (result.state === "pending" && inviteUrl) {
      const templateIndex = getInitialDuelInviteTemplateIndex(result.challenge.inviteToken);
      await ctx.reply(presentDuelInviteShare(result.challenger, inviteUrl, {
        templateIndex,
        mode: result.challenge.mode
      }), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildDuelInviteShareKeyboard(result.challenge.inviteToken, templateIndex)
      });
    }
    if (result.state === "pending") {
      await notifyTargetedRematchInvite(ctx, result, inviteUrl);
    }
    return;
  }

  if (callback.type === "journal") {
    const result = await service.getTurnBasedJournalByToken(callback.token);

    if (result.state === "not-found") {
      await answerCallback({ text: "Журнал цієї дуелі не знайшовся." });
      return;
    }

    if (result.state === "not-ready") {
      await answerCallback({ text: "Журнал бою буде після завершення дуелі." });
      return;
    }

    await answerCallback();
    await sendText(
      ctx,
      "edit",
      presentTurnBasedDuelJournal(result, callback.page),
      { state: "journal", token: callback.token, page: callback.page, totalPages: result.rounds.length }
    );
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
  if (result.state === "active") {
    if (isPrivateChat(ctx)) {
      await clearCurrentDuelCallbackKeyboardIfNonCanonical(ctx, result.session, getViewerParticipant(ctx, result));
      await showCanonicalTurnBasedDuelCard(ctx, result, service, "reply", { allowFallback: false });
    } else {
      await showCanonicalTurnBasedDuelCard(ctx, result, service, "edit");
    }
    return;
  }
  if (result.state === "resolved" && result.challenge.mode === "turn-based" && isPrivateChat(ctx)) {
    const session = typeof service.getTurnBasedSessionByToken === "function"
      ? await service.getTurnBasedSessionByToken(result.challenge.inviteToken)
      : null;
    if (session) {
      await clearCurrentDuelCallbackKeyboardIfNonCanonical(
        ctx,
        session,
        getViewerParticipant(ctx, result)
      );
      await showCanonicalTurnBasedDuelResultCard(ctx, result, session, service, "edit");
      return;
    }
  }
  await sendText(
    ctx,
    "edit",
    result.state === "not-found"
      ? "Виклик не знайшовся."
      : presentDuelView(result, { inviteUrl: getInviteUrl(options.botUsername, result) }),
    result.state === "pending"
      ? result.challenge.challenger.telegramUserId === telegramUserId
        ? { state: "pending-owner", token: result.challenge.inviteToken }
        : { state: "pending", result }
      : result.state === "resolved"
        ? { state: "result", token: result.challenge.inviteToken, mode: result.challenge.mode }
        : "result"
  );
  if (result.state === "resolved") {
    await notifyFightingCornerQuestProgress(ctx, result.questProgressUpdates ?? []);
  }
}

function isFreshDuelAcceptTransition(result: DuelAcceptResult): boolean {
  return (result.state === "active" || result.state === "resolved") && result.transitioned === true;
}

async function notifyFightingCornerQuestProgress(
  ctx: Context,
  updates: NonNullable<Extract<DuelChallengeView, { state: "resolved" }>["questProgressUpdates"]>
): Promise<void> {
  await Promise.all(updates.map(async (update) => {
    try {
      await ctx.api.sendMessage(
        Number(update.telegramUserId),
        presentFightingCornerQuestProgressNotification(update),
        HTML_MESSAGE_OPTIONS
      );
    } catch {
      // Quest progress is durable; Telegram delivery remains best-effort.
    }
  }));
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
    | "navigation"
    | "result"
    | { state: "create-resource-warning"; mode: "quick" | "turn-based" }
    | { state: "accept-confirmation"; token: string }
    | { state: "resource-warning"; token: string }
    | { state: "rematch-resource-warning"; token: string }
    | { state: "result"; token?: string; mode?: "quick" | "turn-based" }
    | { state: "journal"; token: string; page: number; totalPages: number }
    | { state: "pending"; result: Parameters<typeof buildDuelChallengeKeyboard>[0] }
    | { state: "pending-owner"; token: string }
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
                : keyboard === "navigation"
                  ? buildDuelNavigationKeyboard()
                : keyboard === "result"
                  ? buildDuelResultKeyboard()
                  : keyboard.state === "create-resource-warning"
                  ? buildDuelCreateResourceWarningKeyboard(keyboard.mode)
                : keyboard.state === "resource-warning"
                  ? buildDuelResourceWarningKeyboard(keyboard.token)
                  : keyboard.state === "accept-confirmation"
                    ? buildDuelAcceptConfirmationKeyboard(keyboard.token)
                    : keyboard.state === "rematch-resource-warning"
                      ? buildDuelRematchResourceWarningKeyboard(keyboard.token)
                      : keyboard.state === "journal"
                        ? buildDuelJournalKeyboard(keyboard.token, keyboard.page, keyboard.totalPages)
                      : keyboard.state === "result"
                        ? buildDuelResultKeyboard(keyboard.token, keyboard.mode)
                        : keyboard.state === "pending-owner"
                          ? buildDuelOwnerChallengeKeyboard(keyboard.token)
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
  result: { state: string; challenge?: { inviteToken: string; mode?: "quick" | "turn-based" } }
): string | null {
  if (!botUsername || result.state !== "pending" || !result.challenge) {
    return null;
  }

  return buildInviteUrl(botUsername, result.challenge.inviteToken, result.challenge.mode ?? "quick");
}

async function sendTurnBasedDuelCard(
  ctx: Context,
  mode: "reply" | "edit",
  result: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>,
  service: DuelChallengeService
): Promise<void> {
  await showCanonicalTurnBasedDuelCard(ctx, result, service, mode);
}

async function markNeutralDuelPresence(ctx: Context, presence: PresenceService): Promise<void> {
  const player = playerFromContext(ctx.from);
  if (player) {
    await presence.markAction({ user: player });
  }
}

async function isExactActiveTurnDuelCallback(
  callback: DuelCallback,
  telegramUserId: bigint,
  service: DuelChallengeService
): Promise<boolean> {
  if (callback.type !== "turn" && callback.type !== "gear" && callback.type !== "view") {
    return false;
  }

  if (typeof service.getActiveTurnBasedForTelegramUser !== "function") {
    return false;
  }

  const active = await service.getActiveTurnBasedForTelegramUser(telegramUserId);
  return active?.challenge.inviteToken === callback.token;
}

async function notifyTurnBasedParticipants(
  ctx: Context,
  result: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>,
  service: DuelChallengeService,
  options: { includeIntro?: boolean } = {}
): Promise<void> {
  await Promise.all([
    notifyTurnBasedParticipant(ctx, result, service, "challenger", undefined, options),
    notifyTurnBasedParticipant(ctx, result, service, "target", undefined, options)
  ]);
}

async function notifyOtherTurnBasedParticipant(
  ctx: Context,
  result: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>,
  service: DuelChallengeService,
  achievementUnlocksByCharacterId?: Record<string, Parameters<typeof presentAchievementUnlockNotification>[0]>
): Promise<void> {
  const viewerCharacterId = getViewerCharacterId(ctx, result);
  const other =
    viewerCharacterId === result.session.challengerCharacterId
      ? {
          participant: "target" as const,
          telegramUserId: result.challenge.target?.telegramUserId,
          chatId: result.session.targetChatId,
          messageId: result.session.targetMessageId
        }
      : {
          participant: "challenger" as const,
          telegramUserId: result.challenge.challenger.telegramUserId,
          chatId: result.session.challengerChatId,
          messageId: result.session.challengerMessageId
        };

  await notifyTurnBasedParticipant(ctx, result, service, other.participant, achievementUnlocksByCharacterId);
}

async function notifyTurnBasedParticipant(
  ctx: Context,
  result: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>,
  service: DuelChallengeService,
  participantName: "challenger" | "target",
  achievementUnlocksByCharacterId?: Record<string, Parameters<typeof presentAchievementUnlockNotification>[0]>,
  options: { includeIntro?: boolean } = {}
): Promise<void> {
  const participant = participantName === "challenger"
    ? {
        participant: "challenger" as const,
        telegramUserId: result.challenge.challenger.telegramUserId,
        chatId: result.session.challengerChatId,
        messageId: result.session.challengerMessageId,
        characterId: result.session.challengerCharacterId
      }
    : {
        participant: "target" as const,
        telegramUserId: result.challenge.target?.telegramUserId,
        chatId: result.session.targetChatId,
        messageId: result.session.targetMessageId,
        characterId: result.session.targetCharacterId
      };
  const chatId = getPrivateParticipantChatId(participant.chatId, participant.telegramUserId);

  if (!chatId || (isPrivateChat(ctx) && ctx.chat?.id && BigInt(ctx.chat.id) === chatId)) {
    return;
  }

  try {
    if (options.includeIntro) {
      await clearRemoteTurnBasedDuelKeyboard(ctx, chatId, participant.messageId ?? null);
      await ctx.api.sendMessage(Number(chatId), presentTurnBasedDuelIntro(result), HTML_MESSAGE_OPTIONS);
    }
    await deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: result,
      participant: participant.participant,
      chatId,
      transport: {
        editMessage: async (reference, text, messageOptions) => {
          await ctx.api.editMessageText(
            Number(reference.chatId),
            reference.messageId,
            text,
            messageOptions
          );
        },
        sendInertMessage: async (destinationChatId, text, messageOptions) => {
          const message = await ctx.api.sendMessage(Number(destinationChatId), text, messageOptions);
          return message.message_id ?? null;
        }
      }
    });
    await sendAchievementUnlocksToChat(
      ctx,
      chatId,
      achievementUnlocksByCharacterId?.[participant.characterId] ?? []
    );
  } catch {
    // Telegram delivery is best-effort; committed duel state remains canonical.
  }
}

async function clearCurrentDuelCallbackKeyboard(ctx: Context): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: []
      }
    });
  } catch {
    // The duel is already active; a stale source keyboard is safe to leave if Telegram rejects the cleanup.
  }
}

async function clearCurrentDuelCallbackKeyboardIfNonCanonical(
  ctx: Context,
  session: DuelCombatSessionRecord,
  participant: TurnBasedDuelParticipant | null
): Promise<void> {
  const sourceChatId = ctx.callbackQuery?.message?.chat.id;
  const sourceMessageId = ctx.callbackQuery?.message?.message_id;
  const canonical = participant
    ? getTurnBasedDuelParticipantReference(session, participant)
    : null;

  if (
    canonical &&
    sourceChatId != null &&
    sourceMessageId != null &&
    canonical.chatId === BigInt(sourceChatId) &&
    canonical.messageId === sourceMessageId
  ) {
    return;
  }

  await clearCurrentDuelCallbackKeyboard(ctx);
}

function getViewerParticipant(
  ctx: Context,
  view: Extract<DuelChallengeView, { state: "active" | "resolved" }>
): TurnBasedDuelParticipant | null {
  const telegramUserId = ctx.from?.id ? BigInt(ctx.from.id) : null;
  if (!telegramUserId) {
    return null;
  }

  if (view.challenge.challenger.telegramUserId === telegramUserId) {
    return "challenger";
  }

  return view.challenge.target?.telegramUserId === telegramUserId ? "target" : null;
}

async function clearRemoteTurnBasedDuelKeyboard(
  ctx: Context,
  chatId: bigint,
  messageId: number | null
): Promise<void> {
  if (!messageId) {
    return;
  }

  try {
    await ctx.api.editMessageReplyMarkup(Number(chatId), messageId, {
      reply_markup: {
        inline_keyboard: []
      }
    });
  } catch {
    // The new intro and combat card remain deliverable even when the old keyboard cannot be cleared.
  }
}

async function notifyTargetedDuelCancellation(
  ctx: Context,
  result: Extract<DuelChallengeView, { state: "expired" | "cancelled" | "declined" }>
): Promise<void> {
  const chatId = result.challenge.target?.telegramUserId;

  if (!chatId || (ctx.chat?.id && BigInt(ctx.chat.id) === chatId)) {
    return;
  }

  try {
    await ctx.api.sendMessage(Number(chatId), presentDuelView(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildDuelCancellationKeyboard()
    });
  } catch {
    // Telegram delivery is best-effort; the cancelled challenge remains canonical.
  }
}

function buildDuelCancellationKeyboard() {
  return buildDuelNavigationKeyboard();
}

async function notifyDuelChallengerDecline(
  ctx: Context,
  result: DeclinedDuelChallengeView
): Promise<void> {
  const chatId = result.challenge.challenger.telegramUserId;

  if (!chatId || (ctx.chat?.id && BigInt(ctx.chat.id) === chatId)) {
    return;
  }

  try {
    await ctx.api.sendMessage(Number(chatId), presentDuelDeclineNotification(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildDuelCancellationKeyboard()
    });
  } catch {
    // Telegram delivery is best-effort; the declined challenge remains canonical.
  }
}

function isDeclinedDuelChallengeView(result: DuelDeclineResult): result is DeclinedDuelChallengeView {
  return result.state === "declined";
}

async function notifyTargetedRematchInvite(
  ctx: Context,
  result: Extract<DuelChallengeView, { state: "pending" }>,
  inviteUrl: string | null
): Promise<void> {
  const chatId = result.challenge.target?.telegramUserId;

  if (!chatId || (ctx.chat?.id && BigInt(ctx.chat.id) === chatId)) {
    return;
  }

  try {
    await ctx.api.sendMessage(Number(chatId), presentDuelView(result, { inviteUrl }), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildDuelTargetedInviteKeyboard(result)
    });
  } catch {
    // Telegram delivery is best-effort; the targeted rematch invite remains canonical.
  }
}

async function notifyOtherQuickDuelResultParticipant(
  ctx: Context,
  result: Extract<DuelChallengeView, { state: "resolved" }>
): Promise<void> {
  const viewerCharacterId = getResolvedViewerCharacterId(ctx, result);
  const chatId =
    viewerCharacterId === result.challenge.challengerCharacterId
      ? result.challenge.target?.telegramUserId
      : result.challenge.challenger.telegramUserId;

  if (!chatId || (ctx.chat?.id && BigInt(ctx.chat.id) === chatId)) {
    return;
  }

  try {
    await ctx.api.sendMessage(Number(chatId), presentDuelView(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildDuelResultKeyboard(result.challenge.inviteToken, result.challenge.mode)
    });
  } catch {
    // Telegram delivery is best-effort; the resolved duel result remains canonical.
  }
}

async function notifyOtherTurnBasedResultParticipant(
  ctx: Context,
  result: Extract<DuelChallengeView, { state: "resolved" }>,
  session: Awaited<ReturnType<DuelChallengeService["listDueTurnBasedSessions"]>>[number],
  service: DuelChallengeService,
  achievementUnlocksByCharacterId?: Record<string, Parameters<typeof presentAchievementUnlockNotification>[0]>
): Promise<void> {
  const viewerCharacterId = getResolvedViewerCharacterId(ctx, result);
  const other =
    viewerCharacterId === session.challengerCharacterId
      ? {
          participant: "target" as const,
          telegramUserId: result.challenge.target?.telegramUserId,
          chatId: session.targetChatId,
          messageId: session.targetMessageId
        }
      : {
          participant: "challenger" as const,
          telegramUserId: result.challenge.challenger.telegramUserId,
          chatId: session.challengerChatId,
          messageId: session.challengerMessageId
        };
  const chatId = getPrivateParticipantChatId(other.chatId, other.telegramUserId);

  if (!chatId || (ctx.chat?.id && BigInt(ctx.chat.id) === chatId)) {
    return;
  }

  try {
    await deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view: result,
      session,
      participant: other.participant,
      chatId,
      transport: {
        editMessage: async (reference, text, messageOptions) => {
          await ctx.api.editMessageText(
            Number(reference.chatId),
            reference.messageId,
            text,
            messageOptions
          );
        },
        sendInertMessage: async (destinationChatId, text, messageOptions) => {
          const message = await ctx.api.sendMessage(Number(destinationChatId), text, messageOptions);
          return message.message_id ?? null;
        }
      }
    });
    await sendAchievementUnlocksToChat(
      ctx,
      chatId,
      achievementUnlocksByCharacterId?.[
        other.participant === "challenger" ? session.challengerCharacterId : session.targetCharacterId
      ] ?? []
    );
  } catch {
    // Telegram delivery is best-effort; committed duel state remains canonical.
  }
}

async function sendTurnBasedAchievementUnlocks(
  ctx: Context,
  current: Extract<DuelChallengeView, { state: "active" | "resolved" }>,
  result: Extract<
    Awaited<ReturnType<DuelChallengeService["resolveTurnBasedActionForTelegramUser"]>>,
    { state: "updated" }
  >
): Promise<void> {
  const viewerCharacterId = current.state === "active"
    ? getViewerCharacterId(ctx, current)
    : getResolvedViewerCharacterId(ctx, current);

  if (!viewerCharacterId) {
    return;
  }

  const text = presentAchievementUnlockNotification(
    result.achievementUnlocksByCharacterId?.[viewerCharacterId] ?? []
  );
  if (text) {
    await ctx.reply(text, HTML_MESSAGE_OPTIONS);
  }
}

async function sendAchievementUnlocksToChat(
  ctx: Context,
  chatId: bigint,
  unlocks: Parameters<typeof presentAchievementUnlockNotification>[0]
): Promise<void> {
  const text = presentAchievementUnlockNotification(unlocks);
  if (text) {
    await ctx.api.sendMessage(Number(chatId), text, HTML_MESSAGE_OPTIONS);
  }
}

function getViewerCharacterId(
  ctx: Context,
  result: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>
): string | null {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    return null;
  }

  if (result.challenge.challenger.telegramUserId === telegramUserId) {
    return result.session.challengerCharacterId;
  }

  if (result.challenge.target?.telegramUserId === telegramUserId) {
    return result.session.targetCharacterId;
  }

  return null;
}

function getResolvedViewerCharacterId(
  ctx: Context,
  result: Extract<DuelChallengeView, { state: "resolved" }>
): string | null {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    return null;
  }

  if (result.challenge.challenger.telegramUserId === telegramUserId) {
    return result.challenge.challengerCharacterId;
  }

  if (result.challenge.target?.telegramUserId === telegramUserId) {
    return result.challenge.targetCharacterId;
  }

  return null;
}

function buildInviteUrl(botUsername: string | undefined, token: string, mode: "quick" | "turn-based" = "quick"): string | null {
  if (!botUsername) {
    return null;
  }

  const payload = mode === "turn-based" ? `duel_turnbased_${token}` : `duel_${token}`;

  return `https://t.me/${botUsername}?start=${payload}`;
}

function isPrivateChat(ctx: Context): boolean {
  return ctx.chat?.type === "private";
}

function getPrivateParticipantChatId(
  storedChatId: bigint | null | undefined,
  telegramUserId: bigint | null | undefined
): bigint | null {
  if (!telegramUserId) {
    return null;
  }

  return storedChatId === telegramUserId ? storedChatId : telegramUserId;
}
