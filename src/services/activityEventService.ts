import type {
  ActivityEventCategory,
  ActivityEventPage,
  ActivityEventRecord,
  ActivityEventRepository,
  ActivityEventSeverity,
  ListRecentActivityEventsQuery,
  RecordActivityEventInput
} from "../db/repositories/activityEventRepository";
import { LATEST_EVENTS_IMPORTANT_UNDERDOG_LEVEL_DELTA } from "./publicActivityEventPublisher";

export const LATEST_EVENTS_PAGE_SIZE = 15;
export const LATEST_EVENTS_RETENTION_DAYS = 93;

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
}

export function filterToQuery(filter: LatestEventFilter): {
  categories?: ActivityEventCategory[] | undefined;
  severities?: ActivityEventSeverity[] | undefined;
  excludeRareManatky?: boolean | undefined;
  minimumUnderdogLevelDelta?: number | undefined;
} {
  switch (filter) {
    case "imp":
      return {
        severities: ["high", "legendary"],
        excludeRareManatky: true,
        minimumUnderdogLevelDelta: LATEST_EVENTS_IMPORTANT_UNDERDOG_LEVEL_DELTA
      };
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
