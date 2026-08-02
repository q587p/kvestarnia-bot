import { InlineKeyboard } from "grammy";
import type { GuildHubRepositoryResult } from "../../db/repositories/guildRepository";
import {
  makeGuildCreateConfirmCallbackData,
  makeGuildDeleteCallbackData,
  makeGuildInviteAcceptCallbackData,
  makeGuildInviteCancelCallbackData,
  makeGuildInviteDeclineCallbackData,
  makeGuildLeaveCallbackData,
  makeGuildMemberMutationCallbackData,
  makeGuildOpenCallbackData,
  makeGuildPartyInviteCallbackData,
  makeGuildPartyOpenCallbackData,
  makeGuildTransferAcceptCallbackData
} from "../callbacks/guildCallbackData";
import type { GuildPartyPickerRepositoryResult } from "../../db/repositories/guildRepository";

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
  if (result.state === "ready") {
    if (writesEnabled) {
      keyboard.text("✉️ Запросити з ґільдії", makeGuildPartyOpenCallbackData()).row();
    }
    if (result.guild.viewerIsLeadershipNominee) {
      keyboard.text("👑 Прийняти провід", makeGuildTransferAcceptCallbackData(result.guild.version)).row();
    }
    if (result.guild.viewerRole === "leader" || result.guild.viewerRole === "officer") {
      for (const invite of result.guild.outgoingInvites) {
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

export function buildGuildMemberMutationKeyboard(
  action: "transfer" | "promote" | "demote" | "kick",
  memberId: string,
  version: number
): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Підтвердити", makeGuildMemberMutationCallbackData(action, memberId, version))
    .text("⬅️ Не зараз", makeGuildOpenCallbackData());
}
