import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";
import { isShynokDrinkKey, type ShynokDrinkKey } from "../../domain/shynokDrinks";

const PREFIX = "v1:sh";
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShynokCallback =
  | { type: "overview" }
  | { type: "drinks" }
  | { type: "drink-preview"; drinkKey: ShynokDrinkKey }
  | { type: "drink-confirm"; token: string }
  | { type: "round-preview"; tier: "simple" | "fine" }
  | { type: "round-confirm"; tier: "simple" | "fine"; token: string }
  | { type: "round-accept"; offerId: string }
  | { type: "round-decline"; offerId: string }
  | { type: "sale-open" }
  | { type: "sale-page"; token: string; page: number }
  | { type: "sale-add"; token: string; page: number; index: number }
  | { type: "sale-remove"; token: string; page: number; index: number }
  | { type: "sale-all"; token: string; page: number }
  | { type: "sale-clear"; token: string; page: number }
  | { type: "sale-confirm"; token: string }
  | { type: "sale-cancel"; token: string };

export function makeShynokOverviewCallbackData(): string {
  return assertData(`${PREFIX}:open`);
}

export function makeShynokDrinksCallbackData(): string {
  return assertData(`${PREFIX}:dr`);
}

export function makeShynokDrinkPreviewCallbackData(drinkKey: ShynokDrinkKey): string {
  return assertData(`${PREFIX}:dp:${drinkKey}`);
}

export function makeShynokDrinkConfirmCallbackData(token: string): string {
  return assertData(`${PREFIX}:dc:${token}`);
}

export function makeShynokRoundPreviewCallbackData(tier: "simple" | "fine"): string {
  return assertData(`${PREFIX}:rp:${tier}`);
}

export function makeShynokRoundConfirmCallbackData(tier: "simple" | "fine", token: string): string {
  return assertData(`${PREFIX}:rc:${tier}:${token}`);
}

export function makeShynokRoundAcceptCallbackData(offerId: string): string {
  return assertData(`${PREFIX}:ra:${offerId}`);
}

export function makeShynokRoundDeclineCallbackData(offerId: string): string {
  return assertData(`${PREFIX}:rd:${offerId}`);
}

export function makeShynokSaleOpenCallbackData(): string {
  return assertData(`${PREFIX}:so`);
}

export function makeShynokSalePageCallbackData(token: string, page: number): string {
  return assertData(`${PREFIX}:sp:${token}:${page}`);
}

export function makeShynokSaleAddCallbackData(token: string, page: number, index: number): string {
  return assertData(`${PREFIX}:sa:${token}:${page}:${index}`);
}

export function makeShynokSaleRemoveCallbackData(token: string, page: number, index: number): string {
  return assertData(`${PREFIX}:sr:${token}:${page}:${index}`);
}

export function makeShynokSaleAllCallbackData(token: string, page: number): string {
  return assertData(`${PREFIX}:sall:${token}:${page}`);
}

export function makeShynokSaleClearCallbackData(token: string, page: number): string {
  return assertData(`${PREFIX}:sclr:${token}:${page}`);
}

export function makeShynokSaleConfirmCallbackData(token: string): string {
  return assertData(`${PREFIX}:sc:${token}`);
}

export function makeShynokSaleCancelCallbackData(token: string): string {
  return assertData(`${PREFIX}:sx:${token}`);
}

export function parseShynokCallbackData(data: string | undefined): ParseShynokCallbackResult {
  if (!data?.startsWith(`${PREFIX}:`) || isTooLong(data)) {
    return { ok: false };
  }

  const [version, scope, action, first, second, third, ...rest] = data.split(":");

  if (version !== "v1" || scope !== "sh" || rest.length > 0) {
    return { ok: false };
  }

  if (action === "open" && first === undefined) {
    return { ok: true, value: { type: "overview" } };
  }
  if (action === "dr" && first === undefined) {
    return { ok: true, value: { type: "drinks" } };
  }
  if (action === "dp" && first && isShynokDrinkKey(first) && second === undefined) {
    return { ok: true, value: { type: "drink-preview", drinkKey: first } };
  }
  if (action === "dc" && isToken(first) && second === undefined) {
    return { ok: true, value: { type: "drink-confirm", token: first ?? "" } };
  }
  if (action === "rp" && isTier(first) && second === undefined) {
    return { ok: true, value: { type: "round-preview", tier: first } };
  }
  if (action === "rc" && isTier(first) && isToken(second) && third === undefined) {
    return { ok: true, value: { type: "round-confirm", tier: first, token: second ?? "" } };
  }
  if ((action === "ra" || action === "rd") && isToken(first) && second === undefined) {
    return {
      ok: true,
      value: {
        type: action === "ra" ? "round-accept" : "round-decline",
        offerId: first ?? ""
      }
    };
  }
  if (action === "so" && first === undefined) {
    return { ok: true, value: { type: "sale-open" } };
  }
  if (action === "sp" && isToken(first) && isSafeIndex(second) && third === undefined) {
    return { ok: true, value: { type: "sale-page", token: first ?? "", page: Number(second) } };
  }
  if ((action === "sa" || action === "sr") && isToken(first) && isSafeIndex(second) && isSafeIndex(third)) {
    return {
      ok: true,
      value: {
        type: action === "sa" ? "sale-add" : "sale-remove",
        token: first ?? "",
        page: Number(second),
        index: Number(third)
      }
    };
  }
  if ((action === "sall" || action === "sclr") && isToken(first) && isSafeIndex(second) && third === undefined) {
    return {
      ok: true,
      value: {
        type: action === "sall" ? "sale-all" : "sale-clear",
        token: first ?? "",
        page: Number(second)
      }
    };
  }
  if ((action === "sc" || action === "sx") && isToken(first) && second === undefined) {
    return {
      ok: true,
      value: {
        type: action === "sc" ? "sale-confirm" : "sale-cancel",
        token: first ?? ""
      }
    };
  }

  return { ok: false };
}

type ParseShynokCallbackResult = { ok: true; value: ShynokCallback } | { ok: false };

function assertData(data: string): string {
  if (isTooLong(data)) {
    throw new RangeError("Telegram callback data exceeds 64 bytes.");
  }

  return data;
}

function isTooLong(data: string): boolean {
  return Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT;
}

function isToken(value: string | undefined): boolean {
  return tokenPattern.test(value ?? "");
}

function isSafeIndex(value: string | undefined): boolean {
  return value !== undefined && /^\d{1,3}$/.test(value) && Number.isSafeInteger(Number(value));
}

function isTier(value: string | undefined): value is "simple" | "fine" {
  return value === "simple" || value === "fine";
}
