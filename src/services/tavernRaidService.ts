import type {
  CharacterRecord,
  CharacterRepository
} from "../db/repositories/characterRepository";
import type {
  DailyActionRecord,
  DailyActionRepository,
  RewardLevelChange
} from "../db/repositories/dailyActionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { systemClock, toIsoDate, type Clock } from "../shared/time";
import {
  enrichRewardItemGrants,
  WET_HERO_TICKET_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";

export const FRIDAY_BARREL_RAID_KEY = "tavern.friday-barrel-raid";
export const FRIDAY_BARREL_RAID_REWARD_XP = 7;
export const FRIDAY_BARREL_RAID_REWARD_GOLD = 5;
export const KORCHMA_SIMPLE_ROUND_COST = 10;
export const KORCHMA_FINE_ROUND_COST = 100;
export type KorchmaRoundTier = "simple" | "fine";

export type TavernLookupResult =
  | { state: "no-character" }
  | { state: "ready"; character: CharacterSummary }
  | { state: "already-completed"; character: CharacterSummary };

export type TavernRaidResult =
  | { state: "no-character" }
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
  | { state: "raid-required"; character: CharacterSummary }
  | { state: "not-enough-gold"; character: CharacterSummary; gold: number }
  | {
      state: "simple-round" | "fine-round";
      character: CharacterSummary;
      spentGold: number;
      remainingGold: number;
    };

export type TavernRoundOfferResult =
  | { state: "no-character" }
  | { state: "raid-required"; character: CharacterSummary }
  | { state: "not-enough-gold"; character: CharacterSummary; gold: number }
  | {
      state: "ready";
      character: CharacterSummary;
      gold: number;
      canBuySimple: boolean;
      canBuyFine: boolean;
    };

export interface GoldSpendingCharacterRepository extends CharacterRepository {
  spendGoldForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<
    | { state: "spent"; character: CharacterRecord }
    | { state: "insufficient"; character: CharacterRecord }
    | null
  >;
}

export interface TavernRaidReward {
  xp: number;
  gold: number;
  localDate: string;
  itemGrants: RewardItemGrant[];
}

export class TavernRaidService {
  constructor(
    private readonly characters: GoldSpendingCharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly clock: Clock = systemClock
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

    return {
      state: "ready",
      character: summarizeCharacter(character)
    };
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

  async getRoundOfferForTelegramUser(telegramUserId: bigint): Promise<TavernRoundOfferResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

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
        character: summarizeCharacter(character)
      };
    }

    if (character.gold < KORCHMA_SIMPLE_ROUND_COST) {
      return {
        state: "not-enough-gold",
        character: summarizeCharacter(character),
        gold: character.gold
      };
    }

    return {
      state: "ready",
      character: summarizeCharacter(character),
      gold: character.gold,
      canBuySimple: character.gold >= KORCHMA_SIMPLE_ROUND_COST,
      canBuyFine: character.gold >= KORCHMA_FINE_ROUND_COST
    };
  }

  async buyRoundForTelegramUser(
    telegramUserId: bigint,
    tier: KorchmaRoundTier
  ): Promise<TavernRoundResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

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
        character: summarizeCharacter(character)
      };
    }

    const cost = tier === "fine" ? KORCHMA_FINE_ROUND_COST : KORCHMA_SIMPLE_ROUND_COST;
    const spend = await this.characters.spendGoldForTelegramUser(telegramUserId, cost);

    if (!spend) {
      return { state: "no-character" };
    }

    if (spend.state === "insufficient") {
      return {
        state: "not-enough-gold",
        character: summarizeCharacter(spend.character),
        gold: spend.character.gold
      };
    }

    return {
      state: tier === "fine" ? "fine-round" : "simple-round",
      character: summarizeCharacter(spend.character),
      spentGold: cost,
      remainingGold: spend.character.gold
    };
  }
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
