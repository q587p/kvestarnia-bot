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

export function canonicalizeAppliedItemGrants(
  grants: readonly Pick<ItemGrant, "itemId" | "quantity">[]
): ItemGrant[] {
  const quantitiesByItemId = new Map<string, number>();

  for (const grant of grants) {
    const quantity = Math.max(0, Math.floor(grant.quantity));
    if (!grant.itemId || quantity <= 0) {
      continue;
    }
    quantitiesByItemId.set(
      grant.itemId,
      (quantitiesByItemId.get(grant.itemId) ?? 0) + quantity
    );
  }

  return [...quantitiesByItemId].map(([itemId, quantity]) => ({ itemId, quantity }));
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
  rollingCooldown?: {
    now: Date;
    durationMs: number;
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
      availableAt?: Date;
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

  findLatestForTelegramUser(
    telegramUserId: bigint,
    input: { key: string }
  ): Promise<DailyActionRecord | null>;

  listLatestForTelegramUser?(
    telegramUserId: bigint,
    input: { key: string; take: number }
  ): Promise<DailyActionRecord[] | null>;

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

  existsAnyForTelegramUser?(
    telegramUserId: bigint,
    input: { key: string; localDateNot?: string }
  ): Promise<boolean | null>;

  listForTelegramUserByLocalDatePrefix?(
    telegramUserId: bigint,
    input: { key: string; localDatePrefix: string; take: number }
  ): Promise<DailyActionRecord[] | null>;

  listForCharacterByKeys?(
    characterId: string,
    input: { keys: readonly string[]; localDate: string; take: number }
  ): Promise<DailyActionRecord[]>;

  listForCharacterByLocalDates?(
    characterId: string,
    input: { key: string; localDates: readonly string[]; take: number }
  ): Promise<DailyActionRecord[]>;

  listForCharacterByLocalDatePrefix?(
    characterId: string,
    input: { key: string; localDatePrefix: string; take: number }
  ): Promise<DailyActionRecord[]>;

  sumItemGrantQuantityForTelegramUserInCreatedAtRange?(
    telegramUserId: bigint,
    input: {
      key: string;
      createdAtGte: Date;
      createdAtLt: Date;
      resultKind: string;
      purchaseDay: string;
      itemId: string;
      take: number;
    }
  ): Promise<{ quantity: number; rowCount: number } | null>;

  /**
   * Broad historical scan kept for admin/dev compatibility and legacy fallbacks.
   * Do not use from hot player callback paths when a bounded helper can express the lookup.
   */
  listForTelegramUser?(
    telegramUserId: bigint,
    input: { key: string }
  ): Promise<DailyActionRecord[] | null>;

  listForTelegramUserInCreatedAtRange?(
    telegramUserId: bigint,
    input: { key: string; createdAtGte: Date; createdAtLt: Date }
  ): Promise<DailyActionRecord[] | null>;
}
