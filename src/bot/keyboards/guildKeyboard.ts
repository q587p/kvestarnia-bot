import { InlineKeyboard } from "grammy";
import type {
  GuildHubRepositoryResult,
  GuildMemberRecord,
  GuildNestRepositoryResult,
  GuildPublicDirectoryRepositoryResult
} from "../../db/repositories/guildRepository";
import {
  makeGuildCreateOpenCallbackData,
  makeGuildCreateUploadCallbackData,
  makeGuildCreateCrestCallbackData,
  makeGuildCreateConfirmCallbackData,
  makeGuildDeleteCallbackData,
  makeGuildDirectoryOpenCallbackData,
  makeGuildDirectoryProfileCallbackData,
  makeGuildInviteAcceptCallbackData,
  makeGuildInviteCancelCallbackData,
  makeGuildInviteDeclineCallbackData,
  makeGuildInviteCodeCallbackData,
  makeGuildInviteCopyCallbackData,
  makeGuildInviteStartCallbackData,
  makeGuildLeaveCallbackData,
  makeGuildMemberMutationCallbackData,
  makeGuildMemberManageCallbackData,
  makeGuildMemberSelectCallbackData,
  makeGuildMembersOpenCallbackData,
  makeGuildNestOpenCallbackData,
  makeGuildNestRulesCallbackData,
  makeGuildOpenCallbackData,
  makeGuildPartyInviteCallbackData,
  makeGuildPartyOpenCallbackData,
  makeGuildProfileCrestCallbackData,
  makeGuildProfileKeepCustomCallbackData,
  makeGuildProfileOpenCallbackData,
  makeGuildProfileUploadCallbackData,
  makeGuildTransferAcceptCallbackData
} from "../callbacks/guildCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import type { GuildPartyPickerRepositoryResult } from "../../db/repositories/guildRepository";
import { GUILD_CREST_CATALOG, GUILD_INITIAL_MEMBER_CAPACITY } from "../../domain/guild";
import { GUILD_INVITE_SHARE_TEXTS, guildInviteShareText } from "../../content/guildInviteCopy";

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
      keyboard.text("✉️ Запросити з ґільдії", makeGuildPartyOpenCallbackData()).row();
      if (result.guild.viewerRole === "leader" || result.guild.viewerRole === "officer") {
        keyboard.text("📨 Запросити за кодом", makeGuildInviteStartCallbackData()).row();
      }
      if (result.guild.viewerRole === "leader") {
        keyboard.text("✏️ Змінити профіль", makeGuildProfileOpenCallbackData(result.guild.version)).row();
        keyboard.text("👥 Учасники", makeGuildMembersOpenCallbackData(result.guild.version)).row();
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

export function buildGuildNestKeyboard(
  result: Extract<GuildNestRepositoryResult, { state: "ready" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("📚 Чинні ґільдії", makeGuildDirectoryOpenCallbackData())
    .row()
    .text("❔ Умови й ролі", makeGuildNestRulesCallbackData())
    .row();
  if (result.viewerState === "not-member") {
    if (result.hasIncomingInvites) {
      keyboard.text("✉️ Мої запрошення", makeGuildOpenCallbackData()).row();
    }
    keyboard.text("🔗 Мій код запрошення", makeGuildInviteCodeCallbackData()).row();
    keyboard.text("📜 Заснувати свою", makeGuildCreateOpenCallbackData()).row();
  } else if (result.viewerState === "forming") {
    keyboard.text("📜 Мій статут", makeGuildOpenCallbackData()).row();
  } else {
    keyboard.text("🏰 Моя ґільдія", makeGuildOpenCallbackData()).row();
  }
  return keyboard.text("↩️ До Спуску", makePlaceCallbackData("deep"));
}

export function buildGuildNestUnavailableKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("↩️ До Спуску", makePlaceCallbackData("deep"));
}

export function buildGuildNestRulesKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🪺 До Гнізда", makeGuildNestOpenCallbackData())
    .row()
    .text("↩️ До Спуску", makePlaceCallbackData("deep"));
}

export function buildGuildDirectoryKeyboard(
  result: Extract<GuildPublicDirectoryRepositoryResult, { state: "ready" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const guild of result.guilds) {
    keyboard
      .text(
        `${guild.crest} ${guild.displayName} · ${guild.memberCount}/${GUILD_INITIAL_MEMBER_CAPACITY}`,
        makeGuildDirectoryProfileCallbackData(guild.id, result.page)
      )
      .row();
  }
  if (result.hasPreviousPage) {
    keyboard.text("⬅️", makeGuildDirectoryOpenCallbackData(result.page - 1));
  }
  keyboard.text("🔎 Оновити", makeGuildDirectoryOpenCallbackData(result.page));
  if (result.hasNextPage) {
    keyboard.text("➡️", makeGuildDirectoryOpenCallbackData(result.page + 1));
  }
  return keyboard.row().text("🪺 До Гнізда", makeGuildNestOpenCallbackData());
}

