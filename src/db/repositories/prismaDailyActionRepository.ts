import { Prisma, type PrismaClient } from "@prisma/client";
import { applyXpReward, getLevelForXp } from "../../domain/progression/level";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRepository
} from "./dailyActionRepository";

export class PrismaDailyActionRepository implements DailyActionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claimForTelegramUser(
    telegramUserId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const character = await tx.character.findFirst({
          where: {
            user: {
              telegramUserId
            }
          }
        });

        if (!character) {
          return null;
        }

        const where = {
          characterId_key_localDate: {
            characterId: character.id,
            key: input.key,
            localDate: input.localDate
          }
        };

        const existing = await tx.dailyAction.findUnique({
          where
        });

        if (existing) {
          return {
            state: "existing",
            action: existing,
            character,
            levelChange: null
          };
        }

        const action = await tx.dailyAction.create({
          data: {
            characterId: character.id,
            key: input.key,
            localDate: input.localDate,
            rewardXp: input.rewardXp,
            rewardGold: input.rewardGold
          }
        });

        const rewardedCharacter = await tx.character.update({
          where: {
            id: character.id
          },
          data: {
            xp: {
              increment: input.rewardXp
            },
            gold: {
              increment: input.rewardGold
            }
          }
        });
        const rewardProgress = applyXpReward(character.xp, input.rewardXp);
        const newLevel = getLevelForXp(rewardedCharacter.xp);
        const updatedCharacter =
          newLevel === rewardedCharacter.level
            ? rewardedCharacter
            : await tx.character.update({
                where: {
                  id: rewardedCharacter.id
                },
                data: {
                  level: newLevel
                }
              });

        return {
          state: "created",
          action,
          character: updatedCharacter,
          levelChange: {
            oldLevel: rewardProgress.oldLevel,
            newLevel,
            leveledUp: newLevel > rewardProgress.oldLevel
          }
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return this.findExistingClaim(telegramUserId, input);
      }

      throw error;
    }
  }

  private async findExistingClaim(
    telegramUserId: bigint,
    input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      }
    });

    if (!character) {
      return null;
    }

    const action = await this.prisma.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId: character.id,
          key: input.key,
          localDate: input.localDate
        }
      }
    });

    if (!action) {
      throw new Error("Daily action unique conflict did not leave an existing row.");
    }

    return {
      state: "existing",
      action,
      character,
      levelChange: null
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
