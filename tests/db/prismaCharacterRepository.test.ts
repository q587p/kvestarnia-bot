import { describe, expect, it, vi } from "vitest";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { HpRecoveryNotificationProducer } from "../../src/db/repositories/hpRecoveryNotificationProducer";

const telegramUserId = 42n;
const fixedNow = new Date("2026-06-17T10:00:00.000Z");

describe("PrismaCharacterRepository", () => {
  it("maps included remort count into character records", async () => {
    const prisma = new FakeCharacterPrisma();
    const repository = new PrismaCharacterRepository(prisma.client);

    const character = await repository.findByTelegramUserId(telegramUserId);

    expect(prisma.lastFindFirstInput).toMatchObject({
      include: {
        _count: {
          select: {
            remorts: true
          }
        }
      }
    });
    expect(character).toMatchObject({
      id: "character-1",
      currentLocationId: "location.korchma.hall",
      remortCount: 2
    });
    expect(character).not.toHaveProperty("_count");
  });

  it("clamps over-max resource writes to the current hp and mana limits", async () => {
    const prisma = new FakeCharacterPrisma();
    const repository = new PrismaCharacterRepository(prisma.client);

    const updated = await repository.updateResourcesForTelegramUser(telegramUserId, {
      hpCurrent: 99,
      manaCurrent: 88,
      hpRegenAt: new Date("2026-06-17T10:05:00.000Z"),
      manaRegenAt: new Date("2026-06-17T10:05:00.000Z"),
      expected: {
        hpCurrent: 28,
        manaCurrent: 14,
        hpRegenAt: null,
        manaRegenAt: null
      }
    });

    expect(prisma.lastUpdateManyInput).toMatchObject({
      where: {
        id: "character-1",
        hpCurrent: 28,
        manaCurrent: 14,
        hpRegenAt: null,
        manaRegenAt: null
      },
      data: {
        hpCurrent: 28,
        manaCurrent: 14
      }
    });
    expect(updated).toMatchObject({
      hpCurrent: 28,
      hpMax: 28,
      manaCurrent: 14,
      manaMax: 14
    });
  });

  it("preserves effective resource values above stored base limits when effective maxima are supplied", async () => {
    const prisma = new FakeCharacterPrisma();
    const repository = new PrismaCharacterRepository(prisma.client);

    await repository.updateResourcesForTelegramUser(telegramUserId, {
      hpCurrent: 123,
      hpMax: 123,
      manaCurrent: 44,
      manaMax: 44,
      hpRegenAt: new Date("2026-06-17T10:05:00.000Z"),
      manaRegenAt: new Date("2026-06-17T10:05:00.000Z"),
      expected: {
        hpCurrent: 73,
        manaCurrent: 33,
        hpRegenAt: null,
        manaRegenAt: null
      }
    });

    expect(prisma.lastUpdateManyInput).toMatchObject({
      data: {
        hpCurrent: 123,
        manaCurrent: 44
      }
    });
  });

  it("clamps expected-life resource writes to supplied effective hp and mana limits", async () => {
    const prisma = new FakeCharacterPrisma();
    const repository = new PrismaCharacterRepository(prisma.client);

    const updated = await repository.updateResourcesForTelegramUser(telegramUserId, {
      hpCurrent: 52,
      hpMax: 52,
      manaCurrent: 26,
      manaMax: 26,
      hpRegenAt: new Date("2026-06-17T10:05:00.000Z"),
      manaRegenAt: new Date("2026-06-17T10:05:00.000Z"),
      expectedLife: {
        remortCount: 2
      },
      expected: {
        hpCurrent: 28,
        manaCurrent: 14,
        hpRegenAt: null,
        manaRegenAt: null
      }
    });

    expect(prisma.transactionCount).toBe(1);
    expect(prisma.lastCountCharacterRemortsId).toBe("character-1");
    expect(prisma.lastUpdateManyInput).toMatchObject({
      where: {
        id: "character-1",
        hpCurrent: 28,
        manaCurrent: 14,
        hpRegenAt: null,
        manaRegenAt: null
      },
      data: {
        hpCurrent: 52,
        manaCurrent: 26
      }
    });
    expect(updated).toMatchObject({
      hpCurrent: 28,
      hpMax: 28,
      manaCurrent: 14,
      manaMax: 14
    });
  });

  it("does not initiate delayed recovery work from an ordinary partial lazy sync", async () => {
    const prisma = new FakeCharacterPrisma();
    const producer = new HpRecoveryNotificationProducer(true);
    const record = vi.spyOn(producer, "record").mockResolvedValue(undefined);
    const repository = new PrismaCharacterRepository(prisma.client, producer);

    await repository.updateResourcesForTelegramUser(telegramUserId, {
      hpCurrent: 29,
      hpMax: 52,
      manaCurrent: 14,
      manaMax: 26,
      hpRegenAt: new Date("2026-06-17T10:05:00.000Z"),
      manaRegenAt: new Date("2026-06-17T10:05:00.000Z"),
      expected: {
        hpCurrent: 28,
        manaCurrent: 14,
        hpRegenAt: null,
        manaRegenAt: null
      }
    });

    expect(record).not.toHaveBeenCalled();
  });

});

