import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { GuildCallback } from "../callbacks/guildCallbackData";
import type { GuildMemberMutationRepositoryResult } from "../../db/repositories/guildRepository";
import {
  makeGuildDeleteCancelCallbackData,
  makeGuildDeleteCallbackData,
  makeGuildInviteAcceptCallbackData,
  makeGuildInviteDeclineCallbackData,
  makeGuildLeaveCancelCallbackData,
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
  buildGuildInviteShareCardKeyboard,
  buildGuildNearbyInviteKeyboard,
  buildGuildMemberMutationKeyboard,
  buildGuildMemberTargetKeyboard,
  buildGuildMemberActionsKeyboard,
  buildGuildMemberManagementKeyboard,
  buildGuildNestKeyboard,
  buildGuildNestRulesKeyboard,
  buildGuildNestUnavailableKeyboard,
  buildGuildPartyPickerKeyboard,
  buildGuildPartyRecoveryKeyboard,
  buildGuildDirectoryKeyboard,
  buildGuildGloryBoardKeyboard,
  buildGuildPublicProfileKeyboard,
  buildGuildProfileCrestKeyboard,
  GUILD_MEMBER_MANAGEMENT_PAGE_SIZE
} from "../keyboards/guildKeyboard";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import {
  GUILD_CREATION_DESCRIPTION_PROMPT_HEADING,
  GUILD_CREATION_NAME_PROMPT_HEADING,
  GUILD_CREST_UPLOAD_PROMPT_HEADING,
  GUILD_CUSTOM_EMOJI_PROMPT_HEADING,
  GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING,
  presentGuildCrestPickerUnavailable,
  presentGuildCustomEmojiPrompt,
  presentGuildCreationStart,
  presentGuildCreationDescriptionPrompt,
  presentGuildCreationNamePrompt,
  presentGuildCreationPreview,
  presentGuildCreationResult,
  presentGuildHub,
  presentGuildInviteCreate,
  presentGuildInvitePrompt,
  presentGuildInviteOptIn,
  presentGuildInviteShareCard,
  presentGuildNearbyInvitePicker,
  presentGuildInviteResponse,
  presentGuildInviteResponseNotification,
  presentGuildMemberConfirmation,
  presentGuildMemberActions,
  presentGuildMemberManagement,
  presentGuildMemberMutation,
  presentGuildNest,
  presentGuildNestRules,
  presentGuildPartyPicker,
  presentGuildPublicDirectory,
  presentGuildGloryBoard,
  presentGuildPublicProfile,
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
import { buildPartyInviteUrlForSession } from "../../services/partySessionService";
import type { GuildService } from "../../services/guildService";
import type { PartySessionService } from "../../services/partySessionService";
import type { PartyBossService } from "../../services/partyBossService";
import type { PartyRaidChatService } from "../../services/partyRaidChatService";
import type { GroupCombatService } from "../../services/groupCombatService";
import type { PresenceService } from "../../services/presenceService";
import { sendCanonicalPartyPreparationCard } from "./partySessionCommand";
import {
  GUILD_CREST_CATALOG,
  validateGuildCrest,
  validateGuildIdentity,
} from "../../domain/guild";
import { GUILD_INVITE_PROMPT_HEADING } from "../guildRoute";

interface GuildCommandOptions {
  botUsername?: string | undefined;
  partySessions?: PartySessionService | undefined;
  partyBoss?: PartyBossService | undefined;
  partyRaidChat?: PartyRaidChatService | undefined;
  groupCombat?: GroupCombatService | undefined;
  presence?: Pick<PresenceService, "getOnlineForTelegramUser"> | undefined;
}

const HTML_OPTIONS = { parse_mode: "HTML" as const };
const NAME_FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "Назва ґільдії" };
const DESCRIPTION_FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "Короткий опис або «Без опису»" };
const INVITE_FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "Особистий код адресата" };
const PROFILE_DESCRIPTION_FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "Короткий опис або «Без опису»" };
const CREST_EMOJI_FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "Один емоджі" };

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
      const picker = await service.getCrestPickerForTelegramUser(actor, "creation");
      await ctx.reply(picker.state === "ready" ? presentGuildCreationStart() : presentGuildCrestPickerUnavailable(picker), {
        ...HTML_OPTIONS,
        reply_markup: picker.state === "ready"
          ? buildGuildCreationStartKeyboard(picker.availableCrests)
          : buildGuildInviteCodeKeyboard()
      });
      return;
    }
    const result = await service.previewCreationForTelegramUser(actor, parsed);
    const recoveryPicker = result.state === "invalid" && result.reason === "crest"
      ? await service.getCrestPickerForTelegramUser(actor, "creation")
      : null;
    await ctx.reply(presentGuildCreationPreview(result, new Date()), {
      ...HTML_OPTIONS,
      reply_markup: result.state === "ready"
        ? buildGuildCreationPreviewKeyboard(result.intent.token)
        : recoveryPicker?.state === "ready"
          ? buildGuildCreationStartKeyboard(recoveryPicker.availableCrests)
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
    await ctx.reply(presentGuildInviteOptIn(result, new Date(), { inviteUrl }), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildInviteCodeKeyboard(result.state === "ready" ? result.token : undefined, inviteUrl)
    });
    if (result.state === "ready" && inviteUrl) {
      await ctx.reply(presentGuildInviteShareCard(result.expiresAt, new Date(), inviteUrl), {
        ...HTML_OPTIONS,
        reply_markup: buildGuildInviteShareCardKeyboard(inviteUrl)
      });
    }
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
      const picker = await service.getCrestPickerForTelegramUser(actor, "profile");
      if (picker.state !== "ready" || picker.guildVersion === null) {
        await ctx.reply(presentGuildCrestPickerUnavailable(picker), HTML_OPTIONS);
        return;
      }
      await ctx.reply(presentGuildProfileStart(), {
        ...HTML_OPTIONS,
        reply_markup: buildGuildProfileCrestKeyboard(
          picker.guildVersion,
          picker.availableCrests,
          picker.currentHasCustomCrest
        )
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
  registerGuildCustomEmojiNonTextReplies(bot, service);
  registerRetiredGuildCrestPhotoReplies(bot);
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
  if (service.areWeeklyDevHelpersEnabled?.()) {
    bot.command("dev_guild_weekly", async (ctx) => {
      const actor = telegramUserIdFromContext(ctx.from);
      if (!actor) return;
      if (commandArgs(ctx).toLocaleLowerCase("uk-UA") === "finish") {
        const result = await service.completeWeeklyGoalForDev(actor);
        await ctx.reply(result.state === "ready"
          ? `Dev: тижневий клопіт ${result.progress.periodKey} має ${result.progress.progressCount}/${result.progress.targetCount}.`
          : "Dev: спершу потрібні персонаж і чинна ґільдія.");
        await deliverWeeklyAchievementNotices(ctx, service, actor);
        return;
      }
      const repaired = await service.repairWeeklyGoalForDev();
      await ctx.reply(`Dev: відновлено внесків ${repaired.recorded}, перераховано періодів ${repaired.recomputed}. Додайте «finish», щоб закрити поточний клопіт для карткового QA.`);
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
  if (callback.type === "nest-open") {
    await safeAnswerCallbackQuery(ctx);
    await sendGuildNest(ctx, service, actor);
    return;
  }
  if (callback.type === "nest-rules") {
    const nest = await service.getNestForTelegramUser(actor);
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, nest.state === "ready" ? presentGuildNestRules() : presentGuildNest(nest), {
      ...HTML_OPTIONS,
      reply_markup: nest.state === "ready" ? buildGuildNestRulesKeyboard() : buildGuildNestUnavailableKeyboard()
    });
    return;
  }
  if (callback.type === "directory-open") {
    const result = await service.getPublicDirectoryForTelegramUser(actor, callback.page);
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGuildPublicDirectory(result), {
      ...HTML_OPTIONS,
      reply_markup: result.state === "ready" ? buildGuildDirectoryKeyboard(result) : buildGuildNestUnavailableKeyboard()
    });
    return;
  }
  if (callback.type === "directory-profile") {
    const result = await service.getPublicGuildForTelegramUser(actor, callback.guildId);
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGuildPublicProfile(result), {
      ...HTML_OPTIONS,
      reply_markup: result.state === "wrong-location" || result.state === "disabled" || result.state === "no-character"
        ? buildGuildNestUnavailableKeyboard()
        : buildGuildPublicProfileKeyboard(callback.page)
    });
    return;
  }
  if (callback.type === "glory-board") {
    const result = await service.getGloryBoardForTelegramUser(actor, callback.view, callback.page);
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGuildGloryBoard(result), {
      ...HTML_OPTIONS,
      reply_markup: result.state === "ready"
        ? buildGuildGloryBoardKeyboard(result)
        : buildGuildNestUnavailableKeyboard()
    });
    return;
  }
  if (callback.type === "crest-view-intent" || callback.type === "crest-view-guild") {
    await safeAnswerCallbackQuery(ctx, {
      text: "Фото гербів більше не використовуються. Оберіть емоджі через чинне меню.",
      show_alert: true
    });
    return;
  }
  if (callback.type === "open") {
    await safeAnswerCallbackQuery(ctx);
    await sendGuildHub(ctx, service, "edit", callback.page);
    return;
  }
  if (callback.type === "create-open") {
    const picker = await service.getCrestPickerForTelegramUser(actor, "creation");
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, picker.state === "ready"
      ? presentGuildCreationStart()
      : presentGuildCrestPickerUnavailable(picker), {
      ...HTML_OPTIONS,
      reply_markup: picker.state === "ready"
        ? buildGuildCreationStartKeyboard(picker.availableCrests)
        : buildGuildInviteCodeKeyboard()
    });
    return;
  }
  if (callback.type === "create-upload") {
    const picker = await service.getCrestPickerForTelegramUser(actor, "creation");
    await safeAnswerCallbackQuery(ctx, { text: picker.state === "ready" ? "Бланк емоджі відкрито." : "Стан перевірено." });
    await ctx.reply(picker.state === "ready"
      ? presentGuildCustomEmojiPrompt("creation")
      : presentGuildCrestPickerUnavailable(picker), {
      ...HTML_OPTIONS,
      ...(picker.state === "ready" ? { reply_markup: CREST_EMOJI_FORCE_REPLY } : {})
    });
    return;
  }
  if (callback.type === "create-crest") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Нові статути зараз зачинені.", show_alert: true });
      return;
    }
    const crest = GUILD_CREST_CATALOG[callback.crestIndex];
    const picker = await service.getCrestPickerForTelegramUser(actor, "creation");
    if (!crest || picker.state !== "ready" || !picker.availableCrests.includes(crest)) {
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
    await safeEditMessageText(ctx, presentGuildInviteOptIn(result, new Date(), { inviteUrl }), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildInviteCodeKeyboard(result.state === "ready" ? result.token : undefined, inviteUrl)
    });
    if (result.state === "ready" && inviteUrl) {
      await ctx.reply(presentGuildInviteShareCard(result.expiresAt, new Date(), inviteUrl), {
        ...HTML_OPTIONS,
        reply_markup: buildGuildInviteShareCardKeyboard(inviteUrl)
      });
    }
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
    const picker = await service.getCrestPickerForTelegramUser(actor, "profile");
    if (picker.state !== "ready" || picker.guildVersion !== callback.version) {
      await safeAnswerCallbackQuery(ctx, { text: "Профіль або повноваження вже змінилися.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGuildProfileStart(), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildProfileCrestKeyboard(
        callback.version,
        picker.availableCrests,
        picker.currentHasCustomCrest
      )
    });
    return;
  }
  if (callback.type === "nearby-invite-open") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Нові запрошення зараз зачинені.", show_alert: true });
      return;
    }
    const nearby = await getNearbyGuildInviteCandidates(actor, service, options);
    if (nearby.state !== "ready") {
      await safeAnswerCallbackQuery(ctx, { text: "Список уже недоступний.", show_alert: true });
      return;
    }
    const totalPages = Math.max(1, Math.ceil(nearby.candidates.length / 5));
    const page = Math.min(Math.max(0, callback.page), totalPages - 1);
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGuildNearbyInvitePicker(nearby.candidates.length, page), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildNearbyInviteKeyboard(nearby.candidates, page)
    });
    return;
  }
  if (callback.type === "nearby-invite") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Нові запрошення зараз зачинені.", show_alert: true });
      return;
    }
    const nearby = await getNearbyGuildInviteCandidates(actor, service, options);
    const candidate = nearby.state === "ready"
      ? nearby.candidates.find((entry) => entry.candidateId === callback.candidateId)
      : null;
    if (!candidate) {
      await safeAnswerCallbackQuery(ctx, { text: "Пригодник уже не доступний для цього запрошення.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await sendGuildInviteFromTargetCode(ctx, service, actor, candidate.targetToken);
    return;
  }
  if (callback.type === "invite-copy") {
    const result = await service.getInviteOptInForTelegramUser(actor);
    const inviteUrl = result.state === "ready" ? buildGuildInviteUrl(options.botUsername, result.token) : null;
    await safeAnswerCallbackQuery(ctx, {
      text: result.state === "ready" ? "Інший текст готовий; посилання не змінилося." : "Стан посилання перевірено."
    });
    await safeEditMessageText(ctx, presentGuildInviteOptIn(result, new Date(), { inviteUrl }), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildInviteCodeKeyboard(
        result.state === "ready" ? result.token : undefined,
        inviteUrl,
        callback.variant
      )
    });
    if (result.state === "ready" && inviteUrl) {
      await ctx.reply(presentGuildInviteShareCard(result.expiresAt, new Date(), inviteUrl, callback.variant), {
        ...HTML_OPTIONS,
        reply_markup: buildGuildInviteShareCardKeyboard(inviteUrl)
      });
    }
    return;
  }
  if (callback.type === "profile-upload") {
    const picker = await service.getCrestPickerForTelegramUser(actor, "profile");
    const ready = picker.state === "ready" && picker.guildVersion === callback.version;
    await safeAnswerCallbackQuery(ctx, { text: ready ? "Бланк емоджі відкрито." : "Стан перевірено." });
    await ctx.reply(ready
      ? presentGuildCustomEmojiPrompt("profile", callback.version)
      : presentGuildCrestPickerUnavailable(picker), {
      ...HTML_OPTIONS,
      ...(ready ? { reply_markup: CREST_EMOJI_FORCE_REPLY } : {})
    });
    return;
  }
  if (callback.type === "profile-keep-custom") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Зміни профілю зараз зачинені.", show_alert: true });
      return;
    }
    const picker = await service.getCrestPickerForTelegramUser(actor, "profile");
    if (
      picker.state !== "ready" ||
      picker.guildVersion !== callback.version ||
      !picker.currentHasCustomCrest ||
      !picker.currentCrest
    ) {
      await safeAnswerCallbackQuery(ctx, { text: "Профіль або повноваження вже змінилися.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx, { text: "Чинний емоджі лишається." });
    await ctx.reply(presentGuildProfileDescriptionPrompt(picker.currentCrest, callback.version), {
      ...HTML_OPTIONS,
      reply_markup: PROFILE_DESCRIPTION_FORCE_REPLY
    });
    return;
  }
  if (callback.type === "profile-crest") {
    if (!service.isEnabled()) {
      await safeAnswerCallbackQuery(ctx, { text: "Зміни профілю зараз зачинені.", show_alert: true });
      return;
    }
    const crest = GUILD_CREST_CATALOG[callback.crestIndex];
    const picker = await service.getCrestPickerForTelegramUser(actor, "profile");
    if (
      !crest ||
      picker.state !== "ready" ||
      picker.guildVersion !== callback.version ||
      !picker.availableCrests.includes(crest)
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
          {
            ...HTML_OPTIONS,
            reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
          }
        );
      } catch {
        // Telegram delivery is best-effort; the durable invitation response remains canonical.
      }
      const founderAchievementText = presentAchievementUnlockNotification(
        "founderAchievementUnlocks" in result && Array.isArray(result.founderAchievementUnlocks)
          ? result.founderAchievementUnlocks
          : []
      );
      if (founderAchievementText) {
        try {
          await ctx.api.sendMessage(
            Number(result.notification.inviterTelegramUserId),
            founderAchievementText,
            {
              ...HTML_OPTIONS,
              reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
            }
          );
        } catch {
          // The durable unlock remains authoritative when Telegram delivery fails.
        }
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
  if (
    callback.type === "leave-open" || callback.type === "delete-open" ||
    callback.type === "leave-legacy" || callback.type === "delete-legacy"
  ) {
    await sendSelfMutationConfirmation(
      ctx,
      service,
      callback.type === "leave-open" || callback.type === "leave-legacy" ? "leave" : "delete",
      "edit",
      callback.version
    );
    return;
  }
  if (callback.type === "leave-cancel" || callback.type === "delete-cancel") {
    await safeAnswerCallbackQuery(ctx, { text: "Скасовано." });
    await safeEditMessageText(ctx, callback.type === "leave-cancel"
      ? "Ви лишилися в ґільдії. Склад не змінився."
      : "Ґільдію не розпущено. Статут лишився чинним.", {
      reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
    });
    return;
  }
  if (!("version" in callback)) {
    await safeAnswerCallbackQuery(ctx, { text: "Застаріла ґільдійна дія.", show_alert: true });
    return;
  }
  let result: GuildMemberMutationRepositoryResult;
  switch (callback.type) {
    case "leave-confirm":
      result = await service.leaveForTelegramUser(actor, callback.version);
      break;
    case "delete-confirm":
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

async function sendGuildNest(ctx: Context, service: GuildService, actor: bigint): Promise<void> {
  const result = await service.getNestForTelegramUser(actor);
  await safeEditMessageText(ctx, presentGuildNest(result), {
    ...HTML_OPTIONS,
    reply_markup: result.state === "ready"
      ? buildGuildNestKeyboard(result, { weeklyGoalEnabled: service.isWeeklyGoalEnabled?.() === true })
      : buildGuildNestUnavailableKeyboard()
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
  await deliverWeeklyAchievementNotices(ctx, service, actor);
}

async function deliverWeeklyAchievementNotices(
  ctx: Context,
  service: GuildService,
  actor: bigint
): Promise<void> {
  const notices = await service.claimWeeklyAchievementNotices?.(actor) ?? [];
  for (const notice of notices) {
    const text = presentAchievementUnlockNotification([notice.unlock]);
    if (!text) continue;
    try {
      await ctx.api.sendMessage(Number(notice.telegramUserId), text, {
        ...HTML_OPTIONS,
        reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
      });
      await service.markWeeklyAchievementNoticeSent(notice);
    } catch (error) {
      await service.recordWeeklyAchievementNoticeFailure(notice, error).catch(() => "lost");
    }
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
    : { ...HTML_OPTIONS, reply_markup: buildGuildPartyRecoveryKeyboard() };
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
  const inviteUrl = buildPartyInviteUrlForSession(options.botUsername, current.session);
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
  action: "leave" | "delete",
  mode: "reply" | "edit" = "reply",
  expectedVersion?: number
): Promise<void> {
  const actor = telegramUserIdFromContext(ctx.from);
  if (!actor) {
    return;
  }
  const hub = await service.getHubForTelegramUser(actor);
  if (hub.state !== "ready") {
    if (mode === "edit") {
      await safeAnswerCallbackQuery(ctx, { text: "Ви вже не належите до ґільдії.", show_alert: true });
      await safeEditMessageText(ctx, "Ви не належите до ґільдії.", {
        reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
      });
    } else {
      await ctx.reply("Ви не належите до ґільдії.");
    }
    return;
  }
  if (expectedVersion !== undefined && hub.guild.version !== expectedVersion) {
    await safeAnswerCallbackQuery(ctx, { text: "Статут уже змінився. Перевірте ґільдію ще раз.", show_alert: true });
    await safeEditMessageText(ctx, "Склад або статут уже змінилися. Відкрийте ґільдію й повторіть дію.", {
      reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
    });
    return;
  }
  if (action === "leave" && hub.guild.viewerRole === "leader") {
    const text = hub.guild.memberCount > 1
      ? "Спершу запропонуйте провід іншому учасникові й дочекайтеся прийняття."
      : "Голова не виходить із порожнього статуту: скористайтеся /guild_delete.";
    if (mode === "edit") {
      await safeAnswerCallbackQuery(ctx, { text, show_alert: true });
    } else {
      await ctx.reply(text);
    }
    return;
  }
  if (action === "delete" && (hub.guild.viewerRole !== "leader" || hub.guild.memberCount !== 1)) {
    const text = "Розпустити ґільдію може лише голова, коли він єдиний чинний учасник.";
    if (mode === "edit") {
      await safeAnswerCallbackQuery(ctx, { text, show_alert: true });
    } else {
      await ctx.reply(text);
    }
    return;
  }
  const callback = action === "leave"
    ? makeGuildLeaveCallbackData(hub.guild.version)
    : makeGuildDeleteCallbackData(hub.guild.version);
  const text = action === "leave"
    ? "Підтвердити вихід із ґільдії? Окрема ватага чи битва не скасується."
    : "Підтвердити розпуск ґільдії? Окремі ватаги й битви залишаться чинними.";
  const replyMarkup = new InlineKeyboard()
    .text(action === "leave" ? "✅ Так, вийти" : "✅ Так, розпустити", callback)
    .text(
      action === "leave" ? "❌ Ні, лишитися" : "❌ Ні, не розпускати",
      action === "leave" ? makeGuildLeaveCancelCallbackData() : makeGuildDeleteCancelCallbackData()
    );
  if (mode === "edit") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, text, { reply_markup: replyMarkup });
  } else {
    await ctx.reply(text, { reply_markup: replyMarkup });
  }
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

function registerGuildCustomEmojiNonTextReplies(bot: Bot, service: GuildService): void {
  bot.on("message", async (ctx, next) => {
    const replyTo = ctx.message.reply_to_message;
    const replyText = replyTo && "text" in replyTo ? replyTo.text : undefined;
    const prompt = replyTo?.from?.is_bot && replyText ? guildCustomEmojiPrompt(replyText) : null;
    if (ctx.chat.type !== "private" || !prompt || "text" in ctx.message) {
      await next();
      return;
    }
    const actor = telegramUserIdFromContext(ctx.from);
    if (!actor) {
      await next();
      return;
    }
    if (!service.isEnabled()) {
      await ctx.reply("Нові герби зараз зачинені. Це повідомлення нічого не змінило.", {
        ...HTML_OPTIONS,
        reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
      });
      return;
    }
    const picker = await service.getCrestPickerForTelegramUser(actor, prompt.purpose);
    const staleProfile = prompt.purpose === "profile" &&
      (picker.state !== "ready" || picker.guildVersion !== prompt.version);
    if (picker.state !== "ready" || staleProfile) {
      await ctx.reply(presentGuildCrestPickerUnavailable(picker), {
        ...HTML_OPTIONS,
        reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
      });
      return;
    }
    await ctx.reply(presentGuildCustomEmojiPrompt(
      prompt.purpose,
      prompt.version,
      "Потрібен рівно один емоджі. Фото, файли й інші повідомлення не підходять."
    ), { ...HTML_OPTIONS, reply_markup: CREST_EMOJI_FORCE_REPLY });
  });
}

function registerRetiredGuildCrestPhotoReplies(bot: Bot): void {
  bot.on("message", async (ctx, next) => {
    const replyTo = ctx.message.reply_to_message;
    const replyText = replyTo && "text" in replyTo ? replyTo.text : undefined;
    const prompt = replyTo?.from?.is_bot && replyText ? guildCrestUploadPrompt(replyText) : null;
    if (ctx.chat.type !== "private" || !prompt) {
      await next();
      return;
    }
    await ctx.reply("Фото гербів більше не приймаються. Оберіть каталоговий або власний емоджі через чинне меню ґільдії.", {
      ...HTML_OPTIONS,
      reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
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
    const customEmojiPrompt = guildCustomEmojiPrompt(replyText);
    if (customEmojiPrompt) {
      if (!service.isEnabled()) {
        await ctx.reply("Нові герби зараз зачинені. Надіслане повідомлення нічого не змінило.", {
          ...HTML_OPTIONS,
          reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
        });
        return;
      }
      const hasUnsupportedLink = ctx.message.entities?.some((entity) =>
        entity.type === "url" || entity.type === "text_link"
      ) ?? false;
      const crest = hasUnsupportedLink
        ? { ok: false as const, reason: "crest" as const }
        : validateGuildCrest(ctx.message.text);
      const picker = await service.getCrestPickerForTelegramUser(
        actor,
        customEmojiPrompt.purpose,
        crest.ok ? crest.crestReservationKey : undefined
      );
      const staleProfile = customEmojiPrompt.purpose === "profile" &&
        (picker.state !== "ready" || picker.guildVersion !== customEmojiPrompt.version);
      if (picker.state !== "ready" || staleProfile) {
        await ctx.reply(presentGuildCrestPickerUnavailable(picker), {
          ...HTML_OPTIONS,
          reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
        });
        return;
      }
      if (!crest.ok) {
        await ctx.reply(presentGuildCustomEmojiPrompt(
          customEmojiPrompt.purpose,
          customEmojiPrompt.version,
          "Потрібен рівно один емоджі без тексту, посилання, фото чи файлу."
        ), { ...HTML_OPTIONS, reply_markup: CREST_EMOJI_FORCE_REPLY });
        return;
      }
      if (picker.requestedCrestAvailable !== true) {
        await ctx.reply(presentGuildCustomEmojiPrompt(
          customEmojiPrompt.purpose,
          customEmojiPrompt.version,
          `Герб ${crest.crest} уже зайнятий формованою або чинною ґільдією. Запропонуйте інший.`
        ), { ...HTML_OPTIONS, reply_markup: CREST_EMOJI_FORCE_REPLY });
        return;
      }
      if (customEmojiPrompt.purpose === "creation") {
        await ctx.reply(presentGuildCreationNamePrompt(crest.crest), {
          ...HTML_OPTIONS,
          reply_markup: NAME_FORCE_REPLY
        });
        return;
      }
      await ctx.reply(presentGuildProfileDescriptionPrompt(crest.crest, customEmojiPrompt.version!), {
        ...HTML_OPTIONS,
        reply_markup: PROFILE_DESCRIPTION_FORCE_REPLY
      });
      return;
    }
    const namePrompt = guildCreationPromptSelection(replyText, GUILD_CREATION_NAME_PROMPT_HEADING);
    if (namePrompt) {
      if (!service.isEnabled()) {
        await ctx.reply("Нові статути зараз зачинені. Введена назва нічого не змінила.");
        return;
      }
      const name = validateGuildIdentity({ crest: namePrompt.crest, displayName: ctx.message.text, description: "" });
      if (!name.ok) {
        await ctx.reply(presentGuildCreationNamePrompt(
          namePrompt.crest,
          guildCreationInputError(name.reason)
        ), {
          ...HTML_OPTIONS,
          reply_markup: NAME_FORCE_REPLY
        });
        return;
      }
      await ctx.reply(presentGuildCreationDescriptionPrompt(
        namePrompt.crest,
        name.displayName
      ), {
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
    if (replyText.split("\n", 1)[0] === GUILD_INVITE_PROMPT_HEADING) {
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
  await ctx.reply(presentGuildInviteCreate(result, new Date(), deliveryConfirmed), {
    ...HTML_OPTIONS,
    reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
  });
}

async function getNearbyGuildInviteCandidates(
  actor: bigint,
  service: GuildService,
  options: GuildCommandOptions
) {
  const snapshot = await options.presence?.getOnlineForTelegramUser(actor);
  if (!snapshot || snapshot.state !== "ready") {
    return { state: "unavailable" as const };
  }
  const nearbyIds = snapshot.location.people.active
    .filter((person) => person.telegramUserId !== actor)
    .map((person) => person.telegramUserId);
  return service.getNearbyInviteCandidatesForTelegramUser(actor, nearbyIds);
}

export function buildGuildInviteUrl(botUsername: string | undefined, token: string): string | null {
  return botUsername ? `https://t.me/${botUsername}?start=guild_${token}` : null;
}

function guildCreationPromptSelection(
  text: string,
  heading: string
): { crest: string } | null {
  const firstLine = text.split("\n", 1)[0] ?? "";
  const prefix = `${heading} · `;
  if (!firstLine.startsWith(prefix)) {
    return null;
  }
  const value = firstLine.slice(prefix.length);
  const crest = validateGuildCrest(value);
  return crest.ok ? { crest: crest.crest } : null;
}

function guildCreationDescriptionPrompt(
  text: string
): { crest: string; displayName: string } | null {
  const selection = guildCreationPromptSelection(text, GUILD_CREATION_DESCRIPTION_PROMPT_HEADING);
  if (!selection) {
    return null;
  }
  const nameLine = text.split("\n").find((line) => line.startsWith("Назва: "));
  const displayName = nameLine?.slice("Назва: ".length).trim();
  return displayName ? { ...selection, displayName } : null;
}

function guildProfileDescriptionPrompt(
  text: string
): { crest: string; version: number } | null {
  const selection = guildCreationPromptSelection(text, GUILD_PROFILE_DESCRIPTION_PROMPT_HEADING);
  if (!selection) {
    return null;
  }
  const versionLine = text.split("\n").find((line) => line.startsWith("Редакція статуту: "));
  const version = Number(versionLine?.slice("Редакція статуту: ".length));
  return Number.isSafeInteger(version) && version >= 0 ? { ...selection, version } : null;
}

function guildCrestUploadPrompt(text: string): { purpose: "creation" | "profile"; token: string } | null {
  const firstLine = text.split("\n", 1)[0] ?? "";
  const match = new RegExp(`^${GUILD_CREST_UPLOAD_PROMPT_HEADING} · ([cp]) · ([A-Za-z0-9_-]{8,32})$`, "u")
    .exec(firstLine);
  return match
    ? { purpose: match[1] === "p" ? "profile" : "creation", token: match[2]! }
    : null;
}

function guildCustomEmojiPrompt(text: string): { purpose: "creation" | "profile"; version?: number } | null {
  const firstLine = text.split("\n", 1)[0] ?? "";
  if (firstLine === `${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · c`) {
    return { purpose: "creation" };
  }
  const profile = new RegExp(`^${GUILD_CUSTOM_EMOJI_PROMPT_HEADING} · p · ([0-9]+)$`, "u").exec(firstLine);
  if (!profile) {
    return null;
  }
  const version = Number(profile[1]);
  return Number.isSafeInteger(version) && version >= 0 ? { purpose: "profile", version } : null;
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
    await ctx.reply(text, {
      ...HTML_OPTIONS,
      reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
    });
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
