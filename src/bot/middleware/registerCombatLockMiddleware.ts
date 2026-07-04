import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { BotServices } from "../botServices";
import { getCombatSkillProfile } from "../../domain/combat";
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
import { getCombatSkillDisplay } from "../../services/fightService";
import { playerFromContext } from "../context";
import {
  buildFightKeyboard,
  buildPersistentFightResultKeyboard,
  resolvePersistentFightPresenceLocation
} from "../keyboards/fightKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "../keyboards/trainingDoppelgangerKeyboard";
import { buildTurnBasedDuelKeyboard } from "../keyboards/duelKeyboard";
import { buildPartyBossKeyboard } from "../keyboards/partySessionKeyboard";
import { isMainMenuLocationButtonText, mainMenuButtons } from "../keyboards/mainMenuKeyboard";
import { getCallbackMessageFreshness } from "../messageFreshness";
import { editPendingRaidBlockIfNeeded } from "./pendingRaidGuard";
import { presentFightStart, presentPersistentFight } from "../presenters/fightPresenter";
import { presentTrainingDoppelganger } from "../presenters/trainingDoppelgangerPresenter";
import { presentTurnBasedDuel } from "../presenters/duelPresenter";
import { presentPartyBoss } from "../presenters/partySessionPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerCombatLockMiddleware(bot: Bot, services: BotServices): void {
  bot.use(async (ctx, next) => {
    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    const callbackData = ctx.callbackQuery?.data;

    if (!telegramUserId) {
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

    if (isRestartOrRemortRoute(ctx) && await redirectTurnBasedDuelLockIfNeeded(ctx, telegramUserId, services)) {
      return;
    }

    if (!shouldCheckCombatLock(ctx)) {
      await next();
      return;
    }

    if (
      ctx.callbackQuery &&
      !isPendingRaidSafeCallback(callbackData) &&
      typeof services.tavern.getActivePendingFridayBarrelRaidForTelegramUser === "function" &&
      (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern))
    ) {
      return;
    }

    if (await redirectCombatLockIfNeeded(ctx, telegramUserId, services)) {
      return;
    }

    await next();
  });
}

function shouldCheckCombatLock(ctx: Context): boolean {
  const data = ctx.callbackQuery?.data;

  if (data) {
    return (
      !data.startsWith("v1:fight:turn:") &&
      !data.startsWith("v1:fight:item:") &&
      !data.startsWith("v1:spar:turn:") &&
      !data.startsWith("v1:duel:t:") &&
      !data.startsWith("v1:party:ba:") &&
      !data.startsWith("v1:party:bm:") &&
      !data.startsWith("v1:party:bi:") &&
      !data.startsWith("v1:party:bt:") &&
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
    data === "v1:menu:inventory" ||
    data.startsWith("v1:item:") ||
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
    command === "dev_add_yeger_line" ||
    command === "dev_yeger_first_done" ||
    command === "dev_yeger_second_done" ||
    command === "dev_raid_win" ||
    command === "online" ||
    command === "look" ||
    command === "restart" ||
    command === "remort" ||
    command === "support"
  );
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
    text === mainMenuButtons.quest ||
    text === "🗺️ Квест"
  );
}

