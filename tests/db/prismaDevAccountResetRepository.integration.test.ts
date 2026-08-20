import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaDevAccountResetRepository } from "../../src/db/repositories/prismaDevAccountResetRepository";

const RESET_TELEGRAM_ID = 65_001n;
const OTHER_TELEGRAM_ID = 65_002n;

describe("PrismaDevAccountResetRepository integration", () => {
  let directory: string;
  let prisma: PrismaClient;
  let repository: PrismaDevAccountResetRepository;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "kvestarnia-dev-account-reset-"));
    const databasePath = join(directory, "test.db").replace(/\\/g, "/");
    const databaseUrl = `file:${databasePath}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await createBaseSchema(prisma);
    await applySqlFile(prisma, "prisma/migrations/20260819090000_referral_foundation/migration.sql");
    repository = new PrismaDevAccountResetRepository(prisma);
  }, 70_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("atomically removes the User, Character, restrictive referral/guild rows, and related Chronicle evidence", async () => {
    const resetUser = await prisma.user.create({
      data: { id: "reset-user", telegramUserId: RESET_TELEGRAM_ID, displayName: "Стерти" }
    });
    const otherUser = await prisma.user.create({
      data: { id: "other-user", telegramUserId: OTHER_TELEGRAM_ID, displayName: "Лишити" }
    });
    const resetCharacter = await seedCharacter(prisma, resetUser.id, "reset-character", "Стерти");
    const otherCharacter = await seedCharacter(prisma, otherUser.id, "other-character", "Лишити");
    const code = await prisma.referralInviteCode.create({
      data: {
        id: "reset-code",
        inviterUserId: resetUser.id,
        token: "abCD_123-xyZ7890",
        inviterNameSnapshot: resetCharacter.name
      }
    });
    const attribution = await prisma.referralAttribution.create({
      data: {
        id: "reset-attribution",
        inviterUserId: resetUser.id,
        inviteeUserId: otherUser.id,
        inviteCodeId: code.id,
        status: "ACCEPTED",
        capturedAt: new Date("2026-08-20T07:00:00.000Z"),
        acceptedAt: new Date("2026-08-20T07:01:00.000Z"),
        arrivedAt: new Date("2026-08-20T07:02:00.000Z"),
        arrivedCharacterId: otherCharacter.id,
        inviteeNameSnapshot: otherCharacter.name,
        rewardPlanVersion: 1
      }
    });
    const reward = await prisma.referralReward.create({
      data: {
        id: "reset-reward",
        attributionId: attribution.id,
        beneficiaryUserId: resetUser.id,
        rewardFamily: "DIRECT_INVITEE_LEVEL",
        milestoneKey: "LEVEL_3",
        sourceAchievementId: "achievement.level.3",
        rewardPlanVersion: 1,
        rewardGold: 50,
        rewardItemsJson: [],
        state: "PENDING",
        earnedAt: new Date("2026-08-20T07:03:00.000Z"),
        nextAttemptAt: new Date("2026-08-20T07:03:00.000Z")
      }
    });
    await prisma.referralNotificationOutbox.createMany({
      data: [
        {
          id: "reset-join-outbox",
          logicalKey: `REFERRAL_JOINED:${attribution.id}`,
          kind: "REFERRAL_JOINED",
          recipientUserId: resetUser.id,
          payloadJson: {},
          nextAttemptAt: new Date("2026-08-20T07:02:00.000Z")
        },
        {
          id: "reset-payout-outbox",
          logicalKey: `REFERRAL_PAYOUT_GRANTED:${reward.id}`,
          kind: "REFERRAL_PAYOUT_GRANTED",
          recipientUserId: resetUser.id,
          payloadJson: {},
          nextAttemptAt: new Date("2026-08-20T07:03:00.000Z")
        }
      ]
    });
    const guild = await prisma.guild.create({
      data: {
        id: "reset-guild",
        normalizedName: "стерта",
        displayName: "Стерта",
        crest: "🕳️",
        description: "Локальна",
        founderUserId: resetUser.id,
        leaderUserId: resetUser.id,
        status: "active",
        charterExpiresAt: new Date("2030-08-20T07:00:00.000Z"),
        members: {
          create: [
            {
              id: "reset-member",
              userId: resetUser.id,
              activeUserKey: resetUser.id,
              role: "leader",
              joinedAt: new Date("2026-08-20T07:00:00.000Z")
            },
            {
              id: "other-member",
              userId: otherUser.id,
              activeUserKey: otherUser.id,
              role: "member",
              joinedAt: new Date("2026-08-20T07:01:00.000Z")
            }
          ]
        }
      }
    });
    const otherGuild = await prisma.guild.create({
      data: {
        id: "other-guild",
        normalizedName: "залишена",
        displayName: "Залишена",
        crest: "🧷",
        description: "Інша локальна",
        founderUserId: otherUser.id,
        leaderUserId: otherUser.id,
        status: "active",
        charterExpiresAt: new Date("2030-08-20T07:00:00.000Z")
      }
    });
    await prisma.guildAudit.create({
      data: {
        id: "reset-subject-audit",
        guildId: otherGuild.id,
        eventType: "member.joined",
        actorUserId: otherUser.id,
        subjectUserId: resetUser.id,
        dedupeKey: "reset-subject-audit",
        occurredAt: new Date("2026-08-20T07:01:00.000Z")
      }
    });
    await prisma.activityEvent.createMany({
      data: [
        {
          id: "reset-character-event",
          eventType: "character.created",
          category: "adventurer",
          severity: "normal",
          actorCharacterId: resetCharacter.id,
          actorDisplayName: resetCharacter.name,
          sourceType: "character",
          sourceId: resetCharacter.id,
          dedupeKey: `character.created:${resetCharacter.id}`,
          occurredAt: new Date("2026-08-20T07:00:00.000Z")
        },
        {
          id: "reset-referral-event",
          eventType: "referral.arrived",
          category: "adventurer",
          severity: "normal",
          actorCharacterId: otherCharacter.id,
          actorDisplayName: otherCharacter.name,
          subjectKind: "referral-inviter",
          subjectId: resetUser.id,
          subjectName: resetCharacter.name,
          sourceType: "referral-attribution",
          sourceId: attribution.id,
          dedupeKey: `character.created:${otherCharacter.id}`,
          occurredAt: new Date("2026-08-20T07:02:00.000Z")
        },
        {
          id: "unrelated-event",
          eventType: "character.level_reached",
          category: "progression",
          severity: "normal",
          actorCharacterId: otherCharacter.id,
          actorDisplayName: otherCharacter.name,
          sourceType: "test",
          sourceId: "unrelated",
          dedupeKey: "unrelated-event",
          occurredAt: new Date("2026-08-20T07:04:00.000Z")
        }
      ]
    });
    await prisma.playerHintReceipt.create({
      data: {
        id: "reset-hint",
        telegramUserId: RESET_TELEGRAM_ID,
        key: "onboarding.example",
        shownAt: new Date("2026-08-20T07:05:00.000Z")
      }
    });

    await expect(repository.deleteEverythingByTelegramUserId(RESET_TELEGRAM_ID)).resolves.toBe(true);
    await expect(repository.deleteEverythingByTelegramUserId(RESET_TELEGRAM_ID)).resolves.toBe(false);

    await expect(prisma.user.findUnique({ where: { telegramUserId: RESET_TELEGRAM_ID } })).resolves.toBeNull();
    await expect(prisma.character.findUnique({ where: { id: resetCharacter.id } })).resolves.toBeNull();
    await expect(prisma.referralInviteCode.count()).resolves.toBe(0);
    await expect(prisma.referralAttribution.count()).resolves.toBe(0);
    await expect(prisma.referralReward.count()).resolves.toBe(0);
    await expect(prisma.referralNotificationOutbox.count()).resolves.toBe(0);
    await expect(prisma.guild.findUnique({ where: { id: guild.id } })).resolves.toBeNull();
    await expect(prisma.guild.findUnique({ where: { id: otherGuild.id } })).resolves.toMatchObject({
      displayName: "Залишена"
    });
    await expect(prisma.guildAudit.count()).resolves.toBe(0);
    await expect(prisma.activityEvent.findMany({ select: { id: true } })).resolves.toEqual([
      { id: "unrelated-event" }
    ]);
    await expect(prisma.playerHintReceipt.count({
      where: { telegramUserId: RESET_TELEGRAM_ID }
    })).resolves.toBe(0);
    await expect(prisma.user.findUnique({ where: { telegramUserId: OTHER_TELEGRAM_ID } }))
      .resolves.toMatchObject({ id: otherUser.id });
    await expect(prisma.character.findUnique({ where: { id: otherCharacter.id } }))
      .resolves.toMatchObject({ name: otherCharacter.name });

    const recreated = await prisma.user.create({
      data: { telegramUserId: RESET_TELEGRAM_ID, displayName: "З нуля" }
    });
    expect(recreated.id).not.toBe(resetUser.id);
    await expect(prisma.character.count({ where: { userId: recreated.id } })).resolves.toBe(0);
    await expect(prisma.referralAttribution.count({
      where: { OR: [{ inviterUserId: recreated.id }, { inviteeUserId: recreated.id }] }
    })).resolves.toBe(0);
  }, 30_000);
});

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  characterId: string,
  name: string
) {
  return prisma.character.create({
    data: {
      id: characterId,
      userId,
      name,
      raceId: "race.human-ish",
      classId: "class.warrior",
      statsJson: { strength: 5, dexterity: 5, intelligence: 5, charisma: 5, luck: 5 }
    }
  });
}

async function createBaseSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL UNIQUE, username TEXT,
      display_name TEXT, language_code TEXT, last_action_at DATETIME, last_seen_location_id TEXT,
      current_raid_id TEXT, current_adventure_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      pronoun TEXT NOT NULL DEFAULT 'they', path TEXT NOT NULL DEFAULT 'boundary',
      race_id TEXT NOT NULL, class_id TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0, gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25, hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10, mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME, mana_regen_at DATETIME, active_cosmetic_title_grant_id TEXT,
      stats_json JSONB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE activity_events (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'public', actor_character_id TEXT, actor_display_name TEXT,
      related_character_ids_json JSONB, subject_kind TEXT, subject_id TEXT, subject_name TEXT,
      source_type TEXT, source_id TEXT, dedupe_key TEXT UNIQUE, payload_json JSONB,
      occurred_at DATETIME NOT NULL, published_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE guilds (
      id TEXT PRIMARY KEY, normalized_name TEXT NOT NULL, reservation_key TEXT UNIQUE,
      display_name TEXT NOT NULL, crest TEXT NOT NULL, crest_kind TEXT NOT NULL DEFAULT 'catalog',
      crest_reservation_key TEXT UNIQUE, crest_file_id TEXT, crest_file_unique_id TEXT,
      crest_width INTEGER, crest_height INTEGER, crest_file_size INTEGER,
      description TEXT NOT NULL, founder_user_id TEXT NOT NULL, leader_user_id TEXT NOT NULL,
      leadership_nominee_user_id TEXT, leadership_offered_at DATETIME,
      status TEXT NOT NULL DEFAULT 'forming', version INTEGER NOT NULL DEFAULT 1,
      charter_expires_at DATETIME NOT NULL, activated_at DATETIME, activated_by_invite_id TEXT,
      disbanded_at DATETIME, name_release_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (founder_user_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (leadership_nominee_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE guild_members (
      id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      active_user_key TEXT UNIQUE, role TEXT NOT NULL DEFAULT 'member', joined_at DATETIME NOT NULL,
      left_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE guild_audits (
      id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, event_type TEXT NOT NULL,
      actor_user_id TEXT, subject_user_id TEXT, dedupe_key TEXT NOT NULL UNIQUE,
      payload_json JSONB, occurred_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE player_hint_receipts (
      id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL, key TEXT NOT NULL,
      shown_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (telegram_user_id, key)
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function applySqlFile(prisma: PrismaClient, path: string): Promise<void> {
  const sql = await readFile(resolve(path), "utf8");
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}
