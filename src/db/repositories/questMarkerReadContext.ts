import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ActiveCombatLease,
  CharacterDrinkState,
  CharacterEquipment,
  CharacterItem,
  SoloCombatSession
} from "@prisma/client";
import type { CharacterRecord } from "./characterRepository";
import type { CharacterCooldownRecord } from "./cooldownRepository";
import type { DailyActionRecord } from "./dailyActionRepository";

export interface QuestMarkerReadSnapshot {
  telegramUserId: bigint;
  character: CharacterRecord | null;
  dailyActions: DailyActionRecord[];
  cooldowns: CharacterCooldownRecord[];
  equipment: CharacterEquipment[];
  items: CharacterItem[];
  drinkState: CharacterDrinkState | null;
  activeCombatLease: ActiveCombatLease | null;
  activeCombatSession: SoloCombatSession | null;
}

const storage = new AsyncLocalStorage<QuestMarkerReadSnapshot>();

export function runWithQuestMarkerReadSnapshot<T>(
  snapshot: QuestMarkerReadSnapshot,
  callback: () => Promise<T>
): Promise<T> {
  return storage.run(snapshot, callback);
}

export function getQuestMarkerReadSnapshot(
  telegramUserId?: bigint
): QuestMarkerReadSnapshot | null {
  const snapshot = storage.getStore();
  if (!snapshot || (telegramUserId !== undefined && snapshot.telegramUserId !== telegramUserId)) {
    return null;
  }
  return snapshot;
}
