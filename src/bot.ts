import "dotenv/config";

import type { Bot } from "grammy";
import { getTelegramMenuCommands } from "./bot/botCommandCatalog";
import { createBot } from "./bot/createBot";
import { loadConfig } from "./config/env";
import { prisma } from "./db/prisma";
import { PrismaCharacterRepository } from "./db/repositories/prismaCharacterRepository";
import { PrismaCellarGrownupQuestRepository } from "./db/repositories/prismaCellarGrownupQuestRepository";
import { PrismaCooldownRepository } from "./db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "./db/repositories/prismaDailyActionRepository";
import { PrismaEquipmentRepository } from "./db/repositories/prismaEquipmentRepository";
import { PrismaHuntContractRepository } from "./db/repositories/prismaHuntContractRepository";
import { PrismaInventoryRepository } from "./db/repositories/prismaInventoryRepository";
import { PrismaKorchmaRoundPurchaseRepository } from "./db/repositories/prismaKorchmaRoundPurchaseRepository";
import { PrismaMantokChestRepository } from "./db/repositories/prismaMantokChestRepository";
import { PrismaPresenceRepository } from "./db/repositories/prismaPresenceRepository";
import { PrismaSoloCombatSessionRepository } from "./db/repositories/prismaSoloCombatSessionRepository";
import { PrismaUserRepository } from "./db/repositories/prismaUserRepository";
import { startHealthServer } from "./health/server";
import { readAppVersion } from "./shared/appVersion";
import { AdventureService } from "./services/adventureService";
import { CellarErrandService } from "./services/cellarErrandService";
import { CellarGrownupQuestService } from "./services/cellarGrownupQuestService";
import { DevResetService } from "./services/devResetService";
import { DeployNotificationService } from "./services/deployNotificationService";
import { EquipmentService } from "./services/equipmentService";
import { FightService } from "./services/fightService";
import { HeroService } from "./services/heroService";
import { HuntService } from "./services/huntService";
import { InventoryService } from "./services/inventoryService";
import { MantokChestService } from "./services/mantokChestService";
import { OnboardingService } from "./services/onboardingService";
import { PresenceService } from "./services/presenceService";
import { RestartService } from "./services/restartService";
import { TavernRaidService } from "./services/tavernRaidService";

const config = loadConfig();
const users = new PrismaUserRepository(prisma);
const characters = new PrismaCharacterRepository(prisma);
const cellarGrownupQuests = new PrismaCellarGrownupQuestRepository(prisma);
const cooldowns = new PrismaCooldownRepository(prisma);
const dailyActions = new PrismaDailyActionRepository(prisma);
const equipment = new PrismaEquipmentRepository(prisma);
const huntContracts = new PrismaHuntContractRepository(prisma);
const inventory = new PrismaInventoryRepository(prisma);
const mantokChestRuns = new PrismaMantokChestRepository(prisma);
const roundPurchases = new PrismaKorchmaRoundPurchaseRepository(prisma);
const presence = new PrismaPresenceRepository(prisma);
const soloCombatSessions = new PrismaSoloCombatSessionRepository(prisma);
const services = {
  adventure: new AdventureService(characters, dailyActions),
  cellarErrand: new CellarErrandService(cooldowns),
  cellarGrownup: new CellarGrownupQuestService(cellarGrownupQuests, dailyActions, cooldowns),
  fight: new FightService(characters, dailyActions, undefined, soloCombatSessions, undefined, equipment),
  hunt: new HuntService(characters, dailyActions, huntContracts),
  onboarding: new OnboardingService(users, characters),
  hero: new HeroService(characters, inventory, equipment),
  equipment: new EquipmentService(equipment, inventory),
  inventory: new InventoryService(inventory),
  mantokChest: new MantokChestService(mantokChestRuns),
  presence: new PresenceService(presence),
  devReset: new DevResetService(characters, config.nodeEnv),
  restart: new RestartService(characters),
  tavern: new TavernRaidService(characters, dailyActions, roundPurchases, cooldowns)
};
const healthServer = startHealthServer({ presence: services.presence });
let bot: Bot | null = null;

function shutdown(): void {
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
  bot = createBot(config.botToken, services);

  void bot.api.setMyCommands(getTelegramMenuCommands(services.devReset.isEnabled())).catch((error) => {
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
