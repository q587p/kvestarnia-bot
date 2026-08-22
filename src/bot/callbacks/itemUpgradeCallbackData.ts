import { items } from "../../content";
import { contentIdSchema } from "../../content/schema";
import {
  DEFAULT_INVENTORY_SORT,
  callbackCodeToInventorySort,
  inventorySortToCallbackCode,
  type InventorySort
} from "../inventorySort";
import { buildItemCallbackKeyMaps, makeStableItemCallbackKey } from "./itemCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const PREFIX = "v1:up";
const { itemCallbackKeyById, itemIdByCallbackKey } = buildItemCallbackKeyMaps(
  items.map((item) => item.id),
  { makeKey: makeStableItemCallbackKey }
);

export type ItemUpgradeCallback =
  | { type: "list"; page: number; sort: InventorySort }
  | { type: "page-prompt"; totalPages: number; sort: InventorySort }
  | { type: "unlock" }
  | { type: "dismantle-list"; page: number }
  | { type: "dismantle-preview"; itemId: string }
  | {
      type: "dismantle-confirm";
      itemId: string;
      expectedQuantity: number;
      expectedRemortCount: number;
      expectedYield: number;
      payment: "gold" | "mana";
      rulesFingerprint: string;
      guard: string;
    }
  | { type: "preview"; itemId: string; method: "npc" | "self"; donorItemId: string | null }
  | {
      type: "attempt";
      itemId: string;
      method: "npc" | "self";
      donorItemId: string | null;
      expectedFromLevel: number;
      expectedQuantity: number;
      expectedPityFailures: number;
      attemptGuard: string | null;
    };

export function makeItemUpgradeListCallbackData(
  page = 0,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): string {
  const safePage = safeSmallInt(page);
  const sortSuffix = formatSortSuffix(sort);
  const pageSuffix = safePage > 0 ? `:${safePage}` : "";

  return assertCallbackData(`${PREFIX}:l${sortSuffix}${pageSuffix}`);
}

export function makeItemUpgradePagePromptCallbackData(
  totalPages: number,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): string {
  const safeTotalPages = Math.max(1, Math.floor(Number.isFinite(totalPages) ? totalPages : 1));

  return assertCallbackData(`${PREFIX}:page${formatSortSuffix(sort)}:${safeTotalPages}`);
}

export function makeItemUpgradeUnlockCallbackData(): string {
  return assertCallbackData(`${PREFIX}:u`);
}

export function makeItemDismantleListCallbackData(page = 0): string {
  return assertCallbackData(`${PREFIX}:dl:${safeSmallInt(page)}`);
}

export function makeItemDismantlePreviewCallbackData(itemId: string): string {
  return assertCallbackData(`${PREFIX}:dp:${itemKey(itemId)}`);
}

export function makeItemDismantleConfirmCallbackData(input: {
  itemId: string;
  expectedQuantity: number;
  expectedRemortCount: number;
  expectedYield: number;
  payment: "gold" | "mana";
  rulesFingerprint: string;
  guard: string;
}): string {
  if (!isAttemptGuard(input.rulesFingerprint) || !isAttemptGuard(input.guard)) {
    throw new RangeError("Invalid dismantle callback guard.");
  }
  return assertCallbackData([
    PREFIX,
    "dc",
    itemKey(input.itemId),
    safeSmallInt(input.expectedQuantity),
    safeSmallInt(input.expectedRemortCount),
    safeSmallInt(input.expectedYield),
    input.payment === "mana" ? "m" : "g",
    input.rulesFingerprint,
    input.guard
  ].join(":"));
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
  attemptGuard: string;
  expectedFromLevel: number;
  expectedQuantity: number;
  expectedPityFailures: number;
}): string {
  const donorSuffix = input.donorItemId ? `:d:${itemKey(input.donorItemId)}` : "";
  const guardSuffix = `:g:${safeAttemptGuard(input.attemptGuard)}`;

  return assertCallbackData(
    `${PREFIX}:a:${itemKey(input.itemId)}:${methodCode(input.method)}:${safeSmallInt(input.expectedFromLevel)}:${safeSmallInt(input.expectedQuantity)}:${safeSmallInt(input.expectedPityFailures)}${guardSuffix}${donorSuffix}`
  );
}

