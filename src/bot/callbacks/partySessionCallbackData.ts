import { err, ok, type Result } from "../../shared/result";
import type { PartyParticipantReadiness } from "../../db/repositories/partySessionRepository";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type PartySessionCallback =
  | { type: "view"; token: string }
  | { type: "join"; token: string }
  | { type: "leave"; token: string }
  | { type: "cancel"; token: string }
  | { type: "expire"; token: string }
  | { type: "readiness"; token: string; readiness: PartyParticipantReadiness }
  | { type: "boss-start"; token: string }
  | { type: "boss-action"; token: string; turn: number; action: PartyBossCallbackAction }
  | { type: "boss-items"; token: string; turn: number }
  | { type: "boss-item"; token: string; turn: number; itemKey: string }
  | { type: "boss-timeout"; token: string }
  | { type: "boss-journal"; token: string; page: number | null }
  | { type: "share"; token: string }
  | { type: "invite"; token: string; templateIndex: number }
  | { type: "nearby-open"; page: number }
  | { type: "nearby-invite"; targetTelegramUserId: bigint; page: number };

export type PartyBossCallbackAction = "attack" | "defend" | "skill" | "race";

export type PartySessionCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-token"
  | "invalid-target"
  | "invalid-page"
  | "too-long";

const PREFIX = "v1:party";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;
const PAGE_PATTERN = /^[0-9a-z]{1,3}$/;
const TARGET_PATTERN = /^[0-9a-z]{1,13}$/;
const ITEM_KEY_PATTERN = /^[a-z0-9]{1,10}$/;

export function makePartySessionViewCallbackData(token: string): string {
  return `${PREFIX}:v:${token}`;
}

export function makePartySessionJoinCallbackData(token: string): string {
  return `${PREFIX}:j:${token}`;
}

export function makePartySessionLeaveCallbackData(token: string): string {
  return `${PREFIX}:l:${token}`;
}

export function makePartySessionCancelCallbackData(token: string): string {
  return `${PREFIX}:c:${token}`;
}

export function makePartySessionExpireCallbackData(token: string): string {
  return `${PREFIX}:x:${token}`;
}

export function makePartySessionReadinessCallbackData(
  token: string,
  readiness: PartyParticipantReadiness
): string {
  return `${PREFIX}:rs:${token}:${readiness === "ready" ? "r" : "w"}`;
}

export function makePartyBossStartCallbackData(token: string): string {
  return `${PREFIX}:bs:${token}`;
}

export function makePartyBossActionCallbackData(
  token: string,
  turn: number,
  action: PartyBossCallbackAction
): string {
  return `${PREFIX}:ba:${token}:${turn.toString(36)}:${actionKey(action)}`;
}

export function makePartyBossItemsMenuCallbackData(token: string, turn: number): string {
  return `${PREFIX}:bm:${token}:${turn.toString(36)}`;
}

export function makePartyBossItemUseCallbackData(input: {
  token: string;
  turn: number;
  itemKey: string;
}): string {
  return `${PREFIX}:bi:${input.token}:${input.turn.toString(36)}:${input.itemKey}`;
}

export function makePartyBossTimeoutCallbackData(token: string): string {
  return `${PREFIX}:bt:${token}`;
}

export function makePartyBossJournalCallbackData(token: string, page?: number): string {
  return page === undefined ? `${PREFIX}:bj:${token}` : `${PREFIX}:bj:${token}:${page.toString(36)}`;
}

export function makePartySessionShareCallbackData(token: string): string {
  return `${PREFIX}:sh:${token}`;
}

export function makePartySessionInviteRotateCallbackData(token: string, templateIndex: number): string {
  return `${PREFIX}:in:${token}:${templateIndex.toString(36)}`;
}

export function makePartySessionNearbyOpenCallbackData(page = 0): string {
  return page === 0 ? `${PREFIX}:no` : `${PREFIX}:no:${page.toString(36)}`;
}

export function makePartySessionNearbyInviteCallbackData(
  targetTelegramUserId: bigint,
  page = 0
): string {
  return `${PREFIX}:ni:${targetTelegramUserId.toString(36)}:${page.toString(36)}`;
}

