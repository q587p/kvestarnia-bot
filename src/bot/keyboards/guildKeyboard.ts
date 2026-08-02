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
  makeGuildPartyCreateCallbackData
} from "../callbacks/guildCallbackData";

export function buildGuildHubKeyboard(result: GuildHubRepositoryResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (result.state === "no-character") {
    return keyboard;
  }
  for (const invite of result.incomingInvites) {
    keyboard
      .text(`✅ До ${invite.guildCrest}`, makeGuildInviteAcceptCallbackData(invite.token))
      .text("✖️ Відхилити", makeGuildInviteDeclineCallbackData(invite.token))
      .row();
  }
  if (result.state === "ready") {
    keyboard.text("🪢 Зібрати ватагу", makeGuildPartyCreateCallbackData()).row();
    if (result.guild.viewerRole === "leader" || result.guild.viewerRole === "officer") {
      for (const invite of result.guild.outgoingInvites) {
        keyboard.text(`🧹 Скасувати: ${invite.targetName}`, makeGuildInviteCancelCallbackData(invite.token)).row();
      }
    }
    keyboard.text("🚪 Вийти", makeGuildLeaveCallbackData(result.guild.version));
    if (result.guild.viewerRole === "leader") {
      keyboard.text("🗑️ Розпустити", makeGuildDeleteCallbackData(result.guild.version));
    }
    keyboard.row();
  }
  keyboard.text("🔎 Оновити", makeGuildOpenCallbackData());
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
