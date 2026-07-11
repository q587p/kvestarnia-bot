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
  buildPartyBossItemsKeyboard,
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
  presentPartyBossItems,
  presentPartyBossJournal,
  presentPartyBossStart,
  presentPartyCreate,
  presentPartyJoin,
  presentPartyLeave,
  presentPartyNearbyCandidates,
  presentPartyNearbyInviteNotification,
  presentPartyNearbyInviteSent,
  presentPartyInviteShare,
  formatRemainingWait,
  getInitialBigBarrelInviteTemplateIndex,
  getNextBigBarrelInviteTemplateIndex,
  presentPartyView
} from "../presenters/partySessionPresenter";
import { presentInvalidCallback } from "../presenters/onboardingPresenter";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import { presentManaSpentLine } from "../presenters/resourcePresenter";
import { BUREAUCRAMANCER_PROTOCOL_BASE_MANA_COST } from "../../services/bureaucramancerProtocol";
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
    if (!service.areDevHelpersEnabled()) {
      await ctx.reply("Dev-команди тут не ввімкнені. Корчмар сховав мотузку.");
      return;
    }

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
        partyBoss: options.partyBoss,
        telegramUserId,
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
      });
    } else {
      await sendBossText(ctx, "edit", presentPartyBossStart(result, viewerCharacterId), "session" in result
        ? {
            session: result.session,
            viewerCharacterId,
            partyBoss: options.partyBoss,
            telegramUserId,
            includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
          }
        : false);
    }
    if (result.state === "started") {
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        partyBoss: options.partyBoss,
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
    await safeAnswerCallbackQuery(ctx, result.state === "updated"
      ? { text: "Вибір оновлено." }
      : result.state === "duplicate"
        ? { text: "Дію вже записано." }
        : undefined);
    const viewerCharacterId = "session" in result
      ? getBossViewerCharacterId(result.session, telegramUserId)
      : null;
    await sendBossText(ctx, "edit", presentPartyBossAction(result, viewerCharacterId), "session" in result
      ? {
          session: result.session,
          viewerCharacterId,
          partyBoss: options.partyBoss,
          telegramUserId,
          includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
        }
      : false);
    await sendBossAchievementUnlocks(ctx, result, viewerCharacterId);
    if (result.state === "resolved" || result.state === "terminal") {
      const big = isBigBossSession(result.session);
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        partyBoss: options.partyBoss,
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        ...(result.achievementUnlocksByCharacterId
          ? { achievementUnlocksByCharacterId: result.achievementUnlocksByCharacterId }
          : {}),
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

  if (callback.type === "boss-gear") {
    if (!options.partyBoss?.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const result = await options.partyBoss.submitGearForTelegramUser(
      telegramUserId,
      callback.token,
      callback.turn,
      callback.grantKey
    );
    await safeAnswerCallbackQuery(ctx, result.state === "updated"
      ? { text: "Вибір оновлено." }
      : result.state === "duplicate"
        ? { text: "Дію вже записано." }
        : result.state === "gear-unavailable"
        ? {
            text: result.reason === "not-enough-mana"
              ? "Не вистачає мани."
              : "Дія спорядження ще відсапується."
          }
        : undefined);
    const viewerCharacterId = "session" in result
      ? getBossViewerCharacterId(result.session, telegramUserId)
      : null;
    await sendBossText(ctx, "edit", presentPartyBossAction(result, viewerCharacterId), "session" in result
      ? {
          session: result.session,
          viewerCharacterId,
          partyBoss: options.partyBoss,
          telegramUserId,
          includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
        }
      : false);
    await sendBossAchievementUnlocks(ctx, result, viewerCharacterId);
    if (result.state === "resolved" || result.state === "terminal") {
      const big = isBigBossSession(result.session);
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        partyBoss: options.partyBoss,
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        ...(result.achievementUnlocksByCharacterId
          ? { achievementUnlocksByCharacterId: result.achievementUnlocksByCharacterId }
          : {}),
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

  if (callback.type === "boss-items") {
    if (!options.partyBoss?.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const result = await options.partyBoss.listCombatItemsForTelegramUser(
      telegramUserId,
      callback.token,
      callback.turn
    );
    await safeAnswerCallbackQuery(ctx, result.state === "ready" && result.items.length === 0
      ? { text: "Немає корисних одноразових манаток." }
      : undefined);
    const viewerCharacterId = "session" in result
      ? getBossViewerCharacterId(result.session, telegramUserId)
      : null;

    if (result.state === "ready") {
      await safeEditMessageText(ctx, presentPartyBossItems(result, viewerCharacterId), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPartyBossItemsKeyboard({
          token: result.session.partyInviteToken,
          turn: result.session.turn,
          items: result.items
        })
      });
      return;
    }

    await sendBossText(ctx, "edit", presentPartyBossItems(result, viewerCharacterId), "session" in result
      ? {
          session: result.session,
          viewerCharacterId,
          partyBoss: options.partyBoss,
          telegramUserId,
          includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
        }
      : false);
    return;
  }

  if (callback.type === "boss-item") {
    if (!options.partyBoss?.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const result = await options.partyBoss.submitItemForTelegramUser(
      telegramUserId,
      callback.token,
      callback.turn,
      callback.itemKey
    );
    await safeAnswerCallbackQuery(ctx, result.state === "updated"
      ? { text: "Вибір оновлено." }
      : result.state === "duplicate"
        ? { text: "Дію вже записано." }
        : result.state === "item-unavailable"
        ? { text: "Манатка не спрацювала." }
        : undefined);
    const viewerCharacterId = "session" in result
      ? getBossViewerCharacterId(result.session, telegramUserId)
      : null;
    await sendBossText(ctx, "edit", presentPartyBossAction(result, viewerCharacterId), "session" in result
      ? {
          session: result.session,
          viewerCharacterId,
          partyBoss: options.partyBoss,
          telegramUserId,
          includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
        }
      : false);
    await sendBossAchievementUnlocks(ctx, result, viewerCharacterId);
    if (result.state === "resolved" || result.state === "terminal") {
      const big = isBigBossSession(result.session);
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        partyBoss: options.partyBoss,
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        ...(result.achievementUnlocksByCharacterId
          ? { achievementUnlocksByCharacterId: result.achievementUnlocksByCharacterId }
          : {}),
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
          partyBoss: options.partyBoss,
          telegramUserId,
          includeDevTimeout: options.partyBoss.areDevHelpersEnabled()
        }
      : false);
    await sendBossAchievementUnlocks(ctx, result, viewerCharacterId);
    if (result.state === "resolved" || result.state === "terminal") {
      const big = isBigBossSession(result.session);
      await notifyPartyBossParticipants(ctx, result.session, telegramUserId, {
        partyBoss: options.partyBoss,
        includeDevTimeout: options.partyBoss.areDevHelpersEnabled(),
        ...(result.achievementUnlocksByCharacterId
          ? { achievementUnlocksByCharacterId: result.achievementUnlocksByCharacterId }
          : {}),
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
        partyBoss: options.partyBoss,
        telegramUserId,
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
        partyBoss: options.partyBoss,
        telegramUserId,
        includeDevTimeout: options.partyBoss?.areDevHelpersEnabled()
      });
      return;
    }

    const result = await service.getByToken(callback.token);
    await sendPartyView(ctx, "edit", result, service, telegramUserId, options.botUsername);
    return;
  }

  if (callback.type === "readiness") {
    const boss = await options.partyBoss?.getByPartyInviteToken(callback.token);
    if (boss) {
      await safeAnswerCallbackQuery(ctx, { text: "Рейд уже стартував. Готовність лишилась у зборі." });
      const viewerCharacterId = getBossViewerCharacterId(boss, telegramUserId);
      await sendBossText(ctx, "edit", presentPartyBoss(boss, { viewerCharacterId }), {
        session: boss,
        viewerCharacterId,
        partyBoss: options.partyBoss,
        telegramUserId,
        includeDevTimeout: options.partyBoss?.areDevHelpersEnabled()
      });
      return;
    }

    const result = await service.setReadinessForTelegramUser(
      telegramUserId,
      callback.token,
      callback.readiness
    );
    await safeAnswerCallbackQuery(ctx, { text: presentReadinessCallbackAnswer(result.state, callback.readiness) });

    if (!("session" in result)) {
      await sendText(ctx, "edit", result.state === "no-character"
        ? "Квестарня не впізнала пригодника. Спробуйте ще раз із особистого акаунта."
        : "Ватага не знайшлася.", false);
      return;
    }

    const inviteUrl = buildPartyInviteUrl(options.botUsername, result.session.inviteToken);
    await sendText(ctx, "edit", presentPartyView({ state: "ready", session: result.session }, { inviteUrl }), {
      session: result.session,
      inviteUrl,
      viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
      includeDevExpire: service.areDevHelpersEnabled(),
      includeBossStart: isBigBarrelParty(result.session)
    });

    if (result.state === "updated") {
      await notifyPartySessionParticipants(ctx, result.session, telegramUserId, options.botUsername, service);
    }
    return;
  }

  if (callback.type === "ward-place" || callback.type === "ward-support") {
    const boss = await options.partyBoss?.getByPartyInviteToken(callback.token);
    if (boss) {
      await safeAnswerCallbackQuery(ctx, {
        text: callback.type === "ward-place"
          ? "Рейд уже стартував. Нові знаки не приймаються."
          : "Рейд уже стартував. Нові підпори не приймаються."
      });
      const viewerCharacterId = getBossViewerCharacterId(boss, telegramUserId);
      await sendBossText(ctx, "edit", presentPartyBoss(boss, { viewerCharacterId }), {
        session: boss,
        viewerCharacterId,
        partyBoss: options.partyBoss,
        telegramUserId,
        includeDevTimeout: options.partyBoss?.areDevHelpersEnabled()
      });
      return;
    }

    const result = callback.type === "ward-place"
      ? await service.placeKharakternykWardSignForTelegramUser(telegramUserId, callback.token)
      : await service.supportKharakternykWardSignForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(ctx, {
      text: callback.type === "ward-place"
        ? presentWardPlaceCallbackAnswer(
            result.state as Awaited<ReturnType<PartySessionService["placeKharakternykWardSignForTelegramUser"]>>["state"]
          )
        : presentWardSupportCallbackAnswer(
            result.state as Awaited<ReturnType<PartySessionService["supportKharakternykWardSignForTelegramUser"]>>["state"]
          )
    });

    if (!("session" in result)) {
      await sendText(ctx, "edit", result.state === "no-character"
        ? "Квестарня не впізнала пригодника. Спробуйте ще раз із особистого акаунта."
        : "Ватага не знайшлася.", false);
      return;
    }

    const inviteUrl = buildPartyInviteUrl(options.botUsername, result.session.inviteToken);
    await sendText(ctx, "edit", presentPartyView({ state: "ready", session: result.session }, { inviteUrl }), {
      session: result.session,
      inviteUrl,
      viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
      includeDevExpire: service.areDevHelpersEnabled(),
      includeBossStart: isBigBarrelParty(result.session)
    });

    if (result.state === "updated") {
      const confirmation = callback.type === "ward-place"
        ? presentWardPlaceConfirmation(result.session)
        : presentWardSupportConfirmation(result.session, telegramUserId);
      if (confirmation) {
        await ctx.reply(confirmation, HTML_MESSAGE_OPTIONS);
      }
      await notifyPartySessionParticipants(ctx, result.session, telegramUserId, options.botUsername, service);
    }
    return;
  }

  if (callback.type === "protocol-file" || callback.type === "protocol-sign") {
    const boss = await options.partyBoss?.getByPartyInviteToken(callback.token);
    if (boss) {
      await safeAnswerCallbackQuery(ctx, {
        text: callback.type === "protocol-file"
          ? "Рейд уже стартував. Нові протоколи не приймаються."
          : "Рейд уже стартував. Нові підписи не приймаються."
      });
      const viewerCharacterId = getBossViewerCharacterId(boss, telegramUserId);
      await sendBossText(ctx, "edit", presentPartyBoss(boss, { viewerCharacterId }), {
        session: boss,
        viewerCharacterId,
        partyBoss: options.partyBoss,
        telegramUserId,
        includeDevTimeout: options.partyBoss?.areDevHelpersEnabled()
      });
      return;
    }

    if (callback.type === "protocol-file") {
      const result = await service.fileBureaucramancerPersonalProtocolForTelegramUser(telegramUserId, callback.token);
      await safeAnswerCallbackQuery(
        ctx,
        result.state === "cooldown" ? undefined : { text: presentProtocolFileCallbackAnswer(result.state) }
      );

      if (!("session" in result)) {
        await sendText(ctx, "edit", result.state === "no-character"
          ? "Квестарня не впізнала пригодника. Спробуйте ще раз із особистого акаунта."
          : "Ватага не знайшлася.", false);
        return;
      }

      const inviteUrl = buildPartyInviteUrl(options.botUsername, result.session.inviteToken);
      await sendText(ctx, "edit", presentPartyView({ state: "ready", session: result.session }, { inviteUrl }), {
        session: result.session,
        inviteUrl,
        viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
        includeDevExpire: service.areDevHelpersEnabled(),
        includeBossStart: isBigBarrelParty(result.session)
      });

      if (result.state === "cooldown") {
        await ctx.reply(presentProtocolCooldownNotice(result.availableAt, result.now), HTML_MESSAGE_OPTIONS);
        return;
      }

      if (result.state === "updated") {
        await ctx.reply(
          presentProtocolFileConfirmation(
            result.session.personalProtocol?.manaCost ?? BUREAUCRAMANCER_PROTOCOL_BASE_MANA_COST
          ),
          HTML_MESSAGE_OPTIONS
        );
        await notifyPartySessionParticipants(ctx, result.session, telegramUserId, options.botUsername, service, {
          includeActor: true
        });
      }
      return;
    }

    const result = await service.signBureaucramancerPersonalProtocolForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(ctx, {
      text: presentProtocolSignCallbackAnswer(result.state)
    });

    if (!("session" in result)) {
      await sendText(ctx, "edit", result.state === "no-character"
        ? "Квестарня не впізнала пригодника. Спробуйте ще раз із особистого акаунта."
        : "Ватага не знайшлася.", false);
      return;
    }

    const inviteUrl = buildPartyInviteUrl(options.botUsername, result.session.inviteToken);
    await sendText(ctx, "edit", presentPartyView({ state: "ready", session: result.session }, { inviteUrl }), {
      session: result.session,
      inviteUrl,
      viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
      includeDevExpire: service.areDevHelpersEnabled(),
      includeBossStart: isBigBarrelParty(result.session)
    });

    if (result.state === "updated") {
      await ctx.reply(presentProtocolSignConfirmation(), HTML_MESSAGE_OPTIONS);
      await notifyPartySessionParticipants(ctx, result.session, telegramUserId, options.botUsername, service, {
        includeActor: true
      });
    }
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
      && result.state !== "ineligible"
      ? {
          session: result.session,
          inviteUrl,
          viewerCharacterId: getViewerCharacterId(result.session, telegramUserId),
          includeDevExpire: service.areDevHelpersEnabled(),
          includeBossStart: isBigBarrelParty(result.session)
        }
      : false);
    if (result.state === "joined") {
      await notifyPartySessionParticipants(ctx, result.session, telegramUserId, options.botUsername, service);
      if (result.cancelledSoloSession) {
        await notifyPartySessionParticipants(ctx, result.cancelledSoloSession, telegramUserId, options.botUsername, service, {
          includeActor: true
        });
      }
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
          includeCombatItems: await resolvePartyBossCombatItemShortcut(partyBoss, telegramUserId, boss),
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
    ...("session" in result && result.state !== "ineligible"
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
        partyBoss?: PartyBossService | undefined;
        telegramUserId?: bigint | undefined;
        includeCombatItems?: boolean | undefined;
        includeDevTimeout?: boolean | undefined;
      } = false
): Promise<void> {
  const includeCombatItems = keyboard
    ? await resolvePartyBossCombatItemShortcut(
        keyboard.partyBoss,
        keyboard.telegramUserId,
        keyboard.session,
        keyboard.includeCombatItems
      )
    : undefined;
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    ...(keyboard
      ? {
          reply_markup: buildPartyBossKeyboard(keyboard.session, keyboard.viewerCharacterId ?? null, {
            ...(includeCombatItems === undefined ? {} : { includeCombatItems }),
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
  service: PartySessionService,
  options: { includeActor?: boolean } = {}
): Promise<void> {
  const inviteUrl = buildPartyInviteUrl(botUsername, session.inviteToken);

  for (const participant of session.participants) {
    if (
      (!options.includeActor && participant.character.telegramUserId === actorTelegramUserId) ||
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
    partyBoss?: PartyBossService | undefined;
    includeDevTimeout?: boolean | undefined;
    includeIntro?: boolean | undefined;
    achievementUnlocksByCharacterId?: Record<string, Parameters<typeof presentAchievementUnlockNotification>[0]>;
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
            includeCombatItems: await resolvePartyBossCombatItemShortcut(
              options.partyBoss,
              participant.telegramUserId,
              session
            ),
            includeDevTimeout: options.includeDevTimeout
          })
        }
      );
      await sendAchievementUnlocksToChat(
        ctx,
        participant.telegramUserId,
        options.achievementUnlocksByCharacterId?.[participant.id] ?? []
      );
    } catch {
      // Best-effort private push; refresh callbacks still replay the canonical state.
    }
  }
}

async function sendBossAchievementUnlocks(
  ctx: Context,
  result: { achievementUnlocksByCharacterId?: Record<string, Parameters<typeof presentAchievementUnlockNotification>[0]> },
  viewerCharacterId: string | null
): Promise<void> {
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
  session: Parameters<typeof buildPartySessionKeyboard>[0],
  telegramUserId: bigint
): string | null {
  const participant = session.participants.find(
    (row) => row.character.telegramUserId === telegramUserId && row.status === "joined"
  );

  return participant?.characterId ?? null;
}

function presentReadinessCallbackAnswer(
  state: Awaited<ReturnType<PartySessionService["setReadinessForTelegramUser"]>>["state"],
  readiness: "ready" | "waiting"
): string {
  if (state === "updated") {
    return readiness === "ready" ? "Позначено: ви готові." : "Позначено: ще готуєтесь.";
  }

  if (state === "already-set") {
    return "Статус уже такий.";
  }

  if (state === "not-member") {
    return "Ця готовність не належить вашому запису.";
  }

  if (state === "not-recruiting") {
    return "Збір уже не змінює готовність.";
  }

  if (state === "cancelled" || state === "expired") {
    return "Цей збір уже закрито.";
  }

  return "Готовність не записалася.";
}

function isBigBarrelParty(session: Parameters<typeof buildPartySessionKeyboard>[0]): boolean {
  return session.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID;
}

function presentWardPlaceCallbackAnswer(
  state: Awaited<ReturnType<PartySessionService["placeKharakternykWardSignForTelegramUser"]>>["state"]
): string {
  if (state === "updated") {
    return "Знак поставлено.";
  }
  if (state === "already-placed") {
    return "Ваш знак уже стоїть.";
  }
  if (state === "already-exists") {
    return "Знак уже стоїть біля бочки.";
  }
  if (state === "ineligible") {
    return "Це вміє тільки характерник від 3 рівня.";
  }
  if (state === "not-enough-mana") {
    return "Не вистачає мани.";
  }
  if (state === "not-member") {
    return "Спершу треба бути у ватазі.";
  }
  if (state === "not-recruiting" || state === "cancelled" || state === "expired") {
    return "Цей збір уже не приймає знаки.";
  }
  return "Знак не записався.";
}

function presentWardSupportCallbackAnswer(
  state: Awaited<ReturnType<PartySessionService["supportKharakternykWardSignForTelegramUser"]>>["state"]
): string {
  if (state === "updated") {
    return "Підпор записано.";
  }
  if (state === "already-supported") {
    return "Ваш підпор уже тримає знак.";
  }
  if (state === "no-sign") {
    return "Знак ще не стоїть.";
  }
  if (state === "self-support") {
    return "Власний знак сам себе не підпирає.";
  }
  if (state === "not-enough-mana") {
    return "Не вистачає мани.";
  }
  if (state === "not-member") {
    return "Спершу треба бути у ватазі.";
  }
  if (state === "not-recruiting" || state === "cancelled" || state === "expired") {
    return "Цей збір уже не приймає підпор.";
  }
  return "Підпор не записався.";
}

function presentWardPlaceConfirmation(
  session: Parameters<typeof buildPartySessionKeyboard>[0]
): string | null {
  const manaCost = session.wardSign?.manaCost;

  return typeof manaCost === "number"
    ? `🧿 <b>Ви поставили знак</b>\n\n${presentManaSpentLine(manaCost)}`
    : null;
}

function presentWardSupportConfirmation(
  session: Parameters<typeof buildPartySessionKeyboard>[0],
  telegramUserId: bigint
): string | null {
  const participant = session.participants.find((row) =>
    row.character.telegramUserId === telegramUserId &&
    row.status === "joined"
  );
  const manaCost = participant?.wardSignSupport?.manaCost;

  return typeof manaCost === "number"
    ? `✋ <b>Ви підперли знак</b>\n\n${presentManaSpentLine(manaCost)}`
    : null;
}

function presentProtocolFileCallbackAnswer(
  state: Awaited<ReturnType<PartySessionService["fileBureaucramancerPersonalProtocolForTelegramUser"]>>["state"]
): string {
  if (state === "updated") {
    return "Форму 13-А подано.";
  }
  if (state === "already-filed") {
    return "Ваш Протокол 13-З уже відкрито.";
  }
  if (state === "already-exists") {
    return "Протокол 13-З уже відкрито.";
  }
  if (state === "ineligible") {
    return "Це вміє тільки бюрокромант від 3 рівня.";
  }
  if (state === "blocked") {
    return "Спершу завершіть інший бій.";
  }
  if (state === "not-enough-mana") {
    return "Не вистачає мани.";
  }
  if (state === "stale") {
    return "Картка ватаги змінилася. Оновіть її й спробуйте ще раз.";
  }
  if (state === "not-member") {
    return "Спершу треба бути у ватазі.";
  }
  if (state === "not-recruiting" || state === "cancelled" || state === "expired") {
    return "Цей збір уже не приймає протоколи.";
  }
  return "Протокол не записався.";
}

function presentProtocolSignCallbackAnswer(
  state: Awaited<ReturnType<PartySessionService["signBureaucramancerPersonalProtocolForTelegramUser"]>>["state"]
): string {
  if (state === "updated") {
    return "Підписано.";
  }
  if (state === "already-signed") {
    return "Ваш підпис уже в протоколі.";
  }
  if (state === "no-protocol") {
    return "Протокол ще не відкрито.";
  }
  if (state === "not-member") {
    return "Спершу треба бути у ватазі.";
  }
  if (state === "blocked") {
    return "Спершу завершіть інший бій.";
  }
  if (state === "stale") {
    return "Картка ватаги змінилася. Оновіть її й спробуйте ще раз.";
  }
  if (state === "not-recruiting" || state === "cancelled" || state === "expired") {
    return "Цей збір уже не приймає підписи.";
  }
  return "Підпис не записався.";
}

function presentProtocolFileConfirmation(manaCost: number): string {
  return [
    "📄 <b>Форму 13-А подано</b>",
    "",
    presentManaSpentLine(manaCost),
    "Вона відкрила Протокол 13-З. Ви автоматично підписали власну персональну претензію."
  ].join("\n");
}

function presentProtocolCooldownNotice(availableAt: Date, now: Date): string {
  return [
    "📄 <b>Форму 13-А поки не прийнято</b>",
    "",
    `До наступного подання зачекайте ще <b>${formatRemainingWait(availableAt, now)}</b>.`
  ].join("\n");
}

function presentProtocolSignConfirmation(): string {
  return [
    "✍️ <b>Протокол підписано</b>",
    "",
    "Перша персональна претензія Бочки піде в папери, а не в ребра."
  ].join("\n");
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

async function resolvePartyBossCombatItemShortcut(
  partyBoss: PartyBossService | undefined,
  telegramUserId: bigint | undefined,
  session: Parameters<typeof buildPartyBossKeyboard>[0],
  explicit?: boolean
): Promise<boolean | undefined> {
  if (explicit !== undefined) {
    return explicit;
  }

  if (!partyBoss || telegramUserId === undefined || session.status !== "active") {
    return undefined;
  }

  return partyBoss.hasCombatItemsForTelegramUser(
    telegramUserId,
    session.partyInviteToken,
    session.turn
  );
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
