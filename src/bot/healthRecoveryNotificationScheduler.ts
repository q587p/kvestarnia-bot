import type { Bot } from "grammy";
import type { HealthRecoveryNotificationService } from "../services/healthRecoveryNotificationService";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function createHealthRecoveryNotificationScheduler(
  healthRecoveryNotifications: Pick<HealthRecoveryNotificationService, "listDueHpFullNotifications">,
  bot: Bot,
  options: { intervalMs?: number; limit?: number } = {}
): { start(): void; stop(): void; tick(): Promise<number> } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<number> => {
    if (running) {
      return 0;
    }

    running = true;
    try {
      const now = new Date();
      const due = await healthRecoveryNotifications.listDueHpFullNotifications(now, {
        limit: options.limit ?? 50
      });
      let sent = 0;

      for (const notification of due) {
        try {
          await bot.api.sendMessage(
            notification.telegramUserId.toString(),
            presentHealthRecoveryNotification(),
            HTML_MESSAGE_OPTIONS
          );
          sent += 1;
        } catch (error) {
          console.error("Квестарня: повідомлення про повне здоров'я не відправилося.", error);
        }
      }

      return sent;
    } finally {
      running = false;
    }
  };

  return {
    start() {
      if (timer) {
        return;
      }

      void tick().catch(logHealthRecoverySchedulerError);
      timer = setInterval(() => {
        void tick().catch(logHealthRecoverySchedulerError);
      }, options.intervalMs ?? 5000);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    tick
  };
}

export function presentHealthRecoveryNotification(): string {
  return [
    "❤️ Здоров'я відновилося повністю.",
    "",
    "Організм подав заявку на продовження пригод і сам її погодив."
  ].join("\n");
}

function logHealthRecoverySchedulerError(error: unknown): void {
  console.error("Квестарня: таймер повідомлень про здоров'я не відпрацював.", error);
}
