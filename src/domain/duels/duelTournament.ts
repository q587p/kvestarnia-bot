import type { ResolvedDuelChallengeRecord } from "../../db/repositories/duelChallengeRepository";

export const DUEL_TOURNAMENT_PERIODS = ["day", "week", "month"] as const;
export type DuelTournamentPeriod = (typeof DUEL_TOURNAMENT_PERIODS)[number];

export const DUEL_TOURNAMENT_RULES_VERSION = "duel-tournament-v1";
export const DUEL_TOURNAMENT_DAILY_REWARD_ITEM_ID = "item.responsible-panic-bandage";
export const DUEL_TOURNAMENT_WEEKLY_REWARD_ITEM_ID = "item.dense-bandage";
export const DUEL_TOURNAMENT_MONTHLY_REWARD_ITEM_ID = "item.field-kit";
export const DUEL_TOURNAMENT_TOP_LIMIT = 3;
export const DUEL_TOURNAMENT_REWARD_LOOKBACK: Record<DuelTournamentPeriod, number> = {
  day: 13,
  week: 8,
  month: 5
};

export interface DuelTournamentPeriodWindow {
  period: DuelTournamentPeriod;
  key: string;
  label: string;
  startsAt: Date;
  endsAt: Date;
}

export interface DuelTournamentEntry {
  characterId: string;
  name: string;
  activeCosmeticTitle?: string | null;
  points: number;
  wins: number;
  draws: number;
  scoredDuels: number;
  rank: number;
}

export interface DuelTournamentReward {
  gold: number;
  items: { itemId: string; quantity: number }[];
}

const KYIV_TIME_ZONE = "Europe/Kyiv";
const KYIV_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: KYIV_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});
const DAY_MS = 24 * 60 * 60 * 1000;
const WIN_POINTS = [3, 1] as const;
const DRAW_POINTS = 1;

const periodLabels: Record<DuelTournamentPeriod, string> = {
  day: "Денний турнір",
  week: "Тижневий турнір",
  month: "Місячний турнір"
};

const rewardTable: Record<DuelTournamentPeriod, readonly DuelTournamentReward[]> = {
  day: [
    { gold: 42, items: [{ itemId: DUEL_TOURNAMENT_DAILY_REWARD_ITEM_ID, quantity: 5 }] },
    { gold: 23, items: [{ itemId: DUEL_TOURNAMENT_DAILY_REWARD_ITEM_ID, quantity: 3 }] },
    { gold: 13, items: [{ itemId: DUEL_TOURNAMENT_DAILY_REWARD_ITEM_ID, quantity: 1 }] }
  ],
  week: [
    { gold: 93, items: [{ itemId: DUEL_TOURNAMENT_WEEKLY_REWARD_ITEM_ID, quantity: 5 }] },
    { gold: 42, items: [{ itemId: DUEL_TOURNAMENT_WEEKLY_REWARD_ITEM_ID, quantity: 3 }] },
    { gold: 23, items: [{ itemId: DUEL_TOURNAMENT_WEEKLY_REWARD_ITEM_ID, quantity: 1 }] }
  ],
  month: [
    { gold: 587, items: [{ itemId: DUEL_TOURNAMENT_MONTHLY_REWARD_ITEM_ID, quantity: 3 }] },
    { gold: 93, items: [{ itemId: DUEL_TOURNAMENT_MONTHLY_REWARD_ITEM_ID, quantity: 2 }] },
    { gold: 42, items: [{ itemId: DUEL_TOURNAMENT_MONTHLY_REWARD_ITEM_ID, quantity: 1 }] }
  ]
};

export function getDuelTournamentWindow(
  period: DuelTournamentPeriod,
  now: Date
): DuelTournamentPeriodWindow {
  const startsAt = getPeriodStart(period, now);
  const endsAt = getNextPeriodStart(period, startsAt);
  return {
    period,
    key: getDuelTournamentPeriodKey(period, startsAt),
    label: periodLabels[period],
    startsAt,
    endsAt
  };
}

export function getPreviousDuelTournamentWindow(
  period: DuelTournamentPeriod,
  now: Date
): DuelTournamentPeriodWindow {
  return getDuelTournamentWindow(period, new Date(getDuelTournamentWindow(period, now).startsAt.getTime() - 1));
}

