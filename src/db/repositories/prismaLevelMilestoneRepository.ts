import type { PrismaClient } from "@prisma/client";
import {
  LEVEL_MILESTONE_LOCAL_DATE,
  LEVEL_MILESTONE_MAX_LEVEL,
  LEVEL_MILESTONE_MIN_LEVEL,
  LEVEL_MILESTONE_VISIBLE_LEVELS,
  REMORT_LEVEL_MILESTONE_MIN_LEVEL,
  REMORT_LEVEL_MILESTONE_VISIBLE_LEVELS,
  LEVEL_MILESTONE_KEY_PREFIX,
  buildLevelMilestoneKey,
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
        updatedAt: true
      }
    });
    const existingRecords = await this.prisma.dailyAction.findMany({
      where: {
        key: {
          startsWith: LEVEL_MILESTONE_KEY_PREFIX
        },
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

      for (let level = LEVEL_MILESTONE_MIN_LEVEL; level <= highestLevel; level += 1) {
        const key = buildLevelMilestoneKey(level);

        if (existingKeys.has(`${character.id}:${key}`)) {
          continue;
        }

        await createLevelMilestone(this.prisma, {
          characterId: character.id,
          level,
          reachedAt
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
        characterId: true,
        createdAt: true,
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

    const completionEntries = await this.findRemortCompletionEntries(remortNumber, limit);

    return mergeMilestoneEntries(milestoneEntries, completionEntries, limit);
  }

  private async findDailyActionEntriesForRemortLevel(
    remortNumber: number,
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
      select: {
        characterId: true,
        createdAt: true,
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
    const entries: LevelMilestoneEntry[] = [];

    for (const record of records) {
      if (!isMilestoneInRemortLife(record.createdAt, record.character.remorts, remortNumber)) {
        continue;
      }

      entries.push({
        rank: entries.length + 1,
        telegramUserId: record.character.user.telegramUserId,
        characterId: record.characterId,
        name: record.character.name,
        level,
        reachedAt: record.createdAt
      });

      if (entries.length >= limit) {
        break;
      }
    }

    return entries;
  }

  private async findLevelOneEntriesForRemort(
    remortNumber: number,
    limit: number
  ): Promise<LevelMilestoneEntry[]> {
    if (remortNumber === 1) {
      const characters = await this.prisma.character.findMany({
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
          id: true,
          name: true,
          createdAt: true,
          user: {
            select: {
              telegramUserId: true
            }
          }
        }
      });

      return characters.map((character, index) => ({
        rank: index + 1,
        telegramUserId: character.user.telegramUserId,
        characterId: character.id,
        name: character.name,
        level: 1,
        reachedAt: character.createdAt
      }));
    }

    const rows = await this.prisma.characterRemort.findMany({
      where: {
        remortNumber: remortNumber - 1
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
  const previousRemort = remorts.find((remort) => remort.remortNumber === remortNumber - 1);
  const currentRemort = remorts.find((remort) => remort.remortNumber === remortNumber);

  if (remortNumber > 1 && !previousRemort) {
    return false;
  }

  if (previousRemort && reachedAt < previousRemort.createdAt) {
    return false;
  }

  if (currentRemort && reachedAt > currentRemort.createdAt) {
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
