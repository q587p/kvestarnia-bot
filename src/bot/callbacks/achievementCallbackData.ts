import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type AchievementCallbackError = "invalid-version" | "invalid-prefix" | "invalid-page" | "too-long";

export type AchievementCallback = {
  type: "list";
  page: number;
} | {
  type: "check";
} | {
  type: "hero";
};

const LIST_PREFIX = "v1:ach:list";
const HERO_CALLBACK = "v1:ach:hero";
const CHECK_CALLBACK = "v1:ach:check";

export function makeAchievementListCallbackData(page = 0): string {
  return `${LIST_PREFIX}:${normalizePage(page)}`;
}

export function makeAchievementCheckCallbackData(): string {
  return CHECK_CALLBACK;
}

export function parseAchievementCallbackData(
  data: string | undefined
): Result<AchievementCallback, AchievementCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (data === HERO_CALLBACK) {
    return ok({ type: "hero" });
  }

  if (data === CHECK_CALLBACK) {
    return ok({ type: "check" });
  }

  if (!data.startsWith(`${LIST_PREFIX}:`)) {
    return err("invalid-prefix");
  }

  const [, section, scene, pageRaw, ...rest] = data.split(":");
  if (section !== "ach" || scene !== "list" || rest.length > 0) {
    return err("invalid-prefix");
  }

  const page = Number(pageRaw);
  if (!Number.isInteger(page) || page < 0) {
    return err("invalid-page");
  }

  return ok({ type: "list", page });
}

function normalizePage(page: number): number {
  return Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));
}
