import { Prisma, type PrismaClient } from "@prisma/client";
import { applyXpReward, getLevelForXp } from "../../domain/progression/level";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionClaimIdentity,
  DailyActionRecord,
  DailyActionRepository,
  HpLossAudit,
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
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

        const resourceCharacter = await tx.character.findUniqueOrThrow({
          where: {
            id: character.id
          }
        });
        const hpLoss = buildHpLossAudit(resourceCharacter.hpCurrent, input.hpLoss);

        const action = await tx.dailyAction.create({
          data: {
            characterId: character.id,
            key: input.key,
            localDate: input.localDate,
            rewardXp: input.rewardXp,
            rewardGold: input.rewardGold,
            spentGold,
            ...(input.resultJson === undefined && !hpLoss
              ? {}
              : { resultJson: withHpLossAudit(input.resultJson, hpLoss) as Prisma.InputJsonValue })
          }
        });

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
        let rewardedCharacter: typeof character;

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
          itemGrants: appliedItemGrants,
          hpLoss
        };
        });
      } catch (error) {
        if (error instanceof HpMutationConflictError && attempt < 2) {
          continue;
        }

        if (isUniqueConstraintError(error)) {
          return this.findExistingClaim(telegramUserId, input);
        }

        throw error;
      }
    }

    throw new HpMutationConflictError();
  }

  async deleteForTelegramUser(
    telegramUserId: bigint,
    input: DailyActionClaimIdentity
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

  async rollbackForTelegramUser(
    telegramUserId: bigint,
    input: DailyActionClaimIdentity
  ): Promise<"rolled-back" | "missing" | "no-character"> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
            return "no-character";
          }

          const action = await tx.dailyAction.findUnique({
            where: {
              characterId_key_localDate: {
                characterId: character.id,
                key: input.key,
                localDate: input.localDate
              }
            }
          });

          if (!action) {
            return "missing";
          }

          const hpLoss = readHpLossAudit(action.resultJson);
          await tx.dailyAction.delete({
            where: {
              characterId_key_localDate: {
                characterId: character.id,
                key: input.key,
                localDate: input.localDate
              }
            }
          });

          const remortCount = await countCharacterRemorts(tx, character.id);
          const xpAfterRollback = Math.max(0, character.xp - action.rewardXp);
          const levelAfterRollback = getLevelForXp(xpAfterRollback, { remortCount });
          const rollbackHpCurrent =
            hpLoss && hpLoss.lost > 0
              ? Math.max(
                  character.hpCurrent,
                  Math.min(
                    Math.max(1, Math.floor(input.effectiveHpMax ?? character.hpMax)),
                    Math.max(0, character.hpCurrent) + hpLoss.lost
                  )
                )
              : null;
          const characterUpdate = await tx.character.updateMany({
            where: {
              id: character.id,
              xp: character.xp,
              level: character.level,
              gold: character.gold,
              ...(rollbackHpCurrent !== null ? { hpCurrent: character.hpCurrent } : {})
            },
            data: {
              xp: xpAfterRollback,
              level: levelAfterRollback,
              gold: {
                increment: action.spentGold - action.rewardGold
              },
              ...(rollbackHpCurrent !== null
                ? {
                    hpCurrent: rollbackHpCurrent,
                    hpRegenAt: new Date()
                  }
                : {})
            }
          });

          if (characterUpdate.count !== 1) {
            throw new RollbackMutationConflictError();
          }

          const itemGrants = readItemGrants(action.resultJson);

          for (const grant of itemGrants) {
            if (grant.quantity <= 0) {
              continue;
            }

            const existing = await tx.characterItem.findUnique({
              where: {
                characterId_itemId: {
                  characterId: character.id,
                  itemId: grant.itemId
                }
              }
            });

            if (!existing) {
              continue;
            }

            const nextQuantity = existing.quantity - grant.quantity;

            if (nextQuantity > 0) {
              const itemUpdate = await tx.characterItem.updateMany({
                where: {
                  id: existing.id,
                  quantity: existing.quantity
                },
                data: {
                  quantity: nextQuantity
                }
              });

              if (itemUpdate.count !== 1) {
                throw new RollbackMutationConflictError();
              }
            } else {
              const itemDelete = await tx.characterItem.deleteMany({
                where: {
                  id: existing.id,
                  quantity: existing.quantity
                }
              });

              if (itemDelete.count !== 1) {
                throw new RollbackMutationConflictError();
              }
            }
          }

          return "rolled-back";
        });
      } catch (error) {
        if (error instanceof RollbackMutationConflictError && attempt < 2) {
          continue;
        }

        throw error;
      }
    }

    throw new RollbackMutationConflictError();
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

function normalizeHpLoss(value: ClaimDailyActionInput["hpLoss"]): { requested: number; effectiveHpMax: number | null } {
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
  requestedLoss: ClaimDailyActionInput["hpLoss"]
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

function withHpLossAudit(resultJson: unknown, hpLoss: HpLossAudit | null): unknown {
  if (!hpLoss) {
    return resultJson;
  }

  if (resultJson && typeof resultJson === "object" && !Array.isArray(resultJson)) {
    return {
      ...resultJson,
      hp: hpLoss
    };
  }

  return {
    hp: hpLoss
  };
}

function readHpLossAudit(resultJson: Prisma.JsonValue | null): HpLossAudit | null {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return null;
  }

  const hp = (resultJson as { hp?: unknown }).hp;

  if (!hp || typeof hp !== "object" || Array.isArray(hp)) {
    return null;
  }

  const before = (hp as { before?: unknown }).before;
  const max = (hp as { max?: unknown }).max;
  const lost = (hp as { lost?: unknown }).lost;
  const after = (hp as { after?: unknown }).after;

  return typeof before === "number" && typeof lost === "number" && typeof after === "number"
    ? { before, max: typeof max === "number" ? max : Math.max(before, after), lost, after }
    : null;
}

function readItemGrants(resultJson: Prisma.JsonValue | null): ItemGrant[] {
  if (!resultJson || typeof resultJson !== "object" || Array.isArray(resultJson)) {
    return [];
  }

  const reward = (resultJson as { reward?: unknown }).reward;

  if (!reward || typeof reward !== "object" || Array.isArray(reward)) {
    return [];
  }

  const itemGrants = (reward as { itemGrants?: unknown }).itemGrants;

  if (!Array.isArray(itemGrants)) {
    return [];
  }

  return itemGrants.flatMap((grant) => {
    if (!grant || typeof grant !== "object" || Array.isArray(grant)) {
      return [];
    }

    const itemId = (grant as { itemId?: unknown }).itemId;
    const quantity = (grant as { quantity?: unknown }).quantity;

    return typeof itemId === "string" && typeof quantity === "number"
      ? [{ itemId, quantity }]
      : [];
  });
}

class HpMutationConflictError extends Error {
  constructor() {
    super("Daily action HP mutation lost an optimistic race.");
  }
}

class RollbackMutationConflictError extends Error {
  constructor() {
    super("Daily action rollback lost an optimistic race.");
  }
}
