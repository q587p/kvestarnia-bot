import type { CharacterSummary } from "../characters/characterSummary";
import type { StatKey } from "../characters/starterStats";

export interface ActivePriestBlessingBonus {
  bonusStat: string | null;
  bonusAmount: number;
  expiresAt?: Date | null;
}

export interface NormalizedPriestBlessingBonus {
  bonusStat: StatKey;
  bonusAmount: number;
}

export function normalizePriestBlessingBonus(
  blessing: ActivePriestBlessingBonus | null | undefined
): NormalizedPriestBlessingBonus | null {
  if (!blessing) {
    return null;
  }

  return {
    bonusStat: normalizePriestBlessingStat(blessing.bonusStat),
    bonusAmount: normalizePriestBlessingAmount(blessing.bonusAmount)
  };
}

export function applyPriestBlessingBonusToSummary(
  character: CharacterSummary,
  blessing: ActivePriestBlessingBonus | null | undefined,
  now?: Date
): CharacterSummary {
  if (blessing?.expiresAt && now && blessing.expiresAt <= now) {
    return character;
  }

  const normalized = normalizePriestBlessingBonus(blessing);
  if (!normalized || normalized.bonusAmount <= 0) {
    return character;
  }

  return {
    ...character,
    stats: {
      ...character.stats,
      [normalized.bonusStat]: character.stats[normalized.bonusStat] + normalized.bonusAmount
    }
  };
}

export function normalizePriestBlessingStat(value: string | null | undefined): StatKey {
  return value === "strength" ||
    value === "dexterity" ||
    value === "intelligence" ||
    value === "charisma" ||
    value === "luck"
    ? value
    : "luck";
}

function normalizePriestBlessingAmount(value: number): number {
  return value > 0 ? Math.floor(value) : 1;
}
