export const CELLAR_MIN_LEVEL = 2;
export const STARTER_ACTIVITY_MAX_LEVEL = 2;
export const CELLAR_MAX_LEVEL = 3;
export const HUNT_MIN_LEVEL = 3;
export const BESTIARY_MIN_LEVEL = 3;
export const FIGHTING_CORNER_MIN_LEVEL = 3;

export function meetsActivityLevel(level: number, requiredLevel: number): boolean {
  return Math.max(1, Math.floor(level)) >= requiredLevel;
}

export function isWithinActivityMaxLevel(level: number, maxLevel: number): boolean {
  return Math.max(1, Math.floor(level)) <= maxLevel;
}
