import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaGuildRepository } from "../../src/db/repositories/prismaGuildRepository";
import { GUILD_CREATION_GOLD } from "../../src/domain/guild";
import { GuildService } from "../../src/services/guildService";
import type { PartySessionService } from "../../src/services/partySessionService";

const MIGRATION = "20260802230000_guild_foundation";
const NOW = new Date("2026-08-02T20:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("PrismaGuildRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaGuildRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-guild-repo-"));
    prisma = createPrisma(join(dir, "test.db"));
    await createBaseSchema(prisma);
    await applySqlFile(prisma, `prisma/migrations/${MIGRATION}/migration.sql`);
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
      .resolves.toEqual({ state: "declined" });
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
      await applySqlFile(rollbackPrisma, `prisma/migrations/${MIGRATION}/rollback.sql`);
      expect(await tableNames(rollbackPrisma)).not.toContain("guilds");
      expect(await rollbackPrisma.partySession.count()).toBe(1);
      expect(await rollbackPrisma.groupCombatSession.count()).toBe(1);
      await applySqlFile(rollbackPrisma, `prisma/migrations/${MIGRATION}/migration.sql`);
      expect(await tableNames(rollbackPrisma)).toContain("guilds");
      expect(await rollbackPrisma.partySession.count()).toBe(1);
      expect(await rollbackPrisma.groupCombatSession.count()).toBe(1);
    } finally {
      await rollbackPrisma.$disconnect();
      await rm(rollbackDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }, 60_000);
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
