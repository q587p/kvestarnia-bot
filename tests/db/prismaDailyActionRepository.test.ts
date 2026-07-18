import { describe, expect, it, vi } from "vitest";
import { PrismaDailyActionRepository } from "../../src/db/repositories/prismaDailyActionRepository";

describe("PrismaDailyActionRepository bounded helpers", () => {
  it("loads all current-life quest keys through one capped query", async () => {
    const prisma = createPrismaMock({ manyDailyActions: [] });
    const repository = new PrismaDailyActionRepository(prisma.client);
    const keys = ["quest.accepted", "quest.training", "quest.completed"];

    await repository.listForCharacterByKeys("character-quest", {
      keys,
      localDate: "life:2",
      take: 5
    });

    expect(prisma.dailyAction.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dailyAction.findMany).toHaveBeenCalledWith({
      where: {
        characterId: "character-quest",
        key: { in: keys },
        localDate: "life:2"
      },
      orderBy: { createdAt: "asc" },
      take: 3
    });
  });

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

  it("loads only the latest keyed action for rolling cooldown checks", async () => {
    const latest = {
      id: "action-latest",
      createdAt: new Date("2026-07-18T20:17:59.000Z")
    };
    const prisma = createPrismaMock({
      character: { id: "character-rolling" },
      firstDailyAction: latest
    });
    const repository = new PrismaDailyActionRepository(prisma.client);

    await expect(repository.findLatestForTelegramUser(9_303n, {
      key: "adventure.choice-mvp"
    })).resolves.toBe(latest);

    expect(prisma.dailyAction.findFirst).toHaveBeenCalledWith({
      where: {
        characterId: "character-rolling",
        key: "adventure.choice-mvp"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  });

  it("serializes a rolling cooldown claim before checking the latest completion", async () => {
    const completedAt = new Date("2026-07-18T20:17:59.000Z");
    const now = new Date("2026-07-18T20:18:00.000Z");
    const character = {
      id: "character-rolling",
      userId: "user-rolling",
      xp: 0,
      level: 3,
      gold: 0,
      hpCurrent: 10,
      hpMax: 10
    };
    const latest = {
      id: "action-before-boundary",
      characterId: character.id,
      key: "adventure.choice-mvp",
      localDate: "p93:old",
      rewardXp: 5,
      rewardGold: 3,
      spentGold: 0,
      resultJson: null,
      createdAt: completedAt
    };
    const tx = {
      character: {
        findFirst: vi.fn().mockResolvedValue({ ...character, user: null }),
        update: vi.fn().mockResolvedValue(character)
      },
      dailyAction: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(latest),
        create: vi.fn()
      }
    };
    const client = {
      $transaction: vi.fn((callback: (value: typeof tx) => unknown) => callback(tx))
    } as unknown as ConstructorParameters<typeof PrismaDailyActionRepository>[0];
    const repository = new PrismaDailyActionRepository(client);

    await expect(repository.claimForTelegramUser(9_303n, {
      key: "adventure.choice-mvp",
      localDate: "p93:new",
      rewardXp: 5,
      rewardGold: 3,
      rollingCooldown: {
        now,
        durationMs: 93 * 60_000
      }
    })).resolves.toMatchObject({
      state: "existing",
      action: latest,
      availableAt: new Date("2026-07-18T21:50:59.000Z")
    });

    expect(tx.character.update).toHaveBeenCalledTimes(1);
    expect(tx.dailyAction.findFirst).toHaveBeenCalledWith({
      where: {
        characterId: character.id,
        key: "adventure.choice-mvp"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    expect(tx.character.update.mock.invocationCallOrder[0]).toBeLessThan(
      tx.dailyAction.findFirst.mock.invocationCallOrder[0]!
    );
    expect(tx.dailyAction.create).not.toHaveBeenCalled();
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
  character?: { id: string } | null;
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
