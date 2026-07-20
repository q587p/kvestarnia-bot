import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export const HELP_CONTENT_PAGES = ["hero", "adventures", "items", "korchma", "news"] as const;
export const HELP_PAGES = ["menu", ...HELP_CONTENT_PAGES] as const;

export type HelpPage = (typeof HELP_PAGES)[number];
export type HelpCallbackError = "invalid-version" | "invalid-prefix" | "invalid-page" | "too-long";

const PREFIX = "v1:help";
const helpPages = new Set<HelpPage>(HELP_PAGES);

export function makeHelpCallbackData(page: HelpPage): string {
  return `${PREFIX}:${page}`;
}

export function parseHelpCallbackData(
  data: string | undefined
): Result<HelpPage, HelpCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, page, ...rest] = data.split(":");
  if (section !== "help" || rest.length > 0) {
    return err("invalid-prefix");
  }

  return helpPages.has(page as HelpPage)
    ? ok(page as HelpPage)
    : err("invalid-page");
}
