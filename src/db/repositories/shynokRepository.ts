import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";
import type { ItemContent } from "../../content/schema";
import type { ShynokDrinkKey, ShynokDrinkPhase } from "../../domain/shynokDrinks";

export interface ShynokDrinkStateRecord {
  id: string;
  activationId: string;
  characterId: string;
  remortCount: number;
  drinkKey: ShynokDrinkKey;
  phase: ShynokDrinkPhase;
  startedAt: Date;
  expiresAt: Date;
  sourceType: "self_purchase" | "round";
  sourceId: string | null;
  metadata: unknown;
}

export interface ShynokDrinkOrderRecord {
  id: string;
  token: string;
  characterId: string;
  remortCount: number;
  drinkKey: ShynokDrinkKey;
  priceGold: number;
  status: string;
  replacement: unknown;
  result: unknown;
  expiresAt: Date;
  completedAt: Date | null;
}

export interface ShynokRoundRecipientRecord {
  id: string;
  purchaseId: string;
  characterId: string;
  remortCount: number;
  drinkKey: ShynokDrinkKey;
  status: "offered" | "accepted" | "declined" | "expired";
  expiresAt: Date;
  respondedAt: Date | null;
  result: unknown;
}

export interface ShynokMantokSaleRecord {
  id: string;
  token: string;
  characterId: string;
  remortCount: number;
  status: "pending" | "completed" | "cancelled" | "expired";
  selection: Array<{ itemId: string; quantity: number }>;
  selectionFingerprint: string;
  nominalValue: number;
  payoutGold: number;
  result: unknown;
  expiresAt: Date;
  completedAt: Date | null;
}

export interface ShynokAccessSnapshot {
  character: CharacterRecord;
  currentRaidId: string | null;
  activeCombatLease: { kind: string; referenceId: string } | null;
}

export interface ShynokInventorySnapshot {
  character: CharacterRecord;
  items: CharacterItemRecord[];
  equippedItemIds: string[];
  reservedItemIds: string[];
}

export interface ShynokRoundRecipientSnapshot {
  characterId: string;
  telegramUserId: bigint;
  name: string;
  remortCount: number;
}

export type ShynokConfirmDrinkResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "replacement-changed"; order: ShynokDrinkOrderRecord }
  | { state: "expired"; order: ShynokDrinkOrderRecord }
  | { state: "not-enough-gold"; character: CharacterRecord; order: ShynokDrinkOrderRecord }
  | { state: "completed"; character: CharacterRecord; order: ShynokDrinkOrderRecord; drink: ShynokDrinkStateRecord }
  | { state: "replayed"; character: CharacterRecord; order: ShynokDrinkOrderRecord; drink: ShynokDrinkStateRecord | null };

export type ShynokConfirmRoundResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "expired"; order: ShynokDrinkOrderRecord }
  | { state: "not-enough-gold"; character: CharacterRecord; order: ShynokDrinkOrderRecord }
  | {
      state: "completed";
      character: CharacterRecord;
      order: ShynokDrinkOrderRecord;
      purchaseId: string;
      recipientCount: number;
    }
  | {
      state: "replayed";
      character: CharacterRecord;
      order: ShynokDrinkOrderRecord;
      purchaseId: string | null;
      recipientCount: number;
    };

export type ShynokRespondRoundOfferResult =
  | { state: "no-character" }
  | { state: "invalid-offer" }
  | { state: "expired"; offer: ShynokRoundRecipientRecord }
  | { state: "declined"; offer: ShynokRoundRecipientRecord }
  | {
      state: "replacement-required";
      offer: ShynokRoundRecipientRecord;
      drink: ShynokDrinkStateRecord;
      replacementGuard: string;
    }
  | { state: "stale-replacement"; offer: ShynokRoundRecipientRecord }
  | { state: "accepted"; offer: ShynokRoundRecipientRecord; drink: ShynokDrinkStateRecord }
  | { state: "replayed"; offer: ShynokRoundRecipientRecord; drink: ShynokDrinkStateRecord | null };

export type ShynokConfirmSaleResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "expired"; sale: ShynokMantokSaleRecord }
  | { state: "cancelled"; sale: ShynokMantokSaleRecord }
  | { state: "stale-selection"; sale: ShynokMantokSaleRecord }
  | { state: "zero-payout"; sale: ShynokMantokSaleRecord }
  | { state: "sold"; character: CharacterRecord; sale: ShynokMantokSaleRecord }
  | { state: "replayed"; character: CharacterRecord; sale: ShynokMantokSaleRecord };

export interface ShynokRepository {
  getAccessSnapshotForTelegramUser(telegramUserId: bigint): Promise<ShynokAccessSnapshot | null>;
  getInventorySnapshotForTelegramUser(telegramUserId: bigint): Promise<ShynokInventorySnapshot | null>;
  getActiveDrinkForTelegramUser(telegramUserId: bigint, now: Date): Promise<ShynokDrinkStateRecord | null>;
  getRecoveryDrinkForTelegramUser?(telegramUserId: bigint): Promise<ShynokDrinkStateRecord | null>;
  consumeQueuedDrinkForTelegramUser(
    telegramUserId: bigint,
    input: { expectedDrinkKey: ShynokDrinkKey; now: Date; metadata: unknown }
  ): Promise<ShynokDrinkStateRecord | null>;
  createSelfDrinkOrderForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      drinkKey: ShynokDrinkKey;
      priceGold: number;
      replacement: unknown;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<ShynokDrinkOrderRecord | null>;
  confirmSelfDrinkOrderForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      now: Date;
      result: unknown;
    }
  ): Promise<ShynokConfirmDrinkResult>;
  createRoundOrderForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      drinkKey: ShynokDrinkKey;
      priceGold: number;
      snapshot: unknown;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<ShynokDrinkOrderRecord | null>;
  confirmRoundOrderForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      tier: "simple" | "fine";
      localDate: string;
      offerExpiresAt: Date;
      now: Date;
    }
  ): Promise<ShynokConfirmRoundResult>;
  respondToRoundOfferForTelegramUser(
    telegramUserId: bigint,
    input: {
      offerId: string;
      action: "accept" | "decline" | "confirm-replacement";
      replacementGuard?: string;
      now: Date;
      result: unknown;
    }
  ): Promise<ShynokRespondRoundOfferResult>;
  listOpenRoundOffersForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<ShynokRoundRecipientRecord[]>;
  listRoundRecipientsForTelegramUser(telegramUserId: bigint, now: Date): Promise<ShynokRoundRecipientSnapshot[]>;
  createSaleForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      selection: Array<{ itemId: string; quantity: number }>;
      selectionFingerprint: string;
      nominalValue: number;
      payoutGold: number;
      expiresAt: Date;
      now: Date;
    }
  ): Promise<ShynokMantokSaleRecord | null>;
  updateSaleSelectionForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      selection: Array<{ itemId: string; quantity: number }>;
      selectionFingerprint: string;
      nominalValue: number;
      payoutGold: number;
      now: Date;
    }
  ): Promise<ShynokMantokSaleRecord | null>;
  findSaleForTelegramUser(telegramUserId: bigint, token: string): Promise<ShynokMantokSaleRecord | null>;
  cancelSaleForTelegramUser(telegramUserId: bigint, token: string, now: Date): Promise<ShynokMantokSaleRecord | null>;
  confirmSaleForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      itemContents: readonly ItemContent[];
      result: unknown;
      now: Date;
    }
  ): Promise<ShynokConfirmSaleResult>;
}
