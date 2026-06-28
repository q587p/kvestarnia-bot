import {
  achievements,
  getAchievementDefinition,
  getEnabledAchievements,
  type AchievementDefinition,
  type AchievementTriggerType
} from "../content/achievements";
import type {
  AchievementRepository,
  AchievementRecalculationSnapshot,
  AchievementUnlockSource,
  CharacterAchievementProgressRecord,
  CharacterAchievementRecord,
  CharacterCosmeticTitleGrantRecord
} from "../db/repositories/achievementRepository";

export const ACHIEVEMENTS_PAGE_SIZE = 10;

export const achievementListFilters = ["all", "earned", "locked"] as const;
export type AchievementListFilter = (typeof achievementListFilters)[number];
export type AchievementSimpleEventType = Exclude<
  AchievementTriggerType,
  | "achievement.list.opened"
  | "character.created"
  | "level.reached"
  | "combat.finished"
  | "combat.persistent.finished"
  | "problem.quest.completed"
  | "item.received"
  | "item.used"
  | "equipment.item_equipped"
  | "future"
>;

export type AchievementEvent =
  | {
      type: "achievement.list.opened";
      characterId: string;
      occurredAt: Date;
      sourceId?: string;
    }
  | {
      type: "character.created";
      characterId: string;
      raceId?: string;
      classId?: string;
      occurredAt: Date;
      sourceId?: string;
    }
  | {
      type: "level.reached";
      characterId: string;
      level: number;
      occurredAt: Date;
      sourceId?: string;
    }
  | {
      type: "combat.finished";
      characterId: string;
      outcome: "won" | "lost" | "fled" | "expired";
      occurredAt: Date;
      sourceId?: string;
    }
  | {
      type: "problem.quest.completed";
      characterId: string;
      stageId: string;
      occurredAt: Date;
      sourceId?: string;
    }
  | {
      type: "item.received";
      characterId: string;
      itemIds: readonly string[];
      occurredAt: Date;
      sourceId?: string;
    }
  | {
      type: "item.used";
      characterId: string;
      itemId: string;
      occurredAt: Date;
      sourceId?: string;
    }
  | {
      type: "equipment.item_equipped";
      characterId: string;
      itemId: string;
      occurredAt: Date;
      sourceId?: string;
    }
  | {
      type: AchievementSimpleEventType;
      characterId: string;
      occurredAt: Date;
      sourceId?: string;
    };

export interface AchievementUnlock {
  id: string;
  title: string;
  cosmeticTitleGrantId: string | null;
  unlockedAt: Date;
}

export interface AchievementListEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  hidden: boolean;
  earned: boolean;
  unlockedAt: Date | null;
  progressCurrent: number | null;
  progressTarget: number | null;
  cosmeticTitleGrantId: string | null;
  unknownStored: boolean;
}

export interface AchievementListView {
  entries: AchievementListEntry[];
  earnedCount: number;
  totalCount: number;
  filter: AchievementListFilter;
  page: number;
  totalPages: number;
}

export interface AchievementRecalculationResult {
  unlocks: AchievementUnlock[];
}

export class AchievementService {
  constructor(private readonly achievementsRepository: AchievementRepository) {}

  async listForCharacter(
    characterId: string,
    requestedPage = 0,
    filter: AchievementListFilter = "all"
  ): Promise<AchievementListView> {
    const snapshot = await this.achievementsRepository.listForCharacter(characterId);
    const allEntries = buildListEntries(snapshot.achievements, snapshot.progress, snapshot.titleGrants);
    const entries = filterAchievementEntries(allEntries, filter);
    const totalPages = Math.max(1, Math.ceil(entries.length / ACHIEVEMENTS_PAGE_SIZE));
    const page = Math.max(0, Math.min(Math.floor(requestedPage), totalPages - 1));

    return {
      entries: entries.slice(page * ACHIEVEMENTS_PAGE_SIZE, (page + 1) * ACHIEVEMENTS_PAGE_SIZE),
      earnedCount: allEntries.filter((entry) => entry.earned).length,
      totalCount: allEntries.length,
      filter,
      page,
      totalPages
    };
  }

