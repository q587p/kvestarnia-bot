import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PrismaGroupCombatRepository
} from "../../src/db/repositories/prismaGroupCombatRepository";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaPartySessionRepository } from "../../src/db/repositories/prismaPartySessionRepository";
import {
  PRESENCE_ADVENTURE_SOLO_FIGHT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT
} from "../../src/services/presenceService";
import {
  VARENYK_SATED_STATUS_KEY,
  type VarenykSatedPayloadV1
} from "../../src/domain/noncombat/varenykSatedSupport";
import { GroupCombatService } from "../../src/services/groupCombatService";
import { createGroupCombatTimeoutScheduler } from "../../src/bot/groupCombatTimeoutScheduler";
import {
  buildGroupCombatSettlementPlan,
  buildGroupCombatProductionV1Evidence,
  buildGroupCombatTimeoutAction,
  buildLeftPassageEncounterRewardBudget,
  expandGroupCombatRecapSnapshot,
  getGroupCombatEnemyFocusTarget,
  getLeftPassageTierTwoDiscoveryMinutes,
  GROUP_COMBAT_STATE_BYTE_LIMIT,
  GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS,
  LEFT_PASSAGE_TIER_TWO_DISCOVERY_COOLDOWN_KEY,
  resolveGroupCombatTurn,
  resolveGroupCombatLootVersionOneRoll,
  sumGroupCombatSettlementRewards,
  type GroupCombatState
} from "../../src/domain/groupCombat/groupCombat";
import { presentGroupCombat } from "../../src/bot/presenters/groupCombatPresenter";
import { items, monsters } from "../../src/content";
import { monsterAbilities } from "../../src/content/monsterAbilities";
import { monsterCombatProfiles } from "../../src/content/monsterCombatProfiles";
import { monsterLoot } from "../../src/content/monsterFlavor";
import { startCombat } from "../../src/domain/combat";
import { deriveGroupCombatProductionV1MonsterStats } from "../../src/domain/groupCombat/groupCombatProductionV1Resolver";
import { mapSoloCombatSessionRecord } from "../../src/db/repositories/prismaSoloCombatSessionRepository";

const NOW = new Date("2026-07-22T10:00:00.000Z");
const QUERY_EVENT_BARRIER_PREFIX = "group_combat_query_budget_barrier";
const QUERY_BUDGETS = {
  start: 35,
  dueStart: 35,
  queue: 25,
  singleResolve: 42,
  dueScan: 1,
  deliveryScan: 1,
  settlementScan: 1,
  settlement: 38,
  idleRepair: 6
} as const;
type QueryObservation = keyof typeof QUERY_BUDGETS | "concurrentPair";
const actualQueryCounts: Partial<Record<QueryObservation, number>> = {};
let queryEventBarrierSequence = 0;

