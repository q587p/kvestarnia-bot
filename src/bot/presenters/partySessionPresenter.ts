import { resolveActiveCosmeticTitleLabel } from "../../content/cosmeticTitles";
import type {
  PartyCancelResult,
  PartyCreateResult,
  PartyJoinResult,
  PartyLeaveResult,
  PartyViewResult
} from "../../services/partySessionService";
import type { PartyParticipantRecord, PartySessionRecord } from "../../db/repositories/partySessionRepository";
import { presentCharacterDisplayName } from "./characterDisplay";
import { escapeHtml } from "./telegramHtml";

export function presentPartyCreate(
  result: PartyCreateResult,
  options: { inviteUrl: string | null }
): string {
  if (result.state === "disabled") {
    return [
      "🧪 <b>Ватага ще під ковпаком</b>",
      "",
      "Збір ватаги доступний тільки в локальному/dev-режимі або під прапорцем. Корчмар не випускає недописаний рейд у залу."
    ].join("\n");
  }

  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Порожню ватагу Корчмар називає меблями.";
  }

  if (result.state === "live-membership") {
    return presentPartySession(result.session, {
      notice: "Ви вже записані в іншу живу ватагу. Спершу вийдіть із неї або дочекайтеся завершення."
    });
  }

  return presentPartySession(result.session, {
    inviteUrl: options.inviteUrl,
    notice: result.state === "created"
      ? "Запис відкрито. Це ще не бій і не рейдова нагорода, а збір тимчасової ватаги."
      : "У вас уже є жива ватага. Показую її канонічну картку."
  });
}

export function presentPartyJoin(result: PartyJoinResult): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Ватага не приймає таємничі силуети без анкети.";
  }

  if (result.state === "not-found") {
    return "Запрошення не знайшлося. Можливо, посилання впало за шинквас і прикинулося серветкою.";
  }

  if (result.state === "live-membership") {
    return presentPartySession(result.session, {
      notice: "Ви вже в іншій живій ватазі. Квестарня поважає ентузіязм, але не телепортацію між протоколами."
    });
  }

  if (result.state === "full") {
    return presentPartySession(result.session, {
      notice: "Ватага вже повна. Восьмеро пригодників — це межа, після якої стіл починає подавати скарги."
    });
  }

  if (result.state === "cancelled") {
    return presentPartySession(result.session, {
      notice: "Цю ватагу вже скасовано. Старі кнопки показують архів, а не новий набір."
    });
  }

  if (result.state === "expired") {
    return presentPartySession(result.session, {
      notice: "Строк збору минув. Посилання лишилося як доказ, що хтось майже організувався."
    });
  }

  return presentPartySession(result.session, {
    notice: result.state === "already-joined"
      ? "Ви вже в цій ватазі. Повторний запис не створює другого вас, хоча бюрократія мріяла."
      : "Ви приєдналися до ватаги."
  });
}

export function presentPartyLeave(result: PartyLeaveResult): string {
  if (result.state === "no-character") {
    return "Квестарня не впізнала пригодника. Спробуйте ще раз із особистого акаунта.";
  }

  if (result.state === "not-found") {
    return "Ватага не знайшлася.";
  }

  if (result.state === "not-member") {
    return presentPartySession(result.session, {
      notice: "Ця кнопка вже не є вашим записом у ватазі. Показую актуальний стан."
    });
  }

  if (result.state === "expired") {
    return presentPartySession(result.session, {
      notice: "Строк збору минув, тож виходити вже нікуди. Протокол просто закрив двері."
    });
  }

  return presentPartySession(result.session, {
    notice: result.state === "leader-transferred"
      ? "Ви вийшли. Лідерство перейшло до найраніше записаного пригодника."
      : result.state === "cancelled"
        ? "Останній учасник вийшов, тож ватагу скасовано."
        : "Ви вийшли з ватаги."
  });
}

