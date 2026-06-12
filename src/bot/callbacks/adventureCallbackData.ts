import { err, ok, type Result } from "../../shared/result";
import type { AdventureAction } from "../../services/adventureService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type AdventureCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:adv:mimic";
const adventureActions = new Set<AdventureAction>(["poke", "receipt", "flee"]);

export function makeAdventureCallbackData(action: AdventureAction): string {
  return `${PREFIX}:${action}`;
}

export function parseAdventureCallbackData(
  data: string | undefined
): Result<AdventureAction, AdventureCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, scene, action, ...rest] = data.split(":");

  if (section !== "adv" || scene !== "mimic" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!adventureActions.has(action as AdventureAction)) {
    return err("invalid-action");
  }

  return ok(action as AdventureAction);
}
