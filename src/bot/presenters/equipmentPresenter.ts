import type {
  EquipmentResult,
  EquipmentSlotDeniedReason,
  EquipmentSlot,
  EquipmentSlotSummary,
  EquipItemResult,
  ItemEquipPreviewResult,
  UnequipSlotResult
} from "../../services/equipmentService";
import type { ItemEffectContent } from "../../content/schema";
import { findMantokAbilityGrantByItemId } from "../../content";
import { getActiveMantokSets } from "../../domain/equipment/mantokSetBonuses";
import { getItemDisplayNameWithEnhancement } from "../../domain/itemUpgrades";
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
  { id: "head", icon: "🎩", label: "Голова", emptyText: "полиця для шолома дивиться зверху." },
  { id: "chest", icon: "🧥", label: "Тулуб", emptyText: "манекен мерзне професійно." },
  { id: "legs", icon: "🥾", label: "Ноги", emptyText: "поножі ще не знайшли своїх колін." },
  { id: "accessory", icon: "💍", label: "Аксесуар", emptyText: "поличка чекає велику дивину." },
  { id: "tool", icon: "🧰", label: "Інструмент", emptyText: "кишеня для корисного ще не підписана." },
  { id: "weapon", icon: "🗡️", label: "Основна рука", emptyText: "долоня чекає, що саме їй довірять." },
  { id: "offhand", icon: "✋", label: "Друга рука", emptyText: "вільна рука поки репетирує корисність." }
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
    ...intersperseBlankLines(equipmentSlots.map((slot) => presentEquipmentSlot(slot, result.slots))),
    ...presentMantokSetSummaryLines(result.slots)
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

  if (result.state === "slot-not-allowed") {
    return presentSlotDeniedEquipResult(result.item.content.name, result.slot, result.reason);
  }

  if (result.state === "twohand-confirm-required") {
    return [
      `Дворучна примірка: ${plainTextForCallback(result.item.content.name)} займе обидві руки.`,
      `Звільниться: ${plainTextForCallback(result.clearedHandItem.content.name)}.`,
      "Підтвердити?"
    ].join(" ");
  }

  const effect = presentItemEffect(result.item.content.effect);
  const itemName = getItemDisplayNameWithEnhancement(result.item.content, result.item.enhancementLevel);
  const lines = [
    `Екіпіровано: <b>${presentCallbackHtmlText(itemName)}</b>.`,
    effect ? `Ефект: ${effect}.` : "Бойового ефекту не виявлено."
  ];

  if (result.replacedItem) {
    lines.push(
      `Попередня манатка зі слота <i>${presentEquipmentSlotLabel(result.slot)}</i> лишилася в торбі:`,
      `${presentCallbackHtmlText(result.replacedItem.content.name)}.`
    );
  } else {
    lines.push(`Слот: <i>${presentEquipmentSlotLabel(result.slot)}</i>.`);
  }

  if (result.clearedHandItem) {
    lines.push(
      "Конфліктна рука звільнилася:",
      `${presentCallbackHtmlText(result.clearedHandItem.content.name)} лишилася в торбі.`
    );
  }

  return lines.join("\n");
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
  const slotSummary = slots.find((candidate) => candidate.slot === slot.id);
  const equipped = slotSummary?.item;

  if (equipped) {
    const effect = presentItemEffect(equipped.content.effect);
    const displayName = getItemDisplayNameWithEnhancement(equipped.content, equipped.enhancementLevel);
    const name = slotSummary?.occupiedByTwohand
      ? `${escapeHtml(displayName)} <i>(дворучна)</i>`
      : escapeHtml(displayName);

    return [
      `${slot.icon} <b>${slot.label}</b>: ${name}`,
      `Ефект: <i>${effect ?? "бойового ефекту не виявлено"}</i>`,
      ...presentMantokAbilityGrantSlotLines(equipped.content.id)
    ].join("\n");
  }

  return `${slot.icon} <b>${slot.label}</b>: <i>${slot.emptyText}</i>`;
}

