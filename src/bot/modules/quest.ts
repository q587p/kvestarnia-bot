import { type Bot,type Context } from "grammy";
import type {
FightService,
ProblemQuestIssueNextLookupResult
} from "../../services/fightService";
import {
PRESENCE_ADVENTURE_CHOICE,
PRESENCE_ADVENTURE_MIMIC_SHAWARMA,
PRESENCE_ADVENTURE_SOLO_FIGHT,
PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER,
PRESENCE_LOCATION_KORCHMA_BAR,
PRESENCE_LOCATION_KORCHMA_DEEP,
PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
} from "../../services/presenceService";
import { isYegerUnquietTarget } from "../../services/yegerQuestService";
import type { BotServices } from "../botServices";
import { parseAdventureCallbackData,type AdventureCallback } from "../callbacks/adventureCallbackData";
import { parseHuntCallbackData,type HuntCallback } from "../callbacks/huntCallbackData";
import {
parseQuestCallbackData,
questCallbackToPersistentFightDifficulty,
type QuestCallback
} from "../callbacks/questCallbackData";
import { parseYegerCallbackData,type YegerCallback } from "../callbacks/yegerCallbackData";
import { registerAdventureCommand,sendAdventure } from "../commands/adventureCommand";
import {
sendCellarErrandRouted
} from "../commands/cellarCommand";
import { sendFight } from "../commands/fightCommand";
import {
markHuntPresence,
markYegerCornerPresence,
registerHuntCommand,
sendHuntBoard,
sendYegerCorner
} from "../commands/huntCommand";
import {
registerQuestHubCommand,
sendQuestHub
} from "../commands/questHubCommand";
import {
sendKorchmaBar
} from "../commands/tavernCommand";
import { playerFromContext } from "../context";
import {
buildAdventureApproachKeyboard,
buildAdventureOfferKeyboard,
buildAdventureParticipantsKeyboard,
buildAdventureResultKeyboard
} from "../keyboards/adventureKeyboard";
import {
buildPersistentFightResultKeyboard
} from "../keyboards/fightKeyboard";
import {
buildEnterKorchmaKeyboard,
buildKorchmaBarKeyboard
} from "../keyboards/tavernKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "../keyboards/trainingDoppelgangerKeyboard";
import {
buildYegerHelpKeyboard,
buildYegerBandagePurchaseKeyboard,
buildYegerCornerKeyboard,
buildYegerHuntKeyboard,
buildYegerKeyboard,
buildYegerTurnInKeyboard
} from "../keyboards/yegerKeyboard";
import { editPendingRaidBlockIfNeeded } from "../middleware/pendingRaidGuard";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import {
presentAdventureLegacyApproachStale,
presentAdventureNoCharacter,
presentAdventureProblem,
presentAdventureResult,
presentMimicShawarmaResult
} from "../presenters/adventurePresenter";
import {
presentFightLevelRetired,
presentFightMonsterRest,
presentFightNeedsRest,
presentFightNoCharacter,
presentFightTrainingActive,
presentPersistentFight,
presentPersistentFightIntro,
presentProblemQuestIssueNext,
presentProblemQuestTurnIn
} from "../presenters/fightPresenter";
import {
presentInvalidCallback
} from "../presenters/onboardingPresenter";
import { presentParticipants } from "../presenters/presencePresenter";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import {
presentYegerBandageBuy,
presentYegerHelp,
presentYegerNoCharacter,
presentYegerQuest,
presentYegerRangerBandage,
presentYegerStart,
presentYegerTrackingBlockedByOtherFight,
presentYegerTrackingNone,
presentYegerTrackingPending,
presentYegerTrackingStart,
presentYegerTurnIn
} from "../presenters/yegerPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

