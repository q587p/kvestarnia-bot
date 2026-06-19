import type { LevelBonus } from "../../domain/progression/effectiveStats";
import { buildLevelGrowthBonus } from "../../domain/progression/effectiveStats";
import { LEVEL_XP_THRESHOLDS } from "../../domain/progression/level";
import type { RewardLevelChange } from "../../db/repositories/dailyActionRepository";
import type { StatKey } from "../../domain/characters/starterStats";
import type { CharacterPath } from "../../domain/characters/path";

const STAT_LABELS: Record<StatKey, string> = {
  strength: "Сили",
  dexterity: "Спритності",
  intelligence: "Розуму",
  charisma: "Харизми",
  luck: "Вдачі"
};

export function presentLevelBonus(bonus: LevelBonus): string | null {
  const parts = [`+${bonus.hpMax} HP`, `+${bonus.manaMax} мани`];
  const stats = bonus.stats ?? emptyStats();

  for (const stat of statKeys) {
    if (stats[stat] > 0) {
      parts.push(`+${stats[stat]} ${STAT_LABELS[stat]}`);
    }
  }

  if (bonus.primaryStat && bonus.primaryStat.bonus > 0 && !parts.some((part) => part.includes(STAT_LABELS[bonus.primaryStat!.stat]))) {
    parts.push(`+${bonus.primaryStat.bonus} ${STAT_LABELS[bonus.primaryStat.stat]}`);
  }

  if (bonus.hpMax <= 0 && bonus.manaMax <= 0 && parts.length <= 2) {
    return null;
  }

  return parts.join(" · ");
}

export function presentLevelUpCelebration(
  levelChange: RewardLevelChange,
  classId: string,
  identity: { raceId?: string; path?: CharacterPath } = {}
): string | null {
  if (!levelChange.leveledUp) {
    return null;
  }

  if (levelChange.newLevel >= LEVEL_XP_THRESHOLDS.length) {
    return presentLevelCapCelebration(levelChange, classId, identity);
  }

  const growth = presentLevelBonus(
    buildLevelGrowthBonus(levelChange.oldLevel, levelChange.newLevel, classId, identity.raceId, identity.path)
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
  classId: string,
  identity: { raceId?: string; path?: CharacterPath } = {}
): string {
  const growth = presentLevelBonus(
    buildLevelGrowthBonus(levelChange.oldLevel, levelChange.newLevel, classId, identity.raceId, identity.path)
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
    "Хочете нове життя без повного забуття? /remort відкриє свічку, бланк і підозрілу памʼять попередньої тринадцятки."
  );

  return lines.join("\n");
}

const statKeys: readonly StatKey[] = [
  "strength",
  "dexterity",
  "intelligence",
  "charisma",
  "luck"
];

function emptyStats(): Record<StatKey, number> {
  return {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    charisma: 0,
    luck: 0
  };
}
