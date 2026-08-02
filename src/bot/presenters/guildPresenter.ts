import type {
  GuildCreationConfirmRepositoryResult,
  GuildHubRepositoryResult,
  GuildInviteCreateRepositoryResult,
  GuildInviteOptInRepositoryResult,
  GuildInviteRecord,
  GuildInviteRespondRepositoryResult,
  GuildMemberMutationRepositoryResult,
  GuildViewRecord
} from "../../db/repositories/guildRepository";
import type { GuildRole } from "../../domain/guild";
import type { GuildCreationPreviewResult, GuildPartyPickerResult, GuildProfileUpdateResult } from "../../services/guildService";
import { escapeHtml } from "./telegramHtml";

export function presentGuildHub(
  result: GuildHubRepositoryResult,
  now: Date,
  options: { writesEnabled?: boolean } = {}
): string {
  const writesEnabled = options.writesEnabled !== false;
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Статут без підписанта корчмар складає під коротшу ніжку стола.";
  }
  const recovery = writesEnabled
    ? []
    : ["🔒 Нові статути й запрошення тимчасово зачинені. Чинний склад можна читати, а безпечний вихід лишається доступним.", ""];
  if (result.state === "not-member") {
    return [
      "🏰 <b>Ґільдії Квестарні</b>",
      "",
      ...recovery,
      ...(result.incomingInvites.length > 0
        ? ["Запрошення:", ...result.incomingInvites.map((invite) =>
          `${invite.guildCrest} <b>${escapeHtml(invite.guildName)}</b> — ще ${formatRemaining(invite.expiresAt, now)}`
        ), ""]
        : ["Запрошень поки немає. Навіть писар не вдає, що загубив їх.", ""]),
      ...(writesEnabled
        ? ["Щоб хтось міг запросити вас без пошуку по гравцях: /guild_invite_code", "Заснування: <code>/guild_create 🛡️ Назва | короткий опис</code>"]
        : [])
    ].join("\n");
  }
  return [...recovery, presentGuildView(result.guild, result.incomingInvites, now)].join("\n");
}

export function presentGuildView(
  guild: GuildViewRecord,
  incomingInvites: GuildInviteRecord[],
  now: Date
): string {
  return [
    `${guild.crest} <b>${escapeHtml(guild.displayName)}</b>`,
    guild.description ? escapeHtml(guild.description) : "Короткий опис ще ховається під печаткою.",
    `Ваша роль: <b>${roleLabel(guild.viewerRole)}</b> · склад: <b>${guild.memberCount}/8</b>`,
    ...(guild.status === "forming"
      ? [`📜 Статут формується: потрібен перший друг. Часу ще <b>${formatRemaining(guild.charterExpiresAt, now)}</b>.`]
      : []),
    ...(guild.leadershipNomineeName
      ? [`👑 Провід запропоновано: <b>${escapeHtml(guild.leadershipNomineeName)}</b>. Передача станеться лише після прийняття.`]
      : []),
    "",
    "<b>Склад</b>",
    ...guild.members.map((member) => `${roleIcon(member.role)} ${escapeHtml(member.name)} — ${roleLabel(member.role)}`),
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
    return "Нові статути зараз не приймають. Чинна ґільдійна книга лишається доступною через /guild.";
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
  if (result.state === "ineligible") {
    return "Заснувати ґільдію можна з 5 рівня або після першого реморту з 3 рівня. Вступ для запрошених лишається вільним.";
  }
  if (result.state === "founder-cooldown") {
    return `Новий статут можна підтвердити за <b>${formatRemaining(result.availableAt, result.now)}</b>. Попередня спроба лишається частиною семиденного засновницького обліку.`;
  }
  if (result.state !== "ready") {
    return "Чернетку не вдалося підготувати.";
  }
  return [
    "📜 <b>Чернетка статуту</b>",
    "",
    `${result.intent.crest} <b>${escapeHtml(result.intent.displayName)}</b>`,
    result.intent.description ? escapeHtml(result.intent.description) : "Без опису — загадково, але законно.",
    "",
    `Підтвердження коштує <b>${result.intent.goldCost} золота</b>. У вас: <b>${result.intent.availableGold}</b>.`,
    `Чернетка чинна ще <b>${formatRemaining(result.intent.expiresAt, now)}</b>.`,
    "Плата не повертається. Статут активується, коли перший окремий пригодник прийме запрошення."
  ].join("\n");
}

export function presentGuildCreationResult(result: GuildCreationConfirmRepositoryResult): string {
  if (result.state === "created") {
    return `${result.guild.crest} Чернетку <b>${escapeHtml(result.guild.displayName)}</b> підтверджено. Тепер запросіть першого друга: саме його вступ активує ґільдію.`;
  }
  if (result.state === "replayed") {
    return `${result.guild.crest} Статут <b>${escapeHtml(result.guild.displayName)}</b> уже підтверджено. Повторна печатка золота не списала.`;
  }
  if (result.state === "insufficient-gold") {
    return `Не вистачає золота: потрібно <b>${result.required}</b>, є <b>${result.available}</b>. Чернетка нічого не списала.`;
  }
  if (result.state === "name-taken") {
    return "Ця назва зараз зарезервована іншим статутом. Золото лишилося при вас.";
  }
  if (result.state === "expired") {
    return "Чернетка або строк формування минули. Створіть нову чернетку, коли засновницький облік дозволить.";
  }
  if (result.state === "stale-life") {
    return "Чернетка належить попередньому життю пригодника. Створіть нову після реморту або перезапуску.";
  }
  if (result.state === "already-member") {
    return "Ви вже в ґільдії. Повторне підтвердження нічого не списало.";
  }
  if (result.state === "ineligible") {
    return "Поточне життя ще не має засновницького рівня. Золото не списано.";
  }
  if (result.state === "founder-cooldown") {
    return `Новий статут можна підтвердити за <b>${formatRemaining(result.availableAt, result.now)}</b>. Золото не списано.`;
  }
  return "Чернетка не знайшлася або вже втратила чинність.";
}

export function presentGuildInviteOptIn(
  result: GuildInviteOptInRepositoryResult | { state: "disabled" },
  now: Date
): string {
  if (result.state === "disabled") {
    return "Нові ґільдійні запрошення зараз зачинені.";
  }
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start.";
  }
  return [
    "✉️ <b>Особистий код запрошення</b>",
    "",
    `<code>${escapeHtml(result.token)}</code>`,
    `Код чинний ще <b>${formatRemaining(result.expiresAt, now)}</b>. Передайте його лише тому, від кого хочете отримати запрошення.`,
    "Новий код одразу скасує попередній; місце, час появи й Telegram-дані він не розкриває."
  ].join("\n");
}

