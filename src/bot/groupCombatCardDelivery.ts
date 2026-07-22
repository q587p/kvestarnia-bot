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

export async function deliverGroupCombatCards(
  api: Api,
  service: GroupCombatService,
  session: GroupCombatSessionRecord
): Promise<number> {
  const results = await Promise.allSettled(session.participants.map(async (participant) => {
    const text = presentGroupCombat(session, participant.characterId);
    const replyMarkup = buildGroupCombatKeyboard(session, participant.characterId);
    if (participant.chatId !== null && participant.messageId !== null) {
      try {
        await api.editMessageText(
          Number(participant.chatId),
          participant.messageId,
          text,
          { ...HTML_MESSAGE_OPTIONS, reply_markup: replyMarkup }
        );
        return true;
      } catch (error) {
        if (isMessageNotModifiedError(error)) {
          return true;
        }
        if (!isMessageUnavailableForEditError(error)) {
          throw error;
        }
      }
    }

    const chatId = participant.chatId ?? participant.telegramUserId;
    const sent = await api.sendMessage(Number(chatId), text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: replyMarkup
    });
    const claimed = await service.compareAndSetParticipantCard({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedReferenceVersion: participant.referenceVersion,
      chatId,
      messageId: sent.message_id
    });
    if (claimed) {
      return true;
    }

    await api.deleteMessage(Number(chatId), sent.message_id).catch(() => false);
    const canonical = await service.findByToken(session.partyInviteToken);
    const canonicalParticipant = canonical?.participants.find((row) => row.characterId === participant.characterId);
    if (canonical && canonicalParticipant && canonicalParticipant.chatId !== null && canonicalParticipant.messageId !== null) {
      await api.editMessageText(
        Number(canonicalParticipant.chatId),
        canonicalParticipant.messageId,
        presentGroupCombat(canonical, participant.characterId),
        {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildGroupCombatKeyboard(canonical, participant.characterId)
        }
      ).catch((error) => {
        if (!isMessageNotModifiedError(error)) {
          throw error;
        }
      });
    }
    return true;
  }));
  return results.filter((result) => result.status === "fulfilled" && result.value).length;
}
