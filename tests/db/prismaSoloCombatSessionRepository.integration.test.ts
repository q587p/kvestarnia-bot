import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaSoloCombatSessionRepository } from "../../src/db/repositories/prismaSoloCombatSessionRepository";
import { PrismaClassNoncombatRepository } from "../../src/db/repositories/prismaClassNoncombatRepository";
import type { CreateSoloCombatSessionInput } from "../../src/db/repositories/soloCombatSessionRepository";
import type { CombatState } from "../../src/domain/combat";
import {
  VARENYK_SATED_STATUS_KEY,
  type VarenykSatedPayloadV1
} from "../../src/domain/noncombat/varenykSatedSupport";

describe("PrismaSoloCombatSessionRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaSoloCombatSessionRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-solo-combat-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaSoloCombatSessionRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("rolls back duplicate active solo fight creation through the combat lease", async () => {
    await seedCharacter(prisma, {
      userId: "user-solo-race",
      characterId: "character-solo-race",
      telegramUserId: 4242n
    });

    const [first, second] = await Promise.all([
      repository.createForTelegramUser(
        4242n,
        makeCreateInput("session-solo-race-a", "monster.deadline-spider")
      ),
      repository.createForTelegramUser(
        4242n,
        makeCreateInput("session-solo-race-b", "monster.preapproval-dragonling")
      )
    ]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second?.id).toBe(first?.id);

    const activeSessions = await prisma.soloCombatSession.findMany({
      where: {
        characterId: "character-solo-race",
        status: "active"
      }
    });
    const leases = await prisma.activeCombatLease.findMany({
      where: {
        characterId: "character-solo-race"
      }
    });

    expect(activeSessions).toHaveLength(1);
    expect(leases).toHaveLength(1);
    expect(leases[0]?.referenceId).toBe(activeSessions[0]?.id);
    expect(activeSessions[0]?.id).toBe(first?.id);
  });

  it("atomically consumes exact queued vodka with solo session and lease creation", async () => {
    await seedCharacter(prisma, {
      userId: "user-vodka-atomic",
      characterId: "character-vodka-atomic",
      telegramUserId: 14260n
    });
    const now = new Date("2026-06-23T10:00:00.000Z");
    await prisma.characterDrinkState.create({
      data: {
        id: "drink-state-vodka-atomic",
        activationId: "activation-vodka-atomic",
        characterId: "character-vodka-atomic",
        drinkKey: "drink.pepper-vodka",
        phase: "queued",
        startedAt: now,
        expiresAt: new Date("2026-06-23T10:23:00.000Z"),
        sourceType: "self_purchase"
      }
    });

    const input = makeCreateInput("session-vodka-atomic", "monster.deadline-spider");
    input.state.drinkModifiers = {
      drinkKey: "drink.pepper-vodka",
      sourceId: "drink-state-vodka-atomic",
      activationId: "activation-vodka-atomic",
      outgoingDamageMultiplierBp: 11300,
      incomingDamageMultiplierBp: 11300
    };
    input.drinkStateCommit = {
      expectedStateId: "drink-state-vodka-atomic",
      expectedActivationId: "activation-vodka-atomic",
      expectedStartedAt: now,
      expectedExpiresAt: new Date("2026-06-23T10:23:00.000Z"),
      drinkKey: "drink.pepper-vodka",
      phase: "queued",
      now
    };

    const session = await repository.createForTelegramUser(14260n, input);

    expect(session?.state?.drinkModifiers).toEqual(input.state.drinkModifiers);
    await expect(prisma.characterDrinkState.count({
      where: { characterId: "character-vodka-atomic" }
    })).resolves.toBe(0);
    await expect(prisma.activeCombatLease.count({
      where: { characterId: "character-vodka-atomic", referenceId: "session-vodka-atomic" }
    })).resolves.toBe(1);
    await expect(prisma.shynokDrinkActivationAudit.findUnique({
      where: { activationId: "activation-vodka-atomic" }
    })).resolves.toMatchObject({
      outcome: "consumed",
      combatSessionId: "session-vodka-atomic",
      drinkKey: "drink.pepper-vodka"
    });
  });

  it("does not consume a newer replacement vodka when the expected drink-state id changed", async () => {
    await seedCharacter(prisma, {
      userId: "user-vodka-aba",
      characterId: "character-vodka-aba",
      telegramUserId: 14261n
    });
    const now = new Date("2026-06-23T10:00:00.000Z");
    await prisma.characterDrinkState.create({
      data: {
        id: "drink-state-vodka-new",
        activationId: "activation-vodka-new",
        characterId: "character-vodka-aba",
        drinkKey: "drink.pepper-vodka",
        phase: "queued",
        startedAt: now,
        expiresAt: new Date("2026-06-23T10:23:00.000Z"),
        sourceType: "self_purchase"
      }
    });

    const input = makeCreateInput("session-vodka-aba", "monster.deadline-spider");
    input.state.drinkModifiers = {
      drinkKey: "drink.pepper-vodka",
      sourceId: "drink-state-vodka-old",
      activationId: "activation-vodka-old",
      outgoingDamageMultiplierBp: 11300,
      incomingDamageMultiplierBp: 11300
    };
    input.drinkStateCommit = {
      expectedStateId: "drink-state-vodka-old",
      expectedActivationId: "activation-vodka-old",
      expectedStartedAt: now,
      expectedExpiresAt: new Date("2026-06-23T10:23:00.000Z"),
      drinkKey: "drink.pepper-vodka",
      phase: "queued",
      now
    };

    const session = await repository.createForTelegramUser(14261n, input);

    expect(session?.state?.drinkModifiers).toBeUndefined();
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-vodka-aba" }
    })).resolves.toMatchObject({ id: "drink-state-vodka-new" });
  });

  it("does not consume a refreshed vodka when the row id is reused but activation changed", async () => {
    await seedCharacter(prisma, {
      userId: "user-vodka-refresh-aba",
      characterId: "character-vodka-refresh-aba",
      telegramUserId: 14262n
    });
    const now = new Date("2026-06-23T10:00:00.000Z");
    const refreshedAt = new Date("2026-06-23T10:05:00.000Z");
    await prisma.characterDrinkState.create({
      data: {
        id: "drink-state-vodka-reused",
        activationId: "activation-vodka-refreshed",
        characterId: "character-vodka-refresh-aba",
        drinkKey: "drink.pepper-vodka",
        phase: "queued",
        startedAt: refreshedAt,
        expiresAt: new Date("2026-06-23T10:28:00.000Z"),
        sourceType: "self_purchase"
      }
    });

    const input = makeCreateInput("session-vodka-refresh-aba", "monster.deadline-spider");
    input.state.drinkModifiers = {
      drinkKey: "drink.pepper-vodka",
      sourceId: "drink-state-vodka-reused",
      activationId: "activation-vodka-old",
      outgoingDamageMultiplierBp: 11300,
      incomingDamageMultiplierBp: 11300
    };
    input.drinkStateCommit = {
      expectedStateId: "drink-state-vodka-reused",
      expectedActivationId: "activation-vodka-old",
      expectedStartedAt: now,
      expectedExpiresAt: new Date("2026-06-23T10:23:00.000Z"),
      drinkKey: "drink.pepper-vodka",
      phase: "queued",
      now
    };

    const session = await repository.createForTelegramUser(14262n, input);

    expect(session?.state?.drinkModifiers).toBeUndefined();
    await expect(prisma.characterDrinkState.findUnique({
      where: { characterId: "character-vodka-refresh-aba" }
    })).resolves.toMatchObject({
      id: "drink-state-vodka-reused",
      activationId: "activation-vodka-refreshed"
    });
    await expect(prisma.shynokDrinkActivationAudit.count({
      where: { activationId: "activation-vodka-refreshed" }
    })).resolves.toBe(0);
  });

  it("follows a live lease to a terminal pending session and returns it on create conflict", async () => {
    await seedCharacter(prisma, {
      userId: "user-terminal-pending",
      characterId: "character-terminal-pending",
      telegramUserId: 4250n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "terminal-pending-session",
        characterId: "character-terminal-pending",
        monsterId: "monster.deadline-spider",
        status: "won",
        source: "normal",
        completedAt: new Date("2026-06-22T10:00:00.000Z"),
        updatedAt: new Date("2026-06-22T10:00:00.000Z"),
        settlementStatus: "pending"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-terminal-pending",
        characterId: "character-terminal-pending",
        kind: "solo-combat",
        referenceId: "terminal-pending-session"
      }
    });

    await expect(repository.findLeasedByTelegramUserId(4250n)).resolves.toMatchObject({
      state: "terminal-pending",
      session: {
        id: "terminal-pending-session",
        status: "won",
        state: {
          settlement: {
            status: "pending"
          }
        }
      }
    });

    const recovered = await repository.createForTelegramUser(
      4250n,
      makeCreateInput("new-session-after-conflict", "monster.preapproval-dragonling")
    );

    expect(recovered?.id).toBe("terminal-pending-session");
    await expect(prisma.soloCombatSession.count({
      where: {
        characterId: "character-terminal-pending"
      }
    })).resolves.toBe(1);
  });

  it("cleans exact stale supported leases without replaying completed or forfeited settlements", async () => {
    await seedCharacter(prisma, {
      userId: "user-stale-lease",
      characterId: "character-stale-lease",
      telegramUserId: 4251n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "completed-stale-session",
        characterId: "character-stale-lease",
        monsterId: "monster.deadline-spider",
        status: "won",
        source: "normal",
        completedAt: new Date("2026-06-22T10:10:00.000Z"),
        updatedAt: new Date("2026-06-22T10:10:00.000Z"),
        settlementStatus: "completed"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-completed-stale",
        characterId: "character-stale-lease",
        kind: "solo-combat",
        referenceId: "completed-stale-session"
      }
    });

    await expect(repository.findLeasedByTelegramUserId(4251n)).resolves.toMatchObject({
      state: "terminal-completed",
      session: {
        id: "completed-stale-session"
      }
    });
    await expect(repository.releaseLeaseBySessionId("completed-stale-session")).resolves.toBe(true);
    await expect(prisma.activeCombatLease.count({
      where: {
        characterId: "character-stale-lease"
      }
    })).resolves.toBe(0);

    await prisma.activeCombatLease.create({
      data: {
        id: "lease-missing-stale",
        characterId: "character-stale-lease",
        kind: "solo-combat",
        referenceId: "missing-stale-session"
      }
    });
    await expect(repository.findLeasedByTelegramUserId(4251n)).resolves.toEqual({
      state: "missing-session",
      referenceId: "missing-stale-session"
    });
    await expect(repository.releaseLeaseBySessionId("missing-stale-session")).resolves.toBe(true);
  });

  it("excludes a missing session's exact combat lease interval without consuming outside remainder", async () => {
    await seedCharacter(prisma, {
      userId: "user-missing-sated-session",
      characterId: "character-missing-sated-session",
      telegramUserId: 4293n
    });
    const startedAt = new Date("2026-07-14T10:00:00.000Z");
    const leaseStartedAt = new Date("2026-07-14T10:00:30.000Z");
    const payload: VarenykSatedPayloadV1 = {
      kind: "varenyk-sated-support-v1",
      version: 1,
      activationId: "missing-session-activation",
      actorCharacterId: "character-missing-sated-session",
      actorRemortCount: 0,
      recipientCharacterId: "character-missing-sated-session",
      recipientRemortCount: 0,
      rank: 1,
      manaCost: 8,
      effectiveStats: { intelligence: 8, charisma: 8, level: 3, equipmentItemIds: [] },
      startedAt: startedAt.toISOString(),
      expiresAt: new Date("2026-07-14T10:13:00.000Z").toISOString(),
      availableAt: new Date("2026-07-14T11:33:00.000Z").toISOString(),
      cursorAt: startedAt.toISOString(),
      receipt: {
        version: 1,
        previewToken: "missing-session-preview",
        actorTelegramUserId: "4293",
        targetTelegramUserId: "4293",
        actorName: "Пан Вареник",
        targetName: "Пан Вареник",
        immediateHpRestored: 0,
        immediateManaRestored: 0,
        actorManaAfter: 12,
        targetHpAfter: 20,
        targetManaAfter: 12
      }
    };
    await prisma.characterCooldown.create({
      data: {
        characterId: "character-missing-sated-session",
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-missing-sated-session",
        characterId: "character-missing-sated-session",
        kind: "solo-combat",
        referenceId: "missing-sated-session",
        createdAt: leaseStartedAt,
        updatedAt: leaseStartedAt
      }
    });

    await expect(repository.releaseLeaseBySessionId(
      "missing-sated-session",
      new Date("2026-07-14T10:05:30.000Z")
    )).resolves.toBe(true);

    const stored = await prisma.characterCooldown.findUniqueOrThrow({
      where: {
        characterId_key: {
          characterId: "character-missing-sated-session",
          key: VARENYK_SATED_STATUS_KEY
        }
      }
    });
    expect((stored.resultJson as { cursorAt: string }).cursorAt).toBe("2026-07-14T10:05:00.000Z");
  });

  it("retains the original remainder after combat progress when solo state later disappears or becomes malformed", async () => {
    for (const mode of ["missing", "malformed"] as const) {
      const characterId = `character-progress-${mode}`;
      const sessionId = `session-progress-${mode}`;
      const telegramUserId = mode === "missing" ? 42932n : 42933n;
      const startedAt = new Date("2026-07-14T12:00:00.000Z");
      const leaseStartedAt = new Date("2026-07-14T12:00:30.000Z");
      const releasedAt = new Date("2026-07-14T12:05:30.000Z");
      await seedCharacter(prisma, {
        userId: `user-progress-${mode}`,
        characterId,
        telegramUserId
      });
      await prisma.character.update({
        where: { id: characterId },
        data: {
          classId: "class.varenyk-mancer",
          hpCurrent: 1,
          manaCurrent: 1,
          hpRegenAt: releasedAt,
          manaRegenAt: releasedAt
        }
      });
      const payload = makeSoloSatedPayload(characterId, `progress-${mode}-activation`, startedAt, telegramUserId);
      if (mode === "malformed") {
        payload.expiresAt = "2026-07-14T12:05:00.000Z";
      }
      await prisma.characterCooldown.create({
        data: {
          characterId,
          key: VARENYK_SATED_STATUS_KEY,
          availableAt: new Date(payload.availableAt),
          resultJson: payload
        }
      });
      const state = makeCombatState(sessionId, "monster.deadline-spider");
      state.varenykSated = {
        version: 1,
        activationId: payload.activationId,
        recipientCharacterId: characterId,
        recipientRemortCount: 0,
        rank: 1,
        expiresAt: payload.expiresAt,
        cursorAt: leaseStartedAt.toISOString(),
        leaseStartedAt: leaseStartedAt.toISOString(),
        outsideRemainderMs: 30_000,
        pulseIds: [`${sessionId}:turn:1:${characterId}`]
      };
      await prisma.soloCombatSession.create({
        data: {
          id: sessionId,
          characterId,
          monsterId: "monster.deadline-spider",
          stateJson: state,
          status: "active",
          turn: 1,
          expiresAt: new Date("2026-07-14T12:23:00.000Z")
        }
      });
      await prisma.activeCombatLease.create({
        data: {
          id: `lease-progress-${mode}`,
          characterId,
          kind: "solo-combat",
          referenceId: sessionId,
          createdAt: leaseStartedAt,
          updatedAt: leaseStartedAt
        }
      });
      const progressed = JSON.parse(JSON.stringify(state)) as CombatState;
      progressed.turn = 2;
      await expect(repository.updateByIdIfActiveTurn(sessionId, 1, {
        state: progressed,
        status: "active",
        satedLeaseAt: new Date("2026-07-14T12:03:00.000Z")
      })).resolves.toMatchObject({ turn: 2 });
      let cooldown = await prisma.characterCooldown.findUniqueOrThrow({
        where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
      });
      expect((cooldown.resultJson as { cursorAt: string }).cursorAt).toBe(startedAt.toISOString());

      if (mode === "missing") {
        await prisma.soloCombatSession.delete({ where: { id: sessionId } });
      } else {
        await prisma.soloCombatSession.update({
          where: { id: sessionId },
          data: { stateJson: { malformed: true } }
        });
      }
      await expect(repository.releaseLeaseBySessionId(sessionId, releasedAt)).resolves.toBe(true);
      await expect(repository.releaseLeaseBySessionId(sessionId, new Date(releasedAt.getTime() + 60_000)))
        .resolves.toBe(false);
      cooldown = await prisma.characterCooldown.findUniqueOrThrow({
        where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
      });
      expect((cooldown.resultJson as { cursorAt: string }).cursorAt).toBe(
        mode === "missing" ? "2026-07-14T12:05:00.000Z" : payload.expiresAt
      );

      if (mode === "missing") {
        const classNoncombat = new PrismaClassNoncombatRepository(prisma);
        await expect(classNoncombat.settleVarenykSatedForTelegramUser(
          telegramUserId,
          new Date("2026-07-14T12:05:59.999Z"),
          characterId
        )).resolves.toMatchObject({ hpRestored: 0, manaRestored: 0 });
        await expect(classNoncombat.settleVarenykSatedForTelegramUser(
          telegramUserId,
          new Date("2026-07-14T12:06:00.000Z"),
          characterId
        )).resolves.toMatchObject({ hpRestored: 1, manaRestored: 1 });
      }
    }
  });

  it("releases an old solo lease without mutating a newer Sated activation", async () => {
    const characterId = "character-newer-sated-after-lease";
    const leaseStartedAt = new Date("2026-07-14T13:00:30.000Z");
    await seedCharacter(prisma, {
      userId: "user-newer-sated-after-lease",
      characterId,
      telegramUserId: 42934n
    });
    const newer = makeSoloSatedPayload(
      characterId,
      "newer-sated-activation",
      new Date("2026-07-14T13:01:00.000Z"),
      42934n
    );
    await prisma.characterCooldown.create({
      data: {
        characterId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(newer.availableAt),
        resultJson: newer
      }
    });
    const state = makeCombatState("old-lease-newer-sated", "monster.deadline-spider");
    state.varenykSated = {
      version: 1,
      activationId: "old-sated-activation",
      recipientCharacterId: characterId,
      recipientRemortCount: 0,
      rank: 1,
      expiresAt: "2026-07-14T13:13:00.000Z",
      cursorAt: leaseStartedAt.toISOString(),
      leaseStartedAt: leaseStartedAt.toISOString(),
      outsideRemainderMs: 30_000,
      pulseIds: []
    };
    await prisma.soloCombatSession.create({
      data: {
        id: state.id,
        characterId,
        monsterId: state.monster.id,
        stateJson: state,
        status: "active",
        turn: 1,
        expiresAt: new Date("2026-07-14T13:23:00.000Z")
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "old-lease-newer-sated",
        characterId,
        kind: "solo-combat",
        referenceId: state.id,
        createdAt: leaseStartedAt,
        updatedAt: leaseStartedAt
      }
    });

    await expect(repository.releaseLeaseBySessionId(
      state.id,
      new Date("2026-07-14T13:05:30.000Z")
    )).resolves.toBe(true);
    const stored = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect(stored.resultJson).toEqual(newer);
  });

  it("releases a delayed solo lease once, preserves a near-minute remainder, and ignores duplicate cleanup after OOC recovery", async () => {
    const characterId = "character-cursor-safe-release";
    const sessionId = "cursor-safe-release";
    const startedAt = new Date("2026-07-14T10:00:00.000Z");
    const leaseStartedAt = new Date("2026-07-14T10:00:30.000Z");
    const heroReadAt = new Date("2026-07-14T10:05:20.000Z");
    const releasedAt = new Date("2026-07-14T10:05:30.000Z");
    await seedCharacter(prisma, {
      userId: "user-cursor-safe-release",
      characterId,
      telegramUserId: 42930n
    });
    await prisma.character.update({
      where: { id: characterId },
      data: {
        classId: "class.varenyk-mancer",
        hpCurrent: 1,
        manaCurrent: 1,
        hpRegenAt: heroReadAt,
        manaRegenAt: heroReadAt
      }
    });
    const payload = makeSoloSatedPayload(characterId, "cursor-safe-activation", startedAt, 42930n);
    await prisma.characterCooldown.create({
      data: {
        characterId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    const state = makeCombatState(sessionId, "monster.deadline-spider");
    state.status = "won";
    state.completedAt = releasedAt.toISOString();
    state.varenykSated = {
      version: 1,
      activationId: payload.activationId,
      recipientCharacterId: characterId,
      recipientRemortCount: 0,
      rank: 1,
      expiresAt: payload.expiresAt,
      cursorAt: leaseStartedAt.toISOString(),
      leaseStartedAt: leaseStartedAt.toISOString(),
      outsideRemainderMs: 30_000,
      pulseIds: []
    };
    await prisma.soloCombatSession.create({
      data: {
        id: sessionId,
        characterId,
        monsterId: "monster.deadline-spider",
        stateJson: state,
        status: "won",
        turn: state.turn,
        expiresAt: new Date("2026-07-14T10:23:00.000Z")
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-cursor-safe-release",
        characterId,
        kind: "solo-combat",
        referenceId: sessionId,
        createdAt: leaseStartedAt,
        updatedAt: leaseStartedAt
      }
    });

    const classNoncombat = new PrismaClassNoncombatRepository(prisma);
    await expect(classNoncombat.settleVarenykSatedForTelegramUser(
      42930n,
      heroReadAt,
      characterId
    )).resolves.toMatchObject({ hpRestored: 0, manaRestored: 0 });
    let cooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect((cooldown.resultJson as { cursorAt: string }).cursorAt).toBe(startedAt.toISOString());

    const releases = await Promise.all([
      repository.releaseLeaseBySessionId(sessionId, releasedAt),
      repository.releaseLeaseBySessionId(sessionId, releasedAt)
    ]);
    expect(releases.sort()).toEqual([false, true]);
    cooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect((cooldown.resultJson as { cursorAt: string }).cursorAt).toBe("2026-07-14T10:05:00.000Z");

    await prisma.character.update({
      where: { id: characterId },
      data: {
        hpRegenAt: new Date("2026-07-14T10:06:00.000Z"),
        manaRegenAt: new Date("2026-07-14T10:06:00.000Z")
      }
    });
    await expect(classNoncombat.settleVarenykSatedForTelegramUser(
      42930n,
      new Date("2026-07-14T10:06:00.000Z"),
      characterId
    )).resolves.toMatchObject({ hpRestored: 1, manaRestored: 1 });
    await expect(repository.releaseLeaseBySessionId(
      sessionId,
      new Date("2026-07-14T10:06:30.000Z")
    )).resolves.toBe(false);
    cooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect((cooldown.resultJson as { cursorAt: string }).cursorAt).toBe("2026-07-14T10:06:00.000Z");
    await expect(prisma.character.findUnique({ where: { id: characterId } }))
      .resolves.toMatchObject({ hpCurrent: 2, manaCurrent: 2 });
  });

  it("preserves the frozen remainder on a Hero read past Sated expiry and retires it on release", async () => {
    const characterId = "character-expired-lease-time";
    const sessionId = "expired-lease-time";
    const startedAt = new Date("2026-07-14T10:00:00.000Z");
    const leaseStartedAt = new Date("2026-07-14T10:04:30.000Z");
    const expiresAt = new Date("2026-07-14T10:05:59.000Z");
    await seedCharacter(prisma, {
      userId: "user-expired-lease-time",
      characterId,
      telegramUserId: 42931n
    });
    await prisma.character.update({
      where: { id: characterId },
      data: { classId: "class.varenyk-mancer", hpCurrent: 1, manaCurrent: 1 }
    });
    const payload = makeSoloSatedPayload(characterId, "expired-lease-activation", startedAt, 42931n);
    payload.cursorAt = "2026-07-14T10:04:00.000Z";
    payload.expiresAt = "2026-07-14T10:05:00.000Z";
    await prisma.characterCooldown.create({
      data: {
        characterId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    const state = makeCombatState(sessionId, "monster.deadline-spider");
    state.varenykSated = {
      version: 1,
      activationId: payload.activationId,
      recipientCharacterId: characterId,
      recipientRemortCount: 0,
      rank: 1,
      expiresAt: payload.expiresAt,
      cursorAt: leaseStartedAt.toISOString(),
      leaseStartedAt: leaseStartedAt.toISOString(),
      outsideRemainderMs: 30_000,
      pulseIds: []
    };
    await prisma.soloCombatSession.create({
      data: {
        id: sessionId,
        characterId,
        monsterId: "monster.deadline-spider",
        stateJson: state,
        status: "active",
        turn: state.turn,
        expiresAt
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-expired-lease-time",
        characterId,
        kind: "solo-combat",
        referenceId: sessionId,
        createdAt: leaseStartedAt,
        updatedAt: leaseStartedAt
      }
    });

    const classNoncombat = new PrismaClassNoncombatRepository(prisma);
    await expect(classNoncombat.settleVarenykSatedForTelegramUser(
      42931n,
      new Date("2026-07-14T10:05:30.000Z"),
      characterId
    )).resolves.toMatchObject({ hpRestored: 0, manaRestored: 0 });
    let cooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect((cooldown.resultJson as { cursorAt: string }).cursorAt).toBe("2026-07-14T10:04:00.000Z");

    await expect(repository.markStatusById(sessionId, "expired"))
      .resolves.toMatchObject({ status: "expired" });
    cooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect((cooldown.resultJson as { cursorAt: string }).cursorAt).toBe(payload.expiresAt);
    await expect(prisma.activeCombatLease.count({ where: { referenceId: sessionId } }))
      .resolves.toBe(0);
    await expect(repository.releaseLeaseBySessionId(
      sessionId,
      new Date("2026-07-14T10:06:30.000Z")
    )).resolves.toBe(false);
    const duplicate = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect((duplicate.resultJson as { cursorAt: string }).cursorAt).toBe(payload.expiresAt);
  });

  it("releases an early malformed solo session at the observed cleanup time and preserves its exact lease remainder", async () => {
    const characterId = "character-malformed-observed-cleanup";
    const telegramUserId = 42999n;
    const satedStartedAt = new Date("2026-07-14T10:00:00.000Z");
    const combatStartedAt = new Date("2026-07-14T10:00:30.000Z");
    const observedCleanupAt = new Date("2026-07-14T10:02:00.000Z");
    await seedCharacter(prisma, {
      userId: "user-malformed-observed-cleanup",
      characterId,
      telegramUserId
    });
    await prisma.character.update({
      where: { id: characterId },
      data: { classId: "class.varenyk-mancer", hpCurrent: 1, manaCurrent: 1 }
    });
    const payload = makeSoloSatedPayload(
      characterId,
      "malformed-observed-cleanup-activation",
      satedStartedAt,
      telegramUserId
    );
    await prisma.characterCooldown.create({
      data: {
        characterId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    const input = makeCreateInput("malformed-observed-cleanup", "monster.deadline-spider");
    input.state.life = {
      characterId,
      remortCount: 0,
      startedAt: combatStartedAt.toISOString()
    };
    input.state.hero = { hp: 1, hpMax: 30, mana: 1, manaMax: 14 };
    input.expiresAt = new Date("2026-07-14T11:00:00.000Z");
    const session = await repository.createForTelegramUser(telegramUserId, input);
    expect(session?.id).toBe("malformed-observed-cleanup");
    await expect(prisma.activeCombatLease.findUnique({ where: { characterId } }))
      .resolves.toMatchObject({ createdAt: combatStartedAt });
    await prisma.soloCombatSession.update({
      where: { id: "malformed-observed-cleanup" },
      data: { stateJson: { malformed: true } }
    });

    await expect(repository.markStatusById(
      "malformed-observed-cleanup",
      "expired",
      observedCleanupAt
    )).resolves.toMatchObject({ status: "expired" });
    const cooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect((cooldown.resultJson as { cursorAt: string }).cursorAt)
      .toBe("2026-07-14T10:01:30.000Z");
    await expect(prisma.activeCombatLease.count({ where: { characterId } })).resolves.toBe(0);

    const classNoncombat = new PrismaClassNoncombatRepository(prisma);
    await expect(classNoncombat.settleVarenykSatedForTelegramUser(
      telegramUserId,
      new Date("2026-07-14T10:02:29.999Z"),
      characterId
    )).resolves.toMatchObject({ hpRestored: 0, manaRestored: 0 });
    await expect(classNoncombat.settleVarenykSatedForTelegramUser(
      telegramUserId,
      new Date("2026-07-14T10:02:30.000Z"),
      characterId
    )).resolves.toMatchObject({ hpRestored: 1, manaRestored: 1 });
  });

  it("keeps unsupported leases visible and untouched", async () => {
    await seedCharacter(prisma, {
      userId: "user-unsupported-lease",
      characterId: "character-unsupported-lease",
      telegramUserId: 4252n
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-unsupported",
        characterId: "character-unsupported-lease",
        kind: "turn-duel",
        referenceId: "duel-session"
      }
    });

    await expect(repository.findLeasedByTelegramUserId(4252n)).resolves.toEqual({
      state: "unsupported",
      kind: "turn-duel",
      referenceId: "duel-session"
    });
    await expect(repository.releaseLeaseBySessionId("duel-session")).resolves.toBe(false);
    await expect(repository.createForTelegramUser(
      4252n,
      makeCreateInput("blocked-by-duel", "monster.preapproval-dragonling")
    )).resolves.toBeNull();
    await expect(prisma.activeCombatLease.count({
      where: {
        characterId: "character-unsupported-lease"
      }
    })).resolves.toBe(1);
  });

  it("atomically adopts an exact leased legacy active session without dropping state fields", async () => {
    await seedCharacter(prisma, {
      userId: "user-legacy-adopt",
      characterId: "character-legacy-adopt",
      telegramUserId: 4294n
    });
    await prisma.soloCombatSession.create({
      data: makeLegacySoloSessionData({
        id: "legacy-adopt-session",
        characterId: "character-legacy-adopt",
        monsterId: "monster.deadline-spider",
        status: "active",
        source: "normal",
        completedAt: new Date("2026-06-22T10:40:00.000Z"),
        updatedAt: new Date("2026-06-22T10:40:00.000Z")
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-legacy-adopt",
        characterId: "character-legacy-adopt",
        kind: "solo-combat",
        referenceId: "legacy-adopt-session"
      }
    });

    const adopted = await repository.adoptLegacySettlementById("legacy-adopt-session", {
      expectedStatus: "active",
      expectedTurn: 1,
      expectedSettlementVersion: null,
      now: new Date("2026-06-22T10:41:00.000Z")
    });

    expect(adopted.outcome).toBe("adopted");
    expect(adopted.session?.state).toMatchObject({
      life: {
        characterId: "character-legacy-adopt",
        remortCount: 0,
        startedAt: "2026-06-22T10:40:00.000Z"
      },
      settlement: {
        status: "pending",
        version: 1
      }
    });

    const stored = await prisma.soloCombatSession.findUniqueOrThrow({
      where: {
        id: "legacy-adopt-session"
      }
    });
    expect(stored.stateJson).toMatchObject({
      legacyMarker: "preserve-me",
      settlement: {
        status: "pending",
        version: 1
      }
    });
  });

  it("does not downgrade completed settlement during legacy adoption", async () => {
    await seedCharacter(prisma, {
      userId: "user-legacy-terminal-adopt",
      characterId: "character-legacy-terminal-adopt",
      telegramUserId: 4295n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "legacy-completed-adopt-session",
        characterId: "character-legacy-terminal-adopt",
        monsterId: "monster.deadline-spider",
        status: "won",
        source: "normal",
        completedAt: new Date("2026-06-22T10:45:00.000Z"),
        updatedAt: new Date("2026-06-22T10:45:00.000Z"),
        settlementStatus: "completed"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-legacy-completed-adopt",
        characterId: "character-legacy-terminal-adopt",
        kind: "solo-combat",
        referenceId: "legacy-completed-adopt-session"
      }
    });

    const adopted = await repository.adoptLegacySettlementById("legacy-completed-adopt-session", {
      expectedStatus: "won",
      expectedTurn: 1,
      expectedSettlementVersion: 1,
      now: new Date("2026-06-22T10:46:00.000Z")
    });

    expect(adopted.outcome).toBe("already-terminal-settlement");
    expect(adopted.session?.state?.settlement?.status).toBe("completed");
  });

  it("refuses legacy adoption without an exact solo-combat lease", async () => {
    await seedCharacter(prisma, {
      userId: "user-legacy-no-lease",
      characterId: "character-legacy-no-lease",
      telegramUserId: 4296n
    });
    await prisma.soloCombatSession.create({
      data: makeLegacySoloSessionData({
        id: "legacy-no-lease-session",
        characterId: "character-legacy-no-lease",
        monsterId: "monster.deadline-spider",
        status: "won",
        source: "normal",
        completedAt: new Date("2026-06-22T10:50:00.000Z"),
        updatedAt: new Date("2026-06-22T10:50:00.000Z")
      })
    });

    const adopted = await repository.adoptLegacySettlementById("legacy-no-lease-session", {
      expectedStatus: "won",
      expectedTurn: 1,
      expectedSettlementVersion: null,
      now: new Date("2026-06-22T10:51:00.000Z")
    });

    expect(adopted.outcome).toBe("missing-mismatched-lease");

    const stored = await prisma.soloCombatSession.findUniqueOrThrow({
      where: {
        id: "legacy-no-lease-session"
      }
    });
    expect(stored.stateJson).not.toHaveProperty("settlement");
  });

  it("refuses legacy adoption after a newer remort life wins", async () => {
    await seedCharacter(prisma, {
      userId: "user-legacy-life-mismatch",
      characterId: "character-legacy-life-mismatch",
      telegramUserId: 4297n
    });
    await prisma.soloCombatSession.create({
      data: makeLegacySoloSessionData({
        id: "legacy-life-mismatch-session",
        characterId: "character-legacy-life-mismatch",
        monsterId: "monster.deadline-spider",
        status: "active",
        source: "normal",
        completedAt: new Date("2026-06-22T10:55:00.000Z"),
        updatedAt: new Date("2026-06-22T10:55:00.000Z")
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-legacy-life-mismatch",
        characterId: "character-legacy-life-mismatch",
        kind: "solo-combat",
        referenceId: "legacy-life-mismatch-session"
      }
    });
    await prisma.characterRemort.create({
      data: {
        id: "remort-legacy-life-mismatch",
        characterId: "character-legacy-life-mismatch",
        token: "token-legacy-life-mismatch",
        remortNumber: 1,
        previousLevel: 6,
        previousXp: 110,
        previousGold: 0,
        displayNameSnapshot: "Legacy",
        preservedPayloadJson: {},
        createdAt: new Date("2026-06-22T10:56:00.000Z")
      }
    });

    const adopted = await repository.adoptLegacySettlementById("legacy-life-mismatch-session", {
      expectedStatus: "active",
      expectedTurn: 1,
      expectedSettlementVersion: null,
      now: new Date("2026-06-22T10:57:00.000Z")
    });

    expect(adopted.outcome).toBe("life-mismatch");
    expect(adopted.session?.state?.settlement).toBeUndefined();
  });

  it("propagates duplicate session-id unique conflicts instead of treating them as lease races", async () => {
    await seedCharacter(prisma, {
      userId: "user-duplicate-session-id",
      characterId: "character-duplicate-session-id",
      telegramUserId: 4258n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "duplicate-session-id",
        characterId: "character-duplicate-session-id",
        monsterId: "monster.deadline-spider",
        status: "expired",
        source: "normal",
        completedAt: new Date("2026-06-22T10:20:00.000Z"),
        updatedAt: new Date("2026-06-22T10:20:00.000Z")
      })
    });

    await expect(repository.createForTelegramUser(
      4258n,
      makeCreateInput("duplicate-session-id", "monster.preapproval-dragonling")
    )).rejects.toMatchObject({
      code: "P2002"
    });
  });

  it("guards settlement completion and forfeit so a stale copy cannot overwrite the winner", async () => {
    await seedCharacter(prisma, {
      userId: "user-settlement-race",
      characterId: "character-settlement-race",
      telegramUserId: 4253n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "settlement-race-session",
        characterId: "character-settlement-race",
        monsterId: "monster.deadline-spider",
        status: "won",
        source: "normal",
        completedAt: new Date("2026-06-22T10:20:00.000Z"),
        updatedAt: new Date("2026-06-22T10:20:00.000Z"),
        settlementStatus: "pending"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-settlement-race",
        characterId: "character-settlement-race",
        kind: "solo-combat",
        referenceId: "settlement-race-session"
      }
    });

    const forfeited = await repository.forfeitSettlementById("settlement-race-session", {
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "won",
        life: {
          remortCount: 0
        }
      },
      settledAt: new Date("2026-06-22T10:21:00.000Z"),
      reason: "remort",
      releaseLease: true
    });
    const completed = await repository.completeSettlementById("settlement-race-session", {
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "won",
        life: {
          remortCount: 0
        }
      },
      settledAt: new Date("2026-06-22T10:22:00.000Z"),
      reward: {
        rewardXp: 23,
        rewardGold: 13,
        itemGrants: [],
        claimedAt: new Date("2026-06-22T10:22:00.000Z")
      },
      releaseLease: true
    });

    expect(forfeited.outcome).toBe("forfeited");
    expect(completed.outcome).toBe("already-forfeited");
    const stored = await prisma.soloCombatSession.findUniqueOrThrow({
      where: {
        id: "settlement-race-session"
      }
    });
    expect((stored.stateJson as { settlement?: { status?: string } }).settlement?.status).toBe("forfeited-by-remort");
    expect(stored.rewardXp).toBeNull();
    await expect(prisma.activeCombatLease.count({
      where: {
        characterId: "character-settlement-race"
      }
    })).resolves.toBe(0);
  });

  it("keeps remort-forfeited settlement authoritative over a stale resource substep", async () => {
    await seedCharacter(prisma, {
      userId: "user-resource-remort-wins",
      characterId: "character-resource-remort-wins",
      telegramUserId: 4261n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "resource-remort-wins-session",
        characterId: "character-resource-remort-wins",
        monsterId: "monster.deadline-spider",
        status: "lost",
        source: "normal",
        completedAt: new Date("2026-06-22T10:30:00.000Z"),
        updatedAt: new Date("2026-06-22T10:30:00.000Z"),
        settlementStatus: "pending"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-resource-remort-wins",
        characterId: "character-resource-remort-wins",
        kind: "solo-combat",
        referenceId: "resource-remort-wins-session"
      }
    });

    await repository.forfeitSettlementById("resource-remort-wins-session", {
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "lost",
        life: { remortCount: 0 }
      },
      settledAt: new Date("2026-06-22T10:30:13.000Z"),
      reason: "remort",
      releaseLease: true
    });
    await prisma.characterRemort.create({
      data: {
        id: "remort-resource-remort-wins",
        characterId: "character-resource-remort-wins",
        token: "token-resource-remort-wins",
        remortNumber: 1,
        previousLevel: 6,
        previousXp: 110,
        previousGold: 0,
        displayNameSnapshot: "Мандрівник",
        preservedPayloadJson: {},
        createdAt: new Date("2026-06-22T10:30:14.000Z")
      }
    });

    const stale = await repository.applyTerminalResourcesById("resource-remort-wins-session", {
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "lost",
        life: { remortCount: 0 }
      },
      appliedAt: new Date("2026-06-22T10:30:00.000Z"),
      resources: {
        hpCurrent: 0,
        manaCurrent: 3,
        hpRegenAt: new Date("2026-06-22T10:30:00.000Z"),
        manaRegenAt: new Date("2026-06-22T10:30:00.000Z")
      },
      expectedResources: {
        hpCurrent: 22,
        manaCurrent: 10,
        hpRegenAt: null,
        manaRegenAt: null
      }
    });

    expect(stale.outcome).toBe("already-forfeited");
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "character-resource-remort-wins" },
      select: { hpCurrent: true, manaCurrent: true }
    })).resolves.toEqual({ hpCurrent: 22, manaCurrent: 10 });
    const stored = await prisma.soloCombatSession.findUniqueOrThrow({
      where: { id: "resource-remort-wins-session" }
    });
    expect((stored.stateJson as { settlement?: { status?: string; resources?: unknown } }).settlement).toMatchObject({
      status: "forfeited-by-remort"
    });
    expect((stored.stateJson as { settlement?: { resources?: unknown } }).settlement?.resources).toBeUndefined();
  });

  it("applies terminal resources and marker in one guarded transition", async () => {
    await seedCharacter(prisma, {
      userId: "user-resource-first",
      characterId: "character-resource-first",
      telegramUserId: 4262n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "resource-first-session",
        characterId: "character-resource-first",
        monsterId: "monster.deadline-spider",
        status: "lost",
        source: "normal",
        completedAt: new Date("2026-06-22T10:31:00.000Z"),
        updatedAt: new Date("2026-06-22T10:31:00.000Z"),
        settlementStatus: "pending"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-resource-first",
        characterId: "character-resource-first",
        kind: "solo-combat",
        referenceId: "resource-first-session"
      }
    });

    const applied = await repository.applyTerminalResourcesById("resource-first-session", {
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "lost",
        life: { remortCount: 0 }
      },
      appliedAt: new Date("2026-06-22T10:31:00.000Z"),
      resources: {
        hpCurrent: 4,
        manaCurrent: 7,
        hpRegenAt: new Date("2026-06-22T10:31:00.000Z"),
        manaRegenAt: new Date("2026-06-22T10:31:00.000Z")
      },
      expectedResources: {
        hpCurrent: 22,
        manaCurrent: 10,
        hpRegenAt: null,
        manaRegenAt: null
      }
    });
    const replay = await repository.applyTerminalResourcesById("resource-first-session", {
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "lost",
        life: { remortCount: 0 }
      },
      appliedAt: new Date("2026-06-22T10:31:00.000Z"),
      resources: {
        hpCurrent: 1,
        manaCurrent: 1,
        hpRegenAt: new Date("2026-06-22T10:31:23.000Z"),
        manaRegenAt: new Date("2026-06-22T10:31:23.000Z")
      },
      expectedResources: {
        hpCurrent: 22,
        manaCurrent: 10,
        hpRegenAt: null,
        manaRegenAt: null
      }
    });

    expect(applied.outcome).toBe("applied");
    expect(replay.outcome).toBe("already-applied");
    await expect(prisma.character.findUniqueOrThrow({
      where: { id: "character-resource-first" },
      select: { hpCurrent: true, manaCurrent: true, hpRegenAt: true, manaRegenAt: true }
    })).resolves.toEqual({
      hpCurrent: 4,
      manaCurrent: 7,
      hpRegenAt: new Date("2026-06-22T10:31:00.000Z"),
      manaRegenAt: new Date("2026-06-22T10:31:00.000Z")
    });
    expect(applied.session?.state?.settlement?.resources).toMatchObject({
      status: "applied",
      hpCurrent: 4,
      manaCurrent: 7,
      hpRegenAt: "2026-06-22T10:31:00.000Z",
      manaRegenAt: "2026-06-22T10:31:00.000Z"
    });
    expect(applied.session?.state?.settlement?.version).toBe(2);
  });

  it("rejects direct settlement completion before durable resource substeps", async () => {
    await seedCharacter(prisma, {
      userId: "user-substeps-incomplete",
      characterId: "character-substeps-incomplete",
      telegramUserId: 4268n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "substeps-incomplete-session",
        characterId: "character-substeps-incomplete",
        monsterId: "monster.deadline-spider",
        status: "won",
        source: "normal",
        completedAt: new Date("2026-06-22T10:31:30.000Z"),
        updatedAt: new Date("2026-06-22T10:31:30.000Z"),
        settlementStatus: "pending"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-substeps-incomplete",
        characterId: "character-substeps-incomplete",
        kind: "solo-combat",
        referenceId: "substeps-incomplete-session"
      }
    });

    const completed = await repository.completeSettlementById("substeps-incomplete-session", {
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "won",
        life: { remortCount: 0 }
      },
      settledAt: new Date("2026-06-22T10:31:31.000Z"),
      reward: {
        rewardXp: 23,
        rewardGold: 13,
        itemGrants: [],
        claimedAt: new Date("2026-06-22T10:31:31.000Z")
      },
      releaseLease: true
    });

    expect(completed.outcome).toBe("substeps-incomplete");
    const stored = await prisma.soloCombatSession.findUniqueOrThrow({
      where: { id: "substeps-incomplete-session" }
    });
    expect((stored.stateJson as { settlement?: { status?: string; version?: number } }).settlement).toMatchObject({
      status: "pending",
      version: 1
    });
    expect(stored.rewardXp).toBeNull();
    await expect(prisma.activeCombatLease.count({
      where: {
        characterId: "character-substeps-incomplete"
      }
    })).resolves.toBe(1);
  });

  it("guards completion against the current remort count", async () => {
    await seedCharacter(prisma, {
      userId: "user-current-life-guard",
      characterId: "character-current-life-guard",
      telegramUserId: 4263n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "current-life-guard-session",
        characterId: "character-current-life-guard",
        monsterId: "monster.deadline-spider",
        status: "won",
        source: "normal",
        completedAt: new Date("2026-06-22T10:32:00.000Z"),
        updatedAt: new Date("2026-06-22T10:32:00.000Z"),
        settlementStatus: "pending"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-current-life-guard",
        characterId: "character-current-life-guard",
        kind: "solo-combat",
        referenceId: "current-life-guard-session"
      }
    });
    await prisma.characterRemort.create({
      data: {
        id: "remort-current-life-guard",
        characterId: "character-current-life-guard",
        token: "token-current-life-guard",
        remortNumber: 1,
        previousLevel: 6,
        previousXp: 110,
        previousGold: 0,
        displayNameSnapshot: "Мандрівник",
        preservedPayloadJson: {},
        createdAt: new Date("2026-06-22T10:32:10.000Z")
      }
    });

    const completed = await repository.completeSettlementById("current-life-guard-session", {
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "won",
        life: { remortCount: 0 }
      },
      settledAt: new Date("2026-06-22T10:32:11.000Z"),
      reward: {
        rewardXp: 23,
        rewardGold: 13,
        itemGrants: [],
        claimedAt: new Date("2026-06-22T10:32:11.000Z")
      },
      releaseLease: true
    });

    expect(completed.outcome).toBe("version-changed");
    const stored = await prisma.soloCombatSession.findUniqueOrThrow({
      where: { id: "current-life-guard-session" }
    });
    expect((stored.stateJson as { settlement?: { status?: string } }).settlement?.status).toBe("pending");
    expect(stored.rewardXp).toBeNull();
  });

  it("allows life-mismatch forfeiture when the current remort count changed", async () => {
    await seedCharacter(prisma, {
      userId: "user-life-mismatch-forfeit",
      characterId: "character-life-mismatch-forfeit",
      telegramUserId: 4269n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "life-mismatch-forfeit-session",
        characterId: "character-life-mismatch-forfeit",
        monsterId: "monster.deadline-spider",
        status: "won",
        source: "normal",
        completedAt: new Date("2026-06-22T10:32:30.000Z"),
        updatedAt: new Date("2026-06-22T10:32:30.000Z"),
        settlementStatus: "pending"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-life-mismatch-forfeit",
        characterId: "character-life-mismatch-forfeit",
        kind: "solo-combat",
        referenceId: "life-mismatch-forfeit-session"
      }
    });
    await prisma.characterRemort.create({
      data: {
        id: "remort-life-mismatch-forfeit",
        characterId: "character-life-mismatch-forfeit",
        token: "token-life-mismatch-forfeit",
        remortNumber: 1,
        previousLevel: 6,
        previousXp: 110,
        previousGold: 0,
        displayNameSnapshot: "РњР°РЅРґСЂС–РІРЅРёРє",
        preservedPayloadJson: {},
        createdAt: new Date("2026-06-22T10:32:31.000Z")
      }
    });

    const forfeited = await repository.forfeitSettlementById("life-mismatch-forfeit-session", {
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "won",
        life: { remortCount: 0 }
      },
      settledAt: new Date("2026-06-22T10:32:32.000Z"),
      reason: "life-mismatch",
      releaseLease: true
    });

    expect(forfeited.outcome).toBe("forfeited");
    expect(forfeited.session?.state?.settlement?.status).toBe("forfeited-by-remort");
    await expect(prisma.activeCombatLease.count({
      where: {
        characterId: "character-life-mismatch-forfeit"
      }
    })).resolves.toBe(0);
    const stored = await prisma.soloCombatSession.findUniqueOrThrow({
      where: { id: "life-mismatch-forfeit-session" }
    });
    expect((stored.stateJson as { settlement?: { reason?: string } }).settlement?.reason).toBe("life-mismatch");
    expect(stored.rewardXp).toBeNull();
  });

  it("claims training cooldown and marker once without extending duplicate recovery", async () => {
    await seedCharacter(prisma, {
      userId: "user-training-cooldown-once",
      characterId: "character-training-cooldown-once",
      telegramUserId: 4264n
    });
    await prisma.soloCombatSession.create({
      data: makeSoloSessionData({
        id: "training-cooldown-once-session",
        characterId: "character-training-cooldown-once",
        monsterId: "monster.training-doppelganger",
        status: "lost",
        source: "training",
        completedAt: new Date("2026-06-22T10:33:00.000Z"),
        updatedAt: new Date("2026-06-22T10:40:00.000Z"),
        settlementStatus: "pending"
      })
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-training-cooldown-once",
        characterId: "character-training-cooldown-once",
        kind: "solo-combat",
        referenceId: "training-cooldown-once-session"
      }
    });

    const availableAt = new Date("2026-06-22T11:33:00.000Z");
    const applied = await repository.applyTrainingCooldownById("training-cooldown-once-session", {
      telegramUserId: 4264n,
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "lost",
        life: { remortCount: 0 }
      },
      now: new Date("2026-06-22T10:34:00.000Z"),
      availableAt,
      cooldownKey: "training.doppelganger.spar"
    });
    const duplicate = await repository.applyTrainingCooldownById("training-cooldown-once-session", {
      telegramUserId: 4264n,
      expected: {
        settlementStatus: "pending",
        settlementVersion: 1,
        combatStatus: "lost",
        life: { remortCount: 0 }
      },
      now: new Date("2026-06-22T10:35:00.000Z"),
      availableAt: new Date("2026-06-22T12:33:00.000Z"),
      cooldownKey: "training.doppelganger.spar"
    });

    expect(applied.outcome).toBe("applied");
    expect(duplicate.outcome).toBe("already-applied");
    expect(duplicate.availableAt?.toISOString()).toBe("2026-06-22T11:33:00.000Z");
    const cooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: {
        characterId_key: {
          characterId: "character-training-cooldown-once",
          key: "training.doppelganger.spar"
        }
      }
    });
    expect(cooldown.availableAt.toISOString()).toBe("2026-06-22T11:33:00.000Z");
    expect(cooldown.resultJson).toMatchObject({
      trainingSettlement: {
        sessionId: "training-cooldown-once-session",
        remortCount: 0,
        availableAt: "2026-06-22T11:33:00.000Z"
      }
    });
  });

  it("excludes pending and forfeited wins from victory progress while counting completed and legacy wins", async () => {
    await seedCharacter(prisma, {
      userId: "user-progress-settlement",
      characterId: "character-progress-settlement",
      telegramUserId: 4254n
    });
    const base = new Date("2026-06-22T11:00:00.000Z").getTime();
    await prisma.soloCombatSession.createMany({
      data: [
        makeSoloSessionData({
          id: "progress-completed",
          characterId: "character-progress-settlement",
          monsterId: "monster.deadline-spider",
          status: "won",
          source: "normal",
          completedAt: new Date(base),
          updatedAt: new Date(base),
          settlementStatus: "completed"
        }),
        makeSoloSessionData({
          id: "progress-legacy",
          characterId: "character-progress-settlement",
          monsterId: "monster.preapproval-dragonling",
          status: "won",
          source: "normal",
          completedAt: new Date(base + 60_000),
          updatedAt: new Date(base + 60_000)
        }),
        makeSoloSessionData({
          id: "progress-pending",
          characterId: "character-progress-settlement",
          monsterId: "monster.paper-golem",
          status: "won",
          source: "normal",
          completedAt: new Date(base + 120_000),
          updatedAt: new Date(base + 120_000),
          settlementStatus: "pending"
        }),
        makeSoloSessionData({
          id: "progress-forfeited",
          characterId: "character-progress-settlement",
          monsterId: "monster.unquiet-potato",
          status: "won",
          source: "yeger",
          completedAt: new Date(base + 180_000),
          updatedAt: new Date(base + 180_000),
          settlementStatus: "forfeited-by-remort"
        }),
        makeSoloSessionData({
          id: "progress-loss",
          characterId: "character-progress-settlement",
          monsterId: "monster.loss",
          status: "lost",
          source: "normal",
          completedAt: new Date(base + 240_000),
          updatedAt: new Date(base + 240_000),
          settlementStatus: "forfeited-by-remort"
        })
      ]
    });

    await expect(repository.countWonByTelegramUserId(4254n)).resolves.toBe(2);
    await expect(repository.listCompletedByTelegramUserIdSince(4254n, new Date(base - 1))).resolves.toMatchObject([
      { monsterId: "monster.deadline-spider", status: "won" },
      { monsterId: "monster.preapproval-dragonling", status: "won" },
      { monsterId: "monster.loss", status: "lost" }
    ]);
  });

  it("counts only bounded eligible Yeger wins after the stage boundary for the requested life", async () => {
    await seedCharacter(prisma, {
      userId: "user-yeger-bounded-progress",
      characterId: "character-yeger-bounded-progress",
      telegramUserId: 4257n
    });
    const stageStartedAt = new Date("2026-06-22T12:01:00.000Z");
    const atMinute = (minute: number) => new Date(`2026-06-22T12:${String(minute).padStart(2, "0")}:00.000Z`);
    const eligible = Array.from({ length: 6 }, (_, index) => makeSoloSessionData({
      id: `yeger-eligible-${index + 1}`,
      characterId: "character-yeger-bounded-progress",
      monsterId: index % 2 === 0
        ? "monster.stamp-doorkeeper-skeleton"
        : "monster.unread-rules-ghost",
      status: "won",
      source: "normal",
      completedAt: atMinute(index + 1),
      updatedAt: atMinute(index + 1),
      settlementStatus: "completed"
    }));
    await prisma.soloCombatSession.createMany({
      data: [
        ...eligible,
        makeLegacySoloSessionData({
          id: "yeger-eligible-legacy",
          characterId: "character-yeger-bounded-progress",
          monsterId: "monster.stamp-doorkeeper-skeleton",
          status: "won",
          source: "normal",
          completedAt: atMinute(7),
          updatedAt: atMinute(7)
        }),
        makeSoloSessionData({
          id: "yeger-old-completion-updated-late",
          characterId: "character-yeger-bounded-progress",
          monsterId: "monster.stamp-doorkeeper-skeleton",
          status: "won",
          source: "normal",
          completedAt: atMinute(0),
          updatedAt: atMinute(10),
          settlementStatus: "completed"
        }),
        makeSoloSessionData({
          id: "yeger-pending",
          characterId: "character-yeger-bounded-progress",
          monsterId: "monster.unread-rules-ghost",
          status: "won",
          source: "normal",
          completedAt: atMinute(8),
          updatedAt: atMinute(8),
          settlementStatus: "pending"
        }),
        makeSoloSessionData({
          id: "yeger-forfeited",
          characterId: "character-yeger-bounded-progress",
          monsterId: "monster.unread-rules-ghost",
          status: "won",
          source: "normal",
          completedAt: atMinute(9),
          updatedAt: atMinute(9),
          settlementStatus: "forfeited-by-remort"
        }),
        makeSoloSessionData({
          id: "yeger-unrelated-monster",
          characterId: "character-yeger-bounded-progress",
          monsterId: "monster.deadline-spider",
          status: "won",
          source: "normal",
          completedAt: atMinute(8),
          updatedAt: atMinute(8),
          settlementStatus: "completed"
        }),
        makeSoloSessionData({
          id: "yeger-next-life",
          characterId: "character-yeger-bounded-progress",
          monsterId: "monster.stamp-doorkeeper-skeleton",
          status: "won",
          source: "normal",
          completedAt: atMinute(8),
          updatedAt: atMinute(8),
          settlementStatus: "completed",
          remortCount: 1
        })
      ]
    });

    const options = {
      monsterIds: ["monster.stamp-doorkeeper-skeleton", "monster.unread-rules-ghost"],
      completedSince: stageStartedAt,
      life: { remortCount: 0 },
      limit: 93
    };
    await expect(
      repository.countProgressEligibleWinsByTelegramUserId(4257n, options)
    ).resolves.toBe(7);
    await expect(
      repository.countProgressEligibleWinsByTelegramUserId(4257n, { ...options, limit: 6 })
    ).resolves.toBe(6);
    await expect(
      repository.countProgressEligibleWinsByTelegramUserId(4257n, {
        ...options,
        life: { remortCount: 1 }
      })
    ).resolves.toBe(1);
  });

  it("clears monster rest cooldown by aging recent ordinary completion times", async () => {
    await seedCharacter(prisma, {
      userId: "user-monster-rest-clear",
      characterId: "character-monster-rest-clear",
      telegramUserId: 4255n
    });
    await seedCharacter(prisma, {
      userId: "user-monster-rest-other",
      characterId: "character-monster-rest-other",
      telegramUserId: 4256n
    });
    const since = new Date("2026-06-22T11:00:00.000Z");
    const agedCompletedAt = new Date("2026-06-22T10:59:59.999Z");
    await prisma.soloCombatSession.createMany({
      data: [
        makeSoloSessionData({
          id: "monster-rest-clear-normal-a",
          characterId: "character-monster-rest-clear",
          monsterId: "monster.deadline-spider",
          status: "won",
          source: "normal",
          completedAt: new Date("2026-06-22T11:01:00.000Z"),
          updatedAt: new Date("2026-06-22T11:01:00.000Z")
        }),
        makeSoloSessionData({
          id: "monster-rest-clear-normal-b",
          characterId: "character-monster-rest-clear",
          monsterId: "monster.preapproval-dragonling",
          status: "lost",
          source: "normal",
          completedAt: new Date("2026-06-22T11:02:00.000Z"),
          updatedAt: new Date("2026-06-22T11:02:00.000Z")
        }),
        makeSoloSessionData({
          id: "monster-rest-clear-adventure",
          characterId: "character-monster-rest-clear",
          monsterId: "monster.paper-golem",
          status: "won",
          source: "adventure",
          completedAt: new Date("2026-06-22T11:03:00.000Z"),
          updatedAt: new Date("2026-06-22T11:03:00.000Z")
        }),
        makeSoloSessionData({
          id: "monster-rest-clear-other-user",
          characterId: "character-monster-rest-other",
          monsterId: "monster.deadline-spider",
          status: "won",
          source: "normal",
          completedAt: new Date("2026-06-22T11:04:00.000Z"),
          updatedAt: new Date("2026-06-22T11:04:00.000Z")
        })
      ]
    });

    await expect(repository.clearMonsterRestCooldownForTelegramUser(4255n, {
      since,
      completedAt: agedCompletedAt
    })).resolves.toBe(2);
    await expect(repository.listCompletedByTelegramUserIdSince(4255n, since)).resolves.toMatchObject([
      { monsterId: "monster.paper-golem", status: "won" }
    ]);
    await expect(repository.listCompletedByTelegramUserIdSince(4256n, since)).resolves.toMatchObject([
      { monsterId: "monster.deadline-spider", status: "won" }
    ]);
  });

  it("orders recent completed candidates by canonical completedAt instead of later updatedAt touches", async () => {
    await seedCharacter(prisma, {
      userId: "user-recent-order",
      characterId: "character-recent-order",
      telegramUserId: 9301n
    });

    await prisma.soloCombatSession.createMany({
      data: [
        makeSoloSessionData({
          id: "recent-order-older-touched",
          characterId: "character-recent-order",
          monsterId: "monster.deadline-spider",
          status: "won",
          source: "normal",
          completedAt: new Date("2026-06-24T10:00:00.000Z"),
          updatedAt: new Date("2026-06-24T11:00:00.000Z")
        }),
        makeSoloSessionData({
          id: "recent-order-newer-completed",
          characterId: "character-recent-order",
          monsterId: "monster.preapproval-dragonling",
          status: "won",
          source: "normal",
          completedAt: new Date("2026-06-24T10:05:00.000Z"),
          updatedAt: new Date("2026-06-24T10:05:00.000Z")
        })
      ]
    });

    const recent = await repository.listRecentCompletedByTelegramUserId(9301n, 2);

    expect(recent.map((session) => session.monsterId)).toEqual([
      "monster.preapproval-dragonling",
      "monster.deadline-spider"
    ]);
  });

  it("paginates the bounded recent completion scan before sorting and slicing", async () => {
    await seedCharacter(prisma, {
      userId: "user-recent-page",
      characterId: "character-recent-page",
      telegramUserId: 9302n
    });

    const base = new Date("2026-06-24T12:00:00.000Z").getTime();
    const sessions = [];
    for (let index = 0; index < 60; index += 1) {
      sessions.push(makeSoloSessionData({
        id: `recent-page-${String(index).padStart(2, "0")}`,
        characterId: "character-recent-page",
        monsterId: `monster.page-${String(index).padStart(2, "0")}`,
        status: "won",
        source: "normal",
        completedAt: new Date(base + index * 60_000),
        updatedAt: new Date(base + index * 60_000)
      }));
    }
    await prisma.soloCombatSession.createMany({ data: sessions });

    const recent = await repository.listRecentCompletedByTelegramUserId(9302n, 55);

    expect(recent).toHaveLength(55);
    expect(recent[0]?.monsterId).toBe("monster.page-59");
    expect(recent.at(-1)?.monsterId).toBe("monster.page-05");
  });

  it("returns excluded rows inside the scan so threat policy can skip them without losing older ordinary wins", async () => {
    await seedCharacter(prisma, {
      userId: "user-recent-excluded",
      characterId: "character-recent-excluded",
      telegramUserId: 9303n
    });

    const base = new Date("2026-06-24T13:00:00.000Z").getTime();
    const sessions = [];
    for (let index = 0; index < 3; index += 1) {
      sessions.push(makeSoloSessionData({
        id: `recent-excluded-normal-${index}`,
        characterId: "character-recent-excluded",
        monsterId: `monster.normal-${index}`,
        status: "won",
        source: "normal",
        completedAt: new Date(base + index * 60_000),
        updatedAt: new Date(base + index * 60_000)
      }));
    }
    for (let index = 0; index < 30; index += 1) {
      sessions.push(makeSoloSessionData({
        id: `recent-excluded-yeger-${String(index).padStart(2, "0")}`,
        characterId: "character-recent-excluded",
        monsterId: `monster.yeger-${index}`,
        status: "won",
        source: "yeger",
        completedAt: new Date(base + (index + 10) * 60_000),
        updatedAt: new Date(base + (index + 10) * 60_000)
      }));
    }
    await prisma.soloCombatSession.createMany({ data: sessions });

    const recent = await repository.listRecentCompletedByTelegramUserId(9303n, 200);

    expect(recent).toHaveLength(33);
    expect(recent.slice(-3).map((session) => session.monsterId)).toEqual([
      "monster.normal-2",
      "monster.normal-1",
      "monster.normal-0"
    ]);
  });

  it("uses createdAt as the legacy canonical completion time fallback", async () => {
    await seedCharacter(prisma, {
      userId: "user-recent-legacy-fallback",
      characterId: "character-recent-legacy-fallback",
      telegramUserId: 9304n
    });

    const state = {
      ...makeCombatState("recent-legacy-fallback", "monster.deadline-spider"),
      status: "won",
      source: "normal"
    };
    await prisma.soloCombatSession.create({
      data: {
        id: "recent-legacy-fallback",
        characterId: "character-recent-legacy-fallback",
        monsterId: "monster.deadline-spider",
        stateJson: state,
        status: "won",
        turn: 1,
        expiresAt: new Date("2026-06-24T14:30:00.000Z"),
        createdAt: new Date("2026-06-24T14:00:00.000Z"),
        updatedAt: new Date("2026-06-24T14:23:00.000Z")
      }
    });

    const recent = await repository.listRecentCompletedByTelegramUserId(9304n, 1);

    expect(recent[0]?.completedAt.toISOString()).toBe("2026-06-24T14:00:00.000Z");
  });

  it("keeps long-running fights completed recently inside the bounded recent scan", async () => {
    await seedCharacter(prisma, {
      userId: "user-recent-long-running",
      characterId: "character-recent-long-running",
      telegramUserId: 9307n
    });

    const noisyBase = new Date("2026-06-24T15:00:00.000Z").getTime();
    const sessions = [];
    for (let index = 0; index < 205; index += 1) {
      sessions.push(makeSoloSessionData({
        id: `recent-long-noise-${String(index).padStart(3, "0")}`,
        characterId: "character-recent-long-running",
        monsterId: `monster.noise-${String(index).padStart(3, "0")}`,
        status: "won",
        source: "normal",
        completedAt: new Date(noisyBase - index * 60_000),
        updatedAt: new Date(noisyBase - index * 60_000)
      }));
    }
    sessions.push(makeSoloSessionData({
      id: "recent-long-running-winner",
      characterId: "character-recent-long-running",
      monsterId: "monster.long-running",
      status: "won",
      source: "normal",
      completedAt: new Date("2026-06-24T16:00:00.000Z"),
      updatedAt: new Date("2026-06-24T16:00:00.000Z"),
      createdAt: new Date("2026-06-20T09:00:00.000Z")
    }));
    await prisma.soloCombatSession.createMany({ data: sessions });

    const recent = await repository.listRecentCompletedByTelegramUserId(9307n, 1);

    expect(recent[0]?.monsterId).toBe("monster.long-running");
    expect(recent[0]?.completedAt.toISOString()).toBe("2026-06-24T16:00:00.000Z");
  });

  it("isolates recent completion history by Telegram user", async () => {
    await seedCharacter(prisma, {
      userId: "user-recent-target",
      characterId: "character-recent-target",
      telegramUserId: 9305n
    });
    await seedCharacter(prisma, {
      userId: "user-recent-other",
      characterId: "character-recent-other",
      telegramUserId: 9306n
    });

    await prisma.soloCombatSession.createMany({
      data: [
        makeSoloSessionData({
          id: "recent-target-session",
          characterId: "character-recent-target",
          monsterId: "monster.deadline-spider",
          status: "won",
          source: "normal",
          completedAt: new Date("2026-06-24T15:00:00.000Z"),
          updatedAt: new Date("2026-06-24T15:00:00.000Z")
        }),
        makeSoloSessionData({
          id: "recent-other-session",
          characterId: "character-recent-other",
          monsterId: "monster.preapproval-dragonling",
          status: "won",
          source: "normal",
          completedAt: new Date("2026-06-24T15:01:00.000Z"),
          updatedAt: new Date("2026-06-24T15:01:00.000Z")
        })
      ]
    });

    const recent = await repository.listRecentCompletedByTelegramUserId(9305n, 5);

    expect(recent.map((session) => session.monsterId)).toEqual(["monster.deadline-spider"]);
  });

  it("does not consume a combat item when the active solo lease is missing", async () => {
    await seedCharacter(prisma, {
      userId: "user-combat-item-missing-lease",
      characterId: "character-combat-item-missing-lease",
      telegramUserId: 9401n
    });
    const state = makeCombatState("combat-item-missing-lease", "monster.deadline-spider");
    state.hero.hp = 10;
    await prisma.soloCombatSession.create({
      data: {
        id: "combat-item-missing-lease",
        characterId: "character-combat-item-missing-lease",
        monsterId: "monster.deadline-spider",
        stateJson: state,
        status: "active",
        turn: 1,
        expiresAt: new Date("2026-06-24T14:30:00.000Z")
      }
    });
    await expect(repository.applyCombatItemTurnById("combat-item-missing-lease", 1, {
      telegramUserId: 9401n,
      characterId: "character-combat-item-missing-lease",
      itemId: "item.responsible-panic-bandage",
      now: new Date("2026-06-24T14:00:00.000Z"),
      state: {
        ...state,
        turn: 2,
        hero: {
          ...state.hero,
          hp: 17
        }
      },
      status: "active",
      expiresAt: new Date("2026-06-24T14:23:00.000Z")
    })).resolves.toMatchObject({
      outcome: "stale-turn",
      session: null
    });

    await expect(prisma.soloCombatSession.findUnique({
      where: { id: "combat-item-missing-lease" }
    })).resolves.toMatchObject({ turn: 1, status: "active" });
  });

  it("applies and consumes a combat item through the active solo lease in a multi-enemy fight", async () => {
    await seedCharacter(prisma, {
      userId: "user-combat-item-lease",
      characterId: "character-combat-item-lease",
      telegramUserId: 9402n
    });
    const state = makeCombatState("combat-item-lease", "monster.deadline-spider");
    state.hero.hp = 10;
    state.enemies = [
      {
        enemyId: "enemy:1",
        id: "monster.deadline-spider",
        hp: 18,
        hpMax: 18
      },
      {
        enemyId: "enemy:2",
        id: "monster.preapproval-dragonling",
        hp: 20,
        hpMax: 20
      }
    ];
    await prisma.soloCombatSession.create({
      data: {
        id: "combat-item-lease",
        characterId: "character-combat-item-lease",
        monsterId: "monster.deadline-spider",
        stateJson: state,
        status: "active",
        turn: 1,
        expiresAt: new Date("2026-06-24T14:30:00.000Z")
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-combat-item-lease",
        characterId: "character-combat-item-lease",
        kind: "solo-combat",
        referenceId: "combat-item-lease"
      }
    });
    await prisma.characterItem.create({
      data: {
        id: "stack-combat-item-lease",
        characterId: "character-combat-item-lease",
        itemId: "item.responsible-panic-bandage",
        quantity: 2
      }
    });

    await expect(repository.applyCombatItemTurnById("combat-item-lease", 1, {
      telegramUserId: 9402n,
      characterId: "character-combat-item-lease",
      itemId: "item.responsible-panic-bandage",
      now: new Date("2026-06-24T14:00:00.000Z"),
      state: {
        ...state,
        turn: 2,
        hero: {
          ...state.hero,
          hp: 17
        }
      },
      status: "active",
      expiresAt: new Date("2026-06-24T14:23:00.000Z")
    })).resolves.toMatchObject({
      outcome: "updated",
      session: {
        id: "combat-item-lease",
        turn: 2,
        status: "active"
      }
    });

    await expect(prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: "character-combat-item-lease",
          itemId: "item.responsible-panic-bandage"
        }
      }
    })).resolves.toMatchObject({ quantity: 1 });
  });

  it("lets combat item use replace the player's own active item-use preview", async () => {
    await seedCharacter(prisma, {
      userId: "user-combat-item-own-use-preview",
      characterId: "character-combat-item-own-use-preview",
      telegramUserId: 9403n
    });
    const state = makeCombatState("combat-item-own-use-preview", "monster.deadline-spider");
    state.hero.hp = 10;
    await prisma.soloCombatSession.create({
      data: {
        id: "combat-item-own-use-preview",
        characterId: "character-combat-item-own-use-preview",
        monsterId: "monster.deadline-spider",
        stateJson: state,
        status: "active",
        turn: 1,
        expiresAt: new Date("2026-06-24T14:30:00.000Z")
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        id: "lease-combat-item-own-use-preview",
        characterId: "character-combat-item-own-use-preview",
        kind: "solo-combat",
        referenceId: "combat-item-own-use-preview"
      }
    });
    await prisma.characterItem.create({
      data: {
        id: "stack-combat-item-own-use-preview",
        characterId: "character-combat-item-own-use-preview",
        itemId: "item.responsible-panic-bandage",
        quantity: 1
      }
    });
    await prisma.itemUseOrder.create({
      data: {
        id: "item-use-combat-old-replaced",
        token: "combatoldreplaced",
        characterId: "character-combat-item-own-use-preview",
        telegramUserId: 9403n,
        itemId: "item.responsible-panic-bandage",
        itemName: "Бинт відповідальної паніки",
        itemFingerprint: "test-fingerprint",
        quantity: 1,
        effectKind: "heal-hp",
        status: "pending",
        reservationKey: null,
        previewJson: {
          mode: "single",
          rulesVersion: "item-use-v1",
          healAmount: 7,
          hpBefore: 10,
          hpAfter: 17
        },
        expiresAt: new Date("2026-06-24T14:10:00.000Z"),
        createdAt: new Date("2026-06-24T13:58:00.000Z"),
        updatedAt: new Date("2026-06-24T13:58:00.000Z")
      }
    });
    await prisma.itemUseOrder.create({
      data: {
        id: "item-use-combat-replaced",
        token: "combatreplaced",
        characterId: "character-combat-item-own-use-preview",
        telegramUserId: 9403n,
        itemId: "item.responsible-panic-bandage",
        itemName: "Бинт відповідальної паніки",
        itemFingerprint: "test-fingerprint",
        quantity: 1,
        effectKind: "heal-hp",
        status: "pending",
        reservationKey: "use:character-combat-item-own-use-preview:item.responsible-panic-bandage",
        previewJson: {
          mode: "single",
          rulesVersion: "item-use-v1",
          healAmount: 7,
          hpBefore: 10,
          hpAfter: 17
        },
        expiresAt: new Date("2026-06-24T14:10:00.000Z"),
        createdAt: new Date("2026-06-24T13:59:00.000Z"),
        updatedAt: new Date("2026-06-24T14:00:00.000Z")
      }
    });
    await prisma.itemUseOrder.create({
      data: {
        id: "item-use-combat-processing-replaced",
        token: "combatprocessingreplaced",
        characterId: "character-combat-item-own-use-preview",
        telegramUserId: 9403n,
        itemId: "item.responsible-panic-bandage",
        itemName: "Бинт відповідальної паніки",
        itemFingerprint: "test-fingerprint",
        quantity: 1,
        effectKind: "heal-hp",
        status: "processing",
        reservationKey: "use:character-combat-item-own-use-preview:item.responsible-panic-bandage:processing",
        previewJson: {
          mode: "single",
          rulesVersion: "item-use-v1",
          healAmount: 7,
          hpBefore: 10,
          hpAfter: 17
        },
        expiresAt: new Date("2026-06-24T14:10:00.000Z"),
        createdAt: new Date("2026-06-24T13:59:30.000Z"),
        updatedAt: new Date("2026-06-24T14:00:00.000Z")
      }
    });

    await expect(repository.applyCombatItemTurnById("combat-item-own-use-preview", 1, {
      telegramUserId: 9403n,
      characterId: "character-combat-item-own-use-preview",
      itemId: "item.responsible-panic-bandage",
      now: new Date("2026-06-24T14:00:00.000Z"),
      state: {
        ...state,
        turn: 2,
        hero: {
          ...state.hero,
          hp: 17
        }
      },
      status: "active",
      expiresAt: new Date("2026-06-24T14:23:00.000Z")
    })).resolves.toMatchObject({
      outcome: "updated",
      session: {
        id: "combat-item-own-use-preview",
        turn: 2,
        status: "active"
      }
    });

    await expect(prisma.characterItem.findUnique({
      where: {
        characterId_itemId: {
          characterId: "character-combat-item-own-use-preview",
          itemId: "item.responsible-panic-bandage"
        }
      }
    })).resolves.toBeNull();
    await expect(prisma.itemUseOrder.findUnique({
      where: { id: "item-use-combat-replaced" }
    })).resolves.toMatchObject({
      status: "cancelled",
      reservationKey: null,
      cancelledAt: new Date("2026-06-24T14:00:00.000Z")
    });
    await expect(prisma.itemUseOrder.findUnique({
      where: { id: "item-use-combat-old-replaced" }
    })).resolves.toMatchObject({
      status: "cancelled",
      reservationKey: null,
      cancelledAt: new Date("2026-06-24T14:00:00.000Z")
    });
    await expect(prisma.itemUseOrder.findUnique({
      where: { id: "item-use-combat-processing-replaced" }
    })).resolves.toMatchObject({
      status: "cancelled",
      reservationKey: null,
      cancelledAt: new Date("2026-06-24T14:00:00.000Z")
    });
  });

  it("scans past newer active and non-ordinary sessions for recent ordinary monsters", async () => {
    await seedCharacter(prisma, {
      userId: "user-history",
      characterId: "character-history",
      telegramUserId: 4243n
    });

    const base = new Date("2026-06-22T10:00:00.000Z").getTime();
    const sessions = [];
    for (let index = 0; index < 55; index += 1) {
      const source = index % 2 === 0 ? "yeger" : "adventure";
      sessions.push(makeSoloSessionData({
        id: `noise-${String(index).padStart(2, "0")}`,
        characterId: "character-history",
        monsterId: `monster.noise-${index}`,
        status: index % 5 === 0 ? "active" : "won",
        source,
        completedAt: new Date(base + (90 + index) * 60_000),
        updatedAt: new Date(base + (90 + index) * 60_000)
      }));
    }

    sessions.push(makeSoloSessionData({
      id: "ordinary-old-duplicate",
      characterId: "character-history",
      monsterId: "monster.normal-a",
      status: "won",
      source: "normal",
      completedAt: new Date(base + 10 * 60_000),
      updatedAt: new Date(base + 10 * 60_000)
    }));
    sessions.push(makeSoloSessionData({
      id: "ordinary-c",
      characterId: "character-history",
      monsterId: "monster.normal-c",
      status: "lost",
      source: "normal",
      completedAt: new Date(base + 20 * 60_000),
      updatedAt: new Date(base + 20 * 60_000)
    }));
    sessions.push(makeSoloSessionData({
      id: "ordinary-b",
      characterId: "character-history",
      monsterId: "monster.normal-b",
      status: "won",
      source: "normal",
      completedAt: new Date(base + 30 * 60_000),
      updatedAt: new Date(base + 30 * 60_000)
    }));
    sessions.push(makeSoloSessionData({
      id: "ordinary-a",
      characterId: "character-history",
      monsterId: "monster.normal-a",
      status: "won",
      source: "normal",
      completedAt: new Date(base + 40 * 60_000),
      updatedAt: new Date(base + 40 * 60_000)
    }));
    await prisma.soloCombatSession.createMany({ data: sessions });

    await expect(repository.listRecentOrdinaryMonsterIdsByTelegramUserId(4243n, 3)).resolves.toEqual([
      "monster.normal-a",
      "monster.normal-b",
      "monster.normal-c"
    ]);
  });
});

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
    `CREATE TABLE solo_combat_sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      state_json JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      reward_xp INTEGER,
      reward_gold INTEGER,
      reward_items_json JSONB,
      reward_claimed_at DATETIME,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, slot)
    )`,
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, item_id)
    )`,
    `CREATE TABLE mantok_chest_runs (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
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
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, token)
    )`,
    `CREATE TABLE korchma_mantok_sales (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      selection_json JSONB NOT NULL,
      selection_fingerprint TEXT NOT NULL DEFAULT '',
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
      token TEXT NOT NULL UNIQUE,
      transfer_kind TEXT NOT NULL DEFAULT 'gift',
      sender_character_id TEXT NOT NULL,
      receiver_character_id TEXT NOT NULL,
      sender_telegram_user_id BIGINT NOT NULL,
      receiver_telegram_user_id BIGINT NOT NULL,
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
      reservation_key TEXT UNIQUE,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      responded_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE item_use_orders (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      character_id TEXT NOT NULL,
      telegram_user_id BIGINT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_fingerprint TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      effect_kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reservation_key TEXT UNIQUE,
      preview_json JSONB NOT NULL,
      result_json JSONB,
      expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      cancelled_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_drink_states (
      id TEXT PRIMARY KEY,
      activation_id TEXT NOT NULL UNIQUE,
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
    `CREATE TABLE shynok_drink_activation_audits (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      activation_id TEXT NOT NULL UNIQUE,
      drink_key TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      outcome TEXT NOT NULL,
      combat_session_id TEXT,
      occurred_at DATETIME NOT NULL,
      metadata_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, key)
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function seedCharacter(
  prisma: PrismaClient,
  input: { userId: string; characterId: string; telegramUserId: bigint }
): Promise<void> {
  await prisma.user.create({
    data: {
      id: input.userId,
      telegramUserId: input.telegramUserId
    }
  });
  await prisma.character.create({
    data: {
      id: input.characterId,
      userId: input.userId,
      name: "Мандрівник",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 6,
      xp: 110,
      gold: 0,
      hpCurrent: 22,
      hpMax: 22,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: {
        strength: 8,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    }
  });
}

function makeCreateInput(id: string, monsterId: string): CreateSoloCombatSessionInput {
  return {
    id,
    monsterId,
    state: makeCombatState(id, monsterId),
    expiresAt: new Date("2026-06-12T11:00:00.000Z")
  };
}

function makeCombatState(id: string, monsterId: string): CombatState {
  return {
    id,
    source: "normal",
    turn: 1,
    status: "active",
    hero: {
      hp: 22,
      hpMax: 22,
      mana: 10,
      manaMax: 10
    },
    monster: {
      id: monsterId,
      hp: 18,
      hpMax: 18
    }
  };
}

function makeSoloSatedPayload(
  characterId: string,
  activationId: string,
  startedAt: Date,
  telegramUserId: bigint
): VarenykSatedPayloadV1 {
  return {
    kind: "varenyk-sated-support-v1",
    version: 1,
    activationId,
    actorCharacterId: characterId,
    actorRemortCount: 0,
    recipientCharacterId: characterId,
    recipientRemortCount: 0,
    rank: 1,
    manaCost: 8,
    effectiveStats: { intelligence: 8, charisma: 8, level: 3, equipmentItemIds: [] },
    startedAt: startedAt.toISOString(),
    expiresAt: new Date(startedAt.getTime() + 13 * 60_000).toISOString(),
    availableAt: new Date(startedAt.getTime() + 93 * 60_000).toISOString(),
    cursorAt: startedAt.toISOString(),
    receipt: {
      version: 1,
      previewToken: `${activationId}-preview`,
      actorTelegramUserId: telegramUserId.toString(),
      targetTelegramUserId: telegramUserId.toString(),
      actorName: "Пан Вареник",
      targetName: "Пан Вареник",
      immediateHpRestored: 0,
      immediateManaRestored: 0,
      actorManaAfter: 1,
      targetHpAfter: 1,
      targetManaAfter: 1
    }
  };
}

function makeSoloSessionData(input: {
  id: string;
  characterId: string;
  monsterId: string;
  status: "active" | "won" | "lost" | "fled" | "expired";
  source: NonNullable<CombatState["source"]>;
  completedAt: Date;
  updatedAt: Date;
  createdAt?: Date;
  settlementStatus?: "pending" | "completed" | "forfeited-by-remort";
  remortCount?: number;
}) {
  const state = {
    ...makeCombatState(input.id, input.monsterId),
    status: input.status,
    source: input.source,
    life: {
      characterId: input.characterId,
      remortCount: input.remortCount ?? 0,
      startedAt: input.completedAt.toISOString()
    },
    ...(input.settlementStatus
      ? {
          settlement: {
            status: input.settlementStatus,
            ...(input.settlementStatus === "pending"
              ? {}
              : { settledAt: input.updatedAt.toISOString(), reason: input.settlementStatus === "completed" ? "terminal" : "remort" }),
            version: 1
          }
        }
      : {}),
    ...(input.status === "active" ? {} : { completedAt: input.completedAt.toISOString() })
  };

  return {
    id: input.id,
    characterId: input.characterId,
    monsterId: input.monsterId,
    stateJson: state,
    status: input.status,
    turn: 1,
    expiresAt: new Date(input.updatedAt.getTime() + 30 * 60_000),
    createdAt: input.createdAt ?? input.completedAt,
    updatedAt: input.updatedAt
  };
}

function makeLegacySoloSessionData(input: {
  id: string;
  characterId: string;
  monsterId: string;
  status: "active" | "won" | "lost" | "fled" | "expired";
  source: NonNullable<CombatState["source"]>;
  completedAt: Date;
  updatedAt: Date;
}) {
  const state = {
    ...makeCombatState(input.id, input.monsterId),
    status: input.status,
    source: input.source,
    legacyMarker: "preserve-me",
    ...(input.status === "active" ? {} : { completedAt: input.completedAt.toISOString() })
  };

  return {
    id: input.id,
    characterId: input.characterId,
    monsterId: input.monsterId,
    stateJson: state,
    status: input.status,
    turn: 1,
    expiresAt: new Date(input.updatedAt.getTime() + 30 * 60_000),
    createdAt: input.completedAt,
    updatedAt: input.updatedAt
  };
}
