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
import { findActiveTransferReservedItems } from "./itemTransferReservations";
import { findActiveItemUseReservedItems } from "./itemUseReservations";

type TxClient = Prisma.TransactionClient;
type PrismaMantokChestRunRecord = Awaited<ReturnType<PrismaClient["mantokChestRun"]["findFirst"]>>;

export class PrismaMantokChestRepository implements MantokChestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<MantokChestSnapshot | null> {
    return this.prisma.$transaction((tx) => getSnapshot(tx, telegramUserId, now));
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

  async findRunForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<MantokChestRunRecord | null> {
    const record = await this.prisma.mantokChestRun.findFirst({
      where: {
        token,
        character: {
          user: {
            telegramUserId
          }
        }
      }
    });

    return mapRun(record);
  }

  async updatePendingRunInputItemsForTelegramUser(
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

    const updated = await this.prisma.mantokChestRun.updateMany({
      where: {
        characterId: character.id,
        token: input.token,
        status: "pending"
      },
      data: {
        inputItemsJson: input.inputItems as unknown as Prisma.InputJsonValue,
        averageInputScore: Math.floor(input.averageInputScore),
        minimumOutputScore: input.minimumOutputScore,
        updatedAt: input.now
      }
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findRunForTelegramUser(telegramUserId, input.token);
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
        const character = await tx.character.findFirst({
          where: {
            user: {
              telegramUserId
            }
          },
          select: {
            id: true,
            name: true
          }
        });

        if (!character) {
          return { state: "no-character" };
        }

        const record = await tx.mantokChestRun.findFirst({
          where: {
            characterId: character.id,
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

        if (run.status === "expired") {
          return { state: "expired", run };
        }

        const snapshot = await getConfirmationSnapshot(tx, {
          characterId: character.id,
          characterDisplayName: character.name,
          inputItems: run.inputItems,
          now: input.now
        });
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
              characterId: character.id,
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
            characterId: character.id,
            quantity: {
              lte: 0
            }
          }
        });

        await tx.characterItem.upsert({
          where: {
            characterId_itemId: {
              characterId: character.id,
              itemId: selected.itemId
            }
          },
          create: {
            characterId: character.id,
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
          run: claimedRun,
          characterDisplayName: character.name
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

  async expirePendingRunsOlderThan(cutoff: Date, now: Date): Promise<number> {
    const expired = await this.prisma.mantokChestRun.updateMany({
      where: {
        status: "pending",
        createdAt: {
          lt: cutoff
        }
      },
      data: {
        status: "expired",
        expiredAt: now,
        updatedAt: now
      }
    });

    return expired.count;
  }
}

class MantokChestStaleInputsError extends Error {
  constructor(readonly run: MantokChestRunRecord) {
    super("Mantok Chest inputs changed during transaction.");
  }
}

async function getConfirmationSnapshot(
  tx: TxClient,
  input: {
    characterId: string;
    characterDisplayName: string;
    inputItems: MantokChestRunItem[];
    now: Date;
  }
): Promise<MantokChestSnapshot> {
  const inputItemIds = [...new Set(input.inputItems.map((item) => item.itemId))];
  const [items, equipment, pendingTransfers, pendingUses] = await Promise.all([
    tx.characterItem.findMany({
      where: {
        characterId: input.characterId,
        itemId: {
          in: inputItemIds
        }
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
        characterId: input.characterId,
        itemId: {
          in: inputItemIds
        }
      },
      select: {
        itemId: true
      }
    }),
    findActiveTransferReservedItems(tx, {
      senderCharacterId: input.characterId,
      now: input.now
    }),
    findActiveItemUseReservedItems(tx, {
      characterId: input.characterId,
      now: input.now
    })
  ]);
  const inputItemIdSet = new Set(inputItemIds);

  return {
    characterId: input.characterId,
    characterDisplayName: input.characterDisplayName,
    items: items.map(toCharacterItemRecord),
    equippedItemIds: equipment.map((row) => row.itemId),
    reservedItemIds: [
      ...pendingTransfers.map((row) => row.itemId),
      ...pendingUses.map((row) => row.itemId)
    ].filter((itemId) => inputItemIdSet.has(itemId))
  };
}

async function getSnapshot(tx: TxClient, telegramUserId: bigint, now: Date): Promise<MantokChestSnapshot | null> {
  const character = await tx.character.findFirst({
    where: {
      user: {
        telegramUserId
      }
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!character) {
    return null;
  }

  const [items, equipment, pendingTransfers, pendingUses] = await Promise.all([
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
    }),
    findActiveTransferReservedItems(tx, {
      senderCharacterId: character.id,
      now
    }),
    findActiveItemUseReservedItems(tx, {
      characterId: character.id,
      now
    })
  ]);

  return {
    characterId: character.id,
    characterDisplayName: character.name,
    items: items.map(toCharacterItemRecord),
    equippedItemIds: equipment.map((row) => row.itemId),
    reservedItemIds: [
      ...pendingTransfers.map((row) => row.itemId),
      ...pendingUses.map((row) => row.itemId)
    ]
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
    expiredAt: record.expiredAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function parseStatus(status: string): MantokChestRunStatus {
  return status === "completed" || status === "cancelled" || status === "expired"
    ? status
    : "pending";
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
