import type { CharacterRecord } from "./characterRepository";
import type { ItemGrant, RewardLevelChange } from "./dailyActionRepository";

export type DevGrantProgressResult = {
  character: CharacterRecord;
  levelChange: RewardLevelChange;
};

export type DevGrantCharacterResult = {
  character: CharacterRecord;
};

export type DevGrantItemResult = {
  character: CharacterRecord;
  itemGrants: ItemGrant[];
};

export type DevGrantCooldownResult = {
  character: CharacterRecord;
  cleared: boolean;
};

export interface DevGrantRepository {
  addLevelForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantProgressResult | null>;

  addXpForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantProgressResult | null>;

  addGoldForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantCharacterResult | null>;

  healForTelegramUser(
    telegramUserId: bigint,
    amount?: number
  ): Promise<DevGrantCharacterResult | null>;

  restoreManaForTelegramUser(
    telegramUserId: bigint,
    amount?: number
  ): Promise<DevGrantCharacterResult | null>;

  addItemsForTelegramUser(
    telegramUserId: bigint,
    itemGrants: ItemGrant[]
  ): Promise<DevGrantItemResult | null>;

  clearCooldownForTelegramUser(
    telegramUserId: bigint,
    key: string
  ): Promise<DevGrantCooldownResult | null>;

  finishCooldownForTelegramUser(
    telegramUserId: bigint,
    key: string,
    now: Date
  ): Promise<DevGrantCooldownResult | null>;
}
