import type { Bot, Context } from "grammy";
import type { GroupCombatCallback } from "../callbacks/groupCombatCallbackData";
import type { GroupCombatService } from "../../services/groupCombatService";
import {
  getGroupCombatActionProfile,
  GROUP_COMBAT_SUPPORTED_ITEM_IDS,
  type GroupCombatActionKey
} from "../../domain/groupCombat/groupCombat";
import {
  deliverGroupCombatCards,
  deliverGroupCombatParticipantCard,
  deliverGroupCombatSettlementNotifications
} from "../groupCombatCardDelivery";
import {
  buildGroupCombatAbilityTargetKeyboard,
  buildGroupCombatKeyboard,
  buildGroupCombatItemsKeyboard,
  buildGroupCombatJournalKeyboard,
  buildGroupCombatStatisticsKeyboard,
  buildGroupCombatTargetKeyboard,
  getSingleGroupCombatActionTargetIndex,
  groupCombatActionRequiresExplicitTarget,
  parseGroupCombatReplyAbility,
  parseGroupCombatReplyButton
} from "../keyboards/groupCombatKeyboard";
import { buildPartySessionKeyboard } from "../keyboards/partySessionKeyboard";
import {
  presentGroupCombat,
  presentGroupCombatItems,
  presentGroupCombatJournal,
  presentGroupCombatStatistics
} from "../presenters/groupCombatPresenter";
import { formatRemainingWait, presentPartySession } from "../presenters/partySessionPresenter";
import { buildPartyInviteUrlForSession } from "../../services/partySessionService";
import type {
  GroupCombatSettlementNotice,
  GroupCombatStartResult,
  LeftPassagePartyCreateResult
} from "../../db/repositories/groupCombatRepository";
import { telegramUserIdFromContext } from "../context";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { serializePartySessionDelivery } from "../partySessionDeliveryCoordinator";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;
const PARTY_CODE_HELP = [
  "🧭 Код ватаги створює команда /dev_party.",
  "У картці збору скопіюйте з посилання лише частину після «party_».",
  "За три хвилини сутичка почнеться сама. Ватажок може запустити її раніше: /dev_group_combat КОД"
].join("\n");
const TIMEOUT_CODE_HELP = "⏱️ /dev_group_combat_timeout КОД — локально завершити поточне очікування ходу.";

export function registerGroupCombatDevCommand(bot: Bot, service: GroupCombatService): void {
  bot.command("dev_group_combat", async (ctx) => {
    if (!service.areDevHelpersEnabled()) {
      return;
    }
    const telegramUserId = telegramUserIdFromContext(ctx.from);
    const token = readCommandToken(ctx.message?.text);
    if (!telegramUserId || !token) {
      await ctx.reply(PARTY_CODE_HELP);
      return;
    }
    const result = await serializePartySessionDelivery(token, () =>
      service.startProof(telegramUserId, token)
    );
    if ("session" in result) {
      const actor = result.session.participants.find(
        (participant) => participant.telegramUserId === telegramUserId
      );
      await deliverGroupCombatCards(ctx.api, service, result.session, {
        ...(actor ? { priorityCharacterId: actor.characterId } : {})
      });
      return;
    }
    await ctx.reply(presentGroupCombatStartFailure(result, "dev-proof"));
  });
  bot.command("dev_group_combat_timeout", async (ctx) => {
    if (!service.areDevHelpersEnabled()) {
      return;
    }
    const token = readCommandToken(ctx.message?.text);
    if (!token) {
      await ctx.reply(TIMEOUT_CODE_HELP);
      return;
    }
    const result = await serializePartySessionDelivery(token, () =>
      service.resolveDevTimeout(token)
    );
    if ("session" in result) {
      await deliverGroupCombatCards(ctx.api, service, result.session);
      return;
    }
    await ctx.reply(result.state === "not-found"
      ? "Живої гуртової сутички з таким кодом не знайдено."
      : "Очікування ходу не змінилося.");
  });
}

