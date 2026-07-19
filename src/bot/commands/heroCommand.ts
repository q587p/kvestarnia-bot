import { InlineKeyboard, type Bot, type Context, type Keyboard } from "grammy";
import type { HeroService } from "../../services/heroService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import {
  buildPriestBlessingPlan,
  CLASS_NONCOMBAT_MIN_LEVEL
} from "../../domain/noncombat/classNoncombatTechniques";
import {
  makePriestBlessCallbackData,
  makePriestHealCallbackData,
  makeVarenykFeedPreviewCallbackData
} from "../callbacks/classNoncombatCallbackData";
import { makeItemUseRestoreToFullCallbackData } from "../callbacks/itemUseCallbackData";
import { telegramUserIdFromContext } from "../context";
import { buildHeroAchievementsKeyboard } from "../keyboards/achievementKeyboard";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentHero, presentHeroMissing } from "../presenters/heroPresenter";
import { presentVarenykSatedRecoveryNotice } from "../presenters/varenykSatedPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

export interface HeroCommandOptions {
  buildMainMenuKeyboard?: (ctx: Context) => Promise<Keyboard>;
}

export interface SendHeroOptions {
  mainMenuKeyboard?: Keyboard;
}

export function registerHeroCommand(
  bot: Bot,
  heroService: HeroService,
  options: HeroCommandOptions = {}
): void {
  bot.command(["hero", "profile", "me"], async (ctx) => {
    await sendHero(ctx, heroService, "reply", {
      ...(options.buildMainMenuKeyboard
        ? { mainMenuKeyboard: await options.buildMainMenuKeyboard(ctx) }
        : {})
    });
  });
}

export async function sendHero(
  ctx: Context,
  heroService: HeroService,
  mode: "reply" | "edit",
  options: SendHeroOptions = {}
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await heroService.findByTelegramUserId(telegramUserId);

  if (result.state === "existing-character") {
    const heroText = presentHero(result.character, {
      activeDrink: result.activeDrink,
      activePriestBlessing: result.activePriestBlessing,
      activeVarenykSated: result.activeVarenykSated,
      activeBardInspiration: result.activeBardInspiration,
      varenykSatedAvailableAt: result.varenykSatedAvailableAt,
      ...(result.recoveryNotice ? { recoveryNotice: result.recoveryNotice } : {}),
      activeCosmeticTitle: result.activeCosmeticTitle,
      inventoryGoldValue: result.inventoryGoldValue
    });

    const heroKeyboard = buildHeroAchievementsKeyboard({
      priestSelfHealCallbackData: getPriestSelfHealCallbackData(result.character, result.classNoncombatBlocked),
      priestSelfBlessCallbackData: getPriestSelfBlessCallbackData({
        character: result.character,
        classNoncombatBlocked: result.classNoncombatBlocked,
        priestSelfBlessAvailableAt:
          result.priestSelfBlessAvailableAt ?? result.activePriestBlessing?.expiresAt ?? null
      }),
      varenykSelfFeedCallbackData: getVarenykSelfFeedCallbackData({
        character: result.character,
        classNoncombatBlocked: result.classNoncombatBlocked,
        availableAt: result.varenykSatedAvailableAt
      }),
      restoreCallbackData: result.restoreToFullItemId
        ? makeItemUseRestoreToFullCallbackData(result.restoreToFullItemId)
        : null
    });

    // Telegram accepts one reply_markup per message; this card uses inline hero actions,
    // while the persistent main menu stays owned by the main menu surfaces.
    await sendText(
      ctx,
      mode,
      heroText,
      true,
      heroKeyboard ?? options.mainMenuKeyboard
    );
    const satedRecoveryNotice = result.satedRecovery
      ? presentVarenykSatedRecoveryNotice(result.satedRecovery)
      : null;
    if (satedRecoveryNotice) {
      await ctx.reply(satedRecoveryNotice, { parse_mode: "HTML" });
    }
    return;
  }

  await sendText(ctx, mode, presentHeroMissing(), false);
}

function getVarenykSelfFeedCallbackData(input: {
  character: CharacterSummary;
  classNoncombatBlocked?: boolean;
  availableAt?: Date | null;
}): string | null {
  const { character } = input;
  if (
    input.classNoncombatBlocked ||
    input.availableAt ||
    character.classId !== "class.varenyk-mancer" ||
    character.level < CLASS_NONCOMBAT_MIN_LEVEL ||
    character.hpCurrent <= 0 ||
    character.manaCurrent < 8
  ) {
    return null;
  }
  const remortCount = character.remortCount ?? 0;
  return makeVarenykFeedPreviewCallbackData({
    targetTelegramUserId: null,
    actorRemortCount: remortCount,
    targetRemortCount: remortCount,
    page: 0
  });
}

function getPriestSelfBlessCallbackData(input: {
  character: CharacterSummary;
  classNoncombatBlocked?: boolean;
  priestSelfBlessAvailableAt?: Date | null;
}): string | null {
  const { character } = input;
  if (
    input.classNoncombatBlocked ||
    input.priestSelfBlessAvailableAt ||
    character.classId !== "class.priest" ||
    character.level < CLASS_NONCOMBAT_MIN_LEVEL
  ) {
    return null;
  }

  const plan = buildPriestBlessingPlan({
    priestLevel: character.level,
    priestIntelligence: character.stats.intelligence,
    targetLevel: character.level
  });
  if (character.manaCurrent < plan.manaCost) {
    return null;
  }

  const remortCount = character.remortCount ?? 0;
  return makePriestBlessCallbackData({
    targetTelegramUserId: null,
    actorRemortCount: remortCount,
    targetRemortCount: remortCount,
    page: 0
  });
}

function getPriestSelfHealCallbackData(character: CharacterSummary, classNoncombatBlocked = false): string | null {
  if (
    classNoncombatBlocked ||
    character.classId !== "class.priest" ||
    character.level < CLASS_NONCOMBAT_MIN_LEVEL ||
    character.hpCurrent >= character.hpMax ||
    character.manaCurrent <= 0
  ) {
    return null;
  }

  const remortCount = character.remortCount ?? 0;
  return makePriestHealCallbackData({
    targetTelegramUserId: null,
    actorRemortCount: remortCount,
    targetRemortCount: remortCount,
    page: 0
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  includeMenu = false,
  replyMarkup?: InlineKeyboard | Keyboard
): Promise<void> {
  if (mode === "edit") {
    await safeEditMessageText(ctx, text, {
      parse_mode: "HTML" as const,
      ...(replyMarkup instanceof InlineKeyboard ? { reply_markup: replyMarkup } : {})
    });
    return;
  }

  await ctx.reply(text, {
    parse_mode: "HTML" as const,
    ...(includeMenu ? { reply_markup: replyMarkup ?? buildMainMenuKeyboard() } : {})
  });
}
