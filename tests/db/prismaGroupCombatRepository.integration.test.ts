import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaGroupCombatRepository } from "../../src/db/repositories/prismaGroupCombatRepository";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import {
  VARENYK_SATED_STATUS_KEY,
  type VarenykSatedPayloadV1
} from "../../src/domain/noncombat/varenykSatedSupport";
import { GroupCombatService } from "../../src/services/groupCombatService";

const NOW = new Date("2026-07-22T10:00:00.000Z");
const QUERY_BUDGETS = {
  start: 30,
  queue: 19,
  resolve: 35,
  dueScan: 1
} as const;
const actualQueryCounts: Partial<Record<keyof typeof QUERY_BUDGETS, number>> = {};

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
    queries.length = 0;
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1101n,
      partyInviteToken: "group-start",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const startQueries = queries.length;
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

  it("rejects invalid and full-health aid targets, replaces a queued choice, then resolves a duplicate last-action race once", async () => {
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

    initial.state.participants[1]!.hp = initial.state.participants[1]!.hpMax;
    await prisma.groupCombatSession.update({
      where: { id: initial.id },
      data: { stateJson: initial.state as unknown as Prisma.InputJsonValue }
    });
    const fullHealthAid = await repository.submitActionForTelegramUser({
      telegramUserId: leader.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: initial.turn,
      action: "aid",
      targetKind: "ally",
      targetId: joiner.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(fullHealthAid.state).toBe("invalid-target");
    expect(await prisma.groupCombatAction.count()).toBe(beforeActions);

    queries.length = 0;
    const queued = await repository.submitActionForTelegramUser({
      telegramUserId: leader.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: initial.turn,
      action: "attack",
      targetKind: "enemy",
      targetId: initial.state.enemies[0]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const queueQueries = queries.length;
    actualQueryCounts.queue = queueQueries;
    expect(queued.state).toBe("queued");
    expect(queueQueries).toBeLessThanOrEqual(QUERY_BUDGETS.queue);
    expect("session" in queued ? queued.session.version : null).toBe(initial.version);
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
    queries.length = 0;
    const results = await Promise.all([submitLast(), submitLast()]);
    const resolveQueries = queries.length;
    actualQueryCounts.resolve = resolveQueries;
    const latest = await repository.findByPartyInviteToken("group-start");

    expect(results.some((result) => result.state === "resolved")).toBe(true);
    expect(latest?.turn).toBe(2);
    expect(await prisma.groupCombatAction.count({ where: { sessionId: initial.id, turn: 1 } })).toBe(2);
    expect(resolveQueries).toBeLessThanOrEqual(QUERY_BUDGETS.resolve * 2);

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

  it("uses a lean due scan and a resource-free timeout fallback", async () => {
    const before = await resourceSnapshot(prisma, [1101n, 1102n]);
    await prisma.groupCombatSession.updateMany({
      where: { partySession: { inviteToken: "group-start" } },
      data: { turnExpiresAt: new Date(NOW.getTime() - 1) }
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    queries.length = 0;
    const ids = await repository.listDueSessionIds(NOW, 13);
    const dueQueries = queries.length;
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
    expect(await prisma.characterItem.count()).toBe(0);
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

  it("settles a normal victory with no economy writes and releases every lock", async () => {
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
    const terminal = await repository.submitActionForTelegramUser({
      telegramUserId: second.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: state.enemies[1]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(terminal.state).toBe("terminal");
    expect("session" in terminal ? terminal.session.result : null).toEqual({
      kind: "rewardless-proof",
      outcome: "won",
      completedTurn: 1,
      rewards: { xp: 0, gold: 0, items: [] }
    });
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
    for (const participant of committed.participants) {
      await expect(restarted.markParticipantCardDelivered({
        sessionId: committed.id,
        telegramUserId: participant.telegramUserId,
        expectedDeliveryRevision: committed.deliveryRevision,
        expectedReferenceVersion: participant.referenceVersion,
        chatId: participant.chatId!,
        messageId: participant.messageId!
      })).resolves.toBe(true);
    }
    await expect(restarted.finalizeDeliveryAttempt({
      sessionId: committed.id,
      expectedDeliveryRevision: committed.deliveryRevision,
      attemptedAt: new Date(NOW.getTime() + 1)
    })).resolves.toBe(true);
    expect(await restarted.listPendingDeliverySessionIds(93)).not.toContain(session.id);
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

    expect(await repository.repairInvalidOrOrphaned(NOW, 13)).toBeGreaterThanOrEqual(1);
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

  it.each(["actor", "target"] as const)(
    "invalidates a persisted current-turn action with a malformed %s",
    async (malformed) => {
      const token = `group-malformed-action-${malformed}`;
      const ids = malformed === "actor" ? [1351n, 1352n] : [1361n, 1362n];
      const session = await startProof(prisma, repository, token, ids, new Date(NOW.getTime() - 1));
      let actorCharacterId = session.participants[0]!.characterId;
      let targetId = session.state.enemies[0]!.id;
      if (malformed === "actor") {
        await seedParty(prisma, "group-action-outsider", [1363n, 1364n]);
        actorCharacterId = "group-action-outsider-user-0-character";
      } else {
        targetId = "enemy-that-is-not-canonical";
      }
      await prisma.groupCombatAction.create({
        data: {
          sessionId: session.id,
          actorCharacterId,
          turn: 1,
          actionKey: "attack",
          targetKind: "enemy",
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
      .toEqual(NOW);

    const newestHealthy = sessions.at(-1)!;
    expect((await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: newestHealthy.id } })).terminalIntegrityCheckedAt)
      .toBeNull();
    await repository.repairInvalidOrOrphaned(new Date(NOW.getTime() + 1), 13);
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
      .toEqual(secondPassAt);
    expect((await restartedService.listPendingDelivery(93)).map((session) => session.id)).toContain(malformed.id);

    const checkpointBeforeRepeat = await prisma.groupCombatSession.findMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      orderBy: { id: "asc" },
      select: { id: true, terminalIntegrityCheckedAt: true }
    });
    queries.length = 0;
    await restartedRepository.repairInvalidOrOrphaned(new Date(NOW.getTime() + 4), 13);
    const repeatedPassQueries = queries.length;
    expect(repeatedPassQueries).toBeLessThan(firstPassQueries);
    expect(await prisma.groupCombatSession.findMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      orderBy: { id: "asc" },
      select: { id: true, terminalIntegrityCheckedAt: true }
    })).toEqual(checkpointBeforeRepeat);
  });

  it("reports actual query-event budgets", () => {
    console.info("Group combat query-event counts", actualQueryCounts, "budgets", QUERY_BUDGETS);
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
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: {
        status: "won",
        stateJson: {
          ...session.state,
          status: "won",
          enemies: session.state.enemies.map((enemy) => ({ ...enemy, hp: 0 }))
        },
        resultJson: {
          kind: "rewardless-proof",
          outcome: index === malformedIndex ? "lost" : "won",
          completedTurn: session.turn,
          rewards: { xp: 0, gold: 0, items: [] }
        },
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

function makeSatedPayload(characterId: string, cursorAt: Date): VarenykSatedPayloadV1 {
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
      actorTelegramUserId: "1411",
      targetTelegramUserId: "1411",
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

async function resourceSnapshot(prisma: PrismaClient, telegramIds: bigint[]) {
  return prisma.character.findMany({
    where: { user: { telegramUserId: { in: telegramIds } } },
    orderBy: { id: "asc" },
    select: { id: true, hpCurrent: true, manaCurrent: true, xp: true, gold: true }
  });
}

async function applyGroupCombatMigration(prisma: PrismaClient): Promise<void> {
  const sql = await readFile(resolve("prisma/migrations/20260722090000_group_combat_proof/migration.sql"), "utf8");
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
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
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL, available_at DATETIME NOT NULL,
      result_json JSONB, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
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
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
