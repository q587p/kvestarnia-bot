import type { Bot } from "grammy";
import type { TavernRaidResult, TavernRaidService } from "../services/tavernRaidService";
import { buildTavernResultKeyboard } from "./keyboards/tavernKeyboard";
import { presentLevelUpCelebration } from "./presenters/levelGrowthPresenter";
import { presentTavernRaidResult } from "./presenters/tavernPresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

type TimerHandle = ReturnType<typeof setTimeout>;
type TimerFactory = (handler: () => void, delayMs: number) => TimerHandle;
type TimerState = {
  timer: TimerHandle;
};

const DEFAULT_RETRY_DELAY_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export interface BarrelRaidCompletionScheduleInput {
  bot: Bot;
  chatId: number | undefined;
  telegramUserId: bigint;
  periodId: string;
  availableAt: Date;
  now: Date;
  tavernRaidService: Pick<TavernRaidService, "completeFridayBarrelRaid">;
}

export interface BarrelRaidCompletionScheduler {
  schedule(input: BarrelRaidCompletionScheduleInput): boolean;
  pendingCount(): number;
  has(input: Pick<BarrelRaidCompletionScheduleInput, "chatId" | "telegramUserId" | "periodId">): boolean;
}

interface BarrelRaidCompletionSchedulerOptions {
  setTimeout?: TimerFactory;
  retryDelayMs?: number;
  maxAttempts?: number;
  logger?: Pick<Console, "error">;
}

export function createBarrelRaidCompletionScheduler(
  options: BarrelRaidCompletionSchedulerOptions = {}
): BarrelRaidCompletionScheduler {
  const timers = new Map<string, TimerState>();
  const setTimer = options.setTimeout;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const logger = options.logger ?? console;

  async function sendCompletion(
    input: BarrelRaidCompletionScheduleInput,
    key: string,
    chatId: number,
    attempt: number
  ): Promise<void> {
    try {
      const completed = await input.tavernRaidService.completeFridayBarrelRaid(
        input.telegramUserId,
        input.periodId
      );

      if (completed.state !== "completed") {
        timers.delete(key);
        return;
      }

      await sendCompletedResult(input, key, chatId, completed, 1);
    } catch (error) {
      logger.error("Квестарня: не вдалося надіслати завершення рейду.", error);
      if (attempt >= maxAttempts) {
        timers.delete(key);
        return;
      }

      const retryTimer = (setTimer ?? setTimeout)(() => {
        void sendCompletion(input, key, chatId, attempt + 1);
      }, retryDelayMs);

      retryTimer.unref?.();
      timers.set(key, { timer: retryTimer });
    }
  }

  async function sendCompletedResult(
    input: BarrelRaidCompletionScheduleInput,
    key: string,
    chatId: number,
    completed: Extract<TavernRaidResult, { state: "completed" }>,
    attempt: number
  ): Promise<void> {
    try {
      await input.bot.api.sendMessage(chatId, presentTavernRaidResult(completed), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildTavernResultKeyboard(completed.state)
      });

      try {
        await sendLevelUpCelebrationToChat(input.bot, chatId, completed);
      } catch (error) {
        logger.error("Квестарня: не вдалося надіслати повідомлення про рівень після рейду.", error);
      }

      timers.delete(key);
    } catch (error) {
      logger.error("Квестарня: не вдалося надіслати завершення рейду.", error);
      if (attempt >= maxAttempts) {
        timers.delete(key);
        return;
      }

      const retryTimer = (setTimer ?? setTimeout)(() => {
        void sendCompletedResult(input, key, chatId, completed, attempt + 1);
      }, retryDelayMs);

      retryTimer.unref?.();
      timers.set(key, { timer: retryTimer });
    }
  }

  return {
    schedule(input) {
      if (input.chatId === undefined) {
        return false;
      }

      const chatId = input.chatId;
      const key = buildBarrelRaidCompletionKey(input);

      if (timers.has(key)) {
        return false;
      }

      const delayMs = Math.max(0, input.availableAt.getTime() - input.now.getTime());
      const timer = (setTimer ?? setTimeout)(() => {
        void sendCompletion(input, key, chatId, 1);
      }, delayMs);

      timer.unref?.();
      timers.set(key, { timer });
      return true;
    },
    pendingCount() {
      return timers.size;
    },
    has(input) {
      if (input.chatId === undefined) {
        return false;
      }

      return timers.has(buildBarrelRaidCompletionKey(input));
    }
  };
}

export function buildBarrelRaidCompletionKey(
  input: Pick<BarrelRaidCompletionScheduleInput, "chatId" | "telegramUserId" | "periodId">
): string {
  return `${input.chatId}:${input.telegramUserId.toString()}:${input.periodId}`;
}

async function sendLevelUpCelebrationToChat(
  bot: Bot,
  chatId: number,
  result: Extract<TavernRaidResult, { state: "completed" }>
): Promise<void> {
  const text = presentLevelUpCelebration(result.levelChange, result.character.classId);

  if (!text) {
    return;
  }

  await bot.api.sendMessage(chatId, text, HTML_MESSAGE_OPTIONS);
}
