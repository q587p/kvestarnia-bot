import { items } from "../content";
import { BIG_BARREL_BROTHER_RULES_VERSION } from "../domain/partyBoss/partyBoss";
import type { RewardLevelChange } from "../db/repositories/dailyActionRepository";
import type {
  ActivityEventCategory,
  ActivityEventPage,
  ActivityEventRecord,
  ActivityEventRepository,
  ActivityEventSeverity,
  ListRecentActivityEventsQuery,
  RecordActivityEventInput
} from "../db/repositories/activityEventRepository";
import type { PartyBossSessionRecord } from "../db/repositories/partyBossRepository";

export const LATEST_EVENTS_PAGE_SIZE = 15;
export const LATEST_EVENTS_RETENTION_DAYS = 93;
export const LATEST_EVENTS_PUBLIC_MIN_LEVEL = 2;
export const LATEST_EVENTS_MILESTONE_LEVELS = [5, 8, 10, 13] as const;
export const LATEST_EVENTS_UNDERDOG_LEVEL_DELTA = 5;
export const LATEST_EVENTS_PUBLIC_ITEM_RARITIES = ["rare", "epic"] as const;
export const LATEST_EVENTS_LEGENDARY_ITEM_RARITIES = ["epic"] as const;

export const latestEventFilters = ["all", "imp", "adv", "cmb", "itm"] as const;
export type LatestEventFilter = (typeof latestEventFilters)[number];

export class ActivityEventService {
  constructor(private readonly events: ActivityEventRepository) {}

  record(input: RecordActivityEventInput): Promise<ActivityEventRecord> {
    return this.events.record(input);
  }

  async recordSafely(input: RecordActivityEventInput): Promise<ActivityEventRecord | null> {
    try {
      return await this.record(input);
    } catch {
      return null;
    }
  }

  listRecent(
    filter: LatestEventFilter = "all",
    query: Omit<ListRecentActivityEventsQuery, "categories" | "severities"> = {}
  ): Promise<ActivityEventPage> {
    return this.events.listRecent({
      pageSize: LATEST_EVENTS_PAGE_SIZE,
      retentionDays: LATEST_EVENTS_RETENTION_DAYS,
      ...filterToQuery(filter),
      ...query
    });
  }

  recordCharacterCreatedSafely(input: {
    characterId: string;
    actorDisplayName: string;
    occurredAt: Date;
  }): Promise<ActivityEventRecord | null> {
    return this.recordSafely({
      eventType: "character.created",
      category: "adventurer",
      severity: "normal",
      actorCharacterId: input.characterId,
      actorDisplayName: input.actorDisplayName,
      sourceType: "character",
      sourceId: input.characterId,
      dedupeKey: `character.created:${input.characterId}`,
      occurredAt: input.occurredAt
    });
  }

  async recordRewardEventsSafely(input: {
    characterId: string;
    actorDisplayName?: string | undefined;
    sourceId: string;
    sourceType: string;
    occurredAt: Date;
    levelChange?: RewardLevelChange | null | undefined;
    itemIds?: readonly string[] | undefined;
  }): Promise<void> {
    if (input.levelChange?.leveledUp && input.levelChange.newLevel >= LATEST_EVENTS_PUBLIC_MIN_LEVEL) {
      const level = input.levelChange.newLevel;
      await this.recordSafely({
        eventType: "character.level_reached",
        category: "progression",
        severity: isMilestoneLevel(level) ? "high" : "normal",
        actorCharacterId: input.characterId,
        actorDisplayName: input.actorDisplayName,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        dedupeKey: `character.level_reached:${input.characterId}:${level}`,
        payload: { level },
        occurredAt: input.occurredAt
      });
    }

    for (const itemId of new Set(input.itemIds ?? [])) {
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item || (item.rarity !== "rare" && item.rarity !== "epic")) {
        continue;
      }
      const rarity = item.rarity;

      await this.recordSafely({
        eventType: "item.rare_received",
        category: "manatky",
        severity: rarity === "epic" ? "legendary" : "high",
        actorCharacterId: input.characterId,
        actorDisplayName: input.actorDisplayName,
        subjectKind: "item",
        subjectId: item.id,
        subjectName: item.name,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        dedupeKey: `item.rare_received:${input.sourceType}:${input.sourceId}:${input.characterId}:${item.id}`,
        payload: { rarity },
        occurredAt: input.occurredAt
      });
    }
  }

  recordUnderdogCombatWinSafely(input: {
    characterId: string;
    actorDisplayName: string;
    combatSessionId: string;
    monsterId: string;
    monsterName: string;
    monsterLevel: number;
    characterLevel: number;
    occurredAt: Date;
  }): Promise<ActivityEventRecord | null> {
    const delta = Math.floor(input.monsterLevel) - Math.floor(input.characterLevel);
    if (delta < LATEST_EVENTS_UNDERDOG_LEVEL_DELTA) {
      return Promise.resolve(null);
    }

    return this.recordSafely({
      eventType: "combat.underdog_won",
      category: "combat",
      severity: "high",
      actorCharacterId: input.characterId,
      actorDisplayName: input.actorDisplayName,
      subjectKind: "monster",
      subjectId: input.monsterId,
      subjectName: input.monsterName,
      sourceType: "solo-combat",
      sourceId: input.combatSessionId,
      dedupeKey: `combat.underdog_won:${input.combatSessionId}`,
      payload: { levelDelta: delta },
      occurredAt: input.occurredAt
    });
  }

  recordPartyRaidWonSafely(session: PartyBossSessionRecord): Promise<ActivityEventRecord | null> {
    if (session.status !== "won" || session.rulesVersion !== BIG_BARREL_BROTHER_RULES_VERSION) {
      return Promise.resolve(null);
    }

    const occurredAt = session.completedAt ?? parseDate(session.state.completedAt) ?? new Date();
    const participantCount = Math.max(1, session.state.participants.length || session.participants.length);

    return this.recordSafely({
      eventType: "party.raid_won",
      category: "raid",
      severity: "high",
      relatedCharacterIds: session.state.participants.map((participant) => participant.characterId),
      subjectKind: "monster",
      subjectId: session.state.boss.monsterId,
      subjectName: session.state.boss.name,
      sourceType: "party-boss",
      sourceId: session.id,
      dedupeKey: `party.raid_won:${session.id}`,
      payload: { participantCount },
      occurredAt
    });
  }
}

export function filterToQuery(filter: LatestEventFilter): {
  categories?: ActivityEventCategory[] | undefined;
  severities?: ActivityEventSeverity[] | undefined;
} {
  switch (filter) {
    case "imp":
      return { severities: ["high", "legendary"] };
    case "adv":
      return { categories: ["adventurer", "progression"] };
    case "cmb":
      return { categories: ["combat", "raid"] };
    case "itm":
      return { categories: ["manatky"] };
    case "all":
    default:
      return { severities: ["normal", "high", "legendary"] };
  }
}

function isMilestoneLevel(level: number): boolean {
  return LATEST_EVENTS_MILESTONE_LEVELS.includes(level as (typeof LATEST_EVENTS_MILESTONE_LEVELS)[number]);
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
