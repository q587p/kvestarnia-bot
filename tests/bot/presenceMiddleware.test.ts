import { describe, expect, it } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makeCellarCallbackData } from "../../src/bot/callbacks/cellarCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_RAID_FRIDAY_BARREL,
  type MarkPlayerPresenceInput
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

  it("marks korchma place callbacks with actual place context", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makePlaceCallbackData("quest-table")));

    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
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
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("🍺 Корчма"));

    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("marks cellar callbacks with cellar presence", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeCellarCallbackData("negotiate")));

    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    });
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

function createTestBot(presence: CapturingPresenceService) {
  const bot = createBot("123456:test-token", servicesWith({ presence }));

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
      completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" })
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
