import type { Context } from "grammy";
import type { DuelChallengeService, DuelChallengeView } from "../services/duelChallengeService";
import { getCombatSkillProfile } from "../domain/combat";
import { getCombatSkillDisplay } from "../services/fightService";
import { buildTurnBasedDuelKeyboard } from "./keyboards/duelKeyboard";
import { presentTurnBasedDuel } from "./presenters/duelPresenter";
import { isMessageNotModifiedError, safeEditMessageText } from "./safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

type ActiveTurnBasedDuel = Extract<DuelChallengeView, { state: "active" }>;
type ParticipantName = "challenger" | "target";

export async function showCanonicalTurnBasedDuelCard(
  ctx: Context,
  result: ActiveTurnBasedDuel,
  service: DuelChallengeService,
  mode: "reply" | "edit",
  deliveryOptions: { allowFallback?: boolean } = {}
): Promise<void> {
  const viewer = getViewer(ctx, result);

  if (!viewer || ctx.chat?.type !== "private") {
    await sendSpectatorCard(ctx, result, mode);
    return;
  }

  const reference = getReference(result, viewer.participant);
  let expectedReference: { chatId: bigint; messageId: number } | undefined;
  if (hasReference(reference)) {
    if (reference.chatId === BigInt(ctx.chat.id) && await refreshReference(ctx, result, viewer.characterId, reference)) {
      return;
    }
    expectedReference = reference;
  }

  if (deliveryOptions.allowFallback === false) {
    return;
  }

  const [text, options] = buildCard(result, viewer.characterId);
  const message = await ctx.reply(text, {
    ...options,
    reply_markup: { inline_keyboard: [] }
  });
  if (!ctx.chat?.id || !message.message_id) {
    return;
  }

  const candidate = {
    chatId: BigInt(ctx.chat.id),
    messageId: message.message_id
  };
  const claim = expectedReference
    ? await service.claimTurnBasedMessageReference(
        result.session.id,
        viewer.participant,
        candidate,
        expectedReference
      )
    : await service.claimTurnBasedMessageReference(
        result.session.id,
        viewer.participant,
        candidate
      );

  if (claim.claimed) {
    setReference(result, viewer.participant, candidate);
    await refreshReference(ctx, result, viewer.characterId, candidate);
    return;
  }

  if (!claim.session) {
    return;
  }

  const canonicalResult = { ...result, session: claim.session };
  const canonicalReference = getReference(canonicalResult, viewer.participant);
  if (hasReference(canonicalReference) && canonicalReference.chatId === candidate.chatId) {
    await refreshReference(ctx, canonicalResult, viewer.characterId, canonicalReference);
  }
}

function getViewer(
  ctx: Context,
  result: ActiveTurnBasedDuel
): { participant: ParticipantName; characterId: string } | null {
  const telegramUserId = ctx.from?.id ? BigInt(ctx.from.id) : null;
  if (!telegramUserId) {
    return null;
  }

  if (result.challenge.challenger.telegramUserId === telegramUserId) {
    return { participant: "challenger", characterId: result.session.challengerCharacterId };
  }

  if (result.challenge.target?.telegramUserId === telegramUserId) {
    return { participant: "target", characterId: result.session.targetCharacterId };
  }

  return null;
}

function getReference(
  result: ActiveTurnBasedDuel,
  participant: ParticipantName
): { chatId: bigint | null; messageId: number | null } {
  return participant === "challenger"
    ? {
        chatId: result.session.challengerChatId,
        messageId: result.session.challengerMessageId
      }
    : {
        chatId: result.session.targetChatId,
        messageId: result.session.targetMessageId
      };
}

function hasReference(
  reference: { chatId: bigint | null; messageId: number | null }
): reference is { chatId: bigint; messageId: number } {
  return reference.chatId !== null && reference.messageId !== null;
}

function setReference(
  result: ActiveTurnBasedDuel,
  participant: ParticipantName,
  reference: { chatId: bigint; messageId: number }
): void {
  if (participant === "challenger") {
    result.session.challengerChatId = reference.chatId;
    result.session.challengerMessageId = reference.messageId;
    return;
  }

  result.session.targetChatId = reference.chatId;
  result.session.targetMessageId = reference.messageId;
}

async function refreshReference(
  ctx: Context,
  result: ActiveTurnBasedDuel,
  viewerCharacterId: string,
  reference: { chatId: bigint; messageId: number }
): Promise<boolean> {
  try {
    await ctx.api.editMessageText(
      Number(reference.chatId),
      reference.messageId,
      ...buildCard(result, viewerCharacterId)
    );
    return true;
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return true;
    }

    return false;
  }
}

async function sendSpectatorCard(
  ctx: Context,
  result: ActiveTurnBasedDuel,
  mode: "reply" | "edit"
): Promise<void> {
  const card = buildCard(result, null);
  if (mode === "edit") {
    await safeEditMessageText(ctx, ...card);
    return;
  }

  await ctx.reply(...card);
}

function buildCard(
  result: ActiveTurnBasedDuel,
  viewerCharacterId: string | null
): [string, {
  parse_mode: "HTML";
  reply_markup: ReturnType<typeof buildTurnBasedDuelKeyboard>;
}] {
  const participant = viewerCharacterId === result.session.targetCharacterId
    ? result.session.state.participants.target
    : result.session.state.participants.challenger;
  const skill = getCombatSkillDisplay(getCombatSkillProfile(participant.combatStats.classId).id);

  return [
    presentTurnBasedDuel(result, { viewerCharacterId }),
    {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildTurnBasedDuelKeyboard(
        result,
        viewerCharacterId,
        `${skill.icon} ${skill.name}`
      )
    }
  ];
}
