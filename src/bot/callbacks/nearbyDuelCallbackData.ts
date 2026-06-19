import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type NearbyDuelCallback =
  | { type: "open"; page: number }
  | { type: "select"; targetTelegramUserId: bigint; page: number }
  | {
      type: "mode";
      targetTelegramUserId: bigint;
      mode: "quick" | "turn-based";
      ignoreResourceWarning: boolean;
      page: number;
    };

export type NearbyDuelCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-target"
  | "invalid-page"
  | "too-long";

const PREFIX = "v1:nd";
const pagePattern = /^[0-9a-z]{1,3}$/;
const targetPattern = /^[0-9a-z]{1,13}$/;

export function makeNearbyDuelOpenCallbackData(page = 0): string {
  return page === 0 ? `${PREFIX}:open` : `${PREFIX}:p:${page.toString(36)}`;
}

export function makeNearbyDuelSelectCallbackData(
  targetTelegramUserId: bigint,
  page: number
): string {
  return `${PREFIX}:s:${targetTelegramUserId.toString(36)}:${page.toString(36)}`;
}

export function makeNearbyDuelModeCallbackData(
  targetTelegramUserId: bigint,
  mode: "quick" | "turn-based",
  ignoreResourceWarning = false,
  page = 0
): string {
  const modeKey = mode === "turn-based" ? "t" : "q";
  return `${PREFIX}:m:${targetTelegramUserId.toString(36)}:${modeKey}${ignoreResourceWarning ? "r" : ""}:${page.toString(36)}`;
}

export function parseNearbyDuelCallbackData(
  data: string | undefined
): Result<NearbyDuelCallback, NearbyDuelCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (data === `${PREFIX}:open`) {
    return ok({ type: "open", page: 0 });
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  const [, section, action, targetOrPage, pageOrMode, modePage, ...rest] = data.split(":");

  if (section !== "nd" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "p") {
    if (!targetOrPage || !pagePattern.test(targetOrPage) || pageOrMode !== undefined || modePage !== undefined) {
      return err("invalid-page");
    }

    return ok({ type: "open", page: Number.parseInt(targetOrPage, 36) });
  }

  if (action === "s") {
    if (!targetOrPage || !targetPattern.test(targetOrPage)) {
      return err("invalid-target");
    }

    if (!pageOrMode || !pagePattern.test(pageOrMode) || modePage !== undefined) {
      return err("invalid-page");
    }

    return ok({
      type: "select",
      targetTelegramUserId: parseBase36BigInt(targetOrPage),
      page: Number.parseInt(pageOrMode, 36)
    });
  }

  if (action === "m") {
    if (!targetOrPage || !targetPattern.test(targetOrPage)) {
      return err("invalid-target");
    }

    if (pageOrMode !== "q" && pageOrMode !== "t" && pageOrMode !== "qr" && pageOrMode !== "tr") {
      return err("invalid-action");
    }

    if (!modePage || !pagePattern.test(modePage)) {
      return err("invalid-page");
    }

    return ok({
      type: "mode",
      targetTelegramUserId: parseBase36BigInt(targetOrPage),
      mode: pageOrMode.startsWith("t") ? "turn-based" : "quick",
      ignoreResourceWarning: pageOrMode.endsWith("r"),
      page: Number.parseInt(modePage, 36)
    });
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
