import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PrismaSoloCombatSessionRepository } from "../../src/db/repositories/prismaSoloCombatSessionRepository";
import {
  resolveCombatTurn,
  type CombatActorStats,
  type CombatState,
  type MonsterCombatStats
} from "../../src/domain/combat";
import { FakeRandomSource } from "../../src/shared/random";

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
      message: {
        chatId: "42",
        messageId: 587
      },
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
    expect(mapped?.state?.message).toEqual({
      chatId: "42",
      messageId: 587
    });
  });

  it("round-trips current runtime combat state fields from stored JSON", async () => {
    const state = runtimeRoundTripState();
    const repository = new PrismaSoloCombatSessionRepository({
      soloCombatSession: {
        findFirst: () => Promise.resolve(makeSoloCombatRow(state))
      }
    } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0]);

    const mapped = await repository.findByIdForTelegramUserId(42n, "session-round-trip");

    expect(mapped?.state).toMatchObject({
      id: "session-round-trip",
      originLocationId: "location.korchma.deep.level1",
      guard: {
        consecutiveDefends: 2
      },
      timeout: {
        consecutiveMissedTurns: 1,
        lastMissedAt: "2026-06-20T00:00:24.000Z"
      },
      cooldowns: {
        abilities: {
          "skill.forceful-strike": {
            id: "skill.forceful-strike",
            remainingTurns: 1
          }
        },
        skill: {
          id: "skill.forceful-strike",
          remainingTurns: 1
        }
      },
      drinkModifiers: {
        drinkKey: "drink.fine-beer",
        sourceId: "drink-state.beer",
        accuracyPenaltyPp: 10
      },
      monsterRuntime: {
        loadoutIds: ["monster.deadline-web"],
        lastHeroAction: "attack",
        lastDirectHeroDamage: 7,
        expiredEffects: [{
          target: "hero",
          kind: "bleed",
          value: 0.22,
          remainingTargetActivations: 2
        }],
        cooldowns: {
          "monster.deadline-web": {
            remainingOwnActions: 2
          }
        },
        pendingTelegraph: {
          abilityId: "monster.tax-breath"
        },
        shield: {
          points: 4
        },
        effects: [{
          kind: "ability-lock",
          remainingTargetActivations: 1
        }, {
          kind: "counter",
          sourceAbilityId: "monster.salted-oath",
          value: 0.25,
          trigger: "on-hero-damaged-monster",
          triggerId: "monster.salted-oath:counterChance:on-hero-damaged-monster",
          remainingOwnActivations: 2,
          charges: 1
        }]
      },
      monster: {
        copiedEquipment: [{
          sourceItemId: "item.borrowed-pan",
          name: "Позичена пательня",
          slot: "weapon",
          effectKeys: ["weaponDamage"]
        }],
        debugTrace: {
          source: "target",
          copiedEquipmentCount: 1,
          appliedEffectKeys: ["weaponDamage"],
          legalAbilityIds: ["skill.forceful-strike"],
          chosenAbilityId: "skill.forceful-strike",
          baseMonsterLevel: 2,
          effectiveMonsterLevel: 3
        }
      },
      lastTurn: {
        action: "skip",
        heroOutcome: "inactive",
        monsterOutcome: "hit",
        monsterAction: "skill",
        monsterSkillId: "monster.deadline-web",
        monsterDamageKind: "trick",
        monsterEffectText: "мана просіла на 1",
        monsterTelegraphAbilityId: "monster.tax-breath",
        monsterBarkId: "bark.deadline-spider.early-turn",
        debugTrace: {
          chosenAbilityId: "skill.forceful-strike",
          legalAbilityIds: ["skill.forceful-strike"],
          timeoutMode: "skip"
        }
      }
    });
  });

  it("keeps legacy combat JSON with cooldowns.skill readable", async () => {
    const state: CombatState = {
      ...activeCombatState,
      cooldowns: {
        skill: {
          id: "skill.forceful-strike",
          remainingTurns: 1
        }
      }
    };
    const repository = new PrismaSoloCombatSessionRepository({
      soloCombatSession: {
        findFirst: () => Promise.resolve(makeSoloCombatRow(state))
      }
    } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0]);

    const mapped = await repository.findByIdForTelegramUserId(42n, "missing-session");

    expect(mapped?.state?.cooldowns).toEqual({
      abilities: {
        "skill.forceful-strike": {
          id: "skill.forceful-strike",
          remainingTurns: 1
        }
      },
      skill: {
        id: "skill.forceful-strike",
        remainingTurns: 1
      }
    });
  });

  it("maps updateByIdIfActiveTurn results without dropping current runtime fields", async () => {
    const state = runtimeRoundTripState();
    const repository = new PrismaSoloCombatSessionRepository({
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          soloCombatSession: {
            updateMany: () => Promise.resolve({ count: 1 }),
            findUnique: () => Promise.resolve(makeSoloCombatRow(state))
          },
          activeCombatLease: {
            deleteMany: () => Promise.resolve({ count: 0 })
          }
        })
    } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0]);

    const mapped = await repository.updateByIdIfActiveTurn("session-round-trip", 3, {
      state,
      status: "active"
    });

    expect(mapped?.state?.originLocationId).toBe("location.korchma.deep.level1");
    expect(mapped?.state?.life).toEqual({
      characterId: "character-42",
      remortCount: 1,
      startedAt: "2026-06-20T00:00:00.000Z"
    });
    expect(mapped?.state?.settlement).toEqual({
      status: "pending",
      version: 1
    });
    expect(mapped?.state?.guard).toEqual({ consecutiveDefends: 2 });
    expect(mapped?.state?.timeout).toEqual({
      consecutiveMissedTurns: 1,
      lastMissedAt: "2026-06-20T00:00:24.000Z"
    });
    expect(mapped?.state?.lastTurn?.action).toBe("skip");
    expect(mapped?.state?.lastTurn?.actionOrigin).toBe("timeout-skip");
    expect(mapped?.state?.lastTurn?.debugTrace?.chosenAbilityId).toBe("skill.forceful-strike");
    expect(mapped?.state?.turnLog?.[0]).toMatchObject({
      eventId: "turn:3:timeout-skip",
      turn: 3,
      summary: {
        action: "skip",
        actionOrigin: "timeout-skip"
      },
      hero: {
        hp: 17,
        mana: 9
      },
      monster: {
        hp: 21
      }
    });
    expect(mapped?.state?.monster.copiedEquipment?.[0]?.sourceItemId).toBe("item.borrowed-pan");
    expect(mapped?.state?.monster.debugTrace?.copiedEquipmentCount).toBe(1);
  });

  it("preserves a reloaded defend streak so the next persistent turn uses the second fatigue tier", async () => {
    const state: CombatState = {
      ...activeCombatState,
      guard: {
        consecutiveDefends: 1
      },
      monster: {
        ...activeCombatState.monster,
        hp: 30,
        hpMax: 30
      }
    };
    const repository = new PrismaSoloCombatSessionRepository({
      soloCombatSession: {
        findFirst: () => Promise.resolve(makeSoloCombatRow(state))
      }
    } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0]);

    const mapped = await repository.findByIdForTelegramUserId(42n, "missing-session");
    const result = resolveCombatTurn({
      state: mapped?.state ?? state,
      action: "defend",
      hero: combatHero,
      monster: combatMonster,
      rng: new FakeRandomSource([0.1, 0.5, 0.99])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected reloaded defend to resolve.");
    }
    expect(result.state.guard).toEqual({ consecutiveDefends: 2 });
    expect(result.summary.monsterDamage).toBe(7);
  });

  it("lists due active sessions with telegram ids for the combat scheduler", async () => {
    const dueState: CombatState = {
      ...activeCombatState,
      turnExpiresAt: "2026-06-20T00:00:23.000Z",
      message: {
        chatId: "42",
        messageId: 587
      }
    };
    const futureState: CombatState = {
      ...activeCombatState,
      id: "future-session",
      turnExpiresAt: "2026-06-20T00:00:46.000Z"
    };
    const repository = new PrismaSoloCombatSessionRepository({
      soloCombatSession: {
        findMany: () => Promise.resolve([
          makeSoloCombatRow(dueState, { telegramUserId: 42n }),
          makeSoloCombatRow(futureState, { telegramUserId: 99n })
        ])
      }
    } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0]);

    const due = await repository.listDueActiveSessions(new Date("2026-06-20T00:00:24.000Z"), {
      limit: 1
    });

    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      id: "missing-session",
      telegramUserId: 42n,
      state: {
        message: {
          chatId: "42",
          messageId: 587
        }
      }
    });
  });

  it("paginates due discovery so legacy, future, and other-kind rows do not starve due fights", async () => {
    const records = [
      ...Array.from({ length: 110 }, (_, index) =>
        makeSoloCombatRow({
          ...activeCombatState,
          id: `legacy-${index}`
        }, {
          telegramUserId: BigInt(1000 + index),
          updatedAt: new Date(`2026-06-20T00:00:${String(index % 60).padStart(2, "0")}.000Z`)
        })
      ),
      makeSoloCombatRow({
        ...activeCombatState,
        id: "future-session",
        turnExpiresAt: "2026-06-20T00:05:00.000Z"
      }, {
        telegramUserId: 5000n,
        updatedAt: new Date("2026-06-20T00:01:51.000Z")
      }),
      makeSoloCombatRow({
        ...activeCombatState,
        id: "training-due",
        turnExpiresAt: "2026-06-20T00:00:23.000Z"
      }, {
        monsterId: "monster.training-doppelganger",
        telegramUserId: 5001n,
        updatedAt: new Date("2026-06-20T00:01:52.000Z")
      }),
      makeSoloCombatRow({
        ...activeCombatState,
        id: "solo-due",
        turnExpiresAt: "2026-06-20T00:00:23.000Z"
      }, {
        telegramUserId: 42n,
        updatedAt: new Date("2026-06-20T00:01:53.000Z")
      })
    ].sort((left, right) =>
      left.updatedAt.getTime() - right.updatedAt.getTime() ||
      left.id.localeCompare(right.id)
    );
    const findManyInputs: Array<{ skip?: number; take?: number }> = [];
    const repository = new PrismaSoloCombatSessionRepository({
      soloCombatSession: {
        findMany: (input: { skip?: number; take?: number; where?: { monsterId?: { notIn?: string[] } } }) => {
          findManyInputs.push(input);
          const excluded = new Set(input.where?.monsterId?.notIn ?? []);
          const filtered = records.filter((record) => !excluded.has(record.monsterId));

          return Promise.resolve(filtered.slice(input.skip ?? 0, (input.skip ?? 0) + (input.take ?? filtered.length)));
        }
      }
    } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0]);

    const due = await repository.listDueActiveSessions(new Date("2026-06-20T00:02:00.000Z"), {
      limit: 1,
      excludeMonsterIds: ["monster.training-doppelganger"]
    });

    expect(findManyInputs.length).toBeGreaterThan(1);
    expect(due).toHaveLength(1);
    expect(due[0]?.id).toBe("solo-due");
    expect(due[0]?.telegramUserId).toBe(42n);
  });

  it("counts won sessions after the issue timestamp while excluding training monsters", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaSoloCombatSessionRepository({
      soloCombatSession: {
        findMany: (input: unknown) => {
          calls.push(input);
          return Promise.resolve([
            { stateJson: { ...activeCombatState, status: "won", settlement: { status: "completed", version: 1 } } },
            { stateJson: { ...activeCombatState, status: "won" } },
            { stateJson: { ...activeCombatState, status: "won", settlement: { status: "pending", version: 1 } } },
            { stateJson: { ...activeCombatState, status: "won", settlement: { status: "forfeited-by-remort", version: 1 } } }
          ]);
        }
      }
    } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0]);
    const since = new Date("2026-06-12T10:00:00.000Z");

    await expect(
      repository.countWonByTelegramUserId(42n, {
        excludeMonsterIds: ["monster.training-doppelganger"],
        since
      })
    ).resolves.toBe(2);

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
      },
      select: {
        stateJson: true
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

function makeSoloCombatRow(
  state: CombatState,
  options: { telegramUserId?: bigint; monsterId?: string; updatedAt?: Date; expiresAt?: Date } = {}
) {
  return {
    id: state.id ?? "session-context",
    characterId: "character-42",
    monsterId: options.monsterId ?? "monster.deadline-spider",
    status: "active",
    turn: state.turn,
    stateJson: state,
    rewardXp: null,
    rewardGold: null,
    rewardItemsJson: null,
    rewardClaimedAt: null,
    createdAt: new Date("2026-06-20T00:00:00.000Z"),
    updatedAt: options.updatedAt ?? new Date("2026-06-20T00:00:01.000Z"),
    expiresAt: options.expiresAt ?? new Date("2026-06-20T00:10:00.000Z"),
    ...(options.telegramUserId
      ? {
          character: {
            user: {
              telegramUserId: options.telegramUserId
            }
          }
        }
      : {})
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

const combatHero: CombatActorStats = {
  level: 3,
  hpMax: 40,
  manaMax: 10,
  strength: 9,
  dexterity: 7,
  intelligence: 5,
  charisma: 5,
  luck: 6,
  classId: "class.warrior",
  armor: 0,
  resist: 0,
  weaponDamage: 2
};

const combatMonster: MonsterCombatStats = {
  monsterId: "monster.deadline-spider",
  level: 2,
  hpMax: 30,
  attack: 10,
  armor: 1,
  resist: 1,
  dexterity: 6,
  tags: ["beast", "time", "web"]
};

function runtimeRoundTripState(): CombatState {
  return {
    ...activeCombatState,
    id: "session-round-trip",
    originLocationId: "location.korchma.deep.level1",
    life: {
      characterId: "character-42",
      remortCount: 1,
      startedAt: "2026-06-20T00:00:00.000Z"
    },
    settlement: {
      status: "pending",
      version: 1
    },
    turn: 3,
      guard: {
        consecutiveDefends: 2
      },
      timeout: {
        consecutiveMissedTurns: 1,
        lastMissedAt: "2026-06-20T00:00:24.000Z"
      },
      cooldowns: {
      abilities: {
        "skill.forceful-strike": {
          id: "skill.forceful-strike",
          remainingTurns: 1
        }
      },
      skill: {
        id: "skill.forceful-strike",
        remainingTurns: 1
      }
    },
    drinkModifiers: {
      drinkKey: "drink.fine-beer",
      sourceId: "drink-state.beer",
      accuracyPenaltyPp: 10
    },
    monster: {
      ...activeCombatState.monster,
      level: 2,
      attack: 10,
      armor: 1,
      resist: 1,
      dexterity: 6,
      spellPower: 0,
      copiedEquipment: [{
        sourceItemId: "item.borrowed-pan",
        name: "Позичена пательня",
        slot: "weapon",
        effectKeys: ["weaponDamage"]
      }],
      debugTrace: {
        source: "target",
        copiedEquipmentCount: 1,
        appliedEffectKeys: ["weaponDamage"],
        legalAbilityIds: ["skill.forceful-strike"],
        chosenAbilityId: "skill.forceful-strike",
        baseMonsterLevel: 2,
        effectiveMonsterLevel: 3
      }
    },
    monsterRuntime: {
      version: 1,
      rulesVersion: "monster-abilities-v1",
      aiProfile: "controller",
      loadoutIds: ["monster.deadline-web"],
      cooldowns: {
        "monster.deadline-web": {
          id: "monster.deadline-web",
          remainingOwnActions: 2
        }
      },
      onceUsedAbilityIds: ["monster.reopen-case"],
      lastActionKind: "ability",
      lastAbilityId: "monster.deadline-web",
      consecutiveAbilityUses: 1,
      pendingTelegraph: {
        abilityId: "monster.tax-breath",
        announcedAtTurn: 2
      },
      shield: {
        sourceAbilityId: "monster.transparent-report",
        points: 4
      },
      effects: [
        {
          id: "monster.deadline-web:1:0",
          sourceAbilityId: "monster.deadline-web",
          target: "hero",
          kind: "ability-lock",
          value: 1,
          remainingTargetActivations: 1,
          charges: 1
        },
        {
          id: "monster.salted-oath:1:1",
          sourceAbilityId: "monster.salted-oath",
          target: "monster",
          kind: "counter",
          value: 0.25,
          trigger: "on-hero-damaged-monster",
          triggerId: "monster.salted-oath:counterChance:on-hero-damaged-monster",
          remainingOwnActivations: 2,
          charges: 1
        }
      ],
      expiredEffectIds: ["monster.old-effect"],
      expiredEffects: [{
        target: "hero",
        kind: "bleed",
        value: 0.22,
        remainingTargetActivations: 2
      }],
      lastHeroAction: "attack",
      lastDirectHeroDamage: 7,
      ownActionCount: 1
    },
    lastTurn: {
      action: "skip",
      actionOrigin: "timeout-skip",
      heroOutcome: "inactive",
      monsterOutcome: "hit",
      heroDamage: 0,
      monsterDamage: 7,
      manaSpent: 0,
      critical: false,
      monsterAction: "skill",
      monsterSkillId: "monster.deadline-web",
      monsterDamageKind: "trick",
      monsterEffectText: "мана просіла на 1",
      monsterTelegraphAbilityId: "monster.tax-breath",
      monsterBarkId: "bark.deadline-spider.early-turn",
      debugTrace: {
        legalAbilityIds: ["skill.forceful-strike"],
        chosenAbilityId: "skill.forceful-strike",
        timeoutMode: "skip"
      }
    },
    turnLog: [{
      eventId: "turn:3:timeout-skip",
      turn: 3,
      summary: {
        action: "skip",
        actionOrigin: "timeout-skip",
        heroOutcome: "inactive",
        monsterOutcome: "hit",
        heroDamage: 0,
        monsterDamage: 7,
        manaSpent: 0,
        critical: false
      },
      hero: {
        hp: 17,
        mana: 9
      },
      monster: {
        hp: 21
      }
    }]
  };
}
