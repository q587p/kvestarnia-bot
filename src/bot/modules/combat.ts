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
import type { BotServices } from "../botServices";
import { parseFightCallbackData,type FightCallback } from "../callbacks/fightCallbackData";
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
buildPersistentFightPassagePreviewKeyboard,
buildPersistentFightResultKeyboard,
resolvePersistentFightPresenceLocation
} from "../keyboards/fightKeyboard";
import {
buildBackToKorchmaHallKeyboard
} from "../keyboards/tavernKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "../keyboards/trainingDoppelgangerKeyboard";
import { editPendingRaidBlockIfNeeded } from "../middleware/pendingRaidGuard";
import {
buildProblemQuestProgressAfterFightEntry,
presentFightLevelRetired,
presentFightNoCharacter,
presentFightResult,
presentPersistentFightIntro,
presentPersistentFightDifficultyChoice,
presentPersistentFightJournal,
presentPersistentFightPassagePreview,
presentPersistentFightSnapshot,
presentPersistentFightTurn,
presentQuestProgressAfterFight,
type QuestProgressAfterFightEntry
} from "../presenters/fightPresenter";
import {
presentInvalidCallback
} from "../presenters/onboardingPresenter";
import {
presentKorchmaDeepLevelLocked
} from "../presenters/tavernPresenter";
import {
presentTrainingDoppelgangerLevelGate,
presentTrainingDoppelgangerNoCharacter,
presentTrainingDoppelgangerTurn
} from "../presenters/trainingDoppelgangerPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

import { sendLevelUpCelebration } from "./levelUp";
import { refreshCurrentMainMenuLocationKeyboard } from "./mainMenu";
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
  registerFightCommand(bot, services.fight, {
    presence: services.presence,
    tavernRaid: services.tavern
  });
  if (services.trainingDoppelganger) {
    registerTrainingDoppelgangerCommand(bot, services.trainingDoppelganger, {
      presence: services.presence,
      tavernRaid: services.tavern
    });
  }

  bot.callbackQuery(/^v1:spar:/, async (ctx) => {
    const parsed = parseTrainingDoppelgangerCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok || !services.trainingDoppelganger) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleTrainingDoppelgangerCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:fight:/, async (ctx) => {
    const parsed = parseFightCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleFightCallback(ctx, parsed.value, services);
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
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await sendTrainingDoppelganger(ctx, services.trainingDoppelganger, "edit", {
    presence: services.presence,
    tavernRaid: services.tavern,
    requireKorchmaInterior: true,
    ...(callback.type === "mode" ? { startMode: callback.mode } : {})
  });
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
        await safeEditMessageText(ctx, presentPersistentFightDifficultyChoice(gate), {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPersistentFightDifficultyKeyboard()
        });
        return;
      }
      await sendFight(ctx, services.fight, "reply", {
        presence: services.presence,
        tavernRaid: services.tavern,
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
          encounterToken: result.encounterToken
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
        await safeEditMessageText(ctx, presentPersistentFightDifficultyChoice(gate), {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPersistentFightDifficultyKeyboard()
        });
        return;
      }
      await sendFight(ctx, services.fight, "reply", {
        presence: services.presence,
        tavernRaid: services.tavern,
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

  if (callback.type === "turn") {
    const yegerBefore = await getYegerProgressSnapshot(services.yeger, telegramUserId);
    const result = await services.fight.resolvePersistentFightTurn(telegramUserId, {
      sessionId: callback.sessionId,
      turn: callback.turn,
      action: callback.action
    });

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentFightNoCharacter());
      return;
    }

    if (result.state !== "not-found" && result.state !== "needs-rest") {
      await markScenePresence(ctx, services.presence, {
        locationId: resolvePersistentFightPresenceLocation(result.session),
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentPersistentFightTurn(result), {
      ...HTML_MESSAGE_OPTIONS,
      ...(result.state === "not-found" || result.state === "needs-rest"
        ? {}
        : {
            reply_markup: buildPersistentFightResultKeyboard(result.session, result.character)
          })
    });
    const progressMessage =
      result.state === "updated" && result.session.state?.status === "won"
        ? await presentWonFightQuestProgressAfterFight(result, services, telegramUserId, yegerBefore)
        : null;

    if (progressMessage) {
      await ctx.reply(progressMessage.text, {
        ...HTML_MESSAGE_OPTIONS,
        ...(progressMessage.replyMarkup ? { reply_markup: progressMessage.replyMarkup } : {})
      });
    }

    if (result.state === "updated" && result.fightReward?.levelChange) {
      await sendLevelUpCelebration(ctx, {
        levelChange: result.fightReward.levelChange,
        character: result.character
      });
    }
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
  }
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
        title: "Неспокійні справи",
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
