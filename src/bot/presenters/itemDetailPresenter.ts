import type { ItemContent } from "../../content/schema";
import type { EquipmentSlot } from "../../services/equipmentService";
import { isEquippableItem } from "../../services/equipmentService";
import type {
  InventoryItemDetailResult,
  InventoryItemSummary
} from "../../services/inventoryService";
import { presentEquipmentSlotLabel } from "./equipmentPresenter";
import { presentItemEffect } from "./itemEffectPresenter";
import { escapeHtml } from "./telegramHtml";

export interface ItemDetailOptions {
  equippedSlot?: EquipmentSlot | null;
}

export function presentItemDetail(
  result: InventoryItemDetailResult,
  options: ItemDetailOptions = {}
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Манатки не довіряють порожнім торбам.";
  }

  if (result.state === "not-owned") {
    return "Такої манатки в торбі не знайшлося. Можливо, вона сама себе проінспектувала.";
  }

  return presentOwnedItemDetail(result.item, options);
}

export function presentOwnedItemDetail(
  item: InventoryItemSummary,
  options: ItemDetailOptions = {}
): string {
  const content = item.content;
  const quantity = Math.max(1, Math.floor(item.quantity));
  const effectLine = presentItemEffectLine(content);

  return [
    `🔎 <b>${escapeHtml(content.name)}</b>`,
    "",
    `Рідкість: <b>${presentRarity(content.rarity)}</b>`,
    `Категорія: <b>${presentItemSlot(content.slot)}</b>`,
    `Вартість: ${presentItemValue(content)}`,
    `Кількість: <b>${quantity}</b>`,
    ...(effectLine ? [effectLine] : []),
    "",
    `<i>${escapeHtml(content.description)}</i>`,
    "",
    presentEquipmentLine(content, options.equippedSlot ?? null),
    "",
    presentItemFlavor(content)
  ].join("\n");
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

function presentEquipmentLine(item: ItemContent, equippedSlot: EquipmentSlot | null): string {
  if (!isEquippableItem(item)) {
    return "Екіпірування: <i>не вдягається. Корчма визнала це смішним трофеєм.</i>";
  }

  if (equippedSlot) {
    return `Екіпірування: <b>вдягнено — ${presentEquipmentSlotLabel(equippedSlot)}</b>.`;
  }

  return "Екіпірування: <i>можна екіпірувати. Гачок уже розминається.</i>";
}

function presentItemEffectLine(item: ItemContent): string | null {
  const effect = presentItemEffect(item.effect);

  if (effect) {
    return `Ефект: <b>${effect}</b>`;
  }

  if (!isEquippableItem(item)) {
    return null;
  }

  return "Бойовий ефект: <i>не виявлено, але вигляд має переконаний.</i>";
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

  if (item.slot === "armor") {
    return "<i>Манекен випростав плечі й удав, що це завжди був поважний салон спорядження.</i>";
  }

  if (item.slot === "accessory") {
    return "<i>Малий гачок обережно блищить. Так роблять аксесуари, коли хочуть до інвентаря без черги.</i>";
  }

  if (item.slot === "junk") {
    return "<i>Корчмар записав це в журнал як «важливо, але не чіпати голими руками».</i>";
  }

  return "<i>Корчмар крутить манатку в руках і ще думає, на який гачок її повісити.</i>";
}
