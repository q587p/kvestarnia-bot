import { createHash } from "crypto";
import { items } from "../../content/items";
import type { ItemUpgradeMethod } from "../../domain/itemUpgrades";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";
import type { CallbackParseResult } from "../callbackRoute";

const PREFIX = "v1:upg";

export type ItemUpgradeCallback =
  | { type: "menu" }
  | { type: "preview"; method: ItemUpgradeMethod; itemKey: string; donorItemKey: string | null }
  | { type: "order"; itemKey: string; donorItemKey: string | null }
  | {
      type: "attempt";
      method: ItemUpgradeMethod;
      itemKey: string;
      fromLevel: number;
      expectedQuantity: number | null;
      expectedPityFailures: number | null;
      donorItemKey: string | null;
    }
  | { type: "attempt-order"; token: string };

export function getItemUpgradeCallbackKey(itemId: string): string {
  return createHash("sha256").update(itemId).digest("base64url").slice(0, 8);
}

export function resolveItemUpgradeCallbackKey(itemKey: string): string | null {
  let match: string | null = null;

  for (const item of items) {
    if (getItemUpgradeCallbackKey(item.id) !== itemKey) {
      continue;
    }

    if (match) {
      return null;
    }

    match = item.id;
  }

  return match;
}

export function makeItemUpgradeMenuCallbackData(): string {
  return assertCallbackData(`${PREFIX}:m`);
}

export function makeItemUpgradePreviewCallbackData(input: {
  method: ItemUpgradeMethod;
  itemId: string;
  donorItemId?: string | null;
}): string {
  return assertCallbackData([
    PREFIX,
    "p",
    methodToken(input.method),
    getItemUpgradeCallbackKey(input.itemId),
    input.donorItemId ? getItemUpgradeCallbackKey(input.donorItemId) : null
  ].filter(Boolean).join(":"));
}

export function makeItemUpgradeOrderCallbackData(itemId: string, donorItemId?: string | null): string {
  return assertCallbackData([
    PREFIX,
    "o",
    getItemUpgradeCallbackKey(itemId),
    donorItemId ? getItemUpgradeCallbackKey(donorItemId) : null
  ].filter(Boolean).join(":"));
}

export function makeItemUpgradeAttemptCallbackData(input: {
  method: ItemUpgradeMethod;
  itemId: string;
  fromLevel: number;
  expectedQuantity?: number | null;
  expectedPityFailures?: number | null;
  donorItemId?: string | null;
}): string {
  return assertCallbackData(
    [
      PREFIX,
      "a",
      methodToken(input.method),
      getItemUpgradeCallbackKey(input.itemId),
      String(input.fromLevel),
      String(Math.max(0, Math.floor(input.expectedQuantity ?? 0))),
      String(Math.max(0, Math.floor(input.expectedPityFailures ?? 0))),
      input.donorItemId ? getItemUpgradeCallbackKey(input.donorItemId) : null
    ].filter(Boolean).join(":")
  );
}

export function makeItemUpgradeAttemptOrderCallbackData(token: string): string {
  return assertCallbackData(`${PREFIX}:ao:${token}`);
}

export function parseItemUpgradeCallbackData(data: string): CallbackParseResult<ItemUpgradeCallback> {
  const parts = data.split(":");

  if (parts[0] !== "v1" || parts[1] !== "upg") {
    return { ok: false };
  }

  if (parts[2] === "m" && parts.length === 3) {
    return { ok: true, value: { type: "menu" } };
  }

  if (parts[2] === "p" && (parts.length === 5 || parts.length === 6)) {
    const method = parseMethodToken(parts[3]!);
    return method
      ? { ok: true, value: { type: "preview", method, itemKey: parts[4]!, donorItemKey: parts[5] ?? null } }
      : { ok: false };
  }

  if (parts[2] === "o" && (parts.length === 4 || parts.length === 5)) {
    return { ok: true, value: { type: "order", itemKey: parts[3]!, donorItemKey: parts[4] ?? null } };
  }

  if (parts[2] === "a" && (parts.length === 6 || parts.length === 7)) {
    const method = parseMethodToken(parts[3]!);
    const fromLevel = Number.parseInt(parts[5]!, 10);
    return method && Number.isInteger(fromLevel)
      ? {
          ok: true,
          value: {
            type: "attempt",
            method,
            itemKey: parts[4]!,
            fromLevel,
            expectedQuantity: null,
            expectedPityFailures: null,
            donorItemKey: parts[6] ?? null
          }
        }
      : { ok: false };
  }

  if (parts[2] === "a" && (parts.length === 8 || parts.length === 9)) {
    const method = parseMethodToken(parts[3]!);
    const fromLevel = Number.parseInt(parts[5]!, 10);
    const expectedQuantity = Number.parseInt(parts[6]!, 10);
    const expectedPityFailures = Number.parseInt(parts[7]!, 10);
    return method &&
      Number.isInteger(fromLevel) &&
      Number.isInteger(expectedQuantity) &&
      Number.isInteger(expectedPityFailures)
      ? {
          ok: true,
          value: {
            type: "attempt",
            method,
            itemKey: parts[4]!,
            fromLevel,
            expectedQuantity,
            expectedPityFailures,
            donorItemKey: parts[8] ?? null
          }
        }
      : { ok: false };
  }

  if (parts[2] === "ao" && parts.length === 4) {
    return { ok: true, value: { type: "attempt-order", token: parts[3]! } };
  }

  return { ok: false };
}

function methodToken(method: ItemUpgradeMethod): "n" | "s" {
  return method === "self" ? "s" : "n";
}

function parseMethodToken(token: string): ItemUpgradeMethod | null {
  if (token === "n") {
    return "npc";
  }

  if (token === "s") {
    return "self";
  }

  return null;
}

function assertCallbackData(data: string): string {
  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    throw new Error(`Item upgrade callback data exceeds Telegram limit: ${data}`);
  }

  return data;
}
