import type { Bot, Context } from "grammy";
import type { AdventureService } from "../../services/adventureService";
import type { BarrelBeerTutorialService } from "../../services/barrelBeerTutorialService";
import type { CellarErrandService } from "../../services/cellarErrandService";
import type { CellarGrownupQuestService } from "../../services/cellarGrownupQuestService";
import type { FightService } from "../../services/fightService";
import type { FirstKorchmaQuestService } from "../../services/firstKorchmaQuestService";
import type { FightingCornerQuestService } from "../../services/fightingCornerQuestService";
import type { ItemUpgradeService } from "../../services/itemUpgradeService";
import type { DailyKorchmaRoundService } from "../../services/dailyKorchmaRoundService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import type { YegerQuestService } from "../../services/yegerQuestService";
import {
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import { buildQuestHubKeyboard } from "../keyboards/questHubKeyboard";
import { buildQuestOverviewKeyboard } from "../keyboards/questOverviewKeyboard";
import { buildEnterKorchmaKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentFirstKorchmaQuestCompletion
} from "../presenters/firstKorchmaQuestPresenter";
import {
  presentKorchmaQuestGate,
  presentQuestHub,
  presentQuestHubNoCharacter,
  type QuestHubMode,
  type QuestHubSnapshot
} from "../presenters/questHubPresenter";
import {
  presentQuestOverview
} from "../presenters/questOverviewPresenter";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";
import { sendLevelUpCelebration } from "../modules/levelUp";

type ReplyOptions = Parameters<Context["reply"]>[1];

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export interface QuestHubCommandOptions {
  adventure: AdventureService;
  barrelBeerTutorial?: BarrelBeerTutorialService;
  cellarErrand: CellarErrandService;
  cellarGrownup?: CellarGrownupQuestService;
  dailyKorchmaRound?: DailyKorchmaRoundService;
  fight: FightService;
  firstKorchmaQuest?: FirstKorchmaQuestService;
  fightingCornerQuest?: FightingCornerQuestService;
  itemUpgrades?: Pick<ItemUpgradeService, "getUnlockQuestForTelegramUser">;
  yeger: YegerQuestService;
  presence: PresenceService;
  tavernRaid?: TavernRaidService;
}

export function registerQuestHubCommand(bot: Bot, options: QuestHubCommandOptions): void {
  bot.command("quest", async (ctx) => {
    await sendQuestOverview(ctx, options, "reply");
  });
}

export async function sendQuestHub(
  ctx: Context,
  options: QuestHubCommandOptions,
  mode: "reply" | "edit",
  hubMode: QuestHubMode = "active"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (
    await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, mode)
  ) {
    return;
  }

  const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await sendText(ctx, mode, presentQuestHubNoCharacter());
    return;
  }

  if (!place.insideKorchma) {
    await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
    return;
  }

  await markQuestTablePresence(ctx, options.presence);
  await sendFirstKorchmaQuestCompletionIfNeeded(ctx, options, telegramUserId);

  const snapshot = await buildQuestHubSnapshot(
    telegramUserId,
    options,
    PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
  );
  if (!snapshot) {
    await sendText(ctx, mode, presentQuestHubNoCharacter());
    return;
  }

  await sendText(ctx, mode, presentQuestHub(snapshot, hubMode), { snapshot, mode: hubMode });
}

export async function sendQuestOverview(
  ctx: Context,
  options: QuestHubCommandOptions,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (
    await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, mode)
  ) {
    return;
  }

  const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await sendText(ctx, mode, presentQuestHubNoCharacter());
    return;
  }

  const snapshot = await buildQuestHubSnapshot(
    telegramUserId,
    options,
    place.locationId
  );

  if (!snapshot) {
    await sendText(ctx, mode, presentQuestHubNoCharacter());
    return;
  }

  await sendText(ctx, mode, presentQuestOverview(snapshot), "overview");
}

