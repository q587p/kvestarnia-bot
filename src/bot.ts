import "dotenv/config";

import type { Bot } from "grammy";
import { getTelegramMenuCommands } from "./bot/botCommandCatalog";
import { createBot } from "./bot/createBot";
import { createDuelTurnTimeoutScheduler } from "./bot/duelTurnTimeoutScheduler";
import { loadConfig } from "./config/env";
import { prisma } from "./db/prisma";
import { PrismaCharacterRepository } from "./db/repositories/prismaCharacterRepository";
import { PrismaBarrelRaidNotificationRepository } from "./db/repositories/prismaBarrelRaidNotificationRepository";
import { PrismaCellarGrownupQuestRepository } from "./db/repositories/prismaCellarGrownupQuestRepository";
import { PrismaCooldownRepository } from "./db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "./db/repositories/prismaDailyActionRepository";
import { PrismaDevGrantRepository } from "./db/repositories/prismaDevGrantRepository";
import { PrismaDuelChallengeRepository } from "./db/repositories/prismaDuelChallengeRepository";
import { PrismaEquipmentRepository } from "./db/repositories/prismaEquipmentRepository";
import { PrismaHuntContractRepository } from "./db/repositories/prismaHuntContractRepository";
import { PrismaInventoryRepository } from "./db/repositories/prismaInventoryRepository";
import { PrismaLevelBarterRepository } from "./db/repositories/prismaLevelBarterRepository";
import { PrismaKorchmaRoundPurchaseRepository } from "./db/repositories/prismaKorchmaRoundPurchaseRepository";
import { PrismaLevelMilestoneRepository } from "./db/repositories/prismaLevelMilestoneRepository";
import { PrismaMantokChestRepository } from "./db/repositories/prismaMantokChestRepository";
import { PrismaPresenceRepository } from "./db/repositories/prismaPresenceRepository";
import { PrismaRemortRepository } from "./db/repositories/prismaRemortRepository";
import { PrismaSoloCombatSessionRepository } from "./db/repositories/prismaSoloCombatSessionRepository";
import { PrismaUserRepository } from "./db/repositories/prismaUserRepository";
import { startHealthServer } from "./health/server";
import { readAppVersion } from "./shared/appVersion";
import { AdventureService } from "./services/adventureService";
import { CellarErrandService } from "./services/cellarErrandService";
import { CellarGrownupQuestService } from "./services/cellarGrownupQuestService";
import { DevResetService } from "./services/devResetService";
import { DevGrantService } from "./services/devGrantService";
import { DeployNotificationService } from "./services/deployNotificationService";
import { DuelChallengeService } from "./services/duelChallengeService";
import { EquipmentService } from "./services/equipmentService";
import { FightService } from "./services/fightService";
import { HeroService } from "./services/heroService";
import { HuntService } from "./services/huntService";
import { InventoryService } from "./services/inventoryService";
import { LevelMilestoneService } from "./services/levelMilestoneService";
import { LevelBarterService } from "./services/levelBarterService";
import { MantokChestService } from "./services/mantokChestService";
import { OnboardingService } from "./services/onboardingService";
import { PresenceService } from "./services/presenceService";
import { RemortService } from "./services/remortService";
import { RestartService } from "./services/restartService";
import { TavernRaidService } from "./services/tavernRaidService";
import { TrainingDoppelgangerService } from "./services/trainingDoppelgangerService";
import { YegerQuestService } from "./services/yegerQuestService";

