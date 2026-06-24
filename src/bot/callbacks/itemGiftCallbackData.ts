import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type ItemGiftCallback =
  | { type: "open"; page: number }
  | { type: "select-target"; targetTelegramUserId: bigint; page: number }
  | { type: "select-page"; targetTelegramUserId: bigint; page: number }
  | { type: "create"; targetTelegramUserId: bigint; page: number; index: number }
  | { type: "accept"; token: string }
  | { type: "decline"; token: string }
  | { type: "cancel"; token: string };

export type ItemGiftCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-token"
  | "invalid-target"
  | "invalid-page"
  | "invalid-index"
  | "too-long";

const PREFIX = "v1:gift";
const pagePattern = /^[0-9a-z]{1,3}$/;
const targetPattern = /^[0-9a-z]{1,13}$/;
const indexPattern = /^[0-9a-z]{1,3}$/;
const tokenPattern = /^[0-9A-Za-z_-]{8,64}$/;

export function makeItemGiftOpenCallbackData(page = 0): string {
  return page === 0 ? `${PREFIX}:open` : `${PREFIX}:p:${page.toString(36)}`;
}

export function makeItemGiftTargetCallbackData(targetTelegramUserId: bigint, page: number): string {
  return `${PREFIX}:t:${targetTelegramUserId.toString(36)}:${page.toString(36)}`;
}

export function makeItemGiftSelectionPageCallbackData(targetTelegramUserId: bigint, page: number): string {
  return `${PREFIX}:sp:${targetTelegramUserId.toString(36)}:${page.toString(36)}`;
}

export function makeItemGiftCreateCallbackData(targetTelegramUserId: bigint, page: number, index: number): string {
  return `${PREFIX}:i:${targetTelegramUserId.toString(36)}:${page.toString(36)}:${index.toString(36)}`;
}

export function makeItemGiftAcceptCallbackData(token: string): string {
  return `${PREFIX}:a:${token}`;
}

export function makeItemGiftDeclineCallbackData(token: string): string {
  return `${PREFIX}:d:${token}`;
}

export function makeItemGiftCancelCallbackData(token: string): string {
  return `${PREFIX}:c:${token}`;
}

export function parseItemGiftCallbackData(
  data: string | undefined
): Result<ItemGiftCallback, ItemGiftCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (data === `${PREFIX}:open`) {
    return ok({ type: "open", page: 0 });
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  const [, section, action, first, second, third, ...rest] = data.split(":");
  if (section !== "gift" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "p") {
    if (!first || !pagePattern.test(first) || second !== undefined || third !== undefined) {
      return err("invalid-page");
    }

    return ok({ type: "open", page: Number.parseInt(first, 36) });
  }

  if (action === "t" || action === "sp") {
    if (!first || !targetPattern.test(first)) {
      return err("invalid-target");
    }
    if (!second || !pagePattern.test(second) || third !== undefined) {
      return err("invalid-page");
    }

    return ok({
      type: action === "t" ? "select-target" : "select-page",
      targetTelegramUserId: parseBase36BigInt(first),
      page: Number.parseInt(second, 36)
    });
  }

  if (action === "i") {
    if (!first || !targetPattern.test(first)) {
      return err("invalid-target");
    }
    if (!second || !pagePattern.test(second)) {
      return err("invalid-page");
    }
    if (!third || !indexPattern.test(third)) {
      return err("invalid-index");
    }

    return ok({
      type: "create",
      targetTelegramUserId: parseBase36BigInt(first),
      page: Number.parseInt(second, 36),
      index: Number.parseInt(third, 36)
    });
  }

  if (action === "a" || action === "d" || action === "c") {
    if (!first || !tokenPattern.test(first) || second !== undefined || third !== undefined) {
      return err("invalid-token");
    }

    return ok({
      type: action === "a" ? "accept" : action === "d" ? "decline" : "cancel",
      token: first
    });
  }

  return err("invalid-action");
}

function parseBase36BigInt(value: string): bigint {
  let result = 0n;

  for (const char of value) {
    result = result * 36n + BigInt(Number.parseInt(char, 36));
  }

  return result;
}
