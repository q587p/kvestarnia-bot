import { contentIdSchema } from "../../content/schema";
import type { EquipmentSlot } from "../../services/equipmentService";
import { equipmentSlots } from "../../services/equipmentService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const ITEM_PREFIX = "v1:item";
const EQUIPMENT_PREFIX = "v1:equip";

export type ItemCallback = { type: "detail"; itemId: string } | { type: "inventory" };
export type EquipmentCallback =
  | { type: "view" }
  | { type: "equip-item"; itemId: string }
  | { type: "clear-slot"; slot: EquipmentSlot };

export function makeItemDetailCallbackData(itemId: string): string {
  return assertCallbackData(`${ITEM_PREFIX}:detail:${itemId}`);
}

export function makeInventoryCallbackData(): string {
  return assertCallbackData(`${ITEM_PREFIX}:inventory`);
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
        type: "inventory"
      }
    };
  }

  const [version, scope, action, ...rest] = data.split(":");

  if (version !== "v1" || scope !== "item" || action !== "detail" || rest.length !== 1) {
    return { ok: false };
  }

  const itemId = rest[0];

  if (!itemId) {
    return { ok: false };
  }

  if (!contentIdSchema.safeParse(itemId).success) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      type: "detail",
      itemId
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

function assertCallbackData(data: string): string {
  if (isTooLong(data)) {
    throw new RangeError("Telegram callback data exceeds 64 bytes.");
  }

  return data;
}

function isTooLong(data: string): boolean {
  return Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT;
}
