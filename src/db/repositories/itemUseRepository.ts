import type { ItemContent } from "../../content/schema";
import type { CharacterRecord } from "./characterRepository";

export type ItemUseOrderStatus = "pending" | "processing" | "completed" | "cancelled" | "expired";

export interface ItemUsePreview {
  rulesVersion: string;
  mode?: "restore-to-full";
  resource: "hp" | "mana" | "both";
  hpBefore: number;
  hpMax: number;
  healAmount: number;
  hpAfter: number;
  manaBefore?: number;
  manaMax?: number;
  manaRestoreAmount?: number;
  manaAfter?: number;
}

export interface ItemUseResult extends ItemUsePreview {
  kind:
    | "heal-hp"
    | "heal-hp-to-min-percent"
    | "restore-mana"
    | "restore-both"
    | "random-resource"
    | "heal-hp-below-percent"
    | "full-hp"
    | "full-mana"
    | "expired"
    | "cancelled";
  itemId: string;
  itemName: string;
}

export interface ItemUseRestoreToFullResult extends ItemUsePreview {
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface ItemUseOrderRecord {
  id: string;
  token: string;
  characterId: string;
  telegramUserId: bigint;
  remortCount: number;
  itemId: string;
  itemName: string;
  itemFingerprint: string;
  quantity: number;
  effectKind: string;
  status: ItemUseOrderStatus;
  preview: ItemUsePreview;
  result: ItemUseResult | null;
  expiresAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ItemUsePreviewRepositoryResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-usable" }
  | { state: "combat-locked" }
  | { state: "reserved" }
  | { state: "full-hp"; character: CharacterRecord; preview: ItemUsePreview }
  | { state: "full-mana"; character: CharacterRecord; preview: ItemUsePreview }
  | { state: "preview-created" | "preview-replayed"; character: CharacterRecord; order: ItemUseOrderRecord };

export type ItemUseConfirmRepositoryResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "combat-locked"; order: ItemUseOrderRecord }
  | { state: "expired"; order: ItemUseOrderRecord }
  | { state: "cancelled"; order: ItemUseOrderRecord }
  | { state: "stale-selection"; order: ItemUseOrderRecord }
  | { state: "full-hp"; character: CharacterRecord; order: ItemUseOrderRecord }
  | { state: "full-mana"; character: CharacterRecord; order: ItemUseOrderRecord }
  | { state: "used" | "replayed"; character: CharacterRecord; order: ItemUseOrderRecord };

export type ItemUseCancelRepositoryResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "stale-selection"; order: ItemUseOrderRecord }
  | { state: "cancelled" | "expired" | "completed" | "replayed"; order: ItemUseOrderRecord };

export type ItemUseRestoreToFullRepositoryResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-usable" }
  | { state: "combat-locked" }
  | { state: "reserved" }
  | { state: "full-hp"; character: CharacterRecord; preview: ItemUsePreview }
  | { state: "preview-created" | "preview-replayed"; character: CharacterRecord; order: ItemUseOrderRecord; neededQuantity: number; availableQuantity: number }
  | {
      state: "not-enough";
      character: CharacterRecord;
      neededQuantity: number;
      availableQuantity: number;
      preview: ItemUsePreview;
    }
  | { state: "restored"; character: CharacterRecord; result: ItemUseRestoreToFullResult };

export interface ItemUseRepository {
  createPreviewForTelegramUser(
    telegramUserId: bigint,
    input: {
      item: ItemContent;
      itemContents: readonly ItemContent[];
      itemFingerprint: string;
      token: string;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<ItemUsePreviewRepositoryResult>;

  confirmForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      itemContents: readonly ItemContent[];
      now: Date;
    }
  ): Promise<ItemUseConfirmRepositoryResult>;

  cancelForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      now: Date;
    }
  ): Promise<ItemUseCancelRepositoryResult>;

  restoreToFullForTelegramUser(
    telegramUserId: bigint,
    input: {
      item: ItemContent;
      itemContents: readonly ItemContent[];
      itemFingerprint: string;
      token: string;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<ItemUseRestoreToFullRepositoryResult>;
}
