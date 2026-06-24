import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type NewsCallback =
  | { type: "list"; page: number; source: NewsCallbackSource }
  | { type: "entry"; entryIndex: number; listPage: number; source: NewsCallbackSource };

export type NewsCallbackSource = "hall" | "raid";

export type NewsCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-page"
  | "too-long";

const PREFIX = "v1:news";

export function makeNewsListCallbackData(page: number, source: NewsCallbackSource = "hall"): string {
  return source === "raid" ? `${PREFIX}:rlist:${page}` : `${PREFIX}:list:${page}`;
}

export function makeNewsEntryCallbackData(
  entryIndex: number,
  listPage: number,
  source: NewsCallbackSource = "hall"
): string {
  return source === "raid"
    ? `${PREFIX}:rentry:${entryIndex}:${listPage}`
    : `${PREFIX}:entry:${entryIndex}:${listPage}`;
}

export function parseNewsCallbackData(
  data: string | undefined
): Result<NewsCallback, NewsCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, first, second, ...rest] = data.split(":");

  if (section !== "news" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "list" || action === "rlist") {
    const page = parseNonNegativeInteger(first);
    return page === null
      ? err("invalid-page")
      : ok({ type: "list", page, source: action === "rlist" ? "raid" : "hall" });
  }

  if (action === "entry" || action === "rentry") {
    const entryIndex = parseNonNegativeInteger(first);
    const listPage = parseNonNegativeInteger(second);

    if (entryIndex === null || listPage === null) {
      return err("invalid-page");
    }

    return ok({
      type: "entry",
      entryIndex,
      listPage,
      source: action === "rentry" ? "raid" : "hall"
    });
  }

  return err("invalid-action");
}

function parseNonNegativeInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
