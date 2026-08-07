import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaGuildRepository } from "../../src/db/repositories/prismaGuildRepository";
import {
  GUILD_CREATION_GOLD,
  GUILD_CREST_CATALOG,
  GUILD_CREST_MAX_FILE_SIZE
} from "../../src/domain/guild";
import { GuildService } from "../../src/services/guildService";
import type { PartySessionService } from "../../src/services/partySessionService";

const MIGRATION = "20260802230000_guild_foundation";
const CREST_MIGRATION = "20260806120000_guild_custom_crests";
const NOW = new Date("2026-08-02T20:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const GUILD_CLEANUP_BACKLOG_SIZE = 24;
const GUILD_DOUBLE_CLEANUP_BACKLOG_SIZE = 47;

describe("PrismaGuildRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaGuildRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-guild-repo-"));
    prisma = createPrisma(join(dir, "test.db"));
    await createBaseSchema(prisma);
    await applySqlFile(prisma, `prisma/migrations/${MIGRATION}/migration.sql`);
    await applySqlFile(prisma, `prisma/migrations/${CREST_MIGRATION}/migration.sql`);
    repository = new PrismaGuildRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("enforces founder eligibility, one replaceable live preview, expiry and exact-once debit", async () => {
    await seedCharacter(prisma, "preview-low", 51_001n, "Низький Рівень", 1_000, { level: 4 });
    await expect(createIntent(repository, 51_001n, "preview-low-token", "Низька Печатка"))
      .resolves.toEqual({ state: "ineligible" });

    await seedCharacter(prisma, "preview-remort", 51_002n, "Досвідчений", 1_000, { level: 3, remorts: 1 });
    await expect(createIntent(repository, 51_002n, "preview-old-token", "Стара Чернетка"))
      .resolves.toMatchObject({ state: "ready" });
    await expect(createIntent(repository, 51_002n, "preview-new-token", "Нова Чернетка"))
      .resolves.toMatchObject({ state: "ready", intent: { token: "preview-new-token" } });
    await expect(prisma.guildCreationIntent.count({
      where: { userId: "preview-remort", status: "pending", activeUserKey: "preview-remort" }
    })).resolves.toBe(1);

    const [stale, confirmed] = await Promise.all([
      repository.confirmCreateForTelegramUser(51_002n, "preview-old-token", NOW),
      repository.confirmCreateForTelegramUser(51_002n, "preview-new-token", NOW)
    ]);
    expect(stale.state).toBe("not-found");
    expect(confirmed.state).toBe("created");
    expect(confirmed.state === "created" ? confirmed.guild.status : null).toBe("forming");
    await expect(goldFor(prisma, 51_002n)).resolves.toBe(1_000 - GUILD_CREATION_GOLD);
    await expect(repository.confirmCreateForTelegramUser(51_002n, "preview-new-token", NOW))
      .resolves.toMatchObject({ state: "replayed" });
    await expect(goldFor(prisma, 51_002n)).resolves.toBe(1_000 - GUILD_CREATION_GOLD);

    await seedCharacter(prisma, "preview-poor", 51_003n, "Без Золота", 0, { level: 5 });
    await createIntent(repository, 51_003n, "preview-poor-token", "Бідна Печатка");
    await expect(repository.confirmCreateForTelegramUser(51_003n, "preview-poor-token", NOW))
      .resolves.toEqual({ state: "insufficient-gold", required: GUILD_CREATION_GOLD, available: 0 });
    await expect(prisma.guildFounderCooldown.count({ where: { userId: "preview-poor" } })).resolves.toBe(0);

    await seedCharacter(prisma, "preview-expired", 51_004n, "Прострочений", 1_000, { level: 5 });
    await createIntent(repository, 51_004n, "preview-expired-token", "Пізня Печатка", NOW, new Date(NOW.getTime() + 1_000));
    await expect(repository.confirmCreateForTelegramUser(
      51_004n,
      "preview-expired-token",
      new Date(NOW.getTime() + 1_001)
    )).resolves.toEqual({ state: "expired" });
    await expect(prisma.guildCreationIntent.findUniqueOrThrow({
      where: { token: "preview-expired-token" },
      select: { status: true, activeUserKey: true }
    })).resolves.toEqual({ status: "expired", activeUserKey: null });

    await prisma.guildCreationIntent.createMany({
      data: Array.from({ length: 24 }, (_, index) => ({
        id: `old-intent-${index}`,
        token: `oldIntent${String(index).padStart(8, "0")}`,
        userId: "preview-expired",
        characterId: "preview-expired-character",
        remortCount: 0,
        normalizedName: `стара ${index}`,
        displayName: `Стара ${index}`,
        crest: "🛡️",
        description: "",
        goldCost: GUILD_CREATION_GOLD,
        status: "expired",
        activeUserKey: null,
        expiresAt: new Date(NOW.getTime() - 31 * DAY),
        completedAt: null,
        createdAt: new Date(NOW.getTime() - 31 * DAY),
        updatedAt: new Date(NOW.getTime() - 31 * DAY)
      }))
    });
    await createIntent(repository, 51_004n, "preview-cleanup-token", "Чиста Печатка", NOW);
    await expect(prisma.guildCreationIntent.count({ where: { id: { startsWith: "old-intent-" } } })).resolves.toBe(1);
  });

  it("serializes equivalent-name and different-name confirms with one founder charter per seven days", async () => {
    await seedCharacter(prisma, "race-name-a", 52_001n, "Коваль А", 1_000, { level: 5 });
    await seedCharacter(prisma, "race-name-b", 52_002n, "Коваль Б", 1_000, { level: 5 });
    await createIntent(repository, 52_001n, "race-name-token-a", "Вареничний Статут", NOW, undefined, "вареничний статут");
    await createIntent(repository, 52_002n, "race-name-token-b", "ВАРЕНИЧНИЙ СТАТУТ", NOW, undefined, "вареничний статут");
    const results = await Promise.all([
      repository.confirmCreateForTelegramUser(52_001n, "race-name-token-a", NOW),
      repository.confirmCreateForTelegramUser(52_002n, "race-name-token-b", NOW)
    ]);
    expect(results.filter((result) => result.state === "created")).toHaveLength(1);
    expect(results.filter((result) => result.state === "name-taken")).toHaveLength(1);
    const winnerId = results[0].state === "created" ? 52_001n : 52_002n;
    const loserId = winnerId === 52_001n ? 52_002n : 52_001n;
    await expect(goldFor(prisma, winnerId)).resolves.toBe(1_000 - GUILD_CREATION_GOLD);
    await expect(goldFor(prisma, loserId)).resolves.toBe(1_000);

    await seedCharacter(prisma, "race-different", 52_003n, "Дві Чернетки", 1_000, { level: 5 });
    await createIntent(repository, 52_003n, "race-different-old", "Перша Назва");
    await createIntent(repository, 52_003n, "race-different-new", "Друга Назва");
    const different = await Promise.all([
      repository.confirmCreateForTelegramUser(52_003n, "race-different-old", NOW),
      repository.confirmCreateForTelegramUser(52_003n, "race-different-new", NOW)
    ]);
    expect(different.filter((result) => result.state === "created")).toHaveLength(1);
    expect(different.filter((result) => result.state === "not-found")).toHaveLength(1);
    const created = different.find((result) => result.state === "created");
    if (!created || created.state !== "created") {
      throw new Error("Expected the replacement charter to win.");
    }
    await expect(repository.deleteForTelegramUser(52_003n, created.guild.version, NOW))
      .resolves.toMatchObject({ state: "deleted" });
    await expect(createIntent(repository, 52_003n, "race-cooldown", "Третя Назва", new Date(NOW.getTime() + DAY)))
      .resolves.toMatchObject({ state: "founder-cooldown" });
    await expect(createIntent(repository, 52_003n, "race-after-cooldown", "Третя Назва", new Date(NOW.getTime() + 7 * DAY + 1)))
      .resolves.toMatchObject({ state: "ready" });
  });

  it("activates only on the second distinct user, records achievements sources once, and releases forming names after the hold", async () => {
    await seedCharacter(prisma, "activation-founder", 53_001n, "Засновниця", 1_000, { level: 5 });
    await seedCharacter(prisma, "activation-joiner", 53_002n, "Перший Друг", 0, { level: 1 });
    const forming = await createAndConfirm(repository, 53_001n, "activation-charter", "Жива Печатка");
    await expect(prisma.guildAudit.count({ where: { guildId: forming.guild.id, eventType: "guild.created" } }))
      .resolves.toBe(0);
    await createOptIn(repository, 53_002n, "activation-opt-in");
    await expect(createInvite(repository, 53_001n, "activation-invite", "activation-opt-in"))
      .resolves.toMatchObject({ state: "created" });
    const accepted = await repository.acceptInviteForTelegramUser(53_002n, "activation-invite", NOW);
    expect(accepted).toMatchObject({ state: "accepted", guild: { status: "active", memberCount: 2 } });
    expect(accepted.state === "accepted" ? accepted.activatedFounderCharacterId : null)
      .toBe("activation-founder-character");
    await expect(repository.acceptInviteForTelegramUser(53_002n, "activation-invite", NOW))
      .resolves.toMatchObject({ state: "replayed", activatedFounderCharacterId: "activation-founder-character" });
    await expect(prisma.guildAudit.count({ where: { guildId: forming.guild.id, eventType: "guild.created" } }))
      .resolves.toBe(1);
    await expect(prisma.guildMember.count({ where: { guildId: forming.guild.id, activeUserKey: { not: null } } }))
      .resolves.toBe(2);

    await seedCharacter(prisma, "expiry-founder", 53_003n, "Тимчасовий", 1_000, { level: 5 });
    await seedCharacter(prisma, "expiry-reuser", 53_004n, "Новий Писар", 1_000, { level: 5 });
    const expiring = await createAndConfirm(repository, 53_003n, "expiry-charter", "Вільна Назва", NOW, "вільна назва");
    const charterExpiry = expiring.guild.charterExpiresAt;
    await repository.getHubForTelegramUser(53_003n, new Date(charterExpiry.getTime() + 1));
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: expiring.guild.id },
      select: { status: true, reservationKey: true }
    })).resolves.toEqual({ status: "expired", reservationKey: "вільна назва" });

    const beforeRelease = new Date(charterExpiry.getTime() + 22 * HOUR);
    await createIntent(repository, 53_004n, "reuse-too-early", "Вільна Назва", beforeRelease, undefined, "вільна назва");
    await expect(repository.confirmCreateForTelegramUser(53_004n, "reuse-too-early", beforeRelease))
      .resolves.toEqual({ state: "name-taken" });
    const afterRelease = new Date(charterExpiry.getTime() + 23 * HOUR + 1);
    await createIntent(repository, 53_004n, "reuse-after-hold", "Вільна Назва", afterRelease, undefined, "вільна назва");
    await expect(repository.confirmCreateForTelegramUser(53_004n, "reuse-after-hold", afterRelease))
      .resolves.toMatchObject({ state: "created" });

    await seedCharacter(prisma, "disband-founder", 53_005n, "Голова Розпуску", 1_000, { level: 5 });
    await seedCharacter(prisma, "disband-joiner", 53_006n, "Друг Розпуску", 0);
    const disbanded = await activateGuild(repository, 53_005n, 53_006n, "disband-guild", "Назва Після Розпуску");
    const joinerHub = await readyHub(repository, 53_006n, NOW);
    await repository.leaveForTelegramUser(53_006n, joinerHub.guild.version, NOW);
    const founderHub = await readyHub(repository, 53_005n, NOW);
    await expect(repository.deleteForTelegramUser(53_005n, founderHub.guild.version, NOW))
      .resolves.toMatchObject({ state: "deleted" });
    await seedCharacter(prisma, "disband-reuser-before", 53_007n, "Ранній Повтор", 1_000, { level: 5 });
    const beforeDisbandRelease = new Date(NOW.getTime() + 30 * DAY - 1);
    await createIntent(repository, 53_007n, "disband-reuse-before", "Назва Після Розпуску", beforeDisbandRelease);
    await expect(repository.confirmCreateForTelegramUser(53_007n, "disband-reuse-before", beforeDisbandRelease))
      .resolves.toEqual({ state: "name-taken" });
    await seedCharacter(prisma, "disband-reuser-after", 53_008n, "Пізній Повтор", 1_000, { level: 5 });
    const afterDisbandRelease = new Date(NOW.getTime() + 30 * DAY + 1);
    await createIntent(repository, 53_008n, "disband-reuse-after", "Назва Після Розпуску", afterDisbandRelease);
    await expect(repository.confirmCreateForTelegramUser(53_008n, "disband-reuse-after", afterDisbandRelease))
      .resolves.toMatchObject({ state: "created" });
    expect(disbanded.guild.id).toBeTruthy();
  });

  it("terminalizes each relevant expired charter behind the bounded cleanup backlog", async () => {
    await seedCharacter(prisma, "lifecycle-cleanup-owner", 53_100n, "Писар Черги", 0);

    await seedCharacter(prisma, "lifecycle-accept-founder", 53_101n, "Голова Прострочення", 1_000, { level: 5 });
    await seedCharacter(prisma, "lifecycle-accept-target", 53_102n, "Пізній Адресат", 42);
    const acceptanceGuild = await createAndConfirm(
      repository,
      53_101n,
      "lifecycle-accept-charter",
      "Печатка Пізньої Згоди"
    );
    const acceptAt = new Date(acceptanceGuild.guild.charterExpiresAt.getTime() + 1);
    const inviteAt = new Date(acceptanceGuild.guild.charterExpiresAt.getTime() - HOUR);
    await createOptIn(repository, 53_102n, "lifecycle-accept-code", inviteAt);
    await createInvite(repository, 53_101n, "lifecycle-accept-invite", "lifecycle-accept-code", inviteAt);
    const acceptanceBefore = await prisma.guild.findUniqueOrThrow({
      where: { id: acceptanceGuild.guild.id },
      select: { nameReleaseAt: true }
    });
    const founderGoldBefore = await goldFor(prisma, 53_101n);
    const targetGoldBefore = await goldFor(prisma, 53_102n);
    await seedExpiredGuildBacklog(prisma, "accept", "lifecycle-cleanup-owner", acceptAt);

    await expect(repository.acceptInviteForTelegramUser(53_102n, "lifecycle-accept-invite", acceptAt))
      .resolves.toEqual({ state: "expired" });
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: acceptanceGuild.guild.id },
      select: { status: true, activatedAt: true, activatedByInviteId: true, nameReleaseAt: true }
    })).resolves.toEqual({
      status: "expired",
      activatedAt: null,
      activatedByInviteId: null,
      nameReleaseAt: acceptanceBefore.nameReleaseAt
    });
    const closedFounder = await prisma.guildMember.findFirstOrThrow({
      where: { guildId: acceptanceGuild.guild.id, userId: "lifecycle-accept-founder" },
      select: { activeUserKey: true, leftAt: true, updatedAt: true }
    });
    const closedInvite = await prisma.guildInvite.findUniqueOrThrow({
      where: { token: "lifecycle-accept-invite" },
      select: { status: true, activeKey: true, respondedAt: true, updatedAt: true }
    });
    expect(closedFounder).toEqual({ activeUserKey: null, leftAt: acceptAt, updatedAt: acceptAt });
    expect(closedInvite).toEqual({ status: "expired", activeKey: null, respondedAt: acceptAt, updatedAt: acceptAt });
    await expect(prisma.guildMember.count({
      where: { guildId: acceptanceGuild.guild.id, userId: "lifecycle-accept-target" }
    })).resolves.toBe(0);
    await expect(prisma.guildAudit.count({
      where: { guildId: acceptanceGuild.guild.id, eventType: "charter.expired" }
    })).resolves.toBe(1);
    await expect(prisma.guildAudit.count({
      where: { guildId: acceptanceGuild.guild.id, eventType: { in: ["invite.accepted", "guild.created"] } }
    })).resolves.toBe(0);
    await expect(goldFor(prisma, 53_101n)).resolves.toBe(founderGoldBefore);
    await expect(goldFor(prisma, 53_102n)).resolves.toBe(targetGoldBefore);

    const replayAt = new Date(acceptAt.getTime() + HOUR);
    await expect(repository.acceptInviteForTelegramUser(53_102n, "lifecycle-accept-invite", replayAt))
      .resolves.toEqual({ state: "expired" });
    await expect(prisma.guildMember.findFirstOrThrow({
      where: { guildId: acceptanceGuild.guild.id, userId: "lifecycle-accept-founder" },
      select: { leftAt: true, updatedAt: true }
    })).resolves.toEqual({ leftAt: closedFounder.leftAt, updatedAt: closedFounder.updatedAt });
    await expect(prisma.guildInvite.findUniqueOrThrow({
      where: { token: "lifecycle-accept-invite" },
      select: { respondedAt: true, updatedAt: true }
    })).resolves.toEqual({ respondedAt: closedInvite.respondedAt, updatedAt: closedInvite.updatedAt });
    await expect(prisma.guildAudit.count({
      where: { guildId: acceptanceGuild.guild.id, eventType: "charter.expired" }
    })).resolves.toBe(1);

    await seedCharacter(prisma, "lifecycle-create-founder", 53_103n, "Голова Нового Запрошення", 1_000, { level: 5 });
    await seedCharacter(prisma, "lifecycle-create-target", 53_104n, "Адресат Нового Запрошення", 0);
    const createGuild = await createAndConfirm(
      repository,
      53_103n,
      "lifecycle-create-charter",
      "Печатка Зачиненого Конверта"
    );
    const createAt = new Date(createGuild.guild.charterExpiresAt.getTime() + 1);
    await createOptIn(repository, 53_104n, "lifecycle-create-code", createAt);
    await seedExpiredGuildBacklog(prisma, "create", "lifecycle-cleanup-owner", createAt);
    await expect(createInvite(repository, 53_103n, "lifecycle-too-late-invite", "lifecycle-create-code", createAt))
      .resolves.toEqual({ state: "not-member" });
    await expect(prisma.guildInvite.count({ where: { token: "lifecycle-too-late-invite" } })).resolves.toBe(0);
    await expect(prisma.guild.findUniqueOrThrow({ where: { id: createGuild.guild.id }, select: { status: true } }))
      .resolves.toEqual({ status: "expired" });

    await seedCharacter(prisma, "lifecycle-hub-founder", 53_105n, "Голова Зачиненого Хабу", 1_000, { level: 5 });
    const hubGuild = await createAndConfirm(repository, 53_105n, "lifecycle-hub-charter", "Печатка Зачиненого Хабу");
    const hubAt = new Date(hubGuild.guild.charterExpiresAt.getTime() + 1);
    await seedExpiredGuildBacklog(prisma, "hub", "lifecycle-cleanup-owner", hubAt);
    await expect(repository.getHubForTelegramUser(53_105n, hubAt)).resolves.toMatchObject({ state: "not-member" });
    await expect(prisma.guild.findUniqueOrThrow({ where: { id: hubGuild.guild.id }, select: { status: true } }))
      .resolves.toEqual({ status: "expired" });

    await seedCharacter(prisma, "lifecycle-profile-founder", 53_106n, "Голова Зачиненого Профілю", 1_000, { level: 5 });
    const profileGuild = await createAndConfirm(
      repository,
      53_106n,
      "lifecycle-profile-charter",
      "Печатка Зачиненого Профілю"
    );
    const profileAt = new Date(profileGuild.guild.charterExpiresAt.getTime() + 1);
    await seedExpiredGuildBacklog(prisma, "profile", "lifecycle-cleanup-owner", profileAt);
    await expect(repository.updateProfileForTelegramUser(53_106n, {
      crest: "🦉",
      description: "Цей текст не має записатися.",
      expectedVersion: profileGuild.guild.version,
      now: profileAt
    })).resolves.toEqual({ state: "not-member" });
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: profileGuild.guild.id },
      select: { status: true, crest: true, description: true }
    })).resolves.toEqual({
      status: "expired",
      crest: profileGuild.guild.crest,
      description: profileGuild.guild.description
    });

    await seedCharacter(prisma, "lifecycle-live-founder", 53_107n, "Голова Живого Статуту", 1_000, { level: 5 });
    await seedCharacter(prisma, "lifecycle-live-target", 53_108n, "Вчасний Адресат", 0);
    const liveGuild = await createAndConfirm(
      repository,
      53_107n,
      "lifecycle-live-charter",
      "Печатка Вчасної Згоди"
    );
    await createOptIn(repository, 53_108n, "lifecycle-live-code", NOW);
    await createInvite(repository, 53_107n, "lifecycle-live-invite", "lifecycle-live-code", NOW);
    const liveAt = new Date(NOW.getTime() + 2 * DAY);
    await seedExpiredGuildBacklog(prisma, "live", "lifecycle-cleanup-owner", liveAt);
    await expect(repository.acceptInviteForTelegramUser(53_108n, "lifecycle-live-invite", liveAt))
      .resolves.toMatchObject({ state: "accepted", guild: { id: liveGuild.guild.id, status: "active", memberCount: 2 } });
    await expect(prisma.guildAudit.count({ where: { guildId: liveGuild.guild.id, eventType: "guild.created" } }))
      .resolves.toBe(1);
  });

  it("validates the target User membership lifecycle beyond the cleanup backlog", async () => {
    await seedCharacter(prisma, "target-lifecycle-cleanup-owner", 53_120n, "Писар Цільової Черги", 0);
    await seedCharacter(prisma, "target-lifecycle-inviter", 53_121n, "Голова Цільового Листа", 1_000, { level: 5 });
    await seedCharacter(prisma, "target-lifecycle-activator", 53_122n, "Чинний Підписант", 0);
    await activateGuild(
      repository,
      53_121n,
      53_122n,
      "target-lifecycle-inviter-guild",
      "Печатка Цільового Листа"
    );

    await seedCharacter(prisma, "target-lifecycle-expired", 53_123n, "Вільний Після Строку", 1_000, { level: 5 });
    const expiredTargetGuild = await createAndConfirm(
      repository,
      53_123n,
      "target-lifecycle-expired-charter",
      "Статут Колишньої Цілі"
    );
    const inviteAt = new Date(expiredTargetGuild.guild.charterExpiresAt.getTime() + 1);
    await createOptIn(repository, 53_123n, "target-lifecycle-expired-code", inviteAt);
    await seedExpiredGuildBacklog(
      prisma,
      "target-membership",
      "target-lifecycle-cleanup-owner",
      inviteAt
    );

    await expect(createInvite(
      repository,
      53_121n,
      "target-lifecycle-success-invite",
      "target-lifecycle-expired-code",
      inviteAt
    )).resolves.toMatchObject({
      state: "created",
      invite: { targetName: "Вільний Після Строку" }
    });
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: expiredTargetGuild.guild.id },
      select: { status: true }
    })).resolves.toEqual({ status: "expired" });
    await expect(prisma.guildMember.findFirstOrThrow({
      where: { guildId: expiredTargetGuild.guild.id, userId: "target-lifecycle-expired" },
      select: { activeUserKey: true, leftAt: true }
    })).resolves.toEqual({ activeUserKey: null, leftAt: inviteAt });

    await seedCharacter(prisma, "target-lifecycle-live", 53_124n, "Ще Чинна Ціль", 1_000, { level: 5 });
    const liveTargetGuild = await createAndConfirm(
      repository,
      53_124n,
      "target-lifecycle-live-charter",
      "Статут Чинної Цілі",
      inviteAt
    );
    await createOptIn(repository, 53_124n, "target-lifecycle-live-code", inviteAt);
    await expect(createInvite(
      repository,
      53_121n,
      "target-lifecycle-blocked-invite",
      "target-lifecycle-live-code",
      new Date(inviteAt.getTime() + 1)
    )).resolves.toEqual({ state: "target-unavailable" });
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: liveTargetGuild.guild.id },
      select: { status: true }
    })).resolves.toEqual({ status: "forming" });
  });

  it("releases the specific due name owner beyond two cleanup batches and keeps live holds", async () => {
    await seedCharacter(prisma, "name-lifecycle-cleanup-owner", 53_130n, "Писар Іменної Черги", 0);
    await seedCharacter(prisma, "name-lifecycle-owner", 53_131n, "Старий Власник Назви", 1_000, { level: 5 });
    const dueOwner = await createAndConfirm(
      repository,
      53_131n,
      "name-lifecycle-owner-charter",
      "Назва За Двома Чергами",
      NOW,
      "назва за двома чергами"
    );
    const releaseAt = new Date(dueOwner.guild.charterExpiresAt.getTime() + 23 * HOUR + 1);
    await seedExpiredGuildBacklog(
      prisma,
      "name-reservation",
      "name-lifecycle-cleanup-owner",
      releaseAt,
      GUILD_DOUBLE_CLEANUP_BACKLOG_SIZE
    );
    await seedCharacter(prisma, "name-lifecycle-reuser", 53_132n, "Новий Власник Назви", 1_000, { level: 5 });
    await createIntent(
      repository,
      53_132n,
      "name-lifecycle-reuse-charter",
      "Назва За Двома Чергами",
      releaseAt,
      undefined,
      "назва за двома чергами"
    );

    const created = await repository.confirmCreateForTelegramUser(
      53_132n,
      "name-lifecycle-reuse-charter",
      releaseAt
    );
    expect(created).toMatchObject({ state: "created", guild: { normalizedName: "назва за двома чергами" } });
    await expect(repository.confirmCreateForTelegramUser(53_132n, "name-lifecycle-reuse-charter", releaseAt))
      .resolves.toMatchObject({ state: "replayed" });
    await expect(goldFor(prisma, 53_132n)).resolves.toBe(1_000 - GUILD_CREATION_GOLD);
    await expect(prisma.guildFounderCooldown.count({ where: { userId: "name-lifecycle-reuser" } }))
      .resolves.toBe(1);
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: dueOwner.guild.id },
      select: { status: true, reservationKey: true }
    })).resolves.toEqual({ status: "expired", reservationKey: null });
    await expect(prisma.guildAudit.count({
      where: { guildId: dueOwner.guild.id, eventType: "charter.expired" }
    })).resolves.toBe(1);

    await seedCharacter(prisma, "name-lifecycle-held-owner", 53_133n, "Власник Живого Утримання", 1_000, { level: 5 });
    const heldOwner = await createAndConfirm(
      repository,
      53_133n,
      "name-lifecycle-held-charter",
      "Назва Ще Під Печаткою",
      releaseAt,
      "назва ще під печаткою"
    );
    const heldAt = new Date(heldOwner.guild.charterExpiresAt.getTime() + 22 * HOUR);
    await seedCharacter(prisma, "name-lifecycle-held-reuser", 53_134n, "Ранній Шукач Назви", 1_000, { level: 5 });
    await createIntent(
      repository,
      53_134n,
      "name-lifecycle-held-reuse",
      "Назва Ще Під Печаткою",
      heldAt,
      undefined,
      "назва ще під печаткою"
    );
    await expect(repository.confirmCreateForTelegramUser(53_134n, "name-lifecycle-held-reuse", heldAt))
      .resolves.toEqual({ state: "name-taken" });
    await expect(goldFor(prisma, 53_134n)).resolves.toBe(1_000);
    await expect(prisma.guildFounderCooldown.count({ where: { userId: "name-lifecycle-held-reuser" } }))
      .resolves.toBe(0);
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: heldOwner.guild.id },
      select: { status: true, reservationKey: true }
    })).resolves.toEqual({ status: "expired", reservationKey: "назва ще під печаткою" });
  });

  it("enforces opt-in privacy, invite TTL/backlog/rate and the seven-day pair decline cooldown", async () => {
    await seedCharacter(prisma, "invite-founder", 54_001n, "Запрошувач", 1_000, { level: 5 });
    await seedCharacter(prisma, "invite-activator", 54_002n, "Активатор", 0);
    await activateGuild(repository, 54_001n, 54_002n, "invite-guild", "Запросильна Печатка");
    await seedCharacter(prisma, "invite-target", 54_003n, "Прихована Ціль", 0);
    await expect(createInvite(repository, 54_001n, "invite-no-code", "unknown-code"))
      .resolves.toEqual({ state: "target-unavailable" });
    await createOptIn(repository, 54_003n, "invite-target-code");
    const first = await createInvite(repository, 54_001n, "invite-first", "invite-target-code");
    expect(first).toMatchObject({ state: "created", invite: { expiresAt: new Date(NOW.getTime() + 93 * HOUR) } });
    await expect(createInvite(repository, 54_001n, "invite-replay", "invite-target-code"))
      .resolves.toMatchObject({ state: "replayed", invite: { token: "invite-first" } });
    await expect(repository.declineInviteForTelegramUser(54_003n, "invite-first", NOW))
      .resolves.toMatchObject({
        state: "declined",
        transitioned: true,
        notification: {
          inviterTelegramUserId: 54_001n,
          targetName: "Прихована Ціль",
          guildName: "Запросильна Печатка"
        }
      });
    await expect(repository.declineInviteForTelegramUser(54_003n, "invite-first", NOW))
      .resolves.toEqual({ state: "declined", transitioned: false });
    await createOptIn(repository, 54_003n, "invite-target-code", new Date(NOW.getTime() + 6 * DAY));
    await expect(createInvite(repository, 54_001n, "invite-decline-block", "invite-target-code", new Date(NOW.getTime() + 6 * DAY)))
      .resolves.toMatchObject({ state: "decline-cooldown", availableAt: new Date(NOW.getTime() + 7 * DAY) });
    await expect(createInvite(repository, 54_001n, "invite-after-decline", "invite-target-code", new Date(NOW.getTime() + 7 * DAY + 1)))
      .resolves.toMatchObject({ state: "created" });

    const rateNow = new Date(NOW.getTime() + 8 * DAY);
    for (let index = 0; index < 4; index += 1) {
      const id = 54_010n + BigInt(index);
      await seedCharacter(prisma, `invite-rate-${index}`, id, `Ціль ${index}`, 0);
      await createOptIn(repository, id, `invite-rate-code-${index}`, rateNow);
    }
    for (let index = 0; index < 3; index += 1) {
      await expect(createInvite(
        repository,
        54_001n,
        `invite-rate-${index}`,
        `invite-rate-code-${index}`,
        rateNow
      )).resolves.toMatchObject({ state: "created" });
    }
    await expect(createInvite(repository, 54_001n, "invite-rate-3", "invite-rate-code-3", rateNow))
      .resolves.toMatchObject({ state: "rate-limited", availableAt: new Date(rateNow.getTime() + 13 * 60_000) });

    await seedCharacter(prisma, "backlog-target", 54_020n, "Три Листи", 0);
    await createOptIn(repository, 54_020n, "backlog-code", rateNow);
    for (let index = 0; index < 4; index += 1) {
      const leader = 54_030n + BigInt(index);
      await seedCharacter(prisma, `backlog-leader-${index}`, leader, `Голова ${index}`, 1_000, { level: 5 });
      await createAndConfirm(repository, leader, `backlog-guild-${index}`, `Печатка Черги ${index}`, rateNow);
      const invite = await createInvite(repository, leader, `backlog-invite-${index}`, "backlog-code", rateNow);
      expect(invite.state).toBe(index < 3 ? "created" : "too-many-incoming");
    }
  });

  it("serializes cross-guild accepts and the final roster slot, and caps officers at two", async () => {
    await seedCharacter(prisma, "accept-a", 55_001n, "Голова А", 1_000, { level: 5 });
    await seedCharacter(prisma, "accept-b", 55_002n, "Голова Б", 1_000, { level: 5 });
    await seedCharacter(prisma, "accept-target", 55_003n, "Одна Людина", 0);
    await createAndConfirm(repository, 55_001n, "accept-charter-a", "Статут А");
    await createAndConfirm(repository, 55_002n, "accept-charter-b", "Статут Б");
    await createOptIn(repository, 55_003n, "accept-code");
    await createInvite(repository, 55_001n, "accept-invite-a", "accept-code");
    await createInvite(repository, 55_002n, "accept-invite-b", "accept-code");
    const accepts = await Promise.all([
      repository.acceptInviteForTelegramUser(55_003n, "accept-invite-a", NOW),
      repository.acceptInviteForTelegramUser(55_003n, "accept-invite-b", NOW)
    ]);
    expect(accepts.filter((result) => result.state === "accepted")).toHaveLength(1);
    await expect(prisma.guildMember.count({ where: { userId: "accept-target", activeUserKey: "accept-target" } }))
      .resolves.toBe(1);

    await seedCharacter(prisma, "cap-founder", 55_010n, "Голова Вісімки", 1_000, { level: 5 });
    await seedCharacter(prisma, "cap-activator", 55_011n, "Друг Вісімки", 0);
    const capGuild = await activateGuild(repository, 55_010n, 55_011n, "cap-guild", "Восьма Печатка");
    for (let index = 0; index < 5; index += 1) {
      await seedCharacter(prisma, `cap-member-${index}`, 55_020n + BigInt(index), `Учасник ${index}`, 0);
      await prisma.guildMember.create({
        data: {
          id: `cap-membership-${index}`,
          guildId: capGuild.guild.id,
          userId: `cap-member-${index}`,
          activeUserKey: `cap-member-${index}`,
          role: "member",
          joinedAt: new Date(NOW.getTime() + index + 1),
          createdAt: NOW,
          updatedAt: NOW
        }
      });
    }
    await seedCharacter(prisma, "cap-target-a", 55_030n, "Остання А", 0);
    await seedCharacter(prisma, "cap-target-b", 55_031n, "Остання Б", 0);
    await createOptIn(repository, 55_030n, "cap-code-a");
    await createOptIn(repository, 55_031n, "cap-code-b");
    const inviteAt = new Date(NOW.getTime() + HOUR);
    await createInvite(repository, 55_010n, "cap-invite-a", "cap-code-a", inviteAt);
    await createInvite(repository, 55_010n, "cap-invite-b", "cap-code-b", inviteAt);
    const finalSlot = await Promise.all([
      repository.acceptInviteForTelegramUser(55_030n, "cap-invite-a", inviteAt),
      repository.acceptInviteForTelegramUser(55_031n, "cap-invite-b", inviteAt)
    ]);
    expect(finalSlot.filter((result) => result.state === "accepted")).toHaveLength(1);
    expect(finalSlot.filter((result) => result.state === "guild-full")).toHaveLength(1);
    await expect(prisma.guildMember.count({ where: { guildId: capGuild.guild.id, activeUserKey: { not: null } } }))
      .resolves.toBe(8);

    const hub = await repository.getHubForTelegramUser(55_010n, inviteAt, 0);
    if (hub.state !== "ready") {
      throw new Error("Expected cap guild hub.");
    }
    const promotable = (await prisma.guildMember.findMany({
      where: { guildId: capGuild.guild.id, role: "member", activeUserKey: { not: null } },
      orderBy: { joinedAt: "asc" },
      take: 3
    }));
    let version = hub.guild.version;
    for (const member of promotable.slice(0, 2)) {
      const promoted = await repository.setMemberRoleForTelegramUser(55_010n, member.id, "officer", version, inviteAt);
      expect(promoted.state).toBe("updated");
      version = promoted.state === "updated" ? promoted.guild.version : version;
    }
    await expect(repository.setMemberRoleForTelegramUser(55_010n, promotable[2]!.id, "officer", version, inviteAt))
      .resolves.toEqual({ state: "officer-cap" });
  });

  it("requires nominee acceptance, refuses voluntary leader succession, and invalidates former inviter cancellation", async () => {
    await seedCharacter(prisma, "roles-leader", 56_001n, "Чинна Голова", 1_000, { level: 5 });
    await seedCharacter(prisma, "roles-nominee", 56_002n, "Номінована", 0);
    await seedCharacter(prisma, "roles-member", 56_003n, "Звичайний", 0);
    const guild = await activateGuild(repository, 56_001n, 56_002n, "roles-guild", "Печатка Ролей");
    await joinGuild(repository, 56_001n, 56_003n, "roles-member-invite", "roles-member-code", new Date(NOW.getTime() + HOUR));
    let hub = await readyHub(repository, 56_001n, NOW);
    const nominee = hub.guild.members.find((row) => row.name === "Номінована")!;
    await expect(repository.updateProfileForTelegramUser(56_003n, {
      crest: "🦉",
      description: "Не дозволено",
      expectedVersion: hub.guild.version,
      now: NOW
    })).resolves.toEqual({ state: "forbidden" });
    const profile = await repository.updateProfileForTelegramUser(56_001n, {
      crest: "🦉",
      description: "Опис після перевірки ролі.",
      expectedVersion: hub.guild.version,
      now: NOW
    });
    expect(profile).toMatchObject({ state: "updated", guild: { crest: "🦉", description: "Опис після перевірки ролі." } });
    hub = await readyHub(repository, 56_001n, NOW);
    await expect(repository.leaveForTelegramUser(56_001n, hub.guild.version, NOW))
      .resolves.toEqual({ state: "leader-needs-successor" });
    const offered = await repository.offerLeadershipForTelegramUser(56_001n, nominee.id, hub.guild.version, NOW);
    expect(offered.state).toBe("transfer-offered");
    const offeredVersion = offered.state === "transfer-offered" ? offered.guild.version : -1;
    expect((await readyHub(repository, 56_001n, NOW)).guild.viewerRole).toBe("leader");
    await expect(repository.acceptLeadershipForTelegramUser(56_003n, offeredVersion, NOW))
      .resolves.toEqual({ state: "forbidden" });
    await expect(repository.acceptLeadershipForTelegramUser(56_002n, offeredVersion, NOW))
      .resolves.toMatchObject({ state: "updated", guild: { viewerRole: "leader" } });
    hub = await readyHub(repository, 56_001n, NOW);
    await expect(repository.leaveForTelegramUser(56_001n, hub.guild.version, NOW))
      .resolves.toMatchObject({ state: "left" });
    const nomineeHub = await readyHub(repository, 56_002n, NOW);
    await expect(repository.deleteForTelegramUser(56_002n, nomineeHub.guild.version, NOW))
      .resolves.toEqual({ state: "guild-not-sole" });

    await seedCharacter(prisma, "roles-target", 56_004n, "Адресат Ролі", 0);
    await createOptIn(repository, 56_004n, "roles-target-code", new Date(NOW.getTime() + 2 * HOUR));
    const officerHub = await readyHub(repository, 56_002n, new Date(NOW.getTime() + 2 * HOUR));
    const member = officerHub.guild.members.find((row) => row.name === "Звичайний")!;
    const promoted = await repository.setMemberRoleForTelegramUser(
      56_002n,
      member.id,
      "officer",
      officerHub.guild.version,
      new Date(NOW.getTime() + 2 * HOUR)
    );
    const version = promoted.state === "updated" ? promoted.guild.version : -1;
    await expect(repository.updateProfileForTelegramUser(56_003n, {
      crest: "🐸",
      description: "Спроба старшини",
      expectedVersion: version,
      now: new Date(NOW.getTime() + 2 * HOUR)
    })).resolves.toEqual({ state: "forbidden" });
    await expect(repository.offerLeadershipForTelegramUser(56_003n, nominee.id, version, new Date(NOW.getTime() + 2 * HOUR)))
      .resolves.toEqual({ state: "forbidden" });
    await expect(repository.kickMemberForTelegramUser(56_003n, nominee.id, version, new Date(NOW.getTime() + 2 * HOUR)))
      .resolves.toEqual({ state: "forbidden" });
    await expect(createInvite(
      repository,
      56_003n,
      "roles-officer-cancel",
      "roles-target-code",
      new Date(NOW.getTime() + 2 * HOUR)
    )).resolves.toMatchObject({ state: "created" });
    await expect(repository.cancelInviteForTelegramUser(
      56_003n,
      "roles-officer-cancel",
      new Date(NOW.getTime() + 2 * HOUR)
    )).resolves.toEqual({ state: "cancelled" });
    await expect(createInvite(
      repository,
      56_003n,
      "roles-officer-invite",
      "roles-target-code",
      new Date(NOW.getTime() + 2 * HOUR)
    )).resolves.toMatchObject({ state: "created" });
    await expect(repository.setMemberRoleForTelegramUser(
      56_002n,
      member.id,
      "member",
      version,
      new Date(NOW.getTime() + 2 * HOUR)
    )).resolves.toMatchObject({ state: "updated" });
    await expect(repository.cancelInviteForTelegramUser(
      56_003n,
      "roles-officer-invite",
      new Date(NOW.getTime() + 2 * HOUR)
    )).resolves.toEqual({ state: "not-found" });
    await expect(repository.cancelInviteForTelegramUser(
      56_002n,
      "roles-officer-invite",
      new Date(NOW.getTime() + 2 * HOUR)
    )).resolves.toEqual({ state: "cancelled" });
    const afterDemotion = await readyHub(repository, 56_002n, new Date(NOW.getTime() + 2 * HOUR));
    const rePromoted = await repository.setMemberRoleForTelegramUser(
      56_002n,
      member.id,
      "officer",
      afterDemotion.guild.version,
      new Date(NOW.getTime() + 2 * HOUR)
    );
    const rePromotedVersion = rePromoted.state === "updated" ? rePromoted.guild.version : -1;
    await expect(createInvite(
      repository,
      56_003n,
      "roles-kicked-invite",
      "roles-target-code",
      new Date(NOW.getTime() + 2 * HOUR)
    )).resolves.toMatchObject({ state: "created" });
    await expect(repository.kickMemberForTelegramUser(
      56_002n,
      member.id,
      rePromotedVersion,
      new Date(NOW.getTime() + 2 * HOUR)
    )).resolves.toMatchObject({ state: "updated" });
    await expect(repository.cancelInviteForTelegramUser(
      56_003n,
      "roles-kicked-invite",
      new Date(NOW.getTime() + 2 * HOUR)
    )).resolves.toEqual({ state: "not-found" });
    await repository.cancelInviteForTelegramUser(56_002n, "roles-kicked-invite", new Date(NOW.getTime() + 2 * HOUR));
    await seedCharacter(prisma, "roles-leaver", 56_005n, "Старшина На Вихід", 0);
    await seedCharacter(prisma, "roles-leaver-target", 56_006n, "Адресат Виходу", 0);
    const roleLater = new Date(NOW.getTime() + 3 * HOUR);
    await joinGuild(repository, 56_002n, 56_005n, "roles-leaver-join", "roles-leaver-join-code", roleLater);
    let leaderLaterHub = await readyHub(repository, 56_002n, roleLater);
    const leaver = leaderLaterHub.guild.members.find((row) => row.name === "Старшина На Вихід")!;
    const leaverPromoted = await repository.setMemberRoleForTelegramUser(
      56_002n,
      leaver.id,
      "officer",
      leaderLaterHub.guild.version,
      roleLater
    );
    const leaverVersion = leaverPromoted.state === "updated" ? leaverPromoted.guild.version : -1;
    await createOptIn(repository, 56_006n, "roles-leaver-target-code", roleLater);
    await expect(createInvite(repository, 56_005n, "roles-left-invite", "roles-leaver-target-code", roleLater))
      .resolves.toMatchObject({ state: "created" });
    await expect(repository.leaveForTelegramUser(56_005n, leaverVersion, roleLater))
      .resolves.toMatchObject({ state: "left" });
    await expect(repository.cancelInviteForTelegramUser(56_005n, "roles-left-invite", roleLater))
      .resolves.toEqual({ state: "not-found" });
    leaderLaterHub = await readyHub(repository, 56_002n, roleLater);
    expect(leaderLaterHub.guild.viewerRole).toBe("leader");
    expect(guild.guild.id).toBeTruthy();
  });

  it("expires guild-wide hub invitations and scopes cancellation controls to current authority", async () => {
    await seedCharacter(prisma, "hub-controls-leader", 56_020n, "Голова Кнопок", 1_000, { level: 5 });
    await seedCharacter(prisma, "hub-controls-officer-a", 56_021n, "Старшина А", 0);
    await seedCharacter(prisma, "hub-controls-officer-b", 56_022n, "Старшина Б", 0);
    const guild = await activateGuild(
      repository,
      56_020n,
      56_021n,
      "hub-controls-guild",
      "Печатка Кнопок"
    );
    const roleAt = new Date(NOW.getTime() + HOUR);
    await joinGuild(
      repository,
      56_020n,
      56_022n,
      "hub-controls-officer-b-invite",
      "hub-controls-officer-b-code",
      roleAt
    );
    let leaderHub = await readyHub(repository, 56_020n, roleAt);
    const officerA = leaderHub.guild.members.find((member) => member.name === "Старшина А")!;
    const promotedA = await repository.setMemberRoleForTelegramUser(
      56_020n,
      officerA.id,
      "officer",
      leaderHub.guild.version,
      roleAt
    );
    expect(promotedA.state).toBe("updated");
    leaderHub = await readyHub(repository, 56_020n, roleAt);
    const officerB = leaderHub.guild.members.find((member) => member.name === "Старшина Б")!;
    await expect(repository.setMemberRoleForTelegramUser(
      56_020n,
      officerB.id,
      "officer",
      leaderHub.guild.version,
      roleAt
    )).resolves.toMatchObject({ state: "updated" });

    await seedCharacter(prisma, "hub-controls-expiring-target", 56_023n, "Адресат Прострочення", 0);
    const inviteAt = new Date(NOW.getTime() + 2 * HOUR);
    await createOptIn(repository, 56_023n, "hub-controls-expiring-code", inviteAt);
    await expect(createInvite(
      repository,
      56_021n,
      "hub-controls-expiring-invite",
      "hub-controls-expiring-code",
      inviteAt
    )).resolves.toMatchObject({ state: "created" });
    const openAt = new Date(inviteAt.getTime() + 93 * HOUR + 1);
    const afterExpiry = await readyHub(repository, 56_020n, openAt);
    expect(afterExpiry.guild.outgoingInvites.map((invite) => invite.token))
      .not.toContain("hub-controls-expiring-invite");
    await expect(prisma.guildInvite.findUniqueOrThrow({
      where: { token: "hub-controls-expiring-invite" },
      select: { status: true, activeKey: true, respondedAt: true }
    })).resolves.toEqual({ status: "expired", activeKey: null, respondedAt: openAt });

    const controlsAt = new Date(openAt.getTime() + HOUR);
    await seedCharacter(prisma, "hub-controls-target-a", 56_024n, "Адресат Старшини А", 0);
    await seedCharacter(prisma, "hub-controls-target-b", 56_025n, "Адресат Старшини Б", 0);
    await createOptIn(repository, 56_024n, "hub-controls-target-a-code", controlsAt);
    await createOptIn(repository, 56_025n, "hub-controls-target-b-code", controlsAt);
    await expect(createInvite(
      repository,
      56_021n,
      "hub-controls-officer-a-invite",
      "hub-controls-target-a-code",
      controlsAt
    )).resolves.toMatchObject({ state: "created" });
    await expect(createInvite(
      repository,
      56_022n,
      "hub-controls-officer-b-own-invite",
      "hub-controls-target-b-code",
      controlsAt
    )).resolves.toMatchObject({ state: "created" });

    const officerAHub = await readyHub(repository, 56_021n, controlsAt);
    const officerBHub = await readyHub(repository, 56_022n, controlsAt);
    leaderHub = await readyHub(repository, 56_020n, controlsAt);
    expect(new Map(officerAHub.guild.outgoingInvites.map((invite) => [invite.token, invite.canCancel])))
      .toEqual(new Map([
        ["hub-controls-officer-a-invite", true],
        ["hub-controls-officer-b-own-invite", false]
      ]));
    expect(new Map(officerBHub.guild.outgoingInvites.map((invite) => [invite.token, invite.canCancel])))
      .toEqual(new Map([
        ["hub-controls-officer-a-invite", false],
        ["hub-controls-officer-b-own-invite", true]
      ]));
    expect(leaderHub.guild.outgoingInvites.every((invite) => invite.canCancel)).toBe(true);
    await expect(repository.cancelInviteForTelegramUser(
      56_021n,
      "hub-controls-officer-b-own-invite",
      controlsAt
    )).resolves.toEqual({ state: "not-found" });
    await expect(repository.cancelInviteForTelegramUser(
      56_020n,
      "hub-controls-officer-a-invite",
      controlsAt
    )).resolves.toEqual({ state: "cancelled" });
    await expect(repository.cancelInviteForTelegramUser(
      56_020n,
      "hub-controls-officer-b-own-invite",
      controlsAt
    )).resolves.toEqual({ state: "cancelled" });
    expect(guild.guild.id).toBeTruthy();
  });

  it("paginates one stable hub row stream and resolves duplicate names by membership id", async () => {
    await seedCharacter(prisma, "page-leader", 56_101n, "Голова Сторінки", 1_000, { level: 5 });
    await seedCharacter(prisma, "page-activator", 56_102n, "Перший Учасник", 0);
    const guild = await activateGuild(repository, 56_101n, 56_102n, "page-guild", "Печатка Сторінок");
    for (let index = 0; index < 2; index += 1) {
      await seedCharacter(prisma, `page-twin-${index}`, 56_103n + BigInt(index), "Двійник", 0);
      await prisma.guildMember.create({
        data: {
          id: `page-twin-membership-${index}`,
          guildId: guild.guild.id,
          userId: `page-twin-${index}`,
          activeUserKey: `page-twin-${index}`,
          role: "member",
          joinedAt: new Date(NOW.getTime() + index + 1),
          createdAt: NOW,
          updatedAt: NOW
        }
      });
    }
    const leaderMembership = await prisma.guildMember.findFirstOrThrow({
      where: { guildId: guild.guild.id, userId: "page-leader", activeUserKey: { not: null } }
    });
    for (let index = 0; index < 6; index += 1) {
      const targetUserId = `page-invite-target-${index}`;
      await seedCharacter(prisma, targetUserId, 56_110n + BigInt(index), `Адресат ${index}`, 0);
      await prisma.guildInvite.create({
        data: {
          id: `page-invite-${index}`,
          token: `pageInvite${String(index).padStart(4, "0")}`,
          guildId: guild.guild.id,
          inviterUserId: "page-leader",
          inviterMembershipId: leaderMembership.id,
          targetUserId,
          targetName: `Адресат ${index}`,
          status: "pending",
          activeKey: `guild-invite:${guild.guild.id}:${targetUserId}`,
          expiresAt: new Date(NOW.getTime() + 93 * HOUR),
          createdAt: new Date(NOW.getTime() + index),
          updatedAt: NOW
        }
      });
    }

    const first = await readyHub(repository, 56_101n, NOW);
    const secondResult = await repository.getHubForTelegramUser(56_101n, NOW, 1);
    const overflowResult = await repository.getHubForTelegramUser(56_101n, NOW, 99);
    if (secondResult.state !== "ready" || overflowResult.state !== "ready") {
      throw new Error("Expected stable ready hub pages.");
    }
    const second = secondResult.guild;
    const overflow = overflowResult.guild;
    expect(first.guild).toMatchObject({ page: 0, hasPreviousPage: false, hasNextPage: true });
    expect(second).toMatchObject({ page: 1, hasPreviousPage: true, hasNextPage: false });
    expect(overflow.page).toBe(1);
    expect(first.guild.members).toHaveLength(4);
    expect(first.guild.outgoingInvites).toHaveLength(1);
    expect(second.members).toHaveLength(0);
    expect(second.outgoingInvites).toHaveLength(5);
    expect(new Set([...first.guild.members, ...second.members].map((member) => member.id)).size).toBe(4);
    expect(new Set([...first.guild.outgoingInvites, ...second.outgoingInvites].map((invite) => invite.token)).size)
      .toBe(6);
    expect(overflow.members).toEqual(second.members);
    expect(overflow.outgoingInvites).toEqual(second.outgoingInvites);

    const service = new GuildService(
      repository,
      {} as PartySessionService,
      { enabled: true },
      () => NOW
    );
    const duplicate = await service.findMemberForAction(56_101n, "Двійник");
    expect(duplicate).toMatchObject({ state: "ambiguous", candidates: { length: 2 } });
    if (duplicate.state !== "ambiguous") {
      throw new Error("Expected duplicate-name member selectors.");
    }
    expect(new Set(duplicate.candidates.map((member) => member.id)).size).toBe(2);
    for (const candidate of duplicate.candidates) {
      await expect(service.findMemberByIdForAction(56_101n, candidate.id, duplicate.expectedVersion))
        .resolves.toMatchObject({ state: "ready", memberId: candidate.id, memberName: "Двійник" });
    }
    const exact = await service.findMemberForAction(56_101n, "Перший Учасник");
    if (exact.state !== "ready") {
      throw new Error("Expected exact-name role target beyond invitation pagination.");
    }
    await expect(service.setMemberRoleForTelegramUser(
      56_101n,
      exact.memberId,
      "officer",
      exact.expectedVersion
    )).resolves.toMatchObject({ state: "updated" });
  });

  it("pages a real gameplay party picker, revalidates audience races, and never mutates party/combat rows", async () => {
    await seedCharacter(prisma, "party-leader", 57_001n, "Голова Ватаги", 1_000, { level: 5 });
    await seedCharacter(prisma, "party-activator", 57_002n, "Перший Учасник", 0);
    const guild = await activateGuild(repository, 57_001n, 57_002n, "party-guild", "Печатка Ватаги");
    for (let index = 0; index < 5; index += 1) {
      await seedCharacter(prisma, `party-member-${index}`, 57_010n + BigInt(index), `Ватажник ${index}`, 0);
      await prisma.guildMember.create({
        data: {
          id: `party-guild-member-${index}`,
          guildId: guild.guild.id,
          userId: `party-member-${index}`,
          activeUserKey: `party-member-${index}`,
          role: "member",
          joinedAt: new Date(NOW.getTime() + index + 1),
          createdAt: NOW,
          updatedAt: NOW
        }
      });
    }
    await seedParty(prisma, "real-party", "party-leader-character", {
      originKind: "nyz-left-passage-party.v1",
      participantCharacterIds: ["party-leader-character"]
    });
    const firstPage = await repository.getPartyPickerForTelegramUser(57_001n, "real-party", 0, NOW);
    expect(firstPage).toMatchObject({ state: "ready", candidates: { length: 5 }, hasNextPage: true });
    const secondPage = await repository.getPartyPickerForTelegramUser(57_001n, "real-party", 1, NOW);
    expect(secondPage).toMatchObject({ state: "ready", candidates: { length: 1 }, hasPreviousPage: true });

    await seedParty(prisma, "generic-party", "party-leader-character", {
      participantCharacterIds: ["party-leader-character"],
      active: false
    });
    await expect(repository.getPartyPickerForTelegramUser(57_001n, "generic-party", 0, NOW))
      .resolves.toEqual({ state: "party-ineligible" });

    if (firstPage.state !== "ready") {
      throw new Error("Expected party picker.");
    }
    const candidate = firstPage.candidates.find((member) => member.name.startsWith("Ватажник"));
    if (!candidate) {
      throw new Error("Expected a non-activator guild candidate.");
    }
    await expect(repository.resolvePartyRecipientForTelegramUser(57_001n, {
      partySessionId: firstPage.partySessionId,
      memberId: candidate.memberId,
      guildVersion: firstPage.guildVersion,
      now: NOW
    })).resolves.toMatchObject({ state: "ready", inviteToken: "token-real-party" });
    const kicked = await repository.kickMemberForTelegramUser(
      57_001n,
      candidate.memberId,
      firstPage.guildVersion,
      NOW
    );
    expect(kicked.state).toBe("updated");
    await expect(repository.resolvePartyRecipientForTelegramUser(57_001n, {
      partySessionId: firstPage.partySessionId,
      memberId: candidate.memberId,
      guildVersion: firstPage.guildVersion,
      now: NOW
    })).resolves.toEqual({ state: "stale" });

    await prisma.groupCombatSession.create({
      data: {
        id: "party-isolation-combat",
        partySessionId: "real-party",
        encounterKey: "isolation",
        rulesVersion: "v1",
        status: "active",
        turn: 1,
        version: 1,
        deliveryRevision: 1,
        deliveryPending: false,
        stateJson: {},
        turnExpiresAt: new Date(NOW.getTime() + HOUR),
        createdAt: NOW,
        updatedAt: NOW
      }
    });
    const before = {
      parties: await prisma.partySession.count(),
      combats: await prisma.groupCombatSession.count()
    };
    const activatorHub = await readyHub(repository, 57_002n, NOW);
    await expect(repository.leaveForTelegramUser(57_002n, activatorHub.guild.version, NOW))
      .resolves.toMatchObject({ state: "left" });
    expect(await prisma.partySession.count()).toBe(before.parties);
    expect(await prisma.groupCombatSession.count()).toBe(before.combats);
  });

  it("allows restart past an expired generic party while protecting ordinary and automatic-start recruiting contracts", async () => {
    const characters = new PrismaCharacterRepository(prisma);
    await seedCharacter(prisma, "restart-ordinary", 57_101n, "Звичайний Збір", 0);
    await seedParty(prisma, "restart-ordinary-party", "restart-ordinary-character", {
      participantCharacterIds: ["restart-ordinary-character"],
      expiresAt: new Date(Date.now() + HOUR)
    });
    await expect(characters.restartByTelegramUserId(57_101n)).resolves.toBe("active-party");
    await expect(prisma.partySession.count({ where: { id: "restart-ordinary-party" } })).resolves.toBe(1);

    await seedCharacter(prisma, "restart-big-barrel", 57_102n, "Бочковий Збір", 0);
    await seedParty(prisma, "restart-big-barrel-party", "restart-big-barrel-character", {
      originLocationId: "barrel.big-brother",
      participantCharacterIds: ["restart-big-barrel-character"],
      expiresAt: new Date(Date.now() - HOUR)
    });
    await expect(characters.restartByTelegramUserId(57_102n)).resolves.toBe("active-party");
    await expect(prisma.partySession.count({ where: { id: "restart-big-barrel-party" } })).resolves.toBe(1);

    await seedCharacter(prisma, "restart-expired-generic", 57_103n, "Забутий Збір", 0);
    await seedParty(prisma, "restart-expired-generic-party", "restart-expired-generic-character", {
      participantCharacterIds: ["restart-expired-generic-character"],
      expiresAt: new Date(Date.now() - HOUR)
    });
    await expect(characters.restartByTelegramUserId(57_103n)).resolves.toBe("deleted");
    await expect(prisma.character.count({ where: { id: "restart-expired-generic-character" } })).resolves.toBe(0);
    await expect(characters.restartByTelegramUserId(57_103n)).resolves.toBe("no-character");
  });

  it("blocks real restart for recruiting party leader/member and active group combat, then preserves User guild identity after safe recreate", async () => {
    await seedCharacter(prisma, "restart-leader", 58_001n, "Голова До Рестарту", 1_000, { level: 5 });
    await seedCharacter(prisma, "restart-member", 58_002n, "Учасник До Рестарту", 0);
    await activateGuild(repository, 58_001n, 58_002n, "restart-guild", "Печатка Рестарту");
    await seedParty(prisma, "restart-party", "restart-leader-character", {
      originKind: "nyz-left-passage-party.v1",
      participantCharacterIds: ["restart-leader-character", "restart-member-character"]
    });
    const characters = new PrismaCharacterRepository(prisma);
    await expect(characters.restartByTelegramUserId(58_001n)).resolves.toBe("active-party");
    await expect(characters.restartByTelegramUserId(58_002n)).resolves.toBe("active-party");
    await expect(prisma.partySession.count({ where: { id: "restart-party" } })).resolves.toBe(1);
    await expect(prisma.partyParticipant.count({ where: { sessionId: "restart-party" } })).resolves.toBe(2);

    await prisma.partySession.update({
      where: { id: "restart-party" },
      data: { status: "expired", activeLeaderKey: null, updatedAt: new Date(NOW.getTime() + 1) }
    });
    await prisma.partyParticipant.updateMany({
      where: { sessionId: "restart-party" },
      data: { activeMembershipKey: null, status: "left", leftAt: new Date(NOW.getTime() + 1), updatedAt: new Date(NOW.getTime() + 1) }
    });
    await prisma.groupCombatSession.create({
      data: {
        id: "restart-combat",
        partySessionId: "restart-party",
        encounterKey: "restart",
        rulesVersion: "v1",
        status: "active",
        turn: 1,
        version: 1,
        deliveryRevision: 1,
        deliveryPending: false,
        stateJson: {},
        turnExpiresAt: new Date(NOW.getTime() + HOUR),
        createdAt: NOW,
        updatedAt: NOW,
        participants: {
          create: {
            id: "restart-combat-member",
            characterId: "restart-member-character",
            remortCount: 0,
            rosterOrder: 0,
            snapshotJson: {},
            contributionJson: {},
            createdAt: NOW,
            updatedAt: NOW
          }
        }
      }
    });
    await expect(characters.restartByTelegramUserId(58_002n)).resolves.toBe("active-combat");
    await expect(prisma.groupCombatSession.count({ where: { id: "restart-combat" } })).resolves.toBe(1);
    await prisma.groupCombatParticipant.deleteMany({ where: { sessionId: "restart-combat" } });
    await prisma.groupCombatSession.update({ where: { id: "restart-combat" }, data: { status: "won" } });

    await expect(characters.restartByTelegramUserId(58_002n)).resolves.toBe("deleted");
    await expect(prisma.partySession.count({ where: { id: "restart-party" } })).resolves.toBe(1);
    await expect(prisma.groupCombatSession.count({ where: { id: "restart-combat" } })).resolves.toBe(1);
    await prisma.character.create({
      data: {
        id: "restart-member-new-character",
        userId: "restart-member",
        name: "Учасник Після Рестарту",
        raceId: "human",
        classId: "warrior",
        level: 1,
        statsJson: {},
        createdAt: new Date(NOW.getTime() + 2),
        updatedAt: new Date(NOW.getTime() + 2)
      }
    });
    const restartedRepository = new PrismaGuildRepository(prisma);
    const memberHub = await readyHub(restartedRepository, 58_002n, new Date(NOW.getTime() + 2));
    expect(memberHub.guild.members.some((member) => member.name === "Учасник Після Рестарту")).toBe(true);
    expect((await readyHub(restartedRepository, 58_001n, new Date(NOW.getTime() + 2))).guild.viewerRole).toBe("leader");
  });

  it("keeps audit private and migration rollback/restore preserves populated unrelated party/combat rows", async () => {
    const audits = await prisma.guildAudit.findMany({ select: { dedupeKey: true, payloadJson: true } });
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toMatch(/invite-[A-Za-z0-9_-]{6,}/u);
    expect(serialized).not.toMatch(/5[1-8]_\d{3}/u);
    expect(serialized).not.toContain("telegramUserId");
    const counters = await repository.getFunnelCounters();
    expect(counters.guildsCreated).toBeGreaterThanOrEqual(1);
    expect(counters.invitesAccepted).toBeGreaterThanOrEqual(1);

    const rollbackDir = await mkdtemp(join(tmpdir(), "kvestarnia-guild-rollback-"));
    const rollbackPrisma = createPrisma(join(rollbackDir, "rollback.db"));
    try {
      await createBaseSchema(rollbackPrisma);
      await applySqlFile(rollbackPrisma, `prisma/migrations/${MIGRATION}/migration.sql`);
      await applySqlFile(rollbackPrisma, `prisma/migrations/${CREST_MIGRATION}/migration.sql`);
      await seedCharacter(rollbackPrisma, "rollback-user", 59_001n, "Незалежний", 0);
      await seedParty(rollbackPrisma, "rollback-party", "rollback-user-character", {
        originKind: "nyz-left-passage-party.v1",
        participantCharacterIds: ["rollback-user-character"]
      });
      await rollbackPrisma.groupCombatSession.create({
        data: {
          id: "rollback-combat",
          partySessionId: "rollback-party",
          encounterKey: "rollback",
          rulesVersion: "v1",
          status: "won",
          turn: 1,
          version: 1,
          deliveryRevision: 1,
          deliveryPending: false,
          stateJson: {},
          turnExpiresAt: NOW,
          completedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW
        }
      });
      const unrelatedCounts = { users: 1, characters: 1, parties: 1, combats: 1 };
      await applySqlFile(rollbackPrisma, `prisma/migrations/${CREST_MIGRATION}/rollback.sql`);
      expect(await tableNames(rollbackPrisma)).toContain("guilds");
      expect(await tableNames(rollbackPrisma)).not.toContain("guild_crest_upload_drafts");
      await expectUnrelatedCounts(rollbackPrisma, unrelatedCounts);
      await applySqlFile(rollbackPrisma, `prisma/migrations/${CREST_MIGRATION}/migration.sql`);
      expect(await tableNames(rollbackPrisma)).toContain("guild_crest_upload_drafts");
      await expectUnrelatedCounts(rollbackPrisma, unrelatedCounts);
      await applySqlFile(rollbackPrisma, `prisma/migrations/${CREST_MIGRATION}/rollback.sql`);
      await applySqlFile(rollbackPrisma, `prisma/migrations/${MIGRATION}/rollback.sql`);
      expect(await tableNames(rollbackPrisma)).not.toContain("guilds");
      await expectUnrelatedCounts(rollbackPrisma, unrelatedCounts);
      await applySqlFile(rollbackPrisma, `prisma/migrations/${MIGRATION}/migration.sql`);
      await applySqlFile(rollbackPrisma, `prisma/migrations/${CREST_MIGRATION}/migration.sql`);
      expect(await tableNames(rollbackPrisma)).toContain("guilds");
      expect(await tableNames(rollbackPrisma)).toContain("guild_crest_upload_drafts");
      await expectUnrelatedCounts(rollbackPrisma, unrelatedCounts);
    } finally {
      await rollbackPrisma.$disconnect();
      await rm(rollbackDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }, 60_000);

  it("keeps the Nest location-bound and exposes only the active public directory contract", async () => {
    await prisma.guild.updateMany({
      where: { status: { in: ["forming", "active"] } },
      data: { status: "disbanded", disbandedAt: NOW, reservationKey: null, updatedAt: NOW }
    });
    await seedCharacter(prisma, "directory-viewer", 60_001n, "Читачка", 0, { level: 5 });
    await prisma.user.update({
      where: { id: "directory-viewer" },
      data: { lastSeenLocationId: "location.korchma.deep", lastActionAt: NOW }
    });

    const rows = [
      ["directory-guild-f", "жовта", "Жовта Варениця", "🟡"],
      ["directory-guild-a2", "абетка", "Абетка Друга", "🦉"],
      ["directory-guild-d", "дуб", "Дубова Лава", "🌳"],
      ["directory-guild-a1", "абетка", "Абетка Перша", "🛡️"],
      ["directory-guild-c", "вишня", "Вишнева Пошта", "🍒"],
      ["directory-guild-b", "бочка", "Бочкова Рада", "🥨"]
    ] as const;
    for (const [guildId, normalizedName, displayName, crest] of rows) {
      const userId = `${guildId}-founder`;
      await seedCharacter(prisma, userId, BigInt(60_100 + rows.findIndex((row) => row[0] === guildId)), displayName, 0);
      await prisma.guild.create({
        data: {
          id: guildId,
          normalizedName,
          reservationKey: guildId,
          displayName,
          crest,
          description: `<b>${displayName}</b>`,
          founderUserId: userId,
          leaderUserId: userId,
          status: "active",
          version: 2,
          charterExpiresAt: new Date(NOW.getTime() + DAY),
          activatedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
          members: {
            create: {
              id: `${guildId}-member`,
              userId,
              activeUserKey: userId,
              role: "leader",
              joinedAt: NOW,
              createdAt: NOW,
              updatedAt: NOW
            }
          }
        }
      });
    }
    await seedCharacter(prisma, "directory-extra", 60_200n, "Чинна Учасниця", 0);
    await seedCharacter(prisma, "directory-history", 60_201n, "Колишня Учасниця", 0);
    await prisma.guildMember.createMany({
      data: [
        {
          id: "directory-extra-member",
          guildId: "directory-guild-a1",
          userId: "directory-extra",
          activeUserKey: "directory-extra",
          role: "member",
          joinedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW
        },
        {
          id: "directory-history-member",
          guildId: "directory-guild-a1",
          userId: "directory-history",
          activeUserKey: null,
          role: "member",
          joinedAt: new Date(NOW.getTime() - DAY),
          leftAt: NOW,
          createdAt: new Date(NOW.getTime() - DAY),
          updatedAt: NOW
        }
      ]
    });
    await seedCharacter(prisma, "directory-forming", 60_202n, "Формувальник", 1_000, { level: 5 });
    await createAndConfirm(repository, 60_202n, "directoryForming93", "Ще Не Чинна");

    const first = await repository.getPublicDirectoryForTelegramUser(
      60_001n,
      "location.korchma.deep",
      NOW,
      0
    );
    expect(first).toMatchObject({ state: "ready", page: 0, hasPreviousPage: false, hasNextPage: true });
    expect(first.state === "ready" ? first.guilds.map((guild) => guild.id) : []).toEqual([
      "directory-guild-a1",
      "directory-guild-a2",
      "directory-guild-b",
      "directory-guild-c",
      "directory-guild-d"
    ]);
    expect(first.state === "ready" ? first.guilds[0]?.memberCount : null).toBe(2);
    expect(Object.keys(first.state === "ready" ? first.guilds[0]! : {})).toEqual([
      "id",
      "displayName",
      "crest",
      "hasCustomCrest",
      "memberCount"
    ]);
    await expect(repository.getPublicDirectoryForTelegramUser(
      60_001n,
      "location.korchma.deep",
      NOW,
      99
    )).resolves.toMatchObject({
      state: "ready",
      page: 1,
      hasPreviousPage: true,
      hasNextPage: false,
      guilds: [{ id: "directory-guild-f", memberCount: 1 }]
    });

    const profile = await repository.getPublicGuildForTelegramUser(
      60_001n,
      "directory-guild-a1",
      "location.korchma.deep",
      NOW
    );
    expect(profile).toMatchObject({ state: "ready", guild: { memberCount: 2 } });
    await prisma.guild.update({ where: { id: "directory-guild-a1" }, data: { status: "disbanded", disbandedAt: NOW } });
    await expect(repository.getPublicGuildForTelegramUser(
      60_001n,
      "directory-guild-a1",
      "location.korchma.deep",
      NOW
    )).resolves.toEqual({ state: "unavailable" });

    await prisma.user.update({ where: { id: "directory-viewer" }, data: { lastSeenLocationId: "location.korchma.hall" } });
    await expect(repository.getNestForTelegramUser(
      60_001n,
      "location.korchma.deep",
      NOW
    )).resolves.toEqual({ state: "wrong-location" });
    await expect(repository.getPublicDirectoryForTelegramUser(
      60_001n,
      "location.korchma.deep",
      NOW
    )).resolves.toEqual({ state: "wrong-location" });
  });

  it("reserves catalog crests transactionally across lifecycle and create/edit races", async () => {
    const base = 61_000n;
    for (let index = 1; index <= 12; index += 1) {
      await seedCharacter(prisma, `crest-race-${index}`, base + BigInt(index), `Гербознавець ${index}`, 1_000, { level: 5 });
    }

    const initial = await repository.getCrestPickerForTelegramUser(base + 1n, "creation", NOW);
    expect(initial.state).toBe("ready");
    if (initial.state !== "ready") {
      throw new Error(`Expected ready crest picker, got ${initial.state}`);
    }
    expect(initial.availableCrests).toContain("🐸");
    expect(initial.availableCrests).toContain("🦉");

    const frog = await createCatalogAndConfirm(repository, base + 1n, "crest-frog", "Жабʼяча Печатка", "🐸");
    await prisma.guild.update({ where: { id: frog.guild.id }, data: { status: "active", activatedAt: NOW } });
    const otherPicker = await repository.getCrestPickerForTelegramUser(base + 2n, "creation", NOW);
    expect(otherPicker.state === "ready" ? otherPicker.availableCrests : []).not.toContain("🐸");
    const ownPicker = await repository.getCrestPickerForTelegramUser(base + 1n, "profile", NOW);
    expect(ownPicker.state === "ready" ? ownPicker.availableCrests : []).toContain("🐸");

    const owl = await createCatalogAndConfirm(repository, base + 2n, "crest-owl", "Совина Печатка", "🦉");
    const expiryNow = new Date(owl.guild.charterExpiresAt.getTime() + 1);
    await seedExpiredGuildBacklog(prisma, "crest-owner", "crest-race-2", expiryNow);
    const releasedPicker = await repository.getCrestPickerForTelegramUser(base + 3n, "creation", expiryNow);
    expect(releasedPicker.state === "ready" ? releasedPicker.availableCrests : []).toContain("🦉");
    await expect(prisma.guild.findUniqueOrThrow({ where: { id: owl.guild.id }, select: { status: true, crestReservationKey: true } }))
      .resolves.toEqual({ status: "expired", crestReservationKey: null });

    await expect(repository.deleteForTelegramUser(base + 1n, (await readyHub(repository, base + 1n, NOW)).guild.version, NOW))
      .resolves.toMatchObject({ state: "deleted" });
    expect((await repository.getCrestPickerForTelegramUser(base + 3n, "creation", NOW)).state).toBe("ready");
    const afterDisband = await repository.getCrestPickerForTelegramUser(base + 3n, "creation", NOW);
    expect(afterDisband.state === "ready" ? afterDisband.availableCrests : []).toContain("🐸");

    await createCatalogIntent(repository, base + 3n, "crest-create-a", "Вовча Перша", "🐺");
    await createCatalogIntent(repository, base + 4n, "crest-create-b", "Вовча Друга", "🐺");
    const createRace = await Promise.all([
      repository.confirmCreateForTelegramUser(base + 3n, "crest-create-a", NOW),
      repository.confirmCreateForTelegramUser(base + 4n, "crest-create-b", NOW)
    ]);
    expect(createRace.filter((result) => result.state === "created")).toHaveLength(1);
    expect(createRace.filter((result) => result.state === "crest-taken")).toHaveLength(1);
    const createWinnerIndex = createRace.findIndex((result) => result.state === "created");
    const createLoserId = createWinnerIndex === 0 ? base + 4n : base + 3n;
    expect(await goldFor(prisma, createLoserId)).toBe(1_000);
    const createLoserUserId = createWinnerIndex === 0 ? "crest-race-4" : "crest-race-3";
    expect(await prisma.guildFounderCooldown.count({ where: { userId: createLoserUserId } })).toBe(0);
    await expect(prisma.guildCreationIntent.findUniqueOrThrow({
      where: { token: createWinnerIndex === 0 ? "crest-create-b" : "crest-create-a" },
      select: { status: true, activeUserKey: true, guildId: true }
    })).resolves.toEqual({ status: "conflict", activeUserKey: null, guildId: null });

    const editOwner = await createCatalogAndConfirm(repository, base + 5n, "crest-edit-owner", "Місячна Печатка", "🌙");
    await createCatalogIntent(repository, base + 6n, "crest-create-edit", "Лисяча Печатка", "🦊");
    const createEditRace = await Promise.all([
      repository.confirmCreateForTelegramUser(base + 6n, "crest-create-edit", NOW),
      repository.updateProfileForTelegramUser(base + 5n, {
        crest: "🦊",
        description: "Редакція перегонів.",
        expectedVersion: editOwner.guild.version,
        now: NOW
      })
    ]);
    expect(createEditRace.filter((result) => result.state === "created" || result.state === "updated")).toHaveLength(1);
    expect(createEditRace.filter((result) => result.state === "crest-taken")).toHaveLength(1);

    const editA = await createCatalogAndConfirm(repository, base + 7n, "crest-edit-a", "Грибна Печатка", "🍄");
    const editB = await createCatalogAndConfirm(repository, base + 8n, "crest-edit-b", "Крендельна Печатка", "🥨");
    const editRace = await Promise.all([
      repository.updateProfileForTelegramUser(base + 7n, {
        crest: "🔥", description: "Вогонь А.", expectedVersion: editA.guild.version, now: NOW
      }),
      repository.updateProfileForTelegramUser(base + 8n, {
        crest: "🔥", description: "Вогонь Б.", expectedVersion: editB.guild.version, now: NOW
      })
    ]);
    expect(editRace.filter((result) => result.state === "updated")).toHaveLength(1);
    expect(editRace.filter((result) => result.state === "crest-taken")).toHaveLength(1);

    await prisma.guild.updateMany({
      where: { id: { in: (await prisma.guild.findMany({
        where: { founderUserId: { in: Array.from({ length: 8 }, (_, index) => `crest-race-${index + 1}`) } },
        select: { id: true }
      })).map((row) => row.id) } },
      data: { status: "disbanded", disbandedAt: NOW, reservationKey: null, crestReservationKey: null, updatedAt: NOW }
    });

    await prisma.guild.createMany({
      data: GUILD_CREST_CATALOG.map((crest, index) => ({
        id: `crest-full-${index}`,
        normalizedName: `повний герб ${index}`,
        reservationKey: `повний герб ${index}`,
        displayName: `Повний Герб ${index}`,
        crest,
        crestKind: "catalog",
        crestReservationKey: crest,
        description: "Каталожне місце зайняте.",
        founderUserId: "crest-race-1",
        leaderUserId: "crest-race-1",
        status: "active",
        version: 1,
        charterExpiresAt: new Date(NOW.getTime() + 7 * DAY),
        activatedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW
      }))
    });
    const fullPicker = await repository.getCrestPickerForTelegramUser(base + 9n, "creation", NOW);
    expect(fullPicker).toMatchObject({ state: "ready", availableCrests: [] });
    await prisma.guild.updateMany({
      where: { id: { startsWith: "crest-full-" } },
      data: { status: "disbanded", disbandedAt: NOW, reservationKey: null, crestReservationKey: null, updatedAt: NOW }
    });
  }, 60_000);

  it("persists restart-safe custom crest drafts without exposing Telegram media identifiers", async () => {
    await seedCharacter(prisma, "custom-founder", 62_001n, "Малярка", 1_000, { level: 5 });
    await seedCharacter(prisma, "custom-joiner", 62_002n, "Глядач", 0, { level: 1 });
    const uploadToken = "customUploadToken13";
    await expect(repository.beginCrestUploadForTelegramUser(62_001n, {
      token: uploadToken,
      purpose: "creation",
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 23 * 60_000)
    })).resolves.toMatchObject({ state: "ready", token: uploadToken, purpose: "creation" });
    await expect(repository.validateCrestUploadDraftForTelegramUser(62_001n, {
      token: uploadToken,
      purpose: "creation",
      now: NOW
    })).resolves.toMatchObject({ state: "ready", token: uploadToken, purpose: "creation" });
    await expect(repository.validateCrestUploadDraftForTelegramUser(62_001n, {
      token: "forgedUploadToken13",
      purpose: "creation",
      now: NOW
    })).resolves.toEqual({ state: "not-found" });
    const media = {
      fileId: "telegram-file-id-secret-creation",
      fileUniqueId: "telegram-unique-id-secret-creation",
      width: 1024,
      height: 1024,
      fileSize: 93_000
    };
    await expect(repository.storeCrestUploadForTelegramUser(62_001n, {
      token: uploadToken,
      media: { ...media, width: 63 },
      now: NOW
    })).resolves.toEqual({ state: "invalid-media" });
    await expect(repository.storeCrestUploadForTelegramUser(62_001n, {
      token: uploadToken,
      media: { ...media, fileSize: null },
      now: NOW
    })).resolves.toEqual({ state: "invalid-media" });
    await expect(prisma.guildCrestUploadDraft.findUniqueOrThrow({
      where: { token: uploadToken },
      select: { status: true, fileId: true }
    })).resolves.toEqual({ status: "pending", fileId: null });
    await prisma.guildCrestUploadDraft.update({
      where: { token: uploadToken },
      data: {
        status: "uploaded",
        fileId: media.fileId,
        fileUniqueId: "persisted-invalid-unique",
        width: media.width,
        height: media.height,
        fileSize: null
      }
    });
    await expect(repository.createCustomIntentForTelegramUser(62_001n, {
      token: "missingSizeIntent13",
      uploadToken,
      displayName: "Невідомий Розмір",
      normalizedName: "невідомий розмір",
      description: "Писар не вгадує байти.",
      goldCost: GUILD_CREATION_GOLD,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 13 * 60_000)
    })).resolves.toEqual({ state: "upload-unavailable" });
    await prisma.guildCrestUploadDraft.update({
      where: { token: uploadToken },
      data: { fileSize: GUILD_CREST_MAX_FILE_SIZE + 1 }
    });
    await expect(repository.createCustomIntentForTelegramUser(62_001n, {
      token: "oversizedIntent13",
      uploadToken,
      displayName: "Завеликий Розмір",
      normalizedName: "завеликий розмір",
      description: "Писар рахує байти.",
      goldCost: GUILD_CREATION_GOLD,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 13 * 60_000)
    })).resolves.toEqual({ state: "upload-unavailable" });
    await expect(repository.storeCrestUploadForTelegramUser(62_001n, { token: uploadToken, media, now: NOW }))
      .resolves.toMatchObject({ state: "ready", purpose: "creation" });
    await expect(repository.storeCrestUploadForTelegramUser(62_001n, { token: uploadToken, media, now: NOW }))
      .resolves.toMatchObject({ state: "replayed", purpose: "creation" });

    const restartedAfterUpload = new PrismaGuildRepository(prisma);
    const preview = await restartedAfterUpload.createCustomIntentForTelegramUser(62_001n, {
      token: "customIntentToken13",
      uploadToken,
      displayName: "Мальований Статут",
      normalizedName: "мальований статут",
      description: "Власна геральдика без сирих ідентифікаторів.",
      goldCost: GUILD_CREATION_GOLD,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 13 * 60_000)
    });
    expect(preview).toMatchObject({
      state: "ready",
      intent: { token: "customIntentToken13", crest: "🖼️", crestKind: "custom", hasCustomCrest: true }
    });
    expect(JSON.stringify(preview)).not.toContain(media.fileId);
    expect(JSON.stringify(preview)).not.toContain(media.fileUniqueId);
    await expect(restartedAfterUpload.storeCrestUploadForTelegramUser(62_001n, { token: uploadToken, media, now: NOW }))
      .resolves.toMatchObject({ state: "replayed", intentToken: "customIntentToken13" });
    await expect(restartedAfterUpload.getCreationCrestMediaForTelegramUser(62_001n, "customIntentToken13", NOW))
      .resolves.toEqual({ state: "ready", media });

    const restartedBeforeConfirm = new PrismaGuildRepository(prisma);
    const confirmed = await restartedBeforeConfirm.confirmCreateForTelegramUser(62_001n, "customIntentToken13", NOW);
    expect(confirmed).toMatchObject({ state: "created", guild: { crest: "🖼️", hasCustomCrest: true } });
    if (confirmed.state !== "created") {
      throw new Error("Expected custom guild creation.");
    }
    await createOptIn(restartedBeforeConfirm, 62_002n, "customJoinCode13", NOW);
    await createInvite(restartedBeforeConfirm, 62_001n, "customJoinInvite13", "customJoinCode13", NOW);
    await expect(restartedBeforeConfirm.acceptInviteForTelegramUser(62_002n, "customJoinInvite13", NOW))
      .resolves.toMatchObject({ state: "accepted" });
    await prisma.user.update({ where: { id: "custom-joiner" }, data: { lastSeenLocationId: "location.korchma.deep" } });
    const publicProfile = await restartedBeforeConfirm.getPublicGuildForTelegramUser(
      62_002n,
      confirmed.guild.id,
      "location.korchma.deep",
      NOW
    );
    const customDirectoryRow = publicProfile.state === "ready" ? publicProfile.guild : undefined;
    expect(customDirectoryRow).toMatchObject({ crest: "🖼️", hasCustomCrest: true, memberCount: 2 });
    expect(JSON.stringify(customDirectoryRow)).not.toContain("telegram-");

    const profileHub = await readyHub(restartedBeforeConfirm, 62_001n, NOW);
    await expect(restartedBeforeConfirm.beginCrestUploadForTelegramUser(62_001n, {
      token: "customProfileUpload13",
      purpose: "profile",
      expectedGuildVersion: profileHub.guild.version,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 23 * 60_000)
    })).resolves.toMatchObject({ state: "ready", expectedGuildVersion: profileHub.guild.version });
    const replacementMedia = {
      fileId: "telegram-file-id-secret-profile",
      fileUniqueId: "telegram-unique-id-secret-profile",
      width: 512,
      height: 768,
      fileSize: 42_000
    };
    await prisma.guildCrestUploadDraft.update({
      where: { token: "customProfileUpload13" },
      data: {
        status: "uploaded",
        fileId: "persisted-oversized-profile-file",
        fileUniqueId: "persisted-oversized-profile-unique",
        width: 512,
        height: 768,
        fileSize: GUILD_CREST_MAX_FILE_SIZE + 1
      }
    });
    await expect(restartedBeforeConfirm.updateCustomProfileForTelegramUser(62_001n, {
      uploadToken: "customProfileUpload13",
      description: "Це не має змінити профіль.",
      now: NOW
    })).resolves.toEqual({ state: "not-found" });
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: confirmed.guild.id },
      select: { crestFileId: true, description: true }
    })).resolves.toEqual({
      crestFileId: media.fileId,
      description: "Власна геральдика без сирих ідентифікаторів."
    });
    await restartedBeforeConfirm.storeCrestUploadForTelegramUser(62_001n, {
      token: "customProfileUpload13", media: replacementMedia, now: NOW
    });
    await expect(restartedBeforeConfirm.updateCustomProfileForTelegramUser(62_001n, {
      uploadToken: "customProfileUpload13",
      description: "Новий власний герб.",
      now: NOW
    })).resolves.toMatchObject({ state: "updated", guild: { crest: "🖼️", hasCustomCrest: true } });
    await expect(restartedBeforeConfirm.updateCustomProfileForTelegramUser(62_001n, {
      uploadToken: "customProfileUpload13",
      description: "Повтор не переписує профіль.",
      now: NOW
    })).resolves.toMatchObject({ state: "updated" });
    const afterCustomReplacement = await readyHub(restartedBeforeConfirm, 62_001n, NOW);
    const joinerMembership = await prisma.guildMember.findUniqueOrThrow({
      where: { activeUserKey: "custom-joiner" },
      select: { id: true }
    });
    await expect(restartedBeforeConfirm.setMemberRoleForTelegramUser(
      62_001n,
      joinerMembership.id,
      "officer",
      afterCustomReplacement.guild.version,
      NOW
    )).resolves.toMatchObject({ state: "updated" });
    await seedCharacter(prisma, "custom-outsider", 62_003n, "Стороння", 0, { level: 1 });
    const beforePreserveHub = await readyHub(restartedBeforeConfirm, 62_001n, NOW);
    const beforePreserve = await prisma.guild.findUniqueOrThrow({
      where: { id: confirmed.guild.id },
      select: {
        crest: true,
        crestKind: true,
        crestReservationKey: true,
        crestFileId: true,
        crestFileUniqueId: true,
        crestWidth: true,
        crestHeight: true,
        crestFileSize: true,
        version: true
      }
    });
    await expect(restartedBeforeConfirm.updateProfilePreservingCustomCrestForTelegramUser(62_001n, {
      description: "Лише новий опис; герб той самий.",
      expectedVersion: beforePreserveHub.guild.version,
      now: NOW
    })).resolves.toMatchObject({
      state: "updated",
      guild: { crest: "🖼️", hasCustomCrest: true, description: "Лише новий опис; герб той самий." }
    });
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: confirmed.guild.id },
      select: {
        crest: true,
        crestKind: true,
        crestReservationKey: true,
        crestFileId: true,
        crestFileUniqueId: true,
        crestWidth: true,
        crestHeight: true,
        crestFileSize: true,
        version: true
      }
    })).resolves.toEqual({ ...beforePreserve, version: beforePreserve.version + 1 });
    await expect(restartedBeforeConfirm.updateProfilePreservingCustomCrestForTelegramUser(62_001n, {
      description: "Старий повтор.",
      expectedVersion: beforePreserveHub.guild.version,
      now: NOW
    })).resolves.toEqual({ state: "stale" });
    await expect(restartedBeforeConfirm.updateProfilePreservingCustomCrestForTelegramUser(62_002n, {
      description: "Офіцерка не змінює профіль.",
      expectedVersion: beforePreserveHub.guild.version + 1,
      now: NOW
    })).resolves.toEqual({ state: "forbidden" });
    await expect(restartedBeforeConfirm.updateProfilePreservingCustomCrestForTelegramUser(62_003n, {
      description: "Стороння не змінює профіль.",
      expectedVersion: beforePreserveHub.guild.version + 1,
      now: NOW
    })).resolves.toEqual({ state: "not-member" });
    await expect(prisma.guildAudit.count({
      where: { guildId: confirmed.guild.id, eventType: "profile.updated" }
    })).resolves.toBe(2);
    const profileAudits = await prisma.guildAudit.findMany({
      where: { guildId: confirmed.guild.id, eventType: "profile.updated" },
      select: { payloadJson: true }
    });
    expect(profileAudits.map((audit) => audit.payloadJson)).toEqual(expect.arrayContaining([
      { crestChange: "custom" },
      { crestChange: "preserved-custom" }
    ]));
    expect(JSON.stringify(profileAudits)).not.toContain("telegram-");

    const afterCustom = await readyHub(restartedBeforeConfirm, 62_001n, NOW);
    await restartedBeforeConfirm.beginCrestUploadForTelegramUser(62_001n, {
      token: "customStaleUpload13",
      purpose: "profile",
      expectedGuildVersion: afterCustom.guild.version,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 23 * 60_000)
    });
    await expect(restartedBeforeConfirm.updateProfileForTelegramUser(62_001n, {
      crest: "🛡️",
      description: "Повернення до каталогу.",
      expectedVersion: afterCustom.guild.version,
      now: NOW
    })).resolves.toMatchObject({ state: "updated", guild: { crest: "🛡️", hasCustomCrest: false } });
    await expect(restartedBeforeConfirm.storeCrestUploadForTelegramUser(62_001n, {
      token: "customStaleUpload13", media: replacementMedia, now: NOW
    })).resolves.toEqual({ state: "stale" });
    await expect(prisma.guildCrestUploadDraft.findUniqueOrThrow({
      where: { token: "customStaleUpload13" },
      select: { fileId: true, fileUniqueId: true, status: true }
    })).resolves.toEqual({ fileId: null, fileUniqueId: null, status: "pending" });

    const afterCatalog = await readyHub(restartedBeforeConfirm, 62_001n, NOW);
    await restartedBeforeConfirm.beginCrestUploadForTelegramUser(62_001n, {
      token: "customReturnUpload13",
      purpose: "profile",
      expectedGuildVersion: afterCatalog.guild.version,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 23 * 60_000)
    });
    await restartedBeforeConfirm.storeCrestUploadForTelegramUser(62_001n, {
      token: "customReturnUpload13", media, now: NOW
    });
    await expect(restartedBeforeConfirm.updateCustomProfileForTelegramUser(62_001n, {
      uploadToken: "customReturnUpload13", description: "Знову власний.", now: NOW
    })).resolves.toMatchObject({ state: "updated", guild: { crest: "🖼️", hasCustomCrest: true } });
    await expect(prisma.guild.findUniqueOrThrow({
      where: { id: confirmed.guild.id },
      select: { crestReservationKey: true, crestFileId: true }
    })).resolves.toEqual({ crestReservationKey: null, crestFileId: media.fileId });

    const safeAudit = JSON.stringify(await prisma.guildAudit.findMany({
      where: { guildId: confirmed.guild.id },
      select: { eventType: true, payloadJson: true }
    }));
    expect(safeAudit).toContain("crestChange");
    expect(safeAudit).not.toContain("telegram-file-id");
    expect(safeAudit).not.toContain("telegram-unique-id");
  }, 60_000);

  it("replaces a consumed custom creation crest with the latest upload across restarts", async () => {
    const telegramUserId = 62_010n;
    const userId = "custom-replace-founder";
    const mediaA = {
      fileId: "replace-secret-file-a",
      fileUniqueId: "replace-secret-unique-a",
      width: 512,
      height: 512,
      fileSize: 42_000
    };
    const mediaB = {
      fileId: "replace-secret-file-b",
      fileUniqueId: "replace-secret-unique-b",
      width: 1024,
      height: 768,
      fileSize: 93_000
    };
    await seedCharacter(prisma, userId, telegramUserId, "Перемальовувачка", 1_000, { level: 5 });

    await repository.beginCrestUploadForTelegramUser(telegramUserId, {
      token: "replaceUploadA13",
      purpose: "creation",
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 23 * 60_000)
    });
    await repository.storeCrestUploadForTelegramUser(telegramUserId, {
      token: "replaceUploadA13",
      media: mediaA,
      now: NOW
    });
    const previewA = await repository.createCustomIntentForTelegramUser(telegramUserId, {
      token: "replaceIntentA13",
      uploadToken: "replaceUploadA13",
      displayName: "Перший Мальований Статут",
      normalizedName: "перший мальований статут",
      description: "Перший ескіз.",
      goldCost: GUILD_CREATION_GOLD,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 13 * 60_000)
    });
    expect(previewA).toMatchObject({ state: "ready", intent: { token: "replaceIntentA13" } });

    const restartedBeforeReplacement = new PrismaGuildRepository(prisma);
    await restartedBeforeReplacement.beginCrestUploadForTelegramUser(telegramUserId, {
      token: "replaceUploadB13",
      purpose: "creation",
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 23 * 60_000)
    });
    await restartedBeforeReplacement.storeCrestUploadForTelegramUser(telegramUserId, {
      token: "replaceUploadB13",
      media: mediaB,
      now: NOW
    });

    const restartedBeforePreview = new PrismaGuildRepository(prisma);
    const previewB = await restartedBeforePreview.createCustomIntentForTelegramUser(telegramUserId, {
      token: "replaceIntentB13",
      uploadToken: "replaceUploadB13",
      displayName: "Другий Мальований Статут",
      normalizedName: "другий мальований статут",
      description: "Остаточний ескіз.",
      goldCost: GUILD_CREATION_GOLD,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 13 * 60_000)
    });
    expect(previewB).toMatchObject({ state: "ready", intent: { token: "replaceIntentB13" } });
    expect(JSON.stringify(previewB)).not.toContain(mediaB.fileId);
    await expect(restartedBeforePreview.storeCrestUploadForTelegramUser(telegramUserId, {
      token: "replaceUploadA13",
      media: mediaA,
      now: NOW
    })).resolves.toEqual({ state: "not-found" });
    await expect(restartedBeforePreview.storeCrestUploadForTelegramUser(telegramUserId, {
      token: "replaceUploadB13",
      media: mediaB,
      now: NOW
    })).resolves.toMatchObject({ state: "replayed", intentToken: "replaceIntentB13" });
    await expect(restartedBeforePreview.getCreationCrestMediaForTelegramUser(
      telegramUserId,
      "replaceIntentA13",
      NOW
    )).resolves.toEqual({ state: "not-found" });
    await expect(restartedBeforePreview.getCreationCrestMediaForTelegramUser(
      telegramUserId,
      "replaceIntentB13",
      NOW
    )).resolves.toEqual({ state: "ready", media: mediaB });
    await expect(restartedBeforePreview.confirmCreateForTelegramUser(telegramUserId, "replaceIntentA13", NOW))
      .resolves.toEqual({ state: "not-found" });

    const restartedBeforeConfirm = new PrismaGuildRepository(prisma);
    const confirmed = await restartedBeforeConfirm.confirmCreateForTelegramUser(
      telegramUserId,
      "replaceIntentB13",
      NOW
    );
    expect(confirmed).toMatchObject({ state: "created", guild: { crest: "🖼️", hasCustomCrest: true } });
    await expect(restartedBeforeConfirm.confirmCreateForTelegramUser(telegramUserId, "replaceIntentB13", NOW))
      .resolves.toMatchObject({ state: "replayed" });
    expect(await goldFor(prisma, telegramUserId)).toBe(1_000 - GUILD_CREATION_GOLD);
    await expect(prisma.guildFounderCooldown.count({ where: { userId } })).resolves.toBe(1);
    const currentIntent = await prisma.guildCreationIntent.findUniqueOrThrow({
      where: { token: "replaceIntentB13" },
      select: { id: true }
    });
    await expect(prisma.guildCrestUploadDraft.findMany({
      where: { userId },
      orderBy: { token: "asc" },
      select: { token: true, status: true, activeUserKey: true, intentId: true }
    })).resolves.toEqual([
      { token: "replaceUploadA13", status: "consumed", activeUserKey: null, intentId: null },
      { token: "replaceUploadB13", status: "consumed", activeUserKey: null, intentId: currentIntent.id }
    ]);
    await expect(prisma.guildCrestUploadDraft.count({ where: { userId, intentId: { not: null } } })).resolves.toBe(1);
    const safeState = JSON.stringify({
      previewB,
      confirmed,
      audit: await prisma.guildAudit.findMany({ select: { eventType: true, payloadJson: true } })
    });
    expect(safeState).not.toContain(mediaA.fileId);
    expect(safeState).not.toContain(mediaA.fileUniqueId);
    expect(safeState).not.toContain(mediaB.fileId);
    expect(safeState).not.toContain(mediaB.fileUniqueId);
  }, 60_000);

  it("detaches a consumed custom draft across custom to catalog to custom replacement", async () => {
    const telegramUserId = 62_011n;
    const userId = "custom-catalog-founder";
    const mediaA = {
      fileId: "switch-secret-file-a",
      fileUniqueId: "switch-secret-unique-a",
      width: 512,
      height: 512,
      fileSize: 42_000
    };
    const mediaB = {
      fileId: "switch-secret-file-b",
      fileUniqueId: "switch-secret-unique-b",
      width: 768,
      height: 1024,
      fileSize: 93_000
    };
    await seedCharacter(prisma, userId, telegramUserId, "Гербоперемикачка", 1_000, { level: 5 });

    await repository.beginCrestUploadForTelegramUser(telegramUserId, {
      token: "switchUploadA13",
      purpose: "creation",
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 23 * 60_000)
    });
    await repository.storeCrestUploadForTelegramUser(telegramUserId, {
      token: "switchUploadA13",
      media: mediaA,
      now: NOW
    });
    await repository.createCustomIntentForTelegramUser(telegramUserId, {
      token: "switchIntentA13",
      uploadToken: "switchUploadA13",
      displayName: "Мальований Перемикач",
      normalizedName: "мальований перемикач",
      description: "Спершу власний.",
      goldCost: GUILD_CREATION_GOLD,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 13 * 60_000)
    });

    const restartedForCatalog = new PrismaGuildRepository(prisma);
    await expect(createCatalogIntent(
      restartedForCatalog,
      telegramUserId,
      "switchCatalogIntent13",
      "Каталожний Перемикач",
      "🐸"
    )).resolves.toMatchObject({ state: "ready", intent: { crest: "🐸", crestKind: "catalog" } });
    await expect(restartedForCatalog.storeCrestUploadForTelegramUser(telegramUserId, {
      token: "switchUploadA13",
      media: mediaA,
      now: NOW
    })).resolves.toEqual({ state: "not-found" });
    await expect(restartedForCatalog.getCreationCrestMediaForTelegramUser(
      telegramUserId,
      "switchIntentA13",
      NOW
    )).resolves.toEqual({ state: "not-found" });

    const restartedForUploadB = new PrismaGuildRepository(prisma);
    await restartedForUploadB.beginCrestUploadForTelegramUser(telegramUserId, {
      token: "switchUploadB13",
      purpose: "creation",
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 23 * 60_000)
    });
    await restartedForUploadB.storeCrestUploadForTelegramUser(telegramUserId, {
      token: "switchUploadB13",
      media: mediaB,
      now: NOW
    });
    const restartedForPreviewB = new PrismaGuildRepository(prisma);
    const previewB = await restartedForPreviewB.createCustomIntentForTelegramUser(telegramUserId, {
      token: "switchIntentB13",
      uploadToken: "switchUploadB13",
      displayName: "Остаточний Перемикач",
      normalizedName: "остаточний перемикач",
      description: "Знову власний.",
      goldCost: GUILD_CREATION_GOLD,
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 13 * 60_000)
    });
    expect(previewB).toMatchObject({ state: "ready", intent: { token: "switchIntentB13" } });
    await expect(restartedForPreviewB.storeCrestUploadForTelegramUser(telegramUserId, {
      token: "switchUploadA13",
      media: mediaA,
      now: NOW
    })).resolves.toEqual({ state: "not-found" });
    await expect(restartedForPreviewB.confirmCreateForTelegramUser(
      telegramUserId,
      "switchCatalogIntent13",
      NOW
    )).resolves.toEqual({ state: "not-found" });

    const restartedBeforeConfirm = new PrismaGuildRepository(prisma);
    await expect(restartedBeforeConfirm.confirmCreateForTelegramUser(telegramUserId, "switchIntentB13", NOW))
      .resolves.toMatchObject({ state: "created", guild: { crest: "🖼️", hasCustomCrest: true } });
    expect(await goldFor(prisma, telegramUserId)).toBe(1_000 - GUILD_CREATION_GOLD);
    await expect(prisma.guildFounderCooldown.count({ where: { userId } })).resolves.toBe(1);
    const currentIntent = await prisma.guildCreationIntent.findUniqueOrThrow({
      where: { token: "switchIntentB13" },
      select: { id: true }
    });
    await expect(prisma.guildCrestUploadDraft.findMany({
      where: { userId },
      orderBy: { token: "asc" },
      select: { token: true, status: true, activeUserKey: true, intentId: true }
    })).resolves.toEqual([
      { token: "switchUploadA13", status: "consumed", activeUserKey: null, intentId: null },
      { token: "switchUploadB13", status: "consumed", activeUserKey: null, intentId: currentIntent.id }
    ]);
    await expect(prisma.guildCrestUploadDraft.count({ where: { userId, activeUserKey: { not: null } } }))
      .resolves.toBe(0);
    await expect(prisma.guildCrestUploadDraft.count({ where: { userId, intentId: { not: null } } }))
      .resolves.toBe(1);
    const safeState = JSON.stringify({
      previewB,
      audit: await prisma.guildAudit.findMany({ select: { eventType: true, payloadJson: true } })
    });
    expect(safeState).not.toContain(mediaA.fileId);
    expect(safeState).not.toContain(mediaA.fileUniqueId);
    expect(safeState).not.toContain(mediaB.fileId);
    expect(safeState).not.toContain(mediaB.fileUniqueId);
  }, 60_000);

  it("does not mint invite opt-in state for a member and clears stale state on membership creation", async () => {
    await seedCharacter(prisma, "optin-member", 60_300n, "Учасниця", 1_000, { level: 5 });
    await expect(createOptIn(repository, 60_300n, "memberOptInToken93")).resolves.toMatchObject({ state: "ready" });
    await createAndConfirm(repository, 60_300n, "memberGuildToken93", "Печатка Учасниці");
    await expect(prisma.guildInviteOptIn.findUnique({ where: { userId: "optin-member" } })).resolves.toBeNull();
    await expect(createOptIn(repository, 60_300n, "forbiddenMemberToken93")).resolves.toEqual({ state: "already-member" });
    await expect(prisma.guildInviteOptIn.findUnique({ where: { userId: "optin-member" } })).resolves.toBeNull();
  });
});

