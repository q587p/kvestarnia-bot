import type { CharacterRecord, CharacterRepository } from "../db/repositories/characterRepository";
import type { CooldownRepository } from "../db/repositories/cooldownRepository";
import type {
  DailyActionRecord,
  DailyActionRepository,
  RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import type {
  KorchmaRoundLeaderboard,
  KorchmaRoundLeaderboardEntry,
  KorchmaRoundPurchaseRepository,
  KorchmaRoundTier
} from "../db/repositories/korchmaRoundPurchaseRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, toIsoDate, type Clock } from "../shared/time";
import {
  enrichRewardItemGrants,
  WET_HERO_TICKET_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";

export const FRIDAY_BARREL_RAID_KEY = "tavern.friday-barrel-raid";
export const FRIDAY_BARREL_RAID_PENDING_KEY = "tavern.friday-barrel-raid.pending";
export const FRIDAY_BARREL_RAID_REWARD_XP = 7;
export const FRIDAY_BARREL_RAID_REWARD_GOLD = 5;
export const FRIDAY_BARREL_RAID_MIN_WAIT_MINUTES = 5;
export const FRIDAY_BARREL_RAID_MAX_WAIT_MINUTES = 8;
export const KORCHMA_SIMPLE_ROUND_COST = 10;
export const KORCHMA_FINE_ROUND_COST = 100;

export type TavernLookupResult =
  | { state: "no-character" }
  | { state: "ready"; character: CharacterSummary }
  | { state: "pending"; character: CharacterSummary; availableAt: Date; now: Date }
  | { state: "pending-complete"; character: CharacterSummary; availableAt: Date; now: Date }
  | { state: "already-completed"; character: CharacterSummary };

export type TavernRaidResult =
  | { state: "no-character" }
  | { state: "pending-started"; character: CharacterSummary; availableAt: Date; now: Date }
  | { state: "pending"; character: CharacterSummary; availableAt: Date; now: Date }
  | {
      state: "completed";
      character: CharacterSummary;
      reward: TavernRaidReward;
      levelChange: RewardLevelChange;
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
      reward: TavernRaidReward;
      levelChange: null;
    };

export type TavernRoundResult =
  | { state: "no-character" }
  | { state: "raid-required"; character: CharacterSummary; leaderboard: KorchmaRoundLeaderboard }
  | { state: "not-enough-gold"; character: CharacterSummary; gold: number; leaderboard: KorchmaRoundLeaderboard }
  | {
      state: "simple-round" | "fine-round";
      character: CharacterSummary;
      spentGold: number;
      remainingGold: number;
      leaderboard: KorchmaRoundLeaderboard;
      becameLeader: KorchmaRoundLeaderboardPeriod[];
    };

export type TavernRoundOfferResult =
  | { state: "no-character" }
  | { state: "raid-required"; character: CharacterSummary; leaderboard: KorchmaRoundLeaderboard }
  | { state: "not-enough-gold"; character: CharacterSummary; gold: number; leaderboard: KorchmaRoundLeaderboard }
  | {
      state: "ready";
      character: CharacterSummary;
      gold: number;
      canBuySimple: boolean;
      canBuyFine: boolean;
      leaderboard: KorchmaRoundLeaderboard;
    };

export type KorchmaRoundLeaderboardPeriod = "day" | "week" | "month";

export type TavernPendingRaidResult =
  | { state: "no-character" }
  | { state: "none" }
  | { state: "pending"; character: CharacterSummary; availableAt: Date; now: Date };

interface PendingFridayBarrelRaid {
  availableAt: Date | null;
  character: CharacterRecord;
}

export interface TavernRaidReward {
  xp: number;
  gold: number;
  localDate: string;
  itemGrants: RewardItemGrant[];
}

export class TavernRaidService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly roundPurchases: KorchmaRoundPurchaseRepository,
    private readonly pendingRaids?: CooldownRepository,
    private readonly clock: Clock = systemClock,
    private readonly random: RandomSource = new CryptoRandomSource()
  ) {}

  async getTavernForTelegramUser(telegramUserId: bigint): Promise<TavernLookupResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const existingRaid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate
    });

    if (existingRaid) {
      return {
        state: "already-completed",
        character: summarizeCharacter(character)
      };
    }

    const pending = await this.findPendingFridayBarrelRaid(telegramUserId, localDate);
    const now = this.clock();

    if (pending?.availableAt && pending.availableAt > now) {
      return {
        state: "pending",
        character: summarizeCharacter(character),
        availableAt: pending.availableAt,
        now
      };
    }

    if (pending?.availableAt && pending.availableAt <= now) {
      return {
        state: "pending-complete",
        character: summarizeCharacter(character),
        availableAt: pending.availableAt,
        now
      };
    }

    return {
      state: "ready",
      character: summarizeCharacter(character)
    };
  }

  async getActivePendingFridayBarrelRaidForTelegramUser(
    telegramUserId: bigint
  ): Promise<TavernPendingRaidResult> {
    const current = await this.findPendingFridayBarrelRaid(
      telegramUserId,
      toIsoDate(this.clock())
    );

    if (!current) {
      return { state: "no-character" };
    }

    const now = this.clock();

    if (!current.availableAt || current.availableAt <= now) {
      return { state: "none" };
    }

    return {
      state: "pending",
      character: summarizeCharacter(current.character),
      availableAt: current.availableAt,
      now
    };
  }

  async advanceFridayBarrelRaid(telegramUserId: bigint): Promise<TavernRaidResult> {
    const localDate = toIsoDate(this.clock());
    const existingRaid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate
    });

    if (existingRaid) {
      return this.completeFridayBarrelRaid(telegramUserId);
    }

    const pending = await this.findPendingFridayBarrelRaid(telegramUserId, localDate);

    if (!pending) {
      return { state: "no-character" };
    }

    const now = this.clock();

    if (pending.availableAt && pending.availableAt > now) {
      return {
        state: "pending",
        character: summarizeCharacter(pending.character),
        availableAt: pending.availableAt,
        now
      };
    }

    if (pending.availableAt && pending.availableAt <= now) {
      return this.completeFridayBarrelRaid(telegramUserId);
    }

    return this.startFridayBarrelRaid(telegramUserId, localDate);
  }

  async completeFridayBarrelRaid(telegramUserId: bigint): Promise<TavernRaidResult> {
    const localDate = toIsoDate(this.clock());
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate,
      rewardXp: FRIDAY_BARREL_RAID_REWARD_XP,
      rewardGold: FRIDAY_BARREL_RAID_REWARD_GOLD,
      itemGrants: [
        {
          itemId: WET_HERO_TICKET_ITEM_ID,
          quantity: 1
        }
      ]
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "existing") {
      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character),
        reward: buildReward(claim.action, claim.itemGrants),
        levelChange: null
      };
    }

    return {
      state: "completed",
      character: summarizeCharacter(claim.character),
      reward: buildReward(claim.action, claim.itemGrants),
      levelChange: claim.levelChange
    };
  }

  private async startFridayBarrelRaid(
    telegramUserId: bigint,
    localDate: string
  ): Promise<TavernRaidResult> {
    if (!this.pendingRaids) {
      return this.completeFridayBarrelRaid(telegramUserId);
    }

    const now = this.clock();
    const availableAt = new Date(
      now.getTime() +
        this.random.nextInt(
          FRIDAY_BARREL_RAID_MIN_WAIT_MINUTES,
          FRIDAY_BARREL_RAID_MAX_WAIT_MINUTES
        ) *
          60_000
    );
    const claim = await this.pendingRaids.claimRewardForTelegramUser(telegramUserId, {
      key: buildFridayBarrelRaidPendingKey(localDate),
      now,
      availableAt,
      rewardXp: 0,
      rewardGold: 0
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "on-cooldown") {
      return {
        state: "pending",
        character: summarizeCharacter(claim.character),
        availableAt: claim.cooldown.availableAt,
        now
      };
    }

    return {
      state: "pending-started",
      character: summarizeCharacter(claim.character),
      availableAt: claim.cooldown.availableAt,
      now
    };
  }

  private async findPendingFridayBarrelRaid(
    telegramUserId: bigint,
    localDate: string
  ): Promise<PendingFridayBarrelRaid | null> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    if (!this.pendingRaids) {
      return {
        availableAt: null,
        character
      };
    }

    const current = await this.pendingRaids.findForTelegramUser(
      telegramUserId,
      buildFridayBarrelRaidPendingKey(localDate)
    );

    if (!current) {
      return {
        availableAt: null,
        character
      };
    }

    return {
      availableAt: current.cooldown?.availableAt ?? null,
      character: current.character
    };
  }

  async getRoundOfferForTelegramUser(telegramUserId: bigint): Promise<TavernRoundOfferResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    const leaderboard = await this.roundPurchases.getLeaderboard(localDate);

    if (!character) {
      return { state: "no-character" };
    }

    const existingRaid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate
    });

    if (!existingRaid) {
      return {
        state: "raid-required",
        character: summarizeCharacter(character),
        leaderboard
      };
    }

    if (character.gold < KORCHMA_SIMPLE_ROUND_COST) {
      return {
        state: "not-enough-gold",
        character: summarizeCharacter(character),
        gold: character.gold,
        leaderboard
      };
    }

    return {
      state: "ready",
      character: summarizeCharacter(character),
      gold: character.gold,
      canBuySimple: character.gold >= KORCHMA_SIMPLE_ROUND_COST,
      canBuyFine: character.gold >= KORCHMA_FINE_ROUND_COST,
      leaderboard
    };
  }

  async buyRoundForTelegramUser(
    telegramUserId: bigint,
    tier: KorchmaRoundTier
  ): Promise<TavernRoundResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);
    const beforeLeaderboard = await this.roundPurchases.getLeaderboard(localDate);

    if (!character) {
      return { state: "no-character" };
    }

    const existingRaid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate
    });

    if (!existingRaid) {
      return {
        state: "raid-required",
        character: summarizeCharacter(character),
        leaderboard: beforeLeaderboard
      };
    }

    const cost = tier === "fine" ? KORCHMA_FINE_ROUND_COST : KORCHMA_SIMPLE_ROUND_COST;
    const spend = await this.roundPurchases.spendGoldAndCreate({
      telegramUserId,
      tier,
      spentGold: cost,
      localDate
    });

    if (!spend) {
      return { state: "no-character" };
    }

    if (spend.state === "insufficient") {
      const leaderboard = await this.roundPurchases.getLeaderboard(localDate);

      return {
        state: "not-enough-gold",
        character: summarizeCharacter(spend.character),
        gold: spend.character.gold,
        leaderboard
      };
    }

    const leaderboard = await this.roundPurchases.getLeaderboard(localDate);

    return {
      state: tier === "fine" ? "fine-round" : "simple-round",
      character: summarizeCharacter(spend.character),
      spentGold: cost,
      remainingGold: spend.character.gold,
      leaderboard,
      becameLeader: getNewLeaderPeriods(spend.character.id, beforeLeaderboard, leaderboard)
    };
  }
}

function buildFridayBarrelRaidPendingKey(localDate: string): string {
  return `${FRIDAY_BARREL_RAID_PENDING_KEY}:${localDate}`;
}

function getNewLeaderPeriods(
  characterId: string,
  before: KorchmaRoundLeaderboard,
  after: KorchmaRoundLeaderboard
): KorchmaRoundLeaderboardPeriod[] {
  return (["day", "week", "month"] as const).filter(
    (period) =>
      getLeader(before[period])?.characterId !== characterId &&
      getLeader(after[period])?.characterId === characterId
  );
}

function getLeader(entries: KorchmaRoundLeaderboardEntry[]): KorchmaRoundLeaderboardEntry | null {
  return entries[0] ?? null;
}

function buildReward(
  action: DailyActionRecord,
  itemGrants: Array<{ itemId: string; quantity: number }>
): TavernRaidReward {
  return {
    xp: action.rewardXp,
    gold: action.rewardGold,
    localDate: action.localDate,
    itemGrants: enrichRewardItemGrants(itemGrants)
  };
}
