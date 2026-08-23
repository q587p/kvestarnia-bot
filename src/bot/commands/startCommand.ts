import type { Bot, Context } from "grammy";
import type { DuelChallengeService } from "../../services/duelChallengeService";
import type { GroupCombatService } from "../../services/groupCombatService";
import type { OnboardingService } from "../../services/onboardingService";
import type { PartyBossService } from "../../services/partyBossService";
import type { PartyRaidChatService } from "../../services/partyRaidChatService";
import type { PartySessionService } from "../../services/partySessionService";
import type { TavernGameService } from "../../services/tavernGameService";
import type { GuildService } from "../../services/guildService";
import type { ReferralService } from "../../services/referralService";
import type { FightService } from "../../services/fightService";
import type { TrainingDoppelgangerService } from "../../services/trainingDoppelgangerService";
import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  type PresenceService
} from "../../services/presenceService";
import type { TelegramUserProfile } from "../../db/repositories/userRepository";
import { playerFromContext } from "../context";
import {
  buildDuelAcceptConfirmationKeyboard,
  buildDuelChallengeKeyboard,
  buildDuelOwnerChallengeKeyboard,
  buildDuelResourceWarningKeyboard,
  buildDuelResultKeyboard
} from "../keyboards/duelKeyboard";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { buildFightResultKeyboard, buildPersistentFightResultKeyboard } from "../keyboards/fightKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "../keyboards/trainingDoppelgangerKeyboard";
import { buildReferralCaptureRetryKeyboard } from "../keyboards/referralKeyboard";
import { buildGenderKeyboard } from "../keyboards/onboardingKeyboard";
import { getReferralCaptureResult } from "../middleware/registerReferralMiddleware";
import {
  presentDuelAccept,
  presentDuelView,
  presentTurnBasedDuelIntro
} from "../presenters/duelPresenter";
import { presentHero } from "../presenters/heroPresenter";
import { presentWelcome } from "../presenters/onboardingPresenter";
import {
  presentReferralCaptureOutcome,
  presentReferralCaptureRetry
} from "../presenters/referralPresenter";
import { presentSupportThanks } from "../presenters/supportPresenter";
import {
  presentPersistentFightSnapshot,
  presentPublicMimicShawarmaResult
} from "../presenters/fightPresenter";
import { presentTrainingDoppelganger } from "../presenters/trainingDoppelgangerPresenter";
import { presentTavernGameActionResult } from "../presenters/tavernGamePresenter";
import { parseStartPayload } from "../startPayload";
import { buildTerminalBattleArtifactUrl } from "../terminalBattleArtifactLink";
import { sendPartyJoinFromStartPayload } from "./partySessionCommand";
import { sendGuildInviteFromTargetCode } from "./guildCommand";
import {
  buildTavernGameActionKeyboard,
  buildTavernGameInviteUrl,
  notifyTavernGameParticipants
} from "../tavernGameNotifications";
import {
  showCanonicalTurnBasedDuelCard,
  showCanonicalTurnBasedDuelResultCard
} from "../turnBasedDuelCardDelivery";

export interface StartCommandOptions {
  duel?: DuelChallengeService;
  partyBoss?: PartyBossService;
  partyRaidChat?: PartyRaidChatService;
  partySessions?: PartySessionService;
  groupCombat?: GroupCombatService;
  tavernGames?: TavernGameService;
  guilds?: GuildService;
  referrals?: ReferralService;
  fight?: FightService;
  trainingDoppelganger?: TrainingDoppelgangerService;
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

    if (payload.type === "terminal-battle-artifact") {
      await sendTerminalBattleArtifactFromStartPayload(ctx, payload, options);
      return;
    }

    if (payload.type === "unknown" && /^ba1(?:_|$)/i.test(payload.raw)) {
      await replyTerminalBattleArtifactNotFound(ctx);
      return;
    }

    if (payload.type === "referral" && options.referrals) {
      const capture = getReferralCaptureResult(ctx);
      if (capture?.state === "pending") {
        try {
          const resolved = await options.referrals.resolvePendingReferral(player.telegramUserId);
          if (resolved.state === "not-found") {
            await ctx.reply(presentReferralCaptureRetry(), {
              reply_markup: buildReferralCaptureRetryKeyboard(
                options.referrals.getReferralRetryUrl(payload.token)
              )
            });
            return;
          }
        } catch {
          await ctx.reply(presentReferralCaptureRetry(), {
            reply_markup: buildReferralCaptureRetryKeyboard(
              options.referrals.getReferralRetryUrl(payload.token)
            )
          });
          return;
        }
      }
      const outcome = capture?.state ?? "existing-user";
      if (
        outcome === "existing-user" ||
        outcome === "self" ||
        outcome === "not-found" ||
        outcome === "disabled" ||
        outcome === "accepted" ||
        outcome === "declined"
      ) {
        await ctx.reply(presentReferralCaptureOutcome(outcome));
      }
    } else if (
      payload.type === "unknown" &&
      payload.safe &&
      payload.raw.startsWith("ref1_")
    ) {
      await ctx.reply(presentReferralCaptureOutcome("not-found"));
    }

