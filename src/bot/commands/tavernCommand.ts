import type { Bot, Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import type { PlayerHintService } from "../../services/playerHintService";
import {
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_YARD,
  PRESENCE_RAID_FRIDAY_BARREL
} from "../../services/presenceService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { getBarrelRaidPeriod } from "../../services/tavernRaidService";
import type { PartyBossService } from "../../services/partyBossService";
import {
  buildPartyInviteUrl,
  BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
  type PartySessionService
} from "../../services/partySessionService";
import type { DuelChallengeService } from "../../services/duelChallengeService";
import type { LevelMilestoneService } from "../../services/levelMilestoneService";
import type { RemortService } from "../../services/remortService";
import {
  PASSAGE_SEARCH_NODE_DESCENT,
  type PassageSearchService
} from "../../services/passageSearchService";
import type { CellarGrownupQuestService } from "../../services/cellarGrownupQuestService";
import {
  PROBLEM_QUEST_REQUIRED_LEVEL,
  type FightService,
  type ProblemQuestProgress
} from "../../services/fightService";
import type { YegerQuestService } from "../../services/yegerQuestService";
import { getMunchkinLocationAt, type MunchkinLocation } from "../../domain/levelBarter/munchkinSchedule";
import { isBigBarrelEligible } from "../../domain/partyBoss/partyBoss";
import { systemClock } from "../../shared/time";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import {
  buildKorchmaArrivalBoardKeyboard,
  buildKorchmaBarKeyboard,
  buildBackToKorchmaHallKeyboard,
  buildKorchmaDeepKeyboard,
  buildKorchmaFightingCornerKeyboard,
  buildKorchmaFrontKeyboard,
  buildKorchmaHallKeyboard,
  buildKorchmaNewsCornerKeyboard,
  buildKorchmaYardKeyboard,
  buildKorchmaMemorialBoardKeyboard,
  buildKorchmaRemortMilestoneBoardKeyboard,
  buildTavernKeyboard,
  buildTavernResultKeyboard
} from "../keyboards/tavernKeyboard";
import {
  buildPartyBossKeyboard,
  buildPartySessionKeyboard
} from "../keyboards/partySessionKeyboard";
import {
  presentKorchmaArrivalBoard,
  presentKorchmaBar,
  presentDuelWinnersBoard,
  presentKorchmaDeepClosed,
  presentKorchmaDeepLevelLocked,
  presentKorchmaFightingCorner,
  presentKorchmaFightingCornerLevelLocked,
  presentKorchmaFront,
  presentKorchmaHall,
  presentKorchmaNewsCorner,
  presentKorchmaYard,
  presentKorchmaMemorialBoard,
  presentKorchmaRemortMilestoneBoard,
  presentTavern,
  presentTavernAlreadyRaided,
  presentTavernNoCharacter,
  presentTavernRaidAuditBreak,
  presentTavernRaidPending,
  presentTavernRaidReadyToComplete
} from "../presenters/tavernPresenter";
import {
  presentPartyBoss,
  presentPartyCreate
} from "../presenters/partySessionPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { isPassageSearchAvailable } from "../passageSearchAvailability";

type ReplyOptions = Parameters<Context["reply"]>[1];
type TavernCommandKeyboard =
  | boolean
  | "hall"
  | { state: "hall"; characterLevel?: number }
  | {
      state: "bar";
      includeBottleTurnIn?: boolean;
      problemQuestAction?: "turn-in" | "take" | "next";
      bardPerformance?: boolean;
    }
  | "front"
  | {
      state: "front";
      yegerAction: "hidden" | "hunt";
      munchkinLocation?: MunchkinLocation;
      dailyYard?: boolean;
      characterLevel?: number;
    }
  | "yard"
  | "news-corner"
  | "fighting-corner"
  | "deep"
  | { state: "deep"; munchkinLocation?: MunchkinLocation; searchAvailable?: boolean }
  | "back-to-fighting-corner"
  | "back-to-hall"
  | "arrivals"
  | { state: "memorial"; remortNumbers?: readonly number[] }
  | "remort-milestones"
  | "barrel-result"
  | "barrel-pending"
  | "barrel-participants";

export interface TavernCommandOptions {
  botUsername?: string | undefined;
  partyBoss?: PartyBossService | undefined;
  partySessions?: PartySessionService | undefined;
  openBigBarrelRecruiting?: boolean | undefined;
  onlyBigBarrelRecruiting?: boolean | undefined;
}

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerTavernCommand(
  bot: Bot,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  options: TavernCommandOptions = {}
): void {
  bot.command("tavern", async (ctx) => {
    await sendTavern(ctx, tavernRaidService, presenceService, "reply");
  });

  bot.command("raid", async (ctx) => {
    await sendTavernBarrel(ctx, tavernRaidService, presenceService, "reply", {
      ...options,
      openBigBarrelRecruiting: true
    });
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
  mode: "reply" | "edit",
  yegerQuestService?: Pick<YegerQuestService, "getForTelegramUser">,
  options: { now?: Date; playerHintService?: Pick<PlayerHintService, "claimKorchmaFrontEntryHint"> } = {}
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
  const yegerAction = await getFrontYegerAction(yegerQuestService, telegramUserId);
  const munchkinLocation = getMunchkinLocationAt(options.now ?? systemClock());
  const entryHint = await options.playerHintService?.claimKorchmaFrontEntryHint(telegramUserId);

  await sendText(ctx, mode, presentKorchmaFront(result.character, {
    munchkinLocation,
    showEntryHint: entryHint?.shouldShow ?? true
  }), {
    state: "front",
    yegerAction,
    munchkinLocation,
    dailyYard: result.character.level >= 3,
    characterLevel: result.character.level
  });
}

export async function sendKorchmaYard(
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

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_YARD);
  await sendText(ctx, mode, presentKorchmaYard(result.character), "yard");
}

export async function sendKorchmaNewsCorner(
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

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_NEWS_CORNER);
  await sendText(ctx, mode, presentKorchmaNewsCorner(result.character), "news-corner");
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

  await sendText(
    ctx,
    mode,
    presentKorchmaMemorialBoard(result.character, milestones, remorts),
    {
      state: "memorial",
      remortNumbers: remorts?.remorts.map((group) => group.remortNumber) ?? []
    }
  );
}

export async function sendKorchmaRemortMilestoneBoard(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  remortNumber: number,
  levelMilestoneService?: LevelMilestoneService
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
  const milestones = levelMilestoneService
    ? await levelMilestoneService.getBoardForRemort(remortNumber)
    : undefined;

  await sendText(
    ctx,
    mode,
    presentKorchmaRemortMilestoneBoard(result.character, remortNumber, milestones),
    "remort-milestones"
  );
}

export async function sendKorchmaFightingCorner(
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

  if (result.character.level < 3) {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_HALL);
    await sendText(ctx, mode, presentKorchmaFightingCornerLevelLocked(result.character), "back-to-hall");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER);
  await sendText(ctx, mode, presentKorchmaFightingCorner(result.character), "fighting-corner");
}

