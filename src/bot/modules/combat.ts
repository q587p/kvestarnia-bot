import { InlineKeyboard,type Bot,type Context } from "grammy";
import { normalizeCombatEnemies } from "../../domain/combat";
import type {
PersistentFightTurnResult
} from "../../services/fightService";
import {
PRESENCE_ADVENTURE_MIMIC_FIGHT,
PRESENCE_ADVENTURE_SOLO_FIGHT,
PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER,
PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
} from "../../services/presenceService";
import type { YegerQuestService } from "../../services/yegerQuestService";
import { isYegerUnquietTarget } from "../../services/yegerQuestService";
import {
  getPassageSearchNodeKey,
  PASSAGE_SEARCH_NODE_DEEP_LEVEL1
} from "../../services/passageSearchService";
import { type CallbackParseResult, registerParsedCallbackRoute } from "../callbackRoute";
import type { BotServices } from "../botServices";
import { parseFightCallbackData,type FightCallback } from "../callbacks/fightCallbackData";
import { parsePassageSearchCallbackData, type PassageSearchCallback } from "../callbacks/passageSearchCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
makeQuestCallbackData
} from "../callbacks/questCallbackData";
import {
parseTrainingDoppelgangerCallbackData,
type TrainingDoppelgangerCallback
} from "../callbacks/trainingDoppelgangerCallbackData";
import { registerFightCommand,sendFight } from "../commands/fightCommand";
import {
registerTrainingDoppelgangerCommand,
sendTrainingDoppelganger
} from "../commands/trainingDoppelgangerCommand";
import { playerFromContext } from "../context";
import {
buildFightResultKeyboard,
buildPersistentFightDifficultyKeyboard,
buildPersistentFightJournalKeyboard,
buildPassageSearchCancelKeyboard,
buildPassageSearchRunningKeyboard,
buildPersistentFightPassagePreviewKeyboard,
buildPersistentFightResultKeyboard,
resolvePersistentFightPresenceLocation
} from "../keyboards/fightKeyboard";
import {
buildBackToKorchmaHallKeyboard
} from "../keyboards/tavernKeyboard";
import {
  buildTrainingDoppelgangerJournalKeyboard,
  buildTrainingDoppelgangerKeyboard
} from "../keyboards/trainingDoppelgangerKeyboard";
import { editPendingRaidBlockIfNeeded } from "../middleware/pendingRaidGuard";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import { presentDevGrantDisabled, presentDevGrantNoCharacter } from "../presenters/devGrantPresenter";
import {
buildProblemQuestProgressAfterFightEntry,
presentFightLevelRetired,
presentFightNoCharacter,
presentFightResult,
presentPersistentFightIntro,
presentPersistentFightDifficultyChoice,
presentPersistentFightGearUnavailableNotice,
presentPersistentFightItemUnavailableNotice,
presentPersistentFightJournal,
presentPersistentFightPassagePreview,
presentPersistentFightSnapshot,
presentPersistentFightTurn,
presentQuestProgressAfterFight,
type QuestProgressAfterFightEntry
} from "../presenters/fightPresenter";
import { presentYegerQuestTitle } from "../presenters/yegerQuestTitle";
import { presentPassageSearch } from "../presenters/passageSearchPresenter";
import {
presentInvalidCallback
} from "../presenters/onboardingPresenter";
import { presentFightingCornerQuestProgressNotification } from "../presenters/fightingCornerQuestPresenter";
import { startPerfSpan } from "../performanceLogger";
import {
presentKorchmaDeepLevelLocked
} from "../presenters/tavernPresenter";
import {
presentTrainingDoppelganger,
presentTrainingDoppelgangerJournal,
presentTrainingDoppelgangerLevelGate,
presentTrainingDoppelgangerNoCharacter,
presentTrainingDoppelgangerTurn
} from "../presenters/trainingDoppelgangerPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { isPassageSearchAvailable } from "../passageSearchAvailability";