describe("PrismaGroupCombatRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaGroupCombatRepository;
  let queries: string[];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-group-combat-"));
    prisma = new PrismaClient({
      datasources: { db: { url: `file:${join(dir, "test.db").replace(/\\/g, "/")}` } },
      log: [{ emit: "event", level: "query" }]
    });
    queries = [];
    prisma.$on("query", (event: { query: string }) => queries.push(event.query));
    await createMinimalSchema(prisma);
    await applyGroupCombatMigration(prisma);
    repository = new PrismaGroupCombatRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("atomically starts 2x2, freezes the same-life roster, and blocks partial invalid starts", async () => {
    await seedParty(prisma, "group-start", [1101n, 1102n]);
    const before = await resourceSnapshot(prisma, [1101n, 1102n]);
    const { value: started, count: startQueries } = await measureQueryEvents(prisma, queries, () => (
      repository.startProofForTelegramUser({
        telegramUserId: 1101n,
        partyInviteToken: "group-start",
        now: NOW,
        turnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    ));
    actualQueryCounts.start = startQueries;

    expect(started.state).toBe("started");
    expect(startQueries).toBeLessThanOrEqual(QUERY_BUDGETS.start);
    expect("session" in started ? started.session.state.enemies : []).toHaveLength(2);
    expect(await prisma.activeCombatLease.count({ where: { kind: "group-combat" } })).toBe(2);
    expect(await resourceSnapshot(prisma, [1101n, 1102n])).toEqual(before);
    await expect(new PrismaCharacterRepository(prisma).restartByTelegramUserId(1101n)).resolves.toBe("active-combat");
    if ("session" in started) {
      const leader = started.session.participants[0]!;
      await expect(repository.compareAndSetParticipantCard({
        sessionId: started.session.id,
        telegramUserId: leader.telegramUserId,
        expectedReferenceVersion: leader.referenceVersion,
        chatId: -100587n,
        messageId: 93
      })).resolves.toBe(false);
      await expect(repository.compareAndSetParticipantCard({
        sessionId: started.session.id,
        telegramUserId: leader.telegramUserId,
        expectedReferenceVersion: leader.referenceVersion,
        chatId: leader.telegramUserId,
        messageId: 93
      })).resolves.toBe(true);
    }

    await seedParty(prisma, "group-four", [1201n, 1202n, 1203n, 1204n]);
    const invalid = await repository.startProofForTelegramUser({
      telegramUserId: 1201n,
      partyInviteToken: "group-four",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(invalid.state).toBe("invalid-size");
    expect(await prisma.groupCombatSession.count({ where: { partySession: { inviteToken: "group-four" } } })).toBe(0);
    expect(await prisma.activeCombatLease.count({ where: { character: { user: { telegramUserId: { in: [1201n, 1202n, 1203n, 1204n] } } } } })).toBe(0);

    await seedParty(prisma, "group-wrong-life", [1211n, 1212n]);
    await prisma.partyParticipant.update({
      where: { activeMembershipKey: "party-member:group-wrong-life-user-1-character" },
      data: { remortCount: 1 }
    });
    const wrongLife = await repository.startProofForTelegramUser({
      telegramUserId: 1211n,
      partyInviteToken: "group-wrong-life",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(wrongLife.state).toBe("invalid-life");
    expect(await prisma.groupCombatSession.count({ where: { partySession: { inviteToken: "group-wrong-life" } } })).toBe(0);

    await seedParty(prisma, "group-busy", [1221n, 1222n]);
    await prisma.activeCombatLease.create({
      data: {
        id: "group-busy-existing-lease",
        characterId: "group-busy-user-1-character",
        kind: "solo-combat",
        referenceId: "existing-solo-combat"
      }
    });
    const busy = await repository.startProofForTelegramUser({
      telegramUserId: 1221n,
      partyInviteToken: "group-busy",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(busy.state).toBe("blocked");
    expect(await prisma.groupCombatSession.count({ where: { partySession: { inviteToken: "group-busy" } } })).toBe(0);
    expect(await prisma.activeCombatLease.count({
      where: { characterId: { in: ["group-busy-user-0-character", "group-busy-user-1-character"] } }
    })).toBe(1);
  });

  it("reserves a wounded consumed deep-left monster and freezes its surviving HP", async () => {
    const token = "left-wounded-party";
    const telegramUserId = 11871n;
    await seedParty(prisma, token, [telegramUserId]);
    await prisma.partyParticipant.deleteMany({ where: { session: { inviteToken: token } } });
    await prisma.partySession.delete({ where: { inviteToken: token } });
    const characterId = `${token}-user-0-character`;
    await prisma.user.update({
      where: { telegramUserId },
      data: {
        lastSeenLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT,
        currentRaidId: null
      }
    });
    const woundedState = {
      ...startCombat({
        id: "left-wounded-solo",
        hero: {
          hpMax: 28,
          manaMax: 14,
          strength: 8,
          dexterity: 8,
          intelligence: 8,
          charisma: 8,
          luck: 8
        },
        monster: {
          monsterId: "monster.deadline-spider",
          level: 4,
          hpMax: 22,
          attack: 5,
          armor: 1,
          resist: 1,
          dexterity: 6,
          tags: []
        }
      }),
      status: "lost" as const,
      completedAt: NOW.toISOString(),
      life: { characterId, remortCount: 0 },
      hero: { hp: 0, hpMax: 28, mana: 14, manaMax: 14 },
      monster: {
        id: "monster.deadline-spider",
        level: 4,
        hp: 7,
        hpMax: 22,
        attack: 5,
        armor: 1,
        resist: 1,
        dexterity: 6,
        tags: []
      }
    };
    await prisma.soloCombatSession.create({
      data: {
        id: "left-wounded-solo",
        characterId,
        monsterId: "monster.deadline-spider",
        stateJson: woundedState as unknown as Prisma.InputJsonValue,
        status: "lost",
        turn: 3,
        expiresAt: new Date(NOW.getTime() + 10 * 60_000)
      }
    });
    await prisma.pendingPassageEncounter.create({
      data: {
        id: "left-wounded-encounter",
        token: "left-wounded-preview",
        characterId,
        originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        passage: "deep-left",
        difficulty: "hard",
        monsterId: "monster.deadline-spider",
        baseMonsterLevel: 2,
        effectiveMonsterLevel: 4,
        rulesVersion: "nyz-passage-preview-v1",
        seedHash: "left-wounded-seed",
        status: "consumed",
        combatSessionId: "left-wounded-solo",
        consumedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 10 * 60_000)
      }
    });
    expect(mapSoloCombatSessionRecord(await prisma.soloCombatSession.findUnique({
      where: { id: "left-wounded-solo" }
    }))?.state).not.toBeNull();

    const created = await repository.createLeftPassagePartyForTelegramUser({
      telegramUserId,
      encounterToken: "left-wounded-preview",
      inviteToken: "left-wounded-party-invite",
      originKind: "nyz-left-passage-party.v1",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now: NOW,
      joinUntilAt: new Date(NOW.getTime() + 3 * 60_000)
    });
    expect(created.state).toBe("created");
    if (!("session" in created)) {
      throw new Error("Expected the wounded encounter reservation.");
    }
    const reservation = await prisma.pendingPassageEncounter.findUnique({
      where: { token: "left-wounded-preview" }
    });
    expect(reservation).toMatchObject({ status: "reserved", reservedMonsterHp: 7 });

    const started = await repository.startLeftPassageForTelegramUser({
      telegramUserId,
      partyInviteToken: "left-wounded-party-invite",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000),
      guildWeeklyGoalEligible: true
    });
    expect(started.state).toBe("started");
    if ("session" in started) {
      expect(started.session.state.enemies[0]?.hp).toBe(7);
      expect(started.session.state.production?.primaryStartingHp).toBe(7);
      await expect(prisma.groupCombatSession.findUniqueOrThrow({
        where: { id: started.session.id },
        select: { guildWeeklyGoalEligible: true }
      })).resolves.toEqual({ guildWeeklyGoalEligible: true });
      await prisma.activeCombatLease.deleteMany({ where: { referenceId: started.session.id } });
      await prisma.groupCombatSession.delete({ where: { id: started.session.id } });
    }
    await prisma.partySession.delete({ where: { inviteToken: "left-wounded-party-invite" } });
    await prisma.pendingPassageEncounter.delete({ where: { token: "left-wounded-preview" } });
    await prisma.soloCombatSession.delete({ where: { id: "left-wounded-solo" } });
    await prisma.user.delete({ where: { telegramUserId } });
  });

  it("accepts preview presence and effective resources, then settles the exact 2x2 reservation once", async () => {
    const token = "left-party-reserve";
    const telegramIds = [11931n, 11932n];
    await seedParty(prisma, token, telegramIds);
    await prisma.partyParticipant.deleteMany({ where: { session: { inviteToken: token } } });
    await prisma.partySession.delete({ where: { inviteToken: token } });
    await prisma.user.updateMany({
      where: { telegramUserId: { in: telegramIds } },
      data: {
        lastSeenLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT,
        currentRaidId: null
      }
    });
    await prisma.character.updateMany({
      where: { user: { telegramUserId: { in: telegramIds } } },
      data: {
        hpCurrent: 28,
        hpMax: 20,
        manaCurrent: 14,
        manaMax: 10,
        statsJson: {
          strength: 42,
          dexterity: 6,
          intelligence: 7,
          charisma: 7,
          luck: 5
        }
      }
    });
    const leaderCharacterId = `${token}-user-0-character`;
    await prisma.pendingPassageEncounter.create({
      data: {
        id: `${token}-encounter`,
        token: "left-preview-token-13",
        characterId: leaderCharacterId,
        originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        passage: "deep-left",
        difficulty: "hard",
        monsterId: "monster.deadline-spider",
        baseMonsterLevel: 2,
        effectiveMonsterLevel: 4,
        rulesVersion: "nyz-passage-preview-v1",
        seedHash: "left-preview-seed-587",
        status: "pending",
        activeKey: `pending-passage:${leaderCharacterId}:${PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT}`,
        expiresAt: new Date(NOW.getTime() + 10 * 60_000)
      }
    });
    const creationSearchEndsAt = new Date(NOW.getTime() + 93_000);
    await prisma.passageSearchAction.create({
      data: {
        token: "left-create-search-13",
        characterId: leaderCharacterId,
        nodeKey: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        nodeKind: "passage",
        status: "running",
        activeKey: `passage-search:${leaderCharacterId}`,
        startedAt: NOW,
        endsAt: creationSearchEndsAt,
        payloadJson: {}
      }
    });
    await expect(repository.createLeftPassagePartyForTelegramUser({
      telegramUserId: telegramIds[0]!,
      encounterToken: "left-preview-token-13",
      inviteToken: "left-party-wrong-literal",
      originKind: "nyz-left-passage-party.v1",
      locationId: "PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT",
      now: NOW,
      joinUntilAt: new Date(NOW.getTime() + 3 * 60_000)
    })).resolves.toEqual({ state: "wrong-location" });
    await prisma.user.update({
      where: { telegramUserId: telegramIds[0]! },
      data: { currentAdventureId: "adventure.other" }
    });
    await expect(repository.createLeftPassagePartyForTelegramUser({
      telegramUserId: telegramIds[0]!,
      encounterToken: "left-preview-token-13",
      inviteToken: "left-party-active-adventure",
      originKind: "nyz-left-passage-party.v1",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now: NOW,
      joinUntilAt: new Date(NOW.getTime() + 3 * 60_000)
    })).resolves.toEqual({ state: "active-adventure" });
    await prisma.user.update({
      where: { telegramUserId: telegramIds[0]! },
      data: {
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT,
        currentRaidId: "raid.other"
      }
    });
    await expect(repository.createLeftPassagePartyForTelegramUser({
      telegramUserId: telegramIds[0]!,
      encounterToken: "left-preview-token-13",
      inviteToken: "left-party-active-raid",
      originKind: "nyz-left-passage-party.v1",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now: NOW,
      joinUntilAt: new Date(NOW.getTime() + 3 * 60_000)
    })).resolves.toEqual({ state: "active-raid" });
    await prisma.user.update({
      where: { telegramUserId: telegramIds[0]! },
      data: { currentRaidId: null }
    });
    await prisma.character.update({
      where: { id: leaderCharacterId },
      data: { manaCurrent: 15 }
    });
    await expect(repository.createLeftPassagePartyForTelegramUser({
      telegramUserId: telegramIds[0]!,
      encounterToken: "left-preview-token-13",
      inviteToken: "left-party-invalid-resources",
      originKind: "nyz-left-passage-party.v1",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now: NOW,
      joinUntilAt: new Date(NOW.getTime() + 3 * 60_000)
    })).resolves.toEqual({
      state: "active-search",
      availableAt: creationSearchEndsAt,
      now: NOW
    });
    await prisma.passageSearchAction.delete({ where: { token: "left-create-search-13" } });
    await expect(repository.createLeftPassagePartyForTelegramUser({
      telegramUserId: telegramIds[0]!,
      encounterToken: "left-preview-token-13",
      inviteToken: "left-party-invalid-resources",
      originKind: "nyz-left-passage-party.v1",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now: NOW,
      joinUntilAt: new Date(NOW.getTime() + 3 * 60_000)
    })).resolves.toEqual({
      state: "invalid-resources",
      resources: {
        hpCurrent: 28,
        hpMax: 28,
        manaCurrent: 15,
        manaMax: 14
      }
    });
    await prisma.character.update({
      where: { id: leaderCharacterId },
      data: { manaCurrent: 14 }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "left-party-existing-lease",
        characterId: leaderCharacterId,
        kind: "solo-combat",
        referenceId: "existing-solo-combat"
      }
    });
    await expect(repository.createLeftPassagePartyForTelegramUser({
      telegramUserId: telegramIds[0]!,
      encounterToken: "left-preview-token-13",
      inviteToken: "left-party-active-combat",
      originKind: "nyz-left-passage-party.v1",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now: NOW,
      joinUntilAt: new Date(NOW.getTime() + 3 * 60_000)
    })).resolves.toEqual({ state: "active-combat" });
    await prisma.activeCombatLease.delete({ where: { id: "left-party-existing-lease" } });
    await prisma.passageSearchAction.create({
      data: {
        token: "left-create-search-13",
        characterId: leaderCharacterId,
        nodeKey: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        nodeKind: "passage",
        status: "running",
        activeKey: `passage-search:${leaderCharacterId}`,
        startedAt: NOW,
        endsAt: creationSearchEndsAt,
        payloadJson: {}
      }
    });
    await expect(repository.createLeftPassagePartyForTelegramUser({
      telegramUserId: telegramIds[0]!,
      encounterToken: "left-preview-token-13",
      inviteToken: "left-party-blocked-13",
      originKind: "nyz-left-passage-party.v1",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now: NOW,
      joinUntilAt: new Date(NOW.getTime() + 3 * 60_000)
    })).resolves.toEqual({
      state: "active-search",
      availableAt: creationSearchEndsAt,
      now: NOW
    });
    await prisma.passageSearchAction.delete({ where: { token: "left-create-search-13" } });
    const created = await repository.createLeftPassagePartyForTelegramUser({
      telegramUserId: telegramIds[0]!,
      encounterToken: "left-preview-token-13",
      inviteToken: "left-party-invite-13",
      originKind: "nyz-left-passage-party.v1",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      now: NOW,
      joinUntilAt: new Date(NOW.getTime() + 3 * 60_000),
      chatId: telegramIds[0],
      messageId: 13
    });
    expect(created.state).toBe("created");
    if (!("session" in created)) {
      throw new Error("Expected a reserved left-passage party.");
    }
    expect(created.session.minimumParticipants).toBe(1);
    const secondCharacterId = `${token}-user-1-character`;
    const joined = await new PrismaPartySessionRepository(prisma).joinByTokenForTelegramUser(
      telegramIds[1]!,
      created.session.inviteToken,
      {
        now: new Date(NOW.getTime() + 1),
        joinSource: "deep-link",
        chatId: telegramIds[1],
        messageId: 23
      }
    );
    expect(joined.state).toBe("joined");
    if (!("session" in joined)) {
      throw new Error("Expected the canonical-preview participant to join.");
    }
    const transferredPartyVersion = joined.session.version + 1;
    await prisma.partySession.update({
      where: { id: created.session.id },
      data: {
        leaderCharacterId: secondCharacterId,
        activeLeaderKey: `party-leader:${secondCharacterId}`,
        version: { increment: 1 }
      }
    });
    const startSearchEndsAt = new Date(NOW.getTime() + 120_000);
    await prisma.passageSearchAction.create({
      data: {
        token: "left-start-search-13",
        characterId: secondCharacterId,
        nodeKey: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
        nodeKind: "passage",
        status: "running",
        activeKey: `passage-search:${secondCharacterId}`,
        startedAt: NOW,
        endsAt: startSearchEndsAt,
        payloadJson: {}
      }
    });
    await expect(repository.startLeftPassageForTelegramUser({
      telegramUserId: telegramIds[1]!,
      partyInviteToken: created.session.inviteToken,
      now: new Date(NOW.getTime() + 2),
      turnExpiresAt: new Date(NOW.getTime() + 23_002)
    })).resolves.toEqual({
      state: "active-search",
      availableAt: startSearchEndsAt,
      now: new Date(NOW.getTime() + 2),
      partyVersion: transferredPartyVersion
    });
    await prisma.passageSearchAction.delete({ where: { token: "left-start-search-13" } });
    const { value: started, count: productionStartQueries } = await measureQueryEvents(
      prisma,
      queries,
      () => repository.startLeftPassageForTelegramUser({
        telegramUserId: telegramIds[1]!,
        partyInviteToken: created.session.inviteToken,
        now: new Date(NOW.getTime() + 2),
        turnExpiresAt: new Date(NOW.getTime() + 23_002)
      })
    );
    console.log("Left-passage production start query events", productionStartQueries);
    expect(productionStartQueries).toBeLessThanOrEqual(42);
    expect(started.state).toBe("started");
    if (!("session" in started)) {
      throw new Error("Expected a started left-passage group combat.");
    }
    expect(started.session.state.rulesVersion).toBe("group-combat.v3");
    expect(started.session.state.production?.origin).toBe("nyz-left-passage-party.v1");
    expect(started.session.state.enemies).toHaveLength(2);
    expect(started.session.state.enemies[0]?.monsterId).toBe("monster.deadline-spider");
    expect(started.session.state.enemies.flatMap((enemy) => enemy.abilityIds ?? []).every(
      (abilityId) => GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS.includes(abilityId)
    )).toBe(true);
    const productionStateBytes = Buffer.byteLength(JSON.stringify(started.session.state), "utf8");
    console.log("Left-passage production state bytes", productionStateBytes, "/", GROUP_COMBAT_STATE_BYTE_LIMIT);
    expect(productionStateBytes).toBeLessThanOrEqual(GROUP_COMBAT_STATE_BYTE_LIMIT);
    await expect(prisma.pendingPassageEncounter.findUnique({
      where: { token: "left-preview-token-13" },
      select: { status: true, groupCombatSessionId: true }
    })).resolves.toEqual({
      status: "consumed",
      groupCombatSessionId: started.session.id
    });

    let session = started.session;
    while (session.status === "active") {
      const enemy = session.state.enemies.find((candidate) => candidate.hp > 0)!;
      for (const participant of session.state.participants.filter((candidate) => candidate.hp > 0)) {
        const result = await repository.submitActionForTelegramUser({
          telegramUserId: BigInt(participant.telegramUserId),
          partyInviteToken: session.partyInviteToken,
          turn: session.turn,
          action: "attack",
          targetKind: "enemy",
          targetId: enemy.id,
          now: new Date(NOW.getTime() + session.turn * 1000),
          nextTurnExpiresAt: new Date(NOW.getTime() + session.turn * 1000 + 23_000)
        });
        if ("session" in result) {
          session = result.session;
        }
        if (session.status !== "active") {
          break;
        }
      }
    }
    expect(session.settlementPlan?.policy).toBe("left-passage-party");
    const terminalCardBytes = Buffer.byteLength(
      presentGroupCombat(session, session.participants[0]!.characterId, NOW),
      "utf8"
    );
    console.log("Left-passage production terminal-card bytes", terminalCardBytes, "/4096");
    expect(terminalCardBytes).toBeLessThanOrEqual(4_096);
    expect(await prisma.activeCombatLease.count({
      where: { kind: "group-combat", referenceId: session.id }
    })).toBe(2);
    const before = await resourceSnapshot(prisma, telegramIds);
    for (const [index, participant] of session.participants.entries()) {
      const first = index === 0
        ? await measureQueryEvents(prisma, queries, () => repository.settleParticipant({
            sessionId: session.id,
            telegramUserId: participant.telegramUserId,
            now: new Date(NOW.getTime() + 93_000)
          })).then(({ value, count }) => {
            actualQueryCounts.settlement = count;
            expect(count).toBeLessThanOrEqual(QUERY_BUDGETS.settlement);
            return value;
          })
        : await repository.settleParticipant({
            sessionId: session.id,
            telegramUserId: participant.telegramUserId,
            now: new Date(NOW.getTime() + 93_000)
          });
      const replay = await repository.settleParticipant({
        sessionId: session.id,
        telegramUserId: participant.telegramUserId,
        now: new Date(NOW.getTime() + 94_000)
      });
      expect(first.state).toBe("settled");
      expect(replay.state).toBe("replayed");
    }
    const after = await resourceSnapshot(prisma, telegramIds);
    const plannedByCharacter = new Map(
      session.settlementPlan!.participants.map((participant) => [participant.characterId, participant])
    );
    for (const row of after) {
      const prior = before.find((candidate) => candidate.id === row.id)!;
      const planned = plannedByCharacter.get(row.id)!;
      expect(row.xp - prior.xp).toBe(planned.rewards.xp);
      expect(row.gold - prior.gold).toBe(planned.rewards.gold);
      expect(row.hpCurrent).toBe(planned.resources.hp);
      expect(row.manaCurrent).toBe(planned.resources.mana);
    }
    expect(await prisma.activeCombatLease.count({
      where: { kind: "group-combat", referenceId: session.id }
    })).toBe(0);
    const discoveryCooldowns = await prisma.characterCooldown.findMany({
      where: {
        characterId: {
          in: session.participants.map((participant) => participant.characterId)
        },
        key: LEFT_PASSAGE_TIER_TWO_DISCOVERY_COOLDOWN_KEY
      },
      orderBy: { characterId: "asc" }
    });
    const expectedDiscoveryAvailableAt = new Date(
      session.completedAt!.getTime() +
        getLeftPassageTierTwoDiscoveryMinutes(session.state.deterministicSeed) *
          60_000
    );
    expect(discoveryCooldowns.map((cooldown) => cooldown.availableAt)).toEqual(
      session.status === "won"
        ? [expectedDiscoveryAvailableAt, expectedDiscoveryAvailableAt]
        : []
    );
    expect(await prisma.activityEvent.count({
      where: { sourceId: session.id }
    })).toBe(session.status === "won" ? 1 : 0);
    expect(await prisma.dailyAction.count({
      where: {
        characterId: { in: session.participants.map((participant) => participant.characterId) },
        key: "milestone.level.4",
        localDate: "once"
      }
    })).toBe(2);
    const deliveryObservation = await measureQueryEvents(
      prisma,
      queries,
      () => repository.listPendingDeliverySessionIds(13)
    );
    actualQueryCounts.deliveryScan = deliveryObservation.count;
    expect(deliveryObservation.count).toBe(QUERY_BUDGETS.deliveryScan);
    const settlementObservation = await measureQueryEvents(
      prisma,
      queries,
      () => repository.listPendingSettlementParticipants(13)
    );
    actualQueryCounts.settlementScan = settlementObservation.count;
    expect(settlementObservation.count).toBe(QUERY_BUDGETS.settlementScan);
  });

  it("never lowers a character level raised before production settlement", async () => {
    const started = await startLeftPassageProduction(
      prisma,
      repository,
      "left-preserve-level",
      [11991n]
    );
    const terminal = await terminalizeProductionSession(prisma, started);
    const participant = terminal.participants[0]!;
    await prisma.character.update({
      where: { id: participant.characterId },
      data: { level: 7 }
    });

    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: participant.telegramUserId,
      now: new Date(NOW.getTime() + 93_000)
    })).resolves.toMatchObject({
      state: "settled",
      levelChange: {
        oldLevel: 7,
        newLevel: 7,
        leveledUp: false
      }
    });
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: participant.characterId },
      select: { level: true }
    })).resolves.toEqual({ level: 7 });
  });

  it.each([
    ["1x1", [11940n], 1, false],
    ["2x2", [11941n, 11942n], 2, false],
    ["3x3", [11951n, 11952n, 11953n], 3, false],
    ["3x6", [11801n, 11802n, 11803n], 6, true]
  ] as const)("freezes deterministic %s enemies across a same-reservation restart", async (
    label,
    telegramIds,
    expectedEnemyCount,
    strongParty
  ) => {
    const token = `left-deterministic-${label}`;
    const first = await startLeftPassageProduction(
      prisma,
      repository,
      token,
      [...telegramIds],
      strongParty
        ? {
            beforeStart: async (characterIds) => {
            await prisma.character.updateMany({
              where: { id: { in: characterIds } },
              data: { level: 7 }
            });
            }
          }
        : {}
    );
    expect(first.state.enemies).toHaveLength(expectedEnemyCount);
    const firstSnapshot = {
      deterministicSeed: first.state.deterministicSeed,
      enemies: first.state.enemies,
      production: first.state.production
    };
    await prisma.activeCombatLease.deleteMany({ where: { referenceId: first.id } });
    await prisma.groupCombatSession.delete({ where: { id: first.id } });
    await prisma.partySession.update({
      where: { id: `${token}-party` },
      data: { status: "recruiting", version: { increment: 1 } }
    });
    await prisma.pendingPassageEncounter.update({
      where: { id: `${token}-encounter` },
      data: {
        status: "reserved",
        groupCombatSessionId: null,
        consumedAt: null,
        version: { increment: 1 }
      }
    });

    const restarted = await repository.startLeftPassageForTelegramUser({
      telegramUserId: telegramIds[0],
      partyInviteToken: token,
      now: new Date(NOW.getTime() + 1),
      turnExpiresAt: new Date(NOW.getTime() + 23_001)
    });
    expect(restarted.state).toBe("started");
    if (restarted.state !== "started") {
      throw new Error("Expected restarted production combat.");
    }
    expect({
      deterministicSeed: restarted.session.state.deterministicSeed,
      enemies: restarted.session.state.enemies,
      production: restarted.session.state.production
    }).toEqual(firstSnapshot);
    if (label === "3x6") {
      const stateBytes = Buffer.byteLength(JSON.stringify(restarted.session.state), "utf8");
      const cardBytes = Buffer.byteLength(
        presentGroupCombat(
          restarted.session,
          restarted.session.participants[0]!.characterId,
          new Date(NOW.getTime() + 1)
        ),
        "utf8"
      );
      console.log(
        "Left-passage 3x6 initial budgets",
        { stateBytes, cardBytes },
        { state: GROUP_COMBAT_STATE_BYTE_LIMIT, card: 4_096 }
      );
      expect(stateBytes).toBeLessThanOrEqual(GROUP_COMBAT_STATE_BYTE_LIMIT);
      expect(cardBytes).toBeLessThanOrEqual(4_096);
    }
  });

  it.each([
    ["solo", [11821n]],
    ["duo", [11822n, 11823n]],
    ["trio", [11824n, 11825n, 11826n]]
  ] as const)("starts the %s left-passage roster before the timer when everyone is ready", async (
    _label,
    telegramIds
  ) => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      `left-ready-${telegramIds.length}`,
      [...telegramIds],
      { ready: true }
    );

    expect(session.status).toBe("active");
    expect(session.state.participants).toHaveLength(telegramIds.length);
    expect(session.turnExpiresAt).toEqual(new Date(NOW.getTime() + 23_000));
  });

  it("automatically starts an expired one-participant left-passage gathering", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-due-solo",
      [11811n],
      { due: true }
    );

    expect(session.state.participants).toHaveLength(1);
    expect(session.state.enemies).toHaveLength(1);
    expect(session.status).toBe("active");
    expect(session.partySessionId).toBe("left-due-solo-party");
  });

  it("derives pressure only from bounded canonical history in each frozen remort life", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-life-pressure",
      [11971n, 11972n],
      {
        remortCount: 1,
        beforeStart: async ([leaderId, secondId]) => {
          for (let index = 0; index < 3; index += 1) {
            await seedThreatHistory(prisma, {
              id: `left-life-pressure-old-${index}`,
              characterId: leaderId!,
              remortCount: 0,
              updatedAt: new Date(NOW.getTime() - index * 1000)
            });
            await seedThreatHistory(prisma, {
              id: `left-life-pressure-current-${index}`,
              characterId: secondId!,
              remortCount: 1,
              updatedAt: new Date(NOW.getTime() - index * 1000)
            });
          }
          await seedThreatHistory(prisma, {
            id: "left-life-pressure-legacy",
            characterId: leaderId!,
            remortCount: null,
            updatedAt: new Date(NOW.getTime() + 1000)
          });
        }
      }
    );

    const threat = session.state.production!.threat;
    expect(threat.participants[0]!.decision).toMatchObject({
      enemyCount: 1,
      eligibleWins: 0
    });
    expect(threat.participants[1]!.decision).toMatchObject({
      enemyCount: 2,
      eligibleWins: 2
    });
    expect(threat.sourceCharacterId).toBe(session.participants[1]!.characterId);
  });

  it("validates same life and every durable effect before completing participant settlement", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-settlement-life",
      [11961n, 11962n]
    );
    await terminalizeProductionSession(prisma, session);
    await prisma.characterRemort.create({
      data: {
        id: "left-settlement-life-remort",
        characterId: session.participants[0]!.characterId,
        token: "left-settlement-life-remort-token",
        remortNumber: 1,
        previousLevel: 3,
        previousXp: 42,
        previousGold: 93,
        displayNameSnapshot: "Попереднє життя",
        preservedPayloadJson: {}
      }
    });

    await expect(repository.settleParticipant({
      sessionId: session.id,
      telegramUserId: session.participants[0]!.telegramUserId,
      now: new Date(NOW.getTime() + 42_000)
    })).resolves.toEqual({ state: "invalid-plan" });
    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: session.id, characterId: session.participants[0]!.characterId },
      select: {
        settlementStatus: true,
        settlementAttempts: true,
        settlementReceiptJson: true,
        settledAt: true
      }
    })).resolves.toEqual({
      settlementStatus: "pending",
      settlementAttempts: 0,
      settlementReceiptJson: null,
      settledAt: null
    });
    expect(await prisma.activeCombatLease.count({
      where: { referenceId: session.id, characterId: session.participants[0]!.characterId }
    })).toBe(1);
  });

  it("durably fences active UI publication across restart, stale claim, settlement and newer combat ownership", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-ui-publication-fence",
      [11963n]
    );
    const participant = session.participants[0]!;
    const fingerprint = "[[\"⚔️ Атакувати\"],[\"🔎 Оновити\"]]";
    const claimedAt = new Date(NOW.getTime() + 100);
    await expect(repository.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: fingerprint,
      claimToken: "ui-publication-first",
      claimedAt,
      staleBefore: new Date(claimedAt.getTime() - 23_000)
    })).resolves.toEqual({
      state: "claimed",
      publishReplyKeyboard: true,
      keyboardGeneration: 0
    });

    const restarted = new PrismaGroupCombatRepository(prisma);
    await expect(restarted.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: fingerprint,
      claimToken: "ui-publication-restarted",
      claimedAt: new Date(claimedAt.getTime() + 1),
      staleBefore: new Date(claimedAt.getTime() - 23_000)
    })).resolves.toEqual({ state: "busy" });
    await expect(prisma.activeCombatLease.create({
      data: {
        id: "left-ui-publication-newer-solo",
        characterId: participant.characterId,
        kind: "solo-combat",
        referenceId: "newer-solo"
      }
    })).rejects.toMatchObject({ code: "P2002" });

    await expect(repository.acknowledgeParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      publishedKeyboardFingerprint: fingerprint,
      claimToken: "ui-publication-first"
    })).resolves.toBe("acknowledged");
    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: session.id, characterId: participant.characterId },
      select: {
        replyKeyboardFingerprint: true,
        replyKeyboardGeneration: true
      }
    })).resolves.toEqual({
      replyKeyboardFingerprint: fingerprint,
      replyKeyboardGeneration: 1
    });

    const secondClaimedAt = new Date(claimedAt.getTime() + 10);
    await expect(restarted.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: fingerprint,
      claimToken: "ui-publication-stale",
      claimedAt: secondClaimedAt,
      staleBefore: new Date(secondClaimedAt.getTime() - 23_000)
    })).resolves.toEqual({
      state: "claimed",
      publishReplyKeyboard: false,
      keyboardGeneration: 1
    });
    const otherSession = await startLeftPassageProduction(
      prisma,
      repository,
      "left-ui-publication-foreign-stale-claim",
      [21964n]
    );
    await prisma.groupCombatUiPublicationClaim.update({
      where: { characterId: participant.characterId },
      data: { sessionId: otherSession.id }
    });
    await expect(repository.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: fingerprint,
      claimToken: "ui-publication-takeover",
      claimedAt: new Date(secondClaimedAt.getTime() + 23_001),
      staleBefore: new Date(secondClaimedAt.getTime() + 1)
    })).resolves.toEqual({
      state: "claimed",
      publishReplyKeyboard: false,
      keyboardGeneration: 1
    });

    const terminal = await terminalizeProductionSession(prisma, session);
    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: participant.telegramUserId,
      now: new Date(secondClaimedAt.getTime() + 23)
    })).rejects.toThrow();
    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: terminal.id, characterId: participant.characterId },
      select: {
        settlementStatus: true,
        settlementAttempts: true,
        settlementReceiptJson: true
      }
    })).resolves.toEqual({
      settlementStatus: "pending",
      settlementAttempts: 0,
      settlementReceiptJson: null
    });
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toMatchObject({
      kind: "group-combat",
      referenceId: terminal.id
    });
    await expect(prisma.groupCombatUiPublicationClaim.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toMatchObject({
      sessionId: terminal.id,
      claimToken: "ui-publication-takeover"
    });

    await expect(repository.releaseParticipantUiPublicationClaim({
      sessionId: terminal.id,
      telegramUserId: participant.telegramUserId,
      claimToken: "ui-publication-takeover"
    })).resolves.toBe(true);
    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: participant.telegramUserId,
      now: new Date(secondClaimedAt.getTime() + 24)
    })).resolves.toMatchObject({ state: "settled" });
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toBeNull();
    await prisma.activeCombatLease.create({
      data: {
        id: "left-ui-publication-newer-solo",
        characterId: participant.characterId,
        kind: "solo-combat",
        referenceId: "newer-solo"
      }
    });
    await expect(repository.claimParticipantUiPublication({
      sessionId: terminal.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: terminal.deliveryRevision,
      keyboardFingerprint: "stale-group-keyboard",
      claimToken: "stale-group-worker",
      claimedAt: new Date(secondClaimedAt.getTime() + 25),
      staleBefore: new Date(secondClaimedAt.getTime() - 22_975)
    })).resolves.toEqual({ state: "not-found" });
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toMatchObject({
      kind: "solo-combat",
      referenceId: "newer-solo"
    });
    await expect(prisma.groupCombatUiPublicationClaim.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toBeNull();
  });

  it("acknowledges only a reply keyboard that was actually published", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-ui-keyboard-ack",
      [11966n]
    );
    const participant = session.participants[0]!;
    const fingerprint = "[[\"⚔️ Атакувати\"],[\"🔎 Оновити\"]]";
    const claimedAt = new Date(NOW.getTime() + 100);
    await expect(repository.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: fingerprint,
      claimToken: "no-keyboard-publication",
      claimedAt,
      staleBefore: new Date(claimedAt.getTime() - 23_000)
    })).resolves.toMatchObject({
      state: "claimed",
      publishReplyKeyboard: true
    });
    await expect(repository.renewParticipantUiPublicationClaim({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      claimToken: "no-keyboard-publication",
      claimedAt: new Date(claimedAt.getTime() + 13_000)
    })).resolves.toBe(true);
    await expect(repository.renewParticipantUiPublicationClaim({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      claimToken: "stale-worker",
      claimedAt: new Date(claimedAt.getTime() + 13_001)
    })).resolves.toBe(false);
    await expect(repository.acknowledgeParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      publishedKeyboardFingerprint: null,
      claimToken: "no-keyboard-publication"
    })).resolves.toBe("acknowledged");
    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: session.id, characterId: participant.characterId },
      select: {
        replyKeyboardFingerprint: true,
        replyKeyboardGeneration: true
      }
    })).resolves.toEqual({
      replyKeyboardFingerprint: null,
      replyKeyboardGeneration: 0
    });

    await expect(repository.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: fingerprint,
      claimToken: "private-keyboard-publication",
      claimedAt: new Date(claimedAt.getTime() + 13_002),
      staleBefore: new Date(claimedAt.getTime() - 9_998)
    })).resolves.toMatchObject({
      state: "claimed",
      publishReplyKeyboard: true,
      keyboardGeneration: 0
    });
    await expect(repository.compareAndSetParticipantCard({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedReferenceVersion: participant.referenceVersion,
      chatId: participant.telegramUserId,
      messageId: 93,
      publishedKeyboardFingerprint: fingerprint
    })).resolves.toBe(true);
    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: session.id, characterId: participant.characterId },
      select: {
        messageId: true,
        deliveredRevision: true,
        replyKeyboardFingerprint: true,
        replyKeyboardGeneration: true
      }
    })).resolves.toEqual({
      messageId: 93,
      deliveredRevision: 0,
      replyKeyboardFingerprint: fingerprint,
      replyKeyboardGeneration: 1
    });
    await expect(repository.acknowledgeParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      publishedKeyboardFingerprint: fingerprint,
      claimToken: "private-keyboard-publication"
    })).resolves.toBe("acknowledged");
    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: session.id, characterId: participant.characterId },
      select: {
        replyKeyboardFingerprint: true,
        replyKeyboardGeneration: true
      }
    })).resolves.toEqual({
      replyKeyboardFingerprint: fingerprint,
      replyKeyboardGeneration: 1
    });
    await prisma.activeCombatLease.deleteMany({
      where: { referenceId: session.id }
    });
    await prisma.groupCombatSession.delete({ where: { id: session.id } });
  });

  it("keeps an explicit participant refresh pending until a reply keyboard is durably acknowledged", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-ui-explicit-refresh",
      [91967n]
    );
    const participant = session.participants[0]!;
    const fingerprint = "[[\"⚔️ Атакувати\"],[\"🔎 Оновити\"]]";
    const claimedAt = new Date(NOW.getTime() + 100);
    await expect(repository.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: fingerprint,
      claimToken: "explicit-refresh-first",
      claimedAt,
      staleBefore: new Date(claimedAt.getTime() - 23_000)
    })).resolves.toMatchObject({ state: "claimed", publishReplyKeyboard: true });
    await expect(repository.compareAndSetParticipantCard({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedReferenceVersion: participant.referenceVersion,
      chatId: participant.telegramUserId,
      messageId: 93,
      publishedKeyboardFingerprint: fingerprint
    })).resolves.toBe(true);
    const claimed = (await repository.findById(session.id))!.participants[0]!;
    await expect(repository.markParticipantCardDelivered({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      expectedReferenceVersion: claimed.referenceVersion,
      chatId: claimed.chatId!,
      messageId: claimed.messageId!
    })).resolves.toBe(true);
    await expect(repository.acknowledgeParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      publishedKeyboardFingerprint: fingerprint,
      claimToken: "explicit-refresh-first"
    })).resolves.toBe("acknowledged");
    await expect(repository.finalizeDeliveryAttempt({
      sessionId: session.id,
      expectedDeliveryRevision: session.deliveryRevision,
      attemptedAt: new Date(claimedAt.getTime() + 1)
    })).resolves.toBe(true);
    expect(await repository.listPendingDeliverySessionIds(93)).not.toContain(session.id);

    await expect(repository.requestParticipantUiRefresh({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId
    })).resolves.toBe(true);
    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: session.id, characterId: participant.characterId },
      select: { replyKeyboardFingerprint: true }
    })).resolves.toEqual({ replyKeyboardFingerprint: null });
    expect(await repository.listPendingDeliverySessionIds(93)).toContain(session.id);

    await expect(repository.finalizeDeliveryAttempt({
      sessionId: session.id,
      expectedDeliveryRevision: session.deliveryRevision,
      attemptedAt: new Date(claimedAt.getTime() + 2)
    })).resolves.toBe(true);
    expect(await repository.listPendingDeliverySessionIds(93)).toContain(session.id);
    expect(await repository.listPendingDeliverySessionIds(
      93,
      new Date(claimedAt.getTime() + 1)
    )).not.toContain(session.id);
    expect(await repository.listPendingDeliverySessionIds(
      93,
      new Date(claimedAt.getTime() + 2)
    )).toContain(session.id);
    await expect(repository.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: fingerprint,
      claimToken: "explicit-refresh-retry",
      claimedAt: new Date(claimedAt.getTime() + 3),
      staleBefore: new Date(claimedAt.getTime() - 22_997)
    })).resolves.toMatchObject({ state: "claimed", publishReplyKeyboard: true });
    await expect(repository.releaseParticipantUiPublicationClaim({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      claimToken: "explicit-refresh-retry"
    })).resolves.toBe(true);
    await prisma.activeCombatLease.deleteMany({
      where: { referenceId: session.id }
    });
    await prisma.groupCombatSession.delete({ where: { id: session.id } });
  });

  it("makes a live active-publication claim win before a terminal turn and lets the terminal retry publish last", async () => {
    let session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-ui-terminal-barrier",
      [11964n],
      {
        beforeStart: async ([characterId]) => {
          await prisma.character.update({
            where: { id: characterId! },
            data: {
              hpCurrent: 587,
              hpMax: 587,
              statsJson: {
                strength: 93,
                dexterity: 23,
                intelligence: 7,
                charisma: 7,
                luck: 5
              }
            }
          });
        }
      }
    );
    const participant = session.participants[0]!;
    let nextWouldBeTerminal = false;
    for (let attempt = 0; attempt < 23 && !nextWouldBeTerminal; attempt += 1) {
      const enemy = session.state.enemies.find((candidate) => candidate.hp > 0)!;
      const action = {
        actorCharacterId: participant.characterId,
        turn: session.turn,
        action: "attack" as const,
        targetKind: "enemy" as const,
        targetId: enemy.id,
        origin: "manual" as const
      };
      nextWouldBeTerminal =
        resolveGroupCombatTurn(session.state, [action]).state.status !== "active";
      if (!nextWouldBeTerminal) {
        const progressed = await repository.submitActionForTelegramUser({
          telegramUserId: participant.telegramUserId,
          partyInviteToken: session.partyInviteToken,
          turn: session.turn,
          action: action.action,
          targetKind: action.targetKind,
          targetId: action.targetId,
          now: new Date(NOW.getTime() + attempt + 1),
          nextTurnExpiresAt: new Date(NOW.getTime() + attempt + 23_001)
        });
        if (!("session" in progressed)) {
          throw new Error("Expected the setup turn to resolve.");
        }
        session = progressed.session;
      }
    }
    expect(nextWouldBeTerminal).toBe(true);
    const enemy = session.state.enemies.find((candidate) => candidate.hp > 0)!;
    const claimedAt = new Date(NOW.getTime() + 100);
    await expect(repository.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: "terminal-barrier-keyboard",
      claimToken: "terminal-barrier-active",
      claimedAt,
      staleBefore: new Date(claimedAt.getTime() - 23_000)
    })).resolves.toMatchObject({ state: "claimed" });

    const terminalAttempt = repository.submitActionForTelegramUser({
      telegramUserId: participant.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "attack",
      targetKind: "enemy",
      targetId: enemy.id,
      now: new Date(claimedAt.getTime() + 1),
      nextTurnExpiresAt: new Date(claimedAt.getTime() + 23_001)
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await expect(repository.releaseParticipantUiPublicationClaim({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      claimToken: "terminal-barrier-active"
    })).resolves.toBe(true);
    const terminal = await terminalAttempt;
    expect(terminal).toMatchObject({ state: "terminal", session: { status: "won" } });
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toMatchObject({
      kind: "group-combat",
      referenceId: session.id
    });
    await expect(prisma.groupCombatUiPublicationClaim.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toMatchObject({
      sessionId: session.id,
      claimToken: `navigation:${session.id}`
    });
  });

  it("persists a final manual win before the UI fence and lets timeout adopt it after restart", async () => {
    const { session, participant, enemy } =
      await advanceLeftPassageToWinningManualAction(
        prisma,
        repository,
        "left-durable-final-action-restart",
        11968n
      );
    const resourcesBeforeAction = await resourceSnapshot(prisma, [
      participant.telegramUserId
    ]);
    const claimedAt = new Date(NOW.getTime() + 100);
    await expect(repository.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: "final-action-live-ui",
      claimToken: "final-action-live-ui",
      claimedAt,
      staleBefore: new Date(claimedAt.getTime() - 23_000)
    })).resolves.toMatchObject({ state: "claimed" });

    let interrupted = false;
    const interruptedRepository = new PrismaGroupCombatRepository(prisma, {
      afterActionPersisted(input) {
        if (input.readyToResolve) {
          interrupted = true;
          throw new Error("simulated-process-interruption-after-action");
        }
      }
    });
    const finalAction = {
      telegramUserId: participant.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "attack" as const,
      targetKind: "enemy" as const,
      targetId: enemy.id,
      now: new Date(claimedAt.getTime() + 1),
      nextTurnExpiresAt: new Date(claimedAt.getTime() + 23_001)
    };
    await expect(
      interruptedRepository.submitActionForTelegramUser(finalAction)
    ).rejects.toThrow("simulated-process-interruption-after-action");
    expect(interrupted).toBe(true);
    expect(await prisma.groupCombatAction.count({
      where: {
        sessionId: session.id,
        turn: session.turn,
        actorCharacterId: participant.characterId
      }
    })).toBe(1);
    expect(await resourceSnapshot(prisma, [participant.telegramUserId]))
      .toEqual(resourcesBeforeAction);
    await expect(repository.findById(session.id)).resolves.toMatchObject({
      status: "active",
      turn: session.turn
    });

    const restarted = new PrismaGroupCombatRepository(prisma);
    const busyDuplicates = await Promise.all([
      restarted.submitActionForTelegramUser({
        ...finalAction,
        now: new Date(claimedAt.getTime() + 2)
      }),
      restarted.submitActionForTelegramUser({
        ...finalAction,
        now: new Date(claimedAt.getTime() + 3)
      })
    ]);
    expect(busyDuplicates.map((result) => result.state)).toEqual([
      "duplicate",
      "duplicate"
    ]);
    expect(await prisma.groupCombatAction.count({
      where: { sessionId: session.id, turn: session.turn }
    })).toBe(1);

    await expect(repository.releaseParticipantUiPublicationClaim({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      claimToken: "final-action-live-ui"
    })).resolves.toBe(true);
    const terminal = await restarted.resolveTimedOutSession({
      sessionId: session.id,
      now: session.turnExpiresAt,
      nextTurnExpiresAt: new Date(session.turnExpiresAt.getTime() + 23_000)
    });
    expect(terminal).toMatchObject({
      state: "terminal",
      session: { status: "won" }
    });
    if (!("session" in terminal) || !terminal.session.settlementPlan) {
      throw new Error("Expected the adopted action to freeze settlement.");
    }
    const reward = terminal.session.settlementPlan.participants[0]!.rewards;
    const beforeSettlement = (
      await resourceSnapshot(prisma, [participant.telegramUserId])
    )[0]!;
    const firstSettlement = await restarted.settleParticipant({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      now: new Date(session.turnExpiresAt.getTime() + 1)
    });
    const replaySettlement = await restarted.settleParticipant({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      now: new Date(session.turnExpiresAt.getTime() + 2)
    });
    expect(firstSettlement.state).toBe("settled");
    expect(replaySettlement.state).toBe("replayed");
    const afterSettlement = (
      await resourceSnapshot(prisma, [participant.telegramUserId])
    )[0]!;
    expect(afterSettlement.xp - beforeSettlement.xp).toBe(reward.xp);
    expect(afterSettlement.gold - beforeSettlement.gold).toBe(reward.gold);
    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: session.id, characterId: participant.characterId },
      select: {
        settlementStatus: true,
        settlementAttempts: true,
        settlementReceiptJson: true,
        exitDeliveryState: true
      }
    })).resolves.toMatchObject({
      settlementStatus: "completed",
      settlementAttempts: 1,
      exitDeliveryState: "pending"
    });
    await expect(Promise.all([
      restarted.submitActionForTelegramUser({
        ...finalAction,
        now: new Date(session.turnExpiresAt.getTime() + 3)
      }),
      restarted.submitActionForTelegramUser({
        ...finalAction,
        now: new Date(session.turnExpiresAt.getTime() + 4)
      })
    ])).resolves.toEqual([
      expect.objectContaining({ state: "terminal" }),
      expect.objectContaining({ state: "terminal" })
    ]);
  });

  it("persists a successful personal flee before a live UI fence and resumes it once after restart", async () => {
    let session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-durable-flee-action-restart",
      [11969n],
      {
        beforeStart: async ([characterId]) => {
          await prisma.character.update({
            where: { id: characterId! },
            data: {
              hpCurrent: 587,
              hpMax: 587,
              statsJson: {
                strength: 7,
                dexterity: 93,
                intelligence: 7,
                charisma: 23,
                luck: 23
              }
            }
          });
        }
      }
    );
    const participant = session.participants[0]!;
    for (let attempt = 1; attempt <= 7; attempt += 1) {
      const predicted = resolveGroupCombatTurn(session.state, [{
        actorCharacterId: participant.characterId,
        turn: session.turn,
        action: "flee",
        targetKind: "self",
        targetId: participant.characterId,
        origin: "manual"
      }]);
      const willEscape =
        predicted.state.participants[0]!.fledAtTurn !== undefined;
      const actionInput = {
        telegramUserId: participant.telegramUserId,
        partyInviteToken: session.partyInviteToken,
        turn: session.turn,
        action: "flee" as const,
        targetKind: "self" as const,
        targetId: participant.characterId,
        now: new Date(NOW.getTime() + attempt * 100),
        nextTurnExpiresAt: new Date(NOW.getTime() + attempt * 100 + 23_000)
      };
      if (!willEscape) {
        const progressed =
          await repository.submitActionForTelegramUser(actionInput);
        if (!("session" in progressed)) {
          throw new Error("Expected the unsuccessful flee turn to resolve.");
        }
        session = progressed.session;
        continue;
      }

      const resourcesBefore = await resourceSnapshot(prisma, [
        participant.telegramUserId
      ]);
      const claimToken = "flee-action-live-ui";
      await expect(repository.claimParticipantUiPublication({
        sessionId: session.id,
        telegramUserId: participant.telegramUserId,
        expectedDeliveryRevision: session.deliveryRevision,
        keyboardFingerprint: "flee-action-live-ui",
        claimToken,
        claimedAt: new Date(actionInput.now.getTime() + 1),
        staleBefore: new Date(actionInput.now.getTime() - 22_999)
      })).resolves.toMatchObject({ state: "claimed" });
      const interruptedRepository = new PrismaGroupCombatRepository(prisma, {
        afterActionPersisted(input) {
          if (input.readyToResolve) {
            throw new Error("simulated-flee-process-interruption");
          }
        }
      });
      await expect(
        interruptedRepository.submitActionForTelegramUser(actionInput)
      ).rejects.toThrow("simulated-flee-process-interruption");
      expect(await resourceSnapshot(prisma, [participant.telegramUserId]))
        .toEqual(resourcesBefore);
      expect(await prisma.groupCombatAction.count({
        where: {
          sessionId: session.id,
          turn: session.turn,
          actorCharacterId: participant.characterId
        }
      })).toBe(1);

      const restarted = new PrismaGroupCombatRepository(prisma);
      await expect(restarted.submitActionForTelegramUser({
        ...actionInput,
        now: new Date(actionInput.now.getTime() + 2)
      })).resolves.toMatchObject({ state: "duplicate" });
      await expect(repository.releaseParticipantUiPublicationClaim({
        sessionId: session.id,
        telegramUserId: participant.telegramUserId,
        claimToken
      })).resolves.toBe(true);
      const resumed = await restarted.submitActionForTelegramUser({
        ...actionInput,
        now: new Date(actionInput.now.getTime() + 3)
      });
      expect(resumed.state).toMatch(/resolved|terminal/);
      if (!("session" in resumed)) {
        throw new Error("Expected the restarted flee action to resolve.");
      }
      const fled = resumed.session.state.participants.find(
        (actor) => actor.characterId === participant.characterId
      )!;
      expect(fled.fledAtTurn).toBe(actionInput.turn);
      await expect(prisma.character.findUniqueOrThrow({
        where: { id: participant.characterId },
        select: { hpCurrent: true, manaCurrent: true }
      })).resolves.toEqual({
        hpCurrent: fled.hp,
        manaCurrent: fled.mana
      });
      await expect(prisma.groupCombatParticipant.findFirstOrThrow({
        where: {
          sessionId: session.id,
          characterId: participant.characterId
        },
        select: {
          settlementStatus: true,
          settlementAttempts: true,
          settlementReceiptJson: true,
          exitDeliveryState: true
        }
      })).resolves.toMatchObject({
        settlementStatus: "completed",
        settlementAttempts: 1,
        exitDeliveryState: "pending"
      });
      await expect(prisma.activeCombatLease.findUnique({
        where: { characterId: participant.characterId }
      })).resolves.toBeNull();
      await expect(restarted.submitActionForTelegramUser({
        ...actionInput,
        now: new Date(actionInput.now.getTime() + 4)
      })).resolves.toMatchObject({ state: "terminal" });
      return;
    }
    throw new Error("Expected deterministic personal flee success.");
  });

  it("recovers a terminal timeout after restart when the dead publisher claim becomes stale", async () => {
    let session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-ui-timeout-restart",
      [11967n]
    );
    let terminalNext = false;
    for (let attempt = 0; attempt < 23 && !terminalNext; attempt += 1) {
      const action = buildGroupCombatTimeoutAction(
        session.state,
        session.participants[0]!.characterId
      );
      terminalNext =
        resolveGroupCombatTurn(session.state, [action]).state.status !== "active";
      if (!terminalNext) {
        const progressed = await repository.resolveTimedOutSession({
          sessionId: session.id,
          now: session.turnExpiresAt,
          nextTurnExpiresAt: new Date(session.turnExpiresAt.getTime() + 23_000)
        });
        if (!("session" in progressed)) {
          throw new Error("Expected the timeout setup turn to resolve.");
        }
        session = progressed.session;
      }
    }
    expect(terminalNext).toBe(true);
    const participant = session.participants[0]!;
    const deadClaimedAt = new Date(session.turnExpiresAt.getTime() - 22_700);
    await expect(repository.claimParticipantUiPublication({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      keyboardFingerprint: "timeout-dead-worker",
      claimToken: "timeout-dead-worker",
      claimedAt: deadClaimedAt,
      staleBefore: new Date(deadClaimedAt.getTime() - 23_000)
    })).resolves.toMatchObject({ state: "claimed" });

    const restarted = new PrismaGroupCombatRepository(prisma);
    const resolved = await restarted.resolveTimedOutSession({
      sessionId: session.id,
      now: session.turnExpiresAt,
      nextTurnExpiresAt: new Date(session.turnExpiresAt.getTime() + 23_000)
    });

    expect(resolved.state).toBe("terminal");
    if (!("session" in resolved)) {
      throw new Error("Expected the restarted timeout to return its terminal session.");
    }
    expect(resolved.session.status).not.toBe("active");
    await expect(prisma.groupCombatUiPublicationClaim.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toMatchObject({
      sessionId: session.id,
      claimToken: `navigation:${session.id}`
    });
    await prisma.activeCombatLease.deleteMany({
      where: { referenceId: session.id }
    });
    await prisma.groupCombatSession.delete({ where: { id: session.id } });
  });

  it("does not let an old state read overwrite a newer acknowledged turn keyboard", async () => {
    const oldRead = await startLeftPassageProduction(
      prisma,
      repository,
      "left-ui-newer-turn-barrier",
      [11965n]
    );
    const participant = oldRead.participants[0]!;
    const resolved = await repository.submitActionForTelegramUser({
      telegramUserId: participant.telegramUserId,
      partyInviteToken: oldRead.partyInviteToken,
      turn: oldRead.turn,
      action: "guard",
      targetKind: "self",
      targetId: participant.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_001)
    });
    if (!("session" in resolved) || resolved.session.status !== "active") {
      throw new Error("Expected the newer turn to remain active.");
    }
    const newer = resolved.session;
    expect(newer.deliveryRevision).toBeGreaterThan(oldRead.deliveryRevision);

    await expect(repository.claimParticipantUiPublication({
      sessionId: newer.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: newer.deliveryRevision,
      keyboardFingerprint: "newer-turn-keyboard",
      claimToken: "newer-turn-worker",
      claimedAt: new Date(NOW.getTime() + 2),
      staleBefore: new Date(NOW.getTime() - 22_998)
    })).resolves.toMatchObject({
      state: "claimed",
      publishReplyKeyboard: true
    });
    await expect(repository.acknowledgeParticipantUiPublication({
      sessionId: newer.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: newer.deliveryRevision,
      publishedKeyboardFingerprint: "newer-turn-keyboard",
      claimToken: "newer-turn-worker"
    })).resolves.toBe("acknowledged");

    await expect(repository.claimParticipantUiPublication({
      sessionId: oldRead.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: oldRead.deliveryRevision,
      keyboardFingerprint: "old-turn-keyboard",
      claimToken: "old-paused-worker",
      claimedAt: new Date(NOW.getTime() + 3),
      staleBefore: new Date(NOW.getTime() - 22_997)
    })).resolves.toEqual({ state: "stale" });
    await expect(repository.claimParticipantUiPublication({
      sessionId: newer.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: newer.deliveryRevision,
      keyboardFingerprint: "newer-turn-keyboard",
      claimToken: "old-paused-worker",
      claimedAt: new Date(NOW.getTime() + 4),
      staleBefore: new Date(NOW.getTime() - 22_996)
    })).resolves.toEqual({
      state: "claimed",
      publishReplyKeyboard: false,
      keyboardGeneration: 1
    });
    await expect(repository.acknowledgeParticipantUiPublication({
      sessionId: newer.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: newer.deliveryRevision,
      publishedKeyboardFingerprint: "newer-turn-keyboard",
      claimToken: "old-paused-worker"
    })).resolves.toBe("acknowledged");
    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: newer.id, characterId: participant.characterId },
      select: {
        replyKeyboardFingerprint: true,
        replyKeyboardGeneration: true
      }
    })).resolves.toEqual({
      replyKeyboardFingerprint: "newer-turn-keyboard",
      replyKeyboardGeneration: 1
    });
  });

  it.each([
    ["validated", 12101n],
    ["claimed", 12111n],
    ["resources", 12121n],
    ["items", 12131n],
    ["activity", 12141n],
    ["receipt", 12151n],
    ["lease", 12161n]
  ] as const)("rolls back a deterministic %s settlement failure without blocking another participant", async (stage, firstId) => {
    const token = `left-failure-${stage}`;
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      token,
      [firstId, firstId + 1n]
    );
    const terminal = await terminalizeProductionSession(prisma, session);
    const target = terminal.participants[0]!;
    const other = terminal.participants[1]!;
    const before = await resourceSnapshot(prisma, [target.telegramUserId, other.telegramUserId]);
    let injected = false;
    const failingRepository = new PrismaGroupCombatRepository(prisma, {
      afterStage: ({ stage: currentStage, characterId }) => {
        if (!injected && currentStage === stage && characterId === target.characterId) {
          injected = true;
          throw new Error(`injected-${stage}`);
        }
      }
    });

    await expect(failingRepository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: target.telegramUserId,
      now: new Date(NOW.getTime() + 50_000)
    })).rejects.toThrow(`injected-${stage}`);
    expect(injected).toBe(true);
    const failedRow = await prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: terminal.id, characterId: target.characterId }
    });
    expect(failedRow).toMatchObject({
      settlementStatus: "pending",
      settlementAttempts: 0,
      settlementReceiptJson: null,
      settledAt: null
    });
    expect(await resourceSnapshot(prisma, [target.telegramUserId, other.telegramUserId])).toEqual(before);
    expect(await prisma.activeCombatLease.count({
      where: { referenceId: terminal.id, characterId: target.characterId }
    })).toBe(1);

    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: other.telegramUserId,
      now: new Date(NOW.getTime() + 51_000)
    })).resolves.toMatchObject({ state: "settled" });
    expect(await prisma.activeCombatLease.count({
      where: { referenceId: terminal.id, characterId: other.characterId }
    })).toBe(0);

    const retried = await repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: target.telegramUserId,
      now: new Date(NOW.getTime() + 52_000)
    });
    expect(retried.state).toBe("settled");
    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: target.telegramUserId,
      now: new Date(NOW.getTime() + 53_000)
    })).resolves.toMatchObject({ state: "replayed" });
    const after = await resourceSnapshot(prisma, [target.telegramUserId, other.telegramUserId]);
    for (const row of after) {
      const prior = before.find((candidate) => candidate.id === row.id)!;
      const planned = terminal.settlementPlan!.participants.find((candidate) => candidate.characterId === row.id)!;
      expect(row.xp - prior.xp).toBe(planned.rewards.xp);
      expect(row.gold - prior.gold).toBe(planned.rewards.gold);
    }
    expect(await prisma.activityEvent.count({ where: { sourceId: terminal.id } })).toBe(1);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: terminal.id } })).toBe(0);
  });

  it("marks malformed production v3 for operator repair and retains every lease", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-operator-repair",
      [12931n, 12932n]
    );
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: { shape: "valid-json-but-not-recoverable" } }
    });
    const before = await resourceSnapshot(prisma, [12931n, 12932n]);

    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repairAt = new Date(NOW.getTime() + 93_000);
    await expect(repository.repairInvalidOrOrphaned(repairAt, 93)).resolves.toBeGreaterThanOrEqual(1);
    const repaired = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: true }
    });
    expect(repaired.rulesVersion).toBe("group-combat.v3");
    expect(repaired.repairState).toBe("operator-required");
    expect(repaired.repairReason).toContain("production state cannot be recovered safely");
    expect(repaired.participants.every((participant) =>
      participant.settlementStatus === "pending" &&
      participant.settlementAttempts === 0 &&
      participant.settlementReceiptJson === null
    )).toBe(true);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(2);
    expect(await resourceSnapshot(prisma, [12931n, 12932n])).toEqual(before);
    expect(await repository.listDueSessionIds(new Date(NOW.getTime() + 120_000), 93))
      .not.toContain(session.id);
    expect(await repository.listPendingDeliverySessionIds(93)).not.toContain(session.id);
    expect(await repository.listPendingSettlementParticipants(93)).not.toContainEqual(
      expect.objectContaining({ sessionId: session.id })
    );
    const card = session.participants[0]!;
    await expect(repository.compareAndSetParticipantCard({
      sessionId: session.id,
      telegramUserId: card.telegramUserId,
      expectedReferenceVersion: card.referenceVersion,
      chatId: card.telegramUserId,
      messageId: 587
    })).resolves.toBe(false);
    await expect(repository.releaseParticipantCard({
      sessionId: session.id,
      telegramUserId: card.telegramUserId,
      expectedReferenceVersion: card.referenceVersion,
      chatId: card.telegramUserId,
      messageId: card.messageId ?? 587
    })).resolves.toBe(false);
    await expect(repository.markParticipantCardDelivered({
      sessionId: session.id,
      telegramUserId: card.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      expectedReferenceVersion: card.referenceVersion,
      chatId: card.telegramUserId,
      messageId: card.messageId ?? 587
    })).resolves.toBe(false);
    await expect(repository.finalizeDeliveryAttempt({
      sessionId: session.id,
      expectedDeliveryRevision: session.deliveryRevision,
      attemptedAt: new Date(repairAt.getTime() + 1)
    })).resolves.toBe(false);
    await expect(repository.findByPartyInviteToken("left-operator-repair")).resolves.toBeNull();
    await expect(repository.findActiveByTelegramUserId(12931n)).resolves.toBeNull();
    await expect(repository.findById(session.id)).resolves.toBeNull();
    const inspected = await repository.inspectOperatorRepair(session.id);
    expect(inspected?.id).toBe(session.id);
    expect(inspected?.status).toBe("active");
    expect(inspected?.repairState).toBe("operator-required");
    expect(inspected?.repairReason).toContain("production state cannot be recovered safely");
    expect(inspected?.state).toEqual({ shape: "valid-json-but-not-recoverable" });
    expect(inspected?.participants.some(
      (participant) => participant.characterId === session.participants[0]!.characterId
    )).toBe(true);
    const quarantineSnapshot = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id }
    });
    const service = new GroupCombatService(
      repository,
      { enabled: true, devHelpersEnabled: false },
      () => new Date(repairAt.getTime() + 1)
    );
    const scheduler = createGroupCombatTimeoutScheduler({
      isEnabled: () => true,
      areDevHelpersEnabled: () => false,
      repair: (limit: number) => service.repair(limit),
      resolveDue: () => Promise.resolve([]),
      listPendingDelivery: () => Promise.resolve([])
    } as GroupCombatService, { api: {} } as never);
    await scheduler.tick();
    await scheduler.tick();
    expect(await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: session.id } }))
      .toEqual(quarantineSnapshot);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(2);
    expect(await resourceSnapshot(prisma, [12931n, 12932n])).toEqual(before);
    expect(diagnostic).toHaveBeenCalledTimes(1);
    diagnostic.mockRestore();
  });

  it("quarantines an out-of-roster packed v3 recap without releasing participant leases", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-packed-recap-operator-repair",
      [923401n, 923402n]
    );
    const corrupted = structuredClone(session.state);
    corrupted.recap = [{
      turn: 1,
      lines: ["Packed recap corruption fixture."],
      snapshot: {
        p: corrupted.participants.map((participant) => [
          participant.hp,
          participant.mana,
          null,
          null,
          null,
          null
        ]),
        e: corrupted.enemies.map((enemy) => [enemy.hp, null, null]),
        // guard, participant side, bit 5, two turns: roster has only two participants
        x: Buffer.from([0x02, 0x02]).toString("base64url")
      }
    }];
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: corrupted as unknown as Prisma.InputJsonValue }
    });
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repairAt = new Date(NOW.getTime() + 93_100);

    await expect(repository.repairInvalidOrOrphaned(repairAt, 93))
      .resolves.toBeGreaterThanOrEqual(1);
    const repaired = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id }
    });
    expect(repaired).toMatchObject({
      rulesVersion: "group-combat.v3",
      repairState: "operator-required"
    });
    expect(repaired.repairReason).toContain("production state cannot be recovered safely");
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } }))
      .toBe(2);
    expect(await repository.inspectOperatorRepair(session.id)).toMatchObject({
      id: session.id,
      repairState: "operator-required"
    });
    diagnostic.mockRestore();
  });

  it("quarantines a wrong-side packed v3 recap without releasing participant leases", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-wrong-side-recap-operator-repair",
      [923411n, 923412n]
    );
    const corrupted = structuredClone(session.state);
    corrupted.recap = [{
      turn: 1,
      lines: ["Wrong-side packed recap corruption fixture."],
      snapshot: {
        p: corrupted.participants.map((participant) => [
          participant.hp,
          participant.mana,
          null,
          null,
          null,
          null
        ]),
        e: corrupted.enemies.map((enemy) => [enemy.hp, null, null]),
        // guard, enemy side, first enemy, two turns: structurally valid but impossible
        x: "BBI"
      }
    }];
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: corrupted as unknown as Prisma.InputJsonValue }
    });
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repairAt = new Date(NOW.getTime() + 93_200);

    await expect(repository.repairInvalidOrOrphaned(repairAt, 93))
      .resolves.toBeGreaterThanOrEqual(1);
    const repaired = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id }
    });
    expect(repaired).toMatchObject({
      rulesVersion: "group-combat.v3",
      repairState: "operator-required"
    });
    expect(repaired.repairReason).toContain("production state cannot be recovered safely");
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } }))
      .toBe(2);
    expect(await repository.inspectOperatorRepair(session.id)).toMatchObject({
      id: session.id,
      repairState: "operator-required"
    });
    diagnostic.mockRestore();
  });

  it("hard-fences quarantined production state across action, timeout, settlement, delivery, and reads", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-quarantine-runtime-fence",
      [12935n, 12936n]
    );
    const actor = session.participants[0]!;
    await prisma.groupCombatAction.create({
      data: {
        sessionId: session.id,
        actorCharacterId: actor.characterId,
        turn: session.turn,
        actionKey: "guard",
        targetKind: "self",
        targetId: "foreign-character",
        origin: "manual",
        submittedAt: NOW
      }
    });
    const before = {
      version: session.version,
      resources: await resourceSnapshot(prisma, [12935n, 12936n]),
      actions: await prisma.groupCombatAction.findMany({ where: { sessionId: session.id } }),
      leases: await prisma.activeCombatLease.findMany({ where: { referenceId: session.id } })
    };
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repairAt = new Date(NOW.getTime() + 93_600);

    expect(await repository.repairInvalidOrOrphaned(repairAt, 13)).toBeGreaterThanOrEqual(1);
    const quarantined = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: true }
    });
    expect(quarantined).toMatchObject({
      repairState: "operator-required",
      version: before.version + 1
    });
    const card = session.participants[1]!;
    await expect(repository.submitActionForTelegramUser({
      telegramUserId: card.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "guard",
      targetKind: "self",
      targetId: card.characterId,
      now: new Date(repairAt.getTime() + 1),
      nextTurnExpiresAt: new Date(repairAt.getTime() + 23_001)
    })).resolves.toEqual({ state: "not-found" });
    await expect(repository.resolveTimedOutSession({
      sessionId: session.id,
      now: new Date(repairAt.getTime() + 1),
      nextTurnExpiresAt: new Date(repairAt.getTime() + 23_001)
    })).resolves.toEqual({ state: "not-found" });
    await expect(repository.settleParticipant({
      sessionId: session.id,
      telegramUserId: card.telegramUserId,
      now: new Date(repairAt.getTime() + 1)
    })).resolves.toEqual({ state: "not-found" });
    await expect(repository.findById(session.id)).resolves.toBeNull();
    await expect(repository.findByPartyInviteToken(session.partyInviteToken)).resolves.toBeNull();
    await expect(repository.compareAndSetParticipantCard({
      sessionId: session.id,
      telegramUserId: card.telegramUserId,
      expectedReferenceVersion: card.referenceVersion,
      chatId: card.telegramUserId,
      messageId: 587
    })).resolves.toBe(false);
    await expect(repository.markParticipantCardDelivered({
      sessionId: session.id,
      telegramUserId: card.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      expectedReferenceVersion: card.referenceVersion,
      chatId: card.telegramUserId,
      messageId: card.messageId ?? 587
    })).resolves.toBe(false);
    await expect(repository.finalizeDeliveryAttempt({
      sessionId: session.id,
      expectedDeliveryRevision: session.deliveryRevision,
      attemptedAt: new Date(repairAt.getTime() + 2)
    })).resolves.toBe(false);

    const after = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: true }
    });
    expect(after).toEqual(quarantined);
    expect(await resourceSnapshot(prisma, [12935n, 12936n])).toEqual(before.resources);
    expect(await prisma.groupCombatAction.findMany({ where: { sessionId: session.id } }))
      .toEqual(before.actions);
    expect(await prisma.activeCombatLease.findMany({ where: { referenceId: session.id } }))
      .toEqual(before.leases);
    expect(await prisma.activityEvent.count({ where: { sourceId: session.id } })).toBe(0);
    const inspection = await repository.inspectOperatorRepair(session.id);
    expect(inspection?.actions).toEqual([
      expect.objectContaining({
        actorCharacterId: actor.characterId,
        targetId: "foreign-character"
      })
    ]);
    expect(diagnostic).toHaveBeenCalledTimes(1);
    diagnostic.mockRestore();
  });

  it("makes quarantine the deterministic winner when stale runtime operations are held at a barrier", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-quarantine-race",
      [12937n, 12938n]
    );
    const actor = session.participants[0]!;
    await prisma.groupCombatAction.create({
      data: {
        sessionId: session.id,
        actorCharacterId: actor.characterId,
        turn: session.turn,
        actionKey: "guard",
        targetKind: "self",
        targetId: "foreign-character",
        origin: "manual",
        submittedAt: NOW
      }
    });
    let releaseRuntimeReads!: () => void;
    const runtimeReadGate = new Promise<void>((resolve) => {
      releaseRuntimeReads = resolve;
    });
    let releaseAllEntered!: () => void;
    const allEntered = new Promise<void>((resolve) => {
      releaseAllEntered = resolve;
    });
    let entered = 0;
    const racing = new PrismaGroupCombatRepository(prisma, {
      beforeRuntimeRead: async () => {
        entered += 1;
        if (entered === 4) {
          releaseAllEntered();
        }
        await runtimeReadGate;
      }
    });
    const second = session.participants[1]!;
    const action = racing.submitActionForTelegramUser({
      telegramUserId: second.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "guard",
      targetKind: "self",
      targetId: second.characterId,
      now: new Date(NOW.getTime() + 93_700),
      nextTurnExpiresAt: new Date(NOW.getTime() + 116_700)
    });
    const timeout = racing.resolveTimedOutSession({
      sessionId: session.id,
      now: new Date(NOW.getTime() + 93_700),
      nextTurnExpiresAt: new Date(NOW.getTime() + 116_700)
    });
    const settlement = racing.settleParticipant({
      sessionId: session.id,
      telegramUserId: second.telegramUserId,
      now: new Date(NOW.getTime() + 93_700)
    });
    const delivery = racing.finalizeDeliveryAttempt({
      sessionId: session.id,
      expectedDeliveryRevision: session.deliveryRevision,
      attemptedAt: new Date(NOW.getTime() + 93_700)
    });
    await allEntered;
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await repository.repairInvalidOrOrphaned(
      new Date(NOW.getTime() + 93_701),
      13
    )).toBeGreaterThanOrEqual(1);
    releaseRuntimeReads();

    await expect(action).resolves.toEqual({ state: "not-found" });
    await expect(timeout).resolves.toEqual({ state: "not-found" });
    await expect(settlement).resolves.toEqual({ state: "not-found" });
    await expect(delivery).resolves.toBe(false);
    await expect(racing.findById(session.id)).resolves.toBeNull();
    expect(await prisma.groupCombatAction.count({ where: { sessionId: session.id } })).toBe(1);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(2);
    expect(diagnostic).toHaveBeenCalledTimes(1);
    diagnostic.mockRestore();
  });

  it("allows an ordinary mutation winner, then fences every re-read after later quarantine", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-ordinary-before-quarantine",
      [12939n, 12940n]
    );
    const actor = session.participants[0]!;
    await expect(repository.submitActionForTelegramUser({
      telegramUserId: actor.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "guard",
      targetKind: "self",
      targetId: actor.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });
    const winner = await prisma.groupCombatAction.findFirstOrThrow({
      where: { sessionId: session.id, actorCharacterId: actor.characterId }
    });
    await prisma.groupCombatAction.update({
      where: { id: winner.id },
      data: { targetId: "foreign-character" }
    });
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await repository.repairInvalidOrOrphaned(
      new Date(NOW.getTime() + 93_800),
      13
    )).toBeGreaterThanOrEqual(1);
    await expect(repository.findById(session.id)).resolves.toBeNull();
    await expect(repository.submitActionForTelegramUser({
      telegramUserId: session.participants[1]!.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "guard",
      targetKind: "self",
      targetId: session.participants[1]!.characterId,
      now: new Date(NOW.getTime() + 93_801),
      nextTurnExpiresAt: new Date(NOW.getTime() + 116_801)
    })).resolves.toEqual({ state: "not-found" });
    expect(await prisma.groupCombatAction.findUnique({ where: { id: winner.id } }))
      .toMatchObject({ targetId: "foreign-character" });
    expect(diagnostic).toHaveBeenCalledTimes(1);
    diagnostic.mockRestore();
  });

  it("keeps a malformed terminal production row quarantined and explicitly inspectable", async () => {
    const started = await startLeftPassageProduction(
      prisma,
      repository,
      "left-terminal-operator-repair",
      [12933n, 12934n]
    );
    const terminal = await terminalizeProductionSession(prisma, started);
    await prisma.groupCombatSession.update({
      where: { id: terminal.id },
      data: {
        stateJson: { terminal: "unrecoverable" },
        settlementPlanJson: { plan: "unrecoverable" }
      }
    });
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(repository.repairInvalidOrOrphaned(
      new Date(NOW.getTime() + 93_500),
      93
    )).resolves.toBeGreaterThanOrEqual(1);

    const inspected = await repository.inspectOperatorRepair(terminal.id);
    expect(inspected?.id).toBe(terminal.id);
    expect(inspected?.status).toBe("won");
    expect(inspected?.repairState).toBe("operator-required");
    expect(inspected?.repairReason).toContain("production state cannot be recovered safely");
    expect(inspected?.state).toEqual({ terminal: "unrecoverable" });
    expect(inspected?.settlementPlan).toEqual({ plan: "unrecoverable" });
    expect(inspected?.participants.some((participant) => (
      participant.settlementStatus === "pending" &&
      participant.settlementAttempts === 0 &&
      participant.settlementReceipt === null
    ))).toBe(true);
    expect(await repository.listPendingDeliverySessionIds(93)).not.toContain(terminal.id);
    expect(await repository.listPendingSettlementParticipants(93)).not.toContainEqual(
      expect.objectContaining({ sessionId: terminal.id })
    );
    expect(await prisma.activeCombatLease.count({ where: { referenceId: terminal.id } })).toBe(2);
    expect(diagnostic).toHaveBeenCalledTimes(1);
    diagnostic.mockRestore();
  });

  it.each([
    ["reward", 12951n, (state: GroupCombatState) => {
      state.production!.rewards.winGoldTotal += 1;
    }],
    ["item", 12961n, (state: GroupCombatState) => {
      (state.production!.rewards as { lootVersion: number }).lootVersion = 2;
    }],
    ["difficulty", 12971n, (state: GroupCombatState) => {
      state.production!.remort.backupAdjustments[0]!.hpMaxAdded += 1;
    }]
  ] as const)("fails closed for shape-valid corrupted production %s snapshots", async (
    corruption,
    firstId,
    corrupt
  ) => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      `left-corrupt-${corruption}`,
      [firstId, firstId + 1n]
    );
    const state = structuredClone(session.state);
    corrupt(state);
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: state as unknown as Prisma.InputJsonValue }
    });
    const before = await resourceSnapshot(prisma, [firstId, firstId + 1n]);

    await expect(repository.repairInvalidOrOrphaned(
      new Date(NOW.getTime() + 93_000),
      93
    )).resolves.toBeGreaterThanOrEqual(1);
    await expect(prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { rulesVersion: true, repairState: true }
    })).resolves.toEqual({
      rulesVersion: "group-combat.v3",
      repairState: "operator-required"
    });
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(2);
    expect(await resourceSnapshot(prisma, [firstId, firstId + 1n])).toEqual(before);
  });

  it.each([
    ["active", "item-id", 830_100n],
    ["active", "quantity", 830_110n],
    ["terminal", "item-id", 830_120n],
    ["terminal", "quantity", 830_130n]
  ] as const)("rejects a shape-valid %s loot-v1 %s mutation against its immutable resolver", async (
    phase,
    mutation,
    firstId
  ) => {
    const started = await startLeftPassageProduction(
      prisma,
      repository,
      `left-loot-v1-${phase}-${mutation}`,
      [firstId, firstId + 1n]
    );
    const target = phase === "terminal"
      ? await terminalizeProductionSession(prisma, started)
      : started;
    const forged = structuredClone(target.state);
    const forgedRoll = forged.production!.rewards.lootSnapshot.enemies
      .flatMap((enemy) => enemy.participantRolls)
      .find((roll) => roll.items.length > 0);
    if (!forgedRoll) {
      throw new Error("Expected deterministic loot-v1 mutation fixture to contain one item.");
    }
    const forgedItem = forgedRoll.items[0]!;
    if (mutation === "item-id") {
      forgedItem.itemId = forgedItem.itemId === "item.iskrokamin"
        ? "item.responsible-panic-bandage"
        : "item.iskrokamin";
    } else {
      forgedItem.quantity += 1;
    }
    await prisma.groupCombatSession.update({
      where: { id: target.id },
      data: {
        stateJson: forged as unknown as Prisma.InputJsonValue,
        terminalIntegrityCheckedAt: null
      }
    });

    await expect(repository.findById(target.id)).rejects.toThrow(
      "Frozen loot-v1 output is not derivable from immutable v1 inputs."
    );
    if (phase === "terminal") {
      await expect(repository.settleParticipant({
        sessionId: target.id,
        telegramUserId: target.participants[0]!.telegramUserId,
        now: new Date(NOW.getTime() + 49_000)
      })).resolves.toEqual({ state: "invalid-plan" });
    }
  });

  it.each([
    ["active", 830_140n],
    ["terminal", 830_150n]
  ] as const)("rejects coherently forged legacy loot evidence and public checksums in %s state", async (
    phase,
    firstId
  ) => {
    const started = await startLeftPassageProduction(
      prisma,
      repository,
      `left-loot-v1-coherent-${phase}`,
      [firstId, firstId + 1n]
    );
    const target = phase === "terminal"
      ? await terminalizeProductionSession(prisma, started)
      : started;
    const forged = structuredClone(target.state);
    const forgedRoll = forged.production!.rewards.lootSnapshot.enemies
      .flatMap((enemy) => enemy.participantRolls)[0]!;
    const forgedEnemy = forged.enemies[0]!;
    const forgedParticipant = forged.participants[0]!;
    const selection = {
      itemId: "item.iskrokamin",
      rangeStart: 0,
      rangeEnd: 1_000_000_000
    };
    forgedRoll.items = [{
      itemId: "item.iskrokamin",
      quantity: 2
    }];
    Object.assign(forgedRoll, {
      evidence: {
        candidateCount: 1,
        selection,
        commitment: sha256Canonical({
          version: 1,
          encounterSeed: forged.production!.encounterSeed,
          partySessionId: forged.partySessionId,
          enemyOrder: forgedEnemy.order,
          monsterId: forgedEnemy.monsterId ?? forgedEnemy.id,
          characterId: forgedParticipant.characterId,
          luck: forgedParticipant.stats.luck,
          level: forgedParticipant.level,
          candidateCount: 1,
          selection
        })
      }
    });
    forged.production!.canonicalV1.enemies[0]!.hpMax += 1;
    forged.enemies[0]!.hpMax += 1;
    const canonicalV1 = structuredClone(forged.production!.canonicalV1) as
      typeof forged.production.canonicalV1 & { integrityDigest?: string };
    delete canonicalV1.integrityDigest;
    Object.assign(forged.production!.canonicalV1, {
      integrityDigest: sha256Canonical({
        version: 1,
        deterministicSeed: forged.deterministicSeed,
        participants: [...forged.participants]
          .sort((left, right) => left.rosterOrder - right.rosterOrder)
          .map((participant) => ({
            characterId: participant.characterId,
            remortCount: participant.remortCount,
            rosterOrder: participant.rosterOrder,
            classId: participant.classId,
            raceId: participant.raceId,
            level: participant.level,
            luck: participant.stats.luck
          })),
        production: {
          ...forged.production!,
          canonicalV1
        }
      })
    });
    await prisma.groupCombatSession.update({
      where: { id: target.id },
      data: {
        stateJson: forged as unknown as Prisma.InputJsonValue,
        terminalIntegrityCheckedAt: null
      }
    });

    await expect(repository.findById(target.id)).rejects.toThrow();
    if (phase === "terminal") {
      await expect(repository.settleParticipant({
        sessionId: target.id,
        telegramUserId: target.participants[0]!.telegramUserId,
        now: new Date(NOW.getTime() + 49_500)
      })).resolves.toEqual({ state: "invalid-plan" });
    }
  });

  it.each([
    ["active", "class-race-luck", 830_200n],
    ["terminal", "class-race-luck", 830_210n],
    ["active", "level-and-rewards", 830_220n],
    ["terminal", "level-and-rewards", 830_230n],
    ["active", "combat-stats", 830_240n],
    ["terminal", "combat-stats", 830_250n],
    ["active", "equipment-and-gear", 830_260n],
    ["terminal", "equipment-and-gear", 830_270n],
    ["active", "combat-item-quantity", 830_280n],
    ["terminal", "combat-item-quantity", 830_290n]
  ] as const)(
    "rejects coherent %s participant %s forgery against the relational freeze",
    async (phase, mutation, firstId) => {
      const started = await startLeftPassageProduction(
        prisma,
        repository,
        `left-participant-anchor-${phase}-${mutation}`,
        [firstId, firstId + 1n]
      );
      const target = phase === "terminal"
        ? await terminalizeProductionSession(prisma, started)
        : started;
      const forged = structuredClone(target.state);
      const actor = forged.participants[0]!;
      if (mutation === "class-race-luck") {
        actor.classId = "class.mage";
        actor.raceId = "race.elf";
        actor.stats.luck += 1;
      } else if (mutation === "level-and-rewards") {
        actor.level += 1;
      } else if (mutation === "combat-stats") {
        actor.attack += 1;
        actor.defense += 1;
        actor.support += 1;
      } else if (mutation === "equipment-and-gear") {
        actor.equipmentItemIds = ["item.forged-equipment"];
        actor.gearAbilityIds = ["gear.forged-ability"];
      } else {
        actor.combatItemQuantities["item.field-kit"] =
          (actor.combatItemQuantities["item.field-kit"] ?? 0) + 1;
      }
      rebuildCoherentProductionParticipantOutputs(forged);
      const settlementPlan = phase === "terminal"
        ? buildGroupCombatSettlementPlan(forged)
        : null;
      const result = settlementPlan
        ? {
            kind: settlementPlan.policy,
            outcome: settlementPlan.outcome,
            completedTurn: settlementPlan.completedTurn,
            rewards: sumGroupCombatSettlementRewards(
              settlementPlan.participants
            )
          }
        : null;
      await prisma.groupCombatSession.update({
        where: { id: target.id },
        data: {
          stateJson: forged as unknown as Prisma.InputJsonValue,
          ...(settlementPlan
            ? {
                settlementPlanJson:
                  settlementPlan as unknown as Prisma.InputJsonValue,
                resultJson: result as unknown as Prisma.InputJsonValue
              }
            : {})
        }
      });

      await expect(repository.findById(target.id)).rejects.toThrow(
        "Relational frozen participant does not match state."
      );
      if (phase === "terminal") {
        await expect(repository.settleParticipant({
          sessionId: target.id,
          telegramUserId: target.participants[0]!.telegramUserId,
          now: new Date(NOW.getTime() + 49_700)
        })).resolves.toEqual({ state: "invalid-plan" });
      }
    }
  );

  it("rebuilds a corrupted terminal result only from the canonical frozen production plan", async () => {
    const started = await startLeftPassageProduction(
      prisma,
      repository,
      "left-terminal-result-repair",
      [12941n, 12942n]
    );
    const terminal = await terminalizeProductionSession(prisma, started);
    await prisma.groupCombatSession.update({
      where: { id: terminal.id },
      data: {
        resultJson: {
          ...terminal.result!,
          rewards: {
            ...terminal.result!.rewards,
            xp: terminal.result!.rewards.xp + 1
          }
        }
      }
    });

    await expect(repository.findById(terminal.id)).rejects.toThrow(
      "Terminal group-combat result does not match state."
    );
    await expect(repository.repairInvalidOrOrphaned(
      new Date(NOW.getTime() + 94_000),
      93
    )).resolves.toBeGreaterThanOrEqual(1);
    const repaired = await repository.findById(terminal.id);
    expect(repaired?.result?.rewards).toEqual(
      sumGroupCombatSettlementRewards(repaired!.settlementPlan!.participants)
    );
    expect(await prisma.activeCombatLease.count({ where: { referenceId: terminal.id } })).toBe(2);
  });

  it("settles mixed manual and timeout participation with durable rewards only for the manual participant", async () => {
    const started = await startLeftPassageProduction(
      prisma,
      repository,
      "left-mixed-participation",
      [12981n, 12982n]
    );
    const manual = started.participants[0]!;
    const timeout = started.participants[1]!;
    const terminal = await terminalizeProductionSession(
      prisma,
      started,
      new Set([manual.characterId])
    );
    const before = await resourceSnapshot(prisma, [manual.telegramUserId, timeout.telegramUserId]);

    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: manual.telegramUserId,
      now: new Date(NOW.getTime() + 50_000)
    })).resolves.toMatchObject({ state: "settled" });
    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: timeout.telegramUserId,
      now: new Date(NOW.getTime() + 51_000)
    })).resolves.toMatchObject({ state: "settled" });

    const after = await resourceSnapshot(prisma, [manual.telegramUserId, timeout.telegramUserId]);
    const timeoutBefore = before.find((row) => row.id === timeout.characterId)!;
    const timeoutAfter = after.find((row) => row.id === timeout.characterId)!;
    expect(timeoutAfter).toMatchObject({
      xp: timeoutBefore.xp,
      gold: timeoutBefore.gold
    });
    expect(terminal.settlementPlan!.participants.find(
      (row) => row.characterId === timeout.characterId
    )!.rewards).toEqual({ xp: 0, gold: 0, items: [] });
    expect(await prisma.characterItem.count({ where: { characterId: timeout.characterId } })).toBe(0);
    expect(await prisma.activityEvent.count({
      where: { sourceId: terminal.id, actorCharacterId: timeout.characterId }
    })).toBe(0);
    expect(await prisma.activityEvent.count({
      where: { sourceId: terminal.id, actorCharacterId: manual.characterId }
    })).toBe(1);
    expect((await prisma.activityEvent.findUniqueOrThrow({
      where: { dedupeKey: `group-combat:${terminal.id}:activity` },
      select: { relatedCharacterIds: true, payloadJson: true }
    }))).toEqual({
      relatedCharacterIds: [manual.characterId],
      payloadJson: {
        participantCount: 1,
        outcome: "won"
      }
    });
    expect(await prisma.characterAchievement.count({
      where: {
        characterId: { in: [manual.characterId, timeout.characterId] },
        achievementId: "achievement.left-passage.party-attack.first"
      }
    })).toBe(0);
  });

  it("restarts and settles a terminal pending loot-v1 plan after unrelated loot catalog drift", async () => {
    const started = await startLeftPassageProduction(
      prisma,
      repository,
      "left-loot-v1-drift",
      [12983n, 12984n, 12985n]
    );
    const itemCatalog = [...items];
    const monsterCatalog = [...monsters];
    const abilityCatalog = [...monsterAbilities];
    const profileCatalog = [...monsterCombatProfiles];
    const lootCatalog = structuredClone(monsterLoot);

    try {
      items.splice(0, items.length);
      monsters.splice(0, monsters.length);
      (monsterAbilities as unknown as unknown[]).splice(
        0,
        monsterAbilities.length
      );
      (monsterCombatProfiles as unknown as unknown[]).splice(
        0,
        monsterCombatProfiles.length
      );
      for (const key of Object.keys(monsterLoot)) {
        delete monsterLoot[key];
      }
      const restarted = new PrismaGroupCombatRepository(prisma);
      const activeReloaded = await restarted.findById(started.id);
      expect(activeReloaded?.state.production).toEqual(started.state.production);
      const terminal = await terminalizeProductionSession(prisma, started);
      const expectedPlan = structuredClone(terminal.settlementPlan);
      const reloaded = await restarted.findById(terminal.id);

      expect(reloaded?.settlementPlan).toEqual(expectedPlan);
      for (const participant of terminal.participants) {
        await expect(restarted.settleParticipant({
          sessionId: terminal.id,
          telegramUserId: participant.telegramUserId,
          now: new Date(NOW.getTime() + 55_000 + participant.rosterOrder)
        })).resolves.toMatchObject({
          state: "settled",
          receipt: {
            characterId: participant.characterId,
            rewards: expectedPlan!.participants.find(
              (row) => row.characterId === participant.characterId
            )!.rewards
          }
        });
      }
    } finally {
      items.splice(0, items.length, ...itemCatalog);
      monsters.splice(0, monsters.length, ...monsterCatalog);
      (monsterAbilities as unknown as unknown[]).splice(
        0,
        monsterAbilities.length,
        ...abilityCatalog
      );
      (monsterCombatProfiles as unknown as unknown[]).splice(
        0,
        monsterCombatProfiles.length,
        ...profileCatalog
      );
      for (const key of Object.keys(monsterLoot)) {
        delete monsterLoot[key];
      }
      Object.assign(monsterLoot, lootCatalog);
    }
  });

  it.each([
    ["forged-item", 12986n],
    ["changed-recipient", 12988n],
    ["duplicate-item", 12990n]
  ] as const)("rejects terminal loot-v1 plan corruption for %s", async (kind, firstId) => {
    const started = await startLeftPassageProduction(
      prisma,
      repository,
      `left-loot-v1-${kind}`,
      [firstId, firstId + 1n]
    );
    const terminal = await terminalizeProductionSession(prisma, started);
    const plan = structuredClone(terminal.settlementPlan)!;
    if (kind === "forged-item") {
      plan.participants[0]!.rewards.items = [{
        itemId: "item.forged-future-reward",
        quantity: 1
      }];
    } else if (kind === "changed-recipient") {
      plan.participants[0]!.rewards.items = [
        ...plan.participants[0]!.rewards.items,
        { itemId: "item.iskrokamin", quantity: 1 }
      ];
      plan.participants[1]!.rewards.items = plan.participants[1]!.rewards.items.filter(
        (item) => item.itemId !== "item.iskrokamin"
      );
    } else {
      plan.participants[0]!.rewards.items = [
        { itemId: "item.iskrokamin", quantity: 1 },
        { itemId: "item.iskrokamin", quantity: 2 }
      ];
    }
    await prisma.groupCombatSession.update({
      where: { id: terminal.id },
      data: {
        settlementPlanJson: plan as unknown as Prisma.InputJsonValue,
        terminalIntegrityCheckedAt: null
      }
    });

    await expect(repository.findById(terminal.id)).rejects.toThrow();
    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: terminal.participants[0]!.telegramUserId,
      now: new Date(NOW.getTime() + 56_000)
    })).resolves.toEqual({ state: "invalid-plan" });
  });

  it.each([
    ["character id", 710_020n, (receipt: Record<string, unknown>) => ({
      ...receipt,
      characterId: "foreign-character"
    })],
    ["reward", 710_030n, (receipt: Record<string, unknown>) => ({
      ...receipt,
      rewards: {
        ...(receipt.rewards as Record<string, unknown>),
        xp: Number((receipt.rewards as Record<string, unknown>).xp) + 1
      }
    })],
    ["resource", 710_040n, (receipt: Record<string, unknown>) => ({
      ...receipt,
      resources: {
        ...(receipt.resources as Record<string, unknown>),
        hp: Number((receipt.resources as Record<string, unknown>).hp) + 1
      }
    })],
    ["activity key", 710_050n, (receipt: Record<string, unknown>) => ({
      ...receipt,
      effects: {
        ...(receipt.effects as Record<string, unknown>),
        activityKey: `${String((receipt.effects as Record<string, unknown>).activityKey)}:corrupt`
      }
    })]
  ] as const)(
    "quarantines a shape-valid %s receipt mutation while retaining durable evidence",
    async (
      label: string,
      firstId: bigint,
      mutateReceipt: (receipt: Record<string, unknown>) => Record<string, unknown>
    ) => {
      const started = await startLeftPassageProduction(
        prisma,
        repository,
        `left-receipt-integrity-${
          label === "character id"
            ? "character-id"
            : label === "activity key" ? "activity-key" : label
        }`,
        [firstId, firstId + 1n]
      );
      const terminal = await terminalizeProductionSession(prisma, started);
      const participant = terminal.participants[0]!;
      await expect(repository.settleParticipant({
        sessionId: terminal.id,
        telegramUserId: participant.telegramUserId,
        now: new Date(NOW.getTime() + 301_000)
      })).resolves.toMatchObject({ state: "settled" });
      const stored = await prisma.groupCombatParticipant.findFirstOrThrow({
        where: { sessionId: terminal.id, characterId: participant.characterId }
      });
      const corruptedReceipt = mutateReceipt(
        stored.settlementReceiptJson as Record<string, unknown>
      );
      await prisma.$transaction([
        prisma.groupCombatSession.update({
          where: { id: terminal.id },
          data: {
            terminalIntegrityCheckedAt: new Date(NOW.getTime() + 301_001),
            updatedAt: new Date(NOW.getTime() + 301_001)
          }
        }),
        prisma.groupCombatParticipant.update({
          where: { id: stored.id },
          data: {
            settlementReceiptJson: corruptedReceipt,
            updatedAt: new Date(NOW.getTime() + 301_002)
          }
        })
      ]);
      const resourcesBeforeRepair = await resourceSnapshot(
        prisma,
        terminal.participants.map((row) => row.telegramUserId)
      );
      const leasesBeforeRepair = await prisma.activeCombatLease.count({
        where: { referenceId: terminal.id }
      });
      const activitiesBeforeRepair = await prisma.activityEvent.count({
        where: { sourceId: terminal.id }
      });
      expect(await prisma.characterAchievement.count({
        where: {
          characterId: participant.characterId,
          achievementId: "achievement.left-passage.party-attack.first"
        }
      })).toBe(0);

      const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
      await expect(repository.repairInvalidOrOrphaned(
        new Date(NOW.getTime() + 301_003),
        13
      )).resolves.toBeGreaterThanOrEqual(1);
      const inspection = await repository.inspectOperatorRepair(terminal.id);
      expect(inspection?.repairState).toBe("operator-required");
      expect(inspection?.repairReason).toContain("already-completed participant");
      expect(inspection?.participants.find(
        (row) => row.characterId === participant.characterId
      )?.settlementReceipt).toEqual(corruptedReceipt);
      expect(await resourceSnapshot(
        prisma,
        terminal.participants.map((row) => row.telegramUserId)
      )).toEqual(resourcesBeforeRepair);
      expect(await prisma.activeCombatLease.count({
        where: { referenceId: terminal.id }
      })).toBe(leasesBeforeRepair);
      expect(await prisma.activityEvent.count({
        where: { sourceId: terminal.id }
      })).toBe(activitiesBeforeRepair);
      diagnostic.mockRestore();
    }
  );

  it("starts due parties from the authoritative post-scan roster and preserves current-leader manual authorization", async () => {
    await seedDueParty(prisma, "group-due-transfer", [1701n, 1702n, 1703n]);
    const staleTransferSnapshot = await prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "group-due-transfer" },
      include: { participants: { where: { status: "joined" } } }
    });
    expect(staleTransferSnapshot.leaderCharacterId).toBe("group-due-transfer-user-0-character");
    expect(staleTransferSnapshot.participants).toHaveLength(3);

    await prisma.$transaction([
      prisma.partyParticipant.update({
        where: { id: "group-due-transfer-participant-0" },
        data: { status: "left", leftAt: NOW, activeMembershipKey: null }
      }),
      prisma.partySession.update({
        where: { inviteToken: "group-due-transfer" },
        data: {
          leaderCharacterId: "group-due-transfer-user-1-character",
          activeLeaderKey: "party-leader:group-due-transfer-user-1-character",
          version: { increment: 1 }
        }
      })
    ]);

    const staleLeaderManualStart = await repository.startProofForTelegramUser({
      telegramUserId: 1701n,
      partyInviteToken: "group-due-transfer",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(staleLeaderManualStart.state).toBe("not-leader");

    const { value: transferred, count: dueStartQueries } = await measureQueryEvents(
      prisma,
      queries,
      () => repository.startDueProof({
        partyInviteToken: "group-due-transfer",
        now: NOW,
        turnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    );
    actualQueryCounts.dueStart = dueStartQueries;
    expect(transferred.state).toBe("started");
    expect(dueStartQueries).toBeLessThanOrEqual(QUERY_BUDGETS.dueStart);
    expect("session" in transferred
      ? transferred.session.participants.map((participant) => participant.telegramUserId)
      : []
    ).toEqual([1702n, 1703n]);

    await seedDueParty(prisma, "group-due-join", [1711n, 1712n, 1713n]);
    await prisma.partyParticipant.update({
      where: { id: "group-due-join-participant-2" },
      data: { status: "left", leftAt: NOW, activeMembershipKey: null }
    });
    const staleJoinSnapshot = await prisma.partySession.findUniqueOrThrow({
      where: { inviteToken: "group-due-join" },
      include: { participants: { where: { status: "joined" } } }
    });
    expect(staleJoinSnapshot.participants).toHaveLength(2);
    await prisma.partyParticipant.update({
      where: { id: "group-due-join-participant-2" },
      data: {
        status: "joined",
        leftAt: null,
        joinedAt: new Date(NOW.getTime() + 42),
        activeMembershipKey: "party-member:group-due-join-user-2-character"
      }
    });
    await prisma.partySession.update({
      where: { inviteToken: "group-due-join" },
      data: { version: { increment: 1 } }
    });

    const joined = await repository.startDueProof({
      partyInviteToken: "group-due-join",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(joined.state).toBe("started");
    expect("session" in joined ? joined.session.participants : []).toHaveLength(3);

    await seedDueParty(prisma, "group-due-undersized", [1721n, 1722n]);
    await prisma.partyParticipant.update({
      where: { id: "group-due-undersized-participant-1" },
      data: { status: "left", leftAt: NOW, activeMembershipKey: null }
    });
    await prisma.partySession.update({
      where: { inviteToken: "group-due-undersized" },
      data: { version: { increment: 1 } }
    });
    await expect(repository.startDueProof({
      partyInviteToken: "group-due-undersized",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toEqual({ state: "invalid-size", partyVersion: 2 });
    expect(await prisma.groupCombatSession.count({
      where: { partySession: { inviteToken: "group-due-undersized" } }
    })).toBe(0);

    await seedDueParty(prisma, "group-manual-current-leader", [1741n, 1742n, 1743n]);
    await prisma.$transaction([
      prisma.partyParticipant.update({
        where: { id: "group-manual-current-leader-participant-0" },
        data: { status: "left", leftAt: NOW, activeMembershipKey: null }
      }),
      prisma.partySession.update({
        where: { inviteToken: "group-manual-current-leader" },
        data: {
          leaderCharacterId: "group-manual-current-leader-user-1-character",
          activeLeaderKey: "party-leader:group-manual-current-leader-user-1-character",
          version: { increment: 1 }
        }
      })
    ]);
    const currentLeaderManualStart = await repository.startProofForTelegramUser({
      telegramUserId: 1742n,
      partyInviteToken: "group-manual-current-leader",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(currentLeaderManualStart.state).toBe("started");
  });

  it("creates exactly one combat when due and current-leader starts race", async () => {
    await seedDueParty(prisma, "group-due-race", [1731n, 1732n]);
    const turnExpiresAt = new Date(NOW.getTime() + 23_000);
    const results = await Promise.all([
      repository.startDueProof({
        partyInviteToken: "group-due-race",
        now: NOW,
        turnExpiresAt
      }),
      repository.startProofForTelegramUser({
        telegramUserId: 1731n,
        partyInviteToken: "group-due-race",
        now: NOW,
        turnExpiresAt
      })
    ]);

    expect(results.filter((result) => result.state === "started")).toHaveLength(1);
    expect(results.every((result) => "session" in result || result.state === "blocked")).toBe(true);
    expect(await prisma.groupCombatSession.count({
      where: { partySession: { inviteToken: "group-due-race" } }
    })).toBe(1);
  });

  it("rejects wrong-side targets, replaces a queued choice, then resolves a duplicate last-action race once", async () => {
    const session = await repository.findByPartyInviteToken("group-start");
    expect(session).not.toBeNull();
    const initial = session!;
    const leader = initial.participants[0]!;
    const joiner = initial.participants[1]!;

    const beforeActions = await prisma.groupCombatAction.count();
    const invalid = await repository.submitActionForTelegramUser({
      telegramUserId: leader.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: initial.turn,
      action: "attack",
      targetKind: "ally",
      targetId: joiner.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(invalid.state).toBe("invalid-target");
    expect(await prisma.groupCombatAction.count()).toBe(beforeActions);

    const { value: queued, count: queueQueries } = await measureQueryEvents(prisma, queries, () => (
      repository.submitActionForTelegramUser({
        telegramUserId: leader.telegramUserId,
        partyInviteToken: initial.partyInviteToken,
        turn: initial.turn,
        action: "attack",
        targetKind: "enemy",
        targetId: initial.state.enemies[0]!.id,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    ));
    actualQueryCounts.queue = queueQueries;
    expect(queued.state).toBe("queued");
    expect(queueQueries).toBeLessThanOrEqual(QUERY_BUDGETS.queue);
    expect("session" in queued ? queued.session.version : null).toBe(initial.version + 1);
    expect("session" in queued ? queued.session.deliveryRevision : null).toBe(initial.deliveryRevision + 1);
    expect("session" in queued ? queued.session.deliveryPending : null).toBe(true);

    const replaced = await repository.submitActionForTelegramUser({
      telegramUserId: leader.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: initial.turn,
      action: "guard",
      targetKind: "self",
      targetId: leader.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(replaced.state).toBe("replaced");
    expect("session" in replaced ? replaced.session.version : null).toBe(initial.version + 2);
    expect("session" in replaced ? replaced.session.deliveryRevision : null).toBe(initial.deliveryRevision + 2);
    expect(await prisma.groupCombatAction.findFirst({
      where: { sessionId: initial.id, turn: initial.turn, actorCharacterId: leader.characterId },
      select: { actionKey: true, targetKind: true, targetId: true }
    })).toEqual({ actionKey: "guard", targetKind: "self", targetId: leader.characterId });

    const duplicateReplacement = await repository.submitActionForTelegramUser({
      telegramUserId: leader.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: initial.turn,
      action: "guard",
      targetKind: "self",
      targetId: leader.characterId,
      now: new Date(NOW.getTime() + 2),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(duplicateReplacement.state).toBe("duplicate");
    expect("session" in duplicateReplacement ? duplicateReplacement.session.deliveryRevision : null)
      .toBe(initial.deliveryRevision + 2);

    const submitLast = () => repository.submitActionForTelegramUser({
      telegramUserId: joiner.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: initial.turn,
      action: "guard" as const,
      targetKind: "self" as const,
      targetId: joiner.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const { value: results, count: concurrentPairQueries } = await measureQueryEvents(
      prisma,
      queries,
      () => Promise.all([submitLast(), submitLast()])
    );
    actualQueryCounts.concurrentPair = concurrentPairQueries;
    const latest = await repository.findByPartyInviteToken("group-start");

    expect(results.some((result) => result.state === "resolved")).toBe(true);
    expect(latest?.turn).toBe(2);
    expect(await prisma.groupCombatAction.count({ where: { sessionId: initial.id, turn: 1 } })).toBe(2);
    expect(concurrentPairQueries).toBeLessThanOrEqual(QUERY_BUDGETS.singleResolve * 2);

    const stale = await repository.submitActionForTelegramUser({
      telegramUserId: leader.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: leader.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(stale.state).toBe("stale");
  });

  it("persists one participant's flee roll across repository restart and resolves it once", async () => {
    const session = await startProof(
      prisma,
      repository,
      "group-independent-retreat",
      [58721n, 58722n]
    );
    const first = session.participants[0]!;
    const second = session.participants[1]!;
    await expect(repository.submitActionForTelegramUser({
      telegramUserId: first.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "flee",
      targetKind: "self",
      targetId: first.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });

    const restarted = new PrismaGroupCombatRepository(prisma);
    await expect(restarted.findByPartyInviteToken(session.partyInviteToken))
      .resolves.toMatchObject({
        queuedActions: [
          expect.objectContaining({
            actorCharacterId: first.characterId,
            action: "flee",
            targetKind: "self",
            targetId: first.characterId
          })
        ]
      });
    const expected = resolveGroupCombatTurn(session.state, [
      {
        actorCharacterId: first.characterId,
        turn: session.turn,
        action: "flee",
        targetKind: "self",
        targetId: first.characterId,
        origin: "manual"
      },
      {
        actorCharacterId: second.characterId,
        turn: session.turn,
        action: "guard",
        targetKind: "self",
        targetId: second.characterId,
        origin: "manual"
      }
    ]);
    const resolved = await restarted.submitActionForTelegramUser({
      telegramUserId: second.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "guard",
      targetKind: "self",
      targetId: second.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_001)
    });

    expect(resolved.state).toBe("resolved");
    if (!("session" in resolved)) {
      throw new Error("Expected the resolving flee turn to return its session.");
    }
    expect(resolved.session.status).toBe(expected.state.status);
    expect(resolved.session.state.status).toBe(expected.state.status);
    expect(resolved.session.state.recap).toEqual(expected.state.recap);
    const persistedFirst = resolved.session.state.participants.find(
      (participant) => participant.characterId === first.characterId
    );
    expect(persistedFirst?.fleeAttempts).toBe(1);
    expect(persistedFirst?.fledAtTurn).toBe(expected.state.participants[0]!.fledAtTurn);
    const firstActiveSession = await restarted.findActiveByTelegramUserId(first.telegramUserId);
    if (expected.state.participants[0]!.fledAtTurn === undefined) {
      expect(firstActiveSession).toMatchObject({ id: session.id });
    } else {
      expect(firstActiveSession).toBeNull();
    }
    expect(await prisma.groupCombatAction.count({
      where: { sessionId: session.id, turn: session.turn }
    })).toBe(2);
  });

  it("keeps a knocked-out participant leased while a living ally continues the production fight", async () => {
    const telegramIds = [58723n, 58724n];
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-knocked-out-lease",
      telegramIds,
      {
        beforeStart: async (characterIds) => {
          await prisma.character.updateMany({
            where: { id: { in: characterIds } },
            data: {
              hpCurrent: 587,
              hpMax: 587,
              statsJson: {
                strength: 93,
                dexterity: 93,
                intelligence: 23,
                charisma: 23,
                luck: 23
              }
            }
          });
        }
      }
    );
    const knockedOut = session.participants[0]!;
    const survivor = session.participants[1]!;
    const stateWithKnockout = structuredClone(session.state);
    stateWithKnockout.participants[0]!.hp = 0;
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: stateWithKnockout as unknown as Prisma.InputJsonValue }
    });

    const resolved = await repository.submitActionForTelegramUser({
      telegramUserId: survivor.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "guard",
      targetKind: "self",
      targetId: survivor.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(resolved).toMatchObject({
      state: "resolved",
      session: {
        status: "active"
      }
    });
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: knockedOut.characterId }
    })).resolves.toMatchObject({
      kind: "group-combat",
      referenceId: session.id
    });
    await repository.repairInvalidOrOrphaned(new Date(NOW.getTime() + 1), 13);
    await expect(repository.findActiveByTelegramUserId(knockedOut.telegramUserId))
      .resolves.toMatchObject({ id: session.id });
    await expect(prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { repairState: true, repairReason: true }
    })).resolves.toEqual({ repairState: null, repairReason: null });
  });

  it("atomically adopts and reopens the newest completed terminal result card", async () => {
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-terminal-result-card",
      [58725n, 58726n]
    );
    const participant = session.participants[0]!;
    const claimToken = "terminal-result-claim";
    await prisma.groupCombatParticipant.updateMany({
      where: {
        sessionId: session.id,
        characterId: participant.characterId
      },
      data: {
        exitDeliveryState: "menu-delivered",
        exitDeliveryClaimToken: claimToken,
        exitDeliveryClaimedAt: NOW
      }
    });

    await expect(repository.adoptParticipantFleeExitTerminalCard({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      claimToken,
      expectedReferenceVersion: participant.referenceVersion,
      chatId: participant.chatId,
      messageId: participant.messageId,
      terminalCard: {
        chatId: participant.telegramUserId,
        messageId: 93,
        deliveryRevision: session.deliveryRevision
      }
    })).resolves.toBe(false);

    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { status: "won" }
    });
    await prisma.groupCombatParticipant.updateMany({
      where: {
        sessionId: session.id,
        characterId: participant.characterId
      },
      data: { settlementStatus: "completed" }
    });
    await prisma.activeCombatLease.update({
      where: { characterId: participant.characterId },
      data: {
        kind: "group-combat-exit-navigation",
        referenceId: `${session.id}:${participant.characterId}`
      }
    });
    await expect(repository.adoptParticipantFleeExitTerminalCard({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      claimToken,
      expectedReferenceVersion: participant.referenceVersion,
      chatId: participant.chatId,
      messageId: participant.messageId,
      terminalCard: {
        chatId: participant.telegramUserId,
        messageId: 93,
        deliveryRevision: session.deliveryRevision
      }
    })).resolves.toBe(true);
    await expect(repository.completeParticipantFleeExitDelivery({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      claimToken,
      expectedReferenceVersion: participant.referenceVersion + 1,
      chatId: participant.telegramUserId,
      messageId: 93,
      retainReference: true
    })).resolves.toBe(true);

    await expect(repository.replaceCompletedParticipantTerminalCard({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      expectedReferenceVersion: participant.referenceVersion + 2,
      previousChatId: participant.telegramUserId,
      previousMessageId: 93,
      terminalCard: {
        chatId: participant.telegramUserId,
        messageId: 94
      }
    })).resolves.toBe(true);
    await expect(repository.replaceCompletedParticipantTerminalCard({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: session.deliveryRevision,
      expectedReferenceVersion: participant.referenceVersion + 2,
      previousChatId: participant.telegramUserId,
      previousMessageId: 93,
      terminalCard: {
        chatId: participant.telegramUserId,
        messageId: 95
      }
    })).resolves.toBe(false);

    await expect(prisma.groupCombatParticipant.findFirstOrThrow({
      where: {
        sessionId: session.id,
        characterId: participant.characterId
      },
      select: {
        exitDeliveryState: true,
        chatId: true,
        messageId: true,
        referenceVersion: true,
        deliveredRevision: true
      }
    })).resolves.toEqual({
      exitDeliveryState: "completed",
      chatId: participant.telegramUserId,
      messageId: 94,
      referenceVersion: participant.referenceVersion + 3,
      deliveredRevision: session.deliveryRevision
    });
  });

  it("keeps a claimed terminal menu canonical while repair runs between send and completion", async () => {
    const started = await startLeftPassageProduction(
      prisma,
      repository,
      "left-terminal-menu-repair-race",
      [58727n]
    );
    const terminal = await terminalizeProductionSession(prisma, started);
    const participant = terminal.participants[0]!;
    const claimToken = "terminal-menu-repair-claim";

    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: participant.telegramUserId,
      now: new Date(NOW.getTime() + 1)
    })).resolves.toMatchObject({ state: "settled" });
    await expect(repository.claimParticipantFleeExitDelivery({
      sessionId: terminal.id,
      telegramUserId: participant.telegramUserId,
      claimToken,
      claimedAt: new Date(NOW.getTime() + 2),
      staleBefore: new Date(NOW.getTime() - 23_000)
    })).resolves.toMatchObject({ state: "claimed", menuDelivered: false });
    await expect(repository.markParticipantFleeExitMenuDelivered({
      sessionId: terminal.id,
      telegramUserId: participant.telegramUserId,
      claimToken,
      messageId: 93
    })).resolves.toBe(true);

    const beforeRepair = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: terminal.id },
      select: { status: true, stateJson: true }
    });
    expect({
      row: beforeRepair.status,
      state: (beforeRepair.stateJson as { status?: unknown }).status
    }).toEqual({ row: "won", state: "won" });

    await repository.repairInvalidOrOrphaned(
      new Date(NOW.getTime() + 3),
      13
    );
    await expect(prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: terminal.id },
      select: { repairState: true, repairReason: true }
    })).resolves.toEqual({ repairState: null, repairReason: null });
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toMatchObject({
      kind: "group-combat-exit-navigation",
      referenceId: `${terminal.id}:${participant.characterId}`
    });

    const stored = await prisma.groupCombatParticipant.findFirstOrThrow({
      where: {
        sessionId: terminal.id,
        characterId: participant.characterId
      }
    });
    await expect(repository.completeParticipantFleeExitDelivery({
      sessionId: terminal.id,
      telegramUserId: participant.telegramUserId,
      claimToken,
      expectedReferenceVersion: stored.referenceVersion,
      chatId: stored.chatId,
      messageId: stored.messageId,
      retainReference: true
    })).resolves.toBe(true);
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: participant.characterId }
    })).resolves.toBeNull();
  });

  it("commits one production escape durably while the other two participants continue and settle", async () => {
    const telegramIds = [58731n, 58732n, 58733n];
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      "left-durable-independent-retreat",
      telegramIds,
      {
        beforeStart: async (characterIds) => {
          await prisma.character.updateMany({
            where: { id: { in: characterIds } },
            data: {
              hpCurrent: 587,
              hpMax: 587,
              manaCurrent: 93,
              manaMax: 93,
              statsJson: {
                strength: 93,
                dexterity: 93,
                intelligence: 7,
                charisma: 7,
                luck: 5
              }
            }
          });
          const sated = makeSatedPayload(characterIds[0]!, new Date(NOW.getTime() - 60_000));
          await prisma.characterCooldown.create({
            data: {
              characterId: characterIds[0]!,
              key: VARENYK_SATED_STATUS_KEY,
              availableAt: new Date(sated.availableAt),
              resultJson: sated
            }
          });
        }
      }
    );
    const escapee = session.participants[0]!;
    const remaining = session.participants.slice(1);
    let current = session;
    for (let attempt = 1; attempt <= 7; attempt += 1) {
      const predicted = resolveGroupCombatTurn(current.state, [
        {
          actorCharacterId: escapee.characterId,
          turn: current.turn,
          action: "flee",
          targetKind: "self",
          targetId: escapee.characterId,
          origin: "manual"
        },
        ...remaining.map((participant) => ({
          actorCharacterId: participant.characterId,
          turn: current.turn,
          action: "guard" as const,
          targetKind: "self" as const,
          targetId: participant.characterId,
          origin: "manual" as const
        }))
      ]);
      const willEscape =
        predicted.state.participants[0]!.fledAtTurn !== undefined;
      const submitFlee = () => repository.submitActionForTelegramUser({
        telegramUserId: escapee.telegramUserId,
        partyInviteToken: current.partyInviteToken,
        turn: current.turn,
        action: "flee" as const,
        targetKind: "self" as const,
        targetId: escapee.characterId,
        now: new Date(NOW.getTime() + attempt * 10),
        nextTurnExpiresAt: new Date(NOW.getTime() + attempt * 10 + 23_000)
      });
      const concurrentFlee = await Promise.all([submitFlee(), submitFlee()]);
      expect(concurrentFlee.map((result) => result.state).sort()).toEqual([
        "duplicate",
        "queued"
      ]);
      const activeClaimToken = `flee-active-publication-${attempt}`;
      if (willEscape) {
        const queuedCurrent = await repository.findById(current.id);
        if (!queuedCurrent) {
          throw new Error("Expected the queued flee session to remain readable.");
        }
        await expect(repository.claimParticipantUiPublication({
          sessionId: current.id,
          telegramUserId: escapee.telegramUserId,
          expectedDeliveryRevision: queuedCurrent.deliveryRevision,
          keyboardFingerprint: `flee-keyboard-${attempt}`,
          claimToken: activeClaimToken,
          claimedAt: new Date(NOW.getTime() + attempt * 10 + 1),
          staleBefore: new Date(NOW.getTime() + attempt * 10 - 22_999)
        })).resolves.toMatchObject({ state: "claimed" });
      }
      let resolved: Awaited<ReturnType<typeof repository.submitActionForTelegramUser>> | null = null;
      for (const [remainingIndex, participant] of remaining.entries()) {
        const resolvingAttempt = repository.submitActionForTelegramUser({
          telegramUserId: participant.telegramUserId,
          partyInviteToken: current.partyInviteToken,
          turn: current.turn,
          action: "guard",
          targetKind: "self",
          targetId: participant.characterId,
          now: new Date(NOW.getTime() + attempt * 10 + participant.rosterOrder),
          nextTurnExpiresAt: new Date(NOW.getTime() + attempt * 10 + 23_000)
        });
        if (willEscape && remainingIndex === remaining.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          await expect(repository.releaseParticipantUiPublicationClaim({
            sessionId: current.id,
            telegramUserId: escapee.telegramUserId,
            claimToken: activeClaimToken
          })).resolves.toBe(true);
        }
        resolved = await resolvingAttempt;
      }
      if (!resolved || !("session" in resolved)) {
        throw new Error("Expected the production flee turn to resolve.");
      }
      current = resolved.session;
      if (current.state.participants[0]!.fledAtTurn !== undefined) {
        break;
      }
      expect(await prisma.activeCombatLease.count({
        where: { referenceId: current.id }
      })).toBe(3);
      expect(await prisma.groupCombatParticipant.findFirstOrThrow({
        where: { sessionId: current.id, characterId: escapee.characterId },
        select: {
          settlementStatus: true,
          settlementAttempts: true,
          settlementReceiptJson: true
        }
      })).toEqual({
        settlementStatus: "pending",
        settlementAttempts: 0,
        settlementReceiptJson: null
      });
    }
    const escapedActor = current.state.participants[0]!;
    expect(escapedActor.fledAtTurn).toBeDefined();
    expect(current.status).toBe("active");
    expect(await prisma.activeCombatLease.count({
      where: { referenceId: current.id }
    })).toBe(2);
    expect(await prisma.activeCombatLease.count({
      where: { characterId: escapee.characterId }
    })).toBe(0);
    expect(await prisma.character.findUniqueOrThrow({
      where: { id: escapee.characterId },
      select: { hpCurrent: true, manaCurrent: true }
    })).toEqual({
      hpCurrent: escapedActor.hp,
      manaCurrent: escapedActor.mana
    });
    const exitRow = await prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: current.id, characterId: escapee.characterId }
    });
    expect(exitRow).toMatchObject({
      settlementStatus: "completed",
      settlementAttempts: 1,
      exitDeliveryState: "pending",
      exitDeliveryClaimToken: null,
      exitDeliveryClaimedAt: null,
      exitDeliveryMessageId: null
    });
    expect(exitRow.settlementReceiptJson).not.toBeNull();
    const restartedDeliveryRepository = new PrismaGroupCombatRepository(prisma);
    const deliveryClaims = await Promise.all([
      restartedDeliveryRepository.claimParticipantFleeExitDelivery({
        sessionId: current.id,
        telegramUserId: escapee.telegramUserId,
        claimToken: "flee-delivery-a",
        claimedAt: new Date(NOW.getTime() + 100),
        staleBefore: new Date(NOW.getTime() - 23_000)
      }),
      restartedDeliveryRepository.claimParticipantFleeExitDelivery({
        sessionId: current.id,
        telegramUserId: escapee.telegramUserId,
        claimToken: "flee-delivery-b",
        claimedAt: new Date(NOW.getTime() + 100),
        staleBefore: new Date(NOW.getTime() - 23_000)
      })
    ]);
    expect(deliveryClaims.filter((claim) => claim.state === "claimed")).toHaveLength(1);
    expect(deliveryClaims.filter((claim) => claim.state === "busy")).toHaveLength(1);
    const originalWinningClaim = deliveryClaims[0]?.state === "claimed"
      ? "flee-delivery-a"
      : "flee-delivery-b";
    expect(deliveryClaims.find((claim) => claim.state === "claimed")).toEqual({
      state: "claimed",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      menuDelivered: false
    });
    const navigationGuard = await prisma.activeCombatLease.findUniqueOrThrow({
      where: { characterId: escapee.characterId }
    });
    expect(navigationGuard).toMatchObject({
      kind: "group-combat-exit-navigation",
      referenceId: `${current.id}:${escapee.characterId}`
    });
    await expect(
      restartedDeliveryRepository.renewParticipantFleeExitDeliveryClaim({
        sessionId: current.id,
        telegramUserId: escapee.telegramUserId,
        claimToken: originalWinningClaim,
        claimedAt: new Date(NOW.getTime() + 13_100)
      })
    ).resolves.toBe(true);
    await expect(
      restartedDeliveryRepository.renewParticipantFleeExitDeliveryClaim({
        sessionId: current.id,
        telegramUserId: escapee.telegramUserId,
        claimToken: "flee-delivery-not-owner",
        claimedAt: new Date(NOW.getTime() + 13_101)
      })
    ).resolves.toBe(false);
    for (const kind of ["solo-combat", "group-combat"] as const) {
      await expect(prisma.activeCombatLease.create({
        data: {
          id: `left-durable-flee-delivery-blocked-${kind}`,
          characterId: escapee.characterId,
          kind,
          referenceId: `newer-${kind}-ui`
        }
      })).rejects.toMatchObject({ code: "P2002" });
    }
    await expect(
      restartedDeliveryRepository.claimParticipantFleeExitDelivery({
        sessionId: current.id,
        telegramUserId: escapee.telegramUserId,
        claimToken: "flee-delivery-restarted",
        claimedAt: new Date(NOW.getTime() + 36_101),
        staleBefore: new Date(NOW.getTime() + 13_101)
      })
    ).resolves.toEqual({
      state: "claimed",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      menuDelivered: false
    });
    expect(originalWinningClaim).toMatch(/^flee-delivery-[ab]$/);
    const winningClaim = "flee-delivery-restarted";
    await expect(
      restartedDeliveryRepository.renewParticipantFleeExitDeliveryClaim({
        sessionId: current.id,
        telegramUserId: escapee.telegramUserId,
        claimToken: originalWinningClaim,
        claimedAt: new Date(NOW.getTime() + 36_102)
      })
    ).resolves.toBe(false);
    await expect(
      restartedDeliveryRepository.renewParticipantFleeExitDeliveryClaim({
        sessionId: current.id,
        telegramUserId: escapee.telegramUserId,
        claimToken: winningClaim,
        claimedAt: new Date(NOW.getTime() + 36_103)
      })
    ).resolves.toBe(true);
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: escapee.characterId }
    })).resolves.toMatchObject({
      kind: "group-combat-exit-navigation",
      referenceId: `${current.id}:${escapee.characterId}`
    });
    await expect(
      restartedDeliveryRepository.markParticipantFleeExitMenuDelivered({
        sessionId: current.id,
        telegramUserId: escapee.telegramUserId,
        claimToken: winningClaim,
        messageId: 93
      })
    ).resolves.toBe(true);
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: escapee.characterId }
    })).resolves.toMatchObject({
      kind: "group-combat-exit-navigation",
      referenceId: `${current.id}:${escapee.characterId}`
    });
    for (const kind of ["solo-combat", "group-combat"] as const) {
      await expect(prisma.activeCombatLease.create({
        data: {
          id: `left-durable-flee-delivery-blocked-after-menu-${kind}`,
          characterId: escapee.characterId,
          kind,
          referenceId: `newer-${kind}-ui`
        }
      })).rejects.toMatchObject({ code: "P2002" });
    }
    await expect(
      restartedDeliveryRepository.completeParticipantFleeExitDelivery({
        sessionId: current.id,
        telegramUserId: escapee.telegramUserId,
        claimToken: winningClaim,
        expectedReferenceVersion: exitRow.referenceVersion,
        chatId: exitRow.chatId,
        messageId: exitRow.messageId,
        retainReference: false
      })
    ).resolves.toBe(true);
    await expect(prisma.activeCombatLease.findUnique({
      where: { characterId: escapee.characterId }
    })).resolves.toBeNull();
    for (const kind of ["solo-combat", "group-combat"] as const) {
      const leaseId = `left-durable-flee-delivery-after-complete-${kind}`;
      await expect(prisma.activeCombatLease.create({
        data: {
          id: leaseId,
          characterId: escapee.characterId,
          kind,
          referenceId: `newer-${kind}-ui`
        }
      })).resolves.toMatchObject({ id: leaseId });
      await prisma.activeCombatLease.delete({ where: { id: leaseId } });
    }
    await expect(prisma.groupCombatParticipant.findUniqueOrThrow({
      where: { id: exitRow.id },
      select: {
        exitDeliveryState: true,
        exitDeliveryClaimToken: true,
        exitDeliveryClaimedAt: true,
        exitDeliveryMessageId: true,
        chatId: true,
        messageId: true
      }
    })).resolves.toEqual({
      exitDeliveryState: "completed",
      exitDeliveryClaimToken: null,
      exitDeliveryClaimedAt: null,
      exitDeliveryMessageId: 93,
      chatId: null,
      messageId: null
    });
    await expect(repository.submitActionForTelegramUser({
      telegramUserId: escapee.telegramUserId,
      partyInviteToken: current.partyInviteToken,
      turn: escapedActor.fledAtTurn!,
      action: "flee",
      targetKind: "self",
      targetId: escapee.characterId,
      now: new Date(NOW.getTime() + 93),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_093)
    })).resolves.toMatchObject({ state: "stale" });
    expect(await prisma.groupCombatParticipant.findUniqueOrThrow({
      where: { id: exitRow.id },
      select: {
        settlementStatus: true,
        settlementAttempts: true,
        settlementReceiptJson: true,
        settledAt: true
      }
    })).toEqual({
      settlementStatus: exitRow.settlementStatus,
      settlementAttempts: exitRow.settlementAttempts,
      settlementReceiptJson: exitRow.settlementReceiptJson,
      settledAt: exitRow.settledAt
    });
    const resumedSated = await prisma.characterCooldown.findUniqueOrThrow({
      where: {
        characterId_key: {
          characterId: escapee.characterId,
          key: VARENYK_SATED_STATUS_KEY
        }
      }
    });
    expect(resumedSated.availableAt.getTime()).toBeGreaterThan(NOW.getTime());

    await prisma.activeCombatLease.create({
      data: {
        id: "left-durable-independent-retreat-next-lease",
        characterId: escapee.characterId,
        kind: "solo-combat",
        referenceId: "ordinary-after-group-flee"
      }
    });
    await prisma.character.update({
      where: { id: escapee.characterId },
      data: {
        hpCurrent: 17,
        manaCurrent: 3,
        xp: 1_234,
        gold: 777,
        level: 9
      }
    });
    await prisma.characterRemort.create({
      data: {
        id: "left-durable-independent-retreat-remort",
        characterId: escapee.characterId,
        token: "left-durable-independent-retreat-remort-token",
        remortNumber: 1,
        previousLevel: 9,
        previousXp: 1_234,
        previousGold: 777,
        displayNameSnapshot: "Нове життя після втечі",
        preservedPayloadJson: {}
      }
    });

    const terminal = await terminalizeProductionSession(
      prisma,
      current,
      new Set([remaining[0]!.characterId])
    );
    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: remaining[0]!.telegramUserId,
      now: new Date(NOW.getTime() + 2_000)
    })).resolves.toMatchObject({ state: "settled" });
    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: remaining[1]!.telegramUserId,
      now: new Date(NOW.getTime() + 3_000)
    })).resolves.toMatchObject({ state: "settled" });
    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: escapee.telegramUserId,
      now: new Date(NOW.getTime() + 4_000)
    })).resolves.toMatchObject({ state: "replayed" });

    expect(await prisma.character.findUniqueOrThrow({
      where: { id: escapee.characterId },
      select: { hpCurrent: true, manaCurrent: true, xp: true, gold: true, level: true }
    })).toEqual({
      hpCurrent: 17,
      manaCurrent: 3,
      xp: 1_234,
      gold: 777,
      level: 9
    });
    expect(await prisma.activeCombatLease.findUnique({
      where: { characterId: escapee.characterId }
    })).toMatchObject({
      kind: "solo-combat",
      referenceId: "ordinary-after-group-flee"
    });
    expect(await prisma.characterCooldown.findUnique({
      where: {
        characterId_key: {
          characterId: escapee.characterId,
          key: LEFT_PASSAGE_TIER_TWO_DISCOVERY_COOLDOWN_KEY
        }
      }
    })).toBeNull();
    expect(await prisma.activityEvent.findUniqueOrThrow({
      where: { dedupeKey: `group-combat:${terminal.id}:activity` },
      select: { relatedCharacterIds: true, payloadJson: true }
    })).toEqual({
      relatedCharacterIds: [remaining[0]!.characterId],
      payloadJson: { participantCount: 1, outcome: "won" }
    });
  });

  it.each([
    "flee-resources",
    "flee-evidence",
    "flee-lease"
  ] as const)("rolls back a successful production flee after the %s stage and retries it once", async (stage) => {
    const firstId = stage === "flee-resources"
      ? 58741n
      : stage === "flee-evidence"
        ? 58751n
        : 58761n;
    const session = await startLeftPassageProduction(
      prisma,
      repository,
      `left-flee-rollback-${stage}`,
      [firstId, firstId + 1n, firstId + 2n]
    );
    const prepared = structuredClone(session.state);
    prepared.participants[0]!.fleeAttempts = 6;
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: prepared as unknown as Prisma.InputJsonValue }
    });
    const escapee = session.participants[0]!;
    const second = session.participants[1]!;
    const third = session.participants[2]!;
    const before = await prisma.character.findUniqueOrThrow({
      where: { id: escapee.characterId },
      select: { hpCurrent: true, manaCurrent: true }
    });
    const failing = new PrismaGroupCombatRepository(prisma, {
      afterStage(input) {
        if (input.stage === stage && input.characterId === escapee.characterId) {
          throw new Error(`stop-after-${stage}`);
        }
      }
    });
    await failing.submitActionForTelegramUser({
      telegramUserId: escapee.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "flee",
      targetKind: "self",
      targetId: escapee.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    await failing.submitActionForTelegramUser({
      telegramUserId: second.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: second.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    await expect(failing.submitActionForTelegramUser({
      telegramUserId: third.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: third.characterId,
      now: new Date(NOW.getTime() + 2),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).rejects.toThrow(`stop-after-${stage}`);

    expect(await prisma.character.findUniqueOrThrow({
      where: { id: escapee.characterId },
      select: { hpCurrent: true, manaCurrent: true }
    })).toEqual(before);
    expect(await prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: session.id, characterId: escapee.characterId },
      select: {
        settlementStatus: true,
        settlementAttempts: true,
        settlementReceiptJson: true,
        settledAt: true
      }
    })).toEqual({
      settlementStatus: "pending",
      settlementAttempts: 0,
      settlementReceiptJson: null,
      settledAt: null
    });
    expect(await prisma.activeCombatLease.count({
      where: { referenceId: session.id }
    })).toBe(3);

    const retried = await repository.submitActionForTelegramUser({
      telegramUserId: third.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: third.characterId,
      now: new Date(NOW.getTime() + 3),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(retried).toMatchObject({ state: "resolved" });
    expect("session" in retried && retried.session.state.participants[0]!.fledAtTurn)
      .toBe(1);
    expect(await prisma.activeCombatLease.count({
      where: { referenceId: session.id }
    })).toBe(2);
  });

  it("keeps one final resolving submission within its direct query budget", async () => {
    await seedParty(prisma, "group-single-resolve", [1231n, 1232n]);
    const session = await startExistingPartyProof(repository, "group-single-resolve", 1231n);
    const first = session.participants[0]!;
    const second = session.participants[1]!;
    await repository.submitActionForTelegramUser({
      telegramUserId: first.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: "guard",
      targetKind: "self",
      targetId: first.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    const { value: resolved, count: singleResolveQueries } = await measureQueryEvents(prisma, queries, () => (
      repository.submitActionForTelegramUser({
        telegramUserId: second.telegramUserId,
        partyInviteToken: session.partyInviteToken,
        turn: session.turn,
        action: "guard",
        targetKind: "self",
        targetId: second.characterId,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    ));
    actualQueryCounts.singleResolve = singleResolveQueries;

    expect(resolved.state).toBe("resolved");
    expect(singleResolveQueries).toBeLessThanOrEqual(QUERY_BUDGETS.singleResolve);
    expect("session" in resolved ? resolved.session.turn : null).toBe(2);
    expect(await prisma.groupCombatAction.count({ where: { sessionId: session.id, turn: 1 } })).toBe(2);
  });

  it.each([
    ["proof", 73_201n],
    ["production", 73_211n]
  ] as const)("transitions persisted active %s cumulative focus through the leader", async (
    kind,
    firstTelegramId
  ) => {
    const token = `group-focus-transition-${kind}`;
    const telegramIds = [firstTelegramId, firstTelegramId + 1n];
    const session = kind === "proof"
      ? await startProof(prisma, repository, token, telegramIds)
      : await startLeftPassageProduction(prisma, repository, token, telegramIds);
    expect(session.state.enemyFocusVersion).toBe(1);
    const legacy = structuredClone(session.state);
    const leader = legacy.participants[0]!;
    const legacyTopThreat = legacy.participants[1]!;
    delete legacy.enemyFocusVersion;
    leader.threat = 7;
    legacyTopThreat.threat = 93;
    for (const enemy of legacy.enemies) {
      const frozenEnemy = legacy.production?.canonicalV1.enemies.find(
        (candidate) => candidate.enemyId === enemy.id
      );
      enemy.abilityCooldowns = Object.fromEntries((enemy.abilityIds ?? []).map((abilityId) => [
        abilityId,
        {
          id: abilityId,
          remainingTurns: Math.max(
            1,
            frozenEnemy?.abilities.find((ability) => ability.id === abilityId)
              ?.cooldownOwnActions ?? 1
          )
        }
      ]));
    }
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: legacy as unknown as Prisma.InputJsonValue }
    });

    const restarted = new PrismaGroupCombatRepository(prisma);
    const loaded = await restarted.findById(session.id);
    expect(loaded).not.toBeNull();
    expect(presentGroupCombat(loaded!, leader.characterId, NOW)).toContain(
      `${leader.name}: ${leader.hp}/${leader.hpMax} · мана ${leader.mana}/${leader.manaMax} ← 🎯 ціль ворогів`
    );
    const leaderParticipant = loaded!.participants.find(
      (participant) => participant.characterId === leader.characterId
    )!;
    const secondParticipant = loaded!.participants.find(
      (participant) => participant.characterId === legacyTopThreat.characterId
    )!;
    await expect(restarted.submitActionForTelegramUser({
      telegramUserId: leaderParticipant.telegramUserId,
      partyInviteToken: token,
      turn: loaded!.turn,
      action: "guard",
      targetKind: "self",
      targetId: leader.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });
    const resolved = await restarted.submitActionForTelegramUser({
      telegramUserId: secondParticipant.telegramUserId,
      partyInviteToken: token,
      turn: loaded!.turn,
      action: "guard",
      targetKind: "self",
      targetId: legacyTopThreat.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(resolved).toMatchObject({ state: "resolved", session: { turn: 2 } });
    if (!("session" in resolved)) {
      throw new Error("Expected transitioned GroupCombat session.");
    }
    const transitioned = resolved.session.state;
    const responseLines = transitioned.recap.at(-1)!.lines.filter((line) =>
      line.includes("відповідає")
    );
    expect(responseLines.length).toBeGreaterThan(0);
    expect(responseLines.every((line) => line.includes(leader.name))).toBe(true);
    expect(transitioned.enemyFocusVersion).toBe(1);
    expect(transitioned.participants.map((participant) => participant.threat)).toEqual([0, 0]);
    expect(
      expandGroupCombatRecapSnapshot(transitioned.recap.at(-1)?.snapshot, transitioned)
        ?.enemyFocusCharacterId
    ).toBe(leader.characterId);
    expect(getGroupCombatEnemyFocusTarget(transitioned)?.characterId).toBe(leader.characterId);

    const reparsed = await new PrismaGroupCombatRepository(prisma).findById(session.id);
    expect(reparsed?.state).toEqual(transitioned);
    expect(getGroupCombatEnemyFocusTarget(reparsed!.state)?.characterId).toBe(leader.characterId);
  });

  it("uses a lean due scan and a resource-free timeout fallback", async () => {
    const before = await resourceSnapshot(prisma, [1101n, 1102n]);
    await prisma.groupCombatSession.updateMany({
      where: { partySession: { inviteToken: "group-start" } },
      data: { turnExpiresAt: new Date(NOW.getTime() - 1) }
    });
    const { value: ids, count: dueQueries } = await measureQueryEvents(
      prisma,
      queries,
      () => repository.listDueSessionIds(NOW, 13)
    );
    actualQueryCounts.dueScan = dueQueries;
    expect(ids).toHaveLength(1);
    expect(dueQueries).toBe(QUERY_BUDGETS.dueScan);

    const result = await repository.resolveTimedOutSession({
      sessionId: ids[0]!,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(result.state).toBe("resolved");
    expect("session" in result ? result.session.queuedActions : []).toHaveLength(0);
    expect(await resourceSnapshot(prisma, [1101n, 1102n])).toEqual(before);
    expect(await prisma.characterItem.count({
      where: { character: { user: { telegramUserId: { in: [1101n, 1102n] } } } }
    })).toBe(0);
  });

  it("resolves an action-versus-timeout overlap at most once", async () => {
    await seedParty(prisma, "group-race", [1251n, 1252n]);
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1251n,
      partyInviteToken: "group-race",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() - 1)
    });
    if (!("session" in started)) {
      throw new Error(`Expected started group race, got ${started.state}`);
    }
    const session = started.session;
    const first = session.participants[0]!;
    const second = session.participants[1]!;
    await repository.submitActionForTelegramUser({
      telegramUserId: first.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: first.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { turnExpiresAt: new Date(NOW.getTime() - 1) }
    });

    const [manual, timeout] = await Promise.all([
      repository.submitActionForTelegramUser({
        telegramUserId: second.telegramUserId,
        partyInviteToken: session.partyInviteToken,
        turn: 1,
        action: "attack",
        targetKind: "enemy",
        targetId: session.state.enemies[0]!.id,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      }),
      repository.resolveTimedOutSession({
        sessionId: session.id,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    ]);
    const latest = await repository.findByPartyInviteToken(session.partyInviteToken);
    expect([manual.state, timeout.state]).toContain("resolved");
    expect(latest?.turn).toBe(2);
    expect(await prisma.groupCombatAction.count({ where: { sessionId: session.id, turn: 1 } })).toBe(2);
    expect(await prisma.groupCombatParticipant.findMany({
      where: { sessionId: session.id },
      select: { contributionJson: true }
    })).toHaveLength(2);
  });

  it("linearizes two concurrent different first choices into one queued row and one replacement", async () => {
    const session = await startProof(prisma, repository, "group-first-choice-race", [1261n, 1262n]);
    const actor = session.participants[0]!;
    const results = await Promise.all([
      repository.submitActionForTelegramUser({
        telegramUserId: actor.telegramUserId,
        partyInviteToken: session.partyInviteToken,
        turn: 1,
        action: "guard",
        targetKind: "self",
        targetId: actor.characterId,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      }),
      repository.submitActionForTelegramUser({
        telegramUserId: actor.telegramUserId,
        partyInviteToken: session.partyInviteToken,
        turn: 1,
        action: "attack",
        targetKind: "enemy",
        targetId: session.state.enemies[0]!.id,
        now: new Date(NOW.getTime() + 1),
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    ]);
    const actionRows = await prisma.groupCombatAction.findMany({
      where: { sessionId: session.id, turn: 1, actorCharacterId: actor.characterId }
    });

    expect(results.map((result) => result.state).sort()).toEqual(["queued", "replaced"]);
    expect(actionRows).toHaveLength(1);
    expect(["attack", "guard"]).toContain(actionRows[0]!.actionKey);
    expect((await repository.findById(session.id))?.turn).toBe(1);
  });

  it("keeps identical concurrent first callbacks as one queued action and one truthful duplicate", async () => {
    const session = await startProof(prisma, repository, "group-identical-choice-race", [1263n, 1264n]);
    const actor = session.participants[0]!;
    const submit = () => repository.submitActionForTelegramUser({
      telegramUserId: actor.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard" as const,
      targetKind: "self" as const,
      targetId: actor.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const results = await Promise.all([submit(), submit()]);

    expect(results.map((result) => result.state).sort()).toEqual(["duplicate", "queued"]);
    expect(await prisma.groupCombatAction.count({
      where: { sessionId: session.id, turn: 1, actorCharacterId: actor.characterId }
    })).toBe(1);
  });

  it("keeps replacement linearizable when it races the final participant action", async () => {
    const session = await startProof(prisma, repository, "group-replace-final-race", [1265n, 1266n]);
    const actor = session.participants[0]!;
    const finalActor = session.participants[1]!;
    await repository.submitActionForTelegramUser({
      telegramUserId: actor.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: actor.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    const [replacement, finalAction] = await Promise.all([
      repository.submitActionForTelegramUser({
        telegramUserId: actor.telegramUserId,
        partyInviteToken: session.partyInviteToken,
        turn: 1,
        action: "attack",
        targetKind: "enemy",
        targetId: session.state.enemies[0]!.id,
        now: new Date(NOW.getTime() + 1),
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      }),
      repository.submitActionForTelegramUser({
        telegramUserId: finalActor.telegramUserId,
        partyInviteToken: session.partyInviteToken,
        turn: 1,
        action: "guard",
        targetKind: "self",
        targetId: finalActor.characterId,
        now: new Date(NOW.getTime() + 2),
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    ]);

    expect([replacement.state, finalAction.state].filter((state) => state === "resolved")).toHaveLength(1);
    expect(["replaced", "resolved", "stale", "terminal"]).toContain(replacement.state);
    await expectStoredTurnActionMatchesRecap(prisma, repository, session, actor.characterId);
  });

  it("keeps replacement linearizable when it races timeout resolution", async () => {
    const session = await startProof(
      prisma,
      repository,
      "group-replace-timeout-race",
      [1267n, 1268n],
      new Date(NOW.getTime() - 1)
    );
    const actor = session.participants[0]!;
    await repository.submitActionForTelegramUser({
      telegramUserId: actor.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: actor.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { turnExpiresAt: new Date(NOW.getTime() - 1) }
    });

    const [replacement, timeout] = await Promise.all([
      repository.submitActionForTelegramUser({
        telegramUserId: actor.telegramUserId,
        partyInviteToken: session.partyInviteToken,
        turn: 1,
        action: "attack",
        targetKind: "enemy",
        targetId: session.state.enemies[0]!.id,
        now: new Date(NOW.getTime() + 1),
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      }),
      repository.resolveTimedOutSession({
        sessionId: session.id,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    ]);

    expect([replacement.state, timeout.state].filter((state) => state === "resolved")).toHaveLength(1);
    expect(["replaced", "resolved", "stale", "terminal"]).toContain(replacement.state);
    await expectStoredTurnActionMatchesRecap(prisma, repository, session, actor.characterId);
  });

  it("settles a normal victory, releases every lock and clears completed legacy delivery churn", async () => {
    await seedParty(prisma, "group-win", [1271n, 1272n]);
    const before = await resourceSnapshot(prisma, [1271n, 1272n]);
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1271n,
      partyInviteToken: "group-win",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    if (!("session" in started)) {
      throw new Error(`Expected started group win, got ${started.state}`);
    }
    const session = started.session;
    let canonical = session;
    for (const [index, participant] of canonical.participants.entries()) {
      await expect(repository.compareAndSetParticipantCard({
        sessionId: canonical.id,
        telegramUserId: participant.telegramUserId,
        expectedReferenceVersion: participant.referenceVersion,
        chatId: participant.telegramUserId,
        messageId: 90 + index
      })).resolves.toBe(true);
      canonical = (await repository.findById(canonical.id))!;
      const claimed = canonical.participants.find((row) => row.telegramUserId === participant.telegramUserId)!;
      await expect(repository.markParticipantCardDelivered({
        sessionId: canonical.id,
        telegramUserId: claimed.telegramUserId,
        expectedDeliveryRevision: canonical.deliveryRevision,
        expectedReferenceVersion: claimed.referenceVersion,
        chatId: claimed.chatId!,
        messageId: claimed.messageId!
      })).resolves.toBe(true);
    }
    canonical = (await repository.findById(canonical.id))!;
    await expect(repository.finalizeDeliveryAttempt({
      sessionId: canonical.id,
      expectedDeliveryRevision: canonical.deliveryRevision,
      attemptedAt: NOW
    })).resolves.toBe(true);
    const canonicalReferences = canonical.participants.map((participant) => ({
      telegramUserId: participant.telegramUserId,
      chatId: participant.chatId,
      messageId: participant.messageId,
      referenceVersion: participant.referenceVersion
    }));
    const state = {
      ...session.state,
      enemies: session.state.enemies.map((enemy) => ({ ...enemy, hp: 1, hpMax: 1, defense: 0 }))
    };
    await prisma.groupCombatSession.update({ where: { id: session.id }, data: { stateJson: state } });
    const first = session.participants[0]!;
    const second = session.participants[1]!;
    await repository.submitActionForTelegramUser({
      telegramUserId: first.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: state.enemies[0]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    let terminal = await repository.submitActionForTelegramUser({
      telegramUserId: second.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: state.enemies[1]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    for (let attempt = 0; terminal.state === "resolved" && attempt < 23; attempt += 1) {
      const nextSession = terminal.session;
      for (const participant of nextSession.participants) {
        const target = nextSession.state.enemies.find((enemy) => enemy.hp > 0);
        if (!target) {
          break;
        }
        terminal = await repository.submitActionForTelegramUser({
          telegramUserId: participant.telegramUserId,
          partyInviteToken: nextSession.partyInviteToken,
          turn: nextSession.turn,
          action: "attack",
          targetKind: "enemy",
          targetId: target.id,
          now: new Date(NOW.getTime() + attempt + 1),
          nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
        });
        if (terminal.state === "terminal") {
          break;
        }
      }
    }

    expect(terminal.state).toBe("terminal");
    expect("session" in terminal ? terminal.session.result : null).toMatchObject({
      kind: "rewardless-proof",
      outcome: "won",
      rewards: { xp: 0, gold: 0, items: [] }
    });
    expect("session" in terminal ? terminal.session.result?.completedTurn : null)
      .toBeGreaterThanOrEqual(1);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(0);
    expect(await resourceSnapshot(prisma, [1271n, 1272n])).toEqual(before);
    expect(await prisma.characterItem.count({ where: { character: { user: { telegramUserId: { in: [1271n, 1272n] } } } } })).toBe(0);

    const restarted = new PrismaGroupCombatRepository(prisma);
    expect(await restarted.listPendingDeliverySessionIds(93)).toContain(session.id);
    const committed = (await restarted.findById(session.id))!;
    expect(committed.participants.map((participant) => ({
      telegramUserId: participant.telegramUserId,
      chatId: participant.chatId,
      messageId: participant.messageId,
      referenceVersion: participant.referenceVersion
    }))).toEqual(canonicalReferences);
    await prisma.groupCombatParticipant.updateMany({
      where: { sessionId: committed.id },
      data: {
        exitDeliveryState: "completed",
        deliveredRevision: committed.deliveryRevision - 1
      }
    });
    await expect(restarted.finalizeDeliveryAttempt({
      sessionId: committed.id,
      expectedDeliveryRevision: committed.deliveryRevision,
      attemptedAt: new Date(NOW.getTime() + 1)
    })).resolves.toBe(true);
    expect(await restarted.listPendingDeliverySessionIds(93)).not.toContain(session.id);
  });

  it("consumes a supported item once across final-action and timeout races", async () => {
    await seedParty(prisma, "group-item-race", [1191n, 1192n]);
    const actor = await prisma.character.findFirstOrThrow({
      where: { user: { telegramUserId: 1191n } }
    });
    await prisma.character.update({ where: { id: actor.id }, data: { hpCurrent: 10, hpMax: 30 } });
    await prisma.characterItem.create({
      data: { characterId: actor.id, itemId: "item.responsible-panic-bandage", quantity: 1 }
    });
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1191n,
      partyInviteToken: "group-item-race",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(started.state).toBe("started");
    const session = "session" in started ? started.session : null;
    expect(session).not.toBeNull();
    const second = session!.participants[1]!;
    const queued = await repository.submitActionForTelegramUser({
      telegramUserId: 1191n,
      partyInviteToken: "group-item-race",
      turn: 1,
      action: "item",
      targetKind: "self",
      targetId: actor.id,
      payloadKey: "item.responsible-panic-bandage",
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
    });
    expect(queued.state).toBe("queued");
    await Promise.all([
      repository.submitActionForTelegramUser({
        telegramUserId: second.telegramUserId,
        partyInviteToken: "group-item-race",
        turn: 1,
        action: "guard",
        targetKind: "self",
        targetId: second.characterId,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
      }),
      repository.resolveTimedOutSession({
        sessionId: session!.id,
        now: new Date(NOW.getTime() + 23_000),
        nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
      })
    ]);
    expect(await prisma.characterItem.count({
      where: { characterId: actor.id, itemId: "item.responsible-panic-bandage" }
    })).toBe(0);
    const reloaded = await repository.findById(session!.id);
    expect(reloaded?.state.contributions[0]?.healing).toBe(7);
  });

  it.each([
    ["item.loot-v1-c002", 73_102n],
    ["item.loot-v1-c012", 73_104n]
  ])("preserves the second %s stack and commit evidence after an earlier raid heal", async (
    secondItemId,
    secondTelegramId
  ) => {
    const suffix = secondItemId.endsWith("c002") ? "paired" : "salad";
    const firstTelegramId = secondTelegramId - 1n;
    const token = `group-shared-${suffix}`;
    await seedParty(prisma, token, [firstTelegramId, secondTelegramId]);
    const characters = await prisma.character.findMany({
      where: { user: { telegramUserId: { in: [firstTelegramId, secondTelegramId] } } },
      include: { user: true }
    });
    const firstCharacter = characters.find((entry) => entry.user.telegramUserId === firstTelegramId)!;
    const secondCharacter = characters.find((entry) => entry.user.telegramUserId === secondTelegramId)!;
    await prisma.character.update({
      where: { id: firstCharacter.id },
      data: { hpCurrent: 38, hpMax: 43 }
    });
    await prisma.character.update({
      where: { id: secondCharacter.id },
      data: { hpCurrent: 38, hpMax: 43 }
    });
    await prisma.characterItem.createMany({
      data: [
        { characterId: firstCharacter.id, itemId: "item.loot-v1-c012", quantity: 1 },
        { characterId: secondCharacter.id, itemId: secondItemId, quantity: 1 },
        ...(secondItemId === "item.loot-v1-c002"
          ? [
              { characterId: secondCharacter.id, itemId: "item.loot-v1-c012", quantity: 1 },
              { characterId: firstCharacter.id, itemId: secondItemId, quantity: 1 }
            ]
          : [])
      ]
    });
    const session = await startExistingPartyProof(repository, token, firstTelegramId);
    const firstActorId = session.state.participants[0]!.characterId;
    const secondActorId = session.state.participants[1]!.characterId;
    const firstParticipant = session.participants.find((entry) => entry.characterId === firstActorId)!;
    const secondParticipant = session.participants.find((entry) => entry.characterId === secondActorId)!;

    await expect(repository.submitActionForTelegramUser({
      telegramUserId: firstParticipant.telegramUserId,
      partyInviteToken: token,
      turn: 1,
      action: "item",
      targetKind: "self",
      targetId: firstParticipant.characterId,
      payloadKey: "item.loot-v1-c012",
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });
    const resolved = await repository.submitActionForTelegramUser({
      telegramUserId: secondParticipant.telegramUserId,
      partyInviteToken: token,
      turn: 1,
      action: "item",
      targetKind: "self",
      targetId: secondParticipant.characterId,
      payloadKey: secondItemId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(resolved).toMatchObject({ state: "resolved", session: { turn: 2 } });
    await expect(prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: firstParticipant.characterId,
          itemId: "item.loot-v1-c012"
        }
      }
    })).resolves.toBeNull();
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: {
        characterId_itemId: {
          characterId: secondParticipant.characterId,
          itemId: secondItemId
        }
      }
    })).resolves.toMatchObject({ quantity: 1 });
    const actions = await prisma.groupCombatAction.findMany({
      where: { sessionId: session.id, turn: 1 },
      orderBy: { actorCharacterId: "asc" }
    });
    expect(actions.find((entry) => entry.actorCharacterId === firstParticipant.characterId)?.origin)
      .toBe("manual-item-committed");
    expect(actions.find((entry) => entry.actorCharacterId === secondParticipant.characterId)?.origin)
      .toBe("manual");
    expect("session" in resolved ? resolved.session.state.recap[0]?.lines.join("\n") : "")
      .toContain("манатка лишається в торбі");
  });

  it("commits a queued group-combat nonmedical item without a rollout gate", async () => {
    await seedParty(prisma, "group-item-gate", [73_105n, 73_106n]);
    const actor = await prisma.character.findFirstOrThrow({
      where: { user: { telegramUserId: 73_105n } }
    });
    await prisma.characterItem.create({
      data: { characterId: actor.id, itemId: "item.loot-v1-c008", quantity: 1 }
    });
    const session = await startExistingPartyProof(repository, "group-item-gate", 73_105n);
    const second = session.participants.find((entry) => entry.telegramUserId === 73_106n)!;
    await expect(repository.submitActionForTelegramUser({
      telegramUserId: 73_105n,
      partyInviteToken: "group-item-gate",
      turn: 1,
      action: "item",
      targetKind: "self",
      targetId: actor.id,
      payloadKey: "item.loot-v1-c008",
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });
    const resolved = await repository.submitActionForTelegramUser({
      telegramUserId: 73_106n,
      partyInviteToken: "group-item-gate",
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: second.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(resolved).toMatchObject({ state: "resolved", session: { turn: 2 } });
    await expect(prisma.characterItem.findUnique({
      where: { characterId_itemId: { characterId: actor.id, itemId: "item.loot-v1-c008" } }
    })).resolves.toBeNull();
    await expect(prisma.groupCombatAction.findUniqueOrThrow({
      where: {
        sessionId_turn_actorCharacterId: {
          sessionId: session.id,
          turn: 1,
          actorCharacterId: actor.id
        }
      }
    })).resolves.toMatchObject({ origin: "manual-item-committed" });
    expect("session" in resolved ? resolved.session.state.recap[0]?.lines.join("\n") : "")
      .toContain("використовує манатку");
  });

  it("keeps c005 evidence uncommitted after a shared round naturally ticks cooldown one", async () => {
    const token = "group-c005-one";
    const ownerTelegramId = 73_107n;
    await seedParty(prisma, token, [ownerTelegramId, 73_108n]);
    const owner = await prisma.character.findFirstOrThrow({
      where: { user: { telegramUserId: ownerTelegramId } }
    });
    await prisma.characterItem.create({
      data: { characterId: owner.id, itemId: "item.loot-v1-c005", quantity: 1 }
    });
    const session = await startExistingPartyProof(repository, token, ownerTelegramId);
    const state = structuredClone(session.state);
    state.participants.find((entry) => entry.characterId === owner.id)!.cooldowns = {
      skill: { id: "skill.test", remainingTurns: 1 }
    };
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: state as unknown as Prisma.InputJsonValue }
    });
    const witness = session.participants.find((entry) => entry.characterId !== owner.id)!;

    await expect(repository.submitActionForTelegramUser({
      telegramUserId: ownerTelegramId,
      partyInviteToken: token,
      turn: 1,
      action: "item",
      targetKind: "self",
      targetId: owner.id,
      payloadKey: "item.loot-v1-c005",
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });
    const resolved = await repository.submitActionForTelegramUser({
      telegramUserId: witness.telegramUserId,
      partyInviteToken: token,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: witness.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(resolved).toMatchObject({ state: "resolved", session: { turn: 2 } });
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: { characterId_itemId: { characterId: owner.id, itemId: "item.loot-v1-c005" } }
    })).resolves.toMatchObject({ quantity: 1 });
    await expect(prisma.groupCombatAction.findUniqueOrThrow({
      where: {
        sessionId_turn_actorCharacterId: {
          sessionId: session.id,
          turn: 1,
          actorCharacterId: owner.id
        }
      }
    })).resolves.toMatchObject({ origin: "manual" });
    const resolvedState = "session" in resolved ? resolved.session.state : null;
    expect(resolvedState?.participants.find((entry) => entry.characterId === owner.id)?.cooldowns).toBeUndefined();
    expect(resolvedState?.recap[0]?.lines.join("\n")).toContain("манатка лишається в торбі");
  });

  it("keeps c006 uncommitted when every owner response has zero incremental reduction", async () => {
    const token = "group-c006-zero-delta";
    const ownerTelegramId = 73_111n;
    await seedParty(prisma, token, [ownerTelegramId, 73_112n]);
    const owner = await prisma.character.findFirstOrThrow({
      where: { user: { telegramUserId: ownerTelegramId } }
    });
    await prisma.characterItem.create({
      data: { characterId: owner.id, itemId: "item.loot-v1-c006", quantity: 1 }
    });
    const session = await startExistingPartyProof(repository, token, ownerTelegramId);
    const state = structuredClone(session.state);
    const ownerSnapshot = state.participants.find((entry) => entry.characterId === owner.id)!;
    state.participants.forEach((participant) => {
      participant.threat = participant.characterId === owner.id ? 1_000 : 0;
    });
    state.enemies.forEach((enemy) => { enemy.attack = ownerSnapshot.defense + 1; });
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: state as unknown as Prisma.InputJsonValue }
    });
    const witness = session.participants.find((entry) => entry.characterId !== owner.id)!;

    await expect(repository.submitActionForTelegramUser({
      telegramUserId: ownerTelegramId,
      partyInviteToken: token,
      turn: 1,
      action: "item",
      targetKind: "self",
      targetId: owner.id,
      payloadKey: "item.loot-v1-c006",
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });
    const resolved = await repository.submitActionForTelegramUser({
      telegramUserId: witness.telegramUserId,
      partyInviteToken: token,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: witness.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(resolved).toMatchObject({ state: "resolved", session: { turn: 2 } });
    await expect(prisma.characterItem.findUniqueOrThrow({
      where: { characterId_itemId: { characterId: owner.id, itemId: "item.loot-v1-c006" } }
    })).resolves.toMatchObject({ quantity: 1 });
    await expect(prisma.groupCombatAction.findUniqueOrThrow({
      where: {
        sessionId_turn_actorCharacterId: {
          sessionId: session.id,
          turn: 1,
          actorCharacterId: owner.id
        }
      }
    })).resolves.toMatchObject({ origin: "manual" });
    const resolvedState = "session" in resolved ? resolved.session.state : null;
    expect(resolvedState?.recap[0]?.lines.join("\n")).toContain("не витрачає манатку");
    expect(resolvedState?.recap[0]?.lines.join("\n")).not.toContain("відвернуто 0 шкоди");

    const restarted = new PrismaGroupCombatRepository(prisma);
    const replay = await restarted.findById(session.id);
    expect(replay?.state.recap[0]).toEqual(resolvedState?.recap[0]);
  });

  it("persists one c013 response target and committed evidence across GroupCombat restart", async () => {
    const token = "group-response-c013";
    const ownerTelegramId = 73_109n;
    await seedParty(prisma, token, [ownerTelegramId, 73_110n]);
    const owner = await prisma.character.findFirstOrThrow({
      where: { user: { telegramUserId: ownerTelegramId } }
    });
    await prisma.characterItem.create({
      data: { characterId: owner.id, itemId: "item.loot-v1-c013", quantity: 1 }
    });
    const session = await startExistingPartyProof(repository, token, ownerTelegramId);
    const state = structuredClone(session.state);
    state.participants.forEach((participant) => {
      participant.threat = participant.characterId === owner.id ? 1_000 : 0;
    });
    state.enemies.forEach((enemy) => { enemy.attack = 8; });
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { stateJson: state as unknown as Prisma.InputJsonValue }
    });
    const witness = session.participants.find((entry) => entry.characterId !== owner.id)!;

    await expect(repository.submitActionForTelegramUser({
      telegramUserId: ownerTelegramId,
      partyInviteToken: token,
      turn: 1,
      action: "item",
      targetKind: "self",
      targetId: owner.id,
      payloadKey: "item.loot-v1-c013",
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });
    const resolved = await repository.submitActionForTelegramUser({
      telegramUserId: witness.telegramUserId,
      partyInviteToken: token,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: witness.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const storedLine = "session" in resolved
      ? resolved.session.state.recap[0]?.lines.find((line) => line.includes("item.loot-v1-c013"))
        ?? resolved.session.state.recap[0]?.lines.find((line) => line.includes("використовує манатку"))
      : undefined;

    expect(resolved).toMatchObject({ state: "resolved", session: { turn: 2 } });
    expect(storedLine).toContain(state.enemies[0]!.name);
    await expect(prisma.characterItem.findUnique({
      where: { characterId_itemId: { characterId: owner.id, itemId: "item.loot-v1-c013" } }
    })).resolves.toBeNull();
    await expect(prisma.groupCombatAction.findUniqueOrThrow({
      where: {
        sessionId_turn_actorCharacterId: {
          sessionId: session.id,
          turn: 1,
          actorCharacterId: owner.id
        }
      }
    })).resolves.toMatchObject({ origin: "manual-item-committed" });

    const restarted = new PrismaGroupCombatRepository(prisma);
    const reloaded = await restarted.findById(session.id);
    expect(reloaded?.state.recap[0]?.lines).toContain(storedLine);
    await expect(prisma.groupCombatAction.findUniqueOrThrow({
      where: {
        sessionId_turn_actorCharacterId: {
          sessionId: session.id,
          turn: 1,
          actorCharacterId: owner.id
        }
      }
    })).resolves.toMatchObject({
      payloadKey: "item.loot-v1-c013",
      origin: "manual-item-committed"
    });
  });

  it("keeps one terminal settlement plan and replays participant receipts independently", async () => {
    await seedParty(prisma, "group-settlement", [1193n, 1194n]);
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1193n,
      partyInviteToken: "group-settlement",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const active = "session" in started ? started.session : null;
    expect(active).not.toBeNull();
    const terminalState = structuredClone(active!.state);
    terminalState.enemies.forEach((enemy) => { enemy.hp = 1; });
    await prisma.groupCombatSession.update({
      where: { id: active!.id },
      data: { stateJson: terminalState as unknown as Prisma.InputJsonValue }
    });
    await repository.submitActionForTelegramUser({
      telegramUserId: active!.participants[0]!.telegramUserId,
      partyInviteToken: "group-settlement",
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: terminalState.enemies[0]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
    });
    let terminal = await repository.submitActionForTelegramUser({
      telegramUserId: active!.participants[1]!.telegramUserId,
      partyInviteToken: "group-settlement",
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: terminalState.enemies[1]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
    });
    for (let attempt = 0; terminal.state === "resolved" && attempt < 23; attempt += 1) {
      const nextSession = terminal.session;
      for (const participant of nextSession.participants) {
        const target = nextSession.state.enemies.find((enemy) => enemy.hp > 0);
        if (!target) {
          break;
        }
        terminal = await repository.submitActionForTelegramUser({
          telegramUserId: participant.telegramUserId,
          partyInviteToken: nextSession.partyInviteToken,
          turn: nextSession.turn,
          action: "attack",
          targetKind: "enemy",
          targetId: target.id,
          now: new Date(NOW.getTime() + attempt + 1),
          nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
        });
        if (terminal.state === "terminal") {
          break;
        }
      }
    }
    expect(terminal.state).toBe("terminal");
    const storedPlan = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: active!.id },
      select: { settlementPlanJson: true }
    });
    const first = await repository.settleParticipant({
      sessionId: active!.id,
      telegramUserId: active!.participants[0]!.telegramUserId,
      now: NOW
    });
    const replay = await repository.settleParticipant({
      sessionId: active!.id,
      telegramUserId: active!.participants[0]!.telegramUserId,
      now: new Date(NOW.getTime() + 1_000)
    });
    const second = await repository.settleParticipant({
      sessionId: active!.id,
      telegramUserId: active!.participants[1]!.telegramUserId,
      now: new Date(NOW.getTime() + 2_000)
    });
    expect(first.state).toBe("settled");
    expect(replay).toEqual({ state: "replayed", receipt: "receipt" in first ? first.receipt : null });
    expect(second.state).toBe("settled");
    expect((await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: active!.id },
      select: { settlementPlanJson: true }
    })).settlementPlanJson).toEqual(storedPlan.settlementPlanJson);
  });

  it("accepts only a canonically committed item action as a frozen inventory decrement across restart", async () => {
    await seedParty(prisma, "group-field-kit-committed", [70_197n, 70_198n]);
    const actor = await prisma.character.findFirstOrThrow({
      where: { user: { telegramUserId: 70_197n } }
    });
    await prisma.character.update({ where: { id: actor.id }, data: { hpCurrent: 10, hpMax: 30 } });
    await prisma.characterItem.create({
      data: { characterId: actor.id, itemId: "item.field-kit", quantity: 1 }
    });
    const session = await startExistingPartyProof(repository, "group-field-kit-committed", 70_197n);
    const secondActor = session.participants[1]!;

    await expect(repository.submitActionForTelegramUser({
      telegramUserId: 70_197n,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "item",
      targetKind: "self",
      targetId: actor.id,
      payloadKey: "item.field-kit",
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });
    await expect(repository.submitActionForTelegramUser({
      telegramUserId: secondActor.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: secondActor.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "resolved", session: { turn: 2 } });

    expect(await prisma.characterItem.findUnique({
      where: { characterId_itemId: { characterId: actor.id, itemId: "item.field-kit" } }
    })).toBeNull();
    expect(await prisma.groupCombatAction.findUniqueOrThrow({
      where: {
        sessionId_turn_actorCharacterId: {
          sessionId: session.id,
          turn: 1,
          actorCharacterId: actor.id
        }
      },
      select: { actionKey: true, payloadKey: true, origin: true }
    })).toEqual({
      actionKey: "item",
      payloadKey: "item.field-kit",
      origin: "manual-item-committed"
    });

    const restarted = new PrismaGroupCombatRepository(prisma);
    expect(await restarted.findById(session.id)).toMatchObject({ status: "active", turn: 2 });
    const restartedState = (await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { stateJson: true }
    })).stateJson as { participants: Array<{
      characterId: string;
      hp: number;
      combatItemQuantities: Record<string, number>;
    }> };
    expect(restartedState.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        characterId: actor.id,
        hp: 33,
        combatItemQuantities: {}
      })
    ]));
  });

  it("fails closed and replays safely after a frozen field kit disappears during a Charokovalnia-style inventory mutation", async () => {
    await seedParty(prisma, "group-field-kit-drift", [1195n, 1196n]);
    const actor = await prisma.character.findFirstOrThrow({
      where: { user: { telegramUserId: 1195n } }
    });
    await prisma.character.update({ where: { id: actor.id }, data: { hpCurrent: 10, hpMax: 30 } });
    await prisma.characterItem.create({
      data: { characterId: actor.id, itemId: "item.field-kit", quantity: 1 }
    });
    const sated = makeSatedPayload(actor.id, new Date(NOW.getTime() - 60_000), "1195");
    await prisma.characterCooldown.create({
      data: {
        characterId: actor.id,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(sated.availableAt),
        resultJson: sated
      }
    });
    const session = await startExistingPartyProof(repository, "group-field-kit-drift", 1195n);
    const secondActor = session.participants[1]!;
    await expect(repository.submitActionForTelegramUser({
      telegramUserId: 1195n,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: actor.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    })).resolves.toMatchObject({ state: "queued" });
    const firstRound = await repository.submitActionForTelegramUser({
      telegramUserId: secondActor.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: secondActor.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(firstRound).toMatchObject({ state: "resolved", session: { turn: 2 } });
    expect((await prisma.groupCombatParticipant.findMany({
      where: { sessionId: session.id },
      select: { contributionJson: true }
    })).some((participant) => (
      (participant.contributionJson as { committedActions?: number }).committedActions === 1
    ))).toBe(true);

    await expect(repository.submitActionForTelegramUser({
      telegramUserId: 1195n,
      partyInviteToken: session.partyInviteToken,
      turn: 2,
      action: "item",
      targetKind: "self",
      targetId: actor.id,
      payloadKey: "item.field-kit",
      now: new Date(NOW.getTime() + 2),
      nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
    })).resolves.toMatchObject({ state: "queued" });
    await prisma.characterItem.delete({
      where: { characterId_itemId: { characterId: actor.id, itemId: "item.field-kit" } }
    });

    const restarted = new PrismaGroupCombatRepository(prisma);
    const invalidated = await restarted.submitActionForTelegramUser({
      telegramUserId: secondActor.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 2,
      action: "guard",
      targetKind: "self",
      targetId: secondActor.characterId,
      now: new Date(NOW.getTime() + 3),
      nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
    });
    const releasedOnce = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: actor.id, key: VARENYK_SATED_STATUS_KEY } }
    });
    const replay = await restarted.submitActionForTelegramUser({
      telegramUserId: secondActor.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 2,
      action: "guard",
      targetKind: "self",
      targetId: secondActor.characterId,
      now: new Date(NOW.getTime() + 4),
      nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
    });
    const releasedAfterReplay = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: actor.id, key: VARENYK_SATED_STATUS_KEY } }
    });
    const loaded = await restarted.findById(session.id);

    expect(invalidated.state).toBe("invalidated");
    expect(replay.state).toBe("terminal");
    expect(loaded).toMatchObject({
      status: "invalid",
      settlementPlan: { policy: "rewardless-proof", outcome: "invalid" }
    });
    expect(await restarted.listPendingDeliverySessionIds(93)).toContain(session.id);
    expect(await restarted.finalizeDeliveryAttempt({
      sessionId: session.id,
      expectedDeliveryRevision: loaded!.deliveryRevision,
      attemptedAt: new Date(NOW.getTime() + 5)
    })).toBe(true);
    expect(releasedAfterReplay).toEqual(releasedOnce);
    await expectInvalidatedRewardlessly(prisma, session.id);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(0);
    const stored = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: { orderBy: { rosterOrder: "asc" } } }
    });
    expect(stored.terminalIntegrityCheckedAt).toEqual(new Date(NOW.getTime() + 3));
    const invalidState = stored.stateJson as {
      enemyFocusVersion?: number;
      contributions: unknown[];
    };
    expect(invalidState.enemyFocusVersion).toBe(1);
    expect(stored.participants.map((participant) => participant.contributionJson))
      .toEqual(invalidState.contributions);
    expect(stored.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        settlementStatus: "pending",
        settlementAttempts: 0,
        settlementReceiptJson: null,
        settledAt: null
      })
    ]));
  });

  it.each([
    ["foreign-plan-participant", 20_010n],
    ["changed-plan-contribution", 20_020n],
    ["changed-plan-resources", 20_030n],
    ["wrong-receipt-identity", 20_040n],
    ["completed-without-receipt", 20_050n],
    ["pending-with-receipt", 20_060n]
  ] as const)("rebuilds shape-valid terminal settlement corruption without prematurely marking integrity for %s", async (kind, telegramId) => {
    const suffix = kind.replace(/[^a-z]/g, "").slice(0, 20);
    const terminal = await forceTerminalProof(
      prisma,
      repository,
      `group-settlement-${suffix}`,
      [telegramId, telegramId + 1n]
    );
    const row = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: terminal.id },
      include: { participants: { orderBy: { rosterOrder: "asc" } } }
    });
    const plan = structuredClone(row.settlementPlanJson) as NonNullable<typeof row.settlementPlanJson> & {
      participants: Array<{
        characterId: string;
        resources: { hp: number; mana: number };
        contribution: { characterId: string; damage: number };
      }>;
    };
    const first = row.participants[0]!;
    const second = row.participants[1]!;
    const canonicalReceipt = {
      version: 1,
      policy: "rewardless-proof",
      sessionId: terminal.id,
      characterId: first.characterId,
      remortCount: first.remortCount,
      rewards: { xp: 0, gold: 0, items: [] }
    };
    if (kind === "foreign-plan-participant") {
      plan.participants[0]!.characterId = "foreign-character";
      plan.participants[0]!.contribution.characterId = "foreign-character";
      await prisma.groupCombatSession.update({
        where: { id: terminal.id },
        data: { settlementPlanJson: plan, terminalIntegrityCheckedAt: null }
      });
    } else if (kind === "changed-plan-contribution") {
      plan.participants[0]!.contribution.damage += 1;
      await prisma.groupCombatSession.update({
        where: { id: terminal.id },
        data: { settlementPlanJson: plan, terminalIntegrityCheckedAt: null }
      });
    } else if (kind === "changed-plan-resources") {
      plan.participants[0]!.resources.hp += 1;
      await prisma.groupCombatSession.update({
        where: { id: terminal.id },
        data: { settlementPlanJson: plan, terminalIntegrityCheckedAt: null }
      });
    } else if (kind === "wrong-receipt-identity") {
      await prisma.groupCombatParticipant.update({
        where: { id: first.id },
        data: {
          settlementStatus: "completed",
          settlementAttempts: 1,
          settlementReceiptJson: {
            ...canonicalReceipt,
            characterId: second.characterId
          },
          settledAt: NOW
        }
      });
      await expect(repository.settleParticipant({
        sessionId: terminal.id,
        telegramUserId: terminal.participants[0]!.telegramUserId,
        now: NOW
      })).resolves.toEqual({ state: "invalid-plan" });
    } else if (kind === "completed-without-receipt") {
      await prisma.groupCombatParticipant.update({
        where: { id: first.id },
        data: {
          settlementStatus: "completed",
          settlementAttempts: 1,
          settlementReceiptJson: Prisma.DbNull,
          settledAt: NOW
        }
      });
    } else {
      await prisma.groupCombatParticipant.update({
        where: { id: first.id },
        data: {
          settlementStatus: "pending",
          settlementReceiptJson: canonicalReceipt,
          settledAt: null
        }
      });
    }

    if (kind !== "wrong-receipt-identity") {
      await repository.repairInvalidOrOrphaned(new Date(NOW.getTime() + 13), 93);
    }
    const repaired = await repository.findById(terminal.id);
    const repairedRow = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: terminal.id },
      include: { participants: { orderBy: { rosterOrder: "asc" } } }
    });
    expect(repaired?.settlementPlan).toEqual(buildGroupCombatSettlementPlan(repaired!.state));
    expect(repairedRow.terminalIntegrityCheckedAt).toBeNull();
    const repairedFirst = repairedRow.participants[0]!;
    if (kind === "pending-with-receipt") {
      expect(repairedFirst).toMatchObject({ settlementStatus: "pending", settledAt: null });
      expect(repairedFirst.settlementReceiptJson).toBeNull();
    } else if (kind === "wrong-receipt-identity" || kind === "completed-without-receipt") {
      expect(repairedFirst.settlementStatus).toBe("completed");
      expect(repairedFirst.settlementReceiptJson).toEqual(canonicalReceipt);
      await expect(repository.settleParticipant({
        sessionId: terminal.id,
        telegramUserId: terminal.participants[0]!.telegramUserId,
        now: new Date(NOW.getTime() + 14)
      })).resolves.toMatchObject({
        state: "replayed",
        receipt: {
          sessionId: terminal.id,
          characterId: first.characterId,
          remortCount: first.remortCount,
          rewards: { xp: 0, gold: 0, items: [] }
        }
      });
    }
  });

  it("canonicalizes terminal pending attempts before a later integrity checkpoint without changing completed settlement", async () => {
    const terminal = await forceTerminalProof(
      prisma,
      repository,
      "group-terminal-pending-attempts",
      [20_070n, 20_071n]
    );
    const row = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: terminal.id },
      include: { participants: { orderBy: { rosterOrder: "asc" } } }
    });
    const first = row.participants[0]!;
    const second = row.participants[1]!;
    const completedAt = new Date(NOW.getTime() - 13_000);
    const completedReceipt = {
      version: 1,
      policy: "rewardless-proof",
      sessionId: terminal.id,
      characterId: second.characterId,
      remortCount: second.remortCount,
      rewards: { xp: 0, gold: 0, items: [] }
    };
    await prisma.groupCombatParticipant.update({
      where: { id: first.id },
      data: {
        settlementStatus: "pending",
        settlementAttempts: 13,
        settlementReceiptJson: Prisma.DbNull,
        settledAt: null
      }
    });
    await prisma.groupCombatParticipant.update({
      where: { id: second.id },
      data: {
        settlementStatus: "completed",
        settlementAttempts: 13,
        settlementReceiptJson: completedReceipt,
        settledAt: completedAt
      }
    });

    const firstRepairAt = new Date(NOW.getTime() + 13);
    expect(await repository.repairInvalidOrOrphaned(firstRepairAt, 93)).toBeGreaterThanOrEqual(1);
    const afterFirstRepair = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: terminal.id },
      include: { participants: { orderBy: { rosterOrder: "asc" } } }
    });
    expect(afterFirstRepair.terminalIntegrityCheckedAt).toBeNull();
    expect(afterFirstRepair.participants[0]).toMatchObject({
      settlementStatus: "pending",
      settlementAttempts: 0,
      settlementReceiptJson: null,
      settledAt: null
    });
    expect(afterFirstRepair.participants[1]).toMatchObject({
      settlementStatus: "completed",
      settlementAttempts: 13,
      settlementReceiptJson: completedReceipt,
      settledAt: completedAt
    });

    const secondRepairAt = new Date(NOW.getTime() + 14);
    await repository.repairInvalidOrOrphaned(secondRepairAt, 93);
    const afterSecondRepair = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: terminal.id },
      include: { participants: { orderBy: { rosterOrder: "asc" } } }
    });
    expect(afterSecondRepair.terminalIntegrityCheckedAt).toEqual(secondRepairAt);
    expect(afterSecondRepair.participants[1]).toMatchObject({
      settlementStatus: "completed",
      settlementAttempts: 13,
      settlementReceiptJson: completedReceipt,
      settledAt: completedAt
    });
    await expect(repository.settleParticipant({
      sessionId: terminal.id,
      telegramUserId: terminal.participants[1]!.telegramUserId,
      now: new Date(NOW.getTime() + 15)
    })).resolves.toEqual({ state: "replayed", receipt: completedReceipt });
  });

  it("CAS-invalidates malformed state, releases all leases, and writes only rewardless proof", async () => {
    await seedParty(prisma, "group-broken", [1301n, 1302n, 1303n]);
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1301n,
      partyInviteToken: "group-broken",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(started.state).toBe("started");
    const sessionId = "session" in started ? started.session.id : "";
    await prisma.groupCombatSession.update({
      where: { id: sessionId },
      data: { rulesVersion: "group-combat.future" }
    });

    expect(await repository.repairInvalidOrOrphaned(NOW, 93)).toBeGreaterThanOrEqual(1);
    const row = await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row.status).toBe("invalid");
    expect(row.resultJson).toEqual({
      kind: "rewardless-proof",
      outcome: "invalid",
      completedTurn: 1,
      rewards: { xp: 0, gold: 0, items: [] }
    });
    expect(await prisma.activeCombatLease.count({ where: { referenceId: sessionId } })).toBe(0);
    expect(await prisma.partySession.findFirstOrThrow({ where: { inviteToken: "group-broken" }, select: { status: true } })).toEqual({ status: "completed" });
    expect(row.deliveryPending).toBe(true);
    expect(row.deliveryRevision).toBeGreaterThan(1);
  });

  it("canonically upgrades a realistic group-combat.v1 row with nonzero legacy contributions", async () => {
    const session = await startProof(prisma, repository, "group-legacy-v1", [1304n, 1305n]);
    const legacyState = structuredClone(session.state) as unknown as Record<string, unknown>;
    legacyState.rulesVersion = "group-combat.v1";
    for (const participant of legacyState.participants as Array<Record<string, unknown>>) {
      delete participant.stats;
      delete participant.combatItems;
    }
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: {
        rulesVersion: "group-combat.v1",
        stateJson: legacyState as Prisma.InputJsonValue,
        terminalIntegrityCheckedAt: null
      }
    });
    for (const [index, participant] of session.participants.entries()) {
      await prisma.groupCombatParticipant.updateMany({
        where: { sessionId: session.id, characterId: participant.characterId },
        data: {
          contributionJson: {
            characterId: participant.characterId,
            damage: 13 + index,
            healing: 5,
            turns: 1
          }
        }
      });
    }

    expect(await repository.repairInvalidOrOrphaned(NOW, 93)).toBeGreaterThanOrEqual(1);
    const restarted = new PrismaGroupCombatRepository(prisma);
    const loaded = await restarted.findById(session.id);
    expect(loaded).toMatchObject({
      status: "invalid",
      result: { kind: "rewardless-proof", outcome: "invalid" },
      deliveryPending: true
    });
    expect(await restarted.listPendingDeliverySessionIds(93)).toContain(session.id);
    expect(await restarted.finalizeDeliveryAttempt({
      sessionId: session.id,
      expectedDeliveryRevision: loaded!.deliveryRevision,
      attemptedAt: new Date(NOW.getTime() + 1)
    })).toBe(true);
    const afterFirstPass = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: { orderBy: { rosterOrder: "asc" } } }
    });
    expect(afterFirstPass.terminalIntegrityCheckedAt).toEqual(NOW);
    expect(afterFirstPass.participants.every((participant) => (
      participant.settlementStatus === "pending" &&
      participant.settlementAttempts === 0 &&
      participant.settlementReceiptJson === null &&
      participant.settledAt === null
    ))).toBe(true);

    await restarted.repairInvalidOrOrphaned(new Date(NOW.getTime() + 2), 93);
    const afterSecondPass = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: { orderBy: { rosterOrder: "asc" } } }
    });
    expect({
      version: afterSecondPass.version,
      deliveryRevision: afterSecondPass.deliveryRevision,
      terminalIntegrityCheckedAt: afterSecondPass.terminalIntegrityCheckedAt,
      stateJson: afterSecondPass.stateJson,
      participants: afterSecondPass.participants.map((participant) => ({
        contributionJson: participant.contributionJson,
        settlementStatus: participant.settlementStatus,
        settlementAttempts: participant.settlementAttempts,
        settlementReceiptJson: participant.settlementReceiptJson,
        settledAt: participant.settledAt
      }))
    }).toEqual({
      version: afterFirstPass.version,
      deliveryRevision: afterFirstPass.deliveryRevision,
      terminalIntegrityCheckedAt: afterFirstPass.terminalIntegrityCheckedAt,
      stateJson: afterFirstPass.stateJson,
      participants: afterFirstPass.participants.map((participant) => ({
        contributionJson: participant.contributionJson,
        settlementStatus: participant.settlementStatus,
        settlementAttempts: participant.settlementAttempts,
        settlementReceiptJson: participant.settlementReceiptJson,
        settledAt: participant.settledAt
      }))
    });
  });

  it("clears malformed active settlement metadata before integrity-checking invalidation", async () => {
    const session = await startProof(prisma, repository, "group-active-settlement-corrupt", [1306n, 1307n]);
    const first = await prisma.groupCombatParticipant.findFirstOrThrow({
      where: { sessionId: session.id },
      orderBy: { rosterOrder: "asc" }
    });
    await prisma.groupCombatParticipant.update({
      where: { id: first.id },
      data: {
        settlementStatus: "completed",
        settlementAttempts: 13,
        settlementReceiptJson: {
          kind: "group-combat-settlement-receipt.v1",
          sessionId: "foreign-session",
          characterId: "foreign-character",
          remortCount: 93,
          rewards: { xp: 587, gold: 42, items: [] }
        },
        settledAt: NOW
      }
    });

    const invalidated = await repository.submitActionForTelegramUser({
      telegramUserId: session.participants[1]!.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: session.participants[1]!.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(invalidated.state).toBe("invalidated");
    const loaded = await repository.findById(session.id);
    expect(loaded?.status).toBe("invalid");
    const stored = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: true }
    });
    expect(stored.terminalIntegrityCheckedAt).toEqual(NOW);
    expect(stored.participants.every((participant) => (
      participant.settlementStatus === "pending" &&
      participant.settlementAttempts === 0 &&
      participant.settlementReceiptJson === null &&
      participant.settledAt === null
    ))).toBe(true);
  });

  it.each([13, -1])(
    "invalidates an active v2 row whose pending settlement attempts are %i and resets them to zero",
    async (settlementAttempts) => {
      const suffix = settlementAttempts < 0 ? "negative" : "positive";
      const telegramBase = settlementAttempts < 0 ? 20_080n : 20_082n;
      const session = await startProof(
        prisma,
        repository,
        `group-active-pending-attempts-${suffix}`,
        [telegramBase, telegramBase + 1n]
      );
      const first = await prisma.groupCombatParticipant.findFirstOrThrow({
        where: { sessionId: session.id },
        orderBy: { rosterOrder: "asc" }
      });
      await prisma.groupCombatParticipant.update({
        where: { id: first.id },
        data: {
          settlementStatus: "pending",
          settlementAttempts,
          settlementReceiptJson: Prisma.DbNull,
          settledAt: null
        }
      });

      expect(await repository.repairInvalidOrOrphaned(NOW, 93)).toBeGreaterThanOrEqual(1);
      const repaired = await prisma.groupCombatSession.findUniqueOrThrow({
        where: { id: session.id },
        include: { participants: true }
      });
      expect(repaired.status).toBe("invalid");
      expect(repaired.terminalIntegrityCheckedAt).toEqual(NOW);
      expect(repaired.participants.every((participant) => (
        participant.settlementStatus === "pending"
        && participant.settlementAttempts === 0
        && participant.settlementReceiptJson === null
        && participant.settledAt === null
      ))).toBe(true);
      expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(0);
    }
  );

  it("invalidates a shape-valid state whose roster is foreign to the relational participants", async () => {
    const session = await startProof(prisma, repository, "group-foreign-state", [1311n, 1312n]);
    await seedParty(prisma, "group-foreign-source", [1313n, 1314n]);
    const foreignCharacterId = "group-foreign-source-user-0-character";
    const state = structuredClone(session.state);
    state.participants[0]!.characterId = foreignCharacterId;
    state.participants[0]!.telegramUserId = "1313";
    state.contributions[0]!.characterId = foreignCharacterId;
    await prisma.groupCombatSession.update({ where: { id: session.id }, data: { stateJson: state } });

    const result = await repository.submitActionForTelegramUser({
      telegramUserId: session.participants[0]!.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: session.participants[0]!.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(result.state).toBe("invalidated");
    await expectInvalidatedRewardlessly(prisma, session.id);
  });

  it.each(["status", "turn", "encounter", "life"] as const)(
    "invalidates a state whose persisted %s no longer matches its relational session",
    async (mismatch) => {
      const index = ["status", "turn", "encounter", "life"].indexOf(mismatch);
      const token = `group-session-mismatch-${mismatch}`;
      const session = await startProof(prisma, repository, token, [1601n + BigInt(index * 2), 1602n + BigInt(index * 2)]);
      if (mismatch === "status") {
        await prisma.groupCombatSession.update({ where: { id: session.id }, data: { status: "won" } });
      } else if (mismatch === "turn") {
        await prisma.groupCombatSession.update({ where: { id: session.id }, data: { turn: 2 } });
      } else if (mismatch === "encounter") {
        await prisma.groupCombatSession.update({ where: { id: session.id }, data: { encounterKey: "foreign-encounter" } });
      } else {
        const characterId = session.participants[0]!.characterId;
        await prisma.characterRemort.create({
          data: {
            characterId,
            token: `${token}-remort`,
            remortNumber: 1,
            previousLevel: 3,
            previousXp: 42,
            previousGold: 93,
            displayNameSnapshot: "Попереднє життя",
            preservedPayloadJson: {}
          }
        });
      }

      const result = await repository.submitActionForTelegramUser({
        telegramUserId: session.participants[0]!.telegramUserId,
        partyInviteToken: token,
        turn: 1,
        action: "guard",
        targetKind: "self",
        targetId: session.participants[0]!.characterId,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      });

      expect(result.state).toBe("invalidated");
      await expectInvalidatedRewardlessly(prisma, session.id);
    }
  );

  it.each([
    ["missing", async (db: PrismaClient, sessionId: string, characterId: string) => {
      await db.activeCombatLease.delete({ where: { characterId } });
    }],
    ["mismatched", async (db: PrismaClient, _sessionId: string, characterId: string) => {
      await db.activeCombatLease.update({
        where: { characterId },
        data: { kind: "solo-combat", referenceId: "foreign-solo-session" }
      });
    }]
  ])("rewardlessly invalidates a session with a %s participant lease", async (variant, mutateLease) => {
    const token = `group-lease-${variant}`;
    const session = await startProof(prisma, repository, token, [1321n + BigInt(variant.length), 1331n + BigInt(variant.length)]);
    await mutateLease(prisma, session.id, session.participants[0]!.characterId);

    const result = await repository.submitActionForTelegramUser({
      telegramUserId: session.participants[1]!.telegramUserId,
      partyInviteToken: token,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: session.participants[1]!.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(result.state).toBe("invalidated");
    await expectInvalidatedRewardlessly(prisma, session.id);
  });

  it("invalidates an active session when its lease is owned by a non-participant", async () => {
    const session = await startProof(prisma, repository, "group-wrong-lease-owner", [1541n, 1542n]);
    await seedParty(prisma, "group-wrong-lease-outsider", [1543n, 1544n]);
    await prisma.activeCombatLease.create({
      data: {
        characterId: "group-wrong-lease-outsider-user-0-character",
        kind: "group-combat",
        referenceId: session.id
      }
    });

    const result = await repository.resolveTimedOutSession({
      sessionId: session.id,
      now: new Date(NOW.getTime() + 23_001),
      nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
    });

    expect(result.state).toBe("invalidated");
    await expectInvalidatedRewardlessly(prisma, session.id);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(0);
  });

  it.each(["actor", "target", "retired-aid"] as const)(
    "invalidates a persisted current-turn action with a malformed %s",
    async (malformed) => {
      const token = `group-malformed-action-${malformed}`;
      const ids = malformed === "actor"
        ? [1351n, 1352n]
        : malformed === "target"
          ? [1361n, 1362n]
          : [1365n, 1366n];
      const session = await startProof(prisma, repository, token, ids, new Date(NOW.getTime() - 1));
      let actorCharacterId = session.participants[0]!.characterId;
      let actionKey = "attack";
      let targetKind = "enemy";
      let targetId = session.state.enemies[0]!.id;
      if (malformed === "actor") {
        await seedParty(prisma, "group-action-outsider", [1363n, 1364n]);
        actorCharacterId = "group-action-outsider-user-0-character";
      } else if (malformed === "target") {
        targetId = "enemy-that-is-not-canonical";
      } else {
        actionKey = "aid";
        targetKind = "ally";
        targetId = session.participants[1]!.characterId;
      }
      await prisma.groupCombatAction.create({
        data: {
          sessionId: session.id,
          actorCharacterId,
          turn: 1,
          actionKey,
          targetKind,
          targetId,
          origin: "manual",
          submittedAt: NOW
        }
      });

      const result = await repository.resolveTimedOutSession({
        sessionId: session.id,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      });

      expect(result.state).toBe("invalidated");
      await expectInvalidatedRewardlessly(prisma, session.id);
    }
  );

  it.each(["missing", "malformed"] as const)(
    "repairs a %s terminal result after repository restart",
    async (resultKind) => {
      const token = `group-terminal-${resultKind}`;
      const ids = resultKind === "missing" ? [1371n, 1372n] : [1381n, 1382n];
      const session = await startProof(prisma, repository, token, ids);
      const terminalState = {
        ...structuredClone(session.state),
        status: "won" as const,
        enemies: session.state.enemies.map((enemy) => ({ ...enemy, hp: 0 }))
      };
      await prisma.groupCombatSession.update({
        where: { id: session.id },
        data: {
          status: "won",
          stateJson: terminalState,
          resultJson: resultKind === "missing" ? undefined : { kind: "broken-result" },
          completedAt: resultKind === "missing" ? null : NOW
        }
      });

      const restarted = new PrismaGroupCombatRepository(prisma);
      const replay = await restarted.resolveTimedOutSession({
        sessionId: session.id,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      });

      expect(replay.state).toBe("stale");
      const repaired = await restarted.findById(session.id);
      expect(repaired).toMatchObject({
        status: "won",
        result: {
          kind: "rewardless-proof",
          outcome: "won",
          completedTurn: 1,
          rewards: { xp: 0, gold: 0, items: [] }
        }
      });
      expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(0);
      expect(await prisma.partySession.findUniqueOrThrow({ where: { id: session.partySessionId } })).toMatchObject({ status: "completed" });
    }
  );

  it("continues from a corrupted due session to a later healthy due session", async () => {
    const corrupted = await startProof(prisma, repository, "group-due-corrupted", [1391n, 1392n], new Date(NOW.getTime() - 2));
    const healthy = await startProof(prisma, repository, "group-due-healthy", [1393n, 1394n], new Date(NOW.getTime() - 1));
    await prisma.groupCombatSession.update({ where: { id: corrupted.id }, data: { stateJson: {} } });
    const service = new GroupCombatService(repository, { enabled: true, devHelpersEnabled: true }, () => NOW);

    const results = await service.resolveDue(13);

    expect(results.map((result) => result.id)).toContain(healthy.id);
    expect((await repository.findById(corrupted.id))?.status).toBe("invalid");
    expect((await repository.findById(healthy.id))?.turn).toBe(2);
  });

  it("repairs relational participant loss outside the live 2-3 roster fallback", async () => {
    const session = await startProof(prisma, repository, "group-lost-participant", [1401n, 1402n], new Date(NOW.getTime() - 1));
    await prisma.groupCombatParticipant.delete({
      where: { sessionId_characterId: { sessionId: session.id, characterId: session.participants[1]!.characterId } }
    });

    expect(await repository.repairInvalidOrOrphaned(NOW, 93)).toBeGreaterThanOrEqual(1);
    const repaired = await repository.findById(session.id);
    expect(repaired?.state.status).toBe("invalid");
    expect(repaired?.state.participants).toHaveLength(1);
    await expectInvalidatedRewardlessly(prisma, session.id);
  });

  it("canonically invalidates and replays a four-participant corrupted relational roster", async () => {
    const session = await startProof(
      prisma,
      repository,
      "group-four-corrupted",
      [70_101n, 70_102n],
      new Date(NOW.getTime() - 2)
    );
    const [third, fourth] = await appendCorruptedParticipants(
      prisma,
      session,
      "group-four-corrupted-extra",
      [70_103n, 70_104n],
      { satedIndex: 1 }
    );
    await prisma.groupCombatParticipant.updateMany({
      where: { sessionId: session.id },
      data: {
        contributionJson: {
          characterId: "foreign-contribution",
          damage: 93,
          healing: 42,
          guardPrevented: 23,
          control: 13,
          damageTaken: 42,
          committedActions: 3,
          guardedTurns: 1
        },
        settlementStatus: "completed",
        settlementAttempts: 13,
        settlementReceiptJson: {
          version: 1,
          policy: "rewardless-proof",
          sessionId: "foreign-session",
          characterId: "foreign-character",
          remortCount: 93,
          rewards: { xp: 0, gold: 0, items: [] }
        },
        settledAt: new Date(NOW.getTime() - 93_000)
      }
    });
    const healthy = await startProof(
      prisma,
      repository,
      "group-four-corrupted-healthy",
      [70_105n, 70_106n],
      new Date(NOW.getTime() - 1)
    );

    await expect(repository.repairInvalidOrOrphaned(NOW, 93)).resolves.toBeGreaterThanOrEqual(1);
    const stored = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: { orderBy: [{ rosterOrder: "asc" }, { id: "asc" }] } }
    });
    const state = stored.stateJson as {
      participants: Array<{ characterId: string; telegramUserId: string; rosterOrder: number; remortCount: number }>;
      contributions: unknown[];
    };
    const plan = stored.settlementPlanJson as {
      participants: Array<{
        characterId: string;
        remortCount: number;
        rosterOrder: number;
        contribution: unknown;
        rewards: { xp: number; gold: number; items: unknown[] };
      }>;
    };
    const relationalIdentity = stored.participants.map((participant) => ({
      characterId: participant.characterId,
      remortCount: participant.remortCount,
      rosterOrder: participant.rosterOrder
    }));

    expect(stored.status).toBe("invalid");
    expect(stored.terminalIntegrityCheckedAt).toEqual(NOW);
    expect(state.participants).toHaveLength(4);
    expect(state.participants.map(({ characterId, remortCount, rosterOrder }) => ({
      characterId,
      remortCount,
      rosterOrder
    }))).toEqual(relationalIdentity);
    expect(plan.participants.map(({ characterId, remortCount, rosterOrder }) => ({
      characterId,
      remortCount,
      rosterOrder
    }))).toEqual(relationalIdentity);
    expect(stored.participants.map((participant) => participant.contributionJson)).toEqual(state.contributions);
    expect(plan.participants.map((participant) => participant.contribution)).toEqual(state.contributions);
    expect(plan.participants.every((participant) => (
      participant.rewards.xp === 0
      && participant.rewards.gold === 0
      && participant.rewards.items.length === 0
    ))).toBe(true);
    expect(stored.participants.every((participant) => (
      participant.settlementStatus === "pending"
      && participant.settlementAttempts === 0
      && participant.settlementReceiptJson === null
      && participant.settledAt === null
    ))).toBe(true);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(0);
    expect((await prisma.partySession.findUniqueOrThrow({ where: { id: session.partySessionId } })).status)
      .toBe("completed");

    const releasedOnce = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: fourth.characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    const restarted = new PrismaGroupCombatRepository(prisma);
    let loaded = await restarted.findById(session.id);
    expect(loaded?.participants).toHaveLength(4);
    expect(await restarted.listPendingDeliverySessionIds(93)).toContain(session.id);
    for (const [index, participant] of loaded!.participants.entries()) {
      await expect(restarted.compareAndSetParticipantCard({
        sessionId: session.id,
        telegramUserId: participant.telegramUserId,
        expectedReferenceVersion: participant.referenceVersion,
        chatId: participant.telegramUserId,
        messageId: 700 + index
      })).resolves.toBe(true);
      loaded = await restarted.findById(session.id);
      const claimed = loaded!.participants.find((row) => row.characterId === participant.characterId)!;
      await expect(restarted.markParticipantCardDelivered({
        sessionId: session.id,
        telegramUserId: participant.telegramUserId,
        expectedDeliveryRevision: loaded!.deliveryRevision,
        expectedReferenceVersion: claimed.referenceVersion,
        chatId: claimed.chatId!,
        messageId: claimed.messageId!
      })).resolves.toBe(true);
    }
    loaded = await restarted.findById(session.id);
    await expect(restarted.finalizeDeliveryAttempt({
      sessionId: session.id,
      expectedDeliveryRevision: loaded!.deliveryRevision,
      attemptedAt: new Date(NOW.getTime() + 1)
    })).resolves.toBe(true);

    for (const participant of loaded!.participants) {
      const settled = await restarted.settleParticipant({
        sessionId: session.id,
        telegramUserId: participant.telegramUserId,
        now: new Date(NOW.getTime() + 2)
      });
      expect(settled).toMatchObject({ state: "settled", receipt: { characterId: participant.characterId } });
      await expect(restarted.settleParticipant({
        sessionId: session.id,
        telegramUserId: participant.telegramUserId,
        now: new Date(NOW.getTime() + 3)
      })).resolves.toEqual({ state: "replayed", receipt: "receipt" in settled ? settled.receipt : null });
    }

    const beforeSecondRepair = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: { orderBy: [{ rosterOrder: "asc" }, { id: "asc" }] } }
    });
    await expect(restarted.repairInvalidOrOrphaned(new Date(NOW.getTime() + 4), 93)).resolves.toBeGreaterThanOrEqual(0);
    const afterSecondRepair = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: { orderBy: [{ rosterOrder: "asc" }, { id: "asc" }] } }
    });
    expect(afterSecondRepair).toEqual(beforeSecondRepair);
    expect(await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: fourth.characterId, key: VARENYK_SATED_STATUS_KEY } }
    })).toEqual(releasedOnce);
    expect(third.rosterOrder).toBe(2);

    const dueService = new GroupCombatService(
      restarted,
      { enabled: true, devHelpersEnabled: true },
      () => new Date(NOW.getTime() + 5)
    );
    const due = await dueService.resolveDue(13);
    expect(due.map((result) => result.id)).toContain(healthy.id);
    expect((await restarted.findById(healthy.id))?.turn).toBe(2);
  });

  it("bounds unrepresentable invalid repair rosters and releases discarded participant resources", async () => {
    const session = await startProof(prisma, repository, "group-over-repair-cap", [71_001n, 71_002n]);
    const extras = await appendCorruptedParticipants(
      prisma,
      session,
      "group-over-repair-cap-extra",
      Array.from({ length: 12 }, (_, index) => 71_003n + BigInt(index)),
      { satedIndex: 11 }
    );
    const discarded = extras.at(-1)!;

    await expect(repository.repairInvalidOrOrphaned(NOW, 93)).resolves.toBeGreaterThanOrEqual(1);
    const stored = await prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { participants: { orderBy: [{ rosterOrder: "asc" }, { id: "asc" }] } }
    });
    const state = stored.stateJson as { participants: Array<{ characterId: string }>; contributions: unknown[] };
    const plan = stored.settlementPlanJson as { participants: Array<{ characterId: string; rewards: unknown }> };

    expect(stored.status).toBe("invalid");
    expect(stored.terminalIntegrityCheckedAt).toEqual(NOW);
    expect(stored.participants).toHaveLength(13);
    expect(Buffer.byteLength(JSON.stringify(stored.stateJson), "utf8"))
      .toBeLessThanOrEqual(GROUP_COMBAT_STATE_BYTE_LIMIT);
    expect(state.participants.map((participant) => participant.characterId))
      .toEqual(stored.participants.map((participant) => participant.characterId));
    expect(plan.participants.map((participant) => participant.characterId))
      .toEqual(stored.participants.map((participant) => participant.characterId));
    expect(stored.participants.map((participant) => participant.contributionJson)).toEqual(state.contributions);
    expect(stored.participants.some((participant) => participant.characterId === discarded.characterId)).toBe(false);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(0);
    const releasedDiscardedStatus = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId: discarded.characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect(Date.parse((releasedDiscardedStatus.resultJson as { cursorAt: string }).cursorAt))
      .toBeGreaterThan(NOW.getTime() - 60_000);
  });

  it("releases the owned lease and frozen timed status exactly once after terminal CAS", async () => {
    const token = "group-exact-release";
    await seedParty(prisma, token, [1411n, 1412n]);
    const characterId = `${token}-user-0-character`;
    const sated = makeSatedPayload(characterId, new Date(NOW.getTime() - 60_000));
    await prisma.characterCooldown.create({
      data: {
        characterId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(sated.availableAt),
        resultJson: sated
      }
    });
    const session = await startExistingPartyProof(repository, token, 1411n);
    await prisma.groupCombatSession.update({ where: { id: session.id }, data: { rulesVersion: "broken-rules" } });

    const first = await repository.submitActionForTelegramUser({
      telegramUserId: 1411n,
      partyInviteToken: token,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const releasedOnce = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    const second = await repository.submitActionForTelegramUser({
      telegramUserId: 1411n,
      partyInviteToken: token,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: characterId,
      now: new Date(NOW.getTime() + 1_000),
      nextTurnExpiresAt: new Date(NOW.getTime() + 24_000)
    });
    const releasedTwice = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });

    expect(first.state).toBe("invalidated");
    expect(second.state).toBe("terminal");
    expect(releasedTwice).toEqual(releasedOnce);
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(0);
    await expectInvalidatedRewardlessly(prisma, session.id);
  });

  it("repairs an older malformed terminal despite a full newer healthy window", async () => {
    await checkpointExistingTerminalHistory(prisma);
    const { sessions, malformed } = await seedTerminalIntegrityHistory(
      prisma,
      repository,
      "group-terminal-older",
      50_000n,
      0
    );

    await expect(repository.repairInvalidOrOrphaned(NOW, 13)).resolves.toBeGreaterThanOrEqual(1);
    const repaired = await repository.findById(malformed.id);
    expect(repaired).toMatchObject({
      status: "won",
      result: { kind: "rewardless-proof", outcome: "won", completedTurn: malformed.turn },
      deliveryPending: true
    });
    expect((await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: malformed.id } })).terminalIntegrityCheckedAt)
      .toBeNull();
    await repository.repairInvalidOrOrphaned(new Date(NOW.getTime() + 1), 13);
    expect((await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: malformed.id } })).terminalIntegrityCheckedAt)
      .toEqual(new Date(NOW.getTime() + 1));

    const newestHealthy = sessions.at(-1)!;
    expect((await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: newestHealthy.id } })).terminalIntegrityCheckedAt)
      .toEqual(new Date(NOW.getTime() + 1));
  });

  it("durably rotates past older healthy terminals to repair a newer pending-delivery terminal", async () => {
    await checkpointExistingTerminalHistory(prisma);
    const { sessions, malformed } = await seedTerminalIntegrityHistory(
      prisma,
      repository,
      "group-terminal-newer",
      60_000n,
      13
    );
    const firstPassAt = new Date(NOW.getTime() + 2);
    const secondPassAt = new Date(NOW.getTime() + 3);

    queries.length = 0;
    await repository.repairInvalidOrOrphaned(firstPassAt, 13);
    const firstPassQueries = queries.length;
    const afterFirstPass = await prisma.groupCombatSession.findMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      orderBy: { updatedAt: "asc" },
      select: { id: true, terminalIntegrityCheckedAt: true }
    });
    expect(afterFirstPass.filter((row) => row.terminalIntegrityCheckedAt?.getTime() === firstPassAt.getTime()))
      .toHaveLength(13);
    expect(afterFirstPass.find((row) => row.id === malformed.id)?.terminalIntegrityCheckedAt).toBeNull();
    expect(await repository.listPendingDeliverySessionIds(93)).toContain(malformed.id);

    const restartedRepository = new PrismaGroupCombatRepository(prisma);
    const restartedService = new GroupCombatService(
      restartedRepository,
      { enabled: true, devHelpersEnabled: true },
      () => secondPassAt
    );
    expect((await restartedService.listPendingDelivery(93)).map((session) => session.id)).not.toContain(malformed.id);

    await expect(restartedRepository.repairInvalidOrOrphaned(secondPassAt, 13))
      .resolves.toBeGreaterThanOrEqual(1);
    const repaired = await restartedRepository.findById(malformed.id);
    expect(repaired).toMatchObject({
      status: "won",
      result: { kind: "rewardless-proof", outcome: "won", completedTurn: malformed.turn },
      deliveryPending: true
    });
    expect((await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: malformed.id } })).terminalIntegrityCheckedAt)
      .toBeNull();
    expect((await restartedService.listPendingDelivery(93)).map((session) => session.id)).toContain(malformed.id);

    await restartedRepository.repairInvalidOrOrphaned(new Date(NOW.getTime() + 4), 13);
    expect((await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: malformed.id } })).terminalIntegrityCheckedAt)
      .toEqual(new Date(NOW.getTime() + 4));
    const checkpointBeforeRepeat = await prisma.groupCombatSession.findMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      orderBy: { id: "asc" },
      select: { id: true, terminalIntegrityCheckedAt: true }
    });
    queries.length = 0;
    await restartedRepository.repairInvalidOrOrphaned(new Date(NOW.getTime() + 5), 13);
    const repeatedPassQueries = queries.length;
    expect(repeatedPassQueries).toBeLessThan(firstPassQueries);
    expect(await prisma.groupCombatSession.findMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      orderBy: { id: "asc" },
      select: { id: true, terminalIntegrityCheckedAt: true }
    })).toEqual(checkpointBeforeRepeat);
  });

  it("does not let thirteen older quarantined rows consume bounded runtime queue capacity", async () => {
    await prisma.groupCombatSession.updateMany({
      where: { repairState: null },
      data: {
        deliveryPending: false,
        turnExpiresAt: new Date(NOW.getTime() + 600_000)
      }
    });
    const quarantinedIds: string[] = [];
    const quarantineCharacterIds: string[] = [];
    for (let index = 0; index < 13; index += 1) {
      const token = `group-quarantine-capacity-${index}`;
      const firstTelegramId = 900_000n + BigInt(index * 2);
      await seedParty(prisma, token, [firstTelegramId, firstTelegramId + 1n]);
      const started = await repository.startProofForTelegramUser({
        telegramUserId: firstTelegramId,
        partyInviteToken: token,
        now: NOW,
        turnExpiresAt: new Date(NOW.getTime() - 60_000 + index)
      });
      if (!("session" in started)) {
        throw new Error(`Expected quarantine capacity session, received ${started.state}.`);
      }
      quarantinedIds.push(started.session.id);
      quarantineCharacterIds.push(
        ...started.session.participants.map((participant) => participant.characterId)
      );
      await prisma.groupCombatSession.update({
        where: { id: started.session.id },
        data: {
          repairState: "operator-required",
          repairReason: `capacity-quarantine-${index}`,
          deliveryPending: true,
          deliveryAttemptedAt: new Date(NOW.getTime() - 120_000 + index),
          turnExpiresAt: new Date(NOW.getTime() - 120_000 + index),
          updatedAt: new Date(NOW.getTime() - 120_000 + index)
        }
      });
      await prisma.activeCombatLease.updateMany({
        where: { referenceId: started.session.id },
        data: { updatedAt: new Date(NOW.getTime() - 120_000 + index) }
      });
    }

    await seedParty(prisma, "group-quarantine-healthy", [901_001n, 901_002n]);
    const healthy = await repository.startProofForTelegramUser({
      telegramUserId: 901_001n,
      partyInviteToken: "group-quarantine-healthy",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() - 1)
    });
    if (!("session" in healthy)) {
      throw new Error(`Expected healthy capacity session, received ${healthy.state}.`);
    }
    await prisma.groupCombatSession.update({
      where: { id: healthy.session.id },
      data: {
        deliveryPending: true,
        deliveryAttemptedAt: null,
        turnExpiresAt: new Date(NOW.getTime() - 1),
        updatedAt: NOW
      }
    });

    await seedParty(prisma, "group-quarantine-orphan", [901_101n]);
    const orphanCharacter = await prisma.character.findFirstOrThrow({
      where: { user: { telegramUserId: 901_101n } },
      select: { id: true }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "group-quarantine-orphan-lease",
        characterId: orphanCharacter.id,
        kind: "group-combat",
        referenceId: "missing-quarantine-capacity-owner",
        createdAt: new Date(NOW.getTime() - 60_000),
        updatedAt: new Date(NOW.getTime() - 60_000)
      }
    });
    await prisma.activeCombatLease.updateMany({
      where: {
        kind: "group-combat",
        referenceId: { notIn: quarantinedIds },
        id: { not: "group-quarantine-orphan-lease" }
      },
      data: { updatedAt: new Date(NOW.getTime() + 60_000) }
    });

    await expect(repository.listDueSessionIds(NOW, 1)).resolves.toEqual([healthy.session.id]);
    await expect(repository.listPendingDeliverySessionIds(1)).resolves.toEqual([healthy.session.id]);
    await expect(repository.repairInvalidOrOrphaned(new Date(NOW.getTime() + 1), 1))
      .resolves.toBeGreaterThanOrEqual(1);
    expect(await prisma.activeCombatLease.count({
      where: { id: "group-quarantine-orphan-lease" }
    })).toBe(0);
    expect(await prisma.activeCombatLease.count({
      where: {
        referenceId: { in: quarantinedIds },
        characterId: { in: quarantineCharacterIds }
      }
    })).toBe(26);
    expect(await prisma.groupCombatSession.count({
      where: {
        id: { in: quarantinedIds },
        repairState: "operator-required",
        deliveryPending: true
      }
    })).toBe(13);
  });

  it("keeps an idle ordinary repair pass within its fixed selection budget", async () => {
    const repairDir = await mkdtemp(join(tmpdir(), "kvestarnia-group-combat-repair-budget-"));
    const repairPrisma = new PrismaClient({
      datasources: { db: { url: `file:${join(repairDir, "test.db").replace(/\\/g, "/")}` } },
      log: [{ emit: "event", level: "query" }]
    });
    const repairQueries: string[] = [];
    repairPrisma.$on("query", (event: { query: string }) => repairQueries.push(event.query));
    try {
      await createMinimalSchema(repairPrisma);
      await applyGroupCombatMigration(repairPrisma);
      const observation = await measureQueryEvents(
        repairPrisma,
        repairQueries,
        () => new PrismaGroupCombatRepository(repairPrisma).repairInvalidOrOrphaned(NOW, 13)
      );
      actualQueryCounts.idleRepair = observation.count;
      expect(observation.value).toBe(0);
      expect(observation.count).toBe(QUERY_BUDGETS.idleRepair);
    } finally {
      await repairPrisma.$disconnect();
      await rm(repairDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it("keeps a newer revision discoverable after an interrupted tail and stale finalization", async () => {
    const oldRevision = await startLeftPassageProduction(
      prisma,
      repository,
      "left-delivery-revision-recovery",
      [11960n]
    );
    const participant = oldRevision.participants[0]!;
    const resolved = await repository.submitActionForTelegramUser({
      telegramUserId: participant.telegramUserId,
      partyInviteToken: oldRevision.partyInviteToken,
      turn: oldRevision.turn,
      action: "guard",
      targetKind: "self",
      targetId: participant.characterId,
      now: new Date(NOW.getTime() + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_001)
    });
    if (!("session" in resolved) || resolved.session.status !== "active") {
      throw new Error("Expected a newer active delivery revision.");
    }
    const newer = resolved.session;
    expect(newer.deliveryRevision).toBe(oldRevision.deliveryRevision + 1);

    await expect(repository.finalizeDeliveryAttempt({
      sessionId: newer.id,
      expectedDeliveryRevision: oldRevision.deliveryRevision,
      attemptedAt: new Date(NOW.getTime() + 13_001)
    })).resolves.toBe(false);
    await expect(prisma.groupCombatSession.findUniqueOrThrow({
      where: { id: newer.id },
      select: { deliveryPending: true, deliveryAttemptedAt: true }
    })).resolves.toEqual({
      deliveryPending: true,
      deliveryAttemptedAt: null
    });

    const restartedService = new GroupCombatService(
      new PrismaGroupCombatRepository(prisma),
      { enabled: true, devHelpersEnabled: false },
      () => new Date(NOW.getTime() + 13_002)
    );
    const pendingDelivery = await restartedService.listPendingDelivery(93);
    await expect(repository.finalizeDeliveryAttempt({
      sessionId: newer.id,
      expectedDeliveryRevision: newer.deliveryRevision,
      attemptedAt: new Date(NOW.getTime() + 13_003)
    })).resolves.toBe(true);
    expect(pendingDelivery).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: newer.id,
        deliveryRevision: newer.deliveryRevision,
        deliveryPending: true
      })
    ]));
  });

  it("reports observed query-event counts against stable budgets", () => {
    console.info(
      "Group combat observed query-event counts (concurrent resolve depends on the winning interleaving)",
      actualQueryCounts,
      "budgets",
      QUERY_BUDGETS
    );
  });
});

