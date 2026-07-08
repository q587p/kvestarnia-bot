import { items } from "../content";
import type { ResolvedDuelChallengeRecord } from "../db/repositories/duelChallengeRepository";
import type {
  DuelTournamentCharacterRecord,
  DuelTournamentClaimRecord,
  DuelTournamentRepository
} from "../db/repositories/duelTournamentRepository";
import {
  buildDuelTournamentStandings,
  DUEL_TOURNAMENT_RULES_VERSION,
  DUEL_TOURNAMENT_TOP_LIMIT,
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

    const presentedReward = presentReward(reward);

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

  private async buildBoard(
    character: DuelTournamentCharacterRecord,
    period: DuelTournamentPeriod
  ): Promise<DuelTournamentBoard> {
    const now = this.clock();
    const current = getDuelTournamentWindow(period, now);
    const previous = getPreviousDuelTournamentWindow(period, now);
    const records = await this.duels.listResolvedSince(previous.startsAt);
    const standings = buildDuelTournamentStandings(records, current);
    const previousStandings = buildDuelTournamentStandings(records, previous);
    const yourEntry = standings.find((entry) => entry.characterId === character.id);
    const previousEntry = previousStandings.find((entry) => entry.characterId === character.id);
    const previousReward = previousEntry
      ? getDuelTournamentReward(period, previousEntry.rank, previousEntry.points)
      : null;
    const existingClaim = await this.tournaments.findClaim(character.id, period, previous.key);

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
      claim: existingClaim
        ? { state: "claimed", claim: existingClaim, reward: presentRewardFromClaim(existingClaim) }
        : previousEntry && previousReward
          ? {
              state: "available",
              periodKey: previous.key,
              reward: presentReward(previousReward),
              rank: previousEntry.rank,
              points: previousEntry.points
            }
          : { state: "unavailable", reason: "no-placement" }
    };
  }
}

function presentReward(reward: DuelTournamentReward): DuelTournamentPresentedReward {
  return {
    gold: reward.gold,
    items: reward.items.map((item) => ({
      itemId: item.itemId,
      name: items.find((content) => content.id === item.itemId)?.name ?? item.itemId,
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
      name: items.find((content) => content.id === item.itemId)?.name ?? item.itemId,
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
