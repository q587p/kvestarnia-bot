import { contentIdSchema } from "../../content";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type BestiaryCallback =
  | { type: "list"; page: number }
  | { type: "monster"; monsterId: string; page: number }
  | { type: "special"; specialId: string; page: number };

export type BestiaryCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-page"
  | "invalid-monster"
  | "invalid-special"
  | "too-long";

const PREFIX = "v1:bst";

export function makeBestiaryListCallbackData(page: number): string {
  return `${PREFIX}:list:${page}`;
}

export function makeBestiaryMonsterCallbackData(monsterId: string, page: number): string {
  return `${PREFIX}:mon:${monsterId}:${page}`;
}

export function makeBestiarySpecialCallbackData(specialId: string, page: number): string {
  return `${PREFIX}:sp:${specialId}:${page}`;
}

export function parseBestiaryCallbackData(
  data: string | undefined
): Result<BestiaryCallback, BestiaryCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, kind, first, second, ...rest] = data.split(":");

  if (section !== "bst" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (kind === "list") {
    const page = parsePage(first);

    if (page === null || second !== undefined) {
      return err("invalid-page");
    }

    return ok({ type: "list", page });
  }

  if (kind === "mon") {
    const page = parsePage(second);

    if (!first || !contentIdSchema.safeParse(first).success) {
      return err("invalid-monster");
    }

    if (page === null) {
      return err("invalid-page");
    }

    return ok({ type: "monster", monsterId: first, page });
  }

  if (kind === "sp") {
    const page = parsePage(second);

    if (!first || !contentIdSchema.safeParse(first).success) {
      return err("invalid-special");
    }

    if (page === null) {
      return err("invalid-page");
    }

    return ok({ type: "special", specialId: first, page });
  }

  return err("invalid-prefix");
}

function parsePage(value: string | undefined): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) {
    return null;
  }

  return Number(value);
}
