import type { Bot } from "grammy";
import type { PartyBossService } from "../services/partyBossService";
import type { PartySessionService } from "../services/partySessionService";
import { buildPartyBossKeyboard } from "./keyboards/partySessionKeyboard";
import { presentPartyBoss } from "./presenters/partySessionPresenter";

const DEFAULT_INTERVAL_MS = 10_000;

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function createPartyBossRecruitingStartScheduler(
  services: {
    partySessions: PartySessionService;
    partyBoss: PartyBossService;
  },
  bot: Bot,
  options: { intervalMs?: number } = {}
): { start(): void; stop(): void; tick(): Promise<number> } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<number> => {
    if (running || !services.partySessions.isBigBarrelBrotherEnabled() || !services.partyBoss.isEnabled()) {
      return 0;
    }

    running = true;
    try {
      const due = await services.partySessions.listDueRecruitingBigBarrelBrother();
      let started = 0;

      for (const party of due) {
        const result = await services.partyBoss.startFromPartyForTelegramUser(
          party.leader.telegramUserId,
          party.inviteToken,
          { allowExpiredRecruiting: true }
        );

        if (!("session" in result) || result.state !== "started") {
          continue;
        }

        started += 1;
        await notifyParticipants(bot, result.session);
      }

      return started;
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
  session: Parameters<typeof buildPartyBossKeyboard>[0]
): Promise<void> {
  await Promise.allSettled(session.participants.map((participant) =>
    bot.api.sendMessage(
      Number(participant.telegramUserId),
      presentPartyBoss(session, {
        viewerCharacterId: participant.id,
        notice: "Збір завершився. Старший Брат Бочки відкрив журнал і почав бій."
      }),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPartyBossKeyboard(session, participant.id)
      }
    )
  ));
}
