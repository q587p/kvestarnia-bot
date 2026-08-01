import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findMantokAbilityGrantByKey } from "../../src/content";
import { PrismaPartyBossRepository } from "../../src/db/repositories/prismaPartyBossRepository";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaPartySessionRepository } from "../../src/db/repositories/prismaPartySessionRepository";
import type {
  PartyBossActionResult,
  PartyBossSessionRecord,
  PartyBossStartResult
} from "../../src/db/repositories/partyBossRepository";
import { BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY } from "../../src/domain/partyBoss/partyBoss";
import { PartyBossStateValidationError } from "../../src/domain/partyBoss/partyBossStateValidation";
import { HpRecoveryNotificationProducer } from "../../src/db/repositories/hpRecoveryNotificationProducer";
import { getLevelStartXp } from "../../src/domain/progression/level";
import {
  getBardMusicAvailabilityKey
} from "../../src/domain/noncombat/bardSupport";
import { PRESENCE_LOCATION_KORCHMA_BARREL } from "../../src/services/presenceService";
import { buildFridayBarrelRaidPendingKey } from "../../src/services/tavernRaidService";
import { PrismaPartyRaidChatTransactionWriter } from "../../src/db/repositories/prismaPartyRaidChatEvents";
import { PartyBossService } from "../../src/services/partyBossService";

function expectPartyBossSession(result: PartyBossActionResult | PartyBossStartResult): PartyBossSessionRecord {
  if (!("session" in result)) {
    throw new Error(`Expected party boss session result, got ${result.state}`);
  }

  return result.session;
}

const RAID_CHAT_MIGRATIONS = [
    "20260720013000_add_party_raid_chat",
    "20260720171500_add_party_raid_chat_delivery_version",
    "20260721113000_party_boss_round_history"
] as const;