async function createIntent(
  repository: PrismaGuildRepository,
  telegramUserId: bigint,
  token: string,
  displayName: string,
  now = NOW,
  expiresAt = new Date(now.getTime() + 13 * 60_000),
  normalizedName = displayName.toLocaleLowerCase("uk-UA")
) {
  return repository.createIntentForTelegramUser(telegramUserId, {
    token,
    displayName,
    normalizedName,
    crest: "🛡️",
    crestKind: "custom",
    crestMedia: {
      fileId: `test-file-${token}`,
      fileUniqueId: `test-unique-${token}`,
      width: 512,
      height: 512,
      fileSize: 1024
    },
    description: "Короткий статут без зайвого боса.",
    goldCost: GUILD_CREATION_GOLD,
    now,
    expiresAt
  });
}

async function createAndConfirm(
  repository: PrismaGuildRepository,
  telegramUserId: bigint,
  token: string,
  displayName: string,
  now = NOW,
  normalizedName = displayName.toLocaleLowerCase("uk-UA")
) {
  const preview = await createIntent(repository, telegramUserId, token, displayName, now, undefined, normalizedName);
  expect(preview.state).toBe("ready");
  const result = await repository.confirmCreateForTelegramUser(telegramUserId, token, now);
  expect(result.state).toBe("created");
  if (result.state !== "created") {
    throw new Error("Expected forming guild.");
  }
  return result;
}

