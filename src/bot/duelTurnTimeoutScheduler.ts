import type { Bot } from "grammy";
import type { DuelChallengeService } from "../services/duelChallengeService";
import { getCombatSkillDisplay } from "../services/fightService";
import { getCombatSkillProfile } from "../domain/combat";
import { buildTurnBasedDuelKeyboard } from "./keyboards/duelKeyboard";
import { presentTurnBasedDuel } from "./presenters/duelPresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function createDuelTurnTimeoutScheduler(
  service: DuelChallengeService,
  bot: Bot,
  options: { intervalMs?: number } = {}
): { start(): void; stop(): void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      return;
    }

    running = true;
    try {
      const due = await service.listDueTurnBasedSessions();

      for (const session of due) {
        const result = await service.resolveDueTurnBasedSession(session);

        if (result.state === "updated") {
          await notifyParticipants(service, bot, result.session);
        }
      }
    } finally {
      running = false;
    }
  };

  return {
    start() {
      if (timer) {
        return;
      }

      void tick().catch((error) => {
        console.error("Квестарня: таймер покрокових дуелей не відпрацював.", error);
      });
      timer = setInterval(() => {
        void tick().catch((error) => {
          console.error("Квестарня: таймер покрокових дуелей не відпрацював.", error);
        });
      }, options.intervalMs ?? 5000);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}

async function notifyParticipants(
  service: DuelChallengeService,
  bot: Bot,
  session: Awaited<ReturnType<DuelChallengeService["listDueTurnBasedSessions"]>>[number]
): Promise<void> {
  const view = await service.getTurnBasedByTokenForTelegramUser(
    session.challenge.challenger.telegramUserId,
    session.challenge.inviteToken
  );

  if (view.state === "not-found") {
    return;
  }

  const actor = view.session.state.actingCharacterId === view.session.state.participants.challenger.characterId
    ? view.session.state.participants.challenger
    : view.session.state.participants.target;
  const skill = getCombatSkillDisplay(getCombatSkillProfile(actor.combatStats.classId).id);
  const text = presentTurnBasedDuel(view);

  await Promise.all([
    notifyParticipant(service, bot, view, "challenger", `${skill.icon} ${skill.name}`, text),
    notifyParticipant(service, bot, view, "target", `${skill.icon} ${skill.name}`, text)
  ]);
}

async function notifyParticipant(
  service: DuelChallengeService,
  bot: Bot,
  view: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>,
  participant: "challenger" | "target",
  skillLabel: string,
  text: string
): Promise<void> {
  const chatId = participant === "challenger"
    ? view.session.challengerChatId ?? view.challenge.challenger.telegramUserId
    : view.session.targetChatId ?? view.challenge.target?.telegramUserId;
  const messageId = participant === "challenger"
    ? view.session.challengerMessageId
    : view.session.targetMessageId;
  const characterId = participant === "challenger"
    ? view.session.challengerCharacterId
    : view.session.targetCharacterId;

  if (!chatId) {
    return;
  }

  const keyboard = buildTurnBasedDuelKeyboard(view, characterId, skillLabel);

  try {
    if (messageId) {
      await bot.api.editMessageText(Number(chatId), messageId, text, {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: keyboard
      });
      return;
    }

    const sent = await bot.api.sendMessage(Number(chatId), text, {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: keyboard
    });
    await service.recordTurnBasedMessageReference(view.session.id, participant, {
      chatId,
      messageId: sent.message_id
    });
  } catch {
    // Delivery is best-effort; the persisted duel state remains canonical.
  }
}
