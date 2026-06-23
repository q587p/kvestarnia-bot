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
import { buildDrinkEffect, createRoundReplacementGuard, isShynokDrinkKey } from "../../domain/shynokDrinks";
import { buildMantokSaleBasket, buildMantokSaleEligibleStacks } from "../../domain/mantokSales";

type TxClient = Prisma.TransactionClient;
const PRESENCE_LOCATION_KORCHMA_BAR = "location.korchma.bar";

class StaleSaleSelectionRollback extends Error {
  constructor(readonly sale: ShynokMantokSaleRecord) {
    super("Mantok sale selection became stale during confirmation.");
  }
}

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

  async getRecoveryDrinkForTelegramUser(telegramUserId: bigint): Promise<ShynokDrinkStateRecord | null> {
    const state = await this.prisma.characterDrinkState.findFirst({
      where: {
        character: { user: { telegramUserId } }
      }
    });

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

      const orderRow = await tx.korchmaDrinkOrder.findFirst({
        where: {
          token: input.token,
          characterId: character.id
        }
      });
      const order = mapDrinkOrder(orderRow);

      if (!order || !orderRow) {
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

      if (!(await canMutateShynok(tx, character, orderRow.createdAt))) {
        return { state: "invalid-token" };
      }

      if (order.expiresAt <= input.now) {
        const expired = mapDrinkOrder(await tx.korchmaDrinkOrder.update({
          where: { id: order.id },
          data: { status: "expired", updatedAt: input.now }
        })) ?? order;

        return { state: "expired", order: expired };
      }

      const claimed = await tx.korchmaDrinkOrder.updateMany({
        where: {
          id: order.id,
          status: "pending",
          expiresAt: { gt: input.now }
        },
        data: {
          status: "processing",
          updatedAt: input.now
        }
      });

      if (claimed.count !== 1) {
        const replay = mapDrinkOrder(await tx.korchmaDrinkOrder.findUnique({ where: { id: order.id } }));
        if (replay?.status === "completed") {
          return {
            state: "replayed",
            character: toCharacterRecord(character),
            order: replay,
            drink: await findDrinkState(tx, character.id)
          };
        }

        return replay?.status === "expired" ? { state: "expired", order: replay } : { state: "invalid-token" };
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
        await tx.korchmaDrinkOrder.updateMany({
          where: { id: order.id, status: "processing" },
          data: { status: "pending", updatedAt: input.now }
        });
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

      const orderRow = await tx.korchmaDrinkOrder.findFirst({
        where: {
          token: input.token,
          characterId: character.id
        }
      });
      const order = mapDrinkOrder(orderRow);

      if (!order || !orderRow) {
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

      if (!(await canMutateShynok(tx, character, orderRow.createdAt))) {
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

      const claimed = await tx.korchmaDrinkOrder.updateMany({
        where: {
          id: order.id,
          status: "pending-round",
          expiresAt: { gt: input.now }
        },
        data: {
          status: "processing-round",
          updatedAt: input.now
        }
      });

      if (claimed.count !== 1) {
        const replay = mapDrinkOrder(await tx.korchmaDrinkOrder.findUnique({ where: { id: order.id } }));
        if (replay?.status === "completed-round") {
          const parsed = parseRoundReplay(replay.result);
          return {
            state: "replayed",
            character: toCharacterRecord(character),
            order: replay,
            purchaseId: parsed.purchaseId,
            recipientCount: parsed.recipientCount
          };
        }

        return replay?.status === "expired" ? { state: "expired", order: replay } : { state: "invalid-token" };
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
        await tx.korchmaDrinkOrder.updateMany({
          where: { id: order.id, status: "processing-round" },
          data: { status: "pending-round", updatedAt: input.now }
        });
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
      action: "accept" | "decline" | "confirm-replacement";
      replacementGuard?: string;
      now: Date;
      result: unknown;
    }
  ): Promise<ShynokRespondRoundOfferResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const offerRow = await tx.korchmaRoundRecipient.findFirst({
        where: {
          id: input.offerId,
          characterId: character.id
        }
      });
      const offer = mapRoundRecipient(offerRow);

      if (!offer || !offerRow) {
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
        await refreshRoundTelemetry(tx, offer.purchaseId);
        return expired ? { state: "expired", offer: expired } : replayRoundOffer(await findRoundOffer(tx, offer.id));
      }

      if (input.action === "decline") {
        const declined = await setRoundOfferStatus(tx, offer.id, "declined", input.now, input.result);
        await refreshRoundTelemetry(tx, offer.purchaseId);
        return declined ? { state: "declined", offer: declined } : replayRoundOffer(await findRoundOffer(tx, offer.id));
      }

      if (!(await canMutateShynok(tx, character, offerRow.createdAt))) {
        return { state: "invalid-offer" };
      }

      const activeDrink = await findLiveDrinkState(tx, character.id, input.now);
      if (input.action === "accept" && activeDrink) {
        return {
          state: "replacement-required",
          offer,
          drink: activeDrink,
          replacementGuard: createRoundReplacementGuard({
            offerId: offer.id,
            drinkStateId: activeDrink.id
          })
        };
      }

      if (input.action === "confirm-replacement") {
        if (!activeDrink || !input.replacementGuard) {
          return { state: "stale-replacement", offer };
        }
        const expectedGuard = createRoundReplacementGuard({
          offerId: offer.id,
          drinkStateId: activeDrink.id
        });
        if (input.replacementGuard !== expectedGuard) {
          return { state: "stale-replacement", offer };
        }
      }

      return acceptRoundOffer(tx, {
        offer,
        characterId: character.id,
        now: input.now,
        result: input.result
      });
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
    const updatedSale = await this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }

      await tx.korchmaMantokSale.updateMany({
        where: {
          token: input.token,
          status: "pending",
          expiresAt: { lte: input.now },
          characterId: character.id
        },
        data: {
          status: "expired",
          updatedAt: input.now
        }
      });

      const sale = await tx.korchmaMantokSale.findFirst({
        where: {
          token: input.token,
          characterId: character.id
        }
      });

      if (!sale || sale.status !== "pending" || sale.expiresAt <= input.now) {
        return null;
      }

      if (!(await canMutateShynok(tx, character, sale.createdAt))) {
        return null;
      }

      const updated = await tx.korchmaMantokSale.updateMany({
        where: {
          token: input.token,
          status: "pending",
          expiresAt: { gt: input.now },
          characterId: character.id
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

      return tx.korchmaMantokSale.findFirst({
        where: {
          token: input.token,
          characterId: character.id
        }
      });
    });

    return mapSale(updatedSale);
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const snapshot = await getInventorySnapshot(tx, telegramUserId);

        if (!snapshot) {
          return { state: "no-character" };
        }

        const saleRow = await tx.korchmaMantokSale.findFirst({
          where: {
            token: input.token,
            characterId: snapshot.character.id
          }
        });
        const sale = mapSale(saleRow);

        if (!sale || !saleRow) {
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
          const expired = await setSaleStatus(tx, sale.id, "expired", input.now, sale.result, "pending");
          if (expired.status === "completed") {
            return { state: "replayed", character: snapshot.character, sale: expired };
          }
          if (expired.status === "cancelled") {
            return { state: "cancelled", sale: expired };
          }
          return { state: "expired", sale: expired };
        }

        if (!(await canMutateShynokByCharacterId(tx, snapshot.character.id, saleRow.createdAt))) {
          return { state: "invalid-token" };
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

        const claimed = await tx.korchmaMantokSale.updateMany({
          where: {
            id: sale.id,
            status: "pending",
            expiresAt: { gt: input.now }
          },
          data: {
            status: "processing",
            updatedAt: input.now
          }
        });

        if (claimed.count !== 1) {
          const replay = mapSale(await tx.korchmaMantokSale.findUnique({ where: { id: sale.id } }));
          if (replay?.status === "completed") {
            return {
              state: "replayed",
              character: snapshot.character,
              sale: replay
            };
          }
          if (replay?.status === "cancelled") {
            return { state: "cancelled", sale: replay };
          }
          if (replay?.status === "expired") {
            return { state: "expired", sale: replay };
          }

          return { state: "invalid-token" };
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
            throw new StaleSaleSelectionRollback(sale);
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

        const completed = await setSaleStatus(tx, sale.id, "completed", input.now, input.result, "processing");
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
    } catch (error) {
      if (error instanceof StaleSaleSelectionRollback) {
        return { state: "stale-selection", sale: error.sale };
      }

      throw error;
    }
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

async function findLiveDrinkState(tx: TxClient, characterId: string, now: Date): Promise<ShynokDrinkStateRecord | null> {
  const state = await findDrinkState(tx, characterId);

  return state && state.expiresAt > now ? state : null;
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
  const previous = await tx.characterDrinkState.findUnique({
    where: { characterId: input.characterId }
  });
  const metadata = withPreviousRecoveryWindows(input.metadata, previous);
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
      metadataJson: metadata as Prisma.InputJsonValue,
      updatedAt: input.now
    },
    update: {
      drinkKey: input.drinkKey,
      phase: effect.phase,
      startedAt: effect.startedAt,
      expiresAt: effect.expiresAt,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      metadataJson: metadata as Prisma.InputJsonValue,
      updatedAt: input.now
    }
  });

  const mapped = mapDrinkState(state);
  if (!mapped) {
    throw new Error("Drink state mapping failed after upsert.");
  }

  return mapped;
}

async function canMutateShynok(
  tx: TxClient,
  character: {
    id: string;
    user: { lastSeenLocationId: string | null; currentRaidId?: string | null };
  },
  operationCreatedAt: Date
): Promise<boolean> {
  if (character.user.lastSeenLocationId !== PRESENCE_LOCATION_KORCHMA_BAR || character.user.currentRaidId) {
    return false;
  }

  const [activeLease, newerRemorts] = await Promise.all([
    tx.activeCombatLease.findUnique({
      where: { characterId: character.id },
      select: { id: true }
    }),
    tx.characterRemort.count({
      where: {
        characterId: character.id,
        createdAt: { gt: operationCreatedAt }
      }
    })
  ]);

  return !activeLease && newerRemorts === 0;
}

async function canMutateShynokByCharacterId(
  tx: TxClient,
  characterId: string,
  operationCreatedAt: Date
): Promise<boolean> {
  const character = await tx.character.findUnique({
    where: { id: characterId },
    include: characterRecordInclude
  });

  return character ? canMutateShynok(tx, character, operationCreatedAt) : false;
}

function withPreviousRecoveryWindows(
  metadata: unknown,
  previous: { drinkKey: string; phase: string; startedAt: Date; expiresAt: Date; metadataJson: Prisma.JsonValue | null } | null
): unknown {
  const previousWindows = [
    ...parseRecoveryWindows(previous?.metadataJson),
    ...(previous?.phase === "timed" && isShynokDrinkKey(previous.drinkKey)
      ? [{
          drinkKey: previous.drinkKey,
          startsAt: previous.startedAt.toISOString(),
          expiresAt: previous.expiresAt.toISOString()
        }]
      : [])
  ].slice(-3);

  if (previousWindows.length === 0) {
    return metadata;
  }

  return {
    ...(isRecord(metadata) ? metadata : { value: metadata }),
    previousRecoveryWindows: previousWindows
  };
}

async function setRoundOfferStatus(
  tx: TxClient,
  offerId: string,
  status: "accepted" | "declined" | "expired",
  now: Date,
  result: unknown
): Promise<ShynokRoundRecipientRecord | null> {
  const transition = await tx.korchmaRoundRecipient.updateMany({
    where: {
      id: offerId,
      status: "offered"
    },
    data: {
      status,
      resultJson: result as Prisma.InputJsonValue,
      respondedAt: now,
      updatedAt: now
    }
  });

  if (transition.count !== 1) {
    return null;
  }

  const updated = await tx.korchmaRoundRecipient.findUnique({ where: { id: offerId } });
  const mapped = mapRoundRecipient(updated);
  if (!mapped) {
    throw new Error("Round offer mapping failed after update.");
  }

  return mapped;
}

async function acceptRoundOffer(
  tx: TxClient,
  input: {
    offer: ShynokRoundRecipientRecord;
    characterId: string;
    now: Date;
    result: unknown;
  }
): Promise<ShynokRespondRoundOfferResult> {
  const accepted = await setRoundOfferStatus(tx, input.offer.id, "accepted", input.now, input.result);
  if (!accepted) {
    return replayRoundOffer(await findRoundOffer(tx, input.offer.id));
  }
  const drink = await upsertDrinkState(tx, {
    characterId: input.characterId,
    drinkKey: input.offer.drinkKey,
    sourceType: "round",
    sourceId: input.offer.id,
    now: input.now,
    metadata: input.result
  });
  await refreshRoundTelemetry(tx, input.offer.purchaseId);

  return {
    state: "accepted",
    offer: accepted,
    drink
  };
}

async function findRoundOffer(tx: TxClient, offerId: string): Promise<ShynokRoundRecipientRecord | null> {
  return mapRoundRecipient(await tx.korchmaRoundRecipient.findUnique({ where: { id: offerId } }));
}

function replayRoundOffer(offer: ShynokRoundRecipientRecord | null): ShynokRespondRoundOfferResult {
  if (!offer) {
    return { state: "invalid-offer" };
  }
  if (offer.status === "accepted") {
    return {
      state: "replayed",
      offer,
      drink: null
    };
  }
  if (offer.status === "declined") {
    return { state: "declined", offer };
  }
  if (offer.status === "expired") {
    return { state: "expired", offer };
  }

  return { state: "invalid-offer" };
}

async function refreshRoundTelemetry(tx: TxClient, purchaseId: string): Promise<void> {
  const [acceptedCount, declinedCount, expiredCount, snapshotCount] = await Promise.all([
    tx.korchmaRoundRecipient.count({ where: { purchaseId, status: "accepted" } }),
    tx.korchmaRoundRecipient.count({ where: { purchaseId, status: "declined" } }),
    tx.korchmaRoundRecipient.count({ where: { purchaseId, status: "expired" } }),
    tx.korchmaRoundRecipient.count({ where: { purchaseId } })
  ]);

  await tx.korchmaRoundPurchase.update({
    where: { id: purchaseId },
    data: {
      telemetryJson: {
        snapshotCount,
        acceptedCount,
        declinedCount,
        expiredCount
      }
    }
  });
}

async function setSaleStatus(
  tx: TxClient,
  saleId: string,
  status: "completed" | "cancelled" | "expired",
  now: Date,
  result: unknown,
  expectedStatus?: string
): Promise<ShynokMantokSaleRecord> {
  if (expectedStatus) {
    const transition = await tx.korchmaMantokSale.updateMany({
      where: {
        id: saleId,
        status: expectedStatus
      },
      data: {
        status,
        resultJson: result as Prisma.InputJsonValue,
        ...(status === "completed" ? { completedAt: now } : {}),
        updatedAt: now
      }
    });

    if (transition.count !== 1) {
      const replay = mapSale(await tx.korchmaMantokSale.findUnique({ where: { id: saleId } }));
      if (!replay) {
        throw new Error("Mantok sale mapping failed after status race.");
      }

      return replay;
    }
  } else {
    await tx.korchmaMantokSale.update({
      where: { id: saleId },
      data: {
        status,
        resultJson: result as Prisma.InputJsonValue,
        ...(status === "completed" ? { completedAt: now } : {}),
        updatedAt: now
      }
    });
  }

  const updated = await tx.korchmaMantokSale.findUnique({
    where: { id: saleId }
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

function parseRecoveryWindows(input: unknown): Array<{ drinkKey: string; startsAt: string; expiresAt: string }> {
  if (!isRecord(input) || !Array.isArray(input.previousRecoveryWindows)) {
    return [];
  }

  return input.previousRecoveryWindows.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.drinkKey !== "string" ||
      typeof entry.startsAt !== "string" ||
      typeof entry.expiresAt !== "string"
    ) {
      return [];
    }

    return [{
      drinkKey: entry.drinkKey,
      startsAt: entry.startsAt,
      expiresAt: entry.expiresAt
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
