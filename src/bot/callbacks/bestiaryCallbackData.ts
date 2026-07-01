import { contentIdSchema } from "../../content";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type BestiaryCallback =
  | { type: "list"; page: number; source: BestiaryCallbackSource }
  | { type: "monster"; monsterId: string; page: number; source: BestiaryCallbackSource }
  | { type: "special"; specialId: string; page: number; source: BestiaryCallbackSource }
  | { type: "random"; source: BestiaryCallbackSource };

export type BestiaryCallbackSource = "quest" | "lore";

export type BestiaryCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-page"
  | "invalid-monster"
  | "invalid-special"
  | "invalid-source"
  | "too-long";

const PREFIX = "v1:bst";

export function makeBestiaryListCallbackData(
  page: number,
  source: BestiaryCallbackSource = "quest"
): string {
  return withSource(`${PREFIX}:list:${page}`, source);
}

export function makeBestiaryMonsterCallbackData(
  monsterId: string,
  page: number,
  source: BestiaryCallbackSource = "quest"
): string {
  return withSource(`${PREFIX}:mon:${monsterId}:${page}`, source);
}

export function makeBestiarySpecialCallbackData(
  specialId: string,
  page: number,
  source: BestiaryCallbackSource = "quest"
): string {
  return withSource(`${PREFIX}:sp:${specialId}:${page}`, source);
}

export function makeBestiaryRandomCallbackData(source: BestiaryCallbackSource = "quest"): string {
  return withSource(`${PREFIX}:r`, source);
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

  const [, section, kind, first, second, third, ...rest] = data.split(":");

  if (section !== "bst" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (kind === "list") {
    const page = parsePage(first);
    const source = parseSource(second);

    if (page === null) {
      return err("invalid-page");
    }

    if (source === null || third !== undefined) {
      return err("invalid-source");
    }

    return ok({ type: "list", page, source });
  }

  if (kind === "r") {
    const source = parseSource(first);

    return source !== null && second === undefined && third === undefined
      ? ok({ type: "random", source })
      : err("invalid-source");
  }

  if (kind === "mon") {
    const page = parsePage(second);
    const source = parseSource(third);

    if (!first || !contentIdSchema.safeParse(first).success) {
      return err("invalid-monster");
    }

    if (page === null) {
      return err("invalid-page");
    }

    if (source === null) {
      return err("invalid-source");
    }

    return ok({ type: "monster", monsterId: first, page, source });
  }

  if (kind === "sp") {
    const page = parsePage(second);
    const source = parseSource(third);

    if (!first || !contentIdSchema.safeParse(first).success) {
      return err("invalid-special");
    }

    if (page === null) {
      return err("invalid-page");
    }

    if (source === null) {
      return err("invalid-source");
    }

    return ok({ type: "special", specialId: first, page, source });
  }

  return err("invalid-prefix");
}

function parsePage(value: string | undefined): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) {
    return null;
  }

  return Number(value);
}

function withSource(data: string, source: BestiaryCallbackSource): string {
  return source === "lore" ? `${data}:l` : data;
}

function parseSource(value: string | undefined): BestiaryCallbackSource | null {
  if (value === undefined || value === "q") {
    return "quest";
  }

  if (value === "l") {
    return "lore";
  }

  return null;
}
