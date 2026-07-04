import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type ClassNoncombatCallback =
  | { type: "open"; mode: "priest" | "rogue"; page: number }
  | {
      type: "priest-heal";
      targetTelegramUserId: bigint | null;
      actorRemortCount: number;
      targetRemortCount: number;
      page: number;
    }
  | {
      type: "priest-bless";
      targetTelegramUserId: bigint | null;
      actorRemortCount: number;
      targetRemortCount: number;
      page: number;
    }
  | {
      type: "rogue-pickpocket";
      targetTelegramUserId: bigint;
      actorRemortCount: number;
      targetRemortCount: number;
      page: number;
    }
  | {
      type: "rogue-retaliation-duel";
      retaliationToken: string;
    };

export type ClassNoncombatCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-target"
  | "invalid-remort"
  | "invalid-page"
  | "too-long";

const PREFIX = "v1:nc";
const targetPattern = /^[0-9a-z]{1,13}$/;
const numberPattern = /^[0-9a-z]{1,4}$/;
const retaliationTokenPattern = /^[0-9a-z]{8,24}$/;

export function makeClassNoncombatOpenCallbackData(mode: "priest" | "rogue", page = 0): string {
  return `${PREFIX}:o:${mode === "priest" ? "p" : "r"}:${page.toString(36)}`;
}

export function makePriestHealCallbackData(input: {
  targetTelegramUserId: bigint | null;
  actorRemortCount: number;
  targetRemortCount: number;
  page?: number;
}): string {
  return makeTargetedCallback("h", input);
}

export function makePriestBlessCallbackData(input: {
  targetTelegramUserId: bigint | null;
  actorRemortCount: number;
  targetRemortCount: number;
  page?: number;
}): string {
  return makeTargetedCallback("b", input);
}

export function makeRoguePickpocketCallbackData(input: {
  targetTelegramUserId: bigint;
  actorRemortCount: number;
  targetRemortCount: number;
  page?: number;
}): string {
  return makeTargetedCallback("p", input);
}

export function makeRogueRetaliationDuelCallbackData(input: {
  retaliationToken: string;
}): string {
  return `${PREFIX}:rd:${input.retaliationToken}`;
}

export function parseClassNoncombatCallbackData(
  data: string | undefined
): Result<ClassNoncombatCallback, ClassNoncombatCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  const [, section, action, first, second, third, fourth, ...rest] = data.split(":");
  if (section !== "nc" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "o") {
    if (first !== "p" && first !== "r") {
      return err("invalid-action");
    }
    if (!second || !numberPattern.test(second) || third !== undefined || fourth !== undefined) {
      return err("invalid-page");
    }
    return ok({ type: "open", mode: first === "p" ? "priest" : "rogue", page: Number.parseInt(second, 36) });
  }

  if (action === "rd") {
    if (!first || !retaliationTokenPattern.test(first)) {
      return err("invalid-target");
    }
    if (second !== undefined || third !== undefined || fourth !== undefined) {
      return err("invalid-prefix");
    }

    return ok({
      type: "rogue-retaliation-duel",
      retaliationToken: first
    });
  }

  if (action !== "h" && action !== "b" && action !== "p") {
    return err("invalid-action");
  }

  if (!first || (first !== "s" && !targetPattern.test(first))) {
    return err("invalid-target");
  }
  if (action === "p" && first === "s") {
    return err("invalid-target");
  }
  if (!second || !numberPattern.test(second) || !third || !numberPattern.test(third)) {
    return err("invalid-remort");
  }
  if (!fourth || !numberPattern.test(fourth)) {
    return err("invalid-page");
  }

  const payload = {
    targetTelegramUserId: first === "s" ? null : parseBase36BigInt(first),
    actorRemortCount: Number.parseInt(second, 36),
    targetRemortCount: Number.parseInt(third, 36),
    page: Number.parseInt(fourth, 36)
  };

  if (action === "h") {
    return ok({ type: "priest-heal", ...payload });
  }
  if (action === "b") {
    return ok({ type: "priest-bless", ...payload });
  }

  return ok({
    type: "rogue-pickpocket",
    ...payload,
    targetTelegramUserId: payload.targetTelegramUserId!
  });
}

function makeTargetedCallback(
  action: "h" | "b" | "p",
  input: {
    targetTelegramUserId: bigint | null;
    actorRemortCount: number;
    targetRemortCount: number;
    page?: number;
  }
): string {
  const target = input.targetTelegramUserId === null ? "s" : input.targetTelegramUserId.toString(36);
  return [
    PREFIX,
    action,
    target,
    Math.max(0, input.actorRemortCount).toString(36),
    Math.max(0, input.targetRemortCount).toString(36),
    Math.max(0, input.page ?? 0).toString(36)
  ].join(":");
}

function parseBase36BigInt(value: string): bigint {
  let result = 0n;

  for (const char of value) {
    result = result * 36n + BigInt(Number.parseInt(char, 36));
  }

  return result;
}
