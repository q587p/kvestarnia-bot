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
  deliverGroupCombatSettlementNotifications,
  deliverGroupCombatStartIntro
} from "../groupCombatCardDelivery";
import {
  buildGroupCombatAbilityTargetKeyboard,
  buildGroupCombatActionMenuKeyboard,
  buildGroupCombatItemsKeyboard,
  buildGroupCombatJournalKeyboard,
  buildGroupCombatStatisticsKeyboard,
  parseGroupCombatReplyAbility,
  parseGroupCombatReplyButton
} from "../keyboards/groupCombatKeyboard";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { buildPartySessionKeyboard } from "../keyboards/partySessionKeyboard";
import {
  presentGroupCombatItems,
  presentGroupCombatJournal,
  presentGroupCombatStatistics
} from "../presenters/groupCombatPresenter";
import { formatRemainingWait, presentPartySession } from "../presenters/partySessionPresenter";
import { buildPartyInviteUrl } from "../../services/partySessionService";
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
      await deliverGroupCombatCards(ctx.api, service, result.session);
      return;
    }
    await ctx.reply(presentGroupCombatStartFailure(result));
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
      if (!replyAction) {
        await next();
        return;
      }
      await ctx.reply("🏁 Цей бій уже завершено. Головне меню повернуто.", {
        reply_markup: buildMainMenuKeyboard()
      });
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
      const actor = session.state.participants.find(
        (participant) => participant.characterId === viewer.characterId
      );
      const payloadKey = replyAbility.action === "gear"
        ? actor?.gearAbilityIds[replyAbility.optionIndex]
        : undefined;
      const profile = actor
        ? getGroupCombatActionProfile(actor, replyAbility.action, payloadKey)
        : null;
      const scopes = profile
        ? [profile.ability.primaryTargetScope, profile.ability.secondaryTargetScope]
            .filter(Boolean)
        : [];
      const targetIndexes = scopes.includes("single-enemy")
        ? session.state.enemies
            .map((enemy, targetIndex) => ({ enemy, targetIndex }))
            .filter(({ enemy }) => enemy.hp > 0)
            .map(({ targetIndex }) => targetIndex)
        : scopes.includes("single-ally-or-self")
          ? session.state.participants
              .map((participant, targetIndex) => ({ participant, targetIndex }))
              .filter(({ participant }) => participant.hp > 0)
              .map(({ targetIndex }) => targetIndex)
          : [actor?.rosterOrder ?? 0];
      if (targetIndexes.length === 1) {
        await submitGroupCombatReplyAction(ctx, service, session, viewer.characterId, {
          action: replyAbility.action,
          optionIndex: replyAbility.optionIndex,
          targetIndex: targetIndexes[0]!
        });
        return;
      }
      await ctx.reply("✨ Оберіть точну ціль для цього вміння.", {
        reply_markup: buildGroupCombatAbilityTargetKeyboard(
          session,
          viewer.characterId,
          replyAbility
        )
      });
      return;
    }
    if (replyAction === "refresh") {
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
      const livingTargets = session.state.enemies
        .map((enemy, targetIndex) => ({ enemy, targetIndex }))
        .filter(({ enemy }) => enemy.hp > 0);
      if (livingTargets.length === 1) {
        await submitGroupCombatReplyAction(ctx, service, session, viewer.characterId, {
          action: "attack",
          targetIndex: livingTargets[0]!.targetIndex
        });
        return;
      }
      await ctx.reply("⚔️ Оберіть точну ціль.", {
        reply_markup: buildGroupCombatActionMenuKeyboard(session, viewer.characterId, "attack")
      });
      return;
    }
    if (replyAction === "items") {
      const keyboard = buildGroupCombatItemsKeyboard(
        session,
        viewer.characterId,
        "reply-menu"
      );
      const hasAvailableItems = keyboard.inline_keyboard.length > 1;
      await ctx.reply(
        hasAvailableItems
          ? "🎒 Оберіть одноразову манатку."
          : "🎒 Корисних одноразових манаток для цього ходу немає.",
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
    const inviteUrl = buildPartyInviteUrl(ctx.me.username, result.session.inviteToken);
    await safeAnswerCallbackQuery(ctx, {
      text: result.state === "created" ? "Заклик розіслано. Слід за вами ніхто не пересував." : "Показую вже відкритий збір."
    });
    await safeEditMessageText(ctx, presentPartySession(result.session, {
      inviteUrl,
      viewerCharacterId: viewer?.characterId,
      notice: "Монстра в лівому проході притримано для цієї ватаги. Збір триває рівно три хвилини."
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
    await deliverGroupCombatCards(ctx.api, service, result.session);
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
    if (result.state === "started") {
      await deliverGroupCombatStartIntro(ctx.api, service, result.session);
    }
    await deliverGroupCombatCards(ctx.api, service, result.session);
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
    (callback.type === "action" || callback.type === "items") &&
    !(callback.type === "action" && callback.source === "reply-menu") &&
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
    const keyboard = buildGroupCombatItemsKeyboard(session, viewer.characterId);
    const hasAvailableItems = keyboard.inline_keyboard.length > 1;
    await safeAnswerCallbackQuery(
      ctx,
      hasAvailableItems ? undefined : { text: "Немає корисних одноразових манаток для цього ходу." }
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
      await deliverGroupCombatCards(ctx.api, service, session);
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
  if (callback.type === "action" && session.status === "active") {
    await deliverGroupCombatParticipantCard(
      ctx.api,
      service,
      session.id,
      viewer.characterId,
      { forceRefresh: true, forceReplacement: true }
    );
  }
  await deliverGroupCombatCards(ctx.api, service, session);
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
            "Відкрийте персонажа, щоб синхронізувати ресурси, або скористайтеся локальною /dev_heal чи /dev_restore_mana."
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
    await ctx.reply("Ціль уже не годиться. Оновлюю бій.");
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
  if (!("session" in result)) {
    await ctx.reply(presentActionResult(result.state).text);
  }
  await deliverGroupCombatCards(ctx.api, service, session);
  if ("settlementNotices" in result && result.settlementNotices) {
    await deliverGroupCombatSettlementNotifications(ctx.api, result.settlementNotices);
  }
}

function readCommandToken(text: string | undefined): string | null {
  const token = text?.trim().split(/\s+/)[1] ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function presentGroupCombatStartFailure(
  result: Exclude<GroupCombatStartResult, { session: unknown }>
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
      return [
        "Живої ватаги з таким кодом не знайдено.",
        "",
        PARTY_CODE_HELP
      ].join("\n");
    default:
      return "Не вдалося запустити гуртову сутичку з цієї ватаги.";
  }
}
