import type { Bot } from "grammy";
import { items } from "../content";
import type { EquipmentService } from "../services/equipmentService";
import { presentItemEffect } from "./presenters/itemEffectPresenter";
import { presentEquipmentAttunementComplete } from "./presenters/equipmentPresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function createEquipmentAttunementScheduler(
  equipment: Pick<EquipmentService, "listDueAttunementNotifications" | "markAttunementNotified">,
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
      const due = await equipment.listDueAttunementNotifications(now, {
        limit: options.limit ?? 50
      });
      let sent = 0;

      for (const notification of due) {
        const item = items.find((candidate) => candidate.id === notification.itemId);
        const text = presentEquipmentAttunementComplete({
          itemName: item?.name ?? notification.itemName,
          effect: presentItemEffect(item && "effect" in item ? item.effect : undefined)
        });

        try {
          await bot.api.sendMessage(notification.telegramUserId.toString(), text, HTML_MESSAGE_OPTIONS);
          if (await equipment.markAttunementNotified(notification.actionId, now)) {
            sent += 1;
          }
        } catch (error) {
          console.error("Квестарня: повідомлення про налаштування манатки не відправилось.", error);
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

      void tick().catch(logAttunementSchedulerError);
      timer = setInterval(() => {
        void tick().catch(logAttunementSchedulerError);
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

function logAttunementSchedulerError(error: unknown): void {
  console.error("Квестарня: таймер налаштування манаток не відпрацював.", error);
}
