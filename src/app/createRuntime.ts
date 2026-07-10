import type { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import { getTelegramMenuCommands } from "../bot/botCommandCatalog";
import { createCombatTurnTimeoutScheduler } from "../bot/combatTurnTimeoutScheduler";
import { createBot } from "../bot/createBot";
import { createDuelTurnTimeoutScheduler } from "../bot/duelTurnTimeoutScheduler";
import { createEquipmentAttunementScheduler } from "../bot/equipmentAttunementScheduler";
import { createHealthRecoveryNotificationScheduler } from "../bot/healthRecoveryNotificationScheduler";
import { createPassageSearchCompletionScheduler } from "../bot/passageSearchCompletionScheduler";
import { createPartyBossRecruitingStartScheduler } from "../bot/partyBossRecruitingStartScheduler";
import type { AppConfig } from "../config/env";
import { startHealthServer } from "../health/server";
import type { ApplicationServices } from "./createServices";

export interface ApplicationRuntime {
  start(): void;
  stop(): Promise<void>;
}

type RuntimeState = "new" | "started" | "stopping" | "stopped";

interface RuntimeDependencies {
  createBot: typeof createBot;
  createCombatTurnTimeoutScheduler: typeof createCombatTurnTimeoutScheduler;
  createDuelTurnTimeoutScheduler: typeof createDuelTurnTimeoutScheduler;
  createEquipmentAttunementScheduler: typeof createEquipmentAttunementScheduler;
  createHealthRecoveryNotificationScheduler: typeof createHealthRecoveryNotificationScheduler;
  createPassageSearchCompletionScheduler: typeof createPassageSearchCompletionScheduler;
  createPartyBossRecruitingStartScheduler: typeof createPartyBossRecruitingStartScheduler;
  getTelegramMenuCommands: typeof getTelegramMenuCommands;
  startHealthServer: typeof startHealthServer;
}

export function createRuntime(input: {
  config: AppConfig;
  prisma: Pick<PrismaClient, "$disconnect">;
  services: ApplicationServices;
  dependencies?: Partial<RuntimeDependencies>;
}): ApplicationRuntime {
  const { config, prisma, services } = input;
  const dependencies: RuntimeDependencies = {
    createBot,
    createCombatTurnTimeoutScheduler,
    createDuelTurnTimeoutScheduler,
    createEquipmentAttunementScheduler,
    createHealthRecoveryNotificationScheduler,
    createPassageSearchCompletionScheduler,
    createPartyBossRecruitingStartScheduler,
    getTelegramMenuCommands,
    startHealthServer,
    ...input.dependencies
  };
  const supportJarOptions = config.supportJarUrl
    ? {
        supportJarUrl: config.supportJarUrl,
        ...(config.supportJarStatus ? { supportJarStatus: config.supportJarStatus } : {})
      }
    : {};
  const botLinkOptions = config.botUsername ? { botUsername: config.botUsername } : {};
  let state: RuntimeState = "new";
  let stopPromise: Promise<void> | null = null;
  let bot: Bot | null = null;
  let healthServer: ReturnType<typeof startHealthServer> | null = null;
  let duelTurnTimeoutScheduler: ReturnType<typeof createDuelTurnTimeoutScheduler> | null = null;
  let equipmentAttunementScheduler: ReturnType<typeof createEquipmentAttunementScheduler> | null = null;
  let healthRecoveryNotificationScheduler: ReturnType<typeof createHealthRecoveryNotificationScheduler> | null = null;
  let combatTurnTimeoutScheduler: ReturnType<typeof createCombatTurnTimeoutScheduler> | null = null;
  let passageSearchCompletionScheduler: ReturnType<typeof createPassageSearchCompletionScheduler> | null = null;
  let partyBossRecruitingStartScheduler: ReturnType<typeof createPartyBossRecruitingStartScheduler> | null = null;

  return {
    start() {
      if (state !== "new") {
        return;
      }

      state = "started";
      healthServer = dependencies.startHealthServer({
        presence: services.presence,
        ...supportJarOptions
      });

      if (!config.botToken) {
        console.log("Квестарня: BOT_TOKEN не задано, Telegram polling не запускається.");
        return;
      }

      bot = dependencies.createBot(config.botToken, services, {
        ...supportJarOptions,
        ...botLinkOptions
      });
      if (services.duel) {
        duelTurnTimeoutScheduler = dependencies.createDuelTurnTimeoutScheduler(services.duel, bot);
        duelTurnTimeoutScheduler.start();
      }
      combatTurnTimeoutScheduler = dependencies.createCombatTurnTimeoutScheduler(
        services.trainingDoppelganger
          ? {
              fight: services.fight,
              trainingDoppelganger: services.trainingDoppelganger
            }
          : { fight: services.fight },
        bot
      );
      combatTurnTimeoutScheduler.start();
      equipmentAttunementScheduler = dependencies.createEquipmentAttunementScheduler(
        services.equipment,
        bot
      );
      equipmentAttunementScheduler.start();
      healthRecoveryNotificationScheduler = dependencies.createHealthRecoveryNotificationScheduler(
        services.healthRecoveryNotifications,
        bot
      );
      healthRecoveryNotificationScheduler.start();
      if (services.passageSearch) {
        passageSearchCompletionScheduler = dependencies.createPassageSearchCompletionScheduler({
          passageSearch: services.passageSearch,
          fight: services.fight
        }, bot);
        passageSearchCompletionScheduler.start();
      }
      if (services.partySessions && services.partyBoss && services.partyBoss.isEnabled()) {
        partyBossRecruitingStartScheduler = dependencies.createPartyBossRecruitingStartScheduler({
          partySessions: services.partySessions,
          partyBoss: services.partyBoss
        }, bot);
        partyBossRecruitingStartScheduler.start();
      }

      void services.mantokChest.cleanupExpiredPendingRuns().catch((error) => {
        console.error("Квестарня: старі бланки Дружньої Скрині не прибрались.", error);
      });

      void bot.api.setMyCommands(dependencies.getTelegramMenuCommands({
        includeDevReset: services.devReset.isEnabled(),
        includeDevGrant: services.devGrant?.isEnabled() === true,
        includePartySessions: services.partySessions?.isEnabled() === true,
        includeTavernGames: services.tavernGames?.isEnabled() === true
      })).catch((error) => {
        console.error("Квестарня: бокове меню команд не оновилось.", error);
      });

      console.log("Квестарня: бот запускається в polling-режимі.");
      void bot.start();

      void services.deployNotifications.announceIfNeeded(bot).catch((error) => {
        console.error("Квестарня: нотифікація про нову версію не відправилась.", error);
      });
    },
    async stop() {
      if (stopPromise) {
        await stopPromise;
        return;
      }

      state = state === "new" ? "stopped" : "stopping";
      stopPromise = (async () => {
        let shutdownError: Error | null = null;

        combatTurnTimeoutScheduler?.stop();
        duelTurnTimeoutScheduler?.stop();
        equipmentAttunementScheduler?.stop();
        healthRecoveryNotificationScheduler?.stop();
        passageSearchCompletionScheduler?.stop();
        partyBossRecruitingStartScheduler?.stop();

        try {
          if (bot) {
            await bot.stop();
          }
        } catch (error) {
          shutdownError = error instanceof Error ? error : new Error(String(error));
        } finally {
          healthServer?.close();
          await prisma.$disconnect();
          state = "stopped";
        }

        if (shutdownError) {
          throw shutdownError;
        }
      })();

      await stopPromise;
    }
  };
}