async function createCatalogIntent(
  repository: PrismaGuildRepository,
  telegramUserId: bigint,
  token: string,
  displayName: string,
  crest: string,
  now = NOW
) {
  return repository.createIntentForTelegramUser(telegramUserId, {
    token,
    displayName,
    normalizedName: displayName.toLocaleLowerCase("uk-UA"),
    crest,
    crestKind: "catalog",
    description: "Каталожний статут.",
    goldCost: GUILD_CREATION_GOLD,
    now,
    expiresAt: new Date(now.getTime() + 13 * 60_000)
  });
}

async function createCatalogAndConfirm(
  repository: PrismaGuildRepository,
  telegramUserId: bigint,
  token: string,
  displayName: string,
  crest: string,
  now = NOW
) {
  await expect(createCatalogIntent(repository, telegramUserId, token, displayName, crest, now))
    .resolves.toMatchObject({ state: "ready" });
  const result = await repository.confirmCreateForTelegramUser(telegramUserId, token, now);
  if (result.state !== "created") {
    throw new Error(`Expected catalog guild creation, received ${result.state}.`);
  }
  return result;
}

async function createOptIn(
  repository: PrismaGuildRepository,
  telegramUserId: bigint,
  token: string,
  now = NOW
) {
  return repository.createInviteOptInForTelegramUser(telegramUserId, {
    token,
    now,
    expiresAt: new Date(now.getTime() + 93 * HOUR)
  });
}

