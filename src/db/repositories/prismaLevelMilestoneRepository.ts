import type { PrismaClient } from "@prisma/client";
import {
  LEVEL_MILESTONE_LOCAL_DATE,
  LEVEL_MILESTONE_MAX_LEVEL,
  LEVEL_MILESTONE_MIN_LEVEL,
  LEVEL_MILESTONE_VISIBLE_LEVELS,
  REMORT_LEVEL_MILESTONE_MIN_LEVEL,
  REMORT_LEVEL_MILESTONE_VISIBLE_LEVELS,
  LEVEL_MILESTONE_KEY_PREFIX,
  REMORT_LEVEL_MILESTONE_KEY_PREFIX,
  buildLevelMilestoneKey,
  buildRemortLevelMilestoneKey,
  createLevelMilestone,
  type LevelMilestoneBoard,
  type LevelMilestoneEntry,
  type LevelMilestoneRepository
} from "./levelMilestoneRepository";

const DEFAULT_VISIBLE_LEVELS = LEVEL_MILESTONE_VISIBLE_LEVELS;
const DEFAULT_VISIBLE_ENTRIES_PER_LEVEL = 3;
const DEFAULT_REMORT_VISIBLE_LEVELS = REMORT_LEVEL_MILESTONE_VISIBLE_LEVELS;

export class PrismaLevelMilestoneRepository implements LevelMilestoneRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async backfillCurrentLevels(): Promise<void> {
    const characters = await this.prisma.character.findMany({
      where: {
        level: {
          gte: LEVEL_MILESTONE_MIN_LEVEL
        }
      },
      select: {
        id: true,
        level: true,
        updatedAt: true,
        remorts: {
          select: {
            remortNumber: true
          },
          orderBy: {
            remortNumber: "asc"
          }
        }
      }
    });
    const existingRecords = await this.prisma.dailyAction.findMany({
      where: {
        OR: [
          {
            key: {
              startsWith: LEVEL_MILESTONE_KEY_PREFIX
            }
          },
          {
            key: {
              startsWith: REMORT_LEVEL_MILESTONE_KEY_PREFIX
            }
          }
        ],
        localDate: LEVEL_MILESTONE_LOCAL_DATE
      },
      select: {
        characterId: true,
        key: true
      }
    });
    const existingKeys = new Set(
      existingRecords.map((record) => `${record.characterId}:${record.key}`)
    );

