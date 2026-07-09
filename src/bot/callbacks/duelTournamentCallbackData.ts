import {
  DUEL_TOURNAMENT_PERIODS,
  isDuelTournamentPeriod,
  type DuelTournamentPeriod
} from "../../domain/duels/duelTournament";
import { err, ok, type Result } from "../../shared/result";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "./onboardingCallbackData";

export type DuelTournamentCallback =
  | { action: "open"; period: DuelTournamentPeriod }
  | { action: "rules"; period: DuelTournamentPeriod }
  | { action: "claim"; period: DuelTournamentPeriod; periodKey: string };

export type DuelTournamentCallbackError =
  | "invalid-version"
  | "invalid-prefix"
  | "invalid-action"
  | "invalid-period"
  | "invalid-period-key"
  | "too-long";

const PREFIX = "v1:tour";
const periodCodes: Record<DuelTournamentPeriod, string> = {
  day: "d",
  week: "w",
  month: "m"
};
const codePeriods = new Map(Object.entries(periodCodes).map(([period, code]) => [code, period]));

export function makeDuelTournamentOpenCallbackData(period: DuelTournamentPeriod = "day"): string {
  return `${PREFIX}:o:${periodCodes[period]}`;
}

export function makeDuelTournamentRulesCallbackData(period: DuelTournamentPeriod = "day"): string {
  return `${PREFIX}:r:${periodCodes[period]}`;
}

export function makeDuelTournamentClaimCallbackData(
  period: DuelTournamentPeriod,
  periodKey: string
): string {
  return `${PREFIX}:c:${periodCodes[period]}:${periodKey}`;
}

export function parseDuelTournamentCallbackData(
  data: string | undefined
): Result<DuelTournamentCallback, DuelTournamentCallbackError> {
  if (!data?.startsWith("v1:")) {
    return err("invalid-version");
  }

  if (!data.startsWith(`${PREFIX}:`)) {
    return err("invalid-prefix");
  }

  if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
    return err("too-long");
  }

  const [, section, action, periodCode, periodKey, ...rest] = data.split(":");
  if (section !== "tour") {
    return err("invalid-prefix");
  }

  const period = codePeriods.get(periodCode ?? "");
  if (!period || !isDuelTournamentPeriod(period)) {
    return err("invalid-period");
  }

  if (action === "o" && !periodKey && rest.length === 0) {
    return ok({ action: "open", period });
  }

  if (action === "r" && !periodKey && rest.length === 0) {
    return ok({ action: "rules", period });
  }

  if (action === "c" && periodKey && rest.length === 0 && isValidPeriodKey(period, periodKey)) {
    return ok({ action: "claim", period, periodKey });
  }

  return err(action === "c" ? "invalid-period-key" : "invalid-action");
}

function isValidPeriodKey(period: DuelTournamentPeriod, key: string): boolean {
  if (!DUEL_TOURNAMENT_PERIODS.includes(period)) {
    return false;
  }

  switch (period) {
    case "day":
      return /^\d{4}-\d{2}-\d{2}$/.test(key);
    case "week":
      return /^\d{4}-W\d{2}$/.test(key);
    case "month":
      return /^\d{4}-\d{2}$/.test(key);
  }
}
