import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type LoreBoardCallback =
  | { type: "menu" }
  | { type: "category"; categoryId: string }
  | { type: "group"; groupId: string }
  | { type: "entry"; entryId: string }
  | { type: "random" }
  | { type: "category-random"; categoryId: string };

export type LoreBoardCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-id"
  | "too-long";

const PREFIX = "v1:lore";

export function makeLoreMenuCallbackData(): string {
  return `${PREFIX}:m`;
}

export function makeLoreCategoryCallbackData(categoryId: string): string {
  return `${PREFIX}:c:${categoryId}`;
}

export function makeLoreGroupCallbackData(groupId: string): string {
  return `${PREFIX}:g:${groupId}`;
}

export function makeLoreEntryCallbackData(entryId: string): string {
  return `${PREFIX}:e:${entryId}`;
}

export function makeLoreRandomCallbackData(): string {
  return `${PREFIX}:r`;
}

export function makeLoreCategoryRandomCallbackData(categoryId: string): string {
  return `${PREFIX}:rc:${categoryId}`;
}

export function parseLoreBoardCallbackData(
  data: string | undefined
): Result<LoreBoardCallback, LoreBoardCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, id, ...rest] = data.split(":");

  if (section !== "lore" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "m" && id === undefined) {
    return ok({ type: "menu" });
  }

  if (action === "r" && id === undefined) {
    return ok({ type: "random" });
  }

  if (action === "c") {
    return isSafeCategoryToken(id) ? ok({ type: "category", categoryId: id }) : err("invalid-id");
  }

  if (action === "g") {
    return isSafeCategoryToken(id) ? ok({ type: "group", groupId: id }) : err("invalid-id");
  }

  if (action === "rc") {
    return isSafeCategoryToken(id) ? ok({ type: "category-random", categoryId: id }) : err("invalid-id");
  }

  if (action === "e") {
    return isSafeEntryToken(id) ? ok({ type: "entry", entryId: id }) : err("invalid-id");
  }

  return err("invalid-action");
}

function isSafeCategoryToken(value: string | undefined): value is string {
  return Boolean(value && /^[a-z0-9-]+$/.test(value));
}

function isSafeEntryToken(value: string | undefined): value is string {
  return Boolean(value && /^[a-z0-9-]+$/.test(value));
}
