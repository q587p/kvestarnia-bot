import { describe, expect, it, vi } from "vitest";
import { PrismaLevelMilestoneRepository } from "../../src/db/repositories/prismaLevelMilestoneRepository";
import {
  buildLevelMilestoneKey,
  buildRemortLevelMilestoneKey,
  LEVEL_MILESTONE_VISIBLE_LEVELS,
  REMORT_LEVEL_MILESTONE_VISIBLE_LEVELS,
  parseLevelMilestoneKey,
  recordLevelMilestones
} from "../../src/db/repositories/levelMilestoneRepository";

describe("level milestone repository helpers", () => {
  it("records each newly reached level milestone", async () => {
    const created: unknown[] = [];
    const tx = {
      dailyAction: {
        create: vi.fn((input: unknown) => {
          created.push(input);
          return Promise.resolve(input);
        })
      }
    };

    await recordLevelMilestones(tx, "character-1", 1, 4, new Date("2026-06-15T10:00:00.000Z"));

    expect(tx.dailyAction.create).toHaveBeenCalledTimes(3);
    expect(created).toEqual([
      {
        data: {
          characterId: "character-1",
          key: "milestone.level.2",
          localDate: "once",
          rewardXp: 0,
          rewardGold: 0,
          resultJson: {
            milestone: {
              kind: "level",
              provenance: "recorded",
              remortCount: 0,
              level: 2
            }
          },
          createdAt: new Date("2026-06-15T10:00:00.000Z")
        }
      },
      {
        data: {
          characterId: "character-1",
          key: "milestone.level.3",
          localDate: "once",
          rewardXp: 0,
          rewardGold: 0,
          resultJson: {
            milestone: {
              kind: "level",
              provenance: "recorded",
              remortCount: 0,
              level: 3
            }
          },
          createdAt: new Date("2026-06-15T10:00:00.000Z")
        }
      },
      {
        data: {
          characterId: "character-1",
          key: "milestone.level.4",
          localDate: "once",
          rewardXp: 0,
          rewardGold: 0,
          resultJson: {
            milestone: {
              kind: "level",
              provenance: "recorded",
              remortCount: 0,
              level: 4
            }
          },
          createdAt: new Date("2026-06-15T10:00:00.000Z")
        }
      }
    ]);
  });

  it("records remort life level milestones with separate keys", async () => {
    const created: unknown[] = [];
    const tx = {
      dailyAction: {
        create: vi.fn((input: unknown) => {
          created.push(input);
          return Promise.resolve(input);
        })
      }
    };

    await recordLevelMilestones(
      tx,
      "character-1",
      1,
      3,
      new Date("2026-06-16T10:00:00.000Z"),
      { remortCount: 1 }
    );

    expect(created).toEqual([
      {
        data: {
          characterId: "character-1",
          key: "milestone.remort.1.level.2",
          localDate: "once",
          rewardXp: 0,
          rewardGold: 0,
          resultJson: {
            milestone: {
              kind: "level",
              provenance: "recorded",
              remortCount: 1,
              level: 2
            }
          },
          createdAt: new Date("2026-06-16T10:00:00.000Z")
        }
      },
      {
        data: {
          characterId: "character-1",
          key: "milestone.remort.1.level.3",
          localDate: "once",
          rewardXp: 0,
          rewardGold: 0,
          resultJson: {
            milestone: {
              kind: "level",
              provenance: "recorded",
              remortCount: 1,
              level: 3
            }
          },
          createdAt: new Date("2026-06-16T10:00:00.000Z")
        }
      }
    ]);
  });

  it("parses only valid level milestone keys", () => {
    expect(buildLevelMilestoneKey(7)).toBe("milestone.level.7");
    expect(parseLevelMilestoneKey("milestone.level.7")).toBe(7);
    expect(parseLevelMilestoneKey("milestone.level.1")).toBeNull();
    expect(parseLevelMilestoneKey("daily.level.7")).toBeNull();
    expect(parseLevelMilestoneKey("milestone.level.nope")).toBeNull();
  });

  it("keeps the public board range wide enough to show levels 13 down to 2", () => {
    expect(LEVEL_MILESTONE_VISIBLE_LEVELS).toBe(12);
  });

  it("keeps the remort detail range wide enough to show levels 13 down to 1", () => {
    expect(REMORT_LEVEL_MILESTONE_VISIBLE_LEVELS).toBe(13);
  });

  it("backfills current remort life levels separately from base-life milestones", async () => {
    const created: Array<{ data: { key: string } }> = [];
    const create = vi.fn((input: { data: { key: string } }) => {
      created.push(input);
      return Promise.resolve(input);
    });
    const prisma = {
      character: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: "character-remort-one",
              level: 3,
              updatedAt: new Date("2026-06-16T10:30:00.000Z"),
              remorts: [{ remortNumber: 1 }]
            }
          ])
        )
      },
      dailyAction: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              characterId: "character-remort-one",
              key: buildLevelMilestoneKey(2)
            }
          ])
        ),
        create
      }
    };
    const repository = new PrismaLevelMilestoneRepository(
      prisma as unknown as ConstructorParameters<typeof PrismaLevelMilestoneRepository>[0]
    );

    await repository.backfillCurrentLevels();

    expect(create).toHaveBeenCalledWith({
      data: {
        characterId: "character-remort-one",
        key: buildRemortLevelMilestoneKey(1, 2),
        localDate: "once",
        rewardXp: 0,
        rewardGold: 0,
        resultJson: {
          milestone: {
            kind: "level",
            provenance: "backfill-current-level",
            remortCount: 1,
            level: 2
          }
        },
        createdAt: new Date("2026-06-16T10:30:00.000Z")
      }
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        characterId: "character-remort-one",
        key: buildRemortLevelMilestoneKey(1, 3),
        localDate: "once",
        rewardXp: 0,
        rewardGold: 0,
        resultJson: {
          milestone: {
            kind: "level",
            provenance: "backfill-current-level",
            remortCount: 1,
            level: 3
          }
        },
        createdAt: new Date("2026-06-16T10:30:00.000Z")
      }
    });
    expect(created.map((input) => input.data.key)).not.toContain(buildLevelMilestoneKey(3));
  });

  it("reads remort detail levels from the life after the selected remort", async () => {
    const firstRemortAt = new Date("2026-06-16T10:00:00.000Z");
    const secondRemortAt = new Date("2026-06-17T10:00:00.000Z");
    const baseLevelAt = new Date("2026-06-15T10:00:00.000Z");
    const afterFirstRemortAt = new Date("2026-06-16T10:13:00.000Z");
    const afterSecondRemortAt = new Date("2026-06-17T10:13:00.000Z");
    const prisma = {
      dailyAction: {
        findMany: vi.fn((input: { where?: { key?: string | { in?: string[] } } }) => {
          const key = input.where?.key;
          const requestedKeys = typeof key === "string" ? [key] : (key?.in ?? []);

          if (
            !requestedKeys.includes(buildLevelMilestoneKey(2)) &&
            !requestedKeys.includes(buildRemortLevelMilestoneKey(1, 2))
          ) {
            return Promise.resolve([]);
          }

          return Promise.resolve([
            makeMilestoneRecord({
              characterId: "character-base",
              name: "Базова Зарубка",
              telegramUserId: 101n,
              key: buildLevelMilestoneKey(2),
              reachedAt: baseLevelAt,
              remorts: [
                {
                  remortNumber: 1,
                  createdAt: firstRemortAt
                }
              ]
            }),
            makeMilestoneRecord({
              characterId: "character-remort-one",
              name: "Після Першого",
              telegramUserId: 102n,
              key: buildRemortLevelMilestoneKey(1, 2),
              reachedAt: afterFirstRemortAt,
              remorts: [
                {
                  remortNumber: 1,
                  createdAt: firstRemortAt
                }
              ]
            }),
            makeMilestoneRecord({
              characterId: "character-remort-two",
              name: "Після Другого",
              telegramUserId: 103n,
              key: buildRemortLevelMilestoneKey(1, 2),
              reachedAt: afterSecondRemortAt,
              remorts: [
                {
                  remortNumber: 1,
                  createdAt: firstRemortAt
                },
                {
                  remortNumber: 2,
                  createdAt: secondRemortAt
                }
              ]
            })
          ]);
        })
      },
      characterRemort: {
        findMany: vi.fn((input: { where?: { remortNumber?: number } }) => {
          if (input.where?.remortNumber === 1) {
            return Promise.resolve([
              makeRemortRow({
                characterId: "character-remort-one",
                name: "Після Першого",
                displayNameSnapshot: "До Першого",
                telegramUserId: 102n,
                reachedAt: firstRemortAt
              })
            ]);
          }

          if (input.where?.remortNumber === 2) {
            return Promise.resolve([
              makeRemortRow({
                characterId: "character-remort-two",
                name: "Після Другого",
                displayNameSnapshot: "Після Першого",
                telegramUserId: 103n,
                reachedAt: secondRemortAt
              })
            ]);
          }

          return Promise.resolve([]);
        })
      }
    };
    const repository = new PrismaLevelMilestoneRepository(
      prisma as unknown as ConstructorParameters<typeof PrismaLevelMilestoneRepository>[0]
    );

    const board = await repository.listFirstReachedLevelsForRemort(1, {
      maxLevels: REMORT_LEVEL_MILESTONE_VISIBLE_LEVELS,
      maxEntriesPerLevel: 5
    });

    expect(board.levels.find((group) => group.level === 1)?.entries).toEqual([
      expect.objectContaining({
        characterId: "character-remort-one",
        name: "Після Першого",
        reachedAt: firstRemortAt
      })
    ]);
    expect(board.levels.find((group) => group.level === 2)?.entries).toEqual([
      expect.objectContaining({
        characterId: "character-remort-one",
        name: "Після Першого",
        reachedAt: afterFirstRemortAt
      }),
      expect.objectContaining({
        characterId: "character-remort-two",
        name: "Після Першого",
        reachedAt: secondRemortAt
      })
    ]);
    expect(board.levels.find((group) => group.level === 13)?.entries).toEqual([
      expect.objectContaining({
        characterId: "character-remort-two",
        name: "Після Першого",
        reachedAt: secondRemortAt
      })
    ]);
  });

  it("infers missing historic remort-life levels from the next completed remort", async () => {
    const firstRemortAt = new Date("2026-06-16T10:00:00.000Z");
    const secondRemortAt = new Date("2026-06-17T10:00:00.000Z");
    const thirdRemortAt = new Date("2026-06-18T10:00:00.000Z");
    const explicitLevelAt = new Date("2026-06-16T10:42:00.000Z");
    const prisma = {
      dailyAction: {
        findMany: vi.fn((input: { where?: { key?: string | { in?: string[] } } }) => {
          const key = input.where?.key;
          const requestedKeys = typeof key === "string" ? [key] : (key?.in ?? []);

          if (
            !requestedKeys.includes(buildLevelMilestoneKey(12)) &&
            !requestedKeys.includes(buildRemortLevelMilestoneKey(1, 12))
          ) {
            return Promise.resolve([]);
          }

          return Promise.resolve([
            makeMilestoneRecord({
              characterId: "character-explicit",
              name: "Реальна Зарубка",
              telegramUserId: 301n,
              key: buildRemortLevelMilestoneKey(1, 12),
              reachedAt: explicitLevelAt,
              remorts: [{ remortNumber: 1, createdAt: firstRemortAt }]
            })
          ]);
        })
      },
      characterRemort: {
        findMany: vi.fn((input: { where?: { remortNumber?: number } }) => {
          if (input.where?.remortNumber === 1) {
            return Promise.resolve([
              makeRemortRow({
                characterId: "character-explicit",
                name: "Реальна Зарубка",
                displayNameSnapshot: "До Першого",
                telegramUserId: 301n,
                reachedAt: firstRemortAt
              }),
              makeRemortRow({
                characterId: "character-inferred",
                name: "Пізніший Герой",
                displayNameSnapshot: "До Першого Пізнього",
                telegramUserId: 302n,
                reachedAt: firstRemortAt
              })
            ]);
          }

          if (input.where?.remortNumber === 2) {
            return Promise.resolve([
              makeRemortRow({
                characterId: "character-inferred",
                name: "Пізніший Герой",
                displayNameSnapshot: "Життя Після Першого",
                telegramUserId: 302n,
                reachedAt: secondRemortAt
              }),
              makeRemortRow({
                characterId: "character-too-late",
                name: "Вже Третій",
                displayNameSnapshot: "Життя Після Першого Теж",
                telegramUserId: 303n,
                reachedAt: thirdRemortAt
              })
            ]);
          }

          return Promise.resolve([]);
        })
      }
    };
    const repository = new PrismaLevelMilestoneRepository(
      prisma as unknown as ConstructorParameters<typeof PrismaLevelMilestoneRepository>[0]
    );

    const board = await repository.listFirstReachedLevelsForRemort(1, {
      maxLevels: REMORT_LEVEL_MILESTONE_VISIBLE_LEVELS,
      maxEntriesPerLevel: 3
    });

    expect(board.levels.find((group) => group.level === 12)?.entries).toEqual([
      expect.objectContaining({
        rank: 1,
        characterId: "character-explicit",
        name: "Реальна Зарубка",
        reachedAt: explicitLevelAt
      }),
      expect.objectContaining({
        rank: 2,
        characterId: "character-inferred",
        name: "Життя Після Першого",
        reachedAt: secondRemortAt
      }),
      expect.objectContaining({
        rank: 3,
        characterId: "character-too-late",
        name: "Життя Після Першого Теж",
        reachedAt: thirdRemortAt
      })
    ]);
  });

  it("deduplicates remort board rows before ranking", async () => {
    const firstRemortAt = new Date("2026-06-16T10:00:00.000Z");
    const legacyAt = new Date("2026-06-16T10:05:00.000Z");
    const backfillAt = new Date("2026-06-16T10:30:00.000Z");
    const realAt = new Date("2026-06-16T10:13:00.000Z");
    const prisma = {
      dailyAction: {
        findMany: vi.fn(() =>
          Promise.resolve([
            makeMilestoneRecord({
              characterId: "character-both",
              name: "Both Rows",
              telegramUserId: 202n,
              key: buildLevelMilestoneKey(2),
              reachedAt: legacyAt,
              remorts: [{ remortNumber: 1, createdAt: firstRemortAt }]
            }),
            makeMilestoneRecord({
              characterId: "character-both",
              name: "Both Rows",
              telegramUserId: 202n,
              key: buildRemortLevelMilestoneKey(1, 2),
              reachedAt: backfillAt,
              resultJson: {
                milestone: {
                  provenance: "backfill-current-level"
                }
              },
              remorts: [{ remortNumber: 1, createdAt: firstRemortAt }]
            }),
            makeMilestoneRecord({
              characterId: "character-real",
              name: "Real Row",
              telegramUserId: 203n,
              key: buildRemortLevelMilestoneKey(1, 2),
              reachedAt: realAt,
              remorts: [{ remortNumber: 1, createdAt: firstRemortAt }]
            })
          ])
        )
      },
      characterRemort: {
        findMany: vi.fn(() => Promise.resolve([]))
      }
    };
    const repository = new PrismaLevelMilestoneRepository(
      prisma as unknown as ConstructorParameters<typeof PrismaLevelMilestoneRepository>[0]
    );

    const board = await repository.listFirstReachedLevelsForRemort(1, {
      maxLevels: 12,
      maxEntriesPerLevel: 5
    });

    expect(board.levels.find((group) => group.level === 2)?.entries).toEqual([
      expect.objectContaining({
        rank: 1,
        characterId: "character-both",
        reachedAt: legacyAt
      }),
      expect.objectContaining({
        rank: 2,
        characterId: "character-real",
        reachedAt: realAt
      })
    ]);
  });
});

function makeMilestoneRecord(input: {
  characterId: string;
  name: string;
  telegramUserId: bigint;
  key: string;
  reachedAt: Date;
  resultJson?: unknown;
  remorts: Array<{ remortNumber: number; createdAt: Date }>;
}) {
  return {
    key: input.key,
    characterId: input.characterId,
    createdAt: input.reachedAt,
    resultJson: input.resultJson ?? null,
    character: {
      name: input.name,
      remorts: input.remorts,
      user: {
        telegramUserId: input.telegramUserId
      }
    }
  };
}

function makeRemortRow(input: {
  characterId: string;
  name: string;
  displayNameSnapshot: string;
  telegramUserId: bigint;
  reachedAt: Date;
}) {
  return {
    characterId: input.characterId,
    createdAt: input.reachedAt,
    displayNameSnapshot: input.displayNameSnapshot,
    character: {
      name: input.name,
      user: {
        telegramUserId: input.telegramUserId
      }
    }
  };
}