export function registerGroupCombatReplyKeyboard(
  bot: Bot,
  service: GroupCombatService
): void {
  bot.on("message:text", async (ctx, next) => {
    const replyText = ctx.message.text.trim();
    const replyAction = parseGroupCombatReplyButton(replyText);
    const telegramUserId = telegramUserIdFromContext(ctx.from);
    if (!telegramUserId || ctx.chat.type !== "private") {
      if (!replyAction) {
        await next();
      }
      return;
    }
    const session = await service.findActiveForTelegramUser(telegramUserId);
    if (!session) {
      await next();
      return;
    }
    const viewer = session.participants.find(
      (participant) => participant.telegramUserId === telegramUserId
    );
    if (!viewer) {
      return;
    }
    const replyAbility = parseGroupCombatReplyAbility(
      session,
      viewer.characterId,
      replyText
    );
    if (!replyAction && !replyAbility) {
      await next();
      return;
    }
    if (replyAbility) {
      const singleTargetIndex = getSingleGroupCombatActionTargetIndex(
        session,
        viewer.characterId,
        replyAbility.action,
        replyAbility.optionIndex
      );
      if (singleTargetIndex !== null) {
        await submitGroupCombatReplyAction(ctx, service, session, viewer.characterId, {
          action: replyAbility.action,
          optionIndex: replyAbility.optionIndex,
          targetIndex: singleTargetIndex
        });
        return;
      }
      if (groupCombatActionRequiresExplicitTarget(
        session,
        viewer.characterId,
        replyAbility.action,
        replyAbility.optionIndex
      )) {
        await ctx.reply(presentGroupCombatTargetPrompt(session, viewer.characterId, replyAbility.action, replyAbility.optionIndex), {
          reply_markup: buildGroupCombatAbilityTargetKeyboard(session, viewer.characterId, replyAbility)
        });
        return;
      }
      await submitGroupCombatReplyAction(ctx, service, session, viewer.characterId, {
        action: replyAbility.action,
        optionIndex: replyAbility.optionIndex,
        targetIndex: session.state.participants.find(
          (participant) => participant.characterId === viewer.characterId
        )?.rosterOrder ?? 0
      });
      return;
    }
    if (replyAction === "refresh") {
      const refreshRequested = await service.requestParticipantUiRefresh({
        sessionId: session.id,
        telegramUserId
      });
      if (!refreshRequested) {
        await next();
        return;
      }
      await deliverGroupCombatParticipantCard(
        ctx.api,
        service,
        session.id,
        viewer.characterId,
        { forceRefresh: true, forceReplacement: true }
      );
      return;
    }
    if (replyAction === "attack") {
      const singleTargetIndex = getSingleGroupCombatActionTargetIndex(
        session,
        viewer.characterId,
        "attack"
      );
      if (singleTargetIndex !== null) {
        await submitGroupCombatReplyAction(ctx, service, session, viewer.characterId, {
          action: "attack",
          targetIndex: singleTargetIndex
        });
        return;
      }
      await ctx.reply(presentGroupCombatTargetPrompt(session, viewer.characterId, "attack", 0), {
        reply_markup: buildGroupCombatTargetKeyboard(
          session,
          viewer.characterId,
          "attack",
          0,
          "reply-menu"
        )
      });
      return;
    }
    if (replyAction === "items") {
      const hiddenItemIds = await service.getHiddenCombatItemIdsForTelegramUser(viewer.telegramUserId);
      const keyboard = buildGroupCombatItemsKeyboard(
        session,
        viewer.characterId,
        "reply-menu",
        0,
        hiddenItemIds
      );
      const hasAvailableItems = keyboard.inline_keyboard.length > 1;
      await ctx.reply(
        hasAvailableItems
          ? "🎒 Оберіть одноразову манатку."
          : "🎒 Зараз немає корисних одноразових манаток.",
        { reply_markup: keyboard }
      );
      return;
    }
    await submitGroupCombatReplyAction(ctx, service, session, viewer.characterId, {
      action: replyAction === "flee" ? "flee" : "guard",
      targetIndex: session.state.participants.find(
        (participant) => participant.characterId === viewer.characterId
      )?.rosterOrder ?? 0
    });
  });
}

