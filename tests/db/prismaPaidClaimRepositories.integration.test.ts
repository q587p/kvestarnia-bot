import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLevelForXp } from "../../src/domain/progression/level";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaCooldownRepository } from "../../src/db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "../../src/db/repositories/prismaDailyActionRepository";
import { DailyActionQuantityLimitExceededError } from "../../src/db/repositories/dailyActionRepository";
import { buildQuestIskrokaminBonusGrant } from "../../src/domain/quests/questIskrokaminBonus";
import {
  YEGER_BANDAGE_PRICE,
  YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
  YEGER_UNQUIET_TRIAL_BUCKET,
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YegerQuestService
} from "../../src/services/yegerQuestService";
import {
  BANDAGE_ITEM_ID,
  ISKROKAMIN_ITEM_ID,
  PINK_SOAP_OF_FIRST_RULE_ITEM_ID,
  starterEquipmentGrant
} from "../../src/services/itemGrant";
import { YEGER_BANDAGE_PURCHASE_CONFIRM_KEY } from "../../src/services/dailyActionKeys";
import type { FightService } from "../../src/services/fightService";
import type { SoloCombatSessionRepository } from "../../src/db/repositories/soloCombatSessionRepository";
import {
  FIGHTING_CORNER_QUEST_KEYS,
  FightingCornerQuestService
} from "../../src/services/fightingCornerQuestService";
import { PRESENCE_LOCATION_KORCHMA_QUEST_TABLE } from "../../src/services/presenceService";

