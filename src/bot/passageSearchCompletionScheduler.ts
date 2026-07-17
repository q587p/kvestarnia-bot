import type { Bot } from "grammy";
import type { FightService } from "../services/fightService";
import type {
  PassageSearchCheckResult,
  PassageSearchService
} from "../services/passageSearchService";
import { buildPersistentFightResultKeyboard } from "./keyboards/fightKeyboard";
import { presentPersistentFight, presentPersistentFightIntro } from "./presenters/fightPresenter";
import { presentPassageSearch } from "./presenters/passageSearchPresenter";
import { presentAchievementUnlockNotification } from "./presenters/achievementPresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function createPassageSearchCompletionScheduler(
  services: {
    passageSearch: PassageSearchService;
    fight: FightService;
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
      const dueSearches = await services.passageSearch.listDueRunningSearches(
        options.limit === undefined ? {} : { limit: options.limit }
      );

      for (const due of dueSearches) {
        const chatId = due.action.payload.notification?.chatId;
        if (!chatId) {
          continue;
        }

        const result = await services.passageSearch.resolveDueSearch(
          due.telegramUserId,
          due.action.token
        );

        await notifySearchCompletion(services.fight, bot, due.telegramUserId, chatId, result);
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

      void tick().catch(logSearchCompletionError);
      timer = setInterval(() => {
        void tick().catch(logSearchCompletionError);
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

async function notifySearchCompletion(
  fight: FightService,
  bot: Bot,
  telegramUserId: bigint,
  chatId: string,
  result: PassageSearchCheckResult
): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, presentPassageSearch(result), HTML_MESSAGE_OPTIONS);

    if (result.state === "completed") {
      const achievementText = presentAchievementUnlockNotification(result.achievementUnlocks);
      if (achievementText) {
        await bot.api.sendMessage(chatId, achievementText, HTML_MESSAGE_OPTIONS);
      }
    }

    if (result.state === "monster-attack") {
      await sendPassageAttackFightCard(fight, bot, telegramUserId, chatId, result);
    }
  } catch (error) {
    console.error("Квестарня: завершення пошуку не відправилось.", error);
  }
}

async function sendPassageAttackFightCard(
  fight: FightService,
  bot: Bot,
  telegramUserId: bigint,
  chatId: string,
  result: Extract<PassageSearchCheckResult, { state: "monster-attack" }>
): Promise<void> {
  if (result.fight.state !== "persistent-active" && result.fight.state !== "persistent-terminal") {
    return;
  }

  if (result.fight.state === "persistent-active" && result.fight.started) {
    await bot.api.sendMessage(chatId, presentPersistentFightIntro(result.fight), HTML_MESSAGE_OPTIONS);
  }

  const sent = await bot.api.sendMessage(chatId, presentPersistentFight(result.fight), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildPersistentFightResultKeyboard(result.fight.session, result.fight.character)
  });

  if (result.fight.state === "persistent-active") {
    await fight.recordPersistentFightMessageReference(telegramUserId, result.fight.session.id, {
      chatId,
      messageId: sent.message_id
    });
  }
}

function logSearchCompletionError(error: unknown): void {
  console.error("Квестарня: таймер пошуку не відпрацював.", error);
}
