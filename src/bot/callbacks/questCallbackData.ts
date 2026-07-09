import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type QuestCallback =
  | "overview"
  | "adventure"
  | "fight"
  | "fight-descend"
  | "fight-easy"
  | "fight-normal"
  | "fight-hard"
  | "hunt"
  | "cellar"
  | "barrel-tutorial"
  | "barrel-tutorial-turn-in"
  | "problem"
  | "problem-next"
  | "archive"
  | "list";
export type QuestCallbackError = "invalid-version" | "invalid-prefix" | "invalid-action" | "too-long";

const PREFIX = "v1:quest";
const questCallbacks = new Set<QuestCallback>([
  "overview",
  "adventure",
  "fight",
  "fight-descend",
  "fight-easy",
  "fight-normal",
  "fight-hard",
  "hunt",
  "cellar",
  "barrel-tutorial",
  "barrel-tutorial-turn-in",
  "problem",
  "problem-next",
  "archive",
  "list"
]);

export function makeQuestCallbackData(action: QuestCallback): string {
  return `${PREFIX}:${action}`;
}

export function questCallbackToPersistentFightDifficulty(
  action: QuestCallback
): "easy" | "normal" | "hard" | null {
  if (action === "fight-easy") {
    return "easy";
  }

  if (action === "fight-normal") {
    return "normal";
  }

  if (action === "fight-hard") {
    return "hard";
  }

  return null;
}

export function parseQuestCallbackData(
  data: string | undefined
): Result<QuestCallback, QuestCallbackError> {
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

  if (section !== "quest" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!questCallbacks.has(action as QuestCallback)) {
    return err("invalid-action");
  }

  return ok(action as QuestCallback);
}
