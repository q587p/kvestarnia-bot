import { Prisma, type Character, type CharacterItem, type ItemTransfer, type PrismaClient } from "@prisma/client";
import type { ItemContent } from "../../content/schema";
import {
  buildItemGiftEligibleStacks,
  calculatePostalDeliveryFee,
  createItemGiftFingerprint
} from "../../domain/itemTransfers";
import type { ItemPostalPackageLine } from "../../domain/itemTransfers";
import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";
import type {
  ItemPostalConfirmInput,
  ItemPostalConfirmResult,
  ItemPostalDraftInput,
  ItemPostalDraftResult,
  ItemPostalDraftUpdateInput,
  ItemPostalDraftUpdateResult,
  ItemPostalRecipientsResult,
  ItemTransferCreateInput,
  ItemTransferCreateResult,
  ItemTransferKind,
  ItemTransferRecord,
  ItemTransferRepository,
  ItemTransferRespondResult,
  ItemTransferSnapshot,
  ItemTransferStatus,
  ItemPostalTransferPage,
  ItemPostalTransferSummary
} from "./itemTransferRepository";
import { findActiveTransferReservedItems } from "./itemTransferReservations";
import { findActiveItemUseReservedItems } from "./itemUseReservations";
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
    try {
      return await this.prisma.$transaction(async (tx) => {
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

        await releaseExpiredGiftReservation(tx, sender.id, input.item.id, input.now);
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
            reservationKey: createTransferReservationKey(sender.id, input.item.id),
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
    } catch (error) {
      if (isLiveReservationConflict(error)) {
        return { state: "stale-selection" };
      }

      throw error;
    }
  }

  async findGiftForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemTransferRecord | null> {
    return mapTransfer(await this.prisma.itemTransfer.findFirst({
      where: {
        token,
        transferKind: "gift",
        OR: [
          { senderTelegramUserId: telegramUserId },
          { receiverTelegramUserId: telegramUserId }
        ]
      }
    }));
  }

  async getPostalRecipientsForTelegramUser(
    telegramUserId: bigint,
    page: number,
    pageSize: number,
    pages: { inTransitPage?: number; historyPage?: number } = {}
  ): Promise<ItemPostalRecipientsResult> {
    return this.prisma.$transaction(async (tx) => {
      const sender = await findCharacter(tx, telegramUserId);
      if (!sender) {
        return { state: "no-character" };
      }

      const recipientIds = await getKnownPostalRecipientIds(tx, sender.id);
      const [inTransit, history] = await Promise.all([
        getPostalTransferPage(tx, sender.id, "transit", pages.inTransitPage ?? 0, pageSize),
        getPostalTransferPage(tx, sender.id, "history", pages.historyPage ?? 0, pageSize)
      ]);

      const total = recipientIds.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.max(0, Math.min(Math.trunc(page), totalPages - 1));
      const visibleIds = recipientIds.slice(safePage * pageSize, (safePage + 1) * pageSize);
      const characters = await tx.character.findMany({
        where: { id: { in: visibleIds } },
        include: {
          user: { select: { telegramUserId: true, lastSeenLocationId: true } },
          _count: { select: { remorts: true } }
        }
      });
      const byId = new Map(characters.map((character) => [character.id, character]));

      return {
        state: "ready",
        page: safePage,
        pageSize,
        total,
        totalPages,
        inTransit,
        history,
        visible: visibleIds.flatMap((id) => {
          const character = byId.get(id);
          return character
            ? [{
                telegramUserId: character.user.telegramUserId,
                name: character.name,
                level: character.level
              }]
            : [];
        })
      };
    });
  }

  async createPostalDraftForTelegramUser(
    senderTelegramUserId: bigint,
    input: ItemPostalDraftInput
  ): Promise<ItemPostalDraftResult> {
    return this.prisma.$transaction(async (tx) => {
      const sender = await findCharacter(tx, senderTelegramUserId);
      if (!sender) {
        return { state: "no-character" };
      }
      const receiver = await findKnownPostalReceiver(tx, sender.id, input.receiverTelegramUserId);
      if (!receiver) {
        return { state: "target-not-found" };
      }
      if (sender.id === receiver.id) {
        return { state: "self-gift" };
      }

      const transfer = await tx.itemTransfer.create({
        data: {
          token: input.token,
          transferKind: "postal",
          senderCharacterId: sender.id,
          receiverCharacterId: receiver.id,
          senderTelegramUserId,
          receiverTelegramUserId: input.receiverTelegramUserId,
          senderName: sender.name,
          receiverName: receiver.name,
          senderRemortCount: getIncludedRemortCount(sender),
          receiverRemortCount: getIncludedRemortCount(receiver),
          locationId: null,
          itemId: "item.postal-draft",
          itemName: "Поштова чернетка",
          itemFingerprint: "draft",
          quantity: 0,
          packageJson: [],
          deliveryFeeGold: 0,
          status: "draft",
          expiresAt: input.expiresAt,
          updatedAt: input.now
        }
      });

      return {
        state: "created",
        transfer: mustMapTransfer(transfer),
        sender: toCharacterRecord(sender),
        receiver: toCharacterRecord(receiver)
      };
    });
  }

  async updatePostalDraftForTelegramUser(
    telegramUserId: bigint,
    input: ItemPostalDraftUpdateInput
  ): Promise<ItemPostalDraftUpdateResult> {
    return this.prisma.$transaction(async (tx) => {
      const sender = await findCharacter(tx, telegramUserId);
      if (!sender) {
        return { state: "no-character" };
      }
      const transfer = mapTransfer(await tx.itemTransfer.findUnique({ where: { token: input.token } }));
      if (!transfer || transfer.transferKind !== "postal") {
        return { state: "invalid-token" };
      }
      if (transfer.senderCharacterId !== sender.id) {
        return { state: "not-sender" };
      }
      if (transfer.status !== "draft" || transfer.expiresAt <= input.now) {
        return { state: "stale-selection", transfer };
      }

      const updated = mustMapTransfer(await tx.itemTransfer.update({
        where: { id: transfer.id },
        data: {
          packageJson: input.packageLines as unknown as Prisma.InputJsonArray,
          deliveryFeeGold: input.deliveryFeeGold,
          itemId: input.packageLines[0]?.itemId ?? "item.postal-draft",
          itemName: input.packageLines[0]?.itemName ?? "Поштова чернетка",
          itemFingerprint: input.packageLines[0]?.itemFingerprint ?? "draft",
          quantity: input.packageLines.reduce((sum, line) => sum + line.quantity, 0),
          updatedAt: input.now
        }
      }));
      const receiver = await tx.character.findUniqueOrThrow({
        where: { id: transfer.receiverCharacterId },
        include: characterInclude
      });

      return {
        state: "updated",
        transfer: updated,
        sender: toCharacterRecord(sender),
        receiver: toCharacterRecord(receiver)
      };
    });
  }

  async findPostalTransferForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemTransferRecord | null> {
    return mapTransfer(await this.prisma.itemTransfer.findFirst({
      where: {
        token,
        transferKind: "postal",
        OR: [
          { senderTelegramUserId: telegramUserId },
          { receiverTelegramUserId: telegramUserId }
        ]
      }
    }));
  }

  async confirmPostalDraftForTelegramUser(
    telegramUserId: bigint,
    input: ItemPostalConfirmInput
  ): Promise<ItemPostalConfirmResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const sender = await findCharacter(tx, telegramUserId);
        if (!sender) {
          return { state: "no-character" };
        }
        const transfer = mapTransfer(await tx.itemTransfer.findUnique({ where: { token: input.token } }));
        if (!transfer || transfer.transferKind !== "postal") {
          return { state: "invalid-token" };
        }
        if (transfer.senderCharacterId !== sender.id) {
          return { state: "not-sender" };
        }
        if (transfer.status !== "draft" || transfer.expiresAt <= input.now || transfer.packageLines.length < 1) {
          return { state: "stale-selection", transfer };
        }

        const receiver = await tx.character.findUnique({
          where: { id: transfer.receiverCharacterId },
          include: characterInclude
        });
        if (!receiver || getIncludedRemortCount(receiver) !== transfer.receiverRemortCount) {
          return { state: "stale-selection", transfer };
        }
        if (sender.activeCombatLease || receiver.activeCombatLease) {
          return { state: "combat-locked", transfer };
        }

        await releaseExpiredPostalReservations(tx, sender.id, input.now);
        const itemIds = transfer.packageLines.map((line) => line.itemId);
        await lockSenderItemStacks(tx, sender.id, itemIds, input.now);

        const validation = await validatePostalPackage(tx, sender.id, transfer, input.itemContents, input.now);
        if (!validation.ok) {
          return { state: "stale-selection", transfer };
        }

        const fee = calculatePostalDeliveryFee(transfer.packageLines);
        const charged = await tx.character.updateMany({
          where: {
            id: sender.id,
            gold: { gte: fee }
          },
          data: {
            gold: { decrement: fee }
          }
        });
        if (charged.count !== 1) {
          return { state: "insufficient-gold", transfer: { ...transfer, deliveryFeeGold: fee } };
        }

        await movePostalPackageFromSenderToCustody(tx, sender.id, transfer);

        const confirmed = await tx.itemTransfer.updateMany({
          where: {
            id: transfer.id,
            status: "draft",
            expiresAt: { gt: input.now }
          },
          data: {
            status: "pending",
            expiresAt: input.expiresAt,
            reservationKey: createPostalReservationKey(sender.id),
            deliveryFeeGold: fee,
            resultJson: markPostalSenderDebited(input.result),
            updatedAt: input.now
          }
        });
        if (confirmed.count !== 1) {
          throw new StalePostalRollback(transfer, "stale-selection");
        }
        const updated = mustMapTransfer(await tx.itemTransfer.findUniqueOrThrow({ where: { id: transfer.id } }));
        const updatedSender = await tx.character.findUniqueOrThrow({
          where: { id: sender.id },
          include: characterInclude
        });

        return {
          state: "created",
          transfer: updated,
          sender: toCharacterRecord(updatedSender),
          receiver: toCharacterRecord(receiver)
        };
      });
    } catch (error) {
      if (error instanceof StalePostalRollback) {
        return { state: error.state, transfer: error.transfer };
      }
      if (isLiveReservationConflict(error)) {
        const transfer = await this.findPostalTransferForTelegramUser(telegramUserId, input.token);
        if (transfer) {
          return { state: "stale-selection", transfer };
        }
      }
      throw error;
    }
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
        if (transfer.transferKind !== "gift") {
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

  async cancelPostalForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<ItemTransferRespondResult> {
    return this.respondByStatus(telegramUserId, token, "cancelled", now, "sender", "postal", ["draft", "pending"]);
  }

  async declinePostalForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<ItemTransferRespondResult> {
    return this.respondByStatus(telegramUserId, token, "declined", now, "recipient", "postal");
  }

  async acceptPostalForTelegramUser(
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
        if (!transfer || !transferRow || transfer.transferKind !== "postal") {
          return { state: "invalid-token" };
        }

        if (actor.id !== transfer.receiverCharacterId) {
          return { state: "not-recipient" };
        }

        const terminal = await replayIfTerminal(tx, transfer);
        if (terminal) {
          return terminal;
        }

        if (transfer.status === "draft") {
          return { state: "stale-selection", transfer };
        }

        if (transfer.expiresAt <= input.now) {
          return guardedPostalTerminalResult(tx, transfer, "expired", input.now, { kind: "postal-expired" }, "pending");
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
          getIncludedRemortCount(sender) !== transfer.senderRemortCount ||
          getIncludedRemortCount(receiver) !== transfer.receiverRemortCount
        ) {
          return { state: "stale-selection", transfer };
        }
        const senderDebited = hasPostalSenderDebited(transfer);
        const validation = senderDebited
          ? validatePostalPackageContent(transfer, input.itemContents)
          : await validatePostalPackage(tx, sender.id, transfer, input.itemContents, input.now, transfer.id);
        if (!validation.ok) {
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

        if (!senderDebited) {
          await movePostalPackageFromSenderToCustody(tx, sender.id, transfer);
        }
        await deliverPostalPackageToReceiver(tx, receiver.id, transfer);

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
      if (error instanceof StalePostalRollback) {
        return { state: error.state, transfer: error.transfer };
      }
      throw error;
    }
  }

  private async respondByStatus(
    telegramUserId: bigint,
    token: string,
    status: "cancelled" | "declined",
    now: Date,
    actor: "sender" | "recipient",
    transferKind: ItemTransferKind = "gift",
    expectedStatuses: readonly string[] = ["pending"]
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
      if (transfer.transferKind !== transferKind) {
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

      const senderCancellation = transferKind === "postal" && actor === "sender" && status === "cancelled";
      if (transfer.expiresAt <= now && !senderCancellation) {
        return transferKind === "postal"
          ? guardedPostalTerminalResult(tx, transfer, "expired", now, { kind: "postal-expired" }, "pending")
          : guardedTerminalResult(tx, transfer.id, "expired", now, { kind: "expired" }, "pending");
      }

      return transferKind === "postal"
        ? guardedPostalTerminalResult(tx, transfer, status, now, { kind: status }, expectedStatuses)
        : guardedTerminalResult(tx, transfer.id, status, now, { kind: status }, expectedStatuses);
    });
  }
}

