import type { LevelBonus } from "../../domain/progression/effectiveStats";
import { buildLevelGrowthBonus } from "../../domain/progression/effectiveStats";
import { LEVEL_XP_THRESHOLDS } from "../../domain/progression/level";
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

export function presentLevelUpCelebration(
  levelChange: RewardLevelChange,
  classId: string
): string | null {
  if (!levelChange.leveledUp) {
    return null;
  }

  if (levelChange.newLevel >= LEVEL_XP_THRESHOLDS.length) {
    return presentLevelCapCelebration(levelChange, classId);
  }

  const growth = presentLevelBonus(
    buildLevelGrowthBonus(levelChange.oldLevel, levelChange.newLevel, classId)
  );
  const lines = [
    "🎉 Рівень підріс!",
    "",
    `✨ <b>${levelChange.oldLevel} → ${levelChange.newLevel}</b>`
  ];

  if (growth) {
    lines.push(`📈 Стало краще: <b>${growth}</b>`);
  }

  lines.push("", "Корчма робить вигляд, що так і планувала.");

  return lines.join("\n");
}

function presentLevelCapCelebration(
  levelChange: RewardLevelChange,
  classId: string
): string {
  const growth = presentLevelBonus(
    buildLevelGrowthBonus(levelChange.oldLevel, levelChange.newLevel, classId)
  );
  const lines = [
    "🏆 Ви дісталися вершини поточної Квестарні!",
    "",
    `✨ <b>${levelChange.oldLevel} → ${levelChange.newLevel}</b>`,
    "Вітаємо: ви виграли гру. Принаймні ту її частину, яку корчмар уже встиг пришити до реальності."
  ];

  if (growth) {
    lines.push("", `📈 Останній ріст: <b>${growth}</b>`);
  }

  lines.push(
    "",
    "Корчма аплодує, Бочка робить вигляд, що не плаче піною.",
    "",
    "Хочете перевірити, як воно грається за когось іншого? /restart відкриє новий журнал. Старий герой не образиться. Голосно."
  );

  return lines.join("\n");
}