async function seedParty(prisma: PrismaClient, token: string, telegramIds: bigint[]): Promise<void> {
  for (const [index, telegramUserId] of telegramIds.entries()) {
    const userId = `${token}-user-${index}`;
    await prisma.user.create({
      data: {
        id: userId,
        telegramUserId,
        character: {
          create: {
            id: `${userId}-character`,
            name: `Пригодник ${index + 1}`,
            raceId: "race.human-ish",
            classId: index === 1 ? "class.bard" : "class.warrior",
            level: 3,
            xp: 42,
            gold: 93,
            hpCurrent: 30,
            hpMax: 30,
            manaCurrent: 13,
            manaMax: 13,
            statsJson: { strength: 8, dexterity: 6, intelligence: 7, charisma: 7, luck: 5 },
            equipment: { create: [{ slot: "weapon", itemId: "item.rusty-sword" }] }
          }
        }
      }
    });
  }
  const leaderCharacterId = `${token}-user-0-character`;
  await prisma.partySession.create({
    data: {
      id: `${token}-party`,
      inviteToken: token,
      status: "recruiting",
      leaderCharacterId,
      originLocationId: "korchma.board",
      participantCap: Math.max(3, telegramIds.length),
      minimumParticipants: 2,
      joinUntilAt: new Date(NOW.getTime() + 13 * 60_000),
      expiresAt: new Date(NOW.getTime() + 13 * 60_000),
      activeLeaderKey: `party-leader:${leaderCharacterId}`,
      participants: {
        create: telegramIds.map((_, index) => ({
          id: `${token}-participant-${index}`,
          characterId: `${token}-user-${index}-character`,
          remortCount: 0,
          status: "joined",
          joinSource: index === 0 ? "leader" : "dev",
          joinedAt: new Date(NOW.getTime() + index),
          chatId: telegramIds[index],
          activeMembershipKey: `party-member:${token}-user-${index}-character`
        }))
      }
    }
  });
}

