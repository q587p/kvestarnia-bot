import type {
  GuildCreationConfirmRepositoryResult,
  GuildHubRepositoryResult,
  GuildInviteRecord,
  GuildInviteCreateRepositoryResult,
  GuildInviteRespondRepositoryResult,
  GuildMemberMutationRepositoryResult,
  GuildViewRecord
} from "../../db/repositories/guildRepository";
import type { GuildRole } from "../../domain/guild";
import type { GuildCreationPreviewResult } from "../../services/guildService";
import { escapeHtml } from "./telegramHtml";

export function presentGuildHub(result: GuildHubRepositoryResult, now: Date): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Статут без підписанта Корчмар складає під коротшу ніжку стола.";
  }
  if (result.state === "not-member") {
    return [
      "🏰 <b>Ґільдії Квестарні</b>",
      "",
      ...(result.incomingInvites.length > 0
        ? ["Запрошення:", ...result.incomingInvites.map((invite) =>
          `${invite.guildCrest} <b>${escapeHtml(invite.guildName)}</b> — ще ${formatRemaining(invite.expiresAt, now)}`
        ), ""]
        : ["Запрошень поки немає. Навіть писар не вдає, що загубив їх.", ""]),
      "Заснування: <code>/guild_create 🛡️ Назва | короткий опис</code>"
    ].join("\n");
  }
  return presentGuildView(result.guild, result.incomingInvites, now);
}

export function presentGuildView(
  guild: GuildViewRecord,
  incomingInvites: GuildInviteRecord[],
  now: Date
): string {
  const role = roleLabel(guild.viewerRole);
  return [
    `${guild.crest} <b>${escapeHtml(guild.displayName)}</b>`,
    guild.description ? escapeHtml(guild.description) : "Короткий опис ще ховається під печаткою.",
    `Ваша роль: <b>${role}</b>`,
    "",
    "<b>Склад</b>",
    ...guild.members.map((member) =>
      `${roleIcon(member.role)} ${escapeHtml(member.name)} — ${roleLabel(member.role)}`
    ),
    ...(incomingInvites.length > 0
      ? ["", "<b>Інші запрошення</b>", ...incomingInvites.map((invite) =>
        `${invite.guildCrest} ${escapeHtml(invite.guildName)} — ще ${formatRemaining(invite.expiresAt, now)}`
      )]
      : []),
    ...(guild.outgoingInvites.length > 0
      ? ["", "<b>Надіслані запрошення</b>", ...guild.outgoingInvites.map((invite) =>
        `✉️ ${escapeHtml(invite.targetName)} — ще ${formatRemaining(invite.expiresAt, now)}`
      )]
      : []),
    "",
    ...managementHints(guild.viewerRole)
  ].join("\n");
}

export function presentGuildCreationPreview(result: GuildCreationPreviewResult, now: Date): string {
  if (result.state === "disabled") {
    return "Ґільдійна книга зараз зачинена.";
  }
  if (result.state === "invalid") {
    return invalidIdentityText(result.reason);
  }
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start.";
  }
  if (result.state === "already-member") {
    return "Ви вже належите до ґільдії. Друга печатка на одному пригодникові не тримається.";
  }
  return [
    "📜 <b>Чернетка статуту</b>",
    "",
    `${result.intent.crest} <b>${escapeHtml(result.intent.displayName)}</b>`,
    result.intent.description ? escapeHtml(result.intent.description) : "Без опису — загадково, але законно.",
    "",
    `Заснування коштує <b>${result.intent.goldCost} золота</b>. У вас: <b>${result.intent.availableGold}</b>.`,
    `Чернетка чинна ще <b>${formatRemaining(result.intent.expiresAt, now)}</b>.`,
    "Підтвердження списує золото один раз і створює одну ґільдію."
  ].join("\n");
}