    for (const character of characters) {
      const reachedAt = character.updatedAt;
      const highestLevel = Math.min(character.level, LEVEL_MILESTONE_MAX_LEVEL);
      const remortCount = character.remorts.at(-1)?.remortNumber ?? 0;

      for (let level = LEVEL_MILESTONE_MIN_LEVEL; level <= highestLevel; level += 1) {
        const key =
          remortCount > 0
            ? buildRemortLevelMilestoneKey(remortCount, level)
            : buildLevelMilestoneKey(level);

        if (existingKeys.has(`${character.id}:${key}`)) {
          continue;
        }

        await createLevelMilestone(this.prisma, {
          characterId: character.id,
          level,
          reachedAt,
          remortCount,
          provenance: "backfill-current-level"
        });
        existingKeys.add(`${character.id}:${key}`);
      }
    }
  }

  async listFirstReachedLevels(input: {
    maxLevels?: number;
    maxEntriesPerLevel?: number;
  } = {}): Promise<LevelMilestoneBoard> {
    const maxLevels = input.maxLevels ?? DEFAULT_VISIBLE_LEVELS;
    const maxEntriesPerLevel = input.maxEntriesPerLevel ?? DEFAULT_VISIBLE_ENTRIES_PER_LEVEL;
    const levels = await this.findKnownLevels(maxLevels);
    const groups = await Promise.all(
      levels.map(async (level) => ({
        level,
        entries: await this.findFirstEntriesForLevel(level, maxEntriesPerLevel)
      }))
    );

    return {
      levels: groups.filter((group) => group.entries.length > 0)
    };
  }

  async listFirstReachedLevelsForRemort(
    remortNumber: number,
    input: {
      maxLevels?: number;
      maxEntriesPerLevel?: number;
    } = {}
  ): Promise<LevelMilestoneBoard> {
    if (!Number.isInteger(remortNumber) || remortNumber < 1) {
      return { levels: [] };
    }

    const maxLevels = input.maxLevels ?? DEFAULT_REMORT_VISIBLE_LEVELS;
    const maxEntriesPerLevel = input.maxEntriesPerLevel ?? DEFAULT_VISIBLE_ENTRIES_PER_LEVEL;
    const levels = getRemortMilestoneLevels(maxLevels);
    const groups = await Promise.all(
      levels.map(async (level) => ({
        level,
        entries: await this.findFirstEntriesForRemortLevel(
          remortNumber,
          level,
          maxEntriesPerLevel
        )
      }))
    );

    return {
      levels: groups.filter((group) => group.entries.length > 0)
    };
  }

  private async findKnownLevels(maxLevels: number): Promise<number[]> {
    const records = await this.prisma.dailyAction.findMany({
      where: {
        key: {
          startsWith: LEVEL_MILESTONE_KEY_PREFIX
        },
        localDate: LEVEL_MILESTONE_LOCAL_DATE
      },
      select: {
        key: true
      }
    });
    const levels = new Set<number>();

    for (const record of records) {
      const level = Number(record.key.slice(LEVEL_MILESTONE_KEY_PREFIX.length));

      if (Number.isInteger(level) && level >= LEVEL_MILESTONE_MIN_LEVEL) {
        levels.add(level);
      }
    }

    return [...levels].sort((left, right) => right - left).slice(0, maxLevels);
  }

  private async findFirstEntriesForLevel(
    level: number,
    limit: number
  ): Promise<LevelMilestoneEntry[]> {
    const records = await this.prisma.dailyAction.findMany({
      where: {
        key: buildLevelMilestoneKey(level),
        localDate: LEVEL_MILESTONE_LOCAL_DATE
      },
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          id: "asc"
        }
      ],
      take: limit,
      select: {
        key: true,
        characterId: true,
        createdAt: true,
        resultJson: true,
        character: {
          select: {
            name: true,
            user: {
              select: {
                telegramUserId: true
              }
            }
          }
        }
      }
    });

    return records.map((record, index) => ({
      rank: index + 1,
      telegramUserId: record.character.user.telegramUserId,
      characterId: record.characterId,
      name: record.character.name,
      level,
      reachedAt: record.createdAt
    }));
  }

  private async findFirstEntriesForRemortLevel(
    remortNumber: number,
    level: number,
    limit: number
  ): Promise<LevelMilestoneEntry[]> {
    if (level === 1) {
      return this.findLevelOneEntriesForRemort(remortNumber, limit);
    }

    const milestoneEntries = await this.findDailyActionEntriesForRemortLevel(
      remortNumber,
      level,
      limit
    );

    if (level !== LEVEL_MILESTONE_MAX_LEVEL) {
      return milestoneEntries;
    }

    const completionEntries = await this.findRemortCompletionEntries(remortNumber + 1, limit);

    return mergeMilestoneEntries(milestoneEntries, completionEntries, limit);
  }

  private async findDailyActionEntriesForRemortLevel(
    remortNumber: number,
    level: number,
    limit: number
  ): Promise<LevelMilestoneEntry[]> {
    const records = await this.prisma.dailyAction.findMany({
      where: {
        key: {
          in: [buildRemortLevelMilestoneKey(remortNumber, level), buildLevelMilestoneKey(level)]
        },
        localDate: LEVEL_MILESTONE_LOCAL_DATE
      },
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          id: "asc"
        }
      ],
      select: {
        key: true,
        characterId: true,
        createdAt: true,
        resultJson: true,
        character: {
          select: {
            name: true,
            remorts: {
              select: {
                remortNumber: true,
                createdAt: true
              },
              orderBy: {
                remortNumber: "asc"
              }
            },
            user: {
              select: {
                telegramUserId: true
              }
            }
          }
        }
      }
    });
    const candidates: Array<LevelMilestoneEntry & { milestoneKey: string; backfilled: boolean }> = [];

    for (const record of records) {
      if (!isMilestoneInRemortLife(record.createdAt, record.character.remorts, remortNumber)) {
        continue;
      }

      candidates.push({
        rank: 0,
        telegramUserId: record.character.user.telegramUserId,
        characterId: record.characterId,
        name: record.character.name,
        level,
        reachedAt: record.createdAt,
        milestoneKey: record.key,
        backfilled: isBackfilledMilestone(record.resultJson)
      });
    }

    return dedupeRemortMilestoneEntries(candidates, remortNumber, level, limit);
  }

  private async findLevelOneEntriesForRemort(
    remortNumber: number,
    limit: number
  ): Promise<LevelMilestoneEntry[]> {
    const rows = await this.prisma.characterRemort.findMany({
      where: {
        remortNumber
      },
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          id: "asc"
        }
      ],
      take: limit,
      select: {
        characterId: true,
        createdAt: true,
        displayNameSnapshot: true,
        character: {
          select: {
            name: true,
            user: {
              select: {
                telegramUserId: true
              }
            }
          }
        }
      }
    });

    return rows.map((row, index) => ({
      rank: index + 1,
      telegramUserId: row.character.user.telegramUserId,
      characterId: row.characterId,
      name: row.character.name || row.displayNameSnapshot,
      level: 1,
      reachedAt: row.createdAt
    }));
  }

  private async findRemortCompletionEntries(
    remortNumber: number,
    limit: number
  ): Promise<LevelMilestoneEntry[]> {
    const rows = await this.prisma.characterRemort.findMany({
      where: {
        remortNumber
      },
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          id: "asc"
        }
      ],
      take: limit,
      select: {
        characterId: true,
        createdAt: true,
        displayNameSnapshot: true,
        character: {
          select: {
            user: {
              select: {
                telegramUserId: true
              }
            }
          }
        }
      }
    });

    return rows.map((row, index) => ({
      rank: index + 1,
      telegramUserId: row.character.user.telegramUserId,
      characterId: row.characterId,
      name: row.displayNameSnapshot,
      level: LEVEL_MILESTONE_MAX_LEVEL,
      reachedAt: row.createdAt
    }));
  }
}

