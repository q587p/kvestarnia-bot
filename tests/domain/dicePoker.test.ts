import { describe, expect, it } from "vitest";
import {
  compareQuickHands,
  evaluateQuickHand,
  resolveQuickDicePokerRound,
  scoreDicePokerCategory,
  scoreScorecardCategory,
  startQuickDicePoker,
  startScorecardDicePoker,
  totalScorecard
} from "../../src/domain/dicePoker";

describe("dicePoker", () => {
  it("ranks five of a kind by face value", () => {
    expect(compareQuickHands(
      evaluateQuickHand([6, 6, 6, 6, 6]),
      evaluateQuickHand([5, 5, 5, 5, 5])
    )).toBeGreaterThan(0);
  });

  it("ranks four of a kind above full house", () => {
    expect(compareQuickHands(
      evaluateQuickHand([2, 2, 2, 2, 6]),
      evaluateQuickHand([6, 6, 6, 5, 5])
    )).toBeGreaterThan(0);
  });

  it("ranks large straight above small straight", () => {
    expect(compareQuickHands(
      evaluateQuickHand([2, 3, 4, 5, 6]),
      evaluateQuickHand([1, 2, 3, 4, 5])
    )).toBeGreaterThan(0);
  });

  it("breaks full house ties by triple value before pair value", () => {
    expect(compareQuickHands(
      evaluateQuickHand([6, 6, 6, 1, 1]),
      evaluateQuickHand([5, 5, 5, 6, 6])
    )).toBeGreaterThan(0);
  });

  it("uses pair and two-pair tie breakers before kickers", () => {
    expect(compareQuickHands(
      evaluateQuickHand([6, 6, 4, 4, 1]),
      evaluateQuickHand([6, 6, 3, 3, 5])
    )).toBeGreaterThan(0);
    expect(compareQuickHands(
      evaluateQuickHand([5, 5, 6, 4, 3]),
      evaluateQuickHand([5, 5, 6, 4, 2])
    )).toBeGreaterThan(0);
  });

  it("returns exact equal evaluated hands as draws", () => {
    expect(compareQuickHands(
      evaluateQuickHand([6, 6, 4, 4, 1]),
      evaluateQuickHand([4, 6, 1, 6, 4])
    )).toBe(0);
  });

  it("caps repeated quick draw loops with a refund terminal state", () => {
    const result = resolveQuickDicePokerRound({
      ...startQuickDicePoker("draw-cap"),
      drawRound: 3,
      playerDice: [1, 2, 3, 4, 5],
      opponentDice: [1, 2, 3, 4, 5],
      selectedMask: 0
    }, "draw-cap");

    expect(result).toMatchObject({
      phase: "terminal",
      outcome: "refund",
      drawRound: 3
    });
  });

  it("scores upper boxes and chance", () => {
    const dice = [1, 1, 1, 3, 4];

    expect(scoreDicePokerCategory("ones", dice)).toBe(3);
    expect(scoreDicePokerCategory("threes", dice)).toBe(3);
    expect(scoreDicePokerCategory("chance", dice)).toBe(10);
  });

  it("scores triple and four of a kind boxes", () => {
    const dice = [2, 2, 2, 5, 6];

    expect(scoreDicePokerCategory("triple", dice)).toBe(17);
    expect(scoreDicePokerCategory("four_kind", dice)).toBe(0);
  });

  it("scores simplified full house without treating poker as full house", () => {
    expect(scoreDicePokerCategory("full_house", [2, 2, 5, 5, 5])).toBe(25);
    expect(scoreDicePokerCategory("poker", [4, 4, 4, 4, 4])).toBe(50);
    expect(scoreDicePokerCategory("full_house", [4, 4, 4, 4, 4])).toBe(0);
  });

  it("scores small and large straights", () => {
    expect(scoreDicePokerCategory("small_straight", [1, 3, 4, 5, 6])).toBe(30);
    expect(scoreDicePokerCategory("large_straight", [1, 2, 3, 4, 5])).toBe(40);
    expect(scoreDicePokerCategory("small_straight", [1, 2, 3, 4, 5])).toBe(30);
  });

  it("adds the upper bonus at exactly 63", () => {
    expect(totalScorecard({
      ones: 3,
      twos: 6,
      threes: 9,
      fours: 12,
      fives: 15,
      sixes: 18
    })).toEqual({
      upperTotal: 63,
      upperBonus: 35,
      total: 98
    });
  });

  it("does not score an already used scorecard category again", () => {
    const state = {
      ...startScorecardDicePoker("used-category"),
      dice: [1, 1, 1, 3, 4]
    };
    const next = scoreScorecardCategory(state, "ones", "used-category");
    const repeated = scoreScorecardCategory(next.phase === "scorecard-roll" ? next : state, "ones", "used-category");

    expect(repeated).toBe(next);
  });
});
