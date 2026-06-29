import {
  ADVENTURE_PROBLEM_IDS,
  type AdventureApproach,
  type AdventureMethodId,
  type MimicShawarmaAction,
  type AdventureProblemId
} from "../../services/adventureService";
import { isKnownQuestMethodId } from "../../content/questResolution";
import { toQuestCallbackKey } from "../../content/questResolution";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type AdventureCallback =
  | { type: "participants" }
  | { type: "legacy"; action: MimicShawarmaAction }
  | { type: "problem"; periodToken: string; problemId: AdventureProblemId }
  | { type: "problem-help"; periodToken: string; problemId: AdventureProblemId }
  | { type: "method"; methodId: AdventureMethodId }
  | { type: "method-help" }
  | { type: "method-back" }
  | { type: "legacy-approach"; periodToken: string; problemId: AdventureProblemId; approach: AdventureApproach }
  | {
      type: "approach";
      periodToken: string;
      problemId: AdventureProblemId;
      methodId: AdventureMethodId;
    };
export type AdventureCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:adv";
const V2_PREFIX = "v2:adv";
const problemIds = new Set<AdventureProblemId>(ADVENTURE_PROBLEM_IDS);
const problemKeyToId = new Map<string, AdventureProblemId>();
const problemIdToKey = new Map<AdventureProblemId, string>();
const approaches = new Set<AdventureApproach>(["safe", "flair", "risky"]);

for (const problemId of ADVENTURE_PROBLEM_IDS) {
  const key = toQuestCallbackKey(problemId);

  if (problemKeyToId.has(key)) {
    throw new Error(`Duplicate adventure callback problem key: ${key}`);
  }

  problemKeyToId.set(key, problemId);
  problemIdToKey.set(problemId, key);
}

export function makeAdventureProblemCallbackData(input: {
  periodToken: string;
  problemId: AdventureProblemId;
}): string {
  return `${V2_PREFIX}:p:${input.periodToken}:${encodeProblemId(input.problemId)}`;
}

export function makeAdventureProblemHelpCallbackData(input: {
  periodToken: string;
  problemId: AdventureProblemId;
}): string {
  return `${V2_PREFIX}:h:${input.periodToken}:${encodeProblemId(input.problemId)}`;
}

export function makeAdventureApproachCallbackData(input: {
  periodToken: string;
  problemId: AdventureProblemId;
  methodId?: AdventureMethodId;
  approach?: AdventureApproach;
}): string {
  if (input.methodId) {
    return `${V2_PREFIX}:a:${input.periodToken}:${encodeProblemId(input.problemId)}:${input.methodId}`;
  }

  return `${PREFIX}:a:${input.periodToken}:${input.problemId}:${input.approach ?? "safe"}`;
}

export function makeMimicShawarmaMethodCallbackData(methodId: AdventureMethodId): string {
  return `${V2_PREFIX}:m:${methodId}`;
}

export function makeMimicShawarmaHelpCallbackData(): string {
  return `${V2_PREFIX}:h:m`;
}

export function makeMimicShawarmaBackCallbackData(): string {
  return `${V2_PREFIX}:b:m`;
}

export function makeAdventureParticipantsCallbackData(): string {
  return `${PREFIX}:participants`;
}

export function makeAdventureCallbackData(action: string): string {
  if (action === "participants") {
    return makeAdventureParticipantsCallbackData();
  }

  return `${PREFIX}:mimic:${action}`;
}

export function parseAdventureCallbackData(
  data: string | undefined
): Result<AdventureCallback, AdventureCallbackError> {
  if (data?.startsWith(`${V2_PREFIX}:`)) {
    return parseAdventureV2CallbackData(data);
  }

  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, periodToken, problemId, approach, ...rest] = data.split(":");

  if (section !== "adv" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "participants" && !periodToken && !problemId && !approach) {
    return ok({ type: "participants" });
  }

  if (
    action === "mimic" &&
    (periodToken === "poke" || periodToken === "receipt" || periodToken === "flee") &&
    !problemId &&
    !approach
  ) {
    return ok({ type: "legacy", action: periodToken });
  }

  if (!isPeriodToken(periodToken) || !isProblemId(problemId)) {
    return err(action === "p" || action === "a" ? "invalid-action" : "invalid-prefix");
  }

  if (action === "p" && !approach) {
    return ok({
      type: "problem",
      periodToken,
      problemId
    });
  }

  if (action === "a" && isApproach(approach)) {
    return ok({
      type: "legacy-approach",
      periodToken,
      problemId,
      approach
    });
  }

  return err(action === "p" || action === "a" ? "invalid-action" : "invalid-prefix");
}

function parseAdventureV2CallbackData(data: string): Result<AdventureCallback, AdventureCallbackError> {
  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, first, second, third, ...rest] = data.split(":");

  if (section !== "adv" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "m" && isKnownQuestMethodId(first) && !second && !third) {
    return ok({ type: "method", methodId: first });
  }

  if (action === "p" && isPeriodToken(first) && isProblemKey(second) && !third) {
    return ok({
      type: "problem",
      periodToken: first,
      problemId: decodeProblemKey(second)
    });
  }

  if (action === "h" && isPeriodToken(first) && isProblemKey(second) && !third) {
    return ok({
      type: "problem-help",
      periodToken: first,
      problemId: decodeProblemKey(second)
    });
  }

  if (action === "h" && first === "m" && !second && !third) {
    return ok({ type: "method-help" });
  }

  if (action === "b" && first === "m" && !second && !third) {
    return ok({ type: "method-back" });
  }

  if (action === "a" && isPeriodToken(first) && isProblemKey(second) && isKnownQuestMethodId(third)) {
    return ok({
      type: "approach",
      periodToken: first,
      problemId: decodeProblemKey(second),
      methodId: third
    });
  }

  return err(action === "a" || action === "m" || action === "p" ? "invalid-action" : "invalid-prefix");
}

function isPeriodToken(value: string | undefined): value is string {
  return /^[0-9a-z]{1,10}$/.test(value ?? "");
}

function isProblemId(value: string | undefined): value is AdventureProblemId {
  return problemIds.has(value as AdventureProblemId);
}

function isProblemKey(value: string | undefined): value is string {
  return typeof value === "string" && problemKeyToId.has(value);
}

function encodeProblemId(problemId: AdventureProblemId): string {
  return problemIdToKey.get(problemId) ?? toQuestCallbackKey(problemId);
}

function decodeProblemKey(problemKey: string): AdventureProblemId {
  const problemId = problemKeyToId.get(problemKey);

  if (!problemId) {
    throw new Error(`Unknown adventure callback problem key: ${problemKey}`);
  }

  return problemId;
}

function isApproach(value: string | undefined): value is AdventureApproach {
  return approaches.has(value as AdventureApproach);
}
