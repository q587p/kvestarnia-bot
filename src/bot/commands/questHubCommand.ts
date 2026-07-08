import type { Bot, Context } from "grammy";
import type { AdventureService } from "../../services/adventureService";
import type { BarrelBeerTutorialService } from "../../services/barrelBeerTutorialService";
import type { CellarErrandService } from "../../services/cellarErrandService";
import type { CellarGrownupQuestService } from "../../services/cellarGrownupQuestService";
import type { FightService } from "../../services/fightService";
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
import { buildEnterKorchmaKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentKorchmaQuestGate,
  presentQuestHub,
  presentQuestHubNoCharacter,
  type QuestHubMode,
  type QuestHubSnapshot
} from "../presenters/questHubPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

type ReplyOptions = Parameters<Context["reply"]>[1];

export interface QuestHubCommandOptions {
  adventure: AdventureService;
  barrelBeerTutorial?: BarrelBeerTutorialService;
  cellarErrand: CellarErrandService;
  cellarGrownup?: CellarGrownupQuestService;
  dailyKorchmaRound?: DailyKorchmaRoundService;
  fight: FightService;
  itemUpgrades?: Pick<ItemUpgradeService, "getUnlockQuestForTelegramUser">;
  yeger: YegerQuestService;
  presence: PresenceService;
  tavernRaid?: TavernRaidService;
}

export function registerQuestHubCommand(bot: Bot, options: QuestHubCommandOptions): void {
  bot.command("quest", async (ctx) => {
    await sendQuestHub(ctx, options, "reply");
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

  const snapshot = await buildQuestHubSnapshot(
    telegramUserId,
    options,
    PRESENCE_LOCATION_KORCHMA_QUEST_TABLE
  );

  if (!snapshot) {
    await sendText(ctx, mode, presentQuestHubNoCharacter());
    return;
  }

  await markQuestTablePresence(ctx, options.presence);
  await sendText(ctx, mode, presentQuestHub(snapshot, hubMode), { snapshot, mode: hubMode });
}

async function buildQuestHubSnapshot(
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
  keyboard: { snapshot: QuestHubSnapshot; mode: QuestHubMode } | "enter-korchma" | false = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "enter-korchma"
            ? buildEnterKorchmaKeyboard()
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
