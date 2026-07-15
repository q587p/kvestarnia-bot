import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HpRecoveryNotificationProducer } from "../../src/db/repositories/hpRecoveryNotificationProducer";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaDuelChallengeRepository } from "../../src/db/repositories/prismaDuelChallengeRepository";
import type {
  DuelCombatSessionRecord,
  DuelResultPayload
} from "../../src/db/repositories/duelChallengeRepository";
import { startTurnBasedDuel, type TurnBasedDuelState } from "../../src/domain/duels/turnBasedDuel";
import type { DuelistSummary } from "../../src/domain/duels/duelResolver";
import {
  buildEquipmentAttunementPayload,
  EQUIPMENT_ATTUNEMENT_ACTION_KEY
} from "../../src/domain/equipment/equipmentAttunement";
import {
  settleVarenykSatedOutsideCombat,
  VARENYK_SATED_STATUS_KEY,
  type VarenykSatedPayloadV1
} from "../../src/domain/noncombat/varenykSatedSupport";
import { DuelChallengeService } from "../../src/services/duelChallengeService";
import { FakeRandomSource } from "../../src/shared/random";
import type { RandomSource } from "../../src/shared/random";
import { DuelChallengeService } from "../../src/services/duelChallengeService";

describe("PrismaDuelChallengeRepository turn-based integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaDuelChallengeRepository;
  let producerRecord: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-duel-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    const producer = new HpRecoveryNotificationProducer(true);
    producerRecord = vi.spyOn(producer, "record").mockResolvedValue(undefined);
    repository = new PrismaDuelChallengeRepository(prisma, producer);
  }, 60_000);

  beforeEach(() => {
    producerRecord.mockClear();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("enforces player-action and timeout deadline predicates in CAS updates", async () => {
    const session = await seedActiveSession("deadline-a", new Date("2026-06-17T18:00:23.000Z"));
    const before = await repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
      state: {
        ...session.state,
        pendingActions: {
          challenger: {
            actorCharacterId: session.challengerCharacterId,
            action: "attack"
          }
        }
      },
      status: "active",
      now: new Date("2026-06-17T18:00:22.999Z"),
      deadlineMode: "player-action",
      turnExpiresAt: session.turnExpiresAt
    });

    expect(before?.version).toBe(2);

    const lateSession = await seedActiveSession("deadline-b", new Date("2026-06-17T18:00:23.000Z"));
    await expect(repository.updateTurnBasedIfActiveVersion(lateSession.id, 1, 1, {
      state: lateSession.state,
      status: "active",
      now: new Date("2026-06-17T18:00:23.000Z"),
      deadlineMode: "player-action",
      turnExpiresAt: lateSession.turnExpiresAt
    })).resolves.toBeNull();

    await expect(repository.updateTurnBasedIfActiveVersion(lateSession.id, 1, 1, {
      state: lateSession.state,
      status: "active",
      now: new Date("2026-06-17T18:00:22.999Z"),
      deadlineMode: "timeout",
      turnExpiresAt: lateSession.turnExpiresAt
    })).resolves.toBeNull();

    const timeout = await repository.updateTurnBasedIfActiveVersion(lateSession.id, 1, 1, {
      state: { ...lateSession.state, turn: 2 },
      status: "active",
      now: new Date("2026-06-17T18:00:23.000Z"),
      deadlineMode: "timeout",
      turnExpiresAt: new Date("2026-06-17T18:00:46.000Z")
    });

    expect(timeout?.version).toBe(2);
    expect(timeout?.turn).toBe(2);
  });

  it("round-trips race actions, support summaries and ability cooldowns in turn-based state JSON", async () => {
    const session = await seedActiveSession("race-json", new Date("2026-06-17T18:00:23.000Z"));
    const nextState = JSON.parse(JSON.stringify(session.state)) as TurnBasedDuelState;

    nextState.pendingActions = {
      challenger: {
        actorCharacterId: session.challengerCharacterId,
        action: "race"
      }
    };
    nextState.participants.challenger.cooldowns = {
      abilities: {
        "ability.race.practical-improvisation": {
          id: "ability.race.practical-improvisation",
          remainingTurns: 2
        }
      }
    };
    nextState.participants.challenger.activeCosmeticTitle = "Перший пергамент не зʼїв";
    nextState.lastAction = {
      actorCharacterId: session.challengerCharacterId,
      defenderCharacterId: session.targetCharacterId,
      action: "race",
      outcome: "hit",
      damage: 3,
      healing: 7,
      guard: 1,
      manaSpent: 0,
      critical: false,
      skillId: "ability.race.practical-improvisation"
    };
    nextState.lastRound = {
      turn: 1,
      actions: [nextState.lastAction]
    };

    await prisma.duelCombatSession.update({
      where: { id: session.id },
      data: { stateJson: nextState }
    });

    const mapped = await repository.findTurnBasedByToken("race-json");

    expect(mapped?.state.pendingActions?.challenger?.action).toBe("race");
    expect(mapped?.state.participants.challenger.activeCosmeticTitle).toBe("Перший пергамент не зʼїв");
    expect(mapped?.state.participants.challenger.combatStats.raceId).toBe("race.human-ish");
    expect(
      mapped?.state.participants.challenger.cooldowns?.abilities?.["ability.race.practical-improvisation"]
    ).toEqual({
      id: "ability.race.practical-improvisation",
      remainingTurns: 2
    });
    expect(mapped?.state.lastAction).toMatchObject({
      action: "race",
      healing: 7,
      guard: 1,
      skillId: "ability.race.practical-improvisation"
    });
  });

  it("round-trips defended and critical-fumble duel action summaries", async () => {
    const session = await seedActiveSession("summary-outcomes-json", new Date("2026-06-17T18:00:23.000Z"));
    const nextState = JSON.parse(JSON.stringify(session.state)) as TurnBasedDuelState;

    nextState.participants.challenger.playerAbilityFumbles = {
      version: 1,
      abilities: {
        "skill.forceful-strike": {
          version: 1,
          cycle: 0,
          usesInCycle: 1,
          triggerAt: 1
        }
      }
    };
    const defendedAction = {
      actorCharacterId: session.challengerCharacterId,
      defenderCharacterId: session.targetCharacterId,
      action: "defend" as const,
      outcome: "defended" as const,
      damage: 0,
      manaSpent: 0,
      critical: false
    };
    const fumbleAction = {
      actorCharacterId: session.targetCharacterId,
      defenderCharacterId: session.challengerCharacterId,
      action: "skill" as const,
      outcome: "critical-fumble" as const,
      damage: 0,
      manaSpent: 0,
      critical: false,
      skillId: "skill.forceful-strike",
      fumble: {
        abilityId: "skill.forceful-strike",
        kind: "self-damage" as const,
        line: "Тестова невдача.",
        selfDamage: 3
      }
    };
    nextState.lastAction = fumbleAction;
    nextState.lastRound = {
      turn: 1,
      actions: [defendedAction, fumbleAction]
    };

    await prisma.duelCombatSession.update({
      where: { id: session.id },
      data: { stateJson: nextState }
    });

    const mapped = await repository.findTurnBasedByToken("summary-outcomes-json");

    expect(mapped?.state.participants.challenger.playerAbilityFumbles?.abilities["skill.forceful-strike"]).toEqual({
      version: 1,
      cycle: 0,
      usesInCycle: 1,
      triggerAt: 1
    });
    expect(mapped?.state.lastRound?.actions.map((action) => action.outcome)).toEqual([
      "defended",
      "critical-fumble"
    ]);
    expect(mapped?.state.lastAction).toMatchObject({
      outcome: "critical-fumble",
      fumble: {
        abilityId: "skill.forceful-strike",
        kind: "self-damage",
        selfDamage: 3
      }
    });
  });

  it("treats unknown current duel action outcomes as repairable malformed state", async () => {
    const session = await seedActiveSession("unknown-outcome-json", new Date("2026-06-17T18:00:23.000Z"));
    const nextState = JSON.parse(JSON.stringify(session.state)) as unknown as Record<string, unknown>;
    nextState.lastAction = {
      actorCharacterId: session.challengerCharacterId,
      defenderCharacterId: session.targetCharacterId,
      action: "attack",
      outcome: "future-outcome",
      damage: 0,
      manaSpent: 0,
      critical: false
    };

    await prisma.duelCombatSession.update({
      where: { id: session.id },
      data: { stateJson: nextState }
    });

    await expect(repository.findTurnBasedByToken("unknown-outcome-json")).resolves.toBeNull();
    await prisma.duelCombatSession.update({
      where: { id: session.id },
      data: {
        status: "expired",
        completedAt: new Date("2026-06-17T18:00:24.000Z")
      }
    });
    await prisma.duelChallenge.update({
      where: { inviteToken: "unknown-outcome-json" },
      data: { status: "expired" }
    });
    await prisma.activeCombatLease.deleteMany({
      where: { kind: "turn-based-duel", referenceId: session.id }
    });
  });

  it("starts one turn-based session and two leases under concurrent accept attempts", async () => {
    const seeded = await seedPendingChallenge("start-race");
    const initiativeRng = {
      nextFloat: vi.fn(() => 0),
      nextInt: vi.fn(() => 1)
    };
    const raceRepository = new PrismaDuelChallengeRepository(
      prisma,
      new HpRecoveryNotificationProducer(false),
      initiativeRng
    );
    const [first, second] = await Promise.all([
      raceRepository.startTurnBasedByTokenForTelegramUser(
        "start-race",
        seeded.target.telegramUserId,
        new Date("2026-06-17T18:00:00.000Z"),
        {
          sessionId: "session-start-race-a",
          turnExpiresAt: new Date("2026-06-17T18:00:23.000Z")
        }
      ),
      raceRepository.startTurnBasedByTokenForTelegramUser(
        "start-race",
        seeded.target.telegramUserId,
        new Date("2026-06-17T18:00:00.000Z"),
        {
          sessionId: "session-start-race-b",
          turnExpiresAt: new Date("2026-06-17T18:00:23.000Z")
        }
      )
    ]);
    const started = [first, second].filter((result) => result.record !== null);

    expect(started).toHaveLength(1);
    expect([first.transitioned, second.transitioned].filter(Boolean)).toHaveLength(1);
    expect(initiativeRng.nextInt).toHaveBeenCalledTimes(2);
    await expect(prisma.duelCombatSession.count({
      where: {
        duelChallenge: {
          inviteToken: "start-race"
        }
      }
    })).resolves.toBe(1);
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        characterId: {
          in: [seeded.challenger.id, seeded.target.id]
        }
      }
    })).resolves.toBe(2);
    await expect(prisma.duelChallenge.findUnique({
      where: {
        inviteToken: "start-race"
      }
    })).resolves.toMatchObject({
      status: "active",
      targetCharacterId: seeded.target.id
    });
  });

  it("uses the same attunement boundary for the public acceptance preview, sync, initiative and stored duel", async () => {
    const readyAt = new Date("2026-06-17T18:00:00.000Z");
    const equipmentUpdatedAt = new Date("2026-06-17T17:18:00.000Z");

    for (const boundary of ["before", "ready"] as const) {
      const acceptedAt = boundary === "before" ? new Date(readyAt.getTime() - 1) : readyAt;
      const seeded = await seedPendingChallenge(`service-attunement-${boundary}`);
      await prisma.character.update({
        where: { id: seeded.challenger.id },
        data: {
          level: 13,
          hpCurrent: 75,
          manaCurrent: 36,
          hpRegenAt: acceptedAt,
          manaRegenAt: acceptedAt
        }
      });
      await prisma.character.update({
        where: { id: seeded.target.id },
        data: {
          level: 13,
          hpCurrent: 71,
          manaCurrent: 36,
          hpRegenAt: acceptedAt,
          manaRegenAt: acceptedAt
        }
      });

      const equipmentRows = [
        {
          id: `service-greaves-${boundary}`,
          slot: "legs",
          itemId: "item.set.barrel-brother.greaves",
          itemName: "Поножі нижнього обруча"
        },
        {
          id: `service-shield-${boundary}`,
          slot: "offhand",
          itemId: "item.set.barrel-brother.shield",
          itemName: "Щит бочкового контраргументу"
        },
        {
          id: `service-parry-spoon-${boundary}`,
          slot: "weapon",
          itemId: "item.mantok.coverage.universal.parry-spoon",
          itemName: "Ложка парирування"
        }
      ];
      for (const row of equipmentRows) {
        await prisma.characterEquipment.create({
          data: {
            id: row.id,
            characterId: seeded.challenger.id,
            slot: row.slot,
            itemId: row.itemId,
            createdAt: equipmentUpdatedAt,
            updatedAt: equipmentUpdatedAt
          }
        });
        await prisma.dailyAction.create({
          data: {
            characterId: seeded.challenger.id,
            key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
            localDate: `${row.slot}:${row.id}:${equipmentUpdatedAt.getTime()}`,
            rewardXp: 0,
            rewardGold: 0,
            resultJson: buildEquipmentAttunementPayload({
              slot: row.slot,
              itemId: row.itemId,
              itemName: row.itemName,
              equipmentUpdatedAt,
              strength: "strong",
              startedAt: equipmentUpdatedAt,
              readyAt
            })
          }
        });
      }

      const initiativeRng = new CountingRandomSource([0.5, 0.5, 0.9]);
      const boundaryRepository = new PrismaDuelChallengeRepository(
        prisma,
        new HpRecoveryNotificationProducer(false),
        initiativeRng
      );
      const service = new DuelChallengeService(
        boundaryRepository,
        new PrismaCharacterRepository(prisma),
        () => acceptedAt,
        new FakeRandomSource([0.1])
      );
      const warning = await service.acceptForTelegramUser(
        seeded.target.telegramUserId,
        `service-attunement-${boundary}`,
        { expectedMode: "turn-based" }
      );
      expect(warning).toMatchObject({
        state: "resource-warning",
        challenger: boundary === "before"
          ? { hpCurrent: 72, hpMax: 72, manaCurrent: 36, manaMax: 36 }
          : { hpCurrent: 75, hpMax: 77, manaCurrent: 36, manaMax: 36 },
        target: { hpCurrent: 71, hpMax: 72 },
        warning: { hpBelowMax: true, manaBelowMax: false }
      });
      expect(initiativeRng.calls).toBe(0);

      const confirmation = await service.acceptForTelegramUser(
        seeded.target.telegramUserId,
        `service-attunement-${boundary}`,
        { expectedMode: "turn-based", ignoreResourceWarning: true }
      );
      expect(confirmation).toMatchObject({
        state: "confirmation",
        challenger: boundary === "before"
          ? { hpCurrent: 72, hpMax: 72 }
          : { hpCurrent: 75, hpMax: 77 }
      });
      expect(initiativeRng.calls).toBe(0);

      const accepted = await service.acceptForTelegramUser(
        seeded.target.telegramUserId,
        `service-attunement-${boundary}`,
        {
          expectedMode: "turn-based",
          ignoreResourceWarning: true,
          confirmed: true
        }
      );
      expect(accepted.state).toBe("active");
      if (accepted.state !== "active") {
        throw new Error("Expected public turn-duel acceptance to start a session.");
      }
      const challenger = accepted.session.state.participants.challenger;
      expect(challenger).toMatchObject(boundary === "before"
        ? { hpMax: 72 }
        : {
            hpMax: 77,
            equipmentAbilityGrantIds: ["mantok-ability.barrel-counter-shield"]
          });
      expect(challenger.equipmentAbilityGrantIds ?? []).toEqual(
        boundary === "before" ? [] : ["mantok-ability.barrel-counter-shield"]
      );
      expect(challenger.stats.dexterity).toBe(boundary === "before" ? 9 : 10);
      expect(challenger.stats.luck).toBe(boundary === "before" ? 9 : 10);
      expect(accepted.session.actingCharacterId).toBe(
        boundary === "before" ? seeded.target.id : seeded.challenger.id
      );
      expect(initiativeRng.calls).toBe(boundary === "before" ? 3 : 2);
      const initiativeCalls = initiativeRng.calls;
      const replay = await service.acceptForTelegramUser(
        seeded.target.telegramUserId,
        `service-attunement-${boundary}`,
        { expectedMode: "turn-based", confirmed: true, ignoreResourceWarning: true }
      );
      expect(replay).toMatchObject({
        state: "active",
        session: { actingCharacterId: accepted.session.actingCharacterId }
      });
      expect(initiativeRng.calls).toBe(initiativeCalls);
      await expect(prisma.character.findUnique({ where: { id: seeded.challenger.id } }))
        .resolves.toMatchObject({
          hpCurrent: boundary === "before" ? 72 : 75,
          hpMax: 24,
          manaCurrent: 36,
          manaMax: 12,
          hpRegenAt: acceptedAt,
          manaRegenAt: acceptedAt
        });
    }
  });

  it("persists exact pre-lease Sated minutes once and preserves the outside remainder on duel start replay", async () => {
    const seeded = await seedPendingChallenge("sated-prelease");
    const acceptedAt = new Date("2026-06-17T18:00:00.000Z");
    const cursorAt = new Date("2026-06-17T17:57:30.000Z");
    for (const side of ["challenger", "target"] as const) {
      const participant = seeded.state.participants[side];
      participant.hp = 10;
      participant.mana = 5;
      await prisma.character.update({
        where: { id: participant.characterId },
        data: { hpCurrent: 10, manaCurrent: 5 }
      });
      const payload = makeSatedPayload(participant.characterId, cursorAt);
      await prisma.characterCooldown.create({
        data: {
          characterId: participant.characterId,
          key: VARENYK_SATED_STATUS_KEY,
          availableAt: new Date(payload.availableAt),
          resultJson: payload
        }
      });
    }

    const started = await repository.startTurnBasedByTokenForTelegramUser(
      "sated-prelease",
      seeded.target.telegramUserId,
      acceptedAt,
      {
        sessionId: "session-sated-prelease",
        turnExpiresAt: new Date("2026-06-17T18:00:23.000Z")
      }
    );
    const restartedRepository = new PrismaDuelChallengeRepository(prisma);
    const replay = await restartedRepository.startTurnBasedByTokenForTelegramUser(
      "sated-prelease",
      seeded.target.telegramUserId,
      acceptedAt,
      {
        sessionId: "session-sated-prelease-replay",
        turnExpiresAt: new Date("2026-06-17T18:00:23.000Z")
      }
    );

    expect(started).toMatchObject({ transitioned: true });
    expect(replay).toEqual({ record: null, transitioned: false });
    for (const side of ["challenger", "target"] as const) {
      const participant = started.record?.state.participants[side];
      expect(participant).toMatchObject({
        hp: 12,
        mana: 7,
        varenykSated: { outsideRemainderMs: 30_000 }
      });
      await expect(prisma.character.findUnique({
        where: { id: seeded.state.participants[side].characterId }
      })).resolves.toMatchObject({ hpCurrent: 12, manaCurrent: 7 });
      const cooldown = await prisma.characterCooldown.findUniqueOrThrow({
        where: {
          characterId_key: {
            characterId: seeded.state.participants[side].characterId,
            key: VARENYK_SATED_STATUS_KEY
          }
        }
      });
      expect((cooldown.resultJson as { cursorAt: string }).cursorAt).toBe("2026-06-17T17:59:30.000Z");
    }
  });

  it("preserves the exact asymmetric balanced snapshot when neither participant has Sated", async () => {
    const seeded = await seedPendingChallenge("asymmetric-without-sated");
    await prisma.character.update({
      where: { id: seeded.challenger.id },
      data: { hpCurrent: 12, hpMax: 24, manaCurrent: 6, manaMax: 12 }
    });
    await prisma.character.update({
      where: { id: seeded.target.id },
      data: { level: 13, hpCurrent: 60, hpMax: 60, manaCurrent: 30, manaMax: 30 }
    });

    const started = await repository.startTurnBasedByTokenForTelegramUser(
      "asymmetric-without-sated",
      seeded.target.telegramUserId,
      new Date("2026-06-17T18:00:00.000Z"),
      {
        sessionId: "session-asymmetric-without-sated",
        turnExpiresAt: new Date("2026-06-17T18:00:23.000Z")
      }
    );

    expect(started.record?.state.participants.challenger).toMatchObject({
      hp: 27,
      hpMax: 72,
      mana: 14,
      manaMax: 36
    });
    expect(started.record?.state.participants.target).toMatchObject({
      hp: 60,
      hpMax: 108,
      mana: 30,
      manaMax: 54
    });
    await expect(prisma.character.findUnique({ where: { id: seeded.challenger.id } }))
      .resolves.toMatchObject({ hpCurrent: 12, hpMax: 24, manaCurrent: 6, manaMax: 12 });
    await expect(prisma.character.findUnique({ where: { id: seeded.target.id } }))
      .resolves.toMatchObject({ hpCurrent: 60, hpMax: 60, manaCurrent: 30, manaMax: 30 });
  });

  it("uses one attunement-aware equipment snapshot immediately before and exactly at duel acceptance", async () => {
    const readyAt = new Date("2026-06-17T18:00:00.000Z");
    const equipmentUpdatedAt = new Date("2026-06-17T17:18:00.000Z");

    for (const boundary of ["before", "ready"] as const) {
      const seeded = await seedPendingChallenge(`attunement-${boundary}`);
      const challengerId = seeded.challenger.id;
      const acceptedAt = boundary === "before"
        ? new Date(readyAt.getTime() - 1)
        : readyAt;
      await prisma.character.updateMany({
        where: { id: { in: [seeded.challenger.id, seeded.target.id] } },
        data: { level: 13, hpCurrent: 60, manaCurrent: 30 }
      });
      const equipmentRows = [
        {
          id: `attunement-greaves-${boundary}`,
          slot: "legs",
          itemId: "item.set.barrel-brother.greaves",
          itemName: "Поножі нижнього обруча"
        },
        {
          id: `attunement-shield-${boundary}`,
          slot: "offhand",
          itemId: "item.set.barrel-brother.shield",
          itemName: "Щит бочкового контраргументу"
        }
      ];
      for (const row of equipmentRows) {
        await prisma.characterEquipment.create({
          data: {
            id: row.id,
            characterId: challengerId,
            slot: row.slot,
            itemId: row.itemId,
            createdAt: equipmentUpdatedAt,
            updatedAt: equipmentUpdatedAt
          }
        });
        await prisma.dailyAction.create({
          data: {
            characterId: challengerId,
            key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
            localDate: `${row.slot}:${row.id}:${equipmentUpdatedAt.getTime()}`,
            rewardXp: 0,
            rewardGold: 0,
            resultJson: buildEquipmentAttunementPayload({
              slot: row.slot,
              itemId: row.itemId,
              itemName: row.itemName,
              equipmentUpdatedAt,
              strength: "strong",
              startedAt: equipmentUpdatedAt,
              readyAt
            })
          }
        });
      }
      if (boundary === "ready") {
        const payload = makeSatedPayload(
          challengerId,
          new Date(readyAt.getTime() - 2 * 60_000 - 30_000)
        );
        await prisma.characterCooldown.create({
          data: {
            characterId: challengerId,
            key: VARENYK_SATED_STATUS_KEY,
            availableAt: new Date(payload.availableAt),
            resultJson: payload
          }
        });
      }

      const started = await repository.startTurnBasedByTokenForTelegramUser(
        `attunement-${boundary}`,
        seeded.target.telegramUserId,
        acceptedAt,
        {
          sessionId: `session-attunement-${boundary}`,
          turnExpiresAt: new Date(acceptedAt.getTime() + 23_000)
        }
      );
      const challenger = started.record?.state.participants.challenger;

      expect(started.transitioned).toBe(true);
      expect(challenger).toMatchObject(boundary === "before"
        ? { hp: 60, hpMax: 72, mana: 30, manaMax: 36 }
        : {
            hp: 62,
            hpMax: 77,
            mana: 32,
            manaMax: 36,
            equipmentAbilityGrantIds: ["mantok-ability.barrel-counter-shield"],
            varenykSated: { outsideRemainderMs: 30_000 }
          });
      expect(challenger?.equipmentAbilityGrantIds ?? []).toEqual(
        boundary === "before" ? [] : ["mantok-ability.barrel-counter-shield"]
      );
      await expect(prisma.character.findUnique({ where: { id: challengerId } }))
        .resolves.toMatchObject(boundary === "before"
          ? { hpCurrent: 60, hpMax: 24, manaCurrent: 30, manaMax: 12 }
          : { hpCurrent: 62, hpMax: 24, manaCurrent: 32, manaMax: 12 });
      const leases = await prisma.activeCombatLease.findMany({
        where: { referenceId: `session-attunement-${boundary}` }
      });
      expect(leases).toHaveLength(2);
      expect(leases.every((lease) => lease.createdAt.getTime() === acceptedAt.getTime())).toBe(true);
    }
  });

  it("uses the same inclusive attunement boundary across public acceptance sync, warning, initiative, and storage", async () => {
    const readyAt = new Date("2026-06-17T18:00:00.000Z");
    const equipmentUpdatedAt = new Date("2026-06-17T17:18:00.000Z");
    const oldHpAnchor = new Date("2026-06-17T17:57:30.000Z");
    const tuningEquipment = [
      ["weapon", "item.set.red-line.left-dagger", "Кинджал червоного рядка"],
      ["offhand", "item.set.red-line.margin-dagger", "Кинджал червоного поля"],
      ["head", "item.set.barrel-brother.helm", "Шолом бочкового дзвону"],
      ["chest", "item.set.barrel-brother.cuirass", "Нагрудник старшого обруча"],
      ["legs", "item.set.barrel-brother.greaves", "Поножі нижнього обруча"]
    ] as const;

    for (const boundary of ["before", "ready"] as const) {
      const token = `service-inclusive-attunement-${boundary}`;
      const seeded = await seedPendingChallenge(token);
      const acceptedAt = boundary === "before"
        ? new Date(readyAt.getTime() - 1)
        : readyAt;
      await prisma.character.update({
        where: { id: seeded.challenger.id },
        data: {
          level: 13,
          hpCurrent: 72,
          manaCurrent: 36,
          statsJson: {
            strength: 7,
            dexterity: 8,
            intelligence: 6,
            charisma: 6,
            luck: 4
          }
        }
      });
      await prisma.character.update({
        where: { id: seeded.target.id },
        data: {
          level: 13,
          hpCurrent: 72,
          manaCurrent: 35,
          hpRegenAt: oldHpAnchor,
          manaRegenAt: acceptedAt,
          statsJson: {
            strength: 7,
            dexterity: 6,
            intelligence: 6,
            charisma: 6,
            luck: 5
          }
        }
      });
      for (const [slot, itemId, itemName] of tuningEquipment) {
        const id = `${token}-${slot}`;
        await prisma.characterEquipment.create({
          data: {
            id,
            characterId: seeded.target.id,
            slot,
            itemId,
            createdAt: equipmentUpdatedAt,
            updatedAt: equipmentUpdatedAt
          }
        });
        await prisma.dailyAction.create({
          data: {
            characterId: seeded.target.id,
            key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
            localDate: `${slot}:${id}:${equipmentUpdatedAt.getTime()}`,
            rewardXp: 0,
            rewardGold: 0,
            resultJson: buildEquipmentAttunementPayload({
              slot,
              itemId,
              itemName,
              equipmentUpdatedAt,
              strength: "strong",
              startedAt: equipmentUpdatedAt,
              readyAt
            })
          }
        });
      }

      const initiativeRng = {
        nextFloat: vi.fn(() => 0),
        nextInt: vi.fn(() => 1)
      };
      const boundaryRepository = new PrismaDuelChallengeRepository(
        prisma,
        new HpRecoveryNotificationProducer(false),
        initiativeRng
      );
      const characterRepository = new PrismaCharacterRepository(prisma);
      const resourceUpdateSpy = vi.spyOn(
        characterRepository,
        "updateResourcesForTelegramUser"
      );
      const service = new DuelChallengeService(
        boundaryRepository,
        characterRepository,
        () => acceptedAt,
        new FakeRandomSource([0.99])
      );

      const warned = await service.acceptForTelegramUser(
        seeded.target.telegramUserId,
        token,
        { expectedMode: "turn-based" }
      );
      expect(warned).toMatchObject({
        state: "resource-warning",
        target: boundary === "before"
          ? { hpCurrent: 72, hpMax: 72, manaCurrent: 35, manaMax: 36 }
          : { hpCurrent: 82, hpMax: 82, manaCurrent: 35, manaMax: 36 },
        warning: { hpBelowMax: false, manaBelowMax: true }
      });
      if (warned.state !== "resource-warning") {
        throw new Error("Expected public turn-duel resource warning.");
      }
      expect(warned.target.stats).toMatchObject(boundary === "before"
        ? { dexterity: 8, luck: 8 }
        : { dexterity: 10, luck: 9 });
      expect(warned.target.equipmentAbilityGrantIds ?? []).toEqual(
        boundary === "before" ? [] : ["mantok-ability.red-line-dagger"]
      );
      expect(warned.target.equipmentEffects?.contributions.map((entry) => entry.itemId) ?? [])
        .toEqual(boundary === "before"
          ? []
          : expect.arrayContaining([
              "mantok-set.red-line-duel:2",
              "mantok-set.barrel-brother-bulwark:2",
              "mantok-set.barrel-brother-bulwark:3"
            ]));

      const canonicalAfterWarning = await prisma.character.findUniqueOrThrow({
        where: { id: seeded.target.id }
      });
      expect(canonicalAfterWarning).toMatchObject({
        hpCurrent: 72,
        manaCurrent: 35,
        hpRegenAt: oldHpAnchor,
        manaRegenAt: acceptedAt
      });

      const confirmation = await service.acceptForTelegramUser(
        seeded.target.telegramUserId,
        token,
        { expectedMode: "turn-based", ignoreResourceWarning: true }
      );
      expect(confirmation).toMatchObject({
        state: "confirmation",
        target: boundary === "before"
          ? { hpCurrent: 72, hpMax: 72, manaCurrent: 35, manaMax: 36 }
          : { hpCurrent: 82, hpMax: 82, manaCurrent: 35, manaMax: 36 }
      });
      if (confirmation.state !== "confirmation") {
        throw new Error("Expected public turn-duel confirmation.");
      }
      expect(confirmation.target.stats).toMatchObject(boundary === "before"
        ? { dexterity: 8, luck: 8 }
        : { dexterity: 10, luck: 9 });
      expect(resourceUpdateSpy).not.toHaveBeenCalled();

      const accepted = await service.acceptForTelegramUser(
        seeded.target.telegramUserId,
        token,
        {
          expectedMode: "turn-based",
          confirmed: true,
          ignoreResourceWarning: true
        }
      );
      if (accepted.state !== "active") {
        throw new Error(`Expected active public turn duel, got ${accepted.state}.`);
      }
      const storedTarget = accepted.session.state.participants.target;
      expect(accepted.session.actingCharacterId).toBe(
        boundary === "before" ? seeded.challenger.id : seeded.target.id
      );
      expect(storedTarget).toMatchObject(boundary === "before"
        ? { hp: 72, hpMax: 72, mana: 35, manaMax: 36 }
        : {
            hp: 82,
            hpMax: 82,
            mana: 35,
            manaMax: 36,
            equipmentAbilityGrantIds: ["mantok-ability.red-line-dagger"]
          });
      expect(storedTarget.equipmentEffects).toMatchObject(boundary === "before"
        ? {
            hpMax: 0,
            armor: 0,
            resist: 0,
            weaponDamage: 0,
            stats: { dexterity: 0, luck: 0 }
          }
        : {
            hpMax: 10,
            armor: 8,
            resist: 2,
            weaponDamage: 7,
            stats: { dexterity: 2, luck: 1 }
          });
      expect(storedTarget.stats).toMatchObject(boundary === "before"
        ? { dexterity: 8, luck: 8 }
        : { dexterity: 10, luck: 9 });
      await expect(prisma.character.findUniqueOrThrow({ where: { id: seeded.target.id } }))
        .resolves.toMatchObject(boundary === "before"
          ? {
              hpCurrent: 72,
              manaCurrent: 35,
              hpRegenAt: oldHpAnchor,
              manaRegenAt: acceptedAt
            }
          : {
              hpCurrent: 82,
              manaCurrent: 35,
              hpRegenAt: acceptedAt,
              manaRegenAt: acceptedAt
            });
      expect(resourceUpdateSpy).not.toHaveBeenCalled();
      expect(initiativeRng.nextInt).toHaveBeenCalledTimes(2);

      const duplicate = await service.acceptForTelegramUser(
        seeded.target.telegramUserId,
        token,
        {
          expectedMode: "turn-based",
          confirmed: true,
          ignoreResourceWarning: true
        }
      );
      expect(duplicate).toMatchObject({
        state: "active",
        session: {
          id: accepted.session.id,
          actingCharacterId: accepted.session.actingCharacterId
        }
      });
      expect(initiativeRng.nextInt).toHaveBeenCalledTimes(2);
    }
  });

  it("settles asymmetric pre-lease Sated against natural maxima before rebuilding balanced ratios", async () => {
    const seeded = await seedPendingChallenge("asymmetric-with-sated");
    const acceptedAt = new Date("2026-06-17T18:00:00.000Z");
    const cursorAt = new Date("2026-06-17T17:57:30.000Z");
    await prisma.character.update({
      where: { id: seeded.challenger.id },
      data: { hpCurrent: 25, hpMax: 25, manaCurrent: 14, manaMax: 12 }
    });
    await prisma.character.update({
      where: { id: seeded.target.id },
      data: { level: 13, hpCurrent: 108, hpMax: 60, manaCurrent: 54, manaMax: 30 }
    });
    await prisma.characterEquipment.create({
      data: {
        id: "equipment-asymmetric-with-sated",
        characterId: seeded.challenger.id,
        slot: "accessory",
        itemId: "item.mantok.coverage.universal.bead-of-pocket-weather"
      }
    });
    const effectiveState = startTurnBasedDuel({
      challenger: makeDuelist(seeded.challenger.id, {
        hpCurrent: 25,
        hpMax: 33,
        manaCurrent: 14,
        manaMax: 17
      }),
      target: makeDuelist(seeded.target.id, {
        level: 13,
        hpCurrent: 108,
        hpMax: 108,
        manaCurrent: 54,
        manaMax: 54
      }),
      rng: new FakeRandomSource([0.99, 0])
    });
    effectiveState.actingCharacterId = seeded.challenger.id;
    for (const characterId of [seeded.challenger.id, seeded.target.id]) {
      const payload = makeSatedPayload(characterId, cursorAt);
      await prisma.characterCooldown.create({
        data: {
          characterId,
          key: VARENYK_SATED_STATUS_KEY,
          availableAt: new Date(payload.availableAt),
          resultJson: payload
        }
      });
    }

    const started = await repository.startTurnBasedByTokenForTelegramUser(
      "asymmetric-with-sated",
      seeded.target.telegramUserId,
      acceptedAt,
      {
        sessionId: "session-asymmetric-with-sated",
        turnExpiresAt: new Date("2026-06-17T18:00:23.000Z")
      }
    );
    const balancedChallenger = effectiveState.participants.challenger;

    expect(started.record?.state.participants.challenger).toMatchObject({
      hp: Math.round((27 / 33) * balancedChallenger.hpMax),
      hpMax: balancedChallenger.hpMax,
      mana: Math.round((16 / 17) * balancedChallenger.manaMax),
      manaMax: balancedChallenger.manaMax,
      varenykSated: { outsideRemainderMs: 30_000 }
    });
    expect(started.record?.state.participants.target).toMatchObject({
      hp: effectiveState.participants.target.hp,
      hpMax: effectiveState.participants.target.hpMax,
      mana: effectiveState.participants.target.mana,
      manaMax: effectiveState.participants.target.manaMax,
      varenykSated: { outsideRemainderMs: 30_000 }
    });
    await expect(prisma.character.findUnique({ where: { id: seeded.challenger.id } }))
      .resolves.toMatchObject({ hpCurrent: 27, hpMax: 25, manaCurrent: 16, manaMax: 12 });
    await expect(prisma.character.findUnique({ where: { id: seeded.target.id } }))
      .resolves.toMatchObject({ hpCurrent: 108, hpMax: 60, manaCurrent: 54, manaMax: 30 });
  });

  it("keeps a level-three partial effective HP pool partial while settling pre-lease Sated", async () => {
    const seeded = await seedPendingChallenge("effective-partial-sated");
    const acceptedAt = new Date("2026-06-17T18:00:00.000Z");
    const cursorAt = new Date("2026-06-17T17:57:30.000Z");
    await prisma.character.update({
      where: { id: seeded.challenger.id },
      data: { hpCurrent: 24, hpMax: 25, manaCurrent: 12, manaMax: 12 }
    });
    await prisma.character.update({
      where: { id: seeded.target.id },
      data: { level: 13, hpCurrent: 108, hpMax: 60, manaCurrent: 54, manaMax: 30 }
    });
    const state = startTurnBasedDuel({
      challenger: makeDuelist(seeded.challenger.id, {
        hpCurrent: 24,
        hpMax: 33,
        manaCurrent: 12,
        manaMax: 16
      }),
      target: makeDuelist(seeded.target.id, {
        level: 13,
        hpCurrent: 108,
        hpMax: 108,
        manaCurrent: 54,
        manaMax: 54
      }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = seeded.challenger.id;
    const payload = makeSatedPayload(seeded.challenger.id, cursorAt);
    await prisma.characterCooldown.create({
      data: {
        characterId: seeded.challenger.id,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });

    const started = await repository.startTurnBasedByTokenForTelegramUser(
      "effective-partial-sated",
      seeded.target.telegramUserId,
      acceptedAt,
      {
        sessionId: "session-effective-partial-sated",
        turnExpiresAt: new Date("2026-06-17T18:00:23.000Z")
      }
    );

    expect(started.record?.state.participants.challenger.hp).toBe(
      Math.round((26 / 33) * state.participants.challenger.hpMax)
    );
    await expect(prisma.character.findUnique({ where: { id: seeded.challenger.id } }))
      .resolves.toMatchObject({ hpCurrent: 26, hpMax: 25, manaCurrent: 14, manaMax: 12 });
  });

  it("resolves terminal sessions, grants XP once and releases both leases", async () => {
    const session = await seedActiveSession("terminal-surrender", new Date("2026-06-17T18:00:23.000Z"));
    const completedAt = new Date("2026-06-17T18:00:11.000Z");
    const satedPayload = makeSatedPayload(
      session.challengerCharacterId,
      new Date("2026-06-17T17:59:00.000Z")
    );
    await prisma.characterCooldown.create({
      data: {
        characterId: session.challengerCharacterId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(satedPayload.availableAt),
        resultJson: satedPayload
      }
    });
    session.state.participants.challenger.varenykSated = {
      version: 1,
      activationId: satedPayload.activationId,
      recipientCharacterId: session.challengerCharacterId,
      recipientRemortCount: 0,
      rank: 1,
      expiresAt: new Date(Date.parse(satedPayload.expiresAt) - 60_000).toISOString(),
      cursorAt: completedAt.toISOString(),
      leaseStartedAt: new Date("2026-06-17T18:00:00.000Z").toISOString(),
      outsideRemainderMs: 0,
      pulseIds: [`${session.id}:turn:1:${session.challengerCharacterId}`]
    };
    const terminalState = makeTerminalState(session.state, "target", "surrender");
    const result = makeTerminalResult(session, "target", "surrender", { challenger: 1, target: 4 });

    const resolved = await repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
      state: terminalState,
      status: "forfeited",
      now: completedAt,
      deadlineMode: "player-action",
      turnExpiresAt: session.turnExpiresAt,
      completedAt,
      result,
      action: {
        actorCharacterId: session.challengerCharacterId,
        turn: 1,
        actionKey: "surrender",
        result: { reason: "surrender" }
      }
    });
    const replay = await repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
      state: terminalState,
      status: "forfeited",
      now: completedAt,
      deadlineMode: "player-action",
      turnExpiresAt: session.turnExpiresAt,
      completedAt,
      result
    });

    expect(resolved).toMatchObject({
      status: "forfeited",
      completedAt
    });
    expect(replay).toBeNull();
    const storedSated = await prisma.characterCooldown.findUniqueOrThrow({
      where: {
        characterId_key: {
          characterId: session.challengerCharacterId,
          key: VARENYK_SATED_STATUS_KEY
        }
      }
    });
    expect((storedSated.resultJson as { expiresAt: string }).expiresAt)
      .toBe(new Date(Date.parse(satedPayload.expiresAt) - 60_000).toISOString());
    const challenge = await prisma.duelChallenge.findUnique({
      where: {
        inviteToken: "terminal-surrender"
      }
    });

    expect(challenge).toMatchObject({
      status: "resolved",
      resolvedAt: completedAt
    });
    expect(challenge?.resultJson as unknown as DuelResultPayload).toMatchObject({
      terminalReason: "surrender",
      outcome: "target",
      xpRewards: {
        challenger: 1,
        target: 4
      }
    });
    await expect(prisma.character.findUnique({ where: { id: session.challengerCharacterId } })).resolves.toMatchObject({ xp: 26 });
    await expect(prisma.character.findUnique({ where: { id: session.targetCharacterId } })).resolves.toMatchObject({ xp: 29 });
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        referenceId: session.id
      }
    })).resolves.toBe(0);
    await expect(prisma.duelCombatAction.count({
      where: {
        sessionId: session.id,
        turn: 1
      }
    })).resolves.toBe(1);
    expect(producerRecord).toHaveBeenCalledTimes(2);
    expect(producerRecord).toHaveBeenCalledWith(
      expect.anything(),
      session.challengerCharacterId,
      completedAt,
      "recovering"
    );
    expect(producerRecord).toHaveBeenCalledWith(
      expect.anything(),
      session.targetCharacterId,
      completedAt,
      "recovering"
    );
  });

  it("lets only one callback-vs-timeout terminal update win the same turn/version", async () => {
    const session = await seedActiveSession("terminal-race", new Date("2026-06-17T18:00:23.000Z"));
    const callbackResult = makeTerminalResult(session, "challenger", "defeat", {
      challenger: 4,
      target: 1
    });
    const timeoutResult = makeTerminalResult(session, "target", "defeat", {
      challenger: 1,
      target: 4
    });
    const [callback, timeout] = await Promise.all([
      repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
        state: makeTerminalState(session.state, "challenger", "defeat"),
        status: "resolved",
        now: new Date("2026-06-17T18:00:22.999Z"),
        deadlineMode: "player-action",
        turnExpiresAt: session.turnExpiresAt,
        completedAt: new Date("2026-06-17T18:00:22.999Z"),
        result: callbackResult,
        action: {
          actorCharacterId: session.challengerCharacterId,
          turn: 1,
          actionKey: "round",
          result: { path: "callback" }
        }
      }),
      repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
        state: makeTerminalState(session.state, "target", "defeat"),
        status: "resolved",
        now: new Date("2026-06-17T18:00:23.000Z"),
        deadlineMode: "timeout",
        turnExpiresAt: session.turnExpiresAt,
        completedAt: new Date("2026-06-17T18:00:23.000Z"),
        result: timeoutResult,
        action: {
          actorCharacterId: session.targetCharacterId,
          turn: 1,
          actionKey: "timeout-attack",
          result: { path: "timeout" }
        }
      })
    ]);

    expect([callback, timeout].filter((record) => record !== null)).toHaveLength(1);
    await expect(prisma.duelChallenge.findUnique({
      where: {
        inviteToken: "terminal-race"
      }
    })).resolves.toMatchObject({
      status: "resolved"
    });
    await expect(prisma.duelCombatAction.count({
      where: {
        sessionId: session.id,
        turn: 1
      }
    })).resolves.toBe(1);
    await expect(repository.hasResolvedTurnBasedRoundByToken("terminal-race")).resolves.toBe(true);
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        referenceId: session.id
      }
    })).resolves.toBe(0);

    const challenger = await prisma.character.findUnique({ where: { id: session.challengerCharacterId } });
    const target = await prisma.character.findUnique({ where: { id: session.targetCharacterId } });
    const totalAwardedXp = (challenger?.xp ?? 0) + (target?.xp ?? 0) - 50;

    expect(totalAwardedXp).toBe(5);
  });

  it("repairs malformed active sessions and removes orphan turn-based duel leases", async () => {
    const session = await seedActiveSession("repair", new Date("2026-06-17T18:00:23.000Z"));
    await prisma.duelCombatSession.update({
      where: { id: session.id },
      data: {
        stateJson: { mode: "turn-based", status: "active" }
      }
    });
    await seedCharacter("char-orphan", 999_001n);
    const orphanLeaseStartedAt = new Date("2026-06-17T18:00:30.000Z");
    const orphanSated = makeSatedPayload("char-orphan", new Date("2026-06-17T18:00:00.000Z"));
    await prisma.characterCooldown.create({
      data: {
        characterId: "char-orphan",
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(orphanSated.availableAt),
        resultJson: orphanSated
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        characterId: "char-orphan",
        kind: "turn-based-duel",
        referenceId: "missing-session",
        createdAt: orphanLeaseStartedAt,
        updatedAt: orphanLeaseStartedAt
      }
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repaired = await repository.repairTurnBasedCombatState(new Date("2026-06-17T18:01:00.000Z"));
    warn.mockRestore();

    expect(repaired).toEqual({ repairedSessions: 1, removedOrphanLeases: 1 });
    await expect(prisma.duelCombatSession.findUnique({ where: { id: session.id } })).resolves.toMatchObject({
      status: "expired",
      completedAt: new Date("2026-06-17T18:01:00.000Z")
    });
    await expect(prisma.duelChallenge.findUnique({ where: { inviteToken: "repair" } })).resolves.toMatchObject({
      status: "expired"
    });
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        referenceId: {
          in: [session.id, "missing-session"]
        }
      }
    })).resolves.toBe(0);
    const orphanStatus = await prisma.characterCooldown.findUniqueOrThrow({
      where: {
        characterId_key: {
          characterId: "char-orphan",
          key: VARENYK_SATED_STATUS_KEY
        }
      }
    });
    expect((orphanStatus.resultJson as { cursorAt: string }).cursorAt).toBe("2026-06-17T18:00:30.000Z");
  });

  it("releases a turn-duel orphan after round progress without losing its original remainder", async () => {
    const session = await seedActiveSession("orphan-after-round", new Date("2026-06-17T19:23:00.000Z"));
    const characterId = session.challengerCharacterId;
    const startedAt = new Date("2026-06-17T19:00:00.000Z");
    const leaseStartedAt = new Date("2026-06-17T19:00:30.000Z");
    const payload = makeSatedPayload(characterId, startedAt);
    await prisma.characterCooldown.create({
      data: {
        characterId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    await prisma.activeCombatLease.update({
      where: { characterId },
      data: { createdAt: leaseStartedAt, updatedAt: leaseStartedAt }
    });
    const progressed = JSON.parse(JSON.stringify(session.state)) as TurnBasedDuelState;
    progressed.turn = 2;
    progressed.participants.challenger.varenykSated = {
      version: 1,
      activationId: payload.activationId,
      recipientCharacterId: characterId,
      recipientRemortCount: 0,
      rank: 1,
      expiresAt: payload.expiresAt,
      cursorAt: "2026-06-17T19:03:00.000Z",
      leaseStartedAt: leaseStartedAt.toISOString(),
      outsideRemainderMs: 30_000,
      pulseIds: [`${session.id}:turn:1:${characterId}`]
    };
    await expect(repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
      state: progressed,
      status: "active",
      now: new Date("2026-06-17T19:03:00.000Z"),
      deadlineMode: "player-action",
      turnExpiresAt: new Date("2026-06-17T19:23:00.000Z")
    })).resolves.toMatchObject({ turn: 2, version: 2 });
    let stored = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect((stored.resultJson as { cursorAt: string }).cursorAt).toBe(startedAt.toISOString());
    await prisma.duelCombatSession.delete({ where: { id: session.id } });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = await repository.repairTurnBasedCombatState(new Date("2026-06-17T19:05:30.000Z"));
    const duplicate = await repository.repairTurnBasedCombatState(new Date("2026-06-17T19:06:30.000Z"));
    warn.mockRestore();

    expect(first.removedOrphanLeases).toBe(2);
    expect(duplicate.removedOrphanLeases).toBe(0);
    stored = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    const releasedPayload = stored.resultJson as unknown as VarenykSatedPayloadV1;
    expect(releasedPayload.cursorAt).toBe("2026-06-17T19:05:00.000Z");
    expect(settleVarenykSatedOutsideCombat({
      payload: releasedPayload,
      resources: { hp: 1, hpMax: 33, mana: 1, manaMax: 16 },
      now: new Date("2026-06-17T19:05:59.999Z"),
      combatBlocked: false
    }).elapsedMinutes).toBe(0);
    expect(settleVarenykSatedOutsideCombat({
      payload: releasedPayload,
      resources: { hp: 1, hpMax: 33, mana: 1, manaMax: 16 },
      now: new Date("2026-06-17T19:06:00.000Z"),
      combatBlocked: false
    })).toMatchObject({ elapsedMinutes: 1, hpRestored: 1, manaRestored: 1 });
  });

  it("treats a concurrent losing turn-duel orphan release as an idempotent repair", async () => {
    const characterId = "char-parallel-orphan";
    const startedAt = new Date("2026-06-17T20:00:00.000Z");
    const leaseStartedAt = new Date("2026-06-17T20:00:30.000Z");
    const cleanupAt = new Date("2026-06-17T20:01:00.000Z");
    await seedCharacter(characterId, 999_002n);
    const payload = makeSatedPayload(characterId, startedAt);
    await prisma.characterCooldown.create({
      data: {
        characterId,
        key: VARENYK_SATED_STATUS_KEY,
        availableAt: new Date(payload.availableAt),
        resultJson: payload
      }
    });
    await prisma.activeCombatLease.create({
      data: {
        characterId,
        kind: "turn-based-duel",
        referenceId: "missing-parallel-session",
        createdAt: leaseStartedAt,
        updatedAt: leaseStartedAt
      }
    });
    const competingRepository = new PrismaDuelChallengeRepository(prisma);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repairs = await Promise.all([
      repository.repairTurnBasedCombatState(cleanupAt),
      competingRepository.repairTurnBasedCombatState(cleanupAt)
    ]);
    warn.mockRestore();

    expect(repairs.reduce((sum, repair) => sum + repair.removedOrphanLeases, 0)).toBe(1);
    await expect(prisma.activeCombatLease.count({ where: { characterId } })).resolves.toBe(0);
    const cooldown = await prisma.characterCooldown.findUniqueOrThrow({
      where: { characterId_key: { characterId, key: VARENYK_SATED_STATUS_KEY } }
    });
    expect((cooldown.resultJson as { cursorAt: string }).cursorAt)
      .toBe("2026-06-17T20:00:30.000Z");
  });

  it("repairs active sessions whose acting participant or optional state blocks are malformed", async () => {
    const badActor = await seedActiveSession("repair-actor", new Date("2026-06-17T18:00:23.000Z"));
    await prisma.duelCombatSession.update({
      where: { id: badActor.id },
      data: {
        stateJson: {
          ...badActor.state,
          actingCharacterId: "char-not-in-this-duel"
        }
      }
    });
    const badOptional = await seedActiveSession("repair-optional", new Date("2026-06-17T18:00:23.000Z"));
    await prisma.duelCombatSession.update({
      where: { id: badOptional.id },
      data: {
        stateJson: {
          ...badOptional.state,
          pendingActions: {
            challenger: {
              actorCharacterId: badOptional.challengerCharacterId,
              action: "dance"
            }
          }
        }
      }
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repaired = await repository.repairTurnBasedCombatState(new Date("2026-06-17T18:02:00.000Z"));
    const repeated = await repository.repairTurnBasedCombatState(new Date("2026-06-17T18:03:00.000Z"));
    warn.mockRestore();

    expect(repaired.repairedSessions).toBe(2);
    expect(repeated.repairedSessions).toBe(0);
    await expect(prisma.duelCombatSession.count({
      where: {
        id: {
          in: [badActor.id, badOptional.id]
        },
        status: "expired"
      }
    })).resolves.toBe(2);
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        referenceId: {
          in: [badActor.id, badOptional.id]
        }
      }
    })).resolves.toBe(0);
  });

  async function seedPendingChallenge(token: string) {
    const tokenId = [...token].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const challenger = await seedCharacter(`char-a-${token}`, BigInt(30_000 + tokenId));
    const target = await seedCharacter(`char-b-${token}`, BigInt(40_000 + tokenId));
    const state = makeState(challenger.id, target.id);

    await prisma.duelChallenge.create({
      data: {
        inviteToken: token,
        challengerCharacterId: challenger.id,
        targetCharacterId: target.id,
        mode: "turn-based",
        status: "pending",
        expiresAt: new Date("2026-06-17T18:13:00.000Z")
      }
    });

    return { challenger, target, state };
  }

  async function seedActiveSession(token: string, turnExpiresAt: Date) {
    const tokenId = [...token].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const challenger = await seedCharacter(`char-a-${token}`, BigInt(10_000 + tokenId));
    const target = await seedCharacter(`char-b-${token}`, BigInt(20_000 + tokenId));
    const state = makeState(challenger.id, target.id);
    const challenge = await prisma.duelChallenge.create({
      data: {
        inviteToken: token,
        challengerCharacterId: challenger.id,
        targetCharacterId: target.id,
        mode: "turn-based",
        status: "active",
        expiresAt: new Date("2026-06-17T18:13:00.000Z")
      }
    });
    const session = await prisma.duelCombatSession.create({
      data: {
        id: `session-${token}`,
        duelChallengeId: challenge.id,
        challengerCharacterId: challenger.id,
        targetCharacterId: target.id,
        status: "active",
        actingCharacterId: state.actingCharacterId,
        stateJson: state,
        turn: 1,
        version: 1,
        turnExpiresAt
      }
    });
    await prisma.activeCombatLease.createMany({
      data: [
        { characterId: challenger.id, kind: "turn-based-duel", referenceId: session.id },
        { characterId: target.id, kind: "turn-based-duel", referenceId: session.id }
      ]
    });

    const record = await repository.findTurnBasedByToken(token);
    if (!record) {
      throw new Error("Expected seeded session to map.");
    }
    return record;
  }

  async function seedCharacter(id: string, telegramUserId: bigint) {
    const user = await prisma.user.create({
      data: {
        telegramUserId
      }
    });

    const character = await prisma.character.create({
      data: {
        id,
        userId: user.id,
        name: id,
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 3,
        xp: 25,
        hpCurrent: 24,
        hpMax: 24,
        manaCurrent: 12,
        manaMax: 12,
        statsJson: {
          strength: 7,
          dexterity: 7,
          intelligence: 6,
          charisma: 6,
          luck: 6
        }
      }
    });

    return { ...character, telegramUserId };
  }
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
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      remort_number INTEGER NOT NULL,
      from_level INTEGER NOT NULL,
      from_xp INTEGER NOT NULL,
      preserved_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    `CREATE TABLE duel_challenges (
      id TEXT PRIMARY KEY,
      challenger_character_id TEXT NOT NULL,
      target_character_id TEXT,
      context_chat_id INTEGER,
      invite_token TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL DEFAULT 'quick',
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at DATETIME NOT NULL,
      resolved_at DATETIME,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE duel_combat_sessions (
      id TEXT PRIMARY KEY,
      duel_challenge_id TEXT NOT NULL UNIQUE,
      challenger_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      acting_character_id TEXT NOT NULL,
      state_json JSONB NOT NULL,
      turn INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      turn_expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      challenger_chat_id INTEGER,
      challenger_message_id INTEGER,
      target_chat_id INTEGER,
      target_message_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE duel_combat_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      actor_character_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      action_key TEXT NOT NULL,
      result_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, turn)
    )`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      available_at DATETIME NOT NULL,
      result_json JSONB,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, key)
    )`,
    `CREATE TABLE daily_actions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      local_date TEXT NOT NULL,
      reward_xp INTEGER NOT NULL,
      reward_gold INTEGER NOT NULL,
      spent_gold INTEGER NOT NULL DEFAULT 0,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(character_id, key, local_date)
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}

