import type { Context } from "grammy";
import type { DuelCombatSessionRecord } from "../db/repositories/duelChallengeRepository";
import type { DuelChallengeService, DuelChallengeView } from "../services/duelChallengeService";
import { getCombatSkillProfile } from "../domain/combat";
import { getCombatSkillDisplay } from "../services/fightService";
import { buildDuelResultKeyboard, buildTurnBasedDuelKeyboard } from "./keyboards/duelKeyboard";
import { presentDuelView, presentTurnBasedDuel } from "./presenters/duelPresenter";
import {
  isMessageNotModifiedError,
  isMessageUnavailableForEditError,
  safeEditMessageText
} from "./safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export type TurnBasedDuelParticipant = "challenger" | "target";
export type TurnBasedDuelMessageReference = { chatId: bigint; messageId: number };
type TurnBasedDuelCardView = Extract<DuelChallengeView, { state: "active" | "resolved" }>;
type ActiveTurnBasedDuel = Extract<TurnBasedDuelCardView, { state: "active" }>;
type AuthoritativeTurnBasedDuelCardState = {
  view: TurnBasedDuelCardView;
  session: DuelCombatSessionRecord;
};
type MessageOptions = NonNullable<Parameters<Context["api"]["editMessageText"]>[3]>;

export interface TurnBasedDuelDeliveryTransport {
  editMessage(
    reference: TurnBasedDuelMessageReference,
    text: string,
    options: MessageOptions
  ): Promise<void>;
  sendInertMessage(
    chatId: bigint,
    text: string,
    options: MessageOptions
  ): Promise<number | null>;
}

export interface CanonicalTurnBasedDuelDeliveryInput {
  service: DuelChallengeService;
  view: TurnBasedDuelCardView;
  session?: DuelCombatSessionRecord;
  participant: TurnBasedDuelParticipant;
  chatId: bigint;
  transport: TurnBasedDuelDeliveryTransport;
  allowFallback?: boolean;
  presentActive?: (view: ActiveTurnBasedDuel, viewerCharacterId: string) => string;
}

export type CanonicalTurnBasedDuelDeliveryResult =
  | { state: "edited" | "unchanged" | "activated"; reference: TurnBasedDuelMessageReference }
  | { state: "retryable-edit-failure" | "retryable-activation-failure" | "fallback-disabled"; reference: TurnBasedDuelMessageReference | null }
  | { state: "candidate-lost"; reference: TurnBasedDuelMessageReference | null }
  | { state: "activation-failed" | "view-changed"; reference: null };

const deliveryTails = new Map<string, Promise<void>>();
const MAX_CONVERGENCE_EDITS = 4;

export async function deliverCanonicalTurnBasedDuelParticipantCard(
  input: CanonicalTurnBasedDuelDeliveryInput
): Promise<CanonicalTurnBasedDuelDeliveryResult> {
  const seedSession = input.view.state === "active" ? input.view.session : input.session;
  if (!seedSession) {
    return { state: "view-changed", reference: null };
  }

  return withParticipantDeliveryLock(
    `${seedSession.id}:${input.participant}`,
    () => deliverCanonicalTurnBasedDuelParticipantCardLocked(input, seedSession)
  );
}

async function deliverCanonicalTurnBasedDuelParticipantCardLocked(
  input: CanonicalTurnBasedDuelDeliveryInput,
  seedSession: DuelCombatSessionRecord
): Promise<CanonicalTurnBasedDuelDeliveryResult> {
  let authoritative = await loadAuthoritativeState(input, seedSession);
  if (!authoritative) {
    return { state: "view-changed", reference: null };
  }

  let existingReference = getTurnBasedDuelParticipantReference(authoritative.session, input.participant);

  if (existingReference && existingReference.chatId === input.chatId) {
    const editResult = await editExistingReferenceUntilCurrent(
      input,
      existingReference,
      authoritative
    );
    if (editResult.state !== "missing") {
      return editResult;
    }

    authoritative = editResult.current;
    existingReference = getTurnBasedDuelParticipantReference(authoritative.session, input.participant);
  }

  if (input.allowFallback === false) {
    return { state: "fallback-disabled", reference: existingReference };
  }

  const candidateCard = buildCard(authoritative.view, input.participant, input.presentActive);
  const candidateMessageId = await input.transport.sendInertMessage(
    input.chatId,
    candidateCard.text,
    {
      ...candidateCard.options,
      reply_markup: { inline_keyboard: [] }
    }
  );
  if (!candidateMessageId) {
    return { state: "activation-failed", reference: null };
  }

  const candidate = { chatId: input.chatId, messageId: candidateMessageId };
  const claim = existingReference
    ? await input.service.claimTurnBasedMessageReference(
        seedSession.id,
        input.participant,
        candidate,
        existingReference
      )
    : await input.service.claimTurnBasedMessageReference(
        seedSession.id,
        input.participant,
        candidate
      );
  if (!claim.claimed) {
    const winnerReference = getTurnBasedDuelParticipantReference(claim.session, input.participant);
    const winnerState = await loadAuthoritativeState(input, claim.session ?? seedSession);
    if (winnerReference && winnerReference.chatId === input.chatId && winnerState) {
      const converged = await editExistingReferenceUntilCurrent(
        input,
        winnerReference,
        winnerState
      );
      if (converged.state !== "missing") {
        return converged;
      }
    }

    return {
      state: "candidate-lost",
      reference: winnerReference
    };
  }

  const fresh = await loadAuthoritativeState(input, claim.session ?? seedSession);
  if (!fresh) {
    return { state: "retryable-activation-failure", reference: candidate };
  }

  if (fresh.session.id !== seedSession.id) {
    await input.service.releaseTurnBasedMessageReference(seedSession.id, input.participant, candidate);
    return { state: "view-changed", reference: null };
  }

  const freshCard = buildCard(fresh.view, input.participant, input.presentActive);
  try {
    await input.transport.editMessage(candidate, freshCard.text, freshCard.options);
    return { state: "activated", reference: candidate };
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return { state: "activated", reference: candidate };
    }

    if (!isMessageUnavailableForEditError(error)) {
      return { state: "retryable-activation-failure", reference: candidate };
    }

    await input.service.releaseTurnBasedMessageReference(seedSession.id, input.participant, candidate);
    return { state: "activation-failed", reference: null };
  }
}

