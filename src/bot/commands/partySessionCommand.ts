import type { Bot, Context } from "grammy";
import type { PartySessionCallback } from "../callbacks/partySessionCallbackData";
import type { PartyBossService } from "../../services/partyBossService";
import type { PresencePerson, PresenceService } from "../../services/presenceService";
import {
  buildPartyInviteUrl,
  BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
  type PartySessionService
} from "../../services/partySessionService";
import { telegramUserIdFromContext } from "../context";
import {
  buildPartySessionInviteKeyboard,
  buildPartySessionInviteShareKeyboard,
  buildPartyBossKeyboard,
  buildPartyBossJournalKeyboard,
  buildPartySessionKeyboard,
  buildPartySessionNearbyCandidatesKeyboard
} from "../keyboards/partySessionKeyboard";
import {
  presentPartyCancel,
  presentPartyBoss,
  presentPartyBossAction,
  presentPartyBossIntro,
  presentPartyBossJournal,
  presentPartyBossStart,
  presentPartyCreate,
  presentPartyJoin,
  presentPartyLeave,
  presentPartyNearbyCandidates,
  presentPartyNearbyInviteNotification,
  presentPartyNearbyInviteSent,
  presentPartyInviteShare,
  getInitialBigBarrelInviteTemplateIndex,
  getNextBigBarrelInviteTemplateIndex,
  presentPartyView
} from "../presenters/partySessionPresenter";
import { presentInvalidCallback } from "../presenters/onboardingPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export interface PartySessionCommandOptions {
  botUsername?: string | undefined;
  presence: PresenceService;
  partyBoss?: PartyBossService | undefined;
}

export function registerPartySessionDevCommand(
  bot: Bot,
  service: PartySessionService,
  options: PartySessionCommandOptions
): void {
  bot.command("dev_party", async (ctx) => {
    await sendPartyCreate(ctx, service, options, "reply");
  });
}

export async function sendPartyCreate(
  ctx: Context,
  service: PartySessionService,
  options: PartySessionCommandOptions,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала пригодника. Спробуйте ще раз.");
    return;
  }

  const result = await service.createForTelegramUser(telegramUserId, {
    chatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
    messageId: ctx.callbackQuery?.message?.message_id ?? null
  });
  const session = "session" in result ? result.session : null;
  const inviteUrl = session ? buildPartyInviteUrl(options.botUsername, session.inviteToken) : null;

  await sendText(ctx, mode, presentPartyCreate(result, { inviteUrl }), session
    ? {
        session,
        inviteUrl,
        viewerCharacterId: getViewerCharacterId(session, telegramUserId),
        includeDevExpire: service.areDevHelpersEnabled(),
        includeBossStart: isBigBarrelParty(session)
      }
    : false);
}

