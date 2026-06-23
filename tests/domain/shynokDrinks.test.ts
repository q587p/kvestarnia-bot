import { describe, expect, it } from "vitest";
import {
  applyDrinkDamageMultiplier,
  buildDrinkEffect,
  buildShynokRecoveryWindows,
  createRoundReplacementGuard,
  getShynokDrinkDefinition,
  SHYNOK_ROUND_REPLACEMENT_GUARD_HEX_LENGTH,
  SHYNOK_DRINKS
} from "../../src/domain/shynokDrinks";

describe("Shynok drinks", () => {
  it("defines the approved drink catalog", () => {
    expect(SHYNOK_DRINKS.map((drink) => [drink.key, drink.priceGold, drink.durationMinutes])).toEqual([
      ["drink.thyme-tea", 17, 42],
      ["drink.simple-beer", 13, 23],
      ["drink.fine-beer", 42, 42],
      ["drink.pepper-vodka", 42, 23]
    ]);
    expect(getShynokDrinkDefinition("drink.simple-beer")).toMatchObject({
      recoveryMultiplierBp: 12500,
      accuracyPenaltyPp: 5
    });
    expect(getShynokDrinkDefinition("drink.pepper-vodka")).toMatchObject({
      phase: "queued",
      outgoingDamageMultiplierBp: 11300,
      incomingDamageMultiplierBp: 11300
    });
  });

  it("builds one timed or queued effect with server time", () => {
    const startedAt = new Date("2026-06-23T10:00:00.000Z");

    expect(buildDrinkEffect({ drinkKey: "drink.fine-beer", startedAt })).toMatchObject({
      phase: "timed",
      expiresAt: new Date("2026-06-23T10:42:00.000Z")
    });
    expect(buildDrinkEffect({ drinkKey: "drink.pepper-vodka", startedAt })).toMatchObject({
      phase: "queued",
      expiresAt: new Date("2026-06-23T10:23:00.000Z")
    });
  });

  it("uses floor 113 percent damage with a minimum of one for positive damage", () => {
    expect(applyDrinkDamageMultiplier(10, 11300)).toBe(11);
    expect(applyDrinkDamageMultiplier(1, 11300)).toBe(1);
    expect(applyDrinkDamageMultiplier(0, 11300)).toBe(0);
  });

  it("keeps previous timed recovery windows on queued replacement metadata", () => {
    const windows = buildShynokRecoveryWindows({
      drinkKey: "drink.pepper-vodka",
      phase: "queued",
      startedAt: new Date("2026-06-23T10:05:00.000Z"),
      expiresAt: new Date("2026-06-23T10:28:00.000Z"),
      metadata: {
        previousRecoveryWindows: [{
          drinkKey: "drink.simple-beer",
          startsAt: "2026-06-23T10:00:00.000Z",
          expiresAt: "2026-06-23T10:23:00.000Z"
        }]
      }
    });

    expect(windows).toEqual([{
      startsAt: new Date("2026-06-23T10:00:00.000Z"),
      expiresAt: new Date("2026-06-23T10:23:00.000Z"),
      multiplierBp: 12500
    }]);
  });

  it("builds compact deterministic round replacement guards", () => {
    const guard = createRoundReplacementGuard({
      offerId: "12345678-1234-4234-9234-123456789abc",
      drinkStateId: "drink-state-one"
    });

    expect(guard).toMatch(/^[0-9a-f]+$/);
    expect(guard).toHaveLength(SHYNOK_ROUND_REPLACEMENT_GUARD_HEX_LENGTH);
    expect(createRoundReplacementGuard({
      offerId: "12345678-1234-4234-9234-123456789abc",
      drinkStateId: "drink-state-one"
    })).toBe(guard);
    expect(createRoundReplacementGuard({
      offerId: "12345678-1234-4234-9234-123456789abc",
      drinkStateId: "drink-state-two"
    })).not.toBe(guard);
  });
});
