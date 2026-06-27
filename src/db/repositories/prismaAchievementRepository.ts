import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AchievementRepository,
  CharacterAchievementProgressRecord,
  CharacterAchievementRecord,
  CharacterAchievementSnapshot,
  CharacterCosmeticTitleGrantRecord,
  UnlockAchievementInput,
  UnlockAchievementResult
} from "./achievementRepository";

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