export async function handlePartySessionCallback(
  ctx: Context,
  callback: PartySessionCallback,
  service: PartySessionService,
  options: PartySessionCommandOptions
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (callback.type === "nearby-open") {
    await handleNearbyOpen(ctx, callback, service, options, telegramUserId);
    return;
  }

  if (callback.type === "nearby-invite") {
    await handleNearbyInvite(ctx, callback, service, options, telegramUserId);
    return;
  }

  if (callback.type === "share" || callback.type === "invite") {
    await handlePartyInviteShare(ctx, callback, service, options, telegramUserId);
    return;
  }

  if (callback.type === "boss-start") {
    if (!options.partyBoss?.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    if (!options.partyBoss.areDevHelpersEnabled()) {
      const party = await service.getByToken(callback.token);
      if (!("session" in party) || !isBigBarrelParty(party.session)) {
        await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
        return;
      }
    }

    const result = await options.partyBoss.startFromPartyForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(
      ctx,
      result.state === "blocked"
        ? { text: "Хтось уже в бою." }
        : result.state === "ineligible"
          ? { text: "Рейдова канцелярія відсіяла частину записів." }
          : undefined
    );
    const viewerCharacterId = "session" in result
      ? getBossViewerCharacterId(result.session, telegramUserId)
      : null;
    if (result.state === "started") {
      await sendText(ctx, "edit", presentPartyBossIntro(result.session, viewerCharacterId), false);
      await sendBossText(ctx, "reply", presentPartyBossStart(result, viewerCharacterId), {
        session: result.session,
        viewerCharacterId,
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
      });
    } else {
      await sendBossText(ctx, "edit", presentPartyBossStart(result, viewerCharacterId), "session" in result
        ? {
            session: result.session,
            viewerCharacterId,
            includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
          }
        : false);
    }
    if (result.state === "started") {
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        includeIntro: true,
        notice: isBigBossSession(result.session)
          ? "Бойова картка рейду готова."
          : "Бойова картка тестового боса готова."
      });
    }
    return;
  }

  if (callback.type === "boss-action") {
    if (!options.partyBoss?.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const result = await options.partyBoss.submitActionForTelegramUser(
      telegramUserId,
      callback.token,
      callback.turn,
      callback.action
    );
    await safeAnswerCallbackQuery(ctx, result.state === "duplicate" ? { text: "Дію вже записано." } : undefined);
    const viewerCharacterId = "session" in result
      ? getBossViewerCharacterId(result.session, telegramUserId)
      : null;
    await sendBossText(ctx, "edit", presentPartyBossAction(result, viewerCharacterId), "session" in result
      ? {
          session: result.session,
          viewerCharacterId,
          includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
        }
      : false);
    if (result.state === "resolved" || result.state === "terminal") {
      const big = isBigBossSession(result.session);
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        notice: result.session.status === "active"
          ? big
            ? "Хід оновлено. Показую новий стан рейду."
            : "Хід оновлено. Показую новий стан тестового бою."
          : big
            ? "Рейд завершено. Показую підсумок."
            : "Тестовий бій завершено. Показую підсумок."
      });
    }
    return;
  }

  if (callback.type === "boss-timeout") {
    if (!options.partyBoss?.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const canForceTimeout = options.partyBoss.areDevHelpersEnabled();
    const result = canForceTimeout
      ? await options.partyBoss.forceResolveTimedOutByToken(callback.token)
      : await options.partyBoss.resolveDueTimedOutByToken(callback.token);
    await safeAnswerCallbackQuery(ctx, { text: "Хід перевірено." });
    const viewerCharacterId = "session" in result
      ? getBossViewerCharacterId(result.session, telegramUserId)
      : null;
    await sendBossText(ctx, "edit", presentPartyBossAction(result, viewerCharacterId), "session" in result
      ? {
          session: result.session,
          viewerCharacterId,
          includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
        }
      : false);
    if (result.state === "resolved" || result.state === "terminal") {
      const big = isBigBossSession(result.session);
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        notice: result.session.status === "active"
          ? canForceTimeout
            ? big
              ? "Dev-таймер добив хід. Показую новий стан рейду."
              : "Dev-таймер добив хід. Показую новий стан тестового бою."
            : big
              ? "Таймер ходу спрацював. Показую новий стан рейду."
              : "Таймер ходу спрацював. Показую новий стан тестового бою."
          : canForceTimeout
            ? big
              ? "Dev-таймер завершив рейд. Показую підсумок."
              : "Dev-таймер завершив тестовий бій. Показую підсумок."
            : big
              ? "Таймер ходу завершив рейд. Показую підсумок."
              : "Таймер ходу завершив тестовий бій. Показую підсумок."
      });
    }
    return;
  }

  if (callback.type === "boss-journal") {
    if (!options.partyBoss?.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const boss = await options.partyBoss.getByPartyInviteToken(callback.token);
    await safeAnswerCallbackQuery(ctx);
    if (!boss) {
      await sendBossText(ctx, "edit", "Бій не знайшовся.", false);
      return;
    }

    const viewerCharacterId = getBossViewerCharacterId(boss, telegramUserId);
    if (boss.status === "active") {
      await sendBossText(ctx, "edit", presentPartyBoss(boss, {
        viewerCharacterId,
        notice: "Журнал відкриється після бою. Поки що Корчмар тримає чорнило подалі від піни."
      }), {
        session: boss,
        viewerCharacterId,
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
      });
      return;
    }

    await sendBossJournalText(ctx, presentPartyBossJournal(boss, callback.page), {
      session: boss,
      page: callback.page ?? boss.state.roundLog.length - 1
    });
    return;
  }

  if (callback.type === "view") {
    const boss = await options.partyBoss?.getByPartyInviteToken(callback.token);
    await safeAnswerCallbackQuery(ctx);
    if (boss) {
      const viewerCharacterId = getBossViewerCharacterId(boss, telegramUserId);
      await sendBossText(ctx, "edit", presentPartyBoss(boss, { viewerCharacterId }), {
        session: boss,
        viewerCharacterId,
        includeDevTimeout: options.partyBoss?.areDevHelpersEnabled()
      });
      return;
    }

    const result = await service.getByToken(callback.token);
    await sendPartyView(ctx, "edit", result, service, telegramUserId, options.botUsername);
    return;
  }

  if (callback.type === "join") {
    const result = await service.joinByTokenForTelegramUser(telegramUserId, callback.token, {
      source: "nearby",
      chatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
      messageId: ctx.callbackQuery?.message?.message_id ?? null
    });
    await safeAnswerCallbackQuery(ctx);
    const inviteUrl = "session" in result
      ? buildPartyInviteUrl(options.botUsername, result.session.inviteToken)
      : null;
    await sendText(ctx, "edit", presentPartyJoin(result, { inviteUrl }), "session" in result
      ? {
          session: result.session,
          inviteUrl,
          viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
          includeDevExpire: service.areDevHelpersEnabled(),
          includeBossStart: isBigBarrelParty(result.session)
        }
      : false);
    if (result.state === "joined") {
      await sendBigBarrelInviteShareIfPossible(ctx, result.session, inviteUrl);
      await notifyPartySessionParticipants(ctx, result.session, telegramUserId, options.botUsername, service);
    }
    return;
  }

  if (callback.type === "leave") {
    const result = await service.leaveByTokenForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(ctx);
    const inviteUrl = "session" in result
      ? buildPartyInviteUrl(options.botUsername, result.session.inviteToken)
      : null;
    await sendText(ctx, "edit", presentPartyLeave(result, { inviteUrl }), "session" in result
      ? {
          session: result.session,
          inviteUrl,
          viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
          includeDevExpire: service.areDevHelpersEnabled(),
          includeBossStart: isBigBarrelParty(result.session)
        }
      : false);
    if (result.state === "left" || result.state === "leader-transferred") {
      await notifyPartySessionParticipants(ctx, result.session, telegramUserId, options.botUsername, service);
    }
    return;
  }

  if (callback.type === "cancel") {
    const result = await service.cancelByTokenForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(
      ctx,
      result.state === "not-leader" ? { text: "Скасувати може тільки лідер ватаги." } : undefined
    );
    const inviteUrl = "session" in result
      ? buildPartyInviteUrl(options.botUsername, result.session.inviteToken)
      : null;
    await sendText(ctx, "edit", presentPartyCancel(result, { inviteUrl }), "session" in result
      ? {
          session: result.session,
          inviteUrl,
          viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
          includeDevExpire: service.areDevHelpersEnabled(),
          includeBossStart: isBigBarrelParty(result.session)
        }
      : false);
    return;
  }

  if (!service.areDevHelpersEnabled()) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await service.forceExpireByToken(callback.token);
  await safeAnswerCallbackQuery(ctx, { text: "Строк збору завершено." });
  await sendPartyView(ctx, "edit", result, service, telegramUserId, options.botUsername);
}