import { sendLevelUpCelebration } from "./levelUp";
import {
refreshCurrentMainMenuLocationKeyboard,
refreshMainMenuLocationKeyboard
} from "./mainMenu";
import {
guardActivePassageSearchCommand,
showActivePassageSearchIfNeeded
} from "./passageSearchGuard";
import { persistentFightDifficultyToPassageLocationId } from "./persistentFightNavigation";
import { buildQuestHubCommandOptions } from "./questHubOptions";
import { markScenePresence } from "./scenePresence";
import type { BotModuleDependencies } from "./types";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerQuestBotModule(
  bot: Bot,
  { services }: BotModuleDependencies
): void {
  bot.command(["adventure", "hunt", "quest"], async (ctx, next) => {
    await guardActivePassageSearchCommand(ctx, services, next);
  });

  registerAdventureCommand(bot, services.adventure, {
    cellarErrand: services.cellarErrand,
    presence: services.presence,
    tavernRaid: services.tavern
  });
  registerHuntCommand(bot, services.yeger, {
    presence: services.presence,
    tavernRaid: services.tavern
  });
  registerQuestHubCommand(bot, buildQuestHubCommandOptions(services));

  bot.callbackQuery(/^v[12]:adv:/, async (ctx) => {
    const parsed = parseAdventureCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleAdventureCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:quest:/, async (ctx) => {
    const parsed = parseQuestCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleQuestCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:hunt:/, async (ctx) => {
    const parsed = parseHuntCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleHuntCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:ygr:/, async (ctx) => {
    const parsed = parseYegerCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleYegerCallback(ctx, parsed.value, services);
  });
}

async function handleQuestCallback(
  ctx: Context,
  action: QuestCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit"))) {
    return;
  }

  if (telegramUserId && (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern))) {
    return;
  }

  await safeAnswerCallbackQuery(ctx);

  if (action === "archive" || action === "list") {
    await sendQuestHub(
      ctx,
      buildQuestHubCommandOptions(services),
      "edit",
      action === "archive" ? "archive" : "active"
    );
    return;
  }

  if (action === "adventure") {
    await sendAdventure(ctx, services.adventure, "reply", {
      cellarErrand: services.cellarErrand,
      presence: services.presence,
      tavernRaid: services.tavern,
      fallbackToCellar: false,
      requireKorchmaInterior: true
    });
    return;
  }

  const fightDifficulty = questCallbackToPersistentFightDifficulty(action);

  if (action === "fight" || action === "fight-descend" || fightDifficulty) {
    if (!telegramUserId) {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (!place.insideKorchma) {
      await safeEditMessageText(ctx, presentKorchmaQuestGate(), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildEnterKorchmaKeyboard()
      });
      return;
    }

    const targetLocationId = fightDifficulty
      ? persistentFightDifficultyToPassageLocationId(fightDifficulty)
      : action === "fight-descend"
        ? PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1
        : PRESENCE_LOCATION_KORCHMA_DEEP;

    if (place.locationId !== targetLocationId) {
      await markScenePresence(ctx, services.presence, {
        locationId: targetLocationId,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
      await sendFight(ctx, services.fight, "reply", {
        presence: services.presence,
        passageSearch: services.passageSearch,
        requireKorchmaInterior: false,
        ...(action === "fight-descend" ? { openDifficulty: true } : {}),
        ...(fightDifficulty ? { difficulty: fightDifficulty, originLocationId: targetLocationId } : {})
      });
      await refreshMainMenuLocationKeyboard(ctx, targetLocationId);
      return;
    }

    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      passageSearch: services.passageSearch,
      requireKorchmaInterior: true,
      ...(action === "fight-descend" ? { openDifficulty: true } : {}),
      ...(fightDifficulty ? { difficulty: fightDifficulty, originLocationId: targetLocationId } : {})
    });
    await refreshMainMenuLocationKeyboard(ctx, targetLocationId);
    return;
  }

  if (action === "problem" || action === "problem-next") {
    if (!telegramUserId) {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (!place.insideKorchma) {
      await safeEditMessageText(ctx, presentKorchmaQuestGate(), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildEnterKorchmaKeyboard()
      });
      return;
    }

    if (place.locationId !== PRESENCE_LOCATION_KORCHMA_BAR) {
      await sendKorchmaBar(ctx, services.tavern, services.presence, "edit", services.cellarGrownup, services.fight);
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }

    if (action === "problem-next") {
      const result = await services.fight.issueNextProblemQuestForTelegramUser(telegramUserId);

      if (result.state === "no-character") {
        await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
        return;
      }

      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_BAR,
        currentRaidId: null,
        currentAdventureId: null
      });
      await safeEditMessageText(ctx, presentProblemQuestIssueNext(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildKorchmaBarKeyboard(getProblemQuestIssueNextBarKeyboardOptions(result))
      });
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }

    const result = await services.fight.turnInProblemQuestForTelegramUser(telegramUserId);

    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_BAR,
      currentRaidId: null,
      currentAdventureId: null
    });
    await safeEditMessageText(ctx, presentProblemQuestTurnIn(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildKorchmaBarKeyboard({
        ...(result.state === "turned-in" && result.result.nextStage
          ? { problemQuestAction: "next" }
          : {})
      })
    });
    const achievementText = result.state === "turned-in"
      ? presentAchievementUnlockNotification(result.result.achievementUnlocks)
      : null;
    if (achievementText) {
      await ctx.reply(achievementText, HTML_MESSAGE_OPTIONS);
    }
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "hunt") {
    await sendYegerCorner(ctx, services.yeger, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: false
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  await sendCellarErrandRouted(
    ctx,
    services.cellarErrand,
    services.presence,
    "reply",
    {
      tavernRaid: services.tavern,
      ...(services.cellarGrownup ? { grownupQuest: services.cellarGrownup } : {})
    }
  );
  await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
}

function getProblemQuestIssueNextBarKeyboardOptions(
  result: Exclude<ProblemQuestIssueNextLookupResult, { state: "no-character" }>
): Parameters<typeof buildKorchmaBarKeyboard>[0] {
  if (result.state === "issued") {
    if (result.progress.completed && !result.progress.rewardClaimed) {
      return { problemQuestAction: "turn-in" };
    }

    return {};
  }

  if (result.state === "not-available") {
    if (result.progress.completed && !result.progress.rewardClaimed) {
      return { problemQuestAction: "turn-in" };
    }

    if (result.progress.rewardClaimed && result.progress.stageId !== "93") {
      return { problemQuestAction: "next" };
    }
  }

  return {};
}

async function handleAdventureCallback(
  ctx: Context,
  callback: AdventureCallback,
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

  if (callback.type === "participants") {
    const snapshot = await services.presence.getAdventureParticipantsForTelegramUser(
      telegramUserId,
      PRESENCE_ADVENTURE_CHOICE
    );

    if (snapshot.state !== "no-character") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_CHOICE
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentParticipants(snapshot), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildAdventureParticipantsKeyboard()
    });
    return;
  }

  if (callback.type === "legacy") {
    const result = await services.adventure.completeMimicShawarma(telegramUserId, {
      type: "legacy",
      action: callback.action
    });

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentAdventureNoCharacter());
      return;
    }

    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMimicShawarmaResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildAdventureResultKeyboard(result)
    });

    if (result.state === "completed") {
      await sendLevelUpCelebration(ctx, result);
    }
    return;
  }

  if (callback.type === "method") {
    const result = await services.adventure.completeMimicShawarma(telegramUserId, {
      type: "method",
      methodId: callback.methodId
    });

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentAdventureNoCharacter());
      return;
    }

    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMimicShawarmaResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildAdventureResultKeyboard(result)
    });

    if (result.state === "completed") {
      await sendLevelUpCelebration(ctx, result);
    }
    return;
  }

  if (callback.type === "problem") {
    const result = await services.adventure.selectAdventureProblem(telegramUserId, callback);

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentAdventureNoCharacter());
      return;
    }

    if (result.state !== "active-fight") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_CHOICE
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureProblem(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        result.state === "selected"
          ? buildAdventureApproachKeyboard(result)
          : result.state === "stale"
            ? buildAdventureOfferKeyboard(result.offer)
            : result.state === "combat-blocked"
              ? buildAdventureResultKeyboard({ state: "active-fight" })
              : buildAdventureResultKeyboard(result)
    });
    return;
  }

  if (callback.type === "legacy-approach") {
    const result = await services.adventure.selectAdventureProblem(telegramUserId, callback);

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentAdventureNoCharacter());
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureLegacyApproachStale(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        result.state === "selected"
          ? buildAdventureApproachKeyboard(result)
          : result.state === "stale"
            ? buildAdventureOfferKeyboard(result.offer)
            : result.state === "combat-blocked"
              ? buildAdventureResultKeyboard({ state: "active-fight" })
              : buildAdventureResultKeyboard(result)
    });
    return;
  }

  const result = await services.adventure.completeAdventureApproach(telegramUserId, callback);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureNoCharacter());
    return;
  }

  if (result.state === "completed") {
    let complicationFight:
      | Awaited<ReturnType<FightService["getOrStartPersistentFightForTelegramUser"]>>
      | null = null;

    if (result.fightHandoff) {
      complicationFight = await services.fight.getOrStartPersistentFightForTelegramUser(
        telegramUserId,
        {
          source: "adventure",
          originLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
          difficulty: "normal",
          ...(result.fightEncounter
            ? { target: { monsterIds: [result.fightEncounter.monsterId] } }
            : {})
        }
      );

      const handoffStarted =
        complicationFight.state === "persistent-active" && complicationFight.started === true;

      if (!handoffStarted) {
        await services.adventure.rollbackCurrentAdventureClaimForTelegramUser(telegramUserId, result.claim);
        await safeAnswerCallbackQuery(ctx);

        if (
          complicationFight.state === "persistent-active" ||
          complicationFight.state === "persistent-terminal"
        ) {
          await markScenePresence(ctx, services.presence, {
            locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
            currentRaidId: null,
            currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
          });
          await safeEditMessageText(ctx, presentPersistentFight(complicationFight), {
            ...HTML_MESSAGE_OPTIONS,
            reply_markup: buildPersistentFightResultKeyboard(
              complicationFight.session,
              complicationFight.character
            )
          });
          return;
        }

        if (complicationFight.state === "training-active") {
          await markScenePresence(ctx, services.presence, {
            locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
            currentRaidId: null,
            currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
          });
          await safeEditMessageText(ctx, presentFightTrainingActive(complicationFight), {
            ...HTML_MESSAGE_OPTIONS,
            reply_markup: buildTrainingDoppelgangerKeyboard(
              complicationFight.session,
              complicationFight.character
            )
          });
          return;
        }

        if (complicationFight.state === "needs-rest") {
          await safeEditMessageText(
            ctx,
            presentFightNeedsRest(complicationFight),
            HTML_MESSAGE_OPTIONS
          );
          return;
        }

        if (complicationFight.state === "monster-rest") {
          await safeEditMessageText(
            ctx,
            presentFightMonsterRest(complicationFight),
            HTML_MESSAGE_OPTIONS
          );
          return;
        }

        if (complicationFight.state === "level-retired") {
          await safeEditMessageText(
            ctx,
            presentFightLevelRetired(complicationFight),
            HTML_MESSAGE_OPTIONS
          );
          return;
        }

        await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
        return;
      }

      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
    } else {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_CHOICE
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildAdventureResultKeyboard(result)
    });
    await sendLevelUpCelebration(ctx, result);

    if (complicationFight) {
      if (
        complicationFight.state === "persistent-active" ||
        complicationFight.state === "persistent-terminal"
      ) {
        if (complicationFight.state === "persistent-active" && complicationFight.started) {
          await ctx.reply(presentPersistentFightIntro(complicationFight), HTML_MESSAGE_OPTIONS);
        }

        await ctx.reply(presentPersistentFight(complicationFight), {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPersistentFightResultKeyboard(
            complicationFight.session,
            complicationFight.character
          )
        });
      }
    }
    return;
  }

  if (result.state !== "active-fight") {
    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CHOICE
    });
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentAdventureResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup:
      result.state === "combat-blocked"
        ? buildAdventureResultKeyboard({ state: "active-fight" })
        : buildAdventureResultKeyboard(result)
  });
}

