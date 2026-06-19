import { describe, expect, it } from "vitest";
import { resolveQuickDuel, type DuelistSummary } from "../../src/domain/duels/duelResolver";
import { createEmptyStats, prepareBalancedDuelists } from "../../src/domain/duels/duelBalance";
import { FakeRandomSource } from "../../src/shared/random";
import { buildStarterStats, type CharacterStats } from "../../src/domain/characters/starterStats";
import { buildPathStatBonus, type CharacterPath } from "../../src/domain/characters/path";
import { buildLevelGrowthBonus } from "../../src/domain/progression/effectiveStats";
import { buildRemortMemoryBonus, REMORT_REQUIRED_LEVEL } from "../../src/domain/remort";

describe("resolveQuickDuel", () => {
  it("resolves a replayable winner from prepared character summaries and bounded swing", () => {
    const result = resolveQuickDuel({
      challenger: makeDuelist({
        id: "challenger",
        level: 5,
        strength: 10,
        equipmentEffects: {
          hpMax: 0,
          manaMax: 0,
          armor: 0,
          resist: 0,
          weaponDamage: 4,
          spellPower: 0,
          stats: {
            strength: 0,
            dexterity: 0,
            intelligence: 0,
            charisma: 0,
            luck: 0
          },
          contributions: []
        }
      }),
      target: makeDuelist({ id: "target", level: 3, strength: 6 }),
      rng: new FakeRandomSource([0.5])
    });

    expect(result.outcome).toBe("challenger");
    expect(result.winnerCharacterId).toBe("challenger");
    expect(result.loserCharacterId).toBe("target");
    expect(result.challengerScore).toBeGreaterThan(result.targetScore);
    expect(result.balanceVersion).toBe("instant-duel-v2");
    expect(result.audit.challenger.originalLevel).toBe(5);
  });

  it("keeps same builds at the same progression symmetric under neutral RNG", () => {
    const result = resolveQuickDuel({
      challenger: makeCanonicalDuelist({ id: "challenger" }),
      target: makeCanonicalDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.5])
    });

    expect(result.outcome).toBe("draw");
    expect(result.winnerCharacterId).toBeNull();
    expect(result.flavorKey).toBe("dramatic-draw");
  });

  it("normalizes large level gaps without muting equipment effects", () => {
    const low = makeCanonicalDuelist({
      id: "low",
      level: 3,
      hpRatio: 0.5,
      manaRatio: 0.5,
      equipmentEffects: {
        hpMax: 0,
        manaMax: 0,
        armor: 0,
        resist: 0,
        weaponDamage: 5,
        spellPower: 0,
        stats: {
          strength: 0,
          dexterity: 0,
          intelligence: 0,
          charisma: 0,
          luck: 0
        },
        contributions: []
      }
    });
    const high = makeCanonicalDuelist({
      id: "high",
      level: 13
    });

    const prepared = prepareBalancedDuelists({ challenger: low, target: high });

    expect(prepared.challenger.balanceAudit.temporaryHpMax).toBeGreaterThan(0);
    expect(prepared.challenger.hpCurrent / prepared.challenger.hpMax).toBeCloseTo(0.5, 1);
    expect(prepared.challenger.equipmentEffects?.weaponDamage).toBe(5);
    expect(prepared.target.balanceAudit.temporaryHpMax).toBe(0);
    expect(prepared.target.hpMax).toBe(high.hpMax);
    expect(prepared.target.stats).toEqual(high.stats);
  });

  it("does not leave residual level-derived non-equipment stats after preparation", () => {
    const low = makeCanonicalDuelist({ id: "low", level: 3 });
    const high = makeCanonicalDuelist({ id: "high", level: 13 });

    const prepared = prepareBalancedDuelists({ challenger: low, target: high });

    expect(prepared.challenger.stats).toEqual(prepared.target.stats);
    expect(prepared.challenger.hpMax).toBe(prepared.target.hpMax);
    expect(prepared.challenger.manaMax).toBe(prepared.target.manaMax);
    expect(prepared.challenger.balanceAudit.preparedScore).toBe(
      prepared.target.balanceAudit.preparedScore
    );
  });

  it("normalizes remort memory across all stats without leaking non-primary growth", () => {
    const veteran = makeCanonicalDuelist({ id: "veteran", level: 13, remortCount: 4 });
    const newer = makeCanonicalDuelist({ id: "newer", level: 13, remortCount: 0 });
    const prepared = prepareBalancedDuelists({ challenger: veteran, target: newer });

    expect(prepared.target.balanceAudit.temporaryHpMax).toBeGreaterThan(0);
    expect(prepared.challenger.balanceAudit.temporaryHpMax).toBe(0);
    expect(prepared.challenger.stats).toEqual(prepared.target.stats);
    expect(prepared.challenger.balanceAudit.preparedScore).toBe(prepared.target.balanceAudit.preparedScore);
  });

  it("keeps each class on its own growth profile during progression normalization", () => {
    const warrior = makeCanonicalDuelist({
      id: "warrior",
      level: 3,
      classId: "class.warrior",
      className: "Воїн"
    });
    const mage = makeCanonicalDuelist({
      id: "mage",
      level: 13,
      classId: "class.mage",
      className: "Маг"
    });

    const prepared = prepareBalancedDuelists({ challenger: warrior, target: mage });

    expect(prepared.challenger.balanceAudit.targetProgressionBudget.stats.strength).toBeGreaterThan(
      prepared.challenger.balanceAudit.targetProgressionBudget.stats.intelligence
    );
    expect(prepared.target.balanceAudit.targetProgressionBudget.stats.intelligence).toBeGreaterThan(
      prepared.target.balanceAudit.targetProgressionBudget.stats.strength
    );
    expect(prepared.challenger.balanceAudit.targetProgressionBudget.stats).not.toEqual(
      prepared.target.balanceAudit.targetProgressionBudget.stats
    );
  });

  it("applies a capped readiness penalty from current HP and mana ratios", () => {
    const result = resolveQuickDuel({
      challenger: makeDuelist({ id: "rested", hpCurrent: 32, hpMax: 32, manaCurrent: 16, manaMax: 16 }),
      target: makeDuelist({ id: "tired", hpCurrent: 0, hpMax: 32, manaCurrent: 0, manaMax: 16 }),
      rng: new FakeRandomSource([0.5])
    });

    expect(result.audit.challenger.readinessPenalty).toBe(0);
    expect(result.audit.target.readinessPenalty).toBe(12);
  });
});

