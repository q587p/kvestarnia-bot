import { describe, expect, it } from "vitest";
import { PrismaLevelBarterRepository } from "../../src/db/repositories/prismaLevelBarterRepository";

const telegramUserId = 42n;
const fixedNow = new Date("2026-06-16T09:30:00.000Z");

describe("PrismaLevelBarterRepository", () => {
  it("ignores expired untouched pending gift reservations in snapshots", async () => {
    const prisma = new FakeLevelBarterPrisma();
    prisma.transferReservations = [{
      itemId: "item.pan-of-persuasion",
      status: "pending",
      expiresAt: new Date("2026-06-16T09:29:59.000Z")
    }];
    const repository = new PrismaLevelBarterRepository(prisma.client);

    const snapshot = await repository.getSnapshotForTelegramUser(telegramUserId, fixedNow);

    expect(snapshot?.reservedItemIds).not.toContain("item.pan-of-persuasion");
  });

  it("keeps processing gift reservations in level barter snapshots", async () => {
    const prisma = new FakeLevelBarterPrisma();
    prisma.transferReservations = [{
      itemId: "item.pan-of-persuasion",
      status: "processing",
      expiresAt: new Date("2026-06-16T09:29:59.000Z")
    }];
    const repository = new PrismaLevelBarterRepository(prisma.client);

    const snapshot = await repository.getSnapshotForTelegramUser(telegramUserId, fixedNow);

    expect(snapshot?.reservedItemIds).toContain("item.pan-of-persuasion");
  });

  it("rolls back a pending exchange row when gold spend becomes stale after ledger creation", async () => {
    const prisma = new FakeLevelBarterPrisma();
    const repository = new PrismaLevelBarterRepository(prisma.client);

    const result = await repository.confirmAutoExchangeForTelegramUser(telegramUserId, {
      expectedToken: "level-barter-token-1",
      now: fixedNow,
      createPlan: () => ({
        state: "ready",
        plan: {
          token: "level-barter-token-1",
          items: [{ itemId: "item.pan-of-persuasion", quantity: 1 }],
          goldSpent: 1,
          levelBefore: 4,
          levelAfter: 5,
          xpBefore: 48,
          xpAfter: 73,
          xpCarry: 3,
          itemTotalValue: 999,
          selectedTotalValue: 1000,
          overpay: 0
        }
      })
    });

    expect(result).toEqual({ state: "stale-selection" });
    expect(prisma.exchange("level-barter-token-1")).toBeNull();
    expect(prisma.gold).toBe(0);
    expect(prisma.itemQuantity("item.pan-of-persuasion")).toBe(1);
    expect(prisma.characterLevel).toBe(4);
  });
});

class FakeLevelBarterPrisma {
  transferReservations: FakeTransferReservation[] = [];

  private readonly initial: FakeLevelBarterState = {
    character: {
      id: "character-1",
      userId: "user-1",
      name: "Мандрівник",
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 4,
      xp: 48,
      gold: 0,
      hpCurrent: 28,
      hpMax: 28,
      manaCurrent: 14,
      manaMax: 14,
      statsJson: {
        strength: 8,
        dexterity: 7,
        intelligence: 5,
        charisma: 5,
        luck: 5
      },
      createdAt: fixedNow,
      updatedAt: fixedNow,
      user: {
        lastSeenLocationId: "location.korchma.front"
      }
    },
    items: [
      {
        id: "character-item-1",
        characterId: "character-1",
        itemId: "item.pan-of-persuasion",
        quantity: 1,
        createdAt: fixedNow,
        updatedAt: fixedNow
      }
    ],
    equipment: [],
    exchanges: []
  };

  private state = cloneState(this.initial);

  readonly client = {
    $transaction: async <T>(callback: (tx: FakeLevelBarterTx) => Promise<T>) => {
      const before = cloneState(this.state);

      try {
        return await callback(this.tx);
      } catch (error) {
        this.state = before;
        throw error;
      }
    }
  } as unknown as ConstructorParameters<typeof PrismaLevelBarterRepository>[0];