export function presentGuildCreationResult(result: GuildCreationConfirmRepositoryResult): string {
  if (result.state === "created") {
    return `${result.guild.crest} <b>${escapeHtml(result.guild.displayName)}</b> засновано. Писар уже зробив вигляд, що все було за формою.`;
  }
  if (result.state === "replayed") {
    return `${result.guild.crest} <b>${escapeHtml(result.guild.displayName)}</b> уже засновано. Повторна печатка золота не списала.`;
  }
  if (result.state === "insufficient-gold") {
    return `Не вистачає золота: потрібно <b>${result.required}</b>, є <b>${result.available}</b>. Чернетка нічого не списала.`;
  }
  if (result.state === "name-taken") {
    return "Цю назву вже записано в ґільдійній книзі. Золото лишилося при вас.";
  }
  if (result.state === "expired") {
    return "Чернетка статуту прострочилася. Створіть нову через /guild_create.";
  }
  if (result.state === "stale-life") {
    return "Чернетка належить попередньому життю пригодника. Створіть нову після реморту.";
  }
  if (result.state === "already-member") {
    return "Ви вже в ґільдії. Повторне підтвердження нічого не списало.";
  }
  return "Чернетка не знайшлася або вже втратила чинність.";
}

export function presentGuildInviteCreate(
  result: GuildInviteCreateRepositoryResult | { state: "disabled" },
  now: Date
): string {
  if (result.state === "created" || result.state === "replayed") {
    const replay = result.state === "replayed" ? "Запрошення вже чекало й не розмножилося." : "Запрошення передано приватно.";
    return `✉️ ${escapeHtml(result.invite.targetName)} має ${formatRemaining(result.invite.expiresAt, now)} на відповідь. ${replay}`;
  }
  if (result.state === "rate-limited") {
    return `Писар просить не засипати стіл печатками. Наступне запрошення — за <b>${formatRemaining(result.availableAt, result.now)}</b>.`;
  }
  const text: Record<string, string> = {
    disabled: "Ґільдійна книга зараз зачинена.",
    "no-character": "Спершу створіть пригодника через /start.",
    "not-member": "Спершу треба належати до ґільдії.",
    forbidden: "Запрошувати можуть провідник або старшина.",
    "target-not-found": "Пригодника з таким точним імʼям не знайдено.",
    "target-ambiguous": "Імʼя не унікальне. Попросіть пригодника обрати виразніше імʼя перед запрошенням.",
    self: "Запрошувати себе до власної ґільдії — це вже бухгалтерія, а не соціяльність.",
    "target-already-member": "Цей пригодник уже належить до ґільдії.",
    "guild-full": "У статуті вже тринадцять підписів. Спершу звільніть місце."
  };
  return text[result.state] ?? "Запрошення не створилося.";
}

export function presentGuildInviteResponse(result: GuildInviteRespondRepositoryResult): string {
  if (result.state === "accepted") {
    return `${result.guild.crest} Ви долучилися до <b>${escapeHtml(result.guild.displayName)}</b>.`;
  }
  if (result.state === "replayed") {
    return `${result.guild.crest} Ви вже в <b>${escapeHtml(result.guild.displayName)}</b>. Повторна відповідь нічого не змінила.`;
  }
  const text: Record<string, string> = {
    declined: "Запрошення відхилено. Писар прибрав перо без образ.",
    cancelled: "Запрошення скасовано.",
    expired: "Строк запрошення минув. Нове матиме новий строк.",
    "already-in-guild": "Ви вже належите до іншої ґільдії.",
    "guild-full": "У ґільдії вже немає вільного місця.",
    "no-character": "Спершу створіть пригодника через /start.",
    "not-found": "Запрошення не знайшлося або не належить вам."
  };
  return text[result.state] ?? "Відповідь не записалася.";
}

