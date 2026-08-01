import { randomUUID } from "node:crypto";
import { items } from "../content";
import { findItemContent } from "../content/itemLookup";
import type { ItemContent } from "../content/schema";
import {
  createItemUseFingerprint,
  getItemUseEffect,
  isOutOfCombatItemUseEffect
} from "../domain/itemUse";
import type {
  ItemUseCancelRepositoryResult,
  ItemUseConfirmRepositoryResult,
  ItemUsePreviewRepositoryResult,
  ItemUseRepository,
  ItemUseRestoreToFullRepositoryResult
} from "../db/repositories/itemUseRepository";
import type { AchievementService, AchievementUnlock } from "./achievementService";

export const BANDAGE_ITEM_ID = "item.responsible-panic-bandage";
const ITEM_USE_TTL_MINUTES = 23;

export type ItemUseAvailability =
  | { state: "usable"; item: ItemContent }
  | { state: "not-usable" };
export type ItemUseConfirmResult = ItemUseConfirmRepositoryResult & {
  achievementUnlocks?: AchievementUnlock[];
};

export class ItemUseService {
  constructor(
    private readonly repository: ItemUseRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly achievements?: AchievementService
  ) {}

  getAvailability(item: ItemContent): ItemUseAvailability {
    const effect = getItemUseEffect(item);
    if (!effect || !isOutOfCombatItemUseEffect(effect)) {
      return { state: "not-usable" };
    }

    return { state: "usable", item };
  }

  async createPreviewForTelegramUser(
    telegramUserId: bigint,
    itemId: string
  ): Promise<ItemUsePreviewRepositoryResult> {
    const item = this.findUsableItem(itemId);
    if (!item) {
      return { state: "not-usable" };
    }

    const now = this.now();

    return this.repository.createPreviewForTelegramUser(telegramUserId, {
      item,
      itemContents: items,
      itemFingerprint: createItemUseFingerprint(item),
      token: randomUUID(),
      now,
      expiresAt: addMinutes(now, ITEM_USE_TTL_MINUTES)
    });
  }

  async confirmForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<ItemUseConfirmResult> {
    const result = await this.repository.confirmForTelegramUser(telegramUserId, {
      token,
      itemContents: items,
      now: this.now()
    });

    if (result.state !== "used") {
      return result;
    }

    const achievementUnlocks =
      (await this.achievements?.trackEventSafely({
        type: "item.used",
        characterId: result.order.characterId,
        itemId: result.order.itemId,
        occurredAt: result.order.completedAt ?? this.now(),
        sourceId: result.order.id
      })) ?? [];

    return {
      ...result,
      achievementUnlocks
    };
  }

  async cancelForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<ItemUseCancelRepositoryResult> {
    return this.repository.cancelForTelegramUser(telegramUserId, {
      token,
      now: this.now()
    });
  }

  async restoreToFullForTelegramUser(
    telegramUserId: bigint,
    itemId: string
  ): Promise<ItemUseRestoreToFullRepositoryResult> {
    if (itemId !== BANDAGE_ITEM_ID) {
      return { state: "not-usable" };
    }
    const item = this.findUsableItem(itemId);
    if (!item) {
      return { state: "not-usable" };
    }

    const now = this.now();

    return this.repository.restoreToFullForTelegramUser(telegramUserId, {
      item,
      itemContents: items,
      itemFingerprint: createItemUseFingerprint(item),
      token: randomUUID(),
      now,
      expiresAt: addMinutes(now, ITEM_USE_TTL_MINUTES)
    });
  }

  private findUsableItem(itemId: string): ItemContent | null {
    const item = findItemContent(itemId);
    const effect = item ? getItemUseEffect(item) : null;

    return item && effect && isOutOfCombatItemUseEffect(effect) ? item : null;
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
