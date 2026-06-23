import { Prisma, type Character, type CharacterItem, type PrismaClient } from "@prisma/client";
import type { ItemContent } from "../../content/schema";
import type { CharacterRecord } from "./characterRepository";
import type { CharacterItemRecord } from "./inventoryRepository";
import type {
  ShynokAccessSnapshot,
  ShynokConfirmDrinkResult,
  ShynokConfirmRoundResult,
  ShynokConfirmSaleResult,
  ShynokDrinkOrderRecord,
  ShynokDrinkStateRecord,
  ShynokInventorySnapshot,
  ShynokMantokSaleRecord,
  ShynokRepository,
  ShynokRespondRoundOfferResult,
  ShynokRoundRecipientRecord,
  ShynokRoundRecipientSnapshot
} from "./shynokRepository";
import { getIncludedRemortCount } from "./prismaRemortCount";
import { buildDrinkEffect, isShynokDrinkKey } from "../../domain/shynokDrinks";
import { buildMantokSaleBasket, buildMantokSaleEligibleStacks } from "../../domain/mantokSales";

type TxClient = Prisma.TransactionClient;

export class PrismaShynokRepository implements ShynokRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getAccessSnapshotForTelegramUser(telegramUserId: bigint): Promise<ShynokAccessSnapshot | null> {
    const character = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      include: {
        ...characterRecordInclude,
        activeCombatLease: {
          select: {
            kind: true,
            referenceId: true
          }
        }
      }
    });

    return character ? toAccessSnapshot(character) : null;
  }

  async getInventorySnapshotForTelegramUser(telegramUserId: bigint): Promise<ShynokInventorySnapshot | null> {
    return this.prisma.$transaction((tx) => getInventorySnapshot(tx, telegramUserId));
  }

  async getActiveDrinkForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<ShynokDrinkStateRecord | null> {
    const state = await this.prisma.characterDrinkState.findFirst({
      where: {
        character: { user: { telegramUserId } }
      }
    });

    if (!state || state.expiresAt <= now) {
      return null;
    }

    return mapDrinkState(state);
  }

  async consumeQueuedDrinkForTelegramUser(
    telegramUserId: bigint,
    input: {
      expectedDrinkKey: ShynokDrinkOrderRecord["drinkKey"];
      now: Date;
      metadata: unknown;
    }
  ): Promise<ShynokDrinkStateRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: { user: { telegramUserId } },
        select: { id: true }
      });

      if (!character) {
        return null;
      }

      const current = await tx.characterDrinkState.findUnique({
        where: { characterId: character.id }
      });

      if (
        !current ||
        current.phase !== "queued" ||
        current.drinkKey !== input.expectedDrinkKey ||
        current.expiresAt <= input.now
      ) {
        return null;
      }

      const mapped = mapDrinkState(current);
      await tx.characterDrinkState.delete({
        where: { characterId: character.id }
      });

      return mapped;
    });
  }

  async createSelfDrinkOrderForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      drinkKey: ShynokDrinkOrderRecord["drinkKey"];
      priceGold: number;
      replacement: unknown;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<ShynokDrinkOrderRecord | null> {
    return this.createDrinkOrderForTelegramUser(telegramUserId, {
      ...input,
      status: "pending"
    });
  }

  async confirmSelfDrinkOrderForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      now: Date;
      result: unknown;
    }
  ): Promise<ShynokConfirmDrinkResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const order = mapDrinkOrder(await tx.korchmaDrinkOrder.findFirst({
        where: {
          token: input.token,
          characterId: character.id
        }
      }));

      if (!order) {
        return { state: "invalid-token" };
      }

      if (order.status === "completed") {
        return {
          state: "replayed",
          character: toCharacterRecord(character),
          order,
          drink: await findDrinkState(tx, character.id)
        };
      }

      if (order.status !== "pending") {
        return { state: "invalid-token" };
      }

      if (order.expiresAt <= input.now) {
        const expired = mapDrinkOrder(await tx.korchmaDrinkOrder.update({
          where: { id: order.id },
          data: { status: "expired", updatedAt: input.now }
        })) ?? order;

        return { state: "expired", order: expired };
      }

      const spent = await tx.character.updateMany({
        where: {
          id: character.id,
          gold: { gte: order.priceGold }
        },
        data: {
          gold: { decrement: order.priceGold }
        }
      });

      if (spent.count !== 1) {
        return {
          state: "not-enough-gold",
          character: toCharacterRecord(character),
          order
        };
      }

      const drink = await upsertDrinkState(tx, {
        characterId: character.id,
        drinkKey: order.drinkKey,
        sourceType: "self_purchase",
        sourceId: order.id,
        now: input.now,
        metadata: input.result
      });

      const completed = mapDrinkOrder(await tx.korchmaDrinkOrder.update({
        where: { id: order.id },
        data: {
          status: "completed",
          resultJson: input.result as Prisma.InputJsonValue,
          completedAt: input.now,
          updatedAt: input.now
        }
      })) ?? order;
      const updated = await tx.character.findUniqueOrThrow({
        where: { id: character.id },
        include: characterRecordInclude
      });

      return {
        state: "completed",
        character: toCharacterRecord(updated),
        order: completed,
        drink
      };
    });
  }

  async createRoundOrderForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      drinkKey: ShynokDrinkOrderRecord["drinkKey"];
      priceGold: number;
      snapshot: unknown;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<ShynokDrinkOrderRecord | null> {
    return this.createDrinkOrderForTelegramUser(telegramUserId, {
      ...input,
      replacement: input.snapshot,
      status: "pending-round"
    });
  }

  async confirmRoundOrderForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      tier: "simple" | "fine";
      localDate: string;
      offerExpiresAt: Date;
      now: Date;
    }
  ): Promise<ShynokConfirmRoundResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const order = mapDrinkOrder(await tx.korchmaDrinkOrder.findFirst({
        where: {
          token: input.token,
          characterId: character.id
        }
      }));

      if (!order) {
        return { state: "invalid-token" };
      }

      if (order.status === "completed-round") {
        const replay = parseRoundReplay(order.result);
        return {
          state: "replayed",
          character: toCharacterRecord(character),
          order,
          purchaseId: replay.purchaseId,
          recipientCount: replay.recipientCount
        };
      }

      if (order.status !== "pending-round") {
        return { state: "invalid-token" };
      }

      const expectedDrinkKey = input.tier === "fine" ? "drink.fine-beer" : "drink.simple-beer";
      if (order.drinkKey !== expectedDrinkKey) {
        return { state: "invalid-token" };
      }

      if (order.expiresAt <= input.now) {
        const expired = mapDrinkOrder(await tx.korchmaDrinkOrder.update({
          where: { id: order.id },
          data: { status: "expired", updatedAt: input.now }
        })) ?? order;

        return { state: "expired", order: expired };
      }

      const recipients = parseRoundSnapshot(order.replacement);
      if (recipients.length === 0) {
        return { state: "invalid-token" };
      }

      const spent = await tx.character.updateMany({
        where: {
          id: character.id,
          gold: { gte: order.priceGold }
        },
        data: {
          gold: { decrement: order.priceGold }
        }
      });

      if (spent.count !== 1) {
        return {
          state: "not-enough-gold",
          character: toCharacterRecord(character),
          order
        };
      }

      const purchase = await tx.korchmaRoundPurchase.create({
        data: {
          characterId: character.id,
          tier: input.tier,
          spentGold: order.priceGold,
          localDate: input.localDate,
          drinkKey: order.drinkKey,
          recipientCount: recipients.length,
          offerExpiresAt: input.offerExpiresAt,
          rulesVersion: "shynok-round-v1",
          snapshotJson: recipients.map((recipient) => ({
            characterId: recipient.characterId,
            telegramUserId: recipient.telegramUserId.toString()
          })),
          telemetryJson: {
            snapshotCount: recipients.length,
            acceptedCount: 0,
            declinedCount: 0,
            expiredCount: 0
          }
        }
      });

      for (const recipient of recipients) {
        await tx.korchmaRoundRecipient.create({
          data: {
            purchaseId: purchase.id,
            characterId: recipient.characterId,
            drinkKey: order.drinkKey,
            status: "offered",
            offeredAt: input.now,
            expiresAt: input.offerExpiresAt
          }
        });
      }

      const replay = {
        purchaseId: purchase.id,
        recipientCount: recipients.length
      };
      const completed = mapDrinkOrder(await tx.korchmaDrinkOrder.update({
        where: { id: order.id },
        data: {
          status: "completed-round",
          resultJson: replay,
          completedAt: input.now,
          updatedAt: input.now
        }
      })) ?? order;
      const updated = await tx.character.findUniqueOrThrow({
        where: { id: character.id },
        include: characterRecordInclude
      });

      return {
        state: "completed",
        character: toCharacterRecord(updated),
        order: completed,
        purchaseId: purchase.id,
        recipientCount: recipients.length
      };
    });
  }

  async respondToRoundOfferForTelegramUser(
    telegramUserId: bigint,
    input: {
      offerId: string;
      action: "accept" | "decline";
      now: Date;
      result: unknown;
    }
  ): Promise<ShynokRespondRoundOfferResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const offer = mapRoundRecipient(await tx.korchmaRoundRecipient.findFirst({
        where: {
          id: input.offerId,
          characterId: character.id
        }
      }));

      if (!offer) {
        return { state: "invalid-offer" };
      }

      if (offer.status === "accepted") {
        return {
          state: "replayed",
          offer,
          drink: await findDrinkState(tx, character.id)
        };
      }

      if (offer.status === "declined") {
        return { state: "declined", offer };
      }

      if (offer.status === "expired" || offer.expiresAt <= input.now) {
        const expired = await setRoundOfferStatus(tx, offer.id, "expired", input.now, offer.result);
        await incrementRoundTelemetry(tx, offer.purchaseId, "expiredCount");
        return { state: "expired", offer: expired };
      }

      if (input.action === "decline") {
        const declined = await setRoundOfferStatus(tx, offer.id, "declined", input.now, input.result);
        await incrementRoundTelemetry(tx, offer.purchaseId, "declinedCount");
        return { state: "declined", offer: declined };
      }

      const drink = await upsertDrinkState(tx, {
        characterId: character.id,
        drinkKey: offer.drinkKey,
        sourceType: "round",
        sourceId: offer.id,
        now: input.now,
        metadata: input.result
      });
      const accepted = await setRoundOfferStatus(tx, offer.id, "accepted", input.now, input.result);
      await incrementRoundTelemetry(tx, offer.purchaseId, "acceptedCount");

      return {
        state: "accepted",
        offer: accepted,
        drink
      };
    });
  }

  async listOpenRoundOffersForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<ShynokRoundRecipientRecord[]> {
    const rows = await this.prisma.korchmaRoundRecipient.findMany({
      where: {
        status: "offered",
        expiresAt: { gt: now },
        character: { user: { telegramUserId } }
      },
      orderBy: {
        offeredAt: "desc"
      },
      take: 5
    });

    return rows.map(mapRoundRecipient).filter((row): row is ShynokRoundRecipientRecord => Boolean(row));
  }

  async listRoundRecipientsForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<ShynokRoundRecipientSnapshot[]> {
    const buyer = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      select: { id: true }
    });

    if (!buyer) {
      return [];
    }

    const activeSince = new Date(now.getTime() - 5 * 60_000);
    const recipients = await this.prisma.character.findMany({
      where: {
        user: {
          lastActionAt: { gte: activeSince },
          lastSeenLocationId: {
            in: [
              "location.korchma.hall",
              "location.korchma.quest_table",
              "location.korchma.bar",
              "location.korchma.cellar",
              "location.korchma.barrel",
              "location.korchma.news_corner",
              "location.korchma.ranger_corner",
              "location.korchma.fighting_corner"
            ]
          },
          currentRaidId: null
        },
        activeCombatLease: null
      },
      include: {
        user: {
          select: { telegramUserId: true }
        }
      },
      orderBy: [
        { id: "asc" }
      ],
      take: 42
    });
    const mapped = recipients.map((recipient) => ({
      characterId: recipient.id,
      telegramUserId: recipient.user.telegramUserId,
      name: recipient.name
    }));

    if (mapped.some((recipient) => recipient.characterId === buyer.id)) {
      return mapped;
    }

    const buyerRow = await this.prisma.character.findUnique({
      where: { id: buyer.id },
      include: { user: { select: { telegramUserId: true } } }
    });

    if (!buyerRow) {
      return mapped;
    }

    return [
      {
        characterId: buyerRow.id,
        telegramUserId: buyerRow.user.telegramUserId,
        name: buyerRow.name
      },
      ...mapped
    ].slice(0, 42);
  }

  async createSaleForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      selection: Array<{ itemId: string; quantity: number }>;
      selectionFingerprint: string;
      nominalValue: number;
      payoutGold: number;
      expiresAt: Date;
      now: Date;
    }
  ): Promise<ShynokMantokSaleRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      select: { id: true }
    });

    if (!character) {
      return null;
    }

    const sale = await this.prisma.korchmaMantokSale.create({
      data: {
        token: input.token,
        characterId: character.id,
        status: "pending",
        selectionJson: input.selection,
        selectionFingerprint: input.selectionFingerprint,
        nominalValue: input.nominalValue,
        payoutGold: input.payoutGold,
        expiresAt: input.expiresAt,
        updatedAt: input.now
      }
    });

    return mapSale(sale);
  }

  async updateSaleSelectionForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      selection: Array<{ itemId: string; quantity: number }>;
      selectionFingerprint: string;
      nominalValue: number;
      payoutGold: number;
      now: Date;
    }
  ): Promise<ShynokMantokSaleRecord | null> {
    const updated = await this.prisma.korchmaMantokSale.updateMany({
      where: {
        token: input.token,
        status: "pending",
        character: { user: { telegramUserId } }
      },
      data: {
        selectionJson: input.selection,
        selectionFingerprint: input.selectionFingerprint,
        nominalValue: input.nominalValue,
        payoutGold: input.payoutGold,
        updatedAt: input.now
      }
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findSaleForTelegramUser(telegramUserId, input.token);
  }

  async findSaleForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<ShynokMantokSaleRecord | null> {
    return mapSale(await this.prisma.korchmaMantokSale.findFirst({
      where: {
        token,
        character: { user: { telegramUserId } }
      }
    }));
  }

  async cancelSaleForTelegramUser(
    telegramUserId: bigint,
    token: string,
    now: Date
  ): Promise<ShynokMantokSaleRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      select: { id: true }
    });

    if (!character) {
      return null;
    }

    await this.prisma.korchmaMantokSale.updateMany({
      where: {
        token,
        characterId: character.id,
        status: "pending"
      },
      data: {
        status: "cancelled",
        updatedAt: now
      }
    });

    return this.findSaleForTelegramUser(telegramUserId, token);
  }

  async confirmSaleForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      itemContents: readonly ItemContent[];
      result: unknown;
      now: Date;
    }
  ): Promise<ShynokConfirmSaleResult> {
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await getInventorySnapshot(tx, telegramUserId);

      if (!snapshot) {
        return { state: "no-character" };
      }

      const sale = mapSale(await tx.korchmaMantokSale.findFirst({
        where: {
          token: input.token,
          characterId: snapshot.character.id
        }
      }));

      if (!sale) {
        return { state: "invalid-token" };
      }

      if (sale.status === "completed") {
        return {
          state: "replayed",
          character: snapshot.character,
          sale
        };
      }

      if (sale.status === "cancelled") {
        return { state: "cancelled", sale };
      }

      if (sale.status === "expired" || sale.expiresAt <= input.now) {
        const expired = await setSaleStatus(tx, sale.id, "expired", input.now, sale.result);
        return { state: "expired", sale: expired };
      }

      const eligible = buildMantokSaleEligibleStacks({
        stacks: snapshot.items,
        equippedItemIds: new Set(snapshot.equippedItemIds),
        reservedItemIds: new Set(snapshot.reservedItemIds),
        itemContents: input.itemContents
      });
      const basket = buildMantokSaleBasket(sale.selection, eligible);

      if (
        !basket ||
        sale.selectionFingerprint !== basket.fingerprint ||
        sale.nominalValue !== basket.nominalValue ||
        sale.payoutGold !== basket.payoutGold ||
        JSON.stringify(sale.selection) !== JSON.stringify(basket.items)
      ) {
        return { state: "stale-selection", sale };
      }

      if (sale.payoutGold <= 0) {
        return { state: "zero-payout", sale };
      }

      for (const item of sale.selection) {
        const consumed = await tx.characterItem.updateMany({
          where: {
            characterId: snapshot.character.id,
            itemId: item.itemId,
            quantity: { gte: item.quantity }
          },
          data: {
            quantity: { decrement: item.quantity }
          }
        });

        if (consumed.count !== 1) {
          return { state: "stale-selection", sale };
        }
      }

      await tx.characterItem.deleteMany({
        where: {
          characterId: snapshot.character.id,
          quantity: { lte: 0 }
        }
      });

      await tx.character.update({
        where: { id: snapshot.character.id },
        data: { gold: { increment: sale.payoutGold } }
      });

      const completed = await setSaleStatus(tx, sale.id, "completed", input.now, input.result);
      const updated = await tx.character.findUniqueOrThrow({
        where: { id: snapshot.character.id },
        include: characterRecordInclude
      });

      return {
        state: "sold",
        character: toCharacterRecord(updated),
        sale: completed
      };
    });
  }

  private async createDrinkOrderForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      drinkKey: ShynokDrinkOrderRecord["drinkKey"];
      priceGold: number;
      replacement: unknown;
      now: Date;
      expiresAt: Date;
      status: string;
    }
  ): Promise<ShynokDrinkOrderRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      select: { id: true }
    });

    if (!character) {
      return null;
    }

    const order = await this.prisma.korchmaDrinkOrder.create({
      data: {
        token: input.token,
        characterId: character.id,
        drinkKey: input.drinkKey,
        priceGold: input.priceGold,
        status: input.status,
        replacementJson: input.replacement as Prisma.InputJsonValue,
        expiresAt: input.expiresAt,
        updatedAt: input.now
      }
    });

    return mapDrinkOrder(order);
  }
}

