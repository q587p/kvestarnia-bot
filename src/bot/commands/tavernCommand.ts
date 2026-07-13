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
import type { TavernGameService } from "../../services/tavernGameService";
import type { PresentedRoundOffer, ShynokService } from "../../services/shynokService";
import type { DuelTournamentService } from "../../services/duelTournamentService";
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
import type { QuestMarkerInput } from "../keyboards/questButtonMarkers";
import { getMunchkinLocationAt, type MunchkinLocation } from "../../domain/levelBarter/munchkinSchedule";
import { isBigBarrelEligible } from "../../domain/partyBoss/partyBoss";
import { isTrainingDoppelgangerAtShynok } from "../../domain/trainingDoppelganger";
import { systemClock } from "../../shared/time";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import {
  buildKorchmaArrivalBoardKeyboard,
  buildKorchmaBarKeyboard,
  buildBackToKorchmaHallKeyboard,
  buildKorchmaDeepKeyboard,
  buildDuelTournamentKeyboard,
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
  presentDuelTournamentBoard,
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
  presentBigBarrelApproachNotice,
  presentPartyBoss,
  presentPartyCreate
} from "../presenters/partySessionPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { isPassageSearchAvailable } from "../passageSearchAvailability";
import { getTavernGameButtonOptions } from "../tavernGameButtonOptions";

type ReplyOptions = Parameters<Context["reply"]>[1];
type TavernCommandKeyboard =
  | boolean
  | "hall"
  | { state: "hall"; characterLevel?: number; questMarkers?: QuestMarkerInput | null }
  | {
      state: "bar";
      includeBottleTurnIn?: boolean;
      problemQuestAction?: "turn-in" | "take" | "next";
      bardPerformance?: boolean;
      tavernGames?: boolean;
      tavernGameTableCount?: number;
      openRoundOffers?: PresentedRoundOffer[];
      questMarkers?: QuestMarkerInput | null;
    }
  | "front"
  | {
      state: "front";
      yegerAction: "hidden" | "hunt";
      munchkinLocation?: MunchkinLocation;
      dailyYard?: boolean;
      characterLevel?: number;
      questMarkers?: QuestMarkerInput | null;
    }
  | "yard"
  | { state: "yard"; questMarkers?: QuestMarkerInput | null }
  | "news-corner"
  | "fighting-corner"
  | {
      state: "fighting-corner";
      questMarkers?: QuestMarkerInput | null;
      trainingDoppelgangerAvailable?: boolean;
      tournamentPendingRewardCount?: number;
    }
  | {
      state: "duel-tournament";
      period: "day" | "week" | "month";
      claim: Parameters<typeof buildDuelTournamentKeyboard>[0]["claim"];
      pendingRewards: Parameters<typeof buildDuelTournamentKeyboard>[0]["pendingRewards"];
    }
  | "deep"
  | { state: "deep"; munchkinLocation?: MunchkinLocation; searchAvailable?: boolean }
  | "back-to-fighting-corner"
  | "back-to-hall"
  | "arrivals"
  | { state: "memorial"; remortNumbers?: readonly number[] }
  | "remort-milestones"
  | { state: "barrel"; questMarkers?: QuestMarkerInput | null }
  | "barrel-result"
  | { state: "barrel-result"; questMarkers?: QuestMarkerInput | null }
  | "barrel-pending"
  | "barrel-participants";

export interface TavernCommandOptions {
  botUsername?: string | undefined;
  partyBoss?: PartyBossService | undefined;
  partySessions?: PartySessionService | undefined;
  playerHintService?: Pick<PlayerHintService, "claimKorchmaHallYegerCountHint"> | undefined;
  openBigBarrelRecruiting?: boolean | undefined;
  onlyBigBarrelRecruiting?: boolean | undefined;
  questMarkers?: QuestMarkerInput | null | undefined;
  resolveQuestMarkers?: ((telegramUserId: bigint) => Promise<QuestMarkerInput | null>) | undefined;
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
    const questMarkers = await resolveTavernCommandQuestMarkers(ctx, options);
    await sendTavern(ctx, tavernRaidService, presenceService, "reply", {
      ...(options.playerHintService ? { playerHintService: options.playerHintService } : {}),
      ...(questMarkers === undefined ? {} : { questMarkers })
    });
  });

  bot.command("raid", async (ctx) => {
    const questMarkers = await resolveTavernCommandQuestMarkers(ctx, options);
    await sendTavernBarrel(ctx, tavernRaidService, presenceService, "reply", {
      ...options,
      ...(questMarkers === undefined ? {} : { questMarkers }),
      openBigBarrelRecruiting: true
    });
  });
}

