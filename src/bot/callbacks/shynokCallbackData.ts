import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";
import {
  isShynokDrinkKey,
  SHYNOK_ROUND_REPLACEMENT_GUARD_HEX_LENGTH,
  type ShynokDrinkKey
} from "../../domain/shynokDrinks";

const PREFIX = "v1:sh";
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShynokCallback =
  | { type: "overview" }
  | { type: "bard-performance-start" }
  | { type: "bard-performance-applaud"; reactionId: string }
  | { type: "bard-performance-decline"; reactionId: string }
  | { type: "bard-performance-tip"; reactionId: string; tipGold: 1 | 3 | 5 | 13 }
  | { type: "drinks" }
  | { type: "drink-preview"; drinkKey: ShynokDrinkKey }
  | { type: "drink-confirm"; token: string }
  | { type: "round-preview"; tier: "simple" | "fine" }
  | { type: "barrel-round-preview"; tier: "simple" | "fine" }
  | { type: "round-confirm"; tier: "simple" | "fine"; token: string }
  | { type: "round-accept"; offerId: string }
  | { type: "round-replace-confirm"; offerId: string; replacementGuard: string }
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

export function makeShynokBardPerformanceStartCallbackData(): string {
  return assertData(`${PREFIX}:bp`);
}

export function makeShynokBardPerformanceApplaudCallbackData(reactionId: string): string {
  return assertData(`${PREFIX}:ba:${reactionId}`);
}

export function makeShynokBardPerformanceDeclineCallbackData(reactionId: string): string {
  return assertData(`${PREFIX}:bd:${reactionId}`);
}

export function makeShynokBardPerformanceTipCallbackData(reactionId: string, tipGold: 1 | 3 | 5 | 13): string {
  return assertData(`${PREFIX}:bt:${reactionId}:${tipGold}`);
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

export function makeShynokBarrelRoundPreviewCallbackData(tier: "simple" | "fine"): string {
  return assertData(`${PREFIX}:brp:${tier}`);
}

export function makeShynokRoundConfirmCallbackData(tier: "simple" | "fine", token: string): string {
  return assertData(`${PREFIX}:rc:${tier}:${token}`);
}

export function makeShynokRoundAcceptCallbackData(offerId: string): string {
  return assertData(`${PREFIX}:ra:${offerId}`);
}

export function makeShynokRoundReplacementConfirmCallbackData(offerId: string, replacementGuard: string): string {
  return assertData(`${PREFIX}:rr:${offerId}:${replacementGuard}`);
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
  if (action === "bp" && first === undefined) {
    return { ok: true, value: { type: "bard-performance-start" } };
  }
  if ((action === "ba" || action === "bd") && isToken(first) && second === undefined) {
    return {
      ok: true,
      value: {
        type: action === "ba" ? "bard-performance-applaud" : "bard-performance-decline",
        reactionId: first ?? ""
      }
    };
  }
  if (action === "bt" && isToken(first) && isTipGold(second) && third === undefined) {
    return {
      ok: true,
      value: {
        type: "bard-performance-tip",
        reactionId: first ?? "",
        tipGold: Number(second) as 1 | 3 | 5 | 13
      }
    };
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
  if (action === "brp" && isTier(first) && second === undefined) {
    return { ok: true, value: { type: "barrel-round-preview", tier: first } };
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
  if (action === "rr" && isToken(first) && isReplacementGuard(second) && third === undefined) {
    return {
      ok: true,
      value: {
        type: "round-replace-confirm",
        offerId: first ?? "",
        replacementGuard: second ?? ""
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

function isReplacementGuard(value: string | undefined): boolean {
  return new RegExp(`^[0-9a-f]{${SHYNOK_ROUND_REPLACEMENT_GUARD_HEX_LENGTH}}$`, "i").test(value ?? "");
}

function isSafeIndex(value: string | undefined): boolean {
  return value !== undefined && /^\d{1,3}$/.test(value) && Number.isSafeInteger(Number(value));
}

function isTier(value: string | undefined): value is "simple" | "fine" {
  return value === "simple" || value === "fine";
}

function isTipGold(value: string | undefined): value is "1" | "3" | "5" | "13" {
  return value === "1" || value === "3" || value === "5" || value === "13";
}
