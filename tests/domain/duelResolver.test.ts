import { describe, expect, it } from "vitest";
import { resolveQuickDuel, type DuelistSummary } from "../../src/domain/duels/duelResolver";
import { prepareBalancedDuelists } from "../../src/domain/duels/duelBalance";
import { FakeRandomSource } from "../../src/shared/random";

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

  it("can produce a funny draw when the scores are close", () => {
    const result = resolveQuickDuel({
      challenger: makeDuelist({ id: "challenger" }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.5])
    });

    expect(result.outcome).toBe("draw");
    expect(result.winnerCharacterId).toBeNull();
    expect(result.flavorKey).toBe("dramatic-draw");
  });

  it("normalizes large level gaps without muting equipment effects", () => {
    const low = makeDuelist({
      id: "low",
      level: 3,
      hpCurrent: 16,
      hpMax: 32,
      manaCurrent: 8,
      manaMax: 16,
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
    const high = makeDuelist({
      id: "high",
      level: 13,
      hpCurrent: 68,
      hpMax: 68,
      manaCurrent: 36,
      manaMax: 36
    });

    const prepared = prepareBalancedDuelists({ challenger: low, target: high });

    expect(prepared.challenger.balanceAudit.temporaryHpMax).toBeGreaterThan(0);
    expect(prepared.challenger.hpCurrent / prepared.challenger.hpMax).toBeCloseTo(0.5, 1);
    expect(prepared.challenger.equipmentEffects?.weaponDamage).toBe(5);
    expect(prepared.target.balanceAudit.temporaryHpMax).toBe(0);
    expect(prepared.target.hpMax).toBe(high.hpMax);
  });

  it("normalizes remort budget and does not leak raw displayed level into score", () => {
    const veteran = makeDuelist({ id: "veteran", level: 13, remortCount: 3 });
    const newer = makeDuelist({ id: "newer", level: 13, remortCount: 0 });
    const prepared = prepareBalancedDuelists({ challenger: veteran, target: newer });

    expect(prepared.target.balanceAudit.temporaryHpMax).toBeGreaterThan(0);
    expect(prepared.challenger.balanceAudit.temporaryHpMax).toBe(0);
    expect(prepared.challenger.balanceAudit.targetProgressionBudget.score).toBe(
      prepared.target.balanceAudit.targetProgressionBudget.score
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