export function buildGuildPublicProfileKeyboard(page: number): InlineKeyboard {
  return new InlineKeyboard().text("📚 До переліку", makeGuildDirectoryOpenCallbackData(page))
    .row()
    .text("🪺 До Гнізда", makeGuildNestOpenCallbackData());
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

export function buildGuildPartyRecoveryKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🏰 До ґільдії", makeGuildOpenCallbackData());
}

export function buildGuildCreationPreviewKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard().text("✅ Заснувати", makeGuildCreateConfirmCallbackData(token))
    .text("⬅️ Не зараз", makeGuildOpenCallbackData());
}

function appendAvailableGuildCrests(
  keyboard: InlineKeyboard,
  availableCrests: readonly string[],
  makeCallbackData: (crestIndex: number) => string
): number {
  let visibleCount = 0;
  for (const [crestIndex, crest] of GUILD_CREST_CATALOG.entries()) {
    if (!availableCrests.includes(crest)) {
      continue;
    }
    if (visibleCount > 0 && visibleCount % 5 === 0) {
      keyboard.row();
    }
    keyboard.text(crest, makeCallbackData(crestIndex));
    visibleCount += 1;
  }
  return visibleCount;
}

export function buildGuildCreationStartKeyboard(availableCrests: readonly string[] = GUILD_CREST_CATALOG): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (appendAvailableGuildCrests(keyboard, availableCrests, makeGuildCreateCrestCallbackData) > 0) {
    keyboard.row();
  }
  return keyboard
    .text("✍️ Запропонувати свій емоджі", makeGuildCreateUploadCallbackData())
    .row()
    .text("🏰 Назад", makeGuildOpenCallbackData());
}

export function buildGuildProfileCrestKeyboard(
  version: number,
  availableCrests: readonly string[] = GUILD_CREST_CATALOG,
  currentHasCustomCrest = false
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (appendAvailableGuildCrests(
    keyboard,
    availableCrests,
    (crestIndex) => makeGuildProfileCrestCallbackData(crestIndex, version)
  ) > 0) {
    keyboard.row();
  }
  if (currentHasCustomCrest) {
    keyboard.text("🔁 Лишити чинний емоджі", makeGuildProfileKeepCustomCallbackData(version)).row();
  }
  return keyboard
    .text("✍️ Запропонувати свій емоджі", makeGuildProfileUploadCallbackData(version))
    .row()
    .text("🏰 Назад", makeGuildOpenCallbackData());
}

export function buildGuildInviteCodeKeyboard(
  token?: string,
  inviteUrl?: string | null,
  variant = 0
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (token) {
    if (inviteUrl) {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(guildInviteShareText(variant))}`;
      keyboard.url("📨 Поділитися запрошенням", shareUrl).row();
      keyboard
        .text(
          "🎲 Згенерувати інший текст",
          makeGuildInviteCopyCallbackData((variant + 1) % GUILD_INVITE_SHARE_TEXTS.length)
        )
        .row();
      keyboard.copyText("🔗 Скопіювати посилання", inviteUrl).row();
    }
    keyboard.copyText("📋 Резервний код", token).row();
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

export const GUILD_MEMBER_MANAGEMENT_PAGE_SIZE = 5;

export function buildGuildMemberManagementKeyboard(
  members: GuildMemberRecord[],
  version: number,
  page: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const totalPages = Math.max(1, Math.ceil(members.length / GUILD_MEMBER_MANAGEMENT_PAGE_SIZE));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  const rows = members.slice(
    currentPage * GUILD_MEMBER_MANAGEMENT_PAGE_SIZE,
    (currentPage + 1) * GUILD_MEMBER_MANAGEMENT_PAGE_SIZE
  );
  rows.forEach((member) => {
    const role = member.role === "leader" ? "голова" : member.role === "officer" ? "старшина" : "учасник";
    keyboard.text(`${member.name} · ${role}`, makeGuildMemberManageCallbackData(member.id, version)).row();
  });
  if (currentPage > 0) {
    keyboard.text("⬅️", makeGuildMembersOpenCallbackData(version, currentPage - 1));
  }
  keyboard.text(`${currentPage + 1}/${totalPages}`, makeGuildMembersOpenCallbackData(version, currentPage));
  if (currentPage < totalPages - 1) {
    keyboard.text("➡️", makeGuildMembersOpenCallbackData(version, currentPage + 1));
  }
  return keyboard.row().text("🏰 До ґільдії", makeGuildOpenCallbackData());
}

export function buildGuildMemberActionsKeyboard(member: GuildMemberRecord, version: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (member.role === "member") {
    keyboard.text("⬆️ Призначити старшиною", makeGuildMemberSelectCallbackData("promote", member.id, version)).row();
  }
  if (member.role === "officer") {
    keyboard.text("⬇️ Повернути до учасників", makeGuildMemberSelectCallbackData("demote", member.id, version)).row();
  }
  if (member.role !== "leader") {
    keyboard.text("👑 Запропонувати провід", makeGuildMemberSelectCallbackData("transfer", member.id, version)).row();
    keyboard.text("🚪 Виключити", makeGuildMemberSelectCallbackData("kick", member.id, version)).row();
  }
  return keyboard.text("👥 До учасників", makeGuildMembersOpenCallbackData(version));
}
