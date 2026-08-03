import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { GuildCallback } from "../callbacks/guildCallbackData";
import type { GuildMemberMutationRepositoryResult } from "../../db/repositories/guildRepository";
import {
  makeGuildDeleteCallbackData,
  makeGuildInviteAcceptCallbackData,
  makeGuildInviteDeclineCallbackData,
  makeGuildLeaveCallbackData,
  makeGuildOpenCallbackData
} from "../callbacks/guildCallbackData";
import { makePartySessionJoinCallbackData } from "../callbacks/partySessionCallbackData";
import { telegramUserIdFromContext } from "../context";
import {
  buildGuildCreationStartKeyboard,
  buildGuildCreationPreviewKeyboard,
  buildGuildHubKeyboard,
  buildGuildInviteCodeKeyboard,
  buildGuildMemberMutationKeyboard,
  buildGuildMemberTargetKeyboard,
  buildGuildMemberActionsKeyboard,
  buildGuildMemberManagementKeyboard,
  buildGuildPartyPickerKeyboard,
  buildGuildProfileCrestKeyboard,
  GUILD_MEMBER_MANAGEMENT_PAGE_SIZE
} from "../keyboards/guildKeyboard";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import {
  GUILD_CREATION_DESCRIPTION_PROMPT_HEADING,
  GUILD_CREATION_NAME_PROMPT_HEADING,
  GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING,
  presentGuildCreationStart,
  presentGuildCreationDescriptionPrompt,
  presentGuildCreationNamePrompt,
  presentGuildCreationPreview,
  presentGuildCreationResult,
  presentGuildHub,
  presentGuildInviteCreate,
  presentGuildInvitePrompt,
  presentGuildInviteOptIn,
  presentGuildInviteResponse,
  presentGuildInviteResponseNotification,
  presentGuildMemberConfirmation,
  presentGuildMemberActions,
  presentGuildMemberManagement,
  presentGuildMemberMutation,
  presentGuildPartyPicker,
  presentGuildProfileUpdate,
  presentGuildProfileDescriptionPrompt,
  presentGuildProfileStart,
  presentGuildPrivateInvite
} from "../presenters/guildPresenter";
import {
  presentPartyNearbyInviteNotification,
  presentPartyView
} from "../presenters/partySessionPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { buildPartyInviteUrl } from "../../services/partySessionService";
import type { GuildService } from "../../services/guildService";
import type { PartySessionService } from "../../services/partySessionService";
import type { PartyBossService } from "../../services/partyBossService";
import type { PartyRaidChatService } from "../../services/partyRaidChatService";
import type { GroupCombatService } from "../../services/groupCombatService";
import { sendCanonicalPartyPreparationCard } from "./partySessionCommand";
import { GUILD_CREST_CATALOG, validateGuildIdentity } from "../../domain/guild";

interface GuildCommandOptions {
  botUsername?: string | undefined;
  partySessions?: PartySessionService | undefined;
  partyBoss?: PartyBossService | undefined;
  partyRaidChat?: PartyRaidChatService | undefined;
  groupCombat?: Pick<GroupCombatService, "areDevHelpersEnabled" | "findByToken"> | undefined;
}

const HTML_OPTIONS = { parse_mode: "HTML" as const };
const NAME_FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "Назва ґільдії" };
const DESCRIPTION_FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "Короткий опис або «Без опису»" };
const INVITE_FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "Особистий код адресата" };
const PROFILE_DESCRIPTION_FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "Короткий опис або «Без опису»" };
const INVITE_PROMPT_HEADING = "📨 Запрошення до ґільдії · крок 1 із 2";

