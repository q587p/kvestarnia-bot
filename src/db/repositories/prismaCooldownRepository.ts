import { Prisma, type Character, type PrismaClient } from "@prisma/client";
import { applyXpReward, getLevelForXp } from "../../domain/progression/level";
import type { CharacterRecord } from "./characterRepository";
import type {
  CharacterCooldownRecord,
  ClaimCooldownRewardInput,
  ClaimCooldownRewardResult,
  CooldownRepository,
  SetCooldownAvailableAtResult
} from "./cooldownRepository";
import type { HpLossAudit, ItemGrant } from "./dailyActionRepository";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { countCharacterRemorts, getIncludedRemortCount } from "./prismaRemortCount";

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
      },
      include: remortCountInclude
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
      character: toCharacterRecord(character)
    };
  }

  async claimRewardForTelegramUser(
    telegramUserId: bigint,
    input: ClaimCooldownRewardInput
  ): Promise<ClaimCooldownRewardResult | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
        const character = await tx.character.findFirst({
          where: {
            user: {
              telegramUserId
            }
          },
          include: remortCountInclude
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

        const characterRecord = toCharacterRecord(character);
        if (
          input.expectedLife &&
          characterRecord.remortCount !== input.expectedLife.remortCount
        ) {
          return null;
        }

        if (existing && existing.availableAt > input.now) {
          return {
            state: "on-cooldown",
            cooldown: existing,
            character: characterRecord
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
            return {
              state: "insufficient-gold",
              character: characterRecord,
              requiredGold: spentGold
            };
          }
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
            throw new CooldownClaimLostRaceError();
          }

          const cooldown = await tx.characterCooldown.findUniqueOrThrow({
            where: {
              id: existing.id
            }
          });

          return this.rewardCharacter(tx, characterRecord, cooldown, input);
        }

        const cooldown = await tx.characterCooldown.create({
          data: {
            characterId: character.id,
            key: input.key,
            availableAt: input.availableAt
          }
        });

        return this.rewardCharacter(tx, characterRecord, cooldown, input);
        });
      } catch (error) {
        if (error instanceof HpMutationConflictError && attempt < 2) {
          continue;
        }

        if (isUniqueConstraintError(error)) {
          return this.findCurrentCooldown(telegramUserId, input);
        }

        if (error instanceof CooldownClaimLostRaceError) {
          return this.findCurrentCooldown(telegramUserId, input);
        }

        throw error;
      }
    }

    throw new HpMutationConflictError();
  }

  async setAvailableAtForTelegramUser(
    telegramUserId: bigint,
    input: { key: string; availableAt: Date }
  ): Promise<SetCooldownAvailableAtResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        include: remortCountInclude
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

      if (!existing) {
        return {
          state: "not-found",
          character: toCharacterRecord(character)
        };
      }

      const cooldown = await tx.characterCooldown.update({
        where,
        data: {
          availableAt: input.availableAt
        }
      });

      return {
        state: "updated",
        cooldown,
        character: toCharacterRecord(character)
      };
    });
  }

  async deleteForTelegramUser(
    telegramUserId: bigint,
    input: { key: string }
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

    const deleted = await this.prisma.characterCooldown.deleteMany({
      where: {
        characterId: character.id,
        key: input.key
      }
    });

    return deleted.count > 0 ? "deleted" : "missing";
  }

  private async rewardCharacter(
    tx: TxClient,
    character: CharacterRecord,
    cooldown: CharacterCooldownRecord,
    input: ClaimCooldownRewardInput
  ): Promise<Extract<ClaimCooldownRewardResult, { state: "completed" }>> {
    const resourceCharacter = await tx.character.findUniqueOrThrow({
      where: {
        id: character.id
      }
    });
    const hpLoss = buildHpLossAudit(resourceCharacter.hpCurrent, input.hpLoss);
    const rewardUpdate = {
      xp: {
        increment: input.rewardXp
      },
      gold: {
        increment: input.rewardGold
      },
      ...(hpLoss
        ? {
            hpCurrent: hpLoss.after,
            hpRegenAt: new Date()
          }
        : {})
    };
    let rewardedCharacter: Character;

    if (hpLoss) {
      const updated = await tx.character.updateMany({
        where: {
          id: character.id,
          hpCurrent: hpLoss.before
        },
        data: rewardUpdate
      });

      if (updated.count !== 1) {
        throw new HpMutationConflictError();
      }

      rewardedCharacter = await tx.character.findUniqueOrThrow({
        where: {
          id: character.id
        }
      });
    } else {
      rewardedCharacter = await tx.character.update({
        where: {
          id: character.id
        },
        data: rewardUpdate
      });
    }
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
    await recordLevelMilestones(tx, character.id, oldLevel, newLevel, undefined, {
      remortCount
    });
    const itemGrants = input.itemGrants ?? [];

    const appliedItemGrants = await grantItems(tx, character.id, itemGrants);
    const persistedCooldown = await tx.characterCooldown.update({
      where: {
        id: cooldown.id
      },
      data: {
        resultJson: withCooldownResultAudit(input.resultJson, hpLoss, appliedItemGrants) as Prisma.InputJsonValue
      }
    });

    return {
      state: "completed",
      cooldown: persistedCooldown,
      character: {
        ...updatedCharacter,
        remortCount
      },
      levelChange: {
        oldLevel,
        newLevel,
        leveledUp: newLevel > oldLevel
      },
      itemGrants: appliedItemGrants,
      hpLoss
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
      },
      include: remortCountInclude
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

    const characterRecord = toCharacterRecord(character);

    if (
      input.expectedLife &&
      characterRecord.remortCount !== input.expectedLife.remortCount
    ) {
      return null;
    }

    return {
      state: "on-cooldown",
      cooldown,
      character: characterRecord
    };
  }
}

