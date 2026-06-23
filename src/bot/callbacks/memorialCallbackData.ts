import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export interface MemorialRemortCallback {
  type: "remort-levels";
  remortNumber: number;
}

export type MemorialCallback = MemorialRemortCallback;
export type MemorialCallbackError = "invalid-version" | "invalid-prefix" | "invalid-remort" | "too-long";

const PREFIX = "v1:mem";

export function makeMemorialRemortCallbackData(remortNumber: number): string {
  return `${PREFIX}:rm:${remortNumber}`;
}

export function parseMemorialCallbackData(
  data: string | undefined
): Result<MemorialCallback, MemorialCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, type, remortNumberRaw, ...rest] = data.split(":");

  if (section !== "mem" || type !== "rm" || rest.length > 0) {
    return err("invalid-prefix");
  }

  const remortNumber = Number(remortNumberRaw);

  if (!Number.isInteger(remortNumber) || remortNumber < 1) {
    return err("invalid-remort");
  }

  return ok({
    type: "remort-levels",
    remortNumber
  });
}
