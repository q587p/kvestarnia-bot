import type {
  EquipmentResult,
  EquipmentSlot,
  EquipmentSlotSummary,
  EquipItemResult,
  UnequipSlotResult
} from "../../services/equipmentService";
import { escapeHtml } from "./telegramHtml";

interface SlotView {
  id: EquipmentSlot;
  icon: string;
  label: string;
  emptyText: string;
}

const equipmentSlots: readonly SlotView[] = [
  { id: "weapon", icon: "🗡️", label: "Зброя", emptyText: "гачок чекає важкий аргумент." },
  { id: "chest", icon: "🧥", label: "Тулуб", emptyText: "манекен мерзне професійно." },
  { id: "accessory", icon: "💍", label: "Аксесуар", emptyText: "малий гачок чекає велику дивину." }
];

export function presentEquipment(result: EquipmentResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть героя через /start. Гачки не мають на кого дивитися.";
  }

  return [
    "🧥 <b>Спорядження</b>",
    "",
    "Корчма вже запамʼятовує, що висить на герої.",
    "",
    "<i>Бонуси спорядження ще не рахуються.</i>",
    "<i>HP, мана, бій і нагороди не змінюються.</i>",
    "",
    ...equipmentSlots.map((slot) => presentEquipmentSlot(slot, result.slots)),
    "",
    "<i>Зараз це чесна примірка без циферок. Бухгалтерія ще точить олівець.</i>"
  ].join("\n");
}

export function presentEquipItemResult(result: EquipItemResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть героя через /start. Манекен не працює з порожнечею.";
  }

  if (result.state === "not-owned") {
    return "Цієї манатки немає в торбі. Корчма не вдягає легенди з чужих кишень.";
  }

  if (result.state === "not-equippable") {
    return "Це радше трофей, ніж спорядження. Гачок подивився й чемно відмовився.";
  }

  if (result.state === "unsupported-slot") {
    return "Для цієї манатки ще немає гачка. Корчмар записав борг у майбутню шафу.";
  }

  return `Екіпіровано: ${escapeHtml(result.item.content.name)}. Бонуси ще не рахуються.`;
}

export function presentUnequipSlotResult(result: UnequipSlotResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть героя через /start. Знімати поки ні з кого.";
  }

  const label = presentEquipmentSlotLabel(result.slot);

  if (result.state === "empty-slot") {
    return `${label} і так порожній. Гачок вдячний за увагу.`;
  }

  return `${label} звільнено. Манатка лишилася в торбі, просто перестала позувати.`;
}

export function presentEquipmentSlotLabel(slot: EquipmentSlot): string {
  return equipmentSlots.find((view) => view.id === slot)?.label ?? slot;
}

function presentEquipmentSlot(slot: SlotView, slots: EquipmentSlotSummary[]): string {
  const equipped = slots.find((candidate) => candidate.slot === slot.id)?.item;

  if (equipped) {
    return `${slot.icon} <b>${slot.label}</b>: ${escapeHtml(equipped.content.name)}`;
  }

  return `${slot.icon} <b>${slot.label}</b>: <i>${slot.emptyText}</i>`;
}
