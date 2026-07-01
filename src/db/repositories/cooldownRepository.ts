import type { CharacterRecord } from "./characterRepository";
import type { HpLossAudit, HpLossRequest, ItemGrant, RewardLevelChange } from "./dailyActionRepository";

export interface CharacterCooldownRecord {
  id: string;
  characterId: string;
  key: string;
  availableAt: Date;
  resultJson: unknown;
  updatedAt: Date;
}

export interface ClaimCooldownRewardInput {
  key: string;
  now: Date;
  availableAt: Date;
  rewardXp: number;
  rewardGold: number;
  spentGold?: number;
  hpLoss?: number | HpLossRequest;
  resultJson?: unknown;
  itemGrants?: ItemGrant[];
  expectedLife?: {
    remortCount: number;
  };
}

export type ClaimCooldownRewardResult =
  | {
      state: "completed";
      cooldown: CharacterCooldownRecord;
      character: CharacterRecord;
      levelChange: RewardLevelChange;
      itemGrants: ItemGrant[];
      hpLoss: HpLossAudit | null;
    }
  | {
      state: "on-cooldown";
      cooldown: CharacterCooldownRecord;
      character: CharacterRecord;
    }
  | {
      state: "insufficient-gold";
      character: CharacterRecord;
      requiredGold: number;
    };

export type SetCooldownAvailableAtResult =
  | {
      state: "updated";
      cooldown: CharacterCooldownRecord;
      character: CharacterRecord;
    }
  | {
      state: "not-found";
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

  setAvailableAtForTelegramUser?(
    telegramUserId: bigint,
    input: { key: string; availableAt: Date }
  ): Promise<SetCooldownAvailableAtResult | null>;

  deleteForTelegramUser?(
    telegramUserId: bigint,
    input: { key: string }
  ): Promise<"deleted" | "missing" | "no-character">;
}
