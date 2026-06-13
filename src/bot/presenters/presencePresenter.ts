import type {
  LookSnapshot,
  OnlineSnapshot,
  ParticipantsSnapshot,
  PresenceActivitySnapshot,
  PresenceGroup,
  PresencePerson
} from "../../services/presenceService";
import { escapeHtml } from "./telegramHtml";

export function presentOnline(snapshot: OnlineSnapshot): string {
  if (snapshot.state === "no-character") {
    return "Спершу створіть героя через /start. Квестарня не рахує тіні без анкети.";
  }

  const lines = [
    `👥 У грі зараз: ${snapshot.globalTotal}`,
    "",
    ...presentLocationBlock(snapshot.location.people)
  ];

  lines.push("");

  if (snapshot.activity) {
    lines.push(...presentActivitySummary(snapshot.activity));
  } else {
    lines.push("🍺 Активного рейду зараз немає.");
  }

  return lines.join("\n");
}

export function presentLook(snapshot: LookSnapshot): string {
  if (snapshot.state === "no-character") {
    return "Спершу створіть героя через /start. Озиратися без анкети можна, але корчмар не поставить печатку.";
  }

  return [
    "👀 Озирнутися",
    "",
    `Поточна місцина: ${escapeHtml(snapshot.location.name)}.`,
    "",
    presentCompactPresenceLine(snapshot.location.people)
  ].join("\n");
}

export function presentParticipants(snapshot: ParticipantsSnapshot): string {
  if (snapshot.state === "no-character") {
    return "Спершу створіть героя через /start. У списки учасників без героя не вписують.";
  }

  const title =
    snapshot.activity.kind === "raid"
      ? `🍺 ${escapeHtml(snapshot.activity.name)}`
      : `🌯 ${escapeHtml(snapshot.activity.name)}`;

  return [
    title,
    "",
    ...presentStatusSection("🟢 Активні", snapshot.activity.people.active),
    "",
    ...presentStatusSection("🟡 Притихли", snapshot.activity.people.idle),
    "",
    `📍 Поточна місцина: ${escapeHtml(snapshot.activity.locationName)}`
  ].join("\n");
}

export function presentCompactPresenceLine(group: PresenceGroup): string {
  const active = group.active.length;
  const idle = group.idle.length;

  if (active === 0 && idle === 0) {
    return "👥 Тут: тихо.";
  }

  const parts = [];

  if (active > 0) {
    parts.push(`${active} ${pluralize(active, "активний", "активні", "активних")}`);
  }

  if (idle > 0) {
    parts.push(`${idle} ${pluralize(idle, "притих", "притихли", "притихли")}`);
  }

  return `👥 Тут: ${parts.join(", ")}.`;
}

function presentLocationBlock(group: PresenceGroup): string[] {
  if (group.total <= 1) {
    return ["📍 У цій місцині: тільки ти."];
  }

  return [`📍 У цій місцині: ${group.total}`, ...presentPeople([...group.active, ...group.idle])];
}

function presentActivitySummary(activity: PresenceActivitySnapshot): string[] {
  const prefix = activity.kind === "raid" ? "🍺 У рейді" : "🌯 У пригоді";

  if (activity.people.total === 0) {
    return [`${prefix} «${escapeHtml(activity.name)}»: поки тихо.`];
  }

  return [
    `${prefix} «${escapeHtml(activity.name)}»: ${activity.people.total}`,
    ...presentPeople([...activity.people.active, ...activity.people.idle])
  ];
}

function presentStatusSection(title: string, people: PresencePerson[]): string[] {
  if (people.length === 0) {
    return [title + ":", "— нікого"];
  }

  return [title + ":", ...presentPeople(people)];
}

function presentPeople(people: PresencePerson[]): string[] {
  return people.map((person) => `— ${escapeHtml(person.name)}`);
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}