class StaleGiftRollback extends Error {
  constructor(readonly transfer: ItemTransferRecord) {
    super("Gift selection changed during transaction.");
  }
}

class StalePostalRollback extends Error {
  constructor(
    readonly transfer: ItemTransferRecord,
    readonly state: "stale-selection" | "insufficient-gold"
  ) {
    super("Postal delivery changed during transaction.");
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

async function lockSenderItemStacks(
  tx: TxClient,
  characterId: string,
  itemIds: readonly string[],
  now: Date
): Promise<void> {
  await tx.characterItem.updateMany({
    where: { characterId, itemId: { in: [...new Set(itemIds)] } },
    data: { updatedAt: now }
  });
}

async function releaseExpiredGiftReservation(
  tx: TxClient,
  senderCharacterId: string,
  itemId: string,
  now: Date
): Promise<void> {
  await tx.itemTransfer.updateMany({
    where: {
      transferKind: "gift",
      senderCharacterId,
      itemId,
      status: "pending",
      expiresAt: { lte: now }
    },
    data: {
      status: "expired",
      reservationKey: null,
      respondedAt: now,
      updatedAt: now,
      resultJson: {
        kind: "expired"
      }
    }
  });
}

async function releaseExpiredPostalReservations(
  tx: TxClient,
  senderCharacterId: string,
  now: Date
): Promise<void> {
  const rows = await tx.itemTransfer.findMany({
    where: {
      transferKind: "postal",
      senderCharacterId,
      status: { in: ["draft", "pending"] },
      expiresAt: { lte: now }
    }
  });

  for (const row of rows) {
    const transfer = mapTransfer(row);
    if (!transfer) {
      continue;
    }
    await guardedPostalTerminalResult(tx, transfer, "expired", now, { kind: "postal-expired" }, transfer.status);
  }
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
  const [pendingChestRuns, pendingLevelBarters, pendingSales, pendingTransfers, pendingUses] = await Promise.all([
    tx.mantokChestRun.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.levelBarterExchange.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.korchmaMantokSale.findMany({
      where: {
        characterId,
        status: { in: ["pending", "processing"] },
        expiresAt: { gt: now }
      },
      select: { selectionJson: true }
    }),
    findActiveTransferReservedItems(tx, {
      senderCharacterId: characterId,
      now,
      ...(exceptTransferId ? { exceptTransferId } : {})
    }),
    findActiveItemUseReservedItems(tx, {
      characterId,
      now
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
  for (const use of pendingUses) {
    reserved.add(use.itemId);
  }

  return [...reserved];
}

async function findKnownPostalReceiver(
  tx: TxClient,
  senderCharacterId: string,
  receiverTelegramUserId: bigint
) {
  const receiver = await findCharacter(tx, receiverTelegramUserId);
  if (!receiver) {
    return null;
  }
  if (receiver.id === senderCharacterId) {
    return receiver;
  }

  const known = await isKnownPostalRecipient(tx, senderCharacterId, receiver.id);
  return known ? receiver : null;
}

async function getKnownPostalRecipientIds(tx: TxClient, senderCharacterId: string): Promise<string[]> {
  const [transferRows, duelRows, bardRows] = await Promise.all([
    tx.itemTransfer.findMany({
      where: {
        status: "completed",
        OR: [
          { senderCharacterId },
          { receiverCharacterId: senderCharacterId }
        ]
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        senderCharacterId: true,
        receiverCharacterId: true,
        completedAt: true,
        updatedAt: true
      },
      take: 200
    }),
    tx.duelChallenge.findMany({
      where: {
        status: { in: ["active", "resolved"] },
        targetCharacterId: { not: null },
        OR: [
          { challengerCharacterId: senderCharacterId },
          { targetCharacterId: senderCharacterId }
        ]
      },
      orderBy: [{ resolvedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        challengerCharacterId: true,
        targetCharacterId: true,
        resolvedAt: true,
        updatedAt: true,
        createdAt: true
      },
      take: 200
    }),
    tx.bardPerformanceReaction.findMany({
      where: {
        status: { in: ["applauded", "tipped"] },
        OR: [
          { characterId: senderCharacterId },
          { performance: { characterId: senderCharacterId } }
        ]
      },
      orderBy: [{ respondedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        characterId: true,
        respondedAt: true,
        updatedAt: true,
        performance: {
          select: {
            characterId: true,
            updatedAt: true
          }
        }
      },
      take: 200
    })
  ]);

  const contacts: Array<{ recipientId: string; interactedAt: Date }> = [];
  for (const row of transferRows) {
    const recipientId = row.senderCharacterId === senderCharacterId ? row.receiverCharacterId : row.senderCharacterId;
    contacts.push({ recipientId, interactedAt: row.completedAt ?? row.updatedAt });
  }
  for (const row of duelRows) {
    const recipientId = row.challengerCharacterId === senderCharacterId ? row.targetCharacterId : row.challengerCharacterId;
    if (recipientId) {
      contacts.push({ recipientId, interactedAt: row.resolvedAt ?? row.updatedAt ?? row.createdAt });
    }
  }
  for (const row of bardRows) {
    const recipientId = row.characterId === senderCharacterId ? row.performance.characterId : row.characterId;
    contacts.push({ recipientId, interactedAt: row.respondedAt ?? row.updatedAt ?? row.performance.updatedAt });
  }

  const seen = new Set<string>();
  return contacts
    .filter((contact) => contact.recipientId !== senderCharacterId)
    .sort((left, right) => right.interactedAt.getTime() - left.interactedAt.getTime())
    .flatMap((contact) => {
      if (seen.has(contact.recipientId)) {
        return [];
      }
      seen.add(contact.recipientId);
      return [contact.recipientId];
    });
}

async function getPostalTransferPage(
  tx: TxClient,
  characterId: string,
  mode: "transit" | "history",
  page: number,
  pageSize: number
): Promise<ItemPostalTransferPage> {
  const status = mode === "transit" ? "pending" : "completed";
  const where: Prisma.ItemTransferWhereInput = {
    transferKind: "postal",
    status,
    OR: [
      { senderCharacterId: characterId },
      { receiverCharacterId: characterId }
    ]
  };
  const total = await tx.itemTransfer.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(0, Math.min(Math.trunc(page), totalPages - 1));
  const rows = await tx.itemTransfer.findMany({
    where,
    orderBy: mode === "transit"
      ? [{ expiresAt: "asc" }, { updatedAt: "desc" }]
      : [{ completedAt: "desc" }, { updatedAt: "desc" }],
    skip: safePage * pageSize,
    take: pageSize
  });

  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    visible: rows.flatMap((row) => {
      const transfer = mapTransfer(row);
      return transfer ? [presentPostalTransferSummary(transfer, characterId)] : [];
    })
  };
}

function presentPostalTransferSummary(
  transfer: ItemTransferRecord,
  characterId: string
): ItemPostalTransferSummary {
  const direction = transfer.senderCharacterId === characterId ? "outgoing" : "incoming";

  return {
    token: transfer.token,
    status: transfer.status,
    direction,
    otherName: direction === "outgoing" ? transfer.receiverName : transfer.senderName,
    packageLines: transfer.packageLines,
    deliveryFeeGold: transfer.deliveryFeeGold,
    expiresAt: transfer.expiresAt,
    completedAt: transfer.completedAt,
    respondedAt: transfer.respondedAt,
    updatedAt: transfer.updatedAt
  };
}

async function isKnownPostalRecipient(tx: TxClient, senderCharacterId: string, receiverCharacterId: string): Promise<boolean> {
  const [transfer, duel, bardReaction] = await Promise.all([
    tx.itemTransfer.findFirst({
      where: {
        status: "completed",
        OR: [
          { senderCharacterId, receiverCharacterId },
          { senderCharacterId: receiverCharacterId, receiverCharacterId: senderCharacterId }
        ]
      },
      select: { id: true }
    }),
    tx.duelChallenge.findFirst({
      where: {
        status: { in: ["active", "resolved"] },
        OR: [
          { challengerCharacterId: senderCharacterId, targetCharacterId: receiverCharacterId },
          { challengerCharacterId: receiverCharacterId, targetCharacterId: senderCharacterId }
        ]
      },
      select: { id: true }
    }),
    tx.bardPerformanceReaction.findFirst({
      where: {
        status: { in: ["applauded", "tipped"] },
        OR: [
          {
            characterId: senderCharacterId,
            performance: { characterId: receiverCharacterId }
          },
          {
            characterId: receiverCharacterId,
            performance: { characterId: senderCharacterId }
          }
        ]
      },
      select: { id: true }
    })
  ]);

  return Boolean(transfer || duel || bardReaction);
}

async function validatePostalPackage(
  tx: TxClient,
  senderCharacterId: string,
  transfer: ItemTransferRecord,
  itemContents: readonly ItemContent[],
  now: Date,
  exceptTransferId?: string
): Promise<{ ok: boolean }> {
  const lines = transfer.packageLines;
  if (lines.length < 1 || lines.length > 5) {
    return { ok: false };
  }
  const seen = new Set<string>();
  for (const line of lines) {
    if (
      seen.has(line.itemId) ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 93
    ) {
      return { ok: false };
    }
    seen.add(line.itemId);
  }

  const [items, equipment, reservedItemIds] = await Promise.all([
    getItems(tx, senderCharacterId),
    getEquippedItemIds(tx, senderCharacterId),
    getReservedItemIds(tx, senderCharacterId, now, exceptTransferId)
  ]);
  const eligible = buildItemGiftEligibleStacks({
    stacks: items,
    equippedItemIds: new Set(equipment),
    reservedItemIds: new Set(reservedItemIds),
    itemContents
  });
  const byId = new Map(eligible.map((stack) => [stack.itemId, stack]));

  for (const line of lines) {
    const current = byId.get(line.itemId);
    if (
      !current ||
      current.quantity < line.quantity ||
      current.fingerprint !== line.itemFingerprint ||
      current.content.name !== line.itemName ||
      createItemGiftFingerprint(current.content) !== line.itemFingerprint
    ) {
      return { ok: false };
    }
  }

  return { ok: true };
}

function validatePostalPackageContent(
  transfer: ItemTransferRecord,
  itemContents: readonly ItemContent[]
): { ok: boolean } {
  const lines = transfer.packageLines;
  if (lines.length < 1 || lines.length > 5) {
    return { ok: false };
  }
  const seen = new Set<string>();
  const contentById = new Map(itemContents.map((item) => [item.id, item]));
  for (const line of lines) {
    if (
      seen.has(line.itemId) ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 93
    ) {
      return { ok: false };
    }
    seen.add(line.itemId);

    const current = contentById.get(line.itemId);
    if (
      !current ||
      current.name !== line.itemName ||
      createItemGiftFingerprint(current) !== line.itemFingerprint ||
      !sameStringList([...(current.tags ?? [])].sort(), [...line.tags].sort())
    ) {
      return { ok: false };
    }
  }

  return { ok: true };
}

async function movePostalPackageFromSenderToCustody(
  tx: TxClient,
  senderCharacterId: string,
  transfer: ItemTransferRecord
): Promise<void> {
  for (const line of transfer.packageLines) {
    const consumed = await tx.characterItem.updateMany({
      where: {
        characterId: senderCharacterId,
        itemId: line.itemId,
        quantity: { gte: line.quantity }
      },
      data: {
        quantity: { decrement: line.quantity }
      }
    });
    if (consumed.count !== 1) {
      throw new StalePostalRollback(transfer, "stale-selection");
    }
  }

  await tx.characterItem.deleteMany({
    where: {
      characterId: senderCharacterId,
      quantity: { lte: 0 }
    }
  });
}

async function restorePostalPackageToSender(tx: TxClient, transfer: ItemTransferRecord): Promise<void> {
  await upsertPostalPackageToCharacter(tx, transfer.senderCharacterId, transfer);
}

async function deliverPostalPackageToReceiver(
  tx: TxClient,
  receiverCharacterId: string,
  transfer: ItemTransferRecord
): Promise<void> {
  await upsertPostalPackageToCharacter(tx, receiverCharacterId, transfer);
}

async function upsertPostalPackageToCharacter(
  tx: TxClient,
  characterId: string,
  transfer: ItemTransferRecord
): Promise<void> {
  for (const line of transfer.packageLines) {
    await tx.characterItem.upsert({
      where: {
        characterId_itemId: {
          characterId,
          itemId: line.itemId
        }
      },
      create: {
        characterId,
        itemId: line.itemId,
        quantity: line.quantity
      },
      update: {
        quantity: { increment: line.quantity }
      }
    });
  }
}

function markPostalSenderDebited(result: unknown): Prisma.InputJsonObject {
  const base = isRecord(result) ? result : {};
  return {
    ...base,
    postalCustody: "sender-debited"
  };
}

function hasPostalSenderDebited(transfer: ItemTransferRecord): boolean {
  return isRecord(transfer.result) && transfer.result.postalCustody === "sender-debited";
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function replayIfTerminal(
  tx: TxClient,
  transfer: ItemTransferRecord
): Promise<ItemTransferRespondResult | null> {
  if (transfer.status === "draft" || transfer.status === "pending" || transfer.status === "processing") {
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
  expectedStatus: string | readonly string[]
): Promise<ItemTransferRespondResult> {
  const transition = await setTransferStatus(tx, transferId, status, now, result, expectedStatus);
  if (transition.changed) {
    return { state: status, transfer: transition.transfer, transitioned: true };
  }

  return canonicalTransferResult(tx, transition.transfer);
}

async function guardedPostalTerminalResult(
  tx: TxClient,
  transfer: ItemTransferRecord,
  status: "declined" | "expired" | "cancelled",
  now: Date,
  result: unknown,
  expectedStatus: string | readonly string[]
): Promise<ItemTransferRespondResult> {
  const transition = await setTransferStatus(tx, transfer.id, status, now, result, expectedStatus);
  if (transition.changed) {
    if (transfer.status === "pending" && hasPostalSenderDebited(transfer)) {
      await restorePostalPackageToSender(tx, transfer);
    }
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
  expectedStatus?: string | readonly string[]
): Promise<{ transfer: ItemTransferRecord; changed: boolean }> {
  const data = {
    status,
    reservationKey: null,
    resultJson: result as Prisma.InputJsonValue,
    ...(status === "completed" ? { completedAt: now } : { respondedAt: now }),
    updatedAt: now
  };

  if (expectedStatus) {
    const expectedStatuses = typeof expectedStatus === "string" ? [expectedStatus] : Array.from(expectedStatus);
    const changed = await tx.itemTransfer.updateMany({
      where: { id: transferId, status: { in: expectedStatuses } },
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
    transferKind: parseTransferKind(record.transferKind),
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
    packageLines: parsePackageLines(record.packageJson),
    deliveryFeeGold: record.deliveryFeeGold,
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
  return status === "draft" ||
    status === "processing" ||
    status === "completed" ||
    status === "declined" ||
    status === "expired" ||
    status === "cancelled"
    ? status
    : "pending";
}

function parseTransferKind(kind: string): ItemTransferKind {
  return kind === "postal" ? "postal" : "gift";
}

function mustMapTransfer(record: ItemTransfer): ItemTransferRecord {
  const transfer = mapTransfer(record);
  if (!transfer) {
    throw new Error("Item transfer mapping failed.");
  }

  return transfer;
}

function createTransferReservationKey(senderCharacterId: string, itemId: string): string {
  return `gift:${senderCharacterId}:${itemId}`;
}

function createPostalReservationKey(senderCharacterId: string): string {
  return `postal:${senderCharacterId}`;
}

function parsePackageLines(value: unknown): ItemPostalPackageLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): ItemPostalPackageLine[] => {
    if (!isRecord(entry)) {
      return [];
    }
    const itemId = stringOrNull(entry.itemId);
    const itemName = stringOrNull(entry.itemName);
    const itemFingerprint = stringOrNull(entry.itemFingerprint);
    const quantity = integerOrNull(entry.quantity);
    const unitGoldValue = integerOrNull(entry.unitGoldValue);
    const observedQuantity = integerOrNull(entry.observedQuantity);
    if (
      !itemId ||
      !itemName ||
      !itemFingerprint ||
      quantity === null ||
      unitGoldValue === null ||
      observedQuantity === null
    ) {
      return [];
    }

    return [{
      itemId,
      itemName,
      itemFingerprint,
      quantity,
      unitGoldValue,
      observedQuantity,
      tags: Array.isArray(entry.tags)
        ? entry.tags.filter((tag): tag is string => typeof tag === "string")
        : []
    }];
  });
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integerOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function isLiveReservationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  const targets = Array.isArray(target)
    ? target.filter((entry): entry is string => typeof entry === "string")
    : typeof target === "string"
      ? [target]
      : [];

  return targets.some((entry) => entry.includes("reservationKey") || entry.includes("reservation_key"));
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
