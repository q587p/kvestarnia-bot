import { describe, expect, it } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import {
  PRESENCE_ADVENTURE_MIMIC_SHAWARMA,
  PRESENCE_LOCATION_SHAWARMA,
  PRESENCE_LOCATION_TAVERN,
  PRESENCE_RAID_FRIDAY_BARREL,
  type MarkPlayerPresenceInput
} from "../../src/services/presenceService";

describe("presence middleware", () => {
  it("marks handled commands with scene context", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("/quest"));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_SHAWARMA,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });
  });

  it("marks handled callbacks with raid context", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeTavernCallbackData("raid")));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_TAVERN,
      currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
      currentAdventureId: null
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
