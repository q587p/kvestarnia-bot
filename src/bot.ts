import "dotenv/config";

import { createBot } from "./bot/createBot";
import { loadConfig } from "./config/env";
import { prisma } from "./db/prisma";
import { PrismaCharacterRepository } from "./db/repositories/prismaCharacterRepository";
import { PrismaDailyActionRepository } from "./db/repositories/prismaDailyActionRepository";
import { PrismaUserRepository } from "./db/repositories/prismaUserRepository";
import { DevResetService } from "./services/devResetService";
import { HeroService } from "./services/heroService";
import { OnboardingService } from "./services/onboardingService";
import { TavernRaidService } from "./services/tavernRaidService";

const config = loadConfig();
const users = new PrismaUserRepository(prisma);
const characters = new PrismaCharacterRepository(prisma);
const dailyActions = new PrismaDailyActionRepository(prisma);
const services = {
  onboarding: new OnboardingService(users, characters),
  hero: new HeroService(characters),
  devReset: new DevResetService(characters, config.nodeEnv),
  tavern: new TavernRaidService(characters, dailyActions)
};

if (!config.botToken) {
  console.log("Квестарня: BOT_TOKEN не задано, Telegram polling не запускається.");
} else {
  const bot = createBot(config.botToken, services);

  process.once("SIGINT", () => {
    void bot.stop();
    void prisma.$disconnect();
  });
  process.once("SIGTERM", () => {
    void bot.stop();
    void prisma.$disconnect();
  });

  console.log("Квестарня: бот запускається в polling-режимі.");
  void bot.start();
}