function makeState(challengerId: string, targetId: string): TurnBasedDuelState {
  const state = startTurnBasedDuel({
    challenger: makeDuelist(challengerId),
    target: makeDuelist(targetId),
    rng: new FakeRandomSource([0.99, 0])
  });
  state.actingCharacterId = challengerId;
  return state;
}

function makeTerminalState(
  state: TurnBasedDuelState,
  outcome: "challenger" | "target" | "draw",
  reason: NonNullable<DuelResultPayload["terminalReason"]>
): TurnBasedDuelState {
  const next = JSON.parse(JSON.stringify(state)) as TurnBasedDuelState;
  const winnerCharacterId =
    outcome === "challenger"
      ? next.participants.challenger.characterId
      : outcome === "target"
        ? next.participants.target.characterId
        : null;
  const loserCharacterId =
    outcome === "challenger"
      ? next.participants.target.characterId
      : outcome === "target"
        ? next.participants.challenger.characterId
        : null;

  delete next.pendingActions;
  next.status = reason === "surrender"
    ? "forfeited"
    : reason === "expired"
      ? "expired"
      : "resolved";
  next.outcome = {
    outcome,
    winnerCharacterId,
    loserCharacterId,
    reason
  };
  next.lastRound = {
    turn: next.turn,
    actions: []
  };

  return next;
}

