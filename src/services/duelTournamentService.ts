import { items } from "../content";
import type { ResolvedDuelChallengeRecord } from "../db/repositories/duelChallengeRepository";
import type {
  DuelTournamentCharacterRecord,
  DuelTournamentClaimRecord,
  DuelTournamentRepository
} from "../db/repositories/duelTournamentRepository";
import {
  buildDuelTournamentStandings,
  DUEL_TOURNAMENT_PERIODS,
  DUEL_TOURNAMENT_REWARD_LOOKBACK,
  DUEL_TOURNAMENT_RULES_VERSION,
  DUEL_TOURNAMENT_TOP_LIMIT,
  getClosedDuelTournamentWindows,
  getDuelTournamentReward,
  getDuelTournamentWindow,
  getDuelTournamentWindowFromKey,
  getPreviousDuelTournamentWindow,
  type DuelTournamentEntry,
  type DuelTournamentPeriod,
  type DuelTournamentPeriodWindow,
  type DuelTournamentReward
} from "../domain/duels/duelTournament";
import { systemClock, type Clock } from "../shared/time";
import type { PublicActivityEventPublisher } from "./publicActivityEventPublisher";

export type DuelTournamentClaimState =
  | { state: "available"; periodKey: string; reward: DuelTournamentPresentedReward; rank: number; points: number }
  | { state: "claimed"; claim: DuelTournamentClaimRecord; reward: DuelTournamentPresentedReward }
  | { state: "unavailable"; reason: "no-placement" | "not-ended" };

export interface DuelTournamentPresentedReward {
  gold: number;
  items: { itemId: string; name: string; quantity: number }[];
}

export interface DuelTournamentPendingReward {
  period: DuelTournamentPeriod;
  periodKey: string;
  window: DuelTournamentPeriodWindow;
  rank: number;
  points: number;
  reward: DuelTournamentPresentedReward;
}

export interface DuelTournamentBoard {
  period: DuelTournamentPeriod;
  current: DuelTournamentPeriodWindow;
  previous: DuelTournamentPeriodWindow;
  standings: DuelTournamentEntry[];
  previousWinners: DuelTournamentEntry[];
  character: DuelTournamentCharacterRecord;
  yourPoints: number;
  yourRank: number | null;
  remainingMs: number;
  claim: DuelTournamentClaimState;
  pendingRewards: DuelTournamentPendingReward[];
}

export type DuelTournamentBoardResult =
  | { state: "no-character" }
  | { state: "ready"; board: DuelTournamentBoard };

export type DuelTournamentClaimResult =
  | { state: "no-character" }
  | { state: "invalid-period" }
  | { state: "not-ended"; board: DuelTournamentBoard }
  | { state: "not-eligible"; board: DuelTournamentBoard }
  | {
      state: "claimed";
      board: DuelTournamentBoard;
      claim: DuelTournamentClaimRecord;
      created: boolean;
      reward: DuelTournamentPresentedReward;
    };

type DuelTournamentChallengeSource = Pick<{
  listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]>;
}, "listResolvedSince">;

export class DuelTournamentService {
  constructor(
    private readonly tournaments: DuelTournamentRepository,
    private readonly duels: DuelTournamentChallengeSource,
    private readonly activityEvents?: Pick<PublicActivityEventPublisher, "recordDuelTournamentClaimedSafely">,
    private readonly clock: Clock = systemClock
  ) {}

  async getBoardForTelegramUser(
    telegramUserId: bigint,
    period: DuelTournamentPeriod
  ): Promise<DuelTournamentBoardResult> {
    const character = await this.tournaments.findCharacterByTelegramUser(telegramUserId);
    if (!character) {
      return { state: "no-character" };
    }

    return { state: "ready", board: await this.buildBoard(character, period) };
  }

