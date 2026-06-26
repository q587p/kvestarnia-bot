import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";
import type { RemortStatBonus } from "../../domain/remort";

export interface RemortIdentityRecord {
  pronoun: string;
  raceId: string;
  classId: string;
}

export interface RemortDraftRecord {
  id: string;
  characterId: string;
  token: string;
  status: "pending" | "completed" | "cancelled";
  identity: RemortIdentityRecord;
  selectedItems: Array<{ itemId: string }>;
  expiresAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RemortRecord {
  id: string;
  characterId: string;
  token: string;
  remortNumber: number;
  previousLevel: number;
  previousXp: number;
  previousGold: number;
  displayNameSnapshot: string;
  preservedPayload: {
    identity: RemortIdentityRecord;
    items: Array<{ itemId: string; quantity: number }>;
    memoryRank: number;
    hpBonus: number;
    manaBonus: number;
    statBonuses: RemortStatBonus[];
    statBonus: RemortStatBonus | null;
  };
  createdAt: Date;
}

export interface RemortSnapshot {
  character: CharacterRecord;
  remortCount: number;
  items: CharacterItemRecord[];
  equippedItemIds: string[];
  draft: RemortDraftRecord | null;
}

export interface RemortCompletionInput {
  token: string;
  now: Date;
  validate: (snapshot: RemortSnapshot) =>
    | {
        state: "ready";
        identity: RemortIdentityRecord;
        selectedItems: Array<{ itemId: string; quantity: number }>;
        keptItems: Array<{ itemId: string; quantity: number }>;
        remortNumber: number;
        memoryRank: number;
        hpBonus: number;
        manaBonus: number;
        statBonuses: RemortStatBonus[];
        statBonus: RemortStatBonus | null;
        hpCurrent: number;
        hpMax: number;
        manaCurrent: number;
        manaMax: number;
        statsJson: unknown;
      }
    | { state: "locked"; level: number }
    | { state: "invalid-draft"; reason: string };
}

export type RemortCompletionResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "active-combat" }
  | { state: "locked"; level: number }
  | { state: "invalid-draft"; reason: string }
  | { state: "completed"; character: CharacterRecord; remort: RemortRecord }
  | { state: "replayed"; character: CharacterRecord; remort: RemortRecord };

export interface RemortBoardEntry {
  rank: number;
  characterId: string;
  name: string;
  remortNumber: number;
  reachedAt: Date;
}

export interface RemortBoardGroup {
  remortNumber: number;
  entries: RemortBoardEntry[];
}

export interface RemortBoard {
  remorts: RemortBoardGroup[];
}

export interface RemortRepository {
  getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<RemortSnapshot | null>;
  createOrUpdateDraftForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      identity: RemortIdentityRecord;
      selectedItems: Array<{ itemId: string }>;
      expiresAt: Date;
      now: Date;
    }
  ): Promise<RemortDraftRecord | null>;
  updateDraftForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      identity?: RemortIdentityRecord;
      selectedItems?: Array<{ itemId: string }>;
      expiresAt: Date;
      now: Date;
    }
  ): Promise<RemortDraftRecord | null>;
  completeDraftForTelegramUser(
    telegramUserId: bigint,
    input: RemortCompletionInput
  ): Promise<RemortCompletionResult>;
  countByTelegramUserId(telegramUserId: bigint): Promise<number>;
  listBoard(input?: { maxGroups?: number; maxEntriesPerGroup?: number }): Promise<RemortBoard>;
}
