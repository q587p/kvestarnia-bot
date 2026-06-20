export type MunchkinLocation = "front" | "nyz-descent";

export const MUNCHKIN_SCHEDULE_TIME_ZONE = "Europe/Kyiv";
export const MUNCHKIN_NIGHT_START_HOUR = 21;
export const MUNCHKIN_NIGHT_END_HOUR = 7;

export function getMunchkinLocationAt(now: Date): MunchkinLocation {
  const hour = getKyivHour(now);

  if (hour >= MUNCHKIN_NIGHT_START_HOUR || hour < MUNCHKIN_NIGHT_END_HOUR) {
    return "nyz-descent";
  }

  return "front";
}

function getKyivHour(now: Date): number {
  const hourPart = new Intl.DateTimeFormat("en-CA", {
    timeZone: MUNCHKIN_SCHEDULE_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;

  return Number(hourPart ?? "0");
}
