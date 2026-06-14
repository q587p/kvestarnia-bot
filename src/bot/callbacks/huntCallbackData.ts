import type { HuntAction } from "../../services/huntService";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type HuntCallback =
  | { type: "view"; localPeriodId: string }
  | { type: "action"; localPeriodId: string; action: HuntAction };

export type HuntCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-date"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:hunt";
const huntActions = new Set<HuntAction>(["strike", "trick", "retreat"]);

export function makeHuntViewCallbackData(localPeriodId: string): string {
  return `${PREFIX}:view:${localPeriodId}`;
}

export function makeHuntActionCallbackData(localPeriodId: string, action: HuntAction): string {
  return `${PREFIX}:act:${localPeriodId}:${action}`;
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

  const [, section, kind, localPeriodId, action, ...rest] = data.split(":");

  if (section !== "hunt" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!localPeriodId || !isValidLocalHourPeriodId(localPeriodId)) {
    return err("invalid-date");
  }

  if (kind === "view" && action === undefined) {
    return ok({ type: "view", localPeriodId });
  }

  if (kind === "act" && huntActions.has(action as HuntAction)) {
    return ok({ type: "action", localPeriodId, action: action as HuntAction });
  }

  return err("invalid-action");
}

function isValidLocalHourPeriodId(localPeriodId: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(localPeriodId);

  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);

  if (hour < 0 || hour > 23) {
    return false;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day, hour));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour
  );
}
