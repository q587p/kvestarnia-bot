import type { HuntAction } from "../../services/huntService";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type HuntCallback =
  | { type: "view"; localDate: string }
  | { type: "action"; localDate: string; action: HuntAction };

export type HuntCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-date"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:hunt";
const huntActions = new Set<HuntAction>(["strike", "trick", "retreat"]);
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function makeHuntViewCallbackData(localDate: string): string {
  return `${PREFIX}:view:${localDate}`;
}

export function makeHuntActionCallbackData(localDate: string, action: HuntAction): string {
  return `${PREFIX}:act:${localDate}:${action}`;
}

export function parseHuntCallbackData(
  data: string | undefined
): Result<HuntCallback, HuntCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, kind, localDate, action, ...rest] = data.split(":");

  if (section !== "hunt" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!localDate || !localDatePattern.test(localDate)) {
    return err("invalid-date");
  }

  if (kind === "view" && action === undefined) {
    return ok({ type: "view", localDate });
  }

  if (kind === "act" && huntActions.has(action as HuntAction)) {
    return ok({ type: "action", localDate, action: action as HuntAction });
  }

  return err("invalid-action");
}
