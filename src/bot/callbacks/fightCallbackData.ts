import type { CombatProbeAction } from "../../domain/combat/combatProbe";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type FightCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "too-long";

const PREFIX = "v1:fight:mimic";
const fightActions = new Set<CombatProbeAction>(["attack", "receipt", "flee"]);

export function makeFightCallbackData(action: CombatProbeAction): string {
  return `${PREFIX}:${action}`;
}

export function parseFightCallbackData(
  data: string | undefined
): Result<CombatProbeAction, FightCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, scene, action, ...rest] = data.split(":");

  if (section !== "fight" || scene !== "mimic" || rest.length > 0) {
    return err("invalid-prefix");
  }

  if (!fightActions.has(action as CombatProbeAction)) {
    return err("invalid-action");
  }

  return ok(action as CombatProbeAction);
}
