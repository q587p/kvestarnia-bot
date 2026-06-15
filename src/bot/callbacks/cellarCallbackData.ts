import { err, ok, type Result } from "../../shared/result";
import type { CellarErrandAction } from "../../services/cellarErrandService";
import type { CellarGrownupQuestAction } from "../../services/cellarGrownupQuestService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type CellarCallback = CellarErrandAction | CellarGrownupQuestAction | "participants";
export type CellarCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:cellar";
const cellarCallbacks = new Set<CellarCallback>([
  "cheese-trap",
  "sweep-bravely",
  "negotiate",
  "grownup-buy-seal",
  "grownup-roleplay",
  "grownup-show-seal",
  "grownup-turn-in",
  "grownup-keep-bottle",
  "participants"
]);

export function makeCellarCallbackData(action: CellarCallback): string {
  return `${PREFIX}:${action}`;
}

export function parseCellarCallbackData(
  data: string | undefined
): Result<CellarCallback, CellarCallbackError> {
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

  if (section !== "cellar" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!cellarCallbacks.has(action as CellarCallback)) {
    return err("invalid-action");
  }

  return ok(action as CellarCallback);
}