const remortCountInclude = {
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

function toCharacterRecord(character: Character & { _count?: { remorts?: number } }): CharacterRecord {
  const remortCount = getIncludedRemortCount(character);
  const record = { ...character };
  delete (record as { _count?: unknown })._count;

  return {
    ...record,
    remortCount
  };
}

async function grantItems(
  tx: TxClient,
  characterId: string,
  itemGrants: ItemGrant[]
): Promise<ItemGrant[]> {
  const appliedItemGrants: ItemGrant[] = [];

  for (const grant of itemGrants) {
    if (grant.quantity <= 0) {
      continue;
    }

    const grantQuantity = await getGrantQuantity(tx, characterId, grant);

    if (grantQuantity <= 0) {
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

  return appliedItemGrants;
}

async function getGrantQuantity(
  tx: TxClient,
  characterId: string,
  grant: ItemGrant
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

function normalizeHpLoss(value: ClaimCooldownRewardInput["hpLoss"]): { requested: number; effectiveHpMax: number | null } {
  if (typeof value === "number") {
    return {
      requested: Math.max(0, Math.floor(value)),
      effectiveHpMax: null
    };
  }

  if (!value) {
    return {
      requested: 0,
      effectiveHpMax: null
    };
  }

  return {
    requested: Math.max(0, Math.floor(value.requested)),
    effectiveHpMax: Math.max(1, Math.floor(value.effectiveHpMax))
  };
}

function buildHpLossAudit(
  hpCurrent: number,
  requestedLoss: ClaimCooldownRewardInput["hpLoss"]
): HpLossAudit | null {
  const { requested, effectiveHpMax } = normalizeHpLoss(requestedLoss);

  if (requested <= 0) {
    return null;
  }

  const before = Math.max(0, Math.floor(hpCurrent));
  const lost = Math.min(requested, Math.max(0, before - 1));

  return {
    before,
    max: Math.max(before, effectiveHpMax ?? before),
    lost,
    after: before - lost
  };
}

function withCooldownResultAudit(
  resultJson: unknown,
  hpLoss: HpLossAudit | null,
  appliedItemGrants: ItemGrant[]
): unknown {
  const base =
    resultJson && typeof resultJson === "object" && !Array.isArray(resultJson)
      ? { ...resultJson }
      : {};

  return {
    ...base,
    hp: hpLoss,
    appliedItemGrants
  };
}

class CooldownClaimLostRaceError extends Error {
  constructor() {
    super("Cooldown claim lost an optimistic race after guarded debit.");
  }
}

class HpMutationConflictError extends Error {
  constructor() {
    super("Cooldown HP mutation lost an optimistic race.");
  }
}