import { sendLevelUpCelebration } from "./levelUp";
import {
refreshCurrentMainMenuLocationKeyboard
} from "./mainMenu";
import {
guardActivePassageSearchCommand,
sendPassageSearchMonsterAttackFight,
showActivePassageSearchIfNeeded
} from "./passageSearchGuard";
import {
placeCallbackToPersistentFightPassage,
presenceLocationToPersistentFightPassage,
sendPersistentFightPassagePreview
} from "./persistentFightNavigation";
import { markScenePresence } from "./scenePresence";
import type { BotModuleDependencies } from "./types";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerCombatBotModule(
  bot: Bot,
  { services }: BotModuleDependencies
): void {
  bot.command("fight", async (ctx, next) => {
    await guardActivePassageSearchCommand(ctx, services, next);
  });

  registerFightCommand(bot, services.fight, {
    presence: services.presence,
    tavernRaid: services.tavern,
    passageSearch: services.passageSearch
  });
  if (services.trainingDoppelganger) {
    registerTrainingDoppelgangerCommand(bot, services.trainingDoppelganger, {
      presence: services.presence,
      tavernRaid: services.tavern,
      fightingCornerQuest: services.fightingCornerQuest
    });
    registerTrainingDoppelgangerDevResetHandler(bot, services);
  }

  registerParsedCallbackRoute(
    bot,
    /^v1:spar:/,
    (data) => parseWhenAvailable(data, parseTrainingDoppelgangerCallbackData, services.trainingDoppelganger),
    async (ctx, callback) => {
      await handleTrainingDoppelgangerCallback(ctx, callback, services);
    }
  );

  registerParsedCallbackRoute(
    bot,
    /^v1:fight:/,
    parseFightCallbackData,
    async (ctx, callback) => {
      await handleFightCallback(ctx, callback, services);
    }
  );

  registerParsedCallbackRoute(
    bot,
    /^v1:search:/,
    (data) => parseWhenAvailable(data, parsePassageSearchCallbackData, services.passageSearch),
    async (ctx, callback) => {
      await handlePassageSearchCallback(ctx, callback, services);
    }
  );
}

function parseWhenAvailable<TCallback>(
  data: string,
  parse: (data: string) => CallbackParseResult<TCallback>,
  service: unknown
): CallbackParseResult<TCallback> {
  if (!service) {
    return { ok: false };
  }

  return parse(data);
}

function registerTrainingDoppelgangerDevResetHandler(bot: Bot, services: BotServices): void {
  bot.command("dev_reset_doppelganger", async (ctx) => {
    if (!services.devGrant?.isEnabled()) {
      await ctx.reply(presentDevGrantDisabled());
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (!telegramUserId) {
      await ctx.reply(presentDevGrantNoCharacter());
      return;
    }

    if (!services.trainingDoppelganger) {
      await ctx.reply("Dev-скидання Допельґанґера недоступне.");
      return;
    }

    const result = await services.trainingDoppelganger.resetCooldownForDev(telegramUserId);

    if (result.state === "no-character") {
      await ctx.reply(presentDevGrantNoCharacter());
      return;
    }

    if (result.state === "disabled") {
      await ctx.reply("Dev-скидання Допельґанґера недоступне.");
      return;
    }

    if (result.state === "no-cooldown") {
      await ctx.reply("🥊 Cooldown Допельґанґера не знайдено. Він і так готовий до локальної науки.");
      return;
    }

    await ctx.reply("🥊 Cooldown Допельґанґера скинуто локально.");
  });
}

async function handleTrainingDoppelgangerCallback(
  ctx: Context,
  callback: TrainingDoppelgangerCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId || !services.trainingDoppelganger) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern)) {
    return;
  }

  if (callback.type === "turn") {
    const result = await services.trainingDoppelganger.resolveTurn(telegramUserId, {
      sessionId: callback.sessionId,
      turn: callback.turn,
      action: callback.action
    });

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentTrainingDoppelgangerNoCharacter());
      return;
    }

    if (result.state === "level-gated") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentTrainingDoppelgangerLevelGate(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildTrainingDoppelgangerKeyboard()
      });
      return;
    }

    if (result.state !== "not-found") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentTrainingDoppelgangerTurn(result), {
      ...HTML_MESSAGE_OPTIONS,
      ...(result.state === "not-found"
        ? {}
        : {
            reply_markup: buildTrainingDoppelgangerKeyboard(result.session, result.character)
          })
    });
    if (result.state !== "not-found" && services.fightingCornerQuest) {
      const updates = await services.fightingCornerQuest.recordTrainingSessionSafely(
        telegramUserId,
        result.session
      );
      await notifyTrainingQuestProgress(ctx, updates);
    }
    return;
  }

  if (callback.type === "view" || callback.type === "journal") {
    const result = await services.trainingDoppelganger.getTrainingDoppelgangerSnapshotForTelegramUser(
      telegramUserId,
      callback.sessionId
    );

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentTrainingDoppelgangerNoCharacter());
      return;
    }

    if (result.state === "not-found") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, [
        "🥊 Тренування не знайшлося.",
        "",
        "Можливо, старий бланк уже прибрали зі стійки. Спробуйте /spar ще раз."
      ].join("\n"));
      return;
    }

    if ((result.session.state?.status ?? result.session.status) === "active") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
      });
    }

    await safeAnswerCallbackQuery(ctx);

    if (callback.type === "journal") {
      await safeEditMessageText(ctx, presentTrainingDoppelgangerJournal(result, callback.page), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildTrainingDoppelgangerJournalKeyboard(result.session, callback.page)
      });
      return;
    }

    const trainingView =
      (result.session.state?.status ?? result.session.status) === "active"
        ? {
            state: "active" as const,
            character: result.character,
            doppelganger: result.doppelganger,
            session: result.session
          }
        : {
            state: "terminal" as const,
            character: result.character,
            doppelganger: result.doppelganger,
            session: result.session,
            reward: result.reward
          };

    await safeEditMessageText(ctx, presentTrainingDoppelganger(trainingView), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildTrainingDoppelgangerKeyboard(result.session, result.character)
    });
    if (services.fightingCornerQuest) {
      const updates = await services.fightingCornerQuest.recordTrainingSessionSafely(
        telegramUserId,
        result.session
      );
      await notifyTrainingQuestProgress(ctx, updates);
    }
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await sendTrainingDoppelganger(ctx, services.trainingDoppelganger, "edit", {
    presence: services.presence,
    tavernRaid: services.tavern,
    fightingCornerQuest: services.fightingCornerQuest,
    requireKorchmaInterior: true,
    ...(callback.type === "mode" ? { startMode: callback.mode } : {})
  });
}