describe("paid Prisma claim repositories", () => {
  let dir: string;
  let prisma: PrismaClient;
  let dailyActions: PrismaDailyActionRepository;
  let cooldowns: PrismaCooldownRepository;
  let characters: PrismaCharacterRepository;

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
    characters = new PrismaCharacterRepository(prisma);
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

  it("guards daily reward claims with the expected combat life", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-life-guard",
      characterId: "character-daily-life-guard",
      telegramUserId: 9041n,
      gold: 0
    });
    await seedRemort(prisma, "character-daily-life-guard", 1);

    await expect(dailyActions.claimForTelegramUser(9041n, {
      key: "combat.reward.old-life",
      localDate: "session-old-life",
      rewardXp: 23,
      rewardGold: 13,
      itemGrants: [{ itemId: "item.old-life", quantity: 1 }],
      expectedLife: { remortCount: 0 }
    })).resolves.toBeNull();
    await expect(prisma.dailyAction.count({
      where: { characterId: "character-daily-life-guard" }
    })).resolves.toBe(0);
    await expect(prisma.characterItem.count({
      where: { characterId: "character-daily-life-guard" }
    })).resolves.toBe(0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "character-daily-life-guard" }
    })).resolves.toMatchObject({ xp: 0, gold: 0 });
  });

  it("guards cooldown reward claims with the expected combat life", async () => {
    await seedCharacter(prisma, {
      userId: "user-cooldown-life-guard",
      characterId: "character-cooldown-life-guard",
      telegramUserId: 9042n,
      gold: 0
    });
    await seedRemort(prisma, "character-cooldown-life-guard", 1);

    await expect(cooldowns.claimRewardForTelegramUser(9042n, {
      key: "training.doppelganger.spar",
      now: new Date("2026-06-22T10:00:00.000Z"),
      availableAt: new Date("2026-06-22T11:00:00.000Z"),
      rewardXp: 0,
      rewardGold: 0,
      expectedLife: { remortCount: 0 }
    })).resolves.toBeNull();
    await expect(prisma.characterCooldown.count({
      where: { characterId: "character-cooldown-life-guard" }
    })).resolves.toBe(0);
  });

  it("rejects an existing daily reward row from another life when expectedLife is supplied", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-existing-life-guard",
      characterId: "character-daily-existing-life-guard",
      telegramUserId: 9044n,
      gold: 0
    });
    await prisma.dailyAction.create({
      data: {
        id: "daily-existing-life-guard-row",
        characterId: "character-daily-existing-life-guard",
        key: "combat.reward.existing.old-life",
        localDate: "session-existing-old-life",
        rewardXp: 23,
        rewardGold: 13
      }
    });
    await seedRemort(prisma, "character-daily-existing-life-guard", 1);

    await expect(dailyActions.claimForTelegramUser(9044n, {
      key: "combat.reward.existing.old-life",
      localDate: "session-existing-old-life",
      rewardXp: 23,
      rewardGold: 13,
      expectedLife: { remortCount: 0 }
    })).resolves.toBeNull();
  });

  it("rejects an existing cooldown row from another life when expectedLife is supplied", async () => {
    await seedCharacter(prisma, {
      userId: "user-cooldown-existing-life-guard",
      characterId: "character-cooldown-existing-life-guard",
      telegramUserId: 9045n,
      gold: 0
    });
    await prisma.characterCooldown.create({
      data: {
        id: "cooldown-existing-life-guard-row",
        characterId: "character-cooldown-existing-life-guard",
        key: "training.doppelganger.spar",
        availableAt: new Date("2026-06-22T11:00:00.000Z")
      }
    });
    await seedRemort(prisma, "character-cooldown-existing-life-guard", 1);

    await expect(cooldowns.claimRewardForTelegramUser(9045n, {
      key: "training.doppelganger.spar",
      now: new Date("2026-06-22T10:00:00.000Z"),
      availableAt: new Date("2026-06-22T12:00:00.000Z"),
      rewardXp: 0,
      rewardGold: 0,
      expectedLife: { remortCount: 0 }
    })).resolves.toBeNull();
  });

  it("guards direct combat resource persistence with the expected combat life", async () => {
    await seedCharacter(prisma, {
      userId: "user-resource-life-guard",
      characterId: "character-resource-life-guard",
      telegramUserId: 9043n,
      gold: 0,
      hpCurrent: 25
    });
    await seedRemort(prisma, "character-resource-life-guard", 1);

    await expect(characters.updateResourcesForTelegramUser(9043n, {
      hpCurrent: 3,
      manaCurrent: 1,
      hpRegenAt: new Date("2026-06-22T10:00:00.000Z"),
      manaRegenAt: new Date("2026-06-22T10:00:00.000Z"),
      expectedLife: { remortCount: 0 }
    })).resolves.toBeNull();
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "character-resource-life-guard" }
    })).resolves.toMatchObject({ hpCurrent: 25, manaCurrent: 10 });
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

  it.each([
    { name: "no bonus", characterId: "bonus-0", telegramUserId: 9400n, level: 4, bonus: 0 },
    { name: "+1 bonus", characterId: "character-1", telegramUserId: 9401n, level: 4, bonus: 1 },
    { name: "larger +3 bonus", characterId: "bonus-60", telegramUserId: 9402n, level: 4, bonus: 3 },
    { name: "level 3 gate", characterId: "bonus-60-level-3", telegramUserId: 9403n, level: 3, bonus: 0 }
  ])("stores one canonical Iskrokamin grant for $name", async ({ characterId, telegramUserId, level, bonus }) => {
    await seedCharacter(prisma, {
      userId: `user-${characterId}`,
      characterId,
      telegramUserId,
      gold: 0,
      level
    });
    const key = "quest.fighting-corner.completed";
    const localDate = "life:0";

    expect(buildQuestIskrokaminBonusGrant({
      characterId,
      characterLevel: level,
      sourceIdentity: `${key}:${localDate}`
    })?.quantity ?? 0).toBe(bonus);

    const first = await dailyActions.claimForTelegramUser(telegramUserId, {
      key,
      localDate,
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: [
        starterEquipmentGrant(PINK_SOAP_OF_FIRST_RULE_ITEM_ID),
        { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }
      ],
      questIskrokaminBonus: true,
      resultJson: { reward: { itemGrants: [] } }
    });
    const action = await prisma.dailyAction.findUniqueOrThrow({
      where: { characterId_key_localDate: { characterId, key, localDate } }
    });
    const stored = action.resultJson as {
      reward: { appliedItemGrants: Array<{ itemId: string; quantity: number }> };
    };

    expect(first).toMatchObject({
      state: "created",
      itemGrants: [
        { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 },
        { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 + bonus }
      ]
    });
    expect(stored.reward.appliedItemGrants).toEqual([
      { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 },
      { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 + bonus }
    ]);
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: { characterId_itemId: { characterId, itemId: ISKROKAMIN_ITEM_ID } }
    })).resolves.toMatchObject({ quantity: 1 + bonus });
    await expect(dailyActions.claimForTelegramUser(telegramUserId, {
      key,
      localDate,
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: [{ itemId: ISKROKAMIN_ITEM_ID, quantity: 93 }],
      questIskrokaminBonus: true
    })).resolves.toMatchObject({ state: "existing", itemGrants: [] });
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: { characterId_itemId: { characterId, itemId: ISKROKAMIN_ITEM_ID } }
    })).resolves.toMatchObject({ quantity: 1 + bonus });
  });

  it("omits a pre-owned soap while retaining the canonical Iskrokamin grant", async () => {
    const characterId = "bonus-0-preowned-soap";
    const telegramUserId = 9404n;
    await seedCharacter(prisma, {
      userId: "user-bonus-0-preowned-soap",
      characterId,
      telegramUserId,
      gold: 0,
      level: 3
    });
    await prisma.characterItem.create({
      data: { characterId, itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 }
    });

    const result = await dailyActions.claimForTelegramUser(telegramUserId, {
      key: "quest.fighting-corner.completed",
      localDate: "life:0",
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: [
        starterEquipmentGrant(PINK_SOAP_OF_FIRST_RULE_ITEM_ID),
        { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }
      ],
      questIskrokaminBonus: true
    });

    expect(result).toMatchObject({
      state: "created",
      itemGrants: [{ itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }]
    });
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: { characterId_itemId: { characterId, itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID } }
    })).resolves.toMatchObject({ quantity: 1 });
  });

  it("serializes a concurrent Fighting Corner reward into one canonical inventory total", async () => {
    const characterId = "bonus-1";
    const telegramUserId = 9405n;
    await seedCharacter(prisma, {
      userId: "user-bonus-1",
      characterId,
      telegramUserId,
      gold: 0,
      level: 4
    });
    const input = {
      key: "quest.fighting-corner.completed",
      localDate: "life:0",
      rewardXp: 0,
      rewardGold: 0,
      itemGrants: [
        starterEquipmentGrant(PINK_SOAP_OF_FIRST_RULE_ITEM_ID),
        { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }
      ],
      questIskrokaminBonus: true
    };

    const results = await Promise.all([
      dailyActions.claimForTelegramUser(telegramUserId, input),
      dailyActions.claimForTelegramUser(telegramUserId, input)
    ]);
    const bonus = buildQuestIskrokaminBonusGrant({
      characterId,
      characterLevel: 4,
      sourceIdentity: `${input.key}:${input.localDate}`
    })?.quantity ?? 0;

    expect(results.map((result) => result?.state).sort()).toEqual(["created", "existing"]);
    await expect(prisma.dailyAction.count({ where: { characterId, key: input.key } })).resolves.toBe(1);
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: { characterId_itemId: { characterId, itemId: ISKROKAMIN_ITEM_ID } }
    })).resolves.toMatchObject({ quantity: 1 + bonus });
    const action = await prisma.dailyAction.findFirstOrThrow({ where: { characterId, key: input.key } });
    expect((action.resultJson as {
      reward: { appliedItemGrants: Array<{ itemId: string; quantity: number }> };
    }).reward.appliedItemGrants.filter((grant) => grant.itemId === ISKROKAMIN_ITEM_ID)).toEqual([
      { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 + bonus }
    ]);
  });

  it("replays the exact real Fighting Corner grant list with one Iskrokamin total", async () => {
    const characterId = "character-fighting-corner-replay";
    const telegramUserId = 9406n;
    await seedCharacter(prisma, {
      userId: "user-fighting-corner-replay",
      characterId,
      telegramUserId,
      gold: 0,
      level: 4
    });
    await prisma.user.update({
      where: { id: "user-fighting-corner-replay" },
      data: { lastSeenLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE }
    });
    await prisma.dailyAction.createMany({
      data: [
        FIGHTING_CORNER_QUEST_KEYS.accepted,
        FIGHTING_CORNER_QUEST_KEYS.training,
        FIGHTING_CORNER_QUEST_KEYS.quickDuel,
        FIGHTING_CORNER_QUEST_KEYS.turnBasedDuel
      ].map((key) => ({
        characterId,
        key,
        localDate: "life:0",
        rewardXp: 0,
        rewardGold: 0
      }))
    });
    const service = new FightingCornerQuestService(
      characters,
      dailyActions,
      { isRogueRetaliationDuelInviteToken: () => Promise.resolve(false) },
      { enabled: true, devHelpersEnabled: false },
      () => new Date("2026-07-13T18:13:00.123Z")
    );

    const first = await service.claimForTelegramUser(telegramUserId);
    const replay = await service.claimForTelegramUser(telegramUserId);

    expect(first.state).toBe("completed");
    expect(replay.state).toBe("already-completed");
    if (first.state !== "completed" || replay.state !== "already-completed") {
      throw new Error("Expected a completed Fighting Corner claim and exact replay.");
    }
    expect(replay.reward).toEqual(first.reward);
    const iskrokaminGrants = first.reward.itemGrants.filter(
      (grant) => grant.itemId === ISKROKAMIN_ITEM_ID
    );
    expect(iskrokaminGrants).toHaveLength(1);
    expect(iskrokaminGrants[0]?.quantity ?? 0).toBeGreaterThan(0);
    const iskrokaminTotal = first.reward.itemGrants.find(
      (grant) => grant.itemId === ISKROKAMIN_ITEM_ID
    )?.quantity ?? 0;
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: { characterId_itemId: { characterId, itemId: ISKROKAMIN_ITEM_ID } }
    })).resolves.toMatchObject({ quantity: iskrokaminTotal });
    await expect(prisma.dailyAction.count({
      where: { characterId, key: FIGHTING_CORNER_QUEST_KEYS.completed, localDate: "life:0" }
    })).resolves.toBe(1);
  });

  it("rolls back a paid daily claim when its transaction-local quantity limit is reached", async () => {
    const purchaseDay = currentUtcIsoDate();
    await seedCharacter(prisma, {
      userId: "user-daily-quantity-limit",
      characterId: "character-daily-quantity-limit",
      telegramUserId: 9013n,
      gold: 700
    });
    const first = await dailyActions.claimForTelegramUser(9013n, {
      key: "yeger.bandage.purchase.confirm",
      localDate: "token-first",
      rewardXp: 0,
      rewardGold: 0,
      spentGold: 35,
      itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 5 }],
      quantityLimit: {
        key: "yeger.bandage.purchase.confirm",
        purchaseDay,
        itemId: "item.responsible-panic-bandage",
        resultKind: "yeger-bandage-purchase-confirm",
        quantity: 5,
        maxQuantity: 93
      },
      resultJson: {
        kind: "yeger-bandage-purchase-confirm",
        purchaseDay
      }
    });

    expect(first?.state).toBe("created");
    await expect(dailyActions.claimForTelegramUser(9013n, {
      key: "yeger.bandage.purchase.confirm",
      localDate: "token-loser",
      rewardXp: 0,
      rewardGold: 0,
      spentGold: 651,
      itemGrants: [{ itemId: "item.responsible-panic-bandage", quantity: 93 }],
      quantityLimit: {
        key: "yeger.bandage.purchase.confirm",
        purchaseDay,
        itemId: "item.responsible-panic-bandage",
        resultKind: "yeger-bandage-purchase-confirm",
        quantity: 93,
        maxQuantity: 93
      },
      resultJson: {
        kind: "yeger-bandage-purchase-confirm",
        purchaseDay
      }
    })).rejects.toBeInstanceOf(DailyActionQuantityLimitExceededError);
    await expect(
      prisma.character.findUniqueOrThrow({ where: { id: "character-daily-quantity-limit" } })
    ).resolves.toMatchObject({ gold: 665 });
    await expect(prisma.dailyAction.count({
      where: { characterId: "character-daily-quantity-limit" }
    })).resolves.toBe(1);
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "character-daily-quantity-limit",
          itemId: "item.responsible-panic-bandage"
        }
      }
    })).resolves.toMatchObject({ quantity: 5 });
  });

  it("lists daily actions for a key inside a created-at day range", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-action-range",
      characterId: "character-daily-action-range",
      telegramUserId: 9016n,
      gold: 0
    });
    await prisma.dailyAction.createMany({
      data: [
        {
          characterId: "character-daily-action-range",
          key: "yeger.bandage.purchase.confirm",
          localDate: "old",
          rewardXp: 0,
          rewardGold: 0,
          createdAt: new Date("2026-06-14T23:59:00.000Z")
        },
        {
          characterId: "character-daily-action-range",
          key: "yeger.bandage.purchase.confirm",
          localDate: "same-day",
          rewardXp: 0,
          rewardGold: 0,
          createdAt: new Date("2026-06-15T10:00:00.000Z")
        },
        {
          characterId: "character-daily-action-range",
          key: "other-key",
          localDate: "other",
          rewardXp: 0,
          rewardGold: 0,
          createdAt: new Date("2026-06-15T10:00:00.000Z")
        }
      ]
    });

    await expect(dailyActions.listForTelegramUserInCreatedAtRange(9016n, {
      key: "yeger.bandage.purchase.confirm",
      createdAtGte: new Date("2026-06-15T00:00:00.000Z"),
      createdAtLt: new Date("2026-06-16T00:00:00.000Z")
    })).resolves.toMatchObject([
      { localDate: "same-day" }
    ]);
  });

  it("ignores previous-day rows when enforcing transaction-local Yeger purchase quantity limits", async () => {
    const purchaseDay = currentUtcIsoDate();
    const previousDay = utcIsoDateOffset(-1);
    await seedCharacter(prisma, {
      userId: "user-daily-quantity-limit-day-window",
      characterId: "character-daily-quantity-limit-day-window",
      telegramUserId: 9015n,
      gold: 1000
    });
    await prisma.dailyAction.create({
      data: {
        characterId: "character-daily-quantity-limit-day-window",
        key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
        localDate: "old-token",
        rewardXp: 0,
        rewardGold: 0,
        spentGold: YEGER_BANDAGE_PRICE * YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
        createdAt: utcDayAt(previousDay, 21),
        resultJson: {
          kind: "yeger-bandage-purchase-confirm",
          purchaseDay: previousDay,
          reward: {
            appliedItemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT }]
          }
        }
      }
    });

    const today = await dailyActions.claimForTelegramUser(9015n, {
      key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
      localDate: "today-token",
      rewardXp: 0,
      rewardGold: 0,
      spentGold: YEGER_BANDAGE_PRICE * YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
      itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT }],
      quantityLimit: {
        key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
        purchaseDay,
        itemId: BANDAGE_ITEM_ID,
        resultKind: "yeger-bandage-purchase-confirm",
        quantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT,
        maxQuantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT
      },
      resultJson: {
        kind: "yeger-bandage-purchase-confirm",
        purchaseDay
      }
    });

    expect(today?.state).toBe("created");
    await expect(dailyActions.claimForTelegramUser(9015n, {
      key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
      localDate: "today-over-limit",
      rewardXp: 0,
      rewardGold: 0,
      spentGold: YEGER_BANDAGE_PRICE,
      itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 1 }],
      quantityLimit: {
        key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
        purchaseDay,
        itemId: BANDAGE_ITEM_ID,
        resultKind: "yeger-bandage-purchase-confirm",
        quantity: 1,
        maxQuantity: YEGER_BANDAGE_PURCHASE_DAILY_LIMIT
      },
      resultJson: {
        kind: "yeger-bandage-purchase-confirm",
        purchaseDay
      }
    })).rejects.toBeInstanceOf(DailyActionQuantityLimitExceededError);
    await expect(prisma.dailyAction.count({
      where: {
        characterId: "character-daily-quantity-limit-day-window",
        key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY
      }
    })).resolves.toBe(2);
  });

  it("provides bounded DailyAction hot-path helpers", async () => {
    await seedCharacter(prisma, {
      userId: "user-daily-action-bounded-hot-paths",
      characterId: "character-daily-action-bounded-hot-paths",
      telegramUserId: 9304n,
      gold: 1000
    });
    await prisma.dailyAction.createMany({
      data: [
        {
          characterId: "character-daily-action-bounded-hot-paths",
          key: "daily.korchma-round.step",
          localDate: "2026-07-10:scene-old",
          rewardXp: 0,
          rewardGold: 0,
          createdAt: new Date("2026-07-10T08:00:00.000Z")
        },
        {
          characterId: "character-daily-action-bounded-hot-paths",
          key: "daily.korchma-round.step",
          localDate: "2026-07-11:scene-a",
          rewardXp: 0,
          rewardGold: 0,
          createdAt: new Date("2026-07-11T08:00:00.000Z")
        },
        {
          characterId: "character-daily-action-bounded-hot-paths",
          key: "daily.korchma-round.step",
          localDate: "2026-07-11:scene-b",
          rewardXp: 0,
          rewardGold: 0,
          createdAt: new Date("2026-07-11T08:01:00.000Z")
        },
        {
          characterId: "character-daily-action-bounded-hot-paths",
          key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
          localDate: "token-a",
          rewardXp: 0,
          rewardGold: 0,
          spentGold: YEGER_BANDAGE_PRICE * 5,
          createdAt: new Date("2026-07-11T09:00:00.000Z"),
          resultJson: {
            kind: "yeger-bandage-purchase-confirm",
            purchaseDay: "2026-07-11",
            reward: {
              appliedItemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 5 }]
            }
          }
        },
        {
          characterId: "character-daily-action-bounded-hot-paths",
          key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
          localDate: "token-b",
          rewardXp: 0,
          rewardGold: 0,
          spentGold: YEGER_BANDAGE_PRICE * 3,
          createdAt: new Date("2026-07-11T10:00:00.000Z"),
          resultJson: {
            kind: "yeger-bandage-purchase-confirm",
            purchaseDay: "2026-07-11",
            reward: {
              appliedItemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 3 }]
            }
          }
        }
      ]
    });

    await expect(dailyActions.listForTelegramUserByLocalDatePrefix(9304n, {
      key: "daily.korchma-round.step",
      localDatePrefix: "2026-07-11:",
      take: 13
    })).resolves.toMatchObject([
      { localDate: "2026-07-11:scene-a" },
      { localDate: "2026-07-11:scene-b" }
    ]);
    await expect(dailyActions.existsAnyForTelegramUser(9304n, {
      key: "daily.korchma-round.step",
      localDateNot: "2026-07-11:scene-a"
    })).resolves.toBe(true);
    await expect(dailyActions.sumItemGrantQuantityForTelegramUserInCreatedAtRange(9304n, {
      key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
      createdAtGte: new Date("2026-07-11T00:00:00.000Z"),
      createdAtLt: new Date("2026-07-12T00:00:00.000Z"),
      resultKind: "yeger-bandage-purchase-confirm",
      purchaseDay: "2026-07-11",
      itemId: BANDAGE_ITEM_ID,
      take: 93
    })).resolves.toEqual({ quantity: 8, rowCount: 2 });
  });

  it("replays canonical cancel when cancel wins before Yeger purchase confirm", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-cancel-wins",
      characterId: "character-yeger-cancel-wins",
      telegramUserId: 9101n,
      gold: 100
    });
    await completeBaseYegerQuest("character-yeger-cancel-wins");
    const service = createYegerService();
    const preview = await previewYegerPurchase(service, 9101n, 5);

    await expect(service.cancelBandagePurchaseForTelegramUser(9101n, preview.token))
      .resolves.toMatchObject({ state: "cancelled" });
    await expect(service.confirmBandagePurchaseForTelegramUser(9101n, preview.token))
      .resolves.toMatchObject({ state: "cancelled" });
    await expectCharacterGold(prisma, "character-yeger-cancel-wins", 100);
    await expectBandageQuantity(prisma, "character-yeger-cancel-wins", 0);
  });

  it("replays the exact canonical Yeger receipt when cancel loses after confirm", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-confirm-wins",
      characterId: "character-yeger-confirm-wins",
      telegramUserId: 9102n,
      gold: 100
    });
    await completeBaseYegerQuest("character-yeger-confirm-wins");
    const service = createYegerService();
    const preview = await previewYegerPurchase(service, 9102n, 5);

    await expect(service.confirmBandagePurchaseForTelegramUser(9102n, preview.token))
      .resolves.toMatchObject({
        state: "bought",
        spentGold: YEGER_BANDAGE_PRICE * 5,
        itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 5 }]
      });
    await expect(service.cancelBandagePurchaseForTelegramUser(9102n, preview.token))
      .resolves.toMatchObject({
        state: "replayed",
        spentGold: YEGER_BANDAGE_PRICE * 5,
        itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 5 }]
      });
    await expectCharacterGold(prisma, "character-yeger-confirm-wins", 65);
    await expectBandageQuantity(prisma, "character-yeger-confirm-wins", 5);
  });

  it("canonicalizes a real concurrent Yeger confirm-vs-cancel race", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-confirm-cancel-race",
      characterId: "character-yeger-confirm-cancel-race",
      telegramUserId: 9103n,
      gold: 700
    });
    await completeBaseYegerQuest("character-yeger-confirm-cancel-race");
    const service = createYegerService();
    const preview = await previewYegerPurchase(service, 9103n, 17);

    const [confirm, cancel] = await Promise.all([
      service.confirmBandagePurchaseForTelegramUser(9103n, preview.token),
      service.cancelBandagePurchaseForTelegramUser(9103n, preview.token)
    ]);
    const rows = await purchaseDecisionRows("character-yeger-confirm-cancel-race");

    expect(rows).toHaveLength(1);
    const kind = getYegerDecisionKind(rows[0]?.resultJson);
    if (kind === "confirm") {
      expect(["bought", "replayed"]).toContain(confirm.state);
      expect(cancel).toMatchObject({
        state: "replayed",
        spentGold: YEGER_BANDAGE_PRICE * 17,
        itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 17 }]
      });
      await expectCharacterGold(prisma, "character-yeger-confirm-cancel-race", 581);
      await expectBandageQuantity(prisma, "character-yeger-confirm-cancel-race", 17);
    } else {
      expect(kind).toBe("cancel");
      expect(confirm.state).toBe("cancelled");
      expect(cancel.state).toBe("cancelled");
      await expectCharacterGold(prisma, "character-yeger-confirm-cancel-race", 700);
      await expectBandageQuantity(prisma, "character-yeger-confirm-cancel-race", 0);
    }
  });

  it("keeps duplicate concurrent Yeger confirms to one canonical receipt", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-duplicate-confirm",
      characterId: "character-yeger-duplicate-confirm",
      telegramUserId: 9104n,
      gold: 100
    });
    await completeBaseYegerQuest("character-yeger-duplicate-confirm");
    const service = createYegerService();
    const preview = await previewYegerPurchase(service, 9104n, 5);

    const results = await Promise.all([
      service.confirmBandagePurchaseForTelegramUser(9104n, preview.token),
      service.confirmBandagePurchaseForTelegramUser(9104n, preview.token)
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["bought", "replayed"]);
    for (const result of results) {
      expect(result).toMatchObject({
        spentGold: YEGER_BANDAGE_PRICE * 5,
        itemGrants: [expect.objectContaining({ itemId: BANDAGE_ITEM_ID, quantity: 5 })]
      });
    }
    await expect(purchaseDecisionRows("character-yeger-duplicate-confirm")).resolves.toHaveLength(1);
    await expectCharacterGold(prisma, "character-yeger-duplicate-confirm", 65);
    await expectBandageQuantity(prisma, "character-yeger-duplicate-confirm", 5);
  });

  it("fails closed for malformed Yeger purchase decision rows", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-malformed-decision",
      characterId: "character-yeger-malformed-decision",
      telegramUserId: 9105n,
      gold: 100
    });
    await completeBaseYegerQuest("character-yeger-malformed-decision");
    const token = "11111111-1111-4111-8111-111111111111";
    await prisma.dailyAction.create({
      data: {
        characterId: "character-yeger-malformed-decision",
        key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
        localDate: token,
        rewardXp: 0,
        rewardGold: 0,
        spentGold: 35,
        resultJson: {
          kind: "yeger-bandage-purchase-confirm",
          itemId: BANDAGE_ITEM_ID,
          price: 35,
          purchaseQuantity: 5
        }
      }
    });

    const result = await createYegerService().confirmBandagePurchaseForTelegramUser(9105n, token);

    expect(result).toMatchObject({ state: "stale-token" });
    expect("spentGold" in result).toBe(false);
    expect("itemGrants" in result).toBe(false);
    await expectCharacterGold(prisma, "character-yeger-malformed-decision", 100);
    await expectBandageQuantity(prisma, "character-yeger-malformed-decision", 0);
  });

  it("keeps known legacy one-bandage Yeger receipts replayable without inventing bundle grants", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-legacy-receipt",
      characterId: "character-yeger-legacy-receipt",
      telegramUserId: 9106n,
      gold: 100
    });
    await completeBaseYegerQuest("character-yeger-legacy-receipt");
    const token = "22222222-2222-4222-8222-222222222222";
    await prisma.dailyAction.create({
      data: {
        characterId: "character-yeger-legacy-receipt",
        key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY,
        localDate: token,
        rewardXp: 0,
        rewardGold: 0,
        spentGold: YEGER_BANDAGE_PRICE,
        resultJson: {
          kind: "yeger-bandage-purchase-confirm",
          itemId: BANDAGE_ITEM_ID,
          price: YEGER_BANDAGE_PRICE
        }
      }
    });

    await expect(createYegerService().confirmBandagePurchaseForTelegramUser(9106n, token))
      .resolves.toMatchObject({
        state: "replayed",
        spentGold: YEGER_BANDAGE_PRICE,
        itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 1 }]
      });
    await expectBandageQuantity(prisma, "character-yeger-legacy-receipt", 0);
  });

  it("replays the same Yeger receipt after service restart", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-restart-replay",
      characterId: "character-yeger-restart-replay",
      telegramUserId: 9107n,
      gold: 100
    });
    await completeBaseYegerQuest("character-yeger-restart-replay");
    const preview = await previewYegerPurchase(createYegerService(), 9107n, 5);
    await createYegerService().confirmBandagePurchaseForTelegramUser(9107n, preview.token);

    await expect(createYegerService().confirmBandagePurchaseForTelegramUser(9107n, preview.token))
      .resolves.toMatchObject({
        state: "replayed",
        spentGold: YEGER_BANDAGE_PRICE * 5,
        itemGrants: [{ itemId: BANDAGE_ITEM_ID, quantity: 5 }]
      });
  });

  it("keeps concurrent Yeger bundles capped at the paid daily limit", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-topup-race",
      characterId: "character-yeger-topup-race",
      telegramUserId: 9108n,
      gold: 1000
    });
    await completeBaseYegerQuest("character-yeger-topup-race");
    const service = createYegerService();
    const first = await previewYegerPurchase(service, 9108n, 93);
    const second = await previewYegerPurchase(service, 9108n, 93);

    const results = await Promise.all([
      service.confirmBandagePurchaseForTelegramUser(9108n, first.token),
      service.confirmBandagePurchaseForTelegramUser(9108n, second.token)
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["bought", "stale-token"]);
    await expect(purchaseDecisionRows("character-yeger-topup-race")).resolves.toHaveLength(1);
    await expectCharacterGold(prisma, "character-yeger-topup-race", 1000 - YEGER_BANDAGE_PRICE * 93);
    await expectBandageQuantity(prisma, "character-yeger-topup-race", YEGER_BANDAGE_PURCHASE_DAILY_LIMIT);
  });

  it("rolls back the losing Yeger bundle when 5 and 93 quantities confirm concurrently", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-mixed-topup-race",
      characterId: "character-yeger-mixed-topup-race",
      telegramUserId: 9109n,
      gold: 1000
    });
    await completeBaseYegerQuest("character-yeger-mixed-topup-race");
    const service = createYegerService();
    const five = await previewYegerPurchase(service, 9109n, 5);
    const ninetyThree = await previewYegerPurchase(service, 9109n, 93);

    const results = await Promise.all([
      service.confirmBandagePurchaseForTelegramUser(9109n, five.token),
      service.confirmBandagePurchaseForTelegramUser(9109n, ninetyThree.token)
    ]);
    const rows = await purchaseDecisionRows("character-yeger-mixed-topup-race");
    const quantity = await readBandageQuantity(prisma, "character-yeger-mixed-topup-race");
    const character = await prisma.character.findUniqueOrThrow({
      where: { id: "character-yeger-mixed-topup-race" }
    });

    expect(rows).toHaveLength(1);
    expect(quantity === 5 || quantity === 93).toBe(true);
    expect(character.gold).toBe(1000 - YEGER_BANDAGE_PRICE * quantity);
    expect(results.filter((result) => result.state === "bought")).toHaveLength(1);
    expect(results.filter((result) => result.state === "stale-token")).toHaveLength(1);
  });

  it("keeps cancel-vs-confirm bundle races canonical without paid overflow", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-topup-cancel-race",
      characterId: "character-yeger-topup-cancel-race",
      telegramUserId: 9110n,
      gold: 1000
    });
    await completeBaseYegerQuest("character-yeger-topup-cancel-race");
    const service = createYegerService();
    const preview = await previewYegerPurchase(service, 9110n, 93);

    const [confirm, cancel] = await Promise.all([
      service.confirmBandagePurchaseForTelegramUser(9110n, preview.token),
      service.cancelBandagePurchaseForTelegramUser(9110n, preview.token)
    ]);
    const rows = await purchaseDecisionRows("character-yeger-topup-cancel-race");
    const kind = getYegerDecisionKind(rows[0]?.resultJson);

    expect(rows).toHaveLength(1);
    if (kind === "confirm") {
      expect(["bought", "replayed"]).toContain(confirm.state);
      expect(cancel.state).toBe("replayed");
      await expectCharacterGold(prisma, "character-yeger-topup-cancel-race", 1000 - YEGER_BANDAGE_PRICE * 93);
      await expectBandageQuantity(prisma, "character-yeger-topup-cancel-race", 93);
    } else {
      expect(kind).toBe("cancel");
      expect(confirm.state).toBe("cancelled");
      expect(cancel.state).toBe("cancelled");
      await expectCharacterGold(prisma, "character-yeger-topup-cancel-race", 1000);
      await expectBandageQuantity(prisma, "character-yeger-topup-cancel-race", 0);
    }
  });

  it("uses the shared UTC purchase-day boundary for paid Yeger bundles", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-utc-day",
      characterId: "character-yeger-utc-day",
      telegramUserId: 9111n,
      gold: 1000
    });
    await completeBaseYegerQuest("character-yeger-utc-day");
    const beforeMidnight = createYegerService(new Date("2026-06-15T23:59:00.000Z"));
    const first = await previewYegerPurchase(beforeMidnight, 9111n, 5);
    await beforeMidnight.confirmBandagePurchaseForTelegramUser(9111n, first.token);

    const afterMidnight = createYegerService(new Date("2026-06-16T00:01:00.000Z"));
    await expect(afterMidnight.previewBandagePurchaseForTelegramUser(9111n, 5))
      .resolves.toMatchObject({
        state: "preview",
        purchasedToday: 0,
        purchaseQuantity: 5
      });
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
    await expect(prisma.characterCooldown.count({
      where: { characterId: "character-cooldown-poor" }
    })).resolves.toBe(0);
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

  function createYegerService(currentNow = utcDayAt(currentUtcIsoDate(), 10)): YegerQuestService {
    return new YegerQuestService(
      characters,
      dailyActions,
      {
        listCompletedByTelegramUserIdSince: () => Promise.resolve([]),
        countWonByTelegramUserId: () => Promise.resolve(0)
      } as unknown as SoloCombatSessionRepository,
      {
        getFightOverviewForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        getOrStartPersistentFightForTelegramUser: () => Promise.resolve({ state: "no-character" })
      } as unknown as FightService,
      cooldowns,
      undefined,
      () => currentNow
    );
  }

  async function previewYegerPurchase(
    service: YegerQuestService,
    telegramUserId: bigint,
    targetQuantity: 1 | 5 | 17 | 93
  ) {
    const preview = await service.previewBandagePurchaseForTelegramUser(telegramUserId, targetQuantity);
    if (preview.state !== "preview") {
      throw new Error(`Expected Yeger purchase preview, got ${preview.state}.`);
    }

    return preview;
  }

  async function purchaseDecisionRows(characterId: string) {
    return prisma.dailyAction.findMany({
      where: {
        characterId,
        key: YEGER_BANDAGE_PURCHASE_CONFIRM_KEY
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async function completeBaseYegerQuest(characterId: string): Promise<void> {
    await prisma.dailyAction.create({
      data: {
        characterId,
        key: YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
        localDate: YEGER_UNQUIET_TRIAL_BUCKET,
        rewardXp: 13,
        rewardGold: 13
      }
    });
  }
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
      active_cosmetic_title_grant_id TEXT,
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
    `CREATE INDEX daily_actions_character_id_key_created_at_idx ON daily_actions(character_id, key, created_at)`,
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
    level?: number;
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
      level: input.level ?? 1,
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

async function seedRemort(
  prisma: PrismaClient,
  characterId: string,
  remortNumber: number
): Promise<void> {
  await prisma.characterRemort.create({
    data: {
      characterId,
      token: `token-${characterId}-${remortNumber}`,
      remortNumber,
      previousLevel: 13,
      previousXp: 1300,
      previousGold: 587,
      displayNameSnapshot: "Shannar de Kassal",
      preservedPayloadJson: {
        identity: {
          pronoun: "they",
          raceId: "race.human-ish",
          classId: "class.warrior"
        },
        items: [],
        memoryRank: remortNumber
      }
    }
  });
}

function getYegerDecisionKind(value: unknown): "confirm" | "cancel" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const kind = (value as { kind?: unknown }).kind;
  if (kind === "yeger-bandage-purchase-confirm") {
    return "confirm";
  }

  if (kind === "yeger-bandage-purchase-cancel") {
    return "cancel";
  }

  return null;
}

function currentUtcIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcIsoDateOffset(days: number): string {
  const date = new Date(`${currentUtcIsoDate()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function utcDayAt(isoDate: string, hour: number): Date {
  return new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

async function expectCharacterGold(
  prisma: PrismaClient,
  characterId: string,
  gold: number
): Promise<void> {
  await expect(prisma.character.findUniqueOrThrow({ where: { id: characterId } }))
    .resolves.toMatchObject({ gold });
}

async function readBandageQuantity(
  prisma: PrismaClient,
  characterId: string
): Promise<number> {
  const stack = await prisma.characterItem.findUnique({
    where: {
      characterId_itemId: {
        characterId,
        itemId: BANDAGE_ITEM_ID
      }
    }
  });

  return stack?.quantity ?? 0;
}

async function expectBandageQuantity(
  prisma: PrismaClient,
  characterId: string,
  quantity: number
): Promise<void> {
  expect(await readBandageQuantity(prisma, characterId)).toBe(quantity);
}
