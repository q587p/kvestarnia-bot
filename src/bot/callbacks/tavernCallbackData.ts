import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type TavernCallback = "raid" | "participants";
export type TavernCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:tavern";
const tavernActions = new Set<TavernCallback>(["raid", "participants"]);

export function makeTavernCallbackData(action: TavernCallback): string {
  return `${PREFIX}:${action}`;
}

export function parseTavernCallbackData(
  data: string | undefined
): Result<TavernCallback, TavernCallbackError> {
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

  if (section !== "tavern" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!tavernActions.has(action as TavernCallback)) {
    return err("invalid-action");
  }

  return ok(action as TavernCallback);
}
