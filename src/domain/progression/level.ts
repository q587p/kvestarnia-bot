export const LEVEL_XP_THRESHOLDS = [0, 10, 25, 45, 70] as const;

export interface XpRewardResult {
  oldLevel: number;
  newLevel: number;
  oldXp: number;
  newXp: number;
  leveledUp: boolean;
}

export function getLevelForXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;

  for (let index = 0; index < LEVEL_XP_THRESHOLDS.length; index += 1) {
    const threshold = LEVEL_XP_THRESHOLDS[index];

    if (threshold !== undefined && safeXp >= threshold) {
      level = index + 1;
    }
  }

  return level;
}

export function getNextLevelThreshold(level: number): number | null {
  if (level < 1 || level >= LEVEL_XP_THRESHOLDS.length) {
    return null;
  }

  return LEVEL_XP_THRESHOLDS[level] ?? null;
}

export function applyXpReward(currentXp: number, xpReward: number): XpRewardResult {
  const oldXp = Math.max(0, Math.floor(currentXp));
  const newXp = Math.max(0, oldXp + Math.floor(xpReward));
  const oldLevel = getLevelForXp(oldXp);
  const newLevel = getLevelForXp(newXp);

  return {
    oldLevel,
    newLevel,
    oldXp,
    newXp,
    leveledUp: newLevel > oldLevel
  };
}
