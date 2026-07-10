import { describe, expect, it, vi } from "vitest";
import { PrismaDailyActionRepository } from "../../src/db/repositories/prismaDailyActionRepository";

describe("PrismaDailyActionRepository bounded helpers", () => {
  it("probes existing keyed history without loading action rows", async () => {
    const prisma = createPrismaMock({
      character: { id: "character-1" },
      firstDailyAction: { id: "action-1" }
    });
    const repository = new PrismaDailyActionRepository(prisma.client);

    await expect(repository.existsAnyForTelegramUser(9301n, {
      key: "quest.starter",
      localDateNot: "12026-07-10"
    })).resolves.toBe(true);

    expect(prisma.dailyAction.findFirst).toHaveBeenCalledWith({
      where: {
        characterId: "character-1",
        key: "quest.starter",
        localDate: {
          not: "12026-07-10"
        }
      },
      select: {
        id: true
      }
    });
    expect(prisma.dailyAction.findMany).not.toHaveBeenCalled();
  });

  it("loads only capped current-day prefixed action rows", async () => {
    const prisma = createPrismaMock({
      character: { id: "character-2" },
      manyDailyActions: []
    });
    const repository = new PrismaDailyActionRepository(prisma.client);

    await repository.listForTelegramUserByLocalDatePrefix(9302n, {
      key: "daily.korchma.round.step",
      localDatePrefix: "2026-07-10:",
      take: 13
    });

    expect(prisma.dailyAction.findMany).toHaveBeenCalledWith({
      where: {
        characterId: "character-2",
        key: "daily.korchma.round.step",
        localDate: {
          startsWith: "2026-07-10:"
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      take: 13
    });
  });

  it("sums matching item grants from a capped createdAt window", async () => {
    const rows = [
      {
        createdAt: new Date("2026-07-10T07:00:00.000Z"),
        resultJson: {
          kind: "yeger.bandage.purchase",
          purchaseDay: "2026-07-10",
          reward: {
            appliedItemGrants: [
              { itemId: "item.bandage", quantity: 3 },
              { itemId: "item.other", quantity: 42 }
            ]
          }
        }
      },
      {
        createdAt: new Date("2026-07-10T08:00:00.000Z"),
        resultJson: {
          kind: "yeger.bandage.purchase",
          purchaseDay: "2026-07-10",
          reward: {
            itemGrants: [{ itemId: "item.bandage", quantity: 2 }]
          }
        }
      },
      {
        createdAt: new Date("2026-07-10T09:00:00.000Z"),
        resultJson: {
          kind: "other",
          purchaseDay: "2026-07-10",
          reward: {
            appliedItemGrants: [{ itemId: "item.bandage", quantity: 93 }]
          }
        }
      }
    ];
    const prisma = createPrismaMock({
      character: { id: "character-3" },
      manyDailyActions: rows
    });
    const repository = new PrismaDailyActionRepository(prisma.client);
    const createdAtGte = new Date("2026-07-10T00:00:00.000Z");
    const createdAtLt = new Date("2026-07-11T00:00:00.000Z");

    await expect(repository.sumItemGrantQuantityForTelegramUserInCreatedAtRange(9303n, {
      key: "yeger.bandage.purchase.confirm",
      createdAtGte,
      createdAtLt,
      resultKind: "yeger.bandage.purchase",
      purchaseDay: "2026-07-10",
      itemId: "item.bandage",
      take: 93
    })).resolves.toEqual({
      quantity: 5,
      rowCount: 3
    });

    expect(prisma.dailyAction.findMany).toHaveBeenCalledWith({
      where: {
        characterId: "character-3",
        key: "yeger.bandage.purchase.confirm",
        createdAt: {
          gte: createdAtGte,
          lt: createdAtLt
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      take: 93
    });
  });
});

function createPrismaMock(input: {
  character: { id: string } | null;
  firstDailyAction?: { id: string } | null;
  manyDailyActions?: unknown[];
}) {
  const client = {
    character: {
      findFirst: vi.fn().mockResolvedValue(input.character)
    },
    dailyAction: {
      findFirst: vi.fn().mockResolvedValue(input.firstDailyAction ?? null),
      findMany: vi.fn().mockResolvedValue(input.manyDailyActions ?? [])
    }
  } as unknown as ConstructorParameters<typeof PrismaDailyActionRepository>[0];

  return {
    client,
    character: client.character as unknown as { findFirst: ReturnType<typeof vi.fn> },
    dailyAction: client.dailyAction as unknown as {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    }
  };
}
