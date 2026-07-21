import type { Bot } from "grammy";
import type { PartyBossService } from "../services/partyBossService";
import type { PartyRaidChatService } from "../services/partyRaidChatService";
import type { PartySessionService } from "../services/partySessionService";
import { buildPartyBossKeyboard } from "./keyboards/partySessionKeyboard";
import { presentAchievementUnlockNotification } from "./presenters/achievementPresenter";
import {
  presentPartyBoss,
  presentPartyBossIntro
} from "./presenters/partySessionPresenter";
import { serializePartySessionDelivery } from "./partySessionDeliveryCoordinator";
import { deliverTerminalIneligiblePartyCards } from "./partyTerminalIneligibleDelivery";
import { partyRaidChatTelegramGate } from "./partyRaidChatTelegramGate";

const DEFAULT_INTERVAL_MS = 10_000;

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function createPartyBossRecruitingStartScheduler(
  services: {
    partySessions: PartySessionService;
    partyBoss: PartyBossService;
    partyRaidChat?: PartyRaidChatService | undefined;
  },
  bot: Bot,
  options: { intervalMs?: number } = {}
): { start(): void; stop(): void; tick(): Promise<number> } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<number> => {
    if (running) {
      return 0;
    }

    running = true;
    try {
      let processed = 0;

      if (services.partySessions.isBigBarrelBrotherEnabled()) {
        const due = await services.partySessions.listDueRecruitingBigBarrelBrother();

        for (const party of due) {
          const result = await serializePartySessionDelivery(party.inviteToken, () =>
            services.partyBoss.startFromPartyForTelegramUser(
              party.leader.telegramUserId,
              party.inviteToken,
              { allowExpiredRecruiting: true }
            )
          );

          if (result.state === "terminal-ineligible") {
            processed += 1;
            await deliverTerminalIneligiblePartyCards(
              bot.api,
              services.partySessions,
              party.inviteToken
            );
            continue;
          }

          if (!("session" in result) || result.state !== "started") {
            continue;
          }

          processed += 1;
          await notifyParticipants(bot, services.partyBoss, result.session, "started", undefined, services.partyRaidChat);
        }
      }

      const dueTurns = await services.partyBoss.listDueTimedOutSessions();
      for (const session of dueTurns) {
        const result = await services.partyBoss.resolveDueTimedOutByToken(session.partyInviteToken);

        if (result.state !== "resolved") {
          continue;
        }

        processed += 1;
        await notifyParticipants(
          bot,
          services.partyBoss,
          result.session,
          result.session.status === "active" ? "timeout" : "terminal",
          result.achievementUnlocksByCharacterId,
          services.partyRaidChat
        );
      }

      return processed;
    } finally {
      running = false;
    }
  };

  return {
    start() {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        void tick().catch((error) => {
          console.error("Квестарня: автозапуск рейду Старшого Брата Бочки не спрацював.", error);
        });
      }, options.intervalMs ?? DEFAULT_INTERVAL_MS);
      void tick().catch((error) => {
        console.error("Квестарня: первинна перевірка автозапуску рейду не спрацювала.", error);
      });
    },
    stop() {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = null;
    },
    tick
  };
}

async function notifyParticipants(
  bot: Bot,
  partyBoss: PartyBossService,
  session: Parameters<typeof buildPartyBossKeyboard>[0],
  reason: "started" | "timeout" | "terminal",
  achievementUnlocksByCharacterId?: Record<string, Parameters<typeof presentAchievementUnlockNotification>[0]>,
  partyRaidChat?: PartyRaidChatService
): Promise<void> {
  await Promise.allSettled(session.participants.map(async (participant) => {
    if (reason === "started") {
      const sendIntro = () => bot.api.sendMessage(
        Number(participant.telegramUserId),
        presentPartyBossIntro(session, participant.id),
        HTML_MESSAGE_OPTIONS
      );
      await (partyRaidChat?.isEnabled()
        ? partyRaidChatTelegramGate.enqueue(participant.telegramUserId, sendIntro)
        : sendIntro());
    }

    const includeCombatItems = await resolvePartyBossCombatItemShortcut(
      partyBoss,
      participant.telegramUserId,
      session
    );
    const sendBoss = () => bot.api.sendMessage(
      Number(participant.telegramUserId),
      presentPartyBoss(session, {
        viewerCharacterId: participant.id,
        notice: presentNotificationNotice(reason)
      }),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPartyBossKeyboard(session, participant.id, {
          includeCombatItems,
          includeRaidChat: partyRaidChat?.isEnabled() === true
        })
      }
    );
    await (partyRaidChat?.isEnabled()
      ? partyRaidChatTelegramGate.enqueue(participant.telegramUserId, sendBoss)
      : sendBoss());
    const achievementText = presentAchievementUnlockNotification(
      achievementUnlocksByCharacterId?.[participant.id] ?? []
    );
    if (achievementText) {
      await bot.api.sendMessage(Number(participant.telegramUserId), achievementText, HTML_MESSAGE_OPTIONS);
    }
  }));
}

async function resolvePartyBossCombatItemShortcut(
  partyBoss: PartyBossService,
  telegramUserId: bigint,
  session: Parameters<typeof buildPartyBossKeyboard>[0]
): Promise<boolean | undefined> {
  if (session.status !== "active") {
    return undefined;
  }

  return partyBoss.hasCombatItemsForTelegramUser(
    telegramUserId,
    session.partyInviteToken,
    session.turn
  );
}

function presentNotificationNotice(reason: "started" | "timeout" | "terminal"): string {
  switch (reason) {
    case "started":
      return "Збір завершився. Старший Брат Бочки підняв кришку й почав бій.";
    case "timeout":
      return "Таймер ходу спрацював. Корчма поставила мовчунів у захист.";
    case "terminal":
      return "Таймер ходу завершив рейд. Показую підсумок.";
    default:
      return "Рейд оновлено.";
  }
}
