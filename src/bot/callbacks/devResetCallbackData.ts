import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type DevResetCallback = "confirm" | "cancel";
export type DevResetCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:devreset";
const devResetActions = new Set<DevResetCallback>(["confirm", "cancel"]);

export function makeDevResetCallbackData(action: DevResetCallback): string {
  return `${PREFIX}:${action}`;
}

export function parseDevResetCallbackData(
  data: string | undefined
): Result<DevResetCallback, DevResetCallbackError> {
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

  if (section !== "devreset" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!devResetActions.has(action as DevResetCallback)) {
    return err("invalid-action");
  }

  return ok(action as DevResetCallback);
}
