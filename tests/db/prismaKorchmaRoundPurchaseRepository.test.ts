import { describe, expect, it } from "vitest";
import { PrismaKorchmaRoundPurchaseRepository } from "../../src/db/repositories/prismaKorchmaRoundPurchaseRepository";

describe("PrismaKorchmaRoundPurchaseRepository", () => {
  it("spends gold atomically so repeated round confirmations cannot overdraw gold", async () => {
    const prisma = new FakeKorchmaRoundPrisma(10);
    const repository = new PrismaKorchmaRoundPurchaseRepository(prisma.client);

    const [first, second] = await Promise.all([
      repository.spendGoldAndCreate(roundInput),
      repository.spendGoldAndCreate(roundInput)
    ]);

    expect([first?.state, second?.state].sort()).toEqual(["insufficient", "spent"]);
    expect(prisma.gold).toBe(0);
    expect(prisma.purchases).toHaveLength(1);
    expect(prisma.purchases[0]).toMatchObject({
      tier: "simple",
      spentGold: 10,
      localDate: "2026-06-13"
    });
    expect(
      [first, second].find((result) => result?.state === "insufficient")
    ).toMatchObject({
      state: "insufficient",
      character: {
        gold: 0
      }
    });
  });
});

const roundInput = {
  telegramUserId: 42n,
  tier: "simple" as const,
  spentGold: 10,
  localDate: "2026-06-13"
};

class FakeKorchmaRoundPrisma {
  readonly purchases: Array<{
    characterId: string;
    tier: string;
    spentGold: number;
    localDate: string;
  }> = [];

  private readonly character: FakeCharacterWithUser = {
    id: "character-1",
    userId: "user-1",
    name: "Мандрівник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 1,
    xp: 0,
    gold: 10,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {},
    createdAt: new Date("2026-06-13T10:00:00.000Z"),
    updatedAt: new Date("2026-06-13T10:00:00.000Z"),
    user: {
      lastSeenLocationId: "location.korchma.hall"
    }
  };

  readonly client = {
    $transaction: async <T>(callback: (tx: FakeKorchmaRoundTx) => Promise<T>) =>
      callback(this.tx)
  } as unknown as ConstructorParameters<typeof PrismaKorchmaRoundPurchaseRepository>[0];

  private readonly tx: FakeKorchmaRoundTx = {
    character: {
      findFirst: () => Promise.resolve({ ...this.character }),
      updateMany: (input) => {
        const requiredGold = input.where.gold.gte;

        if (this.character.gold < requiredGold) {
          return Promise.resolve({ count: 0 });
        }

        this.character.gold -= input.data.gold.decrement;
        return Promise.resolve({ count: 1 });
      },
      findUnique: () => Promise.resolve({ ...this.character }),
      findUniqueOrThrow: () => Promise.resolve({ ...this.character })
    },
    korchmaRoundPurchase: {
      create: (input) => {
        this.purchases.push(input.data);
        return Promise.resolve(input.data);
      }
    }
  };

  get gold(): number {
    return this.character.gold;
  }
}

interface FakeKorchmaRoundTx {
  character: {
    findFirst: () => Promise<FakeCharacterWithUser>;
    updateMany: (input: {
      where: { id: string; gold: { gte: number } };
      data: { gold: { decrement: number } };
    }) => Promise<{ count: number }>;
    findUnique: () => Promise<FakeCharacterWithUser>;
    findUniqueOrThrow: () => Promise<FakeCharacterWithUser>;
  };
  korchmaRoundPurchase: {
    create: (input: {
      data: {
        characterId: string;
        tier: string;
        spentGold: number;
        localDate: string;
      };
    }) => Promise<{
      characterId: string;
      tier: string;
      spentGold: number;
      localDate: string;
    }>;
  };
}

interface FakeCharacterWithUser {
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
