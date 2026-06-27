import { describe, expect, it } from "vitest";
import {
  buildCompletedProblemQuestBranchProgress,
  buildProblemQuestProgress,
  getProblemQuestStage,
  PROBLEM_QUEST_STAGES,
  resolveCurrentProblemQuestStage,
  type ProblemQuestStageRecord
} from "../../../src/services/fight/problemQuest";

describe("problem quest helpers", () => {
  it("keeps the authored problem stage chain stable", () => {
    expect(PROBLEM_QUEST_STAGES.map((stage) => ({
      id: stage.id,
      target: stage.target,
      nextStageId: stage.nextStageId,
      reward: stage.reward
    }))).toEqual([
      {
        id: "13",
        target: 13,
        nextStageId: "23",
        reward: {
          xp: 35,
          gold: 10,
          itemId: "item.badge-of-thirteen-small-problems"
        }
      },
      {
        id: "23",
        target: 23,
        nextStageId: "42",
        reward: {
          xp: 55,
          gold: 18,
          itemId: "item.apophenia-receipt-of-twenty-three"
        }
      },
      {
        id: "42",
        target: 42,
        nextStageId: "93",
        reward: {
          xp: 90,
          gold: 30,
          itemId: "item.towel-of-forty-two-answers"
        }
      },
      {
        id: "93",
        target: 93,
        nextStageId: null,
        reward: {
          xp: 140,
          gold: 45,
          itemId: "item.poster-of-ninety-three-problem-wills"
        }
      }
    ]);
  });

  it("selects the first unissued stage by default", () => {
    expect(resolveCurrentProblemQuestStage(records())).toEqual({
      branchComplete: false,
      stage: getProblemQuestStage("13"),
      issuedAt: null
    });
  });

  it("keeps an active issued stage until its reward is claimed", () => {
    const issuedAt = new Date("2026-06-27T10:00:00.000Z");

    expect(resolveCurrentProblemQuestStage(records({
      "23": { issuedAt }
    }))).toEqual({
      branchComplete: false,
      stage: getProblemQuestStage("23"),
      issuedAt
    });
  });

  it("waits on the rewarded stage until the next stage is issued", () => {
    const issuedAt = new Date("2026-06-27T10:00:00.000Z");

    expect(resolveCurrentProblemQuestStage(records({
      "13": { issuedAt, rewarded: true }
    }))).toEqual({
      branchComplete: false,
      stage: getProblemQuestStage("13"),
      issuedAt
    });
  });

  it("marks the branch complete after the final stage reward", () => {
    expect(resolveCurrentProblemQuestStage(records({
      "93": { issuedAt: new Date("2026-06-27T10:00:00.000Z"), rewarded: true }
    }))).toEqual({ branchComplete: true });
    expect(buildCompletedProblemQuestBranchProgress()).toMatchObject({
      stageId: "93",
      completed: true,
      rewardClaimed: true,
      issued: true,
      branchComplete: true
    });
  });

  it("builds progress flags without repository state", () => {
    expect(buildProblemQuestProgress({
      stage: getProblemQuestStage("13"),
      wins: 13,
      rewardClaimed: false,
      issued: true
    })).toMatchObject({
      stageId: "13",
      wins: 13,
      target: 13,
      completed: true,
      rewardClaimed: false,
      issued: true,
      branchComplete: false
    });

    expect(buildProblemQuestProgress({
      stage: getProblemQuestStage("23"),
      wins: 0,
      rewardClaimed: true,
      issued: false
    })).toMatchObject({
      stageId: "23",
      completed: true,
      rewardClaimed: true,
      issued: true
    });
  });
});

function records(overrides: Partial<Record<string, {
  issuedAt?: Date | null;
  rewarded?: boolean;
}>> = {}): ProblemQuestStageRecord[] {
  return PROBLEM_QUEST_STAGES.map((stage) => ({
    stage,
    issuedAt: overrides[stage.id]?.issuedAt ?? null,
    rewarded: overrides[stage.id]?.rewarded ?? false
  }));
}
