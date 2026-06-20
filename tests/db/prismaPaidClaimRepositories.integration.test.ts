import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLevelForXp } from "../../src/domain/progression/level";
import { PrismaCooldownRepository } from "../../src/db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "../../src/db/repositories/prismaDailyActionRepository";

describe("paid Prisma claim repositories", () => {
  let dir: string;
  let prisma: PrismaClient;
  let dailyActions: PrismaDailyActionRepository;
  let cooldowns: PrismaCooldownRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-paid-claim-repos-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    dailyActions = new PrismaDailyActionRepository(prisma);
    cooldowns = new PrismaCooldownRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("does not create a daily action, reward, item, or debit when paid daily claim lacks gold", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-poor",
      characterId: "character-daily-poor",
      telegramUserId: 9001n,
      gold: 0
    });

    const result = await dailyActions.claimForTelegramUser(9001n, {
      key: "quest.paid",
      localDate: "12026-06-20",
      rewardXp: 7,
      rewardGold: 4,
      spentGold: 1,
      itemGrants: [{ itemId: "item.test", quantity: 1 }]
    });

    expect(result).toMatchObject({
      state: "insufficient-gold",
      requiredGold: 1
    });
    await expect(prisma.dailyAction.count()).resolves.toBe(0);
    await expect(prisma.characterItem.count()).resolves.toBe(0);
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-poor" } })
    ).resolves.toMatchObject({ xp: 0, gold: 0, hpCurrent: 25 });
  });

  it("stores and applies daily HP loss once while clamping at 1 HP", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-hp",
      characterId: "character-daily-hp",
      telegramUserId: 9021n,
      gold: 5,
      hpCurrent: 3,
      hpMax: 25
    });
    const input = {
      key: "quest.hp.once",
      localDate: "12026-06-20",
      rewardXp: 7,
      rewardGold: 4,
      spentGold: 1,
      hpLoss: {
        requested: 8,
        effectiveHpMax: 25
      },
      resultJson: {
        reward: {
          itemGrants: [{ itemId: "item.hp", quantity: 1 }]
        }
      },
      itemGrants: [{ itemId: "item.hp", quantity: 1 }]
    };

    const first = await dailyActions.claimForTelegramUser(9021n, input);
    const second = await dailyActions.claimForTelegramUser(9021n, input);

    expect(first).toMatchObject({
      state: "created",
      hpLoss: {
        before: 3,
        max: 25,
        lost: 2,
        after: 1
      }
    });
    expect(second?.state).toBe("existing");
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-hp" } })
    ).resolves.toMatchObject({ xp: 7, gold: 8, hpCurrent: 1 });
    const action = await prisma.dailyAction.findFirstOrThrow({
      where: { characterId: "character-daily-hp" }
    });
    expect(action.resultJson).toMatchObject({
      hp: {
        before: 3,
        max: 25,
        lost: 2,
        after: 1
      }
    });
  });

  it("rolls back daily HP, cost, reward and item grants after a blocked handoff", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-rollback",
      characterId: "character-daily-rollback",
      telegramUserId: 9022n,
      gold: 5,
      hpCurrent: 12,
      hpMax: 25
    });

    const claim = await dailyActions.claimForTelegramUser(9022n, {
      key: "quest.rollback",
      localDate: "12026-06-20",
      rewardXp: 7,
      rewardGold: 4,
      spentGold: 2,
      hpLoss: {
        requested: 3,
        effectiveHpMax: 25
      },
      resultJson: {
        reward: {
          itemGrants: [{ itemId: "item.rollback", quantity: 1 }]
        }
      },
      itemGrants: [{ itemId: "item.rollback", quantity: 1 }]
    });

    expect(claim?.state).toBe("created");
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-rollback" } })
    ).resolves.toMatchObject({ xp: 7, gold: 7, hpCurrent: 9 });

    const rollback = await dailyActions.rollbackForTelegramUser(9022n, {
      key: "quest.rollback",
      localDate: "12026-06-20"
    });

    expect(rollback).toBe("rolled-back");
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-rollback" } })
    ).resolves.toMatchObject({ xp: 0, gold: 5, hpCurrent: 12 });
    await expect(prisma.dailyAction.count({ where: { characterId: "character-daily-rollback" } })).resolves.toBe(0);
    await expect(prisma.characterItem.count({ where: { characterId: "character-daily-rollback" } })).resolves.toBe(0);
  });

  it("returns an existing paid daily claim without charging twice", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-paid",
      characterId: "character-daily-paid",
      telegramUserId: 9002n,
      gold: 3
    });
    const input = {
      key: "quest.paid.once",
      localDate: "12026-06-20",
      rewardXp: 7,
      rewardGold: 4,
      spentGold: 2,
      itemGrants: [{ itemId: "item.test", quantity: 1 }]
    };

    const first = await dailyActions.claimForTelegramUser(9002n, input);
    const second = await dailyActions.claimForTelegramUser(9002n, input);

    expect(first?.state).toBe("created");
    expect(second?.state).toBe("existing");
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-paid" } })
    ).resolves.toMatchObject({ xp: 7, gold: 5 });
    await expect(prisma.dailyAction.count({ where: { characterId: "character-daily-paid" } })).resolves.toBe(1);
    await expect(prisma.characterItem.count({ where: { characterId: "character-daily-paid" } })).resolves.toBe(1);
  });

  it("serializes concurrent paid daily claims without a second charge", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-concurrent",
      characterId: "character-daily-concurrent",
      telegramUserId: 9012n,
      gold: 2
    });
    const input = {
      key: "quest.paid.concurrent",
      localDate: "12026-06-20",
      rewardXp: 7,
      rewardGold: 4,
      spentGold: 2,
      itemGrants: [{ itemId: "item.test", quantity: 1 }]
    };

    const results = await Promise.all([
      dailyActions.claimForTelegramUser(9012n, input),
      dailyActions.claimForTelegramUser(9012n, input)
    ]);

    expect(results.map((result) => result?.state).sort()).toEqual(["created", "existing"]);
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-concurrent" } })
    ).resolves.toMatchObject({ xp: 7, gold: 4 });
    await expect(prisma.dailyAction.count({ where: { characterId: "character-daily-concurrent" } })).resolves.toBe(1);
    await expect(prisma.characterItem.count({ where: { characterId: "character-daily-concurrent" } })).resolves.toBe(1);
  });

  it("serializes concurrent daily HP claims without a second injury", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-hp-concurrent",
      characterId: "character-daily-hp-concurrent",
      telegramUserId: 9023n,
      gold: 2,
      hpCurrent: 10
    });
    const input = {
      key: "quest.hp.concurrent",
      localDate: "12026-06-20",
      rewardXp: 7,
      rewardGold: 4,
      spentGold: 2,
      hpLoss: {
        requested: 3,
        effectiveHpMax: 25
      },
      itemGrants: [{ itemId: "item.hp.concurrent", quantity: 1 }]
    };

    const results = await Promise.all([
      dailyActions.claimForTelegramUser(9023n, input),
      dailyActions.claimForTelegramUser(9023n, input)
    ]);

    expect(results.map((result) => result?.state).sort()).toEqual(["created", "existing"]);
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-hp-concurrent" } })
    ).resolves.toMatchObject({ xp: 7, gold: 4, hpCurrent: 7 });
  });

  it("does not create or advance cooldown when paid cooldown claim lacks gold", async () => {
    await seedCharacter(prisma, {
      userId: "user-cooldown-poor",
      characterId: "character-cooldown-poor",
      telegramUserId: 9003n,
      gold: 0
    });
    const now = new Date("2026-06-20T10:00:00.000Z");

    const result = await cooldowns.claimRewardForTelegramUser(9003n, {
      key: "cellar.mouse-errand",
      now,
      availableAt: new Date(now.getTime() + 60_000),
      rewardXp: 2,
      rewardGold: 1,
      spentGold: 1,
      itemGrants: [{ itemId: "item.test", quantity: 1 }]
    });

    expect(result).toMatchObject({
      state: "insufficient-gold",
      requiredGold: 1
    });
    await expect(prisma.characterCooldown.count()).resolves.toBe(0);
    await expect(prisma.characterItem.count({ where: { characterId: "character-cooldown-poor" } })).resolves.toBe(0);
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-cooldown-poor" } })
    ).resolves.toMatchObject({ xp: 0, gold: 0 });
  });

  it("claims a paid cooldown once and rejects an immediate replay as on-cooldown", async () => {
    await seedCharacter(prisma, {
      userId: "user-cooldown-paid",
      characterId: "character-cooldown-paid",
      telegramUserId: 9004n,
      gold: 2
    });
    const now = new Date("2026-06-20T10:00:00.000Z");
    const input = {
      key: "cellar.mouse-errand",
      now,
      availableAt: new Date(now.getTime() + 60_000),
      rewardXp: 2,
      rewardGold: 1,
      spentGold: 1,
      itemGrants: [{ itemId: "item.test", quantity: 1 }]
    };

    const first = await cooldowns.claimRewardForTelegramUser(9004n, input);
    const second = await cooldowns.claimRewardForTelegramUser(9004n, input);

    expect(first?.state).toBe("completed");
    expect(second?.state).toBe("on-cooldown");
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-cooldown-paid" } })
    ).resolves.toMatchObject({ xp: 2, gold: 2 });
    await expect(prisma.characterCooldown.count({ where: { characterId: "character-cooldown-paid" } })).resolves.toBe(1);
    await expect(prisma.characterItem.count({ where: { characterId: "character-cooldown-paid" } })).resolves.toBe(1);
  });

  it("applies cooldown HP loss once and leaves old no-injury claims unchanged", async () => {
    await seedCharacter(prisma, {
      userId: "user-cooldown-hp",
      characterId: "character-cooldown-hp",
      telegramUserId: 9024n,
      gold: 3,
      hpCurrent: 8
    });
    const now = new Date("2026-06-20T10:00:00.000Z");

    const injured = await cooldowns.claimRewardForTelegramUser(9024n, {
      key: "cellar.mouse-errand.hp",
      now,
      availableAt: new Date(now.getTime() + 60_000),
      rewardXp: 2,
      rewardGold: 1,
      hpLoss: {
        requested: 2,
        effectiveHpMax: 25
      },
      resultJson: {
        version: 1,
        sceneId: "cellar-mouse",
        methodId: "sweep-tracks",
        grade: "mixed-success",
        consequence: "minor-injury",
        reward: { xp: 2, gold: 1, itemGrants: [] },
        spentGold: 0,
        cycleKey: "cycle-a"
      },
      itemGrants: []
    });
    const replay = await cooldowns.claimRewardForTelegramUser(9024n, {
      key: "cellar.mouse-errand.hp",
      now,
      availableAt: new Date(now.getTime() + 60_000),
      rewardXp: 2,
      rewardGold: 1,
      hpLoss: {
        requested: 2,
        effectiveHpMax: 25
      },
      itemGrants: []
    });
    const oldStyle = await cooldowns.claimRewardForTelegramUser(9024n, {
      key: "cellar.mouse-errand.no-hp",
      now: new Date(now.getTime() + 120_000),
      availableAt: new Date(now.getTime() + 180_000),
      rewardXp: 1,
      rewardGold: 0,
      itemGrants: []
    });

    expect(injured).toMatchObject({
      state: "completed",
      hpLoss: {
        before: 8,
        max: 25,
        lost: 2,
        after: 6
      }
    });
    expect(replay?.state).toBe("on-cooldown");
    expect(oldStyle).toMatchObject({ state: "completed", hpLoss: null });
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-cooldown-hp" } })
    ).resolves.toMatchObject({ xp: 3, gold: 4, hpCurrent: 6 });
    const cooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: {
        characterId_key: {
          characterId: "character-cooldown-hp",
          key: "cellar.mouse-errand.hp"
        }
      }
    });
    expect(cooldown.resultJson).toMatchObject({
      version: 1,
      sceneId: "cellar-mouse",
      methodId: "sweep-tracks",
      grade: "mixed-success",
      consequence: "minor-injury",
      reward: { xp: 2, gold: 1, itemGrants: [] },
      spentGold: 0,
      cycleKey: "cycle-a",
      hp: {
        before: 8,
        max: 25,
        lost: 2,
        after: 6
      },
      appliedItemGrants: []
    });
  });

  it("stores the service-supplied effective max for level and equipment HP bonuses", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-effective-hp",
      characterId: "character-daily-effective-hp",
      telegramUserId: 9025n,
      gold: 2,
      hpCurrent: 24,
      hpMax: 25
    });

    const result = await dailyActions.claimForTelegramUser(9025n, {
      key: "quest.hp.effective",
      localDate: "12026-06-20",
      rewardXp: 1,
      rewardGold: 0,
      hpLoss: {
        requested: 4,
        effectiveHpMax: 33
      }
    });

    expect(result).toMatchObject({
      state: "created",
      hpLoss: {
        before: 24,
        max: 33,
        lost: 4,
        after: 20
      }
    });
    const action = await prisma.dailyAction.findFirstOrThrow({
      where: { characterId: "character-daily-effective-hp" }
    });
    expect(action.resultJson).toMatchObject({
      hp: {
        before: 24,
        max: 33,
        lost: 4,
        after: 20
      }
    });
  });

  it("applies two different concurrent daily HP claims without losing either injury", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-distinct-hp",
      characterId: "character-daily-distinct-hp",
      telegramUserId: 9026n,
      gold: 10,
      hpCurrent: 12,
      hpMax: 25
    });

    const [first, second] = await Promise.all([
      dailyActions.claimForTelegramUser(9026n, {
        key: "quest.hp.distinct-a",
        localDate: "12026-06-20",
        rewardXp: 1,
        rewardGold: 0,
        spentGold: 1,
        hpLoss: { requested: 3, effectiveHpMax: 25 }
      }),
      dailyActions.claimForTelegramUser(9026n, {
        key: "quest.hp.distinct-b",
        localDate: "12026-06-20",
        rewardXp: 2,
        rewardGold: 0,
        spentGold: 1,
        hpLoss: { requested: 4, effectiveHpMax: 25 }
      })
    ]);

    expect([first?.state, second?.state].sort()).toEqual(["created", "created"]);
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-distinct-hp" } })
    ).resolves.toMatchObject({ xp: 3, gold: 8, hpCurrent: 5 });
    const actions = await prisma.dailyAction.findMany({
      where: { characterId: "character-daily-distinct-hp" },
      orderBy: { key: "asc" }
    });
    const audits = actions.map((action) => (action.resultJson as { hp: { before: number; lost: number; after: number } }).hp);
    expect(audits.map((audit) => audit.lost).sort((a, b) => a - b)).toEqual([3, 4]);
    for (const audit of audits) {
      expect(audit.after).toBe(audit.before - audit.lost);
    }
    expect(Math.max(...audits.map((audit) => audit.before))).toBe(12);
    expect(Math.min(...audits.map((audit) => audit.after))).toBe(5);
    expect(new Set(audits.flatMap((audit) => [audit.before, audit.after])).size).toBe(3);
  });

  it("rolls back only the committed HP delta after an unrelated HP change", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-rollback-delta",
      characterId: "character-daily-rollback-delta",
      telegramUserId: 9027n,
      gold: 5,
      hpCurrent: 12,
      hpMax: 25
    });

    await dailyActions.claimForTelegramUser(9027n, {
      key: "quest.rollback.delta",
      localDate: "12026-06-20",
      rewardXp: 5,
      rewardGold: 3,
      spentGold: 2,
      hpLoss: { requested: 3, effectiveHpMax: 25 },
      resultJson: {
        reward: {
          itemGrants: [{ itemId: "item.rollback.delta", quantity: 1 }]
        }
      },
      itemGrants: [{ itemId: "item.rollback.delta", quantity: 1 }]
    });
    await prisma.character.update({
      where: { id: "character-daily-rollback-delta" },
      data: { hpCurrent: { decrement: 2 } }
    });

    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-rollback-delta" } })
    ).resolves.toMatchObject({ xp: 5, gold: 6, hpCurrent: 7 });
    await expect(
      dailyActions.rollbackForTelegramUser(9027n, {
        key: "quest.rollback.delta",
        localDate: "12026-06-20"
      })
    ).resolves.toBe("rolled-back");
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-rollback-delta" } })
    ).resolves.toMatchObject({ xp: 0, gold: 5, hpCurrent: 7 });
    await expect(
      dailyActions.rollbackForTelegramUser(9027n, {
        key: "quest.rollback.delta",
        localDate: "12026-06-20"
      })
    ).resolves.toBe("missing");
    await expect(
      dailyActions.rollbackForTelegramUser(9027n, {
        key: "quest.rollback.missing",
        localDate: "12026-06-20"
      })
    ).resolves.toBe("missing");
    await expect(prisma.characterItem.count({ where: { characterId: "character-daily-rollback-delta" } })).resolves.toBe(0);
  });

  it("rolls back only the claim reward after another XP and gold reward lands", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-rollback-later-reward",
      characterId: "character-daily-rollback-later-reward",
      telegramUserId: 9031n,
      gold: 10
    });

    await dailyActions.claimForTelegramUser(9031n, {
      key: "quest.rollback.later-reward",
      localDate: "12026-06-20",
      rewardXp: 12,
      rewardGold: 4,
      spentGold: 2
    });
    await prisma.character.update({
      where: { id: "character-daily-rollback-later-reward" },
      data: {
        xp: { increment: 100 },
        gold: { increment: 7 },
        level: getLevelForXp(112, { remortCount: 0 })
      }
    });

    await expect(
      dailyActions.rollbackForTelegramUser(9031n, {
        key: "quest.rollback.later-reward",
        localDate: "12026-06-20"
      })
    ).resolves.toBe("rolled-back");
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-rollback-later-reward" } })
    ).resolves.toMatchObject({
      xp: 100,
      gold: 17,
      level: getLevelForXp(100, { remortCount: 0 })
    });
  });

  it("removes only the claim item quantity when the same item is gained later", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-rollback-same-item",
      characterId: "character-daily-rollback-same-item",
      telegramUserId: 9032n,
      gold: 5
    });

    await dailyActions.claimForTelegramUser(9032n, {
      key: "quest.rollback.same-item",
      localDate: "12026-06-20",
      rewardXp: 1,
      rewardGold: 0,
      resultJson: {
        reward: {
          itemGrants: [{ itemId: "item.rollback.same", quantity: 1 }]
        }
      },
      itemGrants: [{ itemId: "item.rollback.same", quantity: 1 }]
    });
    await prisma.characterItem.update({
      where: {
        characterId_itemId: {
          characterId: "character-daily-rollback-same-item",
          itemId: "item.rollback.same"
        }
      },
      data: {
        quantity: {
          increment: 2
        }
      }
    });

    await expect(
      dailyActions.rollbackForTelegramUser(9032n, {
        key: "quest.rollback.same-item",
        localDate: "12026-06-20"
      })
    ).resolves.toBe("rolled-back");
    await expect(
      prisma.characterItem.findUniqueOrThrow({
        where: {
          characterId_itemId: {
            characterId: "character-daily-rollback-same-item",
            itemId: "item.rollback.same"
          }
        }
      })
    ).resolves.toMatchObject({ quantity: 2 });
  });

  it("does not heal changed current HP when current effective max increased after the claim", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-rollback-current-max",
      characterId: "character-daily-rollback-current-max",
      telegramUserId: 9033n,
      gold: 5,
      hpCurrent: 12,
      hpMax: 25
    });

    await dailyActions.claimForTelegramUser(9033n, {
      key: "quest.rollback.current-max",
      localDate: "12026-06-20",
      rewardXp: 1,
      rewardGold: 0,
      hpLoss: { requested: 3, effectiveHpMax: 25 }
    });
    await prisma.character.update({
      where: { id: "character-daily-rollback-current-max" },
      data: { hpCurrent: 24, hpMax: 40 }
    });

    await expect(
      dailyActions.rollbackForTelegramUser(9033n, {
        key: "quest.rollback.current-max",
        localDate: "12026-06-20",
        currentEffectiveHpMax: 40
      })
    ).resolves.toBe("rolled-back");
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-rollback-current-max" } })
    ).resolves.toMatchObject({ hpCurrent: 24, hpMax: 40 });
  });

  it("rolls back only applied item grants when max-owned caps reduce the request", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-rollback-applied-cap",
      characterId: "character-daily-rollback-applied-cap",
      telegramUserId: 9034n,
      gold: 5
    });
    await prisma.characterItem.create({
      data: {
        characterId: "character-daily-rollback-applied-cap",
        itemId: "item.rollback.cap",
        quantity: 1
      }
    });

    await dailyActions.claimForTelegramUser(9034n, {
      key: "quest.rollback.applied-zero",
      localDate: "12026-06-20",
      rewardXp: 1,
      rewardGold: 0,
      resultJson: {
        reward: {
          itemGrants: [{ itemId: "item.rollback.cap", quantity: 1, maxOwnedQuantity: 1 }]
        }
      },
      itemGrants: [{ itemId: "item.rollback.cap", quantity: 1, maxOwnedQuantity: 1 }]
    });

    await expect(
      dailyActions.rollbackForTelegramUser(9034n, {
        key: "quest.rollback.applied-zero",
        localDate: "12026-06-20"
      })
    ).resolves.toBe("rolled-back");
    await expect(
      prisma.characterItem.findUniqueOrThrow({
        where: {
          characterId_itemId: {
            characterId: "character-daily-rollback-applied-cap",
            itemId: "item.rollback.cap"
          }
        }
      })
    ).resolves.toMatchObject({ quantity: 1 });
  });

  it("persists partial applied item grants and rolls back only that quantity", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-rollback-applied-partial",
      characterId: "character-daily-rollback-applied-partial",
      telegramUserId: 9035n,
      gold: 5
    });
    await prisma.characterItem.create({
      data: {
        characterId: "character-daily-rollback-applied-partial",
        itemId: "item.rollback.partial",
        quantity: 1
      }
    });

    const claim = await dailyActions.claimForTelegramUser(9035n, {
      key: "quest.rollback.applied-one",
      localDate: "12026-06-20",
      rewardXp: 1,
      rewardGold: 0,
      resultJson: {
        reward: {
          itemGrants: [{ itemId: "item.rollback.partial", quantity: 2, maxOwnedQuantity: 2 }]
        }
      },
      itemGrants: [{ itemId: "item.rollback.partial", quantity: 2, maxOwnedQuantity: 2 }]
    });

    expect(claim).toMatchObject({
      state: "created",
      itemGrants: [{ itemId: "item.rollback.partial", quantity: 1 }]
    });
    const action = await prisma.dailyAction.findFirstOrThrow({
      where: { characterId: "character-daily-rollback-applied-partial" }
    });
    expect(action.resultJson).toMatchObject({
      reward: {
        appliedItemGrants: [{ itemId: "item.rollback.partial", quantity: 1 }]
      }
    });
    await prisma.characterItem.update({
      where: {
        characterId_itemId: {
          characterId: "character-daily-rollback-applied-partial",
          itemId: "item.rollback.partial"
        }
      },
      data: { quantity: { increment: 2 } }
    });

    await expect(
      dailyActions.rollbackForTelegramUser(9035n, {
        key: "quest.rollback.applied-one",
        localDate: "12026-06-20"
      })
    ).resolves.toBe("rolled-back");
    await expect(
      prisma.characterItem.findUniqueOrThrow({
        where: {
          characterId_itemId: {
            characterId: "character-daily-rollback-applied-partial",
            itemId: "item.rollback.partial"
          }
        }
      })
    ).resolves.toMatchObject({ quantity: 3 });
  });

  it.each([
    {
      name: "later healing",
      characterId: "character-daily-rollback-healing",
      telegramUserId: 9028n,
      mutate: () =>
        prisma.character.update({
          where: { id: "character-daily-rollback-healing" },
          data: { hpCurrent: 15 }
        }),
      expectedHp: 15
    },
    {
      name: "later max HP increase",
      characterId: "character-daily-rollback-max-up",
      telegramUserId: 9029n,
      mutate: () =>
        prisma.character.update({
          where: { id: "character-daily-rollback-max-up" },
          data: { hpCurrent: 38, hpMax: 40 }
        }),
      expectedHp: 38
    },
    {
      name: "later max HP decrease below current",
      characterId: "character-daily-rollback-max-down",
      telegramUserId: 9030n,
      mutate: () =>
        prisma.character.update({
          where: { id: "character-daily-rollback-max-down" },
          data: { hpCurrent: 9, hpMax: 8 }
        }),
      expectedHp: 9
    }
  ])("does not reduce current HP during rollback after $name", async ({ characterId, telegramUserId, mutate, expectedHp }) => {
    await seedCharacter(prisma, {
      userId: `user-${characterId}`,
      characterId,
      telegramUserId,
      gold: 5,
      hpCurrent: 12,
      hpMax: 25
    });

    await dailyActions.claimForTelegramUser(telegramUserId, {
      key: `quest.rollback.${characterId}`,
      localDate: "12026-06-20",
      rewardXp: 5,
      rewardGold: 0,
      hpLoss: { requested: 3, effectiveHpMax: 25 }
    });
    await mutate();

    await expect(
      dailyActions.rollbackForTelegramUser(telegramUserId, {
        key: `quest.rollback.${characterId}`,
        localDate: "12026-06-20"
      })
    ).resolves.toBe("rolled-back");
    await expect(prisma.character.findUniqueOrThrow({ where: { id: characterId } })).resolves.toMatchObject({
      hpCurrent: expectedHp
    });
    await expect(
      dailyActions.rollbackForTelegramUser(telegramUserId, {
        key: `quest.rollback.${characterId}`,
        localDate: "12026-06-20"
      })
    ).resolves.toBe("missing");
  });

  it("serializes concurrent paid cooldown claims without a second charge", async () => {
    await seedCharacter(prisma, {
      userId: "user-cooldown-concurrent",
      characterId: "character-cooldown-concurrent",
      telegramUserId: 9014n,
      gold: 1
    });
    const now = new Date("2026-06-20T10:00:00.000Z");
    const input = {
      key: "cellar.mouse-errand.concurrent",
      now,
      availableAt: new Date(now.getTime() + 60_000),
      rewardXp: 2,
      rewardGold: 1,
      spentGold: 1,
      itemGrants: [{ itemId: "item.test", quantity: 1 }]
    };

    const results = await Promise.all([
      cooldowns.claimRewardForTelegramUser(9014n, input),
      cooldowns.claimRewardForTelegramUser(9014n, input)
    ]);

    expect(results.map((result) => result?.state).sort()).toEqual(["completed", "on-cooldown"]);
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-cooldown-concurrent" } })
    ).resolves.toMatchObject({ xp: 2, gold: 1 });
    await expect(prisma.characterCooldown.count({ where: { characterId: "character-cooldown-concurrent" } })).resolves.toBe(1);
    await expect(prisma.characterItem.count({ where: { characterId: "character-cooldown-concurrent" } })).resolves.toBe(1);
  });
});

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      telegram_user_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT,
      language_code TEXT,
      last_action_at DATETIME,
      last_seen_location_id TEXT,
      current_raid_id TEXT,
      current_adventure_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pronoun TEXT NOT NULL DEFAULT 'they',
      path TEXT NOT NULL DEFAULT 'boundary',
      race_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25,
      hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10,
      mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME,
      mana_regen_at DATETIME,
      stats_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL,
      reward_gold INTEGER NOT NULL,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX daily_actions_character_key_date ON daily_actions(character_id, key, local_date)`,
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX character_items_character_item ON character_items(character_id, item_id)`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX character_cooldowns_character_key ON character_cooldowns(character_id, key)`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX character_remorts_character_number ON character_remorts(character_id, remort_number)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function seedCharacter(
  prisma: PrismaClient,
  input: {
    userId: string;
    characterId: string;
    telegramUserId: bigint;
    gold: number;
    hpCurrent?: number;
    hpMax?: number;
  }
): Promise<void> {
  await prisma.user.create({
    data: {
      id: input.userId,
      telegramUserId: input.telegramUserId
    }
  });
  await prisma.character.create({
    data: {
      id: input.characterId,
      userId: input.userId,
      name: "Мандрівник",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 1,
      xp: 0,
      gold: input.gold,
      hpCurrent: input.hpCurrent ?? 25,
      hpMax: input.hpMax ?? 25,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: {
        strength: 6,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    }
  });
}