async function applyRaidChatMigration(
  prisma: PrismaClient,
  migrations: readonly string[] = RAID_CHAT_MIGRATIONS
): Promise<void> {
  for (const migration of migrations) {
    const sql = await readFile(resolve(`prisma/migrations/${migration}/migration.sql`), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}

describe("PrismaPartyBossRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let partyRepository: PrismaPartySessionRepository;
  let bossRepository: PrismaPartyBossRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-party-boss-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    await applyRaidChatMigration(prisma);
    const raidChat = new PrismaPartyRaidChatTransactionWriter(true);
    partyRepository = new PrismaPartySessionRepository(prisma, raidChat);
    bossRepository = new PrismaPartyBossRepository(prisma, new HpRecoveryNotificationProducer(true), raidChat);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("starts from recruiting party, replaces queued actions, and timeout-resolves past the old cap without terminalizing by turn count", async () => {
    await seedCharacter(prisma, "leader-user", 1001n, "Лідерка", { hp: 300 });
    await seedCharacter(prisma, "joiner-user", 1002n, "Помічник", { hp: 300 });
    await partyRepository.createForTelegramUser(1001n, partyInput("party-token-a"));
    await partyRepository.joinByTokenForTelegramUser(1002n, "party-token-a", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1001n, {
      partyInviteToken: "party-token-a",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss" } })).toBe(2);

    const first = await bossRepository.submitActionForTelegramUser(1001n, "party-token-a", 1, "attack", resolveInput());
    const updated = await bossRepository.submitActionForTelegramUser(1001n, "party-token-a", 1, "defend", resolveInput());

    expect(first.state).toBe("queued");
    expect(updated.state).toBe("updated");
    expect(expectPartyBossSession(updated).queuedActions).toContainEqual({
      characterId: "leader-user-character",
      turn: 1,
      action: "defend"
    });
    expect(await prisma.partyBossAction.count()).toBe(1);
    await expect(prisma.partyBossAction.findFirstOrThrow({
      where: {
        sessionId: expectPartyBossSession(updated).id,
        actorCharacterId: "leader-user-character",
        turn: 1
      },
      select: { actionKey: true }
    })).resolves.toEqual({ actionKey: "defend" });

    let latest = expectPartyBossSession(updated);
    for (let turn = latest.turn; turn <= 25; turn += 1) {
      const resolvedAt = new Date(now().getTime() + turn * 60_000);
      const resolved = await bossRepository.resolveTimedOutByToken("party-token-a", {
        now: resolvedAt,
        nextTurnExpiresAt: new Date(resolvedAt.getTime() + 23_000)
      }, "due");
      expect(resolved.state).toBe("resolved");
      latest = expectPartyBossSession(resolved);
    }

    expect(latest.status).toBe("active");
    expect(latest.turn).toBe(26);
    expect(latest.state.roundLog).toHaveLength(1);
    await expect(prisma.partyBossRound.count({ where: { sessionId: latest.id } })).resolves.toBe(25);
    await expect(bossRepository.findJournalPageByPartyInviteToken("party-token-a", 0)).resolves.toMatchObject({
      journal: { page: 0, totalPages: 25, round: { turn: 1 } }
    });
    await expect(bossRepository.findJournalPageByPartyInviteToken("party-token-a", 24)).resolves.toMatchObject({
      journal: { page: 24, totalPages: 25, round: { turn: 25 } }
    });
    expect(latest.state.boss.hp).toBeGreaterThan(0);
    expect(latest.state.participants.some((participant) => participant.resources.hp > 0)).toBe(true);
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss" } })).toBe(2);
    expect(await prisma.partyParticipant.count({
      where: {
        activeMembershipKey: {
          not: null
        }
      }
    })).toBe(2);
  });

  it("shortens Big Barrel Sated by one minute per durable round pulse and persists it on lease release", async () => {
    const leaderId = "big-sated-leader-character";
    await seedCharacter(prisma, "big-sated-leader", 1003n, "Ситий Лідер", {
      hpCurrent: 20,
      hpMax: 25,
      manaCurrent: 5,
      manaMax: 10,
      level: 8
    });
    await seedCharacter(prisma, "big-sated-joiner", 1004n, "Свідок", { hp: 300, level: 8 });
    const expiresAt = new Date(now().getTime() + 13 * 60_000);
    await prisma.characterCooldown.create({
      data: {
        id: "big-sated-cooldown",
        characterId: leaderId,
        key: "class.varenyk-mancer.sated-support.recipient",
        availableAt: new Date(now().getTime() + 93 * 60_000),
        resultJson: {
          kind: "varenyk-sated-support-v1",
          version: 1,
          activationId: "big-sated-activation",
          actorCharacterId: leaderId,
          actorRemortCount: 0,
          recipientCharacterId: leaderId,
          recipientRemortCount: 0,
          rank: 1,
          manaCost: 8,
          effectiveStats: { intelligence: 8, charisma: 8, level: 3, equipmentItemIds: [] },
          startedAt: now().toISOString(),
          expiresAt: expiresAt.toISOString(),
          availableAt: new Date(now().getTime() + 93 * 60_000).toISOString(),
          cursorAt: now().toISOString(),
          receipt: {
            version: 1,
            previewToken: "big-sated-preview",
            actorTelegramUserId: "1003",
            targetTelegramUserId: "1003",
            actorName: "Ситий Лідер",
            targetName: "Ситий Лідер",
            immediateHpRestored: 0,
            immediateManaRestored: 0,
            actorManaAfter: 5,
            targetHpAfter: 20,
            targetManaAfter: 5
          }
        }
      }
    });
    await partyRepository.createForTelegramUser(1003n, {
      ...partyInput("party-token-big-sated"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(1004n, "party-token-big-sated", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1003n, {
      partyInviteToken: "party-token-big-sated",
      now: now(),
      turnExpiresAt: new Date(now().getTime() + 23_000)
    });
    expect(started.state).toBe("started");
    const startedLeader = expectPartyBossSession(started).state.participants.find(
      (participant) => participant.characterId === leaderId
    );
    expect(startedLeader?.varenykSated).toMatchObject({
      expiresAt: expiresAt.toISOString(),
      pulseIds: []
    });

    await bossRepository.submitActionForTelegramUser(1003n, "party-token-big-sated", 1, "defend", resolveInput());
    const resolved = await bossRepository.submitActionForTelegramUser(1004n, "party-token-big-sated", 1, "defend", resolveInput());
    const afterRound = expectPartyBossSession(resolved);
    const leader = afterRound.state.participants.find((entry) => entry.characterId === leaderId);
    expect(leader?.varenykSated?.expiresAt).toBe(new Date(expiresAt.getTime() - 60_000).toISOString());
    expect(leader?.varenykSated?.pulseIds).toEqual([
      `big-sated-activation:big-barrel:${afterRound.partySessionId}:1:${leaderId}`
    ]);
    expect(afterRound.state.roundLog[0]?.actions.find((action) => action.characterId === leaderId)?.satedRecovery)
      .toEqual({ hpRestored: 1, manaRestored: 1 });
    expect(afterRound.state.roundLog[0]?.participantsAfter?.find(
      (participant) => participant.characterId === leaderId
    )?.varenykSated?.pulseIds).toEqual([
      `big-sated-activation:big-barrel:${afterRound.partySessionId}:1:${leaderId}`
    ]);

    await expect(bossRepository.forceBigBarrelWinForTelegramUser(1003n, now()))
      .resolves.toMatchObject({ state: "primed" });
    const terminal = await bossRepository.resolveTimedOutByToken(
      "party-token-big-sated",
      resolveInput(),
      "due"
    );
    const terminalSession = expectPartyBossSession(terminal);
    expect(terminalSession.status).toBe("won");
    expect(terminalSession.state.participants.find((entry) => entry.characterId === leaderId)?.varenykSated?.pulseIds)
      .toEqual([
        `big-sated-activation:big-barrel:${afterRound.partySessionId}:1:${leaderId}`,
        `big-sated-activation:big-barrel:${afterRound.partySessionId}:2:${leaderId}`
      ]);
    const stored = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: leaderId, key: "class.varenyk-mancer.sated-support.recipient" } }
    });
    expect((stored.resultJson as { expiresAt: string }).expiresAt)
      .toBe(new Date(expiresAt.getTime() - 2 * 60_000).toISOString());
  });

  it("lets a solo Bard start Big Barrel without prior music and commit Lament", async () => {
    await seedCharacter(prisma, "solo-lament-bard", 1099n, "Самотній Бард", {
      classId: "class.bard",
      level: 8,
      hp: 100
    });
    await partyRepository.createForTelegramUser(1099n, {
      ...partyInput("party-token-big-solo-lament"),
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1099n, {
      partyInviteToken: "party-token-big-solo-lament",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected solo Bard session, got ${started.state}.`);
    }
    expect(started.session.state.participants).toHaveLength(1);
    expect(started.session.state.bardMusic).toEqual({ kind: "none" });

    const result = await bossRepository.submitLamentForTelegramUser(
      1099n,
      "party-token-big-solo-lament",
      1,
      { ...resolveInput(), activationId: "solo-lament-activation" }
    );
    const session = expectPartyBossSession(result);

    expect(result.state).toBe("resolved");
    expect(session.state.bardMusic).toMatchObject({
      kind: "lament",
      activationId: "solo-lament-activation",
      sourceCharacterId: "solo-lament-bard-character"
    });
    expect(session.state.roundLog[0]?.actions).toContainEqual(expect.objectContaining({
      characterId: "solo-lament-bard-character",
      action: "lament",
      outcome: "lament-activated"
    }));
    await expect(prisma.partyBossAction.findFirstOrThrow({
      where: {
        sessionId: session.id,
        actorCharacterId: "solo-lament-bard-character",
        turn: 1
      },
      select: { actionKey: true }
    })).resolves.toEqual({ actionKey: "lament" });
    await expect(prisma.partyRaidChatEntry.findMany({
      where: { partySession: { inviteToken: "party-token-big-solo-lament" } },
      orderBy: { revision: "asc" },
      select: { eventType: true, actorCharacterId: true }
    })).resolves.toEqual([
      { eventType: "party.created", actorCharacterId: "solo-lament-bard-character" },
      { eventType: "raid.started", actorCharacterId: "solo-lament-bard-character" },
      { eventType: "ability.lament", actorCharacterId: "solo-lament-bard-character" }
    ]);
  });

  it("terminalizes a due Big Barrel party if a joined participant began a legacy solo raid after joining", async () => {
    await seedCharacter(prisma, "pending-solo-leader", 1100n, "Ватажок", { level: 8 });
    await seedCharacter(prisma, "pending-solo-member", 1102n, "Ще В Соло", { level: 8 });
    await seedCharacter(prisma, "later-due-leader", 1103n, "Наступна Ватага", { level: 8 });
    await partyRepository.createForTelegramUser(1100n, {
      ...partyInput("party-token-pending-solo-race"),
      joinUntilAt: new Date("2026-06-30T10:12:59.000Z"),
      expiresAt: new Date("2026-06-30T10:12:59.000Z"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(
      1102n,
      "party-token-pending-solo-race",
      joinInput()
    );
    await partyRepository.createForTelegramUser(1103n, {
      ...partyInput("party-token-later-due"),
      originLocationId: "barrel.big-brother"
    });
    await prisma.characterCooldown.create({
      data: {
        id: "pending-solo-after-join",
        characterId: "pending-solo-member-character",
        key: buildFridayBarrelRaidPendingKey("12026-06-30"),
        availableAt: new Date("2026-06-30T10:14:00.000Z")
      }
    });

    const dueNow = new Date("2026-06-30T10:13:01.000Z");
    await expect(partyRepository.listDueRecruitingByOrigin("barrel.big-brother", dueNow, 1))
      .resolves.toMatchObject([{ inviteToken: "party-token-pending-solo-race" }]);

    const result = await bossRepository.startFromRecruitingPartyForTelegramUser(1100n, {
      partyInviteToken: "party-token-pending-solo-race",
      now: dueNow,
      turnExpiresAt: new Date("2026-06-30T10:13:24.000Z"),
      allowExpiredRecruiting: true
    });

    expect(result.state).toBe("terminal-ineligible");
    await expect(prisma.partyBossSession.count({
      where: { partySession: { inviteToken: "party-token-pending-solo-race" } }
    })).resolves.toBe(0);
    await expect(prisma.activeCombatLease.count({
      where: {
        characterId: {
          in: ["pending-solo-leader-character", "pending-solo-member-character"]
        }
      }
    })).resolves.toBe(0);
    await expect(prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "party-token-pending-solo-race" },
      select: { status: true, activeLeaderKey: true }
    })).resolves.toEqual({ status: "ineligible", activeLeaderKey: null });
    await expect(prisma.partyParticipant.findMany({
      where: { session: { inviteToken: "party-token-pending-solo-race" } },
      select: { activeMembershipKey: true }
    })).resolves.toEqual([
      { activeMembershipKey: null },
      { activeMembershipKey: null }
    ]);

    await expect(partyRepository.listDueRecruitingByOrigin("barrel.big-brother", dueNow, 1))
      .resolves.toMatchObject([{ inviteToken: "party-token-later-due" }]);
    await expect(bossRepository.startFromRecruitingPartyForTelegramUser(1100n, {
      partyInviteToken: "party-token-pending-solo-race",
      now: dueNow,
      turnExpiresAt: new Date("2026-06-30T10:13:24.000Z"),
      allowExpiredRecruiting: true
    })).resolves.toEqual({ state: "terminal-ineligible" });
    await expect(bossRepository.startFromRecruitingPartyForTelegramUser(1103n, {
      partyInviteToken: "party-token-later-due",
      now: dueNow,
      turnExpiresAt: new Date("2026-06-30T10:13:24.000Z"),
      allowExpiredRecruiting: true
    })).resolves.toMatchObject({ state: "started" });
  });

  it("atomically lets one Bard claim Lament and prevents overwrite or double cooldown spend", async () => {
    const supportRepository = new PrismaPartyBossRepository(
      prisma,
      new HpRecoveryNotificationProducer(true)
    );
    await seedCharacter(prisma, "lament-bard-a", 1005n, "Перший Бард", {
      classId: "class.bard",
      level: 8,
      hp: 100
    });
    await seedCharacter(prisma, "lament-bard-b", 1006n, "Другий Бард", {
      classId: "class.bard",
      level: 8,
      hp: 100
    });
    await partyRepository.createForTelegramUser(1005n, {
      ...partyInput("party-token-big-lament-race"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(1006n, "party-token-big-lament-race", joinInput());
    const started = await supportRepository.startFromRecruitingPartyForTelegramUser(1005n, {
      partyInviteToken: "party-token-big-lament-race",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started).toMatchObject({ state: "started", session: { state: { bardMusic: { kind: "none" } } } });
    const actionCountBeforeGenericLament = await prisma.partyBossAction.count();
    const cooldownCountBeforeGenericLament = await prisma.characterCooldown.count({
      where: { key: getBardMusicAvailabilityKey(PRESENCE_LOCATION_KORCHMA_BARREL) }
    });

    await expect(supportRepository.submitActionForTelegramUser(
      1005n,
      "party-token-big-lament-race",
      1,
      "lament" as never,
      resolveInput()
    )).resolves.toMatchObject({ state: "lament-unavailable", reason: "specialized-only" });
    await expect(prisma.partyBossAction.count()).resolves.toBe(actionCountBeforeGenericLament);
    await expect(prisma.characterCooldown.count({
      where: { key: getBardMusicAvailabilityKey(PRESENCE_LOCATION_KORCHMA_BARREL) }
    })).resolves.toBe(cooldownCountBeforeGenericLament);

    const [left, right] = await Promise.all([
      supportRepository.submitLamentForTelegramUser(1005n, "party-token-big-lament-race", 1, {
        ...resolveInput(),
        activationId: "lament-race-a"
      }),
      supportRepository.submitLamentForTelegramUser(1006n, "party-token-big-lament-race", 1, {
        ...resolveInput(),
        activationId: "lament-race-b"
      })
    ]);
    const winner = [left, right].find((entry) => entry.state === "queued");
    const loser = [left, right].find((entry) => entry.state === "lament-unavailable");

    expect(winner?.state).toBe("queued");
    expect(loser).toMatchObject({ state: "lament-unavailable", reason: "music-taken" });
    if (!winner || !("session" in winner) || winner.session.state.bardMusic?.kind !== "lament") {
      throw new Error("Expected one durable Lament winner.");
    }
    const winnerCharacterId = winner.session.state.bardMusic.sourceCharacterId;
    await expect(prisma.characterCooldown.findMany({
      where: {
        key: getBardMusicAvailabilityKey(PRESENCE_LOCATION_KORCHMA_BARREL),
        characterId: { in: ["lament-bard-a-character", "lament-bard-b-character"] }
      }
    })).resolves.toMatchObject([
      {
        characterId: winnerCharacterId,
        availableAt: new Date("2026-06-30T11:33:00.000Z")
      }
    ]);

    const winnerTelegramUserId = winnerCharacterId === "lament-bard-a-character" ? 1005n : 1006n;
    await expect(supportRepository.submitActionForTelegramUser(
      winnerTelegramUserId,
      "party-token-big-lament-race",
      1,
      "attack",
      resolveInput()
    )).resolves.toMatchObject({ state: "lament-unavailable", reason: "locked" });
    await expect(prisma.partyBossAction.findFirstOrThrow({
      where: { actorCharacterId: winnerCharacterId, turn: 1 },
      select: { actionKey: true }
    })).resolves.toEqual({ actionKey: "lament" });

    const otherTelegramUserId = winnerTelegramUserId === 1005n ? 1006n : 1005n;
    const resolved = await supportRepository.submitActionForTelegramUser(
      otherTelegramUserId,
      "party-token-big-lament-race",
      1,
      "attack",
      resolveInput()
    );
    expect(resolved.state).toBe("resolved");
    if (!("session" in resolved)) {
      throw new Error("Expected Lament round resolution.");
    }
    expect(resolved.session.state.roundLog.at(-1)?.bardMusic).toBeDefined();
  });

  it("ignores previous-life performance cooldown history when committing Lament", async () => {
    const supportRepository = new PrismaPartyBossRepository(
      prisma,
      new HpRecoveryNotificationProducer(true)
    );
    await seedCharacter(prisma, "lament-remort-bard", 1007n, "Бард Нового Життя", {
      classId: "class.bard",
      level: 8,
      hp: 100
    });
    await seedRemort(prisma, "lament-remort-bard-character", 1);
    await prisma.$executeRawUnsafe(
      `INSERT INTO bard_performances
        (id, character_id, location_id, remort_count, cooldown_available_at)
       VALUES (?, ?, ?, ?, ?)`,
      "lament-previous-life-performance",
      "lament-remort-bard-character",
      PRESENCE_LOCATION_KORCHMA_BARREL,
      0,
      new Date("2026-06-30T11:33:00.000Z")
    );
    await partyRepository.createForTelegramUser(1007n, {
      ...partyInput("party-token-lament-remort"),
      originLocationId: "barrel.big-brother"
    });
    await supportRepository.startFromRecruitingPartyForTelegramUser(1007n, {
      partyInviteToken: "party-token-lament-remort",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    const result = await supportRepository.submitLamentForTelegramUser(
      1007n,
      "party-token-lament-remort",
      1,
      { ...resolveInput(), activationId: "lament-after-remort" }
    );

    expect(result).not.toMatchObject({ state: "lament-unavailable", reason: "cooldown" });
    await expect(prisma.partyBossAction.findFirstOrThrow({
      where: { actorCharacterId: "lament-remort-bard-character" },
      select: { actionKey: true }
    })).resolves.toEqual({ actionKey: "lament" });
  });

  it("commits only the latest eligible Big Barrel Warrior Taunt and rejects stale or ineligible replays", async () => {
    await seedCharacter(prisma, "taunt-warrior-user", 1051n, "Воїн Виклику", {
      hp: 500,
      level: 8,
      classId: "class.warrior",
      strength: 30
    });
    await seedCharacter(prisma, "taunt-mage-user", 1052n, "Маг Свідок", {
      hp: 500,
      level: 8,
      classId: "class.mage"
    });
    await partyRepository.createForTelegramUser(1051n, {
      ...partyInput("party-token-warrior-taunt"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(1052n, "party-token-warrior-taunt", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1051n, {
      partyInviteToken: "party-token-warrior-taunt",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const queued = await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      1,
      "taunt",
      resolveInput()
    );
    const duplicate = await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      1,
      "taunt",
      resolveInput()
    );
    const overwritten = await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      1,
      "attack",
      resolveInput()
    );
    const firstResolved = await bossRepository.submitActionForTelegramUser(
      1052n,
      "party-token-warrior-taunt",
      1,
      "defend",
      resolveInput()
    );

    expect(queued.state).toBe("queued");
    expect(duplicate.state).toBe("duplicate");
    expect(overwritten.state).toBe("updated");
    expect(firstResolved.state).toBe("resolved");
    expect(expectPartyBossSession(firstResolved).state.roundLog[0]?.warriorTaunt).toBeUndefined();
    expect(expectPartyBossSession(firstResolved).state.warriorTaunt).toBeUndefined();
    expect(firstResolved.achievementEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "warrior.raid-taunt.activated" })
    ]));
    expect(await prisma.partyRaidChatEntry.count({
      where: {
        partySession: { inviteToken: "party-token-warrior-taunt" },
        eventType: "ability.taunt"
      }
    })).toBe(0);

    await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      2,
      "taunt",
      resolveInput()
    );
    const activated = await bossRepository.submitActionForTelegramUser(
      1052n,
      "party-token-warrior-taunt",
      2,
      "defend",
      resolveInput()
    );
    const activeSession = expectPartyBossSession(activated);

    expect(activated.state).toBe("resolved");
    expect(activeSession.state.roundLog.at(-1)?.warriorTaunt).toMatchObject({
      activatedCharacterId: "taunt-warrior-user-character",
      redirectedCharacterId: "taunt-warrior-user-character",
      bossAttacksRemaining: 2
    });
    expect(activeSession.state.warriorTaunt?.cooldowns).toEqual({
      "taunt-warrior-user-character": { availableTurn: 7 }
    });
    expect(activated.achievementEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "warrior.raid-taunt.activated",
        characterId: "taunt-warrior-user-character"
      })
    ]));
    expect(await prisma.partyRaidChatEntry.count({
      where: {
        partySession: { inviteToken: "party-token-warrior-taunt" },
        eventType: "ability.taunt"
      }
    })).toBe(1);

    const stale = await bossRepository.submitActionForTelegramUser(
      1051n,
      "party-token-warrior-taunt",
      2,
      "taunt",
      resolveInput()
    );
    const mage = await bossRepository.submitActionForTelegramUser(
      1052n,
      "party-token-warrior-taunt",
      activeSession.turn,
      "taunt",
      resolveInput()
    );
    expect(stale.state).toBe("stale");
    expect(stale.achievementEvents).toBeUndefined();
    expect(mage).toMatchObject({ state: "taunt-unavailable", reason: "not-warrior" });

    await seedCharacter(prisma, "proof-taunt-warrior-user", 1053n, "Воїн Проби", {
      hp: 200,
      classId: "class.warrior"
    });
    await partyRepository.createForTelegramUser(1053n, partyInput("party-token-proof-warrior-taunt"));
    const proofStarted = await bossRepository.startFromRecruitingPartyForTelegramUser(1053n, {
      partyInviteToken: "party-token-proof-warrior-taunt",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(proofStarted.state).toBe("started");
    await expect(bossRepository.submitActionForTelegramUser(
      1053n,
      "party-token-proof-warrior-taunt",
      1,
      "taunt",
      resolveInput()
    )).resolves.toMatchObject({ state: "taunt-unavailable", reason: "not-big-barrel" });
  });

  it("freezes participant resources from effective level and equipment max at boss start", async () => {
    await seedCharacter(prisma, "effective-resources-user", 1101n, "Екіпірована", {
      hpCurrent: 13,
      hpMax: 20,
      manaCurrent: 25,
      manaMax: 10,
      level: 8,
      strength: 16,
      dexterity: 11,
      equipment: [
        { slot: "chest", itemId: "item.apron-of-foam-resistance" },
        { slot: "accessory", itemId: "item.hourglass-with-deadline-teeth" }
      ]
    });
    await partyRepository.createForTelegramUser(1101n, partyInput("party-token-effective-resources"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1101n, {
      partyInviteToken: "party-token-effective-resources",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    const participant = started.session.state.participants.find(
      (entry) => entry.characterId === "effective-resources-user-character"
    );

    expect(participant?.resources).toMatchObject({
      hp: 13,
      hpMax: 50,
      mana: 25,
      manaMax: 26
    });
  });

  it("consumes a bandage party-boss item action, heals frozen raid HP, and stores victory rewards", async () => {
    await seedCharacter(prisma, "big-bandage-user", 1151n, "Бинтова Лідерка", {
      hpCurrent: 10,
      hpMax: 40,
      level: 8,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "big-bandage-user-character",
        itemId: "item.responsible-panic-bandage",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1151n, {
      ...partyInput("party-token-big-bandage"),
      periodId: "2026-06-30T10:42",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1151n, {
      partyInviteToken: "party-token-big-bandage",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const result = await bossRepository.submitItemForTelegramUser(
      1151n,
      "party-token-big-bandage",
      1,
      {
        id: "item.responsible-panic-bandage",
        name: "Бинт відповідальної паніки",
        effect: {
          kind: "heal-hp",
          amount: 7
        }
      },
      resolveInput()
    );
    const latest = expectPartyBossSession(result);
    const participant = latest.state.participants.find(
      (entry) => entry.characterId === "big-bandage-user-character"
    );

    expect(result.state).toBe("resolved");
    expect(latest.status).toBe("won");
    expect(latest.state.roundLog.at(-1)?.actions[0]).toMatchObject({
      action: "item",
      outcome: "item-used",
      itemName: "Бинт відповідальної паніки",
      healing: 7
    });
    expect(participant?.resources.hp).toBe(17);
    expect(await prisma.characterItem.count({
      where: {
        characterId: "big-bandage-user-character",
        itemId: "item.responsible-panic-bandage"
      }
    })).toBe(0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "big-bandage-user-character" },
      select: { hpCurrent: true }
    })).resolves.toEqual({ hpCurrent: 17 });
    const reward = latest.result?.participants[0]?.reward;
    expect(reward?.xp).toBeGreaterThan(0);
    expect(reward?.gold).toBeGreaterThan(0);
    expect(reward?.itemGrants[0]?.name).toBeTruthy();
    expect(reward?.itemGrants[0]?.quantity).toBeGreaterThan(0);
  });

  it("consumes a Big Barrel field kit action and emits item and raid achievement events", async () => {
    await seedCharacter(prisma, "big-field-kit-user", 1152n, "Аптечна Лідерка", {
      hpCurrent: 10,
      hpMax: 100,
      level: 8,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "big-field-kit-user-character",
        itemId: "item.field-kit",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1152n, {
      ...partyInput("party-token-big-field-kit"),
      periodId: "2026-06-30T10:43",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1152n, {
      partyInviteToken: "party-token-big-field-kit",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const startedParticipant = started.session.state.participants.find(
      (entry) => entry.characterId === "big-field-kit-user-character"
    );
    const expectedHpAfter = Math.ceil((startedParticipant?.resources.hpMax ?? 1) * 0.93);
    const expectedHealing = expectedHpAfter - (startedParticipant?.resources.hp ?? 0);

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const result = await bossRepository.submitItemForTelegramUser(
      1152n,
      "party-token-big-field-kit",
      1,
      {
        id: "item.field-kit",
        name: "Польова аптечка",
        effect: {
          kind: "heal-hp-to-min-percent",
          percent: 93
        }
      },
      resolveInput()
    );
    const latest = expectPartyBossSession(result);
    const participant = latest.state.participants.find(
      (entry) => entry.characterId === "big-field-kit-user-character"
    );

    expect(result.state).toBe("resolved");
    expect(latest.state.roundLog.at(-1)?.actions[0]).toMatchObject({
      action: "item",
      outcome: "item-used",
      itemName: "Польова аптечка",
      healing: expectedHealing
    });
    expect(participant?.resources.hp).toBe(expectedHpAfter);
    expect(participant?.combatItems?.uses?.["item.field-kit"]).toEqual({
      itemId: "item.field-kit",
      count: 1
    });
    expect(await prisma.characterItem.count({
      where: {
        characterId: "big-field-kit-user-character",
        itemId: "item.field-kit"
      }
    })).toBe(0);
    expect(result.achievementEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "item.used",
        characterId: "big-field-kit-user-character",
        itemId: "item.field-kit",
        occurredAt: resolveInput().now
      }),
      expect.objectContaining({
        type: "barrel.raid.bandage-used",
        characterId: "big-field-kit-user-character",
        occurredAt: resolveInput().now
      })
    ]));
  });

  it("emits item events only when the queued party-boss item action resolves", async () => {
    await seedCharacter(prisma, "proof-bandage-user", 1161n, "Бинтова Проба", {
      hpCurrent: 10,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await seedCharacter(prisma, "proof-bandage-joiner", 1162n, "Свідок Бинта", {
      hpCurrent: 40,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "proof-bandage-user-character",
        itemId: "item.responsible-panic-bandage",
        quantity: 2
      }
    });
    await partyRepository.createForTelegramUser(1161n, partyInput("party-token-proof-bandage"));
    await partyRepository.joinByTokenForTelegramUser(1162n, "party-token-proof-bandage", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1161n, {
      partyInviteToken: "party-token-proof-bandage",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const item = {
      id: "item.responsible-panic-bandage",
      name: "Бинт відповідальної паніки",
      effect: {
        kind: "heal-hp" as const,
        amount: 7
      }
    };
    const queued = await bossRepository.submitItemForTelegramUser(
      1161n,
      "party-token-proof-bandage",
      1,
      item,
      resolveInput()
    );

    expect(queued.state).toBe("queued");
    expect(expectPartyBossSession(queued).rulesVersion).toBe("party-boss-proof-v1");
    expect(queued.achievementEvents).toBeUndefined();
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "proof-bandage-user-character",
          itemId: "item.responsible-panic-bandage"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 2 });

    const duplicate = await bossRepository.submitItemForTelegramUser(
      1161n,
      "party-token-proof-bandage",
      1,
      item,
      resolveInput()
    );
    const stale = await bossRepository.submitItemForTelegramUser(
      1161n,
      "party-token-proof-bandage",
      0,
      item,
      resolveInput()
    );

    expect(duplicate.state).toBe("duplicate");
    expect(duplicate.achievementEvents).toBeUndefined();
    expect(stale.state).toBe("stale");
    expect(stale.achievementEvents).toBeUndefined();

    const resolved = await bossRepository.submitActionForTelegramUser(
      1162n,
      "party-token-proof-bandage",
      1,
      "defend",
      resolveInput()
    );

    expect(resolved.state).toBe("resolved");
    expect(resolved.achievementEvents).toEqual([
      expect.objectContaining({
        type: "item.used",
        characterId: "proof-bandage-user-character",
        itemId: "item.responsible-panic-bandage",
        occurredAt: resolveInput().now
      })
    ]);
    expect(resolved.achievementEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "barrel.raid.bandage-used" })
    ]));
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "proof-bandage-user-character",
          itemId: "item.responsible-panic-bandage"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 1 });
  });

  it.each([
    ["item.loot-v1-c002", "Вареники Парного Бафу", { kind: "paired-heal" as const, amount: 8 }, 92102n],
    ["item.loot-v1-c012", "Салат «Олів'є Рейдовий»", { kind: "party-heal" as const, amount: 13 }, 92104n]
  ])("preserves the second %s stack and evidence after an earlier raid salad fully heals the round", async (
    secondItemId,
    secondItemName,
    secondEffect,
    joinerTelegramId
  ) => {
    const suffix = secondItemId.endsWith("c002") ? "paired" : "salad";
    const leaderTelegramId = joinerTelegramId - 1n;
    const leaderUserId = `shared-round-${suffix}-a`;
    const joinerUserId = `shared-round-${suffix}-z`;
    const leaderCharacterId = `${leaderUserId}-character`;
    const joinerCharacterId = `${joinerUserId}-character`;
    const token = `party-shared-round-${suffix}`;
    await seedCharacter(prisma, leaderUserId, leaderTelegramId, "Перша Салатниця", {
      hpCurrent: 10,
      hpMax: 50,
      strength: 20,
      dexterity: 93
    });
    await seedCharacter(prisma, joinerUserId, joinerTelegramId, "Друга Салатниця", {
      hpCurrent: 10,
      hpMax: 50,
      strength: 20,
      dexterity: 1
    });
    await prisma.characterItem.createMany({
      data: [
        { characterId: leaderCharacterId, itemId: "item.loot-v1-c012", quantity: 1 },
        { characterId: joinerCharacterId, itemId: secondItemId, quantity: 1 }
      ]
    });
    await partyRepository.createForTelegramUser(leaderTelegramId, partyInput(token));
    await partyRepository.joinByTokenForTelegramUser(joinerTelegramId, token, joinInput());
    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(leaderTelegramId, {
      partyInviteToken: token,
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    const session = expectPartyBossSession(started);
    const fullAfterFirst = {
      ...session.state,
      boss: { ...session.state.boss, attack: 0 },
      participants: [...session.state.participants]
        .sort((left) => left.characterId === leaderCharacterId ? -1 : 1)
        .map((participant) => ({
          ...participant,
          resources: { ...participant.resources, hp: participant.resources.hpMax - 13 }
        }))
    };
    await prisma.partyBossSession.update({
      where: { id: session.id },
      data: { stateJson: fullAfterFirst }
    });
    const commitInput = { ...resolveInput(), allowNonmedicalConsumables: true };

    await expect(bossRepository.submitItemForTelegramUser(
      leaderTelegramId,
      token,
      1,
      {
        id: "item.loot-v1-c012",
        name: "Салат «Олів'є Рейдовий»",
        effect: { kind: "party-heal", amount: 13 }
      },
      commitInput
    )).resolves.toMatchObject({ state: "queued" });
    const resolved = await bossRepository.submitItemForTelegramUser(
      joinerTelegramId,
      token,
      1,
      { id: secondItemId, name: secondItemName, effect: secondEffect },
      commitInput
    );
    const latest = expectPartyBossSession(resolved);
    const round = latest.state.roundLog.at(-1)!;

    expect(resolved.state).toBe("resolved");
    expect(round.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ characterId: leaderCharacterId, outcome: "item-used" }),
      expect.objectContaining({
        characterId: joinerCharacterId,
        outcome: "item-not-used",
        itemUnavailableReason: "effect-unavailable"
      })
    ]));
    expect(round.actions.find((entry) => entry.characterId === joinerCharacterId)?.healing ?? 0).toBe(0);
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: { characterId_itemId: { characterId: joinerCharacterId, itemId: secondItemId } }
    })).resolves.toMatchObject({ quantity: 1 });
    await expect(prisma.characterItem.findUnique({
      where: { characterId_itemId: { characterId: leaderCharacterId, itemId: "item.loot-v1-c012" } }
    })).resolves.toBeNull();
    expect(resolved.achievementEvents).toEqual([
      expect.objectContaining({ characterId: leaderCharacterId, itemId: "item.loot-v1-c012" })
    ]);
  });

  it("keeps a queued party-boss nonmedical item when its commit flag turns off", async () => {
    await seedCharacter(prisma, "party-item-gate-leader", 92105n, "Прапорцева Лідерка", {
      hpCurrent: 10,
      hpMax: 50,
      dexterity: 93
    });
    await seedCharacter(prisma, "party-item-gate-joiner", 92106n, "Прапорцевий Свідок", {
      hpCurrent: 40,
      hpMax: 50,
      dexterity: 1
    });
    await prisma.characterItem.create({
      data: {
        characterId: "party-item-gate-leader-character",
        itemId: "item.loot-v1-c014",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(92105n, partyInput("party-item-gate"));
    await partyRepository.joinByTokenForTelegramUser(92106n, "party-item-gate", joinInput());
    await bossRepository.startFromRecruitingPartyForTelegramUser(92105n, {
      partyInviteToken: "party-item-gate",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    const item = {
      id: "item.loot-v1-c014",
      name: "Насіння Диванного Друїда",
      effect: { kind: "restore-both" as const, hpAmount: 9, manaAmount: 9 }
    };
    await expect(bossRepository.submitItemForTelegramUser(
      92105n,
      "party-item-gate",
      1,
      item,
      { ...resolveInput(), allowNonmedicalConsumables: true }
    )).resolves.toMatchObject({ state: "queued" });
    const resolved = await bossRepository.submitActionForTelegramUser(
      92106n,
      "party-item-gate",
      1,
      "defend",
      { ...resolveInput(), allowNonmedicalConsumables: false }
    );
    const latest = expectPartyBossSession(resolved);

    expect(latest.state.roundLog.at(-1)?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        characterId: "party-item-gate-leader-character",
        outcome: "item-not-used",
        itemUnavailableReason: "not-usable"
      })
    ]));
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "party-item-gate-leader-character",
          itemId: "item.loot-v1-c014"
        }
      }
    })).resolves.toMatchObject({ quantity: 1 });
    expect(resolved.achievementEvents).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "item.used", itemId: "item.loot-v1-c014" })
    ]));
  });

  it("uses the latest queued party-boss choice and does not spend an overwritten item", async () => {
    await seedCharacter(prisma, "replace-item-user", 1171n, "Переобрана", {
      hpCurrent: 10,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await seedCharacter(prisma, "replace-item-joiner", 1172n, "Свідок Вибору", {
      hpCurrent: 40,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "replace-item-user-character",
        itemId: "item.responsible-panic-bandage",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1171n, partyInput("party-token-replace-item"));
    await partyRepository.joinByTokenForTelegramUser(1172n, "party-token-replace-item", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1171n, {
      partyInviteToken: "party-token-replace-item",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const item = {
      id: "item.responsible-panic-bandage",
      name: "Бинт відповідальної паніки",
      effect: {
        kind: "heal-hp" as const,
        amount: 7
      }
    };

    const itemQueued = await bossRepository.submitItemForTelegramUser(
      1171n,
      "party-token-replace-item",
      1,
      item,
      resolveInput()
    );
    const overwritten = await bossRepository.submitActionForTelegramUser(
      1171n,
      "party-token-replace-item",
      1,
      "defend",
      resolveInput()
    );
    const resolved = await bossRepository.submitActionForTelegramUser(
      1172n,
      "party-token-replace-item",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(itemQueued.state).toBe("queued");
    expect(overwritten.state).toBe("updated");
    expect(resolved.state).toBe("resolved");
    expect(latest.state.roundLog.at(-1)?.actions.find(
      (action) => action.characterId === "replace-item-user-character"
    )).toMatchObject({
      action: "defend"
    });
    expect(resolved.achievementEvents).toBeUndefined();
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "replace-item-user-character",
          itemId: "item.responsible-panic-bandage"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 1 });
  });

  it("uses a party-boss item when it overwrites the earlier queued action", async () => {
    await seedCharacter(prisma, "replace-action-user", 1181n, "Переобрана Манатка", {
      hpCurrent: 10,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await seedCharacter(prisma, "replace-action-joiner", 1182n, "Свідок Манатки", {
      hpCurrent: 40,
      hpMax: 40,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "replace-action-user-character",
        itemId: "item.responsible-panic-bandage",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1181n, partyInput("party-token-replace-action"));
    await partyRepository.joinByTokenForTelegramUser(1182n, "party-token-replace-action", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1181n, {
      partyInviteToken: "party-token-replace-action",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const actionQueued = await bossRepository.submitActionForTelegramUser(
      1181n,
      "party-token-replace-action",
      1,
      "defend",
      resolveInput()
    );
    const itemUpdated = await bossRepository.submitItemForTelegramUser(
      1181n,
      "party-token-replace-action",
      1,
      {
        id: "item.responsible-panic-bandage",
        name: "Бинт відповідальної паніки",
        effect: {
          kind: "heal-hp",
          amount: 7
        }
      },
      resolveInput()
    );
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "replace-action-user-character",
          itemId: "item.responsible-panic-bandage"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 1 });

    const resolved = await bossRepository.submitActionForTelegramUser(
      1182n,
      "party-token-replace-action",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(actionQueued.state).toBe("queued");
    expect(itemUpdated.state).toBe("updated");
    expect(resolved.state).toBe("resolved");
    expect(latest.state.roundLog.at(-1)?.actions.find(
      (action) => action.characterId === "replace-action-user-character"
    )).toMatchObject({
      action: "item",
      outcome: "item-used",
      itemName: "Бинт відповідальної паніки",
      healing: 7
    });
    expect(resolved.achievementEvents).toEqual([
      expect.objectContaining({
        type: "item.used",
        characterId: "replace-action-user-character",
        itemId: "item.responsible-panic-bandage"
      })
    ]);
    expect(await prisma.characterItem.count({
      where: {
        characterId: "replace-action-user-character",
        itemId: "item.responsible-panic-bandage"
      }
    })).toBe(0);
  });

  it("treats duplicate Big Barrel gear actions as a single queued support effect", async () => {
    const grant = findMantokAbilityGrantByKey("bcshield");
    if (!grant?.combat) {
      throw new Error("Expected barrel shield combat grant.");
    }

    await seedCharacter(prisma, "duplicate-gear-leader-user", 1191n, "Щитова Лідерка", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      strength: 20,
      equipment: [{ slot: "offhand", itemId: "item.set.barrel-brother.shield" }]
    });
    await seedCharacter(prisma, "duplicate-gear-joiner-user", 1192n, "Свідок Щита", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      strength: 20
    });
    await partyRepository.createForTelegramUser(1191n, partyInput("party-token-duplicate-gear"));
    await partyRepository.joinByTokenForTelegramUser(1192n, "party-token-duplicate-gear", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1191n, {
      partyInviteToken: "party-token-duplicate-gear",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    const startedSession = expectPartyBossSession(started);
    await prisma.partyBossSession.update({
      where: { id: startedSession.id },
      data: {
        stateJson: {
          ...startedSession.state,
          participants: startedSession.state.participants.map((participant) =>
            participant.characterId === "duplicate-gear-leader-user-character"
              ? {
                  ...participant,
                  resources: {
                    ...participant.resources,
                    playerAbilityFumbles: {
                      version: 1,
                      abilities: {
                        "gear.barrel-counter-shield": {
                          version: 1,
                          cycle: 0,
                          usesInCycle: 0,
                          triggerAt: 13
                        }
                      }
                    }
                  }
                }
              : participant
          )
        }
      }
    });

    const gearAbility = { profile: grant.combat.profile };
    const queued = await bossRepository.submitActionForTelegramUser(
      1191n,
      "party-token-duplicate-gear",
      1,
      "gear",
      resolveInput(),
      { gearAbility }
    );
    const duplicate = await bossRepository.submitActionForTelegramUser(
      1191n,
      "party-token-duplicate-gear",
      1,
      "gear",
      resolveInput(),
      { gearAbility }
    );

    expect(queued.state).toBe("queued");
    expect(duplicate.state).toBe("duplicate");
    expect(duplicate.achievementEvents).toBeUndefined();
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: expectPartyBossSession(queued).id,
        actorCharacterId: "duplicate-gear-leader-user-character"
      }
    })).toBe(1);

    const resolved = await bossRepository.submitActionForTelegramUser(
      1192n,
      "party-token-duplicate-gear",
      1,
      "defend",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);
    const round = latest.state.roundLog.at(-1);
    const leaderGearActions = round?.actions.filter(
      (action) => action.characterId === "duplicate-gear-leader-user-character" && action.action === "gear"
    ) ?? [];
    const leaderAfter = latest.state.participants.find(
      (participant) => participant.characterId === "duplicate-gear-leader-user-character"
    );

    expect(resolved.state).toBe("resolved");
    expect(leaderGearActions).toHaveLength(1);
    expect(leaderGearActions[0]).toMatchObject({
      skillId: "gear.barrel-counter-shield",
      guard: 2,
      manaSpent: 0
    });
    expect(Object.keys(leaderAfter?.resources.cooldowns?.abilities ?? {})).toEqual(["gear.barrel-counter-shield"]);
    expect(resolved.achievementEvents).toEqual([
      expect.objectContaining({
        type: "mantok.gear-action.used",
        characterId: "duplicate-gear-leader-user-character"
      })
    ]);
  });

  it("rejects Big Barrel gear actions without mana before writing the action ledger", async () => {
    const grant = findMantokAbilityGrantByKey("harpcp");
    if (!grant?.combat) {
      throw new Error("Expected harp combat grant.");
    }

    await seedCharacter(prisma, "gear-no-mana-user", 1193n, "Без Мани", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      manaCurrent: 0,
      manaMax: 10,
      equipment: [{ slot: "tool", itemId: "item.set.couplet.harp" }]
    });
    await partyRepository.createForTelegramUser(1193n, partyInput("party-token-gear-no-mana"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1193n, {
      partyInviteToken: "party-token-gear-no-mana",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const beforeState = started.session.state;

    const blocked = await bossRepository.submitActionForTelegramUser(
      1193n,
      "party-token-gear-no-mana",
      1,
      "gear",
      resolveInput(),
      { gearAbility: { profile: grant.combat.profile } }
    );
    const latest = expectPartyBossSession(blocked);

    expect(blocked.state).toBe("gear-unavailable");
    if (blocked.state === "gear-unavailable") {
      expect(blocked.reason).toBe("not-enough-mana");
    }
    expect(latest.state).toEqual(beforeState);
    expect(latest.turn).toBe(1);
    expect(latest.state.roundLog).toHaveLength(0);
    expect(latest.state.roundLog.at(-1)?.bossRetaliations ?? []).toEqual([]);
    expect(latest.state.participants.find(
      (participant) => participant.characterId === "gear-no-mana-user-character"
    )?.resources).toEqual(beforeState.participants.find(
      (participant) => participant.characterId === "gear-no-mana-user-character"
    )?.resources);
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: latest.id,
        actorCharacterId: "gear-no-mana-user-character"
      }
    })).toBe(0);
    expect(blocked.achievementEvents).toBeUndefined();
  });

  it("rejects Big Barrel gear actions missing from the frozen participant grant snapshot before writing the action ledger", async () => {
    const grant = findMantokAbilityGrantByKey("rldagr");
    if (!grant?.combat) {
      throw new Error("Expected red-line dagger combat grant.");
    }

    await seedCharacter(prisma, "gear-missing-grant-user", 1195n, "Без Кинджала", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      manaCurrent: 10,
      manaMax: 10
    });
    await partyRepository.createForTelegramUser(1195n, partyInput("party-token-gear-missing-grant"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1195n, {
      partyInviteToken: "party-token-gear-missing-grant",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const beforeState = started.session.state;

    const blocked = await bossRepository.submitActionForTelegramUser(
      1195n,
      "party-token-gear-missing-grant",
      1,
      "gear",
      resolveInput(),
      { gearAbility: { profile: grant.combat.profile } }
    );
    const latest = expectPartyBossSession(blocked);

    expect(blocked.state).toBe("stale");
    expect(latest.state).toEqual(beforeState);
    expect(latest.turn).toBe(1);
    expect(latest.state.roundLog).toHaveLength(0);
    expect(latest.state.roundLog.at(-1)?.bossRetaliations ?? []).toEqual([]);
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: latest.id,
        actorCharacterId: "gear-missing-grant-user-character"
      }
    })).toBe(0);
    expect(blocked.achievementEvents).toBeUndefined();
  });

  it("rejects Big Barrel gear actions on equipment cooldown before writing the action ledger", async () => {
    const grant = findMantokAbilityGrantByKey("bcshield");
    if (!grant?.combat) {
      throw new Error("Expected barrel shield combat grant.");
    }

    await seedCharacter(prisma, "gear-cooldown-user", 1194n, "Відсапана Щитниця", {
      level: 10,
      hpCurrent: 60,
      hpMax: 60,
      manaCurrent: 10,
      manaMax: 10,
      equipment: [{ slot: "offhand", itemId: "item.set.barrel-brother.shield" }]
    });
    await partyRepository.createForTelegramUser(1194n, partyInput("party-token-gear-cooldown"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1194n, {
      partyInviteToken: "party-token-gear-cooldown",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    const cooldownState = {
      ...started.session.state,
      participants: started.session.state.participants.map((participant) =>
        participant.characterId === "gear-cooldown-user-character"
          ? {
              ...participant,
              resources: {
                ...participant.resources,
                cooldowns: {
                  ...participant.resources.cooldowns,
                  abilities: {
                    ...(participant.resources.cooldowns?.abilities ?? {}),
                    "gear.barrel-counter-shield": {
                      id: "gear.barrel-counter-shield",
                      remainingTurns: 2
                    }
                  }
                }
              }
            }
          : participant
      )
    };
    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: { stateJson: cooldownState }
    });
    const beforeResources = cooldownState.participants.find(
      (participant) => participant.characterId === "gear-cooldown-user-character"
    )?.resources;

    const blocked = await bossRepository.submitActionForTelegramUser(
      1194n,
      "party-token-gear-cooldown",
      1,
      "gear",
      resolveInput(),
      { gearAbility: { profile: grant.combat.profile } }
    );
    const latest = expectPartyBossSession(blocked);

    expect(blocked.state).toBe("gear-unavailable");
    if (blocked.state === "gear-unavailable") {
      expect(blocked.reason).toBe("skill-on-cooldown");
    }
    expect(latest.state).toEqual(cooldownState);
    expect(latest.turn).toBe(1);
    expect(latest.state.roundLog).toHaveLength(0);
    expect(latest.state.roundLog.at(-1)?.bossRetaliations ?? []).toEqual([]);
    expect(latest.state.participants.find(
      (participant) => participant.characterId === "gear-cooldown-user-character"
    )?.resources).toEqual(beforeResources);
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: latest.id,
        actorCharacterId: "gear-cooldown-user-character"
      }
    })).toBe(0);
    expect(blocked.achievementEvents).toBeUndefined();
  });

  it("does not consume a party-boss field kit when raid HP is already above its threshold", async () => {
    await seedCharacter(prisma, "big-field-kit-healthy-user", 1153n, "Майже Здорова", {
      hpCurrent: 130,
      hpMax: 100,
      level: 8,
      strength: 20,
      dexterity: 20
    });
    await prisma.characterItem.create({
      data: {
        characterId: "big-field-kit-healthy-user-character",
        itemId: "item.field-kit",
        quantity: 1
      }
    });
    await partyRepository.createForTelegramUser(1153n, {
      ...partyInput("party-token-big-field-kit-healthy"),
      periodId: "2026-06-30T10:44",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1153n, {
      partyInviteToken: "party-token-big-field-kit-healthy",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const result = await bossRepository.submitItemForTelegramUser(
      1153n,
      "party-token-big-field-kit-healthy",
      1,
      {
        id: "item.field-kit",
        name: "Польова аптечка",
        effect: {
          kind: "heal-hp-to-min-percent",
          percent: 93
        }
      },
      resolveInput()
    );

    expect(result.state).toBe("item-unavailable");
    if (result.state === "item-unavailable") {
      expect(result.reason).toBe("full-hp");
    }
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: "big-field-kit-healthy-user-character",
          itemId: "item.field-kit"
        }
      },
      select: { quantity: true }
    })).resolves.toEqual({ quantity: 1 });
  });

  it("records every Big Barrel knockout once before releasing leases and live party keys", async () => {
    await seedCharacter(prisma, "knockout-leader-user", 2001n, "Крихка Лідерка", { hp: 1, level: 8 });
    await seedCharacter(prisma, "knockout-joiner-user", 2002n, "Крихкий Помічник", { hp: 1, level: 8 });
    await partyRepository.createForTelegramUser(2001n, {
      ...partyInput("party-token-knockout"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(2002n, "party-token-knockout", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(2001n, {
      partyInviteToken: "party-token-knockout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        turn: 4,
        stateJson: {
          ...started.session.state,
          turn: 4,
          participants: started.session.state.participants.map((participant) => ({
            ...participant,
            resources: { ...participant.resources, hp: 1 }
          }))
        }
      }
    });
    const resolved = await bossRepository.resolveTimedOutByToken("party-token-knockout", {
      now: new Date("2026-06-30T10:01:00.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:01:23.000Z")
    }, "due");
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("lost");
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: latest.partySessionId } })).toBe(0);
    expect(await prisma.partyParticipant.count({
      where: {
        sessionId: latest.partySessionId,
        activeMembershipKey: {
          not: null
        }
      }
    })).toBe(0);
    const chatEntries = await prisma.partyRaidChatEntry.findMany({
      where: { partySession: { inviteToken: "party-token-knockout" } },
      orderBy: { revision: "asc" },
      select: { eventType: true, actorCharacterId: true }
    });
    expect(chatEntries.slice(0, 3)).toEqual([
      { eventType: "party.created", actorCharacterId: "knockout-leader-user-character" },
      { eventType: "participant.joined", actorCharacterId: "knockout-joiner-user-character" },
      { eventType: "raid.started", actorCharacterId: "knockout-leader-user-character" }
    ]);
    expect(chatEntries.slice(3, 5).sort((left, right) =>
      String(left.actorCharacterId).localeCompare(String(right.actorCharacterId))
    )).toEqual([
      { eventType: "participant.knocked-out", actorCharacterId: "knockout-joiner-user-character" },
      { eventType: "participant.knocked-out", actorCharacterId: "knockout-leader-user-character" }
    ]);
    expect(chatEntries.at(-1)).toEqual({ eventType: "raid.lost", actorCharacterId: null });
  });

  it("repairs one malformed due session without blocking healthy due work", async () => {
    await seedCharacter(prisma, "repair-bad-leader", 1091n, "Зламаний лідер", { level: 8 });
    await seedCharacter(prisma, "repair-bad-joiner", 1092n, "Зламаний свідок", { level: 8 });
    await seedCharacter(prisma, "repair-good-leader", 1093n, "Справна лідерка", { level: 8 });
    await seedCharacter(prisma, "repair-good-joiner", 1094n, "Справний свідок", { level: 8 });
    await partyRepository.createForTelegramUser(1091n, partyInput("party-repair-bad"));
    await partyRepository.joinByTokenForTelegramUser(1092n, "party-repair-bad", joinInput());
    await partyRepository.createForTelegramUser(1093n, partyInput("party-repair-good"));
    await partyRepository.joinByTokenForTelegramUser(1094n, "party-repair-good", joinInput());
    const dueAt = new Date("2026-06-30T10:00:01.000Z");
    await bossRepository.startFromRecruitingPartyForTelegramUser(1091n, {
      partyInviteToken: "party-repair-bad",
      now: now(),
      turnExpiresAt: dueAt
    });
    await bossRepository.startFromRecruitingPartyForTelegramUser(1093n, {
      partyInviteToken: "party-repair-good",
      now: now(),
      turnExpiresAt: dueAt
    });
    const badParty = await prisma.partySession.findUniqueOrThrow({ where: { inviteToken: "party-repair-bad" } });
    await prisma.partyBossSession.update({
      where: { partySessionId: badParty.id },
      data: { stateJson: { rulesVersion: "big-barrel-brother-v1" } }
    });

    const due = await bossRepository.listDueTimedOutSessions(new Date("2026-06-30T10:00:23.000Z"));

    expect(due.map((session) => session.partyInviteToken)).toContain("party-repair-good");
    expect(due.map((session) => session.partyInviteToken)).not.toContain("party-repair-bad");
    const goodParty = await prisma.partySession.findUniqueOrThrow({ where: { inviteToken: "party-repair-good" } });
    await expect(prisma.partyBossSession.findUnique({ where: { partySessionId: badParty.id } })).resolves.toMatchObject({
      status: "cancelled",
      resultJson: { status: "cancelled" }
    });
    await expect(prisma.activeCombatLease.count({
      where: { kind: "party-boss", referenceId: badParty.id }
    })).resolves.toBe(0);
    await expect(prisma.activeCombatLease.count({
      where: { kind: "party-boss", referenceId: goodParty.id }
    })).resolves.toBe(2);
  });

  it("releases an orphan party-boss lease during the bounded due scan", async () => {
    await seedCharacter(prisma, "orphan-party-boss", 1095n, "Осиротілий учасник", { level: 8 });
    await prisma.activeCombatLease.create({
      data: {
        id: "orphan-party-boss-lease",
        characterId: "orphan-party-boss-character",
        kind: "party-boss",
        referenceId: "missing-party-session"
      }
    });

    const disabledService = new PartyBossService(
      bossRepository,
      { enabled: false },
      () => new Date("2026-06-30T10:00:23.000Z")
    );
    await disabledService.listDueTimedOutSessions();

    await expect(prisma.activeCombatLease.findUnique({ where: { id: "orphan-party-boss-lease" } })).resolves.toBeNull();
  });

  it("freezes a zero-HP leader as knocked out while starting the healthy joiner", async () => {
    await seedCharacter(prisma, "zero-leader", 90001n, "Нульова провідниця", { hpCurrent: 0, hpMax: 25, level: 8 });
    await seedCharacter(prisma, "zero-leader-joiner", 90002n, "Здорова супутниця", { hp: 25, level: 8 });
    await partyRepository.createForTelegramUser(90001n, partyInput("party-zero-leader"));
    await partyRepository.joinByTokenForTelegramUser(90002n, "party-zero-leader", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(90001n, {
      partyInviteToken: "party-zero-leader",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started).toMatchObject({ state: "started" });
    expect(expectPartyBossSession(started).state.participants.map(({ characterId, status, resources }) => ({
      characterId,
      status,
      hp: resources.hp
    }))).toEqual(expect.arrayContaining([
      { characterId: "zero-leader-character", status: "knocked-out", hp: 0 },
      { characterId: "zero-leader-joiner-character", status: "active", hp: 25 }
    ]));
  });

  it("freezes a zero-HP joiner as knocked out while keeping the leader active", async () => {
    await seedCharacter(prisma, "zero-joiner-leader", 90003n, "Здорова провідниця", { hp: 25, level: 8 });
    await seedCharacter(prisma, "zero-joiner", 90004n, "Нульовий супутник", { hpCurrent: 0, hpMax: 25, level: 8 });
    await partyRepository.createForTelegramUser(90003n, partyInput("party-zero-joiner"));
    await partyRepository.joinByTokenForTelegramUser(90004n, "party-zero-joiner", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(90003n, {
      partyInviteToken: "party-zero-joiner",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started).toMatchObject({ state: "started" });
    expect(expectPartyBossSession(started).state.participants.find(
      (participant) => participant.characterId === "zero-joiner-leader-character"
    )).toMatchObject({ status: "active", resources: { hp: 25 } });
    expect(expectPartyBossSession(started).state.participants.find(
      (participant) => participant.characterId === "zero-joiner-character"
    )).toMatchObject({ status: "knocked-out", resources: { hp: 0 } });
  });

  it("starts a mixed roster with each zero-HP participant frozen as knocked out", async () => {
    await seedCharacter(prisma, "mixed-leader", 90005n, "Провідник", { hp: 25, level: 8 });
    await seedCharacter(prisma, "mixed-zero", 90006n, "Вибита супутниця", { hpCurrent: 0, hpMax: 25, level: 8 });
    await seedCharacter(prisma, "mixed-healthy", 90007n, "Стійкий супутник", { hp: 25, level: 8 });
    await partyRepository.createForTelegramUser(90005n, partyInput("party-zero-mixed"));
    await partyRepository.joinByTokenForTelegramUser(90006n, "party-zero-mixed", joinInput());
    await partyRepository.joinByTokenForTelegramUser(90007n, "party-zero-mixed", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(90005n, {
      partyInviteToken: "party-zero-mixed",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started).toMatchObject({ state: "started" });
    expect(expectPartyBossSession(started).state.participants.map(({ characterId, status }) => ({
      characterId,
      status
    }))).toEqual(expect.arrayContaining([
      { characterId: "mixed-leader-character", status: "active" },
      { characterId: "mixed-zero-character", status: "knocked-out" },
      { characterId: "mixed-healthy-character", status: "active" }
    ]));
  });

  it("starts an all-zero-HP roster without a poison row and settles it rewardlessly", async () => {
    await seedCharacter(prisma, "all-zero-leader", 90008n, "Вибита провідниця", { hpCurrent: 0, hpMax: 25, level: 8 });
    await seedCharacter(prisma, "all-zero-joiner", 90009n, "Вибитий супутник", { hpCurrent: 0, hpMax: 25, level: 8 });
    await partyRepository.createForTelegramUser(90008n, partyInput("party-all-zero"));
    await partyRepository.joinByTokenForTelegramUser(90009n, "party-all-zero", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(90008n, {
      partyInviteToken: "party-all-zero",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started).toMatchObject({ state: "started" });
    expect(expectPartyBossSession(started).state.participants.every(
      (participant) => participant.status === "knocked-out" && participant.resources.hp === 0
    )).toBe(true);

    const resolved = await bossRepository.resolveTimedOutByToken("party-all-zero", {
      now: new Date("2026-06-30T10:00:24.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:00:47.000Z")
    }, "due");
    expect(resolved).toMatchObject({ state: "resolved", session: { status: "lost" } });
    await expect(prisma.activeCombatLease.count({
      where: { referenceId: expectPartyBossSession(started).partySessionId, kind: "party-boss" }
    })).resolves.toBe(0);
    await expect(prisma.dailyAction.count({
      where: { characterId: { in: ["all-zero-leader-character", "all-zero-joiner-character"] } }
    })).resolves.toBe(0);
  });

  it("scheduled start accepts a due zero-HP member as a frozen knockout", async () => {
    const dueAt = new Date("2026-06-30T10:13:01.000Z");
    await seedCharacter(prisma, "scheduled-zero-leader", 90010n, "Планова провідниця", { hp: 25, level: 8 });
    await seedCharacter(prisma, "scheduled-zero-joiner", 90011n, "Плановий нокаут", { hpCurrent: 0, hpMax: 25, level: 8 });
    await partyRepository.createForTelegramUser(90010n, {
      ...partyInput("party-scheduled-zero"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(90011n, "party-scheduled-zero", joinInput());
    const service = new PartyBossService(bossRepository, { enabled: true }, () => dueAt);

    const started = await service.startFromPartyForTelegramUser(90010n, "party-scheduled-zero", {
      allowExpiredRecruiting: true
    });

    expect(started).toMatchObject({ state: "started" });
    expect(expectPartyBossSession(started).state.participants.find(
      (participant) => participant.characterId === "scheduled-zero-joiner-character"
    )).toMatchObject({ status: "knocked-out", resources: { hp: 0 } });
  });

  it("finishes an already-active raid after restart with the player-facing flag off", async () => {
    await seedCharacter(prisma, "flag-off-leader", 91108n, "Лідер без прапорця", { hp: 300, level: 8 });
    await seedCharacter(prisma, "flag-off-joiner", 91109n, "Свідок без прапорця", { hp: 300, level: 8 });
    await partyRepository.createForTelegramUser(91108n, partyInput("party-flag-off-active"));
    await partyRepository.joinByTokenForTelegramUser(91109n, "party-flag-off-active", joinInput());
    const enabled = new PartyBossService(bossRepository, { enabled: true }, now);
    const started = await enabled.startFromPartyForTelegramUser(91108n, "party-flag-off-active");
    if (!("session" in started)) throw new Error(`Expected enabled start, got ${started.state}`);
    const lethalState = {
      ...started.session.state,
      boss: { ...started.session.state.boss, attack: 587 },
      participants: started.session.state.participants.map((participant) => ({
        ...participant,
        resources: { ...participant.resources, hp: 1 }
      }))
    };
    const dueAt = new Date("2026-06-30T10:01:00.000Z");
    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: { stateJson: lethalState, turnExpiresAt: dueAt }
    });
    const disabledAfterRestart = new PartyBossService(
      bossRepository,
      { enabled: false },
      () => new Date(dueAt.getTime() + 1)
    );

    const due = await disabledAfterRestart.listDueTimedOutSessions();
    expect(due.map((session) => session.id)).toContain(started.session.id);
    const resolved = await disabledAfterRestart.resolveDueTimedOutByToken("party-flag-off-active");
    expect(resolved).toMatchObject({ state: "resolved", session: { status: "lost" } });
    await expect(prisma.activeCombatLease.count({
      where: { kind: "party-boss", referenceId: started.session.partySessionId }
    })).resolves.toBe(0);
    await expect(disabledAfterRestart.resolveDueTimedOutByToken("party-flag-off-active")).resolves.toMatchObject({
      state: "terminal",
      session: { status: "lost" }
    });
  });

  it("preserves terminal result and all journal pages after a nonleader restart", async () => {
    const history = await seedTerminalBossHistory(prisma, partyRepository, bossRepository, {
      token: "party-history-nonleader",
      leaderUserId: "history-nonleader-leader",
      leaderTelegramId: 91110n,
      joinerUserId: "history-nonleader-joiner",
      joinerTelegramId: 91111n
    });
    const characters = new PrismaCharacterRepository(prisma);

    await expect(characters.restartByTelegramUserId(91111n)).resolves.toBe("deleted");
    const result = await bossRepository.findByPartyInviteToken(history.token);
    expect(result).toMatchObject({ status: "won", leaderCharacterId: history.leaderCharacterId });
    for (let page = 0; page < 25; page += 1) {
      const journal = await bossRepository.findJournalPageByPartyInviteToken(history.token, page);
      expect(journal?.journal).toMatchObject({ page, totalPages: 25, round: { turn: page + 1 } });
    }
  });

  it("reanchors terminal history when the leader restarts and keeps hot state bounded", async () => {
    const history = await seedTerminalBossHistory(prisma, partyRepository, bossRepository, {
      token: "party-history-leader",
      leaderUserId: "history-leader-leader",
      leaderTelegramId: 91112n,
      joinerUserId: "history-leader-joiner",
      joinerTelegramId: 91113n
    });
    const characters = new PrismaCharacterRepository(prisma);

    await expect(characters.restartByTelegramUserId(91112n)).resolves.toBe("deleted");
    const result = await bossRepository.findByPartyInviteToken(history.token);
    expect(result).toMatchObject({ status: "won", leaderCharacterId: history.leaderCharacterId });
    expect(result?.participants.map((participant) => participant.id)).toEqual([history.joinerCharacterId]);
    expect(result?.state.roundLog).toHaveLength(1);
    await expect(prisma.partyBossRound.count({ where: { sessionId: history.bossSessionId } })).resolves.toBe(25);
    const first = await bossRepository.findJournalPageByPartyInviteToken(history.token, 0);
    const last = await bossRepository.findJournalPageByPartyInviteToken(history.token, 24);
    expect(first?.journal).toMatchObject({ page: 0, totalPages: 25, round: { turn: 1 } });
    expect(last?.journal).toMatchObject({ page: 24, totalPages: 25, round: { turn: 25 } });
  });

  it("rejects corrupt persisted ward counters before a historical page can render NaN", async () => {
    const history = await seedTerminalBossHistory(prisma, partyRepository, bossRepository, {
      token: "party-history-corrupt-ward",
      leaderUserId: "history-corrupt-ward-leader",
      leaderTelegramId: 91116n,
      joinerUserId: "history-corrupt-ward-joiner",
      joinerTelegramId: 91117n
    });
    const stored = await prisma.partyBossRound.findUniqueOrThrow({
      where: { sessionId_turn: { sessionId: history.bossSessionId, turn: 1 } }
    });
    const corruptRound = stored.roundJson as Record<string, unknown>;
    corruptRound.wardSign = {
      kind: "kharakternyk",
      status: "triggered",
      supportCount: 2,
      supportCap: "not-a-number",
      usesRemaining: 1,
      usesMax: 2,
      mitigationPercent: 13,
      preventedDamage: 3,
      affectedCharacterIds: [history.leaderCharacterId]
    };
    await prisma.partyBossRound.update({
      where: { id: stored.id },
      data: { roundJson: corruptRound as never }
    });

    await expect(bossRepository.findJournalPageByPartyInviteToken(history.token, 0))
      .rejects.toBeInstanceOf(PartyBossStateValidationError);
  });

  it("backfills the original leader from a real pre-migration terminal JSON fixture", async () => {
    const legacyDir = await mkdtemp(join(tmpdir(), "kvestarnia-party-boss-legacy-history-"));
    const legacyPrisma = new PrismaClient({
      datasources: { db: { url: `file:${join(legacyDir, "test.db").replace(/\\/g, "/")}` } }
    });

    try {
      await createMinimalSchema(legacyPrisma);
      await applyRaidChatMigration(legacyPrisma, RAID_CHAT_MIGRATIONS.slice(0, 2));
      const legacyRaidChat = new PrismaPartyRaidChatTransactionWriter(true);
      const legacyParties = new PrismaPartySessionRepository(legacyPrisma, legacyRaidChat);
      const legacyBosses = new PrismaPartyBossRepository(
        legacyPrisma,
        new HpRecoveryNotificationProducer(true),
        legacyRaidChat
      );
      await seedCharacter(legacyPrisma, "legacy-history-leader", 91114n, "Первісна провідниця", { hp: 300, level: 8 });
      await seedCharacter(legacyPrisma, "legacy-history-joiner", 91115n, "Свідок історії", { hp: 300, level: 8 });
      await legacyParties.createForTelegramUser(91114n, partyInput("party-legacy-history"));
      await legacyParties.joinByTokenForTelegramUser(91115n, "party-legacy-history", joinInput());
      const started = await legacyBosses.startFromRecruitingPartyForTelegramUser(91114n, {
        partyInviteToken: "party-legacy-history",
        now: now(),
        turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
      });
      const session = expectPartyBossSession(started);
      const completedAt = new Date("2026-06-30T10:13:00.000Z");
      const rounds = Array.from({ length: 25 }, (_, index) => ({
        turn: index + 1,
        actions: session.state.participants.map((participant) => ({
          characterId: participant.characterId,
          action: "attack" as const,
          origin: "manual" as const,
          outcome: "hit" as const,
          damage: 1,
          manaSpent: 0
        })),
        bossDamage: session.state.participants.length,
        bossHpAfter: index === 24 ? 0 : Math.max(1, session.state.boss.hp - index - 1),
        bossRetaliations: [],
        participantsAfter: session.state.participants.map((participant) => ({
          characterId: participant.characterId,
          status: participant.status,
          hp: participant.resources.hp,
          hpMax: participant.resources.hpMax,
          mana: participant.resources.mana,
          manaMax: participant.resources.manaMax
        })),
        statusAfter: index === 24 ? "won" as const : "active" as const
      }));
      const terminalState = {
        ...session.state,
        status: "won" as const,
        turn: 26,
        boss: { ...session.state.boss, hp: 0 },
        roundLog: [rounds[24]!],
        completedAt: completedAt.toISOString()
      };
      const { leaderCharacterId: originalHistoricalLeader, ...legacyStateWithoutLeader } = terminalState;
      expect(originalHistoricalLeader).toBe("legacy-history-leader-character");
      await legacyPrisma.$transaction(async (tx) => {
        await tx.partyBossSession.update({
          where: { id: session.id },
          data: {
            status: "won",
            turn: 26,
            stateJson: legacyStateWithoutLeader,
            resultJson: null,
            completedAt,
            turnExpiresAt: completedAt
          }
        });
        await tx.activeCombatLease.deleteMany({ where: { referenceId: session.partySessionId, kind: "party-boss" } });
        await tx.partyParticipant.updateMany({
          where: { sessionId: session.partySessionId },
          data: { activeMembershipKey: null }
        });
        await tx.partySession.update({
          where: { id: session.partySessionId },
          data: { status: "completed", activeLeaderKey: null }
        });
      });
      const beforeMigration = await legacyPrisma.partyBossSession.findUniqueOrThrow({
        where: { id: session.id },
        select: { stateJson: true }
      });
      expect(beforeMigration.stateJson).not.toHaveProperty("leaderCharacterId");

      await applyRaidChatMigration(legacyPrisma, RAID_CHAT_MIGRATIONS.slice(2));
      await legacyPrisma.partyBossRound.createMany({
        data: rounds.map((round) => ({ sessionId: session.id, turn: round.turn, roundJson: round }))
      });
      const characters = new PrismaCharacterRepository(legacyPrisma);
      await expect(characters.restartByTelegramUserId(91114n)).resolves.toBe("deleted");

      const reloaded = await legacyBosses.findByPartyInviteToken("party-legacy-history");
      expect(reloaded).toMatchObject({
        status: "won",
        leaderCharacterId: originalHistoricalLeader,
        result: { status: "won" }
      });
      expect(reloaded?.result?.participants.map((participant) => participant.characterId)).toEqual(expect.arrayContaining([
        "legacy-history-leader-character",
        "legacy-history-joiner-character"
      ]));
      expect(reloaded?.result?.participants).toHaveLength(2);
      for (let page = 0; page < 25; page += 1) {
        await expect(legacyBosses.findJournalPageByPartyInviteToken("party-legacy-history", page))
          .resolves.toMatchObject({ journal: { page, totalPages: 25, round: { turn: page + 1 } } });
      }
    } finally {
      await legacyPrisma.$disconnect();
      await rm(legacyDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }, 60_000);

  it("normalizes exact pre-0.3.16 zero-HP objects while preserving scalar corruption for isolated repair", async () => {
    const legacyDir = await mkdtemp(join(tmpdir(), "kvestarnia-party-boss-legacy-zero-hp-"));
    const legacyPrisma = new PrismaClient({
      datasources: { db: { url: `file:${join(legacyDir, "test.db").replace(/\\/g, "/")}` } }
    });

    try {
      await createMinimalSchema(legacyPrisma);
      await applyRaidChatMigration(legacyPrisma, RAID_CHAT_MIGRATIONS.slice(0, 2));
      const legacyRaidChat = new PrismaPartyRaidChatTransactionWriter(true);
      const legacyParties = new PrismaPartySessionRepository(legacyPrisma, legacyRaidChat);
      const legacyBosses = new PrismaPartyBossRepository(
        legacyPrisma,
        new HpRecoveryNotificationProducer(true),
        legacyRaidChat
      );
      const mixed = await seedPre0316ZeroHpParty(legacyPrisma, legacyParties, legacyBosses, {
        token: "party-legacy-zero-mixed",
        leaderUserId: "legacy-zero-mixed-leader",
        leaderTelegramId: 91201n,
        joinerUserId: "legacy-zero-mixed-joiner",
        joinerTelegramId: 91202n,
        leaderHp: 300,
        terminal: false
      });
      const allZero = await seedPre0316ZeroHpParty(legacyPrisma, legacyParties, legacyBosses, {
        token: "party-legacy-all-zero",
        leaderUserId: "legacy-all-zero-leader",
        leaderTelegramId: 91203n,
        joinerUserId: "legacy-all-zero-joiner",
        joinerTelegramId: 91204n,
        leaderHp: 0,
        terminal: false
      });
      const terminalLeader = await seedPre0316ZeroHpParty(legacyPrisma, legacyParties, legacyBosses, {
        token: "party-legacy-terminal-leader-restart",
        leaderUserId: "legacy-terminal-leader-restart-leader",
        leaderTelegramId: 91205n,
        joinerUserId: "legacy-terminal-leader-restart-joiner",
        joinerTelegramId: 91206n,
        leaderHp: 300,
        terminal: true
      });
      const terminalNonleader = await seedPre0316ZeroHpParty(legacyPrisma, legacyParties, legacyBosses, {
        token: "party-legacy-terminal-nonleader-restart",
        leaderUserId: "legacy-terminal-nonleader-restart-leader",
        leaderTelegramId: 91207n,
        joinerUserId: "legacy-terminal-nonleader-restart-joiner",
        joinerTelegramId: 91208n,
        leaderHp: 300,
        terminal: true
      });
      const malformed = await seedPre0316ZeroHpParty(legacyPrisma, legacyParties, legacyBosses, {
        token: "party-legacy-zero-string",
        leaderUserId: "legacy-zero-string-leader",
        leaderTelegramId: 91209n,
        joinerUserId: "legacy-zero-string-joiner",
        joinerTelegramId: 91210n,
        leaderHp: 300,
        terminal: false
      });
      const terminalScalar = await seedPre0316ZeroHpParty(legacyPrisma, legacyParties, legacyBosses, {
        token: "party-legacy-terminal-scalar",
        leaderUserId: "legacy-terminal-scalar-leader",
        leaderTelegramId: 91211n,
        joinerUserId: "legacy-terminal-scalar-joiner",
        joinerTelegramId: 91212n,
        leaderHp: 300,
        terminal: true
      });

      const preMigrationMixed = await readLegacyZeroHpState(legacyPrisma, mixed.bossSessionId);
      expect(preMigrationMixed).not.toHaveProperty("leaderCharacterId");
      expect(findLegacyTopParticipant(preMigrationMixed, mixed.joinerCharacterId)).toMatchObject({
        status: "active",
        resources: { hp: 0 }
      });
      expect(findLegacyRoundParticipant(preMigrationMixed, 0, mixed.joinerCharacterId)).toMatchObject({
        status: "active",
        hp: 0
      });

      const malformedState = await readLegacyZeroHpState(legacyPrisma, malformed.bossSessionId);
      findLegacyTopParticipant(malformedState, malformed.joinerCharacterId).resources.hp = "0";
      findLegacyRoundParticipant(malformedState, 0, malformed.joinerCharacterId).hp = "0";
      (malformedState.participants as unknown[]).push("corrupt-participant");
      (malformedState.roundLog[0]!.participantsAfter as unknown[]).push("corrupt-participant-after");
      (malformedState.roundLog as unknown[]).push("corrupt-round");
      await legacyPrisma.partyBossSession.update({
        where: { id: malformed.bossSessionId },
        data: { stateJson: malformedState as never }
      });
      const terminalScalarRow = await legacyPrisma.partyBossSession.findUniqueOrThrow({
        where: { id: terminalScalar.bossSessionId },
        select: { resultJson: true }
      });
      const terminalScalarResult = terminalScalarRow.resultJson as unknown as {
        participants: unknown[];
      };
      terminalScalarResult.participants.push("corrupt-result-participant");
      await legacyPrisma.partyBossSession.update({
        where: { id: terminalScalar.bossSessionId },
        data: { resultJson: terminalScalarResult as never }
      });

      const malformedCharactersBefore = await legacyPrisma.character.findMany({
        where: { id: { in: [malformed.leaderCharacterId, malformed.joinerCharacterId] } },
        orderBy: { id: "asc" },
        select: { id: true, xp: true, gold: true }
      });

      await applyRaidChatMigration(legacyPrisma, RAID_CHAT_MIGRATIONS.slice(2));

      const migratedMixedState = await readLegacyZeroHpState(legacyPrisma, mixed.bossSessionId);
      expect(findLegacyTopParticipant(migratedMixedState, mixed.joinerCharacterId)).toMatchObject({
        status: "knocked-out",
        resources: { hp: 0 }
      });
      expect(findLegacyRoundParticipant(migratedMixedState, 0, mixed.joinerCharacterId)).toMatchObject({
        status: "knocked-out",
        hp: 0
      });
      expect(findLegacyTopParticipant(migratedMixedState, mixed.leaderCharacterId).status).toBe("active");
      const loadedMixed = await legacyBosses.findByPartyInviteToken(mixed.token);
      expect(loadedMixed).toMatchObject({ status: "active", leaderCharacterId: mixed.leaderCharacterId });
      const mixedJournal = await legacyBosses.findJournalPageByPartyInviteToken(mixed.token, 0);
      expect(mixedJournal?.journal).toMatchObject({ page: 0, totalPages: 1 });
      expect(mixedJournal?.journal?.round?.participantsAfter?.find(
        (participant) => participant.characterId === mixed.joinerCharacterId
      )).toMatchObject({ status: "knocked-out", hp: 0 });
      const mixedResolved = await legacyBosses.resolveTimedOutByToken(mixed.token, {
        now: new Date("2026-06-30T10:00:24.000Z"),
        nextTurnExpiresAt: new Date("2026-06-30T10:00:47.000Z")
      }, "due");
      expect(mixedResolved).toMatchObject({ state: "resolved", session: { status: "active", turn: 3 } });
      expect(expectPartyBossSession(mixedResolved).state.participants.find(
        (participant) => participant.characterId === mixed.joinerCharacterId
      )).toMatchObject({ status: "knocked-out", resources: { hp: 0 } });

      const allZeroBefore = await legacyPrisma.character.findMany({
        where: { id: { in: [allZero.leaderCharacterId, allZero.joinerCharacterId] } },
        orderBy: { id: "asc" },
        select: { id: true, xp: true, gold: true }
      });
      await expect(legacyPrisma.activeCombatLease.count({
        where: { referenceId: allZero.partySessionId, kind: "party-boss" }
      })).resolves.toBe(2);
      const allZeroResolved = await legacyBosses.resolveTimedOutByToken(allZero.token, {
        now: new Date("2026-06-30T10:00:24.000Z"),
        nextTurnExpiresAt: new Date("2026-06-30T10:00:47.000Z")
      }, "due");
      expect(allZeroResolved).toMatchObject({ state: "resolved", session: { status: "lost" } });
      expect(expectPartyBossSession(allZeroResolved).state.participants.every(
        (participant) => participant.status === "knocked-out" && participant.resources.hp === 0
      )).toBe(true);
      await expect(legacyPrisma.activeCombatLease.count({
        where: { referenceId: allZero.partySessionId, kind: "party-boss" }
      })).resolves.toBe(0);
      await expect(legacyPrisma.character.findMany({
        where: { id: { in: [allZero.leaderCharacterId, allZero.joinerCharacterId] } },
        orderBy: { id: "asc" },
        select: { id: true, xp: true, gold: true }
      })).resolves.toEqual(allZeroBefore);
      await expect(legacyPrisma.dailyAction.count({
        where: { characterId: { in: [allZero.leaderCharacterId, allZero.joinerCharacterId] } }
      })).resolves.toBe(0);
      await expect(legacyPrisma.characterItem.count({
        where: { characterId: { in: [allZero.leaderCharacterId, allZero.joinerCharacterId] } }
      })).resolves.toBe(0);
      await expect(legacyBosses.resolveTimedOutByToken(allZero.token, {
        now: new Date("2026-06-30T10:00:48.000Z"),
        nextTurnExpiresAt: new Date("2026-06-30T10:01:11.000Z")
      }, "due")).resolves.toMatchObject({ state: "terminal", session: { status: "lost" } });
      await expect(legacyPrisma.activeCombatLease.count({
        where: { referenceId: allZero.partySessionId, kind: "party-boss" }
      })).resolves.toBe(0);

      const characters = new PrismaCharacterRepository(legacyPrisma);
      for (const terminal of [terminalLeader, terminalNonleader]) {
        const migrated = await readLegacyZeroHpState(legacyPrisma, terminal.bossSessionId);
        expect(migrated).toHaveProperty("leaderCharacterId", terminal.leaderCharacterId);
        expect(findLegacyTopParticipant(migrated, terminal.joinerCharacterId).status).toBe("knocked-out");
        for (let page = 0; page < terminal.availableJournalPages; page += 1) {
          expect(findLegacyRoundParticipant(migrated, page, terminal.joinerCharacterId)).toMatchObject({
            status: "knocked-out",
            hp: 0
          });
        }
        const storedResult = await legacyPrisma.partyBossSession.findUniqueOrThrow({
          where: { id: terminal.bossSessionId },
          select: { resultJson: true }
        });
        const resultJson = storedResult.resultJson as unknown as {
          compatibilityMarker?: unknown;
          participants?: Array<{ characterId?: unknown; status?: unknown }>;
        };
        expect(resultJson.compatibilityMarker).toBe("preserve-me");
        expect(resultJson.participants?.find(
          (participant) => participant.characterId === terminal.joinerCharacterId
        )).toMatchObject({ status: "knocked-out" });
      }

      await expect(characters.restartByTelegramUserId(91205n)).resolves.toBe("deleted");
      await expect(characters.restartByTelegramUserId(91208n)).resolves.toBe("deleted");
      for (const terminal of [terminalLeader, terminalNonleader]) {
        const reloaded = await legacyBosses.findByPartyInviteToken(terminal.token);
        expect(reloaded).toMatchObject({
          status: "won",
          leaderCharacterId: terminal.leaderCharacterId
        });
        expect(reloaded?.result).toMatchObject({ status: "won" });
        expect(reloaded?.result?.participants.find(
          (participant) => participant.characterId === terminal.joinerCharacterId
        )).toMatchObject({ status: "knocked-out" });
        for (let page = 0; page < terminal.availableJournalPages; page += 1) {
          const journal = await legacyBosses.findJournalPageByPartyInviteToken(terminal.token, page);
          expect(journal?.journal).toMatchObject({
            page,
            totalPages: terminal.availableJournalPages,
            round: { turn: page + 1 }
          });
          expect(journal?.journal?.round?.participantsAfter?.find(
            (participant) => participant.characterId === terminal.joinerCharacterId
          )).toMatchObject({ status: "knocked-out", hp: 0 });
        }
      }

      const migratedMalformed = await readLegacyZeroHpState(legacyPrisma, malformed.bossSessionId);
      expect(findLegacyTopParticipant(migratedMalformed, malformed.joinerCharacterId)).toMatchObject({
        status: "active",
        resources: { hp: "0" }
      });
      expect(findLegacyRoundParticipant(migratedMalformed, 0, malformed.joinerCharacterId)).toMatchObject({
        status: "active",
        hp: "0"
      });
      expect(migratedMalformed.participants as unknown[]).toContain("corrupt-participant");
      expect(migratedMalformed.roundLog as unknown[]).toContain("corrupt-round");
      expect(migratedMalformed.roundLog[0]!.participantsAfter as unknown[])
        .toContain("corrupt-participant-after");
      await expect(legacyBosses.findByPartyInviteToken(malformed.token))
        .rejects.toBeInstanceOf(PartyBossStateValidationError);

      const migratedTerminalScalar = await legacyPrisma.partyBossSession.findUniqueOrThrow({
        where: { id: terminalScalar.bossSessionId },
        select: { resultJson: true }
      });
      expect((migratedTerminalScalar.resultJson as unknown as { participants: unknown[] }).participants)
        .toContain("corrupt-result-participant");
      await expect(legacyBosses.findByPartyInviteToken(terminalScalar.token))
        .rejects.toBeInstanceOf(PartyBossStateValidationError);

      const due = await legacyBosses.listDueTimedOutSessions(new Date("2026-06-30T10:00:48.000Z"));
      expect(due.map((session) => session.partyInviteToken)).toContain(mixed.token);
      expect(due.map((session) => session.partyInviteToken)).not.toContain(malformed.token);
      await expect(legacyPrisma.partyBossSession.findUnique({ where: { id: malformed.bossSessionId } }))
        .resolves.toMatchObject({ status: "cancelled", resultJson: { status: "cancelled" } });
      await expect(legacyPrisma.activeCombatLease.count({
        where: { referenceId: malformed.partySessionId, kind: "party-boss" }
      })).resolves.toBe(0);
      await expect(legacyPrisma.character.findMany({
        where: { id: { in: [malformed.leaderCharacterId, malformed.joinerCharacterId] } },
        orderBy: { id: "asc" },
        select: { id: true, xp: true, gold: true }
      })).resolves.toEqual(malformedCharactersBefore);
      await expect(legacyPrisma.dailyAction.count({
        where: { characterId: { in: [malformed.leaderCharacterId, malformed.joinerCharacterId] } }
      })).resolves.toBe(0);
      await expect(legacyPrisma.characterItem.count({
        where: { characterId: { in: [malformed.leaderCharacterId, malformed.joinerCharacterId] } }
      })).resolves.toBe(0);
    } finally {
      await legacyPrisma.$disconnect();
      await rm(legacyDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }, 60_000);

  it("advances one turn when the last two participant actions arrive concurrently", async () => {
    await seedCharacter(prisma, "last-two-leader", 1096n, "Перша дія", { hp: 300, level: 8 });
    await seedCharacter(prisma, "last-two-joiner", 1097n, "Друга дія", { hp: 300, level: 8 });
    await partyRepository.createForTelegramUser(1096n, partyInput("party-last-two-race"));
    await partyRepository.joinByTokenForTelegramUser(1097n, "party-last-two-race", joinInput());
    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1096n, {
      partyInviteToken: "party-last-two-race",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) throw new Error(`Expected started session, got ${started.state}`);

    const results = await Promise.all([
      bossRepository.submitActionForTelegramUser(1096n, "party-last-two-race", 1, "attack", resolveInput()),
      bossRepository.submitActionForTelegramUser(1097n, "party-last-two-race", 1, "attack", resolveInput())
    ]);

    expect(results.filter((result) => result.state === "resolved")).toHaveLength(1);
    await expect(prisma.partyBossSession.findUnique({ where: { id: started.session.id } })).resolves.toMatchObject({
      status: "active",
      turn: 2,
      version: 2
    });
    await expect(prisma.partyBossAction.count({
      where: { sessionId: started.session.id, turn: 1 }
    })).resolves.toBe(2);
  });

  it("settles one turn when the final action races the due scheduler", async () => {
    await seedCharacter(prisma, "timeout-race-leader", 91098n, "Ручна дія", { hp: 300, level: 8 });
    await seedCharacter(prisma, "timeout-race-joiner", 91099n, "Таймер", { hp: 300, level: 8 });
    await partyRepository.createForTelegramUser(91098n, partyInput("party-action-timeout-race"));
    await partyRepository.joinByTokenForTelegramUser(91099n, "party-action-timeout-race", joinInput());
    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(91098n, {
      partyInviteToken: "party-action-timeout-race",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:01.000Z")
    });
    if (!("session" in started)) throw new Error(`Expected started session, got ${started.state}`);
    await bossRepository.submitActionForTelegramUser(91098n, "party-action-timeout-race", 1, "attack", resolveInput());
    const dueInput = {
      now: new Date("2026-06-30T10:00:23.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:00:46.000Z")
    };

    await Promise.all([
      bossRepository.submitActionForTelegramUser(91099n, "party-action-timeout-race", 1, "attack", dueInput),
      bossRepository.submitActionForTelegramUser(91099n, "party-action-timeout-race", 1, "attack", dueInput),
      bossRepository.resolveTimedOutByToken("party-action-timeout-race", dueInput, "due")
    ]);

    const row = await prisma.partyBossSession.findUniqueOrThrow({ where: { id: started.session.id } });
    expect(row.turn).toBe(2);
    expect(row.version).toBe(2);
    const state = row.stateJson as unknown as PartyBossSessionRecord["state"];
    expect(state.roundLog).toHaveLength(1);
    await expect(prisma.partyBossAction.count({
      where: { sessionId: started.session.id, turn: 1 }
    })).resolves.toBe(2);
  });

  it("keeps delete-vs-terminal-resolution races free of orphan combat leases", async () => {
    await seedCharacter(prisma, "delete-race-leader", 91100n, "Лідер на вихід", { hp: 300, level: 8 });
    await seedCharacter(prisma, "delete-race-joiner", 91101n, "Свідок розв'язки", { hp: 300, level: 8 });
    await partyRepository.createForTelegramUser(91100n, partyInput("party-delete-resolve-race"));
    await partyRepository.joinByTokenForTelegramUser(91101n, "party-delete-resolve-race", joinInput());
    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(91100n, {
      partyInviteToken: "party-delete-resolve-race",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) throw new Error(`Expected started session, got ${started.state}`);

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    await bossRepository.submitActionForTelegramUser(
      91100n,
      "party-delete-resolve-race",
      1,
      "attack",
      resolveInput()
    );

    const characters = new PrismaCharacterRepository(prisma);
    const [resolved, restart] = await Promise.all([
      bossRepository.submitActionForTelegramUser(
        91101n,
        "party-delete-resolve-race",
        1,
        "attack",
        resolveInput()
      ),
      characters.restartByTelegramUserId(91100n)
    ]);

    expect(resolved.state).toBe("resolved");
    expect(expectPartyBossSession(resolved).status).not.toBe("active");
    expect(["active-combat", "deleted"]).toContain(restart);
    const boss = await prisma.partyBossSession.findUnique({ where: { id: started.session.id } });
    expect(boss?.status ?? "deleted").not.toBe("active");
    await expect(prisma.activeCombatLease.count({
      where: { referenceId: started.session.partySessionId, kind: "party-boss" }
    })).resolves.toBe(0);
    if (restart === "active-combat") {
      await expect(prisma.character.findUnique({ where: { id: "delete-race-leader-character" } })).resolves.not.toBeNull();
    }
  });

  it("manual dev timeout force-resolves missing actions before the turn deadline", async () => {
    await seedCharacter(prisma, "force-timeout-leader-user", 4001n, "Лідерка Швидка", { hp: 300 });
    await seedCharacter(prisma, "force-timeout-joiner-user", 4002n, "Помічник Мовчазний", { hp: 300 });
    await partyRepository.createForTelegramUser(4001n, partyInput("party-token-force-timeout"));
    await partyRepository.joinByTokenForTelegramUser(4002n, "party-token-force-timeout", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(4001n, {
      partyInviteToken: "party-token-force-timeout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    await bossRepository.submitActionForTelegramUser(
      4001n,
      "party-token-force-timeout",
      1,
      "attack",
      resolveInput()
    );

    const resolved = await bossRepository.resolveTimedOutByToken("party-token-force-timeout", {
      now: new Date("2026-06-30T10:00:05.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:00:28.000Z")
    }, "force-dev");
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("active");
    expect(latest.turn).toBe(2);
    const silentParticipant = latest.state.participants.find(
      (participant) => participant.characterId !== latest.leaderCharacterId
    );
    expect(latest.state.roundLog.at(-1)?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ characterId: latest.leaderCharacterId, origin: "manual" }),
        expect.objectContaining({ characterId: silentParticipant?.characterId, action: "defend", origin: "timeout" })
      ])
    );
  });

  it("keeps a production due-timeout callback queued before the turn deadline when actions are missing", async () => {
    await seedCharacter(prisma, "early-due-leader-user", 4101n, "Лідерка Рання", { hp: 300 });
    await seedCharacter(prisma, "early-due-joiner-user", 4102n, "Помічник Ранній", { hp: 300 });
    await partyRepository.createForTelegramUser(4101n, partyInput("party-token-early-due"));
    await partyRepository.joinByTokenForTelegramUser(4102n, "party-token-early-due", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(4101n, {
      partyInviteToken: "party-token-early-due",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const queued = await bossRepository.resolveTimedOutByToken("party-token-early-due", {
      now: new Date("2026-06-30T10:00:05.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:00:28.000Z")
    }, "due");
    const latest = expectPartyBossSession(queued);

    expect(queued.state).toBe("queued");
    expect(latest.turn).toBe(1);
    expect(latest.state.roundLog).toHaveLength(0);
    expect(await prisma.partyBossAction.count({
      where: {
        sessionId: latest.id
      }
    })).toBe(0);
  });

  it("resolves production due-timeout after the turn deadline", async () => {
    await seedCharacter(prisma, "due-timeout-leader-user", 4201n, "Лідерка Пізня", { hp: 300 });
    await seedCharacter(prisma, "due-timeout-joiner-user", 4202n, "Помічник Пізній", { hp: 300 });
    await partyRepository.createForTelegramUser(4201n, partyInput("party-token-due-timeout"));
    await partyRepository.joinByTokenForTelegramUser(4202n, "party-token-due-timeout", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(4201n, {
      partyInviteToken: "party-token-due-timeout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    expect((await bossRepository.listDueTimedOutSessions(new Date("2026-06-30T10:00:24.000Z")))
      .map((session) => session.partyInviteToken)).toContain("party-token-due-timeout");

    const resolved = await bossRepository.resolveTimedOutByToken("party-token-due-timeout", {
      now: new Date("2026-06-30T10:00:24.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:00:47.000Z")
    }, "due");
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.turn).toBe(2);
    expect(latest.state.roundLog.at(-1)?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ origin: "timeout", action: "defend" })
      ])
    );
  });

  it("treats knocked-out participant action callbacks as stale without creating an action row", async () => {
    await seedCharacter(prisma, "stale-knockout-leader-user", 3001n, "Вибита Лідерка", { hp: 25 });
    await partyRepository.createForTelegramUser(3001n, partyInput("party-token-stale-knockout"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(3001n, {
      partyInviteToken: "party-token-stale-knockout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    const knockedOutState = {
      ...started.session.state,
      participants: started.session.state.participants.map((participant) => ({
        ...participant,
        status: "knocked-out" as const,
        resources: {
          ...participant.resources,
          hp: 0
        }
      }))
    };
    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: knockedOutState
      }
    });

    const stale = await bossRepository.submitActionForTelegramUser(
      3001n,
      "party-token-stale-knockout",
      1,
      "attack",
      resolveInput()
    );

    expect(stale.state).toBe("stale");
    expect(await prisma.partyBossAction.count({ where: { sessionId: started.session.id } })).toBe(0);
  });

  it("settles Big Barrel Brother victory through the canonical Barrel success key exactly once", async () => {
    await seedCharacter(prisma, "big-leader-user", 5001n, "Старша Лідерка", {
      hp: 80,
      level: 8,
      xp: getLevelStartXp(9) - 1,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5001n, {
      ...partyInput("party-token-big"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });
    expect(await prisma.partySession.findUnique({
      where: { inviteToken: "party-token-big" },
      select: { originLocationId: true }
    })).toEqual({ originLocationId: "barrel.big-brother" });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5001n, {
      partyInviteToken: "party-token-big",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: {
          ...started.session.state,
          boss: {
            ...started.session.state.boss,
            hp: 0,
            hpMax: 1,
            armor: 0,
            resist: 0,
            dexterity: 0
          }
        }
      }
    });

    const resolved = await bossRepository.submitActionForTelegramUser(
      5001n,
      "party-token-big",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("won");
    expect(latest.rulesVersion).toBe("big-barrel-brother-v1");
    expect(resolved.achievementEvents).toMatchObject([
      {
        type: "barrel.raid.claimed",
        characterId: "big-leader-user-character",
        occurredAt: resolveInput().now
      }
    ]);
    expect(await prisma.dailyAction.count({
      where: {
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T10:23"
      }
    })).toBe(1);

    const replay = await bossRepository.resolveTimedOutByToken("party-token-big", resolveInput(), "due");

    expect(replay.state).toBe("terminal");
    expect(replay.achievementEvents).toBeUndefined();
    expect(await prisma.dailyAction.count({
      where: {
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T10:23"
      }
    })).toBe(1);
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: latest.partySessionId } })).toBe(0);
    expect(await prisma.hpRecoveryNotification.findUnique({
      where: { characterId: "big-leader-user-character" }
    })).toMatchObject({ status: "waiting" });
    expect(await prisma.character.findUnique({
      where: { id: "big-leader-user-character" },
      select: { level: true }
    })).toEqual({ level: 9 });
  });

  it("uses bounded personal available-round counters for 25-turn Big Barrel contribution tiers and replay", async () => {
    const participants = [
      { userId: "tier-one-user", telegramId: 6201n, name: "Одна ручна дія" },
      { userId: "tier-below-user", telegramId: 6202n, name: "На крок нижче" },
      { userId: "tier-half-user", telegramId: 6203n, name: "Рівно половина" },
      { userId: "tier-knockout-user", telegramId: 6204n, name: "Ранній нокаут" }
    ] as const;
    for (const participant of participants) {
      await seedCharacter(prisma, participant.userId, participant.telegramId, participant.name, {
        hp: 300,
        level: 8,
        strength: 24,
        dexterity: 24
      });
    }
    await partyRepository.createForTelegramUser(6201n, {
      ...partyInput("party-token-big-personal-rounds"),
      periodId: "2026-06-30T15:23",
      originLocationId: "barrel.big-brother"
    });
    for (const participant of participants.slice(1)) {
      await partyRepository.joinByTokenForTelegramUser(
        participant.telegramId,
        "party-token-big-personal-rounds",
        joinInput()
      );
    }

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(6201n, {
      partyInviteToken: "party-token-big-personal-rounds",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: {
          ...started.session.state,
          boss: {
            ...started.session.state.boss,
            hp: 100_000,
            hpMax: 100_000,
            attack: 0,
            armor: 0,
            resist: 0,
            dexterity: 0
          }
        }
      }
    });

    let latest: PartyBossSessionRecord | null = null;
    for (let turn = 1; turn <= 25; turn += 1) {
      if (turn === 25) {
        const beforeTerminal = await bossRepository.findByPartyInviteToken("party-token-big-personal-rounds");
        if (!beforeTerminal) throw new Error("Expected active personal-round session before settlement.");
        await prisma.partyBossSession.update({
          where: { id: beforeTerminal.id },
          data: {
            stateJson: {
              ...beforeTerminal.state,
              boss: { ...beforeTerminal.state.boss, hp: 0 }
            }
          }
        });
      }

      const manualTelegramIds = [
        ...(turn === 1 ? [6201n] : []),
        ...(turn <= 12 ? [6202n] : []),
        ...(turn <= 13 ? [6203n] : []),
        ...(turn === 2 ? [6204n] : [])
      ];
      const actionAt = new Date(now().getTime() + (turn - 1) * 60_000);
      for (const telegramId of manualTelegramIds) {
        const queued = await bossRepository.submitActionForTelegramUser(
          telegramId,
          "party-token-big-personal-rounds",
          turn,
          "attack",
          {
            now: actionAt,
            nextTurnExpiresAt: new Date(actionAt.getTime() + 23_000)
          }
        );
        expect(["queued", "updated"]).toContain(queued.state);
      }

      const resolvedAt = new Date(now().getTime() + turn * 60_000);
      const resolved = await bossRepository.resolveTimedOutByToken(
        "party-token-big-personal-rounds",
        {
          now: resolvedAt,
          nextTurnExpiresAt: new Date(resolvedAt.getTime() + 23_000)
        },
        "due"
      );
      expect(resolved.state).toBe("resolved");
      latest = expectPartyBossSession(resolved);
      expect(latest.state.roundLog).toHaveLength(1);
      await expect(prisma.partyBossRound.count({ where: { sessionId: latest.id } })).resolves.toBe(turn);

      if (turn === 2) {
        const knockedOutCharacterId = "tier-knockout-user-character";
        await prisma.partyBossSession.update({
          where: { id: latest.id },
          data: {
            stateJson: {
              ...latest.state,
              participants: latest.state.participants.map((participant) =>
                participant.characterId === knockedOutCharacterId
                  ? {
                      ...participant,
                      status: "knocked-out" as const,
                      resources: { ...participant.resources, hp: 0 },
                      contribution: {
                        ...participant.contribution,
                        damageTaken: Math.max(1, participant.contribution.damageTaken)
                      }
                    }
                  : participant
              )
            }
          }
        });
      }
    }

    if (!latest) throw new Error("Expected terminal personal-round session.");
    expect(latest.status).toBe("won");
    expect(latest.state.roundLog).toHaveLength(1);
    await expect(prisma.partyBossRound.count({ where: { sessionId: latest.id } })).resolves.toBe(25);
    await expect(bossRepository.findJournalPageByPartyInviteToken("party-token-big-personal-rounds", 24))
      .resolves.toMatchObject({ journal: { page: 24, totalPages: 25, round: { turn: 25 } } });

    const contributionByCharacterId = new Map(latest.state.participants.map((participant) => [
      participant.characterId,
      participant.contribution
    ]));
    expect(contributionByCharacterId.get("tier-one-user-character")).toMatchObject({
      submittedActions: 1,
      timeoutActions: 24
    });
    expect(contributionByCharacterId.get("tier-below-user-character")).toMatchObject({
      submittedActions: 12,
      timeoutActions: 13
    });
    expect(contributionByCharacterId.get("tier-half-user-character")).toMatchObject({
      submittedActions: 13,
      timeoutActions: 12
    });
    expect(contributionByCharacterId.get("tier-knockout-user-character")).toMatchObject({
      submittedActions: 1,
      timeoutActions: 1
    });

    const storedActions = await prisma.dailyAction.findMany({
      where: {
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T15:23"
      },
      orderBy: { characterId: "asc" },
      select: { characterId: true, rewardXp: true, rewardGold: true, resultJson: true }
    });
    expect(storedActions).toHaveLength(4);
    const rewards = new Map(storedActions.map((action) => {
      const result = action.resultJson as { reward?: { tier?: unknown } };
      return [action.characterId, {
        tier: result.reward?.tier,
        xp: action.rewardXp,
        gold: action.rewardGold
      }];
    }));
    expect(rewards.get("tier-one-user-character")).toEqual({ tier: "partial", xp: 28, gold: 16 });
    expect(rewards.get("tier-below-user-character")).toEqual({ tier: "partial", xp: 28, gold: 16 });
    expect(rewards.get("tier-half-user-character")).toEqual({ tier: "full", xp: 36, gold: 21 });
    expect(rewards.get("tier-knockout-user-character")).toEqual({ tier: "full", xp: 36, gold: 21 });

    const resultBeforeReplay = latest.result;
    const charactersBeforeReplay = await prisma.character.findMany({
      where: { id: { in: participants.map((participant) => `${participant.userId}-character`) } },
      orderBy: { id: "asc" },
      select: { id: true, xp: true, gold: true }
    });
    const replay = await bossRepository.resolveTimedOutByToken(
      "party-token-big-personal-rounds",
      {
        now: new Date("2026-06-30T10:26:00.000Z"),
        nextTurnExpiresAt: new Date("2026-06-30T10:26:23.000Z")
      },
      "due"
    );
    expect(replay.state).toBe("terminal");
    expect(expectPartyBossSession(replay).result).toEqual(resultBeforeReplay);
    await expect(prisma.dailyAction.count({
      where: { key: "tavern.friday-barrel-raid", localDate: "2026-06-30T15:23" }
    })).resolves.toBe(4);
    await expect(prisma.character.findMany({
      where: { id: { in: participants.map((participant) => `${participant.userId}-character`) } },
      orderBy: { id: "asc" },
      select: { id: true, xp: true, gold: true }
    })).resolves.toEqual(charactersBeforeReplay);
  }, 120_000);

  it("freezes Kharakternyk ward sign support from the final Big Barrel roster at start", async () => {
    await seedCharacter(prisma, "big-ward-leader-user", 5081n, "Р—РЅР°РєР°СЂРєР°", {
      hp: 80,
      level: 8,
      classId: "class.kharakternyk",
      manaCurrent: 13,
      intelligence: 15
    });
    await seedCharacter(prisma, "big-ward-support-user", 5082n, "РџС–РґРїРѕСЂР°", {
      hp: 80,
      level: 8,
      manaCurrent: 10,
      intelligence: 13
    });
    await seedCharacter(prisma, "big-ward-left-user", 5083n, "РџС–РґРїРѕСЂР° Р—Р° Р”РІРµСЂРёРјР°", {
      hp: 80,
      level: 8,
      manaCurrent: 10,
      intelligence: 13
    });
    await partyRepository.createForTelegramUser(5081n, {
      ...partyInput("party-token-big-ward"),
      periodId: "2026-06-30T10:58",
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5082n, "party-token-big-ward", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5083n, "party-token-big-ward", joinInput());
    await partyRepository.placeKharakternykWardSign(5081n, "party-token-big-ward", now());
    await partyRepository.supportKharakternykWardSign(5082n, "party-token-big-ward", now());
    await partyRepository.supportKharakternykWardSign(5083n, "party-token-big-ward", now());
    await partyRepository.leaveByTokenForTelegramUser(5083n, "party-token-big-ward", now());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5081n, {
      partyInviteToken: "party-token-big-ward",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.wardSign).toMatchObject({
      kind: "kharakternyk",
      placerCharacterId: "big-ward-leader-user-character",
      supportCount: 1,
      supportCap: 7,
      usesRemaining: 1,
      usesMax: 1,
      mitigationPercent: 35,
      status: "carried"
    });
    expect(started.session.state.participants.map((participant) => participant.characterId).sort()).toEqual([
      "big-ward-leader-user-character",
      "big-ward-support-user-character"
    ].sort());
  });

  it("preserves same-life protocol snapshots across rejoin and restart before boss freeze", async () => {
    await seedCharacter(prisma, "big-protocol-leader-user", 5084n, "Паперова Голова", {
      hp: 80,
      level: 8
    });
    await seedCharacter(prisma, "big-protocol-filer-user", 5085n, "Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-signer-user", 5086n, "Підписант", {
      hp: 80,
      level: 8
    });
    await seedCharacter(prisma, "big-protocol-competitor-user", 5087n, "Запасний Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await partyRepository.createForTelegramUser(5084n, {
      ...partyInput("party-token-big-protocol"),
      periodId: "2026-06-30T10:59",
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5085n, "party-token-big-protocol", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5086n, "party-token-big-protocol", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5087n, "party-token-big-protocol", joinInput());
    expect((await partyRepository.fileBureaucramancerPersonalProtocol(
      5085n,
      "party-token-big-protocol",
      now()
    )).state).toBe("updated");
    expect((await partyRepository.signBureaucramancerPersonalProtocol(
      5086n,
      "party-token-big-protocol",
      now()
    )).state).toBe("updated");

    expect((await partyRepository.leaveByTokenForTelegramUser(
      5085n,
      "party-token-big-protocol",
      now()
    )).state).toBe("left");
    expect((await partyRepository.joinByTokenForTelegramUser(
      5085n,
      "party-token-big-protocol",
      joinInput()
    )).state).toBe("joined");
    expect((await partyRepository.fileBureaucramancerPersonalProtocol(
      5087n,
      "party-token-big-protocol",
      now()
    )).state).toBe("already-exists");

    expect((await partyRepository.leaveByTokenForTelegramUser(
      5086n,
      "party-token-big-protocol",
      now()
    )).state).toBe("left");
    expect((await partyRepository.joinByTokenForTelegramUser(
      5086n,
      "party-token-big-protocol",
      joinInput()
    )).state).toBe("joined");
    expect((await partyRepository.signBureaucramancerPersonalProtocol(
      5086n,
      "party-token-big-protocol",
      now()
    )).state).toBe("already-signed");

    const restartedRepository = new PrismaPartySessionRepository(prisma);
    const restartedState = await restartedRepository.findByToken("party-token-big-protocol", now());
    expect(restartedState?.personalProtocol).toMatchObject({
      filerCharacterId: "big-protocol-filer-user-character",
      signatureCount: 2
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5084n, {
      partyInviteToken: "party-token-big-protocol",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.personalProtocol).toMatchObject({
      kind: "bureaucramancer-personal-protocol-13b",
      filerCharacterId: "big-protocol-filer-user-character"
    });
    expect(started.session.state.personalProtocol?.signatures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        characterId: "big-protocol-filer-user-character",
        status: "unspent"
      }),
      expect.objectContaining({
        characterId: "big-protocol-signer-user-character",
        status: "unspent"
      })
    ]));
    expect(started.session.state.personalProtocol?.signatures).toHaveLength(2);
    expect(started.session.state.participants.map((participant) => participant.characterId).sort()).toEqual([
      "big-protocol-leader-user-character",
      "big-protocol-filer-user-character",
      "big-protocol-signer-user-character",
      "big-protocol-competitor-user-character"
    ].sort());
  });

  it("persists one Protocol 13-Z trigger and replays stale callbacks without retriggering", async () => {
    const token = "party-token-big-protocol-trigger-replay";
    const characterId = "big-protocol-trigger-replay-user-character";
    await seedCharacter(prisma, "big-protocol-trigger-replay-user", 5099n, "Підписаний Реєстратор", {
      hp: 160,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5099n, {
      ...partyInput(token),
      periodId: "2026-06-30T10:59:13",
      originLocationId: "barrel.big-brother"
    });
    expect((await partyRepository.fileBureaucramancerPersonalProtocol(5099n, token, now())).state).toBe("updated");

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5099n, {
      partyInviteToken: token,
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");

    const resolved = await bossRepository.submitActionForTelegramUser(
      5099n,
      token,
      1,
      "defend",
      resolveInput()
    );
    expect(resolved.state).toBe("resolved");
    const resolvedSession = expectPartyBossSession(resolved);
    const expectedBossActionId = `big-barrel:1:personal:${characterId}`;
    const storedRoundProtocol = resolvedSession.state.roundLog.at(-1)?.personalProtocol;
    expect(storedRoundProtocol).toMatchObject({
      characterId,
      bossActionId: expectedBossActionId,
      triggeredTurn: 1,
      spentCount: 1,
      signatureCount: 1
    });
    expect(storedRoundProtocol?.preventedDamage).toBeGreaterThan(0);
    expect(resolvedSession.state.personalProtocol?.signatures).toEqual([
      expect.objectContaining({
        characterId,
        status: "spent",
        bossActionId: expectedBossActionId,
        triggeredTurn: 1
      })
    ]);
    expect(resolved.achievementEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "bureaucramancer.protocol.triggered",
        characterId,
        sourceId: expectedBossActionId
      })
    ]));

    const restartedRepository = new PrismaPartyBossRepository(prisma);
    const reloaded = await restartedRepository.findByPartyInviteToken(token);
    expect(reloaded?.state.roundLog.at(-1)?.personalProtocol).toEqual(storedRoundProtocol);
    expect(reloaded?.state.personalProtocol).toEqual(resolvedSession.state.personalProtocol);

    const staleReplay = await restartedRepository.submitActionForTelegramUser(
      5099n,
      token,
      1,
      "defend",
      resolveInput()
    );
    expect(staleReplay.state).toBe("stale");
    expect(expectPartyBossSession(staleReplay).state.roundLog.at(-1)?.personalProtocol).toEqual(storedRoundProtocol);
    expect(expectPartyBossSession(staleReplay).state.personalProtocol).toEqual(resolvedSession.state.personalProtocol);
    expect(staleReplay.achievementEvents).toBeUndefined();
  });

  it("replaces a remort-invalidated filing with a new identity and lets old signers sign again", async () => {
    await seedCharacter(prisma, "big-protocol-remort-leader-user", 5088n, "Ватажок Заміни", {
      hp: 80,
      level: 8
    });
    await seedCharacter(prisma, "big-protocol-remort-old-filer-user", 5089n, "Старий Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-remort-new-filer-user", 5090n, "Новий Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-remort-signer-user", 5091n, "Повторний Підписант", {
      hp: 80,
      level: 8
    });
    await partyRepository.createForTelegramUser(5088n, {
      ...partyInput("party-token-big-protocol-remort"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5089n, "party-token-big-protocol-remort", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5090n, "party-token-big-protocol-remort", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5091n, "party-token-big-protocol-remort", joinInput());

    const oldFiled = await partyRepository.fileBureaucramancerPersonalProtocol(
      5089n,
      "party-token-big-protocol-remort",
      now()
    );
    expect(oldFiled.state).toBe("updated");
    const oldProtocolId = "session" in oldFiled ? oldFiled.session.personalProtocol?.protocolId : undefined;
    await partyRepository.signBureaucramancerPersonalProtocol(5091n, "party-token-big-protocol-remort", now());
    await partyRepository.leaveByTokenForTelegramUser(5089n, "party-token-big-protocol-remort", now());
    await seedRemort(prisma, "big-protocol-remort-old-filer-user-character", 1);

    const replacement = await partyRepository.fileBureaucramancerPersonalProtocol(
      5090n,
      "party-token-big-protocol-remort",
      now()
    );
    expect(replacement.state).toBe("updated");
    const replacementProtocolId = "session" in replacement
      ? replacement.session.personalProtocol?.protocolId
      : undefined;
    expect(replacementProtocolId).toBeTruthy();
    expect(replacementProtocolId).not.toBe(oldProtocolId);
    expect((await partyRepository.signBureaucramancerPersonalProtocol(
      5091n,
      "party-token-big-protocol-remort",
      now()
    )).state).toBe("updated");

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5088n, {
      partyInviteToken: "party-token-big-protocol-remort",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.personalProtocol).toMatchObject({
      protocolId: replacementProtocolId,
      filerCharacterId: "big-protocol-remort-new-filer-user-character"
    });
    expect(started.session.state.personalProtocol?.signatures.map((row) => row.characterId).sort()).toEqual([
      "big-protocol-remort-new-filer-user-character",
      "big-protocol-remort-signer-user-character"
    ].sort());
  });

  it("replaces an unsupported filing snapshot and freezes only re-signed current identities", async () => {
    await seedCharacter(prisma, "big-protocol-version-leader-user", 5092n, "Ватажок Версій", {
      hp: 80,
      level: 8
    });
    await seedCharacter(prisma, "big-protocol-version-old-filer-user", 5093n, "Старий Бланк", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-version-new-filer-user", 5094n, "Новий Бланк", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-version-signer-user", 5095n, "Версійний Підпис", {
      hp: 80,
      level: 8
    });
    await partyRepository.createForTelegramUser(5092n, {
      ...partyInput("party-token-big-protocol-version-replace"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5093n, "party-token-big-protocol-version-replace", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5094n, "party-token-big-protocol-version-replace", joinInput());
    await partyRepository.joinByTokenForTelegramUser(5095n, "party-token-big-protocol-version-replace", joinInput());
    await partyRepository.fileBureaucramancerPersonalProtocol(
      5093n,
      "party-token-big-protocol-version-replace",
      now()
    );
    await partyRepository.signBureaucramancerPersonalProtocol(
      5095n,
      "party-token-big-protocol-version-replace",
      now()
    );

    const oldFiler = await prisma.partyParticipant.findFirstOrThrow({
      where: {
        session: { inviteToken: "party-token-big-protocol-version-replace" },
        characterId: "big-protocol-version-old-filer-user-character"
      },
      select: { id: true, snapshotJson: true }
    });
    const invalidatedSnapshot = JSON.parse(JSON.stringify(oldFiler.snapshotJson)) as Record<string, unknown>;
    const invalidatedProtocol = invalidatedSnapshot.bureaucramancerPersonalProtocol13B;
    if (!invalidatedProtocol || typeof invalidatedProtocol !== "object" || Array.isArray(invalidatedProtocol)) {
      throw new Error("Expected protocol snapshot object.");
    }
    (invalidatedProtocol as Record<string, unknown>).version = 2;
    await prisma.partyParticipant.update({
      where: { id: oldFiler.id },
      data: { snapshotJson: invalidatedSnapshot }
    });

    const replacement = await partyRepository.fileBureaucramancerPersonalProtocol(
      5094n,
      "party-token-big-protocol-version-replace",
      now()
    );
    expect(replacement.state).toBe("updated");
    expect((await partyRepository.signBureaucramancerPersonalProtocol(
      5095n,
      "party-token-big-protocol-version-replace",
      now()
    )).state).toBe("updated");

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5092n, {
      partyInviteToken: "party-token-big-protocol-version-replace",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.personalProtocol).toMatchObject({
      filerCharacterId: "big-protocol-version-new-filer-user-character"
    });
    expect(started.session.state.personalProtocol?.signatures.map((row) => row.characterId).sort()).toEqual([
      "big-protocol-version-new-filer-user-character",
      "big-protocol-version-signer-user-character"
    ].sort());
  });

  it("CAS-orders raid start against protocol filing without spending on a lost filing", async () => {
    await seedCharacter(prisma, "big-protocol-start-file-user", 5096n, "Стартовий Реєстратор", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await partyRepository.createForTelegramUser(5096n, {
      ...partyInput("party-token-big-protocol-start-file"),
      originLocationId: "barrel.big-brother"
    });

    const [started, filed] = await Promise.all([
      bossRepository.startFromRecruitingPartyForTelegramUser(5096n, {
        partyInviteToken: "party-token-big-protocol-start-file",
        now: now(),
        turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
      }),
      partyRepository.fileBureaucramancerPersonalProtocol(
        5096n,
        "party-token-big-protocol-start-file",
        now()
      )
    ]);

    expect(started.state).toBe("started");
    expect(["updated", "not-recruiting"]).toContain(filed.state);
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const mana = await prisma.character.findUniqueOrThrow({
      where: { id: "big-protocol-start-file-user-character" },
      select: { manaCurrent: true }
    });
    if (filed.state === "updated") {
      if (!filed.session.personalProtocol) {
        throw new Error("Expected the committed protocol receipt after a successful filing");
      }
      expect(mana.manaCurrent).toBe(10 - filed.session.personalProtocol.manaCost);
      expect(started.session.state.personalProtocol?.signatures.map((row) => row.characterId)).toEqual([
        "big-protocol-start-file-user-character"
      ]);
    } else {
      expect(mana.manaCurrent).toBe(10);
      expect(started.session.state.personalProtocol).toBeUndefined();
    }
  });

  it("CAS-orders raid start against signing and freezes only a committed signature", async () => {
    await seedCharacter(prisma, "big-protocol-start-sign-leader-user", 5097n, "Стартова Голова", {
      hp: 80,
      level: 8,
      classId: "class.bureaucramancer",
      manaCurrent: 10
    });
    await seedCharacter(prisma, "big-protocol-start-sign-signer-user", 5098n, "Стартовий Підпис", {
      hp: 80,
      level: 8
    });
    await partyRepository.createForTelegramUser(5097n, {
      ...partyInput("party-token-big-protocol-start-sign"),
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5098n, "party-token-big-protocol-start-sign", joinInput());
    await partyRepository.fileBureaucramancerPersonalProtocol(
      5097n,
      "party-token-big-protocol-start-sign",
      now()
    );

    const [started, signed] = await Promise.all([
      bossRepository.startFromRecruitingPartyForTelegramUser(5097n, {
        partyInviteToken: "party-token-big-protocol-start-sign",
        now: now(),
        turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
      }),
      partyRepository.signBureaucramancerPersonalProtocol(
        5098n,
        "party-token-big-protocol-start-sign",
        now()
      )
    ]);

    expect(started.state).toBe("started");
    expect(["updated", "not-recruiting"]).toContain(signed.state);
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    const frozenSignerIds = started.session.state.personalProtocol?.signatures.map((row) => row.characterId) ?? [];
    expect(frozenSignerIds).toContain("big-protocol-start-sign-leader-user-character");
    if (signed.state === "updated") {
      expect(frozenSignerIds).toContain("big-protocol-start-sign-signer-user-character");
    } else {
      expect(frozenSignerIds).not.toContain("big-protocol-start-sign-signer-user-character");
    }
  });

  it("stores participant-specific Big Barrel Brother manatky instead of replaying the solo Barrel bundle", async () => {
    await seedCharacter(prisma, "big-varied-warrior-user", 5011n, "Бочкова Воячка", {
      hp: 80,
      level: 8,
      classId: "class.warrior",
      raceId: "race.human-ish",
      strength: 24,
      dexterity: 24
    });
    await seedCharacter(prisma, "big-varied-rogue-user", 5012n, "Бочковий Тінько", {
      hp: 80,
      level: 10,
      classId: "class.rogue",
      raceId: "race.bisyny",
      strength: 18,
      dexterity: 28
    });
    await partyRepository.createForTelegramUser(5011n, {
      ...partyInput("party-token-big-varied"),
      periodId: "2026-06-30T10:42",
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(5012n, "party-token-big-varied", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5011n, {
      partyInviteToken: "party-token-big-varied",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    await bossRepository.submitActionForTelegramUser(5011n, "party-token-big-varied", 1, "attack", resolveInput());
    const resolved = await bossRepository.submitActionForTelegramUser(
      5012n,
      "party-token-big-varied",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);
    const rewards = latest.result?.participants.flatMap((participant) => participant.reward?.itemGrants ?? []) ?? [];
    const rewardIds = rewards.map((grant) => grant.itemId);
    const soloBundleIds = new Set([
      "item.apron-of-foam-resistance",
      "item.wet-hero-ticket",
      "item.barrel-splinter-of-optimism",
      "item.foam-cork-of-accounting",
      "item.mirage-foam-sample"
    ]);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("won");
    expect(rewards).toHaveLength(2);
    expect(rewardIds.every((itemId) => itemId.startsWith("item.loot-v1-"))).toBe(true);
    expect(rewardIds.some((itemId) => soloBundleIds.has(itemId))).toBe(false);
    expect(new Set(rewardIds).size).toBeGreaterThan(1);
    await expect(prisma.characterItem.count({
      where: {
        characterId: {
          in: ["big-varied-warrior-user-character", "big-varied-rogue-user-character"]
        },
        itemId: {
          in: [...soloBundleIds]
        }
      }
    })).resolves.toBe(0);
  });

  it("dev-primes Big Barrel Brother victory and resolves boss-zero plus party-zero as a win", async () => {
    await seedCharacter(prisma, "big-dev-win-user", 5051n, "Dev Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5051n, {
      ...partyInput("party-token-big-dev-win"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5051n, {
      partyInviteToken: "party-token-big-dev-win",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: {
          ...started.session.state,
          participants: started.session.state.participants.map((participant) => ({
            ...participant,
            status: "knocked-out" as const,
            resources: {
              ...participant.resources,
              hp: 0
            }
          }))
        }
      }
    });

    const primed = await bossRepository.forceBigBarrelWinForTelegramUser(5051n, now());
    expect(primed.state).toBe("primed");
    if (!("session" in primed)) {
      throw new Error(`Expected primed session, got ${primed.state}`);
    }
    expect(primed.session.state.boss.hp).toBe(0);
    expect(primed.session.state.participants.every((participant) => participant.resources.hp === 0)).toBe(true);

    const resolved = await bossRepository.resolveTimedOutByToken(
      "party-token-big-dev-win",
      resolveInput(),
      "due"
    );
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("won");
    expect(latest.result?.status).toBe("won");
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: latest.partySessionId } })).toBe(0);
  });

  it("grants Big Barrel Brother attempt XP on loss without writing Barrel success", async () => {
    await seedCharacter(prisma, "big-loss-xp-user", 5061n, "Смілива Програвальниця", {
      hp: 1,
      level: 8,
      xp: getLevelStartXp(9) - 1,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5061n, {
      ...partyInput("party-token-big-loss-xp"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5061n, {
      partyInviteToken: "party-token-big-loss-xp",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: {
          ...started.session.state,
          participants: started.session.state.participants.map((participant) => ({
            ...participant,
            status: "knocked-out" as const,
            resources: {
              ...participant.resources,
              hp: 0
            },
            contribution: {
              ...participant.contribution,
              damageTaken: 1
            }
          }))
        }
      }
    });

    const resolved = await bossRepository.resolveTimedOutByToken(
      "party-token-big-loss-xp",
      resolveInput(),
      "due"
    );
    const latest = expectPartyBossSession(resolved);
    const character = await prisma.character.findUnique({
      where: { id: "big-loss-xp-user-character" },
      select: { xp: true, gold: true }
    });

    expect(latest.status).toBe("lost");
    expect(await prisma.hpRecoveryNotification.findUnique({
      where: { characterId: "big-loss-xp-user-character" }
    })).toMatchObject({ status: "waiting" });
    expect(resolved.achievementEvents).toEqual([
      {
        type: "barrel.raid.lost",
        characterId: "big-loss-xp-user-character",
        sourceId: started.session.id,
        occurredAt: resolveInput().now
      }
    ]);
    expect(character?.xp).toBeGreaterThan(0);
    expect(await prisma.character.findUnique({
      where: { id: "big-loss-xp-user-character" },
      select: { level: true }
    })).toEqual({ level: 9 });
    expect(character?.gold).toBe(0);
    await expect(prisma.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: "big-loss-xp-user-character",
          key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY
        }
      },
      select: {
        availableAt: true
      }
    })).resolves.toEqual({
      availableAt: new Date(resolveInput().now.getTime() + 3 * 60_000)
    });
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-loss-xp-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T10:23"
      }
    })).toBe(0);
  });

  it("does not grant Big Barrel Brother attempt XP or loss event for timeout-only AFK", async () => {
    await seedCharacter(prisma, "big-loss-afk-user", 5062n, "Автозахисна", {
      hp: 1,
      level: 8,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5062n, {
      ...partyInput("party-token-big-loss-afk"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5062n, {
      partyInviteToken: "party-token-big-loss-afk",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: {
          ...started.session.state,
          participants: started.session.state.participants.map((participant) => ({
            ...participant,
            status: "knocked-out" as const,
            resources: {
              ...participant.resources,
              hp: 0
            },
            contribution: {
              ...participant.contribution,
              timeoutActions: 1
            }
          }))
        }
      }
    });

    const resolved = await bossRepository.resolveTimedOutByToken(
      "party-token-big-loss-afk",
      resolveInput(),
      "due"
    );
    const latest = expectPartyBossSession(resolved);
    const character = await prisma.character.findUnique({
      where: { id: "big-loss-afk-user-character" },
      select: { xp: true }
    });

    expect(latest.status).toBe("lost");
    expect(resolved.achievementEvents).toBeUndefined();
    expect(character?.xp).toBe(0);
    expect(await prisma.characterCooldown.count({
      where: {
        characterId: "big-loss-afk-user-character",
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY
      }
    })).toBe(0);
  });

  it("does not grant another Big loss attempt XP or event while loss retry cooldown is active", async () => {
    await seedCharacter(prisma, "big-loss-active-cooldown-user", 5063n, "Охолола Не До Кінця", {
      hp: 1,
      level: 8,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5063n, {
      ...partyInput("party-token-big-loss-active-cooldown"),
      periodId: "2026-06-30T10:23",
      originLocationId: "barrel.big-brother"
    });
    await prisma.characterCooldown.create({
      data: {
        id: "big-loss-active-cooldown",
        characterId: "big-loss-active-cooldown-user-character",
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
        availableAt: new Date(resolveInput().now.getTime() + 60_000)
      }
    });
    const party = await prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "party-token-big-loss-active-cooldown" },
      select: { id: true }
    });
    const state = {
      rulesVersion: "big-barrel-brother-v1",
      partySessionId: party.id,
      status: "active",
      turn: 1,
      boss: {
        monsterId: "big-barrel-brother",
        name: "Старший Брат Бочки",
        level: 8,
        hp: 23,
        hpMax: 23,
        attack: 13,
        armor: 4,
        resist: 2,
        dexterity: 9,
        tags: ["boss", "barrel"]
      },
      participants: [{
        characterId: "big-loss-active-cooldown-user-character",
        name: "Охолола Не До Кінця",
        remortCount: 0,
        status: "knocked-out",
        combatStats: {
          level: 8,
          hpMax: 1,
          manaMax: 10,
          raceId: "human",
          classId: "warrior",
          strength: 8,
          dexterity: 8,
          intelligence: 5,
          charisma: 5,
          luck: 5,
          armor: 2,
          resist: 1,
          weaponDamage: 3,
          spellPower: 2
        },
        resources: { hp: 0, hpMax: 1, mana: 10, manaMax: 10 },
        contribution: {
          submittedActions: 1,
          timeoutActions: 0,
          damageDealt: 0,
          damageTaken: 1
        }
      }],
      roundLog: [],
      startedAt: now().toISOString()
    };
    await prisma.partySession.update({
      where: { id: party.id },
      data: { status: "active" }
    });
    await prisma.partyBossSession.create({
      data: {
        id: "big-loss-active-cooldown-boss",
        partySessionId: party.id,
        leaderCharacterId: "big-loss-active-cooldown-user-character",
        status: "active",
        turn: 1,
        rulesVersion: "big-barrel-brother-v1",
        bossKey: "big-barrel-brother",
        stateJson: state,
        turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
      }
    });

    const resolved = await bossRepository.resolveTimedOutByToken(
      "party-token-big-loss-active-cooldown",
      resolveInput(),
      "due"
    );
    const character = await prisma.character.findUnique({
      where: { id: "big-loss-active-cooldown-user-character" },
      select: { xp: true }
    });

    expect(expectPartyBossSession(resolved).status).toBe("lost");
    expect(resolved.achievementEvents).toBeUndefined();
    expect(character?.xp).toBe(0);
  });

  it("blocks Big Barrel Brother start when a joined participant is under-level", async () => {
    await seedCharacter(prisma, "big-underlevel-leader-user", 5101n, "Досвідчена Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await seedCharacter(prisma, "big-underlevel-joiner-user", 5102n, "Ранній Запис", {
      hp: 40,
      level: 7,
      strength: 8,
      dexterity: 8
    });
    await partyRepository.createForTelegramUser(5101n, {
      ...partyInput("party-token-big-underlevel"),
      periodId: "2026-06-30T11:23",
      originLocationId: "barrel.big-brother"
    });
    const party = await prisma.partySession.findUniqueOrThrow({
      where: {
        inviteToken: "party-token-big-underlevel"
      },
      select: {
        id: true
      }
    });
    await prisma.partyParticipant.create({
      data: {
        id: "big-underlevel-legacy-participant",
        sessionId: party.id,
        characterId: "big-underlevel-joiner-user-character",
        remortCount: 0,
        status: "joined",
        joinSource: "deep-link",
        joinedAt: now(),
        snapshotJson: {},
        activeMembershipKey: "party-member:big-underlevel-joiner-user-character"
      }
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5101n, {
      partyInviteToken: "party-token-big-underlevel",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started).toEqual({ state: "ineligible" });
    expect(await prisma.partyBossSession.count({
      where: {
        partySession: {
          inviteToken: "party-token-big-underlevel"
        }
      }
    })).toBe(0);
    expect(await prisma.activeCombatLease.count({
      where: {
        characterId: {
          in: ["big-underlevel-leader-user-character", "big-underlevel-joiner-user-character"]
        }
      }
    })).toBe(0);
  });

  it("blocks Big Barrel Brother start when a joined participant is on loss retry cooldown", async () => {
    await seedCharacter(prisma, "big-loss-cooldown-leader-user", 5121n, "Ватажок", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await seedCharacter(prisma, "big-loss-cooldown-joiner-user", 5122n, "Щойно Впала", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5121n, {
      ...partyInput("party-token-big-start-loss-cooldown"),
      periodId: "2026-06-30T11:23",
      originLocationId: "barrel.big-brother"
    });
    await partyRepository.joinByTokenForTelegramUser(
      5122n,
      "party-token-big-start-loss-cooldown",
      joinInput()
    );
    await prisma.characterCooldown.create({
      data: {
        id: "big-start-loss-cooldown",
        characterId: "big-loss-cooldown-joiner-user-character",
        key: BIG_BARREL_BROTHER_LOSS_RETRY_COOLDOWN_KEY,
        availableAt: new Date("2026-06-30T10:14:00.000Z")
      }
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5121n, {
      partyInviteToken: "party-token-big-start-loss-cooldown",
      now: new Date("2026-06-30T10:13:01.000Z"),
      turnExpiresAt: new Date("2026-06-30T10:13:24.000Z"),
      allowExpiredRecruiting: true
    });

    expect(started).toEqual({ state: "ineligible" });
    expect(await prisma.partyBossSession.count({
      where: {
        partySession: {
          inviteToken: "party-token-big-start-loss-cooldown"
        }
      }
    })).toBe(0);
    expect(await prisma.activeCombatLease.count({
      where: {
        characterId: {
          in: ["big-loss-cooldown-leader-user-character", "big-loss-cooldown-joiner-user-character"]
        }
      }
    })).toBe(0);
    await expect(prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "party-token-big-start-loss-cooldown" },
      select: { status: true, activeLeaderKey: true }
    })).resolves.toEqual({
      status: "recruiting",
      activeLeaderKey: "party-leader:big-loss-cooldown-leader-user-character"
    });
  });

  it("allows a remorted level 3 participant to start and settle Big Barrel Brother", async () => {
    await seedCharacter(prisma, "big-remort-eligible-user", 5151n, "Памʼятлива Лідерка", {
      hp: 80,
      level: 3,
      strength: 24,
      dexterity: 24
    });
    await seedRemort(prisma, "big-remort-eligible-user-character", 1);
    await partyRepository.createForTelegramUser(5151n, {
      ...partyInput("party-token-big-remort-eligible"),
      periodId: "2026-06-30T11:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5151n, {
      partyInviteToken: "party-token-big-remort-eligible",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }
    expect(started.session.state.participants[0]?.remortCount).toBe(1);

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const resolved = await bossRepository.submitActionForTelegramUser(
      5151n,
      "party-token-big-remort-eligible",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(latest.status).toBe("won");
    expect(resolved.achievementEvents).toMatchObject([
      {
        type: "barrel.raid.claimed",
        characterId: "big-remort-eligible-user-character",
        occurredAt: resolveInput().now
      }
    ]);
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-remort-eligible-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T11:23"
      }
    })).toBe(1);
  });

  it("blocks Big Barrel Brother start when a remorted participant is below level 3", async () => {
    await seedCharacter(prisma, "big-remort-underlevel-user", 5152n, "Занадто Свіжа", {
      hp: 80,
      level: 2,
      strength: 24,
      dexterity: 24
    });
    await seedRemort(prisma, "big-remort-underlevel-user-character", 1);
    await partyRepository.createForTelegramUser(5152n, {
      ...partyInput("party-token-big-remort-underlevel"),
      periodId: "2026-06-30T11:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5152n, {
      partyInviteToken: "party-token-big-remort-underlevel",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started).toEqual({ state: "ineligible" });
    expect(await prisma.partyBossSession.count({
      where: {
        partySession: {
          inviteToken: "party-token-big-remort-underlevel"
        }
      }
    })).toBe(0);
  });

  it("skips duplicate Big Barrel Brother success and rewards if the participant completed the frozen period before settlement", async () => {
    await seedCharacter(prisma, "big-duplicate-user", 5201n, "Облікована Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5201n, {
      ...partyInput("party-token-big-duplicate"),
      periodId: "2026-06-30T12:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5201n, {
      partyInviteToken: "party-token-big-duplicate",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.dailyAction.create({
      data: {
        characterId: "big-duplicate-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T12:23",
        rewardXp: 1,
        rewardGold: 1,
        spentGold: 0,
        resultJson: { kind: "legacy-test-success" }
      }
    });
    const before = await prisma.character.findUniqueOrThrow({
      where: { id: "big-duplicate-user-character" },
      select: { xp: true, gold: true }
    });

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const resolved = await bossRepository.submitActionForTelegramUser(
      5201n,
      "party-token-big-duplicate",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(latest.status).toBe("won");
    expect(resolved.achievementEvents).toBeUndefined();
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-duplicate-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T12:23"
      }
    })).toBe(1);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "big-duplicate-user-character" },
      select: { xp: true, gold: true }
    })).resolves.toEqual(before);
    expect(await prisma.characterItem.count({
      where: { characterId: "big-duplicate-user-character" }
    })).toBe(0);
  });

  it("skips Big Barrel Brother rewards when current level drops below the frozen eligibility gate before settlement", async () => {
    await seedCharacter(prisma, "big-level-drop-user", 5301n, "Занижена Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5301n, {
      ...partyInput("party-token-big-level-drop"),
      periodId: "2026-06-30T13:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5301n, {
      partyInviteToken: "party-token-big-level-drop",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.character.update({
      where: { id: "big-level-drop-user-character" },
      data: { level: 7 }
    });
    const before = await prisma.character.findUniqueOrThrow({
      where: { id: "big-level-drop-user-character" },
      select: { xp: true, gold: true }
    });

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const resolved = await bossRepository.submitActionForTelegramUser(
      5301n,
      "party-token-big-level-drop",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(latest.status).toBe("won");
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-level-drop-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T13:23"
      }
    })).toBe(0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "big-level-drop-user-character" },
      select: { xp: true, gold: true }
    })).resolves.toEqual(before);
    expect(await prisma.characterItem.count({
      where: { characterId: "big-level-drop-user-character" }
    })).toBe(0);
  });

  it("skips Big Barrel Brother rewards when current remort count no longer matches the frozen participant", async () => {
    await seedCharacter(prisma, "big-remort-user", 5401n, "Нова Лідерка", {
      hp: 80,
      level: 8,
      strength: 24,
      dexterity: 24
    });
    await partyRepository.createForTelegramUser(5401n, {
      ...partyInput("party-token-big-remort"),
      periodId: "2026-06-30T14:23",
      originLocationId: "barrel.big-brother"
    });

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(5401n, {
      partyInviteToken: "party-token-big-remort",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    await prisma.characterRemort.create({
      data: {
        id: "big-remort-user-remort-1",
        characterId: "big-remort-user-character",
        token: "big-remort-token-1",
        remortNumber: 1,
        previousLevel: 8,
        previousXp: 0,
        previousGold: 0,
        displayNameSnapshot: "Нова Лідерка",
        preservedPayloadJson: {}
      }
    });
    const before = await prisma.character.findUniqueOrThrow({
      where: { id: "big-remort-user-character" },
      select: { xp: true, gold: true, hpCurrent: true, manaCurrent: true }
    });

    await forceBossToOneHp(prisma, started.session.id, started.session.state);
    const resolved = await bossRepository.submitActionForTelegramUser(
      5401n,
      "party-token-big-remort",
      1,
      "attack",
      resolveInput()
    );
    const latest = expectPartyBossSession(resolved);

    expect(latest.status).toBe("won");
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-remort-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T14:23"
      }
    })).toBe(0);
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "big-remort-user-character" },
      select: { xp: true, gold: true, hpCurrent: true, manaCurrent: true }
    })).resolves.toEqual(before);
    expect(await prisma.characterItem.count({
      where: { characterId: "big-remort-user-character" }
    })).toBe(0);
  });
});

async function seedTerminalBossHistory(
  prisma: PrismaClient,
  parties: PrismaPartySessionRepository,
  bosses: PrismaPartyBossRepository,
  input: {
    token: string;
    leaderUserId: string;
    leaderTelegramId: bigint;
    joinerUserId: string;
    joinerTelegramId: bigint;
  }
): Promise<{
  token: string;
  bossSessionId: string;
  leaderCharacterId: string;
  joinerCharacterId: string;
}> {
  await seedCharacter(prisma, input.leaderUserId, input.leaderTelegramId, "Лідер історії", { hp: 300, level: 8 });
  await seedCharacter(prisma, input.joinerUserId, input.joinerTelegramId, "Свідок історії", { hp: 300, level: 8 });
  await parties.createForTelegramUser(input.leaderTelegramId, partyInput(input.token));
  await parties.joinByTokenForTelegramUser(input.joinerTelegramId, input.token, joinInput());
  const started = await bosses.startFromRecruitingPartyForTelegramUser(input.leaderTelegramId, {
    partyInviteToken: input.token,
    now: now(),
    turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
  });
  if (!("session" in started)) throw new Error(`Expected history boss start, got ${started.state}`);
  const session = started.session;
  const completedAt = new Date("2026-06-30T10:13:00.000Z");
  const rounds = Array.from({ length: 25 }, (_, index) => ({
    turn: index + 1,
    actions: session.state.participants.map((participant) => ({
      characterId: participant.characterId,
      action: "attack" as const,
      origin: "manual" as const,
      outcome: "hit" as const,
      damage: 1,
      manaSpent: 0
    })),
    bossDamage: session.state.participants.length,
    bossHpAfter: Math.max(0, session.state.boss.hp - (index + 1) * session.state.participants.length),
    bossRetaliations: [],
    participantsAfter: session.state.participants.map((participant) => ({
      characterId: participant.characterId,
      status: participant.status,
      hp: participant.resources.hp,
      hpMax: participant.resources.hpMax,
      mana: participant.resources.mana,
      manaMax: participant.resources.manaMax
    })),
    statusAfter: index === 24 ? "won" as const : "active" as const
  }));
  const terminalState = {
    ...session.state,
    status: "won" as const,
    turn: 26,
    boss: { ...session.state.boss, hp: 0 },
    roundLog: [rounds[24]!],
    completedAt: completedAt.toISOString()
  };
  await prisma.$transaction(async (tx) => {
    await tx.partyBossSession.update({
      where: { id: session.id },
      data: {
        status: "won",
        turn: 26,
        stateJson: terminalState,
        resultJson: null,
        completedAt,
        turnExpiresAt: completedAt
      }
    });
    await tx.partyBossRound.createMany({
      data: rounds.map((round) => ({ sessionId: session.id, turn: round.turn, roundJson: round }))
    });
    await tx.activeCombatLease.deleteMany({ where: { referenceId: session.partySessionId, kind: "party-boss" } });
    await tx.partyParticipant.updateMany({
      where: { sessionId: session.partySessionId },
      data: { activeMembershipKey: null }
    });
    await tx.partySession.update({
      where: { id: session.partySessionId },
      data: { status: "completed", activeLeaderKey: null }
    });
  });

  return {
    token: input.token,
    bossSessionId: session.id,
    leaderCharacterId: session.leaderCharacterId,
    joinerCharacterId: session.participants.find((participant) => participant.id !== session.leaderCharacterId)!.id
  };
}

interface LegacyZeroHpStoredState {
  leaderCharacterId?: unknown;
  participants: Array<{
    characterId: string;
    status: unknown;
    resources: { hp: unknown };
  }>;
  roundLog: Array<{
    participantsAfter?: Array<{
      characterId: string;
      status: unknown;
      hp: unknown;
    }>;
  }>;
}

async function readLegacyZeroHpState(
  prisma: PrismaClient,
  bossSessionId: string
): Promise<LegacyZeroHpStoredState> {
  const row = await prisma.partyBossSession.findUniqueOrThrow({
    where: { id: bossSessionId },
    select: { stateJson: true }
  });
  return row.stateJson as unknown as LegacyZeroHpStoredState;
}

function findLegacyTopParticipant(
  state: LegacyZeroHpStoredState,
  characterId: string
): LegacyZeroHpStoredState["participants"][number] {
  const participant = state.participants.find((entry) => entry.characterId === characterId);
  if (!participant) {
    throw new Error(`Missing legacy top-level participant ${characterId}.`);
  }
  return participant;
}

function findLegacyRoundParticipant(
  state: LegacyZeroHpStoredState,
  roundIndex: number,
  characterId: string
): NonNullable<LegacyZeroHpStoredState["roundLog"][number]["participantsAfter"]>[number] {
  const participant = state.roundLog[roundIndex]?.participantsAfter?.find(
    (entry) => entry.characterId === characterId
  );
  if (!participant) {
    throw new Error(`Missing legacy round participant ${characterId} on page ${roundIndex}.`);
  }
  return participant;
}

async function seedPre0316ZeroHpParty(
  prisma: PrismaClient,
  parties: PrismaPartySessionRepository,
  bosses: PrismaPartyBossRepository,
  input: {
    token: string;
    leaderUserId: string;
    leaderTelegramId: bigint;
    joinerUserId: string;
    joinerTelegramId: bigint;
    leaderHp: number;
    terminal: boolean;
  }
): Promise<{
  token: string;
  bossSessionId: string;
  partySessionId: string;
  leaderCharacterId: string;
  joinerCharacterId: string;
  availableJournalPages: number;
}> {
  await seedCharacter(prisma, input.leaderUserId, input.leaderTelegramId, "Legacy leader", {
    hpCurrent: input.leaderHp,
    hpMax: 300,
    level: 8
  });
  await seedCharacter(prisma, input.joinerUserId, input.joinerTelegramId, "Legacy zero-HP joiner", {
    hpCurrent: 0,
    hpMax: 300,
    level: 8
  });
  await parties.createForTelegramUser(input.leaderTelegramId, partyInput(input.token));
  await parties.joinByTokenForTelegramUser(input.joinerTelegramId, input.token, joinInput());
  const started = await bosses.startFromRecruitingPartyForTelegramUser(input.leaderTelegramId, {
    partyInviteToken: input.token,
    now: now(),
    turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
  });
  const session = expectPartyBossSession(started);
  const legacyParticipants = session.state.participants.map((participant) => ({
    ...participant,
    status: "active" as const
  }));
  const availableJournalPages = input.terminal ? 3 : 1;
  const rounds = Array.from({ length: availableJournalPages }, (_, index) => ({
    turn: index + 1,
    actions: [],
    bossDamage: 0,
    bossHpAfter: input.terminal && index === availableJournalPages - 1
      ? 0
      : session.state.boss.hp,
    bossRetaliations: [],
    participantsAfter: legacyParticipants.map((participant) => ({
      characterId: participant.characterId,
      status: "active" as const,
      hp: participant.resources.hp,
      hpMax: participant.resources.hpMax,
      mana: participant.resources.mana,
      manaMax: participant.resources.manaMax
    })),
    statusAfter: input.terminal && index === availableJournalPages - 1
      ? "won" as const
      : "active" as const
  }));
  const completedAt = new Date("2026-06-30T10:03:00.000Z");
  const legacyState = {
    ...session.state,
    participants: legacyParticipants,
    status: input.terminal ? "won" as const : "active" as const,
    turn: availableJournalPages + 1,
    boss: {
      ...session.state.boss,
      hp: input.terminal ? 0 : session.state.boss.hp
    },
    roundLog: rounds,
    ...(input.terminal ? { completedAt: completedAt.toISOString() } : {})
  };
  const { leaderCharacterId, ...legacyStateWithoutLeader } = legacyState;
  const legacyResult = input.terminal
    ? {
        status: "won",
        completedAt: completedAt.toISOString(),
        participants: legacyParticipants.map((participant) => ({
          characterId: participant.characterId,
          status: "active",
          damageDealt: 0,
          submittedActions: 0,
          timeoutActions: 0
        })),
        bossHpAfter: 0,
        compatibilityMarker: "preserve-me"
      }
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.partyBossSession.update({
      where: { id: session.id },
      data: {
        status: input.terminal ? "won" : "active",
        turn: availableJournalPages + 1,
        stateJson: legacyStateWithoutLeader,
        resultJson: legacyResult ?? undefined,
        turnExpiresAt: input.terminal ? completedAt : new Date("2026-06-30T10:00:23.000Z"),
        ...(input.terminal ? { completedAt } : {})
      }
    });
    if (input.terminal) {
      await tx.activeCombatLease.deleteMany({ where: { referenceId: session.partySessionId, kind: "party-boss" } });
      await tx.partyParticipant.updateMany({
        where: { sessionId: session.partySessionId },
        data: { activeMembershipKey: null }
      });
      await tx.partySession.update({
        where: { id: session.partySessionId },
        data: { status: "completed", activeLeaderKey: null }
      });
    }
  });

  return {
    token: input.token,
    bossSessionId: session.id,
    partySessionId: session.partySessionId,
    leaderCharacterId,
    joinerCharacterId: `${input.joinerUserId}-character`,
    availableJournalPages
  };
}

function now(): Date {
  return new Date("2026-06-30T10:00:00.000Z");
}

function resolveInput() {
  return {
    now: now(),
    nextTurnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
  };
}

async function forceBossToOneHp(
  prisma: PrismaClient,
  sessionId: string,
  state: PartyBossSessionRecord["state"]
): Promise<void> {
  await prisma.partyBossSession.update({
    where: { id: sessionId },
    data: {
      stateJson: {
        ...state,
        boss: {
          ...state.boss,
          hp: 0,
          hpMax: 1,
          dexterity: 0
        }
      }
    }
  });
}

function partyInput(inviteToken: string) {
  return {
    inviteToken,
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-30T10:13:00.000Z"),
    expiresAt: new Date("2026-06-30T10:13:00.000Z"),
    now: now(),
    periodId: "12026-06-30",
    originLocationId: "korchma.board",
    chatId: 587n,
    messageId: 13
  };
}

function joinInput() {
  return {
    joinSource: "deep-link" as const,
    now: now(),
    chatId: 587n,
    messageId: 23
  };
}

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  telegramUserId: bigint,
  name: string,
  options: {
    hp?: number;
    hpCurrent?: number;
    hpMax?: number;
    manaCurrent?: number;
    manaMax?: number;
    level?: number;
    xp?: number;
    raceId?: string;
    classId?: string;
    strength?: number;
    dexterity?: number;
    intelligence?: number;
    equipment?: Array<{ slot: string; itemId: string }>;
  } = {}
): Promise<void> {
  const hp = options.hp ?? 25;
  const strength = options.strength ?? 8;
  const dexterity = options.dexterity ?? 6;
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      lastSeenLocationId: "korchma.board",
      character: {
        create: {
          id: `${userId}-character`,
          name,
          raceId: options.raceId ?? "race.human-ish",
          classId: options.classId ?? "class.warrior",
          level: options.level ?? 3,
          xp: options.xp ?? 0,
          hpCurrent: options.hpCurrent ?? hp,
          hpMax: options.hpMax ?? hp,
          manaCurrent: options.manaCurrent ?? 10,
          manaMax: options.manaMax ?? 10,
          statsJson: {
            strength,
            dexterity,
            intelligence: options.intelligence ?? 5,
            charisma: 5,
            luck: 5
          },
          ...(options.equipment
            ? {
                equipment: {
                  create: options.equipment
                }
              }
            : {})
        }
      }
    }
  });
}

async function seedRemort(prisma: PrismaClient, characterId: string, remortNumber: number): Promise<void> {
  await prisma.characterRemort.create({
    data: {
      id: `${characterId}-remort-${remortNumber}`,
      characterId,
      token: `${characterId}-remort-token-${remortNumber}`,
      remortNumber,
      previousLevel: 13,
      previousXp: 587,
      previousGold: 42,
      displayNameSnapshot: "Памʼять Бочки",
      preservedPayloadJson: {}
    }
  });
}

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
    `CREATE TABLE hp_recovery_notifications (
      id TEXT NOT NULL PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      generation INTEGER NOT NULL DEFAULT 1,
      remort_count INTEGER NOT NULL DEFAULT 0,
      source_hp_current INTEGER NOT NULL,
      source_hp_max INTEGER NOT NULL,
      source_hp_regen_at DATETIME,
      source_fingerprint TEXT,
      status TEXT NOT NULL DEFAULT 'waiting',
      next_attempt_at DATETIME NOT NULL,
      processing_started_at DATETIME,
      ready_at DATETIME,
      sent_at DATETIME,
      suppressed_at DATETIME,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_drink_states (
      id TEXT PRIMARY KEY,
      activation_id TEXT NOT NULL,
      character_id TEXT NOT NULL UNIQUE,
      remort_count INTEGER NOT NULL DEFAULT 0,
      drink_key TEXT NOT NULL,
      phase TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      metadata_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      invite_token TEXT NOT NULL,
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
      active_leader_key TEXT,
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
      active_membership_key TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_sessions (
      id TEXT PRIMARY KEY,
      party_session_id TEXT NOT NULL,
      leader_character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      rules_version TEXT NOT NULL,
      boss_key TEXT NOT NULL,
      state_json JSONB NOT NULL,
      result_json JSONB,
      turn_expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      actor_character_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      action_key TEXT NOT NULL,
      result_json JSONB,
      submitted_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL DEFAULT 0,
      reward_gold INTEGER NOT NULL DEFAULT 0,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE bard_performances (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      cooldown_available_at DATETIME NOT NULL
    )`,
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE mantok_chest_runs (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input_items_json JSONB NOT NULL,
      output_items_json JSONB,
      average_input_score INTEGER NOT NULL DEFAULT 0,
      minimum_output_score INTEGER NOT NULL DEFAULT 0,
      output_score INTEGER,
      completed_at DATETIME,
      expired_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE korchma_mantok_sales (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      selection_json JSONB NOT NULL,
      selection_fingerprint TEXT NOT NULL,
      nominal_value INTEGER NOT NULL DEFAULT 0,
      payout_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE item_transfers (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      transfer_kind TEXT NOT NULL DEFAULT 'gift',
      sender_character_id TEXT NOT NULL,
      receiver_character_id TEXT NOT NULL,
      sender_telegram_user_id INTEGER NOT NULL,
      receiver_telegram_user_id INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      receiver_name TEXT NOT NULL,
      sender_remort_count INTEGER NOT NULL DEFAULT 0,
      receiver_remort_count INTEGER NOT NULL DEFAULT 0,
      location_id TEXT,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_fingerprint TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      package_json JSONB,
      delivery_fee_gold INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      reservation_key TEXT,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      responded_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE item_use_orders (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      character_id TEXT NOT NULL,
      telegram_user_id INTEGER NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_fingerprint TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      effect_kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reservation_key TEXT,
      preview_json JSONB NOT NULL,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      cancelled_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE level_barter_exchanges (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      input_items_json JSONB NOT NULL,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      level_before INTEGER NOT NULL DEFAULT 1,
      level_after INTEGER NOT NULL DEFAULT 1,
      xp_before INTEGER NOT NULL DEFAULT 0,
      xp_after INTEGER NOT NULL DEFAULT 0,
      xp_carry INTEGER NOT NULL DEFAULT 0,
      item_total_value INTEGER NOT NULL DEFAULT 0,
      selected_total_value INTEGER NOT NULL DEFAULT 0,
      overpay INTEGER NOT NULL DEFAULT 0,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX party_sessions_invite_token_key ON party_sessions(invite_token)`,
    `CREATE UNIQUE INDEX party_sessions_active_leader_key_key ON party_sessions(active_leader_key)`,
    `CREATE UNIQUE INDEX party_participants_active_membership_key_key ON party_participants(active_membership_key)`,
    `CREATE UNIQUE INDEX party_participants_session_id_character_id_key ON party_participants(session_id, character_id)`,
    `CREATE UNIQUE INDEX party_boss_sessions_party_session_id_key ON party_boss_sessions(party_session_id)`,
    `CREATE UNIQUE INDEX party_boss_actions_session_id_turn_actor_character_id_key ON party_boss_actions(session_id, turn, actor_character_id)`,
    `CREATE UNIQUE INDEX daily_actions_character_id_key_local_date_key ON daily_actions(character_id, key, local_date)`,
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`,
    `CREATE UNIQUE INDEX character_items_character_id_item_id_key ON character_items(character_id, item_id)`,
    `CREATE UNIQUE INDEX character_equipment_character_id_slot_key ON character_equipment(character_id, slot)`,
    `CREATE UNIQUE INDEX item_transfers_reservation_key_key ON item_transfers(reservation_key)`,
    `CREATE UNIQUE INDEX item_use_orders_reservation_key_key ON item_use_orders(reservation_key)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
