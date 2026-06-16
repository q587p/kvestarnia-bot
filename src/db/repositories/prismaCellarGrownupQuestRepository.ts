import { Prisma, type Character, type DailyAction, type PrismaClient } from "@prisma/client";
import { applyXpReward, getLevelForXp } from "../../domain/progression/level";
import type { CharacterRecord } from "./characterRepository";
import type {
  BuyCellarCheeseSealResult,
  CellarGrownupFinalEnding,
  CellarGrownupQuestRepository,
  CellarGrownupQuestRepositoryKeys,
  CellarGrownupQuestSnapshot,
  CompleteCellarGrownupQuestResult
} from "./cellarGrownupQuestRepository";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { countCharacterRemorts, getIncludedRemortCount } from "./prismaRemortCount";

type TxClient = Prisma.TransactionClient;

export class PrismaCellarGrownupQuestRepository implements CellarGrownupQuestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(
    telegramUserId: bigint,
    keys: CellarGrownupQuestRepositoryKeys
  ): Promise<CellarGrownupQuestSnapshot | null> {
    return this.prisma.$transaction((tx) => getSnapshot(tx, telegramUserId, keys));
  }

  async buyCheeseSealForTelegramUser(
    telegramUserId: bigint,
    input: {
      keys: CellarGrownupQuestRepositoryKeys;
      price: number;
      now: Date;
    }
  ): Promise<BuyCellarCheeseSealResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const snapshot = await getSnapshot(tx, telegramUserId, input.keys);

        if (!snapshot) {
          return { state: "no-character" };
        }

        if (snapshot.completedAction) {
          return { state: "already-completed", snapshot };
        }

        if (snapshot.cheeseSealQuantity > 0) {
          return { state: "already-owned", snapshot };
        }

        const spent = await tx.character.updateMany({
          where: {
            id: snapshot.character.id,
            gold: {
              gte: input.price
            }
          },
          data: {
            gold: {
              decrement: input.price
            }
          }
        });

        if (spent.count === 0) {
          return {
            state: "insufficient",
            snapshot,
            price: input.price
          };
        }

        await tx.dailyAction.create({
          data: {
            characterId: snapshot.character.id,
            key: input.keys.sealPurchaseKey,
            localDate: input.keys.onceLocalDate,
            rewardXp: 0,
            rewardGold: -input.price,
            createdAt: input.now
          }
        });

        await upsertItem(tx, snapshot.character.id, input.keys.cheeseSealItemId, 1, 1);
        const updated = await getSnapshot(tx, telegramUserId, input.keys);

        if (!updated) {
          return { state: "no-character" };
        }

        return {
          state: "purchased",
          snapshot: updated,
          price: input.price
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const snapshot = await this.getSnapshotForTelegramUser(telegramUserId, input.keys);

        return snapshot
          ? { state: "already-owned", snapshot }
          : { state: "no-character" };
      }

      throw error;
    }
  }

  async completeWithBottleForTelegramUser(
    telegramUserId: bigint,
    input: {
      keys: CellarGrownupQuestRepositoryKeys;
      ending: CellarGrownupFinalEnding;
      rewardXp: number;
      rewardGold: number;
      now: Date;
    }
  ): Promise<CompleteCellarGrownupQuestResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const snapshot = await getSnapshot(tx, telegramUserId, input.keys);

        if (!snapshot) {
          return { state: "no-character" };
        }

        if (snapshot.completedAction) {
          return {
            state: "already-completed",
            snapshot,
            ending: endingFromCompletedAction(snapshot.completedAction)
          };
        }

        if (snapshot.bottleQuantity <= 0) {
          return {
            state: "missing-bottle",
            snapshot
          };
        }

        const action = await tx.dailyAction.create({
          data: {
            characterId: snapshot.character.id,
            key: input.keys.completionKey,
            localDate: input.keys.onceLocalDate,
            rewardXp: input.rewardXp,
            rewardGold: input.rewardGold,
            createdAt: input.now
          }
        });

        if (input.ending === "turn-in") {
          await consumeOneItem(tx, snapshot.character.id, input.keys.bottleItemId);
        }

        const rewarded = await tx.character.update({
          where: {
            id: snapshot.character.id
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
        const remortCount = await countCharacterRemorts(tx, snapshot.character.id);
        const rewardProgress = applyXpReward(snapshot.character.xp, input.rewardXp, { remortCount });
        const oldLevel = Math.max(snapshot.character.level, rewardProgress.oldLevel);
        const newLevel = Math.max(rewarded.level, getLevelForXp(rewarded.xp, { remortCount }));

        if (newLevel !== rewarded.level) {
          await tx.character.update({
            where: {
              id: rewarded.id
            },
            data: {
              level: newLevel
            }
          });
        }
        await recordLevelMilestones(tx, snapshot.character.id, oldLevel, newLevel);

        const updated = await getSnapshot(tx, telegramUserId, input.keys);

        if (!updated) {
          return { state: "no-character" };
        }

        return {
          state: "completed",
          snapshot: {
            ...updated,
            completedAction: action
          },
          ending: input.ending,
          levelChange: {
            oldLevel,
            newLevel,
            leveledUp: newLevel > oldLevel
          }
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const snapshot = await this.getSnapshotForTelegramUser(telegramUserId, input.keys);

        if (!snapshot) {
          return { state: "no-character" };
        }

        if (!snapshot.completedAction) {
          throw new Error("Cellar grownup completion conflict did not leave an action row.");
        }

        return {
          state: "already-completed",
          snapshot,
          ending: endingFromCompletedAction(snapshot.completedAction)
        };
      }

      throw error;
    }
  }
}

