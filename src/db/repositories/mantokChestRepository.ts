import type { CharacterItemRecord } from "./inventoryRepository";

export type MantokChestRunStatus = "pending" | "completed" | "cancelled";

export interface MantokChestRunItem {
  itemId: string;
  quantity: number;
}

export interface MantokChestRunRecord {
  id: string;
  characterId: string;
  token: string;
  status: MantokChestRunStatus;
  inputItems: MantokChestRunItem[];
  outputItems: MantokChestRunItem[];
  averageInputScore: number;
  minimumOutputScore: number;
  outputScore: number | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MantokChestSnapshot {
  characterId: string;
  items: CharacterItemRecord[];
  equippedItemIds: string[];
}

export type MantokChestConfirmResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "cancelled"; run: MantokChestRunRecord }
  | { state: "stale-inputs"; run: MantokChestRunRecord }
  | { state: "no-output-candidate"; run: MantokChestRunRecord }
  | { state: "recycled"; run: MantokChestRunRecord }
  | { state: "replayed"; run: MantokChestRunRecord };

export interface MantokChestRepository {
  getSnapshotForTelegramUser(telegramUserId: bigint): Promise<MantokChestSnapshot | null>;
  createPendingRunForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      inputItems: MantokChestRunItem[];
      averageInputScore: number;
      minimumOutputScore: number;
      now: Date;
    }
  ): Promise<MantokChestRunRecord | null>;
  findRunForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<MantokChestRunRecord | null>;
  updatePendingRunInputItemsForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      inputItems: MantokChestRunItem[];
      averageInputScore: number;
      minimumOutputScore: number;
      now: Date;
    }
  ): Promise<MantokChestRunRecord | null>;
  cancelRunForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<MantokChestRunRecord | null>;
  confirmRunForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      now: Date;
      selectOutput: (
        snapshot: MantokChestSnapshot,
        run: MantokChestRunRecord
      ) => { state: "ok"; itemId: string; score: number } | { state: "stale-inputs" } | { state: "no-output-candidate" };
    }
  ): Promise<MantokChestConfirmResult>;
}
