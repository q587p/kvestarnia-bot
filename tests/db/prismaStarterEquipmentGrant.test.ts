import { describe, expect, it } from "vitest";
import { PrismaCooldownRepository } from "../../src/db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "../../src/db/repositories/prismaDailyActionRepository";

describe("starter equipment grants", () => {
  it("does not grant daily-action starter gear above the owned cap", async () => {
    const prisma = new FakeRewardPrisma([
      {
        itemId: "item.apron-of-foam-resistance",
        quantity: 1
      }
    ]);
    const repository = new PrismaDailyActionRepository(prisma.client);

    const result = await repository.claimForTelegramUser(42n, {
      key: "tavern.friday-barrel-raid",
      localDate: "2026-06-15T00:23",
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: [
        {
          itemId: "item.apron-of-foam-resistance",
          quantity: 1,
          maxOwnedQuantity: 1
        },
        {
          itemId: "item.wet-hero-ticket",
          quantity: 1
        }
      ]
    });

    expect(result).toMatchObject({
      state: "created",
      itemGrants: [
        {
          itemId: "item.wet-hero-ticket",
          quantity: 1
        }
      ]
    });
    expect(prisma.itemQuantity("item.apron-of-foam-resistance")).toBe(1);
    expect(prisma.itemQuantity("item.wet-hero-ticket")).toBe(1);
  });

  it("grants daily-action starter gear once when the character does not own it yet", async () => {
    const prisma = new FakeRewardPrisma();
    const repository = new PrismaDailyActionRepository(prisma.client);

    const result = await repository.claimForTelegramUser(42n, {
      key: "tavern.friday-barrel-raid",
      localDate: "2026-06-15T00:23",
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: [
        {
          itemId: "item.apron-of-foam-resistance",
          quantity: 1,
          maxOwnedQuantity: 1
        }
      ]
    });

    expect(result).toMatchObject({
      state: "created",
      itemGrants: [
        {
          itemId: "item.apron-of-foam-resistance",
          quantity: 1
        }
      ]
    });
    expect(prisma.itemQuantity("item.apron-of-foam-resistance")).toBe(1);
  });

  it("does not grant cooldown starter gear above the owned cap", async () => {
    const prisma = new FakeRewardPrisma([
      {
        itemId: "item.cork-ring-of-serious-business",
        quantity: 1
      }
    ]);
    const repository = new PrismaCooldownRepository(prisma.client);

    const result = await repository.claimRewardForTelegramUser(42n, {
      key: "cellar.mouse-errand",
      now: new Date("2026-06-15T10:00:00.000Z"),
      availableAt: new Date("2026-06-15T10:03:00.000Z"),
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: [
        {
          itemId: "item.cork-ring-of-serious-business",
          quantity: 1,
          maxOwnedQuantity: 1
        },
        {
          itemId: "item.napkin-of-mouse-diplomacy",
          quantity: 1
        }
      ]
    });

    expect(result).toMatchObject({
      state: "completed",
      itemGrants: [
        {
          itemId: "item.napkin-of-mouse-diplomacy",
          quantity: 1
        }
      ]
    });
    expect(prisma.itemQuantity("item.cork-ring-of-serious-business")).toBe(1);
    expect(prisma.itemQuantity("item.napkin-of-mouse-diplomacy")).toBe(1);
  });
});

class FakeRewardPrisma {
  private dailyActionCursor = 0;
  private cooldownCursor = 0;
  private readonly dailyActions = new Map<string, FakeDailyActionRecord>();
  private readonly cooldowns = new Map<string, FakeCooldownRecord>();
  private readonly items = new Map<string, FakeCharacterItemRecord>();

  private character: FakeCharacterRecord = {
    id: "character-1",
    userId: "user-1",
    name: "Мандрівник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 1,
    xp: 0,
    gold: 0,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {}
  };

  constructor(initialItems: Array<{ itemId: string; quantity: number }> = []) {
    for (const item of initialItems) {
      this.items.set(item.itemId, {
        characterId: this.character.id,
        itemId: item.itemId,
        quantity: item.quantity
      });
    }
  }

  readonly client = {
    $transaction: async <T>(callback: (tx: FakeRewardTx) => Promise<T>) => callback(this.tx),
    character: {
      findFirst: () => Promise.resolve({ ...this.character })
    },
    dailyAction: {
      findUnique: () => Promise.resolve(null)
    }
  } as unknown as ConstructorParameters<typeof PrismaDailyActionRepository>[0];

