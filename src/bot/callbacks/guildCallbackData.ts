import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type GuildCallback =
  | { type: "open" }
  | { type: "create-confirm"; token: string }
  | { type: "invite-accept" | "invite-decline" | "invite-cancel"; token: string }
  | { type: "party-create" }
  | { type: "leave" | "delete"; version: number }
  | { type: "transfer" | "promote" | "demote" | "kick"; memberId: string; version: number };

export type GuildCallbackError = "invalid-prefix" | "invalid-action" | "invalid-token" | "invalid-version" | "too-long";

const PREFIX = "v1:g";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;
const MEMBER_PATTERN = /^[A-Za-z0-9-]{8,40}$/;
const VERSION_PATTERN = /^[0-9a-z]{1,6}$/;

export const makeGuildOpenCallbackData = (): string => `${PREFIX}:o`;
export const makeGuildCreateConfirmCallbackData = (token: string): string => `${PREFIX}:c:${token}`;
export const makeGuildInviteAcceptCallbackData = (token: string): string => `${PREFIX}:a:${token}`;
export const makeGuildInviteDeclineCallbackData = (token: string): string => `${PREFIX}:d:${token}`;
export const makeGuildInviteCancelCallbackData = (token: string): string => `${PREFIX}:x:${token}`;
export const makeGuildPartyCreateCallbackData = (): string => `${PREFIX}:y`;
export const makeGuildLeaveCallbackData = (version: number): string => `${PREFIX}:l:${version.toString(36)}`;
export const makeGuildDeleteCallbackData = (version: number): string => `${PREFIX}:z:${version.toString(36)}`;
export const makeGuildMemberMutationCallbackData = (
  action: "transfer" | "promote" | "demote" | "kick",
  memberId: string,
  version: number
): string => `${PREFIX}:${({ transfer: "t", promote: "p", demote: "m", kick: "k" } as const)[action]}:${memberId}:${version.toString(36)}`;

export function parseGuildCallbackData(data: string | undefined): Result<GuildCallback, GuildCallbackError> {
  if (!data?.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }
  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }
  const [, section, action, first, second, ...rest] = data.split(":");
  if (section !== "g" || rest.length > 0) {
    return err("invalid-prefix");
  }
  if (action === "o" && first === undefined) {
    return ok({ type: "open" });
  }
  if (action === "y" && first === undefined) {
    return ok({ type: "party-create" });
  }
  if (action === "c" || action === "a" || action === "d" || action === "x") {
    if (!first || second !== undefined || !TOKEN_PATTERN.test(first)) {
      return err("invalid-token");
    }
    return ok({
      type: action === "c" ? "create-confirm" : action === "a" ? "invite-accept" : action === "d" ? "invite-decline" : "invite-cancel",
      token: first
    });
  }
  if (action === "l" || action === "z") {
    const version = parseVersion(first, second);
    return version === null ? err("invalid-version") : ok({ type: action === "l" ? "leave" : "delete", version });
  }
  if (action === "t" || action === "p" || action === "m" || action === "k") {
    if (!first || !MEMBER_PATTERN.test(first) || !second || !VERSION_PATTERN.test(second)) {
      return err("invalid-token");
    }
    return ok({
      type: action === "t" ? "transfer" : action === "p" ? "promote" : action === "m" ? "demote" : "kick",
      memberId: first,
      version: Number.parseInt(second, 36)
    });
  }
  return err("invalid-action");
}

function parseVersion(first: string | undefined, second: string | undefined): number | null {
  return first && second === undefined && VERSION_PATTERN.test(first) ? Number.parseInt(first, 36) : null;
}
