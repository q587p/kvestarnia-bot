import type { Bot } from "grammy";
import type { GroupCombatSessionRecord } from "../db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../services/groupCombatService";
import type { PartySessionService } from "../services/partySessionService";
import {
  deliverGroupCombatCards,
  deliverGroupCombatSettlementNotifications
} from "./groupCombatCardDelivery";
import { serializePartySessionDelivery } from "./partySessionDeliveryCoordinator";

const DEFAULT_INTERVAL_MS = 5_000;

export function createGroupCombatTimeoutScheduler(
  service: GroupCombatService,
  bot: Bot,
  options: { intervalMs?: number; partySessions?: PartySessionService } = {}
): { start(): void; stop(): Promise<void>; tick(): Promise<number> } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let activeTick: Promise<number> | null = null;

  const tick = async (): Promise<number> => {
    if (activeTick || !service.isEnabled()) {
      return 0;
    }
    const operation = (async () => {
      const started: GroupCombatSessionRecord[] = [];
      const dueParties = service.areDevHelpersEnabled()
        ? await options.partySessions?.listDueRecruitingGroupCombatProof() ?? []
        : [];
      for (const party of dueParties) {
        try {
          const result = await serializePartySessionDelivery(party.inviteToken, () =>
            service.startDueProof(party.inviteToken)
          );
          if ("session" in result) {
            started.push(result.session);
          } else if (
            result.partyVersion !== undefined &&
            (
              result.state === "invalid-size" ||
              result.state === "invalid-life" ||
              result.state === "invalid-roster" ||
              result.state === "blocked"
            )
          ) {
            await options.partySessions?.forceExpireByToken(party.inviteToken, result.partyVersion);
          }
        } catch (error) {
          console.error(`Kvestarnia: skipped failed scheduled GroupCombat start for ${party.inviteToken}.`, error);
        }
      }
      const dueLeftPassageParties = await options.partySessions?.listDueRecruitingLeftPassageParty?.() ?? [];
      for (const party of dueLeftPassageParties) {
        try {
          if (!service.isLeftPassageEntryEnabled()) {
            await options.partySessions?.expireDueLeftPassageParty?.(
              party.inviteToken,
              party.version
            );
            continue;
          }
          const result = await serializePartySessionDelivery(party.inviteToken, () =>
            service.startDueLeftPassage(party.inviteToken)
          );
          if ("session" in result) {
            started.push(result.session);
          } else if (
            result.partyVersion !== undefined &&
            (
              result.state === "invalid-size" ||
              result.state === "invalid-life" ||
              result.state === "invalid-roster" ||
              result.state === "reservation-missing" ||
              result.state === "blocked"
            )
          ) {
            await options.partySessions?.expireDueLeftPassageParty?.(
              party.inviteToken,
              result.partyVersion
            );
          }
        } catch (error) {
          console.error(`Kvestarnia: пропущено невдалий автоматичний старт лівого проходу ${party.inviteToken}.`, error);
        }
      }
      const repairWork = typeof service.repairWithNotices === "function"
        ? await service.repairWithNotices(13)
        : {
            repaired: await service.repair(13),
            settlementNotices: []
          };
      const resolved = typeof service.resolveDueWithNotices === "function"
        ? await service.resolveDueWithNotices(13)
        : (await service.resolveDue(13)).map((session) => ({
            session,
            settlementNotices: []
          }));
      const pending = await service.listPendingDelivery(13);
      const sessions = [...new Map(
        [...started, ...resolved.map((entry) => entry.session), ...pending].map((session) => [session.id, session])
      ).values()];
      for (const session of sessions) {
        await deliverGroupCombatCards(bot.api, service, session);
        const notices = resolved.find((entry) => entry.session.id === session.id)?.settlementNotices ?? [];
        if (notices.length > 0) {
          await deliverGroupCombatSettlementNotifications(bot.api, notices);
        }
      }
      if (repairWork.settlementNotices.length > 0) {
        await deliverGroupCombatSettlementNotifications(bot.api, repairWork.settlementNotices);
      }
      return repairWork.repaired + sessions.length;
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
