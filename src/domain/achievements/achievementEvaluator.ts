import {
  ACHIEVEMENT_CATALOG,
  type AchievementDefinition
} from "./achievementCatalog";
import type { AchievementEvent } from "./achievementEvents";

export function evaluateAchievementUnlocks(input: {
  alreadyUnlockedIds: ReadonlySet<string> | readonly string[];
  event: AchievementEvent;
  catalog?: readonly AchievementDefinition[];
}): AchievementDefinition[] {
  const unlockedIds = toIdSet(input.alreadyUnlockedIds);
  const catalog = input.catalog ?? ACHIEVEMENT_CATALOG;
  const unlocks: AchievementDefinition[] = [];

  for (const achievement of catalog) {
    if (unlockedIds.has(achievement.id)) {
      continue;
    }

    if (matchesTrigger(achievement.trigger, input.event)) {
      unlocks.push(achievement);
    }
  }

  return unlocks;
}

function toIdSet(ids: ReadonlySet<string> | readonly string[]): Set<string> {
  return new Set<string>(ids);
}

function matchesTrigger(
  trigger: AchievementDefinition["trigger"],
  event: AchievementEvent
): boolean {
  switch (trigger.type) {
    case "character.created":
      return event.type === "character.created";

    case "level.reached":
      return event.type === "level.reached" && event.level >= trigger.minLevel;

    case "combat.finished":
      return matchesCombatFinished(trigger, event);

    case "inventory.item-granted":
      return matchesInventoryItemGranted(trigger, event);

    case "equipment.item-equipped":
      return matchesEquipmentItemEquipped(trigger, event);

    case "hunt.completed":
      return event.type === "hunt.completed"
        ? trigger.monsterId === undefined || trigger.monsterId === event.monsterId
        : false;

    case "tavern.barrel.completed":
      return event.type === "tavern.barrel.completed";

    case "tavern.round-bought":
      return matchesRoundBought(trigger, event);

    case "bestiary.opened":
      return event.type === "bestiary.opened";
  }
}

function matchesCombatFinished(
  trigger: Extract<AchievementDefinition["trigger"], { type: "combat.finished" }>,
  event: AchievementEvent
): boolean {
  if (event.type !== "combat.finished") {
    return false;
  }

  if (!matchesMaybeMany(trigger.status, event.status)) {
    return false;
  }

  if (trigger.monsterId !== undefined && trigger.monsterId !== event.monsterId) {
    return false;
  }

  if (trigger.minTurns !== undefined && (event.turns ?? 0) < trigger.minTurns) {
    return false;
  }

  if (trigger.minManaSpent !== undefined && (event.manaSpent ?? 0) < trigger.minManaSpent) {
    return false;
  }

  return true;
}

function matchesInventoryItemGranted(
  trigger: Extract<AchievementDefinition["trigger"], { type: "inventory.item-granted" }>,
  event: AchievementEvent
): boolean {
  if (event.type !== "inventory.item-granted") {
    return false;
  }

  if (trigger.itemId !== undefined && trigger.itemId !== event.itemId) {
    return false;
  }

  if (trigger.minTotalStacks !== undefined && (event.totalStacks ?? 0) < trigger.minTotalStacks) {
    return false;
  }

  return true;
}

function matchesEquipmentItemEquipped(
  trigger: Extract<AchievementDefinition["trigger"], { type: "equipment.item-equipped" }>,
  event: AchievementEvent
): boolean {
  if (event.type !== "equipment.item-equipped") {
    return false;
  }

  if (trigger.itemId !== undefined && trigger.itemId !== event.itemId) {
    return false;
  }

  if (trigger.slot !== undefined && trigger.slot !== event.slot) {
    return false;
  }

  return true;
}

function matchesRoundBought(
  trigger: Extract<AchievementDefinition["trigger"], { type: "tavern.round-bought" }>,
  event: AchievementEvent
): boolean {
  if (event.type !== "tavern.round-bought") {
    return false;
  }

  return matchesMaybeMany(trigger.tier, event.tier);
}

function matchesMaybeMany<T extends string>(
  expected: T | readonly T[] | undefined,
  actual: T
): boolean {
  if (expected === undefined) {
    return true;
  }

  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

export type { AchievementCombatStatus, AchievementRoundTier } from "./achievementEvents";
export type { AchievementEvent };
