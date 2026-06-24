import { Prisma, type Character, type CharacterItem, type ItemTransfer, type PrismaClient } from "@prisma/client";
import type { ItemContent } from "../../content/schema";
import {
  buildItemGiftEligibleStacks,
  createItemGiftFingerprint
} from "../../domain/itemTransfers";
import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";
import type {
  ItemTransferCreateInput,
  ItemTransferCreateResult,
  ItemTransferRecord,
  ItemTransferRepository,
  ItemTransferRespondResult,
  ItemTransferSnapshot,
  ItemTransferStatus
} from "./itemTransferRepository";
import { findActiveTransferReservedItems } from "./itemTransferReservations";
import { getIncludedRemortCount } from "./prismaRemortCount";

type TxClient = Prisma.TransactionClient;

export class PrismaItemTransferRepository implements ItemTransferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(telegramUserId: bigint, now: Date): Promise<ItemTransferSnapshot | null> {
    return this.prisma.$transaction((tx) => getSnapshot(tx, telegramUserId, now));
  }

  async createGiftForTelegramUser(
    senderTelegramUserId: bigint,
    input: ItemTransferCreateInput
  ): Promise<ItemTransferCreateResult> {
    return this.prisma.$transaction(async (tx) => {
      const sender = await findCharacter(tx, senderTelegramUserId);
      if (!sender) {
        return { state: "no-character" };
      }

      const receiver = await findCharacter(tx, input.receiverTelegramUserId);
      if (!receiver) {
        return { state: "target-not-found" };
      }

      if (sender.id === receiver.id) {
        return { state: "self-gift" };
      }

      if (sender.activeCombatLease || receiver.activeCombatLease) {
        return { state: "combat-locked" };
      }

      const senderLocation = sender.user.lastSeenLocationId;
      const receiverLocation = receiver.user.lastSeenLocationId;
      if (!senderLocation || senderLocation !== receiverLocation) {
        return { state: "location-mismatch" };
      }

      await lockSenderItemStack(tx, sender.id, input.item.id, input.now);

      const [items, equipment, reservedItemIds] = await Promise.all([
        getItems(tx, sender.id),
        getEquippedItemIds(tx, sender.id),
        getReservedItemIds(tx, sender.id, input.now)
      ]);
      const eligible = buildItemGiftEligibleStacks({
        stacks: items,
        equippedItemIds: new Set(equipment),
        reservedItemIds: new Set(reservedItemIds),
        itemContents: [input.item]
      });
      const selected = eligible.find((stack) => stack.itemId === input.item.id);

      if (!selected || selected.fingerprint !== input.itemFingerprint) {
        return { state: "stale-selection" };
      }

      const transfer = await tx.itemTransfer.create({
        data: {
          token: input.token,
          senderCharacterId: sender.id,
          receiverCharacterId: receiver.id,
          senderTelegramUserId,
          receiverTelegramUserId: input.receiverTelegramUserId,
          senderName: sender.name,
          receiverName: receiver.name,
          senderRemortCount: getIncludedRemortCount(sender),
          receiverRemortCount: getIncludedRemortCount(receiver),
          locationId: senderLocation,
          itemId: input.item.id,
          itemName: input.item.name,
          itemFingerprint: input.itemFingerprint,
          quantity: 1,
          status: "pending",
          expiresAt: input.expiresAt,
          updatedAt: input.now
        }
      });

      return {
        state: "created",
        transfer: mapTransfer(transfer) ?? (() => {
          throw new Error("Item transfer mapping failed after create.");
        })(),
        sender: toCharacterRecord(sender),
        receiver: toCharacterRecord(receiver)
      };
    });
  }

  async findGiftForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemTransferRecord | null> {
    return mapTransfer(await this.prisma.itemTransfer.findFirst({
      where: {
        token,
        OR: [
          { senderTelegramUserId: telegramUserId },
          { receiverTelegramUserId: telegramUserId }
        ]
      }
    }));
  }

  async cancelGiftForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<ItemTransferRespondResult> {
    return this.respondByStatus(telegramUserId, token, "cancelled", now, "sender");
  }

  async declineGiftForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<ItemTransferRespondResult> {
    return this.respondByStatus(telegramUserId, token, "declined", now, "recipient");
  }

  async acceptGiftForTelegramUser(
    telegramUserId: bigint,
    input: { token: string; itemContents: readonly ItemContent[]; now: Date; result: unknown }
  ): Promise<ItemTransferRespondResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await findCharacter(tx, telegramUserId);
        if (!actor) {
          return { state: "no-character" };
        }

        const transferRow = await tx.itemTransfer.findUnique({ where: { token: input.token } });
        const transfer = mapTransfer(transferRow);
        if (!transfer || !transferRow) {
          return { state: "invalid-token" };
        }

        if (actor.id !== transfer.receiverCharacterId) {
          return { state: "not-recipient" };
        }

        const terminal = await replayIfTerminal(tx, transfer);
        if (terminal) {
          return terminal;
        }

        if (transfer.expiresAt <= input.now) {
          return guardedTerminalResult(tx, transfer.id, "expired", input.now, { kind: "expired" }, "pending");
        }

        const sender = await tx.character.findUnique({
          where: { id: transfer.senderCharacterId },
          include: characterInclude
        });
        const receiver = await tx.character.findUnique({
          where: { id: transfer.receiverCharacterId },
          include: characterInclude
        });

        if (!sender || !receiver) {
          return { state: "invalid-token" };
        }

        if (sender.activeCombatLease || receiver.activeCombatLease) {
          return { state: "combat-locked", transfer };
        }

        if (
          sender.user.lastSeenLocationId !== transfer.locationId ||
          receiver.user.lastSeenLocationId !== transfer.locationId
        ) {
          return { state: "location-mismatch", transfer };
        }

        if (
          getIncludedRemortCount(sender) !== transfer.senderRemortCount ||
          getIncludedRemortCount(receiver) !== transfer.receiverRemortCount
        ) {
          return { state: "stale-selection", transfer };
        }

        const [items, equipment, reservedItemIds] = await Promise.all([
          getItems(tx, sender.id),
          getEquippedItemIds(tx, sender.id),
          getReservedItemIds(tx, sender.id, input.now, transfer.id)
        ]);
        const eligible = buildItemGiftEligibleStacks({
          stacks: items,
          equippedItemIds: new Set(equipment),
          reservedItemIds: new Set(reservedItemIds),
          itemContents: input.itemContents
        });
        const current = eligible.find((stack) => stack.itemId === transfer.itemId);

        if (
          !current ||
          current.fingerprint !== transfer.itemFingerprint ||
          current.content.name !== transfer.itemName ||
          createItemGiftFingerprint(current.content) !== transfer.itemFingerprint
        ) {
          return { state: "stale-selection", transfer };
        }

        const claimed = await tx.itemTransfer.updateMany({
          where: {
            id: transfer.id,
            status: "pending",
            expiresAt: { gt: input.now }
          },
          data: {
            status: "processing",
            updatedAt: input.now
          }
        });

        if (claimed.count !== 1) {
          const replay = mapTransfer(await tx.itemTransfer.findUnique({ where: { id: transfer.id } }));
          return replay ? replayTransfer(tx, replay) : { state: "invalid-token" };
        }

        const consumed = await tx.characterItem.updateMany({
          where: {
            characterId: sender.id,
            itemId: transfer.itemId,
            quantity: { gte: 1 }
          },
          data: {
            quantity: { decrement: 1 }
          }
        });

        if (consumed.count !== 1) {
          throw new StaleGiftRollback(transfer);
        }

        await tx.characterItem.deleteMany({
          where: {
            characterId: sender.id,
            quantity: { lte: 0 }
          }
        });

        await tx.characterItem.upsert({
          where: {
            characterId_itemId: {
              characterId: receiver.id,
              itemId: transfer.itemId
            }
          },
          create: {
            characterId: receiver.id,
            itemId: transfer.itemId,
            quantity: 1
          },
          update: {
            quantity: { increment: 1 }
          }
        });

        const completed = await setTransferStatus(tx, transfer.id, "completed", input.now, input.result, "processing");
        if (!completed.changed) {
          return canonicalTransferResult(tx, completed.transfer);
        }
        const [updatedSender, updatedReceiver] = await Promise.all([
          tx.character.findUniqueOrThrow({ where: { id: sender.id }, include: characterInclude }),
          tx.character.findUniqueOrThrow({ where: { id: receiver.id }, include: characterInclude })
        ]);

        return {
          state: "completed",
          transfer: completed.transfer,
          sender: toCharacterRecord(updatedSender),
          receiver: toCharacterRecord(updatedReceiver)
        };
      });
    } catch (error) {
      if (error instanceof StaleGiftRollback) {
        return { state: "stale-selection", transfer: error.transfer };
      }

      throw error;
    }
  }

  private async respondByStatus(
    telegramUserId: bigint,
    token: string,
    status: "cancelled" | "declined",
    now: Date,
    actor: "sender" | "recipient"
  ): Promise<ItemTransferRespondResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const transfer = mapTransfer(await tx.itemTransfer.findUnique({ where: { token } }));
      if (!transfer) {
        return { state: "invalid-token" };
      }

      if (actor === "sender" && character.id !== transfer.senderCharacterId) {
        return { state: "not-sender" };
      }
      if (actor === "recipient" && character.id !== transfer.receiverCharacterId) {
        return { state: "not-recipient" };
      }

      const terminal = await replayIfTerminal(tx, transfer);
      if (terminal) {
        return terminal;
      }

      if (transfer.expiresAt <= now) {
        return guardedTerminalResult(tx, transfer.id, "expired", now, { kind: "expired" }, "pending");
      }

      return guardedTerminalResult(tx, transfer.id, status, now, { kind: status }, "pending");
    });
  }
}

