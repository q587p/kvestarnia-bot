import { describe, expect, it } from "vitest";
import { resolveQuickDuel, type DuelistSummary } from "../../src/domain/duels/duelResolver";
import { FakeRandomSource } from "../../src/shared/random";

describe("resolveQuickDuel", () => {
  it("resolves a replayable winner from character summaries and bounded swing", () => {
    const result = resolveQuickDuel({
      challenger: makeDuelist({ id: "challenger", level: 5, strength: 10 }),
      target: makeDuelist({ id: "target", level: 3, strength: 6 }),
      rng: new FakeRandomSource([0.5])
    });

    expect(result.outcome).toBe("challenger");
    expect(result.winnerCharacterId).toBe("challenger");
    expect(result.loserCharacterId).toBe("target");
    expect(result.challengerScore).toBeGreaterThan(result.targetScore);
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
      stat: "strength",
      statBonus: 2
    },
    ...overrides
  };
}

