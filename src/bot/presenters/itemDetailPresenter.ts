import type { ItemContent } from "../../content/schema";
import { getMantokSetProgressForItem } from "../../domain/equipment/mantokSetBonuses";
import type { EquipmentSlot, ItemEquipPreviewResult } from "../../services/equipmentService";
import {
  isEquippableItem,
  mapItemToEquipmentSlot
} from "../../services/equipmentService";
import type { ItemUseAvailability } from "../../services/itemUseService";
import { YEGER_FIRST_NOTCH_ITEM_ID } from "../../services/itemGrant";
import type {
  InventoryItemDetailResult,
  InventoryItemSummary
} from "../../services/inventoryService";
import {
  presentEquipmentSlotLabel,
  presentSlotDeniedReason
} from "./equipmentPresenter";
import { presentItemEffect } from "./itemEffectPresenter";
import { escapeHtml } from "./telegramHtml";

export interface ItemDetailOptions {
  equippedSlot?: EquipmentSlot | null;
  equipPreview?: ItemEquipPreviewResult | null;
  itemUse?: ItemUseAvailability | null;
  combatUseAvailable?: boolean;
  equippedItemIds?: readonly string[];
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
    `Категорія: <b>${presentItemCategory(content)}</b>`,
    `Вартість: ${presentItemValue(content)}`,
    `Кількість: <b>${quantity}</b>`,
    ...(effectLine ? [effectLine] : []),
    "",
    `<i>${escapeHtml(content.description)}</i>`,
    ...presentMantokSetDetailLines(content.id, options.equippedItemIds ?? []),
    "",
    ...presentItemUseLine(options.itemUse ?? null, options.combatUseAvailable === true),
    ...(options.itemUse ? [""] : []),
    presentEquipmentLine(content, options.equippedSlot ?? null, options.equipPreview ?? null),
    "",
    presentItemFlavor(content)
  ].join("\n");
}

function presentMantokSetDetailLines(
  itemId: string,
  equippedItemIds: readonly string[]
): string[] {
  const progress = getMantokSetProgressForItem(itemId, equippedItemIds);

  if (!progress) {
    return [];
  }

  return [
    "",
    `Комплект: <b>${escapeHtml(progress.set.name)}</b>`,
    `Зараз вдягнено: <b>${progress.equippedPieces.length}/${progress.set.pieces.length}</b>`,
    ...presentMantokSetActiveBonusLines(progress.activeBonuses),
    ...(progress.nextBonus ? [presentMantokSetNextBonusLine(progress.nextBonus)] : [])
  ];
}

function presentMantokSetActiveBonusLines(
  bonuses: NonNullable<ReturnType<typeof getMantokSetProgressForItem>>["activeBonuses"]
): string[] {
  if (bonuses.length === 0) {
    return ["Активно: <i>ще жоден поріг не зібрано</i>"];
  }

  return bonuses.map((bonus) => {
    const effect = presentItemEffect(bonus.effect) ?? "без видимого ефекту";

    return `Активно: ${escapeHtml(bonus.name)} <i>(${effect})</i>`;
  });
}

function presentMantokSetNextBonusLine(
  bonus: NonNullable<ReturnType<typeof getMantokSetProgressForItem>>["nextBonus"] & {}
): string {
  const effect = presentItemEffect(bonus.effect) ?? "без видимого ефекту";

  return `Далі: ${bonus.pieces} частини — ${escapeHtml(bonus.name)} <i>(${effect})</i>`;
}

