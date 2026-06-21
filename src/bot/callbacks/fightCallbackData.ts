import type { CombatProbeAction } from "../../domain/combat/combatProbe";
import type { PlayerCombatActionType } from "../../domain/combat";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type FightCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-turn"
  | "too-long";

export type FightCallback =
  | {
      type: "mimic";
      action: CombatProbeAction;
    }
  | {
      type: "turn";
      sessionId: string;
      turn: number;
      action: PlayerCombatActionType;
    }
  | {
      type: "view";
      sessionId: string;
    }
  | {
      type: "journal";
      sessionId: string;
      page: number;
    };

const MIMIC_PREFIX = "v1:fight:mimic";
const TURN_PREFIX = "v1:fight:turn";
const VIEW_PREFIX = "v1:fight:view";
const JOURNAL_PREFIX = "v1:fight:log";
const fightActions = new Set<CombatProbeAction>(["attack", "receipt", "flee"]);
const turnActions = new Set<PlayerCombatActionType>(["attack", "defend", "skill", "flee"]);
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function makeFightCallbackData(action: CombatProbeAction): string {
  return `${MIMIC_PREFIX}:${action}`;
}

export function makeFightTurnCallbackData(input: {
  sessionId: string;
  turn: number;
  action: PlayerCombatActionType;
}): string {
  return `${TURN_PREFIX}:${input.sessionId}:${input.turn}:${input.action}`;
}

export function makeFightViewCallbackData(sessionId: string): string {
  return `${VIEW_PREFIX}:${sessionId}`;
}

export function makeFightJournalCallbackData(input: {
  sessionId: string;
  page: number;
}): string {
  return `${JOURNAL_PREFIX}:${input.sessionId}:${normalizePage(input.page)}`;
}

export function parseFightCallbackData(
  data: string | undefined
): Result<FightCallback, FightCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (data.startsWith(`${MIMIC_PREFIX}:`)) {
    const [, section, scene, action, ...rest] = data.split(":");

    if (section !== "fight" || scene !== "mimic" || rest.length > 0) {
      return err("invalid-prefix");
    }

    if (!fightActions.has(action as CombatProbeAction)) {
      return err("invalid-action");
    }

    return ok({
      type: "mimic",
      action: action as CombatProbeAction
    });
  }

  if (data.startsWith(`${TURN_PREFIX}:`)) {
    const [, section, scene, sessionId, turnRaw, action, ...rest] = data.split(":");

    if (section !== "fight" || scene !== "turn" || rest.length > 0) {
      return err("invalid-prefix");
    }

    if (!sessionId || !sessionIdPattern.test(sessionId)) {
      return err("invalid-prefix");
    }

    const turn = Number(turnRaw);

    if (!Number.isInteger(turn) || turn < 1) {
      return err("invalid-turn");
    }

    if (!turnActions.has(action as PlayerCombatActionType)) {
      return err("invalid-action");
    }

    return ok({
      type: "turn",
      sessionId,
      turn,
      action: action as PlayerCombatActionType
    });
  }

  if (data.startsWith(`${VIEW_PREFIX}:`)) {
    const [, section, scene, sessionId, ...rest] = data.split(":");

    if (section !== "fight" || scene !== "view" || rest.length > 0) {
      return err("invalid-prefix");
    }

    if (!sessionId || !sessionIdPattern.test(sessionId)) {
      return err("invalid-prefix");
    }

    return ok({
      type: "view",
      sessionId
    });
  }

  if (data.startsWith(`${JOURNAL_PREFIX}:`)) {
    const [, section, scene, sessionId, pageRaw, ...rest] = data.split(":");

    if (section !== "fight" || scene !== "log" || rest.length > 0) {
      return err("invalid-prefix");
    }

    if (!sessionId || !sessionIdPattern.test(sessionId)) {
      return err("invalid-prefix");
    }

    const page = Number(pageRaw);

    if (!Number.isInteger(page) || page < 0) {
      return err("invalid-turn");
    }

    return ok({
      type: "journal",
      sessionId,
      page
    });
  }

  return err("invalid-prefix");
}

function normalizePage(page: number): number {
  return Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));
}
