import { Prisma, type PrismaClient } from "@prisma/client";
import { applyXpReward, getLevelForXp } from "../../domain/progression/level";
import type { CharacterRecord } from "./characterRepository";
import type {
  CharacterCooldownRecord,
  ClaimCooldownRewardInput,
  ClaimCooldownRewardResult,
  CooldownRepository
} from "./cooldownRepository";
import type { ItemGrant } from "./dailyActionRepository";

type TxClient = Prisma.TransactionClient;

export class PrismaCooldownRepository implements CooldownRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findForTelegramUser(
    telegramUserId: bigint,
    key: string
  ): Promise<{ cooldown: CharacterCooldownRecord | null; character: CharacterRecord } | null> {
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

    const cooldown = await this.prisma.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: character.id,
          key
        }
      }
    });

    return {
      cooldown,
      character
    };
  }

  async claimRewardForTelegramUser(
    telegramUserId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null> {
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
          characterId_key: {
            characterId: character.id,
            key: input.key
          }
        };

        const existing = await tx.characterCooldown.findUnique({
          where
        });

        if (existing && existing.availableAt > input.now) {
          return {
            state: "on-cooldown",
            cooldown: existing,
            character
          };
        }

        if (existing) {
          const updated = await tx.characterCooldown.updateMany({
            where: {
              id: existing.id,
              availableAt: {
                lte: input.now
              }
            },
            data: {
              availableAt: input.availableAt
            }
          });

          if (updated.count === 0) {
            const refreshed = await tx.characterCooldown.findUniqueOrThrow({
              where: {
                id: existing.id
              }
            });

            return {
              state: "on-cooldown",
              cooldown: refreshed,
              character
            };
          }

          const cooldown = await tx.characterCooldown.findUniqueOrThrow({
            where: {
              id: existing.id
            }
          });

          return this.rewardCharacter(tx, character, cooldown, input);
        }

        const cooldown = await tx.characterCooldown.create({
          data: {
            characterId: character.id,
            key: input.key,
            availableAt: input.availableAt
          }
        });

        return this.rewardCharacter(tx, character, cooldown, input);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return this.findCurrentCooldown(telegramUserId, input);
      }

      throw error;
    }
  }

  private async rewardCharacter(
    tx: TxClient,
    character: CharacterRecord,
    cooldown: CharacterCooldownRecord,
    input: ClaimCooldownRewardInput
  ): Promise<Extract<ClaimCooldownRewardResult, { state: "completed" }>> {
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
    const itemGrants = input.itemGrants ?? [];

    await grantItems(tx, character.id, itemGrants);

    return {
      state: "completed",
      cooldown,
      character: updatedCharacter,
      levelChange: {
        oldLevel: rewardProgress.oldLevel,
        newLevel,
        leveledUp: newLevel > rewardProgress.oldLevel
      },
      itemGrants: itemGrants.filter((grant) => grant.quantity > 0)
    };
  }

  private async findCurrentCooldown(
    telegramUserId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null> {
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

    const cooldown = await this.prisma.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: character.id,
          key: input.key
        }
      }
    });

    if (!cooldown) {
      throw new Error("Cooldown unique conflict did not leave an existing row.");
    }

    return {
      state: "on-cooldown",
      cooldown,
      character
    };
  }
}

async function grantItems(tx: TxClient, characterId: string, itemGrants: ItemGrant[]): Promise<void> {
  for (const grant of itemGrants) {
    if (grant.quantity <= 0) {
      continue;
    }

    await tx.characterItem.upsert({
      where: {
        characterId_itemId: {
          characterId,
          itemId: grant.itemId
        }
      },
      create: {
        characterId,
        itemId: grant.itemId,
        quantity: grant.quantity
      },
      update: {
        quantity: {
          increment: grant.quantity
        }
      }
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
