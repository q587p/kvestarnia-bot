import type { ActivityEventPage, ActivityEventRecord } from "../../db/repositories/activityEventRepository";
import type { LatestEventFilter } from "../../services/activityEventService";
import { escapeHtml } from "./telegramHtml";
import { GUILD_WEEKLY_GOAL_ICON } from "../itemActionIcons";

const FALLBACK_ACTOR = "Пригодник без таблички";
const MAX_DYNAMIC_NAME_LENGTH = 32;
const KYIV_TIME_ZONE = "Europe/Kyiv";
const MONTHS = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня"
] as const;

export function presentLatestEventsPage(input: {
  page: ActivityEventPage;
  filter?: LatestEventFilter;
  now?: Date;
}): string {
  if (input.page.events.length === 0) {
    return presentLatestEventsEmpty(input.filter ?? "all");
  }

  return [
    "📜 Хроніки Квестарні",
    "",
    ...presentLatestEventsFilterLine(input.filter ?? "all"),
    ...(input.filter && input.filter !== "all" ? [""] : []),
    ...renderGroupedRows(input.page.events, input.now ?? new Date())
  ].join("\n");
}

export function presentLatestEventsEmpty(filter: LatestEventFilter = "all"): string {
  const filteredEmpty = presentLatestEventsFilteredEmpty(filter);
  if (filteredEmpty) {
    return filteredEmpty;
  }

  return [
    "📜 Хроніки Квестарні",
    "",
    "Поки що тихо. Літописець гріє чорнило, Корчмар — підозри."
  ].join("\n");
}

function presentLatestEventsFilteredEmpty(filter: LatestEventFilter): string | null {
  const intro = [
    "📜 Хроніки Квестарні",
    "",
    ...presentLatestEventsFilterLine(filter),
    ""
  ];

  switch (filter) {
    case "imp":
      return [
        ...intro,
        "Поки що без великих пригод. Це не тиша — це пауза перед чиїмось дуже поганим планом."
      ].join("\n");
    case "adv":
      return [
        ...intro,
        "Поки що без нових пригодників і гучних рівнів. Літописець тримає перо напоготові."
      ].join("\n");
    case "cmb":
      return [
        ...intro,
        "Поки що без гучних перемог. Мечі мовчать, протокол підслуховує."
      ].join("\n");
    case "itm":
      return [
        ...intro,
        "Поки що без рідкісних манаток. Торба робить вигляд, що так і треба."
      ].join("\n");
    case "all":
    default:
      return null;
  }
}

function presentLatestEventsFilterLine(filter: LatestEventFilter): string[] {
  if (filter === "all") {
    return [];
  }

  const labels: Record<Exclude<LatestEventFilter, "all">, string> = {
    imp: "⭐ Важливе",
    adv: "👥 Пригодники",
    cmb: "⚔️ Бої",
    itm: "🎒 Манатки"
  };

  return [`Фільтр: <b>${labels[filter]}</b>`];
}

export function presentLatestEventsError(): string {
  return [
    "📜 Хроніки Квестарні",
    "",
    "Літописець упустив перо в суп. Спробуй оновити сторінку ще раз."
  ].join("\n");
}

function renderGroupedRows(events: readonly ActivityEventRecord[], now: Date): string[] {
  const rows: string[] = [];
  let currentLabel: string | null = null;

  for (const event of events) {
    const label = kyivDateLabel(event.occurredAt, now);
    if (label !== currentLabel) {
      if (rows.length > 0) {
        rows.push("");
      }
      rows.push(label);
      currentLabel = label;
    }
    rows.push(renderEventRow(event));
  }

  return rows;
}

