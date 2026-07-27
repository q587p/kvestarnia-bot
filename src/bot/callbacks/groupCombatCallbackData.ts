import { err, ok, type Result } from "../../shared/result";
import type { GroupCombatActionKey } from "../../domain/groupCombat/groupCombat";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type GroupCombatCallback =
  | { type: "start"; token: string }
  | { type: "start-left"; token: string }
  | { type: "invite-left"; token: string }
  | { type: "view"; token: string }
  | { type: "journal"; token: string; page: number }
  | { type: "statistics"; token: string }
  | { type: "items"; token: string; turn: number }
  | {
      type: "action";
      token: string;
      turn: number;
      action: GroupCombatActionKey;
      optionIndex?: number;
      targetIndex: number;
    };

type GroupCombatCallbackError = "invalid" | "too-long";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;

export function makeGroupCombatViewCallbackData(token: string): string {
  return `v1:gc:v:${token}`;
}

export function makeGroupCombatStartCallbackData(token: string): string {
  return `v1:gc:s:${token}`;
}

export function makeLeftPassagePartyInviteCallbackData(encounterToken: string): string {
  return `v3:gc:i:${encounterToken}`;
}

export function makeLeftPassageGroupCombatStartCallbackData(token: string): string {
  return `v3:gc:s:${token}`;
}

export function makeGroupCombatJournalCallbackData(token: string, page: number): string {
  return `v1:gc:j:${token}:${Math.max(0, Math.floor(page)).toString(36)}`;
}

export function makeGroupCombatStatisticsCallbackData(token: string): string {
  return `v1:gc:t:${token}`;
}

export function makeGroupCombatItemsMenuCallbackData(token: string, turn: number): string {
  return `v2:gc:m:${token}:${Math.max(1, Math.floor(turn)).toString(36)}`;
}

export function makeGroupCombatActionCallbackData(input: {
  token: string;
  turn: number;
  action: GroupCombatActionKey;
  optionIndex?: number;
  targetIndex: number;
}): string {
  return `v2:gc:a:${input.token}:${input.turn.toString(36)}:${actionKey(input.action)}:${Math.max(
    0,
    Math.floor(input.optionIndex ?? 0)
  ).toString(36)}:${input.targetIndex.toString(36)}`;
}

export function parseGroupCombatCallbackData(
  data: string | undefined
): Result<GroupCombatCallback, GroupCombatCallbackError> {
  if (!data || Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err(data ? "too-long" : "invalid");
  }
  const parts = data.split(":");
  if (
    (parts[0] !== "v1" && parts[0] !== "v2" && parts[0] !== "v3") ||
    parts[1] !== "gc" ||
    !TOKEN_PATTERN.test(parts[3] ?? "")
  ) {
    return err("invalid");
  }
  const token = parts[3]!;
  if (parts[0] === "v1" && parts[2] === "s" && parts.length === 4) {
    return ok({ type: "start", token });
  }
  if (parts[0] === "v3" && parts[2] === "s" && parts.length === 4) {
    return ok({ type: "start-left", token });
  }
  if (parts[0] === "v3" && parts[2] === "i" && parts.length === 4) {
    return ok({ type: "invite-left", token });
  }
  if (parts[0] === "v1" && parts[2] === "v" && parts.length === 4) {
    return ok({ type: "view", token });
  }
  if (parts[0] === "v1" && parts[2] === "j" && parts.length === 5) {
    const page = parseBase36(parts[4], true);
    return page === null ? err("invalid") : ok({ type: "journal", token, page });
  }
  if (parts[0] === "v1" && parts[2] === "t" && parts.length === 4) {
    return ok({ type: "statistics", token });
  }
  if (parts[0] === "v2" && parts[2] === "m" && parts.length === 5) {
    const turn = parseBase36(parts[4]);
    return turn === null ? err("invalid") : ok({ type: "items", token, turn });
  }
  if (parts[0] !== "v2" || parts[2] !== "a" || parts.length !== 8) {
    return err("invalid");
  }
  const turn = parseBase36(parts[4]);
  const action = parseAction(parts[5]);
  const optionIndex = parseBase36(parts[6], true);
  const targetIndex = parseBase36(parts[7], true);
  return turn !== null && action && optionIndex !== null && targetIndex !== null
    ? ok({
        type: "action",
        token,
        turn,
        action,
        ...(optionIndex > 0 ? { optionIndex } : {}),
        targetIndex
      })
    : err("invalid");
}

function actionKey(action: GroupCombatActionKey): string {
  return action === "attack"
    ? "a"
    : action === "guard"
      ? "g"
      : action === "class"
        ? "c"
        : action === "race"
          ? "r"
          : action === "gear"
            ? "e"
            : "i";
}

function parseAction(value: string | undefined): GroupCombatActionKey | null {
  return value === "a"
    ? "attack"
    : value === "g"
      ? "guard"
      : value === "c"
        ? "class"
        : value === "r"
          ? "race"
          : value === "e"
            ? "gear"
            : value === "i"
              ? "item"
              : null;
}

function parseBase36(value: string | undefined, allowZero = false): number | null {
  if (!value || !/^[0-9a-z]{1,4}$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 36);
  return Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0) ? parsed : null;
}