async function notifyTrainingQuestProgress(
  ctx: Context,
  updates: Awaited<ReturnType<BotServices["fightingCornerQuest"]["recordTrainingSessionSafely"]>>
): Promise<void> {
  for (const update of updates) {
    try {
      await ctx.reply(presentFightingCornerQuestProgressNotification(update), HTML_MESSAGE_OPTIONS);
    } catch {
      // Quest progress is durable; Telegram delivery remains best-effort.
    }
  }
}

async function handleFightCallback(
  ctx: Context,
  callback: FightCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern)) {
    return;
  }

  if (callback.type === "passage") {
    const passageFight = placeCallbackToPersistentFightPassage(callback.passage);

    if (!passageFight) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const gate =
      typeof services.fight.getFightOverviewForTelegramUser === "function"
        ? await services.fight.getFightOverviewForTelegramUser(telegramUserId)
        : await services.fight.getFightForTelegramUser(telegramUserId);

    if ("character" in gate && gate.character.level < 3) {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentKorchmaDeepLevelLocked(gate.character), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildBackToKorchmaHallKeyboard()
      });
      return;
    }

    const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);
    if (place.state !== "ready" || place.locationId !== passageFight.locationId) {
      await safeAnswerCallbackQuery(ctx);
      const currentPassage = place.state === "ready"
        ? presenceLocationToPersistentFightPassage(place.locationId)
        : null;
      if (currentPassage) {
        await sendPersistentFightPassagePreview(ctx, services, currentPassage, "edit");
        return;
      }
      if (gate.state === "persistent-ready") {
        await safeEditMessageText(ctx, presentPersistentFightDifficultyChoice(), {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPersistentFightDifficultyKeyboard({
            searchAvailable: await isPassageSearchAvailable(
              services.passageSearch,
              telegramUserId,
              PASSAGE_SEARCH_NODE_DEEP_LEVEL1
            )
          })
        });
        return;
      }
      await sendFight(ctx, services.fight, "reply", {
        presence: services.presence,
        tavernRaid: services.tavern,
        passageSearch: services.passageSearch,
        requireKorchmaInterior: false
      });
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    const result = await services.fight.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      callback.encounterToken,
      {
        callbackOriginLocationId: passageFight.locationId,
        currentLocationId: place.locationId
      }
    );

    if (result.state === "persistent-preview") {
      const resultPassage = presenceLocationToPersistentFightPassage(result.originLocationId) ?? passageFight;
      await safeEditMessageText(ctx, presentPersistentFightPassagePreview(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightPassagePreviewKeyboard({
          passage: resultPassage.passage,
          encounterToken: result.encounterToken,
          searchAvailable: await isPassageSearchAvailable(
            services.passageSearch,
            telegramUserId,
            getPassageSearchNodeKey(resultPassage.passage)
          )
        })
      });
      return;
    }

    if (result.state === "invalid-preview") {
      const currentPassage = presenceLocationToPersistentFightPassage(place.locationId);
      if (currentPassage) {
        await sendPersistentFightPassagePreview(ctx, services, currentPassage, "edit");
        return;
      }
      if (gate.state === "persistent-ready") {
        await safeEditMessageText(ctx, presentPersistentFightDifficultyChoice(), {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPersistentFightDifficultyKeyboard({
            searchAvailable: await isPassageSearchAvailable(
              services.passageSearch,
              telegramUserId,
              PASSAGE_SEARCH_NODE_DEEP_LEVEL1
            )
          })
        });
        return;
      }
      await sendFight(ctx, services.fight, "reply", {
        presence: services.presence,
        tavernRaid: services.tavern,
        passageSearch: services.passageSearch,
        requireKorchmaInterior: false
      });
      return;
    }

    if (result.state === "persistent-active") {
      await markScenePresence(ctx, services.presence, {
        locationId: resolvePersistentFightPresenceLocation(result.session),
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
      if (result.started) {
        await ctx.reply(presentPersistentFightIntro(result), HTML_MESSAGE_OPTIONS);
      }
    }
    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      passageSearch: services.passageSearch,
      requireKorchmaInterior: false,
      suppressStartIntro: Boolean(result.state === "persistent-active" && result.started)
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (callback.type === "view" || callback.type === "journal") {
    const result = await services.fight.getPersistentFightSnapshotForTelegramUser(
      telegramUserId,
      callback.sessionId
    );

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentFightNoCharacter());
      return;
    }

    if (result.state === "not-found") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, [
        "⚔️ Бій не знайшовся.",
        "",
        "Можливо, старий сувій уже прибрали зі столу. Спробуйте /fight ще раз."
      ].join("\n"));
      return;
    }

    if ((result.session.state?.status ?? result.session.status) === "active") {
      await markScenePresence(ctx, services.presence, {
        locationId: resolvePersistentFightPresenceLocation(result.session),
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
    }

    await safeAnswerCallbackQuery(ctx);

    if (callback.type === "journal") {
      await safeEditMessageText(ctx, presentPersistentFightJournal(result, callback.page), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightJournalKeyboard(result.session, callback.page)
      });
      return;
    }

    await safeEditMessageText(ctx, presentPersistentFightSnapshot(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildPersistentFightResultKeyboard(result.session, result.character)
    });
    return;
  }

  if (callback.type === "turn" || callback.type === "item" || callback.type === "gear") {
    const perf = startPerfSpan(`fight.${callback.type}`, { telegramUserId });
    const yegerBefore = await perf.measureDb(() => getYegerProgressSnapshot(services.yeger, telegramUserId));
    const result = await perf.measureDb(() => callback.type === "turn"
      ? services.fight.resolvePersistentFightTurn(telegramUserId, {
          sessionId: callback.sessionId,
          turn: callback.turn,
          action: callback.action
        })
      : callback.type === "gear"
        ? services.fight.resolvePersistentFightTurn(telegramUserId, {
            sessionId: callback.sessionId,
            turn: callback.turn,
            action: "gear",
            grantKey: callback.grantKey
          })
      : services.fight.resolvePersistentFightItemTurn(telegramUserId, {
          sessionId: callback.sessionId,
          turn: callback.turn,
          itemKey: callback.itemKey
        }));

    if (result.state === "no-character") {
      await perf.measureTelegram(() => safeAnswerCallbackQuery(ctx));
      await perf.measureTelegram(() => safeEditMessageText(ctx, presentFightNoCharacter()));
      perf.end({ resultState: result.state });
      return;
    }

    if (result.state !== "not-found" && result.state !== "needs-rest") {
      await perf.measureDb(() => markScenePresence(ctx, services.presence, {
        locationId: resolvePersistentFightPresenceLocation(result.session),
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      }));
    }

    const rendered = perf.measureCompute(() => {
      const itemUnavailableNotice = callback.type === "item"
        ? presentPersistentFightItemUnavailableNotice(result)
        : null;
      const gearUnavailableNotice = callback.type === "gear"
        ? presentPersistentFightGearUnavailableNotice(result)
        : null;
      const unavailableNotice = itemUnavailableNotice ?? gearUnavailableNotice;

      return {
        unavailableNotice,
        text: presentPersistentFightTurn(result),
        replyMarkup:
          result.state === "not-found" || result.state === "needs-rest"
            ? undefined
            : buildPersistentFightResultKeyboard(result.session, result.character)
      };
    });
    await perf.measureTelegram(() => safeAnswerCallbackQuery(ctx, rendered.unavailableNotice
      ? { text: rendered.unavailableNotice, show_alert: true }
      : undefined));
    await perf.measureTelegram(() => safeEditMessageText(ctx, rendered.text, {
      ...HTML_MESSAGE_OPTIONS,
      ...(rendered.replyMarkup ? { reply_markup: rendered.replyMarkup } : {})
    }));
    const progressMessage =
      result.state === "updated" && result.session.state?.status === "won"
        ? await perf.measureDb(() => presentWonFightQuestProgressAfterFight(result, services, telegramUserId, yegerBefore))
        : null;

    if (progressMessage) {
      await perf.measureTelegram(() => ctx.reply(progressMessage.text, {
        ...HTML_MESSAGE_OPTIONS,
        ...(progressMessage.replyMarkup ? { reply_markup: progressMessage.replyMarkup } : {})
      }));
    }

    const levelChange = result.state === "updated" ? result.fightReward?.levelChange : null;
    if (levelChange) {
      await perf.measureTelegram(() => sendLevelUpCelebration(ctx, {
        levelChange,
        character: result.character
      }));
    }
    const achievementText = result.state === "updated"
      ? presentAchievementUnlockNotification([
          ...(result.achievementUnlocks ?? []),
          ...(result.fightReward?.achievementUnlocks ?? [])
        ])
      : null;
    if (achievementText) {
      await perf.measureTelegram(() => ctx.reply(achievementText, HTML_MESSAGE_OPTIONS));
    }
    perf.end({
      resultState: result.state === "updated" && result.session.state?.status === "won"
        ? "reward"
        : result.state
    });
    return;
  }

  const result = await services.fight.completeMimicShawarma(telegramUserId, callback.action);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentFightNoCharacter());
    return;
  }

  if (result.state === "level-retired") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentFightLevelRetired(result), HTML_MESSAGE_OPTIONS);
    return;
  }

  await markScenePresence(ctx, services.presence, {
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
  });

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentFightResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildFightResultKeyboard(result.state, result.character)
  });
  if (result.state === "completed") {
    await sendLevelUpCelebration(ctx, result);
    const achievementText = presentAchievementUnlockNotification(result.achievementUnlocks);
    if (achievementText) {
      await ctx.reply(achievementText, HTML_MESSAGE_OPTIONS);
    }
  }
}

