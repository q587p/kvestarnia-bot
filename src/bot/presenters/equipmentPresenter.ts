import type {
  EquipmentResult,
  EquipmentSlot,
  EquipmentSlotSummary,
  EquipItemResult,
  UnequipSlotResult
} from "../../services/equipmentService";
import { presentItemEffect } from "./itemEffectPresenter";
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
    return "Спершу створіть пригодника через /start. Гачки не мають на кого дивитися.";
  }

  return [
    "🧥 <b>Спорядження</b>",
    "",
    "Корчма вже запамʼятовує, що висить на пригоднику.",
    "",
    "<i>Манатки нарешті штовхають циферки. Корчма робить вигляд, що так і планувала.</i>",
    "",
    ...intersperseBlankLines(equipmentSlots.map((slot) => presentEquipmentSlot(slot, result.slots)))
  ].join("\n");
}

export function presentEquipItemResult(result: EquipItemResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Манекен не працює з порожнечею.";
  }

  if (result.state === "not-owned") {
    return "Цієї манатки немає в торбі. Корчма не вдягає легенди з чужих кишень.";
  }

  if (result.state === "not-equippable") {
    return "Це радше трофей, ніж спорядження. Гачок подивився й чемно відмовився.";
  }

  if (result.state === "requirements-not-met") {
    return [
      `Манатка <b>${escapeHtml(result.item.content.name)}</b> просить іншу анкету пригодника.`,
      "Корчмар каже: «Можна носити гордо, але екіпірувати за правилами поки не виходить»."
    ].join("\n\n");
  }

  if (result.state === "unsupported-slot") {
    return "Для цієї манатки ще немає гачка. Корчмар записав борг у майбутню шафу.";
  }

  const effect = presentItemEffect(result.item.content.effect);
  const effectText = effect ? ` Ефект: ${effect}.` : " Бойового ефекту не виявлено.";

  return `Екіпіровано: ${escapeHtml(result.item.content.name)}.${effectText}`;
}

export function presentUnequipSlotResult(result: UnequipSlotResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Знімати поки ні з кого.";
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
    const effect = presentItemEffect(equipped.content.effect);

    return [
      `${slot.icon} <b>${slot.label}</b>: ${escapeHtml(equipped.content.name)}`,
      `Ефект: <i>${effect ?? "бойового ефекту не виявлено"}</i>`
    ].join("\n");
  }

  return `${slot.icon} <b>${slot.label}</b>: <i>${slot.emptyText}</i>`;
}

function intersperseBlankLines(lines: string[]): string[] {
  return lines.flatMap((line, index) => (index === 0 ? [line] : ["", line]));
}
