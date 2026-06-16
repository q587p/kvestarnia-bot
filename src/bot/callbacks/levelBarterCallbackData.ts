import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const LEVEL_BARTER_PREFIX = "v1:lvlx";
const tokenPattern = /^[0-9a-f]{16}$/i;

export type LevelBarterCallback =
  | { type: "open" }
  | { type: "auto" }
  | { type: "confirm"; token: string };

export function makeLevelBarterOpenCallbackData(): string {
  return assertCallbackData(`${LEVEL_BARTER_PREFIX}:open`);
}

export function makeLevelBarterAutoCallbackData(): string {
  return assertCallbackData(`${LEVEL_BARTER_PREFIX}:auto`);
}

export function makeLevelBarterConfirmCallbackData(token: string): string {
  return assertCallbackData(`${LEVEL_BARTER_PREFIX}:confirm:${token}`);
}

export function parseLevelBarterCallbackData(data: string | undefined): ParseLevelBarterCallbackResult {
  if (!data?.startsWith(`${LEVEL_BARTER_PREFIX}:`) || isTooLong(data)) {
    return { ok: false };
  }

  const [version, scope, action, token, ...rest] = data.split(":");

  if (version !== "v1" || scope !== "lvlx" || rest.length > 0) {
    return { ok: false };
  }

  if ((action === "open" || action === "auto") && token === undefined) {
    return {
      ok: true,
      value: {
        type: action
      }
    };
  }

  if (action === "confirm" && tokenPattern.test(token ?? "")) {
    return {
      ok: true,
      value: {
        type: "confirm",
        token: token ?? ""
      }
    };
  }

  return { ok: false };
}

type ParseLevelBarterCallbackResult =
  | { ok: true; value: LevelBarterCallback }
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
