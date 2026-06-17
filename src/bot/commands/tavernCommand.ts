import type { Bot, Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import {
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_RAID_FRIDAY_BARREL
} from "../../services/presenceService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import type { LevelMilestoneService } from "../../services/levelMilestoneService";
import type { RemortService } from "../../services/remortService";
import type { CellarGrownupQuestService } from "../../services/cellarGrownupQuestService";
import type { FightService, ProblemQuestProgress } from "../../services/fightService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import {
  buildKorchmaArrivalBoardKeyboard,
  buildKorchmaBarKeyboard,
  buildKorchmaFrontKeyboard,
  buildKorchmaHallKeyboard,
  buildKorchmaMemorialBoardKeyboard,
  buildTavernKeyboard,
  buildTavernResultKeyboard
} from "../keyboards/tavernKeyboard";
import {
  presentKorchmaArrivalBoard,
  presentKorchmaBar,
  presentKorchmaFront,
  presentKorchmaHall,
  presentKorchmaMemorialBoard,
  presentTavern,
  presentTavernAlreadyRaided,
  presentTavernNoCharacter,
  presentTavernRaidAuditBreak,
  presentTavernRaidPending,
  presentTavernRaidReadyToComplete
} from "../presenters/tavernPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type ReplyOptions = Parameters<Context["reply"]>[1];

export function registerTavernCommand(
  bot: Bot,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService
): void {
  bot.command("tavern", async (ctx) => {
    await sendTavern(ctx, tavernRaidService, presenceService, "reply");
  });

  bot.command("raid", async (ctx) => {
    await sendTavernBarrel(ctx, tavernRaidService, presenceService, "reply");
  });
}

export async function sendTavern(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_HALL);
  const presence = await presenceService.getKorchmaInteriorPresence();

  await sendText(
    ctx,
    mode,
    presentKorchmaHall(result.character, presence, telegramUserId, {
      flavorSeed: `korchma-hall:${ctx.update?.update_id ?? "manual"}`
    }),
    { state: "hall", characterLevel: result.character.level }
  );
}

export async function sendKorchmaFront(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_FRONT);
  await sendText(ctx, mode, presentKorchmaFront(result.character), "front");
}

export async function sendKorchmaArrivalBoard(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_FRONT);
  const board = await presenceService.getKorchmaArrivalBoard();

  await sendText(ctx, mode, presentKorchmaArrivalBoard(result.character, board), "arrivals");
}

export async function sendKorchmaMemorialBoard(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  levelMilestoneService?: LevelMilestoneService,
  remortService?: Pick<RemortService, "listBoard">
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_FRONT);
  const [milestones, remorts] = await Promise.all([
    levelMilestoneService ? levelMilestoneService.getBoard() : Promise.resolve(undefined),
    remortService ? remortService.listBoard() : Promise.resolve(undefined)
  ]);

  await sendText(ctx, mode, presentKorchmaMemorialBoard(result.character, milestones, remorts), "memorial");
}

export async function sendKorchmaBar(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  cellarGrownupQuestService?: CellarGrownupQuestService,
  fightService?: FightService
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BAR);
  const cellarGrownup = cellarGrownupQuestService
    ? await cellarGrownupQuestService.getForTelegramUser(telegramUserId)
    : null;
  const problemQuest = fightService
    ? await fightService.getProblemQuestProgressForTelegramUser(telegramUserId)
    : null;
  const problemQuestAction =
    problemQuest?.state === "ready"
      ? getProblemQuestBarActionFromProgress(problemQuest.progress)
      : undefined;
  const barOptions = {
    state: "bar",
    includeBottleTurnIn:
      cellarGrownup?.state === "bottle-obtained" && cellarGrownup.bottleQuantity > 0,
    ...(problemQuestAction ? { problemQuestAction } : {})
  } as const;

  await sendText(ctx, mode, presentKorchmaBar(result.character, barOptions), barOptions);
}

export async function sendTavernBarrel(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "already-completed") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
    await sendText(ctx, mode, presentTavernAlreadyRaided(result.character), "barrel-result");
    return;
  }

  if (result.state === "audit-break") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
    await sendText(ctx, mode, presentTavernRaidAuditBreak(result), "barrel-result");
    return;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
  await sendText(ctx, mode, presentTavern(result.character), true);
}

async function markTavernPlace(
  ctx: Context,
  presenceService: PresenceService,
  locationId: string,
  inPendingRaid = false
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presenceService.markAction({
    user: player,
    locationId,
    currentRaidId: inPendingRaid ? PRESENCE_RAID_FRIDAY_BARREL : null,
    currentAdventureId: null
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | boolean
    | "hall"
    | { state: "hall"; characterLevel?: number }
    | { state: "bar"; includeBottleTurnIn?: boolean; problemQuestAction?: "turn-in" | "take" | "next" }
    | "front"
    | "arrivals"
    | "memorial"
    | "barrel-result"
    | "barrel-pending" = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "hall"
            ? buildKorchmaHallKeyboard()
            : isHallKeyboard(keyboard)
              ? buildKorchmaHallKeyboard(
                  keyboard.characterLevel === undefined ? {} : { characterLevel: keyboard.characterLevel }
                )
            : isBarKeyboard(keyboard)
              ? buildKorchmaBarKeyboard({
                  includeBottleTurnIn: Boolean(keyboard.includeBottleTurnIn),
                  ...(keyboard.problemQuestAction ? { problemQuestAction: keyboard.problemQuestAction } : {})
                })
            : keyboard === "front"
              ? buildKorchmaFrontKeyboard()
            : keyboard === "arrivals"
              ? buildKorchmaArrivalBoardKeyboard()
              : keyboard === "memorial"
                ? buildKorchmaMemorialBoardKeyboard()
                : keyboard === "barrel-result"
                  ? buildTavernResultKeyboard("already-completed")
                  : keyboard === "barrel-pending"
                    ? buildTavernResultKeyboard("pending")
                    : buildTavernKeyboard()
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

function isBarKeyboard(
  keyboard:
    | boolean
    | "hall"
    | { state: "hall"; characterLevel?: number }
    | { state: "bar"; includeBottleTurnIn?: boolean; problemQuestAction?: "turn-in" | "take" | "next" }
    | "front"
    | "arrivals"
    | "memorial"
    | "barrel-result"
    | "barrel-pending"
    | "barrel-participants"
): keyboard is { state: "bar"; includeBottleTurnIn?: boolean; problemQuestAction?: "turn-in" | "take" | "next" } {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "bar";
}

function isHallKeyboard(
  keyboard:
    | boolean
    | "hall"
    | { state: "hall"; characterLevel?: number }
    | { state: "bar"; includeBottleTurnIn?: boolean; problemQuestAction?: "turn-in" | "take" | "next" }
    | "front"
    | "arrivals"
    | "memorial"
    | "barrel-result"
    | "barrel-pending"
    | "barrel-participants"
): keyboard is { state: "hall"; characterLevel?: number } {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "hall";
}

function getProblemQuestBarActionFromProgress(
  progress: ProblemQuestProgress
): "turn-in" | "take" | "next" | undefined {
  if (progress.branchComplete) {
    return undefined;
  }

  if (!progress.issued) {
    return "take";
  }

  if (progress.completed && !progress.rewardClaimed) {
    return "turn-in";
  }

  if (progress.rewardClaimed && progress.stageId !== "93") {
    return "next";
  }

  return undefined;
}