  async trackEvent(event: AchievementEvent): Promise<AchievementUnlock[]> {
    const matching = getEnabledAchievements().filter((definition) => matchesEvent(definition, event));
    const unlocks: AchievementUnlock[] = [];
    let recalculationSnapshot: AchievementRecalculationSnapshot | null | undefined;

    for (const definition of matching) {
      const eventProgress = getEventProgress(definition, event);
      const snapshotProgress = await getSnapshotProgressForEventDefinition(
        definition,
        event,
        async () => {
          recalculationSnapshot ??= await this.achievementsRepository.getRecalculationSnapshot(event.characterId);
          return recalculationSnapshot;
        }
      );
      const current = snapshotProgress ?? eventProgress;

      if (definition.progressTarget && current !== null) {
        await this.achievementsRepository.updateProgressMax({
          characterId: event.characterId,
          achievementId: definition.id,
          current: Math.min(current, definition.progressTarget),
          target: definition.progressTarget
        });
      }

      if (current === null || current < (definition.trigger.threshold ?? 1)) {
        continue;
      }

      const result = await this.achievementsRepository.unlockAchievement({
        characterId: event.characterId,
        achievementId: definition.id,
        source: eventToSource(event),
        ...(definition.cosmeticTitleGrantId
          ? { cosmeticTitleGrantId: definition.cosmeticTitleGrantId }
          : {})
      });

      if (result.created) {
        unlocks.push({
          id: definition.id,
          title: definition.title,
          cosmeticTitleGrantId: definition.cosmeticTitleGrantId ?? null,
          unlockedAt: result.achievement.unlockedAt
        });
      }
    }

    return unlocks;
  }

  async trackEventSafely(event: AchievementEvent): Promise<AchievementUnlock[]> {
    try {
      return await this.trackEvent(event);
    } catch {
      return [];
    }
  }

  async recalculateForCharacter(characterId: string, occurredAt = new Date()): Promise<AchievementRecalculationResult> {
    const snapshot = await this.achievementsRepository.getRecalculationSnapshot(characterId);

    if (!snapshot) {
      return { unlocks: [] };
    }

    const unlocks: AchievementUnlock[] = [];

    for (const definition of getEnabledAchievements()) {
      const current = getRecalculationProgress(definition, snapshot);
      const threshold = definition.trigger.threshold ?? 1;

      if (definition.progressTarget) {
        await this.achievementsRepository.updateProgressMax({
          characterId,
          achievementId: definition.id,
          current: Math.min(current, definition.progressTarget),
          target: definition.progressTarget
        });
      }

      if (current < threshold) {
        continue;
      }

      const result = await this.achievementsRepository.unlockAchievement({
        characterId,
        achievementId: definition.id,
        source: {
          type: "achievement.recalculate",
          occurredAt: getRecalculationOccurredAt(definition, snapshot, occurredAt),
          payload: {
            triggerType: definition.trigger.type,
            current,
            threshold
          }
        },
        ...(definition.cosmeticTitleGrantId
          ? { cosmeticTitleGrantId: definition.cosmeticTitleGrantId }
          : {})
      });

      if (result.created) {
        unlocks.push({
          id: definition.id,
          title: definition.title,
          cosmeticTitleGrantId: definition.cosmeticTitleGrantId ?? null,
          unlockedAt: result.achievement.unlockedAt
        });
      }
    }

    return { unlocks };
  }
}

function filterAchievementEntries(
  entries: readonly AchievementListEntry[],
  filter: AchievementListFilter
): AchievementListEntry[] {
  if (filter === "earned") {
    return entries.filter((entry) => entry.earned);
  }

  if (filter === "locked") {
    return entries.filter((entry) => !entry.earned);
  }

  return [...entries];
}

function matchesEvent(definition: AchievementDefinition, event: AchievementEvent): boolean {
  if (!matchesEventType(definition.trigger.type, event.type)) {
    return false;
  }

  switch (event.type) {
    case "combat.finished":
      return !definition.trigger.outcome || definition.trigger.outcome === event.outcome;
    case "character.created":
      return matchesOptionalValue(definition.trigger.raceId, event.raceId) &&
        matchesOptionalValue(definition.trigger.classId, event.classId);
    case "item.received":
      return definition.trigger.itemId
        ? event.itemIds.includes(definition.trigger.itemId)
        : event.itemIds.length > 0;
    case "item.used":
      return matchesOptionalValue(definition.trigger.itemId, event.itemId);
    default:
      return true;
  }
}

function matchesEventType(triggerType: AchievementTriggerType, eventType: AchievementEvent["type"]): boolean {
  return triggerType === eventType ||
    (eventType === "combat.finished" && triggerType === "combat.persistent.finished");
}

