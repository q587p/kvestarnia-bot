import { err, ok, type Result } from "../../shared/result";
import type { CellarErrandAction } from "../../services/cellarErrandService";
import type { CellarGrownupQuestAction } from "../../services/cellarGrownupQuestService";
import { isKnownQuestMethodId } from "../../content/questResolution";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type CellarCallback =
  | { type: "legacy-action"; action: CellarErrandAction }
  | { type: "method"; methodId: string }
  | { type: "method-help" }
  | { type: "method-back" }
  | { type: "grownup"; action: CellarGrownupQuestAction }
  | { type: "participants" };
export type CellarCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:cellar";
const V2_PREFIX = "v2:cellar";
const cellarCallbacks = new Set<string>([
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

export function makeCellarCallbackData(action: string): string {
  return `${PREFIX}:${action}`;
}

export function makeCellarMethodCallbackData(action: CellarErrandAction): string {
  return `${V2_PREFIX}:${action}`;
}

export function makeCellarMethodHelpCallbackData(): string {
  return `${V2_PREFIX}:h`;
}

export function makeCellarMethodBackCallbackData(): string {
  return `${V2_PREFIX}:b`;
}

export function parseCellarCallbackData(
  data: string | undefined
): Result<CellarCallback, CellarCallbackError> {
  if (data?.startsWith(`${V2_PREFIX}:`)) {
    if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
      return err("too-long");
    }

    const [, section, action, ...rest] = data.split(":");

    if (section !== "cellar" || rest.length > 0) {
      return err("invalid-prefix");
    }

    if (action === "h") {
      return ok({ type: "method-help" });
    }

    if (action === "b") {
      return ok({ type: "method-back" });
    }

    return isKnownQuestMethodId(action) ? ok({ type: "method", methodId: action }) : err("invalid-action");
  }

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

  if (!action || !cellarCallbacks.has(action)) {
    return err("invalid-action");
  }

  if (action === "participants") {
    return ok({ type: "participants" });
  }

  if (action.startsWith("grownup-")) {
    return ok({ type: "grownup", action: action as CellarGrownupQuestAction });
  }

  return ok({ type: "legacy-action", action });
}
