import type { Bot, Context } from "grammy";
import type { AdventureService } from "../../services/adventureService";
import type { CellarErrandService } from "../../services/cellarErrandService";
import type { CellarGrownupQuestService } from "../../services/cellarGrownupQuestService";
import type { FightService } from "../../services/fightService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import type { YegerQuestService } from "../../services/yegerQuestService";
import {
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import { buildQuestHubKeyboard } from "../keyboards/questHubKeyboard";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
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
  cellarErrand: CellarErrandService;
  cellarGrownup?: CellarGrownupQuestService;
  fight: FightService;
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

  const snapshot = await buildQuestHubSnapshot(telegramUserId, options);

  if (!snapshot) {
    await sendText(ctx, mode, presentQuestHubNoCharacter());
    return;
  }

  await markQuestTablePresence(ctx, options.presence);
  await sendText(ctx, mode, presentQuestHub(snapshot, hubMode), { snapshot, mode: hubMode });
}

async function buildQuestHubSnapshot(
  telegramUserId: bigint,
  options: QuestHubCommandOptions
): Promise<QuestHubSnapshot | null> {
  const adventure = await options.adventure.getMimicShawarmaForTelegramUser(telegramUserId);

  if (adventure.state === "no-character") {
    return null;
  }

  const fight = await options.fight.getFightOverviewForTelegramUser(telegramUserId);
  const problemQuest = await options.fight.getProblemQuestProgressForTelegramUser(telegramUserId);
  const yeger = await options.yeger.getForTelegramUser(telegramUserId);
  const cellar = await options.cellarErrand.getForTelegramUser(telegramUserId);
  const cellarGrownup =
    cellar.state === "level-retired" && options.cellarGrownup
      ? await options.cellarGrownup.getForTelegramUser(telegramUserId)
      : null;

  if (
    fight.state === "no-character" ||
    problemQuest.state === "no-character" ||
    yeger.state === "no-character" ||
    cellar.state === "no-character"
  ) {
    return null;
  }

  const character = fight.character;

  return {
    character,
    adventure,
    fight,
    problemQuest: problemQuest.progress,
    yeger,
    cellar,
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
            ? buildKorchmaFrontKeyboard()
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