async function createInvite(
  repository: PrismaGuildRepository,
  inviterTelegramUserId: bigint,
  token: string,
  targetToken: string,
  now = NOW
) {
  return repository.createInviteForTelegramUser(inviterTelegramUserId, {
    token,
    targetToken,
    now,
    expiresAt: new Date(now.getTime() + 93 * HOUR)
  });
}

async function activateGuild(
  repository: PrismaGuildRepository,
  founderTelegramUserId: bigint,
  joinerTelegramUserId: bigint,
  tokenPrefix: string,
  displayName: string,
  now = NOW
) {
  const forming = await createAndConfirm(repository, founderTelegramUserId, `${tokenPrefix}-charter`, displayName, now);
  await createOptIn(repository, joinerTelegramUserId, `${tokenPrefix}-code`, now);
  await createInvite(repository, founderTelegramUserId, `${tokenPrefix}-invite`, `${tokenPrefix}-code`, now);
  const accepted = await repository.acceptInviteForTelegramUser(joinerTelegramUserId, `${tokenPrefix}-invite`, now);
  expect(accepted.state).toBe("accepted");
  return forming;
}

async function joinGuild(
  repository: PrismaGuildRepository,
  inviterTelegramUserId: bigint,
  joinerTelegramUserId: bigint,
  inviteToken: string,
  optInToken: string,
  now: Date
) {
  await createOptIn(repository, joinerTelegramUserId, optInToken, now);
  await createInvite(repository, inviterTelegramUserId, inviteToken, optInToken, now);
  const result = await repository.acceptInviteForTelegramUser(joinerTelegramUserId, inviteToken, now);
  expect(result.state).toBe("accepted");
  return result;
}

