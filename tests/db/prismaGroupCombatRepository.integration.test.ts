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
import {
  buildGroupCombatSettlementPlan,
  GROUP_COMBAT_STATE_BYTE_LIMIT
} from "../../src/domain/groupCombat/groupCombat";

const NOW = new Date("2026-07-22T10:00:00.000Z");
const QUERY_EVENT_BARRIER_PREFIX = "group_combat_query_budget_barrier";
const QUERY_BUDGETS = {
  start: 32,
  queue: 20,
  singleResolve: 35,
  dueScan: 1
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

    expect([replacement.state, finalAction.state]).toContain("resolved");
    expect(["replaced", "stale", "terminal"]).toContain(replacement.state);
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

    expect([replacement.state, timeout.state]).toContain("resolved");
    expect(["replaced", "stale", "terminal"]).toContain(replacement.state);
    await expectStoredTurnActionMatchesRecap(prisma, repository, session, actor.characterId);
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
    const terminal = await repository.submitActionForTelegramUser({
      telegramUserId: active!.participants[1]!.telegramUserId,
      partyInviteToken: "group-settlement",
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: terminalState.enemies[1]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 46_000)
    });
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
    const invalidState = stored.stateJson as { contributions: unknown[] };
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
    expect(recap?.lines.some((line) => line.startsWith(`${actor.name} б’є `))).toBe(true);
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
    "prisma/migrations/20260723194500_group_combat_hardening/migration.sql"
  ]) {
    const sql = await readFile(resolve(migration), "utf8");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
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
