import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type ItemPostalCallback =
  | { type: "open"; page: number }
  | { type: "recipient"; receiverTelegramUserId: bigint; page: number }
  | { type: "page"; token: string; page: number }
  | { type: "add"; token: string; page: number; index: number; selectionGuard: string }
  | { type: "quantity"; token: string; lineIndex: number; quantity: number; page: number }
  | { type: "remove"; token: string; lineIndex: number; page: number }
  | { type: "confirm"; token: string }
  | { type: "accept"; token: string }
  | { type: "decline"; token: string }
  | { type: "cancel"; token: string };

export type ItemPostalCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-token"
  | "invalid-target"
  | "invalid-page"
  | "invalid-index"
  | "invalid-quantity"
  | "invalid-selection"
  | "too-long";

const PREFIX = "v1:post";
const tokenPattern = /^[0-9A-Za-z_-]{8,32}$/;
const base36Pattern = /^[0-9a-z]{1,13}$/;
const selectionGuardPattern = /^[0-9A-Za-z_-]{8,16}$/;

export function makeItemPostalOpenCallbackData(page = 0): string {
  return page === 0 ? `${PREFIX}:open` : `${PREFIX}:o:${page.toString(36)}`;
}

export function makeItemPostalRecipientCallbackData(receiverTelegramUserId: bigint, page: number): string {
  return `${PREFIX}:r:${receiverTelegramUserId.toString(36)}:${page.toString(36)}`;
}

export function makeItemPostalPageCallbackData(token: string, page: number): string {
  return `${PREFIX}:p:${token}:${page.toString(36)}`;
}

export function makeItemPostalAddCallbackData(
  token: string,
  page: number,
  index: number,
  selectionGuard: string
): string {
  return `${PREFIX}:a:${token}:${page.toString(36)}:${index.toString(36)}:${selectionGuard}`;
}

export function makeItemPostalQuantityCallbackData(
  token: string,
  lineIndex: number,
  quantity: number,
  page: number
): string {
  return `${PREFIX}:q:${token}:${lineIndex.toString(36)}:${quantity.toString(36)}:${page.toString(36)}`;
}

export function makeItemPostalRemoveCallbackData(token: string, lineIndex: number, page: number): string {
  return `${PREFIX}:rm:${token}:${lineIndex.toString(36)}:${page.toString(36)}`;
}

export function makeItemPostalConfirmCallbackData(token: string): string {
  return `${PREFIX}:cf:${token}`;
}

export function makeItemPostalAcceptCallbackData(token: string): string {
  return `${PREFIX}:ok:${token}`;
}

export function makeItemPostalDeclineCallbackData(token: string): string {
  return `${PREFIX}:no:${token}`;
}

export function makeItemPostalCancelCallbackData(token: string): string {
  return `${PREFIX}:cx:${token}`;
}

export function parseItemPostalCallbackData(data: string | undefined): Result<ItemPostalCallback, ItemPostalCallbackError> {
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

  const [, section, action, first, second, third, fourth, ...rest] = data.split(":");
  if (section !== "post" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "o") {
    if (!first || !base36Pattern.test(first) || second !== undefined) {
      return err("invalid-page");
    }
    return ok({ type: "open", page: Number.parseInt(first, 36) });
  }

  if (action === "r") {
    if (!first || !base36Pattern.test(first)) {
      return err("invalid-target");
    }
    if (!second || !base36Pattern.test(second) || third !== undefined) {
      return err("invalid-page");
    }
    return ok({ type: "recipient", receiverTelegramUserId: parseBase36BigInt(first), page: Number.parseInt(second, 36) });
  }

  if (action === "p") {
    if (!first || !tokenPattern.test(first)) {
      return err("invalid-token");
    }
    if (!second || !base36Pattern.test(second) || third !== undefined) {
      return err("invalid-page");
    }
    return ok({ type: "page", token: first, page: Number.parseInt(second, 36) });
  }

  if (action === "a") {
    if (!first || !tokenPattern.test(first)) {
      return err("invalid-token");
    }
    if (!second || !base36Pattern.test(second)) {
      return err("invalid-page");
    }
    if (!third || !base36Pattern.test(third)) {
      return err("invalid-index");
    }
    if (!fourth || !selectionGuardPattern.test(fourth)) {
      return err("invalid-selection");
    }
    return ok({
      type: "add",
      token: first,
      page: Number.parseInt(second, 36),
      index: Number.parseInt(third, 36),
      selectionGuard: fourth
    });
  }

  if (action === "q") {
    if (!first || !tokenPattern.test(first)) {
      return err("invalid-token");
    }
    if (!second || !base36Pattern.test(second)) {
      return err("invalid-index");
    }
    if (!third || !base36Pattern.test(third)) {
      return err("invalid-quantity");
    }
    if (!fourth || !base36Pattern.test(fourth)) {
      return err("invalid-page");
    }
    return ok({
      type: "quantity",
      token: first,
      lineIndex: Number.parseInt(second, 36),
      quantity: Number.parseInt(third, 36),
      page: Number.parseInt(fourth, 36)
    });
  }

  if (action === "rm") {
    if (!first || !tokenPattern.test(first)) {
      return err("invalid-token");
    }
    if (!second || !base36Pattern.test(second)) {
      return err("invalid-index");
    }
    if (!third || !base36Pattern.test(third)) {
      return err("invalid-page");
    }
    return ok({ type: "remove", token: first, lineIndex: Number.parseInt(second, 36), page: Number.parseInt(third, 36) });
  }

  if (action === "cf" || action === "ok" || action === "no" || action === "cx") {
    if (!first || !tokenPattern.test(first) || second !== undefined) {
      return err("invalid-token");
    }
    return ok({
      type: action === "cf" ? "confirm" : action === "ok" ? "accept" : action === "no" ? "decline" : "cancel",
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
