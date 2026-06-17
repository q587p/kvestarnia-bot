import { describe, expect, it } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makeAdventureCallbackData } from "../../src/bot/callbacks/adventureCallbackData";
import { makeBestiaryMonsterCallbackData } from "../../src/bot/callbacks/bestiaryCallbackData";
import { makeCellarCallbackData } from "../../src/bot/callbacks/cellarCallbackData";
import { makeDuelNewCallbackData } from "../../src/bot/callbacks/duelCallbackData";
import {
  makeFightCallbackData,
  makeFightTurnCallbackData
} from "../../src/bot/callbacks/fightCallbackData";
import { makeHuntActionCallbackData } from "../../src/bot/callbacks/huntCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { makeRemortConfirmCallbackData } from "../../src/bot/callbacks/remortCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_ADVENTURE_DUEL_CHALLENGE,
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_RAID_FRIDAY_BARREL,
  type MarkPlayerPresenceInput,
  type PresenceGroup
} from "../../src/services/presenceService";

describe("presence middleware", () => {
  it("marks /quest as an action without forcing a location before routing", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("/quest"));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
  });

  it("marks /fight as an action without forcing a quest-table teleport", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("/fight"));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
  });

  it.each(["list", "archive"] as const)(
    "does not pre-mark quest table for outside quest %s callbacks",
    async (action) => {
      const presence = new CapturingPresenceService();
      const bot = createTestBot(presence, questHubReadyServices());
      await bot.init();

      await bot.handleUpdate(callbackUpdate(makeQuestCallbackData(action)));

      expect(presence.marks).toEqual([
        {
          user: {
            telegramUserId: 42n,
            displayName: "Тест"
          }
        }
      ]);
    }
  );

  it.each(["list", "archive"] as const)(
    "marks quest table for inside quest %s callbacks only after handler gates",
    async (action) => {
      const presence = new CapturingPresenceService();
      presence.currentPlace = {
        state: "ready",
        locationId: PRESENCE_LOCATION_KORCHMA_HALL,
        locationName: "Зала корчми",
        insideKorchma: true
      };
      const bot = createTestBot(presence, questHubReadyServices());
      await bot.init();

      await bot.handleUpdate(callbackUpdate(makeQuestCallbackData(action)));

      expect(presence.marks[0]).toEqual({
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      });
      expect(presence.marks[1]).toMatchObject({
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: null
      });
    }
  );

  it("does not create a duel challenge from a stale outside duel-new callback", async () => {
    const presence = new CapturingPresenceService();
    let createCount = 0;
    const bot = createTestBot(presence, {
      duel: duelServiceWithCreateCounter(() => {
        createCount += 1;
      })
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeDuelNewCallbackData()));

    expect(createCount).toBe(0);
  });

  it("creates a duel challenge from duel-new callbacks inside the korchma", async () => {
    const presence = new CapturingPresenceService();
    presence.currentPlace = {
      state: "ready",
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      locationName: "Зала корчми",
      insideKorchma: true
    };
    let createCount = 0;
    const bot = createTestBot(presence, {
      duel: duelServiceWithCreateCounter(() => {
        createCount += 1;
      })
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeDuelNewCallbackData()));

    expect(createCount).toBe(1);
    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_DUEL_CHALLENGE
    });
  });

  it("does not teleport presence to the quest table when an outside duel-new callback is blocked", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      duel: duelServiceWithCreateCounter()
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeDuelNewCallbackData()));

    expect(presence.marks).toEqual([]);
  });

  it("marks handled callbacks with raid context", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeTavernCallbackData("raid")));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
      currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
      currentAdventureId: null
    });
  });

  it("marks korchma round callbacks as Шинок actions, not barrel raid presence", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeTavernCallbackData("round")));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_BAR,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("marks korchma place callbacks only after handler gates pass", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      tavern: readyTavernService()
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makePlaceCallbackData("hall")));

    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
    expect(presence.marks[1]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("marks /start at the front of the korchma", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("/start"));

    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("keeps duel start deep links at the current location", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("/start duel_abc_DEF12"));

    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
  });

  it("marks the korchma menu button as the hall", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      tavern: readyTavernService()
    });
    await bot.init();

    await bot.handleUpdate(messageUpdate("🍺 Корчма"));

    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
    expect(presence.marks[1]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("marks the nearby menu button as a neutral online action", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("👀 Хто поруч"));

    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("marks successful cellar action callbacks with cellar presence after handler gates", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "ready", character }),
        complete: () =>
          Promise.resolve({
            state: "completed",
            action: "negotiate",
            character,
            reward: {
              xp: 2,
              gold: 1,
              itemGrants: []
            },
            availableAt: new Date("2026-06-13T10:03:00.000Z"),
            now: new Date("2026-06-13T10:00:00.000Z"),
            levelChange: {
              oldLevel: 2,
              newLevel: 2,
              leveledUp: false
            }
          })
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeCellarCallbackData("negotiate")));

    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
    expect(presence.marks[1]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    });
  });

  it.each([
    {
      name: "korchma menu button",
      update: messageUpdate("🍺 Корчма")
    },
    {
      name: "/tavern command",
      update: commandUpdate("/tavern")
    }
  ])(
    "keeps $name at the barrel during a pending raid",
    async ({ update }) => {
      const presence = new CapturingPresenceService();
      const bot = createTestBot(presence, {
        tavern: pendingTavernService()
      });
      await bot.init();

      await bot.handleUpdate(update);

      expect(presence.marks[0]).toEqual({
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      });
      expect(presence.marks[1]).toMatchObject({
        locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
        currentAdventureId: null
      });
    }
  );

  it.each([
    {
      name: "adventure",
      callbackData: makeAdventureCallbackData("poke")
    },
    {
      name: "fight",
      callbackData: makeFightCallbackData("attack")
    },
    {
      name: "persistent fight",
      callbackData: makeFightTurnCallbackData({
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        turn: 1,
        action: "attack"
      })
    },
    {
      name: "hunt",
      callbackData: makeHuntActionCallbackData("2026-06-14T08", "abc1234", "strike")
    },
    {
      name: "bestiary",
      callbackData: makeBestiaryMonsterCallbackData("monster.deadline-spider", 0)
    },
    {
      name: "cellar",
      callbackData: makeCellarCallbackData("negotiate")
    },
    {
      name: "remort",
      callbackData: makeRemortConfirmCallbackData("0123456789abcdef")
    },
    {
      name: "hall place",
      callbackData: makePlaceCallbackData("hall")
    },
    {
      name: "quest-table place",
      callbackData: makePlaceCallbackData("quest-table")
    },
    {
      name: "cellar place",
      callbackData: makePlaceCallbackData("cellar")
    },
    {
      name: "front place",
      callbackData: makePlaceCallbackData("front")
    }
  ])("does not move presence from stale $name callbacks during a pending barrel raid", async ({ callbackData }) => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      tavern: {
        getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
        completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
        getActivePendingFridayBarrelRaidForTelegramUser: () =>
          Promise.resolve({
            state: "pending",
            character,
            availableAt: new Date("2026-06-13T10:33:00.000Z"),
            now: new Date("2026-06-13T10:30:00.000Z")
          }),
        getRoundOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        buyRoundForTelegramUser: () => Promise.resolve({ state: "no-character" })
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(callbackData));

    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("blocks hunt action callbacks outside the korchma before claiming the hourly hunt", async () => {
    const presence = new CapturingPresenceService();
    let claimCount = 0;
    const bot = createTestBot(presence, {
      hunt: {
        getHuntBoardForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        completeHuntContract: () => {
          claimCount += 1;
          return Promise.resolve({ state: "no-character" });
        }
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeHuntActionCallbackData("2026-06-14T08", "abc1234", "strike")));

    expect(claimCount).toBe(0);
    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("gates actual 0.0.17 date-only hunt action callbacks outside without claiming rewards", async () => {
    const presence = new CapturingPresenceService();
    let boardCount = 0;
    let claimCount = 0;
    const bot = createTestBot(presence, {
      hunt: {
        getHuntBoardForTelegramUser: () => {
          boardCount += 1;
          return Promise.resolve({ state: "no-character" });
        },
        completeHuntContract: () => {
          claimCount += 1;
          return Promise.resolve({ state: "no-character" });
        }
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate("v1:hunt:act:2026-06-14:strike"));

    expect(boardCount).toBe(0);
    expect(claimCount).toBe(0);
    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("refreshes actual 0.0.17 date-only hunt action callbacks inside without claiming rewards", async () => {
    const presence = new CapturingPresenceService();
    presence.currentPlace = {
      state: "ready",
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      locationName: "Стіл зі справами",
      insideKorchma: true
    };
    let boardCount = 0;
    let claimCount = 0;
    const bot = createTestBot(presence, {
      yeger: {
        getForTelegramUser: () => {
          boardCount += 1;
          return Promise.resolve({ state: "no-character" });
        },
        startForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        trackForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        turnInForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      hunt: {
        getHuntBoardForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        completeHuntContract: () => {
          claimCount += 1;
          return Promise.resolve({ state: "no-character" });
        }
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate("v1:hunt:act:2026-06-14:strike"));

    expect(boardCount).toBe(1);
    expect(claimCount).toBe(0);
    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("does not mark random unhandled text as presence", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("просто проходив повз"));

    expect(presence.marks).toEqual([]);
  });

  it("does not mark the old invisible look text because /look is command-only", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("Озирнутися"));

    expect(presence.marks).toEqual([]);
  });
});

class CapturingPresenceService {
  readonly marks: MarkPlayerPresenceInput[] = [];
  currentPlace: {
    state: "ready";
    locationId: string;
    locationName: string;
    insideKorchma: boolean;
  } = {
    state: "ready",
    locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
    locationName: "Перед корчмою",
    insideKorchma: false
  };

  markAction(input: MarkPlayerPresenceInput): Promise<void> {
    this.marks.push(input);
    return Promise.resolve();
  }

  getRaidParticipantsForTelegramUser(): Promise<{ state: "no-character" }> {
    return Promise.resolve({ state: "no-character" });
  }

  getAdventureParticipantsForTelegramUser(): Promise<{ state: "no-character" }> {
    return Promise.resolve({ state: "no-character" });
  }

  getOnlineForTelegramUser(): Promise<{ state: "no-character" }> {
    return Promise.resolve({ state: "no-character" });
  }

  getLookForTelegramUser(): Promise<{ state: "no-character" }> {
    return Promise.resolve({ state: "no-character" });
  }

  getKorchmaInteriorPresence(): Promise<PresenceGroup> {
    return Promise.resolve({
      active: [{ telegramUserId: 42n, name: "Мандрівник", status: "active" }],
      idle: [],
      total: 1
    });
  }

  getCurrentPlaceForTelegramUser(): Promise<{
    state: "ready";
    locationId: string;
    locationName: string;
    insideKorchma: boolean;
  }> {
    return Promise.resolve(this.currentPlace);
  }
}

function createTestBot(presence: CapturingPresenceService, overrides: Partial<BotServices> = {}) {
  const bot = createBot("123456:test-token", servicesWith({ presence, ...overrides }));

  bot.api.config.use((_prev, method) => {
    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Квестарня",
          username: "kvestarnia_bot"
        }
      });
    }

    return Promise.resolve({
      ok: true,
      result: true
    });
  });

  return bot;
}

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Пригодники",
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: {
      stat: "strength",
      bonus: 0
    }
  }
};

function readyTavernService() {
  return {
    getTavernForTelegramUser: () =>
      Promise.resolve({
        state: "ready",
        character
      }),
    advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
    completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
    getActivePendingFridayBarrelRaidForTelegramUser: () => Promise.resolve({ state: "none" }),
    getRoundOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
    buyRoundForTelegramUser: () => Promise.resolve({ state: "no-character" })
  };
}

function pendingTavernService() {
  return {
    getTavernForTelegramUser: () =>
      Promise.resolve({
        state: "pending",
        character,
        availableAt: new Date("2026-06-13T10:33:00.000Z"),
        now: new Date("2026-06-13T10:30:00.000Z")
      }),
    advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
    completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
    getActivePendingFridayBarrelRaidForTelegramUser: () =>
      Promise.resolve({
        state: "pending",
        character,
        availableAt: new Date("2026-06-13T10:33:00.000Z"),
        now: new Date("2026-06-13T10:30:00.000Z")
      }),
    getRoundOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
    buyRoundForTelegramUser: () => Promise.resolve({ state: "no-character" })
  };
}

function duelServiceWithCreateCounter(
  onCreate: () => void = () => undefined
): NonNullable<BotServices["duel"]> {
  return {
    createOpenChallengeForTelegramUser: () => {
      onCreate();
      return Promise.resolve({
        state: "level-gated",
        character,
        minLevel: 3
      });
    }
  } as unknown as NonNullable<BotServices["duel"]>;
}

function questHubReadyServices(): Partial<BotServices> {
  return {
    adventure: {
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "level-retired",
          maxLevel: 2,
          character
        }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    fight: {
      getProblemQuestProgressForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character,
          progress: {
            stageId: "13",
            title: "Тринадцять дрібних проблем",
            wins: 4,
            target: 13,
            completed: false,
            rewardClaimed: false,
            issued: true,
            branchComplete: false
          },
          archive: []
        }),
      getFightOverviewForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-ready",
          character,
          questProgress: {
            stageId: "13",
            title: "Тринадцять дрібних проблем",
            wins: 4,
            target: 13,
            completed: false,
            rewardClaimed: false,
            issued: true,
            branchComplete: false
          }
        }),
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    yeger: {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "level-locked",
          character,
          requiredLevel: 4
        }),
      startForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      trackForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      turnInForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    cellarErrand: {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "level-locked",
          character,
          requiredLevel: 2
        }),
      complete: () => Promise.resolve({ state: "no-character" })
    }
  } as unknown as Partial<BotServices>;
}

