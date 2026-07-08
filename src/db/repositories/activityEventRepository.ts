import type { Prisma } from "@prisma/client";

export const activityEventTypes = [
  "character.created",
  "character.level_reached",
  "party.raid_won",
  "raid.completed",
  "item.rare_received",
  "item.upgraded",
  "combat.underdog_won",
  "duel.completed",
  "duel.tournament_claimed"
] as const;
export type ActivityEventType = (typeof activityEventTypes)[number];

export const activityEventCategories = ["adventurer", "progression", "raid", "manatky", "combat"] as const;
export type ActivityEventCategory = (typeof activityEventCategories)[number];

export const activityEventSeverities = ["normal", "high", "legendary"] as const;
export type ActivityEventSeverity = (typeof activityEventSeverities)[number];

export type ActivityEventVisibility = "public";

export interface ActivityEventRecord {
  id: string;
  eventType: ActivityEventType;
  category: ActivityEventCategory;
  severity: ActivityEventSeverity;
  visibility: ActivityEventVisibility;
  actorCharacterId: string | null;
  actorDisplayName: string | null;
  relatedCharacterIds: Prisma.JsonValue | null;
  subjectKind: string | null;
  subjectId: string | null;
  subjectName: string | null;
  sourceType: string | null;
  sourceId: string | null;
  dedupeKey: string | null;
  payload: Prisma.JsonValue | null;
  occurredAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface RecordActivityEventInput {
  eventType: ActivityEventType;
  category: ActivityEventCategory;
  severity: ActivityEventSeverity;
  visibility?: ActivityEventVisibility | undefined;
  actorCharacterId?: string | undefined;
  actorDisplayName?: string | undefined;
  relatedCharacterIds?: readonly string[] | undefined;
  subjectKind?: string | undefined;
  subjectId?: string | undefined;
  subjectName?: string | undefined;
  sourceType?: string | undefined;
  sourceId?: string | undefined;
  dedupeKey?: string | undefined;
  payload?: Record<string, unknown> | undefined;
  occurredAt: Date;
  publishedAt?: Date | null | undefined;
}

export interface ListRecentActivityEventsQuery {
  categories?: readonly ActivityEventCategory[] | undefined;
  severities?: readonly ActivityEventSeverity[] | undefined;
  excludeRareManatky?: boolean | undefined;
  minimumUnderdogLevelDelta?: number | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  now?: Date | undefined;
  retentionDays?: number | undefined;
}

export interface ActivityEventPage {
  events: ActivityEventRecord[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export interface ActivityEventRepository {
  record(input: RecordActivityEventInput): Promise<ActivityEventRecord>;
  listRecent(query?: ListRecentActivityEventsQuery): Promise<ActivityEventPage>;
}
