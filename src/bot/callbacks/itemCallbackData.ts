import { contentIdSchema } from "../../content/schema";

const ITEM_PREFIX = "v1:item";
const EQUIPMENT_PREFIX = "v1:equip";

export type ItemCallback = { type: "detail"; itemId: string } | { type: "inventory" };
export type EquipmentCallback = { type: "view" };

export function makeItemDetailCallbackData(itemId: string): string {
  return `${ITEM_PREFIX}:detail:${itemId}`;
}

export function makeInventoryCallbackData(): string {
  return `${ITEM_PREFIX}:inventory`;
}

export function parseItemCallbackData(data: string | undefined): ParseItemCallbackResult {
  if (!data?.startsWith("v1:")) {
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
  return `${EQUIPMENT_PREFIX}:view`;
}

export function parseEquipmentCallbackData(data: string | undefined): ParseEquipmentCallbackResult {
  if (!data?.startsWith("v1:")) {
    return { ok: false };
  }

  if (data !== `${EQUIPMENT_PREFIX}:view`) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      type: "view"
    }
  };
}

type ParseItemCallbackResult = { ok: true; value: ItemCallback } | { ok: false };
type ParseEquipmentCallbackResult = { ok: true; value: EquipmentCallback } | { ok: false };