async function handlePassageSearchCallback(
  ctx: Context,
  callback: PassageSearchCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId || !services.passageSearch) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern)) {
    return;
  }

  const result = await handlePassageSearchAction(telegramUserId, callback, services);

  await safeAnswerCallbackQuery(ctx);
  const replyMarkup = result.state === "started" || result.state === "running"
    ? buildPassageSearchRunningKeyboard(result.action.token)
    : result.state === "confirm-cancel"
      ? buildPassageSearchCancelKeyboard(result.action.token)
      : undefined;
  await safeEditMessageText(ctx, presentPassageSearch(result), {
    ...HTML_MESSAGE_OPTIONS,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });
  if (result.state === "started" || result.state === "running") {
    const chatId = getSearchNotificationChatId(ctx);
    if (chatId) {
      await services.passageSearch.recordNotificationTarget(
        telegramUserId,
        result.action.token,
        { chatId }
      );
    }
  }

  if (result.state === "monster-attack") {
    await sendPassageSearchMonsterAttackFight(ctx, services, result);
  }
}

function getSearchNotificationChatId(ctx: Context): string | null {
  const chatId = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat.id;

  return chatId === undefined ? null : chatId.toString();
}

async function handlePassageSearchAction(
  telegramUserId: bigint,
  callback: PassageSearchCallback,
  services: BotServices
) {
  if (!services.passageSearch) {
    return { state: "no-character" as const };
  }

  if (callback.type === "start-passage") {
    const currentLocationId = await getCurrentLocationId(services, telegramUserId);

    return services.passageSearch.startPassageSearch(telegramUserId, {
      passage: callback.passage,
      encounterToken: callback.encounterToken,
      ...(currentLocationId ? { currentLocationId } : {})
    });
  }

  if (callback.type === "start-safe-passage") {
    const currentLocationId = await getCurrentLocationId(services, telegramUserId);

    return services.passageSearch.startSafePassageRestSearch(telegramUserId, {
      passage: callback.passage,
      ...(currentLocationId ? { currentLocationId } : {})
    });
  }

  if (callback.type === "start-descent") {
    const currentLocationId = await getCurrentLocationId(services, telegramUserId);

    return services.passageSearch.startDescentSearch(telegramUserId, {
      ...(currentLocationId ? { currentLocationId } : {})
    });
  }

  if (callback.type === "start-deep-level-one") {
    const currentLocationId = await getCurrentLocationId(services, telegramUserId);

    return services.passageSearch.startDeepLevelOneSearch(telegramUserId, {
      ...(currentLocationId ? { currentLocationId } : {})
    });
  }

  if (callback.type === "check" || callback.type === "keep") {
    return services.passageSearch.checkSearch(telegramUserId, callback.token);
  }

  if (callback.type === "ask-cancel") {
    return services.passageSearch.previewCancel(telegramUserId, callback.token);
  }

  return services.passageSearch.cancelSearch(telegramUserId, callback.token);
}

