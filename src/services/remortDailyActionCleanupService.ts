import { REMORT_RESET_DAILY_ACTION_KEYS } from "./dailyActionKeys";

export interface RemortCleanupDailyAction {
  id: string;
  key: string;
  localDate: string;
  createdAt: Date;
}

export interface RemortCleanupCharacter {
  id: string;
  name: string;
  level: number;
  latestRemortCreatedAt: Date;
  dailyActions: RemortCleanupDailyAction[];
}

export interface RemortDailyActionCleanupStore {
  listRemortedCharactersWithDailyActions(
    keys: readonly string[]
  ): Promise<RemortCleanupCharacter[]>;
  deleteDailyActionsByIds(ids: readonly string[]): Promise<number>;
}

export interface RemortDailyActionCleanupEntry {
  characterId: string;
  characterName: string;
  level: number;
  latestRemortCreatedAt: Date;
  actionIds: string[];
  actionKeys: string[];
}

export interface RemortDailyActionCleanupSummary {
  dryRun: boolean;
  charactersScanned: number;
  charactersAffected: number;
  actionsMatched: number;
  actionsDeleted: number;
  entries: RemortDailyActionCleanupEntry[];
}

export async function runRemortDailyActionCleanup(input: {
  store: RemortDailyActionCleanupStore;
  apply: boolean;
  keys?: readonly string[];
}): Promise<RemortDailyActionCleanupSummary> {
  const keys = input.keys ?? REMORT_RESET_DAILY_ACTION_KEYS;
  const characters = await input.store.listRemortedCharactersWithDailyActions(keys);
  const entries = characters
    .map((character) => {
      const staleActions = character.dailyActions.filter(
        (action) => action.createdAt < character.latestRemortCreatedAt
      );

      return {
        characterId: character.id,
        characterName: character.name,
        level: character.level,
        latestRemortCreatedAt: character.latestRemortCreatedAt,
        actionIds: staleActions.map((action) => action.id),
        actionKeys: [...new Set(staleActions.map((action) => action.key))].sort()
      };
    })
    .filter((entry) => entry.actionIds.length > 0);
  const actionIds = entries.flatMap((entry) => entry.actionIds);
  const actionsDeleted = input.apply
    ? await input.store.deleteDailyActionsByIds(actionIds)
    : 0;

  return {
    dryRun: !input.apply,
    charactersScanned: characters.length,
    charactersAffected: entries.length,
    actionsMatched: actionIds.length,
    actionsDeleted,
    entries
  };
}
