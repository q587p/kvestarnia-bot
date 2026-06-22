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
    const create = vi.fn((input: unknown) => Promise.resolve(input));
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
        createdAt: new Date("2026-06-16T10:30:00.000Z")
      }
    });
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: buildLevelMilestoneKey(3)
        })
      })
    );
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
});

function makeMilestoneRecord(input: {
  characterId: string;
  name: string;
  telegramUserId: bigint;
  reachedAt: Date;
  remorts: Array<{ remortNumber: number; createdAt: Date }>;
}) {
  return {
    characterId: input.characterId,
    createdAt: input.reachedAt,
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
