import type { PrismaClient } from "@prisma/client";
import {
  LEVEL_MILESTONE_LOCAL_DATE,
  LEVEL_MILESTONE_MAX_LEVEL,
  LEVEL_MILESTONE_MIN_LEVEL,
  LEVEL_MILESTONE_KEY_PREFIX,
  buildLevelMilestoneKey,
  createLevelMilestone,
  type LevelMilestoneBoard,
  type LevelMilestoneEntry,
  type LevelMilestoneRepository
} from "./levelMilestoneRepository";

const DEFAULT_VISIBLE_LEVELS = 6;
const DEFAULT_VISIBLE_ENTRIES_PER_LEVEL = 3;

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
}
