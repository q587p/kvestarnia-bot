import { describe, expect, it } from "vitest";
import {
  repairOverMaxCharacterResources,
  type OverMaxCharacterResourceRow,
  type RepairCharacterResourceStore
} from "../../src/services/repairCharacterResourceService";

describe("repairOverMaxCharacterResources", () => {
  it("reports over-max rows without applying changes in dry run mode", async () => {
    const store = new FakeRepairStore([
      {
        id: "character-1",
        name: "Shannar de Kassal",
        hpCurrent: 46,
        hpMax: 32,
        manaCurrent: 21,
        manaMax: 16
      }
    ]);

    const summary = await repairOverMaxCharacterResources({
      store,
      apply: false
    });

    expect(summary).toEqual({
      dryRun: true,
      charactersScanned: 1,
      charactersAffected: 1,
      repairsApplied: 0,
      entries: [
        {
          characterId: "character-1",
          name: "Shannar de Kassal",
          hpBefore: 46,
          hpAfter: 32,
          hpMax: 32,
          manaBefore: 21,
          manaAfter: 16,
          manaMax: 16
        }
      ]
    });
    expect(store.repairs).toHaveLength(0);
  });

  it("applies the clamp when requested", async () => {
    const store = new FakeRepairStore([
      {
        id: "character-1",
        name: "Shannar de Kassal",
        hpCurrent: 46,
        hpMax: 32,
        manaCurrent: 21,
        manaMax: 16
      }
    ]);

    const summary = await repairOverMaxCharacterResources({
      store,
      apply: true
    });

    expect(summary.repairsApplied).toBe(1);
    expect(store.repairs).toEqual([
      {
        characterId: "character-1",
        hpCurrent: 32,
        manaCurrent: 16
      }
    ]);
  });
});

class FakeRepairStore implements RepairCharacterResourceStore {
  readonly repairs: Array<{ characterId: string; hpCurrent: number; manaCurrent: number }> = [];

  constructor(private readonly rows: OverMaxCharacterResourceRow[]) {}

  listOverMaxCharacters(): Promise<OverMaxCharacterResourceRow[]> {
    return Promise.resolve(this.rows);
  }

  repairCharacterResources(
    characterId: string,
    input: { hpCurrent: number; manaCurrent: number }
  ): Promise<void> {
    this.repairs.push({
      characterId,
      hpCurrent: input.hpCurrent,
      manaCurrent: input.manaCurrent
    });
    return Promise.resolve();
  }
}
