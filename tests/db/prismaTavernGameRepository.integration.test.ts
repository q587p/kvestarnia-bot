import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaTavernGameRepository } from "../../src/db/repositories/prismaTavernGameRepository";
import { TavernGameService } from "../../src/services/tavernGameService";
import {
  evaluateQuickHand,
  isDicePokerState,
  resolveQuickPlayerHand,
  startDicePokerTable,
  startQuickDicePoker,
  startScorecardDicePoker
} from "../../src/domain/dicePoker";

describe("PrismaTavernGameRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaTavernGameRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-tavern-games-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaTavernGameRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.tavernGameParticipant.deleteMany();
    await prisma.tavernGameSession.deleteMany();
    await prisma.activeCombatLease.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps an open Kosti table joinable after two early decisions", async () => {
    await seedCharacter({ telegramUserId: 101n, characterId: "character-kosti-creator", name: "РљРёРґСѓРЅ", gold: 10 });
    await seedCharacter({ telegramUserId: 102n, characterId: "character-kosti-second", name: "Р—РЅР°РєРѕР·РЅР°РІРµС†СЊ", gold: 10 });
    await seedCharacter({ telegramUserId: 103n, characterId: "character-kosti-third", name: "РўСЂРµС‚СЏ РєС–СЃС‚РєР°", gold: 10 });

    const created = await repository.createForTelegramUser(101n, createInput("kosti", "12345678-1234-4234-9234-000000000101"));
    expect(created.state).toBe("created");
    const joined = await repository.joinByTokenForTelegramUser(102n, "12345678-1234-4234-9234-000000000101", joinInput());
    expect(joined.state).toBe("joined");

    const creatorDecision = await repository.submitDecisionForTelegramUser(101n, "12345678-1234-4234-9234-000000000101", {
      gameKey: "kosti",
      style: "steady",
      sign: "no_sign"
    }, now());
    const secondDecision = await repository.submitDecisionForTelegramUser(102n, "12345678-1234-4234-9234-000000000101", {
      gameKey: "kosti",
      style: "push",
      sign: "high_hand"
    }, now());

    expect(creatorDecision.state).toBe("decided");
    expect(secondDecision.state).toBe("decided");
    await expect(prisma.tavernGameSession.findUnique({
      where: { token: "12345678-1234-4234-9234-000000000101" },
      select: { status: true, potGold: true }
    })).resolves.toEqual({ status: "open", potGold: 6 });

    const thirdJoin = await repository.joinByTokenForTelegramUser(103n, "12345678-1234-4234-9234-000000000101", joinInput());

    expect(thirdJoin.state).toBe("joined");
    expect(thirdJoin.state === "joined" ? thirdJoin.session.status : null).toBe("open");
    expect(thirdJoin.state === "joined" ? thirdJoin.session.participants : []).toHaveLength(3);
    await expect(prisma.tavernGameSession.findUnique({
      where: { token: "12345678-1234-4234-9234-000000000101" },
      select: { status: true, potGold: true }
    })).resolves.toEqual({ status: "open", potGold: 9 });
  });

  it("keeps Kosti open through six players and marks it ready on the seventh", async () => {
    const token = "12345678-1234-4234-9234-000000000107";
    for (let index = 1; index <= 8; index += 1) {
      await seedCharacter({
        telegramUserId: BigInt(300 + index),
        characterId: `character-kosti-seven-${index}`,
        name: `Гравець ${index}`,
        gold: 10
      });
    }

    const created = await repository.createForTelegramUser(301n, createInput("kosti", token));
    expect(created.state).toBe("created");

    for (let index = 2; index <= 6; index += 1) {
      const joined = await repository.joinByTokenForTelegramUser(BigInt(300 + index), token, joinInput());
      expect(joined.state).toBe("joined");
      expect(joined.state === "joined" ? joined.session.status : null).toBe("open");
    }

    const seventh = await repository.joinByTokenForTelegramUser(307n, token, joinInput());
    const eighth = await repository.joinByTokenForTelegramUser(308n, token, joinInput());

    expect(seventh.state).toBe("joined");
    expect(seventh.state === "joined" ? seventh.session.status : null).toBe("ready");
    expect(seventh.state === "joined" ? seventh.session.participants : []).toHaveLength(7);
    expect(eighth.state).toBe("closed");
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, potGold: true }
    })).resolves.toEqual({ status: "ready", potGold: 21 });
  });

  it("lists completed sessions since the requested cutoff with participants", async () => {
    const recentToken = "12345678-1234-4234-9234-000000000401";
    const oldToken = "12345678-1234-4234-9234-000000000403";
    const recentCompletedAt = new Date("2026-07-02T09:00:00.000Z");
    const oldCompletedAt = new Date("2026-06-01T09:00:00.000Z");
    await seedCharacter({ telegramUserId: 401n, characterId: "character-recent-creator", name: "Recent Creator", gold: 10 });
    await seedCharacter({ telegramUserId: 402n, characterId: "character-recent-joiner", name: "Recent Joiner", gold: 10 });
    await seedCharacter({ telegramUserId: 403n, characterId: "character-old-creator", name: "Old Creator", gold: 10 });
    await seedCharacter({ telegramUserId: 404n, characterId: "character-old-joiner", name: "Old Joiner", gold: 10 });

    await repository.createForTelegramUser(401n, createInput("tavlei", recentToken));
    await repository.joinByTokenForTelegramUser(402n, recentToken, joinInput());
    await repository.createForTelegramUser(403n, createInput("tavlei", oldToken));
    await repository.joinByTokenForTelegramUser(404n, oldToken, joinInput());
    await completeTavleiSession(recentToken, "character-recent-creator", recentCompletedAt);
    await completeTavleiSession(oldToken, "character-old-creator", oldCompletedAt);

    const records = await repository.listCompletedSince(new Date("2026-07-01T00:00:00.000Z"), 10);

    expect(records.map((record) => record.token)).toEqual([recentToken]);
    expect(records[0]?.completedAt).toEqual(recentCompletedAt);
    expect(records[0]?.participants.map((participant) => participant.characterId).sort()).toEqual([
      "character-recent-creator",
      "character-recent-joiner"
    ]);
  });

  it("terminalizes payout invariant failures as a failed safe refund and replays without double refund", async () => {
    await seedCharacter({ telegramUserId: 201n, characterId: "character-fail-creator", name: "Р Р°С…С–РІРЅРёРє", gold: 10 });
    await seedCharacter({ telegramUserId: 202n, characterId: "character-fail-joiner", name: "РЎРІС–РґРѕРє", gold: 10 });

    await repository.createForTelegramUser(201n, createInput("kosti", "12345678-1234-4234-9234-000000000201"));
    await repository.joinByTokenForTelegramUser(202n, "12345678-1234-4234-9234-000000000201", joinInput());
    await prisma.tavernGameSession.update({
      where: { token: "12345678-1234-4234-9234-000000000201" },
      data: { potGold: 999 }
    });

    const failed = await repository.resolveKostiForTelegramUser(201n, "12345678-1234-4234-9234-000000000201", now());
    const replay = await repository.resolveKostiForTelegramUser(201n, "12345678-1234-4234-9234-000000000201", now());

    expect(failed.state).toBe("failed-refund");
    expect(replay.state).toBe("replayed");
    const failedRow = await prisma.tavernGameSession.findUnique({
      where: { token: "12345678-1234-4234-9234-000000000201" },
      select: { status: true, completedAt: true, resultJson: true }
    });
    const failedResult = failedRow?.resultJson && typeof failedRow.resultJson === "object" && !Array.isArray(failedRow.resultJson)
      ? failedRow.resultJson as Record<string, unknown>
      : {};

    expect(failedRow?.status).toBe("failed_safe_refund");
    expect(failedRow?.completedAt).toBeInstanceOf(Date);
    expect(failedResult.kind).toBe("failed_safe_refund");
    expect(failedResult.refundedGold).toBe(6);
    await expect(prisma.tavernGameParticipant.findMany({
      where: {
        session: { token: "12345678-1234-4234-9234-000000000201" }
      },
      select: { status: true, refundedGold: true, activeStakeKey: true },
      orderBy: { joinedAt: "asc" }
    })).resolves.toEqual([
      { status: "left_refunded", refundedGold: 3, activeStakeKey: null },
      { status: "left_refunded", refundedGold: 3, activeStakeKey: null }
    ]);
    await expect(characterGold("character-fail-creator")).resolves.toBe(10);
    await expect(characterGold("character-fail-joiner")).resolves.toBe(10);
  });

  it("completes dice poker once and does not duplicate rewards on replay", async () => {
    const token = "12345678-1234-4234-9234-000000000587";
    await seedCharacter({ telegramUserId: 587n, characterId: "character-dice-poker", name: "Костяр", gold: 10 });
    const state = startQuickDicePoker("dice-poker-replay");

    const created = await repository.createDicePokerForTelegramUser(587n, {
      mode: "quick",
      token,
      seed: "dice-poker-replay",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 5 * 60_000),
      cooldownMs: 0,
      now: now(),
      state
    });
    expect(created.state).toBe("created");
    await expect(characterGold("character-dice-poker")).resolves.toBe(7);

    const terminal = {
      kind: "dice_poker" as const,
      mode: "quick" as const,
      phase: "terminal" as const,
      outcome: "win" as const,
      drawRound: 1,
      playerDice: [6, 6, 6, 6, 6],
      opponentDice: [1, 2, 3, 4, 5],
      playerHand: evaluateQuickHand([6, 6, 6, 6, 6]),
      opponentHand: evaluateQuickHand([1, 2, 3, 4, 5]),
      reason: "Покер сильніший за малий стріт."
    };
    const completed = await repository.completeDicePokerForTelegramUser(587n, token, {
      state: terminal,
      outcome: "win",
      payoutGold: 3,
      refundedGold: 0,
      now: now()
    });
    const replay = await repository.completeDicePokerForTelegramUser(587n, token, {
      state: terminal,
      outcome: "win",
      payoutGold: 3,
      refundedGold: 0,
      now: now()
    });

    expect(completed.state).toBe("completed");
    expect(replay.state).toBe("closed");
    await expect(characterGold("character-dice-poker")).resolves.toBe(10);
    await expect(prisma.tavernGameParticipant.findMany({
      where: { session: { token } },
      select: { payoutGold: true, refundedGold: true, activeStakeKey: true }
    })).resolves.toEqual([{ payoutGold: 3, refundedGold: 0, activeStakeKey: null }]);
  });

  it("settles Tavlei against the Doppelganger once without a second participant row", async () => {
    const token = "12345678-1234-4234-9234-000000000618";
    await seedCharacter({ telegramUserId: 618n, characterId: "character-tavlei-doppel", name: "Дзеркальник", gold: 20 });

    const created = await repository.createTavleiDoppelgangerForTelegramUser(618n, {
      token,
      seed: "tavlei-doppelganger-integration",
      stakeGold: 13,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 5 * 60_000),
      cooldownMs: 0,
      now: now(),
      state: { kind: "tavlei_doppelganger", opponent: "doppelganger" }
    });
    expect(created.state).toBe("created");
    await expect(characterGold("character-tavlei-doppel")).resolves.toBe(7);

    const resolved = await repository.submitDecisionForTelegramUser(618n, token, {
      gameKey: "tavlei",
      tactic: "quiet_trap"
    }, now());
    const replay = await repository.submitDecisionForTelegramUser(618n, token, {
      gameKey: "tavlei",
      tactic: "quiet_trap"
    }, now());

    expect(resolved.state).toBe("resolved");
    expect(replay.state).toBe("replayed");
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, resultJson: true }
    })).resolves.toMatchObject({
      status: "completed",
      resultJson: {
        gameKey: "tavlei",
        opponentKind: "doppelganger",
        potGold: 13
      }
    });
    await expect(prisma.tavernGameParticipant.count({
      where: { session: { token } }
    })).resolves.toBe(1);
    const goldAfterResolution = await characterGold("character-tavlei-doppel");
    await repository.submitDecisionForTelegramUser(618n, token, {
      gameKey: "tavlei",
      tactic: "quiet_trap"
    }, now());
    await expect(characterGold("character-tavlei-doppel")).resolves.toBe(goldAfterResolution);
  });

  it("lists ready Dice Poker against the Doppelganger as a visible table", async () => {
    const token = "12345678-1234-4234-9234-000000000619";
    await seedCharacter({ telegramUserId: 619n, characterId: "character-dice-doppel", name: "Дзеркальний", gold: 20 });

    const created = await repository.createDicePokerForTelegramUser(619n, {
      mode: "quick",
      token,
      seed: "dice-doppelganger-visible",
      stakeGold: 13,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 5 * 60_000),
      cooldownMs: 0,
      now: now(),
      state: startQuickDicePoker("dice-doppelganger-visible")
    });

    expect(created.state).toBe("created");

    const visible = await repository.listOpen(now());

    expect(visible.map((session) => session.token)).toContain(token);
    expect(visible.find((session) => session.token === token)).toMatchObject({
      status: "ready",
      gameKey: "kosti",
      stakeGold: 13
    });
  });

  it("settles a social quick dice poker table for three real participants once", async () => {
    const token = "12345678-1234-4234-9234-000000000591";
    await seedCharacter({ telegramUserId: 591n, characterId: "character-social-quick-a", name: "Перший", gold: 10 });
    await seedCharacter({ telegramUserId: 592n, characterId: "character-social-quick-b", name: "Другий", gold: 10 });
    await seedCharacter({ telegramUserId: 593n, characterId: "character-social-quick-c", name: "Третій", gold: 10 });
    const table = startDicePokerTable("quick");

    const created = await repository.createDicePokerForTelegramUser(591n, {
      mode: "quick",
      token,
      seed: "social-quick",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 13 * 60_000),
      joinExpiresAt: new Date(now().getTime() + 13 * 60_000),
      decisionExpiresAt: null,
      status: "open",
      cooldownMs: 0,
      now: now(),
      state: table,
      participantState: startQuickDicePoker("social-quick:participant:a")
    });
    const joined = await repository.joinByTokenForTelegramUser(592n, token, joinInput());
    const joinedThird = await repository.joinByTokenForTelegramUser(593n, token, joinInput());
    const started = await repository.resolveKostiForTelegramUser(591n, token, now());

    expect(created.state).toBe("created");
    expect(joined.state).toBe("joined");
    expect(joinedThird.state).toBe("joined");
    expect(started.state).toBe("started");
    expect(started.state === "started" ? started.session.status : null).toBe("ready");
    await expect(characterGold("character-social-quick-a")).resolves.toBe(7);
    await expect(characterGold("character-social-quick-b")).resolves.toBe(7);
    await expect(characterGold("character-social-quick-c")).resolves.toBe(7);

    const ready = await repository.peekByToken(token);
    const first = ready?.participants.find((participant) => participant.characterId === "character-social-quick-a");
    const second = ready?.participants.find((participant) => participant.characterId === "character-social-quick-b");
    const third = ready?.participants.find((participant) => participant.characterId === "character-social-quick-c");
    if (
      !first ||
      !second ||
      !third ||
      !isDicePokerState(first.decision) ||
      !isDicePokerState(second.decision) ||
      !isDicePokerState(third.decision)
    ) {
      throw new Error("Expected social quick participant states.");
    }

    const firstSaved = await repository.saveDicePokerParticipantStateForTelegramUser(
      591n,
      token,
      resolveQuickPlayerHand(first.decision, "social-quick:a", "a"),
      now()
    );
    const secondSaved = await repository.saveDicePokerParticipantStateForTelegramUser(
      592n,
      token,
      resolveQuickPlayerHand(second.decision, "social-quick:b", "b"),
      now()
    );
    const thirdSaved = await repository.saveDicePokerParticipantStateForTelegramUser(
      593n,
      token,
      resolveQuickPlayerHand(third.decision, "social-quick:c", "c"),
      now()
    );
    const replay = await repository.saveDicePokerParticipantStateForTelegramUser(
      592n,
      token,
      resolveQuickPlayerHand(second.decision, "social-quick:b", "b"),
      now()
    );

    expect(firstSaved.state).toBe("saved");
    expect(secondSaved.state).toBe("saved");
    expect(thirdSaved.state).toBe("completed");
    expect(replay.state).toBe("closed");
    const completed = await prisma.tavernGameSession.findUniqueOrThrow({
      where: { token },
      select: { status: true, resultJson: true }
    });
    expect(completed.status).toBe("completed");
    expect(completed.resultJson).toMatchObject({
      kind: "dice_poker_table",
      mode: "quick",
      phase: "terminal"
    });
    const outcomes = completed.resultJson as { outcomes?: Record<string, string> };
    expect(Object.keys(outcomes.outcomes ?? {}).sort()).toEqual([
      "character-social-quick-a",
      "character-social-quick-b",
      "character-social-quick-c"
    ]);
    const goldA = await characterGold("character-social-quick-a");
    const goldB = await characterGold("character-social-quick-b");
    const goldC = await characterGold("character-social-quick-c");
    expect((goldA ?? 0) + (goldB ?? 0) + (goldC ?? 0)).toBe(30);
  });

  it("starts a social quick dice poker table three minutes after the second player joins", async () => {
    const token = "12345678-1234-4234-9234-000000000598";
    const base = now();
    await seedCharacter({ telegramUserId: 598n, characterId: "character-social-quick-start-a", name: "Перший таймер", gold: 10 });
    await seedCharacter({ telegramUserId: 599n, characterId: "character-social-quick-start-b", name: "Другий таймер", gold: 10 });
    const table = startDicePokerTable("quick");

    const created = await repository.createDicePokerForTelegramUser(598n, {
      mode: "quick",
      token,
      seed: "social-quick-auto-start",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(base.getTime() + 13 * 60_000),
      joinExpiresAt: new Date(base.getTime() + 13 * 60_000),
      decisionExpiresAt: null,
      status: "open",
      cooldownMs: 0,
      now: base,
      state: table,
      participantState: startQuickDicePoker("social-quick-auto-start:participant:a")
    });
    const joined = await repository.joinByTokenForTelegramUser(599n, token, joinInput(base));

    expect(created.state).toBe("created");
    expect(joined.state).toBe("joined");
    await expect(repository.expireDue(new Date(base.getTime() + 3 * 60_000 - 1))).resolves.toBe(0);
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, decisionExpiresAt: true, resultJson: true }
    })).resolves.toMatchObject({
      status: "open",
      decisionExpiresAt: new Date(base.getTime() + 3 * 60_000),
      resultJson: { kind: "dice_poker_table", mode: "quick", phase: "waiting" }
    });

    await expect(repository.expireDue(new Date(base.getTime() + 3 * 60_000 + 1))).resolves.toBe(1);
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, decisionExpiresAt: true, resultJson: true }
    })).resolves.toMatchObject({
      status: "ready",
      decisionExpiresAt: new Date(base.getTime() + 6 * 60_000 + 1),
      resultJson: { kind: "dice_poker_table", mode: "quick", phase: "playing" }
    });
  });

  it("starts a social quick dice poker table when all seated players are ready", async () => {
    const token = "12345678-1234-4234-9234-000000000602";
    const base = now();
    await seedCharacter({ telegramUserId: 602n, characterId: "character-social-quick-ready-a", name: "Перша готова", gold: 10 });
    await seedCharacter({ telegramUserId: 603n, characterId: "character-social-quick-ready-b", name: "Другий готовий", gold: 10 });
    const table = startDicePokerTable("quick");

    await repository.createDicePokerForTelegramUser(602n, {
      mode: "quick",
      token,
      seed: "social-quick-ready-start",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(base.getTime() + 13 * 60_000),
      joinExpiresAt: new Date(base.getTime() + 13 * 60_000),
      decisionExpiresAt: null,
      status: "open",
      cooldownMs: 0,
      now: base,
      state: table,
      participantState: startQuickDicePoker("social-quick-ready-start:participant:a")
    });
    await repository.joinByTokenForTelegramUser(603n, token, joinInput(base));

    const firstReady = await repository.setReadinessForTelegramUser(602n, token, "ready", {
      now: base
    });
    const duplicate = await repository.setReadinessForTelegramUser(602n, token, "ready", {
      now: base
    });
    const started = await repository.setReadinessForTelegramUser(603n, token, "ready", {
      now: base
    });

    expect(firstReady.state).toBe("updated");
    expect(duplicate.state).toBe("already-set");
    expect(started.state).toBe("started");
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, decisionExpiresAt: true, resultJson: true }
    })).resolves.toMatchObject({
      status: "ready",
      decisionExpiresAt: new Date(base.getTime() + 3 * 60_000),
      resultJson: { kind: "dice_poker_table", mode: "quick", phase: "playing" }
    });
    const participants = await prisma.tavernGameParticipant.findMany({
      where: { session: { token } },
      select: { resultJson: true }
    });
    expect(participants).toHaveLength(2);
    expect(participants.every((participant) =>
      typeof participant.resultJson === "object" &&
      participant.resultJson !== null &&
      "readiness" in participant.resultJson &&
      participant.resultJson.readiness === "ready"
    )).toBe(true);
  });

  it("auto-finishes an unresolved social quick dice poker round after three minutes", async () => {
    const token = "12345678-1234-4234-9234-000000000600";
    const base = now();
    const startAt = new Date(base.getTime() + 3 * 60_000 + 1);
    const finishAt = new Date(startAt.getTime() + 3 * 60_000 + 1);
    await seedCharacter({ telegramUserId: 600n, characterId: "character-social-quick-finish-a", name: "Перший фініш", gold: 10 });
    await seedCharacter({ telegramUserId: 601n, characterId: "character-social-quick-finish-b", name: "Другий фініш", gold: 10 });
    const table = startDicePokerTable("quick");

    await repository.createDicePokerForTelegramUser(600n, {
      mode: "quick",
      token,
      seed: "social-quick-auto-finish",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(base.getTime() + 13 * 60_000),
      joinExpiresAt: new Date(base.getTime() + 13 * 60_000),
      decisionExpiresAt: null,
      status: "open",
      cooldownMs: 0,
      now: base,
      state: table,
      participantState: startQuickDicePoker("social-quick-auto-finish:participant:a")
    });
    await repository.joinByTokenForTelegramUser(601n, token, joinInput(base));
    await expect(repository.expireDue(startAt)).resolves.toBe(1);

    await expect(repository.expireDue(finishAt)).resolves.toBe(1);

    const completed = await prisma.tavernGameSession.findUniqueOrThrow({
      where: { token },
      select: { status: true, resultJson: true }
    });
    expect(completed.status).toBe("completed");
    expect(completed.resultJson).toMatchObject({
      kind: "dice_poker_table",
      mode: "quick",
      phase: "terminal"
    });
    const participants = await prisma.tavernGameParticipant.findMany({
      where: { session: { token } },
      select: { status: true, activeStakeKey: true, resultJson: true }
    });
    expect(participants).toHaveLength(2);
    expect(participants.every((participant) => participant.activeStakeKey === null)).toBe(true);
    expect(participants.every((participant) => participant.resultJson !== null)).toBe(true);
    const goldA = await characterGold("character-social-quick-finish-a");
    const goldB = await characterGold("character-social-quick-finish-b");
    expect((goldA ?? 0) + (goldB ?? 0)).toBe(20);
  });

  it("treats legacy Kosti decisions on solo Dice Poker rows as closed without writing old choices", async () => {
    const token = "12345678-1234-4234-9234-000000000435";
    await seedCharacter({ telegramUserId: 435n, characterId: "character-dice-legacy-guard", name: "Сторож", gold: 10 });

    const created = await repository.createDicePokerForTelegramUser(435n, {
      mode: "quick",
      token,
      seed: "dice-legacy-guard",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 13 * 60_000),
      joinExpiresAt: new Date(now().getTime() + 13 * 60_000),
      decisionExpiresAt: null,
      status: "open",
      cooldownMs: 0,
      now: now(),
      state: startQuickDicePoker("dice-legacy-guard:solo")
    });

    const replay = await repository.submitDecisionForTelegramUser(435n, token, {
      gameKey: "kosti",
      style: "push",
      sign: "high_hand"
    }, now());

    expect(created.state).toBe("created");
    expect(replay.state).toBe("closed");
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, potGold: true }
    })).resolves.toEqual({ status: "open", potGold: 3 });

    const participant = await prisma.tavernGameParticipant.findFirstOrThrow({
      where: { characterId: "character-dice-legacy-guard" },
      select: { status: true, decisionJson: true, activeStakeKey: true }
    });
    expect(participant.status).toBe("joined");
    expect(participant.activeStakeKey).toBeTypeOf("string");
    expect(participant.decisionJson).toBeNull();
    await expect(characterGold("character-dice-legacy-guard")).resolves.toBe(7);
  });

  it("refunds expired social scorecard dice poker tables on stale token actions without legacy resolution", async () => {
    const token = "12345678-1234-4234-9234-000000000593";
    await seedCharacter({ telegramUserId: 593n, characterId: "character-social-score-a", name: "Перший лист", gold: 10 });
    await seedCharacter({ telegramUserId: 594n, characterId: "character-social-score-b", name: "Другий лист", gold: 10 });
    await seedCharacter({ telegramUserId: 595n, characterId: "character-social-score-c", name: "Третій лист", gold: 10 });
    const table = startDicePokerTable("scorecard");

    const created = await repository.createDicePokerForTelegramUser(593n, {
      mode: "scorecard",
      token,
      seed: "social-scorecard-expired",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 93 * 60_000),
      joinExpiresAt: new Date(now().getTime() + 13 * 60_000),
      decisionExpiresAt: null,
      status: "open",
      cooldownMs: 0,
      now: now(),
      state: table,
      participantState: startScorecardDicePoker("social-scorecard-expired:participant:a")
    });
    const joined = await repository.joinByTokenForTelegramUser(594n, token, joinInput());
    const expiredAt = new Date(now().getTime() + 14 * 60_000);

    const staleJoin = await repository.joinByTokenForTelegramUser(595n, token, joinInput(expiredAt));
    const replay = await repository.resolveKostiForTelegramUser(593n, token, new Date(expiredAt.getTime() + 1000));

    expect(created.state).toBe("created");
    expect(joined.state).toBe("joined");
    expect(staleJoin.state).toBe("closed");
    expect(replay).toMatchObject({ state: "replayed", resolution: null });
    await expect(characterGold("character-social-score-a")).resolves.toBe(10);
    await expect(characterGold("character-social-score-b")).resolves.toBe(10);
    await expect(characterGold("character-social-score-c")).resolves.toBe(10);
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, resultJson: true }
    })).resolves.toMatchObject({
      status: "expired_refund",
      resultJson: {
        kind: "dice_poker_expired",
        refundedGold: 6
      }
    });
    await expect(prisma.tavernGameParticipant.findMany({
      where: { session: { token } },
      select: { status: true, refundedGold: true, activeStakeKey: true },
      orderBy: { joinedAt: "asc" }
    })).resolves.toEqual([
      { status: "left_refunded", refundedGold: 3, activeStakeKey: null },
      { status: "left_refunded", refundedGold: 3, activeStakeKey: null }
    ]);
  });

  it("keeps invite preview passive after join-window expiry without mutating status or gold", async () => {
    const token = "12345678-1234-4234-9234-000000000436";
    await seedCharacter({ telegramUserId: 436n, characterId: "character-passive-invite", name: "Запрошувач", gold: 10 });

    const created = await repository.createDicePokerForTelegramUser(436n, {
      mode: "quick",
      token,
      seed: "passive-invite-expired",
      stakeGold: 1,
      maxStake: 93,
      expiresAt: new Date(now().getTime() + 5 * 60_000),
      joinExpiresAt: new Date(now().getTime() - 1000),
      decisionExpiresAt: null,
      cooldownMs: 0,
      now: now(),
      status: "open",
      state: startDicePokerTable("quick")
    });
    expect(created.state).toBe("created");
    const service = new TavernGameService(repository, {
      tavernGamesEnabled: true,
      tavernGameTavleiEnabled: true,
      tavernGameKostiEnabled: true,
      tavernGameMaxStake: 93,
      tavernGameCreateCooldownSec: 0
    }, now);

    const preview = await service.getInviteViewForTelegramUser(436n, token);

    expect(preview.state).toBe("stale");
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, resultJson: true }
    })).resolves.toEqual({
      status: "open",
      resultJson: {
        kind: "dice_poker_table",
        mode: "quick",
        phase: "waiting",
        playerCap: 8,
        drawRound: 1
      }
    });
    await expect(characterGold("character-passive-invite")).resolves.toBe(9);
    const participant = await prisma.tavernGameParticipant.findFirst({
      where: { characterId: "character-passive-invite" },
      select: { refundedGold: true, activeStakeKey: true }
    });
    expect(participant?.refundedGold).toBe(0);
    expect(participant?.activeStakeKey).toBeTypeOf("string");
  });

  it("starts a social scorecard dice poker table explicitly for participant notifications", async () => {
    const token = "12345678-1234-4234-9234-000000000596";
    await seedCharacter({ telegramUserId: 596n, characterId: "character-score-start-a", name: "Перший старт", gold: 10 });
    await seedCharacter({ telegramUserId: 597n, characterId: "character-score-start-b", name: "Другий старт", gold: 10 });
    const table = startDicePokerTable("scorecard");

    await repository.createDicePokerForTelegramUser(596n, {
      mode: "scorecard",
      token,
      seed: "social-scorecard-start",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 93 * 60_000),
      joinExpiresAt: new Date(now().getTime() + 13 * 60_000),
      decisionExpiresAt: null,
      status: "open",
      cooldownMs: 0,
      now: now(),
      state: table,
      participantState: startScorecardDicePoker("social-scorecard-start:participant:a")
    });
    await repository.joinByTokenForTelegramUser(597n, token, joinInput());

    const started = await repository.resolveKostiForTelegramUser(596n, token, now());

    expect(started.state).toBe("started");
    expect(started.state === "started" ? started.resolution : "unexpected").toBeNull();
    expect(started.state === "started" ? started.session.status : null).toBe("ready");
    expect(started.state === "started" ? started.session.result : null).toMatchObject({
      kind: "dice_poker_table",
      mode: "scorecard",
      phase: "playing"
    });
  });

  it("keeps scorecard dice poker alive beyond quick ttl and refunds after scorecard deadline", async () => {
    const token = "12345678-1234-4234-9234-000000000588";
    await seedCharacter({ telegramUserId: 588n, characterId: "character-scorecard-expiry", name: "Табличник", gold: 10 });
    const state = startScorecardDicePoker("scorecard-expiry");
    const created = await repository.createDicePokerForTelegramUser(588n, {
      mode: "scorecard",
      token,
      seed: "scorecard-expiry",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 93 * 60_000),
      cooldownMs: 0,
      now: now(),
      state
    });
    expect(created.state).toBe("created");
    await expect(characterGold("character-scorecard-expiry")).resolves.toBe(7);

    await expect(repository.expireDue(new Date(now().getTime() + 6 * 60_000))).resolves.toBe(0);
    await expect(characterGold("character-scorecard-expiry")).resolves.toBe(7);

    await expect(repository.expireDue(new Date(now().getTime() + 94 * 60_000))).resolves.toBe(1);
    await expect(characterGold("character-scorecard-expiry")).resolves.toBe(10);
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, resultJson: true }
    })).resolves.toMatchObject({
      status: "expired_refund",
      resultJson: { kind: "dice_poker_expired", refundedGold: 3 }
    });
  });

  it("refreshes scorecard dice poker deadline on saved state changes", async () => {
    const token = "12345678-1234-4234-9234-000000000589";
    await seedCharacter({ telegramUserId: 589n, characterId: "character-scorecard-refresh", name: "Перекидач", gold: 10 });
    const state = startScorecardDicePoker("scorecard-refresh");
    const created = await repository.createDicePokerForTelegramUser(589n, {
      mode: "scorecard",
      token,
      seed: "scorecard-refresh",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 93 * 60_000),
      cooldownMs: 0,
      now: now(),
      state
    });
    expect(created.state).toBe("created");

    const refreshAt = new Date(now().getTime() + 60 * 60_000);
    const refreshed = await repository.saveDicePokerStateForTelegramUser(
      589n,
      token,
      { ...state, selectedMask: 1 },
      refreshAt,
      new Date(refreshAt.getTime() + 93 * 60_000)
    );
    expect(refreshed.state).toBe("saved");

    await expect(repository.expireDue(new Date(now().getTime() + 94 * 60_000))).resolves.toBe(0);
    await expect(characterGold("character-scorecard-refresh")).resolves.toBe(7);

    await expect(repository.expireDue(new Date(now().getTime() + 154 * 60_000))).resolves.toBe(1);
    await expect(characterGold("character-scorecard-refresh")).resolves.toBe(10);
  });

  it("allows another table immediately after the previous table closes", async () => {
    const token = "12345678-1234-4234-9234-000000000590";
    const secondToken = "12345678-1234-4234-9234-000000000599";
    await seedCharacter({ telegramUserId: 590n, characterId: "character-create-cooldown", name: "Стільник", gold: 20 });
    const created = await repository.createForTelegramUser(590n, {
      ...createInput("tavlei", token),
      cooldownMs: 120_000
    });
    expect(created.state).toBe("created");
    await expect(characterGold("character-create-cooldown")).resolves.toBe(17);

    const cancelled = await repository.cancelForTelegramUser(590n, token, now());
    const second = await repository.createForTelegramUser(590n, {
      ...createInput("tavlei", secondToken),
      cooldownMs: 120_000
    });

    expect(cancelled.state).toBe("cancelled");
    expect(second.state).toBe("created");
    await expect(characterGold("character-create-cooldown")).resolves.toBe(17);
  });

  function now(): Date {
    return new Date("2026-07-02T10:00:00.000Z");
  }

  function createInput(gameKey: "tavlei" | "kosti", token: string) {
    const base = now();
    return {
      gameKey,
      token,
      seed: `${gameKey}:seed:${token}`,
      stakeGold: 3,
      maxStake: 25,
      joinExpiresAt: new Date(base.getTime() + 13 * 60_000),
      decisionExpiresAt: new Date(base.getTime() + 5 * 60_000),
      cooldownMs: 0,
      now: base
    };
  }

  function joinInput(base = now()) {
    return {
      now: base,
      decisionExpiresAt: new Date(base.getTime() + 5 * 60_000),
      quickStartExpiresAt: new Date(base.getTime() + 3 * 60_000)
    };
  }

  async function seedCharacter(input: {
    telegramUserId: bigint;
    characterId: string;
    name: string;
    gold: number;
  }): Promise<void> {
    const userId = `user-${input.characterId}`;
    await prisma.user.create({
      data: {
        id: userId,
        telegramUserId: input.telegramUserId,
        displayName: input.name,
        lastSeenLocationId: "location.korchma.bar"
      }
    });
    await prisma.character.create({
      data: {
        id: input.characterId,
        userId,
        name: input.name,
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 5,
        xp: 0,
        gold: input.gold,
        hpCurrent: 25,
        hpMax: 25,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: { intelligence: 7, luck: 6 }
      }
    });
  }

  async function characterGold(characterId: string): Promise<number | null> {
    const row = await prisma.character.findUnique({
      where: { id: characterId },
      select: { gold: true }
    });
    return row?.gold ?? null;
  }

  async function completeTavleiSession(token: string, winnerCharacterId: string, completedAt: Date): Promise<void> {
    const session = await prisma.tavernGameSession.findUniqueOrThrow({
      where: { token },
      select: {
        id: true,
        participants: {
          select: { characterId: true }
        }
      }
    });
    await prisma.tavernGameSession.update({
      where: { token },
      data: {
        status: "completed",
        completedAt,
        resultJson: {
          gameKey: "tavlei",
          outcome: "win",
          winnerCharacterId,
          players: session.participants.map((participant) => ({
            characterId: participant.characterId
          }))
        }
      }
    });
    await prisma.tavernGameParticipant.updateMany({
      where: { sessionId: session.id },
      data: {
        status: "completed",
        completedAt,
        activeStakeKey: null
      }
    });
  }
});

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
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
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE characters (
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
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE tavern_game_sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      game_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      creator_character_id TEXT NOT NULL,
      stake_gold INTEGER NOT NULL,
      pot_gold INTEGER NOT NULL DEFAULT 0,
      seed TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      result_json JSONB,
      opened_at DATETIME NOT NULL,
      join_expires_at DATETIME NOT NULL,
      decision_expires_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_character_id) REFERENCES characters(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE tavern_game_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      telegram_user_id BIGINT NOT NULL,
      display_name TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'joined',
      stake_gold INTEGER NOT NULL,
      payout_gold INTEGER NOT NULL DEFAULT 0,
      refunded_gold INTEGER NOT NULL DEFAULT 0,
      decision_json JSONB,
      result_json JSONB,
      active_stake_key TEXT UNIQUE,
      joined_at DATETIME NOT NULL,
      decided_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES tavern_game_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      UNIQUE (session_id, character_id)
    )
  `);
}
