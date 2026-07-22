import type { Api } from "grammy";
import type { GroupCombatSessionRecord } from "../db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../services/groupCombatService";
import { buildGroupCombatKeyboard } from "./keyboards/groupCombatKeyboard";
import { presentGroupCombat } from "./presenters/groupCombatPresenter";
import {
  isMessageNotModifiedError,
  isMessageUnavailableForEditError
} from "./safeEditMessageText";

const HTML_MESSAGE_OPTIONS = { parse_mode: "HTML" as const };
const MAX_CONVERGENCE_EDITS = 4;
const deliveryTails = new Map<string, Promise<void>>();

type GroupCombatMessageReference = { chatId: bigint; messageId: number };
type MessageOptions = NonNullable<Parameters<Api["editMessageText"]>[3]>;

export interface GroupCombatDeliveryTransport {
  editMessage(reference: GroupCombatMessageReference, text: string, options: MessageOptions): Promise<void>;
  sendInertMessage(chatId: bigint, text: string, options: MessageOptions): Promise<number | null>;
  deleteMessage(reference: GroupCombatMessageReference): Promise<void>;
}

export type GroupCombatParticipantDeliveryResult =
  | { state: "edited" | "unchanged" | "activated"; reference: GroupCombatMessageReference }
  | { state: "candidate-lost" | "retryable-edit-failure"; reference: GroupCombatMessageReference | null }
  | { state: "missing-participant" | "send-failed" | "activation-failed"; reference: null };

export async function deliverGroupCombatCards(
  api: Api,
  service: GroupCombatService,
  session: GroupCombatSessionRecord
): Promise<number> {
  const transport: GroupCombatDeliveryTransport = {
    editMessage: async (reference, text, options) => {
      await api.editMessageText(Number(reference.chatId), reference.messageId, text, options);
    },
    sendInertMessage: async (chatId, text, options) => {
      const sent = await api.sendMessage(Number(chatId), text, options);
      return sent.message_id ?? null;
    },
    deleteMessage: async (reference) => {
      await api.deleteMessage(Number(reference.chatId), reference.messageId);
    }
  };
  const results = await Promise.allSettled(session.participants.map((participant) => (
    deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: session.id,
      participantCharacterId: participant.characterId,
      transport
    })
  )));
  return results.filter((result) => result.status === "fulfilled" && isDelivered(result.value)).length;
}

export async function deliverCanonicalGroupCombatParticipantCard(input: {
  service: GroupCombatService;
  sessionId: string;
  participantCharacterId: string;
  transport: GroupCombatDeliveryTransport;
}): Promise<GroupCombatParticipantDeliveryResult> {
  return withParticipantDeliveryLock(`${input.sessionId}:${input.participantCharacterId}`, () => (
    deliverCanonicalGroupCombatParticipantCardLocked(input)
  ));
}

async function deliverCanonicalGroupCombatParticipantCardLocked(input: {
  service: GroupCombatService;
  sessionId: string;
  participantCharacterId: string;
  transport: GroupCombatDeliveryTransport;
}): Promise<GroupCombatParticipantDeliveryResult> {
  let current = await loadAuthoritativeSession(input.service, input.sessionId);
  let participant = findParticipant(current, input.participantCharacterId);
  if (!current || !participant) {
    return { state: "missing-participant", reference: null };
  }

  let reference = privateReference(participant);
  if (reference) {
    const edited = await editExistingReferenceUntilCurrent(input, reference, current);
    if (edited.state !== "missing") {
      return edited;
    }
    current = edited.current;
    participant = findParticipant(current, input.participantCharacterId);
    if (!participant) {
      return { state: "missing-participant", reference: null };
    }
    reference = privateReference(participant);
    if (reference) {
      const converged = await editExistingReferenceUntilCurrent(input, reference, current);
      if (converged.state !== "missing") {
        return converged;
      }
      current = converged.current;
      participant = findParticipant(current, input.participantCharacterId);
      if (!participant) {
        return { state: "missing-participant", reference: null };
      }
    }
  }

  const candidateCard = buildCard(current, participant.characterId);
  const candidateMessageId = await input.transport.sendInertMessage(
    participant.telegramUserId,
    candidateCard.text,
    { ...candidateCard.options, reply_markup: { inline_keyboard: [] } }
  );
  if (!candidateMessageId) {
    return { state: "send-failed", reference: null };
  }
  const candidate = { chatId: participant.telegramUserId, messageId: candidateMessageId };
  const claimed = await input.service.compareAndSetParticipantCard({
    sessionId: current.id,
    telegramUserId: participant.telegramUserId,
    expectedReferenceVersion: participant.referenceVersion,
    chatId: candidate.chatId,
    messageId: candidate.messageId
  });
  if (!claimed) {
    await input.transport.deleteMessage(candidate).catch(() => undefined);
    const winner = await loadAuthoritativeSession(input.service, input.sessionId);
    const winnerParticipant = findParticipant(winner, input.participantCharacterId);
    const winnerReference = winnerParticipant ? privateReference(winnerParticipant) : null;
    if (winner && winnerReference) {
      const converged = await editExistingReferenceUntilCurrent(input, winnerReference, winner);
      if (converged.state !== "missing") {
        return converged;
      }
    }
    return { state: "candidate-lost", reference: winnerReference };
  }

  const fresh = await loadAuthoritativeSession(input.service, input.sessionId);
  const freshParticipant = findParticipant(fresh, input.participantCharacterId);
  if (!fresh || !freshParticipant) {
    return { state: "activation-failed", reference: null };
  }
  const canonicalReference = privateReference(freshParticipant);
  if (!canonicalReference || !sameReference(canonicalReference, candidate)) {
    return { state: "candidate-lost", reference: canonicalReference };
  }
  const activated = await editExistingReferenceUntilCurrent(input, candidate, fresh);
  if (activated.state !== "missing") {
    return activated.state === "edited"
      ? { state: "activated", reference: activated.reference }
      : activated;
  }
  await input.service.releaseParticipantCard({
    sessionId: input.sessionId,
    telegramUserId: freshParticipant.telegramUserId,
    expectedReferenceVersion: freshParticipant.referenceVersion,
    chatId: candidate.chatId,
    messageId: candidate.messageId
  });
  return { state: "activation-failed", reference: null };
}

