import type {
  ItemUpgradeAttemptServiceResult,
  ItemUpgradeCreateOrderResult,
  ItemUpgradeListResult,
  ItemUpgradePreviewResult
} from "../../services/itemUpgradeService";
import { items } from "../../content";
import { getItemDisplayNameWithEnhancement } from "../../domain/itemUpgrades";
import { escapeHtml } from "./telegramHtml";

export function presentItemUpgradeMenu(result: ItemUpgradeListResult): string {
  if (result.state === "no-character") {
    return "🔧 Чароковальня\n\nСпершу створіть персонажа через /start. Коваль уже гріє пафос, але без пригодника це просто шум.";
  }

  const lines = [
    "🔧 Чароковальня",
    "",
    "Плюсослав Чароковаль бере манатки, Іскрокамені й оплату за звук «клац». Поломок, знищення й пониження тут не практикують: для цього є життя.",
    "",
    `Іскрокамені: <b>${result.iskrokamin}</b>`,
    result.canUseSparkTemper
      ? "Класова дія: доступний <i>Іскровий підкрут</i> за ману."
      : "Класова дія: <i>Іскровий підкрут</i> доступний лише магічним рукам.",
    ""
  ];

  if (result.items.length === 0) {
    lines.push("Немає манаток, які зараз можна підсилити.");
  } else {
    lines.push("Що кладемо на ковадло?");
  }

  if (result.orders.length > 0) {
    lines.push("", "Активні замовлення:");
    for (const order of result.orders.slice(0, 3)) {
      lines.push(`• ${escapeHtml(formatUpgradeItemName(order.itemId, order.fromLevel))} → +${order.targetLevel}: ${formatOrderStatus(order)}`);
    }
  }

  return lines.join("\n");
}

export function presentItemUpgradePreview(result: ItemUpgradePreviewResult): string {
  switch (result.state) {
    case "no-character":
      return "🔧 Чароковальня\n\nСпершу створіть персонажа через /start.";
    case "not-owned":
      return "🔧 Чароковальня\n\nЦієї манатки вже немає в торбі. Плюсослав підозрює драматичний монтаж.";
    case "not-upgradeable":
      return "🔧 Чароковальня\n\nЦю річ не можна підсилити: вона або не спорядження, або вже надто впевнена в собі.";
    case "cap-reached":
      return `🔧 Чароковальня\n\n<b>${escapeHtml(result.item.name)}</b> уже на межі +5. Далі ковадло просить профспілку.`;
    case "ready":
      break;
  }

  const target = result.item.targetLevel ?? result.item.enhancementLevel + 1;
  const methodLabel = result.method === "self" ? "Іскровий підкрут" : "Плюсослав";
  const orderLine = result.requiresOrder
    ? result.order
      ? `Замовлення: ${formatOrderStatus(result.order)}`
      : "Замовлення: треба оформити й закріпити боями."
    : "Замовлення: не потрібне для +1.";

  return [
    "🔧 Чароковальня",
    "",
    `<b>${escapeHtml(result.item.name)}</b> → <b>+${target}</b>`,
    result.item.equipped ? "<i>Зараз екіпіровано.</i>" : "<i>Зараз у торбі.</i>",
    result.item.primaryStat ? `Підсилення: +1 до ${escapeHtml(result.item.primaryStat)}.` : "Підсилення: ковадло ще радиться.",
    "",
    `Спосіб: <b>${methodLabel}</b>`,
    result.donor
      ? `Донор: <b>${escapeHtml(result.donor.name)}</b> (+${result.donor.chanceBonus}% шанс, -${result.donor.iskrokaminDiscount} Іскрокамінь).`
      : result.donorOptions.length > 0
        ? "Донор: можна додати сумісну манатку кнопкою нижче."
        : "Донор: сумісних манаток немає.",
    `Ціна: ${result.costs.gold} золота · ${result.costs.iskrokamin} Іскрокамінь · ${result.costs.mana} мани`,
    `Шанс: <b>${result.chance.guaranteed ? "гарантовано" : `${Math.round(result.chance.finalChance)}%`}</b>`,
    orderLine
  ].join("\n");
}

