import {
  classIdToKey,
  classKeyToId,
  isPronoun,
  raceIdToKey,
  raceKeyToId
} from "../../content/characterOptions";
import type { Pronoun } from "../../content/schema";
import { err, ok, type Result } from "../../shared/result";

export const TELEGRAM_CALLBACK_DATA_LIMIT = 64;

export type OnboardingCallback =
  | { type: "gender"; pronoun: Pronoun }
  | { type: "race"; pronoun: Pronoun; raceId: string }
  | { type: "unavailable-race"; pronoun: Pronoun; raceId: string }
  | { type: "class"; pronoun: Pronoun; raceId: string; classId: string }
  | { type: "unavailable-class"; pronoun: Pronoun; raceId: string; classId: string }
  | { type: "confirm"; pronoun: Pronoun; raceId: string; classId: string }
  | { type: "back-to-gender" }
  | { type: "back-to-race"; pronoun: Pronoun }
  | { type: "back-to-class"; pronoun: Pronoun; raceId: string };

export type OnboardingCallbackError =
  | "invalid-prefix"
  | "invalid-version"
  | "invalid-action"
  | "invalid-pronoun"
  | "invalid-race"
  | "invalid-class"
  | "too-long";

const PREFIX = "v1:onb";

export function makeGenderCallbackData(pronoun: Pronoun): string {
  return `${PREFIX}:g:${pronoun}`;
}

export function makeRaceCallbackData(pronoun: Pronoun, raceId: string): string {
  return `${PREFIX}:r:${pronoun}:${raceIdToKey(raceId)}`;
}

export function makeUnavailableRaceCallbackData(pronoun: Pronoun, raceId: string): string {
  return `${PREFIX}:rx:${pronoun}:${raceIdToKey(raceId)}`;
}

export function makeClassCallbackData(pronoun: Pronoun, raceId: string, classId: string): string {
  return `${PREFIX}:c:${pronoun}:${raceIdToKey(raceId)}:${classIdToKey(classId)}`;
}

export function makeUnavailableClassCallbackData(
  pronoun: Pronoun,
  raceId: string,
  classId: string
): string {
  return `${PREFIX}:cx:${pronoun}:${raceIdToKey(raceId)}:${classIdToKey(classId)}`;
}

export function makeConfirmCallbackData(pronoun: Pronoun, raceId: string, classId: string): string {
  return `${PREFIX}:ok:${pronoun}:${raceIdToKey(raceId)}:${classIdToKey(classId)}`;
}

export function makeBackToGenderCallbackData(): string {
  return `${PREFIX}:b:g`;
}

export function makeBackToRaceCallbackData(pronoun: Pronoun): string {
  return `${PREFIX}:b:r:${pronoun}`;
}

export function makeBackToClassCallbackData(pronoun: Pronoun, raceId: string): string {
  return `${PREFIX}:b:c:${pronoun}:${raceIdToKey(raceId)}`;
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

  const [, section, action, first, second, third, ...rest] = data.split(":");

  if (section !== "onb" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (action === "g") {
    if (!isPronoun(first)) {
      return err("invalid-pronoun");
    }

    return ok({ type: "gender", pronoun: first });
  }

  if (action === "r") {
    const pronoun = first;
    const raceId = raceKeyToId(second);

    if (!isPronoun(pronoun)) {
      return err("invalid-pronoun");
    }

    if (!isKnownRace(raceId)) {
      return err("invalid-race");
    }

    return ok({ type: "race", pronoun, raceId });
  }

  if (action === "rx") {
    const pronoun = first;
    const raceId = raceKeyToId(second);

    if (!isPronoun(pronoun)) {
      return err("invalid-pronoun");
    }

    if (!isKnownRace(raceId)) {
      return err("invalid-race");
    }

    return ok({ type: "unavailable-race", pronoun, raceId });
  }

  if (action === "c" || action === "cx" || action === "ok") {
    const pronoun = first;
    const raceId = raceKeyToId(second);
    const classId = classKeyToId(third);

    if (!isPronoun(pronoun)) {
      return err("invalid-pronoun");
    }

    if (!isKnownRace(raceId)) {
      return err("invalid-race");
    }

    if (!isKnownClass(classId)) {
      return err("invalid-class");
    }

    if (action === "cx") {
      return ok({ type: "unavailable-class", pronoun, raceId, classId });
    }

    if (action === "ok") {
      return ok({ type: "confirm", pronoun, raceId, classId });
    }

    return ok({ type: "class", pronoun, raceId, classId });
  }

  if (action === "b") {
    if (first === "g" && second === undefined && third === undefined) {
      return ok({ type: "back-to-gender" });
    }

    if (first === "r") {
      if (!isPronoun(second)) {
        return err("invalid-pronoun");
      }

      return ok({ type: "back-to-race", pronoun: second });
    }

    if (first === "c") {
      const pronoun = second;
      const raceId = raceKeyToId(third);

      if (!isPronoun(pronoun)) {
        return err("invalid-pronoun");
      }

      if (!isKnownRace(raceId)) {
        return err("invalid-race");
      }

      return ok({ type: "back-to-class", pronoun, raceId });
    }
  }

  return err("invalid-action");
}

export function isKnownRace(raceId: string | undefined): raceId is string {
  return Boolean(raceId && raceKeyToId(raceIdToKey(raceId)) === raceId);
}

export function isKnownClass(classId: string | undefined): classId is string {
  return Boolean(classId && classKeyToId(classIdToKey(classId)) === classId);
}
