import { Prisma, type PrismaClient } from "@prisma/client";
import { applyXpReward, getLevelForXp } from "../../domain/progression/level";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository,
  ItemGrant
} from "./dailyActionRepository";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { countCharacterRemorts } from "./prismaRemortCount";

export class PrismaDailyActionRepository implements DailyActionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findForTelegramUser(
    telegramUserId: bigint,
    input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!character) {
      return null;
    }

    return this.prisma.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId: character.id,
          key: input.key,
          localDate: input.localDate
        }
      }
    });
  }

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
          const remortCount = await countCharacterRemorts(tx, character.id);

          return {
            state: "existing",
            action: existing,
            character: { ...character, remortCount },
            levelChange: null,
            itemGrants: []
          };
        }

        const spentGold = normalizeSpentGold(input.spentGold);

        if (spentGold > 0) {
          const debit = await tx.character.updateMany({
            where: {
              id: character.id,
              gold: {
                gte: spentGold
              }
            },
            data: {
              gold: {
                decrement: spentGold
              }
            }
          });

          if (debit.count !== 1) {
            const remortCount = await countCharacterRemorts(tx, character.id);

            return {
              state: "insufficient-gold",
              character: { ...character, remortCount },
              requiredGold: spentGold
            };
          }
        }

        const action = await tx.dailyAction.create({
          data: {
            characterId: character.id,
            key: input.key,
            localDate: input.localDate,
            rewardXp: input.rewardXp,
            rewardGold: input.rewardGold,
            spentGold,
            ...(input.resultJson === undefined
              ? {}
              : { resultJson: input.resultJson as Prisma.InputJsonValue })
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
        const remortCount = await countCharacterRemorts(tx, character.id);
        const rewardProgress = applyXpReward(character.xp, input.rewardXp, { remortCount });
        const oldLevel = Math.max(character.level, rewardProgress.oldLevel);
        const newLevel = Math.max(rewardedCharacter.level, getLevelForXp(rewardedCharacter.xp, { remortCount }));
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
        await recordLevelMilestones(tx, character.id, oldLevel, newLevel);
        const itemGrants = input.itemGrants ?? [];
        const appliedItemGrants: ItemGrant[] = [];

        for (const grant of itemGrants) {
          if (grant.quantity <= 0) {
            continue;
          }

          const grantQuantity = await getGrantQuantity(tx, character.id, grant);

          if (grantQuantity <= 0) {
            continue;
          }

          await tx.characterItem.upsert({
            where: {
              characterId_itemId: {
                characterId: character.id,
                itemId: grant.itemId
              }
            },
            create: {
              characterId: character.id,
              itemId: grant.itemId,
              quantity: grantQuantity
            },
            update: {
              quantity: {
                increment: grantQuantity
              }
            }
          });
          appliedItemGrants.push({
            itemId: grant.itemId,
            quantity: grantQuantity
          });
        }

        return {
          state: "created",
          action,
          character: { ...updatedCharacter, remortCount },
          levelChange: {
            oldLevel,
            newLevel,
            leveledUp: newLevel > oldLevel
          },
          itemGrants: appliedItemGrants
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return this.findExistingClaim(telegramUserId, input);
      }

      throw error;
    }
  }

  async deleteForTelegramUser(
    telegramUserId: bigint,
    input: { key: string; localDate: string }
  ): Promise<"deleted" | "missing" | "no-character"> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!character) {
      return "no-character";
    }

    const deleted = await this.prisma.dailyAction.deleteMany({
      where: {
        characterId: character.id,
        key: input.key,
        localDate: input.localDate
      }
    });

    return deleted.count > 0 ? "deleted" : "missing";
  }

  async countForTelegramUser(
    telegramUserId: bigint,
    input: { key: string; localDatePrefix: string }
  ): Promise<number | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!character) {
      return null;
    }

    return this.prisma.dailyAction.count({
      where: {
        characterId: character.id,
        key: input.key,
        localDate: {
          startsWith: input.localDatePrefix
        }
      }
    });
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

    const remortCount = await countCharacterRemorts(this.prisma, character.id);

    return {
      state: "existing",
      action,
      character: { ...character, remortCount },
      levelChange: null,
      itemGrants: []
    };
  }
}

async function getGrantQuantity(
  tx: Prisma.TransactionClient,
  characterId: string,
  grant: { itemId: string; quantity: number; maxOwnedQuantity?: number }
): Promise<number> {
  const quantity = Math.floor(grant.quantity);

  if (!grant.maxOwnedQuantity) {
    return quantity;
  }

  const existing = await tx.characterItem.findUnique({
    where: {
      characterId_itemId: {
        characterId,
        itemId: grant.itemId
      }
    },
    select: {
      quantity: true
    }
  });
  const remaining = grant.maxOwnedQuantity - (existing?.quantity ?? 0);

  return Math.min(quantity, Math.max(0, remaining));
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function normalizeSpentGold(value: number | undefined): number {
  return Math.max(0, Math.floor(value ?? 0));
}
