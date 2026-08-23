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
import { findAllActiveReservedItemIds } from "./itemTransferReservations";
import { items } from "../../content";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import { applyPriestBlessingBonusToSummary } from "../../domain/noncombat/priestBlessingBonus";
import {
  EQUIPMENT_ATTUNEMENT_ACTION_KEY,
  isEquipmentAttunementPendingForRow
} from "../../domain/equipment/equipmentAttunement";
import {
  InventoryMutationContentionError,
  lockInventoryItemStacks,
  runSerializableInventoryMutation
} from "./inventoryMutationSerialization";
import { isInventorySelectionAvailable } from "./inventoryReservationValidation";

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
    try {
      return await runSerializableInventoryMutation(this.prisma, async (tx) => {
        const character = await tx.character.findFirst({
          where: { user: { telegramUserId } },
          select: { id: true }
        });
        if (!character) return null;

        await lockInventoryItemStacks(tx, character.id, input.inputItems.map((item) => item.itemId), input.now);
        if (!(await isInventorySelectionAvailable(tx, {
          characterId: character.id,
          items: input.inputItems,
          now: input.now
        }))) return null;

        return mapRun(await tx.mantokChestRun.create({
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
        }));
      });
    } catch (error) {
      if (error instanceof InventoryMutationContentionError) return null;
      throw error;
    }
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
    try {
      return await runSerializableInventoryMutation(this.prisma, async (tx) => {
        const character = await tx.character.findFirst({
          where: { user: { telegramUserId } },
          select: { id: true }
        });
        if (!character) return null;
        const run = mapRun(await tx.mantokChestRun.findFirst({
          where: { characterId: character.id, token: input.token }
        }));
        if (!run || run.status !== "pending") return null;

        await lockInventoryItemStacks(tx, character.id, [
          ...run.inputItems.map((item) => item.itemId),
          ...input.inputItems.map((item) => item.itemId)
        ], input.now);
        if (!(await isInventorySelectionAvailable(tx, {
          characterId: character.id,
          items: input.inputItems,
          now: input.now,
          exclusions: { exceptMantokChestRunId: run.id }
        }))) return null;

        const updated = await tx.mantokChestRun.updateMany({
          where: { id: run.id, status: "pending" },
          data: {
            inputItemsJson: input.inputItems as unknown as Prisma.InputJsonValue,
            averageInputScore: Math.floor(input.averageInputScore),
            minimumOutputScore: input.minimumOutputScore,
            updatedAt: input.now
          }
        });
        if (updated.count !== 1) return null;
        return mapRun(await tx.mantokChestRun.findUnique({ where: { id: run.id } }));
      });
    } catch (error) {
      if (error instanceof InventoryMutationContentionError) return null;
      throw error;
    }
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
      return await runSerializableInventoryMutation(this.prisma, async (tx) => {
        const character = await tx.character.findFirst({
          where: {
            user: {
              telegramUserId
            }
          },
          select: {
            id: true,
            name: true,
            pronoun: true,
            path: true,
            raceId: true,
            classId: true,
            level: true,
            xp: true,
            gold: true,
            hpCurrent: true,
            hpMax: true,
            manaCurrent: true,
            manaMax: true,
            statsJson: true,
            equipment: true,
            _count: {
              select: { remorts: true }
            }
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

        await lockInventoryItemStacks(tx, character.id, run.inputItems.map((item) => item.itemId), input.now);

        const [attunementPayloads, activePriestBlessing] = await Promise.all([
          findCurrentEquipmentAttunementPayloads(tx, character),
          tx.noncombatPriestBlessing.findFirst({
            where: {
              targetCharacterId: character.id,
              status: "active",
              expiresAt: { gt: input.now }
            },
            orderBy: { startedAt: "desc" },
            select: { bonusStat: true, bonusAmount: true, expiresAt: true }
          })
        ]);
        const snapshot = await getConfirmationSnapshot(tx, {
          characterId: character.id,
          characterDisplayName: character.name,
          playerLuck: getConfirmationEffectiveLuck(
            character,
            attunementPayloads,
            activePriestBlessing,
            input.now
          ),
          inputItems: run.inputItems,
          exceptRunId: run.id,
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
      if (error instanceof InventoryMutationContentionError) {
        try {
          const run = await this.findRunForTelegramUser(telegramUserId, input.token);
          if (!run) return { state: "invalid-token" };
          if (run.status === "completed") return { state: "replayed", run };
          if (run.status === "cancelled") return { state: "cancelled", run };
          if (run.status === "expired") return { state: "expired", run };
          return { state: "stale-inputs", run };
        } catch {
          return { state: "invalid-token" };
        }
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
    playerLuck: number;
    inputItems: MantokChestRunItem[];
    exceptRunId: string;
    now: Date;
  }
): Promise<MantokChestSnapshot> {
  const inputItemIds = [...new Set(input.inputItems.map((item) => item.itemId))];
  const [items, equipment, reservedItemIds] = await Promise.all([
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
    findAllActiveReservedItemIds(tx, {
      characterId: input.characterId,
      now: input.now,
      exceptMantokChestRunId: input.exceptRunId
    })
  ]);
  const inputItemIdSet = new Set(inputItemIds);

  return {
    characterId: input.characterId,
    characterDisplayName: input.characterDisplayName,
    playerLuck: input.playerLuck,
    items: items.map(toCharacterItemRecord),
    equippedItemIds: equipment.map((row) => row.itemId),
    reservedItemIds: [
      ...reservedItemIds
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
      name: true,
      statsJson: true
    }
  });

  if (!character) {
    return null;
  }

  const [items, equipment, reservedItemIds] = await Promise.all([
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
    findAllActiveReservedItemIds(tx, {
      characterId: character.id,
      now,
      ignoreMantokChestRuns: true
    })
  ]);

  return {
    characterId: character.id,
    characterDisplayName: character.name,
    playerLuck: readPlayerLuck(character.statsJson),
    items: items.map(toCharacterItemRecord),
    equippedItemIds: equipment.map((row) => row.itemId),
    reservedItemIds: [
      ...reservedItemIds
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

function getConfirmationEffectiveLuck(
  character: {
    name: string;
    pronoun: string;
    path: string;
    raceId: string;
    classId: string;
    level: number;
    xp: number;
    gold: number;
    hpCurrent: number;
    hpMax: number;
    manaCurrent: number;
    manaMax: number;
    statsJson: Prisma.JsonValue;
    equipment: Array<{ slot: string; itemId: string; updatedAt: Date }>;
    _count: { remorts: number };
  },
  actionPayloads: readonly (Prisma.JsonValue | null)[],
  activePriestBlessing: { bonusStat: string | null; bonusAmount: number; expiresAt: Date } | null,
  now: Date
): number {
  const equippedItems = character.equipment.flatMap((row) => {
    if (isEquipmentAttunementPendingForRow({ row, actionPayloads, now })) {
      return [];
    }

    const item = items.find((candidate) => candidate.id === row.itemId);
    return item ? [item] : [];
  });
  const summary = applyPriestBlessingBonusToSummary(summarizeCharacter(character, {
    equippedItems,
    remortCount: character._count.remorts
  }), activePriestBlessing, now);

  return summary.stats.luck;
}

async function findCurrentEquipmentAttunementPayloads(
  tx: TxClient,
  character: { id: string; equipment: Array<{ id: string; slot: string; updatedAt: Date }> }
): Promise<Array<Prisma.JsonValue | null>> {
  const localDates = character.equipment.map((row) => `${row.slot}:${row.id}:${row.updatedAt.getTime()}`);
  if (localDates.length === 0) {
    return [];
  }

  const actions = await tx.dailyAction.findMany({
    where: {
      characterId: character.id,
      key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
      localDate: { in: localDates }
    },
    select: { resultJson: true }
  });
  return actions.map((row) => row.resultJson);
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

function readPlayerLuck(value: unknown): number {
  if (!isRecord(value) || typeof value.luck !== "number" || !Number.isFinite(value.luck)) {
    return 0;
  }

  return Math.max(0, Math.floor(value.luck));
}