async function getSnapshot(
  tx: TxClient,
  telegramUserId: bigint,
  keys: CellarGrownupQuestRepositoryKeys
): Promise<CellarGrownupQuestSnapshot | null> {
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

  const [completedAction, roleplayCooldown, cheeseSeal, bottle] = await Promise.all([
    tx.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId: character.id,
          key: keys.completionKey,
          localDate: keys.onceLocalDate
        }
      }
    }),
    tx.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: character.id,
          key: keys.roleplayCooldownKey
        }
      },
      select: {
        availableAt: true
      }
    }),
    tx.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: character.id,
          itemId: keys.cheeseSealItemId
        }
      },
      select: {
        quantity: true
      }
    }),
    tx.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: character.id,
          itemId: keys.bottleItemId
        }
      },
      select: {
        quantity: true
      }
    })
  ]);

  return {
    character: toCharacterRecord(character),
    completedAction,
    roleplayCooldown,
    cheeseSealQuantity: cheeseSeal?.quantity ?? 0,
    bottleQuantity: bottle?.quantity ?? 0
  };
}

async function upsertItem(
  tx: TxClient,
  characterId: string,
  itemId: string,
  quantity: number,
  maxOwnedQuantity: number
): Promise<void> {
  const existing = await tx.characterItem.findUnique({
    where: {
      characterId_itemId: {
        characterId,
        itemId
      }
    },
    select: {
      quantity: true
    }
  });
  const grantQuantity = Math.min(quantity, Math.max(0, maxOwnedQuantity - (existing?.quantity ?? 0)));

  if (grantQuantity <= 0) {
    return;
  }

  await tx.characterItem.upsert({
    where: {
      characterId_itemId: {
        characterId,
        itemId
      }
    },
    create: {
      characterId,
      itemId,
      quantity: grantQuantity
    },
    update: {
      quantity: {
        increment: grantQuantity
      }
    }
  });
}

async function consumeOneItem(tx: TxClient, characterId: string, itemId: string): Promise<void> {
  const item = await tx.characterItem.findUnique({
    where: {
      characterId_itemId: {
        characterId,
        itemId
      }
    },
    select: {
      id: true,
      quantity: true
    }
  });

  if (!item) {
    return;
  }

  if (item.quantity <= 1) {
    await tx.characterItem.delete({
      where: {
        id: item.id
      }
    });
    return;
  }

  await tx.characterItem.update({
    where: {
      id: item.id
    },
    data: {
      quantity: {
        decrement: 1
      }
    }
  });
}

function endingFromCompletedAction(action: DailyAction): CellarGrownupFinalEnding {
  return action.rewardGold > 0 ? "turn-in" : "keep";
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

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