export function registerGuildCommands(
  bot: Bot,
  service: GuildService,
  options: Pick<GuildCommandOptions, "botUsername"> = {}
): void {
  bot.command("guild", (ctx) => sendGuildHub(ctx, service, "reply", 0));
  bot.command("guild_create", async (ctx) => {
    const actor = telegramUserIdFromContext(ctx.from);
    if (!actor) {
      return;
    }
    const parsed = parseCreationArgs(commandArgs(ctx));
    if (!parsed) {
      await ctx.reply(presentGuildCreationStart(), {
        ...HTML_OPTIONS,
        reply_markup: buildGuildCreationStartKeyboard()
      });
      return;
    }
    const result = await service.previewCreationForTelegramUser(actor, parsed);
    await ctx.reply(presentGuildCreationPreview(result, new Date()), {
      ...HTML_OPTIONS,
      reply_markup: result.state === "ready"
        ? buildGuildCreationPreviewKeyboard(result.intent.token)
        : result.state === "invalid" && result.reason === "crest"
          ? buildGuildCreationStartKeyboard()
          : buildGuildInviteCodeKeyboard()
    });
  });
  bot.command("guild_invite_code", async (ctx) => {
    const actor = telegramUserIdFromContext(ctx.from);
    if (!actor) {
      return;
    }
    const result = await service.createInviteOptInForTelegramUser(actor);
    const inviteUrl = result.state === "ready" ? buildGuildInviteUrl(options.botUsername, result.token) : null;
    await ctx.reply(presentGuildInviteOptIn(result, new Date(), { deepLinkAvailable: Boolean(inviteUrl) }), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildInviteCodeKeyboard(result.state === "ready" ? result.token : undefined, inviteUrl)
    });
  });
  bot.command("guild_invite", async (ctx) => {
    const actor = telegramUserIdFromContext(ctx.from);
    const targetToken = commandArgs(ctx);
    if (!actor) {
      return;
    }
    if (!targetToken) {
      await ctx.reply(presentGuildInvitePrompt(), { ...HTML_OPTIONS, reply_markup: INVITE_FORCE_REPLY });
      return;
    }
    await sendGuildInviteFromTargetCode(ctx, service, actor, targetToken);
  });
  bot.command("guild_party", (ctx) => sendGuildPartyPicker(ctx, service, "reply", 0));
  bot.command("guild_edit", async (ctx) => {
    const actor = telegramUserIdFromContext(ctx.from);
    const profile = parseProfileArgs(commandArgs(ctx));
    if (!actor) {
      return;
    }
    const hub = await service.getHubForTelegramUser(actor);
    if (!profile) {
      if (!service.isEnabled() || hub.state !== "ready" || hub.guild.status !== "active" || hub.guild.viewerRole !== "leader") {
        await ctx.reply("Змінювати ґільдійний профіль може лише голова активної ґільдії.");
        return;
      }
      await ctx.reply(presentGuildProfileStart(), {
        ...HTML_OPTIONS,
        reply_markup: buildGuildProfileCrestKeyboard(hub.guild.version)
      });
      return;
    }
    if (hub.state !== "ready") {
      await ctx.reply("Ви не належите до ґільдії.");
      return;
    }
    const result = await service.updateProfileForTelegramUser(actor, {
      ...profile,
      expectedVersion: hub.guild.version
    });
    await ctx.reply(presentGuildProfileUpdate(result), HTML_OPTIONS);
  });
  bot.command("guild_leave", (ctx) => sendSelfMutationConfirmation(ctx, service, "leave"));
  bot.command("guild_delete", (ctx) => sendSelfMutationConfirmation(ctx, service, "delete"));
  registerMemberActionCommand(bot, service, "guild_transfer", "transfer");
  registerMemberActionCommand(bot, service, "guild_promote", "promote");
  registerMemberActionCommand(bot, service, "guild_demote", "demote");
  registerMemberActionCommand(bot, service, "guild_kick", "kick");
  registerGuildPromptReplies(bot, service);

  if (service.areDevHelpersEnabled()) {
    bot.command("dev_guild_gold", async (ctx) => {
      const actor = telegramUserIdFromContext(ctx.from);
      const state = actor ? await service.ensureCreationGoldForDev(actor) : "no-character";
      await ctx.reply(state === "updated"
        ? "Dev: золота тепер досить для однієї перевірки заснування ґільдії."
        : state === "disabled"
          ? "Dev-команда тут вимкнена."
          : "Спершу створіть пригодника через /start.");
    });
  }
}

