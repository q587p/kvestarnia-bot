import type {
  LookSnapshot,
  OnlineSnapshot,
  ParticipantsSnapshot,
  PresenceActivitySnapshot,
  PresenceGroup,
  PresencePerson
} from "../../services/presenceService";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_ADVENTURE_HUNT_BOARD,
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_ADVENTURE_SOLO_FIGHT,
  PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER,
  PRESENCE_LOCATION_KORCHMA_BARREL
} from "../../services/presenceService";
import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml } from "./telegramHtml";

const MAX_VISIBLE_PRESENCE_PEOPLE = 12;
const MAX_PRESENCE_NAME_LENGTH = 48;

interface PresencePeoplePresentationOptions {
  suppressTitleForTelegramUserIds?: ReadonlySet<bigint>;
}

export function presentOnline(snapshot: OnlineSnapshot): string {
  if (snapshot.state === "no-character") {
    return "Спершу створіть пригодника через /start. Квестарня не рахує тіні без анкети.";
  }

  const lines = [
    `👥 У грі зараз: ${snapshot.globalTotal}`,
    "",
    ...presentLocationBlock(snapshot.location.name, snapshot.location.people)
  ];

  if (snapshot.activity) {
    const renderedLocationPeople =
      snapshot.location.people.total > 1
        ? collectPresencePersonIds(snapshot.location.people)
        : new Set<bigint>();

    lines.push("");
    lines.push(
      ...presentActivitySummary(snapshot.activity, {
        suppressTitleForTelegramUserIds: renderedLocationPeople
      })
    );
  } else if (snapshot.location.id === PRESENCE_LOCATION_KORCHMA_BARREL) {
    lines.push("");
    lines.push("🍺 Активного рейду зараз немає.");
  }

  return lines.join("\n");
}

export function presentLook(snapshot: LookSnapshot): string {
  if (snapshot.state === "no-character") {
    return "Спершу створіть пригодника через /start. Озиратися без анкети можна, але корчмар не поставить печатку.";
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
    return "Спершу створіть пригодника через /start. У списки учасників без пригодника не вписують.";
  }

  const title =
    snapshot.activity.kind === "raid"
      ? `🍺 ${escapeHtml(snapshot.activity.name)}`
      : `${presentAdventureIcon(snapshot.activity)} <i>${escapeHtml(snapshot.activity.name)}</i>`;

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

function presentLocationBlock(locationName: string, group: PresenceGroup): string[] {
  if (group.total <= 1) {
    return [`📍 ${escapeHtml(locationName)}: тільки ти.`];
  }

  return [
    `📍 ${escapeHtml(locationName)}: ${group.total}`,
    ...presentPeople([...group.active, ...group.idle])
  ];
}

function presentActivitySummary(
  activity: PresenceActivitySnapshot,
  options: PresencePeoplePresentationOptions = {}
): string[] {
  const prefix =
    activity.kind === "raid"
      ? presentSoloRaidPrefix(activity.people.total)
      : `${presentAdventureIcon(activity)} У пригоді`;
  const activityName = presentActivityName(activity);

  if (activity.people.total === 0) {
    return [`${prefix} «${activityName}»: поки тихо.`];
  }

  return [
    `${prefix} «${activityName}»: ${activity.people.total}`,
    ...presentPeople([...activity.people.active, ...activity.people.idle], options)
  ];
}

function presentActivityName(activity: PresenceActivitySnapshot): string {
  const name = escapeHtml(activity.name);

  return activity.kind === "adventure" ? `<i>${name}</i>` : name;
}

function presentAdventureIcon(activity: PresenceActivitySnapshot): string {
  if (activity.id === PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND) {
    return "🐭";
  }

  if (activity.id === PRESENCE_ADVENTURE_HUNT_BOARD) {
    return "🏹";
  }

  if (activity.id === PRESENCE_ADVENTURE_MIMIC_FIGHT || activity.id === PRESENCE_ADVENTURE_SOLO_FIGHT) {
    return "⚔️";
  }

  if (activity.id === PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER) {
    return "🥊";
  }

  return "🧩";
}

function presentStatusSection(title: string, people: PresencePerson[]): string[] {
  if (people.length === 0) {
    return [title + ":", "— нікого"];
  }

  return [title + ":", ...presentPeople(people)];
}

function presentPeople(
  people: PresencePerson[],
  options: PresencePeoplePresentationOptions = {}
): string[] {
  const visible = people.slice(0, MAX_VISIBLE_PRESENCE_PEOPLE);
  const hidden = people.length - visible.length;
  const lines = visible.map((person) => {
    const displayPerson = options.suppressTitleForTelegramUserIds?.has(person.telegramUserId)
      ? { ...person, activeCosmeticTitle: null }
      : person;

    return `— ${presentCharacterDisplayName(displayPerson, {
      maxNameLength: MAX_PRESENCE_NAME_LENGTH,
      maxTitleLength: 48
    })}`;
  });

  if (hidden > 0) {
    lines.push(`— і ще ${hidden} ${pluralize(hidden, "пригодник", "пригодники", "пригодників")}`);
  }

  return lines;
}

function collectPresencePersonIds(group: PresenceGroup): Set<bigint> {
  return new Set([...group.active, ...group.idle].map((person) => person.telegramUserId));
}

function presentSoloRaidPrefix(total: number): string {
  return total === 1 ? "🍺 У соло-рейді" : "🍺 У соло-рейдах";
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
