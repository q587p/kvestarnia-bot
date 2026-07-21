import { Prisma, type PrismaClient } from "@prisma/client";
import { EQUIPMENT_ATTUNEMENT_ACTION_KEY } from "../../domain/equipment/equipmentAttunement";
import type { DailyActionRecord } from "./dailyActionRepository";
import type {
  DailyActionExactIdentity,
  DailyActionPrefixRead,
  QuestMarkerDailyActionCoverage,
  QuestMarkerReadSnapshot
} from "./questMarkerReadContext";
import { getIncludedRemortCount } from "./prismaRemortCount";

interface QuestMarkerDailyActionReadInput {
  exactIdentities: readonly DailyActionExactIdentity[];
  latestKeys: readonly string[];
  prefixReads: readonly DailyActionPrefixRead[];
  prefixCounts: readonly Omit<DailyActionPrefixRead, "take">[];
  currentLifeKeys: readonly string[];
}

export class PrismaQuestMarkerReadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async load(
    telegramUserId: bigint,
    input: {
      dailyActions: QuestMarkerDailyActionReadInput;
      cooldownKeys: readonly string[];
      itemIds: readonly string[];
    }
  ): Promise<QuestMarkerReadSnapshot> {
    const cooldownKeys = [...new Set(input.cooldownKeys)].slice(0, 93);
    const itemIds = [...new Set(input.itemIds)].slice(0, 93);
    const row = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      include: {
        user: { select: { lastSeenLocationId: true } },
        _count: { select: { remorts: true } },
        cooldowns: {
          where: { key: { in: cooldownKeys } },
          take: cooldownKeys.length
        },
        equipment: { orderBy: { slot: "asc" } },
        items: { where: { itemId: { in: itemIds } }, take: itemIds.length },
        drinkState: true,
        activeCombatLease: true
      }
    });

    if (!row) {
      return emptySnapshot(telegramUserId);
    }

    const {
      user,
      _count,
      cooldowns,
      equipment,
      items,
      drinkState,
      activeCombatLease,
      ...character
    } = row;
    const remortCount = getIncludedRemortCount({ _count });
    const exactIdentities = uniqueExactIdentities([
      ...input.dailyActions.exactIdentities,
      ...input.dailyActions.currentLifeKeys.map((key) => ({
        key,
        localDate: `life:${remortCount}`
      })),
      ...equipment.map((entry) => ({
        key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
        localDate: `${entry.slot}:${entry.id}:${entry.updatedAt.getTime()}`
      }))
    ]);
    const dailyActionCoverage = buildDailyActionCoverage(input.dailyActions, exactIdentities);
    const dailyActions = await loadDailyActions(
      this.prisma,
      character.id,
      dailyActionCoverage
    );
    const activeCombatSession = activeCombatLease
      ? await this.prisma.soloCombatSession.findUnique({ where: { id: activeCombatLease.referenceId } })
      : await this.prisma.soloCombatSession.findFirst({
          where: { characterId: character.id, status: "active" },
          orderBy: { updatedAt: "desc" }
        });

    return {
      telegramUserId,
      character: {
        ...character,
        currentLocationId: user.lastSeenLocationId,
        remortCount
      },
      dailyActions,
      dailyActionCoverage,
      cooldowns,
      equipment,
      items,
      drinkState,
      activeCombatLease,
      activeCombatSession
    };
  }
}

function emptySnapshot(telegramUserId: bigint): QuestMarkerReadSnapshot {
  return {
    telegramUserId,
    character: null,
    dailyActions: [],
    dailyActionCoverage: {
      exactIdentities: [],
      latestKeys: [],
      prefixReads: [],
      prefixCounts: []
    },
    cooldowns: [],
    equipment: [],
    items: [],
    drinkState: null,
    activeCombatLease: null,
    activeCombatSession: null
  };
}

function buildDailyActionCoverage(
  input: QuestMarkerDailyActionReadInput,
  exactIdentities: DailyActionExactIdentity[]
): QuestMarkerDailyActionCoverage {
  return {
    exactIdentities,
    latestKeys: [...new Set(input.latestKeys)].filter(Boolean),
    prefixReads: uniquePrefixReads(input.prefixReads),
    prefixCounts: uniquePrefixReads(input.prefixCounts).map((entry) => ({ ...entry, count: 0 }))
  };
}