export function parseItemUpgradeCallbackData(data: string | undefined): { ok: true; value: ItemUpgradeCallback } | { ok: false } {
  if (!data?.startsWith(`${PREFIX}:`) || Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return { ok: false };
  }

  if (data === `${PREFIX}:l`) {
    return { ok: true, value: { type: "list", page: 0, sort: DEFAULT_INVENTORY_SORT } };
  }

  if (data.startsWith(`${PREFIX}:l:`)) {
    const [version, scope, action, ...rest] = data.split(":");
    const parsed = parseListRest(rest);
    if (version !== "v1" || scope !== "up" || action !== "l" || !parsed) {
      return { ok: false };
    }

    return { ok: true, value: { type: "list", page: parsed.page, sort: parsed.sort } };
  }

  if (data.startsWith(`${PREFIX}:page:`)) {
    const [version, scope, action, ...rest] = data.split(":");
    const parsed = parsePagePromptRest(rest);
    if (version !== "v1" || scope !== "up" || action !== "page" || !parsed) {
      return { ok: false };
    }

    return { ok: true, value: { type: "page-prompt", ...parsed } };
  }

  if (data === `${PREFIX}:u`) {
    return { ok: true, value: { type: "unlock" } };
  }

  if (data.startsWith(`${PREFIX}:dl:`)) {
    const parts = data.split(":");
    const page = parseSmallInt(parts[3]);
    return parts.length === 4 && page !== null
      ? { ok: true, value: { type: "dismantle-list", page } }
      : { ok: false };
  }

  if (data.startsWith(`${PREFIX}:dp:`)) {
    const parts = data.split(":");
    const itemId = itemIdFromKey(parts[3] ?? "");
    return parts.length === 4 && itemId
      ? { ok: true, value: { type: "dismantle-preview", itemId } }
      : { ok: false };
  }

  if (data.startsWith(`${PREFIX}:dc:`)) {
    const parts = data.split(":");
    const itemId = itemIdFromKey(parts[3] ?? "");
    const expectedQuantity = parseSmallInt(parts[4]);
    const expectedRemortCount = parseSmallInt(parts[5]);
    const expectedYield = parseSmallInt(parts[6]);
    const payment = parts[7] === "m" ? "mana" as const : parts[7] === "g" ? "gold" as const : null;
    const rulesFingerprint = parts[8];
    const guard = parts[9];
    return parts.length === 10 && itemId && expectedQuantity !== null && expectedRemortCount !== null &&
      expectedYield !== null && payment && isAttemptGuard(rulesFingerprint) && isAttemptGuard(guard)
      ? {
          ok: true,
          value: {
            type: "dismantle-confirm",
            itemId,
            expectedQuantity,
            expectedRemortCount,
            expectedYield,
            payment,
            rulesFingerprint,
            guard
          }
        }
      : { ok: false };
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
    if (rest.length < 3) {
      return { ok: false };
    }

    const expectedFromLevel = parseSmallInt(rest[0]);
    const expectedQuantity = parseSmallInt(rest[1]);
    const expectedPityFailures = parseSmallInt(rest[2]);
    const tail = parseAttemptTail(rest.slice(3));
    if (
      expectedFromLevel === null ||
      expectedQuantity === null ||
      expectedPityFailures === null ||
      !tail
    ) {
      return { ok: false };
    }

    return {
      ok: true,
      value: {
        type: "attempt",
        itemId,
        method,
        donorItemId: tail.donorItemId,
        attemptGuard: tail.attemptGuard,
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

function parseAttemptTail(rest: string[]): { donorItemId: string | null; attemptGuard: string | null } | null {
  let donorItemId: string | null = null;
  let attemptGuard: string | null = null;

  for (let index = 0; index < rest.length; index += 2) {
    const kind = rest[index];
    const value = rest[index + 1];
    if (!kind || !value) {
      return null;
    }

    if (kind === "d") {
      if (donorItemId !== null) {
        return null;
      }
      donorItemId = itemIdFromKey(value);
      if (!donorItemId) {
        return null;
      }
      continue;
    }

    if (kind === "g") {
      if (attemptGuard !== null || !isAttemptGuard(value)) {
        return null;
      }
      attemptGuard = value;
      continue;
    }

    return null;
  }

  return { donorItemId, attemptGuard };
}

function parseListRest(rest: string[]): { page: number; sort: InventorySort } | null {
  if (rest.length === 0) {
    return { page: 0, sort: DEFAULT_INVENTORY_SORT };
  }

  let index = 0;
  let sort: InventorySort = DEFAULT_INVENTORY_SORT;

  if (rest[index] === "r") {
    const parsedSort = callbackCodeToInventorySort(rest[index + 1]);
    if (!parsedSort) {
      return null;
    }

    sort = parsedSort;
    index += 2;
  }

  if (index === rest.length) {
    return { page: 0, sort };
  }

  if (index === rest.length - 1) {
    const page = parseSmallInt(rest[index]);

    return page === null ? null : { page, sort };
  }

  return null;
}

function parsePagePromptRest(rest: string[]): { totalPages: number; sort: InventorySort } | null {
  const totalPages = parseSmallInt(rest.at(-1));
  if (totalPages === null || totalPages < 1) {
    return null;
  }

  const parsed = parseListRest(rest.slice(0, -1));
  if (!parsed || parsed.page !== 0) {
    return null;
  }

  return {
    totalPages,
    sort: parsed.sort
  };
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

function formatSortSuffix(sort: InventorySort): string {
  const sortCode = inventorySortToCallbackCode(sort);

  return sortCode ? `:r:${sortCode}` : "";
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

function safeAttemptGuard(value: string): string {
  if (!isAttemptGuard(value)) {
    throw new RangeError("Invalid item upgrade attempt guard.");
  }

  return value;
}

function isAttemptGuard(value: string | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{8}$/.test(value));
}

function assertCallbackData(data: string): string {
  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    throw new RangeError("Telegram callback data exceeds 64 bytes.");
  }

  return data;
}
