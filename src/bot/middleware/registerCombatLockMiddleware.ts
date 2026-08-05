import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { BotServices } from "../botServices";
import {
  PRESENCE_ADVENTURE_DUEL_CHALLENGE,
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_ADVENTURE_SOLO_FIGHT,
  PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import type { FightService } from "../../services/fightService";
import { playerFromContext } from "../context";
import {
  buildFightKeyboard,
  buildPersistentFightResultKeyboard,
  resolvePersistentFightPresenceLocation
} from "../keyboards/fightKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "../keyboards/trainingDoppelgangerKeyboard";
import { buildPartyBossKeyboard } from "../keyboards/partySessionKeyboard";
import { isMainMenuLocationButtonText, mainMenuButtons, mainMenuQuestButtonTexts } from "../keyboards/mainMenuKeyboard";
import { getCallbackMessageFreshness } from "../messageFreshness";
import { editPendingRaidBlockIfNeeded } from "./pendingRaidGuard";
import { presentFightStart, presentPersistentFight } from "../presenters/fightPresenter";
import { presentTrainingDoppelganger } from "../presenters/trainingDoppelgangerPresenter";
import { presentTurnBasedDuel } from "../presenters/duelPresenter";
import { presentPartyBoss } from "../presenters/partySessionPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { showCanonicalTurnBasedDuelCard } from "../turnBasedDuelCardDelivery";
import { parseDuelCallbackData } from "../callbacks/duelCallbackData";
import { parseStartPayload } from "../startPayload";
import type { DuelChallengeView } from "../../services/duelChallengeService";
import {
  classifyTurnBasedDuelRoute,
  isTurnBasedDuelCardCallback,
  rememberTurnBasedDuelRouteClassification
} from "../turnBasedDuelRouteClassification";
import { beginUpdateComponent, memoizeUpdateRead } from "../updatePerformanceTrace";
import {
  deliverGroupCombatParticipantCard,
  deliverGroupCombatParticipantExitNavigation
} from "../groupCombatCardDelivery";
import type { ActiveCombatLeaseRecord } from "../../db/repositories/combatLeaseReadRepository";
import type {
  GroupCombatParticipantRecord,
  GroupCombatSessionRecord
} from "../../db/repositories/groupCombatRepository";
import {
  GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND,
  GROUP_COMBAT_LEASE_KIND,
  PARTY_BOSS_LEASE_KIND,
  SOLO_COMBAT_LEASE_KIND,
  TURN_BASED_DUEL_LEASE_KIND
} from "../../domain/combat/combatLeaseRegistry";
import { GROUP_COMBAT_CALLBACK_ROUTE_PATTERN } from "../callbacks/groupCombatCallbackData";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerCombatLockMiddleware(bot: Bot, services: BotServices): void {
  bot.use(async (ctx, next) => {
    const measurement = beginUpdateComponent("combatLock");
    try {
      const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
      const callbackData = ctx.callbackQuery?.data;

      if (!telegramUserId) {
        measurement.end();
        await next();
        return;
      }

      if (
        callbackData?.startsWith("v1:rm:") &&
        typeof services.tavern.getActivePendingFridayBarrelRaidForTelegramUser === "function" &&
        (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern))
      ) {
        return;
      }

      if (isRestartOrRemortRoute(ctx)) {
        const lease = await getAuthoritativeCombatLease(telegramUserId, services);
        if (services.combatLeases && lease) {
          if (lease.kind === TURN_BASED_DUEL_LEASE_KIND) {
            if (await redirectTurnBasedDuelLockIfNeeded(
              ctx,
              telegramUserId,
              services,
              { refreshPresence: true },
              lease
            )) {
              return;
            }
            await handleInconsistentAuthoritativeCombatLease(ctx);
            return;
          }
          if (!(await isAuthoritativeCombatLeaseOwnerConsistent(
            telegramUserId,
            services,
            lease
          ))) {
            await handleInconsistentAuthoritativeCombatLease(ctx);
            return;
          }
        } else if (
          !services.combatLeases &&
          await redirectTurnBasedDuelLockIfNeeded(
            ctx,
            telegramUserId,
            services,
            { refreshPresence: true },
            undefined
          )
        ) {
          return;
        }
      }

      const parsedDuelCallback = parseDuelCallbackData(callbackData);
      const cardRoute = parsedDuelCallback.ok && services.duel
        ? await classifyTurnBasedDuelRoute(
            ctx,
            parsedDuelCallback.value,
            telegramUserId,
            services.duel
          )
        : null;
      const preservesHistoricalCanonicalSource =
        cardRoute?.state === "resolved" && cardRoute.sourceIsCanonical;

      const duelRouteToken = getDuelRouteToken(ctx);
      const duelRouteLease = duelRouteToken
        ? await getAuthoritativeCombatLease(telegramUserId, services)
        : undefined;
      const precheckedActiveDuel = duelRouteToken &&
        (!services.combatLeases || duelRouteLease?.kind === TURN_BASED_DUEL_LEASE_KIND)
        ? await getActiveTurnBasedDuel(
            telegramUserId,
            services,
            duelRouteLease ?? undefined
          )
        : undefined;
      if (duelRouteToken && precheckedActiveDuel?.challenge.inviteToken === duelRouteToken) {
        if (
          parsedDuelCallback.ok &&
          cardRoute?.state === "active" &&
          isTurnBasedDuelCardCallback(parsedDuelCallback.value)
        ) {
          rememberTurnBasedDuelRouteClassification(ctx, cardRoute);
        }
        measurement.end();
        await next();
        return;
      }

      if (
        parsedDuelCallback.ok &&
        cardRoute?.state === "active" &&
        cardRoute.sourceIsCanonical &&
        isTurnBasedDuelCardCallback(parsedDuelCallback.value)
      ) {
        rememberTurnBasedDuelRouteClassification(ctx, cardRoute);
        measurement.end();
        await next();
        return;
      }

      if (!shouldCheckCombatLock(ctx)) {
        measurement.end();
        await next();
        return;
      }

      if (
        (ctx.callbackQuery || isDuelRoute(ctx) || isGuildTextRoute(ctx)) &&
        !isPendingRaidSafeCallback(callbackData) &&
        typeof services.tavern.getActivePendingFridayBarrelRaidForTelegramUser === "function" &&
        (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern, {
          preserveCallbackSource: preservesHistoricalCanonicalSource
        }))
      ) {
        return;
      }

      if (await redirectCombatLockIfNeeded(ctx, telegramUserId, services, {
        refreshPresence: !isDuelRoute(ctx),
        preserveCallbackSource: preservesHistoricalCanonicalSource,
        ...(duelRouteToken ? { activeDuel: precheckedActiveDuel ?? null } : {})
      })) {
        return;
      }

      measurement.end();
      await next();
    } finally {
      measurement.end();
    }
  });
}