export async function buildQuestHubSnapshot(
  telegramUserId: bigint,
  options: QuestHubCommandOptions,
  currentLocationId: string | null = null
): Promise<QuestHubSnapshot | null> {
  const adventure = await options.adventure.getAdventureOfferForTelegramUser(telegramUserId);

  if (adventure.state === "no-character") {
    return null;
  }

  const starterAdventure =
    typeof options.adventure.getMimicShawarmaForTelegramUser === "function"
      ? await options.adventure.getMimicShawarmaForTelegramUser(telegramUserId)
      : null;

  const fight = await options.fight.getFightOverviewForTelegramUser(telegramUserId);
  const firstKorchmaQuest = options.firstKorchmaQuest
    ? await options.firstKorchmaQuest.getForTelegramUser(telegramUserId)
    : null;
  const fightingCornerQuest = options.fightingCornerQuest
    ? await options.fightingCornerQuest.getForTelegramUser(telegramUserId)
    : null;
  const starterFight =
    typeof options.fight.getMimicShawarmaForTelegramUser === "function"
      ? await options.fight.getMimicShawarmaForTelegramUser(telegramUserId)
      : null;
  const problemQuest = await options.fight.getProblemQuestProgressForTelegramUser(telegramUserId);
  const yeger = await options.yeger.getForTelegramUser(telegramUserId);
  const cellar = await options.cellarErrand.getForTelegramUser(telegramUserId);
  const barrelBeerTutorial = options.barrelBeerTutorial
    ? await options.barrelBeerTutorial.getForTelegramUser(telegramUserId)
    : null;
  const cellarGrownup =
    cellar.state === "level-retired" && options.cellarGrownup
      ? await options.cellarGrownup.getForTelegramUser(telegramUserId)
      : null;
  const dailyKorchmaRound = options.dailyKorchmaRound
    ? await options.dailyKorchmaRound.getExistingForTelegramUser(telegramUserId)
    : null;
  const itemUpgrades = options.itemUpgrades
    ? await options.itemUpgrades.getUnlockQuestForTelegramUser(telegramUserId)
    : null;

  if (
    fight.state === "no-character" ||
    firstKorchmaQuest?.state === "no-character" ||
    fightingCornerQuest?.state === "no-character" ||
    problemQuest.state === "no-character" ||
    yeger.state === "no-character" ||
    cellar.state === "no-character" ||
    barrelBeerTutorial?.state === "no-character" ||
    itemUpgrades?.state === "no-character"
  ) {
    return null;
  }

  const character = fight.character;

  return {
    character,
    currentLocationId,
    adventure,
    ...(firstKorchmaQuest ? { firstKorchmaQuest } : {}),
    ...(fightingCornerQuest && fightingCornerQuest.state !== "disabled" ? { fightingCornerQuest } : {}),
    ...(starterAdventure && starterAdventure.state !== "no-character" ? { starterAdventure } : {}),
    fight,
    ...(starterFight && starterFight.state !== "no-character" ? { starterFight } : {}),
    problemQuest: problemQuest.progress,
    problemQuestArchive: problemQuest.archive,
    ...(barrelBeerTutorial ? { barrelBeerTutorial } : {}),
    yeger,
    cellar,
    ...(dailyKorchmaRound && dailyKorchmaRound.state !== "no-character" ? { dailyKorchmaRound } : {}),
    ...(itemUpgrades ? { itemUpgrades } : {}),
    ...(cellarGrownup && cellarGrownup.state !== "no-character" && cellarGrownup.state !== "too-young"
      ? { cellarGrownup }
      : {})
  };
}

export async function sendFirstKorchmaQuestCompletionIfNeeded(
  ctx: Context,
  options: Pick<QuestHubCommandOptions, "firstKorchmaQuest">,
  telegramUserId: bigint
): Promise<void> {
  if (!options.firstKorchmaQuest) {
    return;
  }

  const result = await options.firstKorchmaQuest.completeForTelegramUser(telegramUserId);
  const text = presentFirstKorchmaQuestCompletion(result);

  if (!text) {
    return;
  }

  await ctx.reply(text, HTML_MESSAGE_OPTIONS);

  if (result.state === "completed" && result.levelChange?.leveledUp) {
    await sendLevelUpCelebration(ctx, {
      character: result.character,
      levelChange: result.levelChange
    });
  }

  const achievementText = result.state === "completed"
    ? presentAchievementUnlockNotification(result.achievementUnlocks)
    : null;

  if (achievementText) {
    await ctx.reply(achievementText, HTML_MESSAGE_OPTIONS);
  }
}

async function markQuestTablePresence(ctx: Context, presence: PresenceService): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: null
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | { snapshot: QuestHubSnapshot; mode: QuestHubMode }
    | "overview"
    | "enter-korchma"
    | false = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "enter-korchma"
            ? buildEnterKorchmaKeyboard()
            : keyboard === "overview"
              ? buildQuestOverviewKeyboard()
            : buildQuestHubKeyboard({
                ...keyboard.snapshot,
                characterLevel: keyboard.snapshot.character.level,
                mode: keyboard.mode
              })
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
