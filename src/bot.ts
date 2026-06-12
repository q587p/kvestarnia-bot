import "dotenv/config";

import { Bot, type Context } from "grammy";
import { loadConfig } from "./config/env";
import {
  parseOnboardingCallbackData,
  type OnboardingCallback
} from "./bot/callbacks/onboardingCallbackData";
import { buildClassKeyboard, buildRaceKeyboard } from "./bot/keyboards/onboardingKeyboard";
import {
  presentCharacterCreated,
  presentCharacterSummary,
  presentInvalidCallback,
  presentRaceSelected,
  presentWelcome
} from "./bot/presenters/onboardingPresenter";
import { prisma } from "./db/prisma";
import { PrismaCharacterRepository } from "./db/repositories/prismaCharacterRepository";
import { PrismaUserRepository } from "./db/repositories/prismaUserRepository";
import type { TelegramUserProfile } from "./db/repositories/userRepository";
import { OnboardingService } from "./services/onboardingService";

const config = loadConfig();
const onboardingService = new OnboardingService(
  new PrismaUserRepository(prisma),
  new PrismaCharacterRepository(prisma)
);

if (!config.botToken) {
  console.log("Квестарня: BOT_TOKEN не задано, Telegram polling не запускається.");
} else {
  const bot = new Bot(config.botToken);

  bot.command("start", async (ctx) => {
    const player = playerFromContext(ctx.from);

    if (!player) {
      await ctx.reply("Квестарня не впізнала мандрівника. Спробуйте ще раз із особистого акаунта.");
      return;
    }

    const result = await onboardingService.start(player);

    if (result.state === "existing-character") {
      await ctx.reply(presentCharacterSummary(result.character));
      return;
    }

    await ctx.reply(presentWelcome(), {
      reply_markup: buildRaceKeyboard()
    });
  });

  bot.callbackQuery(/^v1:onb:/, async (ctx) => {
    const parsed = parseOnboardingCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleOnboardingCallback(ctx, parsed.value);
  });

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

async function handleOnboardingCallback(
  ctx: Context,
  callback: OnboardingCallback
): Promise<void> {
  if (callback.type === "race") {
    const selectedRace = onboardingService.selectRace(callback.raceId);

    if (!selectedRace.ok) {
      await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(presentRaceSelected(callback.raceId), {
      reply_markup: buildClassKeyboard(callback.raceId)
    });
    return;
  }

  const player = playerFromContext(ctx.from);

  if (!player) {
    await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await onboardingService.complete(player, callback.raceId, callback.classId);

  if (!result.ok) {
    await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(presentCharacterCreated(result.value.character, result.value.created));
}

function playerFromContext(
  from:
    | {
        id: number;
        username?: string;
        first_name: string;
        last_name?: string;
        language_code?: string;
      }
    | undefined
): TelegramUserProfile | null {
  if (!from) {
    return null;
  }

  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ");
  const player: TelegramUserProfile = {
    telegramUserId: BigInt(from.id),
    displayName
  };

  if (from.username) {
    player.username = from.username;
  }

  if (from.language_code) {
    player.languageCode = from.language_code;
  }

  return player;
}
