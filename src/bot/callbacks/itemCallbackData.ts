import { contentIdSchema } from "../../content/schema";
import {
  ONE_USE_INVENTORY_FILTER,
  isInventoryEquipmentSlotFilter,
  isOneUseInventoryFilter,
  type InventoryFilter
} from "../inventoryFilter";
import type { EquipmentSlot } from "../../services/equipmentService";
import { equipmentSlots } from "../../services/equipmentService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const ITEM_PREFIX = "v1:item";
const EQUIPMENT_PREFIX = "v1:equip";

export type ItemCallback =
  | { type: "detail"; itemId: string; page: number; filter: InventoryFilter }
  | { type: "inventory"; page: number; filter: InventoryFilter }
  | { type: "page-prompt"; totalPages: number; filter: InventoryFilter };
export type EquipmentCallback =
  | { type: "view" }
  | { type: "equip-item"; itemId: string; targetSlot: EquipmentSlot | null; confirmTwohand: boolean }
  | { type: "clear-slot"; slot: EquipmentSlot };

export function makeItemDetailCallbackData(
  itemId: string,
  page = 0,
  filter: InventoryFilter = null
): string {
  const safePage = normalizePage(page);
  const filterSuffix = filter ? `:${filterToCallbackPart(filter)}` : "";
  const pageSuffix = safePage === 0 ? "" : `:${safePage}`;

  return assertCallbackData(`${ITEM_PREFIX}:detail:${itemId}${filterSuffix}${pageSuffix}`);
}

export function makeInventoryCallbackData(page = 0, filter: InventoryFilter = null): string {
  const safePage = normalizePage(page);
  const filterSuffix = filter ? `:${filterToCallbackPart(filter)}` : "";
  const pageSuffix = safePage === 0 ? "" : `:${safePage}`;

  return assertCallbackData(`${ITEM_PREFIX}:inventory${filterSuffix}${pageSuffix}`);
}

export function makeInventoryPagePromptCallbackData(
  totalPages: number,
  filter: InventoryFilter = null
): string {
  const safeTotalPages = Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1));
  const filterSuffix = filter ? `:${filterToCallbackPart(filter)}` : "";

  return assertCallbackData(`${ITEM_PREFIX}:page${filterSuffix}:${safeTotalPages}`);
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
        filter: null
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
        filter: parsed.filter
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
        filter: parsed.filter
      }
    };
  }

  if (action !== "detail" || rest.length < 1 || rest.length > 4) {
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
      filter: parsed.filter
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

  return assertCallbackData(`${EQUIPMENT_PREFIX}:item:${itemId}${targetSuffix}${confirmSuffix}`);
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

function parseInventoryRest(rest: string[]): { page: number; filter: InventoryFilter } | null {
  if (rest.length === 0) {
    return { page: 0, filter: null };
  }

  if (rest.length === 1) {
    const page = parsePage(rest[0]);

    return page === null ? null : { page, filter: null };
  }

  if (rest.length === 2 || rest.length === 3) {
    const filter = callbackPartToFilter(rest[0], rest[1]);

    if (!filter) {
      return null;
    }

    if (rest.length === 2) {
      return { page: 0, filter };
    }

    const page = parsePage(rest[2]);

    return page === null ? null : { page, filter };
  }

  return null;
}

function parseInventoryPagePromptRest(rest: string[]): { totalPages: number; filter: InventoryFilter } | null {
  if (rest.length === 1) {
    const totalPages = parsePage(rest[0]);

    return totalPages === null || totalPages < 1 ? null : { totalPages, filter: null };
  }

  if (rest.length === 3) {
    const filter = callbackPartToFilter(rest[0], rest[1]);
    const totalPages = parsePage(rest[2]);

    if (!filter || totalPages === null || totalPages < 1) {
      return null;
    }

    return { totalPages, filter };
  }

  return null;
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