export async function sendKorchmaDeepClosed(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  options: { now?: Date; passageSearch?: PassageSearchService | undefined } = {}
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

  if (result.character.level < 3) {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_HALL);
    await sendText(ctx, mode, presentKorchmaDeepLevelLocked(result.character), "back-to-hall");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_DEEP);
  const munchkinLocation = getMunchkinLocationAt(options.now ?? systemClock());
  const searchAvailable = await isPassageSearchAvailable(
    options.passageSearch,
    telegramUserId,
    PASSAGE_SEARCH_NODE_DESCENT
  );
  await sendText(
    ctx,
    mode,
    presentKorchmaDeepClosed(result.character, { munchkinLocation }),
    { state: "deep", munchkinLocation, searchAvailable }
  );
}

export async function sendDuelWinnersBoard(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  duelService: Pick<DuelChallengeService, "getLeaderboard">,
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

  if (result.character.level < 3) {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_HALL);
    await sendText(ctx, mode, presentKorchmaFightingCornerLevelLocked(result.character), "back-to-hall");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER);
  const leaderboard = await duelService.getLeaderboard();
  await sendText(ctx, mode, presentDuelWinnersBoard(result.character, leaderboard), "back-to-fighting-corner");
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
    problemQuest?.state === "ready" && result.character.level >= PROBLEM_QUEST_REQUIRED_LEVEL
      ? getProblemQuestBarActionFromProgress(problemQuest.progress)
      : undefined;
  const barOptions = {
    state: "bar",
    includeBottleTurnIn:
      cellarGrownup?.state === "bottle-obtained" && cellarGrownup.bottleQuantity > 0,
    bardPerformance: result.character.classId === "class.bard" && result.character.level >= 3,
    ...(problemQuestAction ? { problemQuestAction } : {})
  } as const;

  await sendText(ctx, mode, presentKorchmaBar(result.character, barOptions), barOptions);
}

