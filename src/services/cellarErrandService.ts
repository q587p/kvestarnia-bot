import type { CooldownRepository } from "../db/repositories/cooldownRepository";
import type { RewardLevelChange } from "../db/repositories/dailyActionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  CELLAR_MAX_LEVEL,
  CELLAR_MIN_LEVEL,
  isWithinActivityMaxLevel,
  meetsActivityLevel
} from "../domain/progression/activityGates";
import { systemClock, type Clock } from "../shared/time";
import {
  BRISTLE_OF_BASEMENT_ORDER_ITEM_ID,
  CHEESE_OF_PROCEDURAL_DOUBT_ITEM_ID,
  CORK_RING_OF_SERIOUS_BUSINESS_ITEM_ID,
  enrichRewardItemGrants,
  NAPKIN_OF_MOUSE_DIPLOMACY_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";

export const CELLAR_MOUSE_ERRAND_KEY = "cellar.mouse-errand";
export const CELLAR_MOUSE_ERRAND_COOLDOWN_MS = 3 * 60 * 1000;

export type CellarErrandAction = "cheese-trap" | "sweep-bravely" | "negotiate";

export const CELLAR_MOUSE_ERRAND_REWARDS = {
  "cheese-trap": {
    xp: 2,
    gold: 1
  },
  "sweep-bravely": {
    xp: 1,
    gold: 0
  },
  negotiate: {
    xp: 2,
    gold: 0
  }
} satisfies Record<CellarErrandAction, { xp: number; gold: number }>;

export type CellarErrandLookupResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number }
  | { state: "ready"; character: CharacterSummary }
  | { state: "on-cooldown"; character: CharacterSummary; availableAt: Date; now: Date };

export type CellarErrandResult =
  | { state: "no-character" }
  | { state: "level-locked"; character: CharacterSummary; requiredLevel: number }
  | { state: "level-retired"; character: CharacterSummary; maxLevel: number }
  | {
      state: "completed";
      action: CellarErrandAction;
      character: CharacterSummary;
      reward: CellarErrandReward;
      availableAt: Date;
      now: Date;
      levelChange: RewardLevelChange;
    }
  | {
      state: "on-cooldown";
      character: CharacterSummary;
      availableAt: Date;
      now: Date;
    };

export interface CellarErrandReward {
  xp: number;
  gold: number;
  itemGrants: RewardItemGrant[];
}

export class CellarErrandService {
  constructor(
    private readonly cooldowns: CooldownRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<CellarErrandLookupResult> {
    const now = this.clock();
    const current = await this.cooldowns.findForTelegramUser(
      telegramUserId,
      CELLAR_MOUSE_ERRAND_KEY
    );

    if (!current) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(current.character);

    if (!meetsActivityLevel(character.level, CELLAR_MIN_LEVEL)) {
      return {
        state: "level-locked",
        character,
        requiredLevel: CELLAR_MIN_LEVEL
      };
    }

    if (!isWithinActivityMaxLevel(character.level, CELLAR_MAX_LEVEL)) {
      return {
        state: "level-retired",
        character,
        maxLevel: CELLAR_MAX_LEVEL
      };
    }

    if (current.cooldown && current.cooldown.availableAt > now) {
      return {
        state: "on-cooldown",
        character,
        availableAt: current.cooldown.availableAt,
        now
      };
    }

    return {
      state: "ready",
      character
    };
  }

  async complete(
    telegramUserId: bigint,
    action: CellarErrandAction
  ): Promise<CellarErrandResult> {
    const now = this.clock();
    const current = await this.cooldowns.findForTelegramUser(
      telegramUserId,
      CELLAR_MOUSE_ERRAND_KEY
    );

    if (!current) {
      return { state: "no-character" };
    }

    const character = summarizeCharacter(current.character);

    if (!meetsActivityLevel(character.level, CELLAR_MIN_LEVEL)) {
      return {
        state: "level-locked",
        character,
        requiredLevel: CELLAR_MIN_LEVEL
      };
    }

    if (!isWithinActivityMaxLevel(character.level, CELLAR_MAX_LEVEL)) {
      return {
        state: "level-retired",
        character,
        maxLevel: CELLAR_MAX_LEVEL
      };
    }

    const reward = CELLAR_MOUSE_ERRAND_REWARDS[action];
    const availableAt = new Date(now.getTime() + CELLAR_MOUSE_ERRAND_COOLDOWN_MS);
    const claim = await this.cooldowns.claimRewardForTelegramUser(telegramUserId, {
      key: CELLAR_MOUSE_ERRAND_KEY,
      now,
      availableAt,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      itemGrants: buildCellarItemGrants(action)
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "on-cooldown") {
      return {
        state: "on-cooldown",
        character: summarizeCharacter(claim.character),
        availableAt: claim.cooldown.availableAt,
        now
      };
    }

    return {
      state: "completed",
      action,
      character: summarizeCharacter(claim.character),
      reward: {
        ...reward,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      availableAt: claim.cooldown.availableAt,
      now,
      levelChange: claim.levelChange
    };
  }
}

function buildCellarItemGrants(action: CellarErrandAction): Array<{ itemId: string; quantity: number }> {
  if (action === "cheese-trap") {
    return [
      {
        itemId: CHEESE_OF_PROCEDURAL_DOUBT_ITEM_ID,
        quantity: 1
      }
    ];
  }

  if (action === "sweep-bravely") {
    return [
      {
        itemId: BRISTLE_OF_BASEMENT_ORDER_ITEM_ID,
        quantity: 1
      }
    ];
  }

  return [
    {
      itemId: CORK_RING_OF_SERIOUS_BUSINESS_ITEM_ID,
      quantity: 1
    },
    {
      itemId: NAPKIN_OF_MOUSE_DIPLOMACY_ITEM_ID,
      quantity: 1
    }
  ];
}
