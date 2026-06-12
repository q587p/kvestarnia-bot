import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type MenuCallback = "hero" | "help" | "tavern";
export type MenuCallbackError = "invalid-version" | "invalid-prefix" | "invalid-action" | "too-long";

const PREFIX = "v1:menu";
const menuActions = new Set<MenuCallback>(["hero", "help", "tavern"]);

export function makeMenuCallbackData(action: MenuCallback): string {
  return `${PREFIX}:${action}`;
}

export function parseMenuCallbackData(
  data: string | undefined
): Result<MenuCallback, MenuCallbackError> {
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

  if (section !== "menu" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!menuActions.has(action as MenuCallback)) {
    return err("invalid-action");
  }

  return ok(action as MenuCallback);
}
