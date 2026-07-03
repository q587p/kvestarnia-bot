import type {
  EquipmentResult,
  EquipmentSlot,
  EquipmentSlotSummary,
  EquipItemResult,
  ItemEquipPreviewResult,
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

type EquipRequirementReason = Extract<
  EquipItemResult,
  { state: "requirements-not-met" }
>["reasons"][number];
type EquipRequirementDetails = Extract<
  ItemEquipPreviewResult,
  { state: "requirements-not-met" | "can-equip" }
>["requirements"];

const equipmentSlots: readonly SlotView[] = [
  { id: "weapon", icon: "🗡️", label: "Зброя", emptyText: "стійка чекає важкий аргумент." },
  { id: "offhand", icon: "✋", label: "Друга рука", emptyText: "вільна рука поки чекає, що саме їй довірять." },
  { id: "head", icon: "🎩", label: "Голова", emptyText: "полиця для шолома дивиться зверху." },
  { id: "chest", icon: "🧥", label: "Тулуб", emptyText: "манекен мерзне професійно." },
  { id: "legs", icon: "🥾", label: "Ноги", emptyText: "поножі ще не знайшли своїх колін." },
  { id: "accessory", icon: "💍", label: "Аксесуар", emptyText: "поличка чекає велику дивину." },
  { id: "tool", icon: "🧰", label: "Інструмент", emptyText: "кишеня для корисного ще не підписана." }
];

export function presentEquipment(result: EquipmentResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Манекен поки дивиться в порожнечу.";
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
    return "Це радше трофей, ніж спорядження. Шафа подивилась і чемно відмовилась.";
  }

  if (result.state === "requirements-not-met") {
    const itemName = plainTextForCallback(result.item.content.name);
    const reasons = presentEquipRequirementReasons(result.reasons, result.requirements);

    return [
      `Ще не екіпірується: ${itemName}.`,
      reasons ? `Потрібно: ${reasons}.` : "Корчмар ще звіряє правила цієї манатки.",
      "Це правило манатки, не помилка героя."
    ].join(" ");
  }

  if (result.state === "unsupported-slot") {
    return "Для цієї манатки ще немає місця. Корчмар записав борг у майбутню шафу.";
  }

  const effect = presentItemEffect(result.item.content.effect);
  const effectText = effect ? ` Ефект: ${effect}.` : " Бойового ефекту не виявлено.";
  const replacementText = result.replacedItem
    ? ` Попередня манатка зі слота «${presentEquipmentSlotLabel(result.slot)}» лишилася в торбі: ${plainTextForCallback(result.replacedItem.content.name)}.`
    : ` Слот: ${presentEquipmentSlotLabel(result.slot)}.`;

  return `Екіпіровано: ${plainTextForCallback(result.item.content.name)}.${effectText}${replacementText}`;
}

export function presentUnequipSlotResult(result: UnequipSlotResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Знімати поки ні з кого.";
  }

  const label = presentEquipmentSlotLabel(result.slot);

  if (result.state === "empty-slot") {
    return `${label} і так порожній. Шафа вдячна за увагу.`;
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

function presentEquipRequirementReasons(
  reasons: readonly EquipRequirementReason[],
  requirements: EquipRequirementDetails
): string {
  const labels = reasons.map((reason) => {
    switch (reason) {
      case "min-level":
        return requirements ? `рівень ${requirements.minLevel}+` : "вищий рівень";
      case "class":
        return requirements?.classes.length
          ? `клас: ${joinRequirementList(requirements.classes)}`
          : "сумісний клас";
      case "race":
        return requirements?.races.length
          ? `походження: ${joinRequirementList(requirements.races)}`
          : "сумісне походження";
      case "title":
        return requirements?.titles.length
          ? `титул: ${joinRequirementList(requirements.titles)}`
          : "відповідний титул";
      case "unknown-item":
        return "відомі правила предмета";
    }
  });

  return [...new Set(labels)].join(", ");
}

function joinRequirementList(values: readonly string[]): string {
  const unique = [...new Set(values)];

  if (unique.length <= 1) {
    return unique[0] ?? "";
  }

  return unique.slice(0, -1).join(", ") + " або " + unique.at(-1);
}

function plainTextForCallback(value: string): string {
  return value
    .replace(/<\/?[^>]+>/g, "")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .replace(/\s+/g, " ")
    .trim();
}