function servicesWith(overrides: Partial<BotServices>): BotServices {
  return {
    adventure: {
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    cellarErrand: {
      getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      complete: () => Promise.resolve({ state: "no-character" })
    },
    fight: {
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    hunt: {
      getHuntBoardForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeHuntContract: () => Promise.resolve({ state: "no-character" })
    },
    yeger: {
      getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      startForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      trackForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      turnInForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    onboarding: {},
    hero: {
      findByTelegramUserId: () =>
        Promise.resolve({
          state: "existing-character",
          character,
          inventoryGoldValue: 0
        })
    },
    inventory: {},
    presence: new CapturingPresenceService(),
    devReset: {
      isEnabled: () => false
    },
    restart: {},
    tavern: {
      getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      getActivePendingFridayBarrelRaidForTelegramUser: () =>
        Promise.resolve({ state: "none" }),
      getRoundOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      buyRoundForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    ...overrides
  } as unknown as BotServices;
}

function messageUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: {
        id: 42,
        type: "private" as const,
        first_name: "Тест"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      text
    }
  };
}

function commandUpdate(text: string) {
  const update = messageUpdate(text);

  return {
    ...update,
    message: {
      ...update.message,
      entities: [
        {
          type: "bot_command" as const,
          offset: 0,
          length: text.length
        }
      ]
    }
  };
}

function callbackUpdate(data: string) {
  return {
    update_id: 2,
    callback_query: {
      id: "callback-1",
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      chat_instance: "chat-instance",
      data,
      message: {
        message_id: 10,
        date: 0,
        chat: {
          id: 42,
          type: "private" as const,
          first_name: "Тест"
        },
        text: "old"
      }
    }
  };
}
