import {
  ONE_USE_INVENTORY_FILTER,
  isInventoryEquipmentSlotFilter,
  isOneUseInventoryFilter,
  type InventoryFilter
} from "./inventoryFilter";

export interface InventoryPagePrompt {
  filter: InventoryFilter;
  totalPages: number;
}

const PROMPT_PATTERN = /^Введіть номер сторінки для «(.+)» \(1-(\d{1,3})\):$/u;

export function presentInventoryPagePrompt(
  filter: InventoryFilter,
  totalPages: number
): string {
  return `Введіть номер сторінки для «${getInventoryPagePromptLabel(filter)}» (1-${normalizeTotalPages(totalPages)}):`;
}

export function parseInventoryPagePrompt(text: string | undefined): InventoryPagePrompt | null {
  const match = text?.match(PROMPT_PATTERN);

  if (!match) {
    return null;
  }

  const label = match[1];
  const totalPages = Number(match[2]);
  const filter = labelToFilter(label);

  if (filter === undefined || !Number.isInteger(totalPages) || totalPages < 1) {
    return null;
  }

  return {
    filter,
    totalPages
  };
}

export function parseInventoryPageNumber(
  text: string | undefined,
  totalPages: number
): number | null {
  const value = text?.trim();

  if (!value || !/^\d{1,3}$/.test(value)) {
    return null;
  }

  const page = Number(value);

  return page >= 1 && page <= normalizeTotalPages(totalPages) ? page : null;
}

export function getInventoryPagePromptPlaceholder(totalPages: number): string {
  return `1-${normalizeTotalPages(totalPages)}`;
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

function normalizeTotalPages(totalPages: number): number {
  return Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1));
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
