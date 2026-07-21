import { describe, expect, it } from "vitest";
import { PrismaDevGrantRepository } from "../../src/db/repositories/prismaDevGrantRepository";
import {
  YEGER_UNQUIET_TRIAL_BUCKET,
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_STARTED_KEY
} from "../../src/services/yegerQuestService";

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

  it("keeps a topped-up stack in place but resets its bag time after depletion and reacquisition", async () => {
    const prisma = new FakeDevGrantPrisma({ level: 3, hpCurrent: 20, hpMax: 20 });
    const repository = new PrismaDevGrantRepository(prisma.client);
    const firstA = new Date("2026-07-19T10:00:00.000Z");
    const firstB = new Date("2026-07-20T10:00:00.000Z");
    const toppedUpA = new Date("2026-07-20T11:00:00.000Z");
    const secondA = new Date("2026-07-21T10:00:00.000Z");

    prisma.setGrantNow(firstA);
    await repository.addItemsForTelegramUser(telegramUserId, [{ itemId: "item.a", quantity: 1 }]);
    prisma.setGrantNow(firstB);
    await repository.addItemsForTelegramUser(telegramUserId, [{ itemId: "item.b", quantity: 1 }]);
    prisma.setGrantNow(toppedUpA);
    await repository.addItemsForTelegramUser(telegramUserId, [{ itemId: "item.a", quantity: 1 }]);

    expect(prisma.characterItems.find((row) => row.itemId === "item.a")).toMatchObject({
      quantity: 2,
      createdAt: firstA,
      updatedAt: toppedUpA
    });

    prisma.depleteItem("item.a");
    prisma.setGrantNow(secondA);
    await repository.addItemsForTelegramUser(telegramUserId, [{ itemId: "item.a", quantity: 1 }]);

    expect(prisma.characterItems).toEqual([
      expect.objectContaining({ itemId: "item.b", quantity: 1, createdAt: firstB, updatedAt: firstB }),
      expect.objectContaining({ itemId: "item.a", quantity: 1, createdAt: secondA, updatedAt: secondA })
    ]);
  });

  it("heals the active solo combat state for local battle QA", async () => {
    const prisma = new FakeDevGrantPrisma({
      level: 3,
      hpCurrent: 48,
      hpMax: 20,
      activeCombat: {
        kind: "solo-combat",
        referenceId: "solo-1",
        stateJson: {
          turn: 2,
          status: "active",
          hero: {
            hp: 5,
            hpMax: 28,
            mana: 4,
            manaMax: 10
          },
          monster: {
            id: "monster.test",
            hp: 13,
            hpMax: 23
          }
        }
      }
    });
    const repository = new PrismaDevGrantRepository(prisma.client);

    const result = await repository.healForTelegramUser(telegramUserId, 7);

    expect(prisma.lastSoloCombatUpdateInput).toMatchObject({
      where: { id: "solo-1" },
      data: {
        stateJson: {
          hero: {
            hp: 12,
            hpMax: 28
          }
        }
      }
    });
    expect(result?.combat).toEqual({
      kind: "solo-combat",
      hpCurrent: 12,
      hpMax: 28
    });
  });

  it("revives the active party-boss participant state for local raid QA", async () => {
    const prisma = new FakeDevGrantPrisma({
      level: 8,
      hpCurrent: 48,
      hpMax: 20,
      activeCombat: {
        kind: "party-boss",
        referenceId: "party-1",
        stateJson: {
          status: "active",
          participants: [
            {
              characterId: "character-1",
              status: "knocked-out",
              resources: {
                hp: 0,
                hpMax: 48,
                mana: 10,
                manaMax: 24
              }
            }
          ]
        }
      }
    });
    const repository = new PrismaDevGrantRepository(prisma.client);

    const result = await repository.healForTelegramUser(telegramUserId);

    expect(prisma.lastPartyBossUpdateInput).toMatchObject({
      where: { id: "party-boss-1" },
      data: {
        version: 4,
        stateJson: {
          participants: [
            {
              characterId: "character-1",
              status: "active",
              resources: {
                hp: 48,
                hpMax: 48
              }
            }
          ]
        }
      }
    });
    expect(result?.combat).toEqual({
      kind: "party-boss",
      hpCurrent: 48,
      hpMax: 48
    });
  });

  it("heals the active turn-based duel participant state for local PvP QA", async () => {
    const prisma = new FakeDevGrantPrisma({
      level: 3,
      hpCurrent: 20,
      hpMax: 20,
      activeCombat: {
        kind: "turn-based-duel",
        referenceId: "duel-1",
        stateJson: {
          status: "active",
          participants: {
            challenger: {
              characterId: "character-1",
              hp: 2,
              hpMax: 24
            },
            target: {
              characterId: "character-2",
              hp: 17,
              hpMax: 24
            }
          }
        }
      }
    });
    const repository = new PrismaDevGrantRepository(prisma.client);

    const result = await repository.healForTelegramUser(telegramUserId, 5);

    expect(prisma.lastDuelCombatUpdateInput).toMatchObject({
      where: { id: "duel-1" },
      data: {
        version: 8,
        stateJson: {
          participants: {
            challenger: {
              characterId: "character-1",
              hp: 7,
              hpMax: 24
            }
          }
        }
      }
    });
    expect(result?.combat).toEqual({
      kind: "turn-based-duel",
      hpCurrent: 7,
      hpMax: 24
    });
  });

  it("resets Rogue cooldown and current-day pickpocket attempts for local QA", async () => {
    const prisma = new FakeDevGrantPrisma({
      level: 5,
      hpCurrent: 20,
      hpMax: 20
    });
    prisma.characterCooldowns.push(
      { characterId: "character-1", key: "noncombat.rogue.pickpocket" },
      { characterId: "character-1", key: "rogue.quiet-pocket.legacy" },
      { characterId: "character-other", key: "noncombat.rogue.pickpocket" },
      { characterId: "character-1", key: "unrelated.cooldown" }
    );
    prisma.rogueAttempts.push(
      { actorCharacterId: "character-1", targetCharacterId: "target-1", localDate: "2026-07-04" },
      { actorCharacterId: "character-1", targetCharacterId: "target-2", localDate: "2026-07-04" },
      { actorCharacterId: "character-1", targetCharacterId: "target-3", localDate: "2026-07-03" },
      { actorCharacterId: "character-other", targetCharacterId: "target-1", localDate: "2026-07-04" }
    );
    const repository = new PrismaDevGrantRepository(prisma.client);

    const result = await repository.resetRogueForTelegramUser(telegramUserId, {
      keys: ["noncombat.rogue.pickpocket"],
      keyPrefixes: ["rogue.quiet-pocket"],
      localDate: "2026-07-04"
    });

    expect(result).toMatchObject({
      clearedCooldown: true,
      deletedAttempts: 2,
      character: {
        id: "character-1"
      }
    });
    expect(prisma.characterCooldowns).toEqual([
      { characterId: "character-other", key: "noncombat.rogue.pickpocket" },
      { characterId: "character-1", key: "unrelated.cooldown" }
    ]);
    expect(prisma.rogueAttempts).toEqual([
      { actorCharacterId: "character-1", targetCharacterId: "target-3", localDate: "2026-07-03" },
      { actorCharacterId: "character-other", targetCharacterId: "target-1", localDate: "2026-07-04" }
    ]);
  });

  it("creates real Yeger win rows for local turn-in QA without completing the quest", async () => {
    const prisma = new FakeDevGrantPrisma({
      level: 5,
      hpCurrent: 20,
      hpMax: 20
    });
    const repository = new PrismaDevGrantRepository(prisma.client);

    const result = await repository.completeYegerQuestProgressForTelegramUser(telegramUserId, "first", fixedNow);

    expect(result).toMatchObject({
      state: "ready",
      stage: "first",
      addedWins: 5,
      wins: 5,
      target: 5,
      started: true
    });
    expect(prisma.dailyActions).toEqual([
      expect.objectContaining({
        key: YEGER_UNQUIET_TRIAL_STARTED_KEY,
        localDate: YEGER_UNQUIET_TRIAL_BUCKET,
        rewardXp: 0,
        rewardGold: 0
      })
    ]);
    expect(prisma.dailyActions.some((action) => action.key === YEGER_UNQUIET_TRIAL_COMPLETED_KEY)).toBe(false);
    expect(prisma.soloCombatSessions).toHaveLength(5);
    expect(prisma.soloCombatSessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          characterId: "character-1",
          monsterId: "monster.stamp-doorkeeper-skeleton",
          status: "won"
        })
      ])
    );
    expect(prisma.soloCombatSessions[0]?.stateJson).toMatchObject({
      source: "yeger",
      status: "won",
      monster: {
        id: "monster.stamp-doorkeeper-skeleton"
      }
    });
  });
});