  async claimRewardForTelegramUser(
    telegramUserId: bigint,
    period: DuelTournamentPeriod,
    periodKey: string
  ): Promise<DuelTournamentClaimResult> {
    const character = await this.tournaments.findCharacterByTelegramUser(telegramUserId);
    if (!character) {
      return { state: "no-character" };
    }

    const now = this.clock();
    const window = getDuelTournamentWindowFromKey(period, periodKey);
    if (!window) {
      return { state: "invalid-period" };
    }

    const board = await this.buildBoard(character, period);
    if (window.endsAt > now) {
      return { state: "not-ended", board };
    }

    if (!isWithinRewardLookback(period, periodKey, now)) {
      return { state: "not-eligible", board };
    }

    const records = await this.duels.listResolvedSince(window.startsAt);
    const standings = buildDuelTournamentStandings(records, window);
    const placement = standings.find((entry) => entry.characterId === character.id);
    const reward = placement
      ? getDuelTournamentReward(period, placement.rank, placement.points)
      : null;

    if (!placement || !reward) {
      return { state: "not-eligible", board };
    }

    const claimResult = await this.tournaments.claimReward({
      characterId: character.id,
      period,
      periodKey,
      points: placement.points,
      rank: placement.rank,
      reward,
      result: {
        rulesVersion: DUEL_TOURNAMENT_RULES_VERSION,
        period,
        periodKey,
        rank: placement.rank,
        points: placement.points
      },
      claimedAt: now
    });

    const presentedReward = claimResult.created
      ? presentReward(reward)
      : presentRewardFromClaim(claimResult.claim);

    if (claimResult.created) {
      await this.activityEvents?.recordDuelTournamentClaimedSafely({
        characterId: character.id,
        actorDisplayName: character.name,
        claimId: claimResult.claim.id,
        period,
        periodKey,
        rank: placement.rank,
        points: placement.points,
        occurredAt: now
      });
    }

    return {
      state: "claimed",
      board: await this.buildBoard(character, period),
      claim: claimResult.claim,
      created: claimResult.created,
      reward: presentedReward
    };
  }

  async countPendingRewardsForTelegramUser(telegramUserId: bigint): Promise<number> {
    const character = await this.tournaments.findCharacterByTelegramUser(telegramUserId);
    if (!character) {
      return 0;
    }

    return (await this.listPendingRewards(character, this.clock())).length;
  }

  private async buildBoard(
    character: DuelTournamentCharacterRecord,
    period: DuelTournamentPeriod
  ): Promise<DuelTournamentBoard> {
    const now = this.clock();
    const current = getDuelTournamentWindow(period, now);
    const previous = getPreviousDuelTournamentWindow(period, now);
    const pendingWindows = getRewardLookbackWindows(now);
    const earliest = earliestDate([previous, ...pendingWindows].map((window) => window.startsAt));
    const records = await this.duels.listResolvedSince(earliest);
    const claims = await this.tournaments.listClaimsForCharacter(character.id);
    const pendingRewards = buildPendingRewards(character, records, claims, pendingWindows);
    const standings = buildDuelTournamentStandings(records, current);
    const previousStandings = buildDuelTournamentStandings(records, previous);
    const yourEntry = standings.find((entry) => entry.characterId === character.id);
    const previousEntry = previousStandings.find((entry) => entry.characterId === character.id);
    const previousReward = previousEntry
      ? getDuelTournamentReward(period, previousEntry.rank, previousEntry.points)
      : null;
    const existingClaim = claims.find((claim) => claim.period === period && claim.periodKey === previous.key) ?? null;
    const pendingForPeriod = pendingRewards.find((reward) => reward.period === period) ?? null;

    return {
      period,
      current,
      previous,
      standings,
      previousWinners: previousStandings.slice(0, DUEL_TOURNAMENT_TOP_LIMIT),
      character,
      yourPoints: yourEntry?.points ?? 0,
      yourRank: yourEntry?.rank ?? null,
      remainingMs: Math.max(0, current.endsAt.getTime() - now.getTime()),
      claim: pendingForPeriod
        ? {
            state: "available",
            periodKey: pendingForPeriod.periodKey,
            reward: pendingForPeriod.reward,
            rank: pendingForPeriod.rank,
            points: pendingForPeriod.points
          }
        : existingClaim
        ? { state: "claimed", claim: existingClaim, reward: presentRewardFromClaim(existingClaim) }
        : previousEntry && previousReward
          ? {
              state: "available",
              periodKey: previous.key,
              reward: presentReward(previousReward),
              rank: previousEntry.rank,
              points: previousEntry.points
            }
          : { state: "unavailable", reason: "no-placement" },
      pendingRewards
    };
  }

