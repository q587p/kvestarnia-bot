import type { HuntAction } from "../../services/huntService";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type HuntCallback =
  | { type: "view"; localPeriodId: string; contractToken: string }
  | { type: "action"; localPeriodId: string; contractToken: string; action: HuntAction }
  | { type: "legacy-view"; localPeriodId: string }
  | { type: "legacy-action"; localPeriodId: string; action: HuntAction };

export type HuntCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-date"
  | "invalid-token"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:hunt";
const huntActions = new Set<HuntAction>(["strike", "trick", "retreat"]);
const contractTokenPattern = /^[a-z0-9]{6,10}$/;

export function makeHuntViewCallbackData(localPeriodId: string, contractToken: string): string {
  return `${PREFIX}:view:${localPeriodId}:${contractToken}`;
}

export function makeHuntActionCallbackData(
  localPeriodId: string,
  contractToken: string,
  action: HuntAction
): string {
  return `${PREFIX}:act:${localPeriodId}:${contractToken}:${action}`;
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

  const parts = data.split(":");
  const [, section, kind] = parts;

  if (section !== "hunt") {
    return err("invalid-prefix");
  }

  if (kind === "view") {
    return parseViewCallback(parts);
  }

  if (kind === "act") {
    return parseActionCallback(parts);
  }

  return err("invalid-action");
}

function parseViewCallback(parts: string[]): Result<HuntCallback, HuntCallbackError> {
  const [, , , localPeriodId, contractToken] = parts;

  if (!localPeriodId) {
    return err("invalid-date");
  }

  if (parts.length === 4) {
    if (!isValidLegacyLocalDateId(localPeriodId) && !isValidLocalHourPeriodId(localPeriodId)) {
      return err("invalid-date");
    }

    return ok({ type: "legacy-view", localPeriodId });
  }

  if (parts.length !== 5) {
    return err("invalid-prefix");
  }

  if (!isValidLocalHourPeriodId(localPeriodId)) {
    return err("invalid-date");
  }

  if (!contractToken || !isValidContractToken(contractToken)) {
    return err("invalid-token");
  }

  return ok({ type: "view", localPeriodId, contractToken });
}

function parseActionCallback(parts: string[]): Result<HuntCallback, HuntCallbackError> {
  const [, , , localPeriodId, maybeToken, maybeAction] = parts;

  if (!localPeriodId) {
    return err("invalid-date");
  }

  if (parts.length === 5) {
    if (!isValidLegacyLocalDateId(localPeriodId) && !isValidLocalHourPeriodId(localPeriodId)) {
      return err("invalid-date");
    }

    if (huntActions.has(maybeToken as HuntAction)) {
      return ok({ type: "legacy-action", localPeriodId, action: maybeToken as HuntAction });
    }

    return err("invalid-action");
  }

  if (parts.length !== 6) {
    return err("invalid-prefix");
  }

  if (!isValidLocalHourPeriodId(localPeriodId)) {
    return err("invalid-date");
  }

  if (!maybeToken || !isValidContractToken(maybeToken)) {
    return err("invalid-token");
  }

  if (huntActions.has(maybeAction as HuntAction)) {
    return ok({
      type: "action",
      localPeriodId,
      contractToken: maybeToken,
      action: maybeAction as HuntAction
    });
  }

  return err("invalid-action");
}

function isValidContractToken(contractToken: string | undefined): boolean {
  return contractTokenPattern.test(contractToken ?? "");
}

function isValidLegacyLocalDateId(localDateId: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDateId);

  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
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
