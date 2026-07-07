import { items } from "../../content";
import { contentIdSchema } from "../../content/schema";
import { buildItemCallbackKeyMaps, makeStableItemCallbackKey } from "./itemCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const PREFIX = "v1:up";
const { itemCallbackKeyById, itemIdByCallbackKey } = buildItemCallbackKeyMaps(
  items.map((item) => item.id),
  { makeKey: makeStableItemCallbackKey }
);

export type ItemUpgradeCallback =
  | { type: "list" }
  | { type: "preview"; itemId: string; method: "npc" | "self"; donorItemId: string | null }
  | {
      type: "attempt";
      itemId: string;
      method: "npc" | "self";
      donorItemId: string | null;
      expectedFromLevel: number;
      expectedQuantity: number;
      expectedPityFailures: number;
    };

export function makeItemUpgradeListCallbackData(): string {
  return assertCallbackData(`${PREFIX}:l`);
}

export function makeItemUpgradePreviewCallbackData(
  itemId: string,
  method: "npc" | "self" = "npc",
  donorItemId: string | null = null
): string {
  const donorSuffix = donorItemId ? `:d:${itemKey(donorItemId)}` : "";

  return assertCallbackData(`${PREFIX}:p:${itemKey(itemId)}:${methodCode(method)}${donorSuffix}`);
}

export function makeItemUpgradeAttemptCallbackData(input: {
  itemId: string;
  method: "npc" | "self";
  donorItemId?: string | null;
  expectedFromLevel: number;
  expectedQuantity: number;
  expectedPityFailures: number;
}): string {
  const donorSuffix = input.donorItemId ? `:d:${itemKey(input.donorItemId)}` : "";

  return assertCallbackData(
    `${PREFIX}:a:${itemKey(input.itemId)}:${methodCode(input.method)}:${safeSmallInt(input.expectedFromLevel)}:${safeSmallInt(input.expectedQuantity)}:${safeSmallInt(input.expectedPityFailures)}${donorSuffix}`
  );
}

export function parseItemUpgradeCallbackData(data: string | undefined): { ok: true; value: ItemUpgradeCallback } | { ok: false } {
  if (!data?.startsWith(`${PREFIX}:`) || Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return { ok: false };
  }

  if (data === `${PREFIX}:l`) {
    return { ok: true, value: { type: "list" } };
  }

  const [version, scope, action, itemKeyPart, methodPart, ...rest] = data.split(":");
  if (version !== "v1" || scope !== "up" || !itemKeyPart || !methodPart) {
    return { ok: false };
  }

  const itemId = itemIdFromKey(itemKeyPart);
  const method = codeToMethod(methodPart);
  if (!itemId || !method) {
    return { ok: false };
  }

  if (action === "p") {
    const donorItemId = parseDonorRest(rest);
    if (donorItemId === undefined) {
      return { ok: false };
    }

    return { ok: true, value: { type: "preview", itemId, method, donorItemId } };
  }

  if (action === "a") {
    if (rest.length !== 3 && rest.length !== 5) {
      return { ok: false };
    }

    const expectedFromLevel = parseSmallInt(rest[0]);
    const expectedQuantity = parseSmallInt(rest[1]);
    const expectedPityFailures = parseSmallInt(rest[2]);
    const donorItemId = parseDonorRest(rest.slice(3));
    if (
      expectedFromLevel === null ||
      expectedQuantity === null ||
      expectedPityFailures === null ||
      donorItemId === undefined
    ) {
      return { ok: false };
    }

    return {
      ok: true,
      value: {
        type: "attempt",
        itemId,
        method,
        donorItemId,
        expectedFromLevel,
        expectedQuantity,
        expectedPityFailures
      }
    };
  }

  return { ok: false };
}

function parseDonorRest(rest: string[]): string | null | undefined {
  if (rest.length === 0) {
    return null;
  }

  if (rest.length !== 2 || rest[0] !== "d" || !rest[1]) {
    return undefined;
  }

  return itemIdFromKey(rest[1]) ?? undefined;
}

function itemKey(itemId: string): string {
  return itemCallbackKeyById.get(itemId) ?? itemId;
}

function itemIdFromKey(key: string): string | null {
  const mapped = itemIdByCallbackKey.get(key);
  if (mapped) {
    return mapped;
  }

  return contentIdSchema.safeParse(key).success ? key : null;
}

function methodCode(method: "npc" | "self"): string {
  return method === "self" ? "s" : "n";
}

function codeToMethod(code: string): "npc" | "self" | null {
  return code === "s" ? "self" : code === "n" ? "npc" : null;
}

function parseSmallInt(value: string | undefined): number | null {
  if (!value || !/^\d{1,4}$/.test(value)) {
    return null;
  }

  return Number(value);
}

function safeSmallInt(value: number): number {
  return Math.max(0, Math.min(9999, Math.floor(value)));
}

function assertCallbackData(data: string): string {
  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    throw new RangeError("Telegram callback data exceeds 64 bytes.");
  }

  return data;
}
