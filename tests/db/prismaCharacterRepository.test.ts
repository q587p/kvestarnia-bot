import { describe, expect, it } from "vitest";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";

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

  it("lists partial-HP characters as proactive recovery candidates", async () => {
    const prisma = new FakeCharacterPrisma();
    const repository = new PrismaCharacterRepository(prisma.client);

    const candidates = await repository.listRecoverableHpCharacters(fixedNow, { limit: 5 });

    expect(prisma.lastFindManyInput).toMatchObject({
      where: {
        hpRegenAt: {
          not: null
        }
      },
      orderBy: {
        hpRegenAt: "asc"
      },
      take: 25
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.telegramUserId).toBe(telegramUserId);
    expect(candidates[0]?.character.id).toBe("character-2");
    expect(candidates[0]?.character.hpCurrent).toBe(10);
    expect(candidates[0]?.character.hpMax).toBe(28);
    expect(candidates[0]?.character.currentLocationId).toBe("location.korchma.hall");
    expect(candidates[0]?.character.remortCount).toBe(2);
  });
});

class FakeCharacterPrisma {
  lastFindFirstInput: FakeFindFirstInput | null = null;
  lastFindManyInput: FakeFindManyInput | null = null;

  readonly client = {
    character: {
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
            id: "character-1",
            userId: "user-1",
            name: "Повний Мандрівник",
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
            hpRegenAt: fixedNow,
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
              telegramUserId: 999n,
              lastSeenLocationId: "location.korchma.hall"
            },
            _count: {
              remorts: 0
            }
          },
          {
            id: "character-2",
            userId: "user-1",
            name: "Мандрівник",
            pronoun: "they",
            path: "boundary",
            raceId: "race.human-ish",
            classId: "class.warrior",
            level: 9,
            xp: 790,
            gold: 0,
            hpCurrent: 10,
            hpMax: 28,
            manaCurrent: 14,
            manaMax: 14,
            hpRegenAt: fixedNow,
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
          }
        ]);
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
  where?: unknown;
  orderBy?: unknown;
  take?: number;
  include?: unknown;
}
