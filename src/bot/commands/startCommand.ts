import type { Bot, Context } from "grammy";
import type { DuelChallengeService } from "../../services/duelChallengeService";
import type { OnboardingService } from "../../services/onboardingService";
import type { PartyBossService } from "../../services/partyBossService";
import type { PartySessionService } from "../../services/partySessionService";
import type { TavernGameService } from "../../services/tavernGameService";
import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  type PresenceService
} from "../../services/presenceService";
import type { TelegramUserProfile } from "../../db/repositories/userRepository";
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
import {
  presentDuelAccept,
  presentDuelView,
  presentTurnBasedDuel,
  presentTurnBasedDuelIntro
} from "../presenters/duelPresenter";
import { presentHero } from "../presenters/heroPresenter";
import { presentWelcome } from "../presenters/onboardingPresenter";
import { presentSupportThanks } from "../presenters/supportPresenter";
import { presentTavernGameActionResult } from "../presenters/tavernGamePresenter";
import { parseStartPayload } from "../startPayload";
import { sendPartyJoinFromStartPayload } from "./partySessionCommand";
import {
  buildTavernGameActionKeyboard,
  buildTavernGameInviteUrl,
  notifyTavernGameParticipants
} from "../tavernGameNotifications";

export interface StartCommandOptions {
  duel?: DuelChallengeService;
  partyBoss?: PartyBossService;
  partySessions?: PartySessionService;
  tavernGames?: TavernGameService;
  presence?: PresenceService;
  botUsername?: string | undefined;
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

    if (payload.type === "party" && options.partySessions) {
      if (await sendPartyJoinFromStartPayload(ctx, options.partySessions, payload.token, {
        botUsername: options.botUsername,
        partyBoss: options.partyBoss
      })) {
        return;
      }
    }

    if (payload.type === "tavern-game" && options.tavernGames) {
      await sendTavernGameJoinFromStartPayload(
        ctx,
        onboardingService,
        options.tavernGames,
        player,
        payload.token,
        {
          botUsername: options.botUsername,
          ...(options.presence ? { presence: options.presence } : {})
        }
      );
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
        if (result.transitioned) {
          await ctx.reply(presentTurnBasedDuelIntro(result), {
            parse_mode: "HTML"
          });
        }
        const viewerCharacterId = isPrivateChat(ctx)
          ? getTurnBasedDuelViewerCharacterId(player.telegramUserId, result)
          : null;
        const participant = viewerCharacterId === result.session.state.participants.target.characterId
          ? result.session.state.participants.target
          : result.session.state.participants.challenger;
        const skill = getCombatSkillDisplay(getCombatSkillProfile(participant.combatStats.classId).id);

        await ctx.reply(presentTurnBasedDuel(result, { viewerCharacterId }), {
          parse_mode: "HTML",
          reply_markup: buildTurnBasedDuelKeyboard(
            result,
            viewerCharacterId,
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

export async function sendTavernGameJoinFromStartPayload(
  ctx: Context,
  onboardingService: OnboardingService,
  tavernGames: TavernGameService,
  player: TelegramUserProfile,
  token: string,
  options: { botUsername?: string | undefined; presence?: PresenceService | undefined } = {}
): Promise<void> {
  let result = await tavernGames.joinByTokenForTelegramUser(player.telegramUserId, token);
  if (result.state === "blocked" && result.reason === "wrong-place" && options.presence) {
    await options.presence.markAction({
      user: player,
      locationId: PRESENCE_LOCATION_KORCHMA_BAR
    });
    result = await tavernGames.joinByTokenForTelegramUser(player.telegramUserId, token);
  }

  if (result.state === "no-character") {
    await onboardingService.start(player);
    await ctx.reply(presentTavernGameActionResult(result), {
      parse_mode: "HTML",
      reply_markup: buildGenderKeyboard()
    });
    return;
  }

  const inviteUrl = "session" in result
    ? buildTavernGameInviteUrl(options.botUsername, result.session.token)
    : null;
  await ctx.reply(presentTavernGameActionResult({
    ...result,
    viewerTelegramUserId: player.telegramUserId
  }), {
    parse_mode: "HTML",
    ...("session" in result
      ? {
          reply_markup: buildTavernGameActionKeyboard(result, player.telegramUserId, { inviteUrl })
        }
      : {})
  });
  await notifyTavernGameParticipants(ctx, result, player.telegramUserId, {
    botUsername: options.botUsername
  });
}

function getTurnBasedDuelViewerCharacterId(
  telegramUserId: bigint,
  result: Extract<Awaited<ReturnType<NonNullable<StartCommandOptions["duel"]>["acceptForTelegramUser"]>>, { state: "active" }>
): string | null {
  if (result.challenge.challenger.telegramUserId === telegramUserId) {
    return result.session.challengerCharacterId;
  }

  if (result.challenge.target?.telegramUserId === telegramUserId) {
    return result.session.targetCharacterId;
  }

  return null;
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

function isPrivateChat(ctx: Context): boolean {
  return ctx.chat?.type === "private";
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