  get gold(): number {
    return this.state.character.gold;
  }

  get characterLevel(): number {
    return this.state.character.level;
  }

  exchange(token: string): FakeLevelBarterExchange | null {
    return this.state.exchanges.find((exchange) => exchange.token === token) ?? null;
  }

  itemQuantity(itemId: string): number {
    return this.state.items.find((item) => item.itemId === itemId)?.quantity ?? 0;
  }

  private readonly tx: FakeLevelBarterTx = {
    character: {
      findFirst: (input) =>
        Promise.resolve(
          input.where.user.telegramUserId === telegramUserId
            ? cloneCharacter(this.state.character)
            : null
        ),
      updateMany: (input) => {
        if (input.where.id !== this.state.character.id || this.state.character.gold < input.where.gold.gte) {
          return Promise.resolve({ count: 0 });
        }

        this.state.character = {
          ...this.state.character,
          gold: this.state.character.gold - input.data.gold.decrement,
          level: input.data.level,
          xp: input.data.xp
        };

        return Promise.resolve({ count: 1 });
      },
      findUnique: (input) =>
        Promise.resolve(
          input.where.id === this.state.character.id
            ? cloneCharacter(this.state.character)
            : null
        )
    },
    characterItem: {
      findMany: (input) =>
        Promise.resolve(
          input.where.characterId === this.state.character.id
            ? this.state.items.map((item) => ({ ...item }))
            : []
        ),
      updateMany: (input) => {
        const item = this.state.items.find(
          (candidate) =>
            candidate.characterId === input.where.characterId &&
            candidate.itemId === input.where.itemId
        );

        if (!item || item.quantity < input.where.quantity.gte) {
          return Promise.resolve({ count: 0 });
        }

        item.quantity -= input.data.quantity.decrement;
        return Promise.resolve({ count: 1 });
      },
      deleteMany: () => Promise.resolve({ count: 0 })
    },
    characterEquipment: {
      findMany: (input) =>
        Promise.resolve(
          input.where.characterId === this.state.character.id
            ? this.state.equipment.map((item) => ({ ...item }))
            : []
        )
    },
    itemTransfer: {
      findMany: (input: FakeTransferReservationFindManyInput) =>
        Promise.resolve(this.transferReservations
          .filter((row) => isReservedByInput(row, input))
          .map((row) => ({ itemId: row.itemId })))
    },
    levelBarterExchange: {
      findUnique: (input) =>
        Promise.resolve(
          this.state.exchanges.find(
            (exchange) =>
              exchange.characterId === input.where.characterId_token.characterId &&
              exchange.token === input.where.characterId_token.token
          ) ?? null
        ),
      create: (input) => {
        const exchange: FakeLevelBarterExchange = {
          id: `exchange-${this.state.exchanges.length + 1}`,
          characterId: input.data.characterId,
          token: input.data.token,
          status: input.data.status,
          inputItemsJson: input.data.inputItemsJson,
          spentGold: input.data.spentGold,
          levelBefore: input.data.levelBefore,
          levelAfter: input.data.levelAfter,
          xpBefore: input.data.xpBefore,
          xpAfter: input.data.xpAfter,
          xpCarry: input.data.xpCarry,
          itemTotalValue: input.data.itemTotalValue,
          selectedTotalValue: input.data.selectedTotalValue,
          overpay: input.data.overpay,
          completedAt: null,
          createdAt: fixedNow,
          updatedAt: fixedNow
        };

        this.state.exchanges.push(exchange);
        return Promise.resolve({ ...exchange });
      },
      update: (input) => {
        const exchange = this.state.exchanges.find(
          (candidate) =>
            candidate.characterId === input.where.characterId_token.characterId &&
            candidate.token === input.where.characterId_token.token
        );

        if (!exchange) {
          throw new Error("Missing fake level barter exchange.");
        }

        Object.assign(exchange, input.data, { updatedAt: fixedNow });
        return Promise.resolve({ ...exchange });
      }
    }
  };
}