export async function handleGuildCallback(
  ctx: Context,
  callback: GuildCallback,
  service: GuildService,
  options: GuildCommandOptions = {}
): Promise<void> {
  const actor = telegramUserIdFromContext(ctx.from);
  if (!actor) {
    await safeAnswerCallbackQuery(ctx, { text: "Квестарня не впізнала пригодника.", show_alert: true });
    return;
  }
  if (callback.type === "open") {
    await safeAnswerCallbackQuery(ctx);
    await sendGuildHub(ctx, service, "edit", callback.page);
    return;
  }
  if (callback.type === "create-open") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, service.isEnabled()
      ? presentGuildCreationStart()
      : "Нові статути зараз зачинені. Чинну ґільдійну книгу можна читати без змін.", {
      ...HTML_OPTIONS,
      reply_markup: service.isEnabled() ? buildGuildCreationStartKeyboard() : buildGuildInviteCodeKeyboard()
    });
    return;
  }
  if (callback.type === "create-crest") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Нові статути зараз зачинені.", show_alert: true });
      return;
    }
    const crest = GUILD_CREST_CATALOG[callback.crestIndex];
    if (!crest) {
      await safeAnswerCallbackQuery(ctx, { text: "Цей герб уже зняли з дошки.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx, { text: `Герб ${crest} обрано.` });
    await ctx.reply(presentGuildCreationNamePrompt(crest), {
      ...HTML_OPTIONS,
      reply_markup: NAME_FORCE_REPLY
    });
    return;
  }
  if (callback.type === "invite-code") {
    const result = await service.createInviteOptInForTelegramUser(actor);
    const inviteUrl = result.state === "ready" ? buildGuildInviteUrl(options.botUsername, result.token) : null;
    await safeAnswerCallbackQuery(ctx, { text: result.state === "ready" ? "Код оновлено." : "Стан перевірено." });
    await safeEditMessageText(ctx, presentGuildInviteOptIn(result, new Date(), { deepLinkAvailable: Boolean(inviteUrl) }), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildInviteCodeKeyboard(result.state === "ready" ? result.token : undefined, inviteUrl)
    });
    return;
  }
  if (callback.type === "invite-start") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Нові запрошення зараз зачинені.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await ctx.reply(presentGuildInvitePrompt(), { ...HTML_OPTIONS, reply_markup: INVITE_FORCE_REPLY });
    return;
  }
  if (callback.type === "profile-open") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Зміни профілю зараз зачинені.", show_alert: true });
      return;
    }
    const hub = await service.getHubForTelegramUser(actor);
    if (
      hub.state !== "ready" ||
      hub.guild.status !== "active" ||
      hub.guild.viewerRole !== "leader" ||
      hub.guild.version !== callback.version
    ) {
      await safeAnswerCallbackQuery(ctx, { text: "Профіль або повноваження вже змінилися.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGuildProfileStart(), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildProfileCrestKeyboard(callback.version)
    });
    return;
  }
  if (callback.type === "profile-crest") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Зміни профілю зараз зачинені.", show_alert: true });
      return;
    }
    const crest = GUILD_CREST_CATALOG[callback.crestIndex];
    const hub = await service.getHubForTelegramUser(actor);
    if (
      !crest ||
      hub.state !== "ready" ||
      hub.guild.status !== "active" ||
      hub.guild.viewerRole !== "leader" ||
      hub.guild.version !== callback.version
    ) {
      await safeAnswerCallbackQuery(ctx, { text: "Профіль або повноваження вже змінилися.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx, { text: `Герб ${crest} обрано.` });
    await ctx.reply(presentGuildProfileDescriptionPrompt(crest, callback.version), {
      ...HTML_OPTIONS,
      reply_markup: PROFILE_DESCRIPTION_FORCE_REPLY
    });
    return;
  }
  if (callback.type === "members-open") {
    const result = await service.getMemberManagementForTelegramUser(actor);
    if (
      result.state !== "ready" ||
      result.viewerRole !== "leader" ||
      result.version !== callback.version
    ) {
      await safeAnswerCallbackQuery(ctx, { text: "Склад або повноваження вже змінилися.", show_alert: true });
      return;
    }
    const totalPages = Math.max(1, Math.ceil(result.members.length / GUILD_MEMBER_MANAGEMENT_PAGE_SIZE));
    const page = Math.min(Math.max(0, callback.page), totalPages - 1);
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGuildMemberManagement(page, totalPages), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildMemberManagementKeyboard(result.members, result.version, page)
    });
    return;
  }
  if (callback.type === "member-manage") {
    const result = await service.getMemberManagementForTelegramUser(actor);
    const member = result.state === "ready"
      ? result.members.find((candidate) => candidate.id === callback.memberId)
      : undefined;
    if (
      result.state !== "ready" ||
      result.viewerRole !== "leader" ||
      result.version !== callback.version ||
      !member
    ) {
      await safeAnswerCallbackQuery(ctx, { text: "Склад або повноваження вже змінилися.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGuildMemberActions(member), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildMemberActionsKeyboard(member, result.version)
    });
    return;
  }
  if (callback.type === "create-confirm") {
    const result = await service.confirmCreationForTelegramUser(actor, callback.token);
    await safeAnswerCallbackQuery(ctx, { text: result.state === "created" ? "Статут підтверджено." : "Стан перевірено." });
    await safeEditMessageText(ctx, presentGuildCreationResult(result), {
      ...HTML_OPTIONS,
      reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
    });
    return;
  }
  if (callback.type === "invite-accept" || callback.type === "invite-decline" || callback.type === "invite-cancel") {
    const result = callback.type === "invite-accept"
      ? await service.acceptInviteForTelegramUser(actor, callback.token)
      : callback.type === "invite-decline"
        ? await service.declineInviteForTelegramUser(actor, callback.token)
        : await service.cancelInviteForTelegramUser(actor, callback.token);
    await safeAnswerCallbackQuery(ctx, { text: "Відповідь перевірено." });
    await safeEditMessageText(ctx, presentGuildInviteResponse(result), {
      ...HTML_OPTIONS,
      reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
    });
    await sendAchievementNotice(ctx, "achievementUnlocks" in result && Array.isArray(result.achievementUnlocks)
      ? result.achievementUnlocks
      : []);
    if (
      (result.state === "accepted" || (result.state === "declined" && result.transitioned)) &&
      result.notification
    ) {
      try {
        await ctx.api.sendMessage(
          Number(result.notification.inviterTelegramUserId),
          presentGuildInviteResponseNotification(result.notification, result.state),
          HTML_OPTIONS
        );
      } catch {
        // Telegram delivery is best-effort; the durable invitation response remains canonical.
      }
    }
    return;
  }
  if (callback.type === "party-open") {
    await safeAnswerCallbackQuery(ctx);
    await sendGuildPartyPicker(ctx, service, "edit", callback.page);
    return;
  }
  if (callback.type === "party-invite") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Ґільдійні запрошення до ватаги зараз вимкнені.", show_alert: true });
      return;
    }
    await handleGuildPartyInvite(ctx, actor, callback.memberId, callback.version, service, options);
    return;
  }
  if (callback.type === "transfer-accept") {
    const result = await service.acceptLeadershipForTelegramUser(actor, callback.version);
    await safeAnswerCallbackQuery(ctx, { text: result.state === "updated" ? "Провід прийнято." : "Стан перевірено." });
    await safeEditMessageText(ctx, presentGuildMemberMutation(result), {
      ...HTML_OPTIONS,
      reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
    });
    return;
  }
  if (callback.type === "member-select") {
    const target = await service.findMemberByIdForAction(actor, callback.memberId, callback.version);
    if (target.state !== "ready") {
      await safeAnswerCallbackQuery(ctx, { text: "Склад або статут уже змінилися.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGuildMemberConfirmation(callback.action, target.memberName), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildMemberMutationKeyboard(
        callback.action,
        target.memberId,
        target.expectedVersion
      )
    });
    return;
  }
  if (!("version" in callback)) {
    await safeAnswerCallbackQuery(ctx, { text: "Застаріла ґільдійна дія.", show_alert: true });
    return;
  }
  let result: GuildMemberMutationRepositoryResult;
  switch (callback.type) {
    case "leave":
      result = await service.leaveForTelegramUser(actor, callback.version);
      break;
    case "delete":
      result = await service.deleteForTelegramUser(actor, callback.version);
      break;
    case "transfer":
      result = await service.offerLeadershipForTelegramUser(actor, callback.memberId, callback.version);
      break;
    case "promote":
      result = await service.setMemberRoleForTelegramUser(actor, callback.memberId, "officer", callback.version);
      break;
    case "demote":
      result = await service.setMemberRoleForTelegramUser(actor, callback.memberId, "member", callback.version);
      break;
    case "kick":
      result = await service.kickMemberForTelegramUser(actor, callback.memberId, callback.version);
      break;
  }
  await safeAnswerCallbackQuery(ctx, { text: result.state === "stale" ? "Статут уже змінився." : "Зміну перевірено." });
  await safeEditMessageText(ctx, presentGuildMemberMutation(result), {
    ...HTML_OPTIONS,
    reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
  });
}

