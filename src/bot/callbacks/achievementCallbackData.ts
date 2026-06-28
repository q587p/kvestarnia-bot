import { err, ok, type Result } from "../../shared/result";
import { achievementListFilters, type AchievementListFilter } from "../../services/achievementService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type AchievementCallbackError = "invalid-version" | "invalid-prefix" | "invalid-page" | "invalid-filter" | "too-long";

export type AchievementCallback = {
  type: "list";
  page: number;
  filter: AchievementListFilter;
} | {
  type: "check";
  filter: AchievementListFilter;
} | {
  type: "hero";
};

const LIST_PREFIX = "v1:ach:list";
const HERO_CALLBACK = "v1:ach:hero";
const CHECK_CALLBACK = "v1:ach:check";

export function makeAchievementListCallbackData(
  page = 0,
  filter: AchievementListFilter = "all"
): string {
  return `${LIST_PREFIX}:${filter}:${normalizePage(page)}`;
}

export function makeAchievementCheckCallbackData(filter: AchievementListFilter = "all"): string {
  return filter === "all" ? CHECK_CALLBACK : `${CHECK_CALLBACK}:${filter}`;
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
    return ok({ type: "check", filter: "all" });
  }

  if (data.startsWith(`${CHECK_CALLBACK}:`)) {
    const [, section, scene, filterRaw, ...rest] = data.split(":");
    if (section !== "ach" || scene !== "check" || rest.length > 0) {
      return err("invalid-prefix");
    }

    const filter = parseAchievementFilter(filterRaw);
    return filter ? ok({ type: "check", filter }) : err("invalid-filter");
  }

  if (!data.startsWith(`${LIST_PREFIX}:`)) {
    return err("invalid-prefix");
  }

  const [, section, scene, firstRaw, secondRaw, ...rest] = data.split(":");
  if (section !== "ach" || scene !== "list" || rest.length > 0) {
    return err("invalid-prefix");
  }

  const legacyPage = secondRaw === undefined;
  const filter = legacyPage ? "all" : parseAchievementFilter(firstRaw);
  if (!filter) {
    return err("invalid-filter");
  }

  const page = Number(legacyPage ? firstRaw : secondRaw);
  if (!Number.isInteger(page) || page < 0) {
    return err("invalid-page");
  }

  return ok({ type: "list", page, filter });
}

function normalizePage(page: number): number {
  return Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));
}

function parseAchievementFilter(value: string | undefined): AchievementListFilter | null {
  return achievementListFilters.includes(value as AchievementListFilter)
    ? value as AchievementListFilter
    : null;
}
