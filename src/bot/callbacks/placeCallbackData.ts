import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type PlaceCallback =
  | "hall"
  | "quest-table"
  | "barrel"
  | "news-corner"
  | "cellar"
  | "front"
  | "arrivals";
export type PlaceCallbackError = "invalid-version" | "invalid-prefix" | "invalid-action" | "too-long";

const PREFIX = "v1:place";
const placeCallbacks = new Set<PlaceCallback>([
  "hall",
  "quest-table",
  "barrel",
  "news-corner",
  "cellar",
  "front",
  "arrivals"
]);

export function makePlaceCallbackData(action: PlaceCallback): string {
  return `${PREFIX}:${action}`;
}

export function parsePlaceCallbackData(
  data: string | undefined
): Result<PlaceCallback, PlaceCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, ...rest] = data.split(":");

  if (section !== "place" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!placeCallbacks.has(action as PlaceCallback)) {
    return err("invalid-action");
  }

  return ok(action as PlaceCallback);
}
