import type { CombatActionType } from "../../domain/combat";
import type { TrainingDoppelgangerStartMode } from "../../services/trainingDoppelgangerService";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type TrainingDoppelgangerCallback =
  | { type: "open" }
  | { type: "mode"; mode: TrainingDoppelgangerStartMode }
  | { type: "turn"; sessionId: string; turn: number; action: CombatActionType };
export type TrainingDoppelgangerCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-turn"
  | "too-long";

const PREFIX = "v1:spar";
const MODE_PREFIX = "v1:spar:mode";
const TURN_PREFIX = "v1:spar:turn";
const turnActions = new Set<CombatActionType>(["attack", "defend", "skill", "flee"]);
const startModes = new Set<TrainingDoppelgangerStartMode>([
  "copy-target",
  "random-build",
  "champion-day",
  "champion-week",
  "champion-month"
]);
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function makeTrainingDoppelgangerCallbackData(): string {
  return `${PREFIX}:open`;
}

export function makeTrainingDoppelgangerModeCallbackData(
  mode: TrainingDoppelgangerStartMode
): string {
  return `${MODE_PREFIX}:${mode}`;
}

export function makeTrainingDoppelgangerTurnCallbackData(input: {
  sessionId: string;
  turn: number;
  action: CombatActionType;
}): string {
  return `${TURN_PREFIX}:${input.sessionId}:${input.turn}:${input.action}`;
}

export function parseTrainingDoppelgangerCallbackData(
  data: string | undefined
): Result<TrainingDoppelgangerCallback, TrainingDoppelgangerCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (data === `${PREFIX}:open`) {
    return ok({ type: "open" });
  }

  if (data.startsWith(`${MODE_PREFIX}:`)) {
    const [, section, scene, mode, ...rest] = data.split(":");

    if (section !== "spar" || scene !== "mode" || rest.length > 0) {
      return err("invalid-prefix");
    }

    if (!startModes.has(mode as TrainingDoppelgangerStartMode)) {
      return err("invalid-action");
    }

    return ok({ type: "mode", mode: mode as TrainingDoppelgangerStartMode });
  }

  if (data.startsWith(`${TURN_PREFIX}:`)) {
    const [, section, scene, sessionId, turnRaw, action, ...rest] = data.split(":");

    if (section !== "spar" || scene !== "turn" || rest.length > 0) {
      return err("invalid-prefix");
    }

    if (!sessionId || !sessionIdPattern.test(sessionId)) {
      return err("invalid-prefix");
    }

    const turn = Number(turnRaw);

    if (!Number.isInteger(turn) || turn < 1) {
      return err("invalid-turn");
    }

    if (!turnActions.has(action as CombatActionType)) {
      return err("invalid-action");
    }

    return ok({
      type: "turn",
      sessionId,
      turn,
      action: action as CombatActionType
    });
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  return err("invalid-action");
}
