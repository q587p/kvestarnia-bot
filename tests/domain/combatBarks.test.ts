import { describe, expect, it } from "vitest";
import { findMonsterBark } from "../../src/content/monsterBarks";
import {
  createCombatBarkState,
  deriveMonsterCombatStats,
  resolveMonsterBark,
  startCombat
} from "../../src/domain/combat";
import type { CombatState } from "../../src/domain/combat";
import { monsters } from "../../src/content";

const monster = monsters.find((candidate) => candidate.id === "monster.deadline-spider");

describe("combat barks", () => {
  it("selects early barks deterministically from the frozen encounter seed", () => {
    expect(monster).toBeDefined();
    const currentMonster = monster;

    const left = createCombatBarkState({
      monsterId: currentMonster.id,
      seed: "encounter-587",
      audience: "solo"
    });
    const right = createCombatBarkState({
      monsterId: currentMonster.id,
      seed: "encounter-587",
      audience: "solo"
    });

    expect(left.selectedEarlyBarkByMonsterId).toEqual(right.selectedEarlyBarkByMonsterId);
    expect(findMonsterBark(left.selectedEarlyBarkByMonsterId[currentMonster.id])).toBeDefined();
  });

  it("forces one direct early line by the second monster action", () => {
    expect(monster).toBeDefined();
    const stats = deriveMonsterCombatStats(monster!);
    const firstState = startCombat({
      id: "encounter-23",
      hero: {
        hpMax: 30,
        hp: 30,
        manaMax: 10,
        mana: 10,
        attack: 7,
        armor: 2,
        resist: 1,
        dexterity: 6,
        critChance: 0.05,
        critMultiplier: 1.5,
        classId: "class.warrior"
      },
      monster: stats
    });
    firstState.barks = {
      ...createCombatBarkState({ monsterId: monster!.id, seed: "encounter-23" }),
      ownActionCountByMonsterId: {
        [monster!.id]: 1
      }
    };

    const resolved = resolveMonsterBark({
      state: firstState,
      monster: stats,
      monsterCommittedAction: true,
      monsterUsedAbility: false,
      monsterHpAfterHeroAction: firstState.monster.hp
    });

    expect(resolved.barkId).toBe(firstState.barks.selectedEarlyBarkByMonsterId[monster!.id]);
    expect(resolved.state.emittedBarkIds).toContain(resolved.barkId);
  });

  it("does not re-emit the same bark from a replayed state", () => {
    expect(monster).toBeDefined();
    const stats = deriveMonsterCombatStats(monster!);
    const barkState = createCombatBarkState({ monsterId: monster!.id, seed: "encounter-42" });
    const selected = barkState.selectedEarlyBarkByMonsterId[monster!.id]!;
    const state: CombatState = {
      id: "encounter-42",
      turn: 2,
      status: "active",
      hero: {
        hp: 30,
        hpMax: 30,
        mana: 10,
        manaMax: 10
      },
      monster: {
        id: monster!.id,
        hp: stats.hpMax,
        hpMax: stats.hpMax
      },
      barks: {
        ...barkState,
        emittedBarkIds: [selected],
        ownActionCountByMonsterId: {
          [monster!.id]: 1
        }
      }
    };

    const resolved = resolveMonsterBark({
      state,
      monster: stats,
      monsterCommittedAction: true,
      monsterUsedAbility: false,
      monsterHpAfterHeroAction: state.monster.hp
    });

    expect(resolved.barkId).toBeUndefined();
    expect(resolved.state.emittedBarkIds).toEqual([selected]);
  });
});