export async function handleGroupCombatCallback(
  ctx: Context,
  callback: GroupCombatCallback,
  service: GroupCombatService,
  options: {
    refreshLeftPassagePreview?: (ctx: Context) => Promise<void>;
  } = {}
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);
  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Квестарня не впізнала пригодника.", show_alert: true });
    return;
  }
  if (ctx.chat?.type !== "private") {
    await safeAnswerCallbackQuery(ctx, {
      text: "Бойові кнопки ватаги працюють лише в особистій розмові з Квестарнею.",
      show_alert: true
    });
    return;
  }
  if (callback.type === "invite-left") {
    const result = await serializePartySessionDelivery(callback.token, () =>
      service.createLeftPassageParty({
        telegramUserId,
        encounterToken: callback.token,
        chatId: BigInt(ctx.chat!.id),
        messageId: ctx.callbackQuery?.message?.message_id ?? null
      })
    );
    if (!("session" in result)) {
      if (result.state === "invalid-preview" && options.refreshLeftPassagePreview) {
        await safeAnswerCallbackQuery(ctx, {
          text: "Ця кнопка вже не веде до збору ватаги. Оновив доступні дії."
        });
        await options.refreshLeftPassagePreview(ctx);
        return;
      }
      await safeAnswerCallbackQuery(ctx, {
        text: presentLeftPassageInviteFailure(result),
        show_alert: true
      });
      return;
    }
    const viewer = result.session.participants.find(
      (participant) => participant.character.telegramUserId === telegramUserId
    );
    const inviteUrl = buildPartyInviteUrlForSession(ctx.me.username, result.session);
    await safeAnswerCallbackQuery(ctx, {
      text: result.state === "created" ? "Ватагу відкрито." : "Показую вже відкритий збір."
    });
    await safeEditMessageText(ctx, presentPartySession(result.session, {
      inviteUrl,
      viewerCharacterId: viewer?.characterId,
      notice: "Монстра в лівому проході притримано для цієї ватаги."
    }), {
      parse_mode: "HTML",
      reply_markup: buildPartySessionKeyboard(result.session, {
        viewerCharacterId: viewer?.characterId,
        inviteUrl,
        isPrivateDestination: true
      })
    });
    return;
  }
  if (callback.type === "start") {
    const result = await serializePartySessionDelivery(callback.token, () =>
      service.startProof(telegramUserId, callback.token)
    );
    if (!("session" in result)) {
      await safeAnswerCallbackQuery(ctx, {
        text: presentGroupCombatStartFailure(result),
        show_alert: true
      });
      return;
    }
    await safeAnswerCallbackQuery(ctx, { text: "Доказову сутичку запущено." });
    const actor = result.session.participants.find(
      (participant) => participant.telegramUserId === telegramUserId
    );
    await deliverGroupCombatCards(ctx.api, service, result.session, {
      ...(actor ? { priorityCharacterId: actor.characterId } : {})
    });
    return;
  }
  if (callback.type === "start-left") {
    const result = await serializePartySessionDelivery(callback.token, () =>
      service.startLeftPassage(telegramUserId, callback.token)
    );
    if (!("session" in result)) {
      await safeAnswerCallbackQuery(ctx, {
        text: presentGroupCombatStartFailure(result),
        show_alert: true
      });
      return;
    }
    await safeAnswerCallbackQuery(ctx, { text: "Ватага рушила в атаку." });
    const actor = result.session.participants.find(
      (participant) => participant.telegramUserId === telegramUserId
    );
    await deliverGroupCombatCards(ctx.api, service, result.session, {
      ...(actor ? { priorityCharacterId: actor.characterId } : {})
    });
    return;
  }
  let session = await service.findByToken(callback.token);
  if (!session) {
    await safeAnswerCallbackQuery(ctx, { text: "Ця сутичка вже загубила слід.", show_alert: true });
    return;
  }
  const viewer = session.participants.find((participant) => participant.telegramUserId === telegramUserId);
  if (!viewer) {
    await safeAnswerCallbackQuery(ctx, { text: "Вас немає в цій ватазі.", show_alert: true });
    return;
  }
  const callbackMessageId = ctx.callbackQuery?.message?.message_id;
  if (
    (callback.type === "action" || callback.type === "items" || callback.type === "target-menu" || callback.type === "target-back") &&
    callback.source !== "reply-menu" &&
    callbackMessageId !== undefined &&
    viewer.messageId !== null &&
    callbackMessageId !== viewer.messageId
  ) {
    await safeAnswerCallbackQuery(ctx, { text: "Це стара картка. Показую актуальну.", show_alert: true });
    await deliverGroupCombatParticipantCard(
      ctx.api,
      service,
      session.id,
      viewer.characterId,
      { forceRefresh: true, forceReplacement: true }
    );
    return;
  }
  if (callback.type === "target-menu") {
    if (
      session.status !== "active" ||
      session.state.status !== "active" ||
      callback.turn !== session.turn ||
      !groupCombatActionRequiresExplicitTarget(
        session,
        viewer.characterId,
        callback.action,
        callback.optionIndex ?? 0
      )
    ) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Це меню зі старого ходу. Показую актуальний бій.",
        show_alert: true
      });
      await deliverGroupCombatParticipantCard(ctx.api, service, session.id, viewer.characterId, {
        forceRefresh: true,
        forceReplacement: true
      });
      return;
    }
    const keyboard = buildGroupCombatTargetKeyboard(
      session,
      viewer.characterId,
      callback.action,
      callback.optionIndex ?? 0,
      callback.source
    );
    if (keyboard.inline_keyboard.length <= 1) {
      await safeAnswerCallbackQuery(ctx, { text: "Зараз немає чинної цілі.", show_alert: true });
      await deliverGroupCombatParticipantCard(ctx.api, service, session.id, viewer.characterId, {
        forceRefresh: true,
        forceReplacement: true
      });
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(
      ctx,
      presentGroupCombatTargetPrompt(session, viewer.characterId, callback.action, callback.optionIndex ?? 0),
      { reply_markup: keyboard }
    );
    return;
  }
  if (callback.type === "target-back") {
    const stale = session.status !== "active" || session.state.status !== "active" || callback.turn !== session.turn;
    await safeAnswerCallbackQuery(ctx, stale ? { text: "Хід уже змінився. Показую актуальний бій." } : undefined);
    if (callback.source === "reply-menu" && callbackMessageId !== undefined) {
      await ctx.api.deleteMessage(ctx.chat.id, callbackMessageId).catch(() => undefined);
      await deliverGroupCombatParticipantCard(ctx.api, service, session.id, viewer.characterId, {
        forceRefresh: true,
        forceReplacement: true
      });
      return;
    }
    if (!stale) {
      await safeEditMessageText(ctx, presentGroupCombat(session, viewer.characterId), {
        parse_mode: "HTML",
        reply_markup: buildGroupCombatKeyboard(session, viewer.characterId)
      });
      return;
    }
    await deliverGroupCombatParticipantCard(ctx.api, service, session.id, viewer.characterId, {
      forceRefresh: true,
      forceReplacement: true
    });
    return;
  }
  if (callback.type === "items") {
    if (session.status !== "active" || callback.turn !== session.turn || session.state.status !== "active") {
      await safeAnswerCallbackQuery(ctx, {
        text: "Це меню зі старого ходу. Показую актуальний бій.",
        show_alert: true
      });
      await deliverGroupCombatParticipantCard(
        ctx.api,
        service,
        session.id,
        viewer.characterId,
        { forceRefresh: true }
      );
      return;
    }
    const hiddenItemIds = await service.getHiddenCombatItemIdsForTelegramUser(viewer.telegramUserId);
    const keyboard = buildGroupCombatItemsKeyboard(
      session,
      viewer.characterId,
      callback.source,
      callback.page,
      hiddenItemIds
    );
    const hasAvailableItems = keyboard.inline_keyboard.length > 1;
    await safeAnswerCallbackQuery(
      ctx,
      hasAvailableItems ? undefined : { text: "Зараз немає корисних одноразових манаток." }
    );
    await safeEditMessageText(
      ctx,
      presentGroupCombatItems(session, viewer.characterId, hasAvailableItems),
      {
        parse_mode: "HTML",
        reply_markup: keyboard
      }
    );
    return;
  }
  if (callback.type === "journal") {
    if (session.status === "active") {
      await safeAnswerCallbackQuery(ctx, {
        text: "Журнал відкриється після завершення бою.",
        show_alert: true
      });
      await deliverGroupCombatParticipantCard(
        ctx.api,
        service,
        session.id,
        viewer.characterId,
        { forceRefresh: true }
      );
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGroupCombatJournal(session, callback.page), {
      parse_mode: "HTML",
      reply_markup: buildGroupCombatJournalKeyboard(session, callback.page)
    });
    return;
  }
  if (callback.type === "statistics") {
    if (session.status === "active") {
      await safeAnswerCallbackQuery(ctx, {
        text: "Статистика відкриється після завершення бою.",
        show_alert: true
      });
      await deliverGroupCombatParticipantCard(
        ctx.api,
        service,
        session.id,
        viewer.characterId,
        { forceRefresh: true }
      );
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGroupCombatStatistics(session), {
      parse_mode: "HTML",
      reply_markup: buildGroupCombatStatisticsKeyboard(session)
    });
    return;
  }
  if (callback.type === "view") {
    await safeAnswerCallbackQuery(ctx);
    if (session.status !== "active") {
      await safeEditMessageText(
        ctx,
        presentGroupCombat(session, viewer.characterId),
        {
          parse_mode: "HTML",
          reply_markup: buildGroupCombatKeyboard(session, viewer.characterId)
        }
      );
      return;
    }
    await deliverGroupCombatParticipantCard(
      ctx.api,
      service,
      session.id,
      viewer.characterId,
      {
        forceRefresh: true,
        forceReplacement: true
      }
    );
    return;
  }
  let settlementNotices: GroupCombatSettlementNotice[] | undefined;
  let actionResult: Awaited<ReturnType<GroupCombatService["submitAction"]>> | null =
    null;
  if (callback.type === "action") {
    const target = resolveTarget(
      session,
      viewer.characterId,
      callback.action,
      callback.optionIndex ?? 0,
      callback.targetIndex
    );
    if (!target) {
      await safeAnswerCallbackQuery(ctx, { text: "Ціль уже не годиться. Оновлюю картку.", show_alert: true });
      if (callback.source === "reply-menu" && callbackMessageId !== undefined) {
        await ctx.api.deleteMessage(ctx.chat.id, callbackMessageId).catch(() => undefined);
      }
      await deliverGroupCombatParticipantCard(ctx.api, service, session.id, viewer.characterId, {
        forceRefresh: true,
        forceReplacement: true
      });
      return;
    }
    const result = await service.submitAction({
      telegramUserId,
      partyInviteToken: callback.token,
      turn: callback.turn,
      action: callback.action,
      targetKind: target.kind,
      targetId: target.id,
      ...(target.payloadKey ? { payloadKey: target.payloadKey } : {})
    });
    actionResult = result;
    if ("session" in result) {
      session = result.session;
    } else {
      session = await service.findByToken(callback.token) ?? session;
    }
    const response = presentActionResult(result.state);
    settlementNotices = "settlementNotices" in result ? result.settlementNotices : undefined;
    await safeAnswerCallbackQuery(ctx, response);
    if (callback.source === "reply-menu" && callbackMessageId !== undefined) {
      await ctx.api.deleteMessage(ctx.chat.id, callbackMessageId).catch(() => undefined);
    }
  } else {
    await safeAnswerCallbackQuery(ctx);
  }
  if (callback.type === "action") {
    if (
      actionResult &&
      "session" in actionResult &&
      (actionResult.state === "resolved" || actionResult.state === "terminal")
    ) {
      await deliverGroupCombatCards(
        ctx.api,
        service,
        session,
        session.status === "active"
          ? { forceReplacementCharacterId: viewer.characterId }
          : {}
      );
    } else {
      await deliverGroupCombatParticipantCard(
        ctx.api,
        service,
        session.id,
        viewer.characterId,
        { forceRefresh: true, forceReplacement: true }
      );
    }
  } else {
    await deliverGroupCombatCards(ctx.api, service, session);
  }
  if (settlementNotices) {
    await deliverGroupCombatSettlementNotifications(ctx.api, settlementNotices);
  }
}

