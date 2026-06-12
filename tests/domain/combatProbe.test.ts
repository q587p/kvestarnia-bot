import { describe, expect, it } from "vitest";
import { runCombatProbe } from "../../src/domain/combat/combatProbe";

const heroStats = {
  strength: 9,
  dexterity: 6,
  intelligence: 8,
  charisma: 8,
  luck: 6
};

describe("combat probe", () => {
  it("resolves attack deterministically without killing the hero", () => {
    expect(
      runCombatProbe({
        heroLevel: 2,
        heroStats,
        heroHpCurrent: 22,
        heroHpMax: 22,
        action: "attack"
      })
    ).toEqual({
      action: "attack",
      playerHpPreview: 19,
      playerHpMaxPreview: 22,
      enemyHpPreview: 4,
      enemyHpMaxPreview: 14,
      playerDamage: 10,
      enemyDamage: 3,
      outcome: "win"
    });
  });

  it("resolves receipt as a messy win", () => {
    expect(
      runCombatProbe({
        heroLevel: 2,
        heroStats,
        heroHpCurrent: 22,
        heroHpMax: 22,
        action: "receipt"
      })
    ).toMatchObject({
      action: "receipt",
      playerHpPreview: 20,
      enemyHpPreview: 6,
      playerDamage: 8,
      enemyDamage: 2,
      outcome: "messy-win"
    });
  });

  it("lets the hero flee without damage", () => {
    expect(
      runCombatProbe({
        heroLevel: 2,
        heroStats,
        heroHpCurrent: 1,
        heroHpMax: 22,
        action: "flee"
      })
    ).toMatchObject({
      action: "flee",
      playerHpPreview: 1,
      enemyHpPreview: 14,
      playerDamage: 0,
      enemyDamage: 0,
      outcome: "flee"
    });
  });
});
