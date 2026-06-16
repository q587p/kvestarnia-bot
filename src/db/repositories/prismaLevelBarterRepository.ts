import type { Character, CharacterItem, LevelBarterExchange, Prisma, PrismaClient } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";
import {
  recordLevelMilestones
} from "./levelMilestoneRepository";
import type {
  LevelBarterConfirmRepositoryResult,
  LevelBarterExchangePlan,
  LevelBarterPlanResult,
  LevelBarterRepository,
  LevelBarterSnapshot
} from "./levelBarterRepository";

type TxClient = Prisma.TransactionClient;

export class PrismaLevelBarterRepository implements LevelBarterRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(telegramUserId: bigint): Promise<LevelBarterSnapshot | null> {
    return this.prisma.$transaction((tx) => getSnapshot(tx, telegramUserId));
  }

  async confirmAutoExchangeForTelegramUser(
    telegramUserId: bigint,
    input: {
      expectedToken: string;
      now: Date;
      createPlan: (snapshot: LevelBarterSnapshot) => LevelBarterPlanResult;
    }
  ): Promise<LevelBarterConfirmRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const snapshot = await getSnapshot(tx, telegramUserId);

        if (!snapshot) {
          return { state: "no-character" };
        }

        const existing = await tx.levelBarterExchange.findUnique({
          where: {
            characterId_token: {
              characterId: snapshot.character.id,
              token: input.expectedToken
            }
          }
        });

        if (existing?.status === "completed") {
          return {
            state: "replayed",
            character: snapshot.character,
            plan: planFromExchange(existing)
          };
        }

        const planResult = input.createPlan(snapshot);

        if (planResult.state === "battle-only-level") {
          return planResult;
        }

        if (planResult.state === "insufficient") {
          return planResult;
        }

        if (planResult.state === "token-mismatch" || planResult.plan.token !== input.expectedToken) {
          return { state: "stale-selection" };
        }

        const plan = planResult.plan;

        await tx.levelBarterExchange.create({
          data: {
            characterId: snapshot.character.id,
            token: input.expectedToken,
            status: "pending",
            inputItemsJson: plan.items,
            spentGold: plan.goldSpent,
            levelBefore: plan.levelBefore,
            levelAfter: plan.levelAfter,
            xpBefore: plan.xpBefore,
            xpAfter: plan.xpAfter,
            xpCarry: plan.xpCarry,
            itemTotalValue: plan.itemTotalValue,
            selectedTotalValue: plan.selectedTotalValue,
            overpay: plan.overpay
          }
        });

        const updatedCharacter = await tx.character.updateMany({
          where: {
            id: snapshot.character.id,
            gold: {
              gte: plan.goldSpent
            }
          },
          data: {
            gold: {
              decrement: plan.goldSpent
            },
            level: plan.levelAfter,
            xp: plan.xpAfter
          }
        });

        if (updatedCharacter.count !== 1) {
          throw new LevelBarterStaleSelectionError();
        }

        for (const item of plan.items) {
          const consumed = await tx.characterItem.updateMany({
            where: {
              characterId: snapshot.character.id,
              itemId: item.itemId,
              quantity: {
                gte: item.quantity
              }
            },
            data: {
              quantity: {
                decrement: item.quantity
              }
            }
          });

          if (consumed.count !== 1) {
            throw new LevelBarterStaleSelectionError();
          }
        }

        await tx.characterItem.deleteMany({
          where: {
            characterId: snapshot.character.id,
            quantity: {
              lte: 0
            }
          }
        });

        await recordLevelMilestones(
          tx,
          snapshot.character.id,
          plan.levelBefore,
          plan.levelAfter,
          input.now
        );

        await tx.levelBarterExchange.update({
          where: {
            characterId_token: {
              characterId: snapshot.character.id,
              token: input.expectedToken
            }
          },
          data: {
            status: "completed",
            completedAt: input.now
          }
        });

        const character = await tx.character.findUnique({
          where: {
            id: snapshot.character.id
          },
          include: {
            user: {
              select: {
                lastSeenLocationId: true
              }
            }
          }
        });

        if (!character) {
          return { state: "no-character" };
        }

        return {
          state: "exchanged",
          character: toCharacterRecord(character),
          plan
        };
      });
    } catch (error) {
      if (error instanceof LevelBarterStaleSelectionError) {
        return { state: "stale-selection" };
      }

      if (error instanceof PrismaRuntime.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await this.findCompletedExchangeForTelegramUser(telegramUserId, input.expectedToken);

        if (replay) {
          return replay;
        }

        return { state: "stale-selection" };
      }

      throw error;
    }
  }

  private async findCompletedExchangeForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<LevelBarterConfirmRepositoryResult | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      include: {
        user: {
          select: {
            lastSeenLocationId: true
          }
        },
        levelBarterExchanges: {
          where: {
            token,
            status: "completed"
          },
          take: 1
        }
      }
    });

    const exchange = character?.levelBarterExchanges[0];

    if (!character || !exchange) {
      return null;
    }

    return {
      state: "replayed",
      character: toCharacterRecord(character),
      plan: planFromExchange(exchange)
    };
  }
}

class LevelBarterStaleSelectionError extends Error {
  constructor() {
    super("Level barter selection changed during transaction.");
  }
}

async function getSnapshot(tx: TxClient, telegramUserId: bigint): Promise<LevelBarterSnapshot | null> {
  const character = await tx.character.findFirst({
    where: {
      user: {
        telegramUserId
      }
    },
    include: {
      user: {
        select: {
          lastSeenLocationId: true
        }
      }
    }
  });

  if (!character) {
    return null;
  }

  const [items, equipment] = await Promise.all([
    tx.characterItem.findMany({
      where: {
        characterId: character.id
      },
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          itemId: "asc"
        }
      ]
    }),
    tx.characterEquipment.findMany({
      where: {
        characterId: character.id
      },
      select: {
        itemId: true
      }
    })
  ]);

  return {
    character: toCharacterRecord(character),
    items: items.map(toCharacterItemRecord),
    equippedItemIds: equipment.map((row) => row.itemId)
  };
}

function toCharacterRecord(
  character: Character & { user: { lastSeenLocationId: string | null } }
): CharacterRecord {
  const { user, ...record } = character;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId
  };
}

function toCharacterItemRecord(record: CharacterItem): CharacterItemRecord {
  return {
    id: record.id,
    characterId: record.characterId,
    itemId: record.itemId,
    quantity: record.quantity,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function planFromExchange(exchange: LevelBarterExchange): LevelBarterExchangePlan {
  return {
    token: exchange.token,
    items: parseExchangeItems(exchange.inputItemsJson),
    goldSpent: exchange.spentGold,
    levelBefore: exchange.levelBefore,
    levelAfter: exchange.levelAfter,
    xpBefore: exchange.xpBefore,
    xpAfter: exchange.xpAfter,
    xpCarry: exchange.xpCarry,
    itemTotalValue: exchange.itemTotalValue,
    selectedTotalValue: exchange.selectedTotalValue,
    overpay: exchange.overpay
  };
}

function parseExchangeItems(input: Prisma.JsonValue): Array<{ itemId: string; quantity: number }> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof entry.itemId !== "string" ||
      typeof entry.quantity !== "number"
    ) {
      return [];
    }

    return [
      {
        itemId: entry.itemId,
        quantity: Math.max(0, Math.floor(entry.quantity))
      }
    ];
  });
}