function shouldCheckCombatLock(ctx: Context): boolean {
  const data = ctx.callbackQuery?.data;

  if (data) {
    return (
      !data.startsWith("v1:fight:turn:") &&
      !data.startsWith("v1:fight:item:") &&
      !data.startsWith("v1:fight:items:") &&
      !data.startsWith("v1:fight:gear:") &&
      !data.startsWith("v1:spar:turn:") &&
      !data.startsWith("v1:party:ba:") &&
      !data.startsWith("v1:party:bg:") &&
      !data.startsWith("v1:party:bm:") &&
      !data.startsWith("v1:party:bi:") &&
      !data.startsWith("v1:party:bt:") &&
      !data.startsWith("v1:party:rc:") &&
      !data.startsWith("v1:party:rw:") &&
      !GROUP_COMBAT_CALLBACK_ROUTE_PATTERN.test(data) &&
      !data.startsWith("v1:fight:mimic:") &&
      !isCombatLockSafeCallback(data)
    );
  }

  const text = ctx.message?.text?.trim();
  const command = text?.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+.*)?$/i)?.[1]?.toLowerCase();

  if (command) {
    return !isCombatLockSafeCommand(command);
  }

  return isLockedMainMenuText(text);
}

function isCombatLockSafeCallback(data: string): boolean {
  return (
    data === "v1:menu:hero" ||
    data === "v1:menu:help" ||
    data.startsWith("v1:help:") ||
    data.startsWith("v1:dh:") ||
    data === "v1:menu:inventory" ||
    data.startsWith("v1:item:") ||
    data.startsWith("v1:up:") ||
    data.startsWith("v1:use:") ||
    data.startsWith("v1:equip:") ||
    data.startsWith("v1:party:v:") ||
    data.startsWith("v1:party:bj:") ||
    data.startsWith("v1:restart:") ||
    data.startsWith("v1:rm:")
  );
}