async function loadDailyActions(
  prisma: PrismaClient,
  characterId: string,
  coverage: QuestMarkerDailyActionCoverage
): Promise<DailyActionRecord[]> {
  const selectors: Prisma.Sql[] = [];

  if (coverage.exactIdentities.length > 0) {
    selectors.push(Prisma.sql`
      SELECT id, character_id AS "characterId", key, local_date AS "localDate",
        reward_xp AS "rewardXp", reward_gold AS "rewardGold", spent_gold AS "spentGold",
        result_json AS "resultJson", created_at AS "createdAt"
      FROM daily_actions
      WHERE character_id = ${characterId}
        AND (${Prisma.join(coverage.exactIdentities.map((entry) => Prisma.sql`
          (key = ${entry.key} AND local_date = ${entry.localDate})
        `), " OR ")})
    `);
  }

  if (coverage.latestKeys.length > 0) {
    selectors.push(Prisma.sql`
      SELECT id, "characterId", key, "localDate", "rewardXp", "rewardGold", "spentGold",
        "resultJson", "createdAt"
      FROM (
        SELECT id, character_id AS "characterId", key, local_date AS "localDate",
          reward_xp AS "rewardXp", reward_gold AS "rewardGold", spent_gold AS "spentGold",
          result_json AS "resultJson", created_at AS "createdAt",
          ROW_NUMBER() OVER (PARTITION BY key ORDER BY created_at DESC) AS marker_rank
        FROM daily_actions
        WHERE character_id = ${characterId}
          AND key IN (${Prisma.join(coverage.latestKeys)})
      ) AS latest_actions
      WHERE marker_rank = 1
    `);
  }

  for (const entry of coverage.prefixReads) {
    selectors.push(Prisma.sql`
      SELECT * FROM (
        SELECT id, character_id AS "characterId", key, local_date AS "localDate",
          reward_xp AS "rewardXp", reward_gold AS "rewardGold", spent_gold AS "spentGold",
          result_json AS "resultJson", created_at AS "createdAt"
        FROM daily_actions
        WHERE character_id = ${characterId}
          AND key = ${entry.key}
          AND SUBSTR(local_date, 1, ${entry.localDatePrefix.length}) = ${entry.localDatePrefix}
        ORDER BY created_at ASC
        LIMIT ${entry.take}
      ) AS prefix_actions
    `);
  }

  const rows = selectors.length === 0
    ? []
    : await prisma.$queryRaw<RawDailyAction[]>(Prisma.sql`
        ${Prisma.join(selectors, " UNION ALL ")}
      `);
  const actions = new Map<string, DailyActionRecord>();
  for (const row of rows) {
    actions.set(row.id, mapRawDailyAction(row));
  }

  if (coverage.prefixCounts.length > 0) {
    const countRows = await prisma.$queryRaw<RawPrefixCount[]>(Prisma.sql`
      ${Prisma.join(coverage.prefixCounts.map((entry, index) => Prisma.sql`
        SELECT ${index} AS selector_index, COUNT(*) AS row_count
        FROM daily_actions
        WHERE character_id = ${characterId}
          AND key = ${entry.key}
          AND SUBSTR(local_date, 1, ${entry.localDatePrefix.length}) = ${entry.localDatePrefix}
      `), " UNION ALL ")}
    `);
    for (const row of countRows) {
      const entry = coverage.prefixCounts[Number(row.selector_index)];
      if (entry) {
        entry.count = Number(row.row_count);
      }
    }
  }

  return [...actions.values()];
}

interface RawDailyAction {
  id: string;
  characterId: string;
  key: string;
  localDate: string;
  rewardXp: number | bigint;
  rewardGold: number | bigint;
  spentGold: number | bigint;
  resultJson: Prisma.JsonValue | string | null;
  createdAt: Date | string;
}

interface RawPrefixCount {
  selector_index: number | bigint;
  row_count: number | bigint;
}

function mapRawDailyAction(row: RawDailyAction): DailyActionRecord {
  return {
    id: row.id,
    characterId: row.characterId,
    key: row.key,
    localDate: row.localDate,
    rewardXp: Number(row.rewardXp),
    rewardGold: Number(row.rewardGold),
    spentGold: Number(row.spentGold),
    resultJson: parseRawJson(row.resultJson),
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)
  };
}

function parseRawJson(value: Prisma.JsonValue | string | null): Prisma.JsonValue | null {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as Prisma.JsonValue;
  } catch {
    return value;
  }
}

function uniqueExactIdentities(
  identities: readonly DailyActionExactIdentity[]
): DailyActionExactIdentity[] {
  const seen = new Set<string>();
  return identities.filter((entry) => {
    const token = JSON.stringify([entry.key, entry.localDate]);
    if (!entry.key || seen.has(token)) {
      return false;
    }
    seen.add(token);
    return true;
  });
}

function uniquePrefixReads<T extends { key: string; localDatePrefix: string; take?: number }>(
  reads: readonly T[]
): Array<T & { take: number }> {
  const seen = new Set<string>();
  return reads.flatMap((entry) => {
    const token = JSON.stringify([entry.key, entry.localDatePrefix]);
    if (!entry.key || seen.has(token)) {
      return [];
    }
    seen.add(token);
    return [{ ...entry, take: Math.max(1, Math.min(93, Math.floor(entry.take ?? 1))) }];
  });
}
