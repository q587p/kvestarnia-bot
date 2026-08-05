import type {
  PartyParticipantReadiness,
  PartySessionRecord
} from "../../db/repositories/partySessionRepository";
import {
  BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
  isLeftPassagePartySession
} from "../../services/partySessionService";

export function supportsPartyReadiness(session: Pick<
  PartySessionRecord,
  "originKind" | "originLocationId"
>): boolean {
  return session.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID ||
    isLeftPassagePartySession(session);
}

export function presentPartyReadinessButton(
  readiness: PartyParticipantReadiness | undefined
): string {
  return readiness === "ready" ? "⏳ Зачекайте" : "✅ Готово";
}

export function presentPartyReadinessMarker(
  readiness: PartyParticipantReadiness | undefined
): string {
  return readiness === "ready" ? "✅ " : "⏳ ";
}

export function presentRecruitingPartyHeader(session: PartySessionRecord): string {
  const joined = session.participants.filter((participant) => participant.status === "joined").length;
  return isLeftPassagePartySession(session)
    ? `🤝 У зборі до атаки в лівому проході: ${joined}/${session.participantCap}`
    : `🛢️ У зборі на груповий рейд «Старший Брат Бочки»: ${joined}/${session.participantCap}`;
}

export function presentRecruitingPartyActionButton(
  session: PartySessionRecord,
  viewerTelegramUserId: bigint
): string {
  const joined = session.participants.some(
    (participant) =>
      participant.status === "joined" &&
      participant.character.telegramUserId === viewerTelegramUserId
  );
  const leader = truncateButtonName(session.leader.name);

  if (joined) {
    return `🤝 Відкрити збір: ${leader}`;
  }

  return isLeftPassagePartySession(session)
    ? `🤝 До атаки: ${leader}`
    : `🤝 До рейду: ${leader}`;
}

function truncateButtonName(name: string): string {
  return name.length > 28 ? `${name.slice(0, 27)}…` : name;
}
