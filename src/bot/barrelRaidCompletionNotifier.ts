import type { Bot } from "grammy";
import type {
  BarrelRaidNotificationRecord,
  BarrelRaidNotificationRepository
} from "../db/repositories/barrelRaidNotificationRepository";
import type { BarrelBeerTutorialService } from "../services/barrelBeerTutorialService";
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
const DEFAULT_PROCESSING_LEASE_MS = 10 * 60_000;

export interface BarrelRaidCompletionScheduleInput {
  bot: Bot;
  chatId: number | undefined;
  telegramUserId: bigint;
  periodId: string;
  availableAt: Date;
  now: Date;
  tavernRaidService: Pick<TavernRaidService, "completeFridayBarrelRaid">;
  barrelBeerTutorialService?: Pick<
    BarrelBeerTutorialService,
    "markVisitedBarrelForTelegramUser" | "markBarrelRaidCompletedForTelegramUser"
  >;
  notifications?: BarrelRaidNotificationRepository;
  notificationId?: string;
}

export interface BarrelRaidCompletionScheduler {
  schedule(input: BarrelRaidCompletionScheduleInput): boolean;
  resumePending(input: {
    bot: Bot;
    now: Date;
    tavernRaidService: Pick<TavernRaidService, "completeFridayBarrelRaid">;
    barrelBeerTutorialService?: Pick<
      BarrelBeerTutorialService,
      "markVisitedBarrelForTelegramUser" | "markBarrelRaidCompletedForTelegramUser"
    >;
    notifications: BarrelRaidNotificationRepository;
  }): Promise<number>;
  pendingCount(): number;
  has(input: Pick<BarrelRaidCompletionScheduleInput, "chatId" | "telegramUserId" | "periodId">): boolean;
}

interface BarrelRaidCompletionSchedulerOptions {
  setTimeout?: TimerFactory;
  retryDelayMs?: number;
  maxAttempts?: number;
  processingLeaseMs?: number;
  logger?: Pick<Console, "error">;
}

export function createBarrelRaidCompletionScheduler(
  options: BarrelRaidCompletionSchedulerOptions = {}
): BarrelRaidCompletionScheduler {
  const timers = new Map<string, TimerState>();
  const setTimer = options.setTimeout;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const processingLeaseMs = options.processingLeaseMs ?? DEFAULT_PROCESSING_LEASE_MS;
  const logger = options.logger ?? console;

  async function sendCompletion(
    input: BarrelRaidCompletionScheduleInput,
    key: string,
    chatId: number,
    attempt: number
  ): Promise<void> {
    const now = new Date();
    const notification =
      input.notifications && input.notificationId
        ? await input.notifications.claimForProcessing(input.notificationId, {
            now,
            processingStaleBefore: getProcessingStaleBefore(now)
          })
        : null;

    if (input.notifications && input.notificationId && !notification) {
      timers.delete(key);
      return;
    }

    try {
      const completed = await input.tavernRaidService.completeFridayBarrelRaid(
        input.telegramUserId,
        input.periodId
      );

      if (completed.state === "already-completed" && notification?.rewardClaimedAt) {
        await sendCompletedResult(input, key, chatId, asNotificationCompletedResult(completed), 1, notification);
        return;
      }

      if (completed.state !== "completed") {
        if (notification && input.notifications) {
          await input.notifications.markSkipped(notification.id, new Date(), completed.state);
        }
        timers.delete(key);
        return;
      }

      const rewardClaimedNotification =
        notification && input.notifications
          ? await input.notifications.markRewardClaimed(notification.id, new Date())
          : notification;

      if (notification && input.notifications && !rewardClaimedNotification) {
        timers.delete(key);
        return;
      }

      await sendCompletedResult(input, key, chatId, completed, 1, rewardClaimedNotification);
    } catch (error) {
      logger.error("Квестарня: не вдалося надіслати завершення рейду.", error);
      if (attempt >= maxAttempts) {
        if (notification && input.notifications) {
          await input.notifications.markPendingAfterFailure(
            notification.id,
            new Date(),
            stringifyError(error)
          );
        }
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
    attempt: number,
    notification: BarrelRaidNotificationRecord | null
  ): Promise<void> {
    try {
      await input.barrelBeerTutorialService?.markVisitedBarrelForTelegramUser(input.telegramUserId);
      await input.barrelBeerTutorialService?.markBarrelRaidCompletedForTelegramUser(
        input.telegramUserId
      );

      await input.bot.api.sendMessage(chatId, presentTavernRaidResult(completed), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildTavernResultKeyboard(completed.state)
      });

      if (notification && input.notifications) {
        await input.notifications.markSent(notification.id, new Date());
      }

      try {
        await sendLevelUpCelebrationToChat(input.bot, chatId, completed);
      } catch (error) {
        logger.error("Квестарня: не вдалося надіслати повідомлення про рівень після рейду.", error);
      }

      timers.delete(key);
    } catch (error) {
      logger.error("Квестарня: не вдалося надіслати завершення рейду.", error);
      if (attempt >= maxAttempts) {
        if (notification && input.notifications) {
          await input.notifications.markPendingAfterFailure(
            notification.id,
            new Date(),
            stringifyError(error)
          );
        }
        timers.delete(key);
        return;
      }

      const retryTimer = (setTimer ?? setTimeout)(() => {
        void sendCompletedResult(input, key, chatId, completed, attempt + 1, notification);
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
    async resumePending(input) {
      const pending = await input.notifications.listResumable({
        now: input.now,
        processingStaleBefore: getProcessingStaleBefore(input.now)
      });
      let scheduled = 0;

      for (const notification of pending) {
        const didSchedule = this.schedule({
          bot: input.bot,
          chatId: bigIntToSafeNumber(notification.chatId),
          telegramUserId: notification.telegramUserId,
          periodId: notification.periodId,
          availableAt: notification.availableAt,
          now: input.now,
          tavernRaidService: input.tavernRaidService,
          ...(input.barrelBeerTutorialService
            ? { barrelBeerTutorialService: input.barrelBeerTutorialService }
            : {}),
          notifications: input.notifications,
          notificationId: notification.id
        });

        if (didSchedule) {
          scheduled += 1;
        }
      }

      return scheduled;
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

  function getProcessingStaleBefore(now: Date): Date {
    return new Date(now.getTime() - processingLeaseMs);
  }
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
  const text = presentLevelUpCelebration(result.levelChange, result.character.classId, {
    raceId: result.character.raceId,
    path: result.character.path
  });

  if (!text) {
    return;
  }

  await bot.api.sendMessage(chatId, text, HTML_MESSAGE_OPTIONS);
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function bigIntToSafeNumber(value: bigint): number | undefined {
  const numberValue = Number(value);

  return Number.isSafeInteger(numberValue) ? numberValue : undefined;
}

function asNotificationCompletedResult(
  result: Extract<TavernRaidResult, { state: "already-completed" }>
): Extract<TavernRaidResult, { state: "completed" }> {
  return {
    state: "completed",
    character: result.character,
    reward: result.reward,
    levelChange: {
      oldLevel: result.character.level,
      newLevel: result.character.level,
      leveledUp: false
    }
  };
}
