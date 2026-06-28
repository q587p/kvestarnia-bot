const kyivDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Kyiv",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export interface KyivDateParts {
  year: string;
  month: string;
  day: string;
}

export function getKyivDateParts(date = new Date()): KyivDateParts {
  const parts = kyivDateFormatter.formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get("year");
  const month = byType.get("month");
  const day = byType.get("day");

  if (!year || !month || !day) {
    throw new Error("Unable to format Kyiv date.");
  }

  return { year, month, day };
}

export function getKyivDayKey(date = new Date()): string {
  const parts = getKyivDateParts(date);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getKyivDayToken(date = new Date()): string {
  const parts = getKyivDateParts(date);

  return `${parts.year}${parts.month}${parts.day}`;
}

export function kyivDayTokenToKey(token: string): string | null {
  if (!/^\d{8}$/.test(token)) {
    return null;
  }

  return `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}`;
}
