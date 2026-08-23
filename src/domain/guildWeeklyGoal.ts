export const GUILD_WEEKLY_GOAL_KEY = "ordinary-party-expeditions.v1";
export const GUILD_WEEKLY_GOAL_TARGET = 13;
export const GUILD_WEEKLY_MINIMUM_GUILD_PARTICIPANTS = 2;
export const GUILD_WEEKLY_TIME_ZONE = "Europe/Kyiv";

export interface GuildWeeklyPeriod {
  key: string;
  startsAt: Date;
  endsAt: Date;
}

const localPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GUILD_WEEKLY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

export function getGuildWeeklyPeriod(now: Date): GuildWeeklyPeriod {
  const local = readLocalParts(now);
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const weekday = localDate.getUTCDay() || 7;
  const monday = new Date(localDate);
  monday.setUTCDate(localDate.getUTCDate() - weekday + 1);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - jan4Weekday + 1);
  const week = Math.floor((monday.getTime() - firstMonday.getTime()) / 604_800_000) + 1;
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  return {
    key: `${isoYear + 10_000}-W${String(week).padStart(2, "0")}`,
    startsAt: kyivLocalMidnightToUtc(monday),
    endsAt: kyivLocalMidnightToUtc(nextMonday)
  };
}

function readLocalParts(value: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = Object.fromEntries(
    localPartsFormatter.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!
  };
}

function kyivLocalMidnightToUtc(localDate: Date): Date {
  const target = Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate()
  );
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = readLocalParts(new Date(guess));
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    const delta = target - observedAsUtc;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess);
}