export async function sendPartyJoinFromStartPayload(
  ctx: Context,
  service: PartySessionService,
  token: string,
  options: { botUsername?: string | undefined; partyBoss?: PartyBossService | undefined } = {}
): Promise<boolean> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    return false;
  }

  const partyBoss = options.partyBoss;
  if (partyBoss) {
    const boss = await partyBoss.getByPartyInviteToken(token);
    if (boss) {
      const viewerCharacterId = getBossViewerCharacterId(boss, telegramUserId);
      await ctx.reply(presentPartyBoss(boss, { viewerCharacterId }), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPartyBossKeyboard(boss, viewerCharacterId, {
          includeDevTimeout: partyBoss.areDevHelpersEnabled()
        })
      });
      return true;
    }
  }

  const result = await service.joinByTokenForTelegramUser(telegramUserId, token, {
    source: "deep-link",
    chatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null
  });

  const inviteUrl = "session" in result
    ? buildPartyInviteUrl(options.botUsername, result.session.inviteToken)
    : null;
  await ctx.reply(presentPartyJoin(result, { inviteUrl }), {
    ...HTML_MESSAGE_OPTIONS,
    ...("session" in result
      ? {
          reply_markup: buildPartySessionKeyboard(result.session, {
            viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
            inviteUrl,
            includeBossStart: isBigBarrelParty(result.session)
          })
        }
      : {})
  });
  return true;
}