export async function sendGuildHub(
  ctx: Context,
  service: GuildService,
  mode: "reply" | "edit",
  page: number
): Promise<void> {
  const actor = telegramUserIdFromContext(ctx.from);
  if (!actor) {
    return;
  }
  const result = await service.getHubForTelegramUser(actor, page);
  const text = presentGuildHub(result, new Date(), { writesEnabled: service.isEnabled() });
  const settings = {
    ...HTML_OPTIONS,
    reply_markup: buildGuildHubKeyboard(result, { writesEnabled: service.isEnabled() })
  };
  if (mode === "edit") {
    await safeEditMessageText(ctx, text, settings);
  } else {
    await ctx.reply(text, settings);
  }
}

async function sendGuildPartyPicker(
  ctx: Context,
  service: GuildService,
  mode: "reply" | "edit",
  page: number
): Promise<void> {
  const actor = telegramUserIdFromContext(ctx.from);
  if (!actor) {
    return;
  }
  const result = await service.getPartyPickerForTelegramUser(actor, page);
  const text = presentGuildPartyPicker(result);
  const settings = result.state === "ready"
    ? { ...HTML_OPTIONS, reply_markup: buildGuildPartyPickerKeyboard(result) }
    : HTML_OPTIONS;
  if (mode === "edit") {
    await safeEditMessageText(ctx, text, settings);
  } else {
    await ctx.reply(text, settings);
  }
}

