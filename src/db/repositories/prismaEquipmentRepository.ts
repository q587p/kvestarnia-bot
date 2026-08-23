import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentAttunementNotificationRecord,
  EquipForCharacterResult,
  FinishEquipmentAttunementsResult,
  EquipmentRepository,
  EquipmentSlot
} from "./equipmentRepository";
import { EquipmentInventoryUnavailableError } from "./equipmentRepository";
import {
  getEquipmentSlotStorageKeys,
  normalizeEquipmentSlot
} from "../../content/equipmentSlots";
import {
  buildEquipmentAttunementPayload,
  EQUIPMENT_ATTUNEMENT_ACTION_KEY,
  isEquipmentAttunementReady,
  matchesEquipmentAttunementRow,
  parseEquipmentAttunementPayload,
  type EquipmentAttunementPayload
} from "../../domain/equipment/equipmentAttunement";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";
import { getQuestMarkerReadSnapshot } from "./questMarkerReadContext";
import {
  InventoryMutationContentionError,
  lockInventoryItemStack,
  runSerializableInventoryMutation
} from "./inventoryMutationSerialization";

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class PrismaEquipmentRepository implements EquipmentRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hpRecoveryProducer = new HpRecoveryNotificationProducer(false)
  ) {}

  async listByTelegramUserId(telegramUserId: bigint): Promise<CharacterEquipmentSnapshot | null> {
    const markerSnapshot = getQuestMarkerReadSnapshot(telegramUserId);
    if (markerSnapshot) {
      if (!markerSnapshot.character) {
        return null;
      }
      const attunements = markerSnapshot.dailyActions.filter(
        (action) => action.key === EQUIPMENT_ATTUNEMENT_ACTION_KEY
      );
      return {
        characterId: markerSnapshot.character.id,
        equipment: markerSnapshot.equipment.flatMap((row) => {
          const record = toRecord(row, findAttunementForRow(row, attunements, new Date()));
          return record ? [record] : [];
        })
      };
    }

    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true,
        dailyActions: {
          where: {
            key: EQUIPMENT_ATTUNEMENT_ACTION_KEY
          },
          orderBy: {
            createdAt: "desc"
          }
        },
        equipment: {
          orderBy: {
            slot: "asc"
          }
        }
      }
    });

    if (!character) {
      return null;
    }

    return {
      characterId: character.id,
      equipment: character.equipment.flatMap((row) => {
        const record = toRecord(row, findAttunementForRow(row, character.dailyActions, new Date()));

        return record ? [record] : [];
      })
    };
  }

  async equipForCharacter(
    characterId: string,
    slot: EquipmentSlot,
    itemId: string
  ): Promise<CharacterEquipmentRecord> {
    const row = await runSerializableInventoryMutation(this.prisma, async (tx) => {
      await lockInventoryItemStack(tx, characterId, itemId, new Date());
      await assertInventoryCopyAvailable(tx, characterId, itemId, slot);
      const storageKeys = getEquipmentSlotStorageKeys(slot);
      const legacyKeys = storageKeys.filter((key) => key !== slot);

      if (legacyKeys.length > 0) {
        await tx.characterEquipment.deleteMany({
          where: {
            characterId,
            slot: {
              in: legacyKeys
            }
          }
        });
      }

      const row = await tx.characterEquipment.upsert({
        where: {
          characterId_slot: {
            characterId,
            slot
          }
        },
        create: {
          characterId,
          slot,
          itemId
        },
        update: {
          itemId
        }
      });
      await this.hpRecoveryProducer.record(tx, characterId, new Date(), "recovering");
      return row;
    }).catch((error: unknown) => {
      if (error instanceof InventoryMutationContentionError) {
        throw new EquipmentInventoryUnavailableError();
      }
      throw error;
    });

    const record = toRecord(row);
    if (!record) {
      throw new Error(`Unsupported equipment slot returned after equip: ${row.slot}`);
    }

    return record;
  }

  async equipForCharacterAtomically(input: {
    characterId: string;
    slot: EquipmentSlot;
    itemId: string;
    clearSlot?: EquipmentSlot;
    attunement?: {
      strength: "weak" | "strong";
      itemName: string;
      startedAt: Date;
      readyAt: Date;
    };
  }): Promise<EquipForCharacterResult> {
    try {
      return await this.equipForCharacterAtomicallyUnsafe(input);
    } catch (error) {
      if (
        error instanceof InventoryMutationContentionError ||
        error instanceof EquipmentInventoryUnavailableError
      ) {
        return { state: "not-owned" };
      }
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const row = await this.prisma.characterEquipment.findUnique({
        where: {
          characterId_slot: {
            characterId: input.characterId,
            slot: input.slot
          }
        }
      });

      if (row?.itemId !== input.itemId) {
        throw error;
      }

      const attunementActions = await this.prisma.dailyAction.findMany({
        where: {
          characterId: input.characterId,
          key: EQUIPMENT_ATTUNEMENT_ACTION_KEY
        },
        orderBy: {
          createdAt: "desc"
        }
      });
      const record = toRecord(row, findAttunementForRow(row, attunementActions, new Date()));
      if (!record) {
        throw new Error(`Unsupported equipment slot returned after concurrent equip: ${row.slot}`);
      }

      return {
        record,
        changed: false
      };
    }
  }

  async unequipForCharacter(characterId: string, slot: EquipmentSlot): Promise<boolean> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const deletedRows = await tx.characterEquipment.deleteMany({
        where: {
          characterId,
          slot: {
            in: [...getEquipmentSlotStorageKeys(slot)]
          }
        }
      });

      if (deletedRows.count > 0) {
        await cancelActiveAttunementsForSlot(tx, characterId, slot, new Date());
        await this.hpRecoveryProducer.record(tx, characterId, new Date(), "recovering");
      }

      return deletedRows;
    });

    return deleted.count > 0;
  }

  async listDueAttunementNotifications(
    now: Date,
    options: { limit?: number } = {}
  ): Promise<EquipmentAttunementNotificationRecord[]> {
    const limit = Math.max(1, options.limit ?? 50);
    const batchSize = Math.max(limit * 3, 50);
    const due: EquipmentAttunementNotificationRecord[] = [];
    let cursor: string | undefined;

    while (due.length < limit) {
      const rows = await this.prisma.dailyAction.findMany({
        where: {
          key: EQUIPMENT_ATTUNEMENT_ACTION_KEY
        },
        include: {
          character: {
            include: {
              user: true,
              equipment: true
            }
          }
        },
        orderBy: [
          { createdAt: "asc" },
          { id: "asc" }
        ],
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const payload = parseEquipmentAttunementPayload(row.resultJson);
        if (
          !payload ||
          payload.status !== "tuning" ||
          payload.notifiedAt ||
          !isEquipmentAttunementReady(payload, now)
        ) {
          continue;
        }

        const stillEquipped = row.character.equipment.some((equipment) =>
          equipment.slot === payload.slot &&
          equipment.itemId === payload.itemId &&
          equipment.updatedAt.toISOString() === payload.equipmentUpdatedAt
        );

        if (!stillEquipped) {
          continue;
        }

        due.push({
          actionId: row.id,
          characterId: row.characterId,
          telegramUserId: row.character.user.telegramUserId,
          itemId: payload.itemId,
          itemName: payload.itemName,
          strength: payload.strength,
          readyAt: new Date(payload.readyAt)
        });

        if (due.length >= limit) {
          break;
        }
      }

      if (rows.length < batchSize) {
        break;
      }

      cursor = rows.at(-1)?.id;
    }

    return due;
  }

  async markAttunementNotified(actionId: string, notifiedAt: Date): Promise<boolean> {
    const row = await this.prisma.dailyAction.findUnique({
      where: { id: actionId }
    });
    const payload = parseEquipmentAttunementPayload(row?.resultJson);

    if (!row || !payload || payload.status !== "tuning" || payload.notifiedAt) {
      return false;
    }

    await this.prisma.dailyAction.update({
      where: { id: actionId },
      data: {
        resultJson: {
          ...payload,
          notifiedAt: notifiedAt.toISOString()
        } satisfies EquipmentAttunementPayload
      }
    });

    return true;
  }

  async finishPendingAttunementsForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<FinishEquipmentAttunementsResult> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true,
        dailyActions: {
          where: {
            key: EQUIPMENT_ATTUNEMENT_ACTION_KEY
          }
        },
        equipment: true
      }
    });

    if (!character) {
      return { state: "no-character" };
    }

    let count = 0;

    for (const row of character.dailyActions) {
      const payload = parseEquipmentAttunementPayload(row.resultJson);
      if (
        !payload ||
        payload.status !== "tuning" ||
        payload.notifiedAt ||
        new Date(payload.readyAt).getTime() <= now.getTime()
      ) {
        continue;
      }

      const stillEquipped = character.equipment.some((equipment) =>
        equipment.slot === payload.slot &&
        equipment.itemId === payload.itemId &&
        equipment.updatedAt.toISOString() === payload.equipmentUpdatedAt
      );

      if (!stillEquipped) {
        continue;
      }

      await this.prisma.dailyAction.update({
        where: { id: row.id },
        data: {
          resultJson: {
            ...payload,
            readyAt: now.toISOString()
          } satisfies EquipmentAttunementPayload
        }
      });
      count += 1;
    }

    return {
      state: "finished",
      count
    };
  }

  private async equipForCharacterAtomicallyUnsafe(input: {
    characterId: string;
    slot: EquipmentSlot;
    itemId: string;
    clearSlot?: EquipmentSlot;
    attunement?: {
      strength: "weak" | "strong";
      itemName: string;
      startedAt: Date;
      readyAt: Date;
    };
  }): Promise<EquipForCharacterResult> {
    const result = await runSerializableInventoryMutation(this.prisma, async (tx) => {
      const now = input.attunement?.startedAt ?? new Date();
      await lockInventoryItemStack(tx, input.characterId, input.itemId, now);
      await assertInventoryCopyAvailable(
        tx,
        input.characterId,
        input.itemId,
        input.slot,
        input.clearSlot
      );
      const storageKeys = getEquipmentSlotStorageKeys(input.slot);
      const legacyKeys = storageKeys.filter((key) => key !== input.slot);

      if (legacyKeys.length > 0) {
        await tx.characterEquipment.deleteMany({
          where: {
            characterId: input.characterId,
            slot: {
              in: legacyKeys
            }
          }
        });
      }

      if (input.clearSlot) {
        await tx.characterEquipment.deleteMany({
          where: {
            characterId: input.characterId,
            slot: {
              in: [...getEquipmentSlotStorageKeys(input.clearSlot)]
            }
          }
        });
        await cancelActiveAttunementsForSlot(tx, input.characterId, input.clearSlot, now);
      }

      const updated = await tx.characterEquipment.updateMany({
        where: {
          characterId: input.characterId,
          slot: input.slot,
          NOT: {
            itemId: input.itemId
          }
        },
        data: {
          itemId: input.itemId
        }
      });

      if (updated.count > 0) {
        await cancelActiveAttunementsForSlot(tx, input.characterId, input.slot, now);

        const row = await tx.characterEquipment.findUniqueOrThrow({
          where: {
            characterId_slot: {
              characterId: input.characterId,
              slot: input.slot
            }
          }
        });

        await maybeCreateAttunement(tx, input, row);
        await this.hpRecoveryProducer.record(tx, input.characterId, now, "recovering");

        return {
          row,
          changed: true
        };
      }

      const existing = await tx.characterEquipment.findUnique({
        where: {
          characterId_slot: {
            characterId: input.characterId,
            slot: input.slot
          }
        }
      });

      if (existing) {
        const attunementActions = await tx.dailyAction.findMany({
          where: {
            characterId: input.characterId,
            key: EQUIPMENT_ATTUNEMENT_ACTION_KEY
          },
          orderBy: {
            createdAt: "desc"
          }
        });

        return {
          row: existing,
          changed: false,
          attunement: findAttunementForRow(existing, attunementActions, now)
        };
      }

      const row = await tx.characterEquipment.create({
        data: {
          characterId: input.characterId,
          slot: input.slot,
          itemId: input.itemId
        }
      });

      await maybeCreateAttunement(tx, input, row);
      await this.hpRecoveryProducer.record(tx, input.characterId, now, "recovering");

      return {
        row,
        changed: true
      };
    });

    const record = toRecord(result.row, result.attunement ?? (input.attunement
      ? {
          state: "tuning",
          strength: input.attunement.strength,
          startedAt: input.attunement.startedAt,
          readyAt: input.attunement.readyAt
        }
      : undefined));
    if (!record) {
      throw new Error(`Unsupported equipment slot returned after equip: ${result.row.slot}`);
    }

    return {
      record,
      changed: result.changed
    };
  }
}