function isPendingRaidSafeCallback(data: string | undefined): boolean {
  return (
    data === "v1:tavern:raid-leaderboard" ||
    data === "v1:tavern:raid-news" ||
    data?.startsWith("v1:news:r") === true
  );
}

function isCombatLockSafeCommand(command: string): boolean {
  return (
    command === "help" ||
    command === "cancel_raid_chat" ||
    command === "dev_raid_chat" ||
    command === "version" ||
    command === "hero" ||
    command === "profile" ||
    command === "me" ||
    command === "inventory" ||
    command === "items" ||
    command === "bag" ||
    command === "equipment" ||
    command === "gear" ||
    command === "equip" ||
    command === "dev_heal" ||
    command === "dev_restore_mana" ||
    command === "dev_add_bandage" ||
    command === "dev_add_dense_bandage" ||
    command === "dev_add_field_kit" ||
    command === "dev_add_iskrokamin" ||
    command === "dev_finish_attunements" ||
    command === "dev_add_yeger_line" ||
    command === "dev_reset_yeger_trail" ||
    command === "dev_reset_cellar_mouse" ||
    command === "dev_reset_priest_blessing" ||
    command === "dev_reset_quiet_pocket" ||
    command === "dev_reset_bureaucramancer_protocol" ||
    command === "dev_reset_rogue" ||
    command === "dev_yeger_first_done" ||
    command === "dev_yeger_second_done" ||
    command === "dev_raid_win" ||
    command === "dev_group_combat" ||
    command === "dev_group_combat_timeout" ||
    command === "online" ||
    command === "look" ||
    command === "restart" ||
    command === "remort" ||
    command === "support"
  );
}

function isDuelStartRoute(text: string | undefined): boolean {
  return /^\/start(?:@\w+)?\s+duel_(?:turnbased_)?[A-Za-z0-9_-]+$/i.test(text ?? "");
}

function isDuelRoute(ctx: Context): boolean {
  const text = ctx.message?.text?.trim();
  return (
    ctx.callbackQuery?.data?.startsWith("v1:duel:") === true ||
    isDuelStartRoute(text) ||
    /^\/duel(?:@\w+)?(?:\s|$)/i.test(text ?? "")
  );
}

function getDuelRouteToken(ctx: Context): string | null {
  const callback = parseDuelCallbackData(ctx.callbackQuery?.data);
  if (callback.ok && "token" in callback.value) {
    return callback.value.token;
  }

  const text = ctx.message?.text?.trim();
  const startPayload = text?.match(/^\/start(?:@\w+)?\s+(.+)$/i)?.[1];
  const parsedPayload = parseStartPayload(startPayload);
  return parsedPayload.type === "duel" ? parsedPayload.token : null;
}

async function getActiveTurnBasedDuel(
  telegramUserId: bigint,
  services: BotServices,
  authoritativeLease?: ActiveCombatLeaseRecord
): Promise<Extract<DuelChallengeView, { state: "active" }> | null> {
  if (!services.duel || typeof services.duel.getActiveTurnBasedForTelegramUser !== "function") {
    return null;
  }

  return authoritativeLease
    ? services.duel.getActiveTurnBasedByIdForCharacterId(
        authoritativeLease.referenceId,
        authoritativeLease.characterId
      )
    : services.duel.getActiveTurnBasedForTelegramUser(telegramUserId);
}

