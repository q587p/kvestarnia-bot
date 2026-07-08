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

export interface ItemUpgradePagePrompt {
  sort: InventorySort;
  totalPages: number;
}

const ITEM_UPGRADE_PAGE_PROMPT_BASE_LABEL = "Чароковальня";

export function presentItemUpgradePagePrompt(
  totalPages: number,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): string {
  const sortLabel = presentInventorySortPromptLabel(sort);
  const label = sortLabel
    ? `${ITEM_UPGRADE_PAGE_PROMPT_BASE_LABEL} · ${sortLabel}`
    : ITEM_UPGRADE_PAGE_PROMPT_BASE_LABEL;

  return presentPageNumberPrompt(label, totalPages);
}

export function parseItemUpgradePagePrompt(text: string | undefined): ItemUpgradePagePrompt | null {
  const prompt = parsePageNumberPrompt(text);
  if (!prompt) {
    return null;
  }

  const [baseLabel, sortLabel] = prompt.label.split(" · ");
  if (baseLabel !== ITEM_UPGRADE_PAGE_PROMPT_BASE_LABEL) {
    return null;
  }

  const sort = labelToSort(sortLabel);
  if (sort === null) {
    return null;
  }

  return {
    sort,
    totalPages: prompt.totalPages
  };
}

export function parseItemUpgradePageNumber(
  text: string | undefined,
  totalPages: number
): number | null {
  return parsePageNumber(text, totalPages);
}

export function getItemUpgradePagePromptPlaceholder(totalPages: number): string {
  return getPageNumberPromptPlaceholder(totalPages);
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
