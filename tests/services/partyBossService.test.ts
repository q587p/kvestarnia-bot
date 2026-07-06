import { describe, expect, it, vi } from "vitest";
import type {
  PartyBossActionResult,
  PartyBossRepository,
  PartyBossSessionRecord
} from "../../src/db/repositories/partyBossRepository";
import type { InventoryRepository } from "../../src/db/repositories/inventoryRepository";
import { BIG_BARREL_BROTHER_BOSS_KEY, BIG_BARREL_BROTHER_RULES_VERSION } from "../../src/domain/partyBoss/partyBoss";
import type { PublicActivityEventPublisher } from "../../src/services/publicActivityEventPublisher";
import type { AchievementService } from "../../src/services/achievementService";
import type { BarrelBeerTutorialService } from "../../src/services/barrelBeerTutorialService";
import { getCombatItemUseKey } from "../../src/services/combatItemUse";
import { PartyBossService } from "../../src/services/partyBossService";

describe("PartyBossService achievements", () => {
  it("tracks exact Big Barrel Brother settlement achievement events from the repository", async () => {
    const occurredAt = new Date("2026-07-01T19:00:00.000Z");
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([]);
    const result: PartyBossActionResult = {
      state: "resolved",
      session: makeSession("won"),
      achievementEvents: [
        {
          type: "barrel.raid.claimed",
          characterId: "character-leader",
          sourceId: "daily-win-1",
          occurredAt
        },
        {
          type: "barrel.raid.lost",
          characterId: "character-joiner",
          sourceId: "boss-session-1",
          occurredAt
        },
        {
          type: "barrel.raid.bandage-used",
          characterId: "character-healer",
          sourceId: "boss-action-1",
          occurredAt
        },
        {
          type: "item.used",
          characterId: "character-field-kit",
          itemId: "item.field-kit",
          sourceId: "boss-action-2",
          occurredAt
        }
      ]
    };
    const repository = {
      submitActionForTelegramUser: vi.fn<PartyBossRepository["submitActionForTelegramUser"]>().mockResolvedValue(result)
    } as unknown as PartyBossRepository;
    const service = new PartyBossService(
      repository,
      { enabled: true },
      () => occurredAt,
      { trackEventSafely } as unknown as AchievementService
    );

    await service.submitActionForTelegramUser(123n, "token-1", 1, "attack");

    expect(trackEventSafely).toHaveBeenCalledTimes(4);
    expect(trackEventSafely).toHaveBeenNthCalledWith(1, {
      type: "barrel.raid.claimed",
      characterId: "character-leader",
      occurredAt,
      sourceId: "daily-win-1"
    });
    expect(trackEventSafely).toHaveBeenNthCalledWith(2, {
      type: "barrel.raid.lost",
      characterId: "character-joiner",
      occurredAt,
      sourceId: "boss-session-1"
    });
    expect(trackEventSafely).toHaveBeenNthCalledWith(3, {
      type: "barrel.raid.bandage-used",
      characterId: "character-healer",
      occurredAt,
      sourceId: "boss-action-1"
    });
    expect(trackEventSafely).toHaveBeenNthCalledWith(4, {
      type: "item.used",
      characterId: "character-field-kit",
      itemId: "item.field-kit",
      occurredAt,
      sourceId: "boss-action-2"
    });
  });

  it("passes field kits through the party-boss combat item path", async () => {
    const occurredAt = new Date("2026-07-01T19:00:00.000Z");
    const result: PartyBossActionResult = {
      state: "queued",
      session: makeSession("active")
    };
    const submitItemForTelegramUser =
      vi.fn<PartyBossRepository["submitItemForTelegramUser"]>().mockResolvedValue(result);
    const repository = {
      submitItemForTelegramUser
    } as unknown as PartyBossRepository;
    const service = new PartyBossService(repository, { enabled: true }, () => occurredAt);

    await service.submitItemForTelegramUser(123n, "token-1", 1, getCombatItemUseKey("item.field-kit"));

    expect(submitItemForTelegramUser).toHaveBeenCalledWith(
      123n,
      "token-1",
      1,
      {
        id: "item.field-kit",
        name: "Польова аптечка",
        effect: {
          kind: "heal-hp-to-min-percent",
          percent: 93
        }
      },
      {
        now: occurredAt,
        nextTurnExpiresAt: new Date("2026-07-01T19:00:23.000Z")
      }
    );
  });

  it("lists owned useful one-use combat items for the active party boss participant", async () => {
    const occurredAt = new Date("2026-07-01T19:00:00.000Z");
    const session = makeSessionWithParticipant("active", {
      participant: {
        resources: {
          hp: 10,
          hpMax: 25,
          mana: 10,
          manaMax: 10
        },
        combatItems: {
          cooldowns: {
            "item.dense-bandage": {
              itemId: "item.dense-bandage",
              remainingTurns: 2
            }
          }
        }
      }
    });
    const repository = {
      findByPartyInviteToken: vi.fn<PartyBossRepository["findByPartyInviteToken"]>().mockResolvedValue(session)
    } as unknown as PartyBossRepository;
    const listByTelegramUserId = vi.fn<InventoryRepository["listByTelegramUserId"]>().mockResolvedValue([
      makeInventoryItem("character-leader", "item.responsible-panic-bandage", 3),
      makeInventoryItem("character-leader", "item.dense-bandage", 1),
      makeInventoryItem("character-leader", "item.field-kit", 1),
      makeInventoryItem("character-other", "item.responsible-panic-bandage", 9),
      makeInventoryItem("character-leader", "item.fake-stone", 1)
    ]);
    const inventory = {
      listByTelegramUserId
    } as unknown as InventoryRepository;
    const service = new PartyBossService(
      repository,
      { enabled: true },
      () => occurredAt,
      undefined,
      undefined,
      inventory
    );

    const result = await service.listCombatItemsForTelegramUser(123n, "token-1", 1);

    expect(listByTelegramUserId).toHaveBeenCalledWith(123n);
    expect(result).toEqual({
      state: "ready",
      session,
      items: [
        {
          itemId: "item.responsible-panic-bandage",
          itemKey: getCombatItemUseKey("item.responsible-panic-bandage"),
          name: "Бинт відповідальної паніки",
          quantity: 3
        },
        {
          itemId: "item.field-kit",
          itemKey: getCombatItemUseKey("item.field-kit"),
          name: "Польова аптечка",
          quantity: 1
        }
      ]
    });
  });

  it("does not track achievements for replay results without fresh settlement events", async () => {
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([]);
    const repository = {
      resolveTimedOutByToken: vi.fn<PartyBossRepository["resolveTimedOutByToken"]>().mockResolvedValue({
        state: "terminal",
        session: makeSession("lost")
      })
    } as unknown as PartyBossRepository;
    const service = new PartyBossService(
      repository,
      { enabled: true },
      () => new Date("2026-07-01T19:00:00.000Z"),
      { trackEventSafely } as unknown as AchievementService
    );

    await service.resolveDueTimedOutByToken("token-1");

    expect(trackEventSafely).not.toHaveBeenCalled();
  });

  it("marks the Barrel beer tutorial route after a fresh remorted Big Barrel Brother win", async () => {
    const occurredAt = new Date("2026-07-01T19:00:00.000Z");
    const session = makeSessionWithParticipant("won", {
      participant: {
        remortCount: 1,
        combatStats: {
          level: 3,
          hpMax: 25,
          manaMax: 10,
          hpCurrent: 25,
          manaCurrent: 10,
          strength: 5,
          dexterity: 5,
          intelligence: 5,
          charisma: 5,
          luck: 5,
          raceId: "race.human-ish",
          classId: "class.warrior"
        }
      },
      record: {
        remortCount: 1,
        level: 3
      }
    });
    const result: PartyBossActionResult = {
      state: "resolved",
      session,
      achievementEvents: [{
        type: "barrel.raid.claimed",
        characterId: "character-leader",
        sourceId: "daily-win-1",
        occurredAt
      }]
    };
    const repository = {
      submitActionForTelegramUser: vi.fn<PartyBossRepository["submitActionForTelegramUser"]>().mockResolvedValue(result)
    } as unknown as PartyBossRepository;
    const barrelBeerTutorial = barrelBeerTutorialProgressService();
    const service = new PartyBossService(
      repository,
      { enabled: true },
      () => occurredAt,
      undefined,
      undefined,
      undefined,
      barrelBeerTutorial
    );

    await service.submitActionForTelegramUser(123n, "token-1", 1, "attack");

    expect(barrelBeerTutorial.markVisitedBarrelForTelegramUser).toHaveBeenCalledWith(123n);
    expect(barrelBeerTutorial.markBarrelRaidCompletedForTelegramUser).toHaveBeenCalledWith(123n);
  });

  it("does not mark the Barrel beer tutorial on Big Barrel terminal replay without a fresh claim event", async () => {
    const session = makeSessionWithParticipant("won", {
      participant: {
        remortCount: 1
      },
      record: {
        remortCount: 1,
        level: 3
      }
    });
    const repository = {
      resolveTimedOutByToken: vi.fn<PartyBossRepository["resolveTimedOutByToken"]>().mockResolvedValue({
        state: "terminal",
        session
      })
    } as unknown as PartyBossRepository;
    const barrelBeerTutorial = barrelBeerTutorialProgressService();
    const service = new PartyBossService(
      repository,
      { enabled: true },
      () => new Date("2026-07-01T19:00:00.000Z"),
      undefined,
      undefined,
      undefined,
      barrelBeerTutorial
    );

    await service.resolveDueTimedOutByToken("token-1");

    expect(barrelBeerTutorial.markVisitedBarrelForTelegramUser).not.toHaveBeenCalled();
    expect(barrelBeerTutorial.markBarrelRaidCompletedForTelegramUser).not.toHaveBeenCalled();
  });

  it("emits one activity row for a terminal Big Barrel Brother victory", async () => {
    const recordPartyRaidWonSafely =
      vi.fn<PublicActivityEventPublisher["recordPartyRaidWonSafely"]>().mockResolvedValue(null);
    const result: PartyBossActionResult = {
      state: "resolved",
      session: makeSession("won")
    };
    const repository = {
      submitActionForTelegramUser: vi.fn<PartyBossRepository["submitActionForTelegramUser"]>().mockResolvedValue(result)
    } as unknown as PartyBossRepository;
    const service = new PartyBossService(
      repository,
      { enabled: true },
      () => new Date("2026-07-01T19:00:00.000Z"),
      undefined,
      { recordPartyRaidWonSafely } as unknown as PublicActivityEventPublisher
    );

    await service.submitActionForTelegramUser(123n, "token-1", 1, "attack");

    expect(recordPartyRaidWonSafely).toHaveBeenCalledTimes(1);
    expect(recordPartyRaidWonSafely).toHaveBeenCalledWith(result.session);
  });
});

