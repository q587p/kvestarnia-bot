import type { CharacterRecord } from "./characterRepository";
import type { ItemGrant, RewardLevelChange } from "./dailyActionRepository";

export interface CharacterCooldownRecord {
  id: string;
  characterId: string;
  key: string;
  availableAt: Date;
  updatedAt: Date;
}

export interface ClaimCooldownRewardInput {
  key: string;
  now: Date;
  availableAt: Date;
  rewardXp: number;
  rewardGold: number;
  itemGrants?: ItemGrant[];
}

export type ClaimCooldownRewardResult =
  | {
      state: "completed";
      cooldown: CharacterCooldownRecord;
      character: CharacterRecord;
      levelChange: RewardLevelChange;
      itemGrants: ItemGrant[];
    }
  | {
      state: "on-cooldown";
      cooldown: CharacterCooldownRecord;
      character: CharacterRecord;
    };

export interface CooldownRepository {
  findForTelegramUser(
    telegramUserId: bigint,
    key: string
  ): Promise<{ cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null>;

  claimRewardForTelegramUser(
    telegramUserId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null>;
}
