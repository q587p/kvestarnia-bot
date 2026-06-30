import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPartyBossRepository } from "../../src/db/repositories/prismaPartyBossRepository";
import { PrismaPartySessionRepository } from "../../src/db/repositories/prismaPartySessionRepository";
import type {
  PartyBossActionResult,
  PartyBossSessionRecord
} from "../../src/db/repositories/partyBossRepository";

function expectPartyBossSession(result: PartyBossActionResult): PartyBossSessionRecord {
  if (!("session" in result)) {
    throw new Error(`Expected party boss session result, got ${result.state}`);
  }

  return result.session;
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
    partyRepository = new PrismaPartySessionRepository(prisma);
    bossRepository = new PrismaPartyBossRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("starts from recruiting party, dedupes actions, and timeout-resolves past the old cap without terminalizing by turn count", async () => {
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
    const duplicate = await bossRepository.submitActionForTelegramUser(1001n, "party-token-a", 1, "defend", resolveInput());

    expect(first.state).toBe("queued");
    expect(duplicate.state).toBe("duplicate");
    expect(await prisma.partyBossAction.count()).toBe(1);

    let latest = expectPartyBossSession(duplicate);
    for (let turn = latest.turn; turn <= 6; turn += 1) {
      const resolved = await bossRepository.resolveTimedOutByToken("party-token-a", {
        now: new Date(`2026-06-30T10:0${turn}:00.000Z`),
        nextTurnExpiresAt: new Date(`2026-06-30T10:0${turn}:23.000Z`)
      }, "due");
      expect(resolved.state).toBe("resolved");
      latest = expectPartyBossSession(resolved);
    }

    expect(latest.status).toBe("active");
    expect(latest.turn).toBe(7);
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

  it("releases leases and live party keys when timeout resolution knocks out all participants", async () => {
    await seedCharacter(prisma, "knockout-leader-user", 2001n, "Крихка Лідерка", { hp: 1 });
    await seedCharacter(prisma, "knockout-joiner-user", 2002n, "Крихкий Помічник", { hp: 1 });
    await partyRepository.createForTelegramUser(2001n, partyInput("party-token-knockout"));
    await partyRepository.joinByTokenForTelegramUser(2002n, "party-token-knockout", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(2001n, {
      partyInviteToken: "party-token-knockout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
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
    expect(await prisma.dailyAction.count({
      where: {
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T10:23"
      }
    })).toBe(1);

    const replay = await bossRepository.resolveTimedOutByToken("party-token-big", resolveInput(), "due");

    expect(replay.state).toBe("terminal");
    expect(await prisma.dailyAction.count({
      where: {
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T10:23"
      }
    })).toBe(1);
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: latest.partySessionId } })).toBe(0);
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
    expect(character?.xp).toBeGreaterThan(0);
    expect(character?.gold).toBe(0);
    expect(await prisma.dailyAction.count({
      where: {
        characterId: "big-loss-xp-user-character",
        key: "tavern.friday-barrel-raid",
        localDate: "2026-06-30T10:23"
      }
    })).toBe(0);
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
    await partyRepository.joinByTokenForTelegramUser(5102n, "party-token-big-underlevel", joinInput());

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
    strength?: number;
    dexterity?: number;
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
          raceId: "race.human-ish",
          classId: "class.warrior",
          level: options.level ?? 3,
          hpCurrent: options.hpCurrent ?? hp,
          hpMax: options.hpMax ?? hp,
          manaCurrent: options.manaCurrent ?? 10,
          manaMax: options.manaMax ?? 10,
          statsJson: {
            strength,
            dexterity,
            intelligence: 5,
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
    `CREATE UNIQUE INDEX party_sessions_invite_token_key ON party_sessions(invite_token)`,
    `CREATE UNIQUE INDEX party_sessions_active_leader_key_key ON party_sessions(active_leader_key)`,
    `CREATE UNIQUE INDEX party_participants_active_membership_key_key ON party_participants(active_membership_key)`,
    `CREATE UNIQUE INDEX party_participants_session_id_character_id_key ON party_participants(session_id, character_id)`,
    `CREATE UNIQUE INDEX party_boss_sessions_party_session_id_key ON party_boss_sessions(party_session_id)`,
    `CREATE UNIQUE INDEX party_boss_actions_session_id_turn_actor_character_id_key ON party_boss_actions(session_id, turn, actor_character_id)`,
    `CREATE UNIQUE INDEX daily_actions_character_id_key_local_date_key ON daily_actions(character_id, key, local_date)`,
    `CREATE UNIQUE INDEX character_items_character_id_item_id_key ON character_items(character_id, item_id)`,
    `CREATE UNIQUE INDEX character_equipment_character_id_slot_key ON character_equipment(character_id, slot)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
