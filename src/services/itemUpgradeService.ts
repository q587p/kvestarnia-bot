import { randomBytes } from "node:crypto";
import { items } from "../content";
import {
  calculateItemUpgradeChance,
  calculateItemUpgradeCosts,
  getDonorBonus,
  getItemDisplayNameWithEnhancement,
  getItemUpgradePrimaryStat,
  getLuckFromStats,
  isItemUpgradeable,
  isMageClassForSparkTemper,
  ITEM_UPGRADE_ORDER_TARGET_LEVEL
} from "../domain/itemUpgrades";
import type { RandomSource } from "../shared/random";
import { CryptoRandomSource } from "../shared/random";
import type {
  ItemUpgradeAttemptResult,
  ItemUpgradeOrderCreateResult,
  ItemUpgradeOrderRecord,
  ItemUpgradeRepository
} from "../db/repositories/itemUpgradeRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import { ISKROKAMIN_ITEM_ID } from "./itemGrant";
import { getMantokSetForItem } from "../domain/equipment/mantokSetBonuses";

export type ItemUpgradeListResult =
  | { state: "no-character" }
  | {
      state: "ready";
      character: CharacterSummary;
      iskrokamin: number;
      canUseSparkTemper: boolean;
      items: ItemUpgradePresentedItem[];
      orders: ItemUpgradeOrderRecord[];
    };

export interface ItemUpgradePresentedItem {
  itemId: string;
  name: string;
  baseName: string;
  quantity: number;
  enhancementLevel: number;
  equipped: boolean;
  targetLevel: number | null;
  primaryStat: string | null;
}

export interface ItemUpgradeDonorOption {
  itemId: string;
  name: string;
  chanceBonus: number;
  iskrokaminDiscount: number;
}

export type ItemUpgradePreviewResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-upgradeable" }
  | { state: "cap-reached"; item: ItemUpgradePresentedItem }
  | {
      state: "ready";
      character: CharacterSummary;
      item: ItemUpgradePresentedItem;
      method: "npc" | "self";
      costs: { gold: number; iskrokamin: number; mana: number };
      chance: {
        baseChance: number;
        luckBonus: number;
        pityBonus: number;
        donorBonus: number;
        finalChance: number;
        guaranteed: boolean;
      };
      donor: {
        itemId: string;
        name: string;
        chanceBonus: number;
        iskrokaminDiscount: number;
      } | null;
      donorOptions: ItemUpgradeDonorOption[];
      pityFailures: number;
      requiresOrder: boolean;
      order: ItemUpgradeOrderRecord | null;
    };

export type ItemUpgradeCreateOrderResult = ItemUpgradeOrderCreateResult & {
  achievementUnlocks?: AchievementUnlock[];
};

export type ItemUpgradeAttemptServiceResult = ItemUpgradeAttemptResult & {
  achievementUnlocks?: AchievementUnlock[];
};

export class ItemUpgradeService {
  constructor(
    private readonly repository: ItemUpgradeRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly achievements?: AchievementService
  ) {}