async function readyHub(repository: PrismaGuildRepository, telegramUserId: bigint, now: Date) {
  const hub = await repository.getHubForTelegramUser(telegramUserId, now);
  if (hub.state !== "ready") {
    throw new Error(`Expected ready guild hub, received ${hub.state}.`);
  }
  return hub;
}

async function seedExpiredGuildBacklog(
  prisma: PrismaClient,
  prefix: string,
  founderUserId: string,
  now: Date,
  count = GUILD_CLEANUP_BACKLOG_SIZE
): Promise<void> {
  await prisma.guild.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      id: `lifecycle-backlog-${prefix}-${index}`,
      normalizedName: `черга ${prefix} ${index}`,
      reservationKey: `черга ${prefix} ${index}`,
      displayName: `Черга ${prefix} ${index}`,
      crest: "📜",
      description: "Старіший прострочений статут у bounded-черзі.",
      founderUserId,
      leaderUserId: founderUserId,
      status: "forming",
      version: 1,
      charterExpiresAt: new Date(now.getTime() - 2 * DAY),
      nameReleaseAt: new Date(now.getTime() + HOUR),
      createdAt: new Date(now.getTime() - 9 * DAY),
      updatedAt: new Date(now.getTime() - 9 * DAY)
    }))
  });
}

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  telegramUserId: bigint,
  name: string,
  gold: number,
  options: { level?: number; remorts?: number } = {}
): Promise<void> {
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      character: {
        create: {
          id: `${userId}-character`,
          name,
          raceId: "human",
          classId: "warrior",
          level: options.level ?? 1,
          gold,
          statsJson: {},
          createdAt: NOW,
          updatedAt: NOW
        }
      }
    }
  });
  for (let index = 0; index < (options.remorts ?? 0); index += 1) {
    await prisma.characterRemort.create({
      data: {
        id: `${userId}-remort-${index}`,
        characterId: `${userId}-character`,
        token: `${userId}-remort-token-${index}`,
        remortNumber: index + 1,
        previousLevel: 13,
        previousXp: 587,
        previousGold: 42,
        displayNameSnapshot: name,
        preservedPayloadJson: {},
        createdAt: new Date(NOW.getTime() + index)
      }
    });
  }
}

