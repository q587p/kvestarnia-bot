import type { CharacterRecord } from "./characterRepository";
import type { PassageSearchLoot, PassageSearchSnapshot } from "../../domain/passageSearch";
import type { RewardLevelChange } from "./dailyActionRepository";

export type PassageSearchActionStatus = "running" | "resolved" | "cancelled";

export interface PassageSearchActionRecord {
  id: string;
  token: string;
  characterId: string;
  nodeKey: string;
  nodeKind: "passage" | "location";
  status: PassageSearchActionStatus;
  startedAt: Date;
  endsAt: Date;
  payload: PassageSearchSnapshot;
  result: PassageSearchStoredResult | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PassageSearchStoredResult =
  | { outcome: "loot"; loot: PassageSearchLoot }
  | { outcome: "nothing"; loot: PassageSearchLoot }
  | { outcome: "monster-attack"; encounterToken: string; passage: "deep-left" | "deep-straight" | "deep-right" }
  | { outcome: "cancelled" }
  | { outcome: "no-reward"; reason: "dead" | "stale" };

export type PassageSearchStartResult =
  | { state: "started"; character: CharacterRecord; action: PassageSearchActionRecord }
  | { state: "active"; character: CharacterRecord; action: PassageSearchActionRecord }
  | { state: "cooldown"; character: CharacterRecord; availableAt: Date }
  | { state: "needs-rest"; character: CharacterRecord }
  | { state: "no-character" };

export type PassageSearchLookupResult =
  | { state: "found"; character: CharacterRecord; action: PassageSearchActionRecord }
  | { state: "no-character" }
  | { state: "not-found"; character: CharacterRecord };

export type PassageSearchResolutionResult =
  | {
      state: "resolved";
      action: PassageSearchActionRecord;
      character: CharacterRecord;
      levelChange: RewardLevelChange | null;
    }
  | { state: "already-handled"; action: PassageSearchActionRecord; character: CharacterRecord }
  | { state: "no-character" }
  | { state: "not-found"; character: CharacterRecord };

export interface PassageSearchRepository {
  startForTelegramUser(
    telegramUserId: bigint,
    input: {
      now: Date;
      token: string;
      nodeKey: string;
      nodeKind: "passage" | "location";
      cooldownKey: string;
      cooldownAvailableAt: Date;
      snapshot: PassageSearchSnapshot;
    }
  ): Promise<PassageSearchStartResult>;

  findByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<PassageSearchLookupResult>;

  findRunningForTelegramUser(
    telegramUserId: bigint
  ): Promise<PassageSearchLookupResult>;

  cancelByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<PassageSearchResolutionResult>;

  resolveByTokenForTelegramUser(
    telegramUserId: bigint,
    token: string,
    input: {
      now: Date;
      result: PassageSearchStoredResult;
      loot?: PassageSearchLoot;
    }
  ): Promise<PassageSearchResolutionResult>;

  clearSearchStateForTelegramUser?(
    telegramUserId: bigint,
    now: Date
  ): Promise<{ state: "cleared"; character: CharacterRecord; actions: number; cooldowns: number } | { state: "no-character" }>;
}
