import type { LevelBonus } from "../../domain/progression/effectiveStats";
import { buildLevelGrowthBonus } from "../../domain/progression/effectiveStats";
import type { RewardLevelChange } from "../../db/repositories/dailyActionRepository";
import type { StatKey } from "../../domain/characters/starterStats";

const STAT_LABELS: Record<StatKey, string> = {
  strength: "Сили",
  dexterity: "Спритності",
  intelligence: "Розуму",
  charisma: "Харизми",
  luck: "Вдачі"
};

export function presentLevelBonus(bonus: LevelBonus): string | null {
  const parts = [`+${bonus.hpMax} HP`, `+${bonus.manaMax} мани`];

  if (bonus.primaryStat && bonus.primaryStat.bonus > 0) {
    parts.push(`+${bonus.primaryStat.bonus} ${STAT_LABELS[bonus.primaryStat.stat]}`);
  }

  if (bonus.hpMax <= 0 && bonus.manaMax <= 0 && parts.length <= 2) {
    return null;
  }

  return parts.join(" · ");
}

export function presentRewardLevelGrowth(
  levelChange: RewardLevelChange,
  classId: string
): string[] {
  if (!levelChange.leveledUp) {
    return [];
  }

  const growth = presentLevelBonus(
    buildLevelGrowthBonus(levelChange.oldLevel, levelChange.newLevel, classId)
  );
  const lines = [`Рівень підріс: ${levelChange.oldLevel} → ${levelChange.newLevel}`];

  if (growth) {
    lines.push(`Стало краще: ${growth}`);
  }

  return lines;
}
