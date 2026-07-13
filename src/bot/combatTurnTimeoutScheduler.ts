import type { Bot } from "grammy";
import type { FightService, PersistentFightTimeoutResult } from "../services/fightService";
import type {
  TrainingDoppelgangerService,
  TrainingDoppelgangerTimeoutResult
} from "../services/trainingDoppelgangerService";
import type { FightingCornerQuestService } from "../services/fightingCornerQuestService";
import { buildPersistentFightResultKeyboard } from "./keyboards/fightKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "./keyboards/trainingDoppelgangerKeyboard";
import { presentPersistentFightTurn } from "./presenters/fightPresenter";
import { presentTrainingDoppelgangerTurn } from "./presenters/trainingDoppelgangerPresenter";
import { presentFightingCornerQuestProgressNotification } from "./presenters/fightingCornerQuestPresenter";
import { isMessageNotModifiedError } from "./safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function createCombatTurnTimeoutScheduler(
  services: {
    fight: FightService;
    trainingDoppelganger?: TrainingDoppelgangerService;
    fightingCornerQuest?: FightingCornerQuestService;
  },
  bot: Bot,
  options: { intervalMs?: number; limit?: number } = {}
): { start(): void; stop(): void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      return;
    }

    running = true;
    try {
      const dueOptions = options.limit === undefined ? {} : { limit: options.limit };
      const duePersistent = await services.fight.listDuePersistentFightTurns(dueOptions);

      for (const due of duePersistent) {
        const result = await services.fight.resolveDuePersistentFightTurn(due);

        if (result.state !== "skipped") {
          await notifyPersistentFight(services.fight, bot, result);
        }
      }

      if (services.trainingDoppelganger) {
        const dueTraining = await services.trainingDoppelganger.listDueTrainingTurns(dueOptions);

        for (const due of dueTraining) {
          const result = await services.trainingDoppelganger.resolveDueTrainingTurn(due);

          if (result.state !== "skipped") {
            await notifyTrainingFight(services.trainingDoppelganger, bot, result);
            if (services.fightingCornerQuest) {
              const updates = await services.fightingCornerQuest.recordTrainingSessionSafely(
                BigInt(result.telegramUserId),
                result.session
              );
              await notifyTrainingQuestProgress(bot, updates);
            }
          }
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

      void tick().catch(logTimeoutError);
      timer = setInterval(() => {
        void tick().catch(logTimeoutError);
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

async function notifyTrainingQuestProgress(
  bot: Bot,
  updates: Awaited<ReturnType<FightingCornerQuestService["recordTrainingSessionSafely"]>>
): Promise<void> {
  for (const update of updates) {
    try {
      await bot.api.sendMessage(
        Number(update.telegramUserId),
        presentFightingCornerQuestProgressNotification(update),
        HTML_MESSAGE_OPTIONS
      );
    } catch {
      // Quest progress is durable; Telegram delivery remains best-effort.
    }
  }
}

async function notifyPersistentFight(
  service: FightService,
  bot: Bot,
  result: Exclude<PersistentFightTimeoutResult, { state: "skipped" }>
): Promise<void> {
  const reference = result.session.state?.message;

  if (!reference) {
    return;
  }

  try {
    const deliveredMessageId = await editOrSend(bot, {
      chatId: reference.chatId,
      messageId: reference.messageId,
      text: presentPersistentFightTurn(result),
      options: {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightResultKeyboard(result.session, result.character)
      }
    });

    if (deliveredMessageId !== reference.messageId) {
      await service.recordPersistentFightMessageReference(result.telegramUserId, result.session.id, {
        chatId: reference.chatId,
        messageId: deliveredMessageId
      });
    }
  } catch {
    // Telegram delivery is best-effort; the persisted combat state remains canonical.
  }
}

async function notifyTrainingFight(
  service: TrainingDoppelgangerService,
  bot: Bot,
  result: Exclude<TrainingDoppelgangerTimeoutResult, { state: "skipped" }>
): Promise<void> {
  const reference = result.session.state?.message;

  if (!reference) {
    return;
  }

  try {
    const deliveredMessageId = await editOrSend(bot, {
      chatId: reference.chatId,
      messageId: reference.messageId,
      text: presentTrainingDoppelgangerTurn(result),
      options: {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildTrainingDoppelgangerKeyboard(result.session, result.character)
      }
    });

    if (deliveredMessageId !== reference.messageId) {
      await service.recordTrainingDoppelgangerMessageReference(result.telegramUserId, result.session.id, {
        chatId: reference.chatId,
        messageId: deliveredMessageId
      });
    }
  } catch {
    // Telegram delivery is best-effort; the persisted combat state remains canonical.
  }
}

async function editOrSend(
  bot: Bot,
  input: {
    chatId: string;
    messageId: number;
    text: string;
    options: Parameters<Bot["api"]["editMessageText"]>[3];
  }
): Promise<number> {
  try {
    await bot.api.editMessageText(input.chatId, input.messageId, input.text, input.options);
    return input.messageId;
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return input.messageId;
    }
  }

  const sent = await bot.api.sendMessage(input.chatId, input.text, input.options);

  return sent.message_id;
}

function logTimeoutError(error: unknown): void {
  console.error("Квестарня: таймер бойових ходів не відпрацював.", error);
}
