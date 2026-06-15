import { Prisma, type CharacterItem, type PrismaClient } from "@prisma/client";
import type { CharacterItemRecord } from "./inventoryRepository";
import type {
  MantokChestConfirmResult,
  MantokChestRepository,
  MantokChestRunItem,
  MantokChestRunRecord,
  MantokChestRunStatus,
  MantokChestSnapshot
} from "./mantokChestRepository";

type TxClient = Prisma.TransactionClient;
type PrismaMantokChestRunRecord = Awaited<ReturnType<PrismaClient["mantokChestRun"]["findFirst"]>>;

export class PrismaMantokChestRepository implements MantokChestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(telegramUserId: bigint): Promise<MantokChestSnapshot | null> {
    return this.prisma.$transaction((tx) => getSnapshot(tx, telegramUserId));
  }

  async createPendingRunForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      inputItems: MantokChestRunItem[];
      averageInputScore: number;
      minimumOutputScore: number;
      now: Date;
    }
  ): Promise<MantokChestRunRecord | null> {
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

    const record = await this.prisma.mantokChestRun.create({
      data: {
        characterId: character.id,
        token: input.token,
        status: "pending",
        inputItemsJson: input.inputItems as unknown as Prisma.InputJsonValue,
        averageInputScore: Math.floor(input.averageInputScore),
        minimumOutputScore: input.minimumOutputScore,
        createdAt: input.now,
        updatedAt: input.now
      }
    });

    return mapRun(record);
  }

  async cancelRunForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<MantokChestRunRecord | null> {
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

    const record = await this.prisma.mantokChestRun.updateMany({
      where: {
        characterId: character.id,
        token,
        status: "pending"
      },
      data: {
        status: "cancelled",
        updatedAt: now
      }
    });

    if (record.count !== 1) {
      return this.prisma.mantokChestRun.findFirst({
        where: {
          characterId: character.id,
          token
        }
      }).then(mapRun);
    }

    return this.prisma.mantokChestRun.findFirst({
      where: {
        characterId: character.id,
        token
      }
    }).then(mapRun);
  }

  async confirmRunForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      now: Date;
      selectOutput: (
        snapshot: MantokChestSnapshot,
        run: MantokChestRunRecord
      ) => { state: "ok"; itemId: string; score: number } | { state: "stale-inputs" } | { state: "no-output-candidate" };
    }
  ): Promise<MantokChestConfirmResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const snapshot = await getSnapshot(tx, telegramUserId);

        if (!snapshot) {
          return { state: "no-character" };
        }

        const record = await tx.mantokChestRun.findFirst({
          where: {
            characterId: snapshot.characterId,
            token: input.token
          }
        });
        const run = mapRun(record);

        if (!run) {
          return { state: "invalid-token" };
        }

        if (run.status === "completed") {
          return { state: "replayed", run };
        }

        if (run.status === "cancelled") {
          return { state: "cancelled", run };
        }

        const selected = input.selectOutput(snapshot, run);

        if (selected.state === "stale-inputs") {
          return { state: "stale-inputs", run };
        }

        if (selected.state === "no-output-candidate") {
          return { state: "no-output-candidate", run };
        }

        const claimed = await tx.mantokChestRun.updateMany({
          where: {
            id: run.id,
            status: "pending"
          },
          data: {
            status: "completed",
            outputItemsJson: [{ itemId: selected.itemId, quantity: 1 }],
            outputScore: selected.score,
            completedAt: input.now,
            updatedAt: input.now
          }
        });

        if (claimed.count !== 1) {
          const current = mapRun(
            await tx.mantokChestRun.findFirst({
              where: {
                id: run.id
              }
            })
          );

          if (!current) {
            return { state: "invalid-token" };
          }

          if (current.status === "completed") {
            return { state: "replayed", run: current };
          }

          if (current.status === "cancelled") {
            return { state: "cancelled", run: current };
          }

          return { state: "invalid-token" };
        }

        const claimedRun = mapRun(
          await tx.mantokChestRun.findFirst({
            where: {
              id: run.id
            }
          })
        );

        if (!claimedRun) {
          throw new Error("Mantok Chest claim did not leave a run row.");
        }

        for (const item of run.inputItems) {
          const consumed = await tx.characterItem.updateMany({
            where: {
              characterId: snapshot.characterId,
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
            throw new MantokChestStaleInputsError(run);
          }
        }

        await tx.characterItem.deleteMany({
          where: {
            characterId: snapshot.characterId,
            quantity: {
              lte: 0
            }
          }
        });

        await tx.characterItem.upsert({
          where: {
            characterId_itemId: {
              characterId: snapshot.characterId,
              itemId: selected.itemId
            }
          },
          create: {
            characterId: snapshot.characterId,
            itemId: selected.itemId,
            quantity: 1
          },
          update: {
            quantity: {
              increment: 1
            }
          }
        });

        return {
          state: "recycled",
          run: claimedRun
        };
      });
    } catch (error) {
      if (error instanceof MantokChestStaleInputsError) {
        return {
          state: "stale-inputs",
          run: error.run
        };
      }

      throw error;
    }
  }
}

class MantokChestStaleInputsError extends Error {
  constructor(readonly run: MantokChestRunRecord) {
    super("Mantok Chest inputs changed during transaction.");
  }
}

async function getSnapshot(tx: TxClient, telegramUserId: bigint): Promise<MantokChestSnapshot | null> {
  const character = await tx.character.findFirst({
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
    characterId: character.id,
    items: items.map(toCharacterItemRecord),
    equippedItemIds: equipment.map((row) => row.itemId)
  };
}

function mapRun(record: PrismaMantokChestRunRecord): MantokChestRunRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    characterId: record.characterId,
    token: record.token,
    status: parseStatus(record.status),
    inputItems: parseRunItems(record.inputItemsJson),
    outputItems: parseRunItems(record.outputItemsJson),
    averageInputScore: record.averageInputScore,
    minimumOutputScore: record.minimumOutputScore,
    outputScore: record.outputScore,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function parseStatus(status: string): MantokChestRunStatus {
  return status === "completed" || status === "cancelled" ? status : "pending";
}

function parseRunItems(value: unknown): MantokChestRunItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      return [];
    }

    const quantity = Number(entry.quantity);

    return Number.isInteger(quantity) && quantity > 0
      ? [{ itemId: entry.itemId, quantity }]
      : [];
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
