import type { ItemContent } from "../../content/schema";
import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";

export type ItemTransferStatus = "pending" | "processing" | "completed" | "declined" | "expired" | "cancelled";

export interface ItemTransferRecord {
  id: string;
  token: string;
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
  status: ItemTransferStatus;
  result: unknown;
  expiresAt: Date;
  completedAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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

export type ItemTransferCreateResult =
  | { state: "no-character" }
  | { state: "self-gift" }
  | { state: "target-not-found" }
  | { state: "combat-locked" }
  | { state: "location-mismatch" }
  | { state: "stale-selection" }
  | { state: "created"; transfer: ItemTransferRecord; sender: CharacterRecord; receiver: CharacterRecord };

export type ItemTransferRespondResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "not-recipient" }
  | { state: "not-sender" }
  | { state: "combat-locked"; transfer: ItemTransferRecord }
  | { state: "location-mismatch"; transfer: ItemTransferRecord }
  | { state: "stale-selection"; transfer: ItemTransferRecord }
  | { state: "expired"; transfer: ItemTransferRecord }
  | { state: "declined"; transfer: ItemTransferRecord }
  | { state: "cancelled"; transfer: ItemTransferRecord }
  | { state: "completed"; transfer: ItemTransferRecord; sender: CharacterRecord; receiver: CharacterRecord }
  | { state: "replayed"; transfer: ItemTransferRecord; sender: CharacterRecord | null; receiver: CharacterRecord | null };

export interface ItemTransferRepository {
  getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<ItemTransferSnapshot | null>;
  createGiftForTelegramUser(
    senderTelegramUserId: bigint,
    input: ItemTransferCreateInput
  ): Promise<ItemTransferCreateResult>;
  findGiftForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemTransferRecord | null>;
  cancelGiftForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<ItemTransferRespondResult>;
  declineGiftForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<ItemTransferRespondResult>;
  acceptGiftForTelegramUser(
    telegramUserId: bigint,
    input: { token: string; itemContents: readonly ItemContent[]; now: Date; result: unknown }
  ): Promise<ItemTransferRespondResult>;
}