function rebuildCoherentProductionParticipantOutputs(
  state: GroupCombatState
): void {
  const production = state.production!;
  const existingEvidence = production.canonicalV1;
  const budget = buildLeftPassageEncounterRewardBudget({
    participantLevels: state.participants.map((participant) => participant.level),
    enemies: existingEvidence.enemies.map((enemy) => ({
      baseLevel: enemy.baseRewardLevel,
      effectiveLevel: enemy.level
    })),
    deterministicKey: `${production.encounterSeed}:${state.partySessionId}:rewards`
  });
  Object.assign(production.rewards, budget);
  production.rewards.lootSnapshot = {
    version: 1,
    enemies: [...state.enemies]
      .sort((left, right) => left.order - right.order)
      .map((enemy) => ({
        enemyId: enemy.id,
        monsterId: enemy.monsterId ?? enemy.id,
        order: enemy.order,
        participantRolls: [...state.participants]
          .sort((left, right) => left.rosterOrder - right.rosterOrder)
          .map((participant) => ({
            characterId: participant.characterId,
            items: resolveGroupCombatLootVersionOneRoll({
              state,
              enemy,
              participant
            })
          }))
      }))
  };
  production.canonicalV1 = buildGroupCombatProductionV1Evidence(state);
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function seedDueParty(prisma: PrismaClient, token: string, telegramIds: bigint[]): Promise<void> {
  await seedParty(prisma, token, telegramIds);
  await prisma.partySession.update({
    where: { inviteToken: token },
    data: {
      originLocationId: "group-combat.proof",
      participantCap: 3,
      joinUntilAt: NOW,
      expiresAt: NOW
    }
  });
}

async function startProof(
  prisma: PrismaClient,
  repository: PrismaGroupCombatRepository,
  token: string,
  telegramIds: bigint[],
  turnExpiresAt = new Date(NOW.getTime() + 23_000)
) {
  await seedParty(prisma, token, telegramIds);
  return startExistingPartyProof(repository, token, telegramIds[0]!, turnExpiresAt);
}

type StartedProofSession = Awaited<ReturnType<typeof startProof>>;

async function startLeftPassageProduction(
  prisma: PrismaClient,
  repository: PrismaGroupCombatRepository,
  token: string,
  telegramIds: bigint[],
  options: {
    remortCount?: number;
    beforeStart?: (characterIds: string[]) => Promise<void>;
    due?: boolean;
    ready?: boolean;
  } = {}
) {
  await seedParty(prisma, token, telegramIds);
  const partyId = `${token}-party`;
  const leaderCharacterId = `${token}-user-0-character`;
  await prisma.user.updateMany({
    where: { telegramUserId: { in: telegramIds } },
    data: {
      lastSeenLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      currentAdventureId: null,
      currentRaidId: null
    }
  });
  await prisma.partySession.update({
    where: { id: partyId },
    data: {
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      originKind: "nyz-left-passage-party.v1",
      participantCap: 3,
      minimumParticipants: 1
    }
  });
  await prisma.pendingPassageEncounter.create({
    data: {
      id: `${token}-encounter`,
      token: `${token}-preview`,
      characterId: leaderCharacterId,
      originLocationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      passage: "deep-left",
      difficulty: "hard",
      monsterId: "monster.deadline-spider",
      baseMonsterLevel: 2,
      effectiveMonsterLevel: 4,
      rulesVersion: "nyz-passage-preview-v1",
      seedHash: `${token}-seed-587`,
      status: "reserved",
      reservationOrigin: "nyz-left-passage-party.v1",
      reservationRemortCount: options.remortCount ?? 0,
      reservedMonsterHp: deriveGroupCombatProductionV1MonsterStats({
        monsterId: "monster.deadline-spider",
        effectiveLevel: 4
      })!.hpMax,
      reservedPartySessionId: partyId,
      reservedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 10 * 60_000)
    }
  });
  if ((options.remortCount ?? 0) > 0) {
    for (const [index] of telegramIds.entries()) {
      const characterId = `${token}-user-${index}-character`;
      await prisma.characterRemort.create({
        data: {
          id: `${token}-remort-${index}`,
          characterId,
          token: `${token}-remort-token-${index}`,
          remortNumber: options.remortCount!,
          previousLevel: 3,
          previousXp: 42,
          previousGold: 93,
          displayNameSnapshot: `Минуле життя ${index}`,
          preservedPayloadJson: {}
        }
      });
      await prisma.partyParticipant.update({
        where: { sessionId_characterId: { sessionId: partyId, characterId } },
        data: { remortCount: options.remortCount }
      });
    }
  }
  await options.beforeStart?.(telegramIds.map((_, index) => `${token}-user-${index}-character`));
  if (options.ready) {
    const participants = await prisma.partyParticipant.findMany({
      where: { sessionId: partyId }
    });
    for (const participant of participants) {
      const snapshot = participant.snapshotJson as Record<string, unknown>;
      await prisma.partyParticipant.update({
        where: { id: participant.id },
        data: {
          snapshotJson: {
            ...snapshot,
            raidReadiness: "ready"
          }
        }
      });
    }
  }
  if (options.due) {
    await prisma.partySession.update({
      where: { id: partyId },
      data: { joinUntilAt: NOW, expiresAt: NOW }
    });
  }
  const started = options.ready
    ? await repository.startReadyLeftPassage({
        partyInviteToken: token,
        now: NOW,
        turnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    : options.due
    ? await repository.startDueLeftPassage({
        partyInviteToken: token,
        now: NOW,
        turnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    : await repository.startLeftPassageForTelegramUser({
        telegramUserId: telegramIds[0]!,
        partyInviteToken: token,
        now: NOW,
        turnExpiresAt: new Date(NOW.getTime() + 23_000)
      });
  if (started.state !== "started") {
    throw new Error(`Expected production group combat start, received ${started.state}.`);
  }
  return started.session;
}

async function terminalizeProductionSession(
  prisma: PrismaClient,
  session: Awaited<ReturnType<typeof startLeftPassageProduction>>,
  manualCharacterIds?: ReadonlySet<string>
) {
  const state = structuredClone(session.state);
  const manualIds = manualCharacterIds ?? new Set(
    state.contributions.map((contribution) => contribution.characterId)
  );
  state.status = "won";
  state.enemies.forEach((enemy) => {
    enemy.hp = 0;
  });
  state.contributions.forEach((contribution) => {
    contribution.committedActions = manualIds.has(contribution.characterId) ? 1 : 0;
    contribution.guardedTurns = manualIds.has(contribution.characterId) ? 0 : 1;
  });
  const plan = buildGroupCombatSettlementPlan(state)!;
  const result = {
    kind: "left-passage-party" as const,
    outcome: "won" as const,
    completedTurn: state.turn,
    rewards: sumGroupCombatSettlementRewards(plan.participants)
  };
  await prisma.groupCombatSession.update({
    where: { id: session.id },
    data: {
      status: "won",
      stateJson: state as unknown as Prisma.InputJsonValue,
      resultJson: result as unknown as Prisma.InputJsonValue,
      settlementPlanJson: plan as unknown as Prisma.InputJsonValue,
      turnExpiresAt: NOW,
      completedAt: NOW,
      version: { increment: 1 }
    }
  });
  for (const contribution of state.contributions) {
    await prisma.groupCombatParticipant.updateMany({
      where: { sessionId: session.id, characterId: contribution.characterId },
      data: { contributionJson: contribution as unknown as Prisma.InputJsonValue }
    });
  }
  const terminal = await new PrismaGroupCombatRepository(prisma).findById(session.id);
  if (!terminal) {
    throw new Error("Expected canonical production terminal.");
  }
  return terminal;
}

async function advanceLeftPassageToWinningManualAction(
  prisma: PrismaClient,
  repository: PrismaGroupCombatRepository,
  token: string,
  telegramUserId: bigint
) {
  let session = await startLeftPassageProduction(
    prisma,
    repository,
    token,
    [telegramUserId],
    {
      beforeStart: async ([characterId]) => {
        await prisma.character.update({
          where: { id: characterId! },
          data: {
            hpCurrent: 587,
            hpMax: 587,
            statsJson: {
              strength: 93,
              dexterity: 23,
              intelligence: 7,
              charisma: 7,
              luck: 5
            }
          }
        });
      }
    }
  );
  const participant = session.participants[0]!;
  for (let attempt = 0; attempt < 23; attempt += 1) {
    const enemy = session.state.enemies.find((candidate) => candidate.hp > 0)!;
    const action = {
      actorCharacterId: participant.characterId,
      turn: session.turn,
      action: "attack" as const,
      targetKind: "enemy" as const,
      targetId: enemy.id,
      origin: "manual" as const
    };
    if (resolveGroupCombatTurn(session.state, [action]).state.status !== "active") {
      return { session, participant, enemy };
    }
    const progressed = await repository.submitActionForTelegramUser({
      telegramUserId: participant.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: session.turn,
      action: action.action,
      targetKind: action.targetKind,
      targetId: action.targetId,
      now: new Date(NOW.getTime() + attempt + 1),
      nextTurnExpiresAt: new Date(NOW.getTime() + attempt + 23_001)
    });
    if (!("session" in progressed)) {
      throw new Error("Expected the setup turn to resolve.");
    }
    session = progressed.session;
  }
  throw new Error("Expected a deterministic winning manual action.");
}

async function seedThreatHistory(
  prisma: PrismaClient,
  input: {
    id: string;
    characterId: string;
    remortCount: number | null;
    updatedAt: Date;
  }
): Promise<void> {
  await prisma.soloCombatSession.create({
    data: {
      id: input.id,
      characterId: input.characterId,
      monsterId: "monster.deadline-spider",
      status: "won",
      turn: 1,
      stateJson: {
        turn: 1,
        status: "won",
        source: "normal",
        ...(input.remortCount === null ? {} : { life: { remortCount: input.remortCount } }),
        hero: { hp: 13, hpMax: 30, mana: 7, manaMax: 13 },
        monster: {
          id: "monster.deadline-spider",
          level: 2,
          hp: 0,
          hpMax: 13,
          attack: 3,
          armor: 0,
          resist: 0
        },
        completedAt: input.updatedAt.toISOString()
      },
      expiresAt: new Date(input.updatedAt.getTime() + 60_000),
      createdAt: new Date(input.updatedAt.getTime() - 1000),
      updatedAt: input.updatedAt
    }
  });
}

async function appendCorruptedParticipants(
  prisma: PrismaClient,
  session: StartedProofSession,
  token: string,
  telegramIds: bigint[],
  options: { satedIndex?: number } = {}
) {
  await seedParty(prisma, token, telegramIds);
  const baseActor = session.state.participants[0]!;
  const appended = [];
  for (const [index, telegramUserId] of telegramIds.entries()) {
    const characterId = `${token}-user-${index}-character`;
    const rosterOrder = session.participants.length + index;
    const actor = {
      ...structuredClone(baseActor),
      characterId,
      telegramUserId: telegramUserId.toString(),
      name: `Пошкоджений пригодник ${rosterOrder + 1}`,
      rosterOrder,
      remortCount: 0
    };
    const sated = options.satedIndex === index
      ? makeSatedPayload(characterId, new Date(NOW.getTime() - 60_000), telegramUserId.toString())
      : undefined;
    const frozenSated = sated
      ? {
          version: 1 as const,
          activationId: sated.activationId,
          recipientCharacterId: characterId,
          recipientRemortCount: 0,
          rank: sated.rank,
          expiresAt: new Date(NOW.getTime() + 13 * 60_000).toISOString(),
          cursorAt: NOW.toISOString(),
          leaseStartedAt: NOW.toISOString(),
          outsideRemainderMs: 59_999,
          pulseIds: []
        }
      : undefined;
    if (sated) {
      await prisma.characterCooldown.create({
        data: {
          characterId,
          key: VARENYK_SATED_STATUS_KEY,
          availableAt: new Date(sated.availableAt),
          resultJson: sated
        }
      });
    }
    await prisma.groupCombatParticipant.create({
      data: {
        sessionId: session.id,
        characterId,
        remortCount: 0,
        rosterOrder,
        snapshotJson: { actor, ...(frozenSated ? { sated: frozenSated } : {}) },
        contributionJson: {
          characterId,
          damage: 93 + index,
          healing: 42,
          guardPrevented: 23,
          control: 13,
          damageTaken: 42,
          committedActions: 3,
          guardedTurns: 1
        },
        settlementStatus: "completed",
        settlementAttempts: 13,
        settlementReceiptJson: {
          version: 1,
          policy: "rewardless-proof",
          sessionId: "foreign-session",
          characterId,
          remortCount: 93,
          rewards: { xp: 0, gold: 0, items: [] }
        },
        settledAt: new Date(NOW.getTime() - 93_000)
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        characterId,
        kind: "group-combat",
        referenceId: session.id,
        createdAt: NOW,
        updatedAt: NOW
      }
    });
    appended.push({ characterId, telegramUserId, rosterOrder });
  }
  return appended;
}

async function expectStoredTurnActionMatchesRecap(
  prisma: PrismaClient,
  repository: PrismaGroupCombatRepository,
  session: StartedProofSession,
  actorCharacterId: string
): Promise<void> {
  const action = await prisma.groupCombatAction.findUniqueOrThrow({
    where: {
      sessionId_turn_actorCharacterId: {
        sessionId: session.id,
        turn: 1,
        actorCharacterId
      }
    }
  });
  const latest = await repository.findById(session.id);
  const actor = session.state.participants.find((participant) => participant.characterId === actorCharacterId)!;
  const recap = latest?.state.recap.find((entry) => entry.turn === 1);

  expect(latest?.turn).toBe(2);
  expect(await prisma.groupCombatAction.count({ where: { sessionId: session.id, turn: 1 } })).toBe(2);
  expect(recap).toBeDefined();
  if (action.actionKey === "guard") {
    expect(recap?.lines).toContain(`${actor.name} стає в захист.`);
  } else {
    expect(recap?.lines.some((line) => line.startsWith(`${actor.name} атакує `))).toBe(true);
  }
}

async function forceTerminalProof(
  prisma: PrismaClient,
  repository: PrismaGroupCombatRepository,
  token: string,
  telegramIds: [bigint, bigint]
): Promise<StartedProofSession> {
  const session = await startProof(prisma, repository, token, telegramIds);
  const state = {
    ...structuredClone(session.state),
    status: "won" as const,
    enemies: session.state.enemies.map((enemy) => ({ ...enemy, hp: 0 }))
  };
  await prisma.groupCombatSession.update({
    where: { id: session.id },
    data: {
      status: "won",
      stateJson: state,
      resultJson: {
        kind: "rewardless-proof",
        outcome: "won",
        completedTurn: state.turn,
        rewards: { xp: 0, gold: 0, items: [] }
      },
      settlementPlanJson: buildGroupCombatSettlementPlan(state)! as unknown as Prisma.InputJsonValue,
      completedAt: NOW,
      terminalIntegrityCheckedAt: null
    }
  });
  await prisma.activeCombatLease.deleteMany({ where: { referenceId: session.id } });
  await prisma.partySession.update({
    where: { id: session.partySessionId },
    data: { status: "completed", activeLeaderKey: null }
  });
  await prisma.partyParticipant.updateMany({
    where: { sessionId: session.partySessionId },
    data: { activeMembershipKey: null }
  });
  return session;
}

async function checkpointExistingTerminalHistory(prisma: PrismaClient): Promise<void> {
  await prisma.groupCombatSession.updateMany({
    where: { status: { not: "active" } },
    data: { deliveryPending: false, terminalIntegrityCheckedAt: NOW }
  });
}

async function seedTerminalIntegrityHistory(
  prisma: PrismaClient,
  repository: PrismaGroupCombatRepository,
  tokenPrefix: string,
  firstTelegramId: bigint,
  malformedIndex: number
): Promise<{ sessions: StartedProofSession[]; malformed: StartedProofSession }> {
  const sessions: StartedProofSession[] = [];
  for (let index = 0; index < 14; index += 1) {
    sessions.push(await startProof(
      prisma,
      repository,
      `${tokenPrefix}-${index}`,
      [firstTelegramId + BigInt(index * 2), firstTelegramId + BigInt(index * 2 + 1)]
    ));
  }

  const completedBase = new Date("2026-07-20T00:00:00.000Z");
  for (const [index, session] of sessions.entries()) {
    const completedAt = new Date(completedBase.getTime() + index);
    const terminalState = {
      ...session.state,
      status: "won" as const,
      enemies: session.state.enemies.map((enemy) => ({ ...enemy, hp: 0 }))
    };
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: {
        status: "won",
        stateJson: terminalState,
        resultJson: {
          kind: "rewardless-proof",
          outcome: index === malformedIndex ? "lost" : "won",
          completedTurn: session.turn,
          rewards: { xp: 0, gold: 0, items: [] }
        },
        settlementPlanJson: buildGroupCombatSettlementPlan(terminalState)! as unknown as Prisma.InputJsonValue,
        completedAt,
        terminalIntegrityCheckedAt: null,
        updatedAt: completedAt
      }
    });
  }
  const sessionIds = sessions.map((session) => session.id);
  await prisma.activeCombatLease.deleteMany({
    where: { kind: "group-combat", referenceId: { in: sessionIds } }
  });
  await prisma.partySession.updateMany({
    where: { id: { in: sessions.map((session) => session.partySessionId) } },
    data: { status: "completed", activeLeaderKey: null }
  });
  await prisma.partyParticipant.updateMany({
    where: { sessionId: { in: sessions.map((session) => session.partySessionId) } },
    data: { activeMembershipKey: null }
  });

  return { sessions, malformed: sessions[malformedIndex]! };
}

async function startExistingPartyProof(
  repository: PrismaGroupCombatRepository,
  token: string,
  telegramUserId: bigint,
  turnExpiresAt = new Date(NOW.getTime() + 23_000)
) {
  const started = await repository.startProofForTelegramUser({
    telegramUserId,
    partyInviteToken: token,
    now: NOW,
    turnExpiresAt
  });
  if (!("session" in started)) {
    throw new Error(`Expected started group combat for ${token}, got ${started.state}`);
  }
  return started.session;
}

async function expectInvalidatedRewardlessly(prisma: PrismaClient, sessionId: string): Promise<void> {
  const row = await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: sessionId } });
  expect(row.status).toBe("invalid");
  expect(row.resultJson).toEqual({
    kind: "rewardless-proof",
    outcome: "invalid",
    completedTurn: row.turn,
    rewards: { xp: 0, gold: 0, items: [] }
  });
  expect(await prisma.activeCombatLease.count({ where: { referenceId: sessionId } })).toBe(0);
}

