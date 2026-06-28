import type {
  ItemGiftCandidatesResult,
  ItemGiftCreateResult,
  ItemGiftRespondResult,
  ItemGiftSelectionResult
} from "../../services/itemTransferService";
import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml } from "./telegramHtml";

export function presentItemGiftCandidates(result: ItemGiftCandidatesResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Дарувати манатку без пригодника — це просто кинути її в туман.";
  }

  if (result.total === 0) {
    return [
      "🎁 <b>Подарувати манатку</b>",
      "",
      "Активних пригодників поруч зараз немає. Корчмар не бере подарунки «передайте комусь, хто був тут учора»."
    ].join("\n");
  }

  const lines = [
    "🎁 <b>Подарувати манатку</b>",
    "",
    "Оберіть активного пригодника поруч:",
    "",
    ...result.visible.map((person) => `— ${presentCharacterDisplayName(person, { boldName: false })}${person.level ? ` · рівень ${person.level}` : ""}`)
  ];

  if (result.totalPages > 1) {
    lines.push("", `Сторінка ${result.page + 1}/${result.totalPages}`);
  }

  return lines.join("\n");
}

export function presentItemGiftSelection(result: ItemGiftSelectionResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Корчмар не відкриває дарчий журнал для туману.";
  }

  if (result.state === "target-not-found") {
    return "🎁 Пригодник уже не стоїть активним поруч. Оновіть список, бо корчемна географія має ноги.";
  }

  if (result.state === "no-items") {
    return [
      "🎁 <b>Немає придатної манатки</b>",
      "",
      `Кому: ${presentCharacterDisplayName(result.target)}`,
      "",
      "Можна дарувати тільки одну звичайну, не вдягнену й не зарезервовану манатку."
    ].join("\n");
  }

  const lines = [
    "🎁 <b>Що подарувати?</b>",
    "",
    `Кому: ${presentCharacterDisplayName(result.target)}`,
    "",
    "Подарунок — це не обмін. Отримувач має явно погодитись.",
    "",
    ...result.items.map((item) => `— ${escapeHtml(item.content.name)} · є ${item.quantity}`)
  ];

  if (result.pageCount > 1) {
    lines.push("", `Сторінка ${result.page + 1}/${result.pageCount}`);
  }

  return lines.join("\n");
}

export function presentItemGiftCreate(result: ItemGiftCreateResult): string {
  if (result.state === "created") {
    return [
      "🎁 <b>Подарунок запропоновано</b>",
      "",
      `Кому: <b>${escapeHtml(result.receiver.name)}</b>`,
      `Манатка: <b>${escapeHtml(result.transfer.itemName)}</b> ×1`,
      "",
      "Манатка зарезервована до відповіді, скасування або завершення строку."
    ].join("\n");
  }

  return presentGiftFailure(result.state);
}

export function presentItemGiftNotification(result: Extract<ItemGiftCreateResult, { state: "created" }>): string {
  return [
    "🎁 <b>Вам пропонують подарунок</b>",
    "",
    `Від: <b>${escapeHtml(result.sender.name)}</b> · рівень ${result.sender.level}`,
    `Манатка: <b>${escapeHtml(result.transfer.itemName)}</b> ×1`,
    "",
    "Це подарунок, не обмін. Золото, ставки й борги не додаються."
  ].join("\n");
}

export function presentItemGiftRespond(result: ItemGiftRespondResult): string {
  if (result.state === "completed" || result.state === "replayed") {
    return [
      result.state === "completed" ? "🎁 <b>Подарунок прийнято</b>" : "🎁 <b>Подарунок уже записано</b>",
      "",
      `Від: <b>${escapeHtml(result.transfer.senderName)}</b>`,
      `Кому: <b>${escapeHtml(result.transfer.receiverName)}</b>`,
      `Манатка: <b>${escapeHtml(result.transfer.itemName)}</b> ×1`
    ].join("\n");
  }

  if (result.state === "declined") {
    return terminalGift("🎁 <b>Подарунок відхилено</b>", result.transfer);
  }

  if (result.state === "cancelled") {
    return terminalGift("🎁 <b>Подарунок скасовано</b>", result.transfer);
  }

  if (result.state === "expired") {
    return terminalGift("🎁 <b>Подарунок протерміновано</b>", result.transfer);
  }

  if ("transfer" in result) {
    return terminalGift(presentGiftFailure(result.state), result.transfer);
  }

  return presentGiftFailure(result.state);
}

function terminalGift(title: string, transfer: { senderName: string; receiverName: string; itemName: string }): string {
  return [
    title,
    "",
    `Від: <b>${escapeHtml(transfer.senderName)}</b>`,
    `Кому: <b>${escapeHtml(transfer.receiverName)}</b>`,
    `Манатка: <b>${escapeHtml(transfer.itemName)}</b> ×1`
  ].join("\n");
}

function presentGiftFailure(state: string): string {
  switch (state) {
    case "target-not-found":
    case "location-mismatch":
      return "🎁 Подарунок не дійшов: треба бути активними поруч.";
    case "combat-locked":
      return "🎁 Поки хтось у бою, Корчмар не переносить манатки між кишенями.";
    case "stale-selection":
    case "no-items":
      return "🎁 Манатка вже не придатна для подарунка. Оновіть список.";
    case "self-gift":
      return "🎁 Дарувати самому собі можна моральну підтримку. Манатку — ні.";
    case "not-recipient":
      return "🎁 Цей подарунок адресований не вам.";
    case "not-sender":
      return "🎁 Скасувати подарунок може тільки дарувальник.";
    case "no-character":
      return "Спершу створіть пригодника через /start.";
    default:
      return "🎁 Квестарня не знайшла цей подарунок або він уже став легендою бухгалтерії.";
  }
}