export function presentGuildInviteCreate(
  result: GuildInviteCreateRepositoryResult | { state: "disabled" },
  now: Date,
  deliveryConfirmed: boolean | null = null
): string {
  if (result.state === "created" || result.state === "replayed") {
    const delivery = result.state === "replayed"
      ? "Запрошення вже чекало й не розмножилося; адресат може відновити його через /guild."
      : deliveryConfirmed === false
        ? "Запрошення збережено, але Telegram не підтвердив доставку. Адресат може відновити його через /guild."
        : "Запрошення збережено й передано приватно.";
    return `✉️ ${escapeHtml(result.invite.targetName)} має ${formatRemaining(result.invite.expiresAt, now)} на відповідь. ${delivery}`;
  }
  if (result.state === "rate-limited") {
    return `Писар просить не засипати стіл печатками. Наступне запрошення — за <b>${formatRemaining(result.availableAt, result.now)}</b>.`;
  }
  if (result.state === "too-many-incoming") {
    return `В адресата вже три живі ґільдійні запрошення. Спробуйте знову за <b>${formatRemaining(result.availableAt, result.now)}</b>.`;
  }
  if (result.state === "decline-cooldown") {
    return `Після відмови ця ґільдія не надсилає нове запрошення сім днів. Лишилося <b>${formatRemaining(result.availableAt, result.now)}</b>.`;
  }
  const text: Record<string, string> = {
    disabled: "Нові ґільдійні запрошення зараз зачинені.",
    "no-character": "Спершу створіть пригодника через /start.",
    "not-member": "Спершу треба належати до ґільдії.",
    forbidden: "Запрошувати можуть голова або старшина.",
    "target-unavailable": "Цей код не можна використати. Він міг сплинути, змінитися або вже не підходити для вступу.",
    "guild-full": "У статуті вже вісім чинних учасників."
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
    declined: "Запрошення відхилено. Ця ґільдія не турбуватиме новим сім днів.",
    cancelled: "Запрошення скасовано.",
    expired: "Строк запрошення минув. Нове матиме новий строк.",
    "already-in-guild": "Ви вже належите до ґільдії.",
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
  if (result.state === "transfer-offered") {
    return `${result.guild.crest} Провід запропоновано. Чинна голова не зміниться, доки номінований учасник не прийме пропозицію.`;
  }
  if (result.state === "left") {
    return `Ви вийшли з <b>${escapeHtml(result.guildName)}</b>. Окрема ватага чи битва лишилася без змін.`;
  }
  if (result.state === "deleted") {
    return `<b>${escapeHtml(result.guildName)}</b> розпущено. Жодна окрема ватага чи битва від цього не зникла.`;
  }
  const text: Record<string, string> = {
    "no-character": "Спершу створіть пригодника через /start.",
    "not-member": "Ви вже не належите до цієї ґільдії.",
    "not-found": "Учасник або ґільдія не знайшлися.",
    forbidden: "Для цієї зміни бракує ґільдійної ролі або чинної пропозиції.",
    stale: "Статут уже змінився. Відкрийте /guild і повторіть дію з нового стану.",
    "invalid-target": "Цю роль або дію не можна застосувати до вибраного учасника.",
    "officer-cap": "У ґільдії вже двоє старшин. Спершу змініть одну з чинних ролей.",
    "leader-needs-successor": "Голова не може вийти, доки інший учасник не прийме запропонований провід.",
    "guild-not-sole": "Розпуск можливий лише тоді, коли голова лишається єдиним чинним учасником."
  };
  return text[result.state] ?? "Зміна не записалася.";
}

export function presentGuildProfileUpdate(result: GuildProfileUpdateResult): string {
  if (result.state === "disabled") {
    return "Зміни ґільдійного профілю зараз зачинені. Чинний запис доступний через /guild.";
  }
  if (result.state === "invalid") {
    return result.reason === "crest"
      ? "Оберіть герб із каталогу тринадцяти: 🛡️ ⚔️ 🏰 🐉 🦉 🦊 🐺 🐸 🦄 🔥 🌙 🍄 🥨."
      : "Опис має бути без керівних знаків і не довший за 93 символи.";
  }
  return presentGuildMemberMutation(result);
}

export function presentGuildMemberConfirmation(
  action: "transfer" | "promote" | "demote" | "kick",
  memberName: string
): string {
  const verbs = {
    transfer: "запропонувати провід",
    promote: "призначити старшиною",
    demote: "повернути до ролі учасника",
    kick: "виключити з ґільдії"
  } as const;
  return `Підтвердити: ${verbs[action]} <b>${escapeHtml(memberName)}</b>? Стан статуту буде перевірено ще раз.`;
}

export function presentGuildPrivateInvite(guildName: string, guildCrest: string, expiresAt: Date, now: Date): string {
  return [
    "✉️ <b>Запрошення до ґільдії</b>",
    "",
    `${guildCrest} <b>${escapeHtml(guildName)}</b> кличе поставити підпис у статуті. Вступ безкоштовний і не має рівневого порога.`,
    `На відповідь: <b>${formatRemaining(expiresAt, now)}</b>.`,
    "Картка не показує місце, час появи чи Telegram-дані учасників."
  ].join("\n");
}

export function presentGuildPartyPicker(result: GuildPartyPickerResult): string {
  if (result.state === "disabled") {
    return "Нові ґільдійні запрошення до ватаги зараз зачинені.";
  }
  if (result.state === "no-party" || result.state === "not-party-leader") {
    return "Спершу відкрийте справжній збір ватаги зі спільної пригоди. Ґільдія не створює окрему ватагу.";
  }
  if (result.state === "party-ineligible") {
    return "Цей збір уже не приймає учасників або не належить до чинної спільної пригоди.";
  }
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start.";
  }
  if (result.state === "not-member") {
    return "Спершу треба належати до активної ґільдії.";
  }
  if (result.state === "stale") {
    return "Склад або ватага вже змінилися. Відкрийте картку знову.";
  }
  if (result.state !== "ready") {
    return "Ґільдійний список для цієї ватаги недоступний.";
  }
  return [
    "✉️ <b>Запросити з ґільдії</b>",
    "",
    ...(result.candidates.length > 0
      ? ["Оберіть учасника для звичайного приватного запрошення:"]
      : ["На цій сторінці немає вільних чинних учасників."]),
    "Вступ і запуск перевіряє звичайний договір ватаги; неучасники ґільдії й далі можуть долучатися звичними шляхами."
  ].join("\n");
}

