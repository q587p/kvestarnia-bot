import type { InventoryItemSummary, InventoryResult } from "../../services/inventoryService";
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
import { DEFAULT_INVENTORY_SORT, type InventorySort } from "../inventorySort";
import { presentItemEffect } from "./itemEffectPresenter";
import { escapeHtml } from "./telegramHtml";

export const INVENTORY_PAGE_SIZE = 8;

export interface InventoryPresenterOptions {
  currentSlotItem?: EquipmentItemSummary | null;
  equippedItemIds?: ReadonlySet<string> | null;
  slotCompatibleItemIds?: ReadonlySet<string> | null;
  sort?: InventorySort;
}

export interface InventoryViewModel {
  result: InventoryResult;
  rawItems: readonly InventoryItemSummary[];
  filteredItems: readonly InventoryItemSummary[];
  filteredCount: number;
  safePage: number;
  totalPages: number;
  pageItems: readonly InventoryItemSummary[];
  filter: InventoryFilter;
  sort: InventorySort;
  options: InventoryPresenterOptions;
}

export function presentInventory(
  result: InventoryResult,
  page = 0,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
): string {
  return presentInventoryViewModel(buildInventoryViewModel(result, page, filter, options));
}

export function presentInventoryViewModel(model: InventoryViewModel): string {
  const { result, filter, options } = model;

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

  if (filter && model.filteredCount === 0) {
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
      ? presentFilteredCountLine(filter, model.filteredCount)
      : `Оціночна вартість столу: <b>${result.totalGoldValue} золота</b>. Стіл уже поводиться як фінансовий радник.`,
    ...(model.totalPages > 1 ? ["", `Сторінка <b>${model.safePage + 1}/${model.totalPages}</b>. Усе інше стіл поки тримає під ліктем.`] : [])
  ].join("\n");
}

export function buildInventoryViewModel(
  result: InventoryResult,
  page = 0,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
): InventoryViewModel {
  const sort = options.sort ?? DEFAULT_INVENTORY_SORT;
  const normalizedOptions = { ...options, sort };
  const rawItems = result.state === "found" ? result.items : [];
  const filteredItems = result.state === "found"
    ? filterInventoryItems(rawItems, filter, normalizedOptions)
    : [];
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / INVENTORY_PAGE_SIZE));
  const safePage = clampPage(page, totalPages);
  const start = safePage * INVENTORY_PAGE_SIZE;

  return {
    result,
    rawItems,
    filteredItems,
    filteredCount: filteredItems.length,
    safePage,
    totalPages,
    pageItems: filteredItems.slice(start, start + INVENTORY_PAGE_SIZE),
    filter,
    sort,
    options: normalizedOptions
  };
}

export function getInventoryTotalPages(
  result: InventoryResult,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
): number {
  return buildInventoryViewModel(result, 0, filter, options).totalPages;
}

export function clampInventoryPage(
  result: InventoryResult,
  page: number,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
): number {
  return buildInventoryViewModel(result, page, filter, options).safePage;
}

export function getInventoryPageItems(
  result: InventoryResult,
  page: number,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
) {
  return buildInventoryViewModel(result, page, filter, options).pageItems;
}

export function getFilteredInventoryItems(
  result: InventoryResult,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
) {
  if (result.state !== "found") {
    return [];
  }

  return filterInventoryItems(result.items, filter, options);
}

function filterInventoryItems(
  items: readonly InventoryItemSummary[],
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
) {
  if (!filter) {
    return sortInventoryItems(items, options.sort ?? DEFAULT_INVENTORY_SORT);
  }

  if (isInventoryEquipmentSlotFilter(filter)) {
    if (options.slotCompatibleItemIds) {
      return sortInventoryItems(
        items.filter((item) => options.slotCompatibleItemIds?.has(item.itemId)),
        options.sort ?? DEFAULT_INVENTORY_SORT
      );
    }

    return sortInventoryItems(
      items.filter((item) => mapItemToEquipmentSlot(item.content) === filter),
      options.sort ?? DEFAULT_INVENTORY_SORT
    );
  }

  if (isOneUseInventoryFilter(filter)) {
    return sortInventoryItems(
      items.filter((item) => item.content.tags?.includes("one-use")),
      options.sort ?? DEFAULT_INVENTORY_SORT
    );
  }

  return sortInventoryItems(items, options.sort ?? DEFAULT_INVENTORY_SORT);
}

function clampPage(page: number, totalPages: number): number {
  const safePage = Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));

  return Math.min(safePage, totalPages - 1);
}

function sortInventoryItems(
  items: readonly InventoryItemSummary[],
  sort: InventorySort
): InventoryItemSummary[] {
  if (sort === DEFAULT_INVENTORY_SORT) {
    return [...items];
  }

  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (sort === "date-asc" || sort === "date-desc") {
        const leftTime = left.item.createdAt?.getTime() ?? 0;
        const rightTime = right.item.createdAt?.getTime() ?? 0;
        const dateOrder = sort === "date-asc" ? leftTime - rightTime : rightTime - leftTime;

        return dateOrder || left.index - right.index;
      }

      const nameOrder = left.item.content.name.localeCompare(right.item.content.name, "uk");

      return (sort === "name-asc" ? nameOrder : -nameOrder) || left.index - right.index;
    })
    .map(({ item }) => item);
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
