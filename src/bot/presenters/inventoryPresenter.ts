import type { InventoryResult } from "../../services/inventoryService";
import {
  mapItemToEquipmentSlot,
  type EquipmentItemSummary,
  type EquipmentSlot
} from "../../services/equipmentService";
import { presentItemEffect } from "./itemEffectPresenter";
import { presentItemStackLine } from "./itemStackPresenter";
import { escapeHtml } from "./telegramHtml";

export const INVENTORY_PAGE_SIZE = 8;
export type InventorySlotFilter = EquipmentSlot | null;

export interface InventoryPresenterOptions {
  currentSlotItem?: EquipmentItemSummary | null;
}

export function presentInventory(
  result: InventoryResult,
  page = 0,
  slotFilter: InventorySlotFilter = null,
  options: InventoryPresenterOptions = {}
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Манатки не люблять порожніх біографій.";
  }

  if (result.state === "empty") {
    return [
      "🎒 Манатки",
      "Манатки ще не завелися.",
      "",
      "Спробуйте /tavern, /quest або /fight. Щось точно прилипне."
    ].join("\n");
  }

  const filteredItems = getFilteredInventoryItems(result, slotFilter);
  const safePage = clampInventoryPage(result, page, slotFilter);
  const totalPages = getInventoryTotalPages(result, slotFilter);
  const pageItems = getInventoryPageItems(result, safePage, slotFilter);

  if (slotFilter && filteredItems.length === 0) {
    return [
      `${presentSlotFilterIcon(slotFilter)} <b>${presentSlotFilterTitle(slotFilter)}</b>`,
      "",
      "Показано лише те, що можна спробувати вдягнути в цей слот.",
      "",
      ...presentCurrentSlotItem(options.currentSlotItem ?? null),
      "",
      "У торбі поки немає манаток для цього гачка.",
      "Корчмар каже: «Це не вирок. Це привід вибити щось дивніше»."
    ].join("\n");
  }

  return [
    slotFilter
      ? `${presentSlotFilterIcon(slotFilter)} <b>${presentSlotFilterTitle(slotFilter)}</b>`
      : "🎒 <b>Манатки</b>",
    slotFilter
      ? "Показано лише те, що можна спробувати вдягнути в цей слот."
      : "Пригодник розклав здобич на столі. Стіл попросив надбавку.",
    "",
    ...(slotFilter ? [...presentCurrentSlotItem(options.currentSlotItem ?? null), ""] : []),
    slotFilter
      ? `Знайдено підхожих манаток: <b>${filteredItems.length}</b>. Правила екіпірування все одно перевірить Корчмар.`
      : `Оціночна вартість столу: <b>${result.totalGoldValue} золота</b>. Стіл уже поводиться як фінансовий радник.`,
    ...(totalPages > 1 ? ["", `Сторінка <b>${safePage + 1}/${totalPages}</b>. Усе інше стіл поки тримає під ліктем.`] : []),
    "",
    ...pageItems.flatMap((item) => [
      presentItemStackLine({
        name: `<b>${escapeHtml(item.content.name)}</b>`,
        quantity: item.quantity
      }),
      `  <i>${escapeHtml(item.content.description)}</i>`
    ])
  ].join("\n");
}

export function getInventoryTotalPages(
  result: InventoryResult,
  slotFilter: InventorySlotFilter = null
): number {
  if (result.state !== "found") {
    return 1;
  }

  return Math.max(1, Math.ceil(getFilteredInventoryItems(result, slotFilter).length / INVENTORY_PAGE_SIZE));
}

export function clampInventoryPage(
  result: InventoryResult,
  page: number,
  slotFilter: InventorySlotFilter = null
): number {
  const totalPages = getInventoryTotalPages(result, slotFilter);
  const safePage = Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));

  return Math.min(safePage, totalPages - 1);
}

export function getInventoryPageItems(
  result: InventoryResult,
  page: number,
  slotFilter: InventorySlotFilter = null
) {
  if (result.state !== "found") {
    return [];
  }

  const safePage = clampInventoryPage(result, page, slotFilter);
  const start = safePage * INVENTORY_PAGE_SIZE;

  return getFilteredInventoryItems(result, slotFilter).slice(start, start + INVENTORY_PAGE_SIZE);
}

export function getFilteredInventoryItems(
  result: InventoryResult,
  slotFilter: InventorySlotFilter = null
) {
  if (result.state !== "found" || !slotFilter) {
    return result.state === "found" ? result.items : [];
  }

  return result.items.filter((item) => mapItemToEquipmentSlot(item.content) === slotFilter);
}

function presentSlotFilterTitle(slot: EquipmentSlot): string {
  const titles: Record<EquipmentSlot, string> = {
    weapon: "Манатки-зброя",
    head: "Манатки-шоломи",
    chest: "Манатки для тулуба",
    legs: "Манатки-поножі",
    accessory: "Манатки-аксесуари"
  };

  return titles[slot];
}

function presentSlotFilterIcon(slot: EquipmentSlot): string {
  const icons: Record<EquipmentSlot, string> = {
    weapon: "🗡️",
    head: "🎩",
    chest: "🧥",
    legs: "🥾",
    accessory: "💍"
  };

  return icons[slot];
}

function presentCurrentSlotItem(item: EquipmentItemSummary | null): string[] {
  if (!item) {
    return [
      "Вдягнено: <i>нічого</i>",
      "Ефект: <i>гачок тримає паузу й не дає бонусів</i>"
    ];
  }

  const effect = presentItemEffect(item.content.effect);

  return [
    `Вдягнено: <b>${escapeHtml(item.content.name)}</b>`,
    `Ефект: <i>${escapeHtml(effect ?? "бойового ефекту не виявлено")}</i>`
  ];
}
