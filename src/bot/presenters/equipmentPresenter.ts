import { items } from "../../content";
import type { ItemContent } from "../../content/schema";
import type { InventoryResult, InventoryItemSummary } from "../../services/inventoryService";
import { escapeHtml } from "./telegramHtml";
import { isPreviewEquippable } from "./itemDetailPresenter";

type EquipmentSlot = "weapon" | "head" | "chest" | "legs" | "accessory";

interface SlotView {
  id: EquipmentSlot;
  icon: string;
  label: string;
}

const equipmentSlots: readonly SlotView[] = [
  { id: "weapon", icon: "🗡️", label: "Зброя" },
  { id: "head", icon: "🎩", label: "Голова" },
  { id: "chest", icon: "🧥", label: "Тулуб" },
  { id: "legs", icon: "🥾", label: "Ноги" },
  { id: "accessory", icon: "💍", label: "Аксесуар" }
];

export function presentEquipmentPreview(result: InventoryResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть героя через /start. Гачки не мають на кого дивитися.";
  }

  const ownedItems = result.state === "found" ? result.items : [];
  return [
    "🧥 <b>Спорядження</b>",
    "",
    "Корчма вже повісила гачки, але ще не навчилась рахувати бонуси.",
    "<i>Це поки вітрина: HP, мана, бій і нагороди не змінюються.</i>",
    "",
    ...equipmentSlots.map((slot) => presentEquipmentSlot(slot, ownedItems)),
    "",
    "<i>Справжнє вдягання прийде пізніше, коли бухгалтерія перестане боятися пательні.</i>"
  ].join("\n");
}

function presentEquipmentSlot(slot: SlotView, ownedItems: InventoryItemSummary[]): string {
  const owned = ownedItems.find((item) => mapsToEquipmentSlot(item.content, slot.id));

  if (owned) {
    return `${slot.icon} <b>${slot.label}</b>: ${escapeHtml(owned.content.name)}`;
  }

  const example = items.find((item) => isPreviewEquippable(item) && mapsToEquipmentSlot(item, slot.id));

  if (example) {
    return `${slot.icon} <b>${slot.label}</b>: <i>${escapeHtml(example.name)} — приклад, ще не у торбі.</i>`;
  }

  return `${slot.icon} <b>${slot.label}</b>: <i>гачок чекає майбутню манатку.</i>`;
}

function mapsToEquipmentSlot(item: ItemContent, slot: EquipmentSlot): boolean {
  if (slot === "weapon") {
    return item.slot === "weapon";
  }

  if (slot === "chest") {
    return item.slot === "armor";
  }

  if (slot === "accessory") {
    return item.slot === "accessory";
  }

  return false;
}
