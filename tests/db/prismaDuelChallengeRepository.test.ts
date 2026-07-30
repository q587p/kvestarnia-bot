import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PrismaDuelChallengeRepository } from "../../src/db/repositories/prismaDuelChallengeRepository";
import type { DuelChallengeRecord, DuelResultPayload } from "../../src/db/repositories/duelChallengeRepository";

describe("PrismaDuelChallengeRepository", () => {
  it("loads an active turn duel only by the lease session and participant", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new PrismaDuelChallengeRepository({
      duelCombatSession: { findFirst }
    } as unknown as ConstructorParameters<typeof PrismaDuelChallengeRepository>[0]);

    await expect(repository.findActiveTurnBasedByIdForCharacterId(
      "duel-session-13",
      "character-42"
    )).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "duel-session-13",
        status: "active",
        OR: [
          { challengerCharacterId: "character-42" },
          { targetCharacterId: "character-42" }
        ]
      }
    }));
  });

  it("loses Quick resolution when a challenger combat lease wins after the challenge read", async () => {
    const pending = {
      ...makeResolvedChallenge("quick-race", null),
      mode: "quick",
      status: "pending",
      resolvedAt: null,
      result: null,
      expiresAt: new Date("2026-06-17T18:13:00.000Z")
    } as unknown as DuelChallengeRecord;
    const transitionUpdate = vi.fn();
    const deleteTemporaryLeases = vi.fn();
    const leaseCreate = vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.19.3" }
    ));
    const tx = {
      character: {
        findFirst: vi.fn().mockResolvedValue({ id: "character-2" })
      },
      duelChallenge: {
        findUnique: vi.fn().mockResolvedValue({
          id: pending.id,
          challengerCharacterId: "character-1",
          targetCharacterId: "character-2",
          status: "pending",
          mode: "quick",
          expiresAt: pending.expiresAt
        }),
        updateMany: transitionUpdate
      },
      soloCombatSession: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      activeCombatLease: {
        create: leaseCreate,
        deleteMany: deleteTemporaryLeases
      }
    };
    const repository = new PrismaDuelChallengeRepository({
      duelChallenge: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx)
    } as unknown as ConstructorParameters<typeof PrismaDuelChallengeRepository>[0]);
    vi.spyOn(repository, "findByToken").mockResolvedValue(pending);

    const result = await repository.acceptByTokenForTelegramUser(
      pending.inviteToken,
      2n,
      new Date("2026-06-17T18:00:23.000Z"),
      makeQuickResult()
    );

    expect(tx.duelChallenge.findUnique.mock.invocationCallOrder[0])
      .toBeLessThan(leaseCreate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY);
    expect(result).toMatchObject({
      record: { status: "pending" },
      transitioned: false,
      busyCharacterId: "character-1"
    });
    expect(transitionUpdate).not.toHaveBeenCalled();
    expect(deleteTemporaryLeases).not.toHaveBeenCalled();
  });

  it("claims a participant card only while the expected canonical reference is still current", async () => {
    const updates: unknown[] = [];
    const repository = new PrismaDuelChallengeRepository({
      duelCombatSession: {
        updateMany: (query: unknown) => {
          updates.push(query);
          return Promise.resolve({ count: 1 });
        },
        findUnique: () => Promise.resolve(null)
      }
    } as unknown as ConstructorParameters<typeof PrismaDuelChallengeRepository>[0]);

    await expect(repository.claimTurnBasedMessageReference(
      "session-1",
      "challenger",
      { chatId: 42n, messageId: 101 }
    )).resolves.toEqual({ claimed: true, session: null });
    await repository.claimTurnBasedMessageReference(
      "session-1",
      "challenger",
      { chatId: 42n, messageId: 102 },
      { chatId: 42n, messageId: 101 }
    );

    expect(updates).toEqual([
      {
        where: {
          id: "session-1",
          challengerChatId: null,
          challengerMessageId: null
        },
        data: {
          challengerChatId: 42n,
          challengerMessageId: 101
        }
      },
      {
        where: {
          id: "session-1",
          challengerChatId: 42n,
          challengerMessageId: 101
        },
        data: {
          challengerChatId: 42n,
          challengerMessageId: 102
        }
      }
    ]);
  });

  it("releases only the inert candidate that still owns the canonical reference", async () => {
    const updates: unknown[] = [];
    const repository = new PrismaDuelChallengeRepository({
      duelCombatSession: {
        updateMany: (query: unknown) => {
          updates.push(query);
          return Promise.resolve({ count: 1 });
        },
        findUnique: () => Promise.resolve(null)
      }
    } as unknown as ConstructorParameters<typeof PrismaDuelChallengeRepository>[0]);

    await expect(repository.releaseTurnBasedMessageReference(
      "session-1",
      "target",
      { chatId: 99n, messageId: 202 }
    )).resolves.toEqual({ released: true, session: null });
    expect(updates).toEqual([{
      where: {
        id: "session-1",
        targetChatId: 99n,
        targetMessageId: 202
      },
      data: {
        targetChatId: null,
        targetMessageId: null
      }
    }]);
  });

  it("uses a bounded existence lookup for resolved turn-based round actions", async () => {
    const queries: unknown[] = [];
    const repository = new PrismaDuelChallengeRepository({
      duelCombatAction: {
        findFirst: (query: unknown) => {
          queries.push(query);
          return Promise.resolve({ id: "action-1" });
        }
      }
    } as unknown as ConstructorParameters<typeof PrismaDuelChallengeRepository>[0]);

    await expect(repository.hasResolvedTurnBasedRoundByToken("duel-token")).resolves.toBe(true);
    expect(queries).toEqual([{
      where: {
        actionKey: { in: ["round", "timeout-attack"] },
        session: { duelChallenge: { inviteToken: "duel-token" } }
      },
      select: { id: true }
    }]);
  });

  it("parses new duel result snapshots while keeping old result JSON readable", async () => {
    const prisma = new FakeDuelPrisma([
      makeResolvedChallenge("new-json", {
        outcome: "challenger",
        mode: "turn-based",
        terminalReason: "surrender",
        winnerCharacterId: "character-1",
        loserCharacterId: "character-2",
        xpRewards: {
          challenger: 7,
          target: 1
        },
        challengerScore: 42,
        targetScore: 23,
        swing: 2,
        flavorKey: "direct-hit",
        balanceVersion: "instant-duel-v2",
        participants: {
          challenger: {
            characterId: "character-1",
            displayName: "Старе Імʼя",
            title: "Титул на мить дуелі",
            raceId: "race.human-ish",
            raceName: "Людисько",
            classId: "class.warrior",
            className: "Воїн",
            level: 7,
            remortCount: 1
          },
          target: {
            characterId: "character-2",
            displayName: "Ціль",
            title: "Другий титул",
            raceId: "race.elf",
            raceName: "Ельф",
            classId: "class.bard",
            className: "Бард",
            level: 5,
            remortCount: 0
          }
        },
        audit: {
          challenger: makeAudit(42),
          target: makeAudit(23)
        }
      }),
      makeResolvedChallenge("old-json", {
        outcome: "draw",
        winnerCharacterId: null,
        loserCharacterId: null,
        challengerScore: 10,
        targetScore: 10,
        swing: 0,
        flavorKey: "dramatic-draw"
      })
    ]);
    const repository = new PrismaDuelChallengeRepository(prisma.client);

    const records = await repository.listResolvedSince(new Date("2026-06-17T00:00:00.000Z"));

    expect(records).toHaveLength(2);
    expect(records[0]?.result).toMatchObject({
      balanceVersion: "instant-duel-v2",
      mode: "turn-based",
      terminalReason: "surrender",
      xpRewards: {
        challenger: 7,
        target: 1
      },
      participants: {
        challenger: {
          displayName: "Старе Імʼя",
          level: 7,
          remortCount: 1
        }
      },
      audit: {
        target: {
          preparedScore: 23
        }
      }
    });
    expect(records[1]?.result).toMatchObject({
      outcome: "draw",
      challengerScore: 10,
      targetScore: 10
    });
    expect(records[1]?.result.participants).toBeUndefined();
  });
});

