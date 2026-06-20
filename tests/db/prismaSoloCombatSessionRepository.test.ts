import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PrismaSoloCombatSessionRepository } from "../../src/db/repositories/prismaSoloCombatSessionRepository";
import type { CombatState } from "../../src/domain/combat";

describe("PrismaSoloCombatSessionRepository", () => {
  it("returns null when updating a disappeared solo fight row", async () => {
    const repository = new PrismaSoloCombatSessionRepository(
      fakePrismaThatCannotFindSoloCombatRows()
    );

    await expect(
      repository.updateById("missing-session", {
        state: activeCombatState,
        status: "active"
      })
    ).resolves.toBeNull();
  });

  it("returns null when marking a disappeared solo fight row", async () => {
    const repository = new PrismaSoloCombatSessionRepository(
      fakePrismaThatCannotFindSoloCombatRows()
    );

    await expect(repository.markStatusById("missing-session", "expired")).resolves.toBeNull();
  });

  it("maps persisted context, bark state, and bark summaries from stored JSON", async () => {
    const state: CombatState = {
      ...activeCombatState,
      id: "session-context",
      turn: 2,
      turnExpiresAt: "2026-06-20T00:00:23.000Z",
      context: {
        version: 1,
        rulesVersion: "monster-context-v1",
        monsterId: "monster.deadline-spider",
        traitIds: ["context.night-shift"],
        world: {
          version: 1,
          timezone: "Europe/Kyiv",
          localStartedAt: "2026-06-20T03:00:00[Europe/Kyiv]",
          localDate: "2026-06-20",
          dayPhase: "night",
          weekKind: "weekend",
          season: "summer",
          mealWindow: "none",
          monthEdge: "middle",
          calendarDay: 20,
          partySizeBand: "solo",
          locationTags: ["korchma", "nyz"]
        },
        matchedBranches: [{
          traitId: "context.night-shift",
          branchId: "night",
          tone: "advantage"
        }],
        effects: {
          outgoingDamageMultiplier: 1.08,
          incomingDamageMultiplier: 1,
          accuracyDeltaPp: 2,
          evasionDeltaPp: 0,
          abilityWeightDelta: 0,
          signatureCooldownDelta: 0,
          flatArmorDelta: 0,
          flatResistDelta: 0,
          flatDexterityDelta: 1
        },
        cue: {
          id: "context-cue.test",
          text: "Ніч теж має бухгалтерію.",
          tone: "advantage"
        }
      },
      barks: {
        version: 1,
        rulesVersion: "monster-barks-v1",
        audience: "solo",
        selectedEarlyBarkByMonsterId: {
          "monster.deadline-spider": "bark.deadline-spider.early-turn"
        },
        emittedBarkIds: ["bark.deadline-spider.early-turn"],
        lastBarkOwnActionByMonsterId: {
          "monster.deadline-spider": 1
        },
        encounterBarkCountByMonsterId: {
          "monster.deadline-spider": 1
        },
        ownActionCountByMonsterId: {
          "monster.deadline-spider": 1
        }
      },
      monster: {
        ...activeCombatState.monster,
        contextModifiers: {
          outgoingDamageMultiplier: 1.08,
          incomingDamageMultiplier: 1,
          accuracyDeltaPp: 2,
          evasionDeltaPp: 0,
          abilityWeightDelta: 0,
          signatureCooldownDelta: 0,
          flatArmorDelta: 0,
          flatResistDelta: 0,
          flatDexterityDelta: 1
        }
      },
      lastTurn: {
        action: "attack",
        heroOutcome: "hit",
        heroDamage: 5,
        monsterOutcome: "hit",
        monsterDamage: 2,
        manaSpent: 0,
        critical: false,
        monsterBarkId: "bark.deadline-spider.early-turn"
      }
    };
    const repository = new PrismaSoloCombatSessionRepository({
      soloCombatSession: {
        findFirst: () => Promise.resolve(makeSoloCombatRow(state))
      }
    } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0]);

    const mapped = await repository.findByIdForTelegramUserId(42n, "session-context");

    expect(mapped?.state?.context).toMatchObject({
      rulesVersion: "monster-context-v1",
      world: {
        localDate: "2026-06-20",
        dayPhase: "night"
      }
    });
    expect(mapped?.state?.barks).toMatchObject({
      rulesVersion: "monster-barks-v1",
      emittedBarkIds: ["bark.deadline-spider.early-turn"]
    });
    expect(mapped?.state?.lastTurn?.monsterBarkId).toBe("bark.deadline-spider.early-turn");
    expect(mapped?.state?.monster.contextModifiers?.outgoingDamageMultiplier).toBe(1.08);
  });

  it("counts won sessions after the issue timestamp while excluding training monsters", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaSoloCombatSessionRepository({
      soloCombatSession: {
        count: (input: unknown) => {
          calls.push(input);
          return Promise.resolve(23);
        }
      }
    } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0]);
    const since = new Date("2026-06-12T10:00:00.000Z");

    await expect(
      repository.countWonByTelegramUserId(42n, {
        excludeMonsterIds: ["monster.training-doppelganger"],
        since
      })
    ).resolves.toBe(23);

    expect(calls[0]).toEqual({
      where: {
        status: "won",
        createdAt: {
          gt: since
        },
        monsterId: {
          notIn: ["monster.training-doppelganger"]
        },
        character: {
          user: {
            telegramUserId: 42n
          }
        }
      }
    });
  });
});

function fakePrismaThatCannotFindSoloCombatRows(): ConstructorParameters<
  typeof PrismaSoloCombatSessionRepository
>[0] {
  return {
    soloCombatSession: {
      update: () => Promise.reject(prismaNotFoundError())
    }
  } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0];
}

function prismaNotFoundError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Record not found", {
    code: "P2025",
    clientVersion: "test"
  });
}

function makeSoloCombatRow(state: CombatState) {
  return {
    id: "session-context",
    characterId: "character-42",
    monsterId: "monster.deadline-spider",
    status: "active",
    turn: state.turn,
    stateJson: state,
    rewardXp: null,
    rewardGold: null,
    rewardItemsJson: null,
    rewardClaimedAt: null,
    createdAt: new Date("2026-06-20T00:00:00.000Z"),
    updatedAt: new Date("2026-06-20T00:00:01.000Z"),
    expiresAt: new Date("2026-06-20T00:10:00.000Z")
  };
}

const activeCombatState: CombatState = {
  id: "missing-session",
  turn: 1,
  status: "active",
  hero: {
    hp: 20,
    hpMax: 20,
    mana: 10,
    manaMax: 10
  },
  monster: {
    id: "monster.deadline-spider",
    hp: 18,
    hpMax: 18
  }
};
