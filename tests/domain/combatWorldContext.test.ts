import { describe, expect, it } from "vitest";
import { monsters } from "../../src/content";
import {
  applyMonsterContextToStats,
  buildCombatWorldContext,
  deriveMonsterCombatStats,
  resolveMonsterContext
} from "../../src/domain/combat";

describe("combat world context", () => {
  it("freezes a Europe/Kyiv context snapshot for a fight start", () => {
    const world = buildCombatWorldContext({
      now: new Date("2026-06-20T09:00:00.000Z"),
      partySize: 1,
      locationTags: ["korchma", "nyz"]
    });

    expect(world).toMatchObject({
      version: 1,
      timezone: "Europe/Kyiv",
      localDate: "2026-06-20",
      dayPhase: "day",
      weekKind: "weekend",
      mealWindow: "lunch",
      season: "summer",
      partySizeBand: "solo"
    });
    expect(world.localStartedAt).toBe("2026-06-20T12:00:00[Europe/Kyiv]");
  });

  it("applies at most two contextual traits without changing authored rewards or eligibility", () => {
    const monster = monsters.find((candidate) => candidate.id === "monster.stamp-doorkeeper-skeleton");
    expect(monster).toBeDefined();

    const context = resolveMonsterContext({
      monster: monster!,
      world: buildCombatWorldContext({
        now: new Date("2026-06-19T23:30:00.000Z"),
        partySize: 1,
        locationTags: ["korchma", "nyz"]
      })
    });

    expect(context).toBeDefined();
    expect(context?.traitIds.length).toBeLessThanOrEqual(2);
    expect(context?.world.localDate).toBe("2026-06-20");
    expect(context?.effects.outgoingDamageMultiplier).toBeGreaterThan(1);

    const stats = applyMonsterContextToStats(deriveMonsterCombatStats(monster!), context);

    expect(stats.contextModifiers?.outgoingDamageMultiplier).toBeGreaterThan(1);
    expect(stats.debugTrace?.contextRulesVersion).toBe("monster-context-v1");
    expect(monster).not.toHaveProperty("contextTraitIds");
  });

  it("keeps starter contextual bonuses flavor-only", () => {
    const monster = monsters.find((candidate) => candidate.id === "monster.mimic-shawarma");
    expect(monster).toBeDefined();

    const context = resolveMonsterContext({
      monster: monster!,
      world: buildCombatWorldContext({
        now: new Date("2026-06-20T10:30:00.000Z"),
        partySize: 1,
        locationTags: ["korchma"]
      })
    });

    expect(context).toBeDefined();
    expect(context?.effects).toMatchObject({
      outgoingDamageMultiplier: 1,
      incomingDamageMultiplier: 1,
      accuracyDeltaPp: 0,
      evasionDeltaPp: 0
    });
  });
});