async function assertInventoryCopyAvailable(
  tx: TxClient,
  characterId: string,
  itemId: string,
  targetSlot: EquipmentSlot,
  clearSlot?: EquipmentSlot
): Promise<void> {
  const [stack, equipment] = await Promise.all([
    tx.characterItem.findUnique({
      where: { characterId_itemId: { characterId, itemId } },
      select: { quantity: true }
    }),
    tx.characterEquipment.findMany({
      where: { characterId, itemId },
      select: { slot: true }
    })
  ]);
  const releasedSlots = new Set<string>([
    ...getEquipmentSlotStorageKeys(targetSlot),
    ...(clearSlot ? getEquipmentSlotStorageKeys(clearSlot) : [])
  ]);
  const copiesStillCommittedElsewhere = equipment.filter((row) => !releasedSlots.has(row.slot)).length;

  if (!stack || stack.quantity <= copiesStillCommittedElsewhere) {
    throw new EquipmentInventoryUnavailableError();
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toRecord(row: {
  id: string;
  characterId: string;
  slot: string;
  itemId: string;
  createdAt: Date;
  updatedAt: Date;
}, attunement?: CharacterEquipmentRecord["attunement"]): CharacterEquipmentRecord | null {
  const slot = normalizeEquipmentSlot(row.slot);

  if (!slot) {
    return null;
  }

  return {
    id: row.id,
    characterId: row.characterId,
    slot,
    itemId: row.itemId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(attunement ? { attunement } : {})
  };
}

async function maybeCreateAttunement(
  tx: TxClient,
  input: {
    characterId: string;
    slot: EquipmentSlot;
    itemId: string;
    attunement?: {
      strength: "weak" | "strong";
      itemName: string;
      startedAt: Date;
      readyAt: Date;
    };
  },
  row: {
    id: string;
    slot: string;
    itemId: string;
    updatedAt: Date;
  }
): Promise<void> {
  if (!input.attunement) {
    return;
  }

  const payload = buildEquipmentAttunementPayload({
    slot: row.slot,
    itemId: row.itemId,
    itemName: input.attunement.itemName,
    equipmentUpdatedAt: row.updatedAt,
    strength: input.attunement.strength,
    startedAt: input.attunement.startedAt,
    readyAt: input.attunement.readyAt
  });
  const localDate = `${row.slot}:${row.id}:${row.updatedAt.getTime()}`;

  await tx.dailyAction.upsert({
    where: {
      characterId_key_localDate: {
        characterId: input.characterId,
        key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
        localDate
      }
    },
    create: {
      characterId: input.characterId,
      key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
      localDate,
      rewardXp: 0,
      rewardGold: 0,
      spentGold: 0,
      resultJson: payload as unknown as Prisma.InputJsonValue
    },
    update: {}
  });
}

async function cancelActiveAttunementsForSlot(
  tx: TxClient,
  characterId: string,
  slot: EquipmentSlot,
  now: Date
): Promise<void> {
  const rows = await tx.dailyAction.findMany({
    where: {
      characterId,
      key: EQUIPMENT_ATTUNEMENT_ACTION_KEY
    }
  });

  for (const row of rows) {
    const payload = parseEquipmentAttunementPayload(row.resultJson);

    if (!payload || payload.status !== "tuning" || normalizeEquipmentSlot(payload.slot) !== slot) {
      continue;
    }

    await tx.dailyAction.update({
      where: { id: row.id },
      data: {
        resultJson: {
          ...payload,
          status: "cancelled",
          cancelledAt: now.toISOString()
        } satisfies EquipmentAttunementPayload
      }
    });
  }
}

function findAttunementForRow(
  row: {
    slot: string;
    itemId: string;
    updatedAt: Date;
  },
  actions: Array<{ resultJson: Prisma.JsonValue | null }>,
  now: Date
): CharacterEquipmentRecord["attunement"] | undefined {
  for (const action of actions) {
    const payload = parseEquipmentAttunementPayload(action.resultJson);

    if (
      !payload ||
      !matchesEquipmentAttunementRow(payload, row)
    ) {
      continue;
    }

    return {
      state: isEquipmentAttunementReady(payload, now) ? "attuned" : "tuning",
      strength: payload.strength,
      startedAt: new Date(payload.startedAt),
      readyAt: new Date(payload.readyAt)
    };
  }

  return undefined;
}
