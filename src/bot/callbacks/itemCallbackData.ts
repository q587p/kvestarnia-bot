import { createHash } from "crypto";
import { items } from "../../content/items";
import { contentIdSchema } from "../../content/schema";
import {
  ONE_USE_INVENTORY_FILTER,
  isInventoryEquipmentSlotFilter,
  isOneUseInventoryFilter,
  type InventoryFilter
} from "../inventoryFilter";
import {
  DEFAULT_INVENTORY_SORT,
  callbackCodeToInventorySort,
  inventorySortToCallbackCode,
  type InventorySort
} from "../inventorySort";
import type { EquipmentSlot } from "../../services/equipmentService";
import { equipmentSlots } from "../../services/equipmentService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const ITEM_PREFIX = "v1:item";
const EQUIPMENT_PREFIX = "v1:equip";
const { itemCallbackKeyById, itemIdByCallbackKey } = buildItemCallbackKeyMaps(
  items.map((item) => item.id)
);

export type ItemCallbackKeyMaps = {
  itemCallbackKeyById: ReadonlyMap<string, string>;
  itemIdByCallbackKey: ReadonlyMap<string, string>;
};

export function buildItemCallbackKeyMaps(
  itemIds: readonly string[],
  options: { makeKey?: (itemId: string) => string } = {}
): ItemCallbackKeyMaps {
  const makeKey = options.makeKey ?? makeStableItemCallbackKey;
  const itemCallbackKeyById = new Map<string, string>();
  const itemIdByCallbackKey = new Map<string, string>();

  for (const itemId of itemIds) {
    if (itemCallbackKeyById.has(itemId)) {
      throw new Error(`Duplicate item callback id: ${itemId}`);
    }

    const key = makeKey(itemId);
    const existingItemId = itemIdByCallbackKey.get(key);

    if (existingItemId && existingItemId !== itemId) {
      throw new Error(`Item callback key collision: ${key} maps both ${existingItemId} and ${itemId}`);
    }

    itemCallbackKeyById.set(itemId, key);
    itemIdByCallbackKey.set(key, itemId);
  }

  return { itemCallbackKeyById, itemIdByCallbackKey };
}

export function makeStableItemCallbackKey(itemId: string): string {
  return createHash("sha256").update(itemId).digest("hex").slice(0, 12);
}

export type ItemCallback =
  | { type: "detail"; itemId: string; page: number; filter: InventoryFilter; sort: InventorySort }
  | { type: "inventory"; page: number; filter: InventoryFilter; sort: InventorySort }
  | { type: "page-prompt"; totalPages: number; filter: InventoryFilter; sort: InventorySort };
export type EquipmentCallback =
  | { type: "view" }
  | { type: "equip-item"; itemId: string; targetSlot: EquipmentSlot | null; confirmTwohand: boolean }
  | { type: "clear-slot"; slot: EquipmentSlot };

export function makeItemDetailCallbackData(
  itemId: string,
  page = 0,
  filter: InventoryFilter = null,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): string {
  const suffix = formatInventoryNavigationSuffix(page, filter, sort);
  const legacyData = `${ITEM_PREFIX}:detail:${itemId}${suffix}`;

  if (!isTooLong(legacyData)) {
    return legacyData;
  }

  const compactItemKey = itemCallbackKeyById.get(itemId);

  if (compactItemKey) {
    return assertCallbackData(`${ITEM_PREFIX}:d:${compactItemKey}${suffix}`);
  }

  return assertCallbackData(legacyData);
}

export function makeInventoryCallbackData(
  page = 0,
  filter: InventoryFilter = null,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): string {
  return assertCallbackData(`${ITEM_PREFIX}:inventory${formatInventoryNavigationSuffix(page, filter, sort)}`);
}

export function makeInventoryPagePromptCallbackData(
  totalPages: number,
  filter: InventoryFilter = null,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): string {
  const safeTotalPages = Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1));
  const filterSuffix = filter ? `:${filterToCallbackPart(filter)}` : "";
  const sortSuffix = formatInventorySortSuffix(sort);

  return assertCallbackData(`${ITEM_PREFIX}:page${filterSuffix}${sortSuffix}:${safeTotalPages}`);
}

