import type { Api } from "grammy";
import type { PartySessionRecord } from "../db/repositories/partySessionRepository";
import type { PartySessionService } from "../services/partySessionService";
import { buildPartySessionKeyboard } from "./keyboards/partySessionKeyboard";
import {
  isPermanentPartyCardEditError,
  serializePartySessionDelivery
} from "./partySessionDeliveryCoordinator";
import { presentPartyTerminalIneligible } from "./presenters/partySessionPresenter";
import { isMessageNotModifiedError } from "./safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

type PartyCardReference = {
  chatId: bigint;
  messageId: number;
};

export async function deliverTerminalIneligiblePartyCards(
  api: Pick<Api, "editMessageText" | "sendMessage">,
  service: Pick<PartySessionService, "getByToken" | "recordParticipantMessageReference">,
  inviteToken: string,
  options: {
    actorTelegramUserId?: bigint | undefined;
    actorReference?: PartyCardReference | null | undefined;
  } = {}
): Promise<void> {
  await serializePartySessionDelivery(inviteToken, async () => {
    const canonical = await service.getByToken(inviteToken);
    if (canonical.state !== "ready" || canonical.session.status !== "ineligible") {
      return;
    }

    for (const participant of canonical.session.participants) {
      if (participant.status !== "joined") {
        continue;
      }

      await deliverParticipantTerminalCard(api, service, canonical.session, participant.characterId, options);
    }
  });
}

async function deliverParticipantTerminalCard(
  api: Pick<Api, "editMessageText" | "sendMessage">,
  service: Pick<PartySessionService, "getByToken" | "recordParticipantMessageReference">,
  session: PartySessionRecord,
  characterId: string,
  options: {
    actorTelegramUserId?: bigint | undefined;
    actorReference?: PartyCardReference | null | undefined;
  }
): Promise<void> {
  const participant = session.participants.find((candidate) =>
    candidate.characterId === characterId && candidate.status === "joined"
  );
  if (!participant) {
    return;
  }

  const storedReference = getStoredReference(participant);
  const actorReference = participant.character.telegramUserId === options.actorTelegramUserId
    ? options.actorReference ?? null
    : null;
  const reference = storedReference ?? actorReference;
  const delivery = reference
    ? await editTerminalCard(api, session, participant.characterId, reference)
    : "permanent";

  if (delivery === "delivered") {
    if (!storedReference && actorReference) {
      await persistReference(service, participant.character.telegramUserId, session.inviteToken, actorReference);
    }
    return;
  }
  if (delivery === "transient") {
    return;
  }

  const refreshed = await service.getByToken(session.inviteToken);
  if (refreshed.state !== "ready" || refreshed.session.status !== "ineligible") {
    return;
  }
  const current = refreshed.session.participants.find((candidate) =>
    candidate.characterId === characterId && candidate.status === "joined"
  );
  if (!current) {
    return;
  }

  const currentReference = getStoredReference(current);
  if (currentReference && !sameReference(currentReference, reference)) {
    const currentDelivery = await editTerminalCard(api, refreshed.session, current.characterId, currentReference);
    if (currentDelivery !== "permanent") {
      return;
    }
  }

  const text = presentPartyTerminalIneligible(refreshed.session, current.characterId);
  const messageOptions = buildTerminalMessageOptions(refreshed.session, current.characterId);
  const chatId = current.chatId ?? current.character.telegramUserId;
  let message: Awaited<ReturnType<Api["sendMessage"]>>;
  try {
    message = await api.sendMessage(Number(chatId), text, messageOptions);
  } catch {
    // Telegram delivery is retried safely by a later callback or scheduler pass.
    return;
  }
  if (message.message_id) {
    await persistReference(service, current.character.telegramUserId, refreshed.session.inviteToken, {
      chatId,
      messageId: message.message_id
    });
  }
}

async function editTerminalCard(
  api: Pick<Api, "editMessageText">,
  session: PartySessionRecord,
  viewerCharacterId: string,
  reference: PartyCardReference
): Promise<"delivered" | "permanent" | "transient"> {
  try {
    await api.editMessageText(
      Number(reference.chatId),
      reference.messageId,
      presentPartyTerminalIneligible(session, viewerCharacterId),
      buildTerminalMessageOptions(session, viewerCharacterId)
    );
    return "delivered";
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return "delivered";
    }
    return isPermanentPartyCardEditError(error) ? "permanent" : "transient";
  }
}

function buildTerminalMessageOptions(session: PartySessionRecord, viewerCharacterId: string) {
  return {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildPartySessionKeyboard(session, { viewerCharacterId })
  };
}

function getStoredReference(
  participant: PartySessionRecord["participants"][number]
): PartyCardReference | null {
  return participant.chatId && participant.messageId
    ? { chatId: participant.chatId, messageId: participant.messageId }
    : null;
}

function sameReference(left: PartyCardReference, right: PartyCardReference | null): boolean {
  return Boolean(right && left.chatId === right.chatId && left.messageId === right.messageId);
}

async function persistReference(
  service: Pick<PartySessionService, "recordParticipantMessageReference">,
  telegramUserId: bigint,
  inviteToken: string,
  reference: PartyCardReference
): Promise<void> {
  await service.recordParticipantMessageReference(telegramUserId, inviteToken, reference);
}
