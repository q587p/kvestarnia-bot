import { err, ok, type Result } from "../../shared/result";
import { achievementListFilters, type AchievementListFilter } from "../../services/achievementService";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type AchievementCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-page"
  | "invalid-filter"
  | "invalid-title"
  | "invalid-life"
  | "too-long";

export type AchievementCallback = {
  type: "list";
  page: number;
  filter: AchievementListFilter;
} | {
  type: "check";
  filter: AchievementListFilter;
} | {
  type: "titles";
  page: number;
} | {
  type: "title-set";
  titleGrantRowId: string;
  remortCount: number;
  page: number;
} | {
  type: "title-clear";
  remortCount: number;
  page: number;
} | {
  type: "hero";
};

const LIST_PREFIX = "v1:ach:list";
const HERO_CALLBACK = "v1:ach:hero";
const CHECK_CALLBACK = "v1:ach:check";
const TITLES_CALLBACK = "v1:ach:titles";
const TITLE_SET_PREFIX = "v1:ach:tset";
const TITLE_CLEAR_PREFIX = "v1:ach:tclr";

export function makeAchievementListCallbackData(
  page = 0,
  filter: AchievementListFilter = "all"
): string {
  return `${LIST_PREFIX}:${filter}:${normalizePage(page)}`;
}

export function makeAchievementCheckCallbackData(filter: AchievementListFilter = "all"): string {
  return filter === "all" ? CHECK_CALLBACK : `${CHECK_CALLBACK}:${filter}`;
}

export function makeCosmeticTitleListCallbackData(page = 0): string {
  const normalizedPage = normalizePage(page);
  return normalizedPage === 0 ? TITLES_CALLBACK : `${TITLES_CALLBACK}:${normalizedPage}`;
}

export function makeCosmeticTitleSetCallbackData(
  titleGrantRowId: string,
  remortCount: number,
  page = 0
): string {
  return `${TITLE_SET_PREFIX}:${normalizeRemortCount(remortCount)}:${titleGrantRowId}:${normalizePage(page)}`;
}

export function makeCosmeticTitleClearCallbackData(remortCount: number, page = 0): string {
  return `${TITLE_CLEAR_PREFIX}:${normalizeRemortCount(remortCount)}:${normalizePage(page)}`;
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

  if (data === TITLES_CALLBACK || data.startsWith(`${TITLES_CALLBACK}:`)) {
    if (data === TITLES_CALLBACK) {
      return ok({ type: "titles", page: 0 });
    }

    const [, section, scene, pageRaw, ...rest] = data.split(":");
    if (section !== "ach" || scene !== "titles" || rest.length > 0) {
      return err("invalid-prefix");
    }

    const page = Number(pageRaw);
    return Number.isInteger(page) && page >= 0
      ? ok({ type: "titles", page })
      : err("invalid-page");
  }

  if (data.startsWith(`${TITLE_SET_PREFIX}:`)) {
    const [, section, scene, remortRaw, titleGrantRowId, pageRaw, ...rest] = data.split(":");
    if (section !== "ach" || scene !== "tset" || rest.length > 0) {
      return err("invalid-prefix");
    }

    const remortCount = parseRemortCount(remortRaw);
    if (remortCount === null) {
      return err("invalid-life");
    }
    const page = pageRaw === undefined ? 0 : Number(pageRaw);
    if (!Number.isInteger(page) || page < 0) {
      return err("invalid-page");
    }

    return isGrantRowId(titleGrantRowId)
      ? ok({ type: "title-set", titleGrantRowId, remortCount, page })
      : err("invalid-title");
  }

  if (data.startsWith(`${TITLE_CLEAR_PREFIX}:`)) {
    const [, section, scene, remortRaw, pageRaw, ...rest] = data.split(":");
    if (section !== "ach" || scene !== "tclr" || rest.length > 0) {
      return err("invalid-prefix");
    }

    const remortCount = parseRemortCount(remortRaw);
    if (remortCount === null) {
      return err("invalid-life");
    }
    const page = pageRaw === undefined ? 0 : Number(pageRaw);
    return Number.isInteger(page) && page >= 0
      ? ok({ type: "title-clear", remortCount, page })
      : err("invalid-page");
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

function normalizeRemortCount(remortCount: number): number {
  return Math.max(0, Math.floor(Number.isFinite(remortCount) ? remortCount : 0));
}

function parseRemortCount(value: string | undefined): number | null {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

function isGrantRowId(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,40}$/u.test(value);
}

function parseAchievementFilter(value: string | undefined): AchievementListFilter | null {
  return achievementListFilters.includes(value as AchievementListFilter)
    ? value as AchievementListFilter
    : null;
}
