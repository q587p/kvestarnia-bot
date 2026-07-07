export const DEFAULT_INVENTORY_SORT = "default";

export type InventorySort =
  | typeof DEFAULT_INVENTORY_SORT
  | "date-asc"
  | "date-desc"
  | "name-asc"
  | "name-desc";

const callbackCodeBySort: Record<Exclude<InventorySort, typeof DEFAULT_INVENTORY_SORT>, string> = {
  "date-asc": "do",
  "date-desc": "dn",
  "name-asc": "az",
  "name-desc": "za"
};

const sortByCallbackCode = Object.fromEntries(
  Object.entries(callbackCodeBySort).map(([sort, code]) => [code, sort])
) as Record<string, Exclude<InventorySort, typeof DEFAULT_INVENTORY_SORT>>;

export function inventorySortToCallbackCode(sort: InventorySort): string | null {
  return sort === DEFAULT_INVENTORY_SORT ? null : callbackCodeBySort[sort];
}

export function callbackCodeToInventorySort(code: string | undefined): InventorySort | null {
  if (!code) {
    return null;
  }

  return sortByCallbackCode[code] ?? null;
}

export function getInventoryDateSortTarget(sort: InventorySort): InventorySort {
  return sort === "date-desc" ? "date-asc" : "date-desc";
}

export function getInventoryNameSortTarget(sort: InventorySort): InventorySort {
  return sort === "name-asc" ? "name-desc" : "name-asc";
}

export function presentInventoryDateSortButton(sort: InventorySort): string {
  return sort === "date-desc" ? "🕒 Нові в кінці" : "🕒 Нові спершу";
}

export function presentInventoryNameSortButton(sort: InventorySort): string {
  return sort === "name-asc" ? "🔤 Я-А" : "🔤 А-Я";
}

export function presentInventorySortPromptLabel(sort: InventorySort): string | null {
  const labels: Record<Exclude<InventorySort, typeof DEFAULT_INVENTORY_SORT>, string> = {
    "date-asc": "нові в кінці",
    "date-desc": "нові спершу",
    "name-asc": "А-Я",
    "name-desc": "Я-А"
  };

  return sort === DEFAULT_INVENTORY_SORT ? null : labels[sort];
}
