import { Prisma } from "@prisma/client";

export const LEVEL_MILESTONE_KEY_PREFIX = "milestone.level.";
export const REMORT_LEVEL_MILESTONE_KEY_PREFIX = "milestone.remort.";
export const LEVEL_MILESTONE_LOCAL_DATE = "once";
export const LEVEL_MILESTONE_MIN_LEVEL = 2;
export const LEVEL_MILESTONE_MAX_LEVEL = 13;
export const LEVEL_MILESTONE_VISIBLE_LEVELS = LEVEL_MILESTONE_MAX_LEVEL - LEVEL_MILESTONE_MIN_LEVEL + 1;
export const REMORT_LEVEL_MILESTONE_MIN_LEVEL = 1;
export const REMORT_LEVEL_MILESTONE_VISIBLE_LEVELS =
  LEVEL_MILESTONE_MAX_LEVEL - REMORT_LEVEL_MILESTONE_MIN_LEVEL + 1;

export interface LevelMilestoneEntry {
  rank: number;
  telegramUserId: bigint;
  characterId: string;
  name: string;
  level: number;
  reachedAt: Date;
}

export interface LevelMilestoneGroup {
  level: number;
  entries: LevelMilestoneEntry[];
}

export interface LevelMilestoneBoard {
  levels: LevelMilestoneGroup[];
}

export interface LevelMilestoneRepository {
  backfillCurrentLevels(): Promise<void>;
  listFirstReachedLevels(input?: {
    maxLevels?: number;
    maxEntriesPerLevel?: number;
  }): Promise<LevelMilestoneBoard>;
  listFirstReachedLevelsForRemort(
    remortNumber: number,
    input?: {
      maxLevels?: number;
      maxEntriesPerLevel?: number;
    }
  ): Promise<LevelMilestoneBoard>;
}

type LevelMilestoneWriter = Pick<Prisma.TransactionClient, "dailyAction">;

export function buildLevelMilestoneKey(level: number): string {
  return `${LEVEL_MILESTONE_KEY_PREFIX}${level}`;
}

export function buildRemortLevelMilestoneKey(remortNumber: number, level: number): string {
  return `${REMORT_LEVEL_MILESTONE_KEY_PREFIX}${remortNumber}.level.${level}`;
}

export function parseLevelMilestoneKey(key: string): number | null {
  if (!key.startsWith(LEVEL_MILESTONE_KEY_PREFIX)) {
    return null;
  }

  const value = Number(key.slice(LEVEL_MILESTONE_KEY_PREFIX.length));

  return Number.isInteger(value) && value >= LEVEL_MILESTONE_MIN_LEVEL ? value : null;
}

export async function recordLevelMilestones(
  tx: LevelMilestoneWriter,
  characterId: string,
  oldLevel: number,
  newLevel: number,
  reachedAt?: Date,
  options: { remortCount?: number } = {}
): Promise<void> {
  for (const level of getReachedMilestoneLevels(oldLevel, newLevel)) {
    await createLevelMilestone(tx, {
      characterId,
      level,
      ...(reachedAt ? { reachedAt } : {}),
      remortCount: options.remortCount ?? 0,
      provenance: "recorded"
    });
  }
}

export async function createLevelMilestone(
  tx: LevelMilestoneWriter,
  input: {
    characterId: string;
    level: number;
    reachedAt?: Date;
    remortCount?: number;
    provenance?: "recorded" | "backfill-current-level";
  }
): Promise<void> {
  const remortCount = input.remortCount ?? 0;

  try {
    await tx.dailyAction.create({
      data: {
        characterId: input.characterId,
        key:
          remortCount > 0
            ? buildRemortLevelMilestoneKey(remortCount, input.level)
            : buildLevelMilestoneKey(input.level),
        localDate: LEVEL_MILESTONE_LOCAL_DATE,
        rewardXp: 0,
        rewardGold: 0,
        resultJson: {
          milestone: {
            kind: "level",
            provenance: input.provenance ?? "recorded",
            remortCount,
            level: input.level
          }
        },
        ...(input.reachedAt ? { createdAt: input.reachedAt } : {})
      }
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }
}

function getReachedMilestoneLevels(oldLevel: number, newLevel: number): number[] {
  if (newLevel <= oldLevel) {
    return [];
  }

  const start = Math.max(LEVEL_MILESTONE_MIN_LEVEL, oldLevel + 1);
  const end = Math.min(LEVEL_MILESTONE_MAX_LEVEL, newLevel);
  const levels: number[] = [];

  for (let level = start; level <= end; level += 1) {
    levels.push(level);
  }

  return levels;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