async function getInventorySnapshot(tx: TxClient, telegramUserId: bigint): Promise<ShynokInventorySnapshot | null> {
  const character = await findCharacter(tx, telegramUserId);
  if (!character) {
    return null;
  }

  const [items, equipment, pendingChestRuns, pendingLevelBarters] = await Promise.all([
    tx.characterItem.findMany({
      where: { characterId: character.id },
      orderBy: [{ createdAt: "asc" }, { itemId: "asc" }]
    }),
    tx.characterEquipment.findMany({
      where: { characterId: character.id },
      select: { itemId: true }
    }),
    tx.mantokChestRun.findMany({
      where: { characterId: character.id, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.levelBarterExchange.findMany({
      where: { characterId: character.id, status: "pending" },
      select: { inputItemsJson: true }
    })
  ]);
  const reservedItemIds = new Set<string>();
  for (const run of pendingChestRuns) {
    for (const item of parseItems(run.inputItemsJson)) {
      reservedItemIds.add(item.itemId);
    }
  }
  for (const exchange of pendingLevelBarters) {
    for (const item of parseItems(exchange.inputItemsJson)) {
      reservedItemIds.add(item.itemId);
    }
  }

  return {
    character: toCharacterRecord(character),
    items: items.map(toCharacterItemRecord),
    equippedItemIds: equipment.map((row) => row.itemId),
    reservedItemIds: [...reservedItemIds]
  };
}

async function findCharacter(tx: TxClient, telegramUserId: bigint) {
  return tx.character.findFirst({
    where: { user: { telegramUserId } },
    include: characterRecordInclude
  });
}

async function findDrinkState(tx: TxClient, characterId: string): Promise<ShynokDrinkStateRecord | null> {
  return mapDrinkState(await tx.characterDrinkState.findUnique({
    where: { characterId }
  }));
}

async function upsertDrinkState(
  tx: TxClient,
  input: {
    characterId: string;
    drinkKey: ShynokDrinkOrderRecord["drinkKey"];
    sourceType: "self_purchase" | "round";
    sourceId: string;
    now: Date;
    metadata: unknown;
  }
): Promise<ShynokDrinkStateRecord> {
  const effect = buildDrinkEffect({
    drinkKey: input.drinkKey,
    startedAt: input.now
  });
  const state = await tx.characterDrinkState.upsert({
    where: {
      characterId: input.characterId
    },
    create: {
      characterId: input.characterId,
      drinkKey: input.drinkKey,
      phase: effect.phase,
      startedAt: effect.startedAt,
      expiresAt: effect.expiresAt,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      metadataJson: input.metadata as Prisma.InputJsonValue,
      updatedAt: input.now
    },
    update: {
      drinkKey: input.drinkKey,
      phase: effect.phase,
      startedAt: effect.startedAt,
      expiresAt: effect.expiresAt,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      metadataJson: input.metadata as Prisma.InputJsonValue,
      updatedAt: input.now
    }
  });

  const mapped = mapDrinkState(state);
  if (!mapped) {
    throw new Error("Drink state mapping failed after upsert.");
  }

  return mapped;
}

async function setRoundOfferStatus(
  tx: TxClient,
  offerId: string,
  status: "accepted" | "declined" | "expired",
  now: Date,
  result: unknown
): Promise<ShynokRoundRecipientRecord> {
  const updated = await tx.korchmaRoundRecipient.update({
    where: { id: offerId },
    data: {
      status,
      resultJson: result as Prisma.InputJsonValue,
      respondedAt: now,
      updatedAt: now
    }
  });
  const mapped = mapRoundRecipient(updated);
  if (!mapped) {
    throw new Error("Round offer mapping failed after update.");
  }

  return mapped;
}

async function incrementRoundTelemetry(
  tx: TxClient,
  purchaseId: string,
  key: "acceptedCount" | "declinedCount" | "expiredCount"
): Promise<void> {
  const purchase = await tx.korchmaRoundPurchase.findUnique({
    where: { id: purchaseId },
    select: { telemetryJson: true }
  });
  const telemetry = isRecord(purchase?.telemetryJson) ? { ...purchase.telemetryJson } : {};
  const current = typeof telemetry[key] === "number" ? telemetry[key] : 0;

  await tx.korchmaRoundPurchase.update({
    where: { id: purchaseId },
    data: {
      telemetryJson: {
        ...telemetry,
        [key]: current + 1
      }
    }
  });
}

async function setSaleStatus(
  tx: TxClient,
  saleId: string,
  status: "completed" | "cancelled" | "expired",
  now: Date,
  result: unknown
): Promise<ShynokMantokSaleRecord> {
  const updated = await tx.korchmaMantokSale.update({
    where: { id: saleId },
    data: {
      status,
      resultJson: result as Prisma.InputJsonValue,
      ...(status === "completed" ? { completedAt: now } : {}),
      updatedAt: now
    }
  });
  const sale = mapSale(updated);
  if (!sale) {
    throw new Error("Mantok sale mapping failed after status update.");
  }

  return sale;
}

const characterRecordInclude = {
  user: {
    select: {
      lastSeenLocationId: true,
      currentRaidId: true
    }
  },
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

function toAccessSnapshot(
  character: Character & {
    user: { lastSeenLocationId: string | null; currentRaidId: string | null };
    activeCombatLease: { kind: string; referenceId: string } | null;
    _count?: { remorts?: number };
  }
): ShynokAccessSnapshot {
  return {
    character: toCharacterRecord(character),
    currentRaidId: character.user.currentRaidId,
    activeCombatLease: character.activeCombatLease
  };
}

function toCharacterRecord(
  character: Character & {
    user: { lastSeenLocationId: string | null; currentRaidId?: string | null };
    _count?: { remorts?: number };
  }
): CharacterRecord {
  const { user, ...record } = character;
  delete (record as { _count?: { remorts?: number } })._count;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId,
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

function mapDrinkState(record: {
  id: string;
  characterId: string;
  drinkKey: string;
  phase: string;
  startedAt: Date;
  expiresAt: Date;
  sourceType: string;
  sourceId: string | null;
  metadataJson: unknown;
} | null): ShynokDrinkStateRecord | null {
  if (!record || !isShynokDrinkKey(record.drinkKey)) {
    return null;
  }

  const phase = record.phase === "queued" ? "queued" : "timed";

  return {
    id: record.id,
    characterId: record.characterId,
    drinkKey: record.drinkKey,
    phase,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    sourceType: record.sourceType === "round" ? "round" : "self_purchase",
    sourceId: record.sourceId,
    metadata: record.metadataJson
  };
}

function mapDrinkOrder(record: {
  id: string;
  token: string;
  characterId: string;
  drinkKey: string;
  priceGold: number;
  status: string;
  replacementJson: unknown;
  resultJson: unknown;
  expiresAt: Date;
  completedAt: Date | null;
} | null): ShynokDrinkOrderRecord | null {
  if (!record || !isShynokDrinkKey(record.drinkKey)) {
    return null;
  }

  return {
    id: record.id,
    token: record.token,
    characterId: record.characterId,
    drinkKey: record.drinkKey,
    priceGold: record.priceGold,
    status: record.status,
    replacement: record.replacementJson,
    result: record.resultJson,
    expiresAt: record.expiresAt,
    completedAt: record.completedAt
  };
}

function mapRoundRecipient(record: {
  id: string;
  purchaseId: string;
  characterId: string;
  drinkKey: string;
  status: string;
  expiresAt: Date;
  respondedAt: Date | null;
  resultJson: unknown;
} | null): ShynokRoundRecipientRecord | null {
  if (!record || !isShynokDrinkKey(record.drinkKey)) {
    return null;
  }

  const status =
    record.status === "accepted" ||
    record.status === "declined" ||
    record.status === "expired"
      ? record.status
      : "offered";

  return {
    id: record.id,
    purchaseId: record.purchaseId,
    characterId: record.characterId,
    drinkKey: record.drinkKey,
    status,
    expiresAt: record.expiresAt,
    respondedAt: record.respondedAt,
    result: record.resultJson
  };
}

function mapSale(record: {
  id: string;
  token: string;
  characterId: string;
  status: string;
  selectionJson: unknown;
  selectionFingerprint: string;
  nominalValue: number;
  payoutGold: number;
  resultJson: unknown;
  expiresAt: Date;
  completedAt: Date | null;
} | null): ShynokMantokSaleRecord | null {
  if (!record) {
    return null;
  }
  const status =
    record.status === "completed" ||
    record.status === "cancelled" ||
    record.status === "expired"
      ? record.status
      : "pending";

  return {
    id: record.id,
    token: record.token,
    characterId: record.characterId,
    status,
    selection: parseItems(record.selectionJson),
    selectionFingerprint: record.selectionFingerprint,
    nominalValue: record.nominalValue,
    payoutGold: record.payoutGold,
    result: record.resultJson,
    expiresAt: record.expiresAt,
    completedAt: record.completedAt
  };
}

function parseItems(input: unknown): Array<{ itemId: string; quantity: number }> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      return [];
    }
    const quantity = Math.max(0, Math.floor(Number(entry.quantity)));

    return quantity > 0 ? [{ itemId: entry.itemId, quantity }] : [];
  });
}

function parseRoundSnapshot(input: unknown): ShynokRoundRecipientSnapshot[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.characterId !== "string") {
      return [];
    }

    const telegramUserId = parseBigIntValue(entry.telegramUserId);
    if (telegramUserId === null) {
      return [];
    }

    return [{
      characterId: entry.characterId,
      telegramUserId,
      name: typeof entry.name === "string" ? entry.name : ""
    }];
  });
}

function parseBigIntValue(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }

  return null;
}

function parseRoundReplay(input: unknown): { purchaseId: string | null; recipientCount: number } {
  if (!isRecord(input)) {
    return { purchaseId: null, recipientCount: 0 };
  }

  return {
    purchaseId: typeof input.purchaseId === "string" ? input.purchaseId : null,
    recipientCount: Number.isInteger(input.recipientCount) ? Number(input.recipientCount) : 0
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