function getRemortMilestoneLevels(maxLevels: number): number[] {
  const levels: number[] = [];

  for (let level = LEVEL_MILESTONE_MAX_LEVEL; level >= REMORT_LEVEL_MILESTONE_MIN_LEVEL; level -= 1) {
    levels.push(level);
  }

  return levels.slice(0, maxLevels);
}

function isMilestoneInRemortLife(
  reachedAt: Date,
  remorts: Array<{ remortNumber: number; createdAt: Date }>,
  remortNumber: number
): boolean {
  const selectedRemort = remorts.find((remort) => remort.remortNumber === remortNumber);
  const nextRemort = remorts.find((remort) => remort.remortNumber === remortNumber + 1);

  if (!selectedRemort) {
    return false;
  }

  if (reachedAt < selectedRemort.createdAt) {
    return false;
  }

  if (nextRemort && reachedAt > nextRemort.createdAt) {
    return false;
  }

  return true;
}

function mergeMilestoneEntries(
  primary: LevelMilestoneEntry[],
  fallback: LevelMilestoneEntry[],
  limit: number
): LevelMilestoneEntry[] {
  const seen = new Set<string>();
  const merged: LevelMilestoneEntry[] = [];

  for (const entry of [...primary, ...fallback].sort(
    (left, right) =>
      left.reachedAt.getTime() - right.reachedAt.getTime() ||
      left.characterId.localeCompare(right.characterId)
  )) {
    if (seen.has(entry.characterId)) {
      continue;
    }

    seen.add(entry.characterId);
    merged.push({
      ...entry,
      rank: merged.length + 1
    });

    if (merged.length >= limit) {
      break;
    }
  }

  return merged;
}

function dedupeRemortMilestoneEntries(
  entries: Array<LevelMilestoneEntry & { milestoneKey: string; backfilled: boolean }>,
  remortNumber: number,
  level: number,
  limit: number
): LevelMilestoneEntry[] {
  const explicitKey = buildRemortLevelMilestoneKey(remortNumber, level);
  const byCharacter = new Map<string, LevelMilestoneEntry & { milestoneKey: string; backfilled: boolean }>();

  for (const entry of entries.sort(compareMilestoneCandidates)) {
    const current = byCharacter.get(entry.characterId);
    if (!current || compareMilestonePreference(entry, current, explicitKey) < 0) {
      byCharacter.set(entry.characterId, entry);
    }
  }

  return [...byCharacter.values()]
    .sort((left, right) =>
      left.reachedAt.getTime() - right.reachedAt.getTime() ||
      left.characterId.localeCompare(right.characterId)
    )
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      telegramUserId: entry.telegramUserId,
      characterId: entry.characterId,
      name: entry.name,
      level: entry.level,
      reachedAt: entry.reachedAt
    }));
}

function compareMilestoneCandidates(
  left: LevelMilestoneEntry & { milestoneKey: string; backfilled: boolean },
  right: LevelMilestoneEntry & { milestoneKey: string; backfilled: boolean }
): number {
  return left.reachedAt.getTime() - right.reachedAt.getTime() ||
    left.characterId.localeCompare(right.characterId) ||
    left.milestoneKey.localeCompare(right.milestoneKey);
}

function compareMilestonePreference(
  left: LevelMilestoneEntry & { milestoneKey: string; backfilled: boolean },
  right: LevelMilestoneEntry & { milestoneKey: string; backfilled: boolean },
  explicitKey: string
): number {
  const leftScore = milestonePreferenceScore(left, explicitKey);
  const rightScore = milestonePreferenceScore(right, explicitKey);

  return leftScore - rightScore ||
    left.reachedAt.getTime() - right.reachedAt.getTime() ||
    left.milestoneKey.localeCompare(right.milestoneKey);
}

function milestonePreferenceScore(
  entry: { milestoneKey: string; backfilled: boolean },
  explicitKey: string
): number {
  if (entry.milestoneKey === explicitKey && !entry.backfilled) {
    return 0;
  }

  if (entry.milestoneKey !== explicitKey) {
    return 1;
  }

  return 2;
}

function isBackfilledMilestone(resultJson: unknown): boolean {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return false;
  }

  const milestone = (resultJson as { milestone?: unknown }).milestone;
  if (!milestone || typeof milestone !== "object" || Array.isArray(milestone)) {
    return false;
  }

  return (milestone as { provenance?: unknown }).provenance === "backfill-current-level";
}
