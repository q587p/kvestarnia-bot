import { err, ok, type Result } from "../../shared/result";
import type { GroupCombatActionKey } from "../../domain/groupCombat/groupCombat";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type GroupCombatCallback =
  | { type: "view"; token: string }
  | { type: "journal"; token: string; page: number }
  | { type: "action"; token: string; turn: number; action: GroupCombatActionKey; targetIndex: number };

type GroupCombatCallbackError = "invalid" | "too-long";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;

export function makeGroupCombatViewCallbackData(token: string): string {
  return `v1:gc:v:${token}`;
}

export function makeGroupCombatJournalCallbackData(token: string, page: number): string {
  return `v1:gc:j:${token}:${Math.max(0, Math.floor(page)).toString(36)}`;
}

export function makeGroupCombatActionCallbackData(input: {
  token: string;
  turn: number;
  action: GroupCombatActionKey;
  targetIndex: number;
}): string {
  return `v1:gc:a:${input.token}:${input.turn.toString(36)}:${actionKey(input.action)}:${input.targetIndex.toString(36)}`;
}

export function parseGroupCombatCallbackData(
  data: string | undefined
): Result<GroupCombatCallback, GroupCombatCallbackError> {
  if (!data || Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err(data ? "too-long" : "invalid");
  }
  const parts = data.split(":");
  if (parts[0] !== "v1" || parts[1] !== "gc" || !TOKEN_PATTERN.test(parts[3] ?? "")) {
    return err("invalid");
  }
  const token = parts[3]!;
  if (parts[2] === "v" && parts.length === 4) {
    return ok({ type: "view", token });
  }
  if (parts[2] === "j" && parts.length === 5) {
    const page = parseBase36(parts[4], true);
    return page === null ? err("invalid") : ok({ type: "journal", token, page });
  }
  if (parts[2] !== "a" || parts.length !== 7) {
    return err("invalid");
  }
  const turn = parseBase36(parts[4]);
  const action = parseAction(parts[5]);
  const targetIndex = parseBase36(parts[6], true);
  return turn !== null && action && targetIndex !== null
    ? ok({ type: "action", token, turn, action, targetIndex })
    : err("invalid");
}

function actionKey(action: GroupCombatActionKey): string {
  return action === "attack" ? "a" : action === "guard" ? "g" : "h";
}

function parseAction(value: string | undefined): GroupCombatActionKey | null {
  return value === "a" ? "attack" : value === "g" ? "guard" : value === "h" ? "aid" : null;
}

function parseBase36(value: string | undefined, allowZero = false): number | null {
  if (!value || !/^[0-9a-z]{1,4}$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 36);
  return Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0) ? parsed : null;
}
