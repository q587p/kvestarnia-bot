import { contentIdSchema } from "../../content/schema";
import type { EquipmentSlot } from "../../services/equipmentService";
import { equipmentSlots } from "../../services/equipmentService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const ITEM_PREFIX = "v1:item";
const EQUIPMENT_PREFIX = "v1:equip";

export type ItemCallback =
  | { type: "detail"; itemId: string; page: number; slot: EquipmentSlot | null }
  | { type: "inventory"; page: number; slot: EquipmentSlot | null };
export type EquipmentCallback =
  | { type: "view" }
  | { type: "equip-item"; itemId: string }
  | { type: "clear-slot"; slot: EquipmentSlot };

export function makeItemDetailCallbackData(
  itemId: string,
  page = 0,
  slot: EquipmentSlot | null = null
): string {
  const safePage = normalizePage(page);
  const slotSuffix = slot ? `:s:${slotToCode(slot)}` : "";
  const pageSuffix = safePage === 0 ? "" : `:${safePage}`;

  return assertCallbackData(`${ITEM_PREFIX}:detail:${itemId}${slotSuffix}${pageSuffix}`);
}

export function makeInventoryCallbackData(page = 0, slot: EquipmentSlot | null = null): string {
  const safePage = normalizePage(page);
  const slotSuffix = slot ? `:s:${slotToCode(slot)}` : "";
  const pageSuffix = safePage === 0 ? "" : `:${safePage}`;

  return assertCallbackData(`${ITEM_PREFIX}:inventory${slotSuffix}${pageSuffix}`);
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
        slot: null
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
        slot: parsed.slot
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
      slot: parsed.slot
    }
  };
}

export function makeEquipmentCallbackData(): string {
  return assertCallbackData(`${EQUIPMENT_PREFIX}:view`);
}

export function makeEquipItemCallbackData(itemId: string): string {
  return assertCallbackData(`${EQUIPMENT_PREFIX}:item:${itemId}`);
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

  if (version !== "v1" || scope !== "equip" || rest.length !== 1) {
    return { ok: false };
  }

  if (action === "item") {
    const itemId = rest[0];

    if (!itemId || !contentIdSchema.safeParse(itemId).success) {
      return { ok: false };
    }

    return {
      ok: true,
      value: {
        type: "equip-item",
        itemId
      }
    };
  }

  if (action === "clear") {
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

function parseInventoryRest(rest: string[]): { page: number; slot: EquipmentSlot | null } | null {
  if (rest.length === 0) {
    return { page: 0, slot: null };
  }

  if (rest.length === 1) {
    const page = parsePage(rest[0]);

    return page === null ? null : { page, slot: null };
  }

  if (rest.length === 2 || rest.length === 3) {
    if (rest[0] !== "s") {
      return null;
    }

    const slot = codeToSlot(rest[1]);

    if (!slot) {
      return null;
    }

    if (rest.length === 2) {
      return { page: 0, slot };
    }

    const page = parsePage(rest[2]);

    return page === null ? null : { page, slot };
  }

  return null;
}

function slotToCode(slot: EquipmentSlot): string {
  const codes: Record<EquipmentSlot, string> = {
    weapon: "w",
    head: "h",
    chest: "c",
    legs: "l",
    accessory: "a"
  };

  return codes[slot];
}

function codeToSlot(code: string | undefined): EquipmentSlot | null {
  const slotsByCode: Record<string, EquipmentSlot> = {
    w: "weapon",
    h: "head",
    c: "chest",
    l: "legs",
    a: "accessory"
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