async function handleNearbyOpen(
  ctx: Context,
  callback: Extract<PartySessionCallback, { type: "nearby-open" }>,
  service: PartySessionService,
  options: PartySessionCommandOptions,
  telegramUserId: bigint
): Promise<void> {
  const session = await service.getLiveRecruitingByTelegramUser(telegramUserId);
  if (!session) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Спершу відкрийте живу ватагу через /dev_party.",
      show_alert: true
    });
    return;
  }

  const snapshot = await options.presence.getNearbyDuelCandidatesForTelegramUser(telegramUserId, callback.page);

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentPartyNearbyCandidates(snapshot), {
    ...HTML_MESSAGE_OPTIONS,
    ...(snapshot.state === "ready"
      ? { reply_markup: buildPartySessionNearbyCandidatesKeyboard(snapshot) }
      : {})
  });
}

async function handleNearbyInvite(
  ctx: Context,
  callback: Extract<PartySessionCallback, { type: "nearby-invite" }>,
  service: PartySessionService,
  options: PartySessionCommandOptions,
  telegramUserId: bigint
): Promise<void> {
  const session = await service.getLiveRecruitingByTelegramUser(telegramUserId);
  if (!session) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Спершу відкрийте живу ватагу через /dev_party.",
      show_alert: true
    });
    return;
  }

  if (!(await options.presence.isNearbyDuelTargetAvailable(telegramUserId, callback.targetTelegramUserId))) {
    await safeAnswerCallbackQuery(ctx, { text: "Цей пригодник уже не активний поруч." });
    await sendText(ctx, "edit", presentPartyView({
      state: "ready",
      session
    }, {
      inviteUrl: buildPartyInviteUrl(options.botUsername, session.inviteToken)
    }), {
      session,
      inviteUrl: buildPartyInviteUrl(options.botUsername, session.inviteToken),
      viewerCharacterId: getViewerCharacterId(session, telegramUserId),
      includeDevExpire: service.areDevHelpersEnabled(),
      includeBossStart: isBigBarrelParty(session)
    });
    return;
  }

  const target = await findNearbyTarget(options.presence, telegramUserId, callback.targetTelegramUserId, callback.page);
  const inviteUrl = buildPartyInviteUrl(options.botUsername, session.inviteToken);

  try {
    await ctx.api.sendMessage(
      Number(callback.targetTelegramUserId),
      presentPartyNearbyInviteNotification(session, inviteUrl),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPartySessionInviteKeyboard(session)
      }
    );
  } catch {
    // Private invite delivery is best-effort; the party row remains canonical.
  }

  await safeAnswerCallbackQuery(ctx, { text: "Запрошення передано, якщо Telegram не зачинив двері." });
  const view = await service.getByToken(session.inviteToken);
  if (view.state === "ready") {
    await sendText(
      ctx,
      "edit",
      presentPartyNearbyInviteSent(view, target?.name ?? "пригодника поруч"),
      {
        session: view.session,
        inviteUrl: buildPartyInviteUrl(options.botUsername, view.session.inviteToken),
        viewerCharacterId: getViewerCharacterId(view.session, telegramUserId),
        includeDevExpire: service.areDevHelpersEnabled(),
        includeBossStart: isBigBarrelParty(view.session)
      }
    );
  }
}