export function parseItemCallbackData(data: string | undefined): ParseItemCallbackResult {
  if (!data?.startsWith("v1:")) {
    return { ok: false };
  }

  if (isTooLong(data)) {
    return { ok: false };
  }

  if (data === `${ITEM_PREFIX}:inventory`) {
    return {
      ok: true,
      value: {
        type: "inventory",
        page: 0,
        filter: null,
        sort: DEFAULT_INVENTORY_SORT
      }
    };
  }

  const [version, scope, action, ...rest] = data.split(":");

  if (version !== "v1" || scope !== "item") {
    return { ok: false };
  }

  if (action === "inventory") {
    const parsed = parseInventoryRest(rest);

    if (!parsed) {
      return { ok: false };
    }

    return {
      ok: true,
      value: {
        type: "inventory",
        page: parsed.page,
        filter: parsed.filter,
        sort: parsed.sort
      }
    };
  }

  if (action === "page") {
    const parsed = parseInventoryPagePromptRest(rest);

    if (!parsed) {
      return { ok: false };
    }

    return {
      ok: true,
      value: {
        type: "page-prompt",
        totalPages: parsed.totalPages,
        filter: parsed.filter,
        sort: parsed.sort
      }
    };
  }

  if (action === "d") {
    if (rest.length < 1 || rest.length > 6) {
      return { ok: false };
    }

    const [itemKey, ...tail] = rest;
    const itemId = itemKey ? itemIdByCallbackKey.get(itemKey) : undefined;
    const parsed = parseInventoryRest(tail);

    if (!itemId || !parsed) {
      return { ok: false };
    }

    return {
      ok: true,
      value: {
        type: "detail",
        itemId,
        page: parsed.page,
        filter: parsed.filter,
        sort: parsed.sort
      }
    };
  }

  if (action !== "detail" || rest.length < 1 || rest.length > 6) {
    return { ok: false };
  }

  const [itemId, ...tail] = rest;
  const parsed = parseInventoryRest(tail);

  if (!itemId || !parsed) {
    return { ok: false };
  }

  if (!contentIdSchema.safeParse(itemId).success) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      type: "detail",
      itemId,
      page: parsed.page,
      filter: parsed.filter,
      sort: parsed.sort
    }
  };
}

export function makeEquipmentCallbackData(): string {
  return assertCallbackData(`${EQUIPMENT_PREFIX}:view`);
}

export function makeEquipItemCallbackData(
  itemId: string,
  targetSlot: EquipmentSlot | null = null,
  options: { confirmTwohand?: boolean } = {}
): string {
  const targetSuffix = targetSlot ? `:s:${slotToCode(targetSlot)}` : "";
  const confirmSuffix = options.confirmTwohand === true ? ":c:2h" : "";
  const legacyData = `${EQUIPMENT_PREFIX}:item:${itemId}${targetSuffix}${confirmSuffix}`;

  if (!isTooLong(legacyData)) {
    return legacyData;
  }

  const compactItemKey = itemCallbackKeyById.get(itemId);

  if (compactItemKey) {
    return assertCallbackData(`${EQUIPMENT_PREFIX}:i:${compactItemKey}${targetSuffix}${confirmSuffix}`);
  }

  return assertCallbackData(legacyData);
}

export function makeUnequipSlotCallbackData(slot: EquipmentSlot): string {
  return assertCallbackData(`${EQUIPMENT_PREFIX}:clear:${slot}`);
}

export function parseEquipmentCallbackData(data: string | undefined): ParseEquipmentCallbackResult {
  if (!data?.startsWith("v1:")) {
    return { ok: false };
  }

  if (isTooLong(data)) {
    return { ok: false };
  }

  if (data === `${EQUIPMENT_PREFIX}:view`) {
    return {
      ok: true,
      value: {
        type: "view"
      }
    };
  }

  const [version, scope, action, ...rest] = data.split(":");

  if (version !== "v1" || scope !== "equip" || (rest.length !== 1 && rest.length !== 3 && rest.length !== 5)) {
    return { ok: false };
  }

  if (action === "i") {
    const itemKey = rest[0];
    const itemId = itemKey ? itemIdByCallbackKey.get(itemKey) : undefined;
    const hasSlot = rest.length >= 3;
    const targetSlot = hasSlot && rest[1] === "s"
      ? codeToSlot(rest[2])
      : null;
    const confirmTwohand = rest.length === 5 && rest[3] === "c" && rest[4] === "2h";

    if (!itemId || (hasSlot && !targetSlot) || (rest.length === 5 && !confirmTwohand)) {
      return { ok: false };
    }

    return {
      ok: true,
      value: {
        type: "equip-item",
        itemId,
        targetSlot,
        confirmTwohand
      }
    };
  }

  if (action === "item") {
    const itemId = rest[0];
    const hasSlot = rest.length >= 3;
    const targetSlot = hasSlot && rest[1] === "s"
      ? codeToSlot(rest[2])
      : null;
    const confirmTwohand = rest.length === 5 && rest[3] === "c" && rest[4] === "2h";

    if (
      !itemId ||
      !contentIdSchema.safeParse(itemId).success ||
      (hasSlot && !targetSlot) ||
      (rest.length === 5 && !confirmTwohand)
    ) {
      return { ok: false };
    }

    return {
      ok: true,
      value: {
        type: "equip-item",
        itemId,
        targetSlot,
        confirmTwohand
      }
    };
  }

  if (action === "clear") {
    if (rest.length !== 1) {
      return { ok: false };
    }

    const slot = rest[0];

    if (!isEquipmentSlot(slot)) {
      return { ok: false };
    }

    return {
      ok: true,
      value: {
        type: "clear-slot",
        slot
      }
    }
  }

  return { ok: false };
}