function getEventProgress(definition: AchievementDefinition, event: AchievementEvent): number | null {
  if (definition.trigger.type === "level.reached") {
    return event.type === "level.reached" ? event.level : null;
  }

  if (
    definition.trigger.type === "achievement.list.opened" ||
    definition.trigger.type === "character.created" ||
    definition.trigger.type === "item.used"
  ) {
    return 1;
  }

  if (definition.trigger.type === "item.received") {
    if (event.type !== "item.received") {
      return null;
    }

    const itemCount = definition.trigger.itemId
      ? event.itemIds.filter((itemId) => itemId === definition.trigger.itemId).length
      : event.itemIds.length;

    return itemCount > 0 ? itemCount : null;
  }

  if (
    definition.trigger.type === "combat.finished" ||
    definition.trigger.type === "combat.persistent.finished" ||
    definition.trigger.type === "problem.quest.completed" ||
    definition.trigger.type === "equipment.item_equipped"
  ) {
    return (definition.trigger.threshold ?? 1) <= 1 ? 1 : null;
  }

  if (definition.trigger.type === event.type) {
    return (definition.trigger.threshold ?? 1) <= 1 ? 1 : null;
  }

  return null;
}

async function getSnapshotProgressForEventDefinition(
  definition: AchievementDefinition,
  event: AchievementEvent,
  loadSnapshot: () => Promise<AchievementRecalculationSnapshot | null>
): Promise<number | null> {
  if (!shouldUseSnapshotForEventDefinition(definition, event)) {
    return null;
  }

  const snapshot = await loadSnapshot();

  return snapshot ? getRecalculationProgress(definition, snapshot) : null;
}

function shouldUseSnapshotForEventDefinition(
  definition: AchievementDefinition,
  event: AchievementEvent
): boolean {
  const needsSnapshot = definition.progressTarget !== undefined ||
    (definition.trigger.threshold ?? 1) > 1;

  if (!needsSnapshot) {
    return false;
  }

  if (
    event.type === "combat.finished" ||
    event.type === "problem.quest.completed" ||
    event.type === "item.received" ||
    event.type === "equipment.item_equipped"
  ) {
    return true;
  }

  return definition.trigger.type === event.type && isActivityDateTriggerType(definition.trigger.type);
}

function getRecalculationProgress(
  definition: AchievementDefinition,
  snapshot: AchievementRecalculationSnapshot
): number {
  switch (definition.trigger.type) {
    case "character.created":
      return matchesOptionalValue(definition.trigger.raceId, snapshot.raceId) &&
        matchesOptionalValue(definition.trigger.classId, snapshot.classId)
        ? 1
        : 0;
    case "level.reached":
      return snapshot.level;
    case "combat.finished":
      return definition.trigger.outcome
        ? snapshot.combat[definition.trigger.outcome]
        : 0;
    case "combat.persistent.finished":
      return definition.trigger.outcome
        ? snapshot.activityDates[`combat.persistent.${definition.trigger.outcome}`]?.length ?? 0
        : 0;
    case "problem.quest.completed":
      return snapshot.completedProblemQuestStages;
    case "item.received":
      return definition.trigger.itemId
        ? snapshot.inventoryItemQuantities[definition.trigger.itemId] ?? 0
        : snapshot.inventoryItemQuantity;
    case "equipment.item_equipped":
      return snapshot.equippedItemCount;
    case "item.used":
      return getActivityDates(definition, snapshot).length;
    case "achievement.list.opened":
    case "remort.completed":
    case "starter.mimic-shawarma.completed":
    case "starter.mimic-shawarma.probe.completed":
    case "cellar.mouse.completed":
    case "adventure.choice.strong-success":
    case "training.doppelganger.won":
    case "duel.resolved":
    case "duel.won":
    case "duel.turnbased.defend":
    case "yeger.trial.completed":
    case "combat.persistent.hard-win":
    case "combat.persistent.adventure-origin-win":
    case "combat.persistent.yeger-origin-win":
    case "combat.persistent.low-hp-win":
    case "combat.persistent.zero-gold-item-win":
    case "mantok.chest.completed":
    case "level.barter.completed":
    case "training.doppelganger.finished":
    case "duel.quick.resolved":
    case "duel.turnbased.resolved":
    case "barrel.raid.claimed":
    case "korchma.round.purchased":
    case "item.gift.sent":
    case "item.gift.received":
    case "mantok.sale.completed":
    case "bard.performance.completed":
    case "yeger.free-bandage.claimed":
    case "shynok.drink.activated":
    case "passage.search.completed":
    case "passage.search.monster-attack":
    case "passage.search.unique-nodes":
    case "hunt.contract.completed":
    case "adventure.choice.completed":
    case "adventure.choice.complication":
    case "combat.threat-escalated":
    case "combat.threat-pressure":
      return snapshot.activityDates[definition.trigger.type]?.length ?? 0;
    case "future":
    default:
      return 0;
  }
}