function makeSession(status: "active" | "won" | "lost" | "cancelled"): PartyBossSessionRecord {
  const now = new Date("2026-07-01T19:00:00.000Z");

  return {
    id: "boss-session-1",
    partySessionId: "party-session-1",
    partyInviteToken: "token-1",
    leaderCharacterId: "character-leader",
    status,
    turn: 1,
    version: 1,
    rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
    bossKey: BIG_BARREL_BROTHER_BOSS_KEY,
    state: {
      rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
      partySessionId: "party-session-1",
      status,
      turn: 1,
      boss: {
        monsterId: BIG_BARREL_BROTHER_BOSS_KEY,
        name: "Старший Брат Бочки",
        level: 8,
        hp: status === "won" ? 0 : 10,
        hpMax: 10,
        attack: 1,
        armor: 0,
        resist: 0,
        dexterity: 1,
        tags: ["boss", "barrel"]
      },
      participants: [],
      roundLog: [],
      startedAt: now.toISOString(),
      ...(status === "active" ? {} : { completedAt: now.toISOString() })
    },
    result: status === "active"
      ? null
      : {
          status,
          completedAt: now.toISOString(),
          participants: [],
          bossHpAfter: status === "won" ? 0 : 10
        },
    turnExpiresAt: now,
    completedAt: status === "active" ? null : now,
    participants: []
  };
}

