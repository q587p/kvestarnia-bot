import { err, ok, type Result } from "../../shared/result";
import { latestEventFilters, type LatestEventFilter } from "../../services/activityEventService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type LatestEventsCallback =
  | { type: "list"; filter: LatestEventFilter; page: number };

export type LatestEventsCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-filter"
  | "invalid-page"
  | "too-long";

const PREFIX = "v1:ev";

export function makeLatestEventsListCallbackData(filter: LatestEventFilter = "all", page = 0): string {
  return `${PREFIX}:l:${filter}:${normalizePage(page)}`;
}

export function parseLatestEventsCallbackData(
  data: string | undefined
): Result<LatestEventsCallback, LatestEventsCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, filter, page, ...rest] = data.split(":");
  if (section !== "ev" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action !== "l" && action !== "r") {
    return err("invalid-action");
  }

  if (!isLatestEventFilter(filter)) {
    return err("invalid-filter");
  }

  const parsedPage = parseNonNegativeInteger(page);
  if (parsedPage === null) {
    return err("invalid-page");
  }

  return ok({
    type: "list",
    filter,
    page: parsedPage
  });
}

function isLatestEventFilter(value: string | undefined): value is LatestEventFilter {
  return latestEventFilters.includes(value as LatestEventFilter);
}

function parseNonNegativeInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizePage(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}
