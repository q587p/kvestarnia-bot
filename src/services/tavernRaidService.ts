import type { CharacterRepository } from "../db/repositories/characterRepository";
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

export type TavernLookupResult =
  | { state: "no-character" }
  | { state: "ready"; character: CharacterSummary };

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
    private readonly clock: Clock = systemClock
  ) {}

  async getTavernForTelegramUser(telegramUserId: bigint): Promise<TavernLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
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