export async function sendTavernBarrel(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  options: TavernCommandOptions = {}
): Promise<boolean> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return true;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return true;
  }

  if (result.state === "already-completed") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
    await sendText(ctx, mode, presentTavernAlreadyRaided(result.character), "barrel-result");
    return true;
  }

  if (result.state === "audit-break") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
    await sendText(ctx, mode, presentTavernRaidAuditBreak(result), "barrel-result");
    return true;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return true;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return true;
  }

  if (
    isBigBarrelEligible(result.character.level, result.character.remortCount) &&
    options.partySessions?.isBigBarrelBrotherEnabled()
  ) {
    const activeBoss = await options.partyBoss?.getActiveForTelegramUser(telegramUserId);
    if (activeBoss) {
      await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
      const viewerCharacterId = getBossViewerCharacterId(activeBoss, telegramUserId);
      await sendBigBossText(ctx, mode, presentPartyBoss(activeBoss, { viewerCharacterId }), {
        session: activeBoss,
        viewerCharacterId,
        includeDevTimeout: options.partyBoss?.areDevHelpersEnabled()
      });
      return true;
    }

    if (!options.openBigBarrelRecruiting) {
      if (options.onlyBigBarrelRecruiting) {
        return false;
      }

      await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
      await sendText(ctx, mode, presentTavern(result.character), true);
      return true;
    }

    const period = getBarrelRaidPeriod(new Date());
    const party = await options.partySessions.createForTelegramUser(telegramUserId, {
      chatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
      messageId: ctx.callbackQuery?.message?.message_id ?? null,
      periodId: period.id,
      originLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID
    });
    const session = "session" in party ? party.session : null;
    const inviteUrl = session ? buildPartyInviteUrl(options.botUsername, session.inviteToken) : null;

    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
    await sendBigPartyText(ctx, mode, presentPartyCreate(party, { inviteUrl }), session
      ? {
          session,
          inviteUrl,
          viewerCharacterId: getPartyViewerCharacterId(session, telegramUserId),
          includeBossStart: session.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
          includeDevExpire: options.partySessions.areDevHelpersEnabled()
        }
      : false);
    return true;
  }

  if (options.onlyBigBarrelRecruiting) {
    return false;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
  await sendText(ctx, mode, presentTavern(result.character), true);
  return true;
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

async function sendBigPartyText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | false
    | {
        session: Parameters<typeof buildPartySessionKeyboard>[0];
        inviteUrl?: string | null | undefined;
        viewerCharacterId?: string | null | undefined;
        includeBossStart?: boolean | undefined;
        includeDevExpire?: boolean | undefined;
      }
): Promise<void> {
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    ...(keyboard
      ? {
          reply_markup: buildPartySessionKeyboard(keyboard.session, {
            viewerCharacterId: keyboard.viewerCharacterId,
            inviteUrl: keyboard.inviteUrl,
            includeBossStart: keyboard.includeBossStart,
            includeDevExpire: keyboard.includeDevExpire
          })
        }
      : {})
  };

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

async function sendBigBossText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard: {
    session: Parameters<typeof buildPartyBossKeyboard>[0];
    viewerCharacterId?: string | null | undefined;
    includeDevTimeout?: boolean | undefined;
  }
): Promise<void> {
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildPartyBossKeyboard(keyboard.session, keyboard.viewerCharacterId ?? null, {
      includeDevTimeout: keyboard.includeDevTimeout
    })
  };

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