class FakeDuelPrisma {
  constructor(private readonly records: unknown[]) {}

  readonly client = {
    duelChallenge: {
      findMany: () => Promise.resolve(this.records)
    }
  } as unknown as ConstructorParameters<typeof PrismaDuelChallengeRepository>[0];
}

function makeResolvedChallenge(inviteToken: string, resultJson: unknown) {
  return {
    id: `duel-${inviteToken}`,
    challengerCharacterId: "character-1",
    targetCharacterId: "character-2",
    contextChatId: null,
    inviteToken,
    status: "resolved",
    expiresAt: new Date("2026-06-17T18:13:00.000Z"),
    resolvedAt: new Date("2026-06-17T18:01:00.000Z"),
    resultJson,
    createdAt: new Date("2026-06-17T18:00:00.000Z"),
    updatedAt: new Date("2026-06-17T18:01:00.000Z"),
    challenger: makeCharacter("character-1", "Живе Імʼя", 1n),
    target: makeCharacter("character-2", "Жива Ціль", 2n)
  };
}

function makeQuickResult(): DuelResultPayload {
  return {
    mode: "quick",
    outcome: "draw",
    winnerCharacterId: null,
    loserCharacterId: null,
    challengerScore: 13,
    targetScore: 13,
    swing: 0,
    flavorKey: "dramatic-draw"
  };
}

function makeCharacter(id: string, name: string, telegramUserId: bigint) {
  return {
    id,
    userId: `user-${id}`,
    name,
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 25,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    hpRegenAt: null,
    manaRegenAt: null,
    statsJson: {
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    createdAt: new Date("2026-06-17T18:00:00.000Z"),
    updatedAt: new Date("2026-06-17T18:00:00.000Z"),
    user: {
      lastSeenLocationId: null,
      telegramUserId
    },
    equipment: [],
    _count: {
      remorts: 0
    }
  };
}

function makeAudit(preparedScore: number) {
  return {
    balanceVersion: "instant-duel-v2",
    originalLevel: 3,
    originalRemortCount: 0,
    effectiveCombatLevel: 3,
    progressionBudget: {
      level: 3,
      remortCount: 0,
      hpMax: 8,
      manaMax: 4,
      stats: {
        strength: 2,
        dexterity: 1,
        intelligence: 0,
        charisma: 0,
        luck: 1
      },
      score: 4
    },
    targetProgressionBudget: {
      level: 3,
      remortCount: 0,
      hpMax: 8,
      manaMax: 4,
      stats: {
        strength: 2,
        dexterity: 1,
        intelligence: 0,
        charisma: 0,
        luck: 1
      },
      score: 4
    },
    temporaryHpMax: 0,
    temporaryManaMax: 0,
    temporaryStats: {
      strength: 0,
      dexterity: 0,
      intelligence: 0,
      charisma: 0,
      luck: 0
    },
    readinessPenalty: 0,
    preparedScore
  };
}
