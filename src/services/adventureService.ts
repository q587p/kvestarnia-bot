import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { DailyActionRepository, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { systemClock, toIsoDate, type Clock } from "../shared/time";
import {
  enrichRewardItemGrants,
  RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID,
  SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";
import { MIMIC_SHAWARMA_COMBAT_PROBE_KEY } from "./fightService";

export const MIMIC_SHAWARMA_ADVENTURE_KEY = "adventure.mimic-shawarma";
export type AdventureAction = "poke" | "receipt" | "flee";

export const MIMIC_SHAWARMA_REWARDS = {
  poke: {
    xp: 8,
    gold: 4
  },
  receipt: {
    xp: 6,
    gold: 6
  },
  flee: {
    xp: 2,
    gold: 0
  }
} satisfies Record<AdventureAction, { xp: number; gold: number }>;

export type AdventureLookupResult =
  | { state: "no-character" }
  | { state: "ready"; character: CharacterSummary }
  | { state: "already-completed"; character: CharacterSummary; fightAvailable: boolean };

export type AdventureResult =
  | { state: "no-character" }
  | {
      state: "completed";
      action: AdventureAction;
      character: CharacterSummary;
      reward: AdventureReward;
      levelChange: RewardLevelChange;
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
    };

export interface AdventureReward {
  xp: number;
  gold: number;
  localDate: string;
  itemGrants: RewardItemGrant[];
}

export class AdventureService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async getMimicShawarmaForTelegramUser(
    telegramUserId: bigint
  ): Promise<AdventureLookupResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const existingAdventure = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: MIMIC_SHAWARMA_ADVENTURE_KEY,
      localDate
    });

    if (existingAdventure) {
      const existingFight = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
        localDate
      });

      return {
        state: "already-completed",
        character: summarizeCharacter(character),
        fightAvailable: !existingFight
      };
    }

    return {
      state: "ready",
      character: summarizeCharacter(character)
    };
  }

  async completeMimicShawarma(
    telegramUserId: bigint,
    action: AdventureAction
  ): Promise<AdventureResult> {
    const localDate = toIsoDate(this.clock());
    const reward = MIMIC_SHAWARMA_REWARDS[action];
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: MIMIC_SHAWARMA_ADVENTURE_KEY,
      localDate,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      itemGrants: buildAdventureItemGrants(action)
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "existing") {
      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character)
      };
    }

    return {
      state: "completed",
      action,
      character: summarizeCharacter(claim.character),
      reward: {
        ...reward,
        localDate,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      levelChange: claim.levelChange
    };
  }
}

function buildAdventureItemGrants(
  action: AdventureAction
): Array<{ itemId: string; quantity: number }> {
  if (action === "poke") {
    return [
      {
        itemId: SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID,
        quantity: 1
      }
    ];
  }

  if (action === "receipt") {
    return [
      {
        itemId: RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID,
        quantity: 1
      }
    ];
  }

  return [];
}
