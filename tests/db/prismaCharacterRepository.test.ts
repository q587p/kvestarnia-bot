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
});

class FakeCharacterPrisma {
  lastFindFirstInput: FakeFindFirstInput | null = null;

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
            lastSeenLocationId: "location.korchma.hall"
          },
          _count: {
            remorts: 2
          }
        });
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