class StaleGiftRollback extends Error {
  constructor(readonly transfer: ItemTransferRecord) {
    super("Gift selection changed during transaction.");
  }
}

const characterInclude = {
  user: {
    select: {
      telegramUserId: true,
      lastSeenLocationId: true
    }
  },
  activeCombatLease: true,
  _count: {
    select: {
      remorts: true
    }
  }
};

async function getSnapshot(tx: TxClient, telegramUserId: bigint, now: Date): Promise<ItemTransferSnapshot | null> {
  const character = await findCharacter(tx, telegramUserId);
  if (!character) {
    return null;
  }

  const [items, equippedItemIds, reservedItemIds] = await Promise.all([
    getItems(tx, character.id),
    getEquippedItemIds(tx, character.id),
    getReservedItemIds(tx, character.id, now)
  ]);

  return {
    character: toCharacterRecord(character),
    items: items.map(toCharacterItemRecord),
    equippedItemIds,
    reservedItemIds
  };
}

async function findCharacter(tx: TxClient, telegramUserId: bigint) {
  return tx.character.findFirst({
    where: {
      user: {
        telegramUserId
      }
    },
    include: characterInclude
  });
}

async function getItems(tx: TxClient, characterId: string): Promise<CharacterItem[]> {
  return tx.characterItem.findMany({
    where: { characterId },
    orderBy: [{ createdAt: "asc" }, { itemId: "asc" }]
  });
}