function isRestartOrRemortRoute(ctx: Context): boolean {
  const data = ctx.callbackQuery?.data;

  if (data) {
    return data.startsWith("v1:restart:") || data.startsWith("v1:rm:");
  }

  const text = ctx.message?.text?.trim();
  const command = text?.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+.*)?$/i)?.[1]?.toLowerCase();

  return command === "restart" || command === "remort";
}

function isLockedMainMenuText(text: string | undefined): boolean {
  return (
    isMainMenuLocationButtonText(text) ||
    (text !== undefined && (mainMenuQuestButtonTexts.includes(text) || text === mainMenuButtons.guild))
  );
}

function isGuildTextRoute(ctx: Context): boolean {
  const text = ctx.message?.text?.trim();
  return text === mainMenuButtons.guild || /^\/guild(?:@\w+)?(?:\s|$)/i.test(text ?? "");
}

async function redirectCombatLockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices,
  options: {
    refreshPresence: boolean;
    preserveCallbackSource?: boolean;
    activeDuel?: Extract<DuelChallengeView, { state: "active" }> | null;
  } = { refreshPresence: true }
): Promise<boolean> {
  if (services.combatLeases) {
    const lease = await getAuthoritativeCombatLease(telegramUserId, services);

    if (lease?.kind === TURN_BASED_DUEL_LEASE_KIND) {
      const handled = await redirectTurnBasedDuelLockIfNeeded(
        ctx,
        telegramUserId,
        services,
        options,
        lease
      );
      return handled || handleInconsistentAuthoritativeCombatLease(ctx);
    }

    if (lease?.kind === PARTY_BOSS_LEASE_KIND) {
      const handled = await redirectPartyBossLockIfNeeded(
        ctx,
        telegramUserId,
        services,
        options,
        lease
      );
      return handled || handleInconsistentAuthoritativeCombatLease(ctx);
    }

    if (lease?.kind === GROUP_COMBAT_LEASE_KIND) {
      const handled = await redirectGroupCombatLockIfNeeded(
        ctx,
        telegramUserId,
        services,
        lease
      );
      return handled || handleInconsistentAuthoritativeCombatLease(ctx);
    }

    if (lease?.kind === GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND) {
      const handled = await resumeGroupCombatExitNavigationIfNeeded(
        ctx,
        telegramUserId,
        services,
        lease
      );
      return handled === "completed"
        ? false
        : handled === "busy"
          ? true
          : handleInconsistentAuthoritativeCombatLease(ctx);
    }

    if (lease?.kind === SOLO_COMBAT_LEASE_KIND) {
      const handled = await redirectFightLockIfNeeded(
        ctx,
        telegramUserId,
        services,
        options,
        lease
      );
      return handled || handleInconsistentAuthoritativeCombatLease(ctx);
    }

    if (!lease) {
      if (
        typeof services.fight.getFightOverviewForTelegramUser !== "function" ||
        !(await isStarterFightPresenceActive(services.presence, telegramUserId))
      ) {
        return false;
      }
    }

    if (lease) {
      return handleInconsistentAuthoritativeCombatLease(ctx);
    }

    return redirectFightLockIfNeeded(ctx, telegramUserId, services, options, null);
  }

  if (await redirectTurnBasedDuelLockIfNeeded(ctx, telegramUserId, services, options)) {
    return true;
  }

  if (await redirectPartyBossLockIfNeeded(ctx, telegramUserId, services, options)) {
    return true;
  }

  if (await redirectGroupCombatLockIfNeeded(ctx, telegramUserId, services)) {
    return true;
  }

  return redirectFightLockIfNeeded(ctx, telegramUserId, services, options);
}

async function getAuthoritativeCombatLease(
  telegramUserId: bigint,
  services: BotServices
): Promise<ActiveCombatLeaseRecord | null> {
  if (!services.combatLeases) {
    return null;
  }

  return memoizeUpdateRead(
    `active-combat-lease:${telegramUserId}`,
    () => services.combatLeases!.findActiveForTelegramUser(telegramUserId)
  );
}

