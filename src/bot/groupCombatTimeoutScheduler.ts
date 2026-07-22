import type { Bot } from "grammy";
import type { GroupCombatService } from "../services/groupCombatService";
import { deliverGroupCombatCards } from "./groupCombatCardDelivery";

const DEFAULT_INTERVAL_MS = 5_000;

export function createGroupCombatTimeoutScheduler(
  service: GroupCombatService,
  bot: Bot,
  options: { intervalMs?: number } = {}
): { start(): void; stop(): Promise<void>; tick(): Promise<number> } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let activeTick: Promise<number> | null = null;

  const tick = async (): Promise<number> => {
    if (activeTick || !service.isEnabled()) {
      return 0;
    }
    const operation = (async () => {
      const repaired = await service.repair(13);
      const sessions = await service.resolveDue(13);
      for (const session of sessions) {
        await deliverGroupCombatCards(bot.api, service, session);
      }
      return repaired + sessions.length;
    })();
    activeTick = operation;
    try {
      return await operation;
    } finally {
      if (activeTick === operation) {
        activeTick = null;
      }
    }
  };

  return {
    start() {
      if (timer || !service.isEnabled()) {
        return;
      }
      timer = setInterval(() => {
        void tick().catch((error) => console.error("Квестарня: таймер доказової сутички перечепився.", error));
      }, options.intervalMs ?? DEFAULT_INTERVAL_MS);
      void tick().catch((error) => console.error("Квестарня: первинна перевірка доказової сутички не спрацювала.", error));
    },
    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await activeTick;
    },
    tick
  };
}