  private async listPendingRewards(
    character: DuelTournamentCharacterRecord,
    now: Date
  ): Promise<DuelTournamentPendingReward[]> {
    const windows = getRewardLookbackWindows(now);
    const earliest = earliestDate(windows.map((window) => window.startsAt));
    const [records, claims] = await Promise.all([
      this.duels.listResolvedSince(earliest),
      this.tournaments.listClaimsForCharacter(character.id)
    ]);

    return buildPendingRewards(character, records, claims, windows);
  }
}

const itemNamesById = new Map(items.map((item) => [item.id, item.name]));

function presentReward(reward: DuelTournamentReward): DuelTournamentPresentedReward {
  return {
    gold: reward.gold,
    items: reward.items.map((item) => ({
      itemId: item.itemId,
      name: itemNamesById.get(item.itemId) ?? item.itemId,
      quantity: item.quantity
    }))
  };
}

function presentRewardFromClaim(claim: DuelTournamentClaimRecord): DuelTournamentPresentedReward {
  return {
    gold: claim.rewardGold,
    items: parseClaimItems(claim.rewardItems)
  };
}

function parseClaimItems(value: unknown): DuelTournamentPresentedReward["items"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isClaimRewardItem(item)) {
      return [];
    }

    return [{
      itemId: item.itemId,
      name: itemNamesById.get(item.itemId) ?? item.itemId,
      quantity: Math.max(0, Math.floor(item.quantity))
    }];
  });
}

function isClaimRewardItem(value: unknown): value is { itemId: string; quantity: number } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.itemId === "string" && typeof candidate.quantity === "number";
}

function getRewardLookbackWindows(now: Date): DuelTournamentPeriodWindow[] {
  return DUEL_TOURNAMENT_PERIODS.flatMap((period) =>
    getClosedDuelTournamentWindows(period, now, DUEL_TOURNAMENT_REWARD_LOOKBACK[period])
  );
}

function buildPendingRewards(
  character: DuelTournamentCharacterRecord,
  records: readonly ResolvedDuelChallengeRecord[],
  claims: readonly DuelTournamentClaimRecord[],
  windows: readonly DuelTournamentPeriodWindow[]
): DuelTournamentPendingReward[] {
  const claimKeys = new Set(claims.map((claim) => claimKey(claim.period, claim.periodKey)));
  const pendingRewards: DuelTournamentPendingReward[] = [];

  for (const window of windows) {
    if (claimKeys.has(claimKey(window.period, window.key))) {
      continue;
    }

    const standings = buildDuelTournamentStandings(records, window);
    const placement = standings.find((entry) => entry.characterId === character.id);
    const reward = placement
      ? getDuelTournamentReward(window.period, placement.rank, placement.points)
      : null;

    if (!placement || !reward) {
      continue;
    }

    pendingRewards.push({
      period: window.period,
      periodKey: window.key,
      window,
      rank: placement.rank,
      points: placement.points,
      reward: presentReward(reward)
    });
  }

  return pendingRewards;
}

function isWithinRewardLookback(period: DuelTournamentPeriod, periodKey: string, now: Date): boolean {
  return getClosedDuelTournamentWindows(period, now, DUEL_TOURNAMENT_REWARD_LOOKBACK[period])
    .some((window) => window.key === periodKey);
}

function earliestDate(dates: readonly Date[]): Date {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function claimKey(period: DuelTournamentPeriod, periodKey: string): string {
  return `${period}:${periodKey}`;
}
