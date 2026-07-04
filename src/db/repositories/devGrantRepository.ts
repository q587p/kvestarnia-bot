import type { CharacterRecord } from "./characterRepository";
import type { ItemGrant, RewardLevelChange } from "./dailyActionRepository";

export type DevGrantProgressResult = {
  character: CharacterRecord;
  levelChange: RewardLevelChange;
};

export type DevGrantCharacterResult = {
  character: CharacterRecord;
  combat?: {
    kind: "solo-combat" | "party-boss" | "turn-based-duel";
    hpCurrent: number;
    hpMax: number;
  };
};

export type DevGrantItemResult = {
  character: CharacterRecord;
  itemGrants: ItemGrant[];
};

export type DevGrantCooldownResult = {
  character: CharacterRecord;
  cleared: boolean;
};

export type DevGrantRogueResetResult = {
  character: CharacterRecord;
  clearedCooldown: boolean;
  deletedAttempts: number;
};

export type DevGrantCooldownMatchInput = {
  keys?: readonly string[];
  keyPrefixes?: readonly string[];
};

export type DevGrantDailyActionResetResult = {
  character: CharacterRecord;
  deleted: number;
};

export type DevGrantYegerQuestStage = "first" | "second";

export type DevGrantYegerQuestProgressResult =
  | {
      state: "ready";
      character: CharacterRecord;
      stage: DevGrantYegerQuestStage;
      addedWins: number;
      wins: number;
      target: number;
      started: boolean;
    }
  | {
      state: "blocked";
      character: CharacterRecord;
      stage: DevGrantYegerQuestStage;
      reason: "first-board-not-completed";
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

  clearCooldownsForTelegramUser(
    telegramUserId: bigint,
    input: DevGrantCooldownMatchInput
  ): Promise<DevGrantCooldownResult | null>;

  resetPriestBlessingForTelegramUser?(
    telegramUserId: bigint,
    input: DevGrantCooldownMatchInput & { now: Date }
  ): Promise<DevGrantCooldownResult | null>;

  resetRogueForTelegramUser?(
    telegramUserId: bigint,
    input: DevGrantCooldownMatchInput & { localDate: string }
  ): Promise<DevGrantRogueResetResult | null>;

  finishCooldownForTelegramUser(
    telegramUserId: bigint,
    key: string,
    now: Date
  ): Promise<DevGrantCooldownResult | null>;

  deleteDailyActionsForTelegramUser(
    telegramUserId: bigint,
    keys: readonly string[]
  ): Promise<DevGrantDailyActionResetResult | null>;

  completeYegerQuestProgressForTelegramUser(
    telegramUserId: bigint,
    stage: DevGrantYegerQuestStage,
    now: Date
  ): Promise<DevGrantYegerQuestProgressResult | null>;
}
