import {
  ONE_USE_INVENTORY_FILTER,
  isInventoryEquipmentSlotFilter,
  isOneUseInventoryFilter,
  type InventoryFilter
} from "./inventoryFilter";
import {
  DEFAULT_INVENTORY_SORT,
  presentInventorySortPromptLabel,
  type InventorySort
} from "./inventorySort";
import {
  getPageNumberPromptPlaceholder,
  parsePageNumber,
  parsePageNumberPrompt,
  presentPageNumberPrompt
} from "./pageNumberPrompt";

export interface InventoryPagePrompt {
  filter: InventoryFilter;
  sort: InventorySort;
  totalPages: number;
}

export function presentInventoryPagePrompt(
  filter: InventoryFilter,
  totalPages: number,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): string {
  const sortLabel = presentInventorySortPromptLabel(sort);
  const label = sortLabel
    ? `${getInventoryPagePromptLabel(filter)} · ${sortLabel}`
    : getInventoryPagePromptLabel(filter);

  return presentPageNumberPrompt(label, totalPages);
}

export function parseInventoryPagePrompt(text: string | undefined): InventoryPagePrompt | null {
  const prompt = parsePageNumberPrompt(text);
  if (!prompt) {
    return null;
  }

  const [filterLabel, sortLabel] = prompt.label.split(" · ");
  const filter = labelToFilter(filterLabel);
  const sort = labelToSort(sortLabel);

  if (filter === undefined || sort === null) {
    return null;
  }

  return {
    filter,
    sort,
    totalPages: prompt.totalPages
  };
}

export function parseInventoryPageNumber(
  text: string | undefined,
  totalPages: number
): number | null {
  return parsePageNumber(text, totalPages);
}

export function getInventoryPagePromptPlaceholder(totalPages: number): string {
  return getPageNumberPromptPlaceholder(totalPages);
}

function getInventoryPagePromptLabel(filter: InventoryFilter): string {
  if (filter === null) {
    return "Манатки";
  }

  if (isInventoryEquipmentSlotFilter(filter)) {
    return slotLabels[filter];
  }

  if (isOneUseInventoryFilter(filter)) {
    return "Разові манатки";
  }

  return "Манатки";
}

function labelToFilter(label: string | undefined): InventoryFilter | undefined {
  if (label === "Манатки") {
    return null;
  }

  if (label === "Разові манатки") {
    return ONE_USE_INVENTORY_FILTER;
  }

  const slot = Object.entries(slotLabels).find(([, title]) => title === label)?.[0];

  return slot ? (slot as Exclude<InventoryFilter, null | typeof ONE_USE_INVENTORY_FILTER>) : undefined;
}

function labelToSort(label: string | undefined): InventorySort | null {
  if (!label) {
    return DEFAULT_INVENTORY_SORT;
  }

  const labels: Record<string, InventorySort> = {
    "нові в кінці": "date-asc",
    "нові спершу": "date-desc",
    "А-Я": "name-asc",
    "Я-А": "name-desc"
  };

  return labels[label] ?? null;
}

const slotLabels = {
  weapon: "Манатки для основної руки",
  offhand: "Манатки для другої руки",
  head: "Манатки-шоломи",
  chest: "Манатки для тулуба",
  legs: "Манатки-поножі",
  accessory: "Манатки-аксесуари",
  tool: "Манатки-інструменти"
} as const;