function getRecalculationOccurredAt(
  definition: AchievementDefinition,
  snapshot: AchievementRecalculationSnapshot,
  fallback: Date
): Date {
  const threshold = definition.trigger.threshold ?? 1;

  switch (definition.trigger.type) {
    case "character.created":
      return snapshot.createdAt;
    case "level.reached":
      return snapshot.levelReachedAt[threshold] ?? fallback;
    case "combat.finished":
      return getThresholdDate(
        definition.trigger.outcome ? snapshot.combatFinishedAt[definition.trigger.outcome] : [],
        threshold
      ) ?? fallback;
    case "combat.persistent.finished":
      return getThresholdDate(
        definition.trigger.outcome ? snapshot.activityDates[`combat.persistent.${definition.trigger.outcome}`] ?? [] : [],
        threshold
      ) ?? fallback;
    case "problem.quest.completed":
      return getThresholdDate(snapshot.problemQuestCompletedAt, threshold) ?? fallback;
    case "item.received":
      if (definition.trigger.itemId) {
        const row = snapshot.inventoryItemRows[definition.trigger.itemId];
        return row ? (threshold <= 1 ? row.createdAt : row.updatedAt) : fallback;
      }
      return threshold <= 1
        ? snapshot.firstInventoryItemReceivedAt ?? fallback
        : snapshot.inventoryObservedAt ?? fallback;
    case "equipment.item_equipped":
      return threshold <= 1
        ? snapshot.firstEquippedItemAt ?? fallback
        : snapshot.equipmentObservedAt ?? fallback;
    case "item.used":
    case "achievement.list.opened":
    case "remort.completed":
    case "starter.mimic-shawarma.completed":
    case "starter.mimic-shawarma.probe.completed":
    case "cellar.mouse.completed":
    case "adventure.choice.strong-success":
    case "training.doppelganger.won":
    case "duel.resolved":
    case "duel.won":
    case "duel.turnbased.defend":
    case "yeger.trial.completed":
    case "combat.persistent.hard-win":
    case "combat.persistent.adventure-origin-win":
    case "combat.persistent.yeger-origin-win":
    case "combat.persistent.low-hp-win":
    case "combat.persistent.zero-gold-item-win":
    case "mantok.chest.completed":
    case "level.barter.completed":
    case "training.doppelganger.finished":
    case "duel.quick.resolved":
    case "duel.turnbased.resolved":
    case "barrel.raid.claimed":
    case "korchma.round.purchased":
    case "item.gift.sent":
    case "item.gift.received":
    case "mantok.sale.completed":
    case "bard.performance.completed":
    case "yeger.free-bandage.claimed":
    case "shynok.drink.activated":
    case "passage.search.completed":
    case "passage.search.monster-attack":
    case "passage.search.unique-nodes":
    case "hunt.contract.completed":
    case "adventure.choice.completed":
    case "adventure.choice.complication":
    case "combat.threat-escalated":
    case "combat.threat-pressure":
      return getThresholdDate(getActivityDates(definition, snapshot), threshold) ?? fallback;
    case "future":
    default:
      return fallback;
  }
}

function getActivityDates(
  definition: AchievementDefinition,
  snapshot: AchievementRecalculationSnapshot
): readonly Date[] {
  if (definition.trigger.type === "item.used" && definition.trigger.itemId) {
    return snapshot.activityDates[`item.used:${definition.trigger.itemId}`] ?? [];
  }

  return snapshot.activityDates[definition.trigger.type] ?? [];
}

function getThresholdDate(dates: readonly Date[], threshold: number): Date | null {
  return dates[Math.max(0, threshold - 1)] ?? null;
}

function isActivityDateTriggerType(type: AchievementTriggerType): boolean {
  switch (type) {
    case "remort.completed":
    case "starter.mimic-shawarma.completed":
    case "starter.mimic-shawarma.probe.completed":
    case "cellar.mouse.completed":
    case "adventure.choice.strong-success":
    case "training.doppelganger.won":
    case "duel.resolved":
    case "duel.won":
    case "duel.turnbased.defend":
    case "yeger.trial.completed":
    case "combat.persistent.hard-win":
    case "combat.persistent.adventure-origin-win":
    case "combat.persistent.yeger-origin-win":
    case "combat.persistent.low-hp-win":
    case "combat.persistent.zero-gold-item-win":
    case "mantok.chest.completed":
    case "level.barter.completed":
    case "training.doppelganger.finished":
    case "duel.quick.resolved":
    case "duel.turnbased.resolved":
    case "barrel.raid.claimed":
    case "korchma.round.purchased":
    case "item.gift.sent":
    case "item.gift.received":
    case "mantok.sale.completed":
    case "bard.performance.completed":
    case "yeger.free-bandage.claimed":
    case "shynok.drink.activated":
    case "passage.search.completed":
    case "passage.search.monster-attack":
    case "passage.search.unique-nodes":
    case "hunt.contract.completed":
    case "adventure.choice.completed":
    case "adventure.choice.complication":
    case "combat.threat-escalated":
    case "combat.threat-pressure":
      return true;
    default:
      return false;
  }
}