async function redirectCombatLockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices
): Promise<boolean> {
  if (await redirectTurnBasedDuelLockIfNeeded(ctx, telegramUserId, services)) {
    return true;
  }

  if (await redirectPartyBossLockIfNeeded(ctx, telegramUserId, services)) {
    return true;
  }

  if (typeof services.fight.getFightOverviewForTelegramUser !== "function") {
    return false;
  }

  const lock = await services.fight.getFightOverviewForTelegramUser(telegramUserId);

  if (lock.state === "persistent-active") {
    await answerCombatLockCallback(ctx);
    await refreshCombatLockPresence(ctx, services.presence, {
      locationId: resolvePersistentFightPresenceLocation(lock.session),
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
    });
    const messageId = await sendCombatLockText(ctx, presentCombatLockRedirect(presentPersistentFight(lock)), {
      reply_markup: buildPersistentFightResultKeyboard(lock.session, lock.character)
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
    await refreshCombatLockPresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
    });

    if (training?.state === "active") {
      await sendCombatLockText(ctx, presentCombatLockRedirect(presentTrainingDoppelganger(training)), {
        reply_markup: buildTrainingDoppelgangerKeyboard(training.session, training.character)
      });
      return true;
    }

    if (training?.state === "terminal") {
      await sendCombatLockText(ctx, presentCombatLockRedirect(presentTrainingDoppelganger(training)), {
        reply_markup: buildTrainingDoppelgangerKeyboard(training.session, training.character)
      });
      return true;
    }

    await sendCombatLockText(
      ctx,
      "🥊 Тренування вже триває.\n\nСпершу завершіть цей бій, тоді корчма знову відпустить вас до інших справ.",
      {
        reply_markup: buildTrainingDoppelgangerKeyboard(lock.session, lock.character)
      }
    );
    return true;
  }

  if (
    lock.state === "ready" &&
    (await isStarterFightPresenceActive(services.presence, telegramUserId))
  ) {
    await answerCombatLockCallback(ctx);
    await refreshCombatLockPresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
    });
    await sendCombatLockText(ctx, presentCombatLockRedirect(presentFightStart(lock.character)), {
      reply_markup: buildFightKeyboard(lock.character)
    });
    return true;
  }

  return false;
}

async function redirectPartyBossLockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices
): Promise<boolean> {
  if (!services.partyBoss || typeof services.partyBoss.getActiveForTelegramUser !== "function") {
    return false;
  }

  const active = await services.partyBoss.getActiveForTelegramUser(telegramUserId);
  if (!active) {
    return false;
  }

  const viewerCharacterId = active.participants.find((participant) => participant.telegramUserId === telegramUserId)?.id ?? null;
  await answerCombatLockCallback(ctx);
  await refreshCombatLockPresence(ctx, services.presence, {
    locationId: active.participants.find((participant) => participant.telegramUserId === telegramUserId)?.currentLocationId ?? PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
    currentRaidId: active.id,
    currentAdventureId: null
  });
  await sendCombatLockText(ctx, presentCombatLockRedirect(presentPartyBoss(active, { viewerCharacterId })), {
    reply_markup: buildPartyBossKeyboard(active, viewerCharacterId, {
      includeDevTimeout: services.partyBoss.areDevHelpersEnabled()
    })
  });

  return true;
}

async function redirectTurnBasedDuelLockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices
): Promise<boolean> {
  if (!services.duel || typeof services.duel.getActiveTurnBasedForTelegramUser !== "function") {
    return false;
  }

  const activeDuel = await services.duel.getActiveTurnBasedForTelegramUser(telegramUserId);

  if (!activeDuel) {
    return false;
  }

  await answerCombatLockCallback(ctx);
  await refreshCombatLockPresence(ctx, services.presence, {
    locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_DUEL_CHALLENGE
  });
  const viewerCharacterId =
    activeDuel.challenge.challenger.telegramUserId === telegramUserId
      ? activeDuel.session.challengerCharacterId
      : activeDuel.challenge.target?.telegramUserId === telegramUserId
        ? activeDuel.session.targetCharacterId
        : null;
  const privateCard = ctx.chat?.type === "private" && viewerCharacterId !== null;
  const participant = viewerCharacterId === activeDuel.session.state.participants.target.characterId
    ? activeDuel.session.state.participants.target
    : activeDuel.session.state.participants.challenger;
  const skill = getCombatSkillDisplay(getCombatSkillProfile(participant.combatStats.classId).id);

  await sendCombatLockText(ctx, presentCombatLockRedirect(presentTurnBasedDuel(activeDuel, {
    viewerCharacterId: privateCard ? viewerCharacterId : null
  })), {
    reply_markup: buildTurnBasedDuelKeyboard(activeDuel, privateCard ? viewerCharacterId : null, `${skill.icon} ${skill.name}`)
  });

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
  options: { reply_markup: InlineKeyboard }
): Promise<number | null> {
  const messageOptions = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: options.reply_markup
  };

  if (ctx.callbackQuery) {
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