function getPartyViewerCharacterId(
  session: Parameters<typeof buildPartySessionKeyboard>[0],
  telegramUserId: bigint
): string | null {
  const participant = session.participants.find(
    (row) => row.character.telegramUserId === telegramUserId && row.status === "joined"
  );

  return participant?.characterId ?? null;
}

function getBossViewerCharacterId(
  session: Parameters<typeof buildPartyBossKeyboard>[0],
  telegramUserId: bigint
): string | null {
  const participant = session.participants.find((row) => row.telegramUserId === telegramUserId);
  return participant?.id ?? null;
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard: TavernCommandKeyboard = false
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
                  bardPerformance: Boolean(keyboard.bardPerformance),
                  ...(keyboard.problemQuestAction ? { problemQuestAction: keyboard.problemQuestAction } : {})
                })
            : keyboard === "fighting-corner"
              ? buildKorchmaFightingCornerKeyboard()
            : keyboard === "deep"
              ? buildKorchmaDeepKeyboard()
            : isDeepKeyboard(keyboard)
              ? buildKorchmaDeepKeyboard(
                  {
                    ...(keyboard.munchkinLocation === undefined
                      ? {}
                      : { munchkinLocation: keyboard.munchkinLocation }),
                    ...(keyboard.searchAvailable === undefined
                      ? {}
                      : { searchAvailable: keyboard.searchAvailable })
                  }
                )
            : keyboard === "back-to-fighting-corner"
              ? buildKorchmaFightingCornerKeyboard()
            : keyboard === "back-to-hall"
              ? buildBackToKorchmaHallKeyboard()
            : isFrontKeyboard(keyboard)
              ? buildKorchmaFrontKeyboard({
                  yegerAction: keyboard.yegerAction,
                  dailyYard: Boolean(keyboard.dailyYard),
                  ...(keyboard.characterLevel === undefined
                    ? {}
                    : { characterLevel: keyboard.characterLevel }),
                  ...(keyboard.munchkinLocation === undefined
                    ? {}
                    : { munchkinLocation: keyboard.munchkinLocation })
                })
            : keyboard === "yard"
              ? buildKorchmaYardKeyboard()
            : keyboard === "news-corner"
              ? buildKorchmaNewsCornerKeyboard()
            : keyboard === "front"
              ? buildKorchmaFrontKeyboard()
            : keyboard === "arrivals"
              ? buildKorchmaArrivalBoardKeyboard()
              : isMemorialKeyboard(keyboard)
                ? buildKorchmaMemorialBoardKeyboard(
                    keyboard.remortNumbers === undefined
                      ? {}
                      : { remortNumbers: keyboard.remortNumbers }
                  )
                : keyboard === "remort-milestones"
                  ? buildKorchmaRemortMilestoneBoardKeyboard()
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

function isFrontKeyboard(
  keyboard: TavernCommandKeyboard
): keyboard is { state: "front"; yegerAction: "hidden" | "hunt"; munchkinLocation?: MunchkinLocation; dailyYard?: boolean } {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "front";
}

function isBarKeyboard(keyboard: TavernCommandKeyboard): keyboard is Extract<TavernCommandKeyboard, { state: "bar" }> {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "bar";
}

function isMemorialKeyboard(
  keyboard: TavernCommandKeyboard
): keyboard is { state: "memorial"; remortNumbers?: readonly number[] } {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "memorial";
}

function isHallKeyboard(
  keyboard: TavernCommandKeyboard
): keyboard is { state: "hall"; characterLevel?: number } {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "hall";
}

function isDeepKeyboard(
  keyboard: TavernCommandKeyboard
): keyboard is { state: "deep"; munchkinLocation?: MunchkinLocation; searchAvailable?: boolean } {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "deep";
}

async function getFrontYegerAction(
  yegerQuestService: Pick<YegerQuestService, "getForTelegramUser"> | undefined,
  telegramUserId: bigint
): Promise<"hidden" | "hunt"> {
  if (!yegerQuestService) {
    return "hidden";
  }

  const yeger = await yegerQuestService.getForTelegramUser(telegramUserId);

  return yeger.state === "in-progress" ? "hunt" : "hidden";
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