function presentMantokAbilityGrantSlotLines(itemId: string): string[] {
  const grant = findMantokAbilityGrantByItemId(itemId);
  if (!grant) {
    return [];
  }

  if (grant.combat) {
    const cost = grant.combat.profile.manaCost > 0
      ? `${grant.combat.profile.manaCost} мани`
      : "без мани";
    const borrowed = grant.borrowedFrom ? "; позичена, не рідна" : "";

    return [
      `Дія: <b>${escapeHtml(grant.label)}</b> (${cost}, перезарядка ${grant.combat.profile.cooldownOwnActions}${borrowed})`
    ];
  }

  return [`Перк: <b>${escapeHtml(grant.label)}</b> (без бойової кнопки)`];
}

function presentMantokSetSummaryLines(slots: EquipmentSlotSummary[]): string[] {
  const equippedItemIds = [
    ...new Set(slots.flatMap((slot) => (slot.item ? [slot.item.itemId] : [])))
  ];
  const summaries = getActiveMantokSets(equippedItemIds);

  if (summaries.length === 0) {
    return [];
  }

  return [
    "",
    "",
    "🧩 <b>Комплекти</b>",
    "",
    ...summaries.flatMap((summary, index) => [
      ...(index === 0 ? [] : [""]),
      `<b>${escapeHtml(summary.set.name)}</b>: ${summary.equippedPieces.length}/${summary.set.pieces.length}`,
      ...presentMantokSetBonusLines(summary.activeBonuses, "Активно"),
      ...(summary.nextBonus ? [presentMantokSetNextBonusLine(summary.nextBonus)] : [])
    ])
  ];
}

function presentMantokSetBonusLines(
  bonuses: readonly { name: string; effect: Partial<ItemEffectContent> }[],
  label: string
): string[] {
  if (bonuses.length === 0) {
    return [`${label}: <i>ще жоден поріг не зібрано</i>`];
  }

  return bonuses.map((bonus) => {
    const effect = presentItemEffect(bonus.effect) ?? "без видимого ефекту";

    return `${label}: ${escapeHtml(bonus.name)} <i>(${effect})</i>`;
  });
}

function presentMantokSetNextBonusLine(bonus: {
  pieces: number;
  name: string;
  effect: Partial<ItemEffectContent>;
}): string {
  const effect = presentItemEffect(bonus.effect) ?? "без видимого ефекту";

  return `Далі: ${bonus.pieces} частини — ${escapeHtml(bonus.name)} <i>(${effect})</i>`;
}

export function presentSlotDeniedReason(
  reason: EquipmentSlotDeniedReason,
  slot: EquipmentSlot
): string {
  if (reason === "offhand-restricted") {
    return "дві зброї Корчмар довіряє тільки воїнам. Іншим потрібна манатка, що прямо проситься в другу руку";
  }

  if (reason === "not-enough-copies") {
    return "ця манатка вже зайнята на іншому гачку. Для цього слота потрібен ще один екземпляр";
  }

  if (reason === "twohand-conflict") {
    return "ця манатка просить обидві руки. Корчмар рахує пальці й не бачить зайвої долоні";
  }

  return `слот «${presentEquipmentSlotLabel(slot)}» не для цієї манатки. Корчмар уже дістав лінійку здорового глузду`;
}

function presentSlotDeniedEquipResult(
  itemName: string,
  slot: EquipmentSlot,
  reason: EquipmentSlotDeniedReason
): string {
  return [
    `Не екіпірується в слот «${presentEquipmentSlotLabel(slot)}»: ${plainTextForCallback(itemName)}.`,
    `${capitalizeFirst(presentSlotDeniedReason(reason, slot))}.`
  ].join(" ");
}

function capitalizeFirst(value: string): string {
  return value.length > 0 ? value[0]!.toLocaleUpperCase("uk-UA") + value.slice(1) : value;
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

function presentCallbackHtmlText(value: string): string {
  return escapeHtml(plainTextForCallback(value));
}
