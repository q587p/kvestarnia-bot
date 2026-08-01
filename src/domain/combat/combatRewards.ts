import type { RandomSource } from "../../shared/random";

export function buildBaselinePersistentFightWinXp(input: {
  characterLevel: number;
  baseMonsterLevel: number;
  effectiveMonsterLevel: number;
}): number {
  const antiFarmGap = input.characterLevel - input.baseMonsterLevel;

  if (antiFarmGap > 3) {
    return 2;
  }

  if (antiFarmGap > 2) {
    return 3;
  }

  return Math.min(14, Math.max(5, 3 + input.effectiveMonsterLevel * 2));
}

export function buildPersistentFightWinGold(
  characterLevel: number,
  rng: RandomSource
): number {
  return rng.nextInt(0, Math.max(0, Math.floor(characterLevel)));
}
