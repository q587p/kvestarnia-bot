import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type ReferralCallback =
  | { type: "open" }
  | { type: "accept" }
  | { type: "decline" }
  | { type: "create" }
  | { type: "list"; page: number }
  | { type: "refresh" };

const PREFIX = "v1:ref:";

export function makeReferralOpenCallbackData(): string {
  return `${PREFIX}o`;
}
export function makeReferralAcceptCallbackData(): string {
  return `${PREFIX}a`;
}
export function makeReferralDeclineCallbackData(): string {
  return `${PREFIX}d`;
}
export function makeReferralCreateCallbackData(): string {
  return `${PREFIX}c`;
}
export function makeReferralListCallbackData(page: number): string {
  return `${PREFIX}l:${Math.max(0, Math.floor(page))}`;
}
export function makeReferralRefreshCallbackData(): string {
  return `${PREFIX}r`;
}

export function parseReferralCallbackData(data: string): { ok: true; value: ReferralCallback } | { ok: false } {
  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT || !data.startsWith(PREFIX)) {
    return { ok: false };
  }
  const value = data.slice(PREFIX.length);
  if (value === "o") return { ok: true, value: { type: "open" } };
  if (value === "a") return { ok: true, value: { type: "accept" } };
  if (value === "d") return { ok: true, value: { type: "decline" } };
  if (value === "c") return { ok: true, value: { type: "create" } };
  if (value === "r") return { ok: true, value: { type: "refresh" } };
  const list = value.match(/^l:(\d{1,6})$/);
  return list ? { ok: true, value: { type: "list", page: Number(list[1]) } } : { ok: false };
}