export function presentItemUpgradeOrderResult(result: ItemUpgradeCreateOrderResult): string {
  switch (result.state) {
    case "created":
      return [
        "🔧 Замовлення прийнято",
        "",
        `<b>${escapeHtml(formatUpgradeItemName(result.item.itemId, result.item.enhancementLevel))}</b> чекає черги в Плюсослава.`,
        `Поступ: ${result.order.progressFightCount}/${result.order.requiredFightCount} боїв.`,
        "",
        "Після потрібних перемог поверніться й натисніть спробу."
      ].join("\n");
    case "no-character":
      return "🔧 Чароковальня\n\nСпершу створіть персонажа через /start.";
    case "not-owned":
      return "🔧 Чароковальня\n\nМанатка вже не у вас.";
    case "not-upgradeable":
      return "🔧 Чароковальня\n\nЦю річ не можна підсилити.";
    case "cap-reached":
      return "🔧 Чароковальня\n\nЦя річ уже на максимумі.";
    case "invalid-donor":
      return "🔧 Чароковальня\n\nДонор не підходить. Ковадло глянуло осудливо.";
  }
}

export function presentItemUpgradeAttemptResult(result: ItemUpgradeAttemptServiceResult): string {
  switch (result.state) {
    case "attempted":
      return [
        result.success ? "🔧 Підсилення вдалося" : "🔧 Підсилення не вдалося",
        "",
        result.success
          ? `<b>${escapeHtml(formatUpgradeItemName(result.item.itemId, result.targetLevel))}</b> отримала +${result.targetLevel}.`
          : `Манатка лишилася на +${result.fromLevel}. Нічого не зламалося, тільки Плюсослав зробив вигляд, що так і планував.`,
        `Витрачено: ${result.spent.gold} золота · ${result.spent.iskrokamin} Іскрокамінь · ${result.spent.mana} мани`,
        result.success ? "" : `Жаль-лічильник: ${result.pityFailuresAfter}.`
      ].filter(Boolean).join("\n");
    case "stale-item-level":
      return "🔧 Чароковальня\n\nЦя кнопка вже застаріла: рівень манатки змінився. Відкрийте Чароковальню ще раз.";
    case "order-required":
      return "🔧 Чароковальня\n\nДля цього рівня потрібне замовлення Плюсослава.";
    case "order-not-ready":
      return `🔧 Чароковальня\n\nЗамовлення ще гріється: ${result.order.progressFightCount}/${result.order.requiredFightCount} боїв.`;
    case "stale-order":
      return "🔧 Чароковальня\n\nЦе замовлення вже не чинне. Плюсослав перерахував папірці й підозрює час.";
    case "not-enough-gold":
      return `🔧 Чароковальня\n\nБракує золота: треба ${result.required}, є ${result.available}.`;
    case "not-enough-iskrokamin":
      return `🔧 Чароковальня\n\nБракує Іскрокаменів: треба ${result.required}, є ${result.available}.`;
    case "not-enough-mana":
      return `🔧 Чароковальня\n\nБракує мани: треба ${result.required}, є ${result.available}.`;
    case "class-not-allowed":
      return "🔧 Чароковальня\n\nІскровий підкрут слухається лише магічних класів.";
    case "invalid-donor":
      return "🔧 Чароковальня\n\nДонор не підходить.";
    case "cap-reached":
      return "🔧 Чароковальня\n\nЦя річ уже на максимумі.";
    case "not-owned":
      return "🔧 Чароковальня\n\nМанатка вже не у вас.";
    case "not-upgradeable":
      return "🔧 Чароковальня\n\nЦю річ не можна підсилити.";
    case "no-character":
      return "🔧 Чароковальня\n\nСпершу створіть персонажа через /start.";
  }
}

function formatOrderStatus(order: { status: string; progressFightCount: number; requiredFightCount: number }): string {
  if (order.status === "ready") {
    return "готове";
  }

  return `${order.progressFightCount}/${order.requiredFightCount}`;
}

function formatUpgradeItemName(itemId: string, enhancementLevel: number): string {
  const item = items.find((candidate) => candidate.id === itemId);
  return item ? getItemDisplayNameWithEnhancement(item, enhancementLevel) : itemId;
}