async function handleGuildPartyInvite(
  ctx: Context,
  actor: bigint,
  memberId: string,
  guildVersion: number,
  service: GuildService,
  options: GuildCommandOptions
): Promise<void> {
  const partyService = options.partySessions;
  if (!partyService) {
    await safeAnswerCallbackQuery(ctx, { text: "Звичайний збір ватаги недоступний.", show_alert: true });
    return;
  }
  const party = await partyService.getLiveRecruitingByTelegramUser(actor);
  if (!party) {
    await safeAnswerCallbackQuery(ctx, { text: "Живого збору вже немає.", show_alert: true });
    return;
  }
  const first = await service.resolvePartyRecipientForTelegramUser(actor, {
    partySessionId: party.id,
    memberId,
    guildVersion
  });
  if (first.state !== "ready") {
    await safeAnswerCallbackQuery(ctx, { text: "Склад або ватага вже змінилися.", show_alert: true });
    return;
  }
  const current = await partyService.getByToken(first.inviteToken);
  const second = await service.resolvePartyRecipientForTelegramUser(actor, {
    partySessionId: first.partySessionId,
    memberId,
    guildVersion: first.guildVersion
  });
  if (current.state !== "ready" || second.state !== "ready") {
    await safeAnswerCallbackQuery(ctx, { text: "Склад або ватага вже змінилися.", show_alert: true });
    return;
  }
  const inviteUrl = buildPartyInviteUrl(options.botUsername, current.session.inviteToken);
  let delivered = false;
  try {
    await ctx.api.sendMessage(
      Number(second.recipient.telegramUserId),
      presentPartyNearbyInviteNotification(current.session, inviteUrl),
      {
        ...HTML_OPTIONS,
        reply_markup: new InlineKeyboard().text(
          "🤝 Долучитися",
          makePartySessionJoinCallbackData(current.session.inviteToken, "guild")
        )
      }
    );
    delivered = true;
  } catch {
    delivered = false;
  }
  if (delivered) {
    await service.recordPartyInvite(
      second.guildId,
      actor,
      second.partySessionId,
      second.targetUserId
    );
  }
  await safeAnswerCallbackQuery(ctx, {
    text: delivered
      ? "Звичайне запрошення передано."
      : "Telegram не підтвердив доставку; ватага лишилася чинною."
  });
  await sendCanonicalPartyPreparationCard(
    ctx,
    current.session.inviteToken,
    actor,
    options.botUsername,
    partyService,
    options.partyBoss,
    options.partyRaidChat,
    options.groupCombat,
    (session, canonicalInviteUrl, viewerCharacterId) => presentPartyView(
      { state: "ready", session },
      { inviteUrl: canonicalInviteUrl, viewerCharacterId }
    ),
    { mode: "reply", persistActorReference: true }
  );
}