function matchesOptionalValue(expected: string | undefined, actual: string | undefined): boolean {
  return expected === undefined || expected === actual;
}

function eventToSource(event: AchievementEvent): AchievementUnlockSource {
  return {
    type: event.type,
    id: event.sourceId ?? null,
    occurredAt: event.occurredAt,
    payload: eventPayload(event)
  };
}

function eventPayload(event: AchievementEvent): Record<string, unknown> {
  switch (event.type) {
    case "level.reached":
      return { level: event.level };
    case "combat.finished":
      return { outcome: event.outcome };
    case "problem.quest.completed":
      return { stageId: event.stageId };
    case "item.received":
      return { itemIds: [...event.itemIds] };
    case "item.used":
      return { itemId: event.itemId };
    case "character.created":
      return {
        ...(event.raceId ? { raceId: event.raceId } : {}),
        ...(event.classId ? { classId: event.classId } : {})
      };
    case "equipment.item_equipped":
      return { itemId: event.itemId };
    default:
      return {};
  }
}

function buildListEntries(
  achievementRows: readonly CharacterAchievementRecord[],
  progressRows: readonly CharacterAchievementProgressRecord[],
  titleGrants: readonly CharacterCosmeticTitleGrantRecord[]
): AchievementListEntry[] {
  const earnedById = new Map(achievementRows.map((row) => [row.achievementId, row]));
  const progressById = new Map(progressRows.map((row) => [row.achievementId, row]));
  const titleGrantsByAchievement = new Map(titleGrants.map((row) => [row.achievementId, row]));
  const entries = achievements
    .filter((definition) => definition.status === "enabled" || earnedById.has(definition.id))
    .map((definition) =>
      buildKnownEntry(definition, earnedById.get(definition.id), progressById.get(definition.id), titleGrantsByAchievement.get(definition.id))
    );
  const knownIds = new Set<string>(achievements.map((definition) => definition.id));
  const unknownEntries = achievementRows
    .filter((row) => !knownIds.has(row.achievementId))
    .map(buildUnknownStoredEntry);

  return [...entries, ...unknownEntries].sort(compareEntries);
}

function buildKnownEntry(
  definition: AchievementDefinition,
  achievement: CharacterAchievementRecord | undefined,
  progress: CharacterAchievementProgressRecord | undefined,
  titleGrant: CharacterCosmeticTitleGrantRecord | undefined
): AchievementListEntry {
  const earned = Boolean(achievement);

  return {
    id: definition.id,
    title: earned || !definition.hidden ? definition.title : "Таємна ачівка",
    description: earned ? definition.description : definition.lockedDescription,
    category: definition.category,
    hidden: definition.hidden,
    earned,
    unlockedAt: achievement?.unlockedAt ?? null,
    progressCurrent: progress?.current ?? null,
    progressTarget: progress?.target ?? definition.progressTarget ?? null,
    cosmeticTitleGrantId: titleGrant?.titleGrantId ?? definition.cosmeticTitleGrantId ?? null,
    unknownStored: false
  };
}

function buildUnknownStoredEntry(row: CharacterAchievementRecord): AchievementListEntry {
  return {
    id: row.achievementId,
    title: "Запис з архіву",
    description: "Ачівку збережено, але її опис уже переїхав у старий журнал.",
    category: "archive",
    hidden: true,
    earned: true,
    unlockedAt: row.unlockedAt,
    progressCurrent: null,
    progressTarget: null,
    cosmeticTitleGrantId: null,
    unknownStored: true
  };
}

function compareEntries(left: AchievementListEntry, right: AchievementListEntry): number {
  const leftDefinition = getAchievementDefinition(left.id);
  const rightDefinition = getAchievementDefinition(right.id);
  const leftOrder = leftDefinition?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = rightDefinition?.sortOrder ?? Number.MAX_SAFE_INTEGER;

  return leftOrder - rightOrder || left.id.localeCompare(right.id);
}

export function isAchievementTriggerType(value: string): value is AchievementTriggerType {
  return getEnabledAchievements().some((definition) => definition.trigger.type === value);
}