class FakeDevGrantPrisma {
  lastCharacterUpdateInput: FakeCharacterUpdateInput | null = null;
  lastSoloCombatUpdateInput: FakeSessionUpdateInput | null = null;
  lastPartyBossUpdateInput: FakeSessionUpdateInput | null = null;
  lastDuelCombatUpdateInput: FakeSessionUpdateInput | null = null;
  readonly dailyActions: FakeDailyAction[] = [];
  readonly soloCombatSessions: FakeSoloCombatSession[] = [];
  readonly characterCooldowns: FakeCharacterCooldown[] = [];
  readonly rogueAttempts: FakeRogueAttempt[] = [];
  readonly characterItems: FakeCharacterItem[] = [];
  private grantNow = fixedNow;
  private readonly character: FakeCharacter;
  private readonly activeCombat: FakeActiveCombat | null;

  constructor(input: {
    level: number;
    hpCurrent: number;
    hpMax: number;
    activeCombat?: FakeActiveCombat;
  }) {
    this.character = makeCharacter(input);
    this.activeCombat = input.activeCombat ?? null;
  }

  readonly client = {
    $transaction: async <T>(callback: (tx: FakeTransactionClient) => Promise<T>): Promise<T> =>
      callback(this.tx)
  } as unknown as ConstructorParameters<typeof PrismaDevGrantRepository>[0];