export function presentGuildMemberMutation(result: GuildMemberMutationRepositoryResult): string {
  if (result.state === "updated") {
    return `${result.guild.crest} Зміну записано в статуті <b>${escapeHtml(result.guild.displayName)}</b>.`;
  }
  if (result.state === "left") {
    return `Ви вийшли з <b>${escapeHtml(result.guildName)}</b>.${result.successorName ? ` Новий провідник: <b>${escapeHtml(result.successorName)}</b>.` : ""}`;
  }
  if (result.state === "deleted") {
    return `<b>${escapeHtml(result.guildName)}</b> розпущено. Жодна окрема ватага чи битва від цього не зникла.`;
  }
  const text: Record<string, string> = {
    "no-character": "Спершу створіть пригодника через /start.",
    "not-member": "Ви вже не належите до цієї ґільдії.",
    "not-found": "Учасник або ґільдія не знайшлися.",
    forbidden: "Для цієї зміни бракує ґільдійної ролі.",
    stale: "Статут уже змінився. Відкрийте /guild і повторіть дію з нового стану.",
    "invalid-target": "Цю роль або дію не можна застосувати до вибраного учасника."
  };
  return text[result.state] ?? "Зміна не записалася.";
}

export function presentGuildMemberConfirmation(
  action: "transfer" | "promote" | "demote" | "kick",
  memberName: string
): string {
  const verbs = {
    transfer: "передати провід",
    promote: "призначити старшиною",
    demote: "повернути до ролі учасника",
    kick: "виключити з ґільдії"
  } as const;
  return `Підтвердити: ${verbs[action]} <b>${escapeHtml(memberName)}</b>? Стан статуту буде перевірено ще раз.`;
}

export function presentGuildPrivateInvite(guildName: string, guildCrest: string, expiresAt: Date, now: Date): string {
  return [
    `✉️ <b>Запрошення до ґільдії</b>`,
    "",
    `${guildCrest} <b>${escapeHtml(guildName)}</b> кличе поставити підпис у статуті.`,
    `На відповідь: <b>${formatRemaining(expiresAt, now)}</b>.`,
    "Картка не показує місце, час появи чи Telegram-дані учасників."
  ].join("\n");
}

export function presentGuildPartyInvite(guildName: string, guildCrest: string, leaderName: string): string {
  return [
    `${guildCrest} <b>${escapeHtml(guildName)}</b> збирає звичайну ватагу.`,
    `${escapeHtml(leaderName)} залишає приватний поклик; участь перевірить звичайний договір ватаги.`
  ].join("\n");
}

function invalidIdentityText(reason: Extract<GuildCreationPreviewResult, { state: "invalid" }>["reason"]): string {
  const text = {
    "name-length": "Назва має містити від 3 до 32 видимих знаків.",
    "name-reserved": "Цю назву береже канцелярія Квестарні. Оберіть іншу.",
    "name-unsafe": "Назва містить службові або небезпечні знаки.",
    crest: "Герб має бути одним емоджі.",
    "description-length": "Опис має вміститися у 120 видимих знаків.",
    "description-unsafe": "Опис містить службові або небезпечні знаки."
  } as const;
  return text[reason];
}

function managementHints(role: GuildRole): string[] {
  const common = ["Ватага: /guild_party", "Вихід: /guild_leave"];
  if (role === "member") {
    return common;
  }
  const officer = ["Запросити: /guild_invite Точне імʼя", "Виключити: /guild_kick Точне імʼя"];
  return role === "leader"
    ? [...common, ...officer, "Ролі: /guild_promote, /guild_demote, /guild_transfer"]
    : [...common, ...officer];
}

function roleLabel(role: GuildRole): string {
  return role === "leader" ? "провідник" : role === "officer" ? "старшина" : "учасник";
}

function roleIcon(role: GuildRole): string {
  return role === "leader" ? "👑" : role === "officer" ? "📜" : "🧭";
}

function formatRemaining(availableAt: Date, now: Date): string {
  const seconds = Math.max(0, Math.ceil((availableAt.getTime() - now.getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds} с`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} хв`;
  }
  const hours = Math.ceil(minutes / 60);
  return `${hours} год`;
}
