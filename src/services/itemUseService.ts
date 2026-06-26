import { randomUUID } from "node:crypto";
import { items } from "../content";
import type { ItemContent } from "../content/schema";
import {
  createItemUseFingerprint,
  getItemUseEffect
} from "../domain/itemUse";
import type {
  ItemUseCancelRepositoryResult,
  ItemUseConfirmRepositoryResult,
  ItemUsePreviewRepositoryResult,
  ItemUseRepository,
  ItemUseRestoreToFullRepositoryResult
} from "../db/repositories/itemUseRepository";

export const BANDAGE_ITEM_ID = "item.responsible-panic-bandage";
const ITEM_USE_TTL_MINUTES = 23;

export type ItemUseAvailability =
  | { state: "usable"; item: ItemContent }
  | { state: "not-usable" };

export class ItemUseService {
  constructor(
    private readonly repository: ItemUseRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  getAvailability(item: ItemContent): ItemUseAvailability {
    if (!getItemUseEffect(item)) {
      return { state: "not-usable" };
    }

    return { state: "usable", item };
  }

  async createPreviewForTelegramUser(
    telegramUserId: bigint,
    itemId: string
  ): Promise<ItemUsePreviewRepositoryResult> {
    const item = findUsableItem(itemId);
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
  ): Promise<ItemUseConfirmRepositoryResult> {
    return this.repository.confirmForTelegramUser(telegramUserId, {
      token,
      itemContents: items,
      now: this.now()
    });
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
    const item = findUsableItem(itemId);
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
}

function findUsableItem(itemId: string): ItemContent | null {
  const item = items.find((candidate) => candidate.id === itemId);

  return item && getItemUseEffect(item) ? item : null;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