async function seedParty(
  prisma: PrismaClient,
  id: string,
  leaderCharacterId: string,
  options: {
    originKind?: string;
    originLocationId?: string;
    participantCharacterIds: string[];
    active?: boolean;
    expiresAt?: Date;
  }
): Promise<void> {
  const status = options.active === false ? "expired" : "recruiting";
  const expiresAt = options.expiresAt ?? new Date(NOW.getTime() + HOUR);
  await prisma.partySession.create({
    data: {
      id,
      inviteToken: `token-${id}`,
      status,
      leaderCharacterId,
      originLocationId: options.originLocationId ?? null,
      originKind: options.originKind ?? null,
      participantCap: 8,
      minimumParticipants: 1,
      joinUntilAt: expiresAt,
      expiresAt,
      version: 1,
      chatRevision: 0,
      activeLeaderKey: status === "recruiting" ? `party-leader:${leaderCharacterId}:${id}` : null,
      createdAt: NOW,
      updatedAt: NOW,
      participants: {
        create: options.participantCharacterIds.map((characterId, index) => ({
          id: `${id}-participant-${index}`,
          characterId,
          remortCount: 0,
          status: "joined",
          joinSource: index === 0 ? "leader" : "nearby",
          joinedAt: NOW,
          activeMembershipKey: status === "recruiting" ? `party-member:${characterId}:${id}` : null,
          createdAt: NOW,
          updatedAt: NOW
        }))
      }
    }
  });
}