export function presentLeftPassageInviteFailure(
  result: Exclude<LeftPassagePartyCreateResult, { session: unknown }>
): string {
  switch (result.state) {
    case "disabled":
      return "Гуртовий заклик у лівому проході зараз зачинено.";
    case "wrong-location":
      return "Заклик працює лише біля цього самого сліду в лівому проході.";
    case "no-character":
      return "Квестарня не впізнала пригодника. Відкрийте персонажа й спробуйте ще раз.";
    case "invalid-preview":
      return "Ця оказія вже змінилася. Відкрийте лівий прохід ще раз.";
    case "stale-life":
      return "Цей слід лишився від попереднього життя. Огляньте лівий прохід ще раз.";
    case "expired-invitation":
      return "Слід уже вистиг. Потрібен новий огляд проходу.";
    case "active-search":
      return [
        "У лівому проході ще триває ваш пошук.",
        `Заклик можна відкрити за ${formatRemainingWait(result.availableAt, result.now)}.`
      ].join("\n");
    case "dead":
      return "Без тями в атаку не кличуть. Навіть дуже переконливо.";
    case "invalid-resources": {
      const resources = result.resources;
      return resources
        ? [
            "Запаси сил мають некоректне значення, тому бій не можна безпечно заморозити.",
            `Зараз: HP ${resources.hpCurrent}/${resources.hpMax}, мана ${resources.manaCurrent}/${resources.manaMax}.`,
            "Відкрийте персонажа, щоб синхронізувати ресурси, і спробуйте ще раз."
          ].join("\n")
        : "Запаси сил мають некоректне значення. Відкрийте персонажа, щоб синхронізувати ресурси, і спробуйте ще раз.";
    }
    case "active-adventure":
      return "Спершу завершіть поточну пригоду, тоді кличте ватагу.";
    case "active-raid":
      return "Спершу завершіть поточний рейд, тоді кличте ватагу.";
    case "active-combat":
      return "Спершу завершіть поточний бій, тоді кличте ватагу.";
    case "reservation-conflict":
      return "Стан цього сліду вже змінився. Відкрийте лівий прохід ще раз.";
  }
}

