import { describe, expect, it } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makeAdventureCallbackData } from "../../src/bot/callbacks/adventureCallbackData";
import { makeCellarCallbackData } from "../../src/bot/callbacks/cellarCallbackData";
import { makeFightCallbackData } from "../../src/bot/callbacks/fightCallbackData";
import { makeHuntActionCallbackData } from "../../src/bot/callbacks/huntCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
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

  it("marks korchma round callbacks as hall actions, not barrel raid presence", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeTavernCallbackData("round")));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
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

  it("marks successful cellar action callbacks with cellar presence after handler gates", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
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
              oldLevel: 1,
              newLevel: 1,
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
      name: "hunt",
      callbackData: makeHuntActionCallbackData("2026-06-14", "strike")
    },
    {
      name: "cellar",
      callbackData: makeCellarCallbackData("negotiate")
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

  it("blocks hunt action callbacks outside the korchma before claiming the daily hunt", async () => {
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

    await bot.handleUpdate(callbackUpdate(makeHuntActionCallbackData("2026-06-14", "strike")));

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
    return Promise.resolve({
      state: "ready",
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      locationName: "Перед корчмою",
      insideKorchma: false
    });
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
    onboarding: {},
    hero: {},
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
