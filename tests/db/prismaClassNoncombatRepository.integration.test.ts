import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClassNoncombatRepository } from "../../src/db/repositories/prismaClassNoncombatRepository";

const now = new Date("2026-07-03T09:00:00.000Z");
const cooldownAvailableAt = new Date("2026-07-03T10:33:00.000Z");

describe("PrismaClassNoncombatRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaClassNoncombatRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-class-noncombat-"));
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${join(dir, "test.db").replace(/\\/g, "/")}`
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaClassNoncombatRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.noncombatRoguePickpocketAttempt.deleteMany();
    await prisma.noncombatPriestAidAction.deleteMany();
    await prisma.noncombatPriestBlessing.deleteMany();
    await prisma.characterCooldown.deleteMany();
    await prisma.activeCombatLease.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("moves Rogue pickpocket gold atomically and replays duplicate callbacks without rerolling", async () => {
    await seedCharacter({ telegramUserId: 101n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 102n, userId: "user-target", characterId: "target", level: 5, gold: 8 });

    const first = await repository.completeRoguePickpocket(101n, rogueInput({
      outcome: "clean-success",
      stolenGold: 5
    }));
    const replay = await repository.completeRoguePickpocket(101n, rogueInput({
      outcome: "caught-badly",
      stolenGold: 13
    }));

    expect(first).toMatchObject({ state: "completed", created: true });
    expect(replay).toMatchObject({
      state: "completed",
      created: false,
      attempt: { outcome: "clean-success", stolenGold: 5 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({
      gold: 6,
      hpCurrent: 20
    });
    await expect(prisma.character.findUnique({ where: { id: "target" } })).resolves.toMatchObject({
      gold: 3
    });
    await expect(prisma.noncombatRoguePickpocketAttempt.count()).resolves.toBe(1);
  });

  it("lists only exact normalized same-location noncombat targets", async () => {
    await seedCharacter({ telegramUserId: 401n, userId: "user-priest", characterId: "priest", classId: "class.priest", level: 3, locationId: "location.korchma.front" });
    await seedCharacter({ telegramUserId: 402n, userId: "user-hall", characterId: "hall-target", level: 3, locationId: "location.korchma.hall" });
    await seedCharacter({ telegramUserId: 403n, userId: "user-tavern", characterId: "tavern-target", level: 3, locationId: "location.tavern" });

    const front = await repository.getSnapshotForTelegramUser(401n, snapshotInput());

    expect(front?.targets.map((target) => target.telegramUserId)).toEqual([]);

    await prisma.user.update({
      where: { telegramUserId: 401n },
      data: { lastSeenLocationId: "location.korchma.hall" }
    });

    const hall = await repository.getSnapshotForTelegramUser(401n, snapshotInput());

    expect(hall?.targets.map((target) => target.telegramUserId).sort()).toEqual([402n, 403n]);
  });

  it("returns bounded target-page metadata for class noncombat target lists", async () => {
    await seedCharacter({ telegramUserId: 801n, userId: "user-priest", characterId: "priest", classId: "class.priest", level: 3 });
    for (let index = 0; index < 6; index += 1) {
      await seedCharacter({
        telegramUserId: BigInt(802 + index),
        userId: `user-target-${index}`,
        characterId: `target-${index}`,
        level: 3
      });
    }

    const snapshot = await repository.getSnapshotForTelegramUser(801n, {
      ...snapshotInput(),
      page: 9,
      pageSize: 5
    });

    expect(snapshot).toMatchObject({
      targetPage: 1,
      targetTotalPages: 2
    });
    expect(snapshot?.targets).toHaveLength(1);
  });

  it("hides same-day Rogue attempted targets from filtered target snapshots", async () => {
    await seedCharacter({ telegramUserId: 901n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 902n, userId: "user-target", characterId: "target", level: 5, gold: 8 });
    await seedCharacter({ telegramUserId: 903n, userId: "user-bystander", characterId: "bystander", level: 5, gold: 8 });

    await repository.completeRoguePickpocket(901n, rogueInput({
      targetTelegramUserId: 902n,
      outcome: "clean-success",
      stolenGold: 1
    }));

    const filtered = await repository.getSnapshotForTelegramUser(901n, {
      ...snapshotInput(),
      excludeRogueAttemptedLocalDate: "2026-07-03"
    });
    const unfiltered = await repository.getSnapshotForTelegramUser(901n, snapshotInput());

    expect(filtered?.targets.map((target) => target.telegramUserId)).toEqual([903n]);
    expect(unfiltered?.targets.map((target) => target.telegramUserId).sort()).toEqual([902n, 903n]);
  });

  it("stores active Priest blessing for hero display and spends mana", async () => {
    await seedCharacter({
      telegramUserId: 701n,
      userId: "user-priest",
      characterId: "priest",
      classId: "class.priest",
      level: 3,
      manaCurrent: 20,
      manaRegenAt: new Date("2026-07-03T08:00:00.000Z")
    });

    const result = await repository.completePriestBlessing(701n, priestBlessInput({
      targetTelegramUserId: null,
      expiresAt: new Date("2026-07-03T09:13:00.000Z")
    }));
    const active = await repository.getActivePriestBlessingForTelegramUser(701n, now);

    expect(result).toMatchObject({
      state: "completed",
      actor: { manaCurrent: 13 },
      target: { manaCurrent: 13 },
      blessing: {
        actorName: "priest",
        targetName: "priest",
        expiresAt: new Date("2026-07-03T09:13:00.000Z"),
        bonusStat: "luck",
        bonusAmount: 1
      }
    });
    expect(active).toMatchObject({
      actorName: "priest",
      targetName: "priest",
      expiresAt: new Date("2026-07-03T09:13:00.000Z"),
      bonusStat: "luck",
      bonusAmount: 1
    });
    await expect(prisma.character.findUnique({ where: { id: "priest" } })).resolves.toMatchObject({
      manaCurrent: 13,
      manaRegenAt: now
    });
  });

  it("heals Priest targets up to the effective HP max instead of the stored base max", async () => {
    await seedCharacter({
      telegramUserId: 711n,
      userId: "user-priest",
      characterId: "priest",
      classId: "class.priest",
      level: 4,
      hpCurrent: 16,
      manaCurrent: 20,
      manaRegenAt: new Date("2026-07-03T08:00:00.000Z")
    });

    const result = await repository.completePriestHeal(711n, priestHealInput({
      targetTelegramUserId: null,
      healAmount: 10,
      targetEffectiveHpMax: 32,
      manaCost: 10
    }));

    expect(result).toMatchObject({
      state: "completed",
      action: {
        healAmount: 10,
        manaCost: 10
      },
      actor: {
        hpCurrent: 26,
        manaCurrent: 10
      },
      target: {
        hpCurrent: 26
      }
    });
    await expect(prisma.character.findUnique({ where: { id: "priest" } })).resolves.toMatchObject({
      hpCurrent: 26,
      hpMax: 20,
      manaCurrent: 10,
      manaRegenAt: now
    });
    await expect(prisma.characterCooldown.findMany({
      where: { characterId: "priest" },
      select: { key: true }
    })).resolves.toEqual([]);
  });

  it("replays Rogue same-day duplicate even after live location gates drift", async () => {
    await seedCharacter({ telegramUserId: 501n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 502n, userId: "user-target", characterId: "target", level: 5, gold: 8 });

    const first = await repository.completeRoguePickpocket(501n, rogueInput({
      targetTelegramUserId: 502n,
      outcome: "clean-success",
      stolenGold: 5
    }));
    await prisma.user.update({
      where: { telegramUserId: 502n },
      data: { lastSeenLocationId: "location.korchma.hall" }
    });
    const replay = await repository.completeRoguePickpocket(501n, rogueInput({
      targetTelegramUserId: 502n,
      outcome: "caught-badly",
      stolenGold: 13
    }));

    expect(first).toMatchObject({ state: "completed", created: true });
    expect(replay).toMatchObject({
      state: "completed",
      created: false,
      attempt: { outcome: "clean-success", stolenGold: 5 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({
      gold: 6,
      hpCurrent: 20
    });
    await expect(prisma.character.findUnique({ where: { id: "target" } })).resolves.toMatchObject({
      gold: 3
    });
    await expect(prisma.noncombatRoguePickpocketAttempt.count()).resolves.toBe(1);
  });

  it("caps theft by target balance without creating gold", async () => {
    await seedCharacter({ telegramUserId: 601n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 602n, userId: "user-target", characterId: "target", level: 5, gold: 3 });

    const result = await repository.completeRoguePickpocket(601n, rogueInput({
      targetTelegramUserId: 602n,
      outcome: "clean-success",
      stolenGold: 13
    }));

    expect(result).toMatchObject({
      state: "completed",
      attempt: { outcome: "clean-success", stolenGold: 3 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({ gold: 4 });
    await expect(prisma.character.findUnique({ where: { id: "target" } })).resolves.toMatchObject({ gold: 0 });
  });

  it("caps theft by target balance and stores empty outcome when no gold is available", async () => {
    await seedCharacter({ telegramUserId: 201n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 202n, userId: "user-target", characterId: "target", level: 5, gold: 0 });

    const result = await repository.completeRoguePickpocket(201n, rogueInput({
      targetTelegramUserId: 202n,
      outcome: "clean-success",
      stolenGold: 13
    }));

    expect(result).toMatchObject({
      state: "completed",
      attempt: { outcome: "empty", stolenGold: 0 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({ gold: 1 });
    await expect(prisma.character.findUnique({ where: { id: "target" } })).resolves.toMatchObject({ gold: 0 });
  });

  it("caught badly sets Rogue HP to 0 and only records the normal pickpocket cooldown", async () => {
    await seedCharacter({ telegramUserId: 301n, userId: "user-rogue", characterId: "rogue", classId: "class.rogue", level: 5, gold: 1 });
    await seedCharacter({ telegramUserId: 302n, userId: "user-target", characterId: "target", level: 5, gold: 8 });

    const result = await repository.completeRoguePickpocket(301n, rogueInput({
      targetTelegramUserId: 302n,
      outcome: "caught-badly",
      stolenGold: 0
    }));

    expect(result).toMatchObject({
      state: "completed",
      attempt: { outcome: "caught-badly", actorHpAfter: 0 }
    });
    await expect(prisma.character.findUnique({ where: { id: "rogue" } })).resolves.toMatchObject({
      hpCurrent: 0
    });
    await expect(prisma.characterCooldown.findMany({
      where: { characterId: "rogue" },
      select: { key: true, availableAt: true }
    })).resolves.toEqual([
      { key: "noncombat.rogue.pickpocket", availableAt: cooldownAvailableAt }
    ]);
  });
});

function priestBlessInput(overrides: {
  targetTelegramUserId?: bigint | null;
  expiresAt: Date;
}) {
  return {
    targetTelegramUserId: overrides.targetTelegramUserId ?? null,
    expectedActorRemortCount: 0,
    expectedTargetRemortCount: 0,
    activeSince: new Date("2026-07-03T08:55:00.000Z"),
    now,
    expiresAt: overrides.expiresAt,
    cooldownAvailableAt,
    manaCost: 7,
    statSnapshot: { test: true }
  };
}

function priestHealInput(overrides: {
  targetTelegramUserId?: bigint | null;
  healAmount: number;
  targetEffectiveHpMax: number;
  manaCost: number;
}) {
  return {
    targetTelegramUserId: overrides.targetTelegramUserId ?? null,
    expectedActorRemortCount: 0,
    expectedTargetRemortCount: 0,
    activeSince: new Date("2026-07-03T08:55:00.000Z"),
    now,
    healAmount: overrides.healAmount,
    targetEffectiveHpMax: overrides.targetEffectiveHpMax,
    manaCost: overrides.manaCost,
    statSnapshot: { test: true }
  };
}

function rogueInput(overrides: {
  targetTelegramUserId?: bigint;
  outcome: "clean-success" | "noticed-success" | "empty" | "noticed-failure" | "caught-badly";
  stolenGold: number;
}) {
  return {
    targetTelegramUserId: overrides.targetTelegramUserId ?? 102n,
    expectedActorRemortCount: 0,
    expectedTargetRemortCount: 0,
    activeSince: new Date("2026-07-03T08:55:00.000Z"),
    now,
    localDate: "2026-07-03",
    cooldownAvailableAt,
    outcome: overrides.outcome,
    stolenGold: overrides.stolenGold,
    statSnapshot: { test: true }
  };
}

function snapshotInput() {
  return {
    activeSince: new Date("2026-07-03T08:55:00.000Z"),
    page: 0,
    pageSize: 10,
    now
  };
}

async function seedCharacter(input: {
  telegramUserId: bigint;
  userId: string;
  characterId: string;
  classId?: string;
  level?: number;
  gold?: number;
  locationId?: string;
  hpCurrent?: number;
  manaCurrent?: number;
  manaRegenAt?: Date | null;
}): Promise<void> {
  await prismaGlobal().user.create({
    data: {
      id: input.userId,
      telegramUserId: input.telegramUserId,
      displayName: input.characterId,
      lastActionAt: now,
      lastSeenLocationId: input.locationId ?? "location.korchma.front",
      currentRaidId: null,
      currentAdventureId: null
    }
  });
  await prismaGlobal().character.create({
    data: {
      id: input.characterId,
      userId: input.userId,
      name: input.characterId,
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: input.classId ?? "class.warrior",
      level: input.level ?? 3,
      xp: 25,
      gold: input.gold ?? 0,
      hpCurrent: input.hpCurrent ?? 20,
      hpMax: 20,
      manaCurrent: input.manaCurrent ?? 20,
      manaMax: 20,
      manaRegenAt: input.manaRegenAt,
      statsJson: { dexterity: 10, luck: 8, charisma: 8, intelligence: 8 }
    }
  });
}

let prismaForSeeds: PrismaClient | null = null;

function prismaGlobal(): PrismaClient {
  if (!prismaForSeeds) {
    throw new Error("Prisma test client is not ready.");
  }
  return prismaForSeeds;
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  prismaForSeeds = prisma;
  const statements = [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      telegram_user_id BIGINT NOT NULL UNIQUE,
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
      id TEXT PRIMARY KEY NOT NULL,
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
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
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
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE noncombat_priest_aid_actions (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      actor_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      actor_telegram_user_id BIGINT NOT NULL,
      target_telegram_user_id BIGINT NOT NULL,
      actor_name TEXT NOT NULL,
      target_name TEXT NOT NULL,
      actor_remort_count INTEGER NOT NULL DEFAULT 0,
      target_remort_count INTEGER NOT NULL DEFAULT 0,
      action_kind TEXT NOT NULL,
      technique_id TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      location_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      heal_amount INTEGER NOT NULL DEFAULT 0,
      mana_cost INTEGER NOT NULL DEFAULT 0,
      blessing_id TEXT,
      result_json JSONB,
      cooldown_available_at DATETIME NOT NULL,
      completed_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE noncombat_priest_blessings (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      actor_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      actor_telegram_user_id BIGINT NOT NULL,
      target_telegram_user_id BIGINT NOT NULL,
      actor_name TEXT NOT NULL,
      target_name TEXT NOT NULL,
      actor_remort_count INTEGER NOT NULL DEFAULT 0,
      target_remort_count INTEGER NOT NULL DEFAULT 0,
      technique_id TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      location_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      active_guard TEXT,
      bonus_stat TEXT,
      bonus_amount INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      started_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      ended_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE noncombat_rogue_pickpocket_attempts (
      id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      actor_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      actor_telegram_user_id BIGINT NOT NULL,
      target_telegram_user_id BIGINT NOT NULL,
      actor_name TEXT NOT NULL,
      target_name TEXT NOT NULL,
      actor_remort_count INTEGER NOT NULL DEFAULT 0,
      target_remort_count INTEGER NOT NULL DEFAULT 0,
      technique_id TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      location_id TEXT NOT NULL,
      local_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      outcome TEXT NOT NULL,
      stolen_gold INTEGER NOT NULL DEFAULT 0,
      actor_hp_after INTEGER,
      stat_snapshot_json JSONB NOT NULL,
      result_json JSONB,
      cooldown_available_at DATETIME NOT NULL,
      completed_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`,
    `CREATE UNIQUE INDEX noncombat_priest_blessings_active_guard_key ON noncombat_priest_blessings(active_guard)`,
    `CREATE UNIQUE INDEX noncombat_rogue_pickpocket_attempts_actor_character_id_target_character_id_local_date_key
      ON noncombat_rogue_pickpocket_attempts(actor_character_id, target_character_id, local_date)`
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
