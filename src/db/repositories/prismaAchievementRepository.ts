import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AchievementRecalculationSnapshot,
  AchievementRepository,
  CharacterAchievementProgressRecord,
  CharacterAchievementRecord,
  CharacterAchievementSnapshot,
  CharacterCosmeticTitleGrantRecord,
  UnlockAchievementInput,
  UnlockAchievementResult
} from "./achievementRepository";

const PROBLEM_QUEST_REWARD_KEYS = [
  "quest.thirteen-small-problems",
  "quest.problem-chain.23.reward",
  "quest.problem-chain.42.reward",
  "quest.problem-chain.93.reward"
] as const;

export class PrismaAchievementRepository implements AchievementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForCharacter(characterId: string): Promise<CharacterAchievementSnapshot> {
    const [achievements, progress, titleGrants] = await Promise.all([
      this.prisma.characterAchievement.findMany({
        where: { characterId },
        orderBy: [{ unlockedAt: "asc" }, { achievementId: "asc" }]
      }),
      this.prisma.characterAchievementProgress.findMany({
        where: { characterId },
        orderBy: [{ achievementId: "asc" }]
      }),
      this.prisma.characterCosmeticTitleGrant.findMany({
        where: { characterId },
        orderBy: [{ grantedAt: "asc" }, { titleGrantId: "asc" }]
      })
    ]);

    return {
      achievements: achievements.map(toAchievementRecord),
      progress: progress.map(toProgressRecord),
      titleGrants: titleGrants.map(toTitleGrantRecord)
    };
  }

  async getRecalculationSnapshot(characterId: string): Promise<AchievementRecalculationSnapshot | null> {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: {
        id: true,
        level: true,
        raceId: true,
        classId: true,
        createdAt: true
      }
    });

    if (!character) {
      return null;
    }

    const [
      won,
      lost,
      fled,
      expired,
      completedProblemQuestStages,
      inventory,
      equippedItemCount
    ] = await Promise.all([
      this.prisma.soloCombatSession.count({ where: { characterId, status: "won" } }),
      this.prisma.soloCombatSession.count({ where: { characterId, status: "lost" } }),
      this.prisma.soloCombatSession.count({ where: { characterId, status: "fled" } }),
      this.prisma.soloCombatSession.count({ where: { characterId, status: "expired" } }),
      this.prisma.dailyAction.count({
        where: {
          characterId,
          key: { in: [...PROBLEM_QUEST_REWARD_KEYS] }
        }
      }),
      this.prisma.characterItem.findMany({
        where: { characterId },
        select: {
          itemId: true,
          quantity: true
        }
      }),
      this.prisma.characterEquipment.count({ where: { characterId } })
    ]);

    return {
      characterId: character.id,
      level: character.level,
      raceId: character.raceId,
      classId: character.classId,
      createdAt: character.createdAt,
      combat: {
        won,
        lost,
        fled,
        expired
      },
      completedProblemQuestStages,
      inventoryItemQuantity: inventory.reduce((sum, row) => sum + row.quantity, 0),
      inventoryItemQuantities: Object.fromEntries(inventory.map((row) => [row.itemId, row.quantity])),
      equippedItemCount
    };
  }

  async unlockAchievement(input: UnlockAchievementInput): Promise<UnlockAchievementResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.characterAchievement.findUnique({
        where: {
          characterId_achievementId: {
            characterId: input.characterId,
            achievementId: input.achievementId
          }
        }
      });

      if (existing) {
        return {
          created: false,
          achievement: toAchievementRecord(existing),
          titleGrant: input.cosmeticTitleGrantId
            ? await findTitleGrant(tx, input.characterId, input.cosmeticTitleGrantId)
            : null
        };
      }

      const achievement = await tx.characterAchievement.create({
        data: {
          characterId: input.characterId,
          achievementId: input.achievementId,
          sourceType: input.source.type,
          sourceId: input.source.id ?? null,
          ...(input.source.payload === undefined
            ? {}
            : { sourceJson: normalizeSourceJson(input.source.payload) }),
          unlockedAt: input.source.occurredAt
        }
      });

      const titleGrant = input.cosmeticTitleGrantId
        ? await tx.characterCosmeticTitleGrant.upsert({
            where: {
              characterId_titleGrantId: {
                characterId: input.characterId,
                titleGrantId: input.cosmeticTitleGrantId
              }
            },
            create: {
              characterId: input.characterId,
              titleGrantId: input.cosmeticTitleGrantId,
              achievementId: input.achievementId,
              sourceType: input.source.type,
              sourceId: input.source.id ?? null,
              grantedAt: input.source.occurredAt
            },
            update: {}
          })
        : null;

      return {
        created: true,
        achievement: toAchievementRecord(achievement),
        titleGrant: titleGrant ? toTitleGrantRecord(titleGrant) : null
      };
    });
  }

  async updateProgressMax(input: {
    characterId: string;
    achievementId: string;
    current: number;
    target?: number;
  }): Promise<CharacterAchievementProgressRecord> {
    const current = Math.max(0, Math.floor(input.current));
    const existing = await this.prisma.characterAchievementProgress.findUnique({
      where: {
        characterId_achievementId: {
          characterId: input.characterId,
          achievementId: input.achievementId
        }
      }
    });

    if (existing && existing.current >= current) {
      return toProgressRecord(existing);
    }

    const row = await this.prisma.characterAchievementProgress.upsert({
      where: {
        characterId_achievementId: {
          characterId: input.characterId,
          achievementId: input.achievementId
        }
      },
      create: {
        characterId: input.characterId,
        achievementId: input.achievementId,
        current,
        target: input.target ?? null
      },
      update: {
        current,
        target: input.target ?? existing?.target ?? null
      }
    });

    return toProgressRecord(row);
  }
}

async function findTitleGrant(
  tx: Prisma.TransactionClient,
  characterId: string,
  titleGrantId: string
): Promise<CharacterCosmeticTitleGrantRecord | null> {
  const row = await tx.characterCosmeticTitleGrant.findUnique({
    where: {
      characterId_titleGrantId: {
        characterId,
        titleGrantId
      }
    }
  });

  return row ? toTitleGrantRecord(row) : null;
}

function normalizeSourceJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toAchievementRecord(row: CharacterAchievementRecord): CharacterAchievementRecord {
  return row;
}

function toProgressRecord(
  row: CharacterAchievementProgressRecord
): CharacterAchievementProgressRecord {
  return row;
}

function toTitleGrantRecord(
  row: CharacterCosmeticTitleGrantRecord
): CharacterCosmeticTitleGrantRecord {
  return row;
}
