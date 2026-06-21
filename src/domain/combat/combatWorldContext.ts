export type CombatDayPhase = "morning" | "day" | "evening" | "night";
export type CombatWeekKind = "weekday" | "weekend";
export type CombatSeason = "winter" | "spring" | "summer" | "autumn";
export type CombatMealWindow = "lunch" | "dinner" | "none";
export type CombatMonthEdge = "first-three-days" | "last-three-days" | "middle";
export type CombatPartySizeBand = "solo" | "duo" | "group";

export interface CombatWorldContextV1 {
  version: 1;
  timezone: "Europe/Kyiv";
  localStartedAt: string;
  localDate: string;
  dayPhase: CombatDayPhase;
  weekKind: CombatWeekKind;
  season: CombatSeason;
  mealWindow: CombatMealWindow;
  monthEdge: CombatMonthEdge;
  calendarDay: number;
  partySizeBand: CombatPartySizeBand;
  locationTags: string[];
}

export interface BuildCombatWorldContextInput {
  now: Date;
  partySize?: number;
  locationTags?: readonly string[];
}

const KYIV_TIMEZONE = "Europe/Kyiv";

export function buildCombatWorldContext(input: BuildCombatWorldContextInput): CombatWorldContextV1 {
  const parts = getKyivDateParts(input.now);
  const hour = parts.hour;

  return {
    version: 1,
    timezone: KYIV_TIMEZONE,
    localStartedAt: formatLocalStartedAt(parts),
    localDate: formatLocalDate(parts),
    dayPhase: getDayPhase(hour),
    weekKind: parts.weekday === 6 || parts.weekday === 7 ? "weekend" : "weekday",
    season: getSeason(parts.month),
    mealWindow: getMealWindow(hour),
    monthEdge: getMonthEdge(parts.day, parts.daysInMonth),
    calendarDay: parts.day,
    partySizeBand: getPartySizeBand(input.partySize ?? 1),
    locationTags: [...new Set(input.locationTags ?? [])].sort()
  };
}

function getKyivDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
  daysInMonth: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: KYIV_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const weekday = parseWeekday(parts.weekday);

  return {
    year,
    month,
    day,
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate()
  };
}

function formatLocalStartedAt(parts: ReturnType<typeof getKyivDateParts>): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}[Europe/Kyiv]`;
}

function formatLocalDate(parts: ReturnType<typeof getKyivDateParts>): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function getDayPhase(hour: number): CombatDayPhase {
  if (hour >= 5 && hour < 11) {
    return "morning";
  }

  if (hour >= 11 && hour < 17) {
    return "day";
  }

  if (hour >= 17 && hour < 23) {
    return "evening";
  }

  return "night";
}

function getMealWindow(hour: number): CombatMealWindow {
  if (hour >= 11 && hour < 15) {
    return "lunch";
  }

  if (hour >= 18 && hour < 22) {
    return "dinner";
  }

  return "none";
}

function getMonthEdge(day: number, daysInMonth: number): CombatMonthEdge {
  if (day <= 3) {
    return "first-three-days";
  }

  if (day > daysInMonth - 3) {
    return "last-three-days";
  }

  return "middle";
}

function getSeason(month: number): CombatSeason {
  if (month === 12 || month <= 2) {
    return "winter";
  }

  if (month <= 5) {
    return "spring";
  }

  if (month <= 8) {
    return "summer";
  }

  return "autumn";
}

function getPartySizeBand(size: number): CombatPartySizeBand {
  if (size <= 1) {
    return "solo";
  }

  return size === 2 ? "duo" : "group";
}

function parseWeekday(value: string | undefined): number {
  switch (value) {
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    case "Sun":
      return 7;
    default:
      return 1;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