function presentActionResult(state: Awaited<ReturnType<GroupCombatService["submitAction"]>>["state"]): {
  text: string;
  show_alert?: boolean;
} {
  switch (state) {
    case "queued":
      return { text: "Вибір записано." };
    case "replaced":
      return { text: "Вибір змінено." };
    case "duplicate":
      return { text: "Цей вибір уже записано." };
    case "resolved":
      return { text: "Хід розіграно." };
    case "terminal":
      return { text: "Сутичку завершено." };
    case "stale":
    case "invalid-target":
      return { text: "Хід уже змінився. Показую правду." };
    case "invalidated":
      return { text: "Сутичку безпечно зупинено через пошкоджений запис.", show_alert: true };
    case "not-participant":
      return { text: "Вас більше немає в цій ватазі.", show_alert: true };
    case "not-found":
      return { text: "Ця сутичка вже загубила слід.", show_alert: true };
    case "no-character":
      return { text: "Квестарня не знайшла вашого пригодника.", show_alert: true };
    case "actor-unavailable":
      return { text: "Цей пригодник зараз не може діяти.", show_alert: true };
    case "action-unavailable":
      return { text: "Ця дія зараз недоступна. Оновлюю картку.", show_alert: true };
    case "disabled":
      return { text: "Доказову сутичку тут вимкнено.", show_alert: true };
  }
}