function makeSatedPayload(
  characterId: string,
  cursorAt: Date,
  telegramUserId = "1411"
): VarenykSatedPayloadV1 {
  return {
    kind: "varenyk-sated-support-v1",
    version: 1,
    activationId: `${characterId}-sated`,
    actorCharacterId: characterId,
    actorRemortCount: 0,
    recipientCharacterId: characterId,
    recipientRemortCount: 0,
    rank: 1,
    manaCost: 8,
    effectiveStats: { intelligence: 8, charisma: 8, level: 3, equipmentItemIds: [] },
    startedAt: cursorAt.toISOString(),
    expiresAt: new Date(cursorAt.getTime() + 13 * 60_000).toISOString(),
    availableAt: new Date(cursorAt.getTime() + 93 * 60_000).toISOString(),
    cursorAt: cursorAt.toISOString(),
    receipt: {
      version: 1,
      previewToken: `${characterId}-preview`,
      actorTelegramUserId: telegramUserId,
      targetTelegramUserId: telegramUserId,
      actorName: "Пан Вареник",
      targetName: "Пан Вареник",
      immediateHpRestored: 0,
      immediateManaRestored: 0,
      actorManaAfter: 13,
      targetHpAfter: 30,
      targetManaAfter: 13
    }
  };
}

async function measureQueryEvents<T>(
  prisma: PrismaClient,
  queries: string[],
  operation: () => Promise<T>
): Promise<{ value: T; count: number }> {
  await reachQueryEventBarrier(prisma, queries);
  queries.length = 0;
  const value = await operation();
  await reachQueryEventBarrier(prisma, queries);
  return {
    value,
    count: queries.filter((query) => !query.includes(QUERY_EVENT_BARRIER_PREFIX)).length
  };
}

