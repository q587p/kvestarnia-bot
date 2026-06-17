import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type TrainingDoppelgangerCallback = { type: "open" };
export type TrainingDoppelgangerCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:spar";

export function makeTrainingDoppelgangerCallbackData(): string {
  return `${PREFIX}:open`;
}

export function parseTrainingDoppelgangerCallbackData(
  data: string | undefined
): Result<TrainingDoppelgangerCallback, TrainingDoppelgangerCallbackError> {
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

  if (section !== "spar" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action !== "open") {
    return err("invalid-action");
  }

  return ok({ type: "open" });
}
