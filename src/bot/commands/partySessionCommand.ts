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
  buildPartyBossKeyboard,
  buildPartySessionKeyboard,
  buildPartySessionNearbyCandidatesKeyboard
} from "../keyboards/partySessionKeyboard";
import {
  presentPartyCancel,
  presentPartyBoss,
  presentPartyBossAction,
  presentPartyBossJournal,
  presentPartyBossStart,
  presentPartyCreate,
  presentPartyJoin,
  presentPartyLeave,
  presentPartyNearbyCandidates,
  presentPartyNearbyInviteNotification,
  presentPartyNearbyInviteSent,
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
    await sendBossText(ctx, "edit", presentPartyBossStart(result, viewerCharacterId), "session" in result
      ? {
          session: result.session,
          viewerCharacterId,
          includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
        }
      : false);
    if (result.state === "started") {
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        notice: "Бос-пробу запущено. Ваша приватна картка вже тут."
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
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        notice: result.session.status === "active"
          ? "Хід оновлено. Показую новий стан бос-проби."
          : "Бос-пробу завершено. Показую підсумок."
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
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        notice: result.session.status === "active"
          ? canForceTimeout
            ? "Dev-таймаут добив хід. Показую новий стан бос-проби."
            : "Таймер ходу спрацював. Показую новий стан бос-проби."
          : canForceTimeout
            ? "Dev-таймаут завершив бос-пробу. Показую підсумок."
            : "Таймер ходу завершив бос-пробу. Показую підсумок."
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
      await sendBossText(ctx, "edit", "Бос-проба не знайшлася.", false);
      return;
    }

    const viewerCharacterId = getBossViewerCharacterId(boss, telegramUserId);
    await sendBossText(ctx, "edit", presentPartyBossJournal(boss), {
      session: boss,
      viewerCharacterId,
      includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
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
    await sendPartyView(ctx, "edit", result, service, telegramUserId);
    return;
  }

  if (callback.type === "join") {
    const result = await service.joinByTokenForTelegramUser(telegramUserId, callback.token, {
      source: "nearby",
      chatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
      messageId: ctx.callbackQuery?.message?.message_id ?? null
    });
    await safeAnswerCallbackQuery(ctx);
    await sendText(ctx, "edit", presentPartyJoin(result), "session" in result
      ? {
          session: result.session,
          viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
          includeDevExpire: service.areDevHelpersEnabled()
        }
      : false);
    return;
  }

  if (callback.type === "leave") {
    const result = await service.leaveByTokenForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(ctx);
    await sendText(ctx, "edit", presentPartyLeave(result), "session" in result
      ? {
          session: result.session,
          viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
          includeDevExpire: service.areDevHelpersEnabled()
        }
      : false);
    return;
  }

  if (callback.type === "cancel") {
    const result = await service.cancelByTokenForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(
      ctx,
      result.state === "not-leader" ? { text: "Скасувати може тільки лідер ватаги." } : undefined
    );
    await sendText(ctx, "edit", presentPartyCancel(result), "session" in result
      ? {
          session: result.session,
          viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
          includeDevExpire: service.areDevHelpersEnabled()
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
  await sendPartyView(ctx, "edit", result, service, telegramUserId);
}

export async function sendPartyJoinFromStartPayload(
  ctx: Context,
  service: PartySessionService,
  token: string
): Promise<boolean> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    return false;
  }

  const result = await service.joinByTokenForTelegramUser(telegramUserId, token, {
    source: "deep-link",
    chatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null
  });

  await ctx.reply(presentPartyJoin(result), {
    ...HTML_MESSAGE_OPTIONS,
    ...("session" in result
      ? {
          reply_markup: buildPartySessionKeyboard(result.session, {
            viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
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
    await sendText(ctx, "edit", presentPartyView({ state: "ready", session }), {
      session,
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
  telegramUserId: bigint
): Promise<void> {
  await sendText(ctx, mode, presentPartyView(result), result.state === "ready"
    ? {
        session: result.session,
        viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
        includeDevExpire: service.areDevHelpersEnabled(),
        includeBossStart: isBigBarrelParty(result.session)
      }
    : false);
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | false
    | {
        session: Parameters<typeof buildPartySessionKeyboard>[0];
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

async function notifyPartyBossParticipants(
  ctx: Context,
  session: Parameters<typeof buildPartyBossKeyboard>[0],
  actorTelegramUserId: bigint,
  options: {
    includeDevTimeout?: boolean | undefined;
    notice: string;
  }
): Promise<void> {
  for (const participant of session.participants) {
    if (participant.telegramUserId === actorTelegramUserId) {
      continue;
    }

    try {
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
