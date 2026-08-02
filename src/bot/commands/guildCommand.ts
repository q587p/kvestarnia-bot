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
  buildGuildCreationPreviewKeyboard,
  buildGuildHubKeyboard,
  buildGuildMemberMutationKeyboard
} from "../keyboards/guildKeyboard";
import { buildPartySessionKeyboard } from "../keyboards/partySessionKeyboard";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import {
  presentGuildCreationPreview,
  presentGuildCreationResult,
  presentGuildHub,
  presentGuildInviteCreate,
  presentGuildInviteResponse,
  presentGuildMemberConfirmation,
  presentGuildMemberMutation,
  presentGuildPartyInvite,
  presentGuildPrivateInvite
} from "../presenters/guildPresenter";
import { presentPartyCreate } from "../presenters/partySessionPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { buildPartyInviteUrl } from "../../services/partySessionService";
import type { GuildService } from "../../services/guildService";

interface GuildCommandOptions {
  botUsername?: string | undefined;
}

const HTML_OPTIONS = { parse_mode: "HTML" as const };

export function registerGuildCommands(
  bot: Bot,
  service: GuildService,
  options: GuildCommandOptions = {}
): void {
  bot.command("guild", (ctx) => sendGuildHub(ctx, service, "reply"));
  bot.command("guild_create", async (ctx) => {
    const actor = telegramUserIdFromContext(ctx.from);
    if (!actor) {
      return;
    }
    const parsed = parseCreationArgs(commandArgs(ctx));
    if (!parsed) {
      await ctx.reply("Формат: <code>/guild_create 🛡️ Назва | короткий опис</code>", HTML_OPTIONS);
      return;
    }
    const result = await service.previewCreationForTelegramUser(actor, parsed);
    await ctx.reply(presentGuildCreationPreview(result, new Date()), {
      ...HTML_OPTIONS,
      ...(result.state === "ready" ? { reply_markup: buildGuildCreationPreviewKeyboard(result.intent.token) } : {})
    });
  });
  bot.command("guild_invite", async (ctx) => {
    const actor = telegramUserIdFromContext(ctx.from);
    const targetName = commandArgs(ctx);
    if (!actor || !targetName) {
      await ctx.reply("Формат: <code>/guild_invite Точне імʼя</code>", HTML_OPTIONS);
      return;
    }
    const result = await service.createInviteForTelegramUser(actor, targetName);
    await ctx.reply(presentGuildInviteCreate(result, new Date()), HTML_OPTIONS);
    if (result.state === "created") {
      await ctx.api.sendMessage(
        Number(result.deliveryTelegramUserId),
        presentGuildPrivateInvite(result.invite.guildName, result.invite.guildCrest, result.invite.expiresAt, new Date()),
        {
          ...HTML_OPTIONS,
          reply_markup: new InlineKeyboard()
            .text("✅ Долучитися", makeGuildInviteAcceptCallbackData(result.invite.token))
            .text("✖️ Відхилити", makeGuildInviteDeclineCallbackData(result.invite.token))
        }
      ).catch(() => undefined);
    }
  });
  bot.command("guild_party", (ctx) => sendGuildParty(ctx, service, options));
  bot.command("guild_leave", (ctx) => sendSelfMutationConfirmation(ctx, service, "leave"));
  bot.command("guild_delete", (ctx) => sendSelfMutationConfirmation(ctx, service, "delete"));
  registerMemberActionCommand(bot, service, "guild_transfer", "transfer");
  registerMemberActionCommand(bot, service, "guild_promote", "promote");
  registerMemberActionCommand(bot, service, "guild_demote", "demote");
  registerMemberActionCommand(bot, service, "guild_kick", "kick");

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
    await sendGuildHub(ctx, service, "edit");
    return;
  }
  if (callback.type === "create-confirm") {
    const result = await service.confirmCreationForTelegramUser(actor, callback.token);
    await safeAnswerCallbackQuery(ctx, { text: result.state === "created" ? "Ґільдію засновано." : "Стан перевірено." });
    await safeEditMessageText(ctx, presentGuildCreationResult(result), {
      ...HTML_OPTIONS,
      reply_markup: new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData())
    });
    await sendAchievementNotice(ctx, result.achievementUnlocks ?? []);
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
    return;
  }
  if (callback.type === "party-create") {
    await safeAnswerCallbackQuery(ctx);
    await sendGuildParty(ctx, service, options);
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
      result = await service.transferLeadershipForTelegramUser(actor, callback.memberId, callback.version);
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

async function sendGuildHub(ctx: Context, service: GuildService, mode: "reply" | "edit"): Promise<void> {
  const actor = telegramUserIdFromContext(ctx.from);
  if (!actor) {
    return;
  }
  const result = await service.getHubForTelegramUser(actor);
  if (result.state === "disabled") {
    const text = "Ґільдійна книга зараз зачинена.";
    if (mode === "edit") {
      await safeEditMessageText(ctx, text);
    } else {
      await ctx.reply(text);
    }
    return;
  }
  const text = presentGuildHub(result, new Date());
  const settings = { ...HTML_OPTIONS, reply_markup: buildGuildHubKeyboard(result) };
  if (mode === "edit") {
    await safeEditMessageText(ctx, text, settings);
  } else {
    await ctx.reply(text, settings);
  }
}

async function sendGuildParty(ctx: Context, service: GuildService, options: GuildCommandOptions): Promise<void> {
  const actor = telegramUserIdFromContext(ctx.from);
  if (!actor) {
    return;
  }
  const result = await service.createPartyForTelegramUser(actor, {
    chatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
    messageId: ctx.callbackQuery?.message?.message_id ?? null
  });
  if (result.state !== "party") {
    await ctx.reply(result.state === "disabled" ? "Ґільдійна книга зараз зачинена." : "Спершу треба належати до ґільдії.");
    return;
  }
  const party = result.party;
  const session = "session" in party ? party.session : null;
  const inviteUrl = session ? buildPartyInviteUrl(options.botUsername, session.inviteToken) : null;
  const viewerCharacterId = session?.participants.find((row) => row.character.telegramUserId === actor)?.characterId ?? null;
  await ctx.reply(presentPartyCreate(party, { inviteUrl, viewerCharacterId }), {
    ...HTML_OPTIONS,
    ...(session ? { reply_markup: buildPartySessionKeyboard(session, { viewerCharacterId, inviteUrl }) } : {})
  });
  if (!session || party.state !== "created") {
    return;
  }
  const leaderName = session.participants.find((row) => row.character.telegramUserId === actor)?.character.name ?? "Провідник";
  for (const recipient of result.audience.recipients) {
    await ctx.api.sendMessage(
      Number(recipient.telegramUserId),
      presentGuildPartyInvite(result.audience.guildName, result.audience.guildCrest, leaderName),
      {
        ...HTML_OPTIONS,
        reply_markup: new InlineKeyboard().text("🤝 Долучитися", makePartySessionJoinCallbackData(session.inviteToken))
      }
    ).catch(() => undefined);
  }
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
    await ctx.reply(hub.state === "disabled" ? "Ґільдійна книга зараз зачинена." : "Ви не належите до ґільдії.");
    return;
  }
  if (action === "delete" && hub.guild.viewerRole !== "leader") {
    await ctx.reply("Розпустити ґільдію може лише провідник.");
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
      await ctx.reply(target.state === "ambiguous"
        ? "У складі є кілька однакових імен. Спершу уточніть ідентичність поза цією карткою."
        : "Учасника з таким точним імʼям у вашій ґільдії не знайдено.");
      return;
    }
    await ctx.reply(presentGuildMemberConfirmation(action, target.memberName), {
      ...HTML_OPTIONS,
      reply_markup: buildGuildMemberMutationKeyboard(action, target.memberId, target.expectedVersion)
    });
  });
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
