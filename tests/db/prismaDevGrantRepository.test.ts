import { describe, expect, it } from "vitest";
import { PrismaDevGrantRepository } from "../../src/db/repositories/prismaDevGrantRepository";

const telegramUserId = 42n;
const fixedNow = new Date("2026-06-17T10:00:00.000Z");

describe("PrismaDevGrantRepository", () => {
  it("heals against effective HP max instead of raw stored base HP max", async () => {
    const prisma = new FakeDevGrantPrisma({
      level: 3,
      hpCurrent: 4,
      hpMax: 20
    });
    const repository = new PrismaDevGrantRepository(prisma.client);

    const result = await repository.healForTelegramUser(telegramUserId, 45);

    expect(prisma.lastCharacterUpdateInput).toMatchObject({
      data: {
        hpCurrent: 28,
        hpRegenAt: null
      }
    });
    expect(result?.character).toMatchObject({
      hpCurrent: 28,
      hpMax: 28,
      hpRegenAt: null
    });
  });
});

class FakeDevGrantPrisma {
  lastCharacterUpdateInput: FakeCharacterUpdateInput | null = null;
  private readonly character: FakeCharacter;

  constructor(input: { level: number; hpCurrent: number; hpMax: number }) {
    this.character = makeCharacter(input);
  }

  readonly client = {
    $transaction: async <T>(callback: (tx: FakeTransactionClient) => Promise<T>): Promise<T> =>
      callback(this.tx)
  } as unknown as ConstructorParameters<typeof PrismaDevGrantRepository>[0];

  private readonly tx: FakeTransactionClient = {
    character: {
      findFirst: (input: FakeFindFirstInput): Promise<FakeCharacter | null> =>
        Promise.resolve(input.where.user.telegramUserId === telegramUserId ? this.character : null),
      update: (input: FakeCharacterUpdateInput): Promise<FakeCharacter> => {
        this.lastCharacterUpdateInput = input;
        this.character.hpCurrent = input.data.hpCurrent;
        this.character.hpRegenAt = input.data.hpRegenAt;
        this.character.updatedAt = fixedNow;

        return Promise.resolve(this.character);
      }
    },
    characterEquipment: {
      findMany: () => Promise.resolve([])
    },
    characterRemort: {
      count: () => Promise.resolve(0)
    }
  };
}

interface FakeTransactionClient {
  character: {
    findFirst(input: FakeFindFirstInput): Promise<FakeCharacter | null>;
    update(input: FakeCharacterUpdateInput): Promise<FakeCharacter>;
  };
  characterEquipment: {
    findMany(): Promise<Array<{ itemId: string }>>;
  };
  characterRemort: {
    count(): Promise<number>;
  };
}

interface FakeFindFirstInput {
  where: {
    user: {
      telegramUserId: bigint;
    };
  };
  include?: unknown;
}

interface FakeCharacterUpdateInput {
  where: {
    id: string;
  };
  data: {
    hpCurrent: number;
    hpRegenAt: null;
  };
  include?: unknown;
}

type FakeCharacter = ReturnType<typeof makeCharacter>;

function makeCharacter(input: { level: number; hpCurrent: number; hpMax: number }) {
  return {
    id: "character-1",
    userId: "user-1",
    name: "Тестовий пригодник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: input.level,
    xp: 0,
    gold: 0,
    hpCurrent: input.hpCurrent,
    hpMax: input.hpMax,
    manaCurrent: 10,
    manaMax: 10,
    hpRegenAt: fixedNow,
    manaRegenAt: null,
    statsJson: {
      strength: 6,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    createdAt: fixedNow,
    updatedAt: fixedNow,
    user: {
      lastSeenLocationId: "location.korchma.hall"
    }
  };
}
