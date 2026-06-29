import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type DailyKorchmaRoundCallback =
  | { type: "overview"; dayToken: string }
  | { type: "scene"; dayToken: string; sceneIndex: number }
  | { type: "scene-help"; dayToken: string; sceneIndex: number }
  | { type: "action"; dayToken: string; sceneIndex: number; actionId: string; lifeToken: number }
  | { type: "claim"; dayToken: string; lifeToken: number };

export type DailyKorchmaRoundCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-day"
  | "invalid-scene"
  | "invalid-life"
  | "too-long";

const PREFIX = "v1:dkr";
const actionIdPattern = /^[a-z0-9][a-z0-9-]{1,48}$/;

export function makeDailyKorchmaRoundOverviewCallbackData(dayToken: string): string {
  return `${PREFIX}:o:${dayToken}`;
}

export function makeDailyKorchmaRoundSceneCallbackData(dayToken: string, sceneIndex: number): string {
  return `${PREFIX}:s:${dayToken}:${sceneIndex}`;
}

export function makeDailyKorchmaRoundSceneHelpCallbackData(dayToken: string, sceneIndex: number): string {
  return `${PREFIX}:h:${dayToken}:${sceneIndex}`;
}

export function makeDailyKorchmaRoundActionCallbackData(input: {
  dayToken: string;
  sceneIndex: number;
  actionId: string;
  lifeToken: number;
}): string {
  return `${PREFIX}:a:${input.dayToken}:${input.sceneIndex}:${input.actionId}:${input.lifeToken}`;
}

export function makeDailyKorchmaRoundClaimCallbackData(dayToken: string, lifeToken: number): string {
  return `${PREFIX}:c:${dayToken}:${lifeToken}`;
}

export function parseDailyKorchmaRoundCallbackData(
  data: string | undefined
): Result<DailyKorchmaRoundCallback, DailyKorchmaRoundCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, ...parts] = data.split(":");

  if (section !== "dkr") {
    return err("invalid-prefix");
  }

  if (action === "o" && parts.length === 1) {
    const dayToken = parts[0] as string;

    return isDayToken(dayToken) ? ok({ type: "overview", dayToken }) : err("invalid-day");
  }

  if (action === "s" && parts.length === 2) {
    const dayToken = parts[0] as string;
    const sceneIndex = parts[1] as string;

    if (!isDayToken(dayToken)) {
      return err("invalid-day");
    }

    const parsedSceneIndex = parseSceneIndex(sceneIndex);

    return parsedSceneIndex === null
      ? err("invalid-scene")
      : ok({ type: "scene", dayToken, sceneIndex: parsedSceneIndex });
  }

  if (action === "h" && parts.length === 2) {
    const dayToken = parts[0] as string;
    const sceneIndex = parts[1] as string;

    if (!isDayToken(dayToken)) {
      return err("invalid-day");
    }

    const parsedSceneIndex = parseSceneIndex(sceneIndex);

    return parsedSceneIndex === null
      ? err("invalid-scene")
      : ok({ type: "scene-help", dayToken, sceneIndex: parsedSceneIndex });
  }

  if (action === "a" && parts.length === 4) {
    const dayToken = parts[0] as string;
    const sceneIndex = parts[1] as string;
    const actionId = parts[2] as string;
    const lifeToken = parts[3] as string;

    if (!isDayToken(dayToken)) {
      return err("invalid-day");
    }

    const parsedSceneIndex = parseSceneIndex(sceneIndex);

    if (parsedSceneIndex === null) {
      return err("invalid-scene");
    }

    if (!actionIdPattern.test(actionId)) {
      return err("invalid-action");
    }

    const parsedLifeToken = parseLifeToken(lifeToken);

    return parsedLifeToken === null
      ? err("invalid-life")
      : ok({
          type: "action",
          dayToken,
          sceneIndex: parsedSceneIndex,
          actionId,
          lifeToken: parsedLifeToken
        });
  }

  if (action === "c" && parts.length === 2) {
    const dayToken = parts[0] as string;
    const lifeToken = parts[1] as string;

    if (!isDayToken(dayToken)) {
      return err("invalid-day");
    }

    const parsedLifeToken = parseLifeToken(lifeToken);

    return parsedLifeToken === null
      ? err("invalid-life")
      : ok({ type: "claim", dayToken, lifeToken: parsedLifeToken });
  }

  return err("invalid-action");
}

function isDayToken(value: string): boolean {
  return /^\d{8}$/.test(value);
}

function parseSceneIndex(value: string): number | null {
  if (!/^[0-2]$/.test(value)) {
    return null;
  }

  return Number(value);
}

function parseLifeToken(value: string): number | null {
  if (!/^\d{1,5}$/.test(value)) {
    return null;
  }

  return Number(value);
}