async function redirectFightLockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices,
  options: {
    refreshPresence: boolean;
    preserveCallbackSource?: boolean;
  },
  authoritativeLease?: ActiveCombatLeaseRecord | null
): Promise<boolean> {
  if (typeof services.fight.getFightOverviewForTelegramUser !== "function") {
    return false;
  }

  const lock = await memoizeUpdateRead(
    `fight-overview:${telegramUserId}`,
    () => services.fight.getFightOverviewForTelegramUser(telegramUserId, {
      ...(authoritativeLease === undefined ? {} : { authoritativeLease })
    })
  );

  if (lock.state === "persistent-active") {
    await answerCombatLockCallback(ctx);
    if (options.refreshPresence) {
      await refreshCombatLockPresence(ctx, services.presence, {
        locationId: resolvePersistentFightPresenceLocation(lock.session),
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
    }
    const messageId = await sendCombatLockText(ctx, presentCombatLockRedirect(presentPersistentFight(lock)), {
      reply_markup: buildPersistentFightResultKeyboard(lock.session, lock.character),
      preserveCallbackSource: options.preserveCallbackSource
    });
    await recordCombatLockPersistentFightMessage(ctx, services.fight, telegramUserId, lock.session.id, messageId);
    return true;
  }

  if (lock.state === "training-active") {
    const training = services.trainingDoppelganger
      ? await services.trainingDoppelganger.getStartOptionsForTelegramUser(telegramUserId, {
          expiredTurnMode: "skip"
        })
      : null;

    await answerCombatLockCallback(ctx);
    if (options.refreshPresence) {
      await refreshCombatLockPresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
      });
    }

    if (training?.state === "active") {
      await sendCombatLockText(ctx, presentCombatLockRedirect(presentTrainingDoppelganger(training)), {
        reply_markup: buildTrainingDoppelgangerKeyboard(training.session, training.character),
        preserveCallbackSource: options.preserveCallbackSource
      });
      return true;
    }

    if (training?.state === "terminal") {
      await sendCombatLockText(ctx, presentCombatLockRedirect(presentTrainingDoppelganger(training)), {
        reply_markup: buildTrainingDoppelgangerKeyboard(training.session, training.character),
        preserveCallbackSource: options.preserveCallbackSource
      });
      return true;
    }

    await sendCombatLockText(
      ctx,
      "🥊 Тренування вже триває.\n\nСпершу завершіть цей бій, тоді корчма знову відпустить вас до інших справ.",
      {
        reply_markup: buildTrainingDoppelgangerKeyboard(lock.session, lock.character),
        preserveCallbackSource: options.preserveCallbackSource
      }
    );
    return true;
  }

  if (
    lock.state === "ready" &&
    (await isStarterFightPresenceActive(services.presence, telegramUserId))
  ) {
    await answerCombatLockCallback(ctx);
    if (options.refreshPresence) {
      await refreshCombatLockPresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
      });
    }
    await sendCombatLockText(ctx, presentCombatLockRedirect(presentFightStart(lock.character)), {
      reply_markup: buildFightKeyboard(lock.character),
      preserveCallbackSource: options.preserveCallbackSource
    });
    return true;
  }

  return false;
}

async function redirectGroupCombatLockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices,
  authoritativeLease?: ActiveCombatLeaseRecord
): Promise<boolean> {
  const active = authoritativeLease
    ? await getExactGroupCombatOwner(telegramUserId, services, authoritativeLease)
    : await services.groupCombat?.findActiveForTelegramUser(telegramUserId);
  if (!active) {
    return false;
  }
  const viewer = active.participants.find((participant) => participant.telegramUserId === telegramUserId);
  if (!viewer) {
    return false;
  }
  const isPrivate = ctx.chat?.type === "private";
  if (isPrivate) {
    await answerCombatLockCallback(ctx);
  } else if (ctx.callbackQuery) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Доказова сутичка триває в особистій розмові з Квестарнею.",
      show_alert: true
    });
  }
  await deliverGroupCombatParticipantCard(
    ctx.api,
    services.groupCombat!,
    active.id,
    viewer.characterId,
      {
        forceRefresh: true,
        forceReplacement: isPrivate && Boolean(ctx.message)
      }
  );
  if (!isPrivate && !ctx.callbackQuery) {
    await ctx.reply("⚔️ Доказова сутичка триває в особистій розмові з Квестарнею.");
  }
  return true;
}

