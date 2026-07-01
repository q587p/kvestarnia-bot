import type { Bot } from "grammy";
import type { AdventureService } from "../../services/adventureService";
import type { DailyKorchmaRoundService } from "../../services/dailyKorchmaRoundService";
import type { DevResetService } from "../../services/devResetService";
import type { FightService } from "../../services/fightService";
import type { PartyBossService } from "../../services/partyBossService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT } from "../../services/presenceService";
import { playerFromContext } from "../context";
import { buildPersistentFightResultKeyboard } from "../keyboards/fightKeyboard";
import { buildDevResetKeyboard } from "../keyboards/mainMenuKeyboard";
import {
  presentDevAdventureResetResult,
  presentDevKorchmaRoundResetResult,
  presentDevRaidWinResult,
  presentDevRaidResetResult,
  presentDevMonsterRestResetResult,
  presentDevRaidStopResult,
  presentDevResetDisabled,
  presentDevResetPrompt
} from "../presenters/devResetPresenter";
import {
  presentFightNoCharacter,
  presentPersistentFight,
  presentPersistentFightIntro
} from "../presenters/fightPresenter";
import { presentLevelUpCelebration } from "../presenters/levelGrowthPresenter";

export function registerDevResetCommand(
  bot: Bot,
  devResetService: DevResetService,
  adventureService?: Pick<AdventureService, "resetCurrentPeriodForTelegramUser">,
  tavernRaidService?: Pick<TavernRaidService, "resetFridayBarrelRaidForDev" | "stopPendingFridayBarrelRaidForDev">,
  dailyKorchmaRoundService?: Pick<DailyKorchmaRoundService, "resetTodayForDev">,
  fightService?: Pick<
    FightService,
    "getOrStartPersistentFightForTelegramUser" | "recordPersistentFightMessageReference" | "resetMonsterRestCooldownForDev"
  >,
  partyBossService?: Pick<PartyBossService, "forceBigBarrelWinForTelegramUser">
): void {
  bot.command("dev_reset_me", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    await ctx.reply(presentDevResetPrompt(), {
      reply_markup: buildDevResetKeyboard()
    });
  });

  bot.command("dev_adventure_reset", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    if (!adventureService) {
      await ctx.reply(presentDevAdventureResetResult("unavailable"));
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

    if (!telegramUserId) {
      await ctx.reply(presentDevAdventureResetResult("no-character"));
      return;
    }

    const result = await adventureService.resetCurrentPeriodForTelegramUser(telegramUserId);

    await ctx.reply(presentDevAdventureResetResult(result.state));
  });

  bot.command("dev_reset_korchma_round", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    if (!dailyKorchmaRoundService) {
      await ctx.reply(presentDevKorchmaRoundResetResult("unavailable"));
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

    if (!telegramUserId) {
      await ctx.reply(presentDevKorchmaRoundResetResult("no-character"));
      return;
    }

    const result = await dailyKorchmaRoundService.resetTodayForDev(telegramUserId);

    await ctx.reply(presentDevKorchmaRoundResetResult(result));
  });

  bot.command("dev_raid_stop", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    if (!tavernRaidService) {
      await ctx.reply(presentDevRaidStopResult({ state: "unavailable" }));
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

    if (!telegramUserId) {
      await ctx.reply(presentDevRaidStopResult({ state: "no-character" }));
      return;
    }

    const result = await tavernRaidService.stopPendingFridayBarrelRaidForDev(telegramUserId);

    await ctx.reply(presentDevRaidStopResult(result));
    if (result.state === "completed") {
      const levelUpText = presentLevelUpCelebration(
        result.result.levelChange,
        result.result.character.classId,
        {
          raceId: result.result.character.raceId,
          path: result.result.character.path
        }
      );

      if (levelUpText) {
        await ctx.reply(levelUpText, { parse_mode: "HTML" });
      }
    }
  });

  bot.command("dev_raid_reset", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    if (!tavernRaidService) {
      await ctx.reply(presentDevRaidResetResult({ state: "unavailable" }));
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

    if (!telegramUserId) {
      await ctx.reply(presentDevRaidResetResult({ state: "no-character" }));
      return;
    }

    const result = await tavernRaidService.resetFridayBarrelRaidForDev(telegramUserId);

    await ctx.reply(presentDevRaidResetResult(result));
  });

  bot.command("dev_raid_win", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    if (!partyBossService) {
      await ctx.reply(presentDevRaidWinResult({ state: "unavailable" }));
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

    if (!telegramUserId) {
      await ctx.reply(presentDevRaidWinResult({ state: "no-character" }));
      return;
    }

    const result = await partyBossService.forceBigBarrelWinForTelegramUser(telegramUserId);

    await ctx.reply(presentDevRaidWinResult(result));
  });

  bot.command("dev_reset_monster_rest", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    if (!fightService) {
      await ctx.reply(presentDevMonsterRestResetResult({ state: "unavailable" }));
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

    if (!telegramUserId) {
      await ctx.reply(presentDevMonsterRestResetResult({ state: "no-character" }));
      return;
    }

    const result = await fightService.resetMonsterRestCooldownForDev(telegramUserId);

    await ctx.reply(presentDevMonsterRestResetResult(result));
  });

  bot.command("dev_two_enemies", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    if (!fightService) {
      await ctx.reply("Dev-бій із двома ворогами зараз недоступний.");
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

    if (!telegramUserId) {
      await ctx.reply(presentFightNoCharacter());
      return;
    }

    const result = await fightService.getOrStartPersistentFightForTelegramUser(telegramUserId, {
      enemyCount: 2,
      devBypassAvailability: true,
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
    });

    if (result.state === "no-character") {
      await ctx.reply(presentFightNoCharacter());
      return;
    }

    if (result.state === "persistent-active") {
      if (result.started) {
        await ctx.reply(presentPersistentFightIntro(result), { parse_mode: "HTML" });
      }
      const activeMessage = await ctx.reply(presentPersistentFight(result), {
        parse_mode: "HTML",
        reply_markup: buildPersistentFightResultKeyboard(result.session, result.character)
      });
      if (ctx.chat?.id && activeMessage.message_id) {
        await fightService.recordPersistentFightMessageReference(telegramUserId, result.session.id, {
          chatId: String(ctx.chat.id),
          messageId: activeMessage.message_id
        });
      }
      return;
    }

    await ctx.reply("Dev-бій не стартував: спершу завершіть або відновіть поточний бій.");
  });
}
