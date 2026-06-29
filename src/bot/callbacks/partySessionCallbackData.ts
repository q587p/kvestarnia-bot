import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type PartySessionCallback =
  | { type: "view"; token: string }
  | { type: "join"; token: string }
  | { type: "leave"; token: string }
  | { type: "cancel"; token: string }
  | { type: "expire"; token: string }
  | { type: "nearby-open"; page: number }
  | { type: "nearby-invite"; targetTelegramUserId: bigint; page: number };

export type PartySessionCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-token"
  | "invalid-target"
  | "invalid-page"
  | "too-long";

const PREFIX = "v1:party";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;
const PAGE_PATTERN = /^[0-9a-z]{1,3}$/;
const TARGET_PATTERN = /^[0-9a-z]{1,13}$/;

export function makePartySessionViewCallbackData(token: string): string {
  return `${PREFIX}:v:${token}`;
}

export function makePartySessionJoinCallbackData(token: string): string {
  return `${PREFIX}:j:${token}`;
}

export function makePartySessionLeaveCallbackData(token: string): string {
  return `${PREFIX}:l:${token}`;
}

export function makePartySessionCancelCallbackData(token: string): string {
  return `${PREFIX}:c:${token}`;
}

export function makePartySessionExpireCallbackData(token: string): string {
  return `${PREFIX}:x:${token}`;
}

export function makePartySessionNearbyOpenCallbackData(page = 0): string {
  return page === 0 ? `${PREFIX}:no` : `${PREFIX}:no:${page.toString(36)}`;
}

export function makePartySessionNearbyInviteCallbackData(
  targetTelegramUserId: bigint,
  page = 0
): string {
  return `${PREFIX}:ni:${targetTelegramUserId.toString(36)}:${page.toString(36)}`;
}

export function parsePartySessionCallbackData(
  data: string | undefined
): Result<PartySessionCallback, PartySessionCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  const [, section, action, tokenOrTarget, page, ...rest] = data.split(":");

  if (section !== "party" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "no") {
    if (page !== undefined) {
      return err("invalid-page");
    }

    const pageKey = tokenOrTarget ?? "0";
    if (!PAGE_PATTERN.test(pageKey)) {
      return err("invalid-page");
    }

    return ok({ type: "nearby-open", page: Number.parseInt(pageKey, 36) });
  }

  if (action === "ni") {
    if (!tokenOrTarget || !TARGET_PATTERN.test(tokenOrTarget)) {
      return err("invalid-target");
    }

    if (!page || !PAGE_PATTERN.test(page)) {
      return err("invalid-page");
    }

    return ok({
      type: "nearby-invite",
      targetTelegramUserId: parseBase36BigInt(tokenOrTarget),
      page: Number.parseInt(page, 36)
    });
  }

  if (!tokenOrTarget || !TOKEN_PATTERN.test(tokenOrTarget) || page !== undefined) {
    return err("invalid-token");
  }

  if (action === "v") {
    return ok({ type: "view", token: tokenOrTarget });
  }

  if (action === "j") {
    return ok({ type: "join", token: tokenOrTarget });
  }

  if (action === "l") {
    return ok({ type: "leave", token: tokenOrTarget });
  }

  if (action === "c") {
    return ok({ type: "cancel", token: tokenOrTarget });
  }

  if (action === "x") {
    return ok({ type: "expire", token: tokenOrTarget });
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
