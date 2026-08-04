import type { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import { getTelegramMenuCommands } from "../bot/botCommandCatalog";
import { createCombatTurnTimeoutScheduler } from "../bot/combatTurnTimeoutScheduler";
import { createBot } from "../bot/createBot";
import { createDuelTurnTimeoutScheduler } from "../bot/duelTurnTimeoutScheduler";
import { createEquipmentAttunementScheduler } from "../bot/equipmentAttunementScheduler";
import { createHealthRecoveryNotificationScheduler } from "../bot/healthRecoveryNotificationScheduler";
import { createGroupCombatTimeoutScheduler } from "../bot/groupCombatTimeoutScheduler";
import { createPassageSearchCompletionScheduler } from "../bot/passageSearchCompletionScheduler";
import { createPartyBossRecruitingStartScheduler } from "../bot/partyBossRecruitingStartScheduler";
import { createPartyRaidChatDeliveryScheduler } from "../bot/partyRaidChatDeliveryScheduler";
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
  createGroupCombatTimeoutScheduler: typeof createGroupCombatTimeoutScheduler;
  createPassageSearchCompletionScheduler: typeof createPassageSearchCompletionScheduler;
  createPartyBossRecruitingStartScheduler: typeof createPartyBossRecruitingStartScheduler;
  createPartyRaidChatDeliveryScheduler: typeof createPartyRaidChatDeliveryScheduler;
  getTelegramMenuCommands: typeof getTelegramMenuCommands;
  startHealthServer: typeof startHealthServer;
}

class RuntimeCleanupError extends Error {
  constructor(readonly errors: readonly Error[]) {
    super(`Runtime shutdown failed in ${errors.length} cleanup steps.`);
    this.name = "RuntimeCleanupError";
  }
}

function recordCleanupError(errors: Error[], error: unknown): void {
  if (error instanceof RuntimeCleanupError) {
    errors.push(...error.errors);
    return;
  }
  errors.push(error instanceof Error ? error : new Error(String(error)));
}

function throwCleanupErrors(errors: Error[]): void {
  if (errors.length === 1) {
    throw errors[0] ?? new Error("Runtime shutdown failed.");
  }
  if (errors.length > 1) {
    throw new RuntimeCleanupError(errors);
  }
}