  setGrantNow(now: Date): void {
    this.grantNow = now;
  }

  depleteItem(itemId: string): void {
    const index = this.characterItems.findIndex((row) => row.itemId === itemId);
    if (index >= 0) this.characterItems.splice(index, 1);
  }

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
    characterItem: {
      upsert: ({ where, create, update }: FakeCharacterItemUpsertInput): Promise<FakeCharacterItem> => {
        const existing = this.characterItems.find((row) =>
          row.characterId === where.characterId_itemId.characterId &&
          row.itemId === where.characterId_itemId.itemId
        );
        if (existing) {
          existing.quantity += update.quantity.increment;
          existing.updatedAt = this.grantNow;
          if (update.createdAt) existing.createdAt = update.createdAt;
          return Promise.resolve(existing);
        }

        const created = {
          id: `character-item-${this.characterItems.length + 1}`,
          characterId: create.characterId,
          itemId: create.itemId,
          quantity: create.quantity,
          createdAt: create.createdAt ?? this.grantNow,
          updatedAt: this.grantNow
        };
        this.characterItems.push(created);
        return Promise.resolve(created);
      }
    },
    dailyAction: {
      findFirst: ({ where }: FakeDailyActionFindFirstInput): Promise<FakeDailyAction | null> =>
        Promise.resolve(this.dailyActions.find((action) =>
          action.characterId === where.characterId &&
          action.key === where.key &&
          action.localDate === where.localDate
        ) ?? null),
      create: ({ data }: FakeDailyActionCreateInput): Promise<FakeDailyAction> => {
        const action = {
          id: `action-${this.dailyActions.length + 1}`,
          characterId: data.characterId,
          key: data.key,
          localDate: data.localDate,
          rewardXp: data.rewardXp,
          rewardGold: data.rewardGold,
          spentGold: 0,
          resultJson: data.resultJson ?? null,
          createdAt: data.createdAt ?? fixedNow
        };
        this.dailyActions.push(action);

        return Promise.resolve(action);
      }
    },
    characterRemort: {
      count: () => Promise.resolve(0)
    },
    characterCooldown: {
      deleteMany: ({ where }: FakeCooldownDeleteManyInput): Promise<{ count: number }> => {
        const before = this.characterCooldowns.length;
        const remaining = this.characterCooldowns.filter((cooldown) =>
          !matchesCooldownDelete(cooldown, where)
        );

        this.characterCooldowns.splice(0, this.characterCooldowns.length, ...remaining);

        return Promise.resolve({ count: before - remaining.length });
      }
    },
    noncombatRoguePickpocketAttempt: {
      deleteMany: ({ where }: FakeRogueAttemptDeleteManyInput): Promise<{ count: number }> => {
        const before = this.rogueAttempts.length;
        const remaining = this.rogueAttempts.filter((attempt) =>
          attempt.actorCharacterId !== where.actorCharacterId || attempt.localDate !== where.localDate
        );

        this.rogueAttempts.splice(0, this.rogueAttempts.length, ...remaining);

        return Promise.resolve({ count: before - remaining.length });
      }
    },
    activeCombatLease: {
      findUnique: ({ where }: { where: { characterId: string } }): Promise<FakeActiveCombatLease | null> =>
        Promise.resolve(
          where.characterId === this.character.id && this.activeCombat
            ? {
                characterId: this.character.id,
                kind: this.activeCombat.kind,
                referenceId: this.activeCombat.referenceId
              }
            : null
        )
    },
    soloCombatSession: {
      findMany: ({ where }: FakeSoloCombatFindManyInput): Promise<FakeSoloCombatSession[]> =>
        Promise.resolve(this.soloCombatSessions.filter((session) =>
          session.characterId === where.characterId &&
          (
            session.updatedAt >= where.OR[0].updatedAt.gte ||
            session.createdAt >= where.OR[1].createdAt.gte
          )
        )),
      create: ({ data }: FakeSoloCombatCreateInput): Promise<FakeSoloCombatSession> => {
        const session = {
          id: `solo-${this.soloCombatSessions.length + 1}`,
          characterId: data.characterId,
          monsterId: data.monsterId,
          stateJson: data.stateJson,
          status: data.status,
          turn: data.turn,
          expiresAt: data.expiresAt,
          createdAt: data.createdAt ?? fixedNow,
          updatedAt: data.createdAt ?? fixedNow
        };
        this.soloCombatSessions.push(session);

        return Promise.resolve(session);
      },
      findUnique: ({ where }: { where: { id: string } }): Promise<FakeSession | null> =>
        Promise.resolve(
          this.activeCombat?.kind === "solo-combat" && where.id === this.activeCombat.referenceId
            ? {
                id: where.id,
                status: "active",
                version: 1,
                stateJson: this.activeCombat.stateJson
              }
            : null
        ),
      update: (input: FakeSessionUpdateInput): Promise<FakeSession> => {
        this.lastSoloCombatUpdateInput = input;
        return Promise.resolve({
          id: input.where.id,
          status: "active",
          version: 1,
          stateJson: input.data.stateJson
        });
      }
    },
    partyBossSession: {
      findUnique: ({ where }: { where: { partySessionId: string } }): Promise<FakeSession | null> =>
        Promise.resolve(
          this.activeCombat?.kind === "party-boss" && where.partySessionId === this.activeCombat.referenceId
            ? {
                id: "party-boss-1",
                status: "active",
                version: 3,
                stateJson: this.activeCombat.stateJson
              }
            : null
        ),
      update: (input: FakeSessionUpdateInput): Promise<FakeSession> => {
        this.lastPartyBossUpdateInput = input;
        return Promise.resolve({
          id: input.where.id,
          status: "active",
          version: Number(input.data.version ?? 3),
          stateJson: input.data.stateJson
        });
      }
    },
    duelCombatSession: {
      findUnique: ({ where }: { where: { id: string } }): Promise<FakeSession | null> =>
        Promise.resolve(
          this.activeCombat?.kind === "turn-based-duel" && where.id === this.activeCombat.referenceId
            ? {
                id: where.id,
                status: "active",
                version: 7,
                stateJson: this.activeCombat.stateJson
              }
            : null
        ),
      update: (input: FakeSessionUpdateInput): Promise<FakeSession> => {
        this.lastDuelCombatUpdateInput = input;
        return Promise.resolve({
          id: input.where.id,
          status: "active",
          version: Number(input.data.version ?? 7),
          stateJson: input.data.stateJson
        });
      }
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
  characterItem: {
    upsert(input: FakeCharacterItemUpsertInput): Promise<FakeCharacterItem>;
  };
  dailyAction: {
    findFirst(input: FakeDailyActionFindFirstInput): Promise<FakeDailyAction | null>;
    create(input: FakeDailyActionCreateInput): Promise<FakeDailyAction>;
  };
  characterRemort: {
    count(): Promise<number>;
  };
  characterCooldown: {
    deleteMany(input: FakeCooldownDeleteManyInput): Promise<{ count: number }>;
  };
  noncombatRoguePickpocketAttempt: {
    deleteMany(input: FakeRogueAttemptDeleteManyInput): Promise<{ count: number }>;
  };
  activeCombatLease: {
    findUnique(input: { where: { characterId: string } }): Promise<FakeActiveCombatLease | null>;
  };
  soloCombatSession: {
    findMany(input: FakeSoloCombatFindManyInput): Promise<FakeSoloCombatSession[]>;
    create(input: FakeSoloCombatCreateInput): Promise<FakeSoloCombatSession>;
    findUnique(input: { where: { id: string } }): Promise<FakeSession | null>;
    update(input: FakeSessionUpdateInput): Promise<FakeSession>;
  };
  partyBossSession: {
    findUnique(input: { where: { partySessionId: string } }): Promise<FakeSession | null>;
    update(input: FakeSessionUpdateInput): Promise<FakeSession>;
  };
  duelCombatSession: {
    findUnique(input: { where: { id: string } }): Promise<FakeSession | null>;
    update(input: FakeSessionUpdateInput): Promise<FakeSession>;
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

interface FakeCharacterItemUpsertInput {
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
    createdAt?: Date;
  };
  update: {
    quantity: { increment: number };
    createdAt?: Date;
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

interface FakeActiveCombat {
  kind: "solo-combat" | "party-boss" | "turn-based-duel";
  referenceId: string;
  stateJson: Record<string, unknown>;
}

interface FakeActiveCombatLease {
  characterId: string;
  kind: FakeActiveCombat["kind"];
  referenceId: string;
}

interface FakeSession {
  id: string;
  status: string;
  version: number;
  stateJson: unknown;
}

interface FakeSessionUpdateInput {
  where: {
    id: string;
  };
  data: {
    version?: number;
    stateJson: unknown;
  };
}

interface FakeDailyAction {
  id: string;
  characterId: string;
  key: string;
  localDate: string;
  rewardXp: number;
  rewardGold: number;
  spentGold: number;
  resultJson: unknown;
  createdAt: Date;
}

interface FakeDailyActionFindFirstInput {
  where: {
    characterId: string;
    key: string;
    localDate: string;
  };
}

interface FakeDailyActionCreateInput {
  data: {
    characterId: string;
    key: string;
    localDate: string;
    rewardXp: number;
    rewardGold: number;
    resultJson?: unknown;
    createdAt?: Date;
  };
}

interface FakeSoloCombatSession {
  id: string;
  characterId: string;
  monsterId: string;
  stateJson: unknown;
  status: string;
  turn: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeSoloCombatFindManyInput {
  where: {
    OR: [{ updatedAt: { gte: Date } }, { createdAt: { gte: Date } }];
    characterId: string;
  };
  select: unknown;
}

interface FakeSoloCombatCreateInput {
  data: {
    characterId: string;
    monsterId: string;
    status: string;
    turn: number;
    stateJson: unknown;
    expiresAt: Date;
    createdAt?: Date;
  };
}

interface FakeCharacterCooldown {
  characterId: string;
  key: string;
}

interface FakeCooldownDeleteManyInput {
  where: {
    characterId: string;
    OR?: Array<{
      key: string | { in?: string[]; startsWith?: string };
    }>;
    key?: string;
  };
}

interface FakeRogueAttempt {
  actorCharacterId: string;
  targetCharacterId: string;
  localDate: string;
}

interface FakeRogueAttemptDeleteManyInput {
  where: {
    actorCharacterId: string;
    localDate: string;
  };
}

type FakeCharacter = ReturnType<typeof makeCharacter>;

function matchesCooldownDelete(
  cooldown: FakeCharacterCooldown,
  where: FakeCooldownDeleteManyInput["where"]
): boolean {
  if (cooldown.characterId !== where.characterId) {
    return false;
  }

  if (where.OR) {
    return where.OR.some((condition) => matchesCooldownKey(cooldown.key, condition.key));
  }

  return typeof where.key === "string" && cooldown.key === where.key;
}

function matchesCooldownKey(key: string, condition: string | { in?: string[]; startsWith?: string }): boolean {
  if (typeof condition === "string") {
    return key === condition;
  }

  return (
    condition.in?.includes(key) === true ||
    (condition.startsWith !== undefined && key.startsWith(condition.startsWith))
  );
}

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
