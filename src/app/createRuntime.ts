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
import { classifyPerformanceError } from "../bot/performanceLogger";
import type { AppConfig } from "../config/env";
import { startHealthServer } from "../health/server";
import type { ApplicationServices } from "./createServices";
import { createRuntimeReadiness } from "./runtimeReadiness";

export interface ApplicationRuntime {
  start(): Promise<void>;
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
  prisma: Pick<PrismaClient, "$disconnect" | "$queryRawUnsafe">;
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
  const readiness = createRuntimeReadiness();
  let schedulersStarted = false;
  let schedulersStopped = false;
  let schedulersStopPromise: Promise<void> | null = null;

  const startSchedulers = (): boolean => {
    if (state !== "started" || schedulersStarted || schedulersStopped) {
      return false;
    }

    schedulersStarted = true;
    duelTurnTimeoutScheduler?.start();
    combatTurnTimeoutScheduler?.start();
    equipmentAttunementScheduler?.start();
    healthRecoveryNotificationScheduler?.start();
    passageSearchCompletionScheduler?.start();
    partyBossRecruitingStartScheduler?.start();
    return true;
  };

  const stopSchedulers = (): Promise<void> => {
    if (schedulersStopPromise) {
      return schedulersStopPromise;
    }
    schedulersStopped = true;
    if (!schedulersStarted) {
      schedulersStopPromise = Promise.resolve();
      return schedulersStopPromise;
    }
    schedulersStopPromise = (async () => {
      combatTurnTimeoutScheduler?.stop();
      duelTurnTimeoutScheduler?.stop();
      equipmentAttunementScheduler?.stop();
      passageSearchCompletionScheduler?.stop();
      partyBossRecruitingStartScheduler?.stop();
      await healthRecoveryNotificationScheduler?.stop();
    })();
    return schedulersStopPromise;
  };

  return {
    async start() {
      if (state !== "new") {
        return;
      }

      state = "started";
      healthServer = dependencies.startHealthServer({
        presence: services.presence,
        readiness,
        ...supportJarOptions
      });

      if (!config.botToken) {
        console.log("Квестарня: BOT_TOKEN не задано, Telegram polling не запускається.");
        return;
      }

      try {
        await prisma.$queryRawUnsafe("SELECT 1");
        readiness.markDatabaseReady();
      } catch (error) {
        readiness.markFailed();
        console.error("Квестарня: база не пройшла перевірку готовності.", {
          errorCategory: classifyPerformanceError(error)
        });
        return;
      }

      if (state !== "started") {
        return;
      }

      bot = dependencies.createBot(config.botToken, services, {
        ...supportJarOptions,
        ...botLinkOptions
      });
      if (services.duel) {
        duelTurnTimeoutScheduler = dependencies.createDuelTurnTimeoutScheduler(services.duel, bot);
      }
      combatTurnTimeoutScheduler = dependencies.createCombatTurnTimeoutScheduler(
        services.trainingDoppelganger
            ? {
                fight: services.fight,
                fightingCornerQuest: services.fightingCornerQuest,
                trainingDoppelganger: services.trainingDoppelganger
              }
            : { fight: services.fight, fightingCornerQuest: services.fightingCornerQuest },
        bot
      );
      equipmentAttunementScheduler = dependencies.createEquipmentAttunementScheduler(
        services.equipment,
        bot
      );
      if (config.hpRecoveryNotificationsEnabled) {
        healthRecoveryNotificationScheduler = dependencies.createHealthRecoveryNotificationScheduler(
          services.healthRecoveryNotifications,
          bot
        );
      }
      if (services.passageSearch) {
        passageSearchCompletionScheduler = dependencies.createPassageSearchCompletionScheduler({
          passageSearch: services.passageSearch,
          fight: services.fight
        }, bot);
      }
      if (services.partySessions && services.partyBoss && services.partyBoss.isEnabled()) {
        partyBossRecruitingStartScheduler = dependencies.createPartyBossRecruitingStartScheduler({
          partySessions: services.partySessions,
          partyBoss: services.partyBoss
        }, bot);
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
      void bot.start({
        onStart: () => {
          if (startSchedulers()) {
            readiness.markPollingReady();
            console.log("Квестарня: Telegram polling готовий приймати оновлення.");
          }
        }
      }).then(() => {
        if (state === "started") {
          readiness.markFailed();
          void stopSchedulers();
          console.error("Квестарня: Telegram polling завершився без зупинки runtime.");
        }
      }).catch((error) => {
        if (state !== "started") {
          return;
        }

        readiness.markFailed();
        void stopSchedulers();
        console.error("Квестарня: Telegram polling не запустився або аварійно завершився.", {
          errorCategory: classifyPerformanceError(error)
        });
      });

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
      readiness.markStopping();
      stopPromise = (async () => {
        let shutdownError: Error | null = null;

        await stopSchedulers();

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
