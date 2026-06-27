import {
  PROBLEM_QUEST_13_ISSUED_KEY,
  PROBLEM_QUEST_13_REWARD_KEY,
  PROBLEM_QUEST_23_ISSUED_KEY,
  PROBLEM_QUEST_23_REWARD_KEY,
  PROBLEM_QUEST_42_ISSUED_KEY,
  PROBLEM_QUEST_42_REWARD_KEY,
  PROBLEM_QUEST_93_ISSUED_KEY,
  PROBLEM_QUEST_93_REWARD_KEY
} from "../dailyActionKeys";
import {
  APOPHENIA_RECEIPT_OF_TWENTY_THREE_ITEM_ID,
  BADGE_OF_THIRTEEN_SMALL_PROBLEMS_ITEM_ID,
  POSTER_OF_NINETY_THREE_PROBLEM_WILLS_ITEM_ID,
  TOWEL_OF_FORTY_TWO_ANSWERS_ITEM_ID
} from "../itemGrant";

export const THIRTEEN_SMALL_PROBLEMS_QUEST_KEY = PROBLEM_QUEST_13_REWARD_KEY;
export const THIRTEEN_SMALL_PROBLEMS_QUEST_BUCKET = "once";
export const THIRTEEN_SMALL_PROBLEMS_TARGET_WINS = 13;
export const THIRTEEN_SMALL_PROBLEMS_REWARD = {
  xp: 35,
  gold: 10
};
export const PROBLEM_QUEST_REQUIRED_LEVEL = 2;
export const PROBLEM_QUEST_BUCKET = "once";

export type ProblemQuestStageId = "13" | "23" | "42" | "93";

export interface ProblemQuestStage {
  id: ProblemQuestStageId;
  title: string;
  target: number;
  reward: {
    xp: number;
    gold: number;
    itemId: string;
  };
  issueKey: string;
  rewardKey: string;
  nextStageId: ProblemQuestStageId | null;
}

export interface ProblemQuestProgress {
  stageId: ProblemQuestStageId;
  title: string;
  wins: number;
  target: number;
  completed: boolean;
  rewardClaimed: boolean;
  issued: boolean;
  branchComplete: boolean;
}

export interface ProblemQuestStageRecord {
  stage: ProblemQuestStage;
  issuedAt: Date | null;
  rewarded: boolean;
}

export type CurrentProblemQuestStageState =
  | { branchComplete: true }
  | { branchComplete: false; stage: ProblemQuestStage; issuedAt: Date | null };

export const PROBLEM_QUEST_STAGES: ProblemQuestStage[] = [
  {
    id: "13",
    title: "Тринадцять дрібних проблем",
    target: THIRTEEN_SMALL_PROBLEMS_TARGET_WINS,
    reward: {
      ...THIRTEEN_SMALL_PROBLEMS_REWARD,
      itemId: BADGE_OF_THIRTEEN_SMALL_PROBLEMS_ITEM_ID
    },
    issueKey: PROBLEM_QUEST_13_ISSUED_KEY,
    rewardKey: PROBLEM_QUEST_13_REWARD_KEY,
    nextStageId: "23"
  },
  {
    id: "23",
    title: "Двадцять три підозрілі проблеми",
    target: 23,
    reward: {
      xp: 55,
      gold: 18,
      itemId: APOPHENIA_RECEIPT_OF_TWENTY_THREE_ITEM_ID
    },
    issueKey: PROBLEM_QUEST_23_ISSUED_KEY,
    rewardKey: PROBLEM_QUEST_23_REWARD_KEY,
    nextStageId: "42"
  },
  {
    id: "42",
    title: "Сорок дві відповіді на проблеми",
    target: 42,
    reward: {
      xp: 90,
      gold: 30,
      itemId: TOWEL_OF_FORTY_TWO_ANSWERS_ITEM_ID
    },
    issueKey: PROBLEM_QUEST_42_ISSUED_KEY,
    rewardKey: PROBLEM_QUEST_42_REWARD_KEY,
    nextStageId: "93"
  },
  {
    id: "93",
    title: "Девʼяносто три волі до проблем",
    target: 93,
    reward: {
      xp: 140,
      gold: 45,
      itemId: POSTER_OF_NINETY_THREE_PROBLEM_WILLS_ITEM_ID
    },
    issueKey: PROBLEM_QUEST_93_ISSUED_KEY,
    rewardKey: PROBLEM_QUEST_93_REWARD_KEY,
    nextStageId: null
  }
];

export function getProblemQuestStage(stageId: ProblemQuestStageId): ProblemQuestStage {
  const stage = PROBLEM_QUEST_STAGES.find((candidate) => candidate.id === stageId);

  if (!stage) {
    throw new Error(`Unknown problem quest stage: ${stageId}`);
  }

  return stage;
}

export function buildProblemQuestProgress(input: {
  stage: ProblemQuestStage;
  wins: number;
  rewardClaimed: boolean;
  issued: boolean;
}): ProblemQuestProgress {
  return {
    stageId: input.stage.id,
    title: input.stage.title,
    wins: input.wins,
    target: input.stage.target,
    completed: input.rewardClaimed || input.wins >= input.stage.target,
    rewardClaimed: input.rewardClaimed,
    issued: input.issued || input.rewardClaimed,
    branchComplete: false
  };
}

export function buildCompletedProblemQuestProgress(stage: ProblemQuestStage): ProblemQuestProgress {
  return {
    stageId: stage.id,
    title: stage.title,
    wins: stage.target,
    target: stage.target,
    completed: true,
    rewardClaimed: true,
    issued: true,
    branchComplete: false
  };
}

export function buildCompletedProblemQuestBranchProgress(): ProblemQuestProgress {
  return {
    ...buildCompletedProblemQuestProgress(getProblemQuestStage("93")),
    branchComplete: true
  };
}

export function resolveCurrentProblemQuestStage(
  stageRecords: ProblemQuestStageRecord[]
): CurrentProblemQuestStageState {
  if (stageRecords.at(-1)?.rewarded) {
    return { branchComplete: true };
  }

  const activeStage = stageRecords.find(({ issuedAt, rewarded }) => issuedAt && !rewarded);

  if (activeStage) {
    return {
      branchComplete: false,
      stage: activeStage.stage,
      issuedAt: activeStage.issuedAt
    };
  }

  for (let index = stageRecords.length - 1; index >= 0; index -= 1) {
    const record = stageRecords[index];
    if (!record?.rewarded || !record.stage.nextStageId) {
      continue;
    }

    const nextRecord = stageRecords.find(
      (candidate) => candidate.stage.id === record.stage.nextStageId
    );

    if (!nextRecord?.issuedAt) {
      return {
        branchComplete: false,
        stage: record.stage,
        issuedAt: record.issuedAt
      };
    }
  }

  return { branchComplete: false, stage: getProblemQuestStage("13"), issuedAt: null };
}
