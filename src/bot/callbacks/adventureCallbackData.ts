import {
  ADVENTURE_PROBLEM_IDS,
  type AdventureApproach,
  type MimicShawarmaAction,
  type AdventureProblemId
} from "../../services/adventureService";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type AdventureCallback =
  | { type: "participants" }
  | { type: "legacy"; action: MimicShawarmaAction }
  | { type: "problem"; periodToken: string; problemId: AdventureProblemId }
  | {
      type: "approach";
      periodToken: string;
      problemId: AdventureProblemId;
      approach: AdventureApproach;
    };
export type AdventureCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:adv";
const problemIds = new Set<AdventureProblemId>(ADVENTURE_PROBLEM_IDS);
const approaches = new Set<AdventureApproach>(["safe", "flair", "risky"]);

export function makeAdventureProblemCallbackData(input: {
  periodToken: string;
  problemId: AdventureProblemId;
}): string {
  return `${PREFIX}:p:${input.periodToken}:${input.problemId}`;
}

export function makeAdventureApproachCallbackData(input: {
  periodToken: string;
  problemId: AdventureProblemId;
  approach: AdventureApproach;
}): string {
  return `${PREFIX}:a:${input.periodToken}:${input.problemId}:${input.approach}`;
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
      type: "approach",
      periodToken,
      problemId,
      approach
    });
  }

  return err(action === "p" || action === "a" ? "invalid-action" : "invalid-prefix");
}

function isPeriodToken(value: string | undefined): value is string {
  return /^[0-9a-z]{1,10}$/.test(value ?? "");
}

function isProblemId(value: string | undefined): value is AdventureProblemId {
  return problemIds.has(value as AdventureProblemId);
}

function isApproach(value: string | undefined): value is AdventureApproach {
  return approaches.has(value as AdventureApproach);
}
