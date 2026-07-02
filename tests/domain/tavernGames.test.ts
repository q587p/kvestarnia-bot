import { describe, expect, it } from "vitest";
import {
  matchesKostiSign,
  rankKostiHand,
  resolveKosti,
  resolveTavlei,
  type TavernGamePlayer
} from "../../src/domain/tavernGames";

describe("tavernGames", () => {
  it("resolves Tavlei deterministically and conserves the winner pot", () => {
    const input = {
      seed: "tavlei-fixed",
      stakeGold: 5,
      players: [
        player("left", { decision: { gameKey: "tavlei", tactic: "quiet_trap" } }),
        player("right", { decision: { gameKey: "tavlei", tactic: "sharp_opening" } })
      ]
    } as const;

    const first = resolveTavlei(input);
    const replay = resolveTavlei(input);

    expect(replay).toEqual(first);
    expect(first.potGold).toBe(10);
    if (first.outcome === "win") {
      expect(Object.values(first.payouts).reduce((sum, value) => sum + value, 0)).toBe(10);
      expect(first.refunds).toEqual({});
    }
  });

  it("can draw Tavlei and refund both equal stakes", () => {
    const players = [
      player("left", { decision: { gameKey: "tavlei", tactic: "careful_defense" } }),
      player("right", { decision: { gameKey: "tavlei", tactic: "careful_defense" } })
    ];
    const result = Array.from({ length: 200 }, (_, index) =>
      resolveTavlei({ seed: `draw-seed-${index}`, stakeGold: 3, players })
    ).find((entry) => entry.outcome === "draw");

    expect(result).toBeDefined();
    expect(result?.refunds).toEqual({ left: 3, right: 3 });
  });

  it("ranks Kosti hands and detects signs", () => {
    expect(rankKostiHand([6, 6, 6, 6, 6]).label).toBe("five_kind");
    expect(rankKostiHand([2, 3, 4, 5, 6]).label).toBe("straight");
    expect(rankKostiHand([4, 4, 4, 4, 1]).label).toBe("four_kind");
    expect(rankKostiHand([3, 3, 3, 2, 2]).label).toBe("full_house");
    expect(rankKostiHand([5, 5, 5, 2, 1]).label).toBe("triple");
    expect(rankKostiHand([6, 6, 4, 4, 1]).label).toBe("two_pairs");

    expect(matchesKostiSign("two_pairs", [6, 6, 4, 4, 1])).toBe(true);
    expect(matchesKostiSign("triple", [5, 5, 5, 2, 1])).toBe(true);
    expect(matchesKostiSign("high_hand", [6, 6, 5, 4, 2])).toBe(true);
    expect(matchesKostiSign("straight", [1, 2, 3, 4, 5])).toBe(true);
    expect(matchesKostiSign("tower", [4, 4, 4, 4, 1])).toBe(true);
    expect(matchesKostiSign("no_sign", [6, 6, 6, 6, 6])).toBe(false);
  });

  it("splits Kosti main and sign pools without minting gold", () => {
    const result = resolveKosti({
      seed: "kosti-fixed",
      stakeGold: 5,
      players: [
        player("one", { decision: { gameKey: "kosti", style: "steady", sign: "no_sign" } }),
        player("two", { decision: { gameKey: "kosti", style: "push", sign: "high_hand" } }),
        player("three", { decision: { gameKey: "kosti", style: "sign_hunter", sign: "triple" } })
      ]
    });

    expect(result.potGold).toBe(15);
    expect(result.mainPoolGold + result.signPoolGold).toBe(15);
    expect(Object.values(result.payouts).reduce((sum, value) => sum + value, 0)).toBe(15);
    expect(result.refunds).toEqual({});
  });
});

function player(
  id: string,
  overrides: Partial<TavernGamePlayer> = {}
): TavernGamePlayer {
  return {
    participantId: `participant-${id}`,
    characterId: id,
    name: id,
    level: 5,
    stats: {
      intelligence: 7,
      luck: 6
    },
    stakeGold: 5,
    ...overrides
  };
}
