export interface OverMaxCharacterResourceRow {
  id: string;
  name: string;
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
}

export interface RepairCharacterResourceStore {
  listOverMaxCharacters(): Promise<OverMaxCharacterResourceRow[]>;
  repairCharacterResources(
    characterId: string,
    input: { hpCurrent: number; manaCurrent: number }
  ): Promise<void>;
}

export interface RepairCharacterResourceEntry {
  characterId: string;
  name: string;
  hpBefore: number;
  hpAfter: number;
  hpMax: number;
  manaBefore: number;
  manaAfter: number;
  manaMax: number;
}

export interface RepairCharacterResourceSummary {
  dryRun: boolean;
  charactersScanned: number;
  charactersAffected: number;
  repairsApplied: number;
  entries: RepairCharacterResourceEntry[];
}

export async function repairOverMaxCharacterResources(input: {
  store: RepairCharacterResourceStore;
  apply: boolean;
}): Promise<RepairCharacterResourceSummary> {
  const rows = await input.store.listOverMaxCharacters();
  const entries = rows.map((row) => {
    const hpAfter = clampResource(row.hpCurrent, row.hpMax);
    const manaAfter = clampResource(row.manaCurrent, row.manaMax);
    return {
      characterId: row.id,
      name: row.name,
      hpBefore: row.hpCurrent,
      hpAfter,
      hpMax: row.hpMax,
      manaBefore: row.manaCurrent,
      manaAfter,
      manaMax: row.manaMax
    };
  });

  if (input.apply) {
    for (const entry of entries) {
      await input.store.repairCharacterResources(entry.characterId, {
        hpCurrent: entry.hpAfter,
        manaCurrent: entry.manaAfter
      });
    }
  }

  return {
    dryRun: !input.apply,
    charactersScanned: rows.length,
    charactersAffected: entries.length,
    repairsApplied: input.apply ? entries.length : 0,
    entries
  };
}

function clampResource(current: number, max: number): number {
  const normalizedMax = Math.max(0, Math.floor(max));
  return Math.min(normalizedMax, Math.max(0, Math.floor(current)));
}