function renderEventRow(event: ActivityEventRecord): string {
  const time = formatKyivTime(event.occurredAt);
  const actor = `${event.actorGuildCrest ? `${escapeHtml(event.actorGuildCrest)} ` : ""}${safeDynamicName(event.actorDisplayName)}`;
  const subject = safeDynamicName(event.subjectName);

  switch (event.eventType) {
    case "character.created":
      return `👋 ${time} | Новий пригодник у Квестарні: ${actor}!`;
    case "referral.arrived":
      return `🤝 ${time} | Новий пригодник у Квестарні: «${safeDynamicName(event.actorDisplayName)}», за покликом «${safeDynamicName(event.subjectName)}».`;
    case "guild.created": {
      const crest = readPayloadString(event.payload, "crest");
      const guild = `${crest ? `${escapeHtml(crest)} ` : ""}${subject}`;
      return `🏰 ${time} | У Квестарні постала ґільдія «${guild}». Писар підкреслив це двічі.`;
    }
    case "guild.weekly_goal_completed": {
      const crest = readPayloadString(event.payload, "crest");
      const glory = readPayloadNumber(event.payload, "glory") ?? 13;
      const guild = `${crest ? `${escapeHtml(crest)} ` : ""}${subject}`;
      return `${GUILD_WEEKLY_GOAL_ICON} ${time} | Ґільдія «${guild}» закрила тижневий спільний клопіт і здобула +${glory} Слави. Писар скріпив результат, а не децибели.`;
    }
    case "character.level_reached": {
      const level = readPayloadNumber(event.payload, "level");
      const remort = presentRemortTag(readPayloadNumber(event.payload, "remortCount"));
      return `🎉 ${time} | ${actor} бере ${level ?? "новий"} рівень${remort}!`;
    }
    case "party.raid_won": {
      const participantCount = readPayloadNumber(event.payload, "participantCount") ?? 1;
      return `🏆 ${time} | Ватага: перемога. Ціль — «${subject}». У протоколі: ${participantCount} пригодників.`;
    }
    case "raid.completed": {
      const participantCount = readPayloadNumber(event.payload, "participantCount") ?? 1;
      const mode = readPayloadString(event.payload, "mode");
      const outcome = readPayloadString(event.payload, "outcome");
      const result = outcome === "lost" ? "невдача" : "перемога";
      if (mode === "group") {
        return `🍺 ${time} | Ватага: ${result}. Ціль — «${subject}». У протоколі: ${participantCount} пригодників.`;
      }
      return `🛢️ ${time} | ${actor}: соло-рейд, ${result}. Ціль — «${subject}».`;
    }
    case "item.rare_received": {
      const rarity = readPayloadString(event.payload, "rarity");
      if (rarity === "legendary") {
        return `💎 ${time} | ${actor}: легендарна манатка — «${subject}». Корчмар дістає підставку, серветку й окрему підставку для серветки.`;
      }
      if (rarity === "epic") {
        return `💎 ${time} | ${actor}: епічна манатка — «${subject}». Корчмар просить не ставити її на стіл без підставки.`;
      }
      return `🎒 ${time} | ${actor}: рідкісна манатка — «${subject}».`;
    }
    case "item.upgraded": {
      const targetLevel = readPayloadNumber(event.payload, "targetLevel");
      return `🛠️ ${time} | ${actor}: манатка підсилена до +${targetLevel ?? "?"} — «${subject}».`;
    }
    case "combat.underdog_won": {
      const delta = readPayloadNumber(event.payload, "levelDelta") ?? 5;
      return `🛡️ ${time} | ${actor}: перемога. Монстр — «${subject}», перевага рівнів: +${delta}.`;
    }
    case "duel.completed": {
      const mode = readPayloadString(event.payload, "mode");
      const label = mode === "turn-based" ? "покрокова дуель" : "швидка дуель";
      return `⚔️ ${time} | ${actor} і ${subject}: ${label} завершена. Корчмар записав без публічного сорому.`;
    }
    case "duel.tournament_claimed": {
      const rank = readPayloadNumber(event.payload, "rank") ?? 1;
      const points = readPayloadNumber(event.payload, "points") ?? 0;
      const period = presentTournamentPeriod(readPayloadString(event.payload, "period"));
      return `🏆 ${time} | ${actor}: ${period}, місце ${rank}, ${points} очк. Корчмар підписує нагороду без дуельних боргів.`;
    }
    default:
      return `📌 ${time} | ${actor}: записано нову подію.`;
  }
}

function safeDynamicName(value: string | null | undefined): string {
  const normalized = (value ?? "")
    .normalize("NFKC")
    .replace(/[\p{C}\p{Zl}\p{Zp}]+/gu, " ")
    .trim();
  const safe = normalized.length > 0 ? normalized : FALLBACK_ACTOR;
  const truncated = safe.length > MAX_DYNAMIC_NAME_LENGTH
    ? `${safe.slice(0, MAX_DYNAMIC_NAME_LENGTH - 3)}...`
    : safe;
  return escapeHtml(truncated);
}

function presentTournamentPeriod(value: string | null): string {
  switch (value) {
    case "day":
      return "денний турнір";
    case "week":
      return "тижневий турнір";
    case "month":
      return "місячний турнір";
    default:
      return "турнір";
  }
}

function formatKyivTime(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: KYIV_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function kyivDateLabel(date: Date, now: Date): string {
  const eventParts = getKyivDateParts(date);
  const nowParts = getKyivDateParts(now);
  const yesterday = getKyivDateParts(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  if (sameDateParts(eventParts, nowParts)) {
    return "Сьогодні";
  }

  if (sameDateParts(eventParts, yesterday)) {
    return "Вчора";
  }

  const month = MONTHS[eventParts.month - 1] ?? "";
  return eventParts.year === nowParts.year
    ? `${eventParts.day} ${month}`
    : `${eventParts.day} ${month} ${eventParts.year + 10000}`;
}

function getKyivDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KYIV_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "1970"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1")
  };
}

function sameDateParts(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number }
): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function readPayloadNumber(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function presentRemortTag(remortCount: number | null): string {
  if (remortCount === null) {
    return "";
  }

  const normalized = Math.max(0, Math.floor(remortCount));
  return normalized > 0 ? ` (р${normalized})` : "";
}

function readPayloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
