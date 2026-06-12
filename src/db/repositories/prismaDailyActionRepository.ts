import { Prisma, type PrismaClient } from "@prisma/client";
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
            character
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

        const updatedCharacter = await tx.character.update({
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

        return {
          state: "created",
          action,
          character: updatedCharacter
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
      character
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