export function createRuntime(input: {
  config: AppConfig;
  prisma: Pick<PrismaClient, "$disconnect" | "$queryRawUnsafe">;
  services: ApplicationServices;
  dependencies?: Partial<RuntimeDependencies>;
  onFatalRuntimeError?: (error: Error) => void;
}): ApplicationRuntime {
  const { config, prisma, services } = input;
  const dependencies: RuntimeDependencies = {
    createBot,
    createCombatTurnTimeoutScheduler,
    createDuelTurnTimeoutScheduler,
    createEquipmentAttunementScheduler,
    createHealthRecoveryNotificationScheduler,
    createGroupCombatTimeoutScheduler,
    createPassageSearchCompletionScheduler,
    createPartyBossRecruitingStartScheduler,
    createPartyRaidChatDeliveryScheduler,
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
  let groupCombatTimeoutScheduler: ReturnType<typeof createGroupCombatTimeoutScheduler> | null = null;
  let combatTurnTimeoutScheduler: ReturnType<typeof createCombatTurnTimeoutScheduler> | null = null;
  let passageSearchCompletionScheduler: ReturnType<typeof createPassageSearchCompletionScheduler> | null = null;
  let partyBossRecruitingStartScheduler: ReturnType<typeof createPartyBossRecruitingStartScheduler> | null = null;
  let partyRaidChatDeliveryScheduler: ReturnType<typeof createPartyRaidChatDeliveryScheduler> | null = null;
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
    groupCombatTimeoutScheduler?.start();
    passageSearchCompletionScheduler?.start();
    partyBossRecruitingStartScheduler?.start();
    partyRaidChatDeliveryScheduler?.start();
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
      const cleanupErrors: Error[] = [];
      const cleanupSteps: Array<() => void | Promise<void>> = [
        () => combatTurnTimeoutScheduler?.stop(),
        () => duelTurnTimeoutScheduler?.stop(),
        () => equipmentAttunementScheduler?.stop(),
        () => groupCombatTimeoutScheduler?.stop(),
        () => passageSearchCompletionScheduler?.stop(),
        () => partyBossRecruitingStartScheduler?.stop(),
        () => partyRaidChatDeliveryScheduler?.stop(),
        () => healthRecoveryNotificationScheduler?.stop()
      ];

      for (const cleanup of cleanupSteps) {
        try {
          await cleanup();
        } catch (error) {
          recordCleanupError(cleanupErrors, error);
        }
      }

      throwCleanupErrors(cleanupErrors);
    })();
    return schedulersStopPromise;
  };

  const stopRuntime = async (): Promise<void> => {
    if (stopPromise) {
      await stopPromise;
      return;
    }

    state = state === "new" ? "stopped" : "stopping";
    readiness.markStopping();
    stopPromise = (async () => {
      const cleanupErrors: Error[] = [];
      const cleanupSteps: Array<() => void | Promise<void>> = [
        () => stopSchedulers(),
        () => bot?.stop(),
        () => {
          healthServer?.close();
        },
        () => prisma.$disconnect()
      ];

      for (const cleanup of cleanupSteps) {
        try {
          await cleanup();
        } catch (error) {
          recordCleanupError(cleanupErrors, error);
        }
      }

      state = "stopped";
      throwCleanupErrors(cleanupErrors);
    })();

    await stopPromise;
  };

  const failRuntime = (error: Error): void => {
    readiness.markFailed();
    void stopRuntime()
      .catch((shutdownError) => {
        console.error("Квестарня: runtime не завершився чисто після критичної помилки.", {
          errorName: shutdownError instanceof Error ? shutdownError.name : "unknown"
        });
      })
      .finally(() => {
        input.onFatalRuntimeError?.(error);
      });
  };

  return {
    async start() {
      if (state !== "new") {
        return;
      }

      state = "started";
      try {
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
        const runtimeError = error instanceof Error ? error : new Error(String(error));
        console.error("Квестарня: база не пройшла перевірку готовності.", {
          errorCategory: classifyPerformanceError(error)
        });
        failRuntime(runtimeError);
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
      if (services.groupCombat?.isEnabled()) {
        groupCombatTimeoutScheduler = dependencies.createGroupCombatTimeoutScheduler(services.groupCombat, bot, {
          ...(services.partySessions ? { partySessions: services.partySessions } : {})
        });
      }
      if (services.passageSearch) {
        passageSearchCompletionScheduler = dependencies.createPassageSearchCompletionScheduler({
          passageSearch: services.passageSearch,
          fight: services.fight
        }, bot);
      }
      if (services.partySessions && services.partyBoss) {
        partyBossRecruitingStartScheduler = dependencies.createPartyBossRecruitingStartScheduler({
          partySessions: services.partySessions,
          partyBoss: services.partyBoss,
          partyRaidChat: services.partyRaidChat
        }, bot);
      }
      if (services.partyRaidChat && services.partySessions) {
        partyRaidChatDeliveryScheduler = dependencies.createPartyRaidChatDeliveryScheduler({
          partyRaidChat: services.partyRaidChat,
          partySessions: services.partySessions,
          partyBoss: services.partyBoss
        }, bot, botLinkOptions);
      }

      void services.mantokChest.cleanupExpiredPendingRuns().catch((error) => {
        console.error("Квестарня: старі бланки Дружньої Скрині не прибрались.", error);
      });

      void bot.api.setMyCommands(dependencies.getTelegramMenuCommands({
        includeDevReset: services.devReset.isEnabled(),
        includeDevGrant: services.devGrant?.isEnabled() === true,
        includePartySessions: services.partySessions?.isEnabled() === true,
        includeGroupCombat: services.groupCombat?.areDevHelpersEnabled() === true,
        includeRaidChat: services.partyRaidChat?.areDevHelpersEnabled() === true,
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
          const error = new Error("Telegram polling stopped unexpectedly.");
          console.error("Квестарня: Telegram polling завершився без зупинки runtime.");
          failRuntime(error);
        }
      }).catch((error) => {
        if (state !== "started") {
          return;
        }

        const runtimeError = error instanceof Error ? error : new Error(String(error));
        console.error("Квестарня: Telegram polling не запустився або аварійно завершився.", {
          errorCategory: classifyPerformanceError(error)
        });
        failRuntime(runtimeError);
      });

      void services.deployNotifications.announceIfNeeded(bot).catch((error) => {
        console.error("Квестарня: нотифікація про нову версію не відправилась.", error);
      });
      } catch (error) {
        const runtimeError = error instanceof Error ? error : new Error(String(error));
        console.error("Квестарня: запуск runtime аварійно перервано.", {
          errorName: runtimeError.name,
          errorCategory: classifyPerformanceError(error)
        });
        failRuntime(runtimeError);
      }
    },
    async stop() {
      await stopRuntime();
    }
  };
}
