import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimDailyActionResult } from "../../src/db/repositories/dailyActionRepository";
import { PrismaDailyActionRepository } from "../../src/db/repositories/prismaDailyActionRepository";
import type { AchievementEvent, AchievementService } from "../../src/services/achievementService";
import { trackRewardAchievementsSafely } from "../../src/services/achievementTracking";
import {
  ADVENTURE_CHOICE_COOLDOWN_MS,
  ADVENTURE_CHOICE_KEY,
  buildAdventurePeriod
} from "../../src/services/adventureService";
import type { PublicActivityEventPublisher } from "../../src/services/publicActivityEventPublisher";

const telegramUserId = 9_303n;
const userId = "user-adventure-concurrency";
const characterId = "character-adventure-concurrency";
const itemId = "item.loot-v1-integration-token";

describe("PrismaDailyActionRepository integration", () => {
  let dir: string;
  let firstPrisma: PrismaClient;
  let secondPrisma: PrismaClient;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-daily-action-"));
    const url = `file:${join(dir, "test.db").replace(/\\\\/g, "/")}`;
    firstPrisma = new PrismaClient({ datasources: { db: { url } } });
    secondPrisma = new PrismaClient({ datasources: { db: { url } } });
    await createMinimalSchema(firstPrisma);
  }, 60_000);

  beforeEach(async () => {
    await firstPrisma.characterItem.deleteMany();
    await firstPrisma.dailyAction.deleteMany();
    await firstPrisma.characterRemort.deleteMany();
    await firstPrisma.character.deleteMany();
    await firstPrisma.user.deleteMany();
    await seedCharacter(firstPrisma);
  });

  afterAll(async () => {
    await firstPrisma?.$disconnect();
    await secondPrisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("serializes Adventure claims that straddle a new offer bucket inside the rolling cooldown", async () => {
    const period = buildAdventurePeriod(new Date("2026-07-18T20:00:00.000Z"));
    const beforeBoundary = new Date(period.expiresAt.getTime() - 1_000);
    const afterBoundary = new Date(period.expiresAt.getTime() + 1_000);
    const nextPeriod = buildAdventurePeriod(afterBoundary);
    const firstLockAcquired = deferred<void>();
    const secondClaimStarted = deferred<void>();
    const firstClientWithLockBarrier = firstPrisma.$extends({
      query: {
        character: {
          async update({ args, query }) {
            const character = await query(args);
            firstLockAcquired.resolve();
            await secondClaimStarted.promise;
            return character;
          }
        }
      }
    }) as unknown as PrismaClient;
    const firstRepository = new PrismaDailyActionRepository(firstClientWithLockBarrier);
    const secondRepository = new PrismaDailyActionRepository(secondPrisma);
    const trackedAchievementEvents: AchievementEvent[] = [];
    const trackEventSafely = vi.fn((input: AchievementEvent) => {
      trackedAchievementEvents.push(input);
      return Promise.resolve([]);
    });
    const recordRewardEventsSafely = vi.fn().mockResolvedValue(undefined);
    const achievements = { trackEventSafely } as unknown as AchievementService;
    const activityEvents = { recordRewardEventsSafely } as unknown as PublicActivityEventPublisher;
    const claim = async (
      repository: PrismaDailyActionRepository,
      localDate: string,
      now: Date,
      onStart?: () => void
    ): Promise<ClaimDailyActionResult | null> => {
      onStart?.();
      const result = await repository.claimForTelegramUser(telegramUserId, {
        key: ADVENTURE_CHOICE_KEY,
        localDate,
        rewardXp: 7,
        rewardGold: 5,
        hpLoss: { requested: 4, effectiveHpMax: 28 },
        resultJson: { kind: "adventure-concurrency-regression" },
        itemGrants: [{ itemId, quantity: 2 }],
        rollingCooldown: { now, durationMs: ADVENTURE_CHOICE_COOLDOWN_MS }
      });

      if (result?.state === "created") {
        await trackRewardAchievementsSafely(achievements, {
          characterId: result.character.id,
          actorDisplayName: result.character.name,
          sourceId: result.action.id,
          sourceType: "daily-action",
          occurredAt: result.action.createdAt,
          levelChange: result.levelChange,
          itemGrants: result.itemGrants,
          events: ["adventure.choice.completed"],
          activityEvents
        });
      }

      return result;
    };

    expect(nextPeriod.storageKey).not.toBe(period.storageKey);
    const firstClaim = claim(firstRepository, period.storageKey, beforeBoundary);
    await firstLockAcquired.promise;
    const secondClaim = claim(
      secondRepository,
      nextPeriod.storageKey,
      afterBoundary,
      () => secondClaimStarted.resolve()
    );
    const [firstResult, secondResult] = await Promise.all([firstClaim, secondClaim]);

    expect(firstResult?.state).toBe("created");
    expect(secondResult?.state).toBe("existing");
    expect([firstResult, secondResult].filter((result) => result?.state === "created")).toHaveLength(1);
    if (firstResult?.state !== "created" || secondResult?.state !== "existing") {
      throw new Error("Expected one created Adventure claim and one canonical existing result.");
    }
    expect(secondResult.action.id).toBe(firstResult.action.id);
    expect(secondResult.availableAt).toEqual(
      new Date(beforeBoundary.getTime() + ADVENTURE_CHOICE_COOLDOWN_MS)
    );

    const adventureRows = await firstPrisma.dailyAction.findMany({
      where: { characterId, key: ADVENTURE_CHOICE_KEY }
    });
    expect(adventureRows).toHaveLength(1);
    expect(adventureRows[0]).toMatchObject({
      id: firstResult.action.id,
      localDate: period.storageKey,
      rewardXp: 7,
      rewardGold: 5,
      createdAt: beforeBoundary
    });
    expect(adventureRows[0]?.resultJson).toEqual({
      kind: "adventure-concurrency-regression",
      hp: { before: 20, max: 28, lost: 4, after: 16 },
      reward: { appliedItemGrants: [{ itemId, quantity: 2 }] }
    });
    const rewardedCharacter = await firstPrisma.character.findUnique({ where: { id: characterId } });
    expect(rewardedCharacter).toMatchObject({
      xp: 32,
      gold: 15,
      hpCurrent: 16,
      hpMax: 28
    });
    expect(rewardedCharacter?.hpRegenAt).toBeInstanceOf(Date);
    await expect(firstPrisma.characterItem.findUnique({
      where: { characterId_itemId: { characterId, itemId } }
    })).resolves.toMatchObject({ quantity: 2 });
    expect(recordRewardEventsSafely).toHaveBeenCalledTimes(1);
    expect(trackEventSafely).toHaveBeenCalledTimes(3);
    expect(trackedAchievementEvents.map((input) => input.type)).toEqual([
      "level.reached",
      "item.received",
      "adventure.choice.completed"
    ]);
    expect(trackedAchievementEvents.every((input) => input.sourceId === firstResult.action.id)).toBe(true);
  }, 30_000);
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function seedCharacter(prisma: PrismaClient): Promise<void> {
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      lastSeenLocationId: "location.korchma.main_hall"
    }
  });
  await prisma.character.create({
    data: {
      id: characterId,
      userId,
      name: "Мандрівник",
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 3,
      xp: 25,
      gold: 10,
      hpCurrent: 20,
      hpMax: 28,
      manaCurrent: 14,
      manaMax: 14,
      statsJson: {
        strength: 9,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    }
  });
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  const statements = [
    `CREATE TABLE "users" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "telegram_user_id" BIGINT NOT NULL UNIQUE,
      "username" TEXT,
      "display_name" TEXT,
      "language_code" TEXT,
      "last_action_at" DATETIME,
      "last_seen_location_id" TEXT,
      "current_raid_id" TEXT,
      "current_adventure_id" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "characters" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "user_id" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "pronoun" TEXT NOT NULL DEFAULT 'they',
      "path" TEXT NOT NULL DEFAULT 'boundary',
      "race_id" TEXT NOT NULL,
      "class_id" TEXT NOT NULL,
      "level" INTEGER NOT NULL DEFAULT 1,
      "xp" INTEGER NOT NULL DEFAULT 0,
      "gold" INTEGER NOT NULL DEFAULT 0,
      "hp_current" INTEGER NOT NULL DEFAULT 25,
      "hp_max" INTEGER NOT NULL DEFAULT 25,
      "mana_current" INTEGER NOT NULL DEFAULT 10,
      "mana_max" INTEGER NOT NULL DEFAULT 10,
      "hp_regen_at" DATETIME,
      "mana_regen_at" DATETIME,
      "active_cosmetic_title_grant_id" TEXT,
      "stats_json" JSONB NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE "character_remorts" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "character_id" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "remort_number" INTEGER NOT NULL,
      "previous_level" INTEGER NOT NULL,
      "previous_xp" INTEGER NOT NULL,
      "previous_gold" INTEGER NOT NULL,
      "display_name_snapshot" TEXT NOT NULL,
      "preserved_payload_json" JSONB NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_remorts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "character_remorts_character_id_remort_number_key" ON "character_remorts"("character_id", "remort_number")`,
    `CREATE TABLE "character_items" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL,
      "item_id" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL DEFAULT 1,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "character_items_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "character_items_character_id_item_id_key" ON "character_items"("character_id", "item_id")`,
    `CREATE TABLE "daily_actions" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "character_id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "local_date" TEXT NOT NULL,
      "reward_xp" INTEGER NOT NULL,
      "reward_gold" INTEGER NOT NULL,
      "spent_gold" INTEGER NOT NULL DEFAULT 0,
      "result_json" JSONB,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "daily_actions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX "daily_actions_character_id_key_local_date_key" ON "daily_actions"("character_id", "key", "local_date")`,
    `CREATE INDEX "daily_actions_character_id_key_created_at_idx" ON "daily_actions"("character_id", "key", "created_at")`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
