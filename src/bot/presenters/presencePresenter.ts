import type {
  LookSnapshot,
  OnlineSnapshot,
  ParticipantsSnapshot,
  PresenceActivitySnapshot,
  PresenceGroup,
  PresencePerson
} from "../../services/presenceService";
import type { PartySessionRecord } from "../../db/repositories/partySessionRepository";
import type { TavernGameSessionRecord } from "../../db/repositories/tavernGameRepository";
import type { PresentedLiveBardPerformance } from "../../services/bardPerformanceService";
import { presentLiveBardPerformanceNotice } from "./shynokPresenter";
import {
  KOSTI_PLAYER_CAP,
  TAVLEI_DOPPELGANGER_RULES_VERSION,
  TAVLEI_PLAYER_CAP
} from "../../domain/tavernGames";
import { isDicePokerState, isDicePokerTableState } from "../../domain/dicePoker";
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

export function presentOnline(
  snapshot: OnlineSnapshot,
  options: {
    recruitingParties?: readonly PartySessionRecord[];
    openTavernGameTables?: readonly TavernGameSessionRecord[];
    liveBardPerformance?: PresentedLiveBardPerformance | null;
  } = {}
): string {
  if (snapshot.state === "no-character") {
    return "Спершу створіть пригодника через /start. Квестарня не рахує тіні без анкети.";
  }

  const lines = [
    `👥 У грі зараз: ${snapshot.globalTotal}`,
    "",
    ...presentLocationBlock(snapshot.location.name, snapshot.location.people)
  ];

  const recruitingParties = options.recruitingParties ?? [];

  if (recruitingParties.length > 0) {
    lines.push("");
    lines.push(...presentRecruitingParties(recruitingParties));
  }

  const openTavernGameTables = options.openTavernGameTables ?? [];

  if (openTavernGameTables.length > 0) {
    lines.push("");
    lines.push(...presentOpenTavernGameTables(openTavernGameTables));
  }

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
  } else if (
    snapshot.location.id === PRESENCE_LOCATION_KORCHMA_BARREL &&
    recruitingParties.length === 0
  ) {
    lines.push("");
    lines.push("🍺 Активного рейду зараз немає.");
  }

  if (options.liveBardPerformance) {
    lines.push("");
    lines.push(presentLiveBardPerformanceNotice(options.liveBardPerformance));
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

function presentRecruitingParties(sessions: readonly PartySessionRecord[]): string[] {
  return sessions.flatMap((session, index) => {
    const joined = session.participants.filter((participant) => participant.status === "joined");
    const header = `🛢️ У зборі на груповий рейд «Старший Брат Бочки»: ${joined.length}/${session.participantCap}`;
    const participants = joined.map((participant) =>
      `— ${presentCharacterDisplayName(participant.character, {
        maxNameLength: MAX_PRESENCE_NAME_LENGTH,
        maxTitleLength: 48
      })}`
    );

    return index === 0
      ? [header, ...participants]
      : ["", header, ...participants];
  });
}

function presentOpenTavernGameTables(sessions: readonly TavernGameSessionRecord[]): string[] {
  const visible = sessions.slice(0, 8);
  const participantCount = visible.reduce((sum, session) => sum + session.participants.length, 0);
  const joinableCount = visible.filter(isJoinableTavernGameSession).length;

  return [
    `🎲 За ігровим столом: ${participantCount} ${pluralize(participantCount, "пригодник", "пригодники", "пригодників")}`,
    ...visible.map(presentOpenTavernGameTable),
    joinableCount > 0
      ? "Кнопки нижче підсадять до відкритого столу."
      : "Ці столи вже зайняті; підсісти не вийде."
  ];
}

function presentOpenTavernGameTable(session: TavernGameSessionRecord): string {
  const fallback = presentDoppelgangerOpenTavernGameTable(session);
  if (fallback) {
    return fallback;
  }

  const table = isDicePokerTableState(session.result) ? session.result : null;
  const cap = table?.playerCap ?? (session.gameKey === "kosti" ? KOSTI_PLAYER_CAP : TAVLEI_PLAYER_CAP);
  const label = table?.mode === "quick"
    ? "⚡ Швидкі кості"
    : table?.mode === "scorecard"
      ? "📜 Табличні кості"
      : session.gameKey === "kosti" ? "🎲 Кості" : "♟ Тавлеї";

  return `— ${label} · ${session.participants.length}/${cap} · ставка ${session.stakeGold} зол. · тримає ${escapeHtml(session.creator.name)}`;
}

function presentDoppelgangerOpenTavernGameTable(session: TavernGameSessionRecord): string | null {
  if (isDicePokerState(session.result)) {
    const label = session.result.mode === "quick" ? "⚡ Швидкі кості" : "📜 Табличні кості";
    return `— ${label} з Допельґанґером · ставка ${session.stakeGold} зол. · грає ${escapeHtml(session.creator.name)}`;
  }

  if (session.rulesVersion === TAVLEI_DOPPELGANGER_RULES_VERSION) {
    return `— ♟ Тавлеї з Допельґанґером · ставка ${session.stakeGold} зол. · грає ${escapeHtml(session.creator.name)}`;
  }

  return null;
}

function isJoinableTavernGameSession(session: TavernGameSessionRecord): boolean {
  if (session.status !== "open") {
    return false;
  }

  const table = isDicePokerTableState(session.result) ? session.result : null;
  if (table) {
    return table.phase === "waiting" && session.participants.length < table.playerCap;
  }

  return session.gameKey === "tavlei" && session.participants.length < TAVLEI_PLAYER_CAP;
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