function resolveTarget(
  session: NonNullable<Awaited<ReturnType<GroupCombatService["findByToken"]>>>,
  viewerCharacterId: string,
  action: GroupCombatActionKey,
  optionIndex: number,
  targetIndex: number
): { kind: "enemy" | "self" | "ally"; id: string; payloadKey?: string } | null {
  if (action === "attack") {
    const target = session.state.enemies[targetIndex];
    return target?.hp ? { kind: "enemy", id: target.id } : null;
  }
  if (action === "guard" || action === "flee") {
    const viewer = session.state.participants.find((participant) => participant.characterId === viewerCharacterId);
    return viewer?.hp ? { kind: "self", id: viewer.characterId } : null;
  }
  if (action === "item") {
    const viewer = session.state.participants.find((participant) => participant.characterId === viewerCharacterId);
    const itemId = GROUP_COMBAT_SUPPORTED_ITEM_IDS[optionIndex];
    return viewer?.hp && itemId
      ? { kind: "self", id: viewer.characterId, payloadKey: itemId }
      : null;
  }
  if (action === "class" || action === "race" || action === "gear") {
    const viewer = session.state.participants.find((participant) => participant.characterId === viewerCharacterId);
    if (!viewer?.hp) {
      return null;
    }
    const payloadKey = action === "gear" ? viewer.gearAbilityIds[optionIndex] : undefined;
    const profile = getGroupCombatActionProfile(viewer, action, payloadKey);
    if (!profile) {
      return null;
    }
    const scopes = [profile.ability.primaryTargetScope, profile.ability.secondaryTargetScope].filter(Boolean);
    if (scopes.includes("single-enemy")) {
      const target = session.state.enemies[targetIndex];
      return target?.hp
        ? { kind: "enemy", id: target.id, ...(payloadKey ? { payloadKey } : {}) }
        : null;
    }
    if (scopes.includes("single-ally-or-self")) {
      const target = session.state.participants[targetIndex];
      return target?.hp
        ? {
            kind: target.characterId === viewer.characterId ? "self" : "ally",
            id: target.characterId,
            ...(payloadKey ? { payloadKey } : {})
          }
        : null;
    }
    return { kind: "self", id: viewer.characterId, ...(payloadKey ? { payloadKey } : {}) };
  }
  return null;
}