    if (payload.type === "none" && options.referrals) {
      try {
        await options.referrals.resolvePendingReferral(player.telegramUserId);
      } catch {
        await ctx.reply(presentReferralCaptureRetry());
        return;
      }
    }

    if ((payload.type === "party" || payload.type === "left-passage-attack") && options.partySessions) {
      if (await sendPartyJoinFromStartPayload(ctx, options.partySessions, payload.token, {
        botUsername: options.botUsername,
        partyBoss: options.partyBoss,
        partyRaidChat: options.partyRaidChat,
        groupCombat: options.groupCombat,
        requireLeftPassage: payload.type === "left-passage-attack"
      })) {
        return;
      }
    }

    if (payload.type === "guild-invite" && options.guilds) {
      await sendGuildInviteFromTargetCode(ctx, options.guilds, player.telegramUserId, payload.token);
      return;
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
      const terminal = await options.duel.getTerminalResultByToken(payload.token);
      if (terminal.state === "resolved") {
        await ctx.reply(presentDuelView(terminal, { inviteUrl: null }), {
          parse_mode: "HTML",
          reply_markup: buildDuelResultKeyboard(terminal.challenge.inviteToken, terminal.challenge.mode)
        });
        return;
      }
      if (terminal.state === "not-found") {
        await ctx.reply("Виклик не знайшовся.");
        return;
      }
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

      if (result.state === "self-challenge") {
        await ctx.reply(presentDuelAccept(result), {
          parse_mode: "HTML",
          reply_markup: buildDuelOwnerChallengeKeyboard(result.challenge.inviteToken)
        });
        return;
      }

      if (result.state === "active") {
        if (result.transitioned) {
          await ctx.reply(presentTurnBasedDuelIntro(result), {
            parse_mode: "HTML"
          });
        }
        await showCanonicalTurnBasedDuelCard(ctx, result, options.duel, "reply");
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

      if (result.state === "resolved" && result.challenge.mode === "turn-based") {
        const session = await options.duel.getTurnBasedSessionByToken(result.challenge.inviteToken);
        if (session) {
          await showCanonicalTurnBasedDuelResultCard(
            ctx,
            result,
            session,
            options.duel,
            "reply"
          );
          return;
        }
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
      const guildHub = options.guilds
        ? await options.guilds.getHubForTelegramUser(player.telegramUserId)
        : null;
      await ctx.reply(presentHero(result.character, {
        guild: guildHub?.state === "ready"
          ? { crest: guildHub.guild.crest, displayName: guildHub.guild.displayName }
          : null
      }), buildExistingCharacterReplyOptions());
      return;
    }

    await ctx.reply(presentWelcome(), {
      parse_mode: "HTML" as const,
      reply_markup: buildGenderKeyboard()
    });
  });
}

async function sendTerminalBattleArtifactFromStartPayload(
  ctx: Context,
  payload: Extract<ReturnType<typeof parseStartPayload>, { type: "terminal-battle-artifact" }>,
  options: StartCommandOptions
): Promise<void> {
  const artifactUrl = buildTerminalBattleArtifactUrl(
    options.botUsername,
    payload.kind,
    payload.token
  );

  if (payload.kind === "solo" && options.fight) {
    const result = await options.fight.getPublicTerminalFightArtifact(payload.token);
    if (result.state === "found") {
      await ctx.reply(presentPersistentFightSnapshot(result), {
        parse_mode: "HTML",
        reply_markup: buildPersistentFightResultKeyboard(result.session, result.character, { artifactUrl })
      });
      return;
    }
  } else if (payload.kind === "training" && options.trainingDoppelganger) {
    const result = await options.trainingDoppelganger.getPublicTerminalArtifact(payload.token);
    if (result.state === "ready") {
      await ctx.reply(presentTrainingDoppelganger({
        state: "terminal",
        character: result.character,
        doppelganger: result.doppelganger,
        session: result.session,
        reward: null
      }), {
        parse_mode: "HTML",
        reply_markup: buildTrainingDoppelgangerKeyboard(result.session, result.character, { artifactUrl })
      });
      return;
    }
  } else if (payload.kind === "mimic" && options.fight) {
    const result = await options.fight.getPublicMimicShawarmaArtifact(payload.token);
    if (result.state === "ready") {
      await ctx.reply(presentPublicMimicShawarmaResult(result), {
        parse_mode: "HTML",
        reply_markup: buildFightResultKeyboard(
          "already-completed",
          result.character,
          result.artifactToken,
          { artifactUrl }
        )
      });
      return;
    }
  }

  await replyTerminalBattleArtifactNotFound(ctx);
}

async function replyTerminalBattleArtifactNotFound(ctx: Context): Promise<void> {
  await ctx.reply("Бойовий запис не знайшовся або ще не готовий до перегляду.");
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
