import { describe, expect, it } from "vitest";
import {
  BASIC_ATTACK_ABILITY_ID,
  createCombatAnalyticsState,
  mapCombatStatusToAnalyticsOutcome,
  recordCombatAnalyticsTurn,
  SYSTEM_SKIP_ABILITY_ID,
  type CombatState,
  type MonsterCombatStats
} from "../../src/domain/combat";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("combat balance analytics state", () => {
  it("records a compact per-turn accumulator without changing combat resources", () => {
    const state: CombatState = {
      id: "combat-1",
      turn: 1,
      status: "active",
      hero: { hp: 30, hpMax: 40, mana: 8, manaMax: 10 },
      monster: { id: "monster.rat", hp: 10, hpMax: 20 },
      analytics: createCombatAnalyticsState({
        characterId: "character-1",
        playerAnalysisKey: "analysis-key",
        character: makeCharacter(),
        monster: makeMonster(),
        combatSource: "regular_mob",
        startedAt: new Date("2026-06-21T10:00:00.000Z")
      })
    };

    const updated = recordCombatAnalyticsTurn(state, {
      action: "attack",
      heroOutcome: "hit",
      monsterOutcome: "hit",
      heroDamage: 7,
      monsterDamage: 3,
      manaSpent: 0,
      critical: false,
      monsterAction: "attack"
    });

    expect(updated.hero).toEqual(state.hero);
    expect(updated.analytics?.totals).toMatchObject({
      playerActionsCount: 1,
      manualPlayerActionsCount: 1,
      timeoutAutoActionsCount: 0,
      timeoutSkipActionsCount: 0,
      enemyActionsCount: 1,
      damageDealt: 7,
      damageTaken: 3
    });
    expect(updated.analytics?.abilities[`manual:${BASIC_ATTACK_ABILITY_ID}`]).toMatchObject({
      actionOrigin: "manual",
      usesCount: 1,
      successfulUsesCount: 1,
      hitCount: 1,
      totalDamage: 7
    });
  });

  it("separates skip timeout actions from ordinary attacks", () => {
    const state: CombatState = {
      id: "combat-2",
      turn: 2,
      status: "active",
      hero: { hp: 12, hpMax: 40, mana: 8, manaMax: 10 },
      monster: { id: "monster.rat", hp: 10, hpMax: 20 },
      analytics: createCombatAnalyticsState({
        characterId: "character-1",
        playerAnalysisKey: "analysis-key",
        character: makeCharacter(),
        monster: makeMonster(),
        combatSource: "regular_mob",
        startedAt: new Date("2026-06-21T10:00:00.000Z")
      })
    };

    const updated = recordCombatAnalyticsTurn(state, {
      action: "skip",
      heroOutcome: "inactive",
      monsterOutcome: "hit",
      heroDamage: 0,
      monsterDamage: 4,
      manaSpent: 0,
      critical: false,
      monsterAction: "attack",
      actionOrigin: "timeout-skip"
    });

    expect(updated.analytics?.totals).toMatchObject({
      manualPlayerActionsCount: 0,
      timeoutAutoActionsCount: 0,
      timeoutSkipActionsCount: 1
    });
    expect(updated.analytics?.abilities[`timeout-skip:${SYSTEM_SKIP_ABILITY_ID}`]).toMatchObject({
      actionOrigin: "timeout-skip",
      usesCount: 1,
      successfulUsesCount: 0
    });
    expect(updated.analytics?.abilities[`manual:${BASIC_ATTACK_ABILITY_ID}`]).toBeUndefined();
  });

  it("separates timeout auto-attacks from player-selected basic attacks", () => {
    const state: CombatState = {
      id: "combat-3",
      turn: 2,
      status: "active",
      hero: { hp: 30, hpMax: 40, mana: 8, manaMax: 10 },
      monster: { id: "monster.rat", hp: 10, hpMax: 20 },
      analytics: createCombatAnalyticsState({
        characterId: "character-1",
        playerAnalysisKey: "analysis-key",
        character: makeCharacter(),
        monster: makeMonster(),
        combatSource: "regular_mob",
        startedAt: new Date("2026-06-21T10:00:00.000Z")
      })
    };

    const manual = recordCombatAnalyticsTurn(state, {
      action: "attack",
      heroOutcome: "hit",
      heroDamage: 5,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false
    });
    const updated = recordCombatAnalyticsTurn(manual, {
      action: "attack",
      actionOrigin: "timeout-auto-attack",
      heroOutcome: "hit",
      heroDamage: 6,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false
    });

    expect(updated.analytics?.totals).toMatchObject({
      playerActionsCount: 2,
      manualPlayerActionsCount: 1,
      timeoutAutoActionsCount: 1,
      timeoutSkipActionsCount: 0
    });
    expect(updated.analytics?.abilities[`manual:${BASIC_ATTACK_ABILITY_ID}`]).toMatchObject({
      actionOrigin: "manual",
      totalDamage: 5
    });
    expect(updated.analytics?.abilities[`timeout-auto-attack:${BASIC_ATTACK_ABILITY_ID}`]).toMatchObject({
      actionOrigin: "timeout-auto-attack",
      totalDamage: 6
    });
  });

  it("maps terminal combat statuses to report outcomes", () => {
    expect(mapCombatStatusToAnalyticsOutcome("won")).toBe("win");
    expect(mapCombatStatusToAnalyticsOutcome("lost")).toBe("loss");
    expect(mapCombatStatusToAnalyticsOutcome("fled")).toBe("fled");
    expect(mapCombatStatusToAnalyticsOutcome("expired")).toBe("timeout");
    expect(mapCombatStatusToAnalyticsOutcome("active")).toBeNull();
  });
});

function makeCharacter(): CharacterSummary {
  return {
    name: "Shannar",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Доцент Прикладного Туману",
    level: 12,
    xp: 0,
    nextLevelXp: 100,
    xpToNextLevel: 100,
    gold: 0,
    hpCurrent: 40,
    hpMax: 40,
    manaCurrent: 10,
    manaMax: 10,
    stats: {
      strength: 10,
      dexterity: 7,
      intelligence: 5,
      charisma: 6,
      luck: 4
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      stats: {
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      }
    },
    equipmentEffects: {
      hpMax: 0,
      manaMax: 0,
      armor: 1,
      resist: 0,
      weaponDamage: 2,
      spellPower: 0,
      stats: {
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      },
      contributions: []
    },
    remortCount: 2
  };
}

function makeMonster(): MonsterCombatStats {
  return {
    monsterId: "monster.rat",
    level: 10,
    hpMax: 20,
    attack: 5,
    armor: 0,
    resist: 0,
    dexterity: 5,
    tags: ["beast"]
  };
}
