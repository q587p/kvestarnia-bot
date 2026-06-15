import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const CHEST_PREFIX = "v1:chest";
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MantokChestCallback =
  | { type: "open" }
  | { type: "help" }
  | { type: "auto" }
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

  const [version, scope, action, token, ...rest] = data.split(":");

  if (version !== "v1" || scope !== "chest" || rest.length > 0) {
    return { ok: false };
  }

  if (action === "open" || action === "help" || action === "auto" || action === "inventory") {
    return token === undefined
      ? {
          ok: true,
          value: {
            type: action
          }
        }
      : { ok: false };
  }

  if ((action === "confirm" || action === "cancel") && tokenPattern.test(token ?? "")) {
    return {
      ok: true,
      value: {
        type: action,
        token: token ?? ""
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