export function parsePartySessionCallbackData(
  data: string | undefined
): Result<PartySessionCallback, PartySessionCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  const [, section, action, tokenOrTarget, page, ...rest] = data.split(":");

  if (section !== "party" || (action !== "ba" && action !== "bi" && rest.length > 0)) {
    return err("invalid-prefix");
  }

  if (action === "no") {
    if (page !== undefined) {
      return err("invalid-page");
    }

    const pageKey = tokenOrTarget ?? "0";
    if (!PAGE_PATTERN.test(pageKey)) {
      return err("invalid-page");
    }

    return ok({ type: "nearby-open", page: Number.parseInt(pageKey, 36) });
  }

  if (action === "ni") {
    if (!tokenOrTarget || !TARGET_PATTERN.test(tokenOrTarget)) {
      return err("invalid-target");
    }

    if (!page || !PAGE_PATTERN.test(page)) {
      return err("invalid-page");
    }

    return ok({
      type: "nearby-invite",
      targetTelegramUserId: parseBase36BigInt(tokenOrTarget),
      page: Number.parseInt(page, 36)
    });
  }

  if (action === "ba") {
    if (!tokenOrTarget || !TOKEN_PATTERN.test(tokenOrTarget)) {
      return err("invalid-token");
    }

    if (!page || !PAGE_PATTERN.test(page)) {
      return err("invalid-page");
    }

    const actionPart = rest[0];
    if (rest.length !== 1 || !actionPart) {
      return err("invalid-action");
    }

    const parsedAction = parseActionKey(actionPart);
    if (!parsedAction) {
      return err("invalid-action");
    }

    return ok({
      type: "boss-action",
      token: tokenOrTarget,
      turn: Number.parseInt(page, 36),
      action: parsedAction
    });
  }

  if (action === "bj") {
    if (!tokenOrTarget || !TOKEN_PATTERN.test(tokenOrTarget)) {
      return err("invalid-token");
    }

    if (page !== undefined && !PAGE_PATTERN.test(page)) {
      return err("invalid-page");
    }

    return ok({
      type: "boss-journal",
      token: tokenOrTarget,
      page: page === undefined ? null : Number.parseInt(page, 36)
    });
  }

  if (action === "bm") {
    if (!tokenOrTarget || !TOKEN_PATTERN.test(tokenOrTarget)) {
      return err("invalid-token");
    }

    if (!page || !PAGE_PATTERN.test(page)) {
      return err("invalid-page");
    }

    return ok({
      type: "boss-items",
      token: tokenOrTarget,
      turn: Number.parseInt(page, 36)
    });
  }

  if (action === "bi") {
    if (!tokenOrTarget || !TOKEN_PATTERN.test(tokenOrTarget)) {
      return err("invalid-token");
    }

    if (!page || !PAGE_PATTERN.test(page)) {
      return err("invalid-page");
    }

    const itemKey = rest[0];
    if (rest.length !== 1 || !itemKey || !ITEM_KEY_PATTERN.test(itemKey)) {
      return err("invalid-action");
    }

    return ok({
      type: "boss-item",
      token: tokenOrTarget,
      turn: Number.parseInt(page, 36),
      itemKey
    });
  }

  if (action === "in") {
    if (!tokenOrTarget || !TOKEN_PATTERN.test(tokenOrTarget)) {
      return err("invalid-token");
    }

    if (!page || !PAGE_PATTERN.test(page)) {
      return err("invalid-page");
    }

    return ok({
      type: "invite",
      token: tokenOrTarget,
      templateIndex: Number.parseInt(page, 36)
    });
  }

  if (action === "rs") {
    if (!tokenOrTarget || !TOKEN_PATTERN.test(tokenOrTarget)) {
      return err("invalid-token");
    }

    const readiness = parseReadinessKey(page);
    if (!readiness) {
      return err("invalid-action");
    }

    return ok({
      type: "readiness",
      token: tokenOrTarget,
      readiness
    });
  }

  if (!tokenOrTarget || !TOKEN_PATTERN.test(tokenOrTarget) || page !== undefined) {
    return err("invalid-token");
  }

  if (action === "v") {
    return ok({ type: "view", token: tokenOrTarget });
  }

  if (action === "j") {
    return ok({ type: "join", token: tokenOrTarget });
  }

  if (action === "l") {
    return ok({ type: "leave", token: tokenOrTarget });
  }

  if (action === "c") {
    return ok({ type: "cancel", token: tokenOrTarget });
  }

  if (action === "x") {
    return ok({ type: "expire", token: tokenOrTarget });
  }

  if (action === "bs") {
    return ok({ type: "boss-start", token: tokenOrTarget });
  }

  if (action === "bt") {
    return ok({ type: "boss-timeout", token: tokenOrTarget });
  }

  if (action === "sh") {
    return ok({ type: "share", token: tokenOrTarget });
  }

  return err("invalid-action");
}

function actionKey(action: PartyBossCallbackAction): string {
  switch (action) {
    case "attack":
      return "a";
    case "defend":
      return "d";
    case "skill":
      return "s";
    case "race":
      return "r";
  }
}

function parseActionKey(value: string): PartyBossCallbackAction | null {
  if (value === "a") {
    return "attack";
  }
  if (value === "d") {
    return "defend";
  }
  if (value === "s") {
    return "skill";
  }
  if (value === "r") {
    return "race";
  }
  return null;
}

function parseReadinessKey(value: string | undefined): PartyParticipantReadiness | null {
  if (value === "r") {
    return "ready";
  }
  if (value === "w") {
    return "waiting";
  }
  return null;
}

function parseBase36BigInt(value: string): bigint {
  let result = 0n;

  for (const char of value) {
    result = result * 36n + BigInt(Number.parseInt(char, 36));
  }

  return result;
}