  async listForTelegramUser(telegramUserId: bigint): Promise<ItemUpgradeListResult> {
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock());
    if (!snapshot) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      character: summarizeCharacter(snapshot.character),
      iskrokamin: snapshot.items.find((item) => item.itemId === ISKROKAMIN_ITEM_ID)?.quantity ?? 0,
      canUseSparkTemper: isMageClassForSparkTemper(snapshot.character.classId),
      items: snapshot.items.flatMap((row) => {
        const item = items.find((candidate) => candidate.id === row.itemId);
        if (!item || !isItemUpgradeable(item, row.enhancementLevel)) {
          return [];
        }

        return [presentItem(row.itemId, row.quantity, row.enhancementLevel, row.equipped)];
      }),
      orders: snapshot.orders
    };
  }

  async previewForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    method: "npc" | "self" = "npc",
    donorItemId?: string | null
  ): Promise<ItemUpgradePreviewResult> {
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock());
    if (!snapshot) {
      return { state: "no-character" };
    }

    const row = snapshot.items.find((item) => item.itemId === itemId);
    if (!row) {
      return { state: "not-owned" };
    }

    const item = items.find((candidate) => candidate.id === itemId);
    if (!item || !isItemUpgradeable(item, row.enhancementLevel)) {
      return { state: "not-upgradeable" };
    }

    const presented = presentItem(row.itemId, row.quantity, row.enhancementLevel, row.equipped);
    if (presented.targetLevel === null) {
      return { state: "cap-reached", item: presented };
    }
    const targetLevel = presented.targetLevel;

    if (method === "self" && !isMageClassForSparkTemper(snapshot.character.classId)) {
      return { state: "not-upgradeable" };
    }

    const donorRow = donorItemId ? snapshot.items.find((candidate) => candidate.itemId === donorItemId) : null;
    const donorItem = donorItemId ? items.find((candidate) => candidate.id === donorItemId) : null;
    const donorBonus = donorRow && donorItem
      ? getDonorBonus({
          baseItem: item,
          baseItemId: itemId,
          baseEnhancementLevel: row.enhancementLevel,
          donorItem,
          donorItemId: donorItemId!,
          donorEnhancementLevel: donorRow.enhancementLevel
        })
      : null;
    const donorOptions = snapshot.items.flatMap((candidate) => {
      if (candidate.itemId === itemId && candidate.quantity < 2) {
        return [];
      }

      const candidateItem = items.find((content) => content.id === candidate.itemId);
      const bonus = candidateItem
        ? getDonorBonus({
            baseItem: item,
            baseItemId: itemId,
            baseEnhancementLevel: row.enhancementLevel,
            donorItem: candidateItem,
            donorItemId: candidate.itemId,
            donorEnhancementLevel: candidate.enhancementLevel
          })
        : null;

      if (!candidateItem || !bonus) {
        return [];
      }

      return [{
        itemId: candidate.itemId,
        name: getItemDisplayNameWithEnhancement(candidateItem, candidate.enhancementLevel),
        chanceBonus: bonus.chanceBonus,
        iskrokaminDiscount: bonus.iskrokaminDiscount
      }];
    }).sort((left, right) =>
      right.chanceBonus - left.chanceBonus ||
      right.iskrokaminDiscount - left.iskrokaminDiscount ||
      left.name.localeCompare(right.name, "uk")
    );
    const pityFailures = snapshot.pities.find((pity) =>
      pity.itemId === itemId && pity.targetLevel === presented.targetLevel
    )?.failureCount ?? 0;
    const costs = calculateItemUpgradeCosts({
      method,
      targetLevel,
      donor: donorBonus
    });
    const chance = calculateItemUpgradeChance({
      method,
      targetLevel,
      luck: getLuckFromStats(parseStats(snapshot.character.statsJson)),
      pityFailures,
      donor: donorBonus
    });
    const order = snapshot.orders.find((candidate) =>
      candidate.itemId === itemId &&
      candidate.targetLevel === targetLevel &&
      candidate.status !== "attempted"
    ) ?? null;

    return {
      state: "ready",
      character: summarizeCharacter(snapshot.character),
      item: presented,
      method,
      costs,
      chance,
      donor: donorBonus && donorItemId && donorItem
        ? {
            itemId: donorItemId,
            name: getItemDisplayNameWithEnhancement(donorItem, donorRow?.enhancementLevel),
            chanceBonus: donorBonus.chanceBonus,
            iskrokaminDiscount: donorBonus.iskrokaminDiscount
          }
        : null,
      donorOptions,
      pityFailures,
      requiresOrder: method === "npc" && targetLevel >= ITEM_UPGRADE_ORDER_TARGET_LEVEL,
      order
    };
  }

  async createNpcOrderForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    donorItemId?: string | null
  ): Promise<ItemUpgradeCreateOrderResult> {
    const preview = await this.previewForTelegramUser(telegramUserId, itemId, "npc", donorItemId);
    if (preview.state !== "ready") {
      return preview.state === "no-character"
        ? { state: "no-character" }
        : preview.state === "cap-reached"
          ? { state: "cap-reached", item: { id: itemId, characterId: "", itemId, quantity: 1, enhancementLevel: 5, equipped: false } }
          : { state: preview.state as "not-owned" | "not-upgradeable" | "invalid-donor" };
    }

    const now = this.clock();
    const orderInput = {
      token: createOrderToken(),
      itemId,
      fromLevel: preview.item.enhancementLevel,
      targetLevel: preview.item.targetLevel ?? preview.item.enhancementLevel + 1,
      requiredFightCount: Math.max(1, Math.min(5, preview.item.targetLevel ?? 1)),
      cost: preview.costs,
      chance: preview.chance,
      now,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      ...(donorItemId === undefined ? {} : { donorItemId })
    };
    const result = await this.repository.createNpcOrderForTelegramUser(telegramUserId, orderInput);
    return result;
  }

  async attemptForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    method: "npc" | "self" = "npc",
    donorItemId?: string | null,
    orderToken?: string,
    expectedFromLevel?: number,
    expectedQuantity?: number | null,
    expectedPityFailures?: number | null
  ): Promise<ItemUpgradeAttemptServiceResult> {
    const now = this.clock();
    const result = await this.repository.attemptForTelegramUser(telegramUserId, {
      itemId,
      method,
      now,
      roll: this.rng.nextFloat(),
      ...(orderToken === undefined ? {} : { token: orderToken }),
      ...(donorItemId === undefined ? {} : { donorItemId }),
      ...(expectedFromLevel === undefined ? {} : { expectedFromLevel }),
      ...(expectedQuantity === undefined || expectedQuantity === null ? {} : { expectedQuantity }),
      ...(expectedPityFailures === undefined || expectedPityFailures === null ? {} : { expectedPityFailures })
    });

    if (result.state !== "attempted" || !this.achievements) {
      return result;
    }

    const item = items.find((candidate) => candidate.id === result.item.itemId);
    const setId = item ? getMantokSetForItem(item.id)?.id ?? null : null;
    const sourceId = `${method}:${result.character.id}:${result.item.itemId}:${result.targetLevel}:${result.fromLevel}`;
    const unlocks: AchievementUnlock[] = [];
    if (result.order) {
      unlocks.push(
        ...(await this.achievements.trackEventSafely({
          type: "item-upgrade.order-completed",
          characterId: result.character.id,
          occurredAt: now,
          sourceId: result.order.id
        }))
      );
    }
    unlocks.push(
      ...(await this.achievements.trackEventSafely({
      type: result.success ? "item-upgrade.succeeded" : "item-upgrade.failed",
      characterId: result.character.id,
      occurredAt: now,
      sourceId
      }))
    );
    if (result.donorConsumed) {
      unlocks.push(
        ...(await this.achievements.trackEventSafely({
          type: "item-upgrade.donor-used",
          characterId: result.character.id,
          occurredAt: now,
          sourceId
        }))
      );
    }
    if (result.success && result.targetLevel >= 5) {
      unlocks.push(
        ...(await this.achievements.trackEventSafely({
          type: "item-upgrade.level-5",
          characterId: result.character.id,
          occurredAt: now,
          sourceId
        }))
      );
    }
    if (result.success && setId) {
      unlocks.push(
        ...(await this.achievements.trackEventSafely({
          type: "item-upgrade.set-item",
          characterId: result.character.id,
          occurredAt: now,
          sourceId
        }))
      );
    }

    return { ...result, achievementUnlocks: unlocks };
  }

  recordFightCompletedForCharacter(characterId: string): Promise<number> {
    return this.repository.incrementReadyFightOrders(characterId, this.clock());
  }

  setItemEnhancementForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    level: number
  ) {
    return this.repository.setItemEnhancementForTelegramUser(telegramUserId, itemId, level);
  }

  setPityForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    targetLevel: number,
    failureCount: number
  ) {
    return this.repository.setPityForTelegramUser(telegramUserId, itemId, targetLevel, failureCount, this.clock());
  }

  completeOrdersForTelegramUser(telegramUserId: bigint) {
    return this.repository.completeOrdersForTelegramUser(telegramUserId, this.clock());
  }

  cancelOrdersForTelegramUser(telegramUserId: bigint) {
    return this.repository.cancelOrdersForTelegramUser(telegramUserId, this.clock());
  }
}

function presentItem(
  itemId: string,
  quantity: number,
  enhancementLevel: number,
  equipped: boolean
): ItemUpgradePresentedItem {
  const content = items.find((item) => item.id === itemId);
  const level = Math.max(0, Math.floor(enhancementLevel));

  return {
    itemId,
    name: content ? getItemDisplayNameWithEnhancement(content, level) : itemId,
    baseName: content?.name ?? itemId,
    quantity,
    enhancementLevel: level,
    equipped,
    targetLevel: level >= 5 ? null : level + 1,
    primaryStat: content ? getItemUpgradePrimaryStat(content) : null
  };
}

function createOrderToken(): string {
  return randomBytes(8).toString("base64url");
}

function parseStats(value: unknown) {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

  return {
    strength: numberOrZero(record.strength),
    dexterity: numberOrZero(record.dexterity),
    intelligence: numberOrZero(record.intelligence),
    charisma: numberOrZero(record.charisma),
    luck: numberOrZero(record.luck)
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
