import { InlineKeyboard } from "grammy";
import type { GuildHubRepositoryResult, GuildMemberRecord } from "../../db/repositories/guildRepository";
import {
  makeGuildCreateOpenCallbackData,
  makeGuildCreateCrestCallbackData,
  makeGuildCreateConfirmCallbackData,
  makeGuildDeleteCallbackData,
  makeGuildInviteAcceptCallbackData,
  makeGuildInviteCancelCallbackData,
  makeGuildInviteDeclineCallbackData,
  makeGuildInviteCodeCallbackData,
  makeGuildInviteStartCallbackData,
  makeGuildLeaveCallbackData,
  makeGuildMemberMutationCallbackData,
  makeGuildMemberSelectCallbackData,
  makeGuildOpenCallbackData,
  makeGuildPartyInviteCallbackData,
  makeGuildPartyOpenCallbackData,
  makeGuildTransferAcceptCallbackData
} from "../callbacks/guildCallbackData";
import type { GuildPartyPickerRepositoryResult } from "../../db/repositories/guildRepository";
import { GUILD_CREST_CATALOG } from "../../domain/guild";

export function buildGuildHubKeyboard(result: GuildHubRepositoryResult, options: { writesEnabled?: boolean } = {}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const writesEnabled = options.writesEnabled !== false;
  if (result.state === "no-character") {
    return keyboard;
  }
  for (const invite of result.incomingInvites) {
    if (writesEnabled) {
      keyboard.text(`✅ До ${invite.guildCrest}`, makeGuildInviteAcceptCallbackData(invite.token));
    }
    keyboard.text("✖️ Відхилити", makeGuildInviteDeclineCallbackData(invite.token)).row();
  }
  if (result.state === "not-member" && writesEnabled) {
    keyboard
      .text("📜 Заснувати ґільдію", makeGuildCreateOpenCallbackData())
      .text("✉️ Мій код", makeGuildInviteCodeCallbackData())
      .row();
  }
  if (result.state === "ready") {
    if (writesEnabled) {
      keyboard.text("🔗 Мій код запрошення", makeGuildInviteCodeCallbackData()).row();
      keyboard.text("✉️ Запросити з ґільдії", makeGuildPartyOpenCallbackData()).row();
      if (result.guild.viewerRole === "leader" || result.guild.viewerRole === "officer") {
        keyboard.text("📨 Запросити за кодом", makeGuildInviteStartCallbackData()).row();
      }
      if (result.guild.viewerRole === "leader") {
        keyboard.copyText("✏️ Змінити профіль", "/guild_edit 🦉 | короткий опис").row();
      }
    }
    if (result.guild.viewerIsLeadershipNominee) {
      keyboard.text("👑 Прийняти провід", makeGuildTransferAcceptCallbackData(result.guild.version)).row();
    }
    for (const invite of result.guild.outgoingInvites) {
      if (invite.canCancel) {
        keyboard.text(`🧹 Скасувати: ${invite.targetName}`, makeGuildInviteCancelCallbackData(invite.token)).row();
      }
    }
    if (result.guild.viewerRole !== "leader") {
      keyboard.text("🚪 Вийти", makeGuildLeaveCallbackData(result.guild.version));
    }
    if (result.guild.viewerRole === "leader" && result.guild.memberCount === 1) {
      keyboard.text("🗑️ Розпустити", makeGuildDeleteCallbackData(result.guild.version));
    }
    keyboard.row();
  }
  const page = result.state === "ready" ? result.guild.page : result.state === "not-member" ? result.page : 0;
  const hasPrevious = result.state === "ready" ? result.guild.hasPreviousPage : result.state === "not-member" && result.hasPreviousPage;
  const hasNext = result.state === "ready" ? result.guild.hasNextPage : result.state === "not-member" && result.hasNextPage;
  if (hasPrevious) {
    keyboard.text("⬅️", makeGuildOpenCallbackData(page - 1));
  }
  keyboard.text("🔎 Оновити", makeGuildOpenCallbackData(page));
  if (hasNext) {
    keyboard.text("➡️", makeGuildOpenCallbackData(page + 1));
  }
  return keyboard;
}

export function buildGuildPartyPickerKeyboard(
  result: Extract<GuildPartyPickerRepositoryResult, { state: "ready" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const candidate of result.candidates) {
    keyboard.text(`✉️ ${candidate.name}`, makeGuildPartyInviteCallbackData(candidate.memberId, result.guildVersion)).row();
  }
  if (result.hasPreviousPage) {
    keyboard.text("⬅️", makeGuildPartyOpenCallbackData(result.page - 1));
  }
  keyboard.text("🏰 Назад", makeGuildOpenCallbackData());
  if (result.hasNextPage) {
    keyboard.text("➡️", makeGuildPartyOpenCallbackData(result.page + 1));
  }
  return keyboard;
}

export function buildGuildCreationPreviewKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Заснувати", makeGuildCreateConfirmCallbackData(token))
    .text("⬅️ Не зараз", makeGuildOpenCallbackData());
}

export function buildGuildCreationStartKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  GUILD_CREST_CATALOG.forEach((crest, index) => {
    keyboard.text(crest, makeGuildCreateCrestCallbackData(index));
    if ((index + 1) % 5 === 0) {
      keyboard.row();
    }
  });
  return keyboard.row().text("🏰 Назад", makeGuildOpenCallbackData());
}

export function buildGuildInviteCodeKeyboard(token?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (token) {
    keyboard.copyText("📋 Скопіювати код", token).row();
    keyboard.copyText("📨 Команда для запрошувача", `/guild_invite ${token}`).row();
  }
  return keyboard.text("🏰 Назад", makeGuildOpenCallbackData());
}

export function buildGuildMemberMutationKeyboard(
  action: "transfer" | "promote" | "demote" | "kick",
  memberId: string,
  version: number
): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Підтвердити", makeGuildMemberMutationCallbackData(action, memberId, version))
    .text("⬅️ Не зараз", makeGuildOpenCallbackData());
}

export function buildGuildMemberTargetKeyboard(
  action: "transfer" | "promote" | "demote" | "kick",
  candidates: GuildMemberRecord[],
  version: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  candidates.forEach((candidate, index) => {
    const role = candidate.role === "leader" ? "голова" : candidate.role === "officer" ? "старшина" : "учасник";
    keyboard
      .text(`${index + 1}. ${candidate.name} · ${role}`, makeGuildMemberSelectCallbackData(action, candidate.id, version))
      .row();
  });
  keyboard.text("⬅️ Не зараз", makeGuildOpenCallbackData());
  return keyboard;
}
