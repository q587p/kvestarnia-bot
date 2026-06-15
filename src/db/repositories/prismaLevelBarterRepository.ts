import type { Character, CharacterItem, Prisma, PrismaClient } from "@prisma/client";
import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";
import {
  recordLevelMilestones
} from "./levelMilestoneRepository";
import type {
  LevelBarterConfirmRepositoryResult,
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
          return { state: "stale-selection" };
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

      throw error;
    }
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
