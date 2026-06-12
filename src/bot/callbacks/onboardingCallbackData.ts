import { classes } from "../../content/classes";
import { races } from "../../content/races";
import { err, ok, type Result } from "../../shared/result";

export const TELEGRAM_CALLBACK_DATA_LIMIT = 64;

export type OnboardingCallback =
  | { type: "race"; raceId: string }
  | { type: "class"; raceId: string; classId: string };

export type OnboardingCallbackError =
  | "invalid-prefix"
  | "invalid-version"
  | "invalid-action"
  | "invalid-race"
  | "invalid-class"
  | "too-long";

const PREFIX = "v1:onb";

export function makeRaceCallbackData(raceId: string): string {
  return `${PREFIX}:r:${raceId}`;
}

export function makeClassCallbackData(raceId: string, classId: string): string {
  return `${PREFIX}:c:${raceId}:${classId}`;
}

export function parseOnboardingCallbackData(
  data: string | undefined
): Result<OnboardingCallback, OnboardingCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, raceId, classId, ...rest] = data.split(":");

  if (section !== "onb" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "r") {
    if (!isKnownRace(raceId)) {
      return err("invalid-race");
    }

    return ok({ type: "race", raceId });
  }

  if (action === "c") {
    if (!isKnownRace(raceId)) {
      return err("invalid-race");
    }

    if (!isKnownClass(classId)) {
      return err("invalid-class");
    }

    return ok({ type: "class", raceId, classId });
  }

  return err("invalid-action");
}

export function isKnownRace(raceId: string | undefined): raceId is string {
  return Boolean(raceId && races.some((race) => race.id === raceId));
}

export function isKnownClass(classId: string | undefined): classId is string {
  return Boolean(classId && classes.some((characterClass) => characterClass.id === classId));
}