async function getCurrentLocationId(
  services: BotServices,
  telegramUserId: bigint
): Promise<string | undefined> {
  const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

  return place.state === "ready" ? place.locationId : undefined;
}

type YegerProgressSnapshot = { wins: number; target: number } | null;
type FightQuestProgressAfterFightMessage = {
  text: string;
  replyMarkup?: InlineKeyboard;
};

async function getYegerProgressSnapshot(
  yeger: Pick<YegerQuestService, "getForTelegramUser"> | undefined,
  telegramUserId: bigint
): Promise<YegerProgressSnapshot> {
  if (!yeger) {
    return null;
  }

  const result = await yeger.getForTelegramUser(telegramUserId);

  if (result.state !== "in-progress" && result.state !== "turn-in-ready") {
    return null;
  }

  return result.progress;
}

async function presentWonFightQuestProgressAfterFight(
  result: Extract<PersistentFightTurnResult, { state: "updated" }>,
  services: BotServices,
  telegramUserId: bigint,
  yegerBefore: YegerProgressSnapshot
): Promise<FightQuestProgressAfterFightMessage | null> {
  const entries: QuestProgressAfterFightEntry[] = [];
  const problemEntry = buildProblemQuestProgressAfterFightEntry(result.questProgress, {
    singleProblemHint: hasMoreThanOnePersistentEnemy(result)
  });

  if (problemEntry) {
    entries.push(problemEntry);
  }

  if (result.monster && isYegerUnquietTarget(result.monster) && yegerBefore) {
    const yegerAfter = await getYegerProgressSnapshot(services.yeger, telegramUserId);

    if (yegerAfter && yegerAfter.wins > yegerBefore.wins) {
      entries.push({
        title: presentYegerQuestTitle(yegerAfter),
        wins: yegerAfter.wins,
        target: yegerAfter.target,
        completed: yegerAfter.wins >= yegerAfter.target,
        ...(yegerAfter.wins >= yegerAfter.target
          ? { readyHint: "Єгер чекає дощечку.", action: "yeger" as const }
          : {})
      });
    }
  }

  const text = presentQuestProgressAfterFight(entries);

  if (!text) {
    return null;
  }

  const replyMarkup = buildQuestProgressAfterFightKeyboard(entries);

  return {
    text,
    ...(replyMarkup ? { replyMarkup } : {})
  };
}

function hasMoreThanOnePersistentEnemy(
  result: Extract<PersistentFightTurnResult, { state: "updated" }>
): boolean {
  return result.session.state ? normalizeCombatEnemies(result.session.state).length > 1 : false;
}

function buildQuestProgressAfterFightKeyboard(
  entries: readonly QuestProgressAfterFightEntry[]
): InlineKeyboard | null {
  const actions = new Set(
    entries
      .filter((entry) => entry.completed && entry.action)
      .map((entry) => entry.action)
  );

  if (actions.size === 0) {
    return null;
  }

  const keyboard = new InlineKeyboard();

  if (actions.has("bar")) {
    keyboard.text("🍻 До шинку", makePlaceCallbackData("bar")).row();
  }

  if (actions.has("yeger")) {
    keyboard.text("🏹 До Єгеря", makeQuestCallbackData("hunt")).row();
  }

  return keyboard;
}