export function presentPartyCancel(result: PartyCancelResult): string {
  if (result.state === "no-character") {
    return "Квестарня не впізнала пригодника. Спробуйте ще раз із особистого акаунта.";
  }

  if (result.state === "not-found") {
    return "Ватага не знайшлася.";
  }

  if (result.state === "not-leader") {
    return presentPartySession(result.session, {
      notice: "Скасувати ватагу може тільки поточний лідер. Протокол суворий, бо стіл уже бачив усе."
    });
  }

  return presentPartySession(result.session, {
    notice: result.state === "expired"
      ? "Строк збору вже минув. Старі кнопки не відкривають запис назад."
      : "Лідер скасував збір ватаги."
  });
}

export function presentPartyView(result: PartyViewResult): string {
  return result.state === "ready"
    ? presentPartySession(result.session)
    : "Ватага не знайшлася або вже стала легендою без протоколу.";
}

export function presentPartySession(
  session: PartySessionRecord,
  options: {
    inviteUrl?: string | null;
    notice?: string;
  } = {}
): string {
  const joined = getJoinedParticipants(session);
  const leader = joined.find((participant) => participant.characterId === session.leaderCharacterId);
  const lines = [
    "🧭 <b>Рейдова ватага</b>",
    "",
    getStatusLine(session),
    `Учасники: ${joined.length}/${session.participantCap}`,
    `Лідер: ${leader ? presentParticipantName(leader) : presentCharacterDisplayName(toDisplay(session.leader))}`,
    ""
  ];

  if (options.notice) {
    lines.push(escapeHtml(options.notice), "");
  }

  if (joined.length === 0) {
    lines.push("Запис порожній. Це вже майже філософія.");
  } else {
    lines.push(...joined.map((participant, index) => `${index + 1}. ${presentParticipantName(participant)}`));
  }

  if (session.status === "recruiting" && options.inviteUrl) {
    lines.push("", "Скопіюйте посилання для приватного запрошення:");
    lines.push(`<code>${escapeHtml(options.inviteUrl)}</code>`);
  }

  if (session.status === "recruiting") {
    lines.push("", "Бою, винагород і рейдового боса тут ще немає: тільки безпечний збір ватаги.");
  }

  return lines.join("\n");
}

export function presentPartyNearbyInviteSent(
  result: Extract<PartyViewResult, { state: "ready" }>,
  targetName: string
): string {
  return presentPartySession(result.session, {
    notice: `Запрошення для «${targetName}» надіслано приватно, якщо Telegram дозволив. Стан ватаги від цього не залежить.`
  });
}

export function presentPartyNearbyInviteNotification(
  session: PartySessionRecord,
  inviteUrl: string | null
): string {
  const leader = session.leader;
  return [
    "🧭 <b>Вас кличуть у ватагу</b>",
    "",
    `Кличе: ${presentCharacterDisplayName(toDisplay(leader))}`,
    `Учасники: ${getJoinedParticipants(session).length}/${session.participantCap}`,
    "",
    "Це поки збір тимчасової ватаги: без боса, нагород і бойового зобовʼязання.",
    ...(inviteUrl ? ["", `Посилання: <code>${escapeHtml(inviteUrl)}</code>`] : [])
  ].join("\n");
}

function getStatusLine(session: PartySessionRecord): string {
  if (session.status === "cancelled") {
    return "Стан: скасовано";
  }

  if (session.status === "expired") {
    return "Стан: строк збору минув";
  }

  if (session.status !== "recruiting") {
    return "Стан: архівний запис";
  }

  return `Стан: збір відкрито до ${formatTime(session.expiresAt)}`;
}

function getJoinedParticipants(session: PartySessionRecord): PartyParticipantRecord[] {
  return session.participants.filter((participant) => participant.status === "joined");
}

function presentParticipantName(participant: PartyParticipantRecord): string {
  return presentCharacterDisplayName(toDisplay(participant.character), {
    maxNameLength: 32,
    maxTitleLength: 32
  });
}

function toDisplay(character: { name: string; activeCosmeticTitleGrantId?: string | null }): {
  name: string;
  activeCosmeticTitle?: string | null;
} {
  return {
    name: character.name,
    activeCosmeticTitle: resolveActiveCosmeticTitleLabel(character.activeCosmeticTitleGrantId)
  };
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
