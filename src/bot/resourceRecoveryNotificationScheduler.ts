import type { Bot } from "grammy";
import { presentResourceRecoveryNotice } from "./presenters/resourceRecoveryPresenter";
import type { ResourceRecoveryNotificationService } from "../services/resourceRecoveryNotificationService";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function createResourceRecoveryNotificationScheduler(
  service: ResourceRecoveryNotificationService,
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
      const notifications = await service.resolveDueHpFullNotifications(dueOptions);

      for (const notification of notifications) {
        await notifyHpFull(bot, notification.telegramUserId, notification.notice);
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

      void tick().catch(logRecoveryNotificationError);
      timer = setInterval(() => {
        void tick().catch(logRecoveryNotificationError);
      }, options.intervalMs ?? 60_000);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}

async function notifyHpFull(
  bot: Bot,
  telegramUserId: bigint,
  notice: Parameters<typeof presentResourceRecoveryNotice>[0]
): Promise<void> {
  try {
    await bot.api.sendMessage(
      telegramUserId.toString(),
      presentResourceRecoveryNotice(notice),
      HTML_MESSAGE_OPTIONS
    );
  } catch {
    // Telegram delivery is best-effort; resource sync stays persisted and canonical.
  }
}

function logRecoveryNotificationError(error: unknown): void {
  console.error("Квестарня: таймер повідомлень про повне здоров’я не відпрацював.", error);
}
