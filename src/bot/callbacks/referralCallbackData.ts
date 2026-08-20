import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";
import {
  REFERRAL_INVITE_SHARE_TEXT_COUNT,
  normalizeReferralInviteShareTextIndex
} from "../../content/referralInviteCopy";

export type ReferralCallback =
  | { type: "open" }
  | { type: "accept" }
  | { type: "decline" }
  | { type: "create" }
  | { type: "list"; page: number }
  | { type: "share"; variant: number }
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
export function makeReferralShareCallbackData(variant: number): string {
  return `${PREFIX}s:${normalizeReferralInviteShareTextIndex(variant).toString(36)}`;
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
  const share = value.match(/^s:([0-9a-z])$/);
  if (share) {
    const variant = Number.parseInt(share[1]!, 36);
    return variant < REFERRAL_INVITE_SHARE_TEXT_COUNT
      ? { ok: true, value: { type: "share", variant } }
      : { ok: false };
  }
  const list = value.match(/^l:(\d{1,6})$/);
  return list ? { ok: true, value: { type: "list", page: Number(list[1]) } } : { ok: false };
}
