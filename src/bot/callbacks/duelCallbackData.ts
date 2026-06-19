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
  | { type: "invite"; token: string; templateIndex: number }
  | { type: "turn"; token: string; action: "attack" | "skill" | "surrender"; turn: number; version: number }
  | { type: "view"; token: string };

export type DuelCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-template"
  | "invalid-token"
  | "too-long";

const PREFIX = "v1:duel";
const tokenPattern = /^[A-Za-z0-9_-]{8,24}$/;

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

export function makeDuelInviteRotateCallbackData(token: string, templateIndex: number): string {
  return `${PREFIX}:inv:${token}:${templateIndex.toString(36)}`;
}

export function makeDuelViewCallbackData(token: string): string {
  return `${PREFIX}:view:${token}`;
}

export function makeDuelTurnCallbackData(
  token: string,
  action: "attack" | "skill" | "surrender",
  turn: number,
  version: number
): string {
  const actionKey = action === "attack" ? "atk" : action === "skill" ? "skl" : "ff";

  return `${PREFIX}:t:${token}:${actionKey}:${turn.toString(36)}:${version.toString(36)}`;
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
    action !== "t" &&
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

  if (action === "t") {
    if (
      templateIndex !== "atk" &&
      templateIndex !== "skl" &&
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
      action: templateIndex === "atk" ? "attack" : templateIndex === "skl" ? "skill" : "surrender",
      turn: Number.parseInt(turnValue, 36),
      version: Number.parseInt(versionValue, 36)
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
