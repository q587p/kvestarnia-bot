import type { Bot } from "grammy";
import type { DuelChallengeService } from "../../services/duelChallengeService";
import type { OnboardingService } from "../../services/onboardingService";
import { playerFromContext } from "../context";
import {
  buildDuelAcceptConfirmationKeyboard,
  buildDuelChallengeKeyboard,
  buildDuelResourceWarningKeyboard,
  buildDuelResultKeyboard,
  buildTurnBasedDuelKeyboard
} from "../keyboards/duelKeyboard";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { buildGenderKeyboard } from "../keyboards/onboardingKeyboard";
import { getCombatSkillDisplay } from "../../services/fightService";
import { getCombatSkillProfile } from "../../domain/combat";
import { presentDuelAccept, presentDuelView, presentTurnBasedDuel } from "../presenters/duelPresenter";
import { presentHero } from "../presenters/heroPresenter";
import { presentWelcome } from "../presenters/onboardingPresenter";
import { presentSupportThanks } from "../presenters/supportPresenter";
import { parseStartPayload } from "../startPayload";

export interface StartCommandOptions {
  duel?: DuelChallengeService;
  duelBotUsername?: string | undefined;
}

export function registerStartCommand(
  bot: Bot,
  onboardingService: OnboardingService,
  options: StartCommandOptions = {}
): void {
  bot.command("start", async (ctx) => {
    const payload = parseStartPayload(typeof ctx.match === "string" ? ctx.match : undefined);

    if (payload.type === "support-thanks") {
      await ctx.reply(presentSupportThanks(), {
        parse_mode: "HTML"
      });
      return;
    }

    const player = playerFromContext(ctx.from);

    if (!player) {
      await ctx.reply("Квестарня не впізнала мандрівника. Спробуйте ще раз із особистого акаунта.");
      return;
    }

    if (payload.type === "duel" && options.duel) {
      const result = await options.duel.acceptForTelegramUser(player.telegramUserId, payload.token, {
        expectedMode: payload.mode ?? "quick"
      });

      if (result.state === "no-character") {
        await onboardingService.start(player);
        await ctx.reply(presentDuelAccept(result), {
          parse_mode: "HTML",
          reply_markup: buildGenderKeyboard()
        });
        return;
      }

      if (result.state === "pending") {
        await ctx.reply(presentDuelView(result, { inviteUrl: buildDuelInviteUrl(options.duelBotUsername, result.challenge.inviteToken, result.challenge.mode) }), {
          parse_mode: "HTML",
          reply_markup: buildDuelChallengeKeyboard(result)
        });
        return;
      }

      if (result.state === "active") {
        const actor = result.session.state.actingCharacterId === result.session.state.participants.challenger.characterId
          ? result.session.state.participants.challenger
          : result.session.state.participants.target;
        const skill = getCombatSkillDisplay(getCombatSkillProfile(actor.combatStats.classId).id);

        await ctx.reply(presentTurnBasedDuel(result), {
          parse_mode: "HTML",
          reply_markup: buildTurnBasedDuelKeyboard(
            result,
            result.challenge.challenger.telegramUserId === player.telegramUserId
              ? result.session.challengerCharacterId
              : result.challenge.target?.telegramUserId === player.telegramUserId
                ? result.session.targetCharacterId
                : null,
            `${skill.icon} ${skill.name}`
          )
        });
        return;
      }

      if (result.state === "resource-warning") {
        await ctx.reply(presentDuelAccept(result), {
          parse_mode: "HTML",
          reply_markup: buildDuelResourceWarningKeyboard(result.challenge.inviteToken)
        });
        return;
      }

      if (result.state === "confirmation") {
        await ctx.reply(presentDuelAccept(result), {
          parse_mode: "HTML",
          reply_markup: buildDuelAcceptConfirmationKeyboard(result.challenge.inviteToken)
        });
        return;
      }

      await ctx.reply(
        result.state === "not-found" ? "Виклик не знайшовся." : presentDuelAccept(result),
        {
          parse_mode: "HTML",
          reply_markup: buildDuelResultKeyboard(
            result.state === "resolved" ? result.challenge.inviteToken : undefined
          )
        }
      );
      return;
    }

    const result = await onboardingService.start(player);

    if (result.state === "existing-character") {
      await ctx.reply(presentHero(result.character), buildExistingCharacterReplyOptions());
      return;
    }

    await ctx.reply(presentWelcome(), {
      parse_mode: "HTML" as const,
      reply_markup: buildGenderKeyboard()
    });
  });
}

function buildDuelInviteUrl(
  botUsername: string | undefined,
  token: string,
  mode: "quick" | "turn-based" = "quick"
): string | null {
  if (!botUsername) {
    return null;
  }

  return `https://t.me/${botUsername}?start=${mode === "turn-based" ? "duel_turnbased_" : "duel_"}${token}`;
}

export function buildExistingCharacterReplyOptions(): {
  parse_mode: "HTML";
  reply_markup: ReturnType<typeof buildMainMenuKeyboard>;
} {
  return {
    parse_mode: "HTML",
    reply_markup: buildMainMenuKeyboard()
  };
}