async function sendPartyView(
  ctx: Context,
  mode: "reply" | "edit",
  result: Awaited<ReturnType<PartySessionService["getByToken"]>>,
  service: PartySessionService,
  telegramUserId: bigint,
  botUsername?: string
): Promise<void> {
  const inviteUrl = result.state === "ready"
    ? buildPartyInviteUrl(botUsername, result.session.inviteToken)
    : null;

  await sendText(ctx, mode, presentPartyView(result, { inviteUrl }), result.state === "ready"
    ? {
        session: result.session,
        inviteUrl,
        viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
        includeDevExpire: service.areDevHelpersEnabled(),
        includeBossStart: isBigBarrelParty(result.session)
      }
    : false);
}

async function sendBigBarrelInviteShareIfPossible(
  ctx: Context,
  session: Parameters<typeof presentPartyInviteShare>[0],
  inviteUrl: string | null
): Promise<void> {
  if (!inviteUrl || !isBigBarrelParty(session) || session.status !== "recruiting") {
    return;
  }

  const templateIndex = getInitialBigBarrelInviteTemplateIndex(session.inviteToken);
  await ctx.reply(presentPartyInviteShare(session, inviteUrl, { templateIndex }), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildPartySessionInviteShareKeyboard(session.inviteToken, templateIndex)
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | false
    | {
        session: Parameters<typeof buildPartySessionKeyboard>[0];
        inviteUrl?: string | null | undefined;
        viewerCharacterId?: string | null | undefined;
        includeDevExpire?: boolean | undefined;
        includeBossStart?: boolean | undefined;
      } = false
): Promise<void> {
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    ...(keyboard
      ? {
          reply_markup: buildPartySessionKeyboard(keyboard.session, {
            viewerCharacterId: keyboard.viewerCharacterId,
            inviteUrl: keyboard.inviteUrl,
            includeDevExpire: keyboard.includeDevExpire,
            includeBossStart: keyboard.includeBossStart
          })
        }
      : {})
  };

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

async function sendBossText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | false
    | {
        session: Parameters<typeof buildPartyBossKeyboard>[0];
        viewerCharacterId?: string | null | undefined;
        includeDevTimeout?: boolean | undefined;
      } = false
): Promise<void> {
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    ...(keyboard
      ? {
          reply_markup: buildPartyBossKeyboard(keyboard.session, keyboard.viewerCharacterId ?? null, {
            includeDevTimeout: keyboard.includeDevTimeout
          })
        }
      : {})
  };

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

async function handlePartyInviteShare(
  ctx: Context,
  callback: Extract<PartySessionCallback, { type: "share" | "invite" }>,
  service: PartySessionService,
  options: PartySessionCommandOptions,
  telegramUserId: bigint
): Promise<void> {
  const result = await service.getByToken(callback.token);

  if (result.state !== "ready" || !isBigBarrelParty(result.session) || result.session.status !== "recruiting") {
    await safeAnswerCallbackQuery(ctx, { text: "Цей рейдовий збір уже не редагує запрошення." });
    return;
  }

  if (!isJoinedParticipant(result.session, telegramUserId)) {
    await safeAnswerCallbackQuery(ctx, { text: "Запрошення можуть крутити тільки учасники збору." });
    return;
  }

  const inviteUrl = buildPartyInviteUrl(options.botUsername, result.session.inviteToken);
  if (!inviteUrl) {
    await safeAnswerCallbackQuery(ctx, { text: "Посилання ще не зібралося: бот не знає свій username." });
    return;
  }

  const templateIndex = callback.type === "share"
    ? getInitialBigBarrelInviteTemplateIndex(result.session.inviteToken)
    : getNextBigBarrelInviteTemplateIndex(result.session.inviteToken, callback.templateIndex);

  await safeAnswerCallbackQuery(ctx);

  const text = presentPartyInviteShare(result.session, inviteUrl, { templateIndex });
  const optionsWithKeyboard = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildPartySessionInviteShareKeyboard(result.session.inviteToken, templateIndex)
  };

  if (callback.type === "share") {
    await ctx.reply(text, optionsWithKeyboard);
    return;
  }

  await safeEditMessageText(ctx, text, optionsWithKeyboard);
}