class FakeCharacterPrisma {
  lastFindFirstInput: FakeFindFirstInput | null = null;
  lastFindManyInput: FakeFindManyInput | null = null;
  lastUpdateManyInput: FakeUpdateManyInput | null = null;
  lastCountCharacterRemortsId: string | null = null;
  transactionCount = 0;

  readonly client = {
    $transaction: async <T>(callback: (tx: FakeCharacterPrisma["client"]) => Promise<T>) => {
      this.transactionCount += 1;
      return callback(this.client);
    },
    character: {
      fields: {
        hpMax: "hpMax-field-ref"
      },
      findFirst: (input: FakeFindFirstInput) => {
        this.lastFindFirstInput = input;

        if (input.where.user.telegramUserId !== telegramUserId) {
          return Promise.resolve(null);
        }

        return Promise.resolve({
          id: "character-1",
          userId: "user-1",
          name: "Мандрівник",
          pronoun: "they",
          path: "boundary",
          raceId: "race.human-ish",
          classId: "class.warrior",
          level: 9,
          xp: 790,
          gold: 0,
          hpCurrent: 28,
          hpMax: 28,
          manaCurrent: 14,
          manaMax: 14,
          hpRegenAt: null,
          manaRegenAt: null,
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
            telegramUserId,
            lastSeenLocationId: "location.korchma.hall"
          },
          _count: {
            remorts: 2
          }
          });
      },
      findMany: (input: FakeFindManyInput) => {
        this.lastFindManyInput = input;

        return Promise.resolve([
          {
            hpCurrent: 1,
            hpMax: 20,
            hpRegenAt: new Date("2026-06-17T09:00:00.000Z"),
            user: {
              telegramUserId
            }
          }
        ]);
      },
      updateMany: (input: FakeUpdateManyInput) => {
        this.lastUpdateManyInput = input;
        return Promise.resolve({ count: 1 });
      },
      update: (input: FakeUpdateInput) => {
        this.lastUpdateManyInput = {
          where: { id: input.where.id },
          data: input.data
        };
        return Promise.resolve({
          id: "character-1",
          userId: "user-1",
          name: "Мандрівник",
          pronoun: "they",
          path: "boundary",
          raceId: "race.human-ish",
          classId: "class.warrior",
          level: 9,
          xp: 790,
          gold: 0,
          hpCurrent: input.data.hpCurrent ?? 0,
          hpMax: 28,
          manaCurrent: input.data.manaCurrent ?? 0,
          manaMax: 14,
          hpRegenAt: input.data.hpRegenAt ?? null,
          manaRegenAt: input.data.manaRegenAt ?? null,
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
            telegramUserId,
            lastSeenLocationId: "location.korchma.hall"
          },
          _count: {
            remorts: 2
          }
        });
      },
      findUnique: (input: FakeFindUniqueInput) => {
        if (input.where.id !== "character-1") {
          return Promise.resolve(null);
        }

        return Promise.resolve({
          id: "character-1",
          userId: "user-1",
          name: "Мандрівник",
          pronoun: "they",
          path: "boundary",
          raceId: "race.human-ish",
          classId: "class.warrior",
          level: 9,
          xp: 790,
          gold: 0,
          hpCurrent: 28,
          hpMax: 28,
          manaCurrent: 14,
          manaMax: 14,
          hpRegenAt: null,
          manaRegenAt: null,
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
            telegramUserId,
            lastSeenLocationId: "location.korchma.hall"
          },
          _count: {
            remorts: 2
          }
        });
      }
    },
    characterRemort: {
      count: (input: { where: { characterId: string } }) => {
        this.lastCountCharacterRemortsId = input.where.characterId;
        return Promise.resolve(2);
      }
    }
  } as unknown as ConstructorParameters<typeof PrismaCharacterRepository>[0];
}

interface FakeFindFirstInput {
  where: {
    user: {
      telegramUserId: bigint;
    };
  };
  include?: unknown;
}

interface FakeFindManyInput {
  where: {
    hpCurrent: {
      lt: unknown;
    };
    hpRegenAt: {
      not: null;
    };
  };
  orderBy: {
    hpRegenAt: "asc";
  };
  take: number;
  select: unknown;
}

interface FakeUpdateManyInput {
  where: {
    user?: {
      telegramUserId: bigint;
    };
    id?: string;
  };
  data: {
    hpCurrent: number;
    hpMax?: number;
    manaCurrent: number;
    manaMax?: number;
    hpRegenAt?: Date | null;
    manaRegenAt?: Date | null;
  };
}

interface FakeUpdateInput {
  where: {
    id: string;
  };
  data: {
    hpCurrent: number;
    hpMax?: number;
    manaCurrent: number;
    manaMax?: number;
    hpRegenAt?: Date | null;
    manaRegenAt?: Date | null;
  };
  include?: unknown;
}

interface FakeFindUniqueInput {
  where: {
    id: string;
  };
  include?: unknown;
}
