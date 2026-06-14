import type { AchievementDefinition } from "./achievementEvents";

export const ACHIEVEMENT_CATALOG = [
  {
    id: "achievement.first-steps",
    title: "Перші кроки",
    description: "Створити пригодника.",
    category: "onboarding",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "character.created" },
    reward: { type: "none" }
  },
  {
    id: "achievement.first-level-up",
    title: "Нове зростання",
    description: "Піднятися до 2 рівня.",
    category: "progression",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "level.reached", minLevel: 2 },
    reward: { type: "none" }
  },
  {
    id: "achievement.level-ten-slice",
    title: "Десятий поріг",
    description: "Дійти до 10 рівня.",
    category: "progression",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "level.reached", minLevel: 10 },
    reward: { type: "none" }
  },
  {
    id: "achievement.first-fight",
    title: "Перший бій",
    description: "Завершити свій перший бій.",
    category: "combat",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "combat.finished" },
    reward: { type: "none" }
  },
  {
    id: "achievement.first-win",
    title: "Перша перемога",
    description: "Виграти бій.",
    category: "combat",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "combat.finished", status: "won" },
    reward: { type: "none" }
  },
  {
    id: "achievement.fled-with-dignity",
    title: "Втеча з гідністю",
    description: "Втекти з бою й не розсипатися по дорозі.",
    category: "combat",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "combat.finished", status: "fled" },
    reward: { type: "none" }
  },
  {
    id: "achievement.first-mana-spent",
    title: "Мана пішла в діло",
    description: "Витратити ману в бою.",
    category: "combat",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "combat.finished", minManaSpent: 1 },
    reward: { type: "none" }
  },
  {
    id: "achievement.first-item",
    title: "Перша манатка",
    description: "Отримати першу манатку.",
    category: "inventory",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "inventory.item-granted" },
    reward: { type: "none" }
  },
  {
    id: "achievement.first-equipped-item",
    title: "Рукавички не для виду",
    description: "Одягнути першу манатку.",
    category: "inventory",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "equipment.item-equipped" },
    reward: { type: "none" }
  },
  {
    id: "achievement.bag-with-opinions",
    title: "Торба з думкою",
    description: "Зібрати 5 манаток у торбі.",
    category: "inventory",
    visibility: "hidden",
    phase: "phase1",
    trigger: { type: "inventory.item-granted", minTotalStacks: 5 },
    reward: { type: "none" }
  },
  {
    id: "achievement.first-hunt-contract",
    title: "Перше полювання",
    description: "Закрити перше полювання.",
    category: "korchma",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "hunt.completed" },
    reward: { type: "none" }
  },
  {
    id: "achievement.barrel-survivor",
    title: "Бочкова стійкість",
    description: "Пережити бочку й не розсипатися.",
    category: "korchma",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "tavern.barrel.completed" },
    reward: { type: "none" }
  },
  {
    id: "achievement.first-round-bought",
    title: "Перше частування",
    description: "Поставити перший круг у корчмі.",
    category: "social",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "tavern.round-bought" },
    reward: { type: "none" }
  },
  {
    id: "achievement.first-generous-round",
    title: "Щедрий гість",
    description: "Поставити щедрий круг у корчмі.",
    category: "social",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "tavern.round-bought", tier: "fine" },
    reward: { type: "none" }
  },
  {
    id: "achievement.read-the-bestiary",
    title: "Польовий читач",
    description: "Відкрити Бестіарій.",
    category: "exploration",
    visibility: "visible",
    phase: "phase1",
    trigger: { type: "bestiary.opened" },
    reward: { type: "none" }
  }
] as const satisfies readonly AchievementDefinition[];

export function getAchievementCatalog(): readonly AchievementDefinition[] {
  return ACHIEVEMENT_CATALOG;
}

export function getAchievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_CATALOG.find((achievement) => achievement.id === id);
}

export function getAchievementIds(): readonly string[] {
  return ACHIEVEMENT_CATALOG.map((achievement) => achievement.id);
}

export type { AchievementDefinition, AchievementEvent } from "./achievementEvents";