  private readonly tx: FakeRewardTx = {
    character: {
      findFirst: () => Promise.resolve({ ...this.character }),
      update: (input) => {
        this.character = {
          ...this.character,
          xp: this.character.xp + (input.data.xp?.increment ?? 0),
          gold: this.character.gold + (input.data.gold?.increment ?? 0),
          level: input.data.level ?? this.character.level
        };
        return Promise.resolve({ ...this.character });
      }
    },
    dailyAction: {
      findUnique: (input) =>
        Promise.resolve(
          this.dailyActions.get(
            dailyActionKey(
              input.where.characterId_key_localDate.characterId,
              input.where.characterId_key_localDate.key,
              input.where.characterId_key_localDate.localDate
            )
          ) ?? null
        ),
      create: (input) => {
        const record = {
          id: `daily-action-${++this.dailyActionCursor}`,
          characterId: input.data.characterId,
          key: input.data.key,
          localDate: input.data.localDate,
          rewardXp: input.data.rewardXp,
          rewardGold: input.data.rewardGold,
          createdAt: new Date("2026-06-15T10:00:00.000Z")
        };
        this.dailyActions.set(
          dailyActionKey(record.characterId, record.key, record.localDate),
          record
        );
        return Promise.resolve(record);
      }
    },
    characterCooldown: {
      findUnique: (input) =>
        Promise.resolve(
          this.cooldowns.get(
            cooldownKey(
              input.where.characterId_key.characterId,
              input.where.characterId_key.key
            )
          ) ?? null
        ),
      create: (input) => {
        const record = {
          id: `cooldown-${++this.cooldownCursor}`,
          characterId: input.data.characterId,
          key: input.data.key,
          availableAt: input.data.availableAt,
          updatedAt: new Date("2026-06-15T10:00:00.000Z")
        };
        this.cooldowns.set(cooldownKey(record.characterId, record.key), record);
        return Promise.resolve(record);
      },
      updateMany: () => Promise.resolve({ count: 0 }),
      findUniqueOrThrow: () => Promise.reject(new Error("Unexpected cooldown lookup"))
    },
    characterItem: {
      findUnique: (input) =>
        Promise.resolve(this.items.get(input.where.characterId_itemId.itemId) ?? null),
      upsert: (input) => {
        const itemId = input.where.characterId_itemId.itemId;
        const existing = this.items.get(itemId);
        const nextQuantity = existing
          ? existing.quantity + input.update.quantity.increment
          : input.create.quantity;
        const record = {
          characterId: input.where.characterId_itemId.characterId,
          itemId,
          quantity: nextQuantity
        };
        this.items.set(itemId, record);
        return Promise.resolve(record);
      }
    }
  };

  itemQuantity(itemId: string): number {
    return this.items.get(itemId)?.quantity ?? 0;
  }
}

function dailyActionKey(characterId: string, key: string, localDate: string): string {
  return `${characterId}:${key}:${localDate}`;
}

function cooldownKey(characterId: string, key: string): string {
  return `${characterId}:${key}`;
}

interface FakeRewardTx {
  character: {
    findFirst: () => Promise<FakeCharacterRecord>;
    update: (input: {
      data: {
        xp?: { increment: number };
        gold?: { increment: number };
        level?: number;
      };
    }) => Promise<FakeCharacterRecord>;
  };
  dailyAction: {
    findUnique: (input: {
      where: {
        characterId_key_localDate: {
          characterId: string;
          key: string;
          localDate: string;
        };
      };
    }) => Promise<FakeDailyActionRecord | null>;
    create: (input: {
      data: {
        characterId: string;
        key: string;
        localDate: string;
        rewardXp: number;
        rewardGold: number;
      };
    }) => Promise<FakeDailyActionRecord>;
  };
  characterCooldown: {
    findUnique: (input: {
      where: {
        characterId_key: {
          characterId: string;
          key: string;
        };
      };
    }) => Promise<FakeCooldownRecord | null>;
    create: (input: {
      data: {
        characterId: string;
        key: string;
        availableAt: Date;
      };
    }) => Promise<FakeCooldownRecord>;
    updateMany: () => Promise<{ count: number }>;
    findUniqueOrThrow: () => Promise<FakeCooldownRecord>;
  };
  characterItem: {
    findUnique: (input: {
      where: {
        characterId_itemId: {
          characterId: string;
          itemId: string;
        };
      };
    }) => Promise<FakeCharacterItemRecord | null>;
    upsert: (input: {
      where: {
        characterId_itemId: {
          characterId: string;
          itemId: string;
        };
      };
      create: {
        characterId: string;
        itemId: string;
        quantity: number;
      };
      update: {
        quantity: {
          increment: number;
        };
      };
    }) => Promise<FakeCharacterItemRecord>;
  };
}

interface FakeCharacterRecord {
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
  statsJson: unknown;
}

interface FakeDailyActionRecord {
  id: string;
  characterId: string;
  key: string;
  localDate: string;
  rewardXp: number;
  rewardGold: number;
  createdAt: Date;
}

interface FakeCooldownRecord {
  id: string;
  characterId: string;
  key: string;
  availableAt: Date;
  updatedAt: Date;
}

interface FakeCharacterItemRecord {
  characterId: string;
  itemId: string;
  quantity: number;
}
