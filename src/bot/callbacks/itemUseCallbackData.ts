import { contentIdSchema } from "../../content/schema";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

const PREFIX = "v1:use";
const tokenPattern = /^[0-9a-f-]{36}$/i;

export type ItemUseCallback =
  | { type: "preview"; itemId: string }
  | { type: "confirm"; token: string }
  | { type: "cancel"; token: string };

export function makeItemUsePreviewCallbackData(itemId: string): string {
  return assertCallbackData(`${PREFIX}:p:${itemId}`);
}

export function makeItemUseConfirmCallbackData(token: string): string {
  return assertCallbackData(`${PREFIX}:ok:${token}`);
}

export function makeItemUseCancelCallbackData(token: string): string {
  return assertCallbackData(`${PREFIX}:no:${token}`);
}

export function parseItemUseCallbackData(data: string | undefined): ParseItemUseCallbackResult {
  if (!data?.startsWith(`${PREFIX}:`)) {
    return { ok: false };
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return { ok: false };
  }

  const [, section, action, value, ...rest] = data.split(":");
  if (section !== "use" || rest.length > 0 || !value) {
    return { ok: false };
  }

  if (action === "p") {
    if (!contentIdSchema.safeParse(value).success) {
      return { ok: false };
    }

    return { ok: true, value: { type: "preview", itemId: value } };
  }

  if ((action === "ok" || action === "no") && tokenPattern.test(value)) {
    return {
      ok: true,
      value: {
        type: action === "ok" ? "confirm" : "cancel",
        token: value
      }
    };
  }

  return { ok: false };
}

type ParseItemUseCallbackResult = { ok: true; value: ItemUseCallback } | { ok: false };

function assertCallbackData(data: string): string {
  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    throw new RangeError("Item use callback data exceeds Telegram callback data limit.");
  }

  return data;
}
