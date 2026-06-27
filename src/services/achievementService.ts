import {
  achievements,
  getAchievementDefinition,
  getEnabledAchievements,
  type AchievementDefinition,
  type AchievementTriggerType
} from "../content/achievements";
import type {
  AchievementRepository,
  AchievementUnlockSource,
  CharacterAchievementProgressRecord,
  CharacterAchievementRecord,
  CharacterCosmeticTitleGrantRecord
} from "../db/repositories/achievementRepository";

export const ACHIEVEMENTS_PAGE_SIZE = 10;

export type AchievementEvent =
  | {
      type: "character.created";
      characterId: string;
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
      type: "equipment.item_equipped";
      characterId: string;
      itemId: string;
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
  page: number;
  totalPages: number;
}

export class AchievementService {
  constructor(private readonly achievementsRepository: AchievementRepository) {}

  async listForCharacter(characterId: string, requestedPage = 0): Promise<AchievementListView> {
    const snapshot = await this.achievementsRepository.listForCharacter(characterId);
    const entries = buildListEntries(snapshot.achievements, snapshot.progress, snapshot.titleGrants);
    const totalPages = Math.max(1, Math.ceil(entries.length / ACHIEVEMENTS_PAGE_SIZE));
    const page = Math.max(0, Math.min(Math.floor(requestedPage), totalPages - 1));

    return {
      entries: entries.slice(page * ACHIEVEMENTS_PAGE_SIZE, (page + 1) * ACHIEVEMENTS_PAGE_SIZE),
      earnedCount: entries.filter((entry) => entry.earned).length,
      totalCount: entries.length,
      page,
      totalPages
    };
  }

  async trackEvent(event: AchievementEvent): Promise<AchievementUnlock[]> {
    const matching = getEnabledAchievements().filter((definition) => matchesEvent(definition, event));
    const unlocks: AchievementUnlock[] = [];

    for (const definition of matching) {
      if (definition.progressTarget && event.type === "level.reached") {
        await this.achievementsRepository.updateProgressMax({
          characterId: event.characterId,
          achievementId: definition.id,
          current: Math.min(event.level, definition.progressTarget),
          target: definition.progressTarget
        });
      }

      if (!isThresholdMet(definition, event)) {
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
}

function matchesEvent(definition: AchievementDefinition, event: AchievementEvent): boolean {
  if (definition.trigger.type !== event.type) {
    return false;
  }

  switch (event.type) {
    case "combat.finished":
      if (definition.id === "achievement.combat.first-win") {
        return event.outcome === "won";
      }
      if (definition.id === "achievement.combat.first-loss") {
        return event.outcome === "lost";
      }
      return false;
    case "item.received":
      return event.itemIds.length > 0;
    default:
      return true;
  }
}

function isThresholdMet(definition: AchievementDefinition, event: AchievementEvent): boolean {
  if (definition.trigger.type === "level.reached") {
    return event.type === "level.reached" && event.level >= (definition.trigger.threshold ?? 1);
  }

  return true;
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
    case "equipment.item_equipped":
      return { itemId: event.itemId };
    case "character.created":
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
  const entries = achievements.map((definition) =>
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
