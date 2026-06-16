export const LEVEL_XP_THRESHOLDS = [0, 10, 25, 45, 70, 110, 160, 225, 305, 450, 650, 900, 1300] as const;

export interface XpRewardResult {
  oldLevel: number;
  newLevel: number;
  oldXp: number;
  newXp: number;
  leveledUp: boolean;
}

export interface LevelProgressionOptions {
  remortCount?: number;
}

export function getLevelForXp(xp: number, options: LevelProgressionOptions = {}): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;

  for (let index = 0; index < LEVEL_XP_THRESHOLDS.length; index += 1) {
    const threshold = getLevelStartXp(index + 1, options);

    if (threshold !== undefined && safeXp >= threshold) {
      level = index + 1;
    }
  }

  return level;
}

export function getNextLevelThreshold(level: number, options: LevelProgressionOptions = {}): number | null {
  if (level < 1 || level >= LEVEL_XP_THRESHOLDS.length) {
    return null;
  }

  return getLevelStartXp(level + 1, options);
}

export function getLevelStartXp(level: number, options: LevelProgressionOptions = {}): number {
  const normalizedLevel = Math.max(1, Math.floor(level));
  const baseThreshold = LEVEL_XP_THRESHOLDS[normalizedLevel - 1] ?? LEVEL_XP_THRESHOLDS[LEVEL_XP_THRESHOLDS.length - 1] ?? 0;

  return baseThreshold + getRemortXpExtraTotal(normalizedLevel, options.remortCount ?? 0);
}

export function getRemortXpExtraTotal(level: number, remortCount: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  const safeRemorts = Math.max(0, Math.floor(remortCount));

  if (safeRemorts <= 0 || safeLevel <= 1) {
    return 0;
  }

  const progress = (Math.min(safeLevel, LEVEL_XP_THRESHOLDS.length) - 1) / (LEVEL_XP_THRESHOLDS.length - 1);

  return Math.round(safeRemorts * 1000 * progress * progress);
}

export function applyXpReward(
  currentXp: number,
  xpReward: number,
  options: LevelProgressionOptions = {}
): XpRewardResult {
  const oldXp = Math.max(0, Math.floor(currentXp));
  const newXp = Math.max(0, oldXp + Math.floor(xpReward));
  const oldLevel = getLevelForXp(oldXp, options);
  const newLevel = getLevelForXp(newXp, options);

  return {
    oldLevel,
    newLevel,
    oldXp,
    newXp,
    leveledUp: newLevel > oldLevel
  };
}