function invalidIdentityText(reason: Extract<GuildCreationPreviewResult, { state: "invalid" }>["reason"]): string {
  const text = {
    "name-length": "Назва має містити від 3 до 32 видимих знаків.",
    "name-reserved": "Цю назву береже канцелярія Квестарні. Оберіть іншу.",
    "name-unsafe": "Назва містить службові, небезпечні або змішані схожі знаки.",
    crest: "Оберіть один герб із канонічного набору: 🛡️ ⚔️ 🏰 🐉 🦉 🦊 🐺 🐸 🦄 🔥 🌙 🍄 🥨.",
    "description-length": "Опис має вміститися у 93 видимі знаки.",
    "description-unsafe": "Опис містить службові або небезпечні знаки."
  } as const;
  return text[reason];
}

function managementHints(role: GuildRole): string[] {
  const common = ["Ватага: /guild_party", "Код для запрошення вас: /guild_invite_code"];
  if (role === "member") {
    return [...common, "Вихід: /guild_leave"];
  }
  const officer = ["Запросити: /guild_invite КОД"];
  return role === "leader"
    ? [...common, ...officer, "Профіль: /guild_edit ГЕРБ | опис", "Ролі: /guild_promote, /guild_demote, /guild_transfer, /guild_kick"]
    : [...common, ...officer, "Вихід: /guild_leave"];
}

function roleLabel(role: GuildRole): string {
  return role === "leader" ? "голова" : role === "officer" ? "старшина" : "учасник";
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
  if (hours < 48) {
    return `${hours} год`;
  }
  return `${Math.ceil(hours / 24)} дн`;
}
