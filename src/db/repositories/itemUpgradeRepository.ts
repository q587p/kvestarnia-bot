import type { CharacterRecord } from "./characterRepository";

export type ItemUpgradeOrderStatus = "pending" | "ready" | "attempted" | "canceled" | "expired";
export type ItemUpgradeMethod = "npc" | "self";

export interface ItemUpgradeInventoryRow {
  id: string;
  characterId: string;
  itemId: string;
  quantity: number;
  enhancementLevel: number;
  equipped: boolean;
}

export interface ItemUpgradeOrderRecord {
  id: string;
  token: string;
  characterId: string;
  itemId: string;
  donorItemId: string | null;
  fromLevel: number;
  targetLevel: number;
  method: ItemUpgradeMethod;
  status: ItemUpgradeOrderStatus;
  requiredFightCount: number;
  progressFightCount: number;
  cost: unknown;
  chance: unknown;
  result: unknown;
  expiresAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemUpgradeSnapshot {
  character: CharacterRecord;
  items: ItemUpgradeInventoryRow[];
  pities: Array<{ itemId: string; targetLevel: number; failureCount: number }>;
  orders: ItemUpgradeOrderRecord[];
}

export interface ItemUpgradeAttemptInput {
  token?: string;
  itemId: string;
  donorItemId?: string | null;
  method: ItemUpgradeMethod;
  now: Date;
  roll: number;
  expectedFromLevel?: number;
}

export type ItemUpgradeAttemptResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-upgradeable" }
  | { state: "cap-reached"; item: ItemUpgradeInventoryRow }
  | { state: "stale-item-level"; item: ItemUpgradeInventoryRow }
  | { state: "order-required"; order: ItemUpgradeOrderRecord }
  | { state: "order-not-ready"; order: ItemUpgradeOrderRecord }
  | { state: "stale-order"; order?: ItemUpgradeOrderRecord }
  | { state: "not-enough-gold"; required: number; available: number }
  | { state: "not-enough-iskrokamin"; required: number; available: number }
  | { state: "not-enough-mana"; required: number; available: number }
  | { state: "class-not-allowed" }
  | { state: "invalid-donor" }
  | {
      state: "attempted";
      success: boolean;
      character: CharacterRecord;
      item: ItemUpgradeInventoryRow;
      donorConsumed: boolean;
      fromLevel: number;
      targetLevel: number;
      finalChance: number;
      pityFailuresBefore: number;
      pityFailuresAfter: number;
      pityGuaranteed: boolean;
      spent: { gold: number; iskrokamin: number; mana: number };
      order: ItemUpgradeOrderRecord | null;
    };

export interface ItemUpgradeOrderCreateInput {
  token: string;
  itemId: string;
  donorItemId?: string | null;
  fromLevel: number;
  targetLevel: number;
  requiredFightCount: number;
  cost: unknown;
  chance: unknown;
  now: Date;
  expiresAt?: Date | null;
}

export type ItemUpgradeOrderCreateResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-upgradeable" }
  | { state: "cap-reached"; item: ItemUpgradeInventoryRow }
  | { state: "invalid-donor" }
  | { state: "created"; order: ItemUpgradeOrderRecord; character: CharacterRecord; item: ItemUpgradeInventoryRow };

export interface ItemUpgradeRepository {
  getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<ItemUpgradeSnapshot | null>;
  createNpcOrderForTelegramUser(
    telegramUserId: bigint,
    input: ItemUpgradeOrderCreateInput
  ): Promise<ItemUpgradeOrderCreateResult>;
  attemptForTelegramUser(
    telegramUserId: bigint,
    input: ItemUpgradeAttemptInput
  ): Promise<ItemUpgradeAttemptResult>;
  incrementReadyFightOrders(characterId: string, now: Date): Promise<number>;
  setItemEnhancementForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    level: number
  ): Promise<{ character: CharacterRecord; item: ItemUpgradeInventoryRow } | null>;
  setPityForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    targetLevel: number,
    failureCount: number,
    now: Date
  ): Promise<{ character: CharacterRecord; failureCount: number } | null>;
  cancelOrdersForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<{ character: CharacterRecord; canceled: number } | null>;
  completeOrdersForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<{ character: CharacterRecord; completed: number } | null>;
}