export function getDuelTournamentWindowFromKey(
  period: DuelTournamentPeriod,
  key: string
): DuelTournamentPeriodWindow | null {
  const startsAt = parsePeriodStart(period, key);
  if (!startsAt || getDuelTournamentPeriodKey(period, startsAt) !== key) {
    return null;
  }
  return {
    period,
    key,
    label: periodLabels[period],
    startsAt,
    endsAt: getNextPeriodStart(period, startsAt)
  };
}

export function getClosedDuelTournamentWindows(
  period: DuelTournamentPeriod,
  now: Date,
  limit = DUEL_TOURNAMENT_REWARD_LOOKBACK[period]
): DuelTournamentPeriodWindow[] {
  const windows: DuelTournamentPeriodWindow[] = [];
  let cursor = now;

  for (let index = 0; index < Math.max(0, limit); index += 1) {
    const window = getPreviousDuelTournamentWindow(period, cursor);
    windows.push(window);
    cursor = window.startsAt;
  }

  return windows;
}

export function getDuelTournamentPeriodKey(period: DuelTournamentPeriod, date: Date): string {
  const parts = getKyivParts(date);

  if (period === "day") {
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }

  if (period === "month") {
    return `${parts.year}-${pad2(parts.month)}`;
  }

  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - day);
  const isoYear = localDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((localDate.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);

  return `${isoYear}-W${pad2(week)}`;
}