type ParseItemCallbackResult = { ok: true; value: ItemCallback } | { ok: false };
type ParseEquipmentCallbackResult = { ok: true; value: EquipmentCallback } | { ok: false };

function isEquipmentSlot(value: string | undefined): value is EquipmentSlot {
  return equipmentSlots.includes(value as EquipmentSlot);
}

function parseInventoryRest(rest: string[]): { page: number; filter: InventoryFilter; sort: InventorySort } | null {
  if (rest.length === 0) {
    return { page: 0, filter: null, sort: DEFAULT_INVENTORY_SORT };
  }

  if (rest.length === 1) {
    const page = parsePage(rest[0]);

    return page === null ? null : { page, filter: null, sort: DEFAULT_INVENTORY_SORT };
  }

  let index = 0;
  let filter: InventoryFilter = null;
  let sort: InventorySort = DEFAULT_INVENTORY_SORT;

  if (rest[index] === "s" || rest[index] === "f") {
    filter = callbackPartToFilter(rest[index], rest[index + 1]);

    if (!filter) {
      return null;
    }

    index += 2;
  }

  if (rest[index] === "r") {
    const parsedSort = callbackCodeToInventorySort(rest[index + 1]);

    if (!parsedSort) {
      return null;
    }

    sort = parsedSort;
    index += 2;
  }

  if (index === rest.length) {
    return { page: 0, filter, sort };
  }

  if (index === rest.length - 1) {
    const page = parsePage(rest[index]);

    return page === null ? null : { page, filter, sort };
  }

  return null;
}

function parseInventoryPagePromptRest(rest: string[]): {
  totalPages: number;
  filter: InventoryFilter;
  sort: InventorySort;
} | null {
  const totalPages = parsePage(rest.at(-1));

  if (totalPages === null || totalPages < 1) {
    return null;
  }

  const parsed = parseInventoryRest(rest.slice(0, -1));

  if (!parsed || parsed.page !== 0) {
    return null;
  }

  return {
    totalPages,
    filter: parsed.filter,
    sort: parsed.sort
  };
}

function formatInventoryNavigationSuffix(
  page: number,
  filter: InventoryFilter,
  sort: InventorySort
): string {
  const safePage = normalizePage(page);
  const filterSuffix = filter ? `:${filterToCallbackPart(filter)}` : "";
  const sortSuffix = formatInventorySortSuffix(sort);
  const pageSuffix = safePage === 0 ? "" : `:${safePage}`;

  return `${filterSuffix}${sortSuffix}${pageSuffix}`;
}

function formatInventorySortSuffix(sort: InventorySort): string {
  const sortCode = inventorySortToCallbackCode(sort);

  return sortCode ? `:r:${sortCode}` : "";
}

function filterToCallbackPart(filter: Exclude<InventoryFilter, null>): string {
  if (isInventoryEquipmentSlotFilter(filter)) {
    return `s:${slotToCode(filter)}`;
  }

  if (isOneUseInventoryFilter(filter)) {
    return "f:u";
  }

  throw new RangeError("Unsupported inventory filter.");
}

function callbackPartToFilter(kind: string | undefined, code: string | undefined): Exclude<InventoryFilter, null> | null {
  if (kind === "s") {
    return codeToSlot(code);
  }

  if (kind === "f" && code === "u") {
    return ONE_USE_INVENTORY_FILTER;
  }

  return null;
}

function slotToCode(slot: EquipmentSlot): string {
  const codes: Record<EquipmentSlot, string> = {
    weapon: "w",
    offhand: "o",
    head: "h",
    chest: "c",
    legs: "l",
    accessory: "a",
    tool: "t"
  };

  return codes[slot];
}

function codeToSlot(code: string | undefined): EquipmentSlot | null {
  const slotsByCode: Record<string, EquipmentSlot> = {
    w: "weapon",
    o: "offhand",
    h: "head",
    c: "chest",
    l: "legs",
    a: "accessory",
    t: "tool"
  };

  return code ? (slotsByCode[code] ?? null) : null;
}

function assertCallbackData(data: string): string {
  if (isTooLong(data)) {
    throw new RangeError("Telegram callback data exceeds 64 bytes.");
  }

  return data;
}

function isTooLong(data: string): boolean {
  return Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT;
}

function normalizePage(page: number): number {
  return Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));
}

function parsePage(value: string | undefined): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) {
    return null;
  }

  return Number(value);
}