async function sendSelfMutationConfirmation(
  ctx: Context,
  service: GuildService,
  action: "leave" | "delete"
): Promise<void> {
  const actor = telegramUserIdFromContext(ctx.from);
  if (!actor) {
    return;
  }
  const hub = await service.getHubForTelegramUser(actor);
  if (hub.state !== "ready") {
    await ctx.reply("Ви не належите до ґільдії.");
    return;
  }
  if (action === "leave" && hub.guild.viewerRole === "leader") {
    await ctx.reply(hub.guild.memberCount > 1
      ? "Спершу запропонуйте провід іншому учасникові й дочекайтеся прийняття."
      : "Голова не виходить із порожнього статуту: скористайтеся /guild_delete.");
    return;
  }
  if (action === "delete" && (hub.guild.viewerRole !== "leader" || hub.guild.memberCount !== 1)) {
    await ctx.reply("Розпустити ґільдію може лише голова, коли він єдиний чинний учасник.");
    return;
  }
  const callback = action === "leave"
    ? makeGuildLeaveCallbackData(hub.guild.version)
    : makeGuildDeleteCallbackData(hub.guild.version);
  await ctx.reply(action === "leave"
    ? "Підтвердити вихід із ґільдії? Окрема ватага чи битва не скасується."
    : "Підтвердити розпуск ґільдії? Окремі ватаги й битви залишаться чинними.", {
    reply_markup: new InlineKeyboard().text("✅ Підтвердити", callback).text("⬅️ Не зараз", makeGuildOpenCallbackData())
  });
}

function registerMemberActionCommand(
  bot: Bot,
  service: GuildService,
  command: string,
  action: "transfer" | "promote" | "demote" | "kick"
): void {
  bot.command(command, async (ctx) => {
    const actor = telegramUserIdFromContext(ctx.from);
    const name = commandArgs(ctx);
    if (!actor || !name) {
      await ctx.reply(`Формат: <code>/${command} Точне імʼя</code>`, HTML_OPTIONS);
      return;
    }
    const target = await service.findMemberForAction(actor, name);
    if (target.state !== "ready") {
      if (target.state === "ambiguous") {
        await ctx.reply("У складі є кілька однакових імен. Виберіть конкретний запис:", {
          reply_markup: buildGuildMemberTargetKeyboard(action, target.candidates, target.expectedVersion)
        });
      } else {
        await ctx.reply("Учасника з таким точним імʼям у вашій ґільдії не знайдено.");
      }
      return;
    }
    await ctx.reply(presentGuildMemberConfirmation(action, target.memberName), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildMemberMutationKeyboard(action, target.memberId, target.expectedVersion)
    });
  });
}

