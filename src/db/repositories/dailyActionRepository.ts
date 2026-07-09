import type { Prisma } from "@prisma/client";
import type { CharacterRecord } from "./characterRepository";

export interface RewardLevelChange {
  oldLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

export interface DailyActionRecord {
  id: string;
  characterId: string;
  key: string;
  localDate: string;
  rewardXp: number;
  rewardGold: number;
  spentGold: number;
  resultJson: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface ItemGrant {
  itemId: string;
  quantity: number;
  maxOwnedQuantity?: number;
}

export interface HpLossAudit {
  before: number;
  max: number;
  lost: number;
  after: number;
}

export interface HpLossRequest {
  requested: number;
  effectiveHpMax: number;
}

export interface ClaimDailyActionInput {
  key: string;
  localDate: string;
  rewardXp: number;
  rewardGold: number;
  spentGold?: number;
  hpLoss?: number | HpLossRequest;
  resultJson?: unknown;
  itemGrants?: ItemGrant[];
  questIskrokaminBonus?: boolean;
  expectedLife?: {
    remortCount: number;
  };
  quantityLimit?: {
    key: string;
    purchaseDay: string;
    itemId: string;
    resultKind: string;
    quantity: number;
    maxQuantity: number;
  };
  localDatePrefixLimit?: {
    key: string;
    localDatePrefix: string;
    maxRows: number;
  };
}

export class DailyActionQuantityLimitExceededError extends Error {
  constructor(
    readonly currentQuantity: number,
    readonly maxQuantity: number
  ) {
    super("Daily action quantity limit exceeded.");
  }
}

export class DailyActionPrefixLimitExceededError extends Error {
  constructor(
    readonly currentRows: number,
    readonly maxRows: number
  ) {
    super("Daily action prefix row limit exceeded.");
  }
}

export interface DailyActionClaimIdentity {
  key: string;
  localDate: string;
}

export interface DailyActionRollbackInput extends DailyActionClaimIdentity {
  currentEffectiveHpMax?: number;
}

export type ClaimDailyActionResult =
  | {
      state: "created";
      action: DailyActionRecord;
      character: CharacterRecord;
      levelChange: RewardLevelChange;
      itemGrants: ItemGrant[];
      hpLoss: HpLossAudit | null;
    }
  | {
      state: "existing";
      action: DailyActionRecord;
      character: CharacterRecord;
      levelChange: null;
      itemGrants: [];
    }
  | {
      state: "insufficient-gold";
      character: CharacterRecord;
      requiredGold: number;
    };

export interface DailyActionRepository {
  findForTelegramUser(
    telegramUserId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null>;

  claimForTelegramUser(
    telegramUserId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null>;

  deleteForTelegramUser?(
    telegramUserId: bigint,
    input: DailyActionClaimIdentity
  ): Promise<"deleted" | "missing" | "no-character">;

  rollbackForTelegramUser?(
    telegramUserId: bigint,
    input: DailyActionRollbackInput
  ): Promise<"rolled-back" | "missing" | "no-character">;

  countForTelegramUser?(
    telegramUserId: bigint,
    input: { key: string; localDatePrefix: string }
  ): Promise<number | null>;

  listForTelegramUser?(
    telegramUserId: bigint,
    input: { key: string }
  ): Promise<DailyActionRecord[] | null>;

  listForTelegramUserInCreatedAtRange?(
    telegramUserId: bigint,
    input: { key: string; createdAtGte: Date; createdAtLt: Date }
  ): Promise<DailyActionRecord[] | null>;
}