type ExistingEditResult =
  | { state: "edited" | "unchanged"; reference: GroupCombatMessageReference }
  | { state: "retryable-edit-failure"; reference: GroupCombatMessageReference }
  | { state: "missing"; current: GroupCombatSessionRecord };

async function editExistingReferenceUntilCurrent(
  input: {
    service: GroupCombatService;
    sessionId: string;
    participantCharacterId: string;
    transport: GroupCombatDeliveryTransport;
  },
  reference: GroupCombatMessageReference,
  initial: GroupCombatSessionRecord
): Promise<ExistingEditResult> {
  let current = initial;
  let lastState: "edited" | "unchanged" = "edited";
  for (let attempt = 0; attempt < MAX_CONVERGENCE_EDITS; attempt += 1) {
    const participant = findParticipant(current, input.participantCharacterId);
    const canonicalReference = participant ? privateReference(participant) : null;
    if (!participant || !canonicalReference || !sameReference(canonicalReference, reference)) {
      return { state: "missing", current };
    }
    const card = buildCard(current, participant.characterId);
    try {
      await input.transport.editMessage(reference, card.text, card.options);
      lastState = "edited";
    } catch (error) {
      if (isMessageNotModifiedError(error)) {
        lastState = "unchanged";
      } else if (isMessageUnavailableForEditError(error)) {
        return { state: "missing", current };
      } else {
        return { state: "retryable-edit-failure", reference };
      }
    }
    const latest = await loadAuthoritativeSession(input.service, input.sessionId);
    if (!latest) {
      return { state: "missing", current };
    }
    if (deliveryRevision(latest) === deliveryRevision(current)) {
      return { state: lastState, reference };
    }
    current = latest;
  }
  const participant = findParticipant(current, input.participantCharacterId);
  if (!participant) {
    return { state: "missing", current };
  }
  const card = buildCard(current, participant.characterId);
  try {
    await input.transport.editMessage(reference, card.text, card.options);
    return { state: "edited", reference };
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return { state: "unchanged", reference };
    }
    if (isMessageUnavailableForEditError(error)) {
      return { state: "missing", current };
    }
    return { state: "retryable-edit-failure", reference };
  }
}

async function loadAuthoritativeSession(
  service: GroupCombatService,
  sessionId: string
): Promise<GroupCombatSessionRecord | null> {
  try {
    return await service.findById(sessionId);
  } catch {
    return null;
  }
}

function findParticipant(session: GroupCombatSessionRecord | null, characterId: string) {
  return session?.participants.find((participant) => participant.characterId === characterId) ?? null;
}

function privateReference(participant: GroupCombatSessionRecord["participants"][number]): GroupCombatMessageReference | null {
  return participant.chatId === participant.telegramUserId && participant.messageId !== null
    ? { chatId: participant.chatId, messageId: participant.messageId }
    : null;
}

function sameReference(left: GroupCombatMessageReference, right: GroupCombatMessageReference): boolean {
  return left.chatId === right.chatId && left.messageId === right.messageId;
}

function deliveryRevision(session: GroupCombatSessionRecord): string {
  return `${session.id}:${session.version}:${session.status}:${session.turn}`;
}

function buildCard(session: GroupCombatSessionRecord, participantCharacterId: string) {
  return {
    text: presentGroupCombat(session, participantCharacterId),
    options: {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildGroupCombatKeyboard(session, participantCharacterId)
    }
  };
}

function isDelivered(result: GroupCombatParticipantDeliveryResult): boolean {
  return result.state !== "missing-participant" && result.state !== "send-failed" && result.state !== "activation-failed";
}

async function withParticipantDeliveryLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = deliveryTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  deliveryTails.set(key, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (deliveryTails.get(key) === tail) {
      deliveryTails.delete(key);
    }
  }
}