type ExistingEditResult =
  | { state: "edited" | "unchanged"; reference: TurnBasedDuelMessageReference }
  | { state: "retryable-edit-failure"; reference: TurnBasedDuelMessageReference }
  | { state: "missing"; current: AuthoritativeTurnBasedDuelCardState };

async function editExistingReferenceUntilCurrent(
  input: CanonicalTurnBasedDuelDeliveryInput,
  reference: TurnBasedDuelMessageReference,
  initialState: AuthoritativeTurnBasedDuelCardState
): Promise<ExistingEditResult> {
  let current = initialState;
  let lastState: "edited" | "unchanged" = "edited";

  for (let attempt = 0; attempt < MAX_CONVERGENCE_EDITS; attempt += 1) {
    const card = buildCard(current.view, input.participant, input.presentActive);
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

    const latest = await loadAuthoritativeState(input, current.session);
    if (!latest || getViewRevision(latest.view) === getViewRevision(current.view)) {
      return { state: lastState, reference };
    }

    current = latest;
  }

  const finalCard = buildCard(current.view, input.participant, input.presentActive);
  try {
    await input.transport.editMessage(reference, finalCard.text, finalCard.options);
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

async function loadAuthoritativeState(
  input: CanonicalTurnBasedDuelDeliveryInput,
  fallbackSession: DuelCombatSessionRecord
): Promise<AuthoritativeTurnBasedDuelCardState | null> {
  try {
    const hasSessionLoader = typeof input.service.getTurnBasedSessionByToken === "function";
    let current = await input.service.getByToken(input.view.challenge.inviteToken);
    const storedSession = hasSessionLoader
      ? await input.service.getTurnBasedSessionByToken(input.view.challenge.inviteToken)
      : current.state === "active"
        ? current.session
        : fallbackSession;

    if (
      hasSessionLoader &&
      current.state === "active" &&
      storedSession &&
      (storedSession.status !== "active" || storedSession.version !== current.session.version)
    ) {
      current = await input.service.getByToken(input.view.challenge.inviteToken);
    }

    if (
      (current.state !== "active" && current.state !== "resolved") ||
      !storedSession ||
      storedSession.id !== fallbackSession.id ||
      (current.state === "active" && (
        current.session.id !== storedSession.id ||
        current.session.version !== storedSession.version ||
        storedSession.status !== "active"
      )) ||
      (hasSessionLoader && current.state === "resolved" && storedSession.status === "active")
    ) {
      return null;
    }
    return {
      view: current,
      session: storedSession
    };
  } catch {
    return null;
  }
}

function getViewRevision(view: TurnBasedDuelCardView): string {
  return view.state === "resolved"
    ? `terminal:${view.challenge.status}`
    : `active:${view.session.id}:${view.session.version}:${view.session.turn}`;
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

export async function showCanonicalTurnBasedDuelCard(
  ctx: Context,
  result: ActiveTurnBasedDuel,
  service: DuelChallengeService,
  mode: "reply" | "edit",
  deliveryOptions: {
    allowFallback?: boolean;
    presentActive?: (view: ActiveTurnBasedDuel, viewerCharacterId: string) => string;
  } = {}
): Promise<void> {
  const viewer = getViewer(ctx, result);

  if (!viewer || ctx.chat?.type !== "private") {
    await sendSpectatorCard(ctx, result, mode);
    return;
  }

  await deliverCanonicalTurnBasedDuelParticipantCard({
    service,
    view: result,
    participant: viewer.participant,
    chatId: BigInt(ctx.chat.id),
    ...(deliveryOptions.allowFallback !== undefined
      ? { allowFallback: deliveryOptions.allowFallback }
      : {}),
    ...(deliveryOptions.presentActive ? { presentActive: deliveryOptions.presentActive } : {}),
    transport: {
      editMessage: async (reference, text, options) => {
        await ctx.api.editMessageText(Number(reference.chatId), reference.messageId, text, options);
      },
      sendInertMessage: async (_chatId, text, options) => {
        const message = await ctx.reply(text, options);
        return message.message_id ?? null;
      }
    }
  });
}

export async function showCanonicalTurnBasedDuelResultCard(
  ctx: Context,
  result: Extract<TurnBasedDuelCardView, { state: "resolved" }>,
  session: DuelCombatSessionRecord,
  service: DuelChallengeService,
  mode: "reply" | "edit"
): Promise<void> {
  const participant = getResolvedViewerParticipant(ctx, result);
  if (!participant || ctx.chat?.type !== "private") {
    const card = buildCard(result, null);
    if (mode === "edit") {
      await safeEditMessageText(ctx, card.text, card.options);
    } else {
      await ctx.reply(card.text, card.options);
    }
    return;
  }

  await deliverCanonicalTurnBasedDuelParticipantCard({
    service,
    view: result,
    session,
    participant,
    chatId: BigInt(ctx.chat.id),
    transport: {
      editMessage: async (reference, text, options) => {
        await ctx.api.editMessageText(Number(reference.chatId), reference.messageId, text, options);
      },
      sendInertMessage: async (_chatId, text, options) => {
        const message = await ctx.reply(text, options);
        return message.message_id ?? null;
      }
    }
  });
}

export function getTurnBasedDuelParticipantReference(
  session: DuelCombatSessionRecord | null,
  participant: TurnBasedDuelParticipant
): TurnBasedDuelMessageReference | null {
  if (!session) {
    return null;
  }

  const chatId = participant === "challenger" ? session.challengerChatId : session.targetChatId;
  const messageId = participant === "challenger" ? session.challengerMessageId : session.targetMessageId;
  return chatId != null && messageId != null ? { chatId, messageId } : null;
}

function getViewer(
  ctx: Context,
  result: ActiveTurnBasedDuel
): { participant: TurnBasedDuelParticipant } | null {
  const telegramUserId = ctx.from?.id ? BigInt(ctx.from.id) : null;
  if (!telegramUserId) {
    return null;
  }

  if (result.challenge.challenger.telegramUserId === telegramUserId) {
    return { participant: "challenger" };
  }

  if (result.challenge.target?.telegramUserId === telegramUserId) {
    return { participant: "target" };
  }

  return null;
}

function getResolvedViewerParticipant(
  ctx: Context,
  result: Extract<TurnBasedDuelCardView, { state: "resolved" }>
): TurnBasedDuelParticipant | null {
  const telegramUserId = ctx.from?.id ? BigInt(ctx.from.id) : null;
  if (!telegramUserId) {
    return null;
  }

  if (result.challenge.challenger.telegramUserId === telegramUserId) {
    return "challenger";
  }

  return result.challenge.target?.telegramUserId === telegramUserId ? "target" : null;
}

async function sendSpectatorCard(
  ctx: Context,
  result: ActiveTurnBasedDuel,
  mode: "reply" | "edit"
): Promise<void> {
  const card = buildCard(result, null);
  if (mode === "edit") {
    await safeEditMessageText(ctx, card.text, card.options);
    return;
  }

  await ctx.reply(card.text, card.options);
}

function buildCard(
  result: TurnBasedDuelCardView,
  participant: TurnBasedDuelParticipant | null,
  presentActive?: (view: ActiveTurnBasedDuel, viewerCharacterId: string) => string
): { text: string; options: MessageOptions } {
  if (result.state === "resolved") {
    return {
      text: presentDuelView(result),
      options: {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildDuelResultKeyboard(result.challenge.inviteToken, result.challenge.mode)
      }
    };
  }

  const viewerCharacterId = participant === "challenger"
    ? result.session.challengerCharacterId
    : participant === "target"
      ? result.session.targetCharacterId
      : null;
  const skillParticipant = viewerCharacterId === result.session.targetCharacterId
    ? result.session.state.participants.target
    : result.session.state.participants.challenger;
  const skill = getCombatSkillDisplay(getCombatSkillProfile(skillParticipant.combatStats.classId).id);

  return {
    text: viewerCharacterId && presentActive
      ? presentActive(result, viewerCharacterId)
      : presentTurnBasedDuel(result, { viewerCharacterId }),
    options: {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildTurnBasedDuelKeyboard(
        result,
        viewerCharacterId,
        `${skill.icon} ${skill.name}`
      )
    }
  };
}
