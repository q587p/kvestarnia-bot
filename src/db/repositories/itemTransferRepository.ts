import type { ItemContent } from "../../content/schema";
import type { ItemPostalPackageLine } from "../../domain/itemTransfers";
import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";

export type ItemTransferStatus = "draft" | "pending" | "processing" | "completed" | "declined" | "expired" | "cancelled";
export type ItemTransferKind = "gift" | "postal";

export interface ItemTransferRecord {
  id: string;
  token: string;
  transferKind: ItemTransferKind;
  senderCharacterId: string;
  receiverCharacterId: string;
  senderTelegramUserId: bigint;
  receiverTelegramUserId: bigint;
  senderName: string;
  receiverName: string;
  senderRemortCount: number;
  receiverRemortCount: number;
  locationId: string | null;
  itemId: string;
  itemName: string;
  itemFingerprint: string;
  quantity: number;
  packageLines: ItemPostalPackageLine[];
  deliveryFeeGold: number;
  status: ItemTransferStatus;
  result: unknown;
  expiresAt: Date;
  completedAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemPostalRecipient {
  telegramUserId: bigint;
  name: string;
  level: number;
  activeCosmeticTitle?: string;
}

export interface ItemPostalTransferSummary {
  token: string;
  status: ItemTransferStatus;
  direction: "incoming" | "outgoing";
  otherName: string;
  packageLines: ItemPostalPackageLine[];
  deliveryFeeGold: number;
  expiresAt: Date;
  completedAt: Date | null;
  respondedAt: Date | null;
  updatedAt: Date;
}

export interface ItemPostalTransferPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  visible: ItemPostalTransferSummary[];
}

export interface ItemTransferSnapshot {
  character: CharacterRecord;
  items: CharacterItemRecord[];
  equippedItemIds: string[];
  reservedItemIds: string[];
}

export interface ItemTransferCreateInput {
  token: string;
  receiverTelegramUserId: bigint;
  item: ItemContent;
  itemFingerprint: string;
  expiresAt: Date;
  now: Date;
}

export interface ItemPostalDraftInput {
  token: string;
  receiverTelegramUserId: bigint;
  expiresAt: Date;
  now: Date;
}

export interface ItemPostalDraftUpdateInput {
  token: string;
  packageLines: ItemPostalPackageLine[];
  deliveryFeeGold: number;
  now: Date;
}

export interface ItemPostalConfirmInput {
  token: string;
  itemContents: readonly ItemContent[];
  now: Date;
  expiresAt: Date;
  result: unknown;
}

export type ItemTransferCreateResult =
  | { state: "no-character" }
  | { state: "self-gift" }
  | { state: "target-not-found" }
  | { state: "combat-locked" }
  | { state: "location-mismatch" }
  | { state: "stale-selection" }
  | { state: "created"; transfer: ItemTransferRecord; sender: CharacterRecord; receiver: CharacterRecord };

export type ItemPostalRecipientsResult =
  | { state: "no-character" }
  | {
      state: "ready";
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      visible: ItemPostalRecipient[];
      inTransit: ItemPostalTransferPage;
      history: ItemPostalTransferPage;
    };

export type ItemPostalDraftResult =
  | { state: "no-character" }
  | { state: "self-gift" }
  | { state: "target-not-found" }
  | { state: "created"; transfer: ItemTransferRecord; sender: CharacterRecord; receiver: CharacterRecord };

export type ItemPostalDraftUpdateResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "not-sender" }
  | { state: "stale-selection"; transfer: ItemTransferRecord }
  | { state: "updated"; transfer: ItemTransferRecord; sender: CharacterRecord; receiver: CharacterRecord };

export type ItemPostalConfirmResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "not-sender" }
  | { state: "combat-locked"; transfer: ItemTransferRecord }
  | { state: "insufficient-gold"; transfer: ItemTransferRecord }
  | { state: "stale-selection"; transfer: ItemTransferRecord }
  | { state: "created"; transfer: ItemTransferRecord; sender: CharacterRecord; receiver: CharacterRecord };

export type ItemTransferRespondResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "not-recipient" }
  | { state: "not-sender" }
  | { state: "combat-locked"; transfer: ItemTransferRecord }
  | { state: "location-mismatch"; transfer: ItemTransferRecord }
  | { state: "stale-selection"; transfer: ItemTransferRecord }
  | { state: "insufficient-gold"; transfer: ItemTransferRecord }
  | { state: "expired"; transfer: ItemTransferRecord; transitioned?: boolean }
  | { state: "declined"; transfer: ItemTransferRecord; transitioned?: boolean }
  | { state: "cancelled"; transfer: ItemTransferRecord; transitioned?: boolean }
  | { state: "completed"; transfer: ItemTransferRecord; sender: CharacterRecord; receiver: CharacterRecord }
  | { state: "replayed"; transfer: ItemTransferRecord; sender: CharacterRecord | null; receiver: CharacterRecord | null };

export interface ItemTransferRepository {
  getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<ItemTransferSnapshot | null>;
  createGiftForTelegramUser(
    senderTelegramUserId: bigint,
    input: ItemTransferCreateInput
  ): Promise<ItemTransferCreateResult>;
  findGiftForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemTransferRecord | null>;
  getPostalRecipientsForTelegramUser(
    telegramUserId: bigint,
    page: number,
    pageSize: number,
    pages?: { inTransitPage?: number; historyPage?: number }
  ): Promise<ItemPostalRecipientsResult>;
  createPostalDraftForTelegramUser(
    senderTelegramUserId: bigint,
    input: ItemPostalDraftInput
  ): Promise<ItemPostalDraftResult>;
  updatePostalDraftForTelegramUser(
    telegramUserId: bigint,
    input: ItemPostalDraftUpdateInput
  ): Promise<ItemPostalDraftUpdateResult>;
  findPostalTransferForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemTransferRecord | null>;
  confirmPostalDraftForTelegramUser(
    telegramUserId: bigint,
    input: ItemPostalConfirmInput
  ): Promise<ItemPostalConfirmResult>;
  cancelPostalForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<ItemTransferRespondResult>;
  declinePostalForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<ItemTransferRespondResult>;
  acceptPostalForTelegramUser(
    telegramUserId: bigint,
    input: { token: string; itemContents: readonly ItemContent[]; now: Date; result: unknown }
  ): Promise<ItemTransferRespondResult>;
  cancelGiftForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<ItemTransferRespondResult>;
  declineGiftForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<ItemTransferRespondResult>;
  acceptGiftForTelegramUser(
    telegramUserId: bigint,
    input: { token: string; itemContents: readonly ItemContent[]; now: Date; result: unknown }
  ): Promise<ItemTransferRespondResult>;
}
