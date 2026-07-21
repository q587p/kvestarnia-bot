import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export const DEV_HELP_CONTENT_PAGES = ["general", "combat", "resources", "quests"] as const;
export const DEV_HELP_PAGES = ["menu", ...DEV_HELP_CONTENT_PAGES] as const;

export type DevHelpPage = (typeof DEV_HELP_PAGES)[number];
export type DevHelpCallbackError = "invalid-version" | "invalid-prefix" | "invalid-page" | "too-long";

const PREFIX = "v1:dh";
const pages = new Set<DevHelpPage>(DEV_HELP_PAGES);

export function makeDevHelpCallbackData(page: DevHelpPage): string {
  return `${PREFIX}:${page}`;
}

export function parseDevHelpCallbackData(
  data: string | undefined
): Result<DevHelpPage, DevHelpCallbackError> {
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
  if (section !== "dh" || rest.length > 0) {
    return err("invalid-prefix");
  }

  return pages.has(page as DevHelpPage)
    ? ok(page as DevHelpPage)
    : err("invalid-page");
}
