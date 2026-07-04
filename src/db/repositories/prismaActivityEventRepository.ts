import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ActivityEventCategory,
  ActivityEventPage,
  ActivityEventRecord,
  ActivityEventRepository,
  ActivityEventSeverity,
  ActivityEventType,
  ListRecentActivityEventsQuery,
  RecordActivityEventInput
} from "./activityEventRepository";

const DEFAULT_PAGE_SIZE = 15;
const DEFAULT_RETENTION_DAYS = 93;

export class PrismaActivityEventRepository implements ActivityEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordActivityEventInput): Promise<ActivityEventRecord> {
    try {
      const data: Prisma.ActivityEventCreateInput = {
        eventType: input.eventType,
        category: input.category,
        severity: input.severity,
        visibility: input.visibility ?? "public",
        actorCharacterId: input.actorCharacterId ?? null,
        actorDisplayName: input.actorDisplayName ?? null,
        subjectKind: input.subjectKind ?? null,
        subjectId: input.subjectId ?? null,
        subjectName: input.subjectName ?? null,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        occurredAt: input.occurredAt,
        publishedAt: input.publishedAt ?? null,
        ...(input.relatedCharacterIds ? { relatedCharacterIds: [...input.relatedCharacterIds] } : {}),
        ...(input.payload ? { payloadJson: input.payload as Prisma.InputJsonObject } : {})
      };
      const row = await this.prisma.activityEvent.create({
        data
      });
      return toRecord(row);
    } catch (error) {
      if (isUniqueConstraintError(error) && input.dedupeKey) {
        const existing = await this.prisma.activityEvent.findUnique({
          where: { dedupeKey: input.dedupeKey }
        });
        if (existing) {
          return toRecord(existing);
        }
      }

      throw error;
    }
  }

  async listRecent(query: ListRecentActivityEventsQuery = {}): Promise<ActivityEventPage> {
    const pageSize = clampInteger(query.pageSize ?? DEFAULT_PAGE_SIZE, 1, 25);
    const page = clampInteger(query.page ?? 0, 0, 9999);
    const retentionDays = clampInteger(query.retentionDays ?? DEFAULT_RETENTION_DAYS, 1, 3660);
    const since = new Date((query.now ?? new Date()).getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const notFilters: Prisma.ActivityEventWhereInput[] = [];

    if (query.excludeRareManatky) {
      notFilters.push({
        eventType: "item.rare_received",
        payloadJson: {
          path: "$.rarity",
          equals: "rare"
        }
      });
    }

    const where: Prisma.ActivityEventWhereInput = {
      visibility: "public",
      occurredAt: { gte: since },
      ...(query.categories && query.categories.length > 0 ? { category: { in: [...query.categories] } } : {}),
      ...(query.severities && query.severities.length > 0 ? { severity: { in: [...query.severities] } } : {}),
      ...(notFilters.length > 0 ? { NOT: notFilters } : {})
    };

    const minimumUnderdogLevelDelta = typeof query.minimumUnderdogLevelDelta === "number"
      ? Math.floor(query.minimumUnderdogLevelDelta)
      : null;

    const rows = minimumUnderdogLevelDelta === null
      ? await this.prisma.activityEvent.findMany({
          where,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          skip: page * pageSize,
          take: pageSize + 1
        })
      : await this.listRecentWithUnderdogThreshold({
          where,
          page,
          pageSize,
          minimumUnderdogLevelDelta
        });

    return {
      events: rows.slice(0, pageSize).map(toRecord),
      page,
      pageSize,
      hasNextPage: rows.length > pageSize
    };
  }

  private async listRecentWithUnderdogThreshold(input: {
    where: Prisma.ActivityEventWhereInput;
    page: number;
    pageSize: number;
    minimumUnderdogLevelDelta: number;
  }) {
    const requiredRows = (input.page + 1) * input.pageSize + 1;
    const batchSize = Math.max(input.pageSize * 4, 25);
    const rows: Awaited<ReturnType<PrismaClient["activityEvent"]["findMany"]>> = [];
    let skip = 0;

    while (rows.length < requiredRows) {
      const batch = await this.prisma.activityEvent.findMany({
        where: input.where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip,
        take: batchSize
      });
      rows.push(...batch.filter((row) => keepsUnderdogThreshold(row, input.minimumUnderdogLevelDelta)));

      if (batch.length < batchSize) {
        break;
      }
      skip += batchSize;
    }

    return rows.slice(input.page * input.pageSize, (input.page + 1) * input.pageSize + 1);
  }
}

function keepsUnderdogThreshold(
  row: { eventType: string; payloadJson: Prisma.JsonValue | null },
  minimumUnderdogLevelDelta: number
): boolean {
  if (row.eventType !== "combat.underdog_won") {
    return true;
  }

  const levelDelta = readPayloadNumber(row.payloadJson, "levelDelta");
  return levelDelta !== null && levelDelta >= minimumUnderdogLevelDelta;
}

function readPayloadNumber(payload: Prisma.JsonValue | null, key: string): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toRecord(row: {
  id: string;
  eventType: string;
  category: string;
  severity: string;
  visibility: string;
  actorCharacterId: string | null;
  actorDisplayName: string | null;
  relatedCharacterIds: Prisma.JsonValue | null;
  subjectKind: string | null;
  subjectId: string | null;
  subjectName: string | null;
  sourceType: string | null;
  sourceId: string | null;
  dedupeKey: string | null;
  payloadJson: Prisma.JsonValue | null;
  occurredAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
}): ActivityEventRecord {
  return {
    id: row.id,
    eventType: row.eventType as ActivityEventType,
    category: row.category as ActivityEventCategory,
    severity: row.severity as ActivityEventSeverity,
    visibility: "public",
    actorCharacterId: row.actorCharacterId,
    actorDisplayName: row.actorDisplayName,
    relatedCharacterIds: row.relatedCharacterIds,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    dedupeKey: row.dedupeKey,
    payload: row.payloadJson,
    occurredAt: row.occurredAt,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)));
}
