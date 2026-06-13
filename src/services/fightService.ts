import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { DailyActionRepository, RewardLevelChange } from "../db/repositories/dailyActionRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  runCombatProbe,
  type CombatProbeAction,
  type CombatProbeResult
} from "../domain/combat/combatProbe";
import { systemClock, toIsoDate, type Clock } from "../shared/time";
import {
  MIMIC_SHAWARMA_ADVENTURE_KEY,
  MIMIC_SHAWARMA_COMBAT_PROBE_KEY
} from "./dailyActionKeys";
import {
  enrichRewardItemGrants,
  PAN_OF_PERSUASION_ITEM_ID,
  RECEIPT_OF_FORMAL_SUSPICION_ITEM_ID,
  SUSPICIOUS_SHAWARMA_WRAPPER_ITEM_ID,
  type RewardItemGrant
} from "./itemGrant";

export { MIMIC_SHAWARMA_COMBAT_PROBE_KEY } from "./dailyActionKeys";
export type FightAction = CombatProbeAction;

export const MIMIC_SHAWARMA_COMBAT_REWARDS = {
  attack: {
    xp: 9,
    gold: 3
  },
  receipt: {
    xp: 7,
    gold: 5
  },
  flee: {
    xp: 3,
    gold: 0
  }
} satisfies Record<FightAction, { xp: number; gold: number }>;

export type FightLookupResult =
  | { state: "no-character" }
  | { state: "ready"; character: CharacterSummary }
  | { state: "already-completed"; character: CharacterSummary; questAvailable: boolean };

export type FightResult =
  | { state: "no-character" }
  | {
      state: "completed";
      action: FightAction;
      character: CharacterSummary;
      combat: CombatProbeResult;
      reward: FightReward;
      levelChange: RewardLevelChange;
    }
  | {
      state: "already-completed";
      character: CharacterSummary;
      questAvailable: boolean;
    };

export interface FightReward {
  xp: number;
  gold: number;
  localDate: string;
  itemGrants: RewardItemGrant[];
}

export class FightService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async getMimicShawarmaForTelegramUser(telegramUserId: bigint): Promise<FightLookupResult> {
    const localDate = toIsoDate(this.clock());
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const existingFight = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
      localDate
    });

    if (existingFight) {
      const existingAdventure = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: MIMIC_SHAWARMA_ADVENTURE_KEY,
        localDate
      });

      return {
        state: "already-completed",
        character: summarizeCharacter(character),
        questAvailable: !existingAdventure
      };
    }

    return {
      state: "ready",
      character: summarizeCharacter(character)
    };
  }

  async completeMimicShawarma(
    telegramUserId: bigint,
    action: FightAction
  ): Promise<FightResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const characterSummary = summarizeCharacter(character);
    const combat = runCombatProbe({
      heroLevel: characterSummary.level,
      heroStats: characterSummary.stats,
      heroHpCurrent: characterSummary.hpCurrent,
      heroHpMax: characterSummary.hpMax,
      action
    });
    const localDate = toIsoDate(this.clock());
    const reward = MIMIC_SHAWARMA_COMBAT_REWARDS[action];
    const claim = await this.dailyActions.claimForTelegramUser(telegramUserId, {
      key: MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
      localDate,
      rewardXp: reward.xp,
      rewardGold: reward.gold,
      itemGrants: buildFightItemGrants(action)
    });

    if (!claim) {
      return { state: "no-character" };
    }

    if (claim.state === "existing") {
      const existingAdventure = await this.dailyActions.findForTelegramUser(telegramUserId, {
        key: MIMIC_SHAWARMA_ADVENTURE_KEY,
        localDate
      });

      return {
        state: "already-completed",
        character: summarizeCharacter(claim.character),
        questAvailable: !existingAdventure
      };
    }

    return {
      state: "completed",
      action,
      character: summarizeCharacter(claim.character),
      combat,
      reward: {
        ...reward,
        localDate,
        itemGrants: enrichRewardItemGrants(claim.itemGrants)
      },
      levelChange: claim.levelChange
    };
  }
}

function buildFightItemGrants(action: FightAction): Array<{ itemId: string; quantity: number }> {
  if (action === "attack") {
    return [
      {
        itemId: PAN_OF_PERSUASION_ITEM_ID,
        quantity: 1
      },
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
