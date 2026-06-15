import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const CHEST_PREFIX = "v1:chest";
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MantokChestCallback =
  | { type: "open" }
  | { type: "help" }
  | { type: "auto" }
  | { type: "manual" }
  | { type: "page"; token: string; page: number }
  | { type: "add"; token: string; page: number; index: number }
  | { type: "remove"; token: string; page: number; index: number }
  | { type: "preview"; token: string }
  | { type: "confirm"; token: string }
  | { type: "cancel"; token: string }
  | { type: "inventory" };

export function makeMantokChestOpenCallbackData(): string {
  return assertCallbackData(`${CHEST_PREFIX}:open`);
}

export function makeMantokChestHelpCallbackData(): string {
  return assertCallbackData(`${CHEST_PREFIX}:help`);
}

export function makeMantokChestAutoCallbackData(): string {
  return assertCallbackData(`${CHEST_PREFIX}:auto`);
}

export function makeMantokChestManualCallbackData(): string {
  return assertCallbackData(`${CHEST_PREFIX}:manual`);
}

export function makeMantokChestPageCallbackData(token: string, page: number): string {
  return assertCallbackData(`${CHEST_PREFIX}:page:${token}:${page}`);
}

export function makeMantokChestAddCallbackData(token: string, page: number, index: number): string {
  return assertCallbackData(`${CHEST_PREFIX}:add:${token}:${page}:${index}`);
}

export function makeMantokChestRemoveCallbackData(token: string, page: number, index: number): string {
  return assertCallbackData(`${CHEST_PREFIX}:rm:${token}:${page}:${index}`);
}

export function makeMantokChestPreviewCallbackData(token: string): string {
  return assertCallbackData(`${CHEST_PREFIX}:preview:${token}`);
}

export function makeMantokChestConfirmCallbackData(token: string): string {
  return assertCallbackData(`${CHEST_PREFIX}:confirm:${token}`);
}

export function makeMantokChestCancelCallbackData(token: string): string {
  return assertCallbackData(`${CHEST_PREFIX}:cancel:${token}`);
}

export function makeMantokChestInventoryCallbackData(): string {
  return assertCallbackData(`${CHEST_PREFIX}:inventory`);
}

export function parseMantokChestCallbackData(data: string | undefined): ParseMantokChestCallbackResult {
  if (!data?.startsWith(`${CHEST_PREFIX}:`) || isTooLong(data)) {
    return { ok: false };
  }

  const [version, scope, action, token, page, index, ...rest] = data.split(":");

  if (version !== "v1" || scope !== "chest" || rest.length > 0) {
    return { ok: false };
  }

  if (action === "open" || action === "help" || action === "auto" || action === "manual" || action === "inventory") {
    return token === undefined
      ? {
          ok: true,
          value: {
            type: action
          }
        }
      : { ok: false };
  }

  if ((action === "confirm" || action === "cancel" || action === "preview") && tokenPattern.test(token ?? "") && page === undefined) {
    return {
      ok: true,
      value: {
        type: action,
        token: token ?? ""
      }
    };
  }

  if (action === "page" && tokenPattern.test(token ?? "") && isSafeIndex(page) && index === undefined) {
    return {
      ok: true,
      value: {
        type: "page",
        token: token ?? "",
        page: Number(page)
      }
    };
  }

  if ((action === "add" || action === "rm") && tokenPattern.test(token ?? "") && isSafeIndex(page) && isSafeIndex(index)) {
    return {
      ok: true,
      value: {
        type: action === "add" ? "add" : "remove",
        token: token ?? "",
        page: Number(page),
        index: Number(index)
      }
    };
  }

  return { ok: false };
}

type ParseMantokChestCallbackResult =
  | { ok: true; value: MantokChestCallback }
  | { ok: false };

function assertCallbackData(data: string): string {
  if (isTooLong(data)) {
    throw new RangeError("Telegram callback data exceeds 64 bytes.");
  }

  return data;
}

function isTooLong(data: string): boolean {
  return Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT;
}

function isSafeIndex(value: string | undefined): boolean {
  if (value === undefined || !/^\d{1,3}$/.test(value)) {
    return false;
  }

  return Number.isSafeInteger(Number(value));
}
