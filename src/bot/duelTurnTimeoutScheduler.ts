import type { Bot } from "grammy";
import type { DuelChallengeService } from "../services/duelChallengeService";
import { presentFightingCornerQuestProgressNotification } from "./presenters/fightingCornerQuestPresenter";
import { deliverCanonicalTurnBasedDuelParticipantCard } from "./turnBasedDuelCardDelivery";

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
          await notifyQuestProgress(bot, result.questProgressUpdates ?? []);
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

async function notifyQuestProgress(
  bot: Bot,
  updates: NonNullable<Extract<Awaited<ReturnType<DuelChallengeService["resolveDueTurnBasedSession"]>>, { state: "updated" }>["questProgressUpdates"]>
): Promise<void> {
  await Promise.all(updates.map(async (update) => {
    try {
      await bot.api.sendMessage(
        Number(update.telegramUserId),
        presentFightingCornerQuestProgressNotification(update),
        HTML_MESSAGE_OPTIONS
      );
    } catch {
      // Quest progress is durable; Telegram delivery remains best-effort.
    }
  }));
}

async function notifyParticipants(
  service: DuelChallengeService,
  bot: Bot,
  session: Awaited<ReturnType<DuelChallengeService["listDueTurnBasedSessions"]>>[number]
): Promise<void> {
  const view = await service.getByToken(session.challenge.inviteToken);

  if (view.state === "not-found") {
    return;
  }

  if (view.state === "active") {
    await Promise.all([
      notifyParticipant(service, bot, view, "challenger"),
      notifyParticipant(service, bot, view, "target")
    ]);
    return;
  }

  if (view.state === "resolved") {
    await Promise.all([
      notifyResolvedParticipant(service, bot, view, session, "challenger"),
      notifyResolvedParticipant(service, bot, view, session, "target")
    ]);
  }
}

async function notifyParticipant(
  service: DuelChallengeService,
  bot: Bot,
  view: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "active" }>,
  participant: "challenger" | "target"
): Promise<void> {
  const telegramUserId = participant === "challenger"
    ? view.challenge.challenger.telegramUserId
    : view.challenge.target?.telegramUserId;
  const storedChatId = participant === "challenger"
    ? view.session.challengerChatId
    : view.session.targetChatId;
  const chatId = getPrivateParticipantChatId(storedChatId, telegramUserId);
  if (!chatId) {
    return;
  }

  try {
    await deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view,
      participant,
      chatId,
      transport: {
        editMessage: async (reference, text, options) => {
          await bot.api.editMessageText(Number(reference.chatId), reference.messageId, text, options);
        },
        sendInertMessage: async (destinationChatId, text, options) => {
          const message = await bot.api.sendMessage(Number(destinationChatId), text, options);
          return message.message_id ?? null;
        }
      }
    });
  } catch {
    // Delivery is best-effort; the persisted duel state remains canonical.
  }
}

async function notifyResolvedParticipant(
  service: DuelChallengeService,
  bot: Bot,
  view: Extract<Awaited<ReturnType<DuelChallengeService["getByToken"]>>, { state: "resolved" }>,
  session: Awaited<ReturnType<DuelChallengeService["listDueTurnBasedSessions"]>>[number],
  participant: "challenger" | "target"
): Promise<void> {
  const telegramUserId = participant === "challenger"
    ? view.challenge.challenger.telegramUserId
    : view.challenge.target?.telegramUserId;
  const storedChatId = participant === "challenger"
    ? session.challengerChatId
    : session.targetChatId;
  const chatId = getPrivateParticipantChatId(storedChatId, telegramUserId);
  if (!chatId) {
    return;
  }

  try {
    await deliverCanonicalTurnBasedDuelParticipantCard({
      service,
      view,
      session,
      participant,
      chatId,
      transport: {
        editMessage: async (reference, text, options) => {
          await bot.api.editMessageText(Number(reference.chatId), reference.messageId, text, options);
        },
        sendInertMessage: async (destinationChatId, text, options) => {
          const message = await bot.api.sendMessage(Number(destinationChatId), text, options);
          return message.message_id ?? null;
        }
      }
    });
  } catch {
    // Delivery is best-effort; the persisted duel state remains canonical.
  }
}

function getPrivateParticipantChatId(
  storedChatId: bigint | null | undefined,
  telegramUserId: bigint | null | undefined
): bigint | null {
  if (!telegramUserId) {
    return null;
  }

  return storedChatId === telegramUserId ? storedChatId : telegramUserId;
}