const config = loadConfig();
const users = new PrismaUserRepository(prisma);
const barrelRaidNotifications = new PrismaBarrelRaidNotificationRepository(prisma);
const characters = new PrismaCharacterRepository(prisma);
const cellarGrownupQuests = new PrismaCellarGrownupQuestRepository(prisma);
const cooldowns = new PrismaCooldownRepository(prisma);
const dailyActions = new PrismaDailyActionRepository(prisma);
const devGrants = new PrismaDevGrantRepository(prisma);
const duelChallenges = new PrismaDuelChallengeRepository(prisma);
const equipment = new PrismaEquipmentRepository(prisma);
const huntContracts = new PrismaHuntContractRepository(prisma);
const inventory = new PrismaInventoryRepository(prisma);
const levelBarter = new PrismaLevelBarterRepository(prisma);
const levelMilestones = new PrismaLevelMilestoneRepository(prisma);
const mantokChestRuns = new PrismaMantokChestRepository(prisma);
const roundPurchases = new PrismaKorchmaRoundPurchaseRepository(prisma);
const presence = new PrismaPresenceRepository(prisma);
const remorts = new PrismaRemortRepository(prisma);
const soloCombatSessions = new PrismaSoloCombatSessionRepository(prisma);
const fight = new FightService(characters, dailyActions, undefined, soloCombatSessions, undefined, equipment);
const services = {
  adventure: new AdventureService(characters, dailyActions, undefined, soloCombatSessions),
  barrelRaidNotifications,
  cellarErrand: new CellarErrandService(cooldowns),
  cellarGrownup: new CellarGrownupQuestService(cellarGrownupQuests, dailyActions, cooldowns),
  fight,
  hunt: new HuntService(characters, dailyActions, huntContracts),
  yeger: new YegerQuestService(characters, dailyActions, soloCombatSessions, fight, cooldowns),
  onboarding: new OnboardingService(users, characters),
  hero: new HeroService(characters, inventory, equipment, remorts),
  equipment: new EquipmentService(equipment, inventory, characters),
  inventory: new InventoryService(inventory),
  levelBarter: new LevelBarterService(levelBarter),
  levelMilestones: new LevelMilestoneService(levelMilestones),
  mantokChest: new MantokChestService(mantokChestRuns),
  presence: new PresenceService(presence),
  devGrant: new DevGrantService(devGrants, config.nodeEnv, config.devGrantCommandsEnabled),
  duel: new DuelChallengeService(duelChallenges, characters),
  remort: new RemortService(remorts),
  devReset: new DevResetService(characters, config.nodeEnv),
  restart: new RestartService(characters),
  tavern: new TavernRaidService(characters, dailyActions, roundPurchases, cooldowns),
  trainingDoppelganger: new TrainingDoppelgangerService(
    characters,
    cooldowns,
    dailyActions,
    soloCombatSessions,
    equipment,
    undefined,
    undefined,
    {},
    duelChallenges
  )
};
const supportJarOptions = config.supportJarUrl
  ? {
      supportJarUrl: config.supportJarUrl,
      ...(config.supportJarStatus ? { supportJarStatus: config.supportJarStatus } : {})
    }
  : {};
const botLinkOptions = config.botUsername ? { botUsername: config.botUsername } : {};
const healthServer = startHealthServer({
  presence: services.presence,
  ...supportJarOptions
});
let bot: Bot | null = null;
let duelTurnTimeoutScheduler: ReturnType<typeof createDuelTurnTimeoutScheduler> | null = null;

function shutdown(): void {
  duelTurnTimeoutScheduler?.stop();
  if (bot) {
    void bot.stop();
  }

  healthServer.close();
  void prisma.$disconnect();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

if (!config.botToken) {
  console.log("Квестарня: BOT_TOKEN не задано, Telegram polling не запускається.");
} else {
  bot = createBot(config.botToken, services, {
    ...supportJarOptions,
    ...botLinkOptions
  });
  duelTurnTimeoutScheduler = createDuelTurnTimeoutScheduler(services.duel, bot);
  duelTurnTimeoutScheduler.start();

  void services.mantokChest.cleanupExpiredPendingRuns().catch((error) => {
    console.error("Квестарня: старі бланки Дружньої Скрині не прибрались.", error);
  });

  void bot.api.setMyCommands(getTelegramMenuCommands({
    includeDevReset: services.devReset.isEnabled(),
    includeDevGrant: services.devGrant.isEnabled()
  })).catch((error) => {
    console.error("Квестарня: бокове меню команд не оновилось.", error);
  });

  console.log("Квестарня: бот запускається в polling-режимі.");
  void bot.start();

  const deployNotifications = new DeployNotificationService(users, {
    enabled: config.deployNotificationsEnabled,
    databaseUrl: config.databaseUrl,
    version: readAppVersion()
  });

  void deployNotifications.announceIfNeeded(bot).catch((error) => {
    console.error("Квестарня: нотифікація про нову версію не відправилась.", error);
  });
}