export function buildDuelTournamentStandings(
  records: readonly ResolvedDuelChallengeRecord[],
  window: DuelTournamentPeriodWindow
): DuelTournamentEntry[] {
  const entries = new Map<string, Omit<DuelTournamentEntry, "rank">>();
  const winCountsByOpponent = new Map<string, number>();
  const drawCountsByOpponent = new Map<string, number>();
  const seenDuelIds = new Set<string>();

  for (const record of records) {
    if (!isEligibleTournamentDuel(record, window) || seenDuelIds.has(record.id)) {
      continue;
    }
    seenDuelIds.add(record.id);

    if (record.result.outcome === "draw") {
      addDrawPoints(entries, drawCountsByOpponent, record.challenger, record.target);
      addDrawPoints(entries, drawCountsByOpponent, record.target, record.challenger);
      continue;
    }

    const winner = record.result.outcome === "challenger" ? record.challenger : record.target;
    const opponent = record.result.outcome === "challenger" ? record.target : record.challenger;
    const key = `${winner.id}:${opponent.id}`;
    const previousWins = winCountsByOpponent.get(key) ?? 0;
    const points = WIN_POINTS[previousWins] ?? 0;
    winCountsByOpponent.set(key, previousWins + 1);

    if (points > 0) {
      const entry = getOrCreateEntry(
        entries,
        winner.id,
        record.result.outcome === "challenger"
          ? record.result.participants?.challenger.displayName
          : record.result.participants?.target.displayName,
        record.result.outcome === "challenger"
          ? record.result.participants?.challenger.activeCosmeticTitle
          : record.result.participants?.target.activeCosmeticTitle,
        winner.name
      );
      entry.points += points;
      entry.wins += 1;
      entry.scoredDuels += 1;
    }
  }

  return [...entries.values()]
    .filter((entry) => entry.points > 0)
    .sort((left, right) => {
      const pointsDiff = right.points - left.points;
      const winsDiff = right.wins - left.wins;
      const drawsDiff = right.draws - left.draws;

      if (pointsDiff !== 0) {
        return pointsDiff;
      }
      if (winsDiff !== 0) {
        return winsDiff;
      }
      if (drawsDiff !== 0) {
        return drawsDiff;
      }
      return left.name.localeCompare(right.name, "uk");
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function getDuelTournamentReward(
  period: DuelTournamentPeriod,
  rank: number,
  points: number
): DuelTournamentReward | null {
  if (points <= 0 || rank < 1 || rank > DUEL_TOURNAMENT_TOP_LIMIT) {
    return null;
  }

  const reward = rewardTable[period][rank - 1];
  return reward ? cloneReward(reward) : null;
}

export function isDuelTournamentPeriod(value: string): value is DuelTournamentPeriod {
  return DUEL_TOURNAMENT_PERIODS.includes(value as DuelTournamentPeriod);
}

function isEligibleTournamentDuel(
  record: ResolvedDuelChallengeRecord,
  window: DuelTournamentPeriodWindow
): boolean {
  return record.status === "resolved" &&
    record.target !== null &&
    record.resolvedAt >= window.startsAt &&
    record.resolvedAt < window.endsAt &&
    record.result.mode === "turn-based" &&
    record.result.terminalReason !== "expired";
}

function addDrawPoints(
  entries: Map<string, Omit<DuelTournamentEntry, "rank">>,
  drawCountsByOpponent: Map<string, number>,
  actor: { id: string; name: string },
  opponent: { id: string; name: string }
): void {
  const key = `${actor.id}:${opponent.id}`;
  const previousDraws = drawCountsByOpponent.get(key) ?? 0;
  drawCountsByOpponent.set(key, previousDraws + 1);

  if (previousDraws > 0) {
    return;
  }

  const entry = getOrCreateEntry(entries, actor.id, undefined, undefined, actor.name);
  entry.points += DRAW_POINTS;
  entry.draws += 1;
  entry.scoredDuels += 1;
}

function getOrCreateEntry(
  entries: Map<string, Omit<DuelTournamentEntry, "rank">>,
  characterId: string,
  snapshotName: string | undefined,
  snapshotActiveCosmeticTitle: string | null | undefined,
  fallbackName: string
): Omit<DuelTournamentEntry, "rank"> {
  const current = entries.get(characterId);
  if (current) {
    return current;
  }

  const next = {
    characterId,
    name: snapshotName ?? fallbackName,
    points: 0,
    wins: 0,
    draws: 0,
    scoredDuels: 0,
    ...(snapshotActiveCosmeticTitle === undefined
      ? {}
      : { activeCosmeticTitle: snapshotActiveCosmeticTitle })
  };
  entries.set(characterId, next);
  return next;
}

function getPeriodStart(period: DuelTournamentPeriod, now: Date): Date {
  const parts = getKyivParts(now);

  if (period === "day") {
    return kyivInstantFromLocal(parts.year, parts.month, parts.day);
  }

  if (period === "month") {
    return kyivInstantFromLocal(parts.year, parts.month, 1);
  }

  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayOffset = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - dayOffset);
  return kyivInstantFromLocal(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth() + 1,
    localDate.getUTCDate()
  );
}

function getNextPeriodStart(period: DuelTournamentPeriod, startsAt: Date): Date {
  const parts = getKyivParts(startsAt);

  if (period === "day") {
    return kyivInstantFromLocalDateOffset(parts.year, parts.month, parts.day, 1);
  }

  if (period === "month") {
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    return kyivInstantFromLocal(nextYear, nextMonth, 1);
  }

  return kyivInstantFromLocalDateOffset(parts.year, parts.month, parts.day, 7);
}

function kyivInstantFromLocalDateOffset(year: number, month: number, day: number, offsetDays: number): Date {
  const localDate = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return kyivInstantFromLocal(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth() + 1,
    localDate.getUTCDate()
  );
}

function parsePeriodStart(period: DuelTournamentPeriod, key: string): Date | null {
  if (period === "day") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) {
      return null;
    }
    return kyivInstantFromLocal(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  if (period === "month") {
    const match = /^(\d{4})-(\d{2})$/.exec(key);
    if (!match) {
      return null;
    }
    return kyivInstantFromLocal(Number(match[1]), Number(match[2]), 1);
  }

  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) {
    return null;
  }

  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayOffset = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4DayOffset + (week - 1) * 7);

  return kyivInstantFromLocal(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate()
  );
}

function kyivInstantFromLocal(year: number, month: number, day: number): Date {
  const targetLocalMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let low = targetLocalMs - 36 * 60 * 60 * 1000;
  let high = targetLocalMs + 36 * 60 * 60 * 1000;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getKyivLocalTimestamp(new Date(mid)) >= targetLocalMs) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return new Date(low);
}

function getKyivLocalTimestamp(date: Date): number {
  const parts = getKyivParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
}

function getKyivParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const values = KYIV_DATE_TIME_FORMATTER.formatToParts(date);
  const read = (type: string): number => Number(values.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second")
  };
}

function cloneReward(reward: DuelTournamentReward): DuelTournamentReward {
  return {
    gold: reward.gold,
    items: reward.items.map((item) => ({ ...item }))
  };
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
