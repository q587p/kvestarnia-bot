import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    ).resolves.toMatchObject({ xp: 0, gold: 0 });
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
  input: { userId: string; characterId: string; telegramUserId: bigint; gold: number }
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
      hpCurrent: 25,
      hpMax: 25,
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