function presentItemUseLine(
  availability: ItemUseAvailability | null,
  combatUseAvailable: boolean
): string[] {
  if (!availability || availability.state !== "usable") {
    return [];
  }

  if (combatUseAvailable) {
    return [
      "Використання: <b>можна застосувати в бою або поза боєм</b>.",
      "У бою манатка витрачає хід і лікує одразу. Поза боєм попередній перегляд покаже лікування перед витратою."
    ];
  }

  return [
    "Використання: <b>можна застосувати для лікування</b>.",
    "Попередній перегляд покаже поточне лікування перед витратою."
  ];
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

function presentEquipmentLine(
  item: ItemContent,
  equippedSlot: EquipmentSlot | null,
  equipPreview: ItemEquipPreviewResult | null
): string {
  if (item.slot === "consumable") {
    return "Екіпірування: <i>не вдягається. Це витратна манатка: її застосовують, а не приміряють.</i>";
  }

  if (item.id === YEGER_FIRST_NOTCH_ITEM_ID) {
    return "Екіпірування: <i>не вдягається. Єгер міняє такі риски на медичний запас після закритої другої дощечки.</i>";
  }

  if (!isEquippableItem(item)) {
    return "Екіпірування: <i>не вдягається. Корчма визнала це смішним трофеєм.</i>";
  }

  if (equippedSlot) {
    return `Екіпірування: <b>вдягнено — ${presentEquipmentSlotLabelInline(equippedSlot)}</b>.`;
  }

  if (equipPreview?.state === "requirements-not-met") {
    const requirements = presentHtmlRequirementReasons(
      equipPreview.reasons,
      equipPreview.requirements
    );

    return requirements
      ? `Екіпірування: <i>зараз не можна екіпірувати. Потрібно: ${requirements}.</i>`
      : "Екіпірування: <i>зараз не можна екіпірувати. Корчмар ще звіряє правила цієї манатки.</i>";
  }

  if (equipPreview?.state === "not-equippable") {
    return "Екіпірування: <i>не вдягається. Корчма визнала це смішним трофеєм.</i>";
  }

  if (equipPreview?.state === "unsupported-slot") {
    return "Екіпірування: <i>зараз не можна екіпірувати. Для цієї манатки ще немає місця.</i>";
  }

  if (equipPreview?.state === "slot-not-allowed") {
    return `Екіпірування: <i>у слот «${presentEquipmentSlotLabel(equipPreview.slot)}» зараз не можна: ${presentSlotDeniedReason(equipPreview.reason, equipPreview.slot)}.</i>`;
  }

  if (equipPreview?.state === "twohand-confirm-required") {
    return `Екіпірування: <i>можна екіпірувати у слот «${presentEquipmentSlotLabel(equipPreview.slot)}», але спершу треба підтвердити звільнення руки: ${escapeHtml(equipPreview.clearedHandItem.content.name)} лишиться в торбі.</i>`;
  }

  const slot = equipPreview?.state === "can-equip"
    ? equipPreview.slot
    : mapItemToEquipmentSlot(item);
  const currentItem = equipPreview?.state === "can-equip" ? equipPreview.currentItem : null;
  const slotLabel = slot ? presentEquipmentSlotLabel(slot) : null;

  if (slotLabel && currentItem) {
    return `Екіпірування: <i>можна екіпірувати у слот «${slotLabel}». Замінить: ${escapeHtml(currentItem.content.name)}.</i>`;
  }

  if (slotLabel) {
    return `Екіпірування: <i>можна екіпірувати у слот «${slotLabel}». Спорядження вже звільняє місце.</i>`;
  }

  return "Екіпірування: <i>можна екіпірувати. Спорядження вже звільняє місце.</i>";
}

function presentEquipmentSlotLabelInline(slot: EquipmentSlot): string {
  const label = presentEquipmentSlotLabel(slot);

  return label.charAt(0).toLocaleLowerCase("uk-UA") + label.slice(1);
}

function presentHtmlRequirementReasons(
  reasons: readonly string[],
  requirements: Extract<
    ItemEquipPreviewResult,
    { state: "requirements-not-met" | "can-equip" }
  >["requirements"]
): string {
  const labels = reasons.map((reason) => {
    switch (reason) {
      case "min-level":
        return requirements ? `рівень ${requirements.minLevel}+` : "вищий рівень";
      case "class":
        return requirements?.classes.length
          ? `клас: ${joinHtmlRequirementList(requirements.classes)}`
          : "сумісний клас";
      case "race":
        return requirements?.races.length
          ? `походження: ${joinHtmlRequirementList(requirements.races)}`
          : "сумісне походження";
      case "title":
        return requirements?.titles.length
          ? `титул: ${joinHtmlRequirementList(requirements.titles)}`
          : "відповідний титул";
      case "unknown-item":
        return "відомі правила предмета";
      default:
        return null;
    }
  });

  return [...new Set(labels.filter((label): label is string => Boolean(label)))].join(", ");
}

function joinHtmlRequirementList(values: readonly string[]): string {
  const unique = [...new Set(values.map(escapeHtml))];

  if (unique.length <= 1) {
    return unique[0] ?? "";
  }

  return unique.slice(0, -1).join(", ") + " або " + unique.at(-1);
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

function presentItemCategory(item: ItemContent): string {
  if (item.equipmentSlot === "legs") {
    return "річ на ноги";
  }

  return presentItemSlot(item.slot);
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
    return "<i>Стійка для зброї робить поважний вигляд. Вона давно чекала аргумент із ручкою.</i>";
  }

  if (item.equipmentSlot === "legs") {
    return "<i>Манекен виставив ногу й удав, що це теж поважний салон спорядження.</i>";
  }

  if (item.slot === "armor") {
    return "<i>Манекен випростав плечі й удав, що це завжди був поважний салон спорядження.</i>";
  }

  if (item.slot === "accessory") {
    return "<i>Поличка для дрібних дивин обережно блищить. Так роблять аксесуари, коли хочуть до інвентаря без черги.</i>";
  }

  if (item.slot === "junk") {
    return "<i>Корчмар записав це в журнал як «важливо, але не чіпати голими руками».</i>";
  }

  if (item.slot === "consumable") {
    return "<i>Корчмар зважує манатку в руці й вирішує, чи не занадто впевнено вона виглядає перед витратою.</i>";
  }

  if (item.id === YEGER_FIRST_NOTCH_ITEM_ID) {
    return "<i>Корчмар не кладе риску на полицю. Він підсуває її ближче до Єгеря й удає, що це інвентарна дипломатія.</i>";
  }

  return "<i>Корчмар крутить манатку в руках і ще думає, до якої полиці її не підпускати.</i>";
}