interface CanonicalDuelistOptions {
  id: string;
  level?: number;
  remortCount?: number;
  classId?: string;
  className?: string;
  raceId?: string;
  raceName?: string;
  path?: CharacterPath;
  hpRatio?: number;
  manaRatio?: number;
  equipmentEffects?: DuelistSummary["equipmentEffects"];
}

function makeCanonicalDuelist(options: CanonicalDuelistOptions): DuelistSummary {
  const classId = options.classId ?? "class.warrior";
  const raceId = options.raceId ?? "race.human-ish";
  const path = options.path ?? "boundary";
  const level = options.level ?? 3;
  const remortCount = options.remortCount ?? 0;
  const starter = buildStarterStats(raceId, classId);
  const pathBonus = buildPathStatBonus(path);
  const levelGrowth = buildLevelGrowthBonus(1, level, classId, raceId, path);
  const remortGrowth = buildLevelGrowthBonus(1, REMORT_REQUIRED_LEVEL, classId, raceId, path);
  const remortStats = mapStats(remortGrowth.stats, (value) =>
    buildRemortMemoryBonus(value, remortCount)
  );
  const equipmentEffects = options.equipmentEffects ?? {
    hpMax: 0,
    manaMax: 0,
    armor: 0,
    resist: 0,
    weaponDamage: 0,
    spellPower: 0,
    stats: createEmptyStats(),
    contributions: []
  };
  const stats = addStats(
    addStats(addStats(starter.stats, pathBonus), levelGrowth.stats),
    addStats(remortStats, equipmentEffects.stats)
  );
  const hpMax =
    starter.hpMax +
    levelGrowth.hpMax +
    buildRemortMemoryBonus(remortGrowth.hpMax, remortCount) +
    equipmentEffects.hpMax;
  const manaMax =
    starter.manaMax +
    levelGrowth.manaMax +
    buildRemortMemoryBonus(remortGrowth.manaMax, remortCount) +
    equipmentEffects.manaMax;

  return makeDuelist({
    id: options.id,
    level,
    remortCount,
    classId,
    className: options.className ?? "Воїн",
    raceId,
    raceName: options.raceName ?? "Людисько",
    path,
    hpMax,
    hpCurrent: Math.round(hpMax * (options.hpRatio ?? 1)),
    manaMax,
    manaCurrent: Math.round(manaMax * (options.manaRatio ?? 1)),
    stats,
    equipmentEffects,
    levelBonus: levelGrowth
  });
}

function makeDuelist(
  overrides: Partial<DuelistSummary> & { strength?: number } = {}
): DuelistSummary {
  const strength = overrides.strength ?? 7;

  return {
    id: overrides.id ?? "duelist",
    name: overrides.name ?? "Пригодник",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Той, хто тестує",
    level: overrides.level ?? 3,
    xp: 25,
    nextLevelXp: 45,
    xpToNextLevel: 20,
    gold: 0,
    hpCurrent: 24,
    hpMax: 28,
    manaCurrent: 12,
    manaMax: 14,
    stats: {
      strength,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    levelBonus: {
      hpMax: 8,
      manaMax: 4,
      stats: {
        strength: 2,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      },
      primaryStat: {
        stat: "strength",
        bonus: 2
      }
    },
    ...overrides
  };
}

function addStats(left: CharacterStats, right: CharacterStats): CharacterStats {
  return mapStats(left, (value, stat) => value + right[stat]);
}

function mapStats(
  stats: CharacterStats,
  mapper: (value: number, stat: keyof CharacterStats) => number
): CharacterStats {
  return {
    strength: mapper(stats.strength, "strength"),
    dexterity: mapper(stats.dexterity, "dexterity"),
    intelligence: mapper(stats.intelligence, "intelligence"),
    charisma: mapper(stats.charisma, "charisma"),
    luck: mapper(stats.luck, "luck")
  };
}