async function handleHuntCallback(
  ctx: Context,
  callback: HuntCallback,
  services: BotServices
): Promise<void> {
  void callback;
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

  await safeAnswerCallbackQuery(ctx);
  await sendHuntBoard(ctx, services.yeger, "edit", {
    presence: services.presence,
    tavernRaid: services.tavern,
    requireKorchmaInterior: false
  });
}

async function handleYegerCallback(
  ctx: Context,
  callback: YegerCallback,
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

  const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentYegerNoCharacter());
    return;
  }

  if (!place.insideKorchma && callback.type !== "outside" && callback.type !== "track") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentKorchmaQuestGate(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildEnterKorchmaKeyboard()
    });
    return;
  }

  if (callback.type === "open") {
    await safeAnswerCallbackQuery(ctx);
    await sendYegerCorner(ctx, services.yeger, "edit", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: false
    });
    return;
  }

  if (callback.type === "quest") {
    await safeAnswerCallbackQuery(ctx);
    const quest = await services.yeger.getForTelegramUser(telegramUserId);

    if (quest.state === "no-character") {
      await safeEditMessageText(ctx, presentYegerNoCharacter());
      return;
    }

    await markYegerCornerPresence(ctx, services.presence);
    await safeEditMessageText(ctx, presentYegerQuest(quest), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildYegerKeyboard(quest)
    });
    return;
  }

  if (callback.type === "outside") {
    await safeAnswerCallbackQuery(ctx);
    await sendHuntBoard(ctx, services.yeger, "edit", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: false
    });
    return;
  }

  if (callback.type === "help") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentYegerHelp(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildYegerHelpKeyboard()
    });
    return;
  }

  if (callback.type === "buy-bandage-preview") {
    const result = await services.yeger.previewBandagePurchaseForTelegramUser(
      telegramUserId,
      callback.targetQuantity
    );
    await safeAnswerCallbackQuery(
      ctx,
      result.state === "preview"
        ? { text: "Єгер показав ціну." }
        : { show_alert: result.state === "insufficient-gold" || result.state === "daily-limit" }
    );
    await markYegerCornerPresence(ctx, services.presence);
    const quest = await services.yeger.getForTelegramUser(telegramUserId);
    await safeEditMessageText(ctx, presentYegerBandageBuy(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: result.state === "preview"
        ? buildYegerBandagePurchaseKeyboard(result.token)
        : quest.state === "no-character"
          ? buildYegerHelpKeyboard()
          : buildYegerCornerKeyboard(quest)
    });
    return;
  }

  if (callback.type === "buy-bandage-confirm" || callback.type === "buy-bandage-cancel") {
    const result = callback.type === "buy-bandage-confirm"
      ? await services.yeger.confirmBandagePurchaseForTelegramUser(telegramUserId, callback.token)
      : await services.yeger.cancelBandagePurchaseForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(
      ctx,
      result.state === "bought" || result.state === "replayed"
        ? { text: result.state === "bought" ? "Бинти у торбі." : "Чек уже проведено." }
        : { show_alert: result.state === "insufficient-gold" || result.state === "invalid-token" || result.state === "stale-token" }
    );
    await markYegerCornerPresence(ctx, services.presence);
    const quest = await services.yeger.getForTelegramUser(telegramUserId);
    const affordablePreview = result.state === "insufficient-gold" ? result.affordablePreview : undefined;
    await safeEditMessageText(ctx, presentYegerBandageBuy(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: affordablePreview
        ? buildYegerBandagePurchaseKeyboard(
            affordablePreview.token,
            { confirmLabel: `✅ Купити ${affordablePreview.purchaseQuantity}` }
          )
        : quest.state === "no-character"
          ? buildYegerHelpKeyboard()
          : buildYegerCornerKeyboard(quest)
    });
    return;
  }

  if (callback.type === "free-bandage") {
    const result = await services.yeger.claimRangerBandageForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(
      ctx,
      result.state === "claimed"
        ? { text: "Єгер видав бинт." }
        : { show_alert: result.state === "class-locked" || result.state === "on-cooldown" }
    );
    await markYegerCornerPresence(ctx, services.presence);
    const quest = await services.yeger.getForTelegramUser(telegramUserId);
    await safeEditMessageText(ctx, presentYegerRangerBandage(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: quest.state === "no-character" ? buildYegerHelpKeyboard() : buildYegerCornerKeyboard(quest)
    });
    return;
  }

  if (callback.type === "start") {
    const result = await services.yeger.startForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx);
    await markYegerCornerPresence(ctx, services.presence);
    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentYegerStart(result), HTML_MESSAGE_OPTIONS);
      return;
    }

    await safeEditMessageText(ctx, presentYegerStart(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildYegerKeyboard(result)
    });
    return;
  }

  if (callback.type === "track") {
    const quest = await services.yeger.getForTelegramUser(telegramUserId);

    if (quest.state !== "in-progress") {
      await safeAnswerCallbackQuery(ctx);

      if (quest.state === "no-character") {
        await safeEditMessageText(ctx, presentYegerNoCharacter());
        return;
      }

      await safeEditMessageText(ctx, presentYegerQuest(quest), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerKeyboard(quest)
      });
      return;
    }

    const result = await services.yeger.trackForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx);
    await markHuntPresence(ctx, services.presence);

    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentYegerNoCharacter());
      return;
    }

    if (result.state === "not-in-progress") {
      await safeEditMessageText(ctx, presentYegerQuest(result.quest), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerKeyboard(result.quest)
      });
      return;
    }

    if (result.state === "tracking-started" || result.state === "tracking-pending") {
      await safeEditMessageText(ctx, presentYegerTrackingPending(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerHuntKeyboard({
          state: "in-progress",
          character: result.character,
          progress: result.progress,
          tracking: result.tracking
        })
      });
      return;
    }

    if (result.state === "tracking-resolved-none") {
      await safeEditMessageText(ctx, presentYegerTrackingNone(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerHuntKeyboard({
          state: "in-progress",
          character: result.character,
          progress: result.progress,
          tracking: result.tracking
        })
      });
      return;
    }

    if (result.state === "tracking-blocked-by-other-fight") {
      await safeEditMessageText(ctx, presentYegerTrackingBlockedByOtherFight(), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerHuntKeyboard({
          state: "in-progress",
          character: result.character,
          progress: result.progress,
          tracking: result.tracking
        })
      });
      if (result.fight.state === "persistent-active" && result.fight.started) {
        await ctx.reply(presentPersistentFightIntro(result.fight), HTML_MESSAGE_OPTIONS);
      }

      await ctx.reply(presentPersistentFight(result.fight), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightResultKeyboard(result.fight.session, result.fight.character)
      });
      return;
    }

    if (result.state === "tracking-blocked-by-monster-rest") {
      await safeEditMessageText(ctx, presentFightMonsterRest(result.fight), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (result.state !== "tracking-resolved-success") {
      await safeEditMessageText(ctx, "Слід охолов.\n\nЄгер мовчить так переконливо, що навіть мапа перестала шарудіти.", {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerHelpKeyboard()
      });
      return;
    }

    const fight = result.fight;

    if (fight.state === "level-retired") {
      await safeEditMessageText(ctx, presentFightLevelRetired(fight), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (fight.state === "needs-rest") {
      await safeEditMessageText(ctx, presentFightNeedsRest(fight), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (fight.state === "monster-rest") {
      await safeEditMessageText(ctx, presentFightMonsterRest(fight), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (fight.state === "persistent-active" || fight.state === "persistent-terminal") {
      const trackingIntro = fight.monster && isYegerUnquietTarget(fight.monster)
        ? presentYegerTrackingStart({
            yegerProgress: result.progress,
            thirteenProgress: fight.questProgress
          })
        : presentYegerTrackingBlockedByOtherFight();

      await safeEditMessageText(ctx, trackingIntro, HTML_MESSAGE_OPTIONS);
      if (fight.state === "persistent-active" && fight.started) {
        await ctx.reply(presentPersistentFightIntro(fight), HTML_MESSAGE_OPTIONS);
      }

      await ctx.reply(presentPersistentFight(fight), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightResultKeyboard(fight.session, fight.character)
      });
      return;
    }

    await safeEditMessageText(ctx, "Слід охолов.\n\nЄгер мовчить так переконливо, що навіть мапа перестала шарудіти.", {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildYegerHelpKeyboard()
    });
    return;
  }

  const result = await services.yeger.turnInForTelegramUser(telegramUserId);
  await safeAnswerCallbackQuery(ctx);
  await markYegerCornerPresence(ctx, services.presence);
  if (result.state === "no-character") {
    await safeEditMessageText(ctx, presentYegerTurnIn(result), HTML_MESSAGE_OPTIONS);
    return;
  }

  await safeEditMessageText(ctx, presentYegerTurnIn(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildYegerTurnInKeyboard(result)
  });
  if (result.state === "completed" && result.levelChange) {
    await sendLevelUpCelebration(ctx, {
      character: result.character,
      levelChange: result.levelChange
    });
  }
}