function registerGuildPromptReplies(bot: Bot, service: GuildService): void {
  bot.on("message:text", async (ctx, next) => {
    const replyTo = ctx.message.reply_to_message;
    const replyText = replyTo && "text" in replyTo ? replyTo.text : undefined;
    if (ctx.chat.type !== "private" || !replyTo?.from?.is_bot || !replyText) {
      await next();
      return;
    }
    const actor = telegramUserIdFromContext(ctx.from);
    if (!actor) {
      await next();
      return;
    }
    const namePromptCrest = guildCreationPromptCrest(replyText, GUILD_CREATION_NAME_PROMPT_HEADING);
    if (namePromptCrest) {
      if (!service.isEnabled()) {
        await ctx.reply("Нові статути зараз зачинені. Введена назва нічого не змінила.");
        return;
      }
      const identity = validateGuildIdentity({
        crest: namePromptCrest,
        displayName: ctx.message.text,
        description: ""
      });
      if (!identity.ok) {
        await ctx.reply(presentGuildCreationNamePrompt(namePromptCrest, guildCreationInputError(identity.reason)), {
          ...HTML_OPTIONS,
          reply_markup: NAME_FORCE_REPLY
        });
        return;
      }
      await ctx.reply(presentGuildCreationDescriptionPrompt(namePromptCrest, identity.displayName), {
        ...HTML_OPTIONS,
        reply_markup: DESCRIPTION_FORCE_REPLY
      });
      return;
    }
    const descriptionPrompt = guildCreationDescriptionPrompt(replyText);
    if (descriptionPrompt) {
      const description = ctx.message.text.trim().toLocaleLowerCase("uk-UA") === "без опису"
        ? ""
        : ctx.message.text;
      const result = await service.previewCreationForTelegramUser(actor, {
        crest: descriptionPrompt.crest,
        displayName: descriptionPrompt.displayName,
        description
      });
      if (result.state === "invalid") {
        await ctx.reply(presentGuildCreationDescriptionPrompt(
          descriptionPrompt.crest,
          descriptionPrompt.displayName,
          guildCreationInputError(result.reason)
        ), {
          ...HTML_OPTIONS,
          reply_markup: DESCRIPTION_FORCE_REPLY
        });
        return;
      }
      await ctx.reply(presentGuildCreationPreview(result, new Date()), {
        ...HTML_OPTIONS,
        reply_markup: result.state === "ready"
          ? buildGuildCreationPreviewKeyboard(result.intent.token)
          : buildGuildInviteCodeKeyboard()
      });
      return;
    }
    const profilePrompt = guildProfileDescriptionPrompt(replyText);
    if (profilePrompt) {
      const description = ctx.message.text.trim().toLocaleLowerCase("uk-UA") === "без опису"
        ? ""
        : ctx.message.text;
      const result = await service.updateProfileForTelegramUser(actor, {
        crest: profilePrompt.crest,
        description,
        expectedVersion: profilePrompt.version
      });
      if (result.state === "invalid") {
        await ctx.reply(presentGuildProfileDescriptionPrompt(
          profilePrompt.crest,
          profilePrompt.version,
          guildCreationInputError(result.reason)
        ), {
          ...HTML_OPTIONS,
          reply_markup: PROFILE_DESCRIPTION_FORCE_REPLY
        });
        return;
      }
      await ctx.reply(presentGuildProfileUpdate(result), {
        ...HTML_OPTIONS,
        reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
      });
      return;
    }
    if (replyText.split("\n", 1)[0] === INVITE_PROMPT_HEADING) {
      await sendGuildInviteFromTargetCode(ctx, service, actor, ctx.message.text.trim());
      return;
    }
    await next();
  });
}