async function goldFor(prisma: PrismaClient, telegramUserId: bigint): Promise<number> {
  return (await prisma.character.findFirstOrThrow({
    where: { user: { telegramUserId } },
    select: { gold: true }
  })).gold;
}

function createPrisma(path: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: `file:${path.replace(/\\/g, "/")}` } } });
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

async function expectUnrelatedCounts(
  prisma: PrismaClient,
  expected: { users: number; characters: number; parties: number; combats: number }
): Promise<void> {
  await expect(prisma.user.count()).resolves.toBe(expected.users);
  await expect(prisma.character.count()).resolves.toBe(expected.characters);
  await expect(prisma.partySession.count()).resolves.toBe(expected.parties);
  await expect(prisma.groupCombatSession.count()).resolves.toBe(expected.combats);
}

async function createBaseSchema(prisma: PrismaClient): Promise<void> {
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
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY,
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
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_sessions (
      id TEXT PRIMARY KEY,
      invite_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'recruiting',
      leader_character_id TEXT NOT NULL,
      period_id TEXT,
      origin_location_id TEXT,
      origin_kind TEXT,
      participant_cap INTEGER NOT NULL DEFAULT 8,
      minimum_participants INTEGER NOT NULL DEFAULT 1,
      join_until_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      chat_revision INTEGER NOT NULL DEFAULT 0,
      raid_chat_retention_until DATETIME,
      active_leader_key TEXT UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'joined',
      join_source TEXT NOT NULL,
      joined_at DATETIME NOT NULL,
      left_at DATETIME,
      snapshot_json JSONB,
      chat_id INTEGER,
      message_id INTEGER,
      active_membership_key TEXT UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE group_combat_sessions (
      id TEXT PRIMARY KEY,
      party_session_id TEXT NOT NULL UNIQUE,
      encounter_key TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      delivery_revision INTEGER NOT NULL DEFAULT 1,
      delivery_pending BOOLEAN NOT NULL DEFAULT 1,
      delivery_attempted_at DATETIME,
      terminal_integrity_checked_at DATETIME,
      repair_state TEXT,
      repair_reason TEXT,
      state_json JSONB NOT NULL,
      result_json JSONB,
      settlement_plan_json JSONB,
      turn_expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE group_combat_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL,
      roster_order INTEGER NOT NULL,
      snapshot_json JSONB NOT NULL,
      contribution_json JSONB NOT NULL,
      settlement_status TEXT NOT NULL DEFAULT 'pending',
      settlement_attempts INTEGER NOT NULL DEFAULT 0,
      settlement_receipt_json JSONB,
      settled_at DATETIME,
      chat_id INTEGER,
      message_id INTEGER,
      reference_version INTEGER NOT NULL DEFAULT 0,
      delivered_revision INTEGER NOT NULL DEFAULT 0,
      reply_keyboard_fingerprint TEXT,
      reply_keyboard_generation INTEGER NOT NULL DEFAULT 0,
      exit_delivery_state TEXT NOT NULL DEFAULT 'none',
      exit_delivery_claim_token TEXT,
      exit_delivery_claimed_at DATETIME,
      exit_delivery_message_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_sessions (
      id TEXT PRIMARY KEY,
      party_session_id TEXT NOT NULL,
      leader_character_id TEXT NOT NULL,
      status TEXT NOT NULL
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
