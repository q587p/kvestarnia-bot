import type {
  PartyRaidChatAuthorizedView,
  PartyRaidChatEntryRecord
} from "../../db/repositories/partyRaidChatRepository";
import { escapeHtml } from "./telegramHtml";

export const TELEGRAM_MESSAGE_TEXT_LIMIT = 4096;

const kyivDateFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv",
  day: "2-digit",
  month: "2-digit"
});
const kyivTimeFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

export function presentPartyRaidChatSection(
  view: PartyRaidChatAuthorizedView,
  visibleEntries = view.entries
): string {
  const spansDates = new Set(visibleEntries.map((entry) => kyivDateFormatter.format(entry.occurredAt))).size > 1;
  const pruned = visibleEntries.length < view.entries.length;
  const header = pruned
    ? `💬 <b>Рейд-чат (останні ${visibleEntries.length} із 13):</b>`
    : "💬 <b>Рейд-чат (останні 13):</b>";
  if (visibleEntries.length === 0) {
    return `${header}\n• Поки тихо. Бочка ще думає, що це добрий знак.`;
  }

  return [
    header,
    ...visibleEntries.map((entry) => presentEntry(entry, spansDates))
  ].join("\n");
}

export function appendPartyRaidChatWithinBudget(
  baseText: string,
  view: PartyRaidChatAuthorizedView,
  separator = "\n\n"
): string {
  let entries = [...view.entries];
  let complete = `${baseText}${separator}${presentPartyRaidChatSection(view, entries)}`;
  while (complete.length > TELEGRAM_MESSAGE_TEXT_LIMIT && entries.length > 1) {
    entries = entries.slice(1);
    complete = `${baseText}${separator}${presentPartyRaidChatSection(view, entries)}`;
  }
  if (complete.length <= TELEGRAM_MESSAGE_TEXT_LIMIT) {
    return complete;
  }

  const fallback = `${baseText}${separator}💬 <b>Рейд-чат</b>\n• Відкрийте окрему картку чату.`;
  return fallback.length <= TELEGRAM_MESSAGE_TEXT_LIMIT
    ? fallback
    : "💬 <b>Рейд-чат</b>\n• Основна картка завелика. Відкрийте окрему картку чату.";
}

export function presentPartyRaidChatCard(view: PartyRaidChatAuthorizedView): string {
  const heading = view.lifecycle === "terminal"
    ? "💬 <b>Рейд-чат · запис завершено</b>"
    : "💬 <b>Рейд-чат</b>";
  const footer = view.writable
    ? "Домовляйтеся коротко: Бочка читає через плече й удає, що ні."
    : "Чат лишився для читання. Нові записи канцелярія вже не приймає.";
  return appendPartyRaidChatWithinBudget(
    `${heading}\n\n${footer}`,
    view
  );
}

export function presentPartyRaidChatComposerPrompt(): string {
  return [
    "💬 Напишіть коротке повідомлення для рейд-чату.",
    "До 93 символів. Його побачать учасники рейду.",
    "Скасувати: /cancel_raid_chat"
  ].join("\n");
}

export function presentPartyRaidChatInputError(
  reason: "empty" | "too-long" | "entity" | "attachment"
): string {
  if (reason === "empty") {
    return "Повідомлення порожнє. Бочка теж іноді мовчить, але форму все одно просить.";
  }
  if (reason === "too-long") {
    return "Повідомлення задовге. Треба вкластися у 93 символи.";
  }
  if (reason === "entity") {
    return "Посилання, адреси й згадки рейд-чат поки не приймає.";
  }
  return "Рейд-чат приймає лише короткий текст без вкладень і пересилань.";
}

function presentEntry(entry: PartyRaidChatEntryRecord, spansDates: boolean): string {
  const time = spansDates
    ? `${kyivDateFormatter.format(entry.occurredAt)} ${kyivTimeFormatter.format(entry.occurredAt)}`
    : kyivTimeFormatter.format(entry.occurredAt);
  if (entry.kind === "player") {
    return `• ${time} <b>${escapeHtml(entry.actorDisplayName ?? "Пригодник")}</b>: ${escapeHtml(entry.body ?? "")}`;
  }
  return `• ${time} — <i>${presentSystemEvent(entry)}</i>`;
}

export function presentPartyRaidChatPlayerNotification(input: {
  authorDisplayName: string;
  body: string;
}): string {
  return [
    `💬 <b>${escapeHtml(input.authorDisplayName)}</b> поспішає сказати:`,
    `<blockquote>${escapeHtml(input.body)}</blockquote>`
  ].join("\n");
}

function presentSystemEvent(entry: PartyRaidChatEntryRecord): string {
  const name = escapeHtml(entry.actorDisplayName ?? "Пригодник");
  switch (entry.eventType) {
    case "party.created":
      return `${name} відкриває збір до Старшого Брата Бочки.`;
    case "participant.joined":
      return `${name} приєднується до збору.`;
    case "participant.left":
      return `${name} виходить зі збору.`;
    case "participant.removed":
      return `${name} більше не в рейдовому записі.`;
    case "leader.transferred":
      return `Лідерство переходить до ${name}.`;
    case "ward.placed":
      return `${name} ставить знак характерника.`;
    case "ward.supported":
      return `${name} підпирає знак характерника.`;
    case "protocol.filed":
      return `${name} подає Форму 13-А й відкриває Протокол 13-З.`;
    case "protocol.signed":
      return `${name} підписує Протокол 13-З.`;
    case "raid.started":
      return "Рейд починається. Бочка вже все чує.";
    case "raid.music.started":
      return "Натхнення займає музичне місце рейду.";
    case "ability.taunt":
      return `${name} забирає увагу Бочки на себе.`;
    case "ability.lament":
      return `${name} заводить журливу баладу.`;
    case "ability.form-thirteen-b":
      return `${name} проводить Форму 13-Б через бойову канцелярію.`;
    case "ability.dangerous-couplet":
      return `${name} запускає небезпечний куплет.`;
    case "raid.won":
      return "Рейд переміг. Бочка подає апеляцію в піну.";
    case "raid.lost":
      return "Рейд програв. Бочка записала це дуже великими літерами.";
    case "raid.cancelled":
      return "Рейд скасовано. Запис лишається для учасників.";
    case "raid.expired":
      return "Строк збору завершився.";
    default:
      return "Рейдова канцелярія оновила запис.";
  }
}
