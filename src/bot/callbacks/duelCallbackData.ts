import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type DuelCallback =
  | { type: "new" }
  | { type: "new-turn-based" }
  | { type: "new-risk" }
  | { type: "new-turn-based-risk" }
  | { type: "accept"; token: string }
  | { type: "accept-risk"; token: string }
  | { type: "cancel"; token: string }
  | { type: "decline"; token: string }
  | { type: "rematch"; token: string }
  | { type: "rematch-risk"; token: string }
  | { type: "share"; token: string }
  | { type: "journal"; token: string; page: number }
  | { type: "invite"; token: string; templateIndex: number }
  | { type: "turn"; token: string; action: "attack" | "defend" | "skill" | "race" | "surrender"; turn: number; version: number }
  | { type: "gear"; token: string; turn: number; version: number; grantKey: string }
  | { type: "view"; token: string };

export type DuelCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-page"
  | "invalid-template"
  | "invalid-token"
  | "too-long";

const PREFIX = "v1:duel";
const tokenPattern = /^[A-Za-z0-9_-]{8,24}$/;
const gearKeyPattern = /^[a-z0-9]{1,10}$/;

export function makeDuelNewCallbackData(): string {
  return `${PREFIX}:new`;
}

export function makeDuelNewRiskCallbackData(): string {
  return `${PREFIX}:new-risk`;
}

export function makeDuelNewTurnBasedCallbackData(): string {
  return `${PREFIX}:new-t`;
}

export function makeDuelNewTurnBasedRiskCallbackData(): string {
  return `${PREFIX}:new-t-risk`;
}

export function makeDuelAcceptCallbackData(token: string): string {
  return `${PREFIX}:accept:${token}`;
}

export function makeDuelAcceptRiskCallbackData(token: string): string {
  return `${PREFIX}:accept-risk:${token}`;
}

export function makeDuelCancelCallbackData(token: string): string {
  return `${PREFIX}:cancel:${token}`;
}

export function makeDuelDeclineCallbackData(token: string): string {
  return `${PREFIX}:decline:${token}`;
}

export function makeDuelRematchCallbackData(token: string): string {
  return `${PREFIX}:rematch:${token}`;
}

export function makeDuelRematchRiskCallbackData(token: string): string {
  return `${PREFIX}:rematch-risk:${token}`;
}

export function makeDuelShareCallbackData(token: string): string {
  return `${PREFIX}:share:${token}`;
}

export function makeDuelJournalCallbackData(token: string, page = 0): string {
  return `${PREFIX}:j:${token}:${Math.max(0, Math.floor(page)).toString(36)}`;
}

export function makeDuelInviteRotateCallbackData(token: string, templateIndex: number): string {
  return `${PREFIX}:inv:${token}:${templateIndex.toString(36)}`;
}

export function makeDuelViewCallbackData(token: string): string {
  return `${PREFIX}:view:${token}`;
}

export function makeDuelTurnCallbackData(
  token: string,
  action: "attack" | "defend" | "skill" | "race" | "surrender",
  turn: number,
  version: number
): string {
  const actionKey = action === "attack"
    ? "atk"
    : action === "defend"
      ? "def"
      : action === "skill"
        ? "skl"
        : action === "race"
          ? "rac"
          : "ff";

  return `${PREFIX}:t:${token}:${actionKey}:${turn.toString(36)}:${version.toString(36)}`;
}

export function makeDuelGearActionCallbackData(input: {
  token: string;
  turn: number;
  version: number;
  grantKey: string;
}): string {
  return `${PREFIX}:g:${input.token}:${input.turn.toString(36)}:${input.version.toString(36)}:${input.grantKey}`;
}

export function parseDuelCallbackData(
  data: string | undefined
): Result<DuelCallback, DuelCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  if (data === `${PREFIX}:new`) {
    return ok({ type: "new" });
  }

  if (data === `${PREFIX}:new-risk`) {
    return ok({ type: "new-risk" });
  }

  if (data === `${PREFIX}:new-t`) {
    return ok({ type: "new-turn-based" });
  }

  if (data === `${PREFIX}:new-t-risk`) {
    return ok({ type: "new-turn-based-risk" });
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  const [, section, action, token, templateIndex, turnValue, versionValue, ...rest] = data.split(":");

  if (section !== "duel" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (
    action !== "accept" &&
    action !== "accept-risk" &&
    action !== "cancel" &&
    action !== "decline" &&
    action !== "rematch" &&
    action !== "rematch-risk" &&
    action !== "inv" &&
    action !== "j" &&
    action !== "t" &&
    action !== "g" &&
    action !== "share" &&
    action !== "view"
  ) {
    return err("invalid-action");
  }

  if (!token || !tokenPattern.test(token)) {
    return err("invalid-token");
  }

  if (action === "inv") {
    if (templateIndex === undefined || !/^[0-9a-c]$/.test(templateIndex)) {
      return err("invalid-template");
    }

    return ok({
      type: "invite",
      token,
      templateIndex: Number.parseInt(templateIndex, 36)
    });
  }

  if (action === "j") {
    if (templateIndex === undefined || !/^[0-9a-z]{1,3}$/.test(templateIndex)) {
      return err("invalid-page");
    }

    if (turnValue !== undefined || versionValue !== undefined) {
      return err("invalid-prefix");
    }

    return ok({
      type: "journal",
      token,
      page: Number.parseInt(templateIndex, 36)
    });
  }

  if (action === "t") {
    if (
      templateIndex !== "atk" &&
      templateIndex !== "def" &&
      templateIndex !== "skl" &&
      templateIndex !== "rac" &&
      templateIndex !== "ff"
    ) {
      return err("invalid-action");
    }

    if (!turnValue || !versionValue || !/^[0-9a-z]{1,4}$/.test(turnValue) || !/^[0-9a-z]{1,4}$/.test(versionValue)) {
      return err("invalid-prefix");
    }

    return ok({
      type: "turn",
      token,
      action: templateIndex === "atk"
        ? "attack"
        : templateIndex === "def"
          ? "defend"
          : templateIndex === "skl"
            ? "skill"
            : templateIndex === "rac"
              ? "race"
            : "surrender",
      turn: Number.parseInt(turnValue, 36),
      version: Number.parseInt(versionValue, 36)
    });
  }

  if (action === "g") {
    if (!templateIndex || !turnValue || !versionValue || rest.length > 0) {
      return err("invalid-prefix");
    }

    if (
      !/^[0-9a-z]{1,4}$/.test(templateIndex) ||
      !/^[0-9a-z]{1,4}$/.test(turnValue) ||
      !gearKeyPattern.test(versionValue)
    ) {
      return err("invalid-action");
    }

    return ok({
      type: "gear",
      token,
      turn: Number.parseInt(templateIndex, 36),
      version: Number.parseInt(turnValue, 36),
      grantKey: versionValue
    });
  }

  if (templateIndex !== undefined || turnValue !== undefined || versionValue !== undefined) {
    return err("invalid-prefix");
  }

  return ok({
    type: action,
    token
  });
}
