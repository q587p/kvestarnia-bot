import { getLevelStartXp, type LevelProgressionOptions } from "./level";

export const STARTER_LEVEL_TWO_REWARD_FRACTION = 0.75;

export function buildStarterLevelTwoXpReward(
  options: LevelProgressionOptions = {}
): number {
  const levelOneStart = getLevelStartXp(1, options);
  const levelTwoStart = getLevelStartXp(2, options);
  const levelGap = Math.max(1, levelTwoStart - levelOneStart);

  return Math.ceil(levelGap * STARTER_LEVEL_TWO_REWARD_FRACTION);
}
