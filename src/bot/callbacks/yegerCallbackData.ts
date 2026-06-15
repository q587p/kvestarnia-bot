import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type YegerCallback =
  | { type: "open" }
  | { type: "quest"; questId: "u1" }
  | { type: "start"; questId: "u1" }
  | { type: "track"; questId: "u1" }
  | { type: "turn-in"; questId: "u1" }
  | { type: "help" };

export type YegerCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-quest"
  | "too-long";

const PREFIX = "v1:ygr";
const UNQUIET_TRIAL_ID = "u1";

export function makeYegerOpenCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:open`);
}

export function makeYegerQuestCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:quest:${UNQUIET_TRIAL_ID}`);
}

export function makeYegerStartCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:start:${UNQUIET_TRIAL_ID}`);
}

export function makeYegerTrackCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:track:${UNQUIET_TRIAL_ID}`);
}

export function makeYegerTurnInCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:turnin:${UNQUIET_TRIAL_ID}`);
}

export function makeYegerHelpCallbackData(): string {
  return assertYegerCallbackData(`${PREFIX}:help`);
}

export function parseYegerCallbackData(
  data: string | undefined
): Result<YegerCallback, YegerCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, questId, ...rest] = data.split(":");

  if (section !== "ygr" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "open") {
    return questId ? err("invalid-prefix") : ok({ type: "open" });
  }

  if (action === "help") {
    return questId ? err("invalid-prefix") : ok({ type: "help" });
  }

  if (questId !== UNQUIET_TRIAL_ID) {
    return err("invalid-quest");
  }

  if (action === "start") {
    return ok({ type: "start", questId: UNQUIET_TRIAL_ID });
  }

  if (action === "quest") {
    return ok({ type: "quest", questId: UNQUIET_TRIAL_ID });
  }

  if (action === "track") {
    return ok({ type: "track", questId: UNQUIET_TRIAL_ID });
  }

  if (action === "turnin") {
    return ok({ type: "turn-in", questId: UNQUIET_TRIAL_ID });
  }

  return err("invalid-action");
}

function assertYegerCallbackData(data: string): string {
  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    throw new RangeError("Yeger callback data exceeds Telegram callback data limit.");
  }

  return data;
}
