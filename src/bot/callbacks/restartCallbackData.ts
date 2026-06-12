import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type RestartCallback = "confirm" | "cancel";
export type RestartCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:restart";
const restartActions = new Set<RestartCallback>(["confirm", "cancel"]);

export function makeRestartCallbackData(action: RestartCallback): string {
  return `${PREFIX}:${action}`;
}

export function parseRestartCallbackData(
  data: string | undefined
): Result<RestartCallback, RestartCallbackError> {
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

  if (section !== "restart" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!restartActions.has(action as RestartCallback)) {
    return err("invalid-action");
  }

  return ok(action as RestartCallback);
}