function makeTerminalResult(
  session: DuelCombatSessionRecord,
  outcome: "challenger" | "target" | "draw",
  reason: NonNullable<DuelResultPayload["terminalReason"]>,
  xpRewards: NonNullable<DuelResultPayload["xpRewards"]>
): DuelResultPayload {
  const winnerCharacterId =
    outcome === "challenger"
      ? session.challengerCharacterId
      : outcome === "target"
        ? session.targetCharacterId
        : null;
  const loserCharacterId =
    outcome === "challenger"
      ? session.targetCharacterId
      : outcome === "target"
        ? session.challengerCharacterId
        : null;

  return {
    mode: "turn-based",
    rulesVersion: session.state.rulesVersion,
    balanceVersion: session.state.balanceVersion,
    terminalReason: reason,
    xpRewards,
    outcome,
    winnerCharacterId,
    loserCharacterId,
    challengerScore: outcome === "challenger" ? 1 : 0,
    targetScore: outcome === "target" ? 1 : 0,
    swing: 0,
    flavorKey: "integration-test"
  };
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
      actorTelegramUserId: "999001",
      targetTelegramUserId: "999001",
      actorName: "Пан Вареник",
      targetName: "Пан Вареник",
      immediateHpRestored: 0,
      immediateManaRestored: 0,
      actorManaAfter: 12,
      targetHpAfter: 24,
      targetManaAfter: 12
    }
  };
}

function makeDuelist(id: string, overrides: Partial<DuelistSummary> = {}): DuelistSummary {
  return {
    id,
    name: id,
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Тестовий",
    level: 3,
    xp: 25,
    nextLevelXp: 45,
    xpToNextLevel: 20,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    stats: {
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    levelBonus: {
      hpMax: 8,
      manaMax: 4,
      stats: {
        strength: 2,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      }
    },
    ...overrides
  };
}

class CountingRandomSource implements RandomSource {
  private readonly delegate: FakeRandomSource;
  calls = 0;

  constructor(values: readonly number[]) {
    this.delegate = new FakeRandomSource(values);
  }

  nextFloat(): number {
    this.calls += 1;
    return this.delegate.nextFloat();
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    this.calls += 1;
    return minInclusive + Math.floor(
      this.delegate.nextFloat() * (maxInclusive - minInclusive + 1)
    );
  }
}
