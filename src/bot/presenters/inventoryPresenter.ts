import type { InventoryResult } from "../../services/inventoryService";
import {
  mapItemToEquipmentSlot,
  type EquipmentItemSummary,
  type EquipmentSlot
} from "../../services/equipmentService";
import {
  isInventoryEquipmentSlotFilter,
  isOneUseInventoryFilter,
  ONE_USE_INVENTORY_FILTER_ICON,
  type InventoryFilter
} from "../inventoryFilter";
import { presentItemEffect } from "./itemEffectPresenter";
import { escapeHtml } from "./telegramHtml";

export const INVENTORY_PAGE_SIZE = 8;

export interface InventoryPresenterOptions {
  currentSlotItem?: EquipmentItemSummary | null;
  equippedItemIds?: ReadonlySet<string> | null;
  slotCompatibleItemIds?: ReadonlySet<string> | null;
}

export function presentInventory(
  result: InventoryResult,
  page = 0,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Манатки не люблять порожніх біографій.";
  }

  if (result.state === "empty") {
    if (filter) {
      return presentEmptyFilteredInventory(filter, options);
    }

    return [
      "🎒 Манатки",
      "Манатки ще не завелися.",
      "",
      "Спробуйте /tavern, /quest або /fight. Щось точно прилипне."
    ].join("\n");
  }

  const filteredItems = getFilteredInventoryItems(result, filter, options);
  const safePage = clampInventoryPage(result, page, filter, options);
  const totalPages = getInventoryTotalPages(result, filter, options);

  if (filter && filteredItems.length === 0) {
    return presentEmptyFilteredInventory(filter, options);
  }

  return [
    filter
      ? presentInventoryFilterHeading(filter)
      : "🎒 <b>Манатки</b>",
    filter
      ? presentInventoryFilterDescription(filter)
      : "Пригодник розклав здобич на столі. Стіл попросив надбавку.",
    "",
    ...(isInventoryEquipmentSlotFilter(filter) ? [...presentCurrentSlotItem(options.currentSlotItem ?? null), ""] : []),
    filter
      ? presentFilteredCountLine(filter, filteredItems.length)
      : `Оціночна вартість столу: <b>${result.totalGoldValue} золота</b>. Стіл уже поводиться як фінансовий радник.`,
    ...(totalPages > 1 ? ["", `Сторінка <b>${safePage + 1}/${totalPages}</b>. Усе інше стіл поки тримає під ліктем.`] : [])
  ].join("\n");
}

export function getInventoryTotalPages(
  result: InventoryResult,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
): number {
  if (result.state !== "found") {
    return 1;
  }

  return Math.max(1, Math.ceil(getFilteredInventoryItems(result, filter, options).length / INVENTORY_PAGE_SIZE));
}

export function clampInventoryPage(
  result: InventoryResult,
  page: number,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
): number {
  const totalPages = getInventoryTotalPages(result, filter, options);
  const safePage = Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));

  return Math.min(safePage, totalPages - 1);
}

export function getInventoryPageItems(
  result: InventoryResult,
  page: number,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
) {
  if (result.state !== "found") {
    return [];
  }

  const safePage = clampInventoryPage(result, page, filter, options);
  const start = safePage * INVENTORY_PAGE_SIZE;

  return getFilteredInventoryItems(result, filter, options).slice(start, start + INVENTORY_PAGE_SIZE);
}

export function getFilteredInventoryItems(
  result: InventoryResult,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
) {
  if (result.state !== "found" || !filter) {
    return result.state === "found" ? result.items : [];
  }

  if (isInventoryEquipmentSlotFilter(filter)) {
    if (options.slotCompatibleItemIds) {
      return result.items.filter((item) => options.slotCompatibleItemIds?.has(item.itemId));
    }

    return result.items.filter((item) => mapItemToEquipmentSlot(item.content) === filter);
  }

  if (isOneUseInventoryFilter(filter)) {
    return result.items.filter((item) => item.content.tags?.includes("one-use"));
  }

  return result.items;
}

function presentInventoryFilterHeading(filter: Exclude<InventoryFilter, null>): string {
  if (isInventoryEquipmentSlotFilter(filter)) {
    return `${presentSlotFilterIcon(filter)} <b>${presentSlotFilterTitle(filter)}</b>`;
  }

  return `${ONE_USE_INVENTORY_FILTER_ICON} <b>Разові манатки</b>`;
}

function presentInventoryFilterDescription(filter: Exclude<InventoryFilter, null>): string {
  if (isInventoryEquipmentSlotFilter(filter)) {
    return "Показано лише те, що можна спробувати вдягнути в цей слот.";
  }

  return "Показано манатки, які використовуються один раз і не сперечаються з наслідками.";
}

function presentFilteredCountLine(filter: Exclude<InventoryFilter, null>, count: number): string {
  if (isInventoryEquipmentSlotFilter(filter)) {
    return `Знайдено підхожих манаток: <b>${count}</b>. Правила екіпірування все одно перевірить Корчмар.`;
  }

  return `Знайдено разових манаток: <b>${count}</b>. Корчмар радить не відкривати всі одразу зубами.`;
}

function presentEmptyFilterLine(filter: Exclude<InventoryFilter, null>): string {
  if (isInventoryEquipmentSlotFilter(filter)) {
    return "У торбі поки немає манаток для цього гачка.";
  }

  return "У торбі поки немає разових манаток.";
}

function presentEmptyFilteredInventory(
  filter: Exclude<InventoryFilter, null>,
  options: InventoryPresenterOptions = {}
): string {
  return [
    presentInventoryFilterHeading(filter),
    "",
    presentInventoryFilterDescription(filter),
    "",
    ...(isInventoryEquipmentSlotFilter(filter) ? [...presentCurrentSlotItem(options.currentSlotItem ?? null), ""] : []),
    presentEmptyFilterLine(filter),
    "Корчмар каже: «Це не вирок. Це привід вибити щось дивніше»."
  ].join("\n");
}

function presentSlotFilterTitle(slot: EquipmentSlot): string {
  const titles: Record<EquipmentSlot, string> = {
    weapon: "Манатки для основної руки",
    offhand: "Манатки для другої руки",
    head: "Манатки-шоломи",
    chest: "Манатки для тулуба",
    legs: "Манатки-поножі",
    accessory: "Манатки-аксесуари",
    tool: "Манатки-інструменти"
  };

  return titles[slot];
}

function presentSlotFilterIcon(slot: EquipmentSlot): string {
  const icons: Record<EquipmentSlot, string> = {
    weapon: "🗡️",
    offhand: "✋",
    head: "🎩",
    chest: "🧥",
    legs: "🥾",
    accessory: "💍",
    tool: "🧰"
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