async function redirectPartyBossLockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices,
  options: { refreshPresence: boolean; preserveCallbackSource?: boolean } = { refreshPresence: true },
  authoritativeLease?: ActiveCombatLeaseRecord
): Promise<boolean> {
  if (!services.partyBoss || typeof services.partyBoss.getActiveForTelegramUser !== "function") {
    return false;
  }

  const active = authoritativeLease
    ? await getExactPartyBossOwner(telegramUserId, services, authoritativeLease)
    : await services.partyBoss.getActiveForTelegramUser(telegramUserId);
  if (!active) {
    return false;
  }

  const viewerCharacterId = active.participants.find((participant) => participant.telegramUserId === telegramUserId)?.id ?? null;
  await answerCombatLockCallback(ctx);
  if (options.refreshPresence) {
    await refreshCombatLockPresence(ctx, services.presence, {
      locationId: active.participants.find((participant) => participant.telegramUserId === telegramUserId)?.currentLocationId ?? PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
      currentRaidId: active.id,
      currentAdventureId: null
    });
  }
  await sendCombatLockText(ctx, presentCombatLockRedirect(presentPartyBoss(active, { viewerCharacterId })), {
    reply_markup: buildPartyBossKeyboard(active, viewerCharacterId, {
      includeCombatItems: await resolvePartyBossCombatItemShortcut(
        services.partyBoss,
        telegramUserId,
        active
      ),
      includeDevTimeout: services.partyBoss.areDevHelpersEnabled(),
      includeRaidChat: services.partyRaidChat?.isEnabled() === true
    }),
    preserveCallbackSource: options.preserveCallbackSource
  });

  return true;
}

async function resolvePartyBossCombatItemShortcut(
  partyBoss: NonNullable<BotServices["partyBoss"]>,
  telegramUserId: bigint,
  session: Parameters<typeof buildPartyBossKeyboard>[0]
): Promise<boolean | undefined> {
  if (session.status !== "active") {
    return undefined;
  }

  return partyBoss.hasCombatItemsForTelegramUser(
    telegramUserId,
    session.partyInviteToken,
    session.turn
  );
}

async function redirectTurnBasedDuelLockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices,
  options: {
    refreshPresence: boolean;
    activeDuel?: Extract<DuelChallengeView, { state: "active" }> | null;
  } = { refreshPresence: true },
  authoritativeLease?: ActiveCombatLeaseRecord
): Promise<boolean> {
  if (!services.duel || typeof services.duel.getActiveTurnBasedForTelegramUser !== "function") {
    return false;
  }

  const activeDuel = "activeDuel" in options
    ? options.activeDuel
    : authoritativeLease
      ? await getExactTurnBasedDuelOwner(services, authoritativeLease)
      : await services.duel.getActiveTurnBasedForTelegramUser(telegramUserId);

  if (!activeDuel) {
    return false;
  }

  await answerCombatLockCallback(ctx);
  if (options.refreshPresence) {
    await refreshCombatLockPresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_DUEL_CHALLENGE
    });
  }
  await showCanonicalTurnBasedDuelCard(
    ctx,
    activeDuel,
    services.duel,
    ctx.callbackQuery ? "edit" : "reply",
    {
      presentActive: (view, viewerCharacterId) => presentCombatLockRedirect(
        presentTurnBasedDuel(view, { viewerCharacterId })
      )
    }
  );

  return true;
}

