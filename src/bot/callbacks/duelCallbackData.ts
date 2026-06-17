import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type DuelCallback =
  | { type: "new" }
  | { type: "new-risk" }
  | { type: "accept"; token: string }
  | { type: "accept-risk"; token: string }
  | { type: "cancel"; token: string }
  | { type: "decline"; token: string }
  | { type: "view"; token: string };

export type DuelCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-token"
  | "too-long";

const PREFIX = "v1:duel";
const tokenPattern = /^[A-Za-z0-9_-]{8,24}$/;

export function makeDuelNewCallbackData(): string {
  return `${PREFIX}:new`;
}

export function makeDuelNewRiskCallbackData(): string {
  return `${PREFIX}:new-risk`;
}

export function makeDuelAcceptCallbackData(token: string): string {
  return `${PREFIX}:accept:${token}`;
}

export function makeDuelAcceptRiskCallbackData(token: string): string {
  return `${PREFIX}:accept-risk:${token}`;
}

export function makeDuelCancelCallbackData(token: string): string {
  return `${PREFIX}:cancel:${token}`;
}

export function makeDuelDeclineCallbackData(token: string): string {
  return `${PREFIX}:decline:${token}`;
}

export function makeDuelViewCallbackData(token: string): string {
  return `${PREFIX}:view:${token}`;
}

export function parseDuelCallbackData(
  data: string | undefined
): Result<DuelCallback, DuelCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (data === `${PREFIX}:new`) {
    return ok({ type: "new" });
  }

  if (data === `${PREFIX}:new-risk`) {
    return ok({ type: "new-risk" });
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  const [, section, action, token, ...rest] = data.split(":");

  if (section !== "duel" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (
    action !== "accept" &&
    action !== "accept-risk" &&
    action !== "cancel" &&
    action !== "decline" &&
    action !== "view"
  ) {
    return err("invalid-action");
  }

  if (!token || !tokenPattern.test(token)) {
    return err("invalid-token");
  }

  return ok({
    type: action,
    token
  });
}