async function resolveTavernCommandQuestMarkers(
  ctx: Context,
  options: TavernCommandOptions
): Promise<QuestMarkerInput | null | undefined> {
  if (options.questMarkers !== undefined) {
    return options.questMarkers;
  }

  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId || !options.resolveQuestMarkers) {
    return undefined;
  }

  return options.resolveQuestMarkers(telegramUserId);
}

export async function sendTavern(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  options: {
    playerHintService?: Pick<PlayerHintService, "claimKorchmaHallYegerCountHint"> | undefined;
    questMarkers?: QuestMarkerInput | null;
  } = {}
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
  const yegerCountHint = await options.playerHintService?.claimKorchmaHallYegerCountHint(telegramUserId, {
    remortCount: result.character.remortCount
  });

  await sendText(
    ctx,
    mode,
    presentKorchmaHall(result.character, presence, telegramUserId, {
      flavorSeed: `korchma-hall:${ctx.update?.update_id ?? "manual"}`,
      showYegerCountHint: yegerCountHint?.shouldShow ?? true
    }),
    {
      state: "hall",
      characterLevel: result.character.level,
      ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
    }
  );
}

export async function sendKorchmaFront(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  yegerQuestService?: Pick<YegerQuestService, "getForTelegramUser">,
  options: {
    now?: Date;
    playerHintService?: Pick<PlayerHintService, "claimKorchmaFrontEntryHint">;
    questMarkers?: QuestMarkerInput | null;
  } = {}
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
    characterLevel: result.character.level,
    ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
  });
}

export async function sendKorchmaYard(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  options: { questMarkers?: QuestMarkerInput | null } = {}
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
  await sendText(ctx, mode, presentKorchmaYard(result.character), options.questMarkers
    ? { state: "yard", questMarkers: options.questMarkers }
    : "yard");
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
  mode: "reply" | "edit",
  options: {
    questMarkers?: QuestMarkerInput | null;
    now?: Date;
    tournamentService?: Pick<DuelTournamentService, "countPendingRewardsForTelegramUser"> | undefined;
  } = {}
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
  const trainingDoppelgangerAvailable = !isTrainingDoppelgangerAtShynok(options.now ?? systemClock());
  const tournamentPendingRewardCount = await options.tournamentService?.countPendingRewardsForTelegramUser(telegramUserId);
  await sendText(
    ctx,
    mode,
    presentKorchmaFightingCorner(result.character, {
      ...(options.questMarkers?.fightingCornerQuest === undefined
        ? {}
        : { fightingCornerQuest: options.questMarkers.fightingCornerQuest }),
      trainingDoppelgangerAvailable,
      ...(tournamentPendingRewardCount === undefined ? {} : { tournamentPendingRewardCount })
    }),
    {
      state: "fighting-corner",
      trainingDoppelgangerAvailable,
      ...(tournamentPendingRewardCount === undefined ? {} : { tournamentPendingRewardCount }),
      ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
    }
  );
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

export async function sendDuelTournamentBoard(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  tournamentService: Pick<DuelTournamentService, "getBoardForTelegramUser">,
  period: "day" | "week" | "month",
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
  const boardResult = await tournamentService.getBoardForTelegramUser(telegramUserId, period);

  if (boardResult.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  await sendText(
    ctx,
    mode,
    presentDuelTournamentBoard(boardResult.board),
    {
      state: "duel-tournament",
      period,
      claim: boardResult.board.claim,
      pendingRewards: boardResult.board.pendingRewards
    }
  );
}

export async function sendKorchmaBar(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  cellarGrownupQuestService?: CellarGrownupQuestService,
  fightService?: FightService,
  tavernGameService?: TavernGameService,
  options: { questMarkers?: QuestMarkerInput | null; shynokService?: ShynokService | undefined } = {}
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
  const tavernGameOptions = await getTavernGameButtonOptions(tavernGameService);
  const shynokOverview = options.shynokService
    ? await options.shynokService.getOverviewForTelegramUser(telegramUserId)
    : null;
  const barOptions = {
    state: "bar",
    includeBottleTurnIn:
      cellarGrownup?.state === "bottle-obtained" && cellarGrownup.bottleQuantity > 0,
    bardPerformance: result.character.classId === "class.bard" && result.character.level >= 3,
    ...(shynokOverview?.state === "ready" && shynokOverview.openRoundOffers.length > 0
      ? { openRoundOffers: shynokOverview.openRoundOffers }
      : {}),
    ...tavernGameOptions,
    ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers }),
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
    await sendText(ctx, mode, presentTavernAlreadyRaided(result.character), {
      state: "barrel-result",
      ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
    });
    return true;
  }

  if (result.state === "audit-break") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
    await sendText(ctx, mode, presentTavernRaidAuditBreak(result), {
      state: "barrel-result",
      ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
    });
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
        partyBoss: options.partyBoss,
        telegramUserId,
        includeDevTimeout: options.partyBoss?.areDevHelpersEnabled()
      });
      return true;
    }

    if (!options.openBigBarrelRecruiting) {
      if (options.onlyBigBarrelRecruiting) {
        return false;
      }

      await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
      await sendText(ctx, mode, presentTavern(result.character), {
        state: "barrel",
        ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
      });
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
    if (session && party.state === "created" && session.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID) {
      await sendBigBarrelApproachIntro(ctx, session.inviteToken);
    }
    const sentMessageId = await sendBigPartyText(ctx, mode, presentPartyCreate(party, { inviteUrl }), session
      ? {
          session,
          inviteUrl,
          viewerCharacterId: getPartyViewerCharacterId(session, telegramUserId),
          includeBossStart: session.originLocationId === BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
          includeDevExpire: options.partySessions.areDevHelpersEnabled()
        }
      : false);
    if (session && sentMessageId && ctx.chat?.id) {
      await options.partySessions.recordParticipantMessageReference(telegramUserId, session.inviteToken, {
        chatId: BigInt(ctx.chat.id),
        messageId: sentMessageId
      });
    }
    return true;
  }

  if (options.onlyBigBarrelRecruiting) {
    return false;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
  await sendText(ctx, mode, presentTavern(result.character), {
    state: "barrel",
    ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
  });
  return true;
}

