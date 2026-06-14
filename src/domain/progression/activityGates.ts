export const CELLAR_MIN_LEVEL = 2;
export const HUNT_MIN_LEVEL = 3;

export function meetsActivityLevel(level: number, requiredLevel: number): boolean {
  return Math.max(1, Math.floor(level)) >= requiredLevel;
}