async function reachQueryEventBarrier(prisma: PrismaClient, queries: string[]): Promise<void> {
  queryEventBarrierSequence += 1;
  const marker = `${QUERY_EVENT_BARRIER_PREFIX}_${queryEventBarrierSequence}`;
  const firstNewEvent = queries.length;
  await prisma.$queryRawUnsafe(`SELECT 1 AS "${marker}"`);
  for (let turn = 0; turn < 100; turn += 1) {
    if (queries.slice(firstNewEvent).some((query) => query.includes(marker))) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Prisma query event barrier was not observed: ${marker}`);
}

async function resourceSnapshot(prisma: PrismaClient, telegramIds: bigint[]) {
  return prisma.character.findMany({
    where: { user: { telegramUserId: { in: telegramIds } } },
    orderBy: { id: "asc" },
    select: { id: true, hpCurrent: true, manaCurrent: true, xp: true, gold: true }
  });
}

async function applyGroupCombatMigration(prisma: PrismaClient): Promise<void> {
  for (const migration of [
    "prisma/migrations/20260722090000_group_combat_proof/migration.sql",
    "prisma/migrations/20260723194500_group_combat_hardening/migration.sql",
    "prisma/migrations/20260724233000_left_passage_party_attack/migration.sql",
    "prisma/migrations/20260819090000_referral_foundation/migration.sql",
    "prisma/migrations/20260824090000_guild_weekly_goal/migration.sql"
  ]) {
    const sql = await readFile(resolve(migration), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE guilds (id TEXT PRIMARY KEY)`,
    `CREATE TABLE users (
      id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL UNIQUE, username TEXT, display_name TEXT,
      language_code TEXT, last_action_at DATETIME, last_seen_location_id TEXT, current_raid_id TEXT,
      current_adventure_id TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pronoun TEXT NOT NULL DEFAULT 'they',
      path TEXT NOT NULL DEFAULT 'boundary', race_id TEXT NOT NULL, class_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25, hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10, mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME, mana_regen_at DATETIME, active_cosmetic_title_grant_id TEXT,
      stats_json JSONB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL, previous_xp INTEGER NOT NULL, previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL, preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, slot TEXT NOT NULL, item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_drink_states (
      id TEXT PRIMARY KEY, activation_id TEXT NOT NULL UNIQUE, character_id TEXT NOT NULL UNIQUE,
      remort_count INTEGER NOT NULL DEFAULT 0, drink_key TEXT NOT NULL, phase TEXT NOT NULL,
      started_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, source_type TEXT NOT NULL,
      source_id TEXT, metadata_json JSONB, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL, available_at DATETIME NOT NULL,
      result_json JSONB, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL, local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL, reward_gold INTEGER NOT NULL, spent_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE solo_combat_sessions (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, monster_id TEXT NOT NULL, state_json JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', turn INTEGER NOT NULL DEFAULT 1, reward_xp INTEGER,
      reward_gold INTEGER, reward_items_json JSONB, reward_claimed_at DATETIME, expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE pending_passage_encounters (
      id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, character_id TEXT NOT NULL,
      origin_location_id TEXT NOT NULL, passage TEXT NOT NULL, difficulty TEXT NOT NULL,
      monster_id TEXT NOT NULL, base_monster_level INTEGER NOT NULL, effective_monster_level INTEGER NOT NULL,
      rules_version TEXT NOT NULL, seed_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      active_key TEXT UNIQUE, version INTEGER NOT NULL DEFAULT 1, combat_session_id TEXT,
      expires_at DATETIME NOT NULL, consumed_at DATETIME, cancelled_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE passage_search_actions (
      id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, character_id TEXT NOT NULL, node_key TEXT NOT NULL,
      node_kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', active_key TEXT UNIQUE,
      started_at DATETIME NOT NULL, ends_at DATETIME NOT NULL, payload_json JSONB NOT NULL,
      result_json JSONB, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE activity_events (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'public', actor_character_id TEXT, actor_display_name TEXT,
      related_character_ids_json JSONB, subject_kind TEXT, subject_id TEXT, subject_name TEXT,
      source_type TEXT, source_id TEXT, dedupe_key TEXT UNIQUE, payload_json JSONB,
      occurred_at DATETIME NOT NULL, published_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_achievements (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, achievement_id TEXT NOT NULL,
      source_type TEXT NOT NULL, source_id TEXT, source_json JSONB,
      unlocked_at DATETIME NOT NULL, notified_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX character_achievements_character_id_achievement_id_key
      ON character_achievements(character_id, achievement_id)`,
    `CREATE TABLE party_sessions (
      id TEXT PRIMARY KEY, invite_token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'recruiting',
      leader_character_id TEXT NOT NULL, period_id TEXT, origin_location_id TEXT,
      participant_cap INTEGER NOT NULL DEFAULT 8, minimum_participants INTEGER NOT NULL DEFAULT 1,
      join_until_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      chat_revision INTEGER NOT NULL DEFAULT 0, raid_chat_retention_until DATETIME, active_leader_key TEXT UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_participants (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, character_id TEXT NOT NULL, remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'joined', join_source TEXT NOT NULL, joined_at DATETIME NOT NULL, left_at DATETIME,
      snapshot_json JSONB, chat_id INTEGER, message_id INTEGER, active_membership_key TEXT UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_sessions (
      id TEXT PRIMARY KEY, party_session_id TEXT NOT NULL UNIQUE, leader_character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', turn INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
      rules_version TEXT NOT NULL, boss_key TEXT NOT NULL, state_json JSONB NOT NULL, result_json JSONB,
      turn_expires_at DATETIME NOT NULL, completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX party_participants_session_id_character_id_key ON party_participants(session_id, character_id)`,
    `CREATE UNIQUE INDEX character_equipment_character_id_slot_key ON character_equipment(character_id, slot)`,
    `CREATE UNIQUE INDEX character_items_character_id_item_id_key ON character_items(character_id, item_id)`,
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`,
    `CREATE UNIQUE INDEX daily_actions_character_id_key_local_date_key
      ON daily_actions(character_id, key, local_date)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