async function sendBossJournalText(
  ctx: Context,
  text: string,
  keyboard: {
    session: Parameters<typeof buildPartyBossJournalKeyboard>[0];
    page: number;
  }
): Promise<void> {
  await safeEditMessageText(ctx, text, {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildPartyBossJournalKeyboard(keyboard.session, keyboard.page)
  });
}

async function notifyPartySessionParticipants(
  ctx: Context,
  session: Parameters<typeof buildPartySessionKeyboard>[0],
  actorTelegramUserId: bigint,
  botUsername: string | undefined,
  service: PartySessionService
): Promise<void> {
  const inviteUrl = buildPartyInviteUrl(botUsername, session.inviteToken);

  for (const participant of session.participants) {
    if (
      participant.character.telegramUserId === actorTelegramUserId ||
      participant.status !== "joined" ||
      !participant.chatId ||
      !participant.messageId
    ) {
      continue;
    }

    try {
      await ctx.api.editMessageText(
        Number(participant.chatId),
        participant.messageId,
        presentPartyView({ state: "ready", session }, { inviteUrl }),
        {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPartySessionKeyboard(session, {
            viewerCharacterId: participant.characterId,
            inviteUrl,
            includeDevExpire: service.areDevHelpersEnabled(),
            includeBossStart: isBigBarrelParty(session)
          })
        }
      );
    } catch {
      // Best-effort card refresh; the stored party state remains canonical for manual refresh.
    }
  }
}

async function notifyPartyBossParticipants(
  ctx: Context,
  session: Parameters<typeof buildPartyBossKeyboard>[0],
  actorTelegramUserId: bigint,
  options: {
    includeDevTimeout?: boolean | undefined;
    includeIntro?: boolean | undefined;
    notice: string;
  }
): Promise<void> {
  for (const participant of session.participants) {
    if (participant.telegramUserId === actorTelegramUserId) {
      continue;
    }

    try {
      if (options.includeIntro) {
        await ctx.api.sendMessage(
          Number(participant.telegramUserId),
          presentPartyBossIntro(session, participant.id),
          HTML_MESSAGE_OPTIONS
        );
      }

      await ctx.api.sendMessage(
        Number(participant.telegramUserId),
        presentPartyBoss(session, {
          viewerCharacterId: participant.id,
          notice: options.notice
        }),
        {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPartyBossKeyboard(session, participant.id, {
            includeDevTimeout: options.includeDevTimeout
          })
        }
      );
    } catch {
      // Best-effort private push; refresh callbacks still replay the canonical state.
    }
  }
}

function getViewerCharacterId(
  session: Parameters<typeof buildPartySessionKeyboard>[0],
  telegramUserId: bigint
): string | null {
  const participant = session.participants.find(
    (row) => row.character.telegramUserId === telegramUserId && row.status === "joined"
  );

  return participant?.characterId ?? null;
}

function isBigBarrelParty(session: Parameters<typeof buildPartySessionKeyboard>[0]): boolean {
  return session.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID;
}

function isJoinedParticipant(
  session: Parameters<typeof buildPartySessionKeyboard>[0],
  telegramUserId: bigint
): boolean {
  return session.participants.some((participant) =>
    participant.status === "joined" &&
    participant.character.telegramUserId === telegramUserId
  );
}

function isBigBossSession(session: Parameters<typeof buildPartyBossKeyboard>[0]): boolean {
  return session.rulesVersion === "big-barrel-brother-v1" ||
    session.bossKey === "big-barrel-brother" ||
    session.state.boss.monsterId === "big-barrel-brother";
}

function getBossViewerCharacterId(
  session: Parameters<typeof buildPartyBossKeyboard>[0],
  telegramUserId: bigint
): string | null {
  const participant = session.participants.find((row) => row.telegramUserId === telegramUserId);
  return participant?.id ?? null;
}

async function findNearbyTarget(
  presence: PresenceService,
  telegramUserId: bigint,
  targetTelegramUserId: bigint,
  page: number
): Promise<PresencePerson | null> {
  const snapshot = await presence.getNearbyDuelCandidatesForTelegramUser(telegramUserId, page);

  if (snapshot.state !== "ready") {
    return null;
  }

  return snapshot.visible.find((candidate) => candidate.telegramUserId === targetTelegramUserId) ?? null;
}
