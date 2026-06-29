import type {
  ItemGiftRespondResult,
  ItemPostalConfirmServiceResult,
  ItemPostalCreateDraftResult,
  ItemPostalDraftViewResult,
  ItemPostalEditResult,
  ItemPostalRecipientsListResult
} from "../../services/itemTransferService";
import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml } from "./telegramHtml";

export function presentItemPostalRecipients(result: ItemPostalRecipientsListResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Пошта не носить туман туманові.";
  }
  if (result.total === 0) {
    return [
      "📮 <b>Пошта Квестарні</b>",
      "",
      "Поки немає знайомих отримувачів. Пошта показує лише тих, із ким у вас уже була явна соціяльна дія: передача манатки, дуель або реакція на виступ."
    ].join("\n");
  }

  const lines = [
    "📮 <b>Пошта Квестарні</b>",
    "",
    "Кому надіслати пакунок:",
    "",
    ...result.visible.map((recipient) => `— ${presentCharacterDisplayName(recipient, { boldName: false })} · рівень ${recipient.level}`)
  ];
  if (result.totalPages > 1) {
    lines.push("", `Сторінка ${result.page + 1}/${result.totalPages}`);
  }

  return lines.join("\n");
}

export function presentItemPostalDraft(result: ItemPostalDraftViewResult | ItemPostalCreateDraftResult | ItemPostalEditResult): string {
  if (result.state !== "draft") {
    return presentPostalFailure(result.state, "transfer" in result ? result.transfer : undefined);
  }

  const packageLines = result.packageLines.length > 0
    ? result.packageLines.map((line, index) => `${index + 1}. <b>${escapeHtml(line.itemName)}</b> ×${line.quantity}`)
    : ["Пакунок порожній. Додайте від 1 до 5 типів манатки."];
  const itemLines = result.items.map((item) => `— ${escapeHtml(item.content.name)} · є ${item.quantity}`);

  const lines = [
    "📮 <b>Пошта Квестарні</b>",
    "",
    `Кому: <b>${escapeHtml(result.transfer.receiverName)}</b>`,
    "",
    "Пакунок:",
    ...packageLines,
    "",
    `Плата за дорогу: <b>${result.deliveryFeeGold} золота</b>`,
    `Строк: до <b>${formatPostalExpiry(result.transfer.expiresAt)}</b> за Києвом.`,
    "Отримувач має явно прийняти пакунок. Золото не переходить іншому гравцеві.",
    "",
    "Додати манатку:",
    ...itemLines
  ];
  if (result.pageCount > 1) {
    lines.push("", `Сторінка ${result.page + 1}/${result.pageCount}`);
  }

  return lines.join("\n");
}

export function presentItemPostalConfirm(result: ItemPostalConfirmServiceResult): string {
  if (result.state !== "created") {
    return presentPostalFailure(result.state, "transfer" in result ? result.transfer : undefined);
  }

  return [
    "📮 <b>Пакунок передано гінцеві</b>",
    "",
    `Кому: <b>${escapeHtml(result.receiver.name)}</b>`,
    ...presentPackageLines(result.transfer),
    "",
    `Плата при прийнятті: <b>${result.transfer.deliveryFeeGold} золота</b>`,
    `Строк: до <b>${formatPostalExpiry(result.transfer.expiresAt)}</b> за Києвом.`,
    "Манатки зарезервовані до відповіді, скасування або завершення строку."
  ].join("\n");
}

export function presentItemPostalNotification(result: Extract<ItemPostalConfirmServiceResult, { state: "created" }>): string {
  return [
    "📮 <b>Вам прийшов пакунок</b>",
    "",
    `Від: <b>${escapeHtml(result.sender.name)}</b> · рівень ${result.sender.level}`,
    ...presentPackageLines(result.transfer),
    "",
    `Строк: до <b>${formatPostalExpiry(result.transfer.expiresAt)}</b> за Києвом.`,
    "Це доставка, не продаж. Прийміть явно або відхиліть."
  ].join("\n");
}

export function presentItemPostalRespond(result: ItemGiftRespondResult): string {
  if (result.state === "completed" || result.state === "replayed") {
    return [
      result.state === "completed" ? "📮 <b>Пакунок прийнято</b>" : "📮 <b>Пакунок уже записано</b>",
      "",
      `Від: <b>${escapeHtml(result.transfer.senderName)}</b>`,
      `Кому: <b>${escapeHtml(result.transfer.receiverName)}</b>`,
      ...presentPackageLines(result.transfer),
      "",
      `Плата: <b>${result.transfer.deliveryFeeGold} золота</b>`
    ].join("\n");
  }

  if (result.state === "declined") {
    return terminalPostal("📮 <b>Пакунок відхилено</b>", result.transfer);
  }
  if (result.state === "cancelled") {
    return terminalPostal("📮 <b>Пакунок скасовано</b>", result.transfer);
  }
  if (result.state === "expired") {
    return terminalPostal("📮 <b>Пакунок протерміновано</b>", result.transfer);
  }
  if ("transfer" in result) {
    return presentPostalFailure(result.state, result.transfer);
  }

  return presentPostalFailure(result.state);
}

function terminalPostal(title: string, transfer: { senderName: string; receiverName: string; packageLines: Array<{ itemName: string; quantity: number }> }): string {
  return [
    title,
    "",
    `Від: <b>${escapeHtml(transfer.senderName)}</b>`,
    `Кому: <b>${escapeHtml(transfer.receiverName)}</b>`,
    ...presentPackageLines(transfer)
  ].join("\n");
}

function presentPackageLines(transfer: { packageLines: Array<{ itemName: string; quantity: number }> }): string[] {
  return transfer.packageLines.map((line) => `Манатка: <b>${escapeHtml(line.itemName)}</b> ×${line.quantity}`);
}

function formatPostalExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(expiresAt);
}

function presentPostalFailure(state: string, transfer?: { deliveryFeeGold?: number }): string {
  switch (state) {
    case "target-not-found":
      return "📮 Пошта знає тільки пригодників із попередньою прийнятою передачею манатки.";
    case "package-full":
      return "📮 У пакунок влазить до 5 різних типів манатки.";
    case "duplicate-item":
      return "📮 Цей тип манатки вже є в пакунку. Змініть кількість у рядку.";
    case "invalid-quantity":
      return "📮 Кількість має бути від 1 до 93 для кожного типу.";
    case "insufficient-gold":
      return `📮 У відправника бракує золота на дорогу${transfer?.deliveryFeeGold ? `: потрібно ${transfer.deliveryFeeGold}` : ""}. Манатки не рухались.`;
    case "combat-locked":
      return "📮 Поки хтось у бою, гонець удає статую.";
    case "stale-selection":
    case "no-items":
      return "📮 Пакунок застарів: манатка вже не придатна або зарезервована.";
    case "self-gift":
      return "📮 Надіслати пакунок самому собі можна, але гонець просить не знущатися.";
    case "not-recipient":
      return "📮 Цей пакунок адресований не вам.";
    case "not-sender":
      return "📮 Цей пакунок може змінювати тільки відправник.";
    case "no-character":
      return "Спершу створіть пригодника через /start.";
    default:
      return "📮 Пошта не знайшла цей пакунок або вже віддала його в легенди.";
  }
}
