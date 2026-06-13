import type { ItemContent } from "../../content/schema";
import type {
  InventoryItemDetailResult,
  InventoryItemSummary
} from "../../services/inventoryService";
import { escapeHtml } from "./telegramHtml";

export function presentItemDetail(result: InventoryItemDetailResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть героя через /start. Манатки не довіряють порожнім торбам.";
  }

  if (result.state === "not-owned") {
    return "Такої манатки в торбі не знайшлося. Можливо, вона сама себе проінспектувала.";
  }

  return presentOwnedItemDetail(result.item);
}

export function presentOwnedItemDetail(item: InventoryItemSummary): string {
  const content = item.content;
  const equippable = isPreviewEquippable(content);
  const quantity = Math.max(1, Math.floor(item.quantity));
  return [
    `🔎 <b>${escapeHtml(content.name)}</b>`,
    "",
    `Рідкість: <b>${presentRarity(content.rarity)}</b>`,
    `Категорія: <b>${presentItemSlot(content.slot)}</b>`,
    `Вартість: ${presentItemValue(content)}`,
    `Кількість: <b>${quantity}</b>`,
    "",
    `<i>${escapeHtml(content.description)}</i>`,
    "",
    equippable
      ? "Екіпірування: <i>можна буде приміряти, але бонуси поки лежать у бухгалтерії.</i>"
      : "Екіпірування: <i>не вдягається. Корчма визнала це смішним трофеєм.</i>",
    "",
    presentItemFlavor(content)
  ].join("\n");
}

export function isPreviewEquippable(item: ItemContent): boolean {
  return item.slot === "weapon" || item.slot === "armor" || item.slot === "accessory";
}

export function presentRarity(rarity: ItemContent["rarity"]): string {
  const labels: Record<ItemContent["rarity"], string> = {
    common: "звичайна",
    uncommon: "незвична",
    rare: "рідкісна",
    epic: "епічна"
  };

  return labels[rarity];
}

export function presentItemSlot(slot: ItemContent["slot"]): string {
  const labels: Record<ItemContent["slot"], string> = {
    weapon: "зброя",
    armor: "обладунок",
    accessory: "аксесуар",
    consumable: "витратна манатка",
    cosmetic: "косметика",
    junk: "трофей / смішний доказ"
  };

  return labels[slot];
}

export function presentItemValue(item: ItemContent): string {
  if (item.priceless) {
    return "<i>безцінна</i>";
  }

  const value = Math.max(0, Math.floor(item.goldValue ?? 0));

  return `<b>${value} золота</b>`;
}

function presentItemFlavor(item: ItemContent): string {
  if (item.slot === "weapon") {
    return "<i>Гачок для зброї схвально скрипить. Він давно чекав аргумент із ручкою.</i>";
  }

  if (item.slot === "junk") {
    return "<i>Корчмар записав це в журнал як «важливо, але не чіпати голими руками».</i>";
  }

  return "<i>Манатка поводиться так, ніби вже прочитала правила майбутнього спорядження.</i>";
}
