import { describe, expect, it } from "vitest";
import { monsterLoot } from "../../src/content/monsterFlavor";
import { mantokEquipmentCoverageLoot } from "../../src/content/mantokEquipmentCoverageLoot";
import {
  monsterTrophyLoot,
  type MonsterTrophyLootEntry
} from "../../src/content/monsterTrophyCoverage";
import { monsters } from "../../src/content/monsters";
import { itemSchema } from "../../src/content/schema";
import {
  mantokSetDefinitions,
  mantokSetItemContents,
  mantokSetLootAdditions
} from "../../src/content/mantokSetItems";
import { getActiveMantokSets, summarizeMantokSetBonusEffects } from "../../src/domain/equipment/mantokSetBonuses";
import { getMonsterLootEntryItemId } from "../../src/domain/loot/lootEngine";

describe("mantok set synergy content", () => {
  it("ships thirteen authored set families", () => {
    expect(mantokSetDefinitions).toHaveLength(13);
    expect(mantokSetItemContents).toHaveLength(47);
  });

  it("keeps set items schema-valid and unique", () => {
    const ids = mantokSetItemContents.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const item of mantokSetItemContents) {
      expect(() => itemSchema.parse(item)).not.toThrow();
      expect(["weapon", "armor", "accessory"]).toContain(item.slot);
      expect(item.equipmentSlot).toBeDefined();
      expect(item.effect, item.id).toBeDefined();
    }
  });



  it("starts every 3+ piece set with a small two-piece bonus", () => {
    const largerSets = mantokSetDefinitions.filter((set) => set.pieces.length >= 3);

    expect(largerSets.length).toBe(12);

    for (const set of largerSets) {
      const twoPieceBonus = set.bonuses.find((bonus) => bonus.pieces === 2);

      expect(twoPieceBonus, `${set.id} missing 2-piece threshold`).toBeDefined();
      expect(twoPieceBonus?.kind, `${set.id} 2-piece bonus should stay small/simple`).toBe("stats");
      expect(twoPieceBonus?.effect, `${set.id} 2-piece bonus should expose a visible stat effect`).toBeDefined();
    }
  });

  it("writes set membership and piece progress into every set item description", () => {
    const itemById = new Map(mantokSetItemContents.map((item) => [item.id, item]));

    for (const set of mantokSetDefinitions) {
      const totalPieces = set.pieces.length;

      set.pieces.forEach((piece, index) => {
        const item = itemById.get(piece.itemId);
        const progressLabel = `Частина комплекту «${set.name}»: ${index + 1}/${totalPieces}.`;

        expect(item, `${set.id} missing item ${piece.itemId}`).toBeDefined();
        expect(item?.description, `${piece.itemId} missing set progress label`).toContain(progressLabel);
      });
    }
  });

  it("keeps every set piece reachable from its set definition", () => {
    const itemIds = new Set(mantokSetItemContents.map((item) => item.id));
    const setIds = mantokSetDefinitions.map((set) => set.id);
    expect(new Set(setIds).size).toBe(setIds.length);

    for (const set of mantokSetDefinitions) {
      expect(set.pieces.length, set.id).toBeGreaterThanOrEqual(2);
      expect(set.minLevel, set.id).toBeGreaterThanOrEqual(9);
      expect(set.minLevel, set.id).toBeLessThanOrEqual(13);
      for (const piece of set.pieces) {
        expect(itemIds.has(piece.itemId), `${set.id} missing piece ${piece.itemId}`).toBe(true);
      }
      for (const bonus of set.bonuses) {
        expect(bonus.pieces, `${set.id} bonus threshold`).toBeGreaterThanOrEqual(2);
        expect(bonus.pieces, `${set.id} bonus threshold`).toBeLessThanOrEqual(set.pieces.length);
      }
    }
  });

  it("defines paired-weapon and full-armor style bonuses", () => {
    const paired = mantokSetDefinitions.find((set) => set.id === "mantok-set.red-line-duel");
    const armor = mantokSetDefinitions.find((set) => set.id === "mantok-set.barrel-brother-bulwark");

    expect(paired?.pieces.map((piece) => piece.slot)).toEqual(["weapon", "offhand"]);
    expect(paired?.bonuses).toHaveLength(1);
    expect(paired?.bonuses[0]?.pieces).toBe(2);
    expect(paired?.bonuses[0]?.kind).toBe("stats");
    expect(paired?.bonuses[0]?.effect.dexterity).toBe(1);
    expect(armor?.pieces.map((piece) => piece.slot)).toEqual(
      expect.arrayContaining(["head", "chest", "legs", "offhand"])
    );
    expect(armor?.bonuses.some((bonus) => bonus.pieces === 4 && bonus.kind === "stats")).toBe(true);
  });

  it("keeps set drops attached to current high-level monsters", () => {
    const monsterById = new Map(monsters.map((monster) => [monster.id, monster]));
    const setPieceIds = new Set(mantokSetItemContents.map((item) => item.id));
    const lootPieceIds = new Set<string>();

    for (const [monsterId, entries] of Object.entries(mantokSetLootAdditions)) {
      const monster = monsterById.get(monsterId);
      expect(monster, `unknown monster ${monsterId}`).toBeDefined();
      expect(monster?.level, `low-level set drop source ${monsterId}`).toBeGreaterThanOrEqual(9);
      expect(monster?.level, `future-cap set drop source ${monsterId}`).toBeLessThanOrEqual(13);

      for (const entry of entries) {
        const itemId = typeof entry === "string" ? entry : entry.itemId;
        expect(setPieceIds.has(itemId), `set loot points to non-set item ${itemId}`).toBe(true);
        lootPieceIds.add(itemId);
      }
    }

    expect(lootPieceIds).toEqual(setPieceIds);
  });

  it("merges set loot without overwriting base, trophy, or coverage loot", () => {
    const trophyLootByMonster = monsterTrophyLoot as Readonly<
      Record<string, readonly MonsterTrophyLootEntry[]>
    >;

    for (const [monsterId, setEntries] of Object.entries(mantokSetLootAdditions)) {
      const runtimeLootIds = new Set((monsterLoot[monsterId] ?? []).map(getMonsterLootEntryItemId));

      for (const entry of setEntries) {
        expect(runtimeLootIds.has(getMonsterLootEntryItemId(entry)), `missing set loot for ${monsterId}`).toBe(
          true
        );
      }

      for (const entry of trophyLootByMonster[monsterId] ?? []) {
        expect(runtimeLootIds.has(entry.itemId), `lost trophy loot for ${monsterId}`).toBe(true);
      }

      for (const entry of mantokEquipmentCoverageLoot[monsterId] ?? []) {
        expect(runtimeLootIds.has(entry.itemId), `lost coverage loot for ${monsterId}`).toBe(true);
      }
    }

    expect(monsterLoot["monster.inventory-prophet"]?.map(getMonsterLootEntryItemId)).toContain(
      "item.missing-label-prophecy"
    );
  });

  it("summarizes active set bonuses deterministically", () => {
    const active = getActiveMantokSets([
      "item.set.red-line.left-dagger",
      "item.set.red-line.margin-dagger",
      "item.set.barrel-brother.helm"
    ]);
    const effect = summarizeMantokSetBonusEffects([
      "item.set.red-line.left-dagger",
      "item.set.red-line.margin-dagger"
    ]);

    expect(active.find((entry) => entry.set.id === "mantok-set.red-line-duel")?.activeBonuses).toHaveLength(1);
    expect(active.find((entry) => entry.set.id === "mantok-set.barrel-brother-bulwark")?.activeBonuses).toHaveLength(0);
    expect(effect).toMatchObject({ dexterity: 1 });
  });

  it("keeps every live set bonus stat-only", () => {
    for (const set of mantokSetDefinitions) {
      for (const bonus of set.bonuses) {
        expect(bonus.kind, `${set.id}:${bonus.pieces}`).toBe("stats");
        expect(bonus.effect, `${set.id}:${bonus.pieces}`).toBeDefined();
        expect(Object.values(bonus.effect).some((value) => value !== undefined)).toBe(true);
      }
    }
  });
});
