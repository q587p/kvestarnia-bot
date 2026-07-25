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
  deliverGroupCombatParticipantCard
} from "../groupCombatCardDelivery";
import { buildGroupCombatJournalKeyboard } from "../keyboards/groupCombatKeyboard";
import { buildPartySessionKeyboard } from "../keyboards/partySessionKeyboard";
import { getCallbackMessageFreshness } from "../messageFreshness";
import { presentGroupCombatJournal } from "../presenters/groupCombatPresenter";
import { formatRemainingWait, presentPartySession } from "../presenters/partySessionPresenter";
import { buildPartyInviteUrl } from "../../services/partySessionService";
import type {
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

export async function handleGroupCombatCallback(
  ctx: Context,
  callback: GroupCombatCallback,
  service: GroupCombatService
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
    callback.type === "action" &&
    callbackMessageId !== undefined &&
    viewer.messageId !== null &&
    callbackMessageId !== viewer.messageId
  ) {
    await safeAnswerCallbackQuery(ctx, { text: "Це стара картка. Показую актуальну.", show_alert: true });
    await deliverGroupCombatCards(ctx.api, service, session);
    return;
  }
  if (callback.type === "journal") {
    if (session.status === "active") {
      await safeAnswerCallbackQuery(ctx, { text: "Журнал відкриється після завершення сутички.", show_alert: true });
      await deliverGroupCombatParticipantCard(ctx.api, service, session.id, viewer.characterId, { forceRefresh: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGroupCombatJournal(session, callback.page), {
      parse_mode: "HTML",
      reply_markup: buildGroupCombatJournalKeyboard(session, callback.page)
    });
    return;
  }
  if (callback.type === "view") {
    await safeAnswerCallbackQuery(ctx);
    const sourceIsNotCanonical = callbackMessageId !== undefined &&
      viewer.messageId !== null &&
      callbackMessageId !== viewer.messageId;
    const sourceFreshness = getCallbackMessageFreshness(ctx);
    await deliverGroupCombatParticipantCard(
      ctx.api,
      service,
      session.id,
      viewer.characterId,
      {
        forceRefresh: true,
        forceReplacement: sourceIsNotCanonical || sourceFreshness !== "fresh"
      }
    );
    return;
  }
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
    await safeAnswerCallbackQuery(ctx, response);
  } else {
    await safeAnswerCallbackQuery(ctx);
  }
  await deliverGroupCombatCards(ctx.api, service, session);
}

export function presentLeftPassageInviteFailure(
  result: Exclude<LeftPassagePartyCreateResult, { session: unknown }>
): string {
  switch (result.state) {
    case "disabled":
      return "Гуртовий заклик у лівому проході зараз зачинено.";
    case "wrong-location":
      return "Заклик працює лише біля цього самого сліду в лівому проході.";
    case "expired-invitation":
      return "Слід уже вистиг. Потрібен новий огляд проходу.";
    case "active-search":
      return [
        "У лівому проході ще триває ваш пошук.",
        `Заклик можна відкрити за ${formatRemainingWait(result.availableAt, result.now)}.`
      ].join("\n");
    case "dead":
      return "Без тями в атаку не кличуть. Навіть дуже переконливо.";
    case "invalid-resources":
      return "Запаси сил не сходяться з корчмарським журналом. Спершу оновіть стан пригодника.";
    default:
      return "Цей слід уже не можна чесно зарезервувати для ватаги.";
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
  if (action === "guard") {
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

function readCommandToken(text: string | undefined): string | null {
  const token = text?.trim().split(/\s+/)[1] ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function presentGroupCombatStartFailure(
  result: Exclude<GroupCombatStartResult, { session: unknown }>
): string {
  switch (result.state) {
    case "invalid-size":
      return "Для гуртової сутички треба рівно 2–3 пригодники у ватазі.";
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
