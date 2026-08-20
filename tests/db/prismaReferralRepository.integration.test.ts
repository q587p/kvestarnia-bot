import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaReferralRepository } from "../../src/db/repositories/prismaReferralRepository";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { recordLevelMilestones } from "../../src/db/repositories/levelMilestoneRepository";
import type { CharacterRepository } from "../../src/db/repositories/characterRepository";
import { ReferralService } from "../../src/services/referralService";
import { PrismaActivityEventRepository } from "../../src/db/repositories/prismaActivityEventRepository";
import { ActivityEventService } from "../../src/services/activityEventService";
import { PublicActivityEventPublisher } from "../../src/services/publicActivityEventPublisher";
import { createReferralScheduler } from "../../src/bot/referralScheduler";
import type { Bot } from "grammy";
import { AchievementService } from "../../src/services/achievementService";
import { PrismaAchievementRepository } from "../../src/db/repositories/prismaAchievementRepository";

const MIGRATION = "20260819090000_referral_foundation";
const ACHIEVEMENT_NOTIFICATION_MIGRATION = "20260820131500_referral_achievement_notifications";
const NOW = new Date("2026-08-19T09:00:00.000Z");
const RECOVERY_NOW = new Date("2030-08-19T09:00:00.000Z");
const INVITER_ID = 64_001n;
const INVITEE_ID = 64_002n;
const TOKEN = "abCD_123-xyZ7890";

