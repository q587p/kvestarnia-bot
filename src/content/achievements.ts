export const achievementCategories = [
  "onboarding",
  "level",
  "combat",
  "quests",
  "gear",
  "weird"
] as const;

export type AchievementCategory = (typeof achievementCategories)[number];

export const achievementStatuses = ["enabled", "disabled"] as const;
export type AchievementStatus = (typeof achievementStatuses)[number];

export const achievementTriggerTypes = [
  "character.created",
  "level.reached",
  "combat.finished",
  "problem.quest.completed",
  "item.received",
  "equipment.item_equipped",
  "future"
] as const;

export type AchievementTriggerType = (typeof achievementTriggerTypes)[number];

export interface AchievementDefinition {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  hidden: boolean;
  lockedDescription: string;
  sortOrder: number;
  status: AchievementStatus;
  trigger: {
    type: AchievementTriggerType;
    threshold?: number;
  };
  progressTarget?: number;
  cosmeticTitleGrantId?: string;
}

export const HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION =
  "Умова прихована, бо літописець хихоче.";

export const achievements = [
  {
    id: "achievement.character.created",
    category: "onboarding",
    title: "Де тут вихід?",
    description: "створити пригодника й офіційно стати проблемою Корчмаря.",
    hidden: false,
    lockedDescription: "створити пригодника.",
    sortOrder: 10,
    status: "enabled",
    trigger: { type: "character.created" },
    cosmeticTitleGrantId: "cosmetic-title.first-ink"
  },
  {
    id: "achievement.level.3",
    category: "level",
    title: "Перший поверх амбіцій",
    description: "досягти 3 рівня, де справи вже починають дивитися у відповідь.",
    hidden: false,
    lockedDescription: "досягти 3 рівня.",
    sortOrder: 20,
    status: "enabled",
    trigger: { type: "level.reached", threshold: 3 },
    progressTarget: 3,
    cosmeticTitleGrantId: "cosmetic-title.level-three-witness"
  },
  {
    id: "achievement.level.5",
    category: "level",
    title: "Палиця вже не випадкова",
    description: "досягти 5 рівня й виглядати так, ніби це був план.",
    hidden: false,
    lockedDescription: "досягти 5 рівня.",
    sortOrder: 30,
    status: "enabled",
    trigger: { type: "level.reached", threshold: 5 },
    progressTarget: 5,
    cosmeticTitleGrantId: "cosmetic-title.level-five-stick"
  },
  {
    id: "achievement.combat.first-win",
    category: "combat",
    title: "Бойове хрещення в калюжі",
    description: "виграти бій з монстром і не питати, чия це була калюжа.",
    hidden: false,
    lockedDescription: "виграти перший бій з монстром.",
    sortOrder: 40,
    status: "enabled",
    trigger: { type: "combat.finished" },
    cosmeticTitleGrantId: "cosmetic-title.first-puddle-victor"
  },
  {
    id: "achievement.combat.first-loss",
    category: "combat",
    title: "Горизонтальний досвід",
    description: "програти бій і зробити вигляд, що це була розвідка підлоги.",
    hidden: false,
    lockedDescription: "пережити першу бойову поразку.",
    sortOrder: 50,
    status: "enabled",
    trigger: { type: "combat.finished" }
  },
  {
    id: "achievement.quest.first-problem",
    category: "quests",
    title: "Перший пергамент не зʼїв",
    description: "здати першу корчмарську проблему й лишити папірець придатним для архіву.",
    hidden: false,
    lockedDescription: "здати першу корчмарську проблему.",
    sortOrder: 60,
    status: "enabled",
    trigger: { type: "problem.quest.completed" },
    cosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
  },
  {
    id: "achievement.item.first-received",
    category: "gear",
    title: "Манатка дивиться першою",
    description: "отримати першу манатку й чемно не питати, звідки вона дивиться.",
    hidden: false,
    lockedDescription: "отримати першу манатку.",
    sortOrder: 70,
    status: "enabled",
    trigger: { type: "item.received" },
    cosmeticTitleGrantId: "cosmetic-title.first-mantok-witness"
  },
  {
    id: "achievement.equipment.first-equipped",
    category: "gear",
    title: "На мені це виглядає службово",
    description: "вдягнути першу манатку й почути, як гачок нервово погодився.",
    hidden: false,
    lockedDescription: "вдягнути першу манатку.",
    sortOrder: 80,
    status: "enabled",
    trigger: { type: "equipment.item_equipped" },
    cosmeticTitleGrantId: "cosmetic-title.first-equipped-hook"
  },
  {
    id: "achievement.remort.first-memory",
    category: "weird",
    title: "Свічка памʼятає більше",
    description: "пройти перший реморт і лишити памʼять там, де Корчма її не дістане шваброю.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 90,
    status: "disabled",
    trigger: { type: "future" },
    cosmeticTitleGrantId: "cosmetic-title.first-remort-candle"
  },
  {
    id: "achievement.bard.performance",
    category: "weird",
    title: "Куплет бачив свідків",
    description: "дати виступ, після якого Шинок ще довго перевіряє акустику.",
    hidden: true,
    lockedDescription: HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
    sortOrder: 100,
    status: "disabled",
    trigger: { type: "future" },
    cosmeticTitleGrantId: "cosmetic-title.bard-witness"
  }
] as const satisfies readonly AchievementDefinition[];

export function getAchievementDefinition(id: string): AchievementDefinition | null {
  return achievements.find((achievement) => achievement.id === id) ?? null;
}

export function getEnabledAchievements(): AchievementDefinition[] {
  return achievements.filter((achievement) => achievement.status === "enabled");
}

export function validateAchievementDefinitions(
  definitions: readonly AchievementDefinition[] = achievements
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const sortOrders = new Set<number>();
  const titleGrantIds = new Set<string>();

  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      errors.push(`Duplicate achievement id: ${definition.id}`);
    }
    ids.add(definition.id);

    if (sortOrders.has(definition.sortOrder)) {
      errors.push(`Duplicate achievement sort order: ${definition.sortOrder}`);
    }
    sortOrders.add(definition.sortOrder);

    if (!/^achievement\.[a-z0-9.-]+$/u.test(definition.id)) {
      errors.push(`Invalid achievement id: ${definition.id}`);
    }

    if (definition.hidden && definition.lockedDescription !== HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION) {
      errors.push(`Hidden achievement leaks locked description: ${definition.id}`);
    }

    if (definition.status === "enabled" && definition.trigger.type === "future") {
      errors.push(`Enabled achievement references an unshipped trigger: ${definition.id}`);
    }

    if (definition.cosmeticTitleGrantId) {
      if (!/^cosmetic-title\.[a-z0-9.-]+$/u.test(definition.cosmeticTitleGrantId)) {
        errors.push(`Invalid cosmetic title grant id: ${definition.cosmeticTitleGrantId}`);
      }
      if (titleGrantIds.has(definition.cosmeticTitleGrantId)) {
        errors.push(`Duplicate cosmetic title grant id: ${definition.cosmeticTitleGrantId}`);
      }
      titleGrantIds.add(definition.cosmeticTitleGrantId);
    }
  }

  const ordered = [...definitions].sort((left, right) => left.sortOrder - right.sortOrder);
  definitions.forEach((definition, index) => {
    if (definition.id !== ordered[index]?.id) {
      errors.push("Achievement definitions must be sorted by sortOrder.");
    }
  });

  return errors;
}