function makeSessionWithParticipant(
  status: "active" | "won" | "lost" | "cancelled" = "active",
  overrides: {
    participant?: Partial<PartyBossSessionRecord["state"]["participants"][number]>;
    record?: Partial<PartyBossSessionRecord["participants"][number]>;
  } = {}
): PartyBossSessionRecord {
  const session = makeSession(status);
  const participant: PartyBossSessionRecord["state"]["participants"][number] = {
    characterId: "character-leader",
    name: "Тестова Лідерка",
    remortCount: 0,
    status: "active",
    combatStats: {
      level: 8,
      hpMax: 25,
      manaMax: 10,
      hpCurrent: 25,
      manaCurrent: 10,
      strength: 5,
      dexterity: 5,
      intelligence: 5,
      charisma: 5,
      luck: 5,
      raceId: "race.human-ish",
      classId: "class.warrior"
    },
    resources: {
      hp: 25,
      hpMax: 25,
      mana: 10,
      manaMax: 10
    },
    contribution: {
      submittedActions: 0,
      timeoutActions: 0,
      damageDealt: 0,
      damageTaken: 0
    },
    ...overrides.participant
  };

  return {
    ...session,
    state: {
      ...session.state,
      participants: [participant]
    },
    participants: [
      {
        id: "character-leader",
        userId: "user-leader",
        telegramUserId: 123n,
        currentLocationId: "korchma.board",
        name: "Тестова Лідерка",
        pronoun: "they",
        path: "path.boundary",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 8,
        xp: 0,
        gold: 13,
        hpCurrent: 25,
        hpMax: 25,
        manaCurrent: 10,
        manaMax: 10,
        hpRegenAt: null,
        manaRegenAt: null,
        activeCosmeticTitleGrantId: null,
        statsJson: {},
        remortCount: 0,
        ...overrides.record
      }
    ]
  };
}

function barrelBeerTutorialProgressService(): Pick<
  BarrelBeerTutorialService,
  "markVisitedBarrelForTelegramUser" | "markBarrelRaidCompletedForTelegramUser"
> {
  return {
    markVisitedBarrelForTelegramUser: vi.fn(() => Promise.resolve()),
    markBarrelRaidCompletedForTelegramUser: vi.fn(() => Promise.resolve())
  };
}

function makeInventoryItem(characterId: string, itemId: string, quantity: number) {
  const now = new Date("2026-07-01T19:00:00.000Z");

  return {
    id: `${characterId}:${itemId}`,
    characterId,
    itemId,
    quantity,
    createdAt: now,
    updatedAt: now
  };
}