describe("PrismaReferralRepository integration", () => {
  let directory: string;
  let prisma: PrismaClient;
  let repository: PrismaReferralRepository;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "kvestarnia-referral-repo-"));
    prisma = new PrismaClient({
      datasources: { db: { url: `file:${join(directory, "test.db").replace(/\\/g, "/")}` } }
    });
    await createBaseSchema(prisma);
    await applySqlFile(prisma, "prisma/migrations/20260628090000_add_achievements/migration.sql");
    await applySqlFile(prisma, `prisma/migrations/${MIGRATION}/migration.sql`);
    await applySqlFile(
      prisma,
      `prisma/migrations/${ACHIEVEMENT_NOTIFICATION_MIGRATION}/migration.sql`
    );
    repository = new PrismaReferralRepository(prisma);
    await seedCharacter(prisma, "inviter-user", "inviter-character", INVITER_ID, "Кличко");
    await prisma.character.update({
      where: { id: "inviter-character" },
      data: { activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk" }
    });
    await prisma.guild.create({
      data: {
        id: "inviter-guild",
        normalizedName: "лускаті рахівники",
        displayName: "Лускаті рахівники",
        crest: "🐉",
        description: "Рахують луску й пригоди.",
        founderUserId: "inviter-user",
        leaderUserId: "inviter-user",
        status: "active",
        charterExpiresAt: new Date("2030-08-19T09:00:00.000Z"),
        members: {
          create: {
            id: "inviter-guild-member",
            userId: "inviter-user",
            activeUserKey: "inviter-user",
            role: "leader",
            joinedAt: NOW
          }
        }
      }
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("captures and accepts only a fresh User atomically without rebinding", async () => {
    await expect(repository.getOrCreateInviteCode(INVITER_ID, TOKEN, "Кличко"))
      .resolves.toMatchObject({ state: "ready", token: TOKEN });
    const projectedDashboard = await repository.getDashboard(INVITER_ID, NOW);
    expect(projectedDashboard).toMatchObject({
      inviterIdentity: {
        name: "Кличко",
        activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk",
        guildCrest: "🐉"
      }
    });
    expect(projectedDashboard?.inviterIdentity).not.toHaveProperty("guildName");

    await expect(repository.captureFreshReferral({
      telegramUserId: INVITEE_ID,
      username: "private-profile",
      displayName: "Нова гравчиня",
      languageCode: "uk"
    }, TOKEN, NOW, true, 1)).resolves.toEqual({ state: "captured" });
    await expect(prisma.user.count({ where: { telegramUserId: INVITEE_ID } })).resolves.toBe(1);
    await expect(prisma.referralAttribution.findFirstOrThrow({
      where: { inviteeUser: { telegramUserId: INVITEE_ID } },
      select: { status: true, acceptedAt: true, rewardPlanVersion: true }
    })).resolves.toEqual({ status: "ACCEPTED", acceptedAt: NOW, rewardPlanVersion: 1 });

    await seedCharacter(prisma, "other-user", "other-character", 64_003n, "Інший");
    await repository.getOrCreateInviteCode(64_003n, "ZYXW_987-vut6543", "Інший");
    await expect(repository.captureFreshReferral({ telegramUserId: INVITEE_ID }, "ZYXW_987-vut6543", NOW, true, 1))
      .resolves.toEqual({ state: "accepted" });
    const invitee = await prisma.user.findUniqueOrThrow({ where: { telegramUserId: INVITEE_ID } });
    await expect(prisma.referralAttribution.findUniqueOrThrow({
      where: { inviteeUserId: invitee.id },
      select: { inviterUserId: true }
    })).resolves.toEqual({ inviterUserId: "inviter-user" });
    await expect(repository.resolvePendingReferral(INVITEE_ID, NOW, 1, true))
      .resolves.toEqual({ state: "already-accepted" });
  });

  it("leaves exhausted fresh capture eligibility untouched and classifies a real concurrent User", async () => {
    const freshTelegramId = 64_004n;
    const conflict = new Prisma.PrismaClientKnownRequestError("write conflict", {
      code: "P2034",
      clientVersion: Prisma.prismaVersion.client
    });
    const failingPrisma = {
      $transaction: vi.fn().mockRejectedValue(conflict),
      user: prisma.user
    } as unknown as PrismaClient;
    const failingRepository = new PrismaReferralRepository(failingPrisma);

    await expect(failingRepository.captureFreshReferral(
      { telegramUserId: freshTelegramId, displayName: "Повторна" }, TOKEN, NOW, true, 1
    )).resolves.toEqual({ state: "retry" });
    await expect(prisma.user.count({ where: { telegramUserId: freshTelegramId } })).resolves.toBe(0);
    await expect(prisma.referralAttribution.count({
      where: { inviteeUser: { telegramUserId: freshTelegramId } }
    })).resolves.toBe(0);

    await expect(repository.captureFreshReferral(
      { telegramUserId: freshTelegramId, displayName: "Повторна" }, TOKEN, NOW, true, 1
    )).resolves.toMatchObject({ state: "captured" });
    await expect(prisma.user.count({ where: { telegramUserId: freshTelegramId } })).resolves.toBe(1);
    await expect(prisma.referralAttribution.count({
      where: { inviteeUser: { telegramUserId: freshTelegramId } }
    })).resolves.toBe(1);

    const concurrentTelegramId = 64_005n;
    await prisma.user.create({ data: { telegramUserId: concurrentTelegramId, displayName: "Паралельна" } });
    await expect(failingRepository.captureFreshReferral(
      { telegramUserId: concurrentTelegramId }, TOKEN, NOW, true, 1
    )).resolves.toEqual({ state: "existing-user" });
  });

  it("records a 1-to-13 jump, grants complete bundles once under replay, and survives service recreation", async () => {
    const created = await new PrismaCharacterRepository(prisma).createForTelegramUserIfMissing(
      { telegramUserId: INVITEE_ID, displayName: "Прибула" },
      makeCharacterInput("Прибула")
    );
    expect(created).toMatchObject({
      created: true,
      referralArrival: {
        inviterUserId: "inviter-user",
        inviterNameSnapshot: "Кличко",
        inviteeNameSnapshot: "Прибула"
      }
    });
    const failedPublisher = new PublicActivityEventPublisher(new ActivityEventService({
      record: vi.fn().mockRejectedValue(new Error("first ActivityEvent write failed")),
      listRecent: vi.fn()
    }));
    await expect(failedPublisher.recordReferralArrivedSafely({
      characterId: created.character.id,
      inviteeDisplayName: created.referralArrival!.inviteeNameSnapshot,
      inviterUserId: created.referralArrival!.inviterUserId,
      inviterDisplayName: created.referralArrival!.inviterNameSnapshot,
      attributionId: created.referralArrival!.attributionId,
      occurredAt: created.referralArrival!.arrivedAt
    })).resolves.toBeNull();
    await expect(prisma.activityEvent.count()).resolves.toBe(0);

    const publisher = new PublicActivityEventPublisher(new ActivityEventService(
      new PrismaActivityEventRepository(prisma)
    ));
    const chronicleService = makeService(new PrismaReferralRepository(prisma), publisher);
    await expect(chronicleService.reconcileArrivalChronicles()).resolves.toEqual({ due: 1, recorded: 1 });
    await expect(makeService(new PrismaReferralRepository(prisma), publisher).reconcileArrivalChronicles())
      .resolves.toEqual({ due: 0, recorded: 0 });
    await expect(prisma.activityEvent.findMany()).resolves.toEqual([
      expect.objectContaining({
        eventType: "referral.arrived",
        category: "adventurer",
        severity: "normal",
        actorCharacterId: created.character.id,
        actorDisplayName: "Прибула",
        subjectKind: "referral-inviter",
        subjectId: "inviter-user",
        subjectName: "Кличко",
        sourceType: "referral-attribution",
        dedupeKey: `character.created:${created.character.id}`,
        occurredAt: created.referralArrival!.arrivedAt
      })
    ]);
    await expect(prisma.activityEvent.count({ where: { eventType: "character.created" } })).resolves.toBe(0);
    const inviteeUserId = created.character.userId;
    const attribution = await prisma.referralAttribution.findUniqueOrThrow({
      where: { inviteeUserId }
    });
    await prisma.$transaction(async (tx) => {
      await tx.character.update({ where: { id: created.character.id }, data: { level: 13 } });
      await recordLevelMilestones(tx, created.character.id, 1, 13, NOW);
    });
    await expect(prisma.referralNotificationOutbox.count({
      where: { logicalKey: `REFERRAL_JOINED:${attribution.id}` }
    })).resolves.toBe(1);

    await expect(prisma.referralReward.findMany({ orderBy: { milestoneKey: "asc" } }))
      .resolves.toHaveLength(4);
    await prisma.character.delete({ where: { id: "inviter-character" } });
    await expect(repository.getDashboard(INVITER_ID)).resolves.toMatchObject({
      token: TOKEN,
      hasCharacter: false,
      pendingStageTotal: 4
    });
    await expect(makeService(repository).reconcileForTelegramUser(INVITER_ID))
      .resolves.toEqual({ granted: 0, pending: 4 });
    await seedCharacter(prisma, "inviter-user", "inviter-remort-character", INVITER_ID, "Кличко Знову");

    const firstReward = await prisma.referralReward.findFirstOrThrow({ where: { milestoneKey: "LEVEL_3" } });
    const raced = await Promise.all([
      repository.grantPendingReward(firstReward.id, NOW),
      repository.grantPendingReward(firstReward.id, NOW)
    ]);
    expect(raced.filter((result) => result.state === "granted")).toHaveLength(1);

    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const restartedScheduler = createReferralScheduler(
      makeService(new PrismaReferralRepository(prisma), undefined, RECOVERY_NOW),
      { api: { sendMessage } } as unknown as Bot
    );
    await expect(restartedScheduler.tick()).resolves.toMatchObject({
      dueRewards: 3,
      grantedRewards: 3,
      claimedNotifications: 5,
      sentNotifications: 5
    });
    expect(sendMessage).toHaveBeenCalledTimes(5);

    const restartedService = makeService(new PrismaReferralRepository(prisma), undefined, RECOVERY_NOW);
    await expect(restartedService.reconcileForTelegramUser(INVITER_ID)).resolves.toEqual({ granted: 0, pending: 0 });
    await expect(prisma.character.findUniqueOrThrow({ where: { id: "inviter-remort-character" }, select: { gold: true } }))
      .resolves.toEqual({ gold: 1_830 });
    await expect(prisma.characterItem.findMany({
      where: { characterId: "inviter-remort-character" },
      orderBy: { itemId: "asc" },
      select: { itemId: true, quantity: true }
    })).resolves.toEqual([
      { itemId: "item.dense-bandage", quantity: 1 },
      { itemId: "item.field-kit", quantity: 6 },
      { itemId: "item.iskrokamin", quantity: 276 }
    ]);
    await expect(prisma.referralNotificationOutbox.count({ where: { kind: "REFERRAL_PAYOUT_GRANTED" } }))
      .resolves.toBe(4);
    await expect(repository.getDashboard(INVITER_ID)).resolves.toMatchObject({
      token: TOKEN,
      hasCharacter: true,
      arrivedTotal: 1,
      grantedStageTotal: 4,
      pendingStageTotal: 0,
      earnedByMilestone: { LEVEL_3: 1, LEVEL_5: 1, LEVEL_8: 1, LEVEL_13: 1 }
    });
  });

  it("wakes automatic payout delivery after a level milestone without opening the dashboard", async () => {
    const inviterTelegramId = 64_010n;
    const inviteeTelegramId = 64_011n;
    const token = "auto_12345678901";
    await seedCharacter(prisma, "auto-inviter-user", "auto-inviter-character", inviterTelegramId, "Будильник");
    await repository.getOrCreateInviteCode(inviterTelegramId, token, "Будильник");
    await expect(repository.captureFreshReferral(
      { telegramUserId: inviteeTelegramId, displayName: "Сходинка" },
      token,
      NOW,
      true,
      1
    )).resolves.toEqual({ state: "captured" });
    const created = await new PrismaCharacterRepository(prisma).createForTelegramUserIfMissing(
      { telegramUserId: inviteeTelegramId, displayName: "Сходинка" },
      makeCharacterInput("Сходинка")
    );
    const service = makeService(new PrismaReferralRepository(prisma), undefined, RECOVERY_NOW);
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const scheduler = createReferralScheduler(
      service,
      { api: { sendMessage } } as unknown as Bot,
      { intervalMs: 93_000 }
    );
    scheduler.start();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(
      Number(inviterTelegramId),
      expect.stringContaining("Новий поклик прийнято"),
      { parse_mode: "HTML" }
    ));
    sendMessage.mockClear();

    await prisma.$transaction(async (tx) => {
      await tx.character.update({ where: { id: created.character.id }, data: { level: 3 } });
      await recordLevelMilestones(tx, created.character.id, 1, 3, RECOVERY_NOW);
    });
    service.requestReconciliation();

    await vi.waitFor(async () => {
      await expect(prisma.referralReward.findFirstOrThrow({
        where: { attribution: { inviteeUser: { telegramUserId: inviteeTelegramId } } },
        select: { state: true }
      })).resolves.toEqual({ state: "GRANTED" });
      expect(sendMessage).toHaveBeenCalledWith(
        Number(inviterTelegramId),
        expect.stringContaining("Нагорода за поклик"),
        { parse_mode: "HTML" }
      );
    });
    await scheduler.stop();
  });

  it("reprojects User-level referral achievements after repeated Character replacement without Chronicle or notification replay", async () => {
    const inviterUserId = "achievement-inviter-user";
    const inviterTelegramId = 64_020n;
    await seedCharacter(
      prisma,
      inviterUserId,
      "achievement-inviter-original",
      inviterTelegramId,
      "Тринадцятий Кличко"
    );
    const code = await prisma.referralInviteCode.create({
      data: {
        id: "achievement-invite-code",
        inviterUserId,
        token: "achv_12345678901",
        inviterNameSnapshot: "Тринадцятий Кличко"
      }
    });
    for (let index = 1; index <= 13; index += 1) {
      const inviteeUserId = `achievement-invitee-user-${index}`;
      const characterId = `achievement-invitee-character-${index}`;
      const arrivedAt = new Date(NOW.getTime() + index * 1_000);
      await prisma.user.create({
        data: { id: inviteeUserId, telegramUserId: 64_020n + BigInt(index) }
      });
      await prisma.referralAttribution.create({
        data: {
          id: `achievement-attribution-${index}`,
          inviterUserId,
          inviteeUserId,
          inviteCodeId: code.id,
          status: "ACCEPTED",
          capturedAt: NOW,
          acceptedAt: NOW,
          arrivedAt,
          arrivedCharacterId: characterId,
          inviteeNameSnapshot: `Прибула ${index}`,
          chronicleRecordedAt: arrivedAt,
          rewardPlanVersion: 1
        }
      });
      await prisma.activityEvent.create({
        data: {
          id: `achievement-arrival-event-${index}`,
          eventType: "referral.arrived",
          category: "adventurer",
          severity: "normal",
          actorCharacterId: characterId,
          actorDisplayName: `Прибула ${index}`,
          subjectKind: "referral-inviter",
          subjectId: inviterUserId,
          subjectName: "Тринадцятий Кличко",
          sourceType: "referral-attribution",
          sourceId: `achievement-attribution-${index}`,
          dedupeKey: `character.created:${characterId}`,
          occurredAt: arrivedAt
        }
      });
    }
    const originalChronicleCount = await prisma.activityEvent.count({
      where: { subjectId: inviterUserId, eventType: "referral.arrived" }
    });
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const makeAchievementService = () => new ReferralService(
      new PrismaReferralRepository(prisma),
      new PrismaCharacterRepository(prisma),
      {
        foundationEnabled: true,
        payoutsEnabled: true,
        devHelpersEnabled: false,
        botUsername: "kvestarnia_bot"
      },
      new AchievementService(new PrismaAchievementRepository(prisma)),
      new PublicActivityEventPublisher(new ActivityEventService(new PrismaActivityEventRepository(prisma))),
      () => RECOVERY_NOW
    );

    const firstTick = await createReferralScheduler(
      makeAchievementService(),
      { api: { sendMessage } } as unknown as Bot
    ).tick();
    expect(firstTick.dueAchievementProjections).toBeGreaterThanOrEqual(1);
    expect(firstTick.reconciledAchievementProjections).toBeGreaterThanOrEqual(1);
    expect(sendMessage.mock.calls.filter(([chatId]) => chatId === Number(inviterTelegramId)))
      .toHaveLength(2);

    for (const [oldCharacterId, newCharacterId] of [
      ["achievement-inviter-original", "achievement-inviter-replacement"],
      ["achievement-inviter-replacement", "achievement-inviter-replacement-again"]
    ] as const) {
      await prisma.character.delete({ where: { id: oldCharacterId } });
      await seedCharacter(
        prisma,
        inviterUserId,
        newCharacterId,
        inviterTelegramId,
        "Тринадцятий Кличко"
      );
      await expect(createReferralScheduler(
        makeAchievementService(),
        { api: { sendMessage } } as unknown as Bot
      ).tick()).resolves.toMatchObject({
        dueAchievementProjections: 1,
        reconciledAchievementProjections: 1,
        dueArrivalChronicles: 0,
        claimedNotifications: 0,
        sentNotifications: 0
      });
      await expect(prisma.characterAchievement.count({
        where: {
          characterId: newCharacterId,
          achievementId: { in: [
            "achievement.referral.first-arrival",
            "achievement.referral.thirteen-arrivals"
          ] }
        }
      })).resolves.toBe(2);
    }

    await expect(prisma.referralNotificationOutbox.findMany({
      where: { recipientUserId: inviterUserId, kind: "REFERRAL_ACHIEVEMENT_UNLOCKED" },
      orderBy: { logicalKey: "asc" },
      select: { logicalKey: true, state: true }
    })).resolves.toEqual([
      {
        logicalKey: `REFERRAL_ACHIEVEMENT:${inviterUserId}:achievement.referral.first-arrival`,
        state: "SENT"
      },
      {
        logicalKey: `REFERRAL_ACHIEVEMENT:${inviterUserId}:achievement.referral.thirteen-arrivals`,
        state: "SENT"
      }
    ]);
    expect(sendMessage.mock.calls.filter(([chatId]) => chatId === Number(inviterTelegramId)))
      .toHaveLength(2);
    await expect(prisma.activityEvent.count({
      where: { subjectId: inviterUserId, eventType: "referral.arrived" }
    })).resolves.toBe(originalChronicleCount);
  });

  it("rolls the referral migration back without removing pre-existing player data", async () => {
    const rollbackDirectory = await mkdtemp(join(tmpdir(), "kvestarnia-referral-rollback-"));
    const rollbackPrisma = new PrismaClient({
      datasources: { db: { url: `file:${join(rollbackDirectory, "test.db").replace(/\\/g, "/")}` } }
    });
    try {
      await createBaseSchema(rollbackPrisma);
      await seedCharacter(rollbackPrisma, "rollback-user", "rollback-character", 64_093n, "Незворушна");
      await applySqlFile(rollbackPrisma, `prisma/migrations/${MIGRATION}/migration.sql`);
      await applySqlFile(
        rollbackPrisma,
        `prisma/migrations/${ACHIEVEMENT_NOTIFICATION_MIGRATION}/migration.sql`
      );
      await expect(tableNames(rollbackPrisma)).resolves.toContain("referral_rewards");

      await applySqlFile(
        rollbackPrisma,
        `prisma/migrations/${ACHIEVEMENT_NOTIFICATION_MIGRATION}/rollback.sql`
      );
      await applySqlFile(rollbackPrisma, `prisma/migrations/${MIGRATION}/rollback.sql`);
      const tables = await tableNames(rollbackPrisma);
      expect(tables).not.toContain("referral_invite_codes");
      expect(tables).not.toContain("referral_attributions");
      expect(tables).not.toContain("referral_rewards");
      expect(tables).not.toContain("referral_notification_outbox");
      await expect(rollbackPrisma.character.findUnique({ where: { id: "rollback-character" } }))
        .resolves.toMatchObject({ name: "Незворушна" });
    } finally {
      await rollbackPrisma.$disconnect();
      await rm(rollbackDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});

function makeService(
  referrals: PrismaReferralRepository,
  publisher?: PublicActivityEventPublisher,
  now = NOW
): ReferralService {
  const characters = {
    findByTelegramUserId: () => Promise.resolve(null)
  } as unknown as CharacterRepository;
  return new ReferralService(referrals, characters, {
    foundationEnabled: true,
    payoutsEnabled: true,
    devHelpersEnabled: false,
    botUsername: "kvestarnia_bot"
  }, undefined, publisher, () => now);
}

function makeCharacterInput(name: string) {
  return {
    name,
    pronoun: "they" as const,
    path: "boundary" as const,
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 1,
    xp: 0,
    gold: 0,
    hpCurrent: 25,
    hpMax: 25,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: { strength: 5, dexterity: 5, intelligence: 5, charisma: 5, luck: 5 }
  };
}

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  characterId: string,
  telegramUserId: bigint,
  name: string
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { telegramUserId },
    create: { id: userId, telegramUserId, displayName: name },
    update: {}
  });
  await prisma.character.upsert({
    where: { userId: user.id },
    create: {
      id: characterId,
      userId: user.id,
      name,
      raceId: "race.human-ish",
      classId: "class.warrior",
      statsJson: { strength: 5, dexterity: 5, intelligence: 5, charisma: 5, luck: 5 }
    },
    update: { name }
  });
  return user.id;
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
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX character_items_character_id_item_id_key ON character_items(character_id, item_id)`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
      remort_number INTEGER NOT NULL, previous_level INTEGER NOT NULL, previous_xp INTEGER NOT NULL,
      previous_gold INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL,
      preserved_payload_json JSONB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL, local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL DEFAULT 0, reward_gold INTEGER NOT NULL DEFAULT 0,
      spent_gold INTEGER NOT NULL DEFAULT 0, result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX daily_actions_character_id_key_local_date_key ON daily_actions(character_id, key, local_date)`,
    `CREATE TABLE activity_events (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'public', actor_character_id TEXT, actor_display_name TEXT,
      related_character_ids_json JSONB, subject_kind TEXT, subject_id TEXT, subject_name TEXT,
      source_type TEXT, source_id TEXT, dedupe_key TEXT UNIQUE, payload_json JSONB,
      occurred_at DATETIME NOT NULL, published_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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

async function tableNames(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  );
  return rows.map((row) => row.name);
}
