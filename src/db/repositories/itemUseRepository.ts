import type { ItemContent } from "../../content/schema";
import type { CharacterRecord } from "./characterRepository";

export type ItemUseOrderStatus = "pending" | "processing" | "completed" | "cancelled" | "expired";

export interface ItemUsePreview {
  rulesVersion: string;
  hpBefore: number;
  hpMax: number;
  healAmount: number;
  hpAfter: number;
}

export interface ItemUseResult extends ItemUsePreview {
  kind: "heal-hp" | "full-hp" | "expired" | "cancelled";
  itemId: string;
  itemName: string;
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
  | { state: "preview-created" | "preview-replayed"; character: CharacterRecord; order: ItemUseOrderRecord };

export type ItemUseConfirmRepositoryResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "combat-locked"; order: ItemUseOrderRecord }
  | { state: "expired"; order: ItemUseOrderRecord }
  | { state: "cancelled"; order: ItemUseOrderRecord }
  | { state: "stale-selection"; order: ItemUseOrderRecord }
  | { state: "full-hp"; character: CharacterRecord; order: ItemUseOrderRecord }
  | { state: "used" | "replayed"; character: CharacterRecord; order: ItemUseOrderRecord };

export type ItemUseCancelRepositoryResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "stale-selection"; order: ItemUseOrderRecord }
  | { state: "cancelled" | "expired" | "completed" | "replayed"; order: ItemUseOrderRecord };

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
}
