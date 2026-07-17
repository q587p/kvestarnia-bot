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
  | { state: "retryable-edit-failure" | "fallback-disabled"; reference: TurnBasedDuelMessageReference | null }
  | { state: "candidate-lost"; reference: TurnBasedDuelMessageReference | null }
  | { state: "activation-failed" | "view-changed"; reference: null };

export async function deliverCanonicalTurnBasedDuelParticipantCard(
  input: CanonicalTurnBasedDuelDeliveryInput
): Promise<CanonicalTurnBasedDuelDeliveryResult> {
  const session = input.view.state === "active" ? input.view.session : input.session;
  if (!session) {
    return { state: "view-changed", reference: null };
  }

  const initialCard = buildCard(input.view, input.participant, input.presentActive);
  const existingReference = getTurnBasedDuelParticipantReference(session, input.participant);

  if (existingReference && existingReference.chatId === input.chatId) {
    try {
      await input.transport.editMessage(existingReference, initialCard.text, initialCard.options);
      return { state: "edited", reference: existingReference };
    } catch (error) {
      if (isMessageNotModifiedError(error)) {
        return { state: "unchanged", reference: existingReference };
      }

      if (!isMessageUnavailableForEditError(error)) {
        return { state: "retryable-edit-failure", reference: existingReference };
      }
    }
  }

  if (input.allowFallback === false) {
    return { state: "fallback-disabled", reference: existingReference };
  }

  const candidateMessageId = await input.transport.sendInertMessage(
    input.chatId,
    initialCard.text,
    {
      ...initialCard.options,
      reply_markup: { inline_keyboard: [] }
    }
  );
  if (!candidateMessageId) {
    return { state: "activation-failed", reference: null };
  }

  const candidate = { chatId: input.chatId, messageId: candidateMessageId };
  const claim = existingReference
    ? await input.service.claimTurnBasedMessageReference(
        session.id,
        input.participant,
        candidate,
        existingReference
      )
    : await input.service.claimTurnBasedMessageReference(
        session.id,
        input.participant,
        candidate
      );
  if (!claim.claimed) {
    return {
      state: "candidate-lost",
      reference: getTurnBasedDuelParticipantReference(claim.session, input.participant)
    };
  }

  let freshView: Awaited<ReturnType<DuelChallengeService["getByToken"]>>;
  try {
    freshView = await input.service.getByToken(input.view.challenge.inviteToken);
  } catch (error) {
    await input.service.releaseTurnBasedMessageReference(session.id, input.participant, candidate);
    throw error;
  }

  if (
    (freshView.state !== "active" && freshView.state !== "resolved") ||
    (freshView.state === "active" && freshView.session.id !== session.id)
  ) {
    await input.service.releaseTurnBasedMessageReference(session.id, input.participant, candidate);
    return { state: "view-changed", reference: null };
  }

  const freshCard = buildCard(freshView, input.participant, input.presentActive);
  try {
    await input.transport.editMessage(candidate, freshCard.text, freshCard.options);
    return { state: "activated", reference: candidate };
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return { state: "activated", reference: candidate };
    }

    await input.service.releaseTurnBasedMessageReference(session.id, input.participant, candidate);
    return { state: "activation-failed", reference: null };
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
