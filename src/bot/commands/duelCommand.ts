import type { Bot, Context } from "grammy";
import type { DuelCallback } from "../callbacks/duelCallbackData";
import {
  getInitialDuelInviteTemplateIndex,
  getNextDuelInviteTemplateIndex
} from "../../content/duelInviteFlavor";
import type { DuelChallengeService, DuelChallengeView } from "../../services/duelChallengeService";
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
  buildDuelNavigationKeyboard,
  buildDuelRematchResourceWarningKeyboard,
  buildDuelResourceWarningKeyboard,
  buildDuelResultKeyboard,
  buildTurnBasedDuelKeyboard
} from "../keyboards/duelKeyboard";
import { getCombatSkillDisplay } from "../../services/fightService";
import { getCombatSkillProfile } from "../../domain/combat";
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
  presentTurnBasedDuel,
  presentDuelView
} from "../presenters/duelPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { isMessageNotModifiedError, safeEditMessageText } from "../safeEditMessageText";
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

  if (await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, "edit")) {
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
            ? { state: "create-resource-warning", mode }
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

    if (result.state !== "active") {
      await markDuelPresence(ctx, options.presence);
    }
    await answerCallback();
    if (result.state === "active") {
      await sendTurnBasedDuelCard(ctx, "edit", result, service);
      await notifyOtherTurnBasedParticipant(ctx, result, service);
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
                ? { state: "result", token: result.challenge.inviteToken }
                : "result"
    );
    return;
  }

  if (callback.type === "turn") {
    const result = await service.resolveTurnBasedActionForTelegramUser(telegramUserId, {
      inviteToken: callback.token,
      expectedTurn: callback.turn,
      expectedVersion: callback.version,
      action: callback.action
    });

    await answerCallback(
      result.state === "wrong-turn"
        ? { text: "Зараз не ваш хід." }
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
      await sendTurnBasedDuelCard(ctx, "edit", current, service);
      await notifyOtherTurnBasedParticipant(ctx, current, service);
      return;
    }

    await sendText(
      ctx,
      "edit",
      presentDuelView(current, { inviteUrl: getInviteUrl(options.botUsername, current) }),
      current.state === "resolved" ? { state: "result", token: current.challenge.inviteToken } : "result"
    );

    if (result.state === "updated" && current.state === "resolved") {
      await notifyOtherTurnBasedResultParticipant(ctx, current, result.session, service);
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

    if (result.state === "cancelled") {
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
      const templateIndex = getInitialDuelInviteTemplateIndex(result.challenge.inviteToken);
      await ctx.reply(presentDuelInviteShare(result.challenger, inviteUrl, {
        templateIndex,
        mode: result.challenge.mode
      }), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildDuelInviteShareKeyboard(result.challenge.inviteToken, templateIndex)
      });
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
  if (result.state === "active") {
    await sendTurnBasedDuelCard(ctx, "edit", result, service);
    return;
  }
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
    | "navigation"
    | "result"
    | { state: "create-resource-warning"; mode: "quick" | "turn-based" }
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
  const viewerCharacterId = getViewerCharacterId(ctx, result);
  const skillParticipant = getParticipantForSkill(result, viewerCharacterId);
  const skillProfile = getCombatSkillProfile(skillParticipant.combatStats.classId);
  const skill = getCombatSkillDisplay(skillProfile.id);
  const text = presentTurnBasedDuel(result, { viewerCharacterId });
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildTurnBasedDuelKeyboard(result, viewerCharacterId, `${skill.icon} ${skill.name}`)
  };

  if (mode === "edit") {
    const participant = viewerCharacterId === result.session.challengerCharacterId ? "challenger" : "target";
    const editedMessageId = await editOrReplyTurnBasedCard(ctx, text, options);

    if (ctx.chat?.id && editedMessageId) {
      await service.recordTurnBasedMessageReference(result.session.id, participant, {
        chatId: BigInt(ctx.chat.id),
        messageId: editedMessageId
      });
    }
    return;
  }

  const message = await ctx.reply(text, options);
  const participant = viewerCharacterId === result.session.challengerCharacterId ? "challenger" : "target";
  if (ctx.chat?.id && message.message_id) {
    await service.recordTurnBasedMessageReference(result.session.id, participant, {
      chatId: BigInt(ctx.chat.id),
      messageId: message.message_id
    });
  }
}