interface FakeLevelBarterTx {
  character: {
    findFirst: (input: { where: { user: { telegramUserId: bigint } } }) => Promise<FakeCharacter | null>;
    updateMany: (input: {
      where: { id: string; gold: { gte: number } };
      data: { gold: { decrement: number }; level: number; xp: number };
    }) => Promise<{ count: number }>;
    findUnique: (input: { where: { id: string } }) => Promise<FakeCharacter | null>;
  };
  characterItem: {
    findMany: (input: { where: { characterId: string } }) => Promise<FakeCharacterItem[]>;
    updateMany: (input: {
      where: { characterId: string; itemId: string; quantity: { gte: number } };
      data: { quantity: { decrement: number } };
    }) => Promise<{ count: number }>;
    deleteMany: (input: { where: { characterId: string; quantity: { lte: number } } }) => Promise<{ count: number }>;
  };
  characterEquipment: {
    findMany: (input: { where: { characterId: string }; select: { itemId: true } }) => Promise<Array<{ itemId: string }>>;
  };
  itemTransfer?: {
    findMany: (input: FakeTransferReservationFindManyInput) => Promise<Array<{ itemId: string }>>;
  };
  levelBarterExchange: {
    findUnique: (input: {
      where: { characterId_token: { characterId: string; token: string } };
    }) => Promise<FakeLevelBarterExchange | null>;
    create: (input: { data: FakeLevelBarterExchangeCreateInput }) => Promise<FakeLevelBarterExchange>;
    update: (input: {
      where: { characterId_token: { characterId: string; token: string } };
      data: { status: string; completedAt: Date };
    }) => Promise<FakeLevelBarterExchange>;
  };
}

interface FakeLevelBarterState {
  character: FakeCharacter;
  items: FakeCharacterItem[];
  equipment: Array<{ itemId: string }>;
  exchanges: FakeLevelBarterExchange[];
}

interface FakeCharacter {
  id: string;
  userId: string;
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
  statsJson: object;
  createdAt: Date;
  updatedAt: Date;
  user: {
    lastSeenLocationId: string | null;
  };
}

interface FakeCharacterItem {
  id: string;
  characterId: string;
  itemId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeLevelBarterExchangeCreateInput {
  characterId: string;
  token: string;
  status: string;
  inputItemsJson: unknown;
  spentGold: number;
  levelBefore: number;
  levelAfter: number;
  xpBefore: number;
  xpAfter: number;
  xpCarry: number;
  itemTotalValue: number;
  selectedTotalValue: number;
  overpay: number;
}

interface FakeLevelBarterExchange extends FakeLevelBarterExchangeCreateInput {
  id: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeTransferReservation {
  itemId: string;
  status: string;
  expiresAt: Date;
}

interface FakeTransferReservationFindManyInput {
  where: {
    senderCharacterId: string;
    OR: Array<{ status: string; expiresAt?: { gt: Date } }>;
  };
}

function cloneState(state: FakeLevelBarterState): FakeLevelBarterState {
  return {
    character: cloneCharacter(state.character),
    items: state.items.map((item) => ({ ...item })),
    equipment: state.equipment.map((item) => ({ ...item })),
    exchanges: state.exchanges.map((exchange) => ({
      ...exchange,
      inputItemsJson: Array.isArray(exchange.inputItemsJson)
        ? exchange.inputItemsJson.map((entry) => ({ ...(entry as Record<string, unknown>) }))
        : exchange.inputItemsJson
    }))
  };
}

function cloneCharacter(character: FakeCharacter): FakeCharacter {
  return {
    ...character,
    user: { ...character.user },
    statsJson: { ...character.statsJson }
  };
}

function isReservedByInput(
  row: FakeTransferReservation,
  input: FakeTransferReservationFindManyInput
): boolean {
  void input;

  return row.status === "processing" ||
    (row.status === "pending" && row.expiresAt > fixedNow);
}