async function sendBigBarrelApproachIntro(ctx: Context, seed: string): Promise<void> {
  await ctx.reply(presentBigBarrelApproachNotice(seed), HTML_MESSAGE_OPTIONS);
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
): Promise<number | null> {
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
    return null;
  }

  const message = await ctx.reply(text, options);
  return message.message_id ?? null;
}

async function sendBigBossText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard: {
    session: Parameters<typeof buildPartyBossKeyboard>[0];
    viewerCharacterId?: string | null | undefined;
    partyBoss?: PartyBossService | undefined;
    telegramUserId?: bigint | undefined;
    includeCombatItems?: boolean | undefined;
    includeDevTimeout?: boolean | undefined;
  }
): Promise<void> {
  const includeCombatItems = await resolvePartyBossCombatItemShortcut(
    keyboard.partyBoss,
    keyboard.telegramUserId,
    keyboard.session,
    keyboard.includeCombatItems
  );
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildPartyBossKeyboard(keyboard.session, keyboard.viewerCharacterId ?? null, {
      ...(includeCombatItems === undefined ? {} : { includeCombatItems }),
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

async function resolvePartyBossCombatItemShortcut(
  partyBoss: PartyBossService | undefined,
  telegramUserId: bigint | undefined,
  session: Parameters<typeof buildPartyBossKeyboard>[0],
  explicit?: boolean
): Promise<boolean | undefined> {
  if (explicit !== undefined) {
    return explicit;
  }

  if (!partyBoss || telegramUserId === undefined || session.status !== "active") {
    return undefined;
  }

  return partyBoss.hasCombatItemsForTelegramUser(
    telegramUserId,
    session.partyInviteToken,
    session.turn
  );
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
                  {
                    ...(keyboard.characterLevel === undefined ? {} : { characterLevel: keyboard.characterLevel }),
                    ...(keyboard.questMarkers === undefined ? {} : { questMarkers: keyboard.questMarkers })
                  }
                )
            : isBarKeyboard(keyboard)
              ? buildKorchmaBarKeyboard({
                  includeBottleTurnIn: Boolean(keyboard.includeBottleTurnIn),
                  bardPerformance: Boolean(keyboard.bardPerformance),
                  tavernGames: Boolean(keyboard.tavernGames),
                  ...(keyboard.tavernGameTableCount === undefined
                    ? {}
                    : { tavernGameTableCount: keyboard.tavernGameTableCount }),
                  ...(keyboard.openRoundOffers === undefined ? {} : { openRoundOffers: keyboard.openRoundOffers }),
                  ...(keyboard.questMarkers === undefined ? {} : { questMarkers: keyboard.questMarkers }),
                  ...(keyboard.problemQuestAction ? { problemQuestAction: keyboard.problemQuestAction } : {})
                })
            : keyboard === "fighting-corner"
              ? buildKorchmaFightingCornerKeyboard({
                  trainingDoppelgangerAvailable: !isTrainingDoppelgangerAtShynok(systemClock())
                })
            : isFightingCornerKeyboard(keyboard)
              ? buildKorchmaFightingCornerKeyboard(
                  {
                    ...(keyboard.questMarkers === undefined ? {} : { questMarkers: keyboard.questMarkers }),
                    ...(keyboard.trainingDoppelgangerAvailable === undefined
                      ? {}
                      : { trainingDoppelgangerAvailable: keyboard.trainingDoppelgangerAvailable }),
                    ...(keyboard.tournamentPendingRewardCount === undefined
                      ? {}
                      : { tournamentPendingRewardCount: keyboard.tournamentPendingRewardCount })
                  }
                )
            : isDuelTournamentKeyboard(keyboard)
              ? buildDuelTournamentKeyboard({
                  period: keyboard.period,
                  claim: keyboard.claim,
                  ...(keyboard.pendingRewards === undefined ? {} : { pendingRewards: keyboard.pendingRewards })
                })
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
              ? buildKorchmaFightingCornerKeyboard({
                  trainingDoppelgangerAvailable: !isTrainingDoppelgangerAtShynok(systemClock())
                })
            : keyboard === "back-to-hall"
              ? buildBackToKorchmaHallKeyboard()
            : isFrontKeyboard(keyboard)
              ? buildKorchmaFrontKeyboard({
                  yegerAction: keyboard.yegerAction,
                  dailyYard: Boolean(keyboard.dailyYard),
                  ...(keyboard.characterLevel === undefined
                    ? {}
                    : { characterLevel: keyboard.characterLevel }),
                  ...(keyboard.questMarkers === undefined
                    ? {}
                    : { questMarkers: keyboard.questMarkers }),
                  ...(keyboard.munchkinLocation === undefined
                    ? {}
                    : { munchkinLocation: keyboard.munchkinLocation })
                })
            : keyboard === "yard"
              ? buildKorchmaYardKeyboard()
            : isYardKeyboard(keyboard)
              ? buildKorchmaYardKeyboard(
                  keyboard.questMarkers === undefined ? {} : { questMarkers: keyboard.questMarkers }
                )
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
            : isBarrelKeyboard(keyboard)
              ? buildTavernKeyboard(
                  keyboard.questMarkers === undefined ? {} : { questMarkers: keyboard.questMarkers }
                )
            : isBarrelResultKeyboard(keyboard)
              ? buildTavernResultKeyboard(
                  "already-completed",
                  keyboard.questMarkers === undefined ? {} : { questMarkers: keyboard.questMarkers }
                )
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

function isFightingCornerKeyboard(
  keyboard: TavernCommandKeyboard
): keyboard is Extract<TavernCommandKeyboard, { state: "fighting-corner" }> {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "fighting-corner";
}

function isDuelTournamentKeyboard(
  keyboard: TavernCommandKeyboard
): keyboard is Extract<TavernCommandKeyboard, { state: "duel-tournament" }> {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "duel-tournament";
}

function isBarKeyboard(keyboard: TavernCommandKeyboard): keyboard is Extract<TavernCommandKeyboard, { state: "bar" }> {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "bar";
}

function isYardKeyboard(keyboard: TavernCommandKeyboard): keyboard is Extract<TavernCommandKeyboard, { state: "yard" }> {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "yard";
}

function isBarrelKeyboard(keyboard: TavernCommandKeyboard): keyboard is Extract<TavernCommandKeyboard, { state: "barrel" }> {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "barrel";
}

function isBarrelResultKeyboard(
  keyboard: TavernCommandKeyboard
): keyboard is Extract<TavernCommandKeyboard, { state: "barrel-result" }> {
  return typeof keyboard === "object" && keyboard !== null && "state" in keyboard && keyboard.state === "barrel-result";
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