async function isAuthoritativeCombatLeaseOwnerConsistent(
  telegramUserId: bigint,
  services: BotServices,
  lease: ActiveCombatLeaseRecord
): Promise<boolean> {
  if (lease.kind === SOLO_COMBAT_LEASE_KIND) {
    if (typeof services.fight.getFightOverviewForTelegramUser !== "function") {
      return false;
    }
    const lock = await memoizeUpdateRead(
      `fight-overview:${telegramUserId}`,
      () => services.fight.getFightOverviewForTelegramUser(telegramUserId, {
        authoritativeLease: lease
      })
    );
    return (
      (lock.state === "persistent-active" || lock.state === "training-active") &&
      lock.session.id === lease.referenceId
    );
  }
  if (lease.kind === TURN_BASED_DUEL_LEASE_KIND) {
    return Boolean(await getExactTurnBasedDuelOwner(services, lease));
  }
  if (lease.kind === PARTY_BOSS_LEASE_KIND) {
    return Boolean(await getExactPartyBossOwner(telegramUserId, services, lease));
  }
  if (lease.kind === GROUP_COMBAT_LEASE_KIND) {
    return Boolean(await getExactGroupCombatOwner(telegramUserId, services, lease));
  }
  if (lease.kind === GROUP_COMBAT_EXIT_NAVIGATION_LEASE_KIND) {
    return Boolean(await getExactGroupCombatExitNavigationOwner(
      telegramUserId,
      services,
      lease
    ));
  }
  return false;
}

async function resumeGroupCombatExitNavigationIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices,
  lease: ActiveCombatLeaseRecord
): Promise<"completed" | "busy" | "inconsistent"> {
  const owner = await getExactGroupCombatExitNavigationOwner(
    telegramUserId,
    services,
    lease
  );
  if (!owner || !services.groupCombat) {
    return "inconsistent";
  }
  await answerCombatLockCallback(ctx);
  const completed = await deliverGroupCombatParticipantExitNavigation(
    ctx.api,
    services.groupCombat,
    owner.session.id,
    owner.participant.characterId
  );
  return completed ? "completed" : "busy";
}

async function getExactGroupCombatExitNavigationOwner(
  telegramUserId: bigint,
  services: BotServices,
  lease: ActiveCombatLeaseRecord
): Promise<{
  session: GroupCombatSessionRecord;
  participant: GroupCombatParticipantRecord;
} | null> {
  if (!services.groupCombat || typeof services.groupCombat.findById !== "function") {
    return null;
  }
  const suffix = `:${lease.characterId}`;
  if (!lease.referenceId.endsWith(suffix)) {
    return null;
  }
  const sessionId = lease.referenceId.slice(0, -suffix.length);
  if (!sessionId) {
    return null;
  }
  const session = await memoizeUpdateRead(
    `group-combat-exit-owner:${sessionId}:${lease.characterId}`,
    () => services.groupCombat!.findById(sessionId)
  );
  const participant = session?.participants.find((candidate) =>
    candidate.characterId === lease.characterId &&
    candidate.telegramUserId === telegramUserId &&
    candidate.settlementStatus === "completed" &&
    (
      candidate.exitDeliveryState === "pending" ||
      candidate.exitDeliveryState === "claimed" ||
      candidate.exitDeliveryState === "menu-delivered"
    )
  );
  return session && participant ? { session, participant } : null;
}

async function getExactTurnBasedDuelOwner(
  services: BotServices,
  lease: ActiveCombatLeaseRecord
): Promise<Extract<DuelChallengeView, { state: "active" }> | null> {
  if (
    !services.duel ||
    typeof services.duel.getActiveTurnBasedByIdForCharacterId !== "function"
  ) {
    return null;
  }
  const active = await memoizeUpdateRead(
    `turn-duel-owner:${lease.referenceId}:${lease.characterId}`,
    () => services.duel!.getActiveTurnBasedByIdForCharacterId(
      lease.referenceId,
      lease.characterId
    )
  );
  if (
    !active ||
    active.session.id !== lease.referenceId ||
    (
      active.session.challengerCharacterId !== lease.characterId &&
      active.session.targetCharacterId !== lease.characterId
    )
  ) {
    return null;
  }
  return active;
}