async function lockSenderItemStack(
  tx: TxClient,
  characterId: string,
  itemId: string,
  now: Date
): Promise<void> {
  await tx.characterItem.updateMany({
    where: { characterId, itemId },
    data: { updatedAt: now }
  });
}

async function getEquippedItemIds(tx: TxClient, characterId: string): Promise<string[]> {
  const rows = await tx.characterEquipment.findMany({
    where: { characterId },
    select: { itemId: true }
  });

  return rows.map((row) => row.itemId);
}

async function getReservedItemIds(
  tx: TxClient,
  characterId: string,
  now: Date,
  exceptTransferId?: string
): Promise<string[]> {
  const [pendingChestRuns, pendingLevelBarters, pendingSales, pendingTransfers] = await Promise.all([
    tx.mantokChestRun.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.levelBarterExchange.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.korchmaMantokSale.findMany({
      where: { characterId, status: { in: ["pending", "processing"] } },
      select: { selectionJson: true }
    }),
    findActiveTransferReservedItems(tx, {
      senderCharacterId: characterId,
      now,
      ...(exceptTransferId ? { exceptTransferId } : {})
    })
  ]);
  const reserved = new Set<string>();

  for (const run of pendingChestRuns) {
    for (const item of parseItems(run.inputItemsJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const exchange of pendingLevelBarters) {
    for (const item of parseItems(exchange.inputItemsJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const sale of pendingSales) {
    for (const item of parseItems(sale.selectionJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const transfer of pendingTransfers) {
    reserved.add(transfer.itemId);
  }

  return [...reserved];
}

async function replayIfTerminal(
  tx: TxClient,
  transfer: ItemTransferRecord
): Promise<ItemTransferRespondResult | null> {
  if (transfer.status === "pending" || transfer.status === "processing") {
    return null;
  }

  if (transfer.status === "completed") {
    return replayTransfer(tx, transfer);
  }

  if (transfer.status === "declined" || transfer.status === "expired" || transfer.status === "cancelled") {
    return { state: transfer.status, transfer };
  }

  return { state: "invalid-token" };
}

async function guardedTerminalResult(
  tx: TxClient,
  transferId: string,
  status: "declined" | "expired" | "cancelled",
  now: Date,
  result: unknown,
  expectedStatus: string
): Promise<ItemTransferRespondResult> {
  const transition = await setTransferStatus(tx, transferId, status, now, result, expectedStatus);
  if (transition.changed) {
    return { state: status, transfer: transition.transfer, transitioned: true };
  }

  return canonicalTransferResult(tx, transition.transfer);
}

async function canonicalTransferResult(
  tx: TxClient,
  transfer: ItemTransferRecord
): Promise<ItemTransferRespondResult> {
  if (transfer.status === "completed") {
    return replayTransfer(tx, transfer);
  }

  if (transfer.status === "declined" || transfer.status === "expired" || transfer.status === "cancelled") {
    return { state: transfer.status, transfer };
  }

  return { state: "stale-selection", transfer };
}

async function replayTransfer(tx: TxClient, transfer: ItemTransferRecord): Promise<ItemTransferRespondResult> {
  if (transfer.status !== "completed") {
    if (transfer.status === "declined" || transfer.status === "expired" || transfer.status === "cancelled") {
      return { state: transfer.status, transfer };
    }

    return { state: "invalid-token" };
  }

  const [sender, receiver] = await Promise.all([
    tx.character.findUnique({ where: { id: transfer.senderCharacterId }, include: characterInclude }),
    tx.character.findUnique({ where: { id: transfer.receiverCharacterId }, include: characterInclude })
  ]);

  return {
    state: "replayed",
    transfer,
    sender: sender ? toCharacterRecord(sender) : null,
    receiver: receiver ? toCharacterRecord(receiver) : null
  };
}

async function setTransferStatus(
  tx: TxClient,
  transferId: string,
  status: "completed" | "declined" | "expired" | "cancelled",
  now: Date,
  result: unknown,
  expectedStatus?: string
): Promise<{ transfer: ItemTransferRecord; changed: boolean }> {
  const data = {
    status,
    resultJson: result as Prisma.InputJsonValue,
    ...(status === "completed" ? { completedAt: now } : { respondedAt: now }),
    updatedAt: now
  };

  if (expectedStatus) {
    const changed = await tx.itemTransfer.updateMany({
      where: { id: transferId, status: expectedStatus },
      data
    });

    if (changed.count !== 1) {
      const replay = mapTransfer(await tx.itemTransfer.findUnique({ where: { id: transferId } }));
      if (!replay) {
        throw new Error("Item transfer disappeared during status race.");
      }

      return { transfer: replay, changed: false };
    }
  } else {
    await tx.itemTransfer.update({
      where: { id: transferId },
      data
    });
  }

  const transfer = mapTransfer(await tx.itemTransfer.findUnique({ where: { id: transferId } }));
  if (!transfer) {
    throw new Error("Item transfer mapping failed after status update.");
  }

  return { transfer, changed: true };
}

function toCharacterRecord(
  character: Character & {
    user: { telegramUserId: bigint; lastSeenLocationId: string | null };
    _count?: { remorts?: number };
  }
): CharacterRecord {
  return {
    id: character.id,
    userId: character.userId,
    currentLocationId: character.user.lastSeenLocationId,
    name: character.name,
    pronoun: character.pronoun,
    path: character.path,
    raceId: character.raceId,
    classId: character.classId,
    level: character.level,
    xp: character.xp,
    gold: character.gold,
    hpCurrent: character.hpCurrent,
    hpMax: character.hpMax,
    manaCurrent: character.manaCurrent,
    manaMax: character.manaMax,
    hpRegenAt: character.hpRegenAt,
    manaRegenAt: character.manaRegenAt,
    statsJson: character.statsJson,
    remortCount: getIncludedRemortCount(character)
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

function mapTransfer(record: ItemTransfer | null): ItemTransferRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    token: record.token,
    senderCharacterId: record.senderCharacterId,
    receiverCharacterId: record.receiverCharacterId,
    senderTelegramUserId: record.senderTelegramUserId,
    receiverTelegramUserId: record.receiverTelegramUserId,
    senderName: record.senderName,
    receiverName: record.receiverName,
    senderRemortCount: record.senderRemortCount,
    receiverRemortCount: record.receiverRemortCount,
    locationId: record.locationId,
    itemId: record.itemId,
    itemName: record.itemName,
    itemFingerprint: record.itemFingerprint,
    quantity: record.quantity,
    status: parseStatus(record.status),
    result: record.resultJson,
    expiresAt: record.expiresAt,
    completedAt: record.completedAt,
    respondedAt: record.respondedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function parseStatus(status: string): ItemTransferStatus {
  return status === "processing" ||
    status === "completed" ||
    status === "declined" ||
    status === "expired" ||
    status === "cancelled"
    ? status
    : "pending";
}

function parseItems(value: unknown): Array<{ itemId: string; quantity: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): Array<{ itemId: string; quantity: number }> => {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      return [];
    }

    const quantity = Number(entry.quantity);

    return Number.isInteger(quantity) && quantity > 0
      ? [{ itemId: entry.itemId, quantity }]
      : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