function presentGroupCombatTargetPrompt(
  session: NonNullable<Awaited<ReturnType<GroupCombatService["findByToken"]>>>,
  viewerCharacterId: string,
  action: Extract<GroupCombatActionKey, "attack" | "class" | "race" | "gear">,
  optionIndex: number
): string {
  if (action === "attack") {
    return "Оберіть ціль для атаки";
  }
  const viewer = session.state.participants.find((participant) => participant.characterId === viewerCharacterId);
  const payloadKey = action === "gear" ? viewer?.gearAbilityIds[optionIndex] : undefined;
  const profile = viewer ? getGroupCombatActionProfile(viewer, action, payloadKey) : null;
  return profile
    ? `Оберіть ціль для «${profile.ability.label}»`
    : "Оберіть ціль для вміння";
}

async function submitGroupCombatReplyAction(
  ctx: Context,
  service: GroupCombatService,
  initialSession: NonNullable<Awaited<ReturnType<GroupCombatService["findByToken"]>>>,
  viewerCharacterId: string,
  choice: {
    action: Exclude<GroupCombatActionKey, "item">;
    optionIndex?: number;
    targetIndex: number;
  }
): Promise<void> {
  const target = resolveTarget(
    initialSession,
    viewerCharacterId,
    choice.action,
    choice.optionIndex ?? 0,
    choice.targetIndex
  );
  const telegramUserId = telegramUserIdFromContext(ctx.from);
  if (!target || !telegramUserId) {
    await deliverGroupCombatParticipantCard(
      ctx.api,
      service,
      initialSession.id,
      viewerCharacterId,
      { forceRefresh: true, forceReplacement: true }
    );
    return;
  }
  const result = await service.submitAction({
    telegramUserId,
    partyInviteToken: initialSession.partyInviteToken,
    turn: initialSession.turn,
    action: choice.action,
    targetKind: target.kind,
    targetId: target.id,
    ...(target.payloadKey ? { payloadKey: target.payloadKey } : {})
  });
  const session = "session" in result
    ? result.session
    : await service.findByToken(initialSession.partyInviteToken) ?? initialSession;
  if (
    !("session" in result) ||
    result.state === "queued" ||
    result.state === "replaced" ||
    result.state === "duplicate"
  ) {
    await deliverGroupCombatParticipantCard(
      ctx.api,
      service,
      session.id,
      viewerCharacterId,
      { forceRefresh: true, forceReplacement: true }
    );
  } else {
    await deliverGroupCombatCards(
      ctx.api,
      service,
      session,
      session.status === "active"
        ? { forceReplacementCharacterId: viewerCharacterId }
        : {}
    );
  }
  if ("settlementNotices" in result && result.settlementNotices) {
    await deliverGroupCombatSettlementNotifications(ctx.api, result.settlementNotices);
  }
}

function readCommandToken(text: string | undefined): string | null {
  const token = text?.trim().split(/\s+/)[1] ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function presentGroupCombatStartFailure(
  result: Exclude<GroupCombatStartResult, { session: unknown }>,
  audience: "production-left-passage" | "dev-proof" = "production-left-passage"
): string {
  switch (result.state) {
    case "invalid-size":
      return "Поточний склад ватаги не підходить для цієї сутички. Оновіть картку збору.";
    case "not-leader":
      return "Запустити гуртову сутичку може лише ватажок.";
    case "invalid-life":
      return "Склад ватаги належить іншому життю. Зберіть її заново.";
    case "blocked":
      return "Хтось із ватаги вже тримає інший бій за рукав.";
    case "active-search":
      return [
        "Хтось із ватаги ще шукає слід у проході.",
        `Рушити можна за ${formatRemainingWait(result.availableAt, result.now)}.`
      ].join("\n");
    case "not-recruiting":
      return "Ватага вже не збирається.";
    case "disabled":
      return "Гуртова атака тут зараз не відчинена.";
    case "reservation-missing":
    case "expired-invitation":
      return "Зарезервована оказія вже не чекає на цю ватагу.";
    case "not-found":
      return audience === "dev-proof"
        ? [
            "Живої ватаги з таким кодом не знайдено.",
            "",
            PARTY_CODE_HELP
          ].join("\n")
        : "Цей збір у лівому проході вже не знайдено. Огляньте прохід і зберіть ватагу знову.";
    default:
      return "Не вдалося запустити гуртову сутичку з цієї ватаги.";
  }
}