async function getExactPartyBossOwner(
  telegramUserId: bigint,
  services: BotServices,
  lease: ActiveCombatLeaseRecord
) {
  if (
    !services.partyBoss ||
    typeof services.partyBoss.getActiveByPartySessionIdForCharacterId !== "function"
  ) {
    return null;
  }
  const active = await memoizeUpdateRead(
    `party-boss-owner:${lease.referenceId}:${lease.characterId}`,
    () => services.partyBoss!.getActiveByPartySessionIdForCharacterId(
      lease.referenceId,
      lease.characterId
    )
  );
  if (
    !active ||
    active.status !== "active" ||
    active.partySessionId !== lease.referenceId ||
    !active.participants.some(
      (participant) =>
        participant.id === lease.characterId &&
        participant.telegramUserId === telegramUserId
    )
  ) {
    return null;
  }
  return active;
}

async function getExactGroupCombatOwner(
  telegramUserId: bigint,
  services: BotServices,
  lease: ActiveCombatLeaseRecord
) {
  if (!services.groupCombat || typeof services.groupCombat.findById !== "function") {
    return null;
  }
  const active = await memoizeUpdateRead(
    `group-combat-owner:${lease.referenceId}:${lease.characterId}`,
    () => services.groupCombat!.findById(lease.referenceId)
  );
  if (
    !active ||
    active.status !== "active" ||
    !active.participants.some(
      (participant) =>
        participant.characterId === lease.characterId &&
        participant.telegramUserId === telegramUserId
    )
  ) {
    return null;
  }
  return active;
}

async function handleInconsistentAuthoritativeCombatLease(
  ctx: Context
): Promise<true> {
  const text =
    "⚠️ Бойовий запис не збігається з активною сутичкою. Корчма нічого не змінює; спробуйте ще раз трохи згодом.";
  if (ctx.callbackQuery) {
    await safeAnswerCallbackQuery(ctx, {
      text,
      show_alert: true
    });
  } else {
    await ctx.reply(text);
  }
  return true;
}

async function refreshCombatLockPresence(
  ctx: Context,
  presence: PresenceService,
  input: {
    locationId: string;
    currentRaidId: string | null;
    currentAdventureId: string | null;
  }
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presence.markAction({
    user: player,
    ...input
  });
}

async function isStarterFightPresenceActive(
  presence: PresenceService,
  telegramUserId: bigint
): Promise<boolean> {
  if (typeof presence.getCurrentActivityForTelegramUser !== "function") {
    return false;
  }

  const activity = await presence.getCurrentActivityForTelegramUser(telegramUserId);

  return (
    activity.state === "ready" &&
    activity.currentAdventureId === PRESENCE_ADVENTURE_MIMIC_FIGHT
  );
}

function presentCombatLockRedirect(text: string): string {
  return [
    "⚔️ <b>Бій тримає вас за рукав</b>.",
    "Спершу завершіть цю сутичку, тоді корчма знову відкриє двері до інших справ.",
    "",
    text
  ].join("\n");
}

async function answerCombatLockCallback(ctx: Context): Promise<void> {
  if (!ctx.callbackQuery) {
    return;
  }

  await safeAnswerCallbackQuery(ctx, {
    text: "Спершу завершіть бій.",
    show_alert: false
  });
}

async function sendCombatLockText(
  ctx: Context,
  text: string,
  options: { reply_markup: InlineKeyboard; preserveCallbackSource?: boolean | undefined }
): Promise<number | null> {
  const messageOptions = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: options.reply_markup
  };

  if (ctx.callbackQuery && !options.preserveCallbackSource) {
    if (getCallbackMessageFreshness(ctx) === "stale") {
      const message = await ctx.reply(text, messageOptions);
      return message.message_id;
    }

    await safeEditMessageText(ctx, text, messageOptions);
    return ctx.callbackQuery.message?.message_id ?? null;
  }

  const message = await ctx.reply(text, messageOptions);
  return message.message_id;
}

async function recordCombatLockPersistentFightMessage(
  ctx: Context,
  fightService: FightService,
  telegramUserId: bigint,
  sessionId: string,
  messageId: number | null
): Promise<void> {
  const chatId = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat.id;
  if (!messageId || !chatId || typeof fightService.recordPersistentFightMessageReference !== "function") {
    return;
  }

  await fightService.recordPersistentFightMessageReference(telegramUserId, sessionId, {
    chatId: String(chatId),
    messageId
  });
}