export async function sendGuildInviteFromTargetCode(
  ctx: Context,
  service: GuildService,
  actor: bigint,
  targetToken: string
): Promise<void> {
  const result = await service.createInviteForTelegramUser(actor, targetToken);
  let deliveryConfirmed: boolean | null = null;
  if (result.state === "created") {
    try {
      await ctx.api.sendMessage(
        Number(result.deliveryTelegramUserId),
        presentGuildPrivateInvite(result.invite.guildName, result.invite.guildCrest, result.invite.expiresAt, new Date()),
        {
          ...HTML_OPTIONS,
          reply_markup: new InlineKeyboard()
            .text("✅ Долучитися", makeGuildInviteAcceptCallbackData(result.invite.token))
            .text("✖️ Відхилити", makeGuildInviteDeclineCallbackData(result.invite.token))
        }
      );
      deliveryConfirmed = true;
    } catch {
      deliveryConfirmed = false;
    }
  }
  await ctx.reply(presentGuildInviteCreate(result, new Date(), deliveryConfirmed), HTML_OPTIONS);
}

export function buildGuildInviteUrl(botUsername: string | undefined, token: string): string | null {
  return botUsername ? `https://t.me/${botUsername}?start=guild_${token}` : null;
}

function guildCreationPromptCrest(text: string, heading: string): string | null {
  const firstLine = text.split("\n", 1)[0] ?? "";
  return GUILD_CREST_CATALOG.find((crest) =>
    firstLine === `${heading} · ${crest}`
  ) ?? null;
}

function guildCreationDescriptionPrompt(text: string): { crest: string; displayName: string } | null {
  const crest = guildCreationPromptCrest(text, GUILD_CREATION_DESCRIPTION_PROMPT_HEADING);
  if (!crest) {
    return null;
  }
  const nameLine = text.split("\n").find((line) => line.startsWith("Назва: "));
  const displayName = nameLine?.slice("Назва: ".length).trim();
  return displayName ? { crest, displayName } : null;
}

function guildProfileDescriptionPrompt(text: string): { crest: string; version: number } | null {
  const crest = guildCreationPromptCrest(text, GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING);
  if (!crest) {
    return null;
  }
  const versionLine = text.split("\n").find((line) => line.startsWith("Редакція статуту: "));
  const version = Number(versionLine?.slice("Редакція статуту: ".length));
  return Number.isSafeInteger(version) && version >= 0 ? { crest, version } : null;
}

function guildCreationInputError(reason: string): string {
  if (reason === "name-length") {
    return "Назва має містити від 3 до 32 знаків.";
  }
  if (reason === "description-length") {
    return "Опис має містити не більш як 93 знаки.";
  }
  if (reason === "name-reserved") {
    return "Цю назву писар не прийме. Оберіть іншу.";
  }
  return reason.startsWith("description")
    ? "Опис містить неприйнятні знаки. Спробуйте інший."
    : "Назва містить неприйнятні знаки. Спробуйте іншу.";
}

async function sendAchievementNotice(ctx: Context, unlocks: Parameters<typeof presentAchievementUnlockNotification>[0]): Promise<void> {
  const text = presentAchievementUnlockNotification(unlocks);
  if (text) {
    await ctx.reply(text, HTML_OPTIONS);
  }
}

function commandArgs(ctx: Context): string {
  return typeof ctx.match === "string" ? ctx.match.trim() : "";
}

function parseCreationArgs(value: string): { crest: string; displayName: string; description: string } | null {
  const match = /^(\S+)\s+([^|]+?)(?:\s*\|\s*(.*))?$/u.exec(value);
  return match
    ? { crest: match[1]!, displayName: match[2]!.trim(), description: match[3]?.trim() ?? "" }
    : null;
}

function parseProfileArgs(value: string): { crest: string; description: string } | null {
  const match = /^(\S+)\s*\|\s*(.*)$/u.exec(value);
  return match ? { crest: match[1]!, description: match[2]!.trim() } : null;
}