async function notifyOtherTurnBasedParticipant(
  ctx: Context,
  result: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>,
  service: DuelChallengeService
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

  const chatId = other.chatId ?? other.telegramUserId;

  if (!chatId || (ctx.chat?.id && BigInt(ctx.chat.id) === chatId)) {
    return;
  }

  try {
    const otherCharacterId = other.participant === "challenger"
      ? result.session.challengerCharacterId
      : result.session.targetCharacterId;
    const text = presentTurnBasedDuel(result, { viewerCharacterId: otherCharacterId });
    const participant = getParticipantForSkill(result, otherCharacterId);
    const skillProfile = getCombatSkillProfile(participant.combatStats.classId);
    const skill = getCombatSkillDisplay(skillProfile.id);
    const keyboard = buildTurnBasedDuelKeyboard(
      result,
      otherCharacterId,
      `${skill.icon} ${skill.name}`
    );

    const messageId = await editOrSendTurnBasedCard(ctx, {
      chatId,
      messageId: other.messageId ?? null,
      text,
      options: {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: keyboard
      }
    });

    if (messageId) {
      await service.recordTurnBasedMessageReference(result.session.id, other.participant, {
        chatId,
        messageId
      });
    }
  } catch {
    // Telegram delivery is best-effort; committed duel state remains canonical.
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
      reply_markup: buildDuelResultKeyboard(result.challenge.inviteToken)
    });
  } catch {
    // Telegram delivery is best-effort; the cancelled challenge remains canonical.
  }
}

async function notifyOtherTurnBasedResultParticipant(
  ctx: Context,
  result: Extract<DuelChallengeView, { state: "resolved" }>,
  session: Awaited<ReturnType<DuelChallengeService["listDueTurnBasedSessions"]>>[number],
  service: DuelChallengeService
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
  const chatId = other.chatId ?? other.telegramUserId;

  if (!chatId || (ctx.chat?.id && BigInt(ctx.chat.id) === chatId)) {
    return;
  }

  try {
    const messageId = await editOrSendTurnBasedCard(ctx, {
      chatId,
      messageId: other.messageId ?? null,
      text: presentDuelView(result),
      options: {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildDuelResultKeyboard(result.challenge.inviteToken)
      }
    });

    if (messageId) {
      await service.recordTurnBasedMessageReference(session.id, other.participant, {
        chatId,
        messageId
      });
    }
  } catch {
    // Telegram delivery is best-effort; committed duel state remains canonical.
  }
}

async function editOrReplyTurnBasedCard(
  ctx: Context,
  text: string,
  options: Parameters<Context["editMessageText"]>[1]
): Promise<number | null> {
  const currentMessageId = ctx.callbackQuery?.message?.message_id ?? null;

  try {
    await ctx.editMessageText(text, options);
    return currentMessageId;
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return currentMessageId;
    }

    const sent = await ctx.reply(text, options);
    return sent.message_id;
  }
}

async function editOrSendTurnBasedCard(
  ctx: Context,
  input: {
    chatId: bigint;
    messageId: number | null;
    text: string;
    options: Parameters<Context["api"]["editMessageText"]>[3];
  }
): Promise<number | null> {
  if (input.messageId) {
    try {
      await ctx.api.editMessageText(Number(input.chatId), input.messageId, input.text, input.options);
      return input.messageId;
    } catch (error) {
      if (isMessageNotModifiedError(error)) {
        return input.messageId;
      }
    }
  }

  const sent = await ctx.api.sendMessage(
    Number(input.chatId),
    input.text,
    input.options
  );
  return sent.message_id;
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

function getParticipantForSkill(
  result: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>,
  viewerCharacterId: string | null
): Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>["session"]["state"]["participants"]["challenger"] {
  if (viewerCharacterId === result.session.state.participants.target.characterId) {
    return result.session.state.participants.target;
  }

  return result.session.state.participants.challenger;
}

function buildInviteUrl(botUsername: string | undefined, token: string, mode: "quick" | "turn-based" = "quick"): string | null {
  if (!botUsername) {
    return null;
  }

  const payload = mode === "turn-based" ? `duel_turnbased_${token}` : `duel_${token}`;

  return `https://t.me/${botUsername}?start=${payload}`;
}
