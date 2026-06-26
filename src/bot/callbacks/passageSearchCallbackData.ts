import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";
import type { PlaceCallback } from "./placeCallbackData";

export type PassageSearchCallback =
  | {
      type: "start-passage";
      passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
      encounterToken: string;
    }
  | { type: "start-descent" }
  | { type: "check"; token: string }
  | { type: "ask-cancel"; token: string }
  | { type: "cancel"; token: string }
  | { type: "keep"; token: string };

export type PassageSearchCallbackError = "invalid-version" | "invalid-prefix" | "invalid-action" | "too-long";

const PREFIX = "v1:search";
const passageActions = new Set<Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">>([
  "deep-left",
  "deep-straight",
  "deep-right"
]);
const tokenPattern = /^[a-z0-9]{1,16}$/i;

export function makePassageSearchStartCallbackData(input: {
  passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
  encounterToken: string;
}): string {
  return `${PREFIX}:start:p:${input.passage}:${input.encounterToken}`;
}

export function makeDescentSearchStartCallbackData(): string {
  return `${PREFIX}:start:d`;
}

export function makePassageSearchCheckCallbackData(token: string): string {
  return `${PREFIX}:check:${token}`;
}

export function makePassageSearchAskCancelCallbackData(token: string): string {
  return `${PREFIX}:ask:${token}`;
}

export function makePassageSearchCancelCallbackData(token: string): string {
  return `${PREFIX}:cancel:${token}`;
}

export function makePassageSearchKeepCallbackData(token: string): string {
  return `${PREFIX}:keep:${token}`;
}

export function parsePassageSearchCallbackData(
  data: string | undefined
): Result<PassageSearchCallback, PassageSearchCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (data.startsWith(`${PREFIX}:start:p:`)) {
    const [, section, action, kind, passage, encounterToken, ...rest] = data.split(":");
    if (section !== "search" || action !== "start" || kind !== "p" || rest.length > 0) {
      return err("invalid-prefix");
    }
    if (!passageActions.has(passage as Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">)) {
      return err("invalid-action");
    }
    if (!encounterToken || !tokenPattern.test(encounterToken)) {
      return err("invalid-prefix");
    }

    return ok({
      type: "start-passage",
      passage: passage as Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">,
      encounterToken
    });
  }

  if (data === `${PREFIX}:start:d`) {
    return ok({ type: "start-descent" });
  }

  for (const [action, type] of [
    ["check", "check"],
    ["ask", "ask-cancel"],
    ["cancel", "cancel"],
    ["keep", "keep"]
  ] as const) {
    if (data.startsWith(`${PREFIX}:${action}:`)) {
      const [, section, parsedAction, token, ...rest] = data.split(":");
      if (section !== "search" || parsedAction !== action || rest.length > 0) {
        return err("invalid-prefix");
      }
      if (!token || !tokenPattern.test(token)) {
        return err("invalid-prefix");
      }

      return ok({ type, token });
    }
  }

  return err("invalid-prefix");
}
